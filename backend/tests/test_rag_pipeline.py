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


def _make_paper(paper_id: str, body_text: str) -> dict:
    return {
        "paperId": paper_id,
        "title": f"Title {paper_id}",
        "abstract": body_text,
        "fullText": "",
        "authors": [f"Author {paper_id}"],
        "year": 2023,
        "venue": "Test Journal",
        "source": "OpenAlex",
        "doi": f"10.1000/{paper_id}",
        "url": f"https://example.org/{paper_id}",
    }


def test_ingest_batches_embeddings_across_all_papers():
    """Phase A guarantee: one embedding call regardless of paper count."""
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    embed_calls = []

    def fake_embed_texts(texts, model):
        embed_calls.append(len(texts))
        return [[0.01, 0.02, 0.03] for _ in texts]

    upsert_calls = []

    def fake_upsert(vectors, namespace):
        upsert_calls.append(len(vectors))

    mod.openai_embed_texts = fake_embed_texts
    mod.pinecone_upsert = fake_upsert

    # 4 papers, each with abstract → 1 chunk each = 4 chunks total
    long_abstract = " ".join(["word"] * 80)  # > min_chunk_words=60
    stats = mod.ingest_papers(
        papers=[_make_paper(f"p-{i}", long_abstract) for i in range(4)],
        namespace="batch-test",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=15,
    )

    assert stats["ingestedPapers"] == 4
    assert stats["ingestedChunks"] == 4
    assert stats["failedPapers"] == []
    # The critical assertion: one embedding call, not one per paper.
    assert len(embed_calls) == 1
    assert embed_calls[0] == 4
    # One upsert call as well (4 vectors, well under the 100-batch limit).
    assert len(upsert_calls) == 1
    assert upsert_calls[0] == 4


def test_ingest_groups_pinecone_upserts_in_100_batches():
    """When the total chunk count exceeds 100, upserts split into 100-row batches."""
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    # 14 papers × MAX_CHUNKS_PER_PAPER=16 caps to a known shape; instead build
    # a corpus that produces exactly 105 chunks across 7 papers (15 chunks each)
    # by using long-enough text. Easier: trust the math by mocking chunking.
    monkey_chunks: list = []

    def fake_chunk_text_with_sections(text, chunk_size_words, overlap_words, min_chunk_words):
        # 15 chunks per paper.
        return [{"text": f"chunk {i}", "section": "body", "sectionIndex": 0} for i in range(15)]

    mod.chunk_text_with_sections = fake_chunk_text_with_sections
    mod.openai_embed_texts = lambda texts, model: [[0.0]] * len(texts)

    upsert_sizes: list = []
    mod.pinecone_upsert = lambda vectors, namespace: upsert_sizes.append(len(vectors))

    stats = mod.ingest_papers(
        papers=[_make_paper(f"p-{i}", "abstract text here") for i in range(7)],
        namespace="batch-100",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=30,
    )

    assert stats["ingestedPapers"] == 7
    assert stats["ingestedChunks"] == 105
    assert stats["failedPapers"] == []
    # 105 vectors → two upserts of 100 + 5.
    assert upsert_sizes == [100, 5]


def test_ingest_marks_all_papers_failed_when_batched_embed_raises():
    """If the single batched embedding call fails, every prepared paper goes into
    failedPapers rather than silently disappearing."""
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    def failing_embed(texts, model):
        raise RuntimeError("OpenAI rate limit")

    upsert_calls = []
    mod.openai_embed_texts = failing_embed
    mod.pinecone_upsert = lambda vectors, namespace: upsert_calls.append(len(vectors))

    long_abstract = " ".join(["word"] * 80)
    stats = mod.ingest_papers(
        papers=[_make_paper(f"p-{i}", long_abstract) for i in range(3)],
        namespace="fail-test",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=15,
    )

    assert stats["ingestedPapers"] == 0
    assert stats["ingestedChunks"] == 0
    assert len(stats["failedPapers"]) == 3
    assert all("Batched embedding failed" in fp["error"] for fp in stats["failedPapers"])
    # No partial upsert state.
    assert upsert_calls == []


def test_ingest_preserves_per_paper_chunk_index_assignment():
    """Vectors must end up with the right per-paper chunkIndex so vector IDs
    remain deterministic across re-ingests."""
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    chunk_counts = {"p-a": 3, "p-b": 2}

    def fake_chunk_text_with_sections(text, *args, **kwargs):
        # Identify which paper this is by sniffing the merged text for the paper id.
        for pid, count in chunk_counts.items():
            if pid in text:
                return [{"text": f"{pid}-chunk-{i}", "section": "body", "sectionIndex": 0} for i in range(count)]
        return [{"text": "fallback", "section": "body", "sectionIndex": 0}]

    mod.chunk_text_with_sections = fake_chunk_text_with_sections
    mod.openai_embed_texts = lambda texts, model: [[float(i)] for i in range(len(texts))]

    captured = []
    def fake_upsert(vectors, namespace):
        captured.extend(vectors)

    mod.pinecone_upsert = fake_upsert

    mod.ingest_papers(
        papers=[
            {"paperId": "p-a", "title": "p-a", "abstract": "p-a abstract", "authors": ["X"]},
            {"paperId": "p-b", "title": "p-b", "abstract": "p-b abstract", "authors": ["Y"]},
        ],
        namespace="ids-test",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=15,
    )

    ids = [v["id"] for v in captured]
    assert ids == [
        "p-a::chunk::0",
        "p-a::chunk::1",
        "p-a::chunk::2",
        "p-b::chunk::0",
        "p-b::chunk::1",
    ]
    # Metadata chunkIndex matches the vector ID suffix.
    indices = [v["metadata"]["chunkIndex"] for v in captured]
    assert indices == [0, 1, 2, 0, 1]


def test_ingest_defers_all_prepared_when_budget_hits_before_embed():
    """If the time budget is exhausted before the batched embed call, every prepared
    paper should appear in skippedPapers — not silently dropped."""
    mod = load_module("rag_lambda", "backend/lambda/rag_pipeline/lambda_function.py")

    # Make prep "slow" by overriding time.time to advance past the budget after prep.
    import time as time_mod
    real_time = time_mod.time
    fake_clock = [real_time()]

    def fake_time():
        return fake_clock[0]

    mod.time = type(time_mod)("fake_time_module")
    mod.time.time = fake_time

    embed_called = [False]

    def fake_embed(texts, model):
        embed_called[0] = True
        return [[0.0]] * len(texts)

    mod.openai_embed_texts = fake_embed
    mod.pinecone_upsert = lambda v, n: None

    # During prep, do not advance time; right before the embed-phase check, jump past budget.
    def fake_chunk(text, *args, **kwargs):
        return [{"text": "chunk", "section": "body", "sectionIndex": 0}]

    mod.chunk_text_with_sections = fake_chunk

    # Patch the embed-phase guard by advancing the clock when ingest_papers checks it.
    # The check is: (time.time() - start_time) >= max(1, max_seconds - 3). With max_seconds=10
    # that's >= 7. Advance the fake clock to 7.5 just before the embed phase by hooking
    # extract_structured_fields (which runs once per prepared paper, then control hits the
    # phase guard).
    original_extract = mod.extract_structured_fields
    call_count = [0]

    def hooked_extract(text):
        call_count[0] += 1
        if call_count[0] == 2:
            fake_clock[0] += 8.0  # push past max_seconds - 3 = 7
        return original_extract(text)

    mod.extract_structured_fields = hooked_extract

    stats = mod.ingest_papers(
        papers=[_make_paper(f"p-{i}", "abs") for i in range(2)],
        namespace="defer-test",
        extract_pdf=False,
        chunk_size_words=220,
        overlap_words=40,
        min_chunk_words=60,
        max_seconds=10,
    )

    assert stats["ingestedPapers"] == 0
    assert stats["timedOut"] is True
    assert embed_called[0] is False
    # Both prepared papers should be in skipped with the budget-hit reason.
    assert len(stats["skippedPapers"]) == 2
    assert all("Deferred before batched embedding" in s["reason"] for s in stats["skippedPapers"])
