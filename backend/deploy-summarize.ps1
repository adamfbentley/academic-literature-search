# PowerShell deployment script for summarize_paper Lambda

Write-Host "=== Academic Literature AI - Summarize Lambda Deployment ===" -ForegroundColor Green

$lambdaDir = "lambda\summarize_paper"
$outputZip = "summarize_paper_function.zip"

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
Write-Host "2. Select your function: summarize_paper"
Write-Host "3. Upload this file: $PWD\$outputZip"
Write-Host "4. Configure env vars:"
Write-Host "   DYNAMODB_TABLE, OPENAI_API_KEY"
Write-Host "5. Or use AWS CLI:"
Write-Host "   aws lambda update-function-code --function-name summarize_paper --zip-file fileb://$outputZip"

Pop-Location
