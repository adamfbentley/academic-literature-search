#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def post_json(url: str, payload: Dict[str, Any], timeout: int = 90) -> Tuple[int, Dict[str, Any]]:
    body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return int(response.status), data
    except HTTPError as e:
        raw = e.read().decode("utf-8") if e.fp else ""
        try:
            payload_out = json.loads(raw) if raw else {}
        except Exception:
            payload_out = {"raw": raw}
        return int(e.code), payload_out
    except URLError as e:
        return 0, {"error": str(e)}


def mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return float(statistics.mean(values))


def run_search_eval(api_url: str, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    endpoint = api_url.rstrip("/") + "/search"
    results: List[Dict[str, Any]] = []

    for case in cases:
        payload = {
            "query": case["query"],
            "limit": int(case.get("limit", 12)),
            "sort": case.get("sort", "relevance"),
            "includeArxiv": bool(case.get("includeArxiv", False)),
            "includeCrossref": bool(case.get("includeCrossref", True)),
            "fromYear": case.get("fromYear"),
            "toYear": case.get("toYear"),
            "minCitations": case.get("minCitations"),
            "debug": True,
        }
        status, body = post_json(endpoint, payload, timeout=90)

        papers = body.get("papers", []) if isinstance(body, dict) else []
        source_breakdown = body.get("sourceBreakdown", {}) if isinstance(body, dict) else {}
        distinct_sources = sum(1 for _, v in source_breakdown.items() if int(v or 0) > 0)
        crossref_hits = int(source_breakdown.get("Crossref", 0) or 0)

        results.append(
            {
                "name": case.get("name", case["query"]),
                "query": case["query"],
                "status": status,
                "count": int(body.get("count", 0) or 0) if isinstance(body, dict) else 0,
                "distinctSources": distinct_sources,
                "crossrefHits": crossref_hits,
                "passNonEmpty": status == 200 and len(papers) > 0,
                "sourceBreakdown": source_breakdown,
                "error": body.get("error") if isinstance(body, dict) else None,
            }
        )

    total = len(results)
    non_empty_rate = sum(1 for r in results if r["passNonEmpty"]) / total if total else 0.0
    avg_source_diversity = mean([float(r["distinctSources"]) for r in results])
    crossref_coverage_rate = (
        sum(1 for r in results if r["crossrefHits"] > 0) / total if total else 0.0
    )
    error_rate = sum(1 for r in results if r["status"] != 200) / total if total else 0.0

    return {
        "cases": results,
        "metrics": {
            "caseCount": total,
            "nonEmptyRate": round(non_empty_rate, 4),
            "avgSourceDiversity": round(avg_source_diversity, 4),
            "crossrefCoverageRate": round(crossref_coverage_rate, 4),
            "errorRate": round(error_rate, 4),
        },
    }


def run_rag_eval(api_url: str, cases: List[Dict[str, Any]], namespace: str) -> Dict[str, Any]:
    endpoint = api_url.rstrip("/") + "/rag"
    results: List[Dict[str, Any]] = []

    for case in cases:
        ingest_payload = {
            "action": "ingest",
            "namespace": namespace,
            "query": case["query"],
            "limit": int(case.get("ingestLimit", 10)),
            "maxCandidates": int(case.get("ingestLimit", 10)),
            "sources": case.get("sources", ["openalex", "semantic_scholar", "crossref"]),
            "extractPdfText": bool(case.get("extractPdfText", True)),
            "queryPdfPaperLimit": int(case.get("queryPdfPaperLimit", 2)),
            "timeBudgetSeconds": int(case.get("timeBudgetSeconds", 24)),
        }
        ingest_status, ingest_body = post_json(endpoint, ingest_payload, timeout=120)

        ask_payload = {
            "action": "ask",
            "namespace": namespace,
            "question": case["question"],
            "task": case.get("task", "synthesis"),
            "citationStyle": case.get("citationStyle", "apa"),
            "topK": int(case.get("topK", 8)),
            "returnContexts": False,
        }
        ask_status, ask_body = post_json(endpoint, ask_payload, timeout=120)

        answer = ask_body.get("answer", "") if isinstance(ask_body, dict) else ""
        references = ask_body.get("references", []) if isinstance(ask_body, dict) else []
        citation_matches = re.findall(r"\[(\d+)\]", answer or "")
        words = len((answer or "").split())
        citation_density = (len(citation_matches) / max(1.0, words / 100.0)) if words else 0.0

        min_inline = int(case.get("minInlineCitations", 1))
        min_refs = int(case.get("minReferences", 1))
        pass_grounded_proxy = (
            ask_status == 200
            and len(citation_matches) >= min_inline
            and len(references) >= min_refs
            and words >= int(case.get("minAnswerWords", 40))
        )

        results.append(
            {
                "name": case.get("name", case["question"]),
                "query": case["query"],
                "question": case["question"],
                "ingestStatus": ingest_status,
                "askStatus": ask_status,
                "ingestedPapers": int(ingest_body.get("ingestedPapers", 0) or 0)
                if isinstance(ingest_body, dict)
                else 0,
                "retrievedReferences": len(references),
                "inlineCitationCount": len(citation_matches),
                "answerWords": words,
                "citationDensityPer100Words": round(citation_density, 4),
                "passGroundedProxy": pass_grounded_proxy,
                "ingestTimedOut": bool(ingest_body.get("timedOut", False))
                if isinstance(ingest_body, dict)
                else False,
                "errors": {
                    "ingest": ingest_body.get("error") if isinstance(ingest_body, dict) else None,
                    "ask": ask_body.get("error") if isinstance(ask_body, dict) else None,
                },
            }
        )

    total = len(results)
    pass_rate = sum(1 for r in results if r["passGroundedProxy"]) / total if total else 0.0
    avg_citation_density = mean([float(r["citationDensityPer100Words"]) for r in results])
    ingest_timeout_rate = sum(1 for r in results if r["ingestTimedOut"]) / total if total else 0.0

    return {
        "cases": results,
        "metrics": {
            "caseCount": total,
            "groundedProxyPassRate": round(pass_rate, 4),
            "avgCitationDensityPer100Words": round(avg_citation_density, 4),
            "ingestTimeoutRate": round(ingest_timeout_rate, 4),
        },
    }


def load_json_file(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"Expected list in {path}")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Run benchmark evaluation for search + RAG APIs.")
    parser.add_argument("--api-url", default="", help="Base API URL, e.g. https://.../prod")
    parser.add_argument(
        "--search-cases",
        default="benchmarks/eval/search_cases.json",
        help="Path to search evaluation case definitions",
    )
    parser.add_argument(
        "--rag-cases",
        default="benchmarks/eval/rag_cases.json",
        help="Path to RAG evaluation case definitions",
    )
    parser.add_argument("--namespace", default="project-eval", help="Pinecone namespace for RAG eval")
    parser.add_argument("--skip-rag", action="store_true", help="Only run search evaluation")
    parser.add_argument(
        "--output",
        default="benchmarks/eval/latest_report.json",
        help="JSON report output path",
    )
    args = parser.parse_args()

    api_url = (args.api_url or "").strip()
    if not api_url:
        print("Missing --api-url. Example: --api-url https://your-api.execute-api.region.amazonaws.com/prod")
        return 2

    search_cases = load_json_file(Path(args.search_cases))
    report: Dict[str, Any] = {
        "timestampUtc": datetime.now(timezone.utc).isoformat(),
        "apiUrl": api_url,
        "search": run_search_eval(api_url, search_cases),
    }

    if not args.skip_rag:
        rag_cases = load_json_file(Path(args.rag_cases))
        report["rag"] = run_rag_eval(api_url, rag_cases, args.namespace)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("Evaluation complete.")
    print(f"Report: {output_path}")
    print("Search metrics:", json.dumps(report["search"]["metrics"], indent=2))
    if "rag" in report:
        print("RAG metrics:", json.dumps(report["rag"]["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
