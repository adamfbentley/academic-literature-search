# PowerShell deployment script for RAG pipeline Lambda

Write-Host "=== Academic Literature AI - RAG Lambda Deployment ===" -ForegroundColor Green

$lambdaDir = "lambda\rag_pipeline"
$outputZip = "rag_pipeline_function.zip"

Push-Location $lambdaDir

Write-Host "`nStep 1: Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt -t . --upgrade

Write-Host "`nStep 2: Creating deployment package..." -ForegroundColor Yellow
if (Test-Path $outputZip) {
    Remove-Item $outputZip
}
Compress-Archive -Path * -DestinationPath $outputZip -Force

Write-Host "`nStep 3: Deployment package created: $outputZip" -ForegroundColor Green
Write-Host "Size: $([math]::Round((Get-Item $outputZip).Length / 1MB, 2)) MB"

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Go to AWS Lambda console"
Write-Host "2. Select your function: rag-pipeline"
Write-Host "3. Upload this file: $PWD\$outputZip"
Write-Host "4. Configure env vars:"
Write-Host "   OPENAI_API_KEY, OPENAI_EMBED_MODEL, OPENAI_CHAT_MODEL"
Write-Host "   PINECONE_API_KEY, PINECONE_INDEX_HOST, PINECONE_NAMESPACE"
Write-Host "5. Or use AWS CLI:"
Write-Host "   aws lambda update-function-code --function-name rag-pipeline --zip-file fileb://$outputZip"

Pop-Location
