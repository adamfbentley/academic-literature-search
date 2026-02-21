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


def test_query_pdf_limit_is_applied_in_handle_ingest():
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    def fake_discover(query, limit, sources, max_seconds=None):
        papers = []
        for idx in range(6):
            papers.append(
                {
                    "paperId": f"p-{idx}",
                    "title": f"Paper {idx}",
                    "abstract": "alpha beta gamma delta epsilon zeta eta theta iota" if idx % 2 == 0 else "",
                    "citationCount": 100 - idx,
                    "year": 2020 + idx,
                    "pdfUrl": "https://example.org/p.pdf" if idx in {0, 1, 2} else "",
                }
            )
        return papers, False

    captured = {}

    def fake_ingest(**kwargs):
        captured["extract_pdf"] = kwargs["extract_pdf"]
        captured["allow_pdf_flags"] = [
            mod.normalize_paper(p).get("allowPdfExtract") for p in kwargs.get("papers", [])
        ]
        return {
            "ingestedPapers": len(kwargs.get("papers", [])),
            "ingestedChunks": len(kwargs.get("papers", [])),
            "skippedPapers": [],
            "failedPapers": [],
            "timedOut": False,
            "timeBudgetSeconds": kwargs.get("max_seconds"),
        }

    mod.discover_papers = fake_discover
    mod.ingest_papers = fake_ingest

    result = mod.handle_ingest(
        {
            "query": "neuronal growth",
            "limit": 6,
            "maxCandidates": 6,
            "extractPdfText": True,
            "queryPdfPaperLimit": 2,
            "sources": ["openalex", "semantic_scholar", "crossref"],
        }
    )

    assert result["effectivePdfExtraction"] is True
    assert result["queryPdfExtractionSelected"] == 2
    assert captured["extract_pdf"] is True
    assert captured["allow_pdf_flags"].count(True) == 2


def test_metadata_fallback_text_is_generated():
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")
    text = mod.build_metadata_fallback_text(
        {
            "title": "",
            "authors": ["Ada Lovelace", "Alan Turing"],
            "year": 1950,
            "venue": "Journal of Ideas",
            "source": "Crossref",
            "doi": "10.1000/test",
            "url": "https://doi.org/10.1000/test",
        }
    )
    assert "Ada Lovelace" in text
    assert "1950" in text
    assert "Crossref" in text
    assert "10.1000/test" in text


def test_ingest_accepts_metadata_only_records():
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    def fake_embed_texts(texts, model):
        return [[0.01, 0.02, 0.03] for _ in texts]

    upserts = []

    def fake_upsert(vectors, namespace):
        upserts.append((len(vectors), namespace))

    mod.openai_embed_texts = fake_embed_texts
    mod.pinecone_upsert = fake_upsert

    stats = mod.ingest_papers(
        papers=[
            {
                "paperId": "meta-only-1",
                "title": "",
                "abstract": "",
                "fullText": "",
                "authors": ["Researcher One"],
                "year": 2024,
                "venue": "Meta Journal",
                "source": "Crossref",
                "doi": "10.1000/meta-only-1",
                "url": "https://doi.org/10.1000/meta-only-1",
            }
        ],
        namespace="test",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=15,
    )

    assert stats["ingestedPapers"] == 1
    assert stats["failedPapers"] == []
    assert len(upserts) == 1
