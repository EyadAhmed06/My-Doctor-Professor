[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Apply', 'Outputs')]
    [string]$Action = 'Plan',

    [string]$AwsProfile = 'mdp-new-account',
    [string]$StateRegion = 'us-east-1',
    [string]$WorkloadRegion = 'eu-south-1',
    [string]$ProjectName = 'my-doctor-professor',
    [string]$BudgetEmail = 'eyad.elmaleh1@gmail.com'
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

Assert-Command aws
Assert-Command terraform

Write-Host "AWS profile: $AwsProfile" -ForegroundColor Cyan
Write-Host "Terraform state Region: $StateRegion" -ForegroundColor Cyan
Write-Host "Production workload Region: $WorkloadRegion" -ForegroundColor Cyan

& aws sts get-caller-identity --profile $AwsProfile --output json
if ($LASTEXITCODE -ne 0) {
    Write-Host "No active session for '$AwsProfile'. Starting browser login..." -ForegroundColor Yellow
    Invoke-Native aws configure set region $StateRegion --profile $AwsProfile
    Invoke-Native aws login --profile $AwsProfile
    Invoke-Native aws sts get-caller-identity --profile $AwsProfile --output json
}

$env:AWS_PROFILE = $AwsProfile
$env:AWS_REGION = $WorkloadRegion
$env:AWS_DEFAULT_REGION = $WorkloadRegion

$AccountId = (& aws sts get-caller-identity --profile $AwsProfile --query Account --output text).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($AccountId)) {
    throw 'Could not resolve AWS account ID.'
}

$StateBucket = "$ProjectName-terraform-state-$AccountId"
& aws s3api head-bucket --profile $AwsProfile --bucket $StateBucket 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Terraform state bucket '$StateBucket' is unavailable. Run the bootstrap stack first."
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ProductionDir = Join-Path $RepoRoot 'infra\production'

$env:TF_VAR_aws_region = $WorkloadRegion
$env:TF_VAR_project_name = $ProjectName
$env:TF_VAR_budget_email = $BudgetEmail

Write-Host "`nInitializing production remote state..." -ForegroundColor Cyan
$InitArgs = @(
    "-chdir=$ProductionDir",
    'init',
    '-reconfigure',
    "-backend-config=bucket=$StateBucket",
    '-backend-config=key=production/terraform.tfstate',
    "-backend-config=region=$StateRegion",
    '-backend-config=encrypt=true',
    '-backend-config=use_lockfile=true'
)
Invoke-Native terraform @InitArgs
Invoke-Native terraform "-chdir=$ProductionDir" validate

if ($Action -eq 'Outputs') {
    Invoke-Native terraform "-chdir=$ProductionDir" output
    exit 0
}

if ($Action -eq 'Plan') {
    Write-Host "`nPlanning official production infrastructure..." -ForegroundColor Cyan
    Invoke-Native terraform "-chdir=$ProductionDir" plan
    exit 0
}

Write-Host "`nPlanning official production infrastructure..." -ForegroundColor Cyan
$PlanArgs = @("-chdir=$ProductionDir", 'plan', '-out=production.tfplan')
Invoke-Native terraform @PlanArgs

Write-Host "`nApplying official production infrastructure..." -ForegroundColor Yellow
$ApplyArgs = @("-chdir=$ProductionDir", 'apply', '-auto-approve', 'production.tfplan')
Invoke-Native terraform @ApplyArgs

Write-Host "`nProduction outputs:" -ForegroundColor Green
Invoke-Native terraform "-chdir=$ProductionDir" output

$DeployRoleArn = (& terraform "-chdir=$ProductionDir" output -raw github_actions_role_arn).Trim()
$ApplicationUrl = (& terraform "-chdir=$ProductionDir" output -raw application_url).Trim()
$InstanceId = (& terraform "-chdir=$ProductionDir" output -raw instance_id).Trim()
$RdsEndpoint = (& terraform "-chdir=$ProductionDir" output -raw rds_endpoint).Trim()

Write-Host "`nNext deployment values:" -ForegroundColor Green
Write-Host "AWS_DEPLOY_ROLE_ARN=$DeployRoleArn"
Write-Host "AWS_WORKLOAD_REGION=$WorkloadRegion"
Write-Host "APPLICATION_URL=$ApplicationUrl"
Write-Host "INSTANCE_ID=$InstanceId"
Write-Host "RDS_ENDPOINT=$RdsEndpoint"
Write-Host "`nThe official EC2 has now been launched. Check the Free Tier EC2 activity status before cleaning the temporary credit EC2." -ForegroundColor Yellow
