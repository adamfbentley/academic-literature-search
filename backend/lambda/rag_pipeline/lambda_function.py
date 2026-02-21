import hashlib
import json
import os
import re
import time
from io import BytesIO
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None


DEFAULT_USER_AGENT = os.environ.get("HTTP_USER_AGENT", "academic-literature-ai-rag/1.0")
OPENAI_EMBED_MODEL = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")
OPENAI_CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")
MAX_PDF_TEXT_CHARS = int(os.environ.get("MAX_PDF_TEXT_CHARS", "120000"))
MAX_CONTEXT_CHARS = int(os.environ.get("RAG_MAX_CONTEXT_CHARS", "16000"))
PDF_FETCH_TIMEOUT_SECONDS = int(os.environ.get("RAG_PDF_FETCH_TIMEOUT_SECONDS", "12"))
INGEST_TIME_BUDGET_SECONDS = int(os.environ.get("RAG_INGEST_TIME_BUDGET_SECONDS", "24"))
EXTERNAL_API_TIMEOUT_SECONDS = int(os.environ.get("RAG_EXTERNAL_API_TIMEOUT_SECONDS", "8"))
MAX_PDF_PAGES = int(os.environ.get("RAG_MAX_PDF_PAGES", "8"))
MAX_CHUNKS_PER_PAPER = int(os.environ.get("RAG_MAX_CHUNKS_PER_PAPER", "16"))
MAX_INGEST_CANDIDATES = int(os.environ.get("RAG_MAX_INGEST_CANDIDATES", "10"))
MAX_QUERY_PDF_PAPERS = int(os.environ.get("RAG_MAX_QUERY_PDF_PAPERS", "2"))
HYBRID_RERANK_MULTIPLIER = int(os.environ.get("RAG_HYBRID_RERANK_MULTIPLIER", "4"))
INSIGHTS_MAX_PAPERS = int(os.environ.get("RAG_INSIGHTS_MAX_PAPERS", "24"))


def parse_event_body(event: Dict[str, Any]) -> Dict[str, Any]:
    body = event.get("body", {})
    if isinstance(body, str):
        body = body.strip()
        if not body:
            return {}
        try:
            return json.loads(body)
        except Exception:
            return {}
    if isinstance(body, dict):
        return body
    if isinstance(event, dict):
        return event
    return {}


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def clamp_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return default
    return max(min_value, min(max_value, parsed))


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"1", "true", "yes", "y", "on"}:
            return True
        if v in {"0", "false", "no", "n", "off"}:
            return False
    return bool(value)


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\x00", "", text)
    return text


def normalize_authors(raw_authors: Any) -> List[str]:
    if raw_authors is None:
        return []
    if isinstance(raw_authors, list):
        out: List[str] = []
        for item in raw_authors:
            if isinstance(item, str):
                name = clean_text(item)
                if name:
                    out.append(name)
            elif isinstance(item, dict):
                name = clean_text(str(item.get("name") or item.get("display_name") or ""))
                if name:
                    out.append(name)
        return out
    if isinstance(raw_authors, str):
        parts = [clean_text(x) for x in re.split(r";|, and | and ", raw_authors) if clean_text(x)]
        return parts
    return []


def normalize_paper(raw: Dict[str, Any]) -> Dict[str, Any]:
    title = clean_text(str(raw.get("title") or ""))
    doi = clean_text(str(raw.get("doi") or "")).lower()
    if doi.startswith("https://doi.org/"):
        doi = doi.replace("https://doi.org/", "", 1)
    paper_id = clean_text(str(raw.get("paperId") or raw.get("id") or ""))
    if not paper_id:
        hash_seed = f"{title}|{doi}|{raw.get('year') or ''}"
        paper_id = "paper_" + hashlib.sha1(hash_seed.encode("utf-8")).hexdigest()[:16]

    return {
        "paperId": paper_id,
        "title": title,
        "abstract": clean_text(str(raw.get("abstract") or "")),
        "fullText": clean_text(str(raw.get("fullText") or "")),
        "authors": normalize_authors(raw.get("authors")),
        "year": raw.get("year"),
        "citationCount": int(raw.get("citationCount", 0) or 0),
        "publicationDate": clean_text(str(raw.get("publicationDate") or "")),
        "venue": clean_text(str(raw.get("venue") or "")),
        "url": clean_text(str(raw.get("url") or "")),
        "pdfUrl": clean_text(str(raw.get("pdfUrl") or "")),
        "doi": doi,
        "source": clean_text(str(raw.get("source") or "")) or "custom",
        "allowPdfExtract": as_bool(raw.get("allowPdfExtract"), as_bool(raw.get("_allowPdfExtract"), True)),
    }


def build_metadata_fallback_text(paper: Dict[str, Any]) -> str:
    parts: List[str] = []
    title = clean_text(str(paper.get("title") or ""))
    if title:
        parts.append(f"Title: {title}.")
    authors = [a for a in (paper.get("authors") or []) if clean_text(str(a))]
    if authors:
        parts.append(f"Authors: {', '.join(authors[:6])}.")
    year = as_int(paper.get("year"), 0)
    if year > 0:
        parts.append(f"Year: {year}.")
    venue = clean_text(str(paper.get("venue") or ""))
    if venue:
        parts.append(f"Venue: {venue}.")
    source = clean_text(str(paper.get("source") or ""))
    if source:
        parts.append(f"Source: {source}.")
    doi = clean_text(str(paper.get("doi") or ""))
    if doi:
        parts.append(f"DOI: {doi}.")
    url = clean_text(str(paper.get("url") or ""))
    if url:
        parts.append(f"URL: {url}.")
    if parts:
        parts.append("This record has limited full text, so retrieval should be treated as metadata-level evidence.")
    return clean_text(" ".join(parts))


def _normalize_pinecone_host(host: str) -> str:
    host = (host or "").strip()
    if not host:
        raise ValueError("Missing PINECONE_INDEX_HOST")
    if not host.startswith("http://") and not host.startswith("https://"):
        host = "https://" + host
    return host.rstrip("/")


def _pinecone_headers() -> Dict[str, str]:
    api_key = os.environ.get("PINECONE_API_KEY", "").strip()
    if not api_key:
        raise ValueError("Missing PINECONE_API_KEY")
    return {
        "Api-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
    }


def pinecone_upsert(vectors: List[Dict[str, Any]], namespace: Optional[str]) -> None:
    if not vectors:
        return
    host = _normalize_pinecone_host(os.environ.get("PINECONE_INDEX_HOST", ""))
    payload: Dict[str, Any] = {"vectors": vectors}
    if namespace:
        payload["namespace"] = namespace

    response = requests.post(
        f"{host}/vectors/upsert",
        headers=_pinecone_headers(),
        json=payload,
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Pinecone upsert failed ({response.status_code}): {response.text[:400]}")


def pinecone_query(
    query_vector: List[float],
    top_k: int,
    namespace: Optional[str],
    metadata_filter: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    host = _normalize_pinecone_host(os.environ.get("PINECONE_INDEX_HOST", ""))
    payload: Dict[str, Any] = {
        "vector": query_vector,
        "topK": top_k,
        "includeMetadata": True,
    }
    if namespace:
        payload["namespace"] = namespace
    if metadata_filter:
        payload["filter"] = metadata_filter

    response = requests.post(
        f"{host}/query",
        headers=_pinecone_headers(),
        json=payload,
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Pinecone query failed ({response.status_code}): {response.text[:400]}")

    data = response.json() or {}
    return data.get("matches", []) or []

def _openai_headers() -> Dict[str, str]:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("Missing OPENAI_API_KEY")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
    }


def openai_embed_texts(texts: List[str], model: str) -> List[List[float]]:
    if not texts:
        return []
    headers = _openai_headers()
    all_vectors: List[List[float]] = []
    batch_size = 64
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        payload = {"model": model, "input": batch}
        response = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers=headers,
            json=payload,
            timeout=45,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"OpenAI embeddings failed ({response.status_code}): {response.text[:400]}")
        data = response.json() or {}
        rows = data.get("data", []) or []
        rows = sorted(rows, key=lambda x: int(x.get("index", 0)))
        all_vectors.extend([r.get("embedding") for r in rows if r.get("embedding")])
    return all_vectors


def openai_chat_json(
    system_prompt: str,
    user_prompt: str,
    model: str,
    max_tokens: int,
    temperature: float,
) -> Dict[str, Any]:
    headers = _openai_headers()
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )
    if response.status_code >= 400:
        payload.pop("response_format", None)
        retry = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
        )
        if retry.status_code >= 400:
            raise RuntimeError(f"OpenAI chat failed ({retry.status_code}): {retry.text[:500]}")
        response = retry

    data = response.json() or {}
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise RuntimeError("OpenAI chat returned empty content")
    try:
        return json.loads(content)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", content)
        if not m:
            raise RuntimeError("OpenAI chat did not return valid JSON")
        return json.loads(m.group(0))


def discover_openalex(query: str, limit: int) -> List[Dict[str, Any]]:
    response = requests.get(
        "https://api.openalex.org/works",
        params={
            "search": query,
            "per_page": limit,
            "sort": "relevance_score:desc",
            "mailto": os.environ.get("OPENALEX_MAILTO", "your-email@example.com"),
        },
        headers={"User-Agent": DEFAULT_USER_AGENT},
        timeout=EXTERNAL_API_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json() or {}
    out: List[Dict[str, Any]] = []
    for work in data.get("results", []) or []:
        authors: List[str] = []
        for authorship in work.get("authorships", [])[:8]:
            author = (authorship or {}).get("author") or {}
            display_name = clean_text(str(author.get("display_name") or ""))
            if display_name:
                authors.append(display_name)

        abstract_text = ""
        abstract_inverted = work.get("abstract_inverted_index")
        if isinstance(abstract_inverted, dict):
            try:
                positions: List[Tuple[int, str]] = []
                for token, token_positions in abstract_inverted.items():
                    for pos in token_positions:
                        positions.append((int(pos), str(token)))
                positions.sort(key=lambda item: item[0])
                abstract_text = " ".join(x[1] for x in positions)
            except Exception:
                abstract_text = ""

        open_access = work.get("open_access") or {}
        source_obj = ((work.get("primary_location") or {}).get("source") or {})
        out.append(
            {
                "paperId": clean_text(str(work.get("id") or "")).split("/")[-1],
                "title": clean_text(str(work.get("title") or "")),
                "abstract": clean_text(abstract_text),
                "authors": authors,
                "year": work.get("publication_year"),
                "citationCount": int(work.get("cited_by_count", 0) or 0),
                "publicationDate": clean_text(str(work.get("publication_date") or "")),
                "venue": clean_text(str(source_obj.get("display_name") or "")),
                "url": clean_text(str(work.get("id") or "")),
                "pdfUrl": clean_text(str(open_access.get("oa_url") or "")),
                "doi": clean_text(str(work.get("doi") or "")).replace("https://doi.org/", ""),
                "source": "OpenAlex",
            }
        )
    return out


def discover_semantic_scholar(query: str, limit: int) -> List[Dict[str, Any]]:
    headers = {"Accept": "application/json", "User-Agent": DEFAULT_USER_AGENT}
    api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key

    response = requests.get(
        "https://api.semanticscholar.org/graph/v1/paper/search",
        params={
            "query": query,
            "limit": limit,
            "fields": "paperId,title,abstract,authors,year,citationCount,publicationDate,venue,url,externalIds,openAccessPdf",
        },
        headers=headers,
        timeout=EXTERNAL_API_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json() or {}
    out: List[Dict[str, Any]] = []
    for paper in data.get("data", []) or []:
        ext = paper.get("externalIds") or {}
        out.append(
            {
                "paperId": clean_text(str(paper.get("paperId") or "")),
                "title": clean_text(str(paper.get("title") or "")),
                "abstract": clean_text(str(paper.get("abstract") or "")),
                "authors": [clean_text(str(a.get("name") or "")) for a in (paper.get("authors") or []) if a.get("name")],
                "year": paper.get("year"),
                "citationCount": int(paper.get("citationCount", 0) or 0),
                "publicationDate": clean_text(str(paper.get("publicationDate") or "")),
                "venue": clean_text(str(paper.get("venue") or "")),
                "url": clean_text(str(paper.get("url") or "")),
                "pdfUrl": clean_text(str((paper.get("openAccessPdf") or {}).get("url") or "")),
                "doi": clean_text(str(ext.get("DOI") or "")).lower(),
                "source": "Semantic Scholar",
            }
        )
    return out


def discover_crossref(query: str, limit: int) -> List[Dict[str, Any]]:
    response = requests.get(
        "https://api.crossref.org/works",
        params={
            "query.bibliographic": query,
            "rows": limit,
            "sort": "relevance",
            "order": "desc",
            "select": "DOI,title,author,issued,container-title,URL,is-referenced-by-count",
        },
        headers={"User-Agent": DEFAULT_USER_AGENT},
        timeout=EXTERNAL_API_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json() or {}
    out: List[Dict[str, Any]] = []
    for item in (((data.get("message") or {}).get("items")) or []):
        title_list = item.get("title") or []
        container_titles = item.get("container-title") or []
        year = None
        issued = item.get("issued") or {}
        date_parts = issued.get("date-parts") or []
        if date_parts and isinstance(date_parts, list) and date_parts[0]:
            year = date_parts[0][0]
        authors: List[str] = []
        for a in item.get("author", []) or []:
            family = clean_text(str(a.get("family") or ""))
            given = clean_text(str(a.get("given") or ""))
            name = clean_text(f"{given} {family}")
            if name:
                authors.append(name)
        doi = clean_text(str(item.get("DOI") or "")).lower()
        out.append(
            {
                "paperId": doi.replace("/", "_") if doi else "",
                "title": clean_text(str(title_list[0] if title_list else "")),
                "abstract": "",
                "authors": authors,
                "year": year,
                "citationCount": int(item.get("is-referenced-by-count", 0) or 0),
                "publicationDate": "",
                "venue": clean_text(str(container_titles[0] if container_titles else "")),
                "url": clean_text(str(item.get("URL") or "")),
                "pdfUrl": "",
                "doi": doi,
                "source": "Crossref",
            }
        )
    return out

def merge_papers(papers: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def key_for(p: Dict[str, Any]) -> str:
        doi = clean_text(str(p.get("doi") or "")).lower()
        if doi:
            return f"doi:{doi}"
        title = clean_text(str(p.get("title") or "")).lower()
        title = re.sub(r"[^a-z0-9 ]", "", title)
        title = " ".join(title.split())
        if title:
            return f"title:{title}"
        return f"id:{p.get('paperId') or hashlib.sha1(json.dumps(p, sort_keys=True).encode()).hexdigest()[:10]}"

    def score(p: Dict[str, Any]) -> Tuple[int, int, int]:
        has_abstract = 1 if p.get("abstract") else 0
        has_pdf = 1 if p.get("pdfUrl") else 0
        citations = int(p.get("citationCount", 0) or 0)
        return (has_abstract, has_pdf, citations)

    selected: Dict[str, Dict[str, Any]] = {}
    for raw in papers:
        p = normalize_paper(raw)
        k = key_for(p)
        existing = selected.get(k)
        if not existing:
            selected[k] = p
            continue
        if score(p) > score(existing):
            merged = {**existing, **p}
            if existing.get("authors") and p.get("authors"):
                merged["authors"] = existing["authors"] if len(existing["authors"]) >= len(p["authors"]) else p["authors"]
            selected[k] = merged
        else:
            for field in ("abstract", "pdfUrl", "doi", "url", "venue"):
                if not existing.get(field) and p.get(field):
                    existing[field] = p[field]
            if len(existing.get("authors", [])) < len(p.get("authors", [])):
                existing["authors"] = p.get("authors", [])

    return list(selected.values())


def paper_ingest_priority(paper: Dict[str, Any]) -> Tuple[int, int, int, int, int]:
    abstract_len = len(clean_text(str(paper.get("abstract") or "")))
    full_text_len = len(clean_text(str(paper.get("fullText") or "")))
    has_abstract = 1 if abstract_len > 0 else 0
    has_any_text = 1 if (abstract_len + full_text_len) > 0 else 0
    has_pdf = 1 if clean_text(str(paper.get("pdfUrl") or "")) else 0
    citations = as_int(paper.get("citationCount"), 0)
    year = as_int(paper.get("year"), 0)
    return (has_any_text, has_abstract, has_pdf, citations, year)


def extract_pdf_text(pdf_url: str, max_chars: int) -> str:
    if not pdf_url:
        return ""
    if PdfReader is None:
        return ""

    response = requests.get(
        pdf_url,
        headers={"User-Agent": DEFAULT_USER_AGENT},
        timeout=PDF_FETCH_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    content_type = (response.headers.get("Content-Type") or "").lower()
    if "pdf" not in content_type and not pdf_url.lower().endswith(".pdf"):
        return ""

    data = response.content
    if not data:
        return ""

    reader = PdfReader(BytesIO(data))
    text_parts: List[str] = []
    for page_index, page in enumerate(reader.pages):
        if page_index >= MAX_PDF_PAGES:
            break
        page_text = clean_text(page.extract_text() or "")
        if page_text:
            text_parts.append(page_text)
        if sum(len(x) for x in text_parts) >= max_chars:
            break
    joined = "\n".join(text_parts)
    return joined[:max_chars]


def chunk_text(text: str, chunk_size_words: int, overlap_words: int, min_words: int) -> List[str]:
    text = clean_text(text)
    if not text:
        return []
    words = text.split(" ")
    if len(words) <= chunk_size_words:
        return [text]

    chunks: List[str] = []
    step = max(1, chunk_size_words - overlap_words)
    for start in range(0, len(words), step):
        end = start + chunk_size_words
        chunk_words = words[start:end]
        if len(chunk_words) < min_words:
            break
        chunk = " ".join(chunk_words).strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(words):
            break
    return chunks


def split_sections(text: str) -> List[Dict[str, str]]:
    clean = clean_text(text)
    if not clean:
        return []
    heading_patterns = [
        (r"\babstract\b", "abstract"),
        (r"\bintroduction\b", "introduction"),
        (r"\bbackground\b", "background"),
        (r"\brelated work\b", "related_work"),
        (r"\bmethods?\b", "methods"),
        (r"\bmaterials and methods\b", "methods"),
        (r"\bexperimental setup\b", "methods"),
        (r"\bdataset[s]?\b", "dataset"),
        (r"\bresults?\b", "results"),
        (r"\banalysis\b", "analysis"),
        (r"\bdiscussion\b", "discussion"),
        (r"\blimitations?\b", "limitations"),
        (r"\bfuture work\b", "future_work"),
        (r"\bconclusion[s]?\b", "conclusion"),
    ]

    markers: List[Tuple[int, str]] = [(0, "body")]
    for pattern, label in heading_patterns:
        for m in re.finditer(pattern, clean, flags=re.IGNORECASE):
            if m.start() > 0:
                markers.append((m.start(), label))
    markers = sorted(markers, key=lambda x: x[0])
    dedup: List[Tuple[int, str]] = []
    seen_positions: set = set()
    for pos, label in markers:
        if pos in seen_positions:
            continue
        seen_positions.add(pos)
        dedup.append((pos, label))

    sections: List[Dict[str, str]] = []
    for idx, (start, label) in enumerate(dedup):
        end = dedup[idx + 1][0] if idx + 1 < len(dedup) else len(clean)
        segment = clean_text(clean[start:end])
        if not segment:
            continue
        sections.append({"section": label, "text": segment})
    if not sections:
        return [{"section": "body", "text": clean}]
    return sections


def chunk_text_with_sections(
    text: str,
    chunk_size_words: int,
    overlap_words: int,
    min_words: int,
) -> List[Dict[str, Any]]:
    sections = split_sections(text)
    if not sections:
        return []
    out: List[Dict[str, Any]] = []
    for section_idx, section_row in enumerate(sections):
        section_name = clean_text(str(section_row.get("section") or "body")) or "body"
        for chunk in chunk_text(section_row.get("text", ""), chunk_size_words, overlap_words, min_words):
            out.append(
                {
                    "text": chunk,
                    "section": section_name,
                    "sectionIndex": section_idx,
                }
            )
    return out


def sentence_split(text: str) -> List[str]:
    normalized = re.sub(r"\s+", " ", clean_text(text))
    if not normalized:
        return []
    return [clean_text(s) for s in re.split(r"(?<=[.!?])\s+", normalized) if clean_text(s)]


def keyword_sentence(text: str, keywords: List[str]) -> str:
    sentences = sentence_split(text)
    for sentence in sentences:
        lower_sentence = sentence.lower()
        if any(k in lower_sentence for k in keywords):
            return sentence[:450]
    return sentences[0][:450] if sentences else ""


def extract_dataset_size(text: str) -> str:
    patterns = [
        r"\b(n\s*=\s*\d[\d,]*)\b",
        r"\b(\d[\d,]*\s+(?:participants|patients|subjects|samples|records|observations))\b",
        r"\b(dataset\s+of\s+\d[\d,]*)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_text(match.group(1))
    return ""


def extract_model_type(text: str) -> str:
    labels = [
        "randomized controlled trial",
        "meta-analysis",
        "systematic review",
        "transformer",
        "bert",
        "gpt",
        "cnn",
        "rnn",
        "xgboost",
        "random forest",
        "bayesian",
        "difference-in-differences",
        "regression",
    ]
    lower_text = text.lower()
    for label in labels:
        if label in lower_text:
            return label
    return ""


def extract_structured_fields(text: str) -> Dict[str, str]:
    clean = clean_text(text)
    if not clean:
        return {
            "researchQuestion": "",
            "methodology": "",
            "datasetSize": "",
            "modelType": "",
            "keyFindings": "",
            "limitationsText": "",
            "futureWork": "",
        }

    return {
        "researchQuestion": keyword_sentence(
            clean, ["we investigate", "this paper studies", "research question", "we ask whether", "aim of this"]
        ),
        "methodology": keyword_sentence(
            clean, ["method", "we use", "we propose", "experiment", "trial", "survey", "model", "approach"]
        ),
        "datasetSize": extract_dataset_size(clean),
        "modelType": extract_model_type(clean),
        "keyFindings": keyword_sentence(
            clean, ["we find", "results show", "our results", "we observe", "conclude", "significant"]
        ),
        "limitationsText": keyword_sentence(
            clean, ["limitation", "limited by", "constraint", "threat to validity", "caution"]
        ),
        "futureWork": keyword_sentence(clean, ["future work", "further research", "next steps", "remain unknown"]),
    }


def tokenize_for_overlap(text: str) -> set:
    return {t for t in re.findall(r"[a-z0-9]{3,}", clean_text(text).lower())}


def lexical_overlap_score(query: str, candidate_text: str) -> float:
    q_tokens = tokenize_for_overlap(query)
    if not q_tokens:
        return 0.0
    c_tokens = tokenize_for_overlap(candidate_text)
    if not c_tokens:
        return 0.0
    return len(q_tokens.intersection(c_tokens)) / float(len(q_tokens))


def hybrid_rerank_matches(question: str, matches: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    if not matches:
        return []
    semantic_scores = [float(m.get("score", 0.0) or 0.0) for m in matches]
    min_score = min(semantic_scores)
    max_score = max(semantic_scores)
    span = max(max_score - min_score, 1e-8)

    ranked: List[Tuple[float, Dict[str, Any]]] = []
    for match in matches:
        meta = match.get("metadata") or {}
        semantic = (float(match.get("score", 0.0) or 0.0) - min_score) / span
        lexical = lexical_overlap_score(question, str(meta.get("chunkText") or ""))
        citation_boost = min(as_int(meta.get("citationCount"), 0), 5000) / 5000.0
        final_score = (0.70 * semantic) + (0.25 * lexical) + (0.05 * citation_boost)
        enriched = dict(match)
        enriched["hybridScore"] = final_score
        ranked.append((final_score, enriched))

    ranked.sort(key=lambda x: x[0], reverse=True)
    return [row[1] for row in ranked[:top_k]]


def _paper_key(meta: Dict[str, Any]) -> str:
    paper_id = clean_text(str(meta.get("paperId") or ""))
    if paper_id:
        return f"id:{paper_id}"
    doi = clean_text(str(meta.get("doi") or "")).lower()
    if doi:
        return f"doi:{doi}"
    title = clean_text(str(meta.get("title") or "")).lower()
    return f"title:{title}"


def _short_name_tokens(full_name: str) -> Tuple[str, str]:
    tokens = [x for x in re.split(r"\s+", clean_text(full_name)) if x]
    if not tokens:
        return ("", "")
    if len(tokens) == 1:
        return (tokens[0], "")
    return (tokens[-1], " ".join(tokens[:-1]))


def _coerce_author_list(raw_authors: Any) -> List[str]:
    if raw_authors is None:
        return []
    if isinstance(raw_authors, list):
        return [clean_text(str(a)) for a in raw_authors if clean_text(str(a))]
    if isinstance(raw_authors, str):
        return [clean_text(x) for x in raw_authors.split(",") if clean_text(x)]
    return []


def _format_author_list(authors: Any, style: str) -> str:
    author_list = _coerce_author_list(authors)
    if not author_list:
        return "Unknown author"
    style = style.lower()
    if style == "apa":
        parts: List[str] = []
        max_authors = min(7, len(author_list))
        for full_name in author_list[:max_authors]:
            last, given = _short_name_tokens(full_name)
            initials = " ".join([f"{g[0]}." for g in given.split() if g])
            if last and initials:
                parts.append(f"{last}, {initials}")
            elif last:
                parts.append(last)
        if len(parts) == 1:
            return parts[0]
        if len(parts) > 1:
            return ", ".join(parts[:-1]) + ", & " + parts[-1]
        return "Unknown author"

    if style == "mla":
        if len(author_list) == 1:
            last, given = _short_name_tokens(author_list[0])
            return f"{last}, {given}" if given else last
        last, given = _short_name_tokens(author_list[0])
        first = f"{last}, {given}" if given else last
        if len(author_list) > 2:
            return f"{first}, et al."
        second = author_list[1]
        return f"{first}, and {second}"

    ieee_parts: List[str] = []
    for full_name in author_list[:6]:
        last, given = _short_name_tokens(full_name)
        initials = " ".join([f"{g[0]}." for g in given.split() if g])
        if initials and last:
            ieee_parts.append(f"{initials} {last}")
        else:
            ieee_parts.append(last or full_name)
    if len(author_list) > 6:
        ieee_parts.append("et al.")
    return ", ".join([x for x in ieee_parts if x]) or "Unknown author"


def _reference_link(meta: Dict[str, Any]) -> str:
    doi = clean_text(str(meta.get("doi") or ""))
    if doi:
        return f"https://doi.org/{doi}"
    return clean_text(str(meta.get("url") or "")) or ""


def format_reference(meta: Dict[str, Any], citation_number: int, style: str) -> str:
    style = (style or "apa").strip().lower()
    authors = _format_author_list(meta.get("authors", []) or [], style)
    title = clean_text(str(meta.get("title") or "Untitled"))
    venue = clean_text(str(meta.get("venue") or ""))
    year = str(meta.get("year") or "n.d.")
    link = _reference_link(meta)

    if style == "ieee":
        line = f"[{citation_number}] {authors}, \"{title},\""
        if venue:
            line += f" {venue},"
        line += f" {year}."
        if link:
            line += f" {link}"
        return line

    if style == "mla":
        line = f"{authors}. \"{title}.\""
        if venue:
            line += f" {venue},"
        line += f" {year}."
        if link:
            line += f" {link}"
        return line

    line = f"{authors} ({year}). {title}."
    if venue:
        line += f" {venue}."
    if link:
        line += f" {link}"
    return line


def build_references(matches: List[Dict[str, Any]], style: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    references: List[Dict[str, Any]] = []
    paper_to_citation: Dict[str, int] = {}

    for match in matches:
        meta = match.get("metadata") or {}
        key = _paper_key(meta)
        if key in paper_to_citation:
            continue
        citation_number = len(references) + 1
        paper_to_citation[key] = citation_number
        references.append(
            {
                "citationNumber": citation_number,
                "paperId": meta.get("paperId"),
                "title": meta.get("title"),
                "year": meta.get("year"),
                "venue": meta.get("venue"),
                "source": meta.get("source"),
                "doi": meta.get("doi"),
                "url": meta.get("url"),
                "formatted": format_reference(meta, citation_number, style),
            }
        )

    return references, paper_to_citation

def build_context(matches: List[Dict[str, Any]], paper_to_citation: Dict[str, int]) -> Tuple[str, List[Dict[str, Any]]]:
    used_chunks: List[Dict[str, Any]] = []
    context_parts: List[str] = []
    total_chars = 0

    for idx, match in enumerate(matches, 1):
        meta = match.get("metadata") or {}
        chunk_text_value = clean_text(str(meta.get("chunkText") or ""))
        if not chunk_text_value:
            continue

        key = _paper_key(meta)
        citation_number = paper_to_citation.get(key)
        citation_tag = f"[{citation_number}]" if citation_number else "[?]"
        title = clean_text(str(meta.get("title") or "Untitled"))
        year = str(meta.get("year") or "n.d.")
        score = float(match.get("score", 0.0) or 0.0)
        hybrid_score = float(match.get("hybridScore", score) or 0.0)
        section = clean_text(str(meta.get("section") or "body")) or "body"

        block = (
            f"Chunk {idx} | Citation {citation_tag} | Title: {title} | Year: {year} | Section: {section} | Score: {score:.4f} | Hybrid: {hybrid_score:.4f}\n"
            f"{chunk_text_value}\n"
        )
        if total_chars + len(block) > MAX_CONTEXT_CHARS:
            break
        context_parts.append(block)
        total_chars += len(block)
        used_chunks.append(
            {
                "rank": idx,
                "citationNumber": citation_number,
                "paperId": meta.get("paperId"),
                "title": title,
                "score": score,
                "hybridScore": hybrid_score,
                "section": section,
                "chunkIndex": meta.get("chunkIndex"),
                "snippet": chunk_text_value[:400],
            }
        )

    return "\n".join(context_parts), used_chunks


def fallback_answer(question: str, used_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not used_chunks:
        return {
            "answer": "No relevant context was retrieved from the corpus.",
            "cross_paper_synthesis": [],
            "limitations": ["No retrieved chunks available."],
            "next_questions": [],
            "confidence": "low",
        }
    top = used_chunks[:3]
    evidence = []
    for item in top:
        citation = f"[{item.get('citationNumber')}]" if item.get("citationNumber") else "[?]"
        evidence.append(f"{citation} {item.get('title')}: {item.get('snippet')}")
    return {
        "answer": (
            f"Retrieved {len(used_chunks)} relevant chunks for: '{question}'. "
            f"OpenAI synthesis is unavailable, so this is an extractive answer."
        ),
        "cross_paper_synthesis": evidence,
        "limitations": ["Generative synthesis disabled because OPENAI_API_KEY is not configured."],
        "next_questions": [],
        "confidence": "low",
    }


def synthesize_answer(
    question: str,
    task: str,
    context_text: str,
    references: List[Dict[str, Any]],
) -> Dict[str, Any]:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return {
            "error": "OPENAI_API_KEY is not set for synthesis",
            "payload": None,
        }

    instruction_by_task = {
        "qa": (
            "Answer the user question with grounded, source-aware reasoning. "
            "Use citation tags like [1], [2] inline for each factual claim."
        ),
        "synthesis": (
            "Synthesize cross-paper consensus, disagreements, and evidence quality. "
            "Use inline citations [n] and explicitly compare studies."
        ),
        "comparison": (
            "Provide a paper-to-paper comparison across methods, datasets, assumptions, and outcomes. "
            "Use inline citations [n]."
        ),
        "outline": (
            "Generate a structured literature review outline with section headings and key points. "
            "Attach inline citations [n] to each key point."
        ),
    }
    task_instruction = instruction_by_task.get(task, instruction_by_task["qa"])

    system_prompt = (
        "You are a rigorous research assistant. "
        "Only use supplied context, and never invent sources. "
        "If evidence is weak or missing, state uncertainty."
    )

    refs_short = "\n".join(
        [
            f"[{r['citationNumber']}] {r.get('title')} ({r.get('year') or 'n.d.'})"
            for r in references
        ]
    )

    user_prompt = (
        f"Task: {task}\n"
        f"Question: {question}\n\n"
        f"Instruction: {task_instruction}\n\n"
        "Allowed citations:\n"
        f"{refs_short}\n\n"
        "Context chunks:\n"
        f"{context_text}\n\n"
        "Return valid JSON with:\n"
        "{\n"
        '  "answer": "Main answer with inline [n] citations.",\n'
        '  "cross_paper_synthesis": ["cross-paper point 1", "cross-paper point 2"],\n'
        '  "limitations": ["limitation 1", "limitation 2"],\n'
        '  "next_questions": ["next query 1", "next query 2"],\n'
        '  "confidence": "high|medium|low"\n'
        "}\n"
    )

    payload = openai_chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=(os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
        max_tokens=1200,
        temperature=0.2,
    )
    return {"error": None, "payload": payload}


def discover_papers(
    query: str,
    limit: int,
    sources: List[str],
    *,
    max_seconds: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], bool]:
    discovered: List[Dict[str, Any]] = []
    wanted = {s.strip().lower() for s in sources if s}
    start_time = time.time()
    budget_hit = False

    def within_budget() -> bool:
        if not max_seconds:
            return True
        return (time.time() - start_time) < max_seconds

    if "openalex" in wanted:
        if not within_budget():
            budget_hit = True
        else:
            try:
                discovered.extend(discover_openalex(query, limit))
            except Exception as e:
                print(f"OpenAlex discovery error: {str(e)}")
 
    if "semantic_scholar" in wanted or "semanticscholar" in wanted:
        if not within_budget():
            budget_hit = True
        else:
            try:
                discovered.extend(discover_semantic_scholar(query, limit))
            except Exception as e:
                print(f"Semantic Scholar discovery error: {str(e)}")

    if "crossref" in wanted:
        if not within_budget():
            budget_hit = True
        else:
            try:
                discovered.extend(discover_crossref(query, limit))
            except Exception as e:
                print(f"Crossref discovery error: {str(e)}")

    return merge_papers(discovered), budget_hit


def ingest_papers(
    papers: List[Dict[str, Any]],
    namespace: Optional[str],
    extract_pdf: bool,
    chunk_size_words: int,
    overlap_words: int,
    min_chunk_words: int,
    *,
    max_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    embed_model = (os.environ.get("OPENAI_EMBED_MODEL") or OPENAI_EMBED_MODEL).strip()
    ingested_papers = 0
    ingested_chunks = 0
    skipped: List[Dict[str, Any]] = []
    failed: List[Dict[str, Any]] = []
    timed_out = False
    start_time = time.time()

    for raw in papers:
        if max_seconds and (time.time() - start_time) >= max_seconds:
            timed_out = True
            paper = normalize_paper(raw)
            skipped.append(
                {
                    "paperId": paper.get("paperId"),
                    "title": paper.get("title"),
                    "reason": "Deferred due to ingest time budget (avoid API Gateway timeout). Retry with lower limit or no PDF extraction.",
                }
            )
            continue

        paper = normalize_paper(raw)
        try:
            text_parts: List[str] = []
            if paper.get("title"):
                text_parts.append(str(paper["title"]))
            if paper.get("fullText"):
                text_parts.append(paper["fullText"])
            if paper.get("abstract"):
                text_parts.append(paper["abstract"])

            should_extract_pdf = extract_pdf and as_bool(paper.get("allowPdfExtract"), True) and bool(paper.get("pdfUrl"))
            if should_extract_pdf:
                if max_seconds and (time.time() - start_time) >= max(1, max_seconds - 4):
                    skipped.append(
                        {
                            "paperId": paper.get("paperId"),
                            "title": paper.get("title"),
                            "reason": "Skipped PDF extraction due to remaining time budget.",
                        }
                    )
                    should_extract_pdf = False
                if should_extract_pdf:
                    try:
                        pdf_text = extract_pdf_text(paper["pdfUrl"], MAX_PDF_TEXT_CHARS)
                        if pdf_text:
                            text_parts.append(pdf_text)
                    except Exception as pdf_error:
                        print(f"PDF extraction failed for {paper.get('paperId')}: {str(pdf_error)}")

            merged_text = clean_text("\n\n".join([x for x in text_parts if x]))
            if not merged_text:
                merged_text = build_metadata_fallback_text(paper)
                if not merged_text:
                    skipped.append(
                        {
                            "paperId": paper.get("paperId"),
                            "title": paper.get("title"),
                            "reason": "No abstract/fullText/PDF text available",
                        }
                    )
                    continue

            chunk_rows = chunk_text_with_sections(merged_text, chunk_size_words, overlap_words, min_chunk_words)
            if not chunk_rows:
                skipped.append(
                    {
                        "paperId": paper.get("paperId"),
                        "title": paper.get("title"),
                        "reason": "Text too short after chunking",
                    }
                )
                continue

            if len(chunk_rows) > MAX_CHUNKS_PER_PAPER:
                chunk_rows = chunk_rows[:MAX_CHUNKS_PER_PAPER]

            if max_seconds and (time.time() - start_time) >= max(1, max_seconds - 3):
                timed_out = True
                skipped.append(
                    {
                        "paperId": paper.get("paperId"),
                        "title": paper.get("title"),
                        "reason": "Deferred due to remaining ingest time budget before embedding/upsert.",
                    }
                )
                continue

            chunk_texts = [clean_text(str(row.get("text") or "")) for row in chunk_rows]
            paper_structured = extract_structured_fields(merged_text)
            vectors = openai_embed_texts(chunk_texts, embed_model)
            if len(vectors) != len(chunk_rows):
                raise RuntimeError("Embedding count mismatch")

            upsert_rows: List[Dict[str, Any]] = []
            for idx, (chunk_row, embedding) in enumerate(zip(chunk_rows, vectors)):
                chunk_value = clean_text(str(chunk_row.get("text") or ""))
                section_name = clean_text(str(chunk_row.get("section") or "body")) or "body"
                vector_id = f"{paper['paperId']}::chunk::{idx}"
                metadata = {
                    "paperId": paper.get("paperId"),
                    "title": paper.get("title"),
                    "authors": ", ".join(paper.get("authors", [])[:10]),
                    "year": as_int(paper.get("year"), 0),
                    "citationCount": as_int(paper.get("citationCount"), 0),
                    "venue": paper.get("venue") or "",
                    "doi": paper.get("doi") or "",
                    "url": paper.get("url") or "",
                    "pdfUrl": paper.get("pdfUrl") or "",
                    "source": paper.get("source") or "",
                    "chunkIndex": idx,
                    "section": section_name,
                    "sectionIndex": as_int(chunk_row.get("sectionIndex"), 0),
                    "chunkText": chunk_value[:4000],
                    "researchQuestion": paper_structured.get("researchQuestion") or "",
                    "methodology": paper_structured.get("methodology") or "",
                    "datasetSize": paper_structured.get("datasetSize") or "",
                    "modelType": paper_structured.get("modelType") or "",
                    "keyFindings": paper_structured.get("keyFindings") or "",
                    "limitationsText": paper_structured.get("limitationsText") or "",
                    "futureWork": paper_structured.get("futureWork") or "",
                }
                upsert_rows.append({"id": vector_id, "values": embedding, "metadata": metadata})

            for i in range(0, len(upsert_rows), 100):
                pinecone_upsert(upsert_rows[i : i + 100], namespace)

            ingested_papers += 1
            ingested_chunks += len(chunk_rows)
        except Exception as e:
            failed.append(
                {
                    "paperId": paper.get("paperId"),
                    "title": paper.get("title"),
                    "error": str(e),
                }
            )

    return {
        "ingestedPapers": ingested_papers,
        "ingestedChunks": ingested_chunks,
        "skippedPapers": skipped,
        "failedPapers": failed,
        "timedOut": timed_out,
        "timeBudgetSeconds": max_seconds,
    }


def handle_ingest(body: Dict[str, Any]) -> Dict[str, Any]:
    namespace = (body.get("namespace") or os.environ.get("PINECONE_NAMESPACE") or "default").strip()
    query = clean_text(str(body.get("query") or ""))
    limit = clamp_int(body.get("limit"), 8, 1, 50)
    max_candidates = clamp_int(body.get("maxCandidates"), MAX_INGEST_CANDIDATES, 1, 40)
    query_pdf_paper_limit = clamp_int(body.get("queryPdfPaperLimit"), MAX_QUERY_PDF_PAPERS, 0, 8)
    extract_pdf = as_bool(body.get("extractPdfText"), True)
    chunk_size_words = clamp_int(body.get("chunkSizeWords"), 220, 80, 800)
    overlap_words = clamp_int(body.get("chunkOverlapWords"), 40, 0, 200)
    min_chunk_words = clamp_int(body.get("minChunkWords"), 60, 20, 200)
    time_budget = clamp_int(body.get("timeBudgetSeconds"), INGEST_TIME_BUDGET_SECONDS, 8, 28)

    explicit_papers = body.get("papers") if isinstance(body.get("papers"), list) else []
    sources = body.get("sources") if isinstance(body.get("sources"), list) else ["openalex", "semantic_scholar", "crossref"]

    discovered: List[Dict[str, Any]] = []
    discovery_budget = max(5, min(14, time_budget // 2))
    discovery_budget_hit = False
    if query:
        discovered, discovery_budget_hit = discover_papers(
            query,
            limit,
            sources,
            max_seconds=discovery_budget,
        )

    all_candidates = merge_papers([*explicit_papers, *discovered])
    if query:
        all_candidates.sort(key=paper_ingest_priority, reverse=True)

    selected_count = min(len(all_candidates), max_candidates)
    if query:
        selected_count = min(selected_count, limit)
    selected_candidates = all_candidates[:selected_count]
    deferred_due_cap = all_candidates[selected_count:]

    extract_pdf_effective = extract_pdf
    pdf_extraction_disabled_reason: Optional[str] = None
    query_pdf_extraction_selected = 0
    if query and extract_pdf:
        for p in selected_candidates:
            p["allowPdfExtract"] = False
        if query_pdf_paper_limit > 0:
            for p in selected_candidates:
                if query_pdf_extraction_selected >= query_pdf_paper_limit:
                    break
                if p.get("pdfUrl"):
                    p["allowPdfExtract"] = True
                    query_pdf_extraction_selected += 1
        extract_pdf_effective = query_pdf_extraction_selected > 0
        if query_pdf_extraction_selected == 0:
            pdf_extraction_disabled_reason = "PDF extraction requested, but no eligible PDF URLs were selected in this query batch."
        elif query_pdf_extraction_selected < len(selected_candidates):
            pdf_extraction_disabled_reason = (
                f"PDF extraction limited to top {query_pdf_extraction_selected} query candidates to stay within API Gateway timeout."
            )
    elif extract_pdf and len(selected_candidates) > 6:
        extract_pdf_effective = False
        pdf_extraction_disabled_reason = "PDF extraction was disabled because candidate volume is too high for synchronous ingestion."

    if not all_candidates:
        return {
            "namespace": namespace,
            "discoveredCount": 0,
            "ingestedPapers": 0,
            "ingestedChunks": 0,
            "skippedPapers": [],
            "failedPapers": [],
            "message": "No papers to ingest. Provide papers[] or query.",
        }

    stats = ingest_papers(
        papers=selected_candidates,
        namespace=namespace,
        extract_pdf=extract_pdf_effective,
        chunk_size_words=chunk_size_words,
        overlap_words=overlap_words,
        min_chunk_words=min_chunk_words,
        max_seconds=max(6, time_budget - discovery_budget),
    )
    if deferred_due_cap:
        stats["skippedPapers"] = (
            [
                {
                    "paperId": p.get("paperId"),
                    "title": p.get("title"),
                    "reason": f"Deferred due to ingest candidate cap ({selected_count}/{len(all_candidates)}). Retry in smaller batches.",
                }
                for p in deferred_due_cap
            ]
            + stats.get("skippedPapers", [])
        )

    return {
        "namespace": namespace,
        "discoveredCount": len(discovered),
        "candidateCount": len(all_candidates),
        "selectedCandidateCount": len(selected_candidates),
        "candidateCap": selected_count,
        "truncatedCandidates": len(deferred_due_cap),
        **stats,
        "requestedPdfExtraction": extract_pdf,
        "effectivePdfExtraction": extract_pdf_effective,
        "pdfExtractionDisabledReason": pdf_extraction_disabled_reason,
        "queryPdfPaperLimit": query_pdf_paper_limit if query else None,
        "queryPdfExtractionSelected": query_pdf_extraction_selected if query else 0,
        "discoveryBudgetSeconds": discovery_budget,
        "discoveryBudgetHit": discovery_budget_hit,
        "embeddingModel": (os.environ.get("OPENAI_EMBED_MODEL") or OPENAI_EMBED_MODEL).strip(),
        "vectorProvider": "pinecone",
    }


def _paper_profiles_from_matches(
    matches: List[Dict[str, Any]],
    paper_to_citation: Dict[str, int],
) -> List[Dict[str, Any]]:
    by_paper: Dict[str, Dict[str, Any]] = {}
    for match in matches:
        meta = match.get("metadata") or {}
        key = _paper_key(meta)
        score = float(match.get("hybridScore", match.get("score", 0.0)) or 0.0)
        existing = by_paper.get(key)
        if existing and existing.get("score", 0.0) >= score:
            continue
        citation_number = paper_to_citation.get(key)
        by_paper[key] = {
            "citationNumber": citation_number,
            "paperId": meta.get("paperId"),
            "title": meta.get("title"),
            "year": as_int(meta.get("year"), 0),
            "source": meta.get("source"),
            "methodology": clean_text(str(meta.get("methodology") or "")),
            "datasetSize": clean_text(str(meta.get("datasetSize") or "")),
            "modelType": clean_text(str(meta.get("modelType") or "")),
            "keyFindings": clean_text(str(meta.get("keyFindings") or "")),
            "limitations": clean_text(str(meta.get("limitationsText") or "")),
            "futureWork": clean_text(str(meta.get("futureWork") or "")),
            "score": score,
        }
    items = list(by_paper.values())
    items.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return items


def heuristic_research_gaps(paper_profiles: List[Dict[str, Any]]) -> List[str]:
    gaps: List[str] = []
    limitation_sentences = [p.get("limitations") for p in paper_profiles if p.get("limitations")]
    future_work_sentences = [p.get("futureWork") for p in paper_profiles if p.get("futureWork")]
    if limitation_sentences:
        common_limit_words = [
            "small sample",
            "single center",
            "generalizability",
            "demographic",
            "short follow-up",
            "observational",
        ]
        for token in common_limit_words:
            count = sum(1 for sentence in limitation_sentences if token in sentence.lower())
            if count >= 2:
                gaps.append(
                    f"Multiple studies report '{token}' as a recurring limitation, suggesting under-covered evidence in that dimension."
                )
    if future_work_sentences:
        gaps.append("Future-work statements across papers indicate unresolved questions that need controlled validation.")
    if not gaps and limitation_sentences:
        gaps.append("The corpus repeatedly flags methodological constraints; targeted replication studies are needed.")
    return gaps[:6]


def synthesize_insights_payload(
    question: str,
    context_text: str,
    references: List[Dict[str, Any]],
    paper_profiles: List[Dict[str, Any]],
) -> Dict[str, Any]:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        timeline = []
        for profile in sorted(paper_profiles, key=lambda x: x.get("year", 0)):
            if profile.get("year"):
                citation_suffix = ""
                if profile.get("citationNumber"):
                    citation_suffix = f"[{profile.get('citationNumber')}]"
                timeline.append(
                    f"{profile.get('year')}: {profile.get('title')} {citation_suffix}".strip()
                )
        methodology_groups: Dict[str, int] = {}
        for profile in paper_profiles:
            label = clean_text(str(profile.get("methodology") or "")).lower()
            if not label:
                continue
            methodology_groups[label] = methodology_groups.get(label, 0) + 1
        agreement_clusters = [
            f"{method} appears in {count} high-ranked papers."
            for method, count in sorted(methodology_groups.items(), key=lambda item: item[1], reverse=True)[:4]
        ]
        return {
            "agreement_clusters": agreement_clusters,
            "contradictions": [],
            "methodological_differences": [
                p.get("methodology") for p in paper_profiles if p.get("methodology")
            ][:6],
            "timeline_evolution": timeline[:8],
            "research_gaps": heuristic_research_gaps(paper_profiles),
        }

    refs_short = "\n".join(
        [f"[{r['citationNumber']}] {r.get('title')} ({r.get('year') or 'n.d.'})" for r in references]
    )
    structured_rows = []
    for profile in paper_profiles[:16]:
        structured_rows.append(
            {
                "citation": profile.get("citationNumber"),
                "title": profile.get("title"),
                "year": profile.get("year"),
                "methodology": profile.get("methodology"),
                "datasetSize": profile.get("datasetSize"),
                "modelType": profile.get("modelType"),
                "keyFindings": profile.get("keyFindings"),
                "limitations": profile.get("limitations"),
                "futureWork": profile.get("futureWork"),
            }
        )
    payload = openai_chat_json(
        system_prompt=(
            "You are a literature intelligence engine. Only use provided context and structured rows. "
            "Every factual statement must be source-grounded. Prefer concise bullets."
        ),
        user_prompt=(
            f"Question: {question}\n\n"
            "Allowed citations:\n"
            f"{refs_short}\n\n"
            "Structured paper rows:\n"
            f"{json.dumps(structured_rows)}\n\n"
            "Retrieved context:\n"
            f"{context_text}\n\n"
            "Return JSON:\n"
            "{\n"
            '  "agreement_clusters": ["... [n]"],\n'
            '  "contradictions": ["... [n][m]"],\n'
            '  "methodological_differences": ["... [n]"],\n'
            '  "timeline_evolution": ["YYYY: ... [n]"],\n'
            '  "research_gaps": ["... [n]"]\n'
            "}"
        ),
        model=(os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
        max_tokens=1400,
        temperature=0.1,
    )
    return {
        "agreement_clusters": payload.get("agreement_clusters") or [],
        "contradictions": payload.get("contradictions") or [],
        "methodological_differences": payload.get("methodological_differences") or [],
        "timeline_evolution": payload.get("timeline_evolution") or [],
        "research_gaps": payload.get("research_gaps") or [],
    }


def handle_insights(body: Dict[str, Any]) -> Dict[str, Any]:
    question = clean_text(str(body.get("question") or "Map this research area."))
    namespace = (body.get("namespace") or os.environ.get("PINECONE_NAMESPACE") or "default").strip()
    top_k = clamp_int(body.get("topK"), 12, 3, 40)
    citation_style = clean_text(str(body.get("citationStyle") or "apa")).lower()
    if citation_style not in {"apa", "mla", "ieee"}:
        citation_style = "apa"
    metadata_filter = body.get("metadataFilter") if isinstance(body.get("metadataFilter"), dict) else None
    return_contexts = as_bool(body.get("returnContexts"), False)

    embed_model = (os.environ.get("OPENAI_EMBED_MODEL") or OPENAI_EMBED_MODEL).strip()
    q_embeddings = openai_embed_texts([question], embed_model)
    if not q_embeddings:
        raise RuntimeError("Failed to embed insights query")

    raw_matches = pinecone_query(
        query_vector=q_embeddings[0],
        top_k=min(100, top_k * HYBRID_RERANK_MULTIPLIER),
        namespace=namespace,
        metadata_filter=metadata_filter,
    )
    matches = hybrid_rerank_matches(question, raw_matches, top_k)
    references, paper_to_citation = build_references(matches, citation_style)
    context_text, used_chunks = build_context(matches, paper_to_citation)
    paper_profiles = _paper_profiles_from_matches(matches[:INSIGHTS_MAX_PAPERS], paper_to_citation)

    if not matches:
        return {
            "question": question,
            "insights": {
                "agreementClusters": [],
                "contradictions": [],
                "methodologicalDifferences": [],
                "timelineEvolution": [],
                "researchGaps": [],
                "paperProfiles": [],
            },
            "references": [],
            "retrieval": {"topK": top_k, "returned": 0, "namespace": namespace},
        }

    insights_payload = synthesize_insights_payload(question, context_text, references, paper_profiles)
    response: Dict[str, Any] = {
        "question": question,
        "insights": {
            "agreementClusters": insights_payload.get("agreement_clusters") or [],
            "contradictions": insights_payload.get("contradictions") or [],
            "methodologicalDifferences": insights_payload.get("methodological_differences") or [],
            "timelineEvolution": insights_payload.get("timeline_evolution") or [],
            "researchGaps": insights_payload.get("research_gaps") or [],
            "paperProfiles": paper_profiles,
        },
        "references": references,
        "retrieval": {
            "topK": top_k,
            "returned": len(matches),
            "namespace": namespace,
            "embeddingModel": embed_model,
            "chatModel": (os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
            "mode": "hybrid",
        },
    }
    if return_contexts:
        response["contexts"] = used_chunks
    return response


def handle_gaps(body: Dict[str, Any]) -> Dict[str, Any]:
    question = clean_text(str(body.get("question") or "What are the major research gaps?"))
    namespace = (body.get("namespace") or os.environ.get("PINECONE_NAMESPACE") or "default").strip()
    top_k = clamp_int(body.get("topK"), 12, 3, 40)
    citation_style = clean_text(str(body.get("citationStyle") or "apa")).lower()
    if citation_style not in {"apa", "mla", "ieee"}:
        citation_style = "apa"
    metadata_filter = body.get("metadataFilter") if isinstance(body.get("metadataFilter"), dict) else None

    embed_model = (os.environ.get("OPENAI_EMBED_MODEL") or OPENAI_EMBED_MODEL).strip()
    q_embeddings = openai_embed_texts([question], embed_model)
    if not q_embeddings:
        raise RuntimeError("Failed to embed gaps query")

    raw_matches = pinecone_query(
        query_vector=q_embeddings[0],
        top_k=min(100, top_k * HYBRID_RERANK_MULTIPLIER),
        namespace=namespace,
        metadata_filter=metadata_filter,
    )
    matches = hybrid_rerank_matches(question, raw_matches, top_k)
    references, paper_to_citation = build_references(matches, citation_style)
    context_text, _ = build_context(matches, paper_to_citation)
    paper_profiles = _paper_profiles_from_matches(matches[:INSIGHTS_MAX_PAPERS], paper_to_citation)
    gaps = heuristic_research_gaps(paper_profiles)

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if api_key and matches:
        refs_short = "\n".join(
            [f"[{r['citationNumber']}] {r.get('title')} ({r.get('year') or 'n.d.'})" for r in references]
        )
        gap_payload = openai_chat_json(
            system_prompt=(
                "Identify evidence-grounded research gaps only from provided material. "
                "Every gap must include citation tags [n]."
            ),
            user_prompt=(
                f"Question: {question}\n\n"
                f"Allowed citations:\n{refs_short}\n\n"
                f"Context:\n{context_text}\n\n"
                "Return JSON with:\n"
                "{\n"
                '  "gaps": ["gap statement [n]"],\n'
                '  "supporting_evidence": ["evidence statement [n]"]\n'
                "}"
            ),
            model=(os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
            max_tokens=900,
            temperature=0.1,
        )
        gaps = gap_payload.get("gaps") or gaps
        supporting_evidence = gap_payload.get("supporting_evidence") or []
    else:
        supporting_evidence = [
            p.get("limitations")
            for p in paper_profiles
            if p.get("limitations")
        ][:8]

    return {
        "question": question,
        "gaps": gaps,
        "supportingEvidence": supporting_evidence,
        "references": references,
        "retrieval": {
            "topK": top_k,
            "returned": len(matches),
            "namespace": namespace,
            "embeddingModel": embed_model,
            "chatModel": (os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
            "mode": "hybrid",
        },
    }


def handle_ask(body: Dict[str, Any]) -> Dict[str, Any]:
    question = clean_text(str(body.get("question") or ""))
    if not question:
        raise ValueError("question is required")

    namespace = (body.get("namespace") or os.environ.get("PINECONE_NAMESPACE") or "default").strip()
    task = clean_text(str(body.get("task") or "qa")).lower()
    if task not in {"qa", "synthesis", "comparison", "outline"}:
        task = "qa"
    citation_style = clean_text(str(body.get("citationStyle") or "apa")).lower()
    if citation_style not in {"apa", "mla", "ieee"}:
        citation_style = "apa"
    top_k = clamp_int(body.get("topK"), 8, 1, 30)
    return_contexts = as_bool(body.get("returnContexts"), False)
    metadata_filter = body.get("metadataFilter") if isinstance(body.get("metadataFilter"), dict) else None

    embed_model = (os.environ.get("OPENAI_EMBED_MODEL") or OPENAI_EMBED_MODEL).strip()
    q_embeddings = openai_embed_texts([question], embed_model)
    if not q_embeddings:
        raise RuntimeError("Failed to embed question")

    raw_matches = pinecone_query(
        query_vector=q_embeddings[0],
        top_k=min(100, top_k * HYBRID_RERANK_MULTIPLIER),
        namespace=namespace,
        metadata_filter=metadata_filter,
    )
    matches = hybrid_rerank_matches(question, raw_matches, top_k)
    if not matches:
        return {
            "question": question,
            "task": task,
            "answer": "No relevant documents were retrieved from the corpus.",
            "references": [],
            "retrieval": {"topK": top_k, "returned": 0, "namespace": namespace},
            "crossPaperSynthesis": [],
            "limitations": ["No context retrieved from vector database."],
            "nextQuestions": [],
            "confidence": "low",
        }

    references, paper_to_citation = build_references(matches, citation_style)
    context_text, used_chunks = build_context(matches, paper_to_citation)

    synthesis_result = synthesize_answer(question, task, context_text, references)
    if synthesis_result.get("error"):
        payload = fallback_answer(question, used_chunks)
        payload["limitations"] = payload.get("limitations", []) + [synthesis_result["error"]]
    else:
        payload = synthesis_result["payload"] or fallback_answer(question, used_chunks)

    response: Dict[str, Any] = {
        "question": question,
        "task": task,
        "answer": payload.get("answer") or "",
        "crossPaperSynthesis": payload.get("cross_paper_synthesis") or [],
        "limitations": payload.get("limitations") or [],
        "nextQuestions": payload.get("next_questions") or [],
        "confidence": payload.get("confidence") or "medium",
        "references": references,
        "retrieval": {
            "topK": top_k,
            "returned": len(matches),
            "namespace": namespace,
            "embeddingModel": embed_model,
            "chatModel": (os.environ.get("OPENAI_CHAT_MODEL") or OPENAI_CHAT_MODEL).strip(),
            "mode": "hybrid",
        },
    }
    if return_contexts:
        response["contexts"] = used_chunks
    return response


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if (event.get("httpMethod") or "").upper() == "OPTIONS":
        return create_response(200, {"ok": True})

    try:
        body = parse_event_body(event)
        action = clean_text(str(body.get("action") or "ask")).lower()

        if action == "ingest":
            result = handle_ingest(body)
            return create_response(200, result)

        if action == "ask":
            result = handle_ask(body)
            return create_response(200, result)

        if action == "insights":
            result = handle_insights(body)
            return create_response(200, result)

        if action == "gaps":
            result = handle_gaps(body)
            return create_response(200, result)

        return create_response(400, {"error": "Invalid action. Use 'ingest', 'ask', 'insights', or 'gaps'."})
    except ValueError as e:
        return create_response(400, {"error": str(e)})
    except Exception as e:
        print(f"RAG pipeline error: {str(e)}")
        return create_response(500, {"error": f"Internal server error: {str(e)}"})
