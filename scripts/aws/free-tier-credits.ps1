[CmdletBinding()]
param(
    [ValidateSet('Apply', 'Status', 'Destroy')]
    [string]$Action = 'Apply',

    [string]$AwsRegion = 'us-east-1',

    [string]$ProjectName = 'my-doctor-professor',

    [string]$BudgetEmail = '',

    [switch]$ConfigureGitHubVariables,

    [switch]$ConfirmDestroy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

function Show-FreeTierStatus {
    Write-Host "`nAWS Free Tier plan state:" -ForegroundColor Cyan
    & aws freetier get-account-plan-state --region $AwsRegion --output json
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Could not query get-account-plan-state. Make sure AWS CLI is current and this account exposes the Free Tier API.'
    }

    Write-Host "`nAWS Free Tier earning activities:" -ForegroundColor Cyan
    Invoke-Native aws freetier list-account-activities `
        --region $AwsRegion `
        --query 'activities[].{Activity:title,Status:status,RewardUSD:reward.credit.amount}' `
        --output table
}

Assert-Command aws

Write-Host 'Verifying AWS authentication...' -ForegroundColor Cyan
Invoke-Native aws sts get-caller-identity --output json

if ($Action -eq 'Status') {
    Show-FreeTierStatus
    exit 0
}

Assert-Command terraform

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BootstrapDir = Join-Path $RepoRoot 'infra\bootstrap'
$CreditsDir = Join-Path $RepoRoot 'infra\credits'

$AccountId = (& aws sts get-caller-identity --query Account --output text).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($AccountId)) {
    throw 'Could not resolve the current AWS account ID.'
}

$StateBucket = "$ProjectName-terraform-state-$AccountId"

if ($Action -eq 'Destroy') {
    if (-not $ConfirmDestroy) {
        throw 'Destroy is blocked. Re-run with -Action Destroy -ConfirmDestroy after AWS reports all credit activities COMPLETED.'
    }

    $Incomplete = (& aws freetier list-account-activities `
        --region $AwsRegion `
        --query 'length(activities[?status!=`COMPLETED`])' `
        --output text).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not verify AWS Free Tier activity completion. Refusing to destroy.'
    }
    if ($Incomplete -ne '0') {
        Show-FreeTierStatus
        throw "AWS still reports $Incomplete incomplete activity/activities. Refusing to destroy."
    }

    Write-Host 'Initializing the remote credits state...' -ForegroundColor Cyan
    Invoke-Native terraform "-chdir=$CreditsDir" init -reconfigure `
        "-backend-config=bucket=$StateBucket" `
        '-backend-config=key=credits/terraform.tfstate' `
        "-backend-config=region=$AwsRegion" `
        '-backend-config=encrypt=true' `
        '-backend-config=use_lockfile=true'

    $env:TF_VAR_aws_region = $AwsRegion
    $env:TF_VAR_project_name = $ProjectName
    $env:TF_VAR_budget_email = $BudgetEmail

    Write-Host 'Destroying temporary credit-activity resources...' -ForegroundColor Yellow
    Invoke-Native terraform "-chdir=$CreditsDir" destroy -auto-approve
    exit 0
}

Write-Host "`n1/6 - Bootstrapping Terraform state + GitHub OIDC..." -ForegroundColor Cyan
$env:TF_VAR_aws_region = $AwsRegion
$env:TF_VAR_project_name = $ProjectName
Invoke-Native terraform "-chdir=$BootstrapDir" init
Invoke-Native terraform "-chdir=$BootstrapDir" fmt -check -recursive
Invoke-Native terraform "-chdir=$BootstrapDir" validate
Invoke-Native terraform "-chdir=$BootstrapDir" apply -auto-approve

$StateBucket = (& terraform "-chdir=$BootstrapDir" output -raw terraform_state_bucket).Trim()
$CreditsRoleArn = (& terraform "-chdir=$BootstrapDir" output -raw github_credits_role_arn).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($StateBucket) -or [string]::IsNullOrWhiteSpace($CreditsRoleArn)) {
    throw 'Bootstrap outputs could not be resolved.'
}

Write-Host "`n2/6 - Initializing encrypted/versioned remote Terraform state..." -ForegroundColor Cyan
Invoke-Native terraform "-chdir=$CreditsDir" init -reconfigure `
    "-backend-config=bucket=$StateBucket" `
    '-backend-config=key=credits/terraform.tfstate' `
    "-backend-config=region=$AwsRegion" `
    '-backend-config=encrypt=true' `
    '-backend-config=use_lockfile=true'
Invoke-Native terraform "-chdir=$CreditsDir" fmt -check -recursive
Invoke-Native terraform "-chdir=$CreditsDir" validate

Write-Host "`n3/6 - Creating Budget, EC2, RDS, and Lambda activities..." -ForegroundColor Cyan
$env:TF_VAR_budget_email = $BudgetEmail
Invoke-Native terraform "-chdir=$CreditsDir" plan -out=credits.tfplan
Invoke-Native terraform "-chdir=$CreditsDir" apply -auto-approve credits.tfplan

Write-Host "`n4/6 - Invoking the Lambda web app..." -ForegroundColor Cyan
$LambdaUrl = (& terraform "-chdir=$CreditsDir" output -raw lambda_function_url).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($LambdaUrl)) {
    throw 'Lambda Function URL was not returned by Terraform.'
}
$LambdaResponse = Invoke-RestMethod -Uri $LambdaUrl -Method Get
$LambdaResponse | ConvertTo-Json -Depth 8

Write-Host "`n5/6 - Invoking Amazon Bedrock..." -ForegroundColor Cyan
$BedrockModel = (& terraform "-chdir=$CreditsDir" output -raw bedrock_model_id).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($BedrockModel)) {
    throw 'Bedrock model ID was not returned by Terraform.'
}

$MessagesJson = '[{"role":"user","content":[{"text":"Reply with exactly: AWS activity complete"}]}]'
$InferenceJson = '{"maxTokens":16,"temperature":0}'
& aws bedrock-runtime converse `
    --region $AwsRegion `
    --model-id $BedrockModel `
    --messages $MessagesJson `
    --inference-config $InferenceJson `
    --query 'output.message.content[0].text' `
    --output text
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Bedrock API invocation failed. The other four activities remain provisioned. Check Bedrock model access and the authoritative Free Tier status below.'
}

if ($ConfigureGitHubVariables) {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        Write-Host "`nConfiguring GitHub repository variables..." -ForegroundColor Cyan
        & gh auth status *> $null
        if ($LASTEXITCODE -eq 0) {
            Invoke-Native gh variable set AWS_CREDITS_ROLE_ARN --body $CreditsRoleArn --repo 'EyadAhmed06/My-Doctor-Professor'
            Invoke-Native gh variable set AWS_TERRAFORM_STATE_BUCKET --body $StateBucket --repo 'EyadAhmed06/My-Doctor-Professor'
            if (-not [string]::IsNullOrWhiteSpace($BudgetEmail)) {
                Invoke-Native gh variable set AWS_BUDGET_EMAIL --body $BudgetEmail --repo 'EyadAhmed06/My-Doctor-Professor'
            }
        }
        else {
            Write-Warning 'GitHub CLI is installed but is not authenticated; repository variables were not changed.'
        }
    }
    else {
        Write-Warning 'GitHub CLI was not found; repository variables were not changed.'
    }
}

Write-Host "`n6/6 - Reading the authoritative AWS activity status..." -ForegroundColor Cyan
Start-Sleep -Seconds 60
Show-FreeTierStatus

Write-Host "`nBootstrap outputs for later GitHub Actions:" -ForegroundColor Green
Write-Host "AWS_CREDITS_ROLE_ARN=$CreditsRoleArn"
Write-Host "AWS_TERRAFORM_STATE_BUCKET=$StateBucket"
Write-Host "`nDo not destroy the temporary resources until AWS reports every intended activity as COMPLETED. Credits may take additional time to appear." -ForegroundColor Yellow
