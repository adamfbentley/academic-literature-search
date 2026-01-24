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
        
        if not title or not abstract:
            return create_response(400, {'error': 'Title and abstract are required'})
        
        # Check cache first
        cached_summary = check_cache(paper_id)
        if cached_summary:
            return create_response(200, {
                'summary': cached_summary,
                'cached': True
            })
        
        # Generate AI summary
        summary = generate_summary(title, abstract)
        
        # Cache the summary
        if paper_id:
            cache_summary(paper_id, summary)
        
        return create_response(200, {
            'summary': summary,
            'cached': False
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def generate_summary(title: str, abstract: str) -> Dict[str, Any]:
    """
    Generate AI summary using OpenAI API
    """
    api_key = os.environ.get('OPENAI_API_KEY')
    
    if not api_key:
        # Fallback: Return structured extraction from abstract
        return extract_simple_summary(title, abstract)
    
    # OpenAI API call
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    prompt = f"""Analyze this academic paper and provide a structured summary:

Title: {title}

Abstract: {abstract}

Provide a JSON response with these fields:
- key_findings: List of 2-3 main findings (array of strings)
- methodology: Brief description of research method (string)
- significance: Why this research matters (string)
- limitations: Potential limitations if mentioned (string or "Not specified")

Keep each point concise (1-2 sentences max)."""

    payload = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {"role": "system", "content": "You are an expert academic researcher who summarizes papers clearly and concisely."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 500
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        summary_text = result['choices'][0]['message']['content']
        
        # Try to parse as JSON, fallback to text
        try:
            summary_json = json.loads(summary_text)
            return summary_json
        except:
            return {
                "key_findings": [summary_text],
                "methodology": "See abstract",
                "significance": "Academic research contribution",
                "limitations": "Not specified"
            }
            
    except Exception as e:
        print(f"OpenAI API error: {str(e)}")
        return extract_simple_summary(title, abstract)


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
