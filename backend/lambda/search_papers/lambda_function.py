import json
import os
import boto3
from datetime import datetime
import requests
from typing import Dict, List, Any
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
    Lambda handler for searching academic papers
    
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
                'cached': True
            })
        
        # Search Semantic Scholar API
        papers = search_semantic_scholar(query, field, limit)
        
        # Cache results
        cache_results(query, field, papers)
        
        return create_response(200, {
            'papers': papers,
            'count': len(papers),
            'cached': False
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


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
    
    headers = {
        'Accept': 'application/json'
    }
    
    # Add API key if available (optional but recommended for higher rate limits)
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
            'pdfUrl': paper.get('openAccessPdf', {}).get('url') if paper.get('openAccessPdf') else None
        })
    
    return formatted_papers


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
        # Non-critical, continue


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',  # Configure properly in production
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        'body': json.dumps(body)
    }
