from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any, Dict, List


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


def _chunk(paper_id: str, idx: int, **meta_overrides) -> Dict[str, Any]:
    base = {
        "paperId": paper_id,
        "title": f"Paper {paper_id}",
        "authors": "Ada Lovelace, Alan Turing",
        "year": 2023,
        "citationCount": 42,
        "venue": "Journal of Tests",
        "doi": f"10.1000/{paper_id}",
        "url": f"https://example.org/{paper_id}",
        "pdfUrl": "",
        "source": "OpenAlex",
        "chunkIndex": idx,
        "section": "body",
        "sectionIndex": 0,
        "chunkText": f"chunk {idx} of {paper_id}",
        "researchQuestion": "What works?",
        "methodology": "Randomized trial",
        "datasetSize": "n=200",
        "modelType": "transformer",
        "keyFindings": "Method improves baseline by 5%.",
        "limitationsText": "Small sample size.",
        "futureWork": "Replicate across cohorts.",
    }
    base.update(meta_overrides)
    return {"id": f"{paper_id}::chunk::{idx}", "score": 0.9 - idx * 0.05, "metadata": base}


def test_handle_corpus_dedupes_by_paper_id_and_counts_chunks(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]])

    matches = [
        _chunk("p-1", 0),
        _chunk("p-1", 1),
        _chunk("p-1", 2),
        _chunk("p-2", 0, year=2024, citationCount=10),
        _chunk("p-3", 0, year=2022, citationCount=300),
    ]
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: matches)

    result = mod.handle_corpus({"namespace": "ns-test", "maxPapers": 10})

    assert result["paperCount"] == 3
    assert result["truncated"] is False
    assert result["vectorMatchCount"] == 5
    by_id = {row["paperId"]: row for row in result["papers"]}
    assert by_id["p-1"]["chunkCount"] == 3
    assert by_id["p-2"]["chunkCount"] == 1
    assert by_id["p-3"]["chunkCount"] == 1
    # Sort: year desc, then citations desc, then title.
    assert [row["paperId"] for row in result["papers"]] == ["p-2", "p-1", "p-3"]
    # Structured fields surface verbatim from metadata.
    assert by_id["p-1"]["methodology"] == "Randomized trial"
    assert by_id["p-1"]["datasetSize"] == "n=200"
    assert by_id["p-1"]["authors"] == ["Ada Lovelace", "Alan Turing"]


def test_handle_corpus_respects_max_papers(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.0]])
    matches = [_chunk(f"p-{i}", 0, year=2020 + i) for i in range(6)]
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: matches)

    result = mod.handle_corpus({"namespace": "ns", "maxPapers": 3})

    assert result["paperCount"] == 3
    assert result["truncated"] is True


def test_handle_hypothesis_requires_claim(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    try:
        mod.handle_hypothesis({})
    except ValueError as e:
        assert "claim" in str(e).lower()
    else:
        raise AssertionError("Expected ValueError for missing claim")


def test_handle_hypothesis_returns_insufficient_when_no_matches(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.0]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [])

    result = mod.handle_hypothesis({"claim": "RAG beats fine-tuning."})

    assert result["verdict"] == "insufficient"
    assert result["confidence"] == "low"
    assert result["references"] == []
    assert result["retrieval"]["returned"] == 0


def test_handle_hypothesis_shapes_llm_output(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [
        _chunk("p-1", 0),
        _chunk("p-2", 0, year=2024),
    ])
    # Make rerank a pass-through so the test isn't coupled to hybrid scoring.
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda question, matches, top_k: matches[:top_k])

    fake_payload = {
        "verdict": "contested",
        "confidence": "medium",
        "summary": "Paper [1] supports while paper [2] contradicts.",
        "supporting_evidence": ["Method works on small data [1]"],
        "contradicting_evidence": ["No effect on large data [2]"],
        "nuance": ["Effect depends on domain [1][2]"],
        "per_citation": [
            {"citationNumber": 1, "stance": "support", "rationale": "Reports positive effect."},
            {"citationNumber": 2, "stance": "contradict", "rationale": "Reports null result."},
        ],
    }
    monkeypatch.setattr(
        mod,
        "openai_chat_json",
        lambda system_prompt, user_prompt, model, max_tokens, temperature: fake_payload,
    )

    result = mod.handle_hypothesis({"claim": "Approach X improves accuracy.", "topK": 5})

    assert result["verdict"] == "contested"
    assert result["confidence"] == "medium"
    assert result["evidenceCounts"]["support"] == 1
    assert result["evidenceCounts"]["contradict"] == 1
    assert len(result["perCitation"]) == 2
    assert len(result["references"]) == 2
    # Inline [n] tags survive.
    assert "[1]" in result["summary"]


def test_handle_hypothesis_falls_back_when_no_api_key(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.0]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])

    result = mod.handle_hypothesis({"claim": "Some claim."})

    assert result["verdict"] == "insufficient"
    assert result["confidence"] == "low"
    assert "error" in result
    # References are still built from retrieved matches.
    assert len(result["references"]) == 1


def test_handle_hypothesis_normalizes_bad_stances(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.0]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])
    monkeypatch.setattr(
        mod,
        "openai_chat_json",
        lambda **kwargs: {
            "verdict": "garbage",
            "confidence": "very-high",
            "summary": "x",
            "supporting_evidence": [],
            "contradicting_evidence": [],
            "nuance": [],
            "per_citation": [
                {"citationNumber": 1, "stance": "????", "rationale": "weird"},
                {"citationNumber": 0, "stance": "support", "rationale": "dropped"},
            ],
        },
    )

    result = mod.handle_hypothesis({"claim": "claim"})

    assert result["verdict"] == "insufficient"
    assert result["confidence"] == "low"
    # Bad-stance row coerced to insufficient; zero-citationNumber row dropped.
    assert len(result["perCitation"]) == 1
    assert result["perCitation"][0]["stance"] == "insufficient"
