import json
import os
import boto3
import requests
from datetime import datetime
from typing import Dict, Any

# Initialize AWS services
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE', 'academic-papers-cache')

def lambda_handler(event, context):
    """
    Lambda handler for AI-powered paper summarization
    
    Expected input:
    {
        "paperId": "abc123",
        "title": "Paper title",
        "abstract": "Full abstract text..."
    }
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        paper_id = body.get('paperId', '').strip()
        title = body.get('title', '').strip()
        abstract = body.get('abstract', '').strip()
        force_refresh = bool(body.get('forceRefresh', False))
        debug = bool(body.get('debug', False))
        
        if not title or not abstract:
            return create_response(400, {'error': 'Title and abstract are required'})
        
        # Check cache first
        cached_summary = check_cache(paper_id)
        if cached_summary and not force_refresh:
            return create_response(200, {
                'summary': cached_summary,
                'cached': True,
                **({'meta': {'fromCache': True}} if debug else {})
            })
        
        # Generate AI summary
        summary, meta = generate_summary(title, abstract)
        
        # Cache the summary
        if paper_id:
            cache_summary(paper_id, summary)
        
        return create_response(200, {
            'summary': summary,
            'cached': False,
            **({'meta': meta} if debug else {})
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def generate_summary(title: str, abstract: str):
    """
    Generate AI summary using OpenAI API
    """
    api_key = os.environ.get('OPENAI_API_KEY')
    meta: Dict[str, Any] = {
        'hasOpenAIKey': bool(api_key),
        'usedAI': False,
    }
    
    if not api_key:
        print("No OpenAI API key found - using fallback extraction")
        return extract_simple_summary(title, abstract), meta
    
    print(f"Using OpenAI API key (starts with: {api_key[:10]}...)")
    
    # OpenAI API call
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    prompt = f"""You are an expert academic researcher analyzing a research paper. Extract specific, insightful information from the title and abstract.

Title: {title}

Abstract: {abstract}

Provide ONLY a valid JSON object with exactly these fields:
{{
  "key_findings": ["Specific finding 1 from the abstract", "Specific finding 2 from the abstract", "Specific finding 3 from the abstract"],
  "methodology": "Specific research methods used (be detailed if mentioned)",
  "significance": "Why this research matters and its contributions",
  "limitations": "Study limitations or gaps identified, or 'Not specified in abstract'"
}}

Focus on concrete details from the abstract. If information is not available, say so specifically rather than using generic phrases."""

    payload = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {"role": "system", "content": "You are an expert academic researcher. Always respond with valid JSON only, no markdown formatting."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.4,
        "max_tokens": 600,
        "response_format": { "type": "json_object" }
    }
    
    try:
        print("Calling OpenAI API...")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        print(f"OpenAI response status: {response.status_code}")
        meta['openaiStatus'] = response.status_code
        response.raise_for_status()
        
        result = response.json()
        summary_text = result['choices'][0]['message']['content']
        print(f"OpenAI raw response: {summary_text[:200]}...")
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if summary_text.strip().startswith('```'):
                summary_text = summary_text.strip()
                summary_text = summary_text.split('```')[1]
                if summary_text.startswith('json'):
                    summary_text = summary_text[4:]
            
            summary_json = json.loads(summary_text)
            print("Successfully parsed AI summary")
            meta['usedAI'] = True
            return summary_json, meta
        except json.JSONDecodeError as je:
            print(f"JSON parse error: {str(je)}, raw text: {summary_text}")
            meta['usedAI'] = True
            return {
                "key_findings": [summary_text[:500]],
                "methodology": "See abstract",
                "significance": "Academic research contribution",
                "limitations": "Not specified"
            }, meta
            
    except requests.exceptions.RequestException as req_err:
        print(f"OpenAI API request error: {str(req_err)}")
        if hasattr(req_err, 'response') and req_err.response is not None:
            print(f"Response content: {req_err.response.text}")
        meta['openaiError'] = str(req_err)
        return extract_simple_summary(title, abstract), meta
    except Exception as e:
        print(f"OpenAI API unexpected error: {type(e).__name__}: {str(e)}")
        meta['openaiError'] = f"{type(e).__name__}: {str(e)}"
        return extract_simple_summary(title, abstract), meta


def extract_simple_summary(title: str, abstract: str) -> Dict[str, Any]:
    """
    Fallback: Extract key information without AI API
    """
    # Split abstract into sentences
    sentences = [s.strip() for s in abstract.replace('\n', ' ').split('.') if s.strip()]
    
    # Take first 2-3 sentences as key findings
    key_findings = sentences[:2] if len(sentences) >= 2 else sentences
    
    return {
        "key_findings": key_findings,
        "methodology": "Detailed in full paper",
        "significance": "Academic research contribution in " + title.split(':')[0] if ':' in title else "Academic research contribution",
        "limitations": "Not specified in abstract"
    }


def check_cache(paper_id: str) -> Dict[str, Any] or None:
    """Check DynamoDB cache for existing summary"""
    if not paper_id:
        return None
        
    try:
        table = dynamodb.Table(table_name)
        cache_key = f"summary:{paper_id}"
        
        response = table.get_item(Key={'searchKey': cache_key})
        
        if 'Item' in response:
            item = response['Item']
            # Cache valid for 30 days
            cache_time = datetime.fromisoformat(item['timestamp'])
            if (datetime.now() - cache_time).days < 30:
                return item.get('summary', None)
        
        return None
    except Exception as e:
        print(f"Cache check error: {str(e)}")
        return None


def cache_summary(paper_id: str, summary: Dict[str, Any]):
    """Cache summary in DynamoDB"""
    try:
        table = dynamodb.Table(table_name)
        cache_key = f"summary:{paper_id}"
        
        table.put_item(Item={
            'searchKey': cache_key,
            'timestamp': datetime.now().isoformat(),
            'summary': summary,
            'ttl': int(datetime.now().timestamp()) + (30 * 24 * 60 * 60)  # 30 days
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
