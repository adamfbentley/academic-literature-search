from __future__ import annotations

import importlib.util
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
        "authors": "A. Author",
        "year": 2023,
        "citationCount": 50,
        "venue": "Journal",
        "doi": f"10.1000/{paper_id}",
        "url": f"https://example.org/{paper_id}",
        "source": "OpenAlex",
        "chunkIndex": idx,
        "section": "body",
        "sectionIndex": 0,
        "chunkText": f"chunk {idx} of {paper_id} discussing transformers and datasets",
        "researchQuestion": "",
        "methodology": "",
        "datasetSize": "",
        "modelType": "",
        "keyFindings": "",
        "limitationsText": "",
        "futureWork": "",
    }
    base.update(meta_overrides)
    return {"id": f"{paper_id}::chunk::{idx}", "score": 0.9 - idx * 0.05, "metadata": base}


def _valid_llm_payload(n: int = 3) -> Dict[str, Any]:
    paths = []
    for i in range(n):
        paths.append({
            "title": f"Path {i + 1}",
            "claim": f"Hypothesis {i + 1} about transformer scaling.",
            "rationale": f"Prior work [1] established X and [2] established Y. Combining them addresses Z.",
            "category": "combination",
            "builds_on": [
                {"citationNumber": 1, "contribution": "Established baseline X"},
                {"citationNumber": 2, "contribution": "Established result Y"},
            ],
            "open_question": "Does the combination hold under regime W?",
            "suggested_approach": "Train a small ablation; compare against [1] baselines.",
            "why_now": "Compute is newly affordable for this scale.",
            "risks": ["Confound 1", "Confound 2"],
            "evidence_strength": "high" if i == 0 else "medium",
            "impact_estimate": "high",
            "self_rated_novelty": "medium",
        })
    return {"research_paths": paths, "notes": "Corpus skews recent."}


def test_handle_propose_requires_corpus_matches(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [])

    result = mod.handle_propose({"namespace": "empty"})

    assert result["researchPaths"] == []
    assert "ingest" in (result.get("notes") or "").lower()
    assert result["retrieval"]["returned"] == 0


def test_handle_propose_normalizes_and_ranks_paths(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    embed_calls = {"n": 0}
    def fake_embed(texts, model):
        embed_calls["n"] += 1
        # Return distinct unit-ish vectors so cosine math is meaningful.
        return [[0.1 + i * 0.01, 0.2 - i * 0.01, 0.3] for i, _ in enumerate(texts)]
    monkeypatch.setattr(mod, "openai_embed_texts", fake_embed)
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0), _chunk("p-2", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])
    monkeypatch.setattr(mod, "openai_chat_json", lambda **kwargs: _valid_llm_payload(3))

    result = mod.handle_propose({"topic": "scaling laws", "count": 3})

    assert len(result["researchPaths"]) == 3
    # All paths normalized to expected shape.
    for path in result["researchPaths"]:
        assert "title" in path and "claim" in path and "rationale" in path
        assert path["category"] in {"contradiction", "extension", "mechanism", "combination", "gap"}
        assert path["evidenceStrength"] in {"high", "medium", "low"}
        assert path["impactEstimate"] in {"high", "medium", "low"}
        assert isinstance(path.get("buildsOn"), list)
        # Quantitative scores attached.
        assert 0.0 <= path["noveltyScore"] <= 1.0
        assert 0.0 <= path["convergenceScore"] <= 1.0
    # Ranking: high-evidence path should appear first.
    assert result["researchPaths"][0]["evidenceStrength"] == "high"
    # References built from retrieved matches.
    assert len(result["references"]) == 2


def test_handle_propose_drops_paths_below_min_citations(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]] * len(texts))
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0), _chunk("p-2", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])

    weak_payload = {
        "research_paths": [
            {
                "title": "Strong",
                "claim": "Valid hypothesis.",
                "rationale": "Supported by [1] and [2] which both show effect.",
                "category": "extension",
                "builds_on": [{"citationNumber": 1, "contribution": "x"}, {"citationNumber": 2, "contribution": "y"}],
                "open_question": "Q?",
                "suggested_approach": "A",
                "why_now": "Now",
                "risks": ["r"],
                "evidence_strength": "high",
                "impact_estimate": "high",
                "self_rated_novelty": "medium",
            },
            {
                "title": "Single citation, should drop",
                "claim": "Weak hypothesis.",
                "rationale": "Only one paper [1] supports this.",
                "category": "extension",
                "builds_on": [{"citationNumber": 1, "contribution": "x"}],
                "open_question": "Q?",
                "suggested_approach": "A",
                "why_now": "Now",
                "risks": [],
                "evidence_strength": "low",
                "impact_estimate": "low",
                "self_rated_novelty": "low",
            },
            {
                "title": "No citations at all",
                "claim": "Floating hypothesis.",
                "rationale": "No grounding here.",
                "category": "extension",
                "builds_on": [],
                "open_question": "Q?",
                "suggested_approach": "A",
                "why_now": "Now",
                "risks": [],
                "evidence_strength": "low",
                "impact_estimate": "low",
                "self_rated_novelty": "low",
            },
        ],
        "notes": "",
    }
    monkeypatch.setattr(mod, "openai_chat_json", lambda **kwargs: weak_payload)

    result = mod.handle_propose({"topic": "x", "count": 5})

    # Only the strong, ≥2-citation path survives.
    assert len(result["researchPaths"]) == 1
    assert result["researchPaths"][0]["title"] == "Strong"


def test_handle_propose_strips_invalid_citations_in_builds_on(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]] * len(texts))
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0), _chunk("p-2", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])

    payload = {
        "research_paths": [{
            "title": "P",
            "claim": "C",
            "rationale": "Grounded in [1] and [2].",
            "category": "extension",
            "builds_on": [
                {"citationNumber": 1, "contribution": "valid"},
                {"citationNumber": 99, "contribution": "hallucinated — not in references"},
                {"citationNumber": 2, "contribution": "valid"},
            ],
            "open_question": "Q?",
            "suggested_approach": "A",
            "why_now": "Now",
            "risks": [],
            "evidence_strength": "medium",
            "impact_estimate": "medium",
            "self_rated_novelty": "medium",
        }],
        "notes": "",
    }
    monkeypatch.setattr(mod, "openai_chat_json", lambda **kwargs: payload)

    result = mod.handle_propose({"topic": "x"})
    assert len(result["researchPaths"]) == 1
    builds_on = result["researchPaths"][0]["buildsOn"]
    assert {b["citationNumber"] for b in builds_on} == {1, 2}


def test_handle_propose_normalizes_invalid_enum_values(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]] * len(texts))
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0), _chunk("p-2", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])
    monkeypatch.setattr(mod, "openai_chat_json", lambda **kwargs: {
        "research_paths": [{
            "title": "P", "claim": "C",
            "rationale": "Cites [1] and [2].",
            "category": "nonsense", "builds_on": [],
            "open_question": "Q?", "suggested_approach": "A", "why_now": "N",
            "risks": [], "evidence_strength": "off-the-charts",
            "impact_estimate": "??", "self_rated_novelty": "huge",
        }],
        "notes": "",
    })

    result = mod.handle_propose({"topic": "x"})
    p = result["researchPaths"][0]
    assert p["category"] == "extension"
    assert p["evidenceStrength"] == "medium"
    assert p["impactEstimate"] == "medium"
    assert p["selfRatedNovelty"] == "medium"


def test_handle_propose_falls_back_when_no_api_key(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]])
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])

    result = mod.handle_propose({"topic": "x"})

    assert result["researchPaths"] == []
    assert "error" in result
    # References still built from retrieved matches.
    assert len(result["references"]) == 1


def test_handle_propose_respects_count_cap(monkeypatch):
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "openai_embed_texts", lambda texts, model: [[0.1, 0.2, 0.3]] * len(texts))
    monkeypatch.setattr(mod, "pinecone_query", lambda **kwargs: [_chunk("p-1", 0), _chunk("p-2", 0)])
    monkeypatch.setattr(mod, "hybrid_rerank_matches", lambda q, m, k: m[:k])
    monkeypatch.setattr(mod, "openai_chat_json", lambda **kwargs: _valid_llm_payload(5))

    result = mod.handle_propose({"topic": "x", "count": 2})

    assert len(result["researchPaths"]) == 2


def test_cosine_similarity_helpers():
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    assert mod._cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert mod._cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert mod._cosine_similarity([], [1.0]) == 0.0
    centroid = mod._vector_centroid([[1.0, 0.0], [0.0, 1.0]])
    assert centroid == [0.5, 0.5]
    assert mod._vector_centroid([]) == []
