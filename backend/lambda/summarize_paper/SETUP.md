# AI Summarization Lambda Setup

## Step 1: Create Lambda Function

1. **AWS Console → Lambda → Create function**
   - Function name: `summarize-academic-paper`
   - Runtime: Python 3.11
   - Architecture: x86_64
   - Execution role: Use existing `AcademicLiteratureAI-Lambda-Role`

2. **Upload Code:**
   - Copy contents of `lambda_function.py`
   - Paste into Lambda console Code tab
   - Click **Deploy**

3. **Add Lambda Layer (requests library):**
   - Configuration → Layers → Add a layer
   - Specify ARN: `arn:aws:lambda:ap-southeast-2:770693421928:layer:Klayers-p311-requests:14`
   - Click **Add**

## Step 2: Configure Environment Variables

1. **Configuration → Environment variables → Edit**
2. Add:
   - Key: `DYNAMODB_TABLE`
   - Value: `academic-papers-cache`
3. **(Optional but recommended)** Add OpenAI API key:
   - Key: `OPENAI_API_KEY`
   - Value: Your OpenAI API key from https://platform.openai.com/api-keys
   - **Note**: Without this, it uses fallback extraction (still works, just less smart)

## Step 3: Increase Timeout

1. **Configuration → General configuration → Edit**
2. Set **Timeout**: `30 seconds`
3. Set **Memory**: `512 MB`
4. Click **Save**

## Step 4: Create API Gateway Endpoint

1. **Go to API Gateway**
2. Select your existing API: `academic-literature-api`
3. **Create Resource:**
   - Actions → Create Resource
   - Resource Name: `summarize`
   - Resource Path: `/summarize`
   - ✅ Enable CORS
   - Create Resource

4. **Create POST Method:**
   - Select `/summarize`
   - Actions → Create Method → POST
   - Integration type: Lambda Function
   - ✅ Use Lambda Proxy integration
   - Lambda Function: `summarize-academic-paper`
   - Save → OK (grant permissions)

5. **Enable CORS:**
   - Actions → Enable CORS
   - Keep defaults
   - Enable CORS and replace

6. **Deploy API:**
   - Actions → Deploy API
   - Deployment stage: `prod`
   - Deploy

## Step 5: Test

**Test in Lambda console:**
```json
{
  "body": "{\"paperId\": \"test123\", \"title\": \"Machine Learning in Healthcare\", \"abstract\": \"This paper presents a novel machine learning approach for disease prediction. We developed a deep learning model that analyzes patient data. Results show 95% accuracy in early detection. Our method outperforms existing techniques.\"}"
}
```

**Test via API:**
```powershell
Invoke-WebRequest -Uri "https://duiovsew3d.execute-api.ap-southeast-2.amazonaws.com/prod/summarize" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"paperId": "test", "title": "Test Paper", "abstract": "This is a test abstract about machine learning research."}'
```

## Expected Response

```json
{
  "summary": {
    "key_findings": [
      "Novel machine learning approach for disease prediction",
      "Deep learning model achieves 95% accuracy in early detection"
    ],
    "methodology": "Deep learning analysis of patient data",
    "significance": "Outperforms existing disease prediction techniques",
    "limitations": "Not specified in abstract"
  },
  "cached": false
}
```

## Cost Estimate

**With OpenAI API:**
- $0.0015 per summary (GPT-3.5-turbo)
- ~100 summaries = $0.15
- DynamoDB caching reduces repeated costs

**Without OpenAI (fallback):**
- Free (uses text extraction)
- Less intelligent but still useful

## Troubleshooting

**"Module not found: requests"**
- Add the Lambda Layer (Step 1.3)

**"OPENAI_API_KEY not found"**
- Works fine without it (uses fallback)
- Add key for AI-powered summaries

**Timeout errors**
- Increase timeout to 30 seconds
- OpenAI API can take 5-10 seconds
