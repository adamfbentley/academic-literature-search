# PowerShell deployment script for Lambda function

Write-Host "=== Academic Literature AI - Lambda Deployment ===" -ForegroundColor Green

$lambdaDir = "lambda\search_papers"
$outputZip = "lambda_function.zip"

# Navigate to lambda directory
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
Write-Host "2. Select your function: search-academic-papers"
Write-Host "3. Upload this file: $PWD\$outputZip"
Write-Host "4. Or use AWS CLI:"
Write-Host "   aws lambda update-function-code --function-name search-academic-papers --zip-file fileb://$outputZip"

Pop-Location
