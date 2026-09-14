[CmdletBinding()]
param(
    [string]$AwsProfile = 'mdp-new-account',
    [string]$BedrockRegion = 'us-east-1',
    [string]$FreeTierRegion = 'us-east-1',
    [string]$ModelId = 'amazon.nova-micro-v1:0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Show-FreeTierStatus {
    Write-Host "`nAWS Free Tier plan state:" -ForegroundColor Cyan
    & aws freetier get-account-plan-state `
        --profile $AwsProfile `
        --region $FreeTierRegion `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read the AWS Free Tier plan state.'
    }

    Write-Host "`nAWS Free Tier earning activities:" -ForegroundColor Cyan
    & aws freetier list-account-activities `
        --profile $AwsProfile `
        --region $FreeTierRegion `
        --query 'activities[].{Activity:title,Status:status,RewardUSD:reward.credit.amount}' `
        --output table

    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read AWS Free Tier earning activities.'
    }

    $ActivitiesJson = & aws freetier list-account-activities `
        --profile $AwsProfile `
        --region $FreeTierRegion `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read AWS Free Tier activities as JSON.'
    }

    $Activities = ($ActivitiesJson | ConvertFrom-Json).activities
    $InProgress = @($Activities | Where-Object { $_.status -eq 'IN_PROGRESS' })

    if ($InProgress.Count -gt 0) {
        Write-Host "`nIN_PROGRESS activity details:" -ForegroundColor Cyan
        foreach ($Activity in $InProgress) {
            $DetailJson = & aws freetier get-account-activity `
                --profile $AwsProfile `
                --region $FreeTierRegion `
                --activity-id $Activity.activityId `
                --output json

            if ($LASTEXITCODE -eq 0) {
                $Detail = $DetailJson | ConvertFrom-Json
                [pscustomobject]@{
                    Activity = $Detail.title
                    Status = $Detail.status
                    EstimatedMinutes = $Detail.estimatedTimeToCompleteInMinutes
                    StartedAt = $Detail.startedAt
                    ExpiresAt = $Detail.expiresAt
                } | Format-List
            }
        }
    }
}

Assert-Command aws

Write-Host "Using AWS profile '$AwsProfile'." -ForegroundColor Cyan
& aws sts get-caller-identity --profile $AwsProfile --output json
if ($LASTEXITCODE -ne 0) {
    throw "AWS profile '$AwsProfile' is not authenticated. Run: aws login --profile $AwsProfile"
}

Write-Host "`nInvoking Amazon Bedrock model '$ModelId' in $BedrockRegion..." -ForegroundColor Cyan

$Request = [ordered]@{
    modelId = $ModelId
    messages = @(
        [ordered]@{
            role = 'user'
            content = @(
                [ordered]@{
                    text = 'Reply with exactly: AWS activity complete'
                }
            )
        }
    )
    inferenceConfig = [ordered]@{
        maxTokens = 16
        temperature = 0
    }
}

$Json = $Request | ConvertTo-Json -Depth 10 -Compress
$RequestPath = Join-Path ([System.IO.Path]::GetTempPath()) 'mdp-bedrock-converse.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($RequestPath, $Json, $Utf8NoBom)
$RequestUri = 'file://' + ($RequestPath -replace '\\', '/')

try {
    Write-Host "Request file: $RequestUri" -ForegroundColor DarkGray

    & aws bedrock-runtime converse `
        --profile $AwsProfile `
        --region $BedrockRegion `
        --cli-input-json $RequestUri `
        --query 'output.message.content[0].text' `
        --output text

    if ($LASTEXITCODE -ne 0) {
        throw 'Bedrock Converse call reached AWS CLI but failed. The error above is now the authoritative Bedrock error rather than a PowerShell JSON-encoding failure.'
    }

    Write-Host 'Bedrock API invocation succeeded.' -ForegroundColor Green
}
finally {
    Remove-Item -Path $RequestPath -Force -ErrorAction SilentlyContinue
}

Write-Host "`nWaiting 20 seconds before checking AWS Free Tier detection..." -ForegroundColor Cyan
Start-Sleep -Seconds 20
Show-FreeTierStatus

Write-Host "`nNote: AWS names the earning activity specifically as using a foundation model in the Bedrock Playground. If the API invocation succeeds but Bedrock remains NOT_STARTED, complete one prompt in the AWS Bedrock Playground; the automation has then proven that the remaining gap is the activity detector, not model access." -ForegroundColor Yellow
