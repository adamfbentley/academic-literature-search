import json
import os
from datetime import datetime
import requests
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import quote
from decimal import Decimal
import re
import math

try:
    import boto3  # type: ignore
except Exception:
    boto3 = None

# Initialize AWS services (optional in local dev)
dynamodb = boto3.resource('dynamodb') if boto3 else None
table_name = os.environ.get('DYNAMODB_TABLE', 'academic-papers-cache')

DEFAULT_USER_AGENT = os.environ.get('HTTP_USER_AGENT', 'academic-literature-ai/1.0')

DEEP_OVERVIEW_TTL_SECONDS = int(os.environ.get('DEEP_OVERVIEW_TTL_SECONDS', str(24 * 60 * 60)))
SEARCH_DEFAULT_LIMIT = int(os.environ.get('SEARCH_DEFAULT_LIMIT', '20'))
SEARCH_MAX_LIMIT = int(os.environ.get('SEARCH_MAX_LIMIT', '100'))
SEARCH_OVERFETCH_FACTOR = float(os.environ.get('SEARCH_OVERFETCH_FACTOR', '2.0'))
SEARCH_SOURCE_MAX_FETCH = int(os.environ.get('SEARCH_SOURCE_MAX_FETCH', '80'))
SEARCH_HTTP_TIMEOUT_SECONDS = int(os.environ.get('SEARCH_HTTP_TIMEOUT_SECONDS', '20'))
SEARCH_ENABLE_CROSSREF_DEFAULT = (os.environ.get('SEARCH_ENABLE_CROSSREF_DEFAULT', 'true').strip().lower() in {'1', 'true', 'yes', 'y', 'on'})

def decimal_to_number(obj):
    """Convert Decimal objects to int or float for JSON serialization"""
    if isinstance(obj, list):
        return [decimal_to_number(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: decimal_to_number(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj


def parse_event_body(event: Dict[str, Any]) -> Dict[str, Any]:
    """Parse request payload from either API Gateway proxy events or direct Lambda test events."""
    body = event.get('body', {})

    # API Gateway/Lambda proxy: body is usually a JSON string
    if isinstance(body, str):
        body = body.strip()
        if not body:
            return {}
        try:
            return json.loads(body)
        except Exception:
            return {}

    # Some integrations/tests pass a dict directly
    if isinstance(body, dict):
        return body

    # Lambda console tests often paste the payload at the top level
    if isinstance(event, dict):
        return event

    return {}


def clamp_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(min_value, min(max_value, parsed))


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {'1', 'true', 'yes', 'y', 'on'}:
            return True
        if v in {'0', 'false', 'no', 'n', 'off'}:
            return False
    return bool(value)


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default

def lambda_handler(event, context):
    """
    Lambda handler for searching academic papers from multiple sources
    
    Expected input:
    {
        "query": "quantum machine learning",
        "field": "physics",  # optional
        "limit": 20          # optional, default 20
    }
    """
    try:
        # Parse request body (supports API Gateway proxy + direct Lambda tests)
        body = parse_event_body(event)
        query = (body.get('query', '') or '').strip()
        field = (body.get('field', '') or '').strip()
        limit = clamp_int(body.get('limit'), SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT)
        from_year = body.get('fromYear', None)
        to_year = body.get('toYear', None)
        min_citations = body.get('minCitations', None)
        sort_mode = (body.get('sort', 'relevance') or 'relevance').strip().lower()
        topic = (body.get('topic', '') or '').strip()
        concept_ids_raw = body.get('conceptIds', None)
        include_arxiv = body.get('includeArxiv', None)
        include_crossref = body.get('includeCrossref', None)
        deep_overview = bool(body.get('deepOverview', False))
        deep_overview_max_papers = body.get('deepOverviewMaxPapers', None)
        force_refresh = bool(body.get('forceRefresh', False))
        debug = bool(body.get('debug', False))

        if sort_mode not in {'relevance', 'citations', 'date'}:
            sort_mode = 'relevance'

        # Default behavior: arXiv is opt-in (otherwise it can skew results toward physics/CS).
        # If a client explicitly sets includeArxiv, respect it.
        include_arxiv = as_bool(include_arxiv, False)
        include_crossref = as_bool(include_crossref, SEARCH_ENABLE_CROSSREF_DEFAULT)

        # Over-fetch from each source to improve recall before de-dup/filtering.
        source_fetch_limit = min(
            SEARCH_SOURCE_MAX_FETCH,
            max(limit, int(math.ceil(limit * max(1.0, SEARCH_OVERFETCH_FACTOR)))),
        )
        
        if not query:
            return create_response(400, {'error': 'Query parameter is required'})
        
        resolved_concept_ids = normalize_concept_ids(concept_ids_raw)
        if topic and not resolved_concept_ids:
            resolved_concept_ids = resolve_openalex_concepts(topic)

        cache_key = build_cache_key(
            query,
            field,
            sort_mode,
            resolved_concept_ids,
            include_arxiv=include_arxiv,
            include_crossref=include_crossref,
            from_year=from_year,
            to_year=to_year,
            min_citations=min_citations,
        )

        # Check cache first
        cached_result = None if force_refresh else check_cache(cache_key)
        if cached_result:
            # Convert any Decimal objects from DynamoDB
            cached_result = decimal_to_number(cached_result)

            # Apply filters to cached papers if requested
            filtered_cached = apply_filters(cached_result, from_year, to_year, min_citations)

            # Generate a summary even for cached results (so UI can show it)
            overall_summary = generate_search_summary(query, filtered_cached[:limit], ['cache'])

            deep_overview_result = None
            if deep_overview:
                deep_overview_result = generate_deep_overview(
                    query,
                    filtered_cached[:limit],
                    max_papers=deep_overview_max_papers,
                    cache_key=cache_key,
                    force_refresh=force_refresh,
                )
            return create_response(200, {
                'papers': filtered_cached[:limit],
                'count': len(filtered_cached[:limit]),
                'cached': True,
                'sources': ['cache'],
                'sourceBreakdown': source_counts(filtered_cached[:limit]),
                'summary': overall_summary,
                **({'deep_overview': deep_overview_result} if deep_overview_result is not None else {}),
                **({'debug': {
                    'forceRefresh': force_refresh,
                    'sort': sort_mode,
                    'topic': topic,
                    'conceptIds': resolved_concept_ids,
                    'includeArxiv': include_arxiv,
                    'includeCrossref': include_crossref,
                    'deepOverview': deep_overview,
                    'sourceFetchLimit': source_fetch_limit,
                }} if debug else {})
            })
        
        # Search multiple sources
        all_papers = []
        sources_used = []
        next_rank = 0

        source_debug: Dict[str, Any] = {}
        
        # 1. OpenAlex (primary - best rate limits)
        try:
            openalex_papers = search_openalex(
                query,
                field,
                source_fetch_limit,
                from_year,
                to_year,
                min_citations,
                sort_mode=sort_mode,
                concept_ids=resolved_concept_ids,
            )
            openalex_papers, next_rank = attach_rank(openalex_papers, next_rank, 'OpenAlex')
            all_papers.extend(openalex_papers)
            sources_used.append('OpenAlex')
            source_debug['openalex'] = {
                'ok': True,
                'count': len(openalex_papers),
            }
            print(f"OpenAlex returned {len(openalex_papers)} papers")
        except Exception as e:
            print(f"OpenAlex error: {str(e)}")
            source_debug['openalex'] = {
                'ok': False,
                'error': str(e),
            }
        
        # 2. Semantic Scholar (broad coverage)
        try:
            ss_papers = search_semantic_scholar(query, field, source_fetch_limit)
            ss_papers, next_rank = attach_rank(ss_papers, next_rank, 'Semantic Scholar')
            all_papers.extend(ss_papers)
            sources_used.append('Semantic Scholar')
            source_debug['semanticScholar'] = {
                'ok': True,
                'count': len(ss_papers),
            }
            print(f"Semantic Scholar returned {len(ss_papers)} papers")
        except Exception as e:
            print(f"Semantic Scholar error: {str(e)}")
            source_debug['semanticScholar'] = {
                'ok': False,
                'error': str(e),
            }

        # 3. Crossref (broad cross-discipline bibliographic coverage)
        if include_crossref:
            try:
                crossref_papers = search_crossref(
                    query,
                    field,
                    source_fetch_limit,
                    from_year=from_year,
                    to_year=to_year,
                    sort_mode=sort_mode,
                )
                crossref_papers, next_rank = attach_rank(crossref_papers, next_rank, 'Crossref')
                all_papers.extend(crossref_papers)
                sources_used.append('Crossref')
                source_debug['crossref'] = {
                    'ok': True,
                    'count': len(crossref_papers),
                }
                print(f"Crossref returned {len(crossref_papers)} papers")
            except Exception as e:
                print(f"Crossref error: {str(e)}")
                source_debug['crossref'] = {
                    'ok': False,
                    'error': str(e),
                }
        else:
            source_debug['crossref'] = {
                'ok': True,
                'count': 0,
                'skipped': True,
            }

        # 4. arXiv (opt-in preprints; can skew non-STEM queries)
        if include_arxiv:
            try:
                arxiv_papers = search_arxiv(query, source_fetch_limit)
                # arXiv doesn't provide citation counts; enrich via Semantic Scholar when possible.
                arxiv_papers = enrich_arxiv_with_semantic_scholar(arxiv_papers)
                arxiv_papers, next_rank = attach_rank(arxiv_papers, next_rank, 'arXiv')
                all_papers.extend(arxiv_papers)
                sources_used.append('arXiv')
                source_debug['arxiv'] = {
                    'ok': True,
                    'count': len(arxiv_papers),
                }
                print(f"arXiv returned {len(arxiv_papers)} papers")
            except Exception as e:
                print(f"arXiv error: {str(e)}")
                source_debug['arxiv'] = {
                    'ok': False,
                    'error': str(e),
                }
        
        # Remove duplicates (by DOI or title)
        unique_papers = deduplicate_papers(all_papers)

        # Apply filters (for sources that don't support them well)
        unique_papers = apply_filters(unique_papers, from_year, to_year, min_citations)
        
        # Respect requested sort. Relevance mode uses source-diversified ranking.
        if sort_mode == 'citations':
            unique_papers.sort(key=lambda p: (safe_int(p.get('citationCount'), 0), safe_int(p.get('year'), 0)), reverse=True)
            result_papers = unique_papers[:limit]
        elif sort_mode == 'date':
            unique_papers.sort(key=lambda p: (safe_int(p.get('year'), 0), safe_int(p.get('citationCount'), 0)), reverse=True)
            result_papers = unique_papers[:limit]
        else:
            result_papers = relevance_rank_with_source_diversity(unique_papers, limit)

        # Remove internal fields
        for p in result_papers:
            for key in ('_rank', '_sourceRank', '_relevanceScore'):
                if key in p:
                    del p[key]
        
        # Generate overall summary of the search results
        overall_summary = generate_search_summary(query, result_papers, sources_used)

        deep_overview_result = None
        if deep_overview:
            deep_overview_result = generate_deep_overview(
                query,
                result_papers,
                max_papers=deep_overview_max_papers,
                cache_key=cache_key,
                force_refresh=force_refresh,
            )
        
        # Cache results
        cache_results(cache_key, result_papers)
        
        return create_response(200, {
            'papers': result_papers,
            'count': len(result_papers),
            'cached': False,
            'sources': sources_used,
            'sourceBreakdown': source_counts(result_papers),
            'summary': overall_summary,
            **({'deep_overview': deep_overview_result} if deep_overview_result is not None else {}),
            **({'debug': {
                'forceRefresh': force_refresh,
                'sort': sort_mode,
                'topic': topic,
                'conceptIds': resolved_concept_ids,
                'includeArxiv': include_arxiv,
                'includeCrossref': include_crossref,
                'deepOverview': deep_overview,
                'sourceFetchLimit': source_fetch_limit,
                'sources': source_debug,
                'openai': overall_summary.get('_meta', None) if isinstance(overall_summary, dict) else None,
            }} if debug else {})
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def normalize_concept_ids(concept_ids_raw: Any) -> List[str]:
    if not concept_ids_raw:
        return []
    if isinstance(concept_ids_raw, str):
        concept_ids = [concept_ids_raw]
    elif isinstance(concept_ids_raw, list):
        concept_ids = concept_ids_raw
    else:
        return []

    normalized: List[str] = []
    for cid in concept_ids:
        if not cid:
            continue
        cid_s = str(cid).strip()
        if not cid_s:
            continue
        # Accept full URLs like https://openalex.org/C123...
        if cid_s.startswith('http') and '/C' in cid_s:
            cid_s = cid_s.rsplit('/C', 1)[-1]
            cid_s = 'C' + cid_s
        if cid_s.startswith('C'):
            normalized.append(cid_s)

    # de-dupe while preserving order
    seen = set()
    out: List[str] = []
    for cid in normalized:
        if cid in seen:
            continue
        seen.add(cid)
        out.append(cid)
    return out


def resolve_openalex_concepts(topic: str, max_results: int = 2) -> List[str]:
    """Resolve a human topic string (e.g. 'quantum computing') to OpenAlex concept IDs."""
    topic = (topic or '').strip()
    if not topic:
        return []

    try:
        response = requests.get(
            'https://api.openalex.org/concepts',
            params={
                'search': topic,
                'per_page': max(1, min(max_results, 5)),
            },
            headers={'User-Agent': DEFAULT_USER_AGENT},
            timeout=min(SEARCH_HTTP_TIMEOUT_SECONDS, 12),
        )
        response.raise_for_status()
        data = response.json()
        results = data.get('results', [])
        concept_ids: List[str] = []
        for r in results:
            cid = r.get('id')
            if not cid:
                continue
            concept_ids.extend(normalize_concept_ids(cid))
        return concept_ids[:max_results]
    except Exception as e:
        print(f"OpenAlex concept resolution error: {str(e)}")
        return []


def build_cache_key(
    query: str,
    field: str,
    sort_mode: str,
    concept_ids: List[str],
    *,
    include_arxiv: bool = False,
    include_crossref: bool = True,
    from_year: Any = None,
    to_year: Any = None,
    min_citations: Any = None,
) -> str:
    sort_mode = (sort_mode or 'relevance').strip().lower()
    concept_part = '|'.join(concept_ids) if concept_ids else ''
    include_part = '1' if include_arxiv else '0'
    crossref_part = '1' if include_crossref else '0'

    def _norm_int(x: Any) -> str:
        if x is None:
            return ''
        s = str(x).strip()
        if not s:
            return ''
        try:
            return str(int(s))
        except Exception:
            return s

    fy = _norm_int(from_year)
    ty = _norm_int(to_year)
    mc = _norm_int(min_citations)
    return f"{query}:{field}:sort={sort_mode}:concepts={concept_part}:arxiv={include_part}:crossref={crossref_part}:from={fy}:to={ty}:mincit={mc}"


def search_openalex(
    query: str,
    field: str,
    limit: int,
    from_year=None,
    to_year=None,
    min_citations=None,
    *,
    sort_mode: str = 'relevance',
    concept_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Search papers using OpenAlex API (best free option)
    https://docs.openalex.org/
    """
    base_url = "https://api.openalex.org/works"
    
    # Build query
    search_query = query
    if field:
        search_query = f"{query} {field}"
    
    sort_mode = (sort_mode or 'relevance').strip().lower()
    if sort_mode not in ('relevance', 'citations', 'date'):
        sort_mode = 'relevance'

    sort_param = 'relevance_score:desc' if sort_mode == 'relevance' else 'cited_by_count:desc' if sort_mode == 'citations' else 'publication_date:desc'

    params = {
        'search': search_query,
        'per_page': limit,
        'sort': sort_param,
        'mailto': os.environ.get('OPENALEX_MAILTO', 'your-email@example.com')
    }

    # Optional filters for more specific searches
    filters: List[str] = []
    from_year_i = None
    to_year_i = None
    min_citations_i = None
    try:
        if from_year is not None and str(from_year).strip() != '':
            from_year_i = int(from_year)
    except Exception:
        from_year_i = None
    try:
        if to_year is not None and str(to_year).strip() != '':
            to_year_i = int(to_year)
    except Exception:
        to_year_i = None
    try:
        if min_citations is not None and str(min_citations).strip() != '':
            min_citations_i = int(min_citations)
    except Exception:
        min_citations_i = None

    if from_year_i is not None:
        filters.append(f"from_publication_date:{from_year_i}-01-01")
    if to_year_i is not None:
        filters.append(f"to_publication_date:{to_year_i}-12-31")
    if min_citations_i is not None:
        filters.append(f"cited_by_count:>{min_citations_i}")

    concept_ids_n = normalize_concept_ids(concept_ids or [])
    if concept_ids_n:
        # OR-match any of the concepts.
        # OpenAlex filter syntax supports OR within a single filter via '|'.
        filters.append(f"concept.id:{'|'.join(concept_ids_n)}")

    if filters:
        params['filter'] = ','.join(filters)
    
    response = requests.get(base_url, params=params, headers={'User-Agent': DEFAULT_USER_AGENT}, timeout=SEARCH_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    
    data = response.json()
    results = data.get('results', [])
    
    # Format papers
    formatted_papers = []
    for work in results:
        # Get first author
        authors = []
        for authorship in work.get('authorships', [])[:5]:  # Limit to 5 authors
            author = authorship.get('author', {})
            if author.get('display_name'):
                authors.append(author['display_name'])
        
        # Get open access PDF
        pdf_url = None
        open_access = work.get('open_access', {})
        if open_access.get('is_oa') and open_access.get('oa_url'):
            pdf_url = open_access['oa_url']
        
        # OpenAlex returns abstract as inverted index - convert it to readable text
        abstract_text = None
        abstract_inverted = work.get('abstract_inverted_index')
        if abstract_inverted and isinstance(abstract_inverted, dict):
            try:
                # Reconstruct abstract from inverted index
                word_positions = []
                for word, positions in abstract_inverted.items():
                    for pos in positions:
                        word_positions.append((pos, word))
                word_positions.sort(key=lambda x: x[0])
                abstract_text = ' '.join([word for _, word in word_positions])
            except Exception:
                abstract_text = None
        
        formatted_papers.append({
            'paperId': work.get('id', '').split('/')[-1],  # Extract ID from URL
            'title': work.get('title'),
            'abstract': abstract_text,
            'authors': authors,
            'year': work.get('publication_year'),
            'citationCount': int(work.get('cited_by_count', 0) or 0),
            'publicationDate': work.get('publication_date'),
            'venue': work.get('primary_location', {}).get('source', {}).get('display_name'),
            'url': work.get('id'),
            'doi': work.get('doi'),
            'pdfUrl': pdf_url,
            'source': 'OpenAlex'
        })
    
    return formatted_papers


def search_arxiv(query: str, limit: int) -> List[Dict[str, Any]]:
    """
    Search papers using arXiv API
    http://arxiv.org/help/api/
    """
    base_url = "https://export.arxiv.org/api/query"
    
    params = {
        'search_query': f'all:{query}',
        'start': 0,
        'max_results': limit,
        'sortBy': 'relevance',
        'sortOrder': 'descending'
    }
    
    response = requests.get(base_url, params=params, headers={'User-Agent': DEFAULT_USER_AGENT}, timeout=SEARCH_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    
    # Parse XML response
    import xml.etree.ElementTree as ET
    root = ET.fromstring(response.content)
    
    # Namespace handling
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    formatted_papers = []
    for entry in root.findall('atom:entry', ns):
        # Extract authors
        authors = [author.find('atom:name', ns).text for author in entry.findall('atom:author', ns)]
        
        # Extract arxiv ID from ID URL
        paper_id = entry.find('atom:id', ns).text.split('/abs/')[-1]
        
        # Get publication date
        published = entry.find('atom:published', ns).text[:4]  # Year only
        
        # PDF URL
        pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
        
        formatted_papers.append({
            'paperId': paper_id,
            'title': entry.find('atom:title', ns).text.strip(),
            'abstract': entry.find('atom:summary', ns).text.strip(),
            'authors': authors,
            'year': int(published),
            'publicationDate': entry.find('atom:published', ns).text[:10],
            'venue': 'arXiv',
            'url': entry.find('atom:id', ns).text,
            'doi': None,
            'pdfUrl': pdf_url,
            'source': 'arXiv'
        })
    
    return formatted_papers


def search_semantic_scholar(query: str, field: str, limit: int) -> List[Dict[str, Any]]:
    """
    Search papers using Semantic Scholar API
    https://api.semanticscholar.org/api-docs/
    """
    base_url = "https://api.semanticscholar.org/graph/v1/paper/search"
    
    # Build query
    search_query = query
    if field:
        search_query = f"{query} {field}"
    
    params = {
        'query': search_query,
        'limit': limit,
        'fields': 'paperId,title,abstract,authors,year,citationCount,publicationDate,venue,url,openAccessPdf'
    }
    
    headers = {'Accept': 'application/json', 'User-Agent': DEFAULT_USER_AGENT}
    
    # Add API key if available
    api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
    if api_key:
        headers['x-api-key'] = api_key
    
    response = requests.get(base_url, params=params, headers=headers, timeout=SEARCH_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    
    data = response.json()
    papers = data.get('data', [])
    
    # Format papers
    formatted_papers = []
    for paper in papers:
        formatted_papers.append({
            'paperId': paper.get('paperId'),
            'title': paper.get('title'),
            'abstract': paper.get('abstract'),
            'authors': [author.get('name') for author in paper.get('authors', [])],
            'year': paper.get('year'),
            'citationCount': paper.get('citationCount', 0),
            'publicationDate': paper.get('publicationDate'),
            'venue': paper.get('venue'),
            'url': paper.get('url'),
            'doi': None,  # Not provided by default
            'pdfUrl': paper.get('openAccessPdf', {}).get('url') if paper.get('openAccessPdf') else None,
            'source': 'Semantic Scholar'
        })
    
    return formatted_papers


def search_crossref(
    query: str,
    field: str,
    limit: int,
    *,
    from_year: Any = None,
    to_year: Any = None,
    sort_mode: str = 'relevance',
) -> List[Dict[str, Any]]:
    """Search papers using Crossref API for broad cross-discipline coverage."""
    base_url = "https://api.crossref.org/works"
    search_query = query
    if field:
        search_query = f"{query} {field}"

    sort_mode = (sort_mode or 'relevance').strip().lower()
    if sort_mode not in {'relevance', 'citations', 'date'}:
        sort_mode = 'relevance'
    sort_param = 'relevance' if sort_mode == 'relevance' else 'is-referenced-by-count' if sort_mode == 'citations' else 'published'

    filters: List[str] = []
    try:
        if from_year is not None and str(from_year).strip() != '':
            filters.append(f"from-pub-date:{int(from_year)}-01-01")
    except Exception:
        pass
    try:
        if to_year is not None and str(to_year).strip() != '':
            filters.append(f"until-pub-date:{int(to_year)}-12-31")
    except Exception:
        pass

    params: Dict[str, Any] = {
        'query.bibliographic': search_query,
        'rows': limit,
        'sort': sort_param,
        'order': 'desc',
        'select': 'DOI,title,author,issued,container-title,URL,is-referenced-by-count',
        'mailto': os.environ.get('CROSSREF_MAILTO', os.environ.get('OPENALEX_MAILTO', 'your-email@example.com')),
    }
    if filters:
        params['filter'] = ','.join(filters)

    response = requests.get(base_url, params=params, headers={'User-Agent': DEFAULT_USER_AGENT}, timeout=SEARCH_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()

    data = response.json() or {}
    items = (((data.get('message') or {}).get('items')) or [])
    formatted_papers: List[Dict[str, Any]] = []
    for item in items:
        title_list = item.get('title') or []
        container_titles = item.get('container-title') or []
        issued = item.get('issued') or {}
        date_parts = issued.get('date-parts') or []
        year = None
        if date_parts and isinstance(date_parts, list) and date_parts[0]:
            try:
                year = int(date_parts[0][0])
            except Exception:
                year = None
        authors: List[str] = []
        for a in item.get('author', []) or []:
            family = (a.get('family') or '').strip()
            given = (a.get('given') or '').strip()
            name = f"{given} {family}".strip()
            if name:
                authors.append(name)
        doi = (item.get('DOI') or '').strip().lower()
        formatted_papers.append({
            'paperId': doi.replace('/', '_') if doi else '',
            'title': title_list[0] if title_list else None,
            'abstract': None,
            'authors': authors,
            'year': year,
            'citationCount': safe_int(item.get('is-referenced-by-count'), 0),
            'publicationDate': f"{year}-01-01" if year else None,
            'venue': container_titles[0] if container_titles else None,
            'url': item.get('URL'),
            'doi': doi or None,
            'pdfUrl': None,
            'source': 'Crossref',
        })
    return formatted_papers


def deduplicate_papers(papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate papers based on DOI or title similarity.

    If duplicates exist, keep the best record (prefer higher citations, richer metadata, earlier _rank).
    """

    def norm_title(t: str) -> str:
        t = t or ''
        t = ''.join(c.lower() for c in t if c.isalnum() or c.isspace())
        return ' '.join(t.split())

    def score(p: Dict[str, Any]) -> Tuple[int, int, int, int]:
        citations = int(p.get('citationCount', 0) or 0)
        has_abstract = 1 if p.get('abstract') else 0
        has_pdf = 1 if p.get('pdfUrl') else 0
        rank = int(p.get('_rank', 10**9) or 10**9)
        # Higher is better for first three; lower is better for rank (so negate it)
        return (citations, has_abstract, has_pdf, -rank)

    def merge_source_lists(a: Dict[str, Any], b: Dict[str, Any]) -> List[str]:
        merged: List[str] = []
        for src in [*(a.get('sources') or [a.get('source')]), *(b.get('sources') or [b.get('source')])]:
            src_s = (src or '').strip()
            if src_s and src_s not in merged:
                merged.append(src_s)
        return merged

    by_key: Dict[str, Dict[str, Any]] = {}

    for p in papers:
        doi = (p.get('doi') or '').strip().lower()
        key = None
        if doi:
            key = f"doi:{doi}"
        else:
            title = norm_title(p.get('title', ''))
            if title:
                key = f"title:{title}"

        if not key:
            # No usable key; keep as-is
            by_key[f"anon:{id(p)}"] = p
            continue

        existing = by_key.get(key)
        if not existing:
            p['sources'] = merge_source_lists({}, p)
            by_key[key] = p
            continue

        merged_sources = merge_source_lists(existing, p)
        if score(p) > score(existing):
            # Preserve earliest rank across representations
            if existing.get('_rank') is not None and p.get('_rank') is not None:
                p['_rank'] = min(int(existing['_rank']), int(p['_rank']))
            if existing.get('_sourceRank') is not None and p.get('_sourceRank') is not None:
                p['_sourceRank'] = min(int(existing['_sourceRank']), int(p['_sourceRank']))
            p['sources'] = merged_sources
            by_key[key] = p
        else:
            # Still preserve earliest rank
            if existing.get('_rank') is not None and p.get('_rank') is not None:
                existing['_rank'] = min(int(existing['_rank']), int(p['_rank']))
            if existing.get('_sourceRank') is not None and p.get('_sourceRank') is not None:
                existing['_sourceRank'] = min(int(existing['_sourceRank']), int(p['_sourceRank']))
            existing['sources'] = merged_sources

    return list(by_key.values())


def attach_rank(papers: List[Dict[str, Any]], start_rank: int, source_name: str) -> Tuple[List[Dict[str, Any]], int]:
    rank = start_rank
    for idx, p in enumerate(papers):
        p['_rank'] = rank
        p['_sourceRank'] = idx
        if not p.get('source'):
            p['source'] = source_name
        rank += 1
    return papers, rank


def enrich_arxiv_with_semantic_scholar(papers: List[Dict[str, Any]], max_to_enrich: int = 10) -> List[Dict[str, Any]]:
    """Fill in citationCount for arXiv items (when possible) using Semantic Scholar.

    This helps avoid showing misleading 0 citations for arXiv results.
    """
    if not papers:
        return []

    def canonicalize_arxiv_id(arxiv_id: str) -> str:
        arxiv_id = (arxiv_id or '').strip()
        if not arxiv_id:
            return ''
        # Remove version suffix (e.g., 2401.01234v2 -> 2401.01234)
        arxiv_id = re.sub(r'v\d+$', '', arxiv_id)
        return arxiv_id

    enriched: List[Dict[str, Any]] = []
    for p in papers[:max_to_enrich]:
        paper_id = (p.get('paperId') or '').strip()
        if not paper_id:
            enriched.append(p)
            continue

        try:
            canonical_id = canonicalize_arxiv_id(paper_id)
            if canonical_id:
                paper_ref = f"arXiv:{canonical_id}"
            else:
                paper_ref = f"arXiv:{paper_id}"

            url = f"https://api.semanticscholar.org/graph/v1/paper/{quote(paper_ref, safe='')}"
            fields = 'citationCount,year,venue,url,openAccessPdf'
            headers = {'Accept': 'application/json', 'User-Agent': DEFAULT_USER_AGENT}
            api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
            if api_key:
                headers['x-api-key'] = api_key

            resp = requests.get(url, params={'fields': fields}, headers=headers, timeout=min(SEARCH_HTTP_TIMEOUT_SECONDS, 12))
            if resp.status_code != 200 and canonical_id and canonical_id != paper_id:
                # If the canonical form fails, try the original (some APIs may accept the versioned ID).
                paper_ref2 = f"arXiv:{paper_id}"
                url2 = f"https://api.semanticscholar.org/graph/v1/paper/{quote(paper_ref2, safe='')}"
                resp = requests.get(url2, params={'fields': fields}, headers=headers, timeout=min(SEARCH_HTTP_TIMEOUT_SECONDS, 12))

            if resp.status_code == 200:
                data = resp.json() or {}
                cc = data.get('citationCount')
                if cc is not None:
                    p['citationCount'] = int(cc or 0)
                # prefer Semantic Scholar URL if arXiv URL missing
                if not p.get('url') and data.get('url'):
                    p['url'] = data.get('url')
                # some arXiv items may get better venue
                if p.get('venue') == 'arXiv' and data.get('venue'):
                    p['venue'] = data.get('venue')
                if not p.get('year') and data.get('year'):
                    p['year'] = data.get('year')
                oap = data.get('openAccessPdf')
                if not p.get('pdfUrl') and isinstance(oap, dict) and oap.get('url'):
                    p['pdfUrl'] = oap.get('url')
            enriched.append(p)
        except Exception:
            enriched.append(p)

    # Append any remaining without enrichment attempts
    if len(papers) > max_to_enrich:
        enriched.extend(papers[max_to_enrich:])
    return enriched


def relevance_rank_with_source_diversity(papers: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """Rank by relevance while interleaving sources to reduce source-order bias."""
    if not papers:
        return []

    current_year = datetime.now().year
    buckets: Dict[str, List[Dict[str, Any]]] = {}

    for paper in papers:
        source_rank = safe_int(paper.get('_sourceRank'), safe_int(paper.get('_rank'), 10**6))
        citations = max(0, safe_int(paper.get('citationCount'), 0))
        year = safe_int(paper.get('year'), 0)
        has_abstract = 1 if (paper.get('abstract') or '').strip() else 0
        has_pdf = 1 if (paper.get('pdfUrl') or '').strip() else 0

        base_rank_score = 1.0 / (1.0 + float(source_rank))
        citation_score = min(math.log1p(float(citations)) / 8.0, 0.6)
        if year > 0:
            age = max(0, current_year - year)
            recency_score = max(0.0, 1.0 - (min(age, 40) / 40.0)) * 0.25
        else:
            recency_score = 0.0
        metadata_score = (0.15 * has_abstract) + (0.05 * has_pdf)
        paper['_relevanceScore'] = round(base_rank_score + citation_score + recency_score + metadata_score, 6)

        source = (paper.get('source') or 'Unknown').strip() or 'Unknown'
        buckets.setdefault(source, []).append(paper)

    for source_name in buckets:
        buckets[source_name].sort(
            key=lambda p: (float(p.get('_relevanceScore', 0.0)), -safe_int(p.get('_sourceRank'), safe_int(p.get('_rank'), 10**6))),
            reverse=True,
        )

    source_order = sorted(
        buckets.keys(),
        key=lambda s: (len(buckets[s]), max(float(p.get('_relevanceScore', 0.0)) for p in buckets[s])),
        reverse=True,
    )

    ranked: List[Dict[str, Any]] = []
    while len(ranked) < limit:
        progressed = False
        for source_name in source_order:
            bucket = buckets[source_name]
            if not bucket:
                continue
            ranked.append(bucket.pop(0))
            progressed = True
            if len(ranked) >= limit:
                break
        if not progressed:
            break

    return ranked


def source_counts(papers: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for p in papers:
        source = (p.get('source') or 'Unknown').strip() or 'Unknown'
        counts[source] = counts.get(source, 0) + 1
    return counts


def apply_filters(papers: List[Dict[str, Any]], from_year=None, to_year=None, min_citations=None) -> List[Dict[str, Any]]:
    """Apply year/citation filters in a source-agnostic way."""
    if not papers:
        return []

    try:
        from_year_i = int(from_year) if from_year is not None and str(from_year).strip() != '' else None
    except Exception:
        from_year_i = None
    try:
        to_year_i = int(to_year) if to_year is not None and str(to_year).strip() != '' else None
    except Exception:
        to_year_i = None
    try:
        min_citations_i = int(min_citations) if min_citations is not None and str(min_citations).strip() != '' else None
    except Exception:
        min_citations_i = None

    filtered = []
    for p in papers:
        year = p.get('year')
        if year is not None:
            try:
                year = int(year)
            except Exception:
                year = None

        if from_year_i is not None and year is not None and year < from_year_i:
            continue
        if to_year_i is not None and year is not None and year > to_year_i:
            continue

        if min_citations_i is not None:
            try:
                c = int(p.get('citationCount', 0) or 0)
            except Exception:
                c = 0
            if c < min_citations_i:
                continue

        filtered.append(p)

    return filtered


def generate_search_summary(query: str, papers: List[Dict[str, Any]], sources: List[str]) -> Dict[str, Any]:
    """
    Generate AI-powered summary of search results using OpenAI
    """
    if not papers:
        return {
            "overview": f"No papers found for '{query}'.",
            "key_themes": [],
            "top_cited": None,
            "date_range": None
        }
    
    # Extract metadata
    total_citations = sum(p.get('citationCount', 0) for p in papers)
    years = [p.get('year') for p in papers if p.get('year')]
    venues = [p.get('venue') for p in papers if p.get('venue')]
    
    # Top cited paper
    top_paper = max(papers, key=lambda p: p.get('citationCount', 0))
    
    # Basic summary (fallback)
    basic_summary = {
        "overview": f"Found {len(papers)} papers on '{query}' from {', '.join(sources)}. Total {total_citations:,} citations across results.",
        "key_themes": list(set(venues[:5])) if venues else [],
        "research_trends": (
            f"Results span {min(years)}-{max(years)}; consider sorting by date to emphasize recent work. "
            f"If many results are preprints (e.g., arXiv), validate impact via downstream citations and venue quality." if years else
            "Consider sorting by date for recency and screening by venue and citations for impact."
        ),
        "emerging_subtopics": [],
        "open_questions": [],
        "recommended_next_queries": [
            f"{query} survey",
            f"{query} benchmark",
            f"{query} open problems",
        ],
        "screening_advice": "For recency: set fromYear to the last 2-3 years and sort=date. For impact: set minCitations and sort=citations. Use topic/concepts to narrow scope.",
        "top_cited": {
            "title": top_paper.get('title'),
            "citations": top_paper.get('citationCount', 0),
            "year": top_paper.get('year')
        },
        "date_range": f"{min(years)}-{max(years)}" if years and len(years) > 1 else str(years[0]) if years else "Unknown"
    }
    
    # Try OpenAI for smarter summary
    api_key = os.environ.get('OPENAI_API_KEY')
    model = (os.environ.get('OPENAI_MODEL') or 'gpt-4o-mini').strip()
    print(f"OpenAI API key present: {bool(api_key)}")
    if not api_key:
        print("No OPENAI_API_KEY - returning basic summary")
        return {
            **basic_summary,
            '_meta': {
                'usedAI': False,
                'hasOpenAIKey': False,
            }
        }
    
    try:
        # Build context from top papers
        papers_context = []
        for i, paper in enumerate(papers[:8], 1):
            papers_context.append(
                f"{i}. {paper.get('title')} ({paper.get('year')}, {int(paper.get('citationCount', 0) or 0)} citations, {paper.get('venue') or 'Unknown venue'})"
            )
        
        prompt = f"""Analyze these search results for the query: "{query}"

Top papers found:
{chr(10).join(papers_context)}

Total papers: {len(papers)}
Sources: {', '.join(sources)}

Provide ONLY a valid JSON object with:
{{
    "overview": "4-6 sentences. Summarize the current landscape, and clearly distinguish older foundational work vs recent directions.",
    "key_themes": ["theme 1", "theme 2", "theme 3", "theme 4", "theme 5"],
    "research_trends": "4-6 sentences on trends, what is accelerating, and what appears mature.",
    "emerging_subtopics": ["subtopic 1", "subtopic 2", "subtopic 3"],
    "open_questions": ["open question 1", "open question 2", "open question 3"],
    "recommended_next_queries": ["a more specific query to try", "another query"],
    "screening_advice": "2-3 sentences on how to filter/screen for high relevance and recency (e.g., set fromYear/toYear, sort=date, minCitations)."
}}

Be insightful and specific to the actual papers found."""

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
        }
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are an expert research analyst. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "max_tokens": 700,
            "response_format": { "type": "json_object" }
        }
        
        # Keep this fairly short; the overall search endpoint should be responsive
        # even if OpenAI is slow/unavailable (we fall back to basic_summary).
        response = requests.post(url, headers=headers, json=payload, timeout=12)
        if response.status_code >= 400:
            # Some models/accounts reject response_format or specific models.
            # Retry once without response_format.
            try:
                payload2 = dict(payload)
                payload2.pop('response_format', None)
                response2 = requests.post(url, headers=headers, json=payload2, timeout=12)
                response2.raise_for_status()
                result = response2.json()
            except Exception as retry_e:
                raise Exception(f"OpenAI error {response.status_code}: {response.text[:400]} | retry failed: {str(retry_e)}")
        else:
            result = response.json()

        content = (((result or {}).get('choices') or [{}])[0].get('message') or {}).get('content')
        if not content:
            raise Exception("OpenAI response missing content")

        try:
            ai_summary = json.loads(content)
        except Exception:
            # Best-effort: extract the first JSON object from text
            m = re.search(r'\{[\s\S]*\}', content)
            if not m:
                raise
            ai_summary = json.loads(m.group(0))
        
        # Merge AI summary with basic stats
        return {
            **ai_summary,
            "top_cited": basic_summary["top_cited"],
            "date_range": basic_summary["date_range"],
            "total_citations": total_citations,
            "_meta": {
                'usedAI': True,
                'hasOpenAIKey': True,
                'model': model,
            }
        }
        
    except Exception as e:
        print(f"Error generating AI search summary: {str(e)}")
        return {
            **basic_summary,
            '_meta': {
                'usedAI': False,
                'hasOpenAIKey': bool(api_key),
                'model': model,
                'error': str(e),
            }
        }


def _deep_overview_cache_key(cache_key: str) -> str:
    return f"{cache_key}:deep_overview"


def check_deep_overview_cache(cache_key: str) -> Optional[Dict[str, Any]]:
    """Check DynamoDB for a cached deep overview (short TTL; expensive to generate)."""
    try:
        if not dynamodb:
            return None
        table = dynamodb.Table(table_name)
        response = table.get_item(Key={'searchKey': _deep_overview_cache_key(cache_key)})
        item = response.get('Item')
        if not item:
            return None
        cache_time = datetime.fromisoformat(item['timestamp'])
        age_seconds = (datetime.now() - cache_time).total_seconds()
        if age_seconds > DEEP_OVERVIEW_TTL_SECONDS:
            return None
        return item.get('deep_overview')
    except Exception as e:
        print(f"Deep overview cache check error: {str(e)}")
        return None


def cache_deep_overview(cache_key: str, deep_overview: Dict[str, Any]):
    try:
        if not dynamodb:
            return
        table = dynamodb.Table(table_name)
        now = datetime.now()
        table.put_item(Item={
            'searchKey': _deep_overview_cache_key(cache_key),
            'timestamp': now.isoformat(),
            'deep_overview': deep_overview,
            'ttl': int(now.timestamp()) + DEEP_OVERVIEW_TTL_SECONDS,
        })
    except Exception as e:
        print(f"Deep overview cache write error: {str(e)}")


def generate_deep_overview(
    query: str,
    papers: List[Dict[str, Any]],
    *,
    max_papers: Any = None,
    cache_key: Optional[str] = None,
    force_refresh: bool = False,
) -> Optional[Dict[str, Any]]:
    """Generate an in-depth, 1-page overview of all returned papers.

    Important: this summarizes titles/abstracts/metadata we already have. It does not download/parse PDFs.
    """
    if not papers:
        return {
            'mode': 'deep',
            'one_page_summary': f"No papers available to summarize for '{query}'.",
            '_meta': {'usedAI': False, 'reason': 'no_papers'}
        }

    try:
        max_papers_i = int(max_papers) if max_papers is not None and str(max_papers).strip() != '' else None
    except Exception:
        max_papers_i = None

    selected = papers
    if max_papers_i is not None and max_papers_i > 0:
        selected = papers[:min(len(papers), max_papers_i)]
    else:
        selected = papers[:min(len(papers), 20)]

    if cache_key and not force_refresh:
        cached = check_deep_overview_cache(cache_key)
        if cached:
            cached = decimal_to_number(cached)
            cached['_meta'] = {**(cached.get('_meta') or {}), 'cached': True}
            return cached

    api_key = os.environ.get('OPENAI_API_KEY')
    model = (os.environ.get('OPENAI_MODEL') or 'gpt-4o-mini').strip()
    if not api_key:
        return {
            'mode': 'deep',
            'one_page_summary': (
                "Deep overview requires OpenAI. Set OPENAI_API_KEY in the search Lambda to enable it. "
                "This overview is generated from paper titles/abstracts, not full PDFs."
            ),
            '_meta': {'usedAI': False, 'hasOpenAIKey': False}
        }

    # Build compact but information-rich context. Truncate abstracts to keep request bounded.
    items: List[str] = []
    for i, p in enumerate(selected, 1):
        title = (p.get('title') or '').strip()
        year = p.get('year')
        venue = (p.get('venue') or '').strip()
        authors = p.get('authors') or []
        a = ', '.join([x for x in authors[:3] if x])
        abstract = (p.get('abstract') or '').strip()
        if abstract and len(abstract) > 1200:
            abstract = abstract[:1200].rstrip() + '…'
        items.append(
            f"Paper {i}: {title}\n"
            f"Year: {year}\n"
            f"Venue: {venue}\n"
            f"Authors: {a}\n"
            f"Citations: {int(p.get('citationCount', 0) or 0)}\n"
            f"Abstract: {abstract if abstract else '[no abstract]'}\n"
        )

    prompt = (
        "You are writing an in-depth, one-page literature overview for a user. "
        "You MUST base your answer strictly on the provided paper metadata and abstracts. "
        "If abstracts are missing, state uncertainty.\n\n"
        f"User query: {query}\n"
        f"Number of papers provided: {len(selected)}\n\n"
        "Papers:\n"
        + "\n".join(items)
        + "\n\n"
        "Return ONLY valid JSON with this schema:\n"
        "{\n"
        "  \"mode\": \"deep\",\n"
        "  \"one_page_summary\": \"~1 page of dense but readable prose (use paragraphs, no markdown headings)\",\n"
        "  \"key_claims\": [\"...\"],\n"
        "  \"points_of_disagreement\": [\"...\"],\n"
        "  \"evidence_types\": [\"theoretical\"|\"empirical\"|\"historical\"|\"simulation\"|\"survey\"|\"other\"],\n"
        "  \"recommended_reading_order\": [\"Paper 1: ...\", \"Paper 2: ...\"],\n"
        "  \"what_to_search_next\": [\"...\"],\n"
        "  \"limitations\": \"Short note about missing abstracts / incomplete coverage.\"\n"
        "}\n"
    )

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a careful research assistant. Output JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 1400,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=25)
        if resp.status_code >= 400:
            payload2 = dict(payload)
            payload2.pop('response_format', None)
            resp2 = requests.post(url, headers=headers, json=payload2, timeout=25)
            resp2.raise_for_status()
            result = resp2.json()
        else:
            result = resp.json()

        content = (((result or {}).get('choices') or [{}])[0].get('message') or {}).get('content')
        if not content:
            raise Exception('OpenAI response missing content')

        try:
            deep = json.loads(content)
        except Exception:
            m = re.search(r'\{[\s\S]*\}', content)
            if not m:
                raise
            deep = json.loads(m.group(0))

        if isinstance(deep, dict):
            deep['_meta'] = {
                'usedAI': True,
                'hasOpenAIKey': True,
                'model': model,
                'cached': False,
                'papersUsed': len(selected),
            }
            if cache_key:
                cache_deep_overview(cache_key, deep)
        return deep
    except Exception as e:
        print(f"Error generating deep overview: {str(e)}")
        return {
            'mode': 'deep',
            'one_page_summary': (
                "Failed to generate deep overview. You can retry, or reduce paper count. "
                "This overview is generated from abstracts/metadata only (not full PDFs)."
            ),
            '_meta': {
                'usedAI': False,
                'hasOpenAIKey': bool(api_key),
                'model': model,
                'error': str(e),
                'papersUsed': len(selected),
            }
        }


def check_cache(cache_key: str) -> Optional[List[Dict[str, Any]]]:
    """Check DynamoDB cache for recent results"""
    try:
        if not dynamodb:
            return None
        table = dynamodb.Table(table_name)
        
        response = table.get_item(Key={'searchKey': cache_key})
        
        if 'Item' in response:
            item = response['Item']
            # Cache valid for 7 days
            cache_time = datetime.fromisoformat(item['timestamp'])
            if (datetime.now() - cache_time).days < 7:
                return item.get('papers', [])
        
        return None
    except Exception as e:
        print(f"Cache check error: {str(e)}")
        return None


def cache_results(cache_key: str, papers: List[Dict[str, Any]]):
    """Cache search results in DynamoDB"""
    try:
        if not dynamodb:
            return
        table = dynamodb.Table(table_name)
        
        table.put_item(Item={
            'searchKey': cache_key,
            'timestamp': datetime.now().isoformat(),
            'papers': papers,
            'ttl': int(datetime.now().timestamp()) + (7 * 24 * 60 * 60)  # 7 days
        })
    except Exception as e:
        print(f"Cache write error: {str(e)}")


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        'body': json.dumps(body)
    }
