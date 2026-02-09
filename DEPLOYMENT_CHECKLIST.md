# Complete Deployment Checklist

This is your complete step-by-step guide to deploy the Academic Literature AI app.

---

## ✅ Phase 1: Backend MVP - Paper Search 

### Step 1: DynamoDB Table ✅ (Assumed Complete)
- [x] Created `academic-papers-cache` table
- [x] Partition key: `searchKey` (String)
- [x] Enabled TTL with attribute `ttl`

**Time**: 5 minutes  
**Guide**: [AWS_SETUP.md - Step 1](backend/AWS_SETUP.md#step-1-create-dynamodb-table)

---

### Step 2: IAM Role ✅ (Assumed Complete)
- [x] Created `AcademicLiteratureAI-Lambda-Role`
- [x] Attached `AWSLambdaBasicExecutionRole`
- [x] Attached `AmazonDynamoDBFullAccess`

**Time**: 3 minutes  
**Guide**: [AWS_SETUP.md - Step 2](backend/AWS_SETUP.md#step-2-create-iam-role-for-lambda)

---

### Step 3: Lambda Function ✅ COMPLETED
- [x] Created function: `search-academic-papers`
- [x] Runtime: Python 3.11
- [x] Attached IAM role
- [x] Uploaded code with dependencies (Lambda Layer)
- [x] Set environment variable: `DYNAMODB_TABLE`
- [x] Increased timeout to 30 seconds
- [x] Tested successfully - returns papers ✅

**Time**: 15 minutes  
**Guide**: [AWS_SETUP.md - Steps 3-6](backend/AWS_SETUP.md#step-3-create-lambda-function)

---

### Step 4: API Gateway 🔄

Create a public API endpoint so you can call your Lambda from anywhere.

**Tasks**:
- [ ] Create REST API: `academic-literature-api`
- [ ] Create resource: `/search`
- [ ] Create POST method
- [ ] Link to `search-academic-papers` Lambda
- [ ] Enable CORS
- [ ] Deploy to `prod` stage
- [ ] Copy and save Invoke URL

**Time**: 10 minutes  
**Guide**: [AWS_SETUP.md - Step 7 - VERY DETAILED](backend/AWS_SETUP.md#step-7-create-api-gateway)

**After this step, you'll have**:
```
https://YOUR-API-ID.execute-api.ap-southeast-2.amazonaws.com/prod/search
```

---

### Step 5: Test API Endpoint

Test your live API from PowerShell or browser.

**Tasks**:
- [ ] Test with curl command
- [ ] Verify papers are returned
- [ ] Save the API URL for frontend

**Time**: 5 minutes  
**Guide**: [AWS_SETUP.md - Step 8](backend/AWS_SETUP.md#step-8-test-your-live-api-endpoint)

---

## 🎯 Phase 1 Complete Milestone

Once Steps 1-5 are done, you'll have:
- ✅ Working backend API
- ✅ Paper search from Semantic Scholar
- ✅ Results cached in DynamoDB
- ✅ Public HTTPS endpoint

**Cost so far**: ~$2-5/month for moderate usage

---

## 📋 Phase 2: AI Summarization (Next Project Session)

### Step 6: Create Summarization Lambda

Build a second Lambda function that takes paper details and generates AI summaries.

**Tasks**:
- [ ] Create new Lambda: `summarize-papers`
- [ ] Integrate AWS Bedrock (Claude) or OpenAI API
- [ ] Write summarization prompts
- [ ] Add to API Gateway as `/summarize` endpoint
- [ ] Test summarization

**Time**: 1-2 hours  
**Files to create**:
- `backend/lambda/summarize_papers/lambda_function.py`
- Prompt templates for academic summarization

**What it does**:
- Takes paper abstract + title
- Generates: key findings, methodology, relevance summary
- Optionally: compares to user's research area

---

## 🎨 Phase 3: Frontend (After Phase 2)

### Step 7: Build React/Next.js Frontend

Create the user interface for searching and viewing papers.

**Tasks**:
- [ ] Set up Next.js project
- [ ] Create search interface
- [ ] Display paper results
- [ ] Show AI summaries
- [ ] Add export functionality (PDF/BibTeX)
- [ ] Deploy to Vercel or S3 + CloudFront

**Time**: 1-2 days  
**Tech stack**:
- Next.js 14 + TypeScript
- TailwindCSS
- React Query for API calls

**Features**:
- Search bar with field filters
- Paper cards with expand/collapse
- AI summary toggle
- Citation export
- Search history

---

## 🔐 Phase 4: User Features (Optional Enhancement)

### Step 8: Add Authentication

Allow users to save searches and have personal history.

**Tasks**:
- [ ] Set up AWS Cognito user pool
- [ ] Add sign up/login to frontend
- [ ] Modify Lambda to save user search history
- [ ] Create user dashboard

**Time**: 3-4 hours

---

### Step 9: Advanced Features (Optional)

**Possible enhancements**:
- [ ] Email alerts for new papers in research area
- [ ] Citation network visualization
- [ ] Multi-paper comparison
- [ ] Research trend analysis
- [ ] Collaboration features
- [ ] Premium tier with more API calls

---

## 🚀 Quick Start - What To Do Right Now

### Immediate Next Action:

1. **Open AWS Console**
2. **Follow this guide**: [backend/AWS_SETUP.md - Step 7](backend/AWS_SETUP.md#step-7-create-api-gateway)
3. **Create API Gateway** (Parts A-F)
4. **Save your API URL**
5. **Test with curl**

**Time needed**: 15 minutes

Once that's working, you have a deployed backend API! 🎉

---

## 📊 Current Status Summary

| Component | Status | Time Spent |
|-----------|--------|------------|
| DynamoDB Table | ✅ Complete | 5 min |
| IAM Role | ✅ Complete | 3 min |
| Lambda Function | ✅ Complete | 15 min |
| Lambda Layer (requests) | ✅ Complete | 5 min |
| Environment Variables | ✅ Complete | 2 min |
| Lambda Testing | ✅ Complete | 5 min |
| **API Gateway** | 🔄 **NEXT** | **10 min** |
| API Testing | ⏳ Pending | 5 min |
| AI Summarization | ⏳ Future | 2 hours |
| Frontend | ⏳ Future | 2 days |

**Total time so far**: ~35 minutes  
**Estimated time to complete Phase 1**: +15 minutes  
**Total cost so far**: ~$0.50 (mostly DynamoDB)

---

## 💰 Cost Breakdown (Monthly Estimates)

### Current Usage (Phase 1 only):
- Lambda: $1-3 (first 1M requests free)
- DynamoDB: $1-5 (first 25GB free)
- API Gateway: $1-3 (first 1M requests = $3.50)
- **Total**: $3-11/month

### With AI Summarization (Phase 2):
- Add AWS Bedrock: $10-30 (depends on usage)
- **Total**: $13-41/month

### With Frontend on Vercel:
- Vercel: Free tier (up to 100GB bandwidth)
- **Total**: Same as above

### Optimization Tips:
- Use caching aggressively (already implemented)
- Set rate limits on API Gateway
- Use Bedrock batch processing for summaries
- Monitor via AWS CloudWatch

---

## 🆘 Need Help?

### If Something Goes Wrong:

1. **Lambda not working?**
   - Check CloudWatch logs: Lambda → Monitor → View logs
   - Verify IAM permissions
   - Check environment variables

2. **API Gateway returns error?**
   - Check Lambda is linked correctly
   - Verify CORS is enabled
   - Test Lambda directly first

3. **Costs too high?**
   - Check DynamoDB usage
   - Set up billing alerts
   - Reduce Lambda timeout

### Documentation Links:
- [AWS_SETUP.md](backend/AWS_SETUP.md) - Full setup guide
- [DEPLOY_INSTRUCTIONS.md](backend/DEPLOY_INSTRUCTIONS.md) - Troubleshooting
- [README.md](README.md) - Project overview

---

## 🎯 Your Immediate To-Do List

1. ✅ Lambda function working (DONE)
2. **🔄 Set up API Gateway** (DO NOW - 15 min)
3. **🔄 Test API endpoint** (DO NOW - 5 min)
4. Take a break! ☕
5. Then decide: Add AI summarization or build frontend?

**Current progress: 70% complete for Phase 1 MVP**

---

Open [AWS_SETUP.md Step 7](backend/AWS_SETUP.md#step-7-create-api-gateway) and follow Parts A through F.


