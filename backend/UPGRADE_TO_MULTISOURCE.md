# Upgrade to Multi-Source Paper Search

This upgrade adds **OpenAlex** and **arXiv** to your paper search, making it much more powerful and reliable!

## Benefits

✅ **No more rate limits!** OpenAlex has 100,000 requests/day for free  
✅ **More papers** - combines results from 3 APIs  
✅ **Better coverage** - physics (arXiv), CS/AI (all sources), bio (Semantic Scholar)  
✅ **Automatic fallback** - if one API fails, others still work  
✅ **Duplicate removal** - smart deduplication by DOI and title  

---

## Quick Upgrade (10 minutes)

### Step 1: Replace Lambda Code

1. **Go to Lambda console**
2. Select **search-academic-papers**
3. Click **Code** tab
4. **Replace the entire code** with the content from:
   ```
   backend/lambda/search_papers/lambda_function_multisource.py
   ```
5. Click **Deploy** (orange button at top)
6. Wait 10 seconds for deployment

### Step 2: Test It

1. Go to **Test** tab
2. Use the same test event:
   ```json
   {
     "body": "{\"query\": \"quantum computing\", \"limit\": 5}"
   }
   ```
3. Click **Test**
4. **Check the response** - you should now see:
   - `"sources": ["OpenAlex", "arXiv"]` (or similar)
   - Papers from multiple sources
   - No rate limit errors!

### Step 3: Test API Gateway

1. Go to **API Gateway** → **academic-literature-api**
2. Click **Resources** → **POST** under `/search`
3. Click **Test** (lightning bolt)
4. Request body:
   ```json
   {"query": "machine learning", "limit": 10}
   ```
5. Click **Test**
6. Should return papers from multiple sources!

---

## What Changed?

### Multi-Source Search

The new Lambda function now queries:

1. **OpenAlex** (primary)
   - 100,000 requests/day (no key needed!)
   - 250M+ papers across all fields
   - Best citation data

2. **arXiv** (for preprints)
   - Physics, math, CS, biology
   - Latest research (often before publication)
   - Always has full PDF

3. **Semantic Scholar** (fallback)
   - Your existing API key still works
   - Good for AI/ML papers
   - Used if others don't return enough results

### Smart Features

- **Deduplication**: Removes duplicate papers by DOI or title
- **Citation sorting**: Best papers appear first
- **Graceful degradation**: If one API fails, others continue
- **Source tracking**: Response shows which APIs were used

---

## API Response Format

### New Fields

```json
{
  "papers": [...],
  "count": 10,
  "cached": false,
  "sources": ["OpenAlex", "arXiv", "Semantic Scholar"]  // NEW!
}
```

Each paper now includes:
```json
{
  "paperId": "...",
  "title": "...",
  "abstract": "...",
  "authors": [...],
  "year": 2024,
  "citationCount": 42,
  "doi": "10.1234/example",  // NEW!
  "url": "...",
  "pdfUrl": "...",
  "source": "OpenAlex"  // NEW! Shows which API provided this paper
}
```

---

## Testing Different Queries

Try these to see different sources in action:

### Physics/Math (will use arXiv)
```json
{"query": "quantum entanglement", "limit": 5}
```

### Computer Science (all sources)
```json
{"query": "transformer neural networks", "limit": 10}
```

### General (mainly OpenAlex)
```json
{"query": "climate change", "limit": 10}
```

---

## Troubleshooting

### "OpenAlex returned 0 papers"
- Check Lambda CloudWatch logs
- Verify internet connectivity from Lambda
- Try a different query

### "All sources failed"
- Check Lambda timeout (should be 30 seconds)
- Check Lambda has internet access
- Check CloudWatch logs for specific errors

### Still getting 429 from Semantic Scholar?
- That's fine! OpenAlex and arXiv will provide results
- Or add your Semantic Scholar API key (Step 5 in AWS_SETUP.md)

---

## Cost Impact

**No change!** The new APIs are free:
- OpenAlex: Free, 100K requests/day
- arXiv: Free, unlimited (with 3-second delay)
- Lambda/DynamoDB: Same as before

---

## Performance

**Slightly slower first time** (cold start):
- Queries 2-3 APIs instead of 1
- But subsequent requests are cached (fast!)
- Total latency: 2-5 seconds (was 1-3 seconds)

Worth it for:
- No rate limits
- More comprehensive results
- Better reliability

---

## Next Steps

1. ✅ Deploy the new code
2. ✅ Test with various queries
3. 🔄 **Ready for Phase 2**: AI Summarization!

Your backend is now production-ready with enterprise-grade reliability! 🚀
