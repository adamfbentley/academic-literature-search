from __future__ import annotations

import importlib.util
from pathlib import Path


def load_module(module_name: str, relative_path: str):
    root = Path(__file__).resolve().parents[2]
    path = root / relative_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module: {relative_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_relevance_ranking_interleaves_sources():
    mod = load_module("search_lambda", "backend/lambda/search_papers/lambda_function_multisource.py")
    papers = [
        {
            "paperId": "oa-1",
            "source": "OpenAlex",
            "_sourceRank": 0,
            "_rank": 0,
            "citationCount": 120,
            "year": 2023,
            "abstract": "A",
            "pdfUrl": "https://example.org/a.pdf",
        },
        {
            "paperId": "oa-2",
            "source": "OpenAlex",
            "_sourceRank": 1,
            "_rank": 1,
            "citationCount": 90,
            "year": 2022,
            "abstract": "B",
            "pdfUrl": "https://example.org/b.pdf",
        },
        {
            "paperId": "cf-1",
            "source": "Crossref",
            "_sourceRank": 0,
            "_rank": 2,
            "citationCount": 60,
            "year": 2021,
            "abstract": "C",
            "pdfUrl": "",
        },
        {
            "paperId": "ss-1",
            "source": "Semantic Scholar",
            "_sourceRank": 0,
            "_rank": 3,
            "citationCount": 70,
            "year": 2024,
            "abstract": "D",
            "pdfUrl": "",
        },
    ]

    ranked = mod.relevance_rank_with_source_diversity(papers, 4)
    top_sources = [p.get("source") for p in ranked[:3]]

    assert len(ranked) == 4
    assert len(set(top_sources)) >= 2


def test_deduplicate_preserves_multi_source_provenance():
    mod = load_module("search_lambda", "backend/lambda/search_papers/lambda_function_multisource.py")
    papers = [
        {
            "paperId": "oa-1",
            "title": "Sample Paper",
            "doi": "10.1000/test",
            "source": "OpenAlex",
            "_rank": 0,
            "_sourceRank": 0,
            "citationCount": 120,
            "abstract": "Has abstract",
            "pdfUrl": "https://example.org/a.pdf",
        },
        {
            "paperId": "cr-1",
            "title": "Sample Paper",
            "doi": "10.1000/test",
            "source": "Crossref",
            "_rank": 4,
            "_sourceRank": 2,
            "citationCount": 5,
            "abstract": "",
            "pdfUrl": "",
        },
    ]
    deduped = mod.deduplicate_papers(papers)
    assert len(deduped) == 1
    merged = deduped[0]
    assert sorted(merged.get("sources", [])) == ["Crossref", "OpenAlex"]
    assert merged.get("source") == "OpenAlex"


def test_source_counts_returns_distribution():
    mod = load_module("search_lambda", "backend/lambda/search_papers/lambda_function_multisource.py")
    counts = mod.source_counts(
        [
            {"source": "OpenAlex"},
            {"source": "Crossref"},
            {"source": "OpenAlex"},
        ]
    )
    assert counts == {"OpenAlex": 2, "Crossref": 1}
