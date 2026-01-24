# AWS Console Setup Guide

Follow these steps to deploy the paper search Lambda function.

---

## Step 1: Create DynamoDB Table

1. Go to **AWS Console** → Search for **DynamoDB**
2. Click **Create table**
3. Settings:
   - **Table name**: `academic-papers-cache`
   - **Partition key**: `searchKey` (String)
   - **Table settings**: Use default settings (On-demand)
4. Click **Create table**
5. Once created, click the table → **Additional settings** → **Time to Live (TTL)**
   - Enable TTL
   - **TTL attribute name**: `ttl`
   - Save

---

## Step 2: Create IAM Role for Lambda

1. Go to **IAM** → **Roles** → **Create role**
2. Select **AWS service** → **Lambda** → Next
3. Attach permissions policies:
   - `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
   - `AmazonDynamoDBFullAccess` (or create custom policy with Get/Put permissions)
4. Role name: `AcademicLiteratureAI-Lambda-Role`
5. **Create role**

---

## Step 3: Create Lambda Function

1. **Find Lambda service**:
   - In the AWS Console top search bar, type **"Lambda"**
   - Click on **Lambda** (should show "Compute" underneath)
   - OR: From AWS Console home, find **Services** menu → **Compute** → **Lambda**
   - You'll see the Lambda dashboard with "Functions" in the left sidebar

2. **Create function**:
   - Click the orange **Create function** button (top right)
   
3. **Configure function**:
   - Choose **Author from scratch** (should be selected by default)
   - **Function name**: `search-academic-papers`
   - **Runtime**: Python 3.11 (select from dropdown)
   - **Architecture**: x86_64 (default)
   - Under **Permissions**, expand **Change default execution role**:
     - Select **Use an existing role**
     - Choose `AcademicLiteratureAI-Lambda-Role` from dropdown
   
4. Click **Create function** (bottom right)
   - Wait 5-10 seconds for function to be created
   - You'll see "Successfully created the function search-academic-papers"

---

## Step 4: Deploy Lambda Code

### Option A: Manual Upload (Simple)

1. On your computer, navigate to:
   ```
   C:\Users\adamf\Desktop\pp\academic-literature-ai\backend\lambda\search_papers\
   ```

2. Create a deployment package:
   ```powershell
   # In PowerShell
   cd C:\Users\adamf\Desktop\pp\academic-literature-ai\backend\lambda\search_papers
   
   # Install dependencies to a folder
   pip install -r requirements.txt -t .
   
   # Create ZIP file
   Compress-Archive -Path * -DestinationPath lambda_function.zip -Force
   ```

3. In Lambda console:
   - Click **Upload from** → **.zip file**
   - Select `lambda_function.zip`
   - Click **Save**

### Option B: Inline Editor (Quick Test)

1. Copy the contents of `lambda_function.py`
2. In Lambda console → **Code** tab → Paste the code
3. Click **Deploy**
4. Note: You'll need to add the `requests` library via a Lambda Layer or deployment package later

---

## Step 5: Configure Lambda Environment Variables

1. In Lambda console → **Configuration** → **Environment variables**
2. Click **Edit** → **Add environment variable**
3. Add:
   - Key: `DYNAMODB_TABLE`
   - Value: `academic-papers-cache`
4. Optional (for higher rate limits):
   - Key: `SEMANTIC_SCHOLAR_API_KEY`
   - Value: (Get free key from https://www.semanticscholar.org/product/api)
5. Click **Save**

---

## Step 6: Increase Lambda Timeout

1. **Configuration** → **General configuration** → **Edit**
2. Set **Timeout**: `30 seconds` (API calls can take time)
3. Set **Memory**: `512 MB` (recommended)
4. Click **Save**

---

## Step 7: Create API Gateway

API Gateway creates a public HTTP endpoint that will call your Lambda function.

### Part A: Create the API

1. **Find API Gateway**:
   - In AWS Console top search bar, type **"API Gateway"**
   - Click on **API Gateway** (should show "Networking & Content Delivery")
   - You'll see the API Gateway dashboard

2. **Create API**:
   - Click the orange **Create API** button
   - You'll see several API types displayed

3. **Choose REST API**:
   - Find the box labeled **REST API** (NOT REST API Private or HTTP API)
   - Under REST API, click **Build** button
   - A popup appears: "Do you want to create an example API?" → Click **OK** to dismiss

4. **Configure API settings**:
   - **Choose the protocol**: REST (should be selected)
   - **Create new API**: Select **New API** (should be selected by default)
   - **API name**: `academic-literature-api`
   - **Description**: (optional) "API for academic paper search"
   - **Endpoint Type**: Select **Regional** from dropdown
   - Click **Create API** button (bottom right)
   - Wait 3-5 seconds for API to be created

### Part B: Create the /search Resource

You should now see the API Gateway console with "/" (root) selected.

1. **Create Resource**:
   - Click the **Actions** dropdown button (top left, below the API name)
   - Select **Create Resource** from the dropdown
   - A form appears on the right

2. **Configure Resource**:
   - **Resource Name**: `search` (lowercase)
   - **Resource Path**: `/search` (should auto-fill)
   - ✅ Check **Enable API Gateway CORS** box
   - Leave other settings as default
   - Click **Create Resource** button (bottom right)

3. **Verify**:
   - You should now see `/search` in the resource tree on the left
   - It should be highlighted/selected

### Part C: Create POST Method

With `/search` selected in the left panel:

1. **Create Method**:
   - Click **Actions** dropdown again
   - Select **Create Method**
   - A small dropdown appears under `/search` → Select **POST**
   - Click the **✓** checkmark next to POST

2. **Setup POST Method**:
   - A setup form appears on the right
   - **Integration type**: Select **Lambda Function**
   - ✅ Check **Use Lambda Proxy integration** box
   - **Lambda Region**: Should show `ap-southeast-2` (Sydney)
   - **Lambda Function**: Type `search-academic-papers`
     - It should autocomplete/suggest the function name
   - Click **Save** button (bottom right)

3. **Grant Permission**:
   - A popup appears: "Add Permission to Lambda Function"
   - Message: "You are about to give API Gateway permission to invoke your Lambda function..."
   - Click **OK**
   - Wait 2-3 seconds

### Part D: Enable CORS (Important for Frontend)

Still with `/search` selected:

1. **Enable CORS**:
   - Click **Actions** dropdown
   - Select **Enable CORS**
   - A configuration page appears

2. **Configure CORS**:
   - **Access-Control-Allow-Headers**: Should already have default values
   - **Access-Control-Allow-Methods**: Should show OPTIONS, POST
   - Keep all default values
   - Scroll down and click **Enable CORS and replace existing CORS headers** button

3. **Confirm**:
   - A confirmation popup appears showing what will be changed
   - Click **Yes, replace existing values** button
   - Wait for confirmation messages (should see green checkmarks)

### Part E: Deploy the API

Your API is configured but not yet live. You need to deploy it:

1. **Deploy API**:
   - Click **Actions** dropdown
   - Select **Deploy API**
   - A deployment form appears

2. **Configure Deployment**:
   - **Deployment stage**: Select **[New Stage]** from dropdown
   - **Stage name**: `prod` (lowercase)
   - **Stage description**: (optional) "Production deployment"
   - **Deployment description**: (optional) "Initial deployment"
   - Click **Deploy** button

3. **Success**:
   - You'll be redirected to the Stage Editor
   - At the top, you'll see **Invoke URL** in blue
   - Example: `https://abc12345.execute-api.ap-southeast-2.amazonaws.com/prod`

4. **Copy the Invoke URL**:
   - Click on the URL to select it, or click the copy icon next to it
   - **Save this URL** - you'll need it for testing and frontend 
   https://duiovsew3d.execute-api.ap-southeast-2.amazonaws.com/prod
   - Your full endpoint will be: `[Invoke URL]/search`
   - Example: `https://abc12345.execute-api.ap-southeast-2.amazonaws.com/prod/search`

### Part F: Verify API Gateway Setup

Let's make sure everything is connected:

1. **Check Method Execution**:
   - In left sidebar, click **Resources**
   - Click on **POST** under `/search`
   - You should see a diagram showing: **Method Request → Integration Request → Lambda Function → Integration Response → Method Response**
   - This confirms API Gateway is linked to your Lambda

2. **Test from API Gateway** (optional but recommended):
   
   a. **Navigate to Test Interface**:
      - While viewing the POST method execution diagram
      - Click the **Test** button (looks like a lightning bolt icon on the left side of the diagram)
      - A test page appears on the right
   
   b. **Configure Test Request**:
      - **Query Strings**: Leave EMPTY (we don't use query strings for POST)
      - **Headers**: Leave EMPTY or add (optional):
        ```
        Content-Type: application/json
        ```
        (This is actually handled automatically, so you can skip this)
      
      - **Request Body**: Paste this JSON:
        ```json
        {"query": "machine learning", "limit": 3}
        ```
        **Important**: Do NOT wrap it in another JSON object. Just paste exactly as shown above.
   
   c. **Run Test**:
      - Scroll down and click the blue **Test** button at the bottom
      - Wait 5-15 seconds for the function to execute
      - A loading spinner appears
   
   d. **Check Results** (scroll down after test completes):
      - **Request**: Shows what was sent
      - **Response Body**: Should contain JSON with 3 papers about machine learning
      - **Response Headers**: Should include `Content-Type: application/json`
      - **Logs**: Shows execution details
      - **Status**: Should show **200** in green
      - **Latency**: Shows how long the request took (usually 1000-5000ms)
   
   e. **What Success Looks Like**:
      ```json
      {
        "papers": [
          {
            "paperId": "...",
            "title": "...",
            "authors": [...],
            "year": 2024,
            ...
          }
        ],
        "count": 3,
        "cached": false
      }
      ```
   
   f. **Common Test Errors**:
      - **502 Bad Gateway**: Lambda function error - check Lambda logs
      - **403 Forbidden**: Permission issue - check IAM role
      - **Malformed Lambda proxy response**: Lambda didn't return proper format
      - **Execution failed**: Lambda function crashed - check CloudWatch logs

---

---

## Step 8: Test Your Live API Endpoint

Now test the actual API endpoint that you'll use in production.

### Test via PowerShell

1. **Navigate to your Lambda function**:
   - In AWS Console, search for "Lambda"
   - Click on **Functions** in left sidebar
   - Click **search-academic-papers**

2. **Go to Test tab**:
   - At the top of the function page, click the **Test** tab (next to Code and Monitor)

3. **Create a new test event**:
   - Click **Create new event** or **Test** button (if first time)
   - **Event name**: `TestPaperSearch` (or any name you want)
   - Leave **Event sharing settings** as Private
   
4. **Paste the test event JSON**:
   - In the **Event JSON** text box, replace everything with:
   ```json
   {
     "body": "{\"query\": \"quantum computing\", \"limit\": 5}"
   }
   ```
   - This simulates an API Gateway request with a query for "quantum computing"

5. **Run the test**:
   - Click the orange **Test** button (top right)
   - Wait 5-15 seconds for the function to execute

6. **Check the results**:
   - **Execution result**: Should show "succeeded" in green
   - **Response**: Scroll down to see the JSON response with papers
   - **Function logs**: Shows what happened during execution
   - **Duration & Memory**: Shows performance metrics
   
7. **What you should see**:
   - Status code: 200
   - A list of 5 papers about quantum computing with titles, authors, years, etc.
   - If you see an error, check the **Function logs** section for details

Replace `YOUR-API-URL` with your actual Invoke URL from Step 7:

```powershell
# Test with curl
curl -X POST https://YOUR-API-URL/prod/search `
  -H "Content-Type: application/json" `
  -d '{"query": "machine learning physics", "limit": 3}'

# Example with real URL:
# curl -X POST https://abc12345.execute-api.ap-southeast-2.amazonaws.com/prod/search `
#   -H "Content-Type: application/json" `
#   -d '{"query": "machine learning physics", "limit": 3}'
```

**Expected response time**: 3-10 seconds (first time might be slower - cold start)

### Test via Web Browser (Quick Test)

You can also test by creating a simple HTML file:

1. Create a file `test.html` on your desktop:
```html
<!DOCTYPE html>
<html>
<body>
<h2>Test API</h2>
<button onclick="testAPI()">Search Papers</button>
<pre id="result"></pre>

<script>
async function testAPI() {
  const url = 'https://YOUR-API-URL/prod/search';
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query: 'quantum computing', limit: 3})
  });
  const data = await response.json();
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}
</script>
</body>
</html>
```

2. Replace `YOUR-API-URL` with your actual URL
3. Open the HTML file in your browser
4. Click "Search Papers" button
5. Papers should appear below

### Expected Response

```json
{
  "papers": [
    {
      "paperId": "abc123",
      "title": "Machine Learning in Quantum Physics",
      "abstract": "...",
      "authors": ["John Doe", "Jane Smith"],
      "year": 2024,
      "citationCount": 42,
      "url": "https://...",
      "pdfUrl": "https://..."
    }
  ],
  "count": 10,
  "cached": false
}
```

---

## Cost Monitoring

1. Go to **AWS Billing Dashboard**
2. Set up a **Budget** alert:
   - **Budget amount**: $10/month
   - Email notification when 80% reached

---

## Next Steps

Once this is working:
1. ✅ Test with different queries
2. Build the AI summarization Lambda (Phase 2)
3. Build the frontend (Phase 3)
4. Add authentication (Cognito)

---

## Troubleshooting

### "Module not found: requests"
- You need to package dependencies. Use deployment package method in Step 4.

### "AccessDeniedException"
- Check IAM role has DynamoDB permissions

### "Task timed out"
- Increase Lambda timeout in Configuration → General configuration

### API returns 502/500
- Check Lambda CloudWatch logs: Lambda → Monitor → View CloudWatch logs
