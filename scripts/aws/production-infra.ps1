[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Apply', 'Outputs')]
    [string]$Action = 'Plan',

    [string]$AwsProfile = 'mdp-new-account',
    [string]$StateRegion = 'us-east-1',
    [string]$WorkloadRegion = 'eu-south-1',
    [string]$AvailabilityZone = 'eu-south-1b',
    [string]$ProjectName = 'my-doctor-professor',
    [string]$BudgetEmail = 'eyad.elmaleh1@gmail.com',
    [string]$InstanceType = 'c7i-flex.large'
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
Write-Host "Production Availability Zone: $AvailabilityZone" -ForegroundColor Cyan
Write-Host "Production EC2 instance type: $InstanceType" -ForegroundColor Cyan

if (-not $AvailabilityZone.StartsWith($WorkloadRegion)) {
    throw "Availability Zone '$AvailabilityZone' does not belong to workload Region '$WorkloadRegion'."
}

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

if ($Action -ne 'Outputs') {
    Write-Host "`nChecking EC2 Free Plan eligibility in $WorkloadRegion..." -ForegroundColor Cyan
    $Eligible = (& aws ec2 describe-instance-types --profile $AwsProfile --region $WorkloadRegion --instance-types $InstanceType --query 'InstanceTypes[0].FreeTierEligible' --output text 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $Eligible -ne 'True') {
        $EligibleTypes = (& aws ec2 describe-instance-types --profile $AwsProfile --region $WorkloadRegion --filters 'Name=free-tier-eligible,Values=true' --query 'sort_by(InstanceTypes,&InstanceType)[].InstanceType' --output text 2>$null)
        throw "EC2 instance type '$InstanceType' is not Free-Tier-eligible in $WorkloadRegion for this account. Eligible types reported by AWS: $EligibleTypes"
    }
    Write-Host "EC2 instance type '$InstanceType' is Free-Tier-eligible." -ForegroundColor Green

    Write-Host "Checking whether '$InstanceType' is offered in $AvailabilityZone..." -ForegroundColor Cyan
    $Offering = (& aws ec2 describe-instance-type-offerings --profile $AwsProfile --region $WorkloadRegion --location-type availability-zone --filters "Name=instance-type,Values=$InstanceType" "Name=location,Values=$AvailabilityZone" --query 'InstanceTypeOfferings[0].InstanceType' --output text 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $Offering -ne $InstanceType) {
        $OfferedZones = (& aws ec2 describe-instance-type-offerings --profile $AwsProfile --region $WorkloadRegion --location-type availability-zone --filters "Name=instance-type,Values=$InstanceType" --query 'sort_by(InstanceTypeOfferings,&Location)[].Location' --output text 2>$null)
        throw "EC2 instance type '$InstanceType' is not offered in $AvailabilityZone. Offered Availability Zones reported by AWS: $OfferedZones"
    }
    Write-Host "EC2 instance type '$InstanceType' is offered in $AvailabilityZone." -ForegroundColor Green
}

$StateBucket = "$ProjectName-terraform-state-$AccountId"
& aws s3api head-bucket --profile $AwsProfile --bucket $StateBucket 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Terraform state bucket '$StateBucket' is unavailable. Run the bootstrap stack first."
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ProductionDir = Join-Path $RepoRoot 'infra\production'

$env:TF_VAR_aws_region = $WorkloadRegion
$env:TF_VAR_app_availability_zone = $AvailabilityZone
$env:TF_VAR_project_name = $ProjectName
$env:TF_VAR_budget_email = $BudgetEmail
$env:TF_VAR_instance_type = $InstanceType

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
$DatabaseVolumeId = (& terraform "-chdir=$ProductionDir" output -raw database_volume_id).Trim()
$SnapshotPolicyId = (& terraform "-chdir=$ProductionDir" output -raw database_snapshot_policy_id).Trim()

Write-Host "`nNext deployment values:" -ForegroundColor Green
Write-Host "AWS_DEPLOY_ROLE_ARN=$DeployRoleArn"
Write-Host "AWS_WORKLOAD_REGION=$WorkloadRegion"
Write-Host "AWS_AVAILABILITY_ZONE=$AvailabilityZone"
Write-Host "APPLICATION_URL=$ApplicationUrl"
Write-Host "INSTANCE_ID=$InstanceId"
Write-Host "DATABASE_VOLUME_ID=$DatabaseVolumeId"
Write-Host "DATABASE_SNAPSHOT_POLICY_ID=$SnapshotPolicyId"
Write-Host "`nThe official EC2 has now been launched with PostgreSQL on a protected persistent EBS volume. Check the Free Tier EC2 activity status before cleaning the temporary credit EC2." -ForegroundColor Yellow
