from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest


# boto3.resource('dynamodb') runs at module import; without a region it can fail.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")


def load_module(module_name: str, relative_path: str):
    root = Path(__file__).resolve().parents[2]
    path = root / relative_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {relative_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def mod(monkeypatch):
    module = load_module("summarize_lambda", "backend/lambda/summarize_paper/lambda_function.py")
    # Always neutralize DynamoDB so tests don't touch AWS.
    monkeypatch.setattr(module, "check_cache", lambda paper_id: None)
    monkeypatch.setattr(module, "cache_summary", lambda paper_id, summary: None)
    return module


def _invoke(mod, body: Dict[str, Any]) -> Dict[str, Any]:
    event = {"body": json.dumps(body)}
    response = mod.lambda_handler(event, None)
    return {
        "status": response["statusCode"],
        "body": json.loads(response["body"]),
    }


def test_extract_simple_summary_returns_expected_shape(mod):
    summary = mod.extract_simple_summary(
        "Neural Models: A Survey",
        "We propose a new model. It performs well. Results are promising.",
    )
    assert set(summary.keys()) == {"key_findings", "methodology", "significance", "limitations"}
    assert isinstance(summary["key_findings"], list)
    assert summary["key_findings"]
    assert summary["limitations"] == "Not specified in abstract"


def test_generate_summary_falls_back_when_no_api_key(mod, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    summary, meta = mod.generate_summary("A Title", "An abstract with two. Sentences here.")
    assert meta["hasOpenAIKey"] is False
    assert meta["usedAI"] is False
    assert summary["methodology"] == "Detailed in full paper"


def test_lambda_handler_rejects_missing_title(mod):
    result = _invoke(mod, {"abstract": "some text"})
    assert result["status"] == 400
    assert "Title" in result["body"]["error"]


def test_lambda_handler_rejects_missing_abstract(mod):
    result = _invoke(mod, {"title": "A Title"})
    assert result["status"] == 400
    assert "Abstract" in result["body"]["error"]


def test_lambda_handler_does_not_cache_failed_summaries(mod, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    cache_calls: List[Dict[str, Any]] = []
    monkeypatch.setattr(mod, "cache_summary", lambda pid, s: cache_calls.append({"id": pid, "summary": s}))

    class FailingResponse:
        status_code = 500
        text = "boom"

        def json(self):
            return {"error": {"type": "server_error", "message": "boom"}}

        def raise_for_status(self):
            import requests
            raise requests.exceptions.HTTPError("500 server error", response=self)

    monkeypatch.setattr(mod.requests, "post", lambda *a, **k: FailingResponse())

    result = _invoke(mod, {"paperId": "p-1", "title": "T", "abstract": "An abstract here."})
    assert result["status"] == 200
    # Fallback summary used; cache must not have been written.
    assert cache_calls == []
    assert result["body"]["cached"] is False


def test_lambda_handler_caches_successful_summaries(mod, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    cache_calls: List[Dict[str, Any]] = []
    monkeypatch.setattr(mod, "cache_summary", lambda pid, s: cache_calls.append({"id": pid, "summary": s}))

    ai_payload = {
        "key_findings": ["Finding A", "Finding B"],
        "methodology": "Randomized trial",
        "significance": "Advances the field",
        "limitations": "Small sample",
    }

    class OkResponse:
        status_code = 200
        text = ""

        def json(self):
            return {
                "choices": [
                    {"message": {"content": json.dumps(ai_payload)}}
                ]
            }

        def raise_for_status(self):
            return None

    monkeypatch.setattr(mod.requests, "post", lambda *a, **k: OkResponse())

    result = _invoke(mod, {"paperId": "p-2", "title": "T", "abstract": "An abstract here."})
    assert result["status"] == 200
    assert result["body"]["summary"] == ai_payload
    assert len(cache_calls) == 1
    assert cache_calls[0]["id"] == "p-2"


def test_force_refresh_bypasses_cache(mod, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(mod, "check_cache", lambda pid: {"key_findings": ["cached"], "methodology": "x", "significance": "y", "limitations": "z"})

    result = _invoke(mod, {"paperId": "p-3", "title": "T", "abstract": "abc.", "forceRefresh": True})
    assert result["status"] == 200
    # forceRefresh skips the cache hit and falls back to extract_simple_summary.
    assert result["body"]["summary"]["methodology"] == "Detailed in full paper"
