# Deploy Frontend to AWS Amplify

## Quick Deploy (10 minutes)

### Step 1: Prepare for Deployment

1. **Test the build locally first:**
   ```powershell
   cd C:\Users\adamf\Desktop\pp\academic-literature-ai\frontend
   npm run build
   ```
   - Wait for build to complete (1-2 minutes)
   - Should see "✓ Compiled successfully"

### Step 2: Push to GitHub

1. **Initialize git (if not already done):**
   ```powershell
   cd C:\Users\adamf\Desktop\pp\academic-literature-ai
   git init
   git add .
   git commit -m "Initial commit - Academic Literature Search App"
   ```

2. **Create GitHub repository:**
   - Go to https://github.com/new
   - Repository name: `academic-literature-search`
   - Visibility: Public (for portfolio) or Private
   - Click **Create repository**

3. **Push to GitHub:**
   ```powershell
   git remote add origin https://github.com/YOUR-USERNAME/academic-literature-search.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy with AWS Amplify

1. **Open AWS Amplify:**
   - Go to AWS Console → Search for **"Amplify"**
   - Click **AWS Amplify**

2. **Create New App:**
   - Click **New app** (top right)
   - Select **Host web app**

3. **Connect Repository:**
   - Choose **GitHub** (or your git provider)
   - Click **Continue**
   - Authorize AWS Amplify to access your GitHub
   - Select repository: `academic-literature-search`
   - Select branch: `main`
   - Click **Next**

4. **Configure Build Settings:**
   - **App name**: `academic-literature-search`
   - Amplify will auto-detect Next.js and configure build settings
   - **Build settings** should look like:
     ```yaml
     version: 1
     frontend:
       phases:
         preBuild:
           commands:
             - cd frontend
             - npm ci
         build:
           commands:
             - npm run build
       artifacts:
         baseDirectory: frontend/.next
         files:
           - '**/*'
       cache:
         paths:
           - frontend/node_modules/**/*
     ```
   - Click **Next**

5. **Review and Deploy:**
   - Review settings
   - Click **Save and deploy**

6. **Wait for Deployment:**
   - Provision (30 seconds)
   - Build (2-3 minutes)
   - Deploy (30 seconds)
   - Verify (10 seconds)

7. **Get Your Live URL:**
   - Once deployed, you'll see a URL like:
   - `https://main.d1a2b3c4d5e6f7.amplifyapp.com`
   - Click it to test your live app!

---

## Alternative: Deploy Without GitHub (Direct Deploy)

If you don't want to use GitHub:

### Option A: Manual Deploy via S3 + CloudFront

1. **Build static export:**
   ```powershell
   cd C:\Users\adamf\Desktop\pp\academic-literature-ai\frontend
   npm run build
   ```

2. **Create S3 bucket:**
   - AWS Console → S3 → Create bucket
   - Bucket name: `academic-literature-app-yourname`
   - Region: ap-southeast-2
   - Uncheck "Block all public access"
   - Create bucket

3. **Enable static website hosting:**
   - Bucket → Properties → Static website hosting
   - Enable
   - Index document: `index.html`
   - Error document: `404.html`
   - Save

4. **Upload files:**
   - Upload entire `.next` and `public` folders
   - Make files public

5. **Add CloudFront (optional but recommended):**
   - AWS Console → CloudFront → Create distribution
   - Origin: Your S3 bucket
   - Default cache behavior: Redirect HTTP to HTTPS
   - Create distribution

---

## Environment Variables

After deployment, add environment variables in Amplify:

1. **In Amplify Console:**
   - Your app → Environment variables
   - Click **Manage variables**

2. **Add variable:**
   - Variable name: `NEXT_PUBLIC_API_URL`
   - Value: `https://duiovsew3d.execute-api.ap-southeast-2.amazonaws.com/prod`
   - Click **Save**

3. **Redeploy:**
   - Go to your app
   - Click **Redeploy this version**

---

## Cost Estimate

**AWS Amplify Hosting:**
- Build minutes: 1000/month free, then $0.01/minute
- Storage: 15GB free, then $0.023/GB
- Data transfer: 15GB free, then $0.15/GB
- **Estimated**: $0-5/month for portfolio project

---

## Troubleshooting

### Build fails with "Module not found"
- Check that all dependencies are in `package.json`
- Verify build works locally first

### Environment variable not working
- Ensure it starts with `NEXT_PUBLIC_`
- Redeploy after adding variables

### API CORS errors
- Your API Gateway already has CORS enabled
- Should work automatically

---

## Next Steps After Deployment

1. ✅ Test the live app thoroughly
2. 🔗 Add custom domain (optional)
3. 📊 Set up AWS CloudWatch monitoring
4. 🔐 Add authentication (Cognito) - Phase 4
5. 🤖 Add AI summarization - Phase 2
