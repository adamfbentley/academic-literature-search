import json
import os
import boto3
from datetime import datetime
import requests
from typing import Dict, List, Any
from urllib.parse import quote
from decimal import Decimal

# Initialize AWS services
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE', 'academic-papers-cache')

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
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        query = body.get('query', '').strip()
        field = body.get('field', '')
        limit = min(body.get('limit', 20), 50)  # Cap at 50
        
        if not query:
            return create_response(400, {'error': 'Query parameter is required'})
        
        # Check cache first
        cached_result = check_cache(query, field)
        if cached_result:
            # Convert any Decimal objects from DynamoDB
            cached_result = decimal_to_number(cached_result)
            return create_response(200, {
                'papers': cached_result,
                'count': len(cached_result),
                'cached': True,
                'sources': ['cache'],
                'summary': None  # Cached results don't include summary
            })
        
        # Search multiple sources in parallel
        all_papers = []
        sources_used = []
        
        # 1. OpenAlex (primary - best rate limits)
        try:
            openalex_papers = search_openalex(query, field, limit)
            all_papers.extend(openalex_papers)
            sources_used.append('OpenAlex')
            print(f"OpenAlex returned {len(openalex_papers)} papers")
        except Exception as e:
            print(f"OpenAlex error: {str(e)}")
        
        # 2. arXiv (for preprints in physics/CS/math)
        if len(all_papers) < limit:
            try:
                arxiv_papers = search_arxiv(query, limit - len(all_papers))
                all_papers.extend(arxiv_papers)
                sources_used.append('arXiv')
                print(f"arXiv returned {len(arxiv_papers)} papers")
            except Exception as e:
                print(f"arXiv error: {str(e)}")
        
        # 3. Semantic Scholar (fallback, needs API key for higher limits)
        if len(all_papers) < limit:
            try:
                ss_papers = search_semantic_scholar(query, field, limit - len(all_papers))
                all_papers.extend(ss_papers)
                sources_used.append('Semantic Scholar')
                print(f"Semantic Scholar returned {len(ss_papers)} papers")
            except Exception as e:
                print(f"Semantic Scholar error: {str(e)}")
        
        # Remove duplicates (by DOI or title)
        unique_papers = deduplicate_papers(all_papers)
        
        # Sort by citation count (if available) and year
        unique_papers.sort(key=lambda p: (p.get('citationCount', 0), p.get('year', 0)), reverse=True)
        
        # Limit to requested number
        result_papers = unique_papers[:limit]
        
        # Generate overall summary of the search results
        overall_summary = generate_search_summary(query, result_papers, sources_used)
        
        # Cache results
        cache_results(query, field, result_papers)
        
        return create_response(200, {
            'papers': result_papers,
            'count': len(result_papers),
            'cached': False,
            'sources': sources_used,
            'summary': overall_summary
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def search_openalex(query: str, field: str, limit: int) -> List[Dict[str, Any]]:
    """
    Search papers using OpenAlex API (best free option)
    https://docs.openalex.org/
    """
    base_url = "https://api.openalex.org/works"
    
    # Build query
    search_query = query
    if field:
        search_query = f"{query} {field}"
    
    params = {
        'search': search_query,
        'per_page': limit,
        'sort': 'cited_by_count:desc',
        'mailto': 'your-email@example.com'  # Polite API usage
    }
    
    response = requests.get(base_url, params=params, timeout=30)
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
            'citationCount': work.get('cited_by_count', 0),
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
    base_url = "http://export.arxiv.org/api/query"
    
    params = {
        'search_query': f'all:{query}',
        'start': 0,
        'max_results': limit,
        'sortBy': 'relevance',
        'sortOrder': 'descending'
    }
    
    response = requests.get(base_url, params=params, timeout=30)
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
            'citationCount': 0,  # arXiv doesn't provide citation counts
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
    
    headers = {'Accept': 'application/json'}
    
    # Add API key if available
    api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
    if api_key:
        headers['x-api-key'] = api_key
    
    response = requests.get(base_url, params=params, headers=headers, timeout=30)
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


def deduplicate_papers(papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate papers based on DOI or title similarity"""
    seen_dois = set()
    seen_titles = set()
    unique_papers = []
    
    for paper in papers:
        # Check DOI first (most reliable)
        doi = paper.get('doi')
        if doi:
            doi_clean = doi.lower().strip()
            if doi_clean in seen_dois:
                continue
            seen_dois.add(doi_clean)
        
        # Check title (normalize: lowercase, remove punctuation)
        title = paper.get('title', '')
        if title:
            title_clean = ''.join(c.lower() for c in title if c.isalnum() or c.isspace())
            title_clean = ' '.join(title_clean.split())  # Normalize whitespace
            
            if title_clean in seen_titles:
                continue
            seen_titles.add(title_clean)
        
        unique_papers.append(paper)
    
    return unique_papers


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
        "top_cited": {
            "title": top_paper.get('title'),
            "citations": top_paper.get('citationCount', 0),
            "year": top_paper.get('year')
        },
        "date_range": f"{min(years)}-{max(years)}" if years and len(years) > 1 else str(years[0]) if years else "Unknown"
    }
    
    # Try OpenAI for smarter summary
    api_key = os.environ.get('OPENAI_API_KEY')
    print(f"OpenAI API key present: {bool(api_key)}")
    if not api_key:
        print("No OPENAI_API_KEY - returning basic summary")
        return basic_summary
    
    try:
        # Build context from top 5 papers
        papers_context = []
        for i, paper in enumerate(papers[:5], 1):
            papers_context.append(f"{i}. {paper.get('title')} ({paper.get('year')}, {paper.get('citationCount', 0)} citations)")
        
        prompt = f"""Analyze these search results for the query: "{query}"

Top papers found:
{chr(10).join(papers_context)}

Total papers: {len(papers)}
Sources: {', '.join(sources)}

Provide ONLY a valid JSON object with:
{{
  "overview": "2-3 sentence overview of what these papers collectively reveal about {query}",
  "key_themes": ["theme 1", "theme 2", "theme 3"],
  "research_trends": "1-2 sentences about research direction or trends visible in these results"
}}

Be insightful and specific to the actual papers found."""

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are an expert research analyst. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "max_tokens": 400,
            "response_format": { "type": "json_object" }
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        
        result = response.json()
        ai_summary = json.loads(result['choices'][0]['message']['content'])
        
        # Merge AI summary with basic stats
        return {
            **ai_summary,
            "top_cited": basic_summary["top_cited"],
            "date_range": basic_summary["date_range"],
            "total_citations": total_citations
        }
        
    except Exception as e:
        print(f"Error generating AI search summary: {str(e)}")
        return basic_summary


def check_cache(query: str, field: str) -> List[Dict[str, Any]] or None:
    """Check DynamoDB cache for recent results"""
    try:
        table = dynamodb.Table(table_name)
        cache_key = f"{query}:{field}"
        
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


def cache_results(query: str, field: str, papers: List[Dict[str, Any]]):
    """Cache search results in DynamoDB"""
    try:
        table = dynamodb.Table(table_name)
        cache_key = f"{query}:{field}"
        
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
