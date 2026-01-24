"""
Local test script for Lambda function
Run this to test the function before deploying to AWS
"""

import json
import sys
import os

# Add lambda directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lambda', 'search_papers'))

# Mock environment variables
os.environ['DYNAMODB_TABLE'] = 'academic-papers-cache'

# Import after setting env
from lambda_function import lambda_handler

def test_search():
    """Test the search functionality"""
    
    # Mock event from API Gateway
    event = {
        'body': json.dumps({
            'query': 'quantum machine learning',
            'limit': 5
        })
    }
    
    context = {}  # Lambda context not needed for basic test
    
    print("Testing Lambda function locally...")
    print(f"Query: quantum machine learning")
    print("=" * 50)
    
    try:
        response = lambda_handler(event, context)
        
        print(f"Status Code: {response['statusCode']}")
        
        if response['statusCode'] == 200:
            body = json.loads(response['body'])
            print(f"\nFound {body['count']} papers")
            print(f"Cached: {body.get('cached', False)}")
            
            print("\nFirst 3 papers:")
            for i, paper in enumerate(body['papers'][:3], 1):
                print(f"\n{i}. {paper['title']}")
                print(f"   Authors: {', '.join(paper['authors'][:3])}")
                print(f"   Year: {paper['year']}")
                print(f"   Citations: {paper['citationCount']}")
                print(f"   URL: {paper['url']}")
        else:
            print(f"Error: {response['body']}")
            
    except Exception as e:
        print(f"Error during test: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_search()
