# Quick Deployment Fix - No module named 'requests'

The error means Lambda can't find the `requests` library. Here's how to fix it:

---

## Option 1: Use Pre-Built Layer (Fastest - 5 minutes)

### Step 1: Download requests library as a layer

Use this ARN for **Asia Pacific (Sydney) - ap-southeast-2**:
```
arn:aws:lambda:ap-southeast-2:770693421928:layer:Klayers-p311-requests:14
```

For other regions, check: https://github.com/keithrozario/Klayers/tree/master/deployments/python3.11

### Step 2: Add layer to Lambda

1. Go to AWS Lambda → **search-academic-papers**
2. Scroll down to **Layers** section
3. Click **Add a layer**
4. Choose **Specify an ARN**
5. Paste the ARN from above
6. Click **Add**
7. Click **Deploy** (top of page)

### Step 3: Test again

Go back to the Test tab and run your test - it should work now!

---

## Option 2: Manual Deployment Package (15 minutes)

If the layer doesn't work, create a deployment package manually:

### Prerequisites
- Install Python 3.11 on your computer
- Or use an online Python environment

### Windows Instructions

1. **Open PowerShell as Administrator**

2. **Navigate to the folder**:
   ```powershell
   cd C:\Users\adamf\Desktop\pp\academic-literature-ai\backend\lambda\search_papers
   ```

3. **Install dependencies**:
   ```powershell
   # If you have Python installed
   python -m pip install requests boto3 -t .
   
   # OR if you have Python 3.11 specifically
   python3.11 -m pip install requests boto3 -t .
   ```

4. **Create ZIP file**:
   ```powershell
   # Remove old zip if it exists
   if (Test-Path lambda_function.zip) { Remove-Item lambda_function.zip }
   
   # Create new zip with all files
   Compress-Archive -Path * -DestinationPath lambda_function.zip -Force
   ```

5. **Check the ZIP**:
   ```powershell
   # Should be 3-5 MB
   Get-Item lambda_function.zip | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB,2)}}
   ```

6. **Upload to Lambda**:
   - Go to AWS Lambda → **search-academic-papers**
   - Click **Upload from** → **.zip file**
   - Select `lambda_function.zip` from:
     `C:\Users\adamf\Desktop\pp\academic-literature-ai\backend\lambda\search_papers\lambda_function.zip`
   - Click **Save**
   - Wait for upload to complete (might take 30-60 seconds)

7. **Test**:
   - Go to **Test** tab
   - Click **Test** button
   - Should work now!

---

## Option 3: Use AWS CloudShell (Easiest - No local Python needed!)

1. **Open AWS Console**

2. **Click CloudShell icon** (terminal icon in top right, next to the bell)

3. **Wait for CloudShell to load** (~30 seconds)

4. **Run these commands**:
   ```bash
   # Create working directory
   mkdir lambda-deploy
   cd lambda-deploy
   
   # Create the Lambda function code
   cat > lambda_function.py << 'EOF'
   # Paste the entire content of your lambda_function.py here
   # (Copy from VS Code and paste into CloudShell)
   EOF
   
   # Install dependencies
   pip3 install requests boto3 -t .
   
   # Create ZIP
   zip -r lambda_function.zip .
   
   # Upload to Lambda
   aws lambda update-function-code \
     --function-name search-academic-papers \
     --zip-file fileb://lambda_function.zip
   ```

5. **Wait for deployment** to complete (you'll see a success message)

6. **Test in Lambda console**

---

## Which option should you use?

- **Fastest**: Option 1 (Layer) - just add an ARN
- **Most reliable**: Option 2 (Manual package) - if you have Python installed
- **No Python?**: Option 3 (CloudShell) - built into AWS, nothing to install

---

## Still not working?

Check these:
1. Lambda logs: Lambda → Monitor → View CloudWatch logs
2. Make sure IAM role has permissions
3. Make sure DYNAMODB_TABLE environment variable is set
4. Try increasing timeout to 30 seconds (Configuration → General configuration)
