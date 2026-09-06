[CmdletBinding()]
param(
    [string]$AwsProfile = 'mdp-new-account',
    [string]$Region = 'eu-south-1',
    [string]$InstanceName = 'my-doctor-professor-production',
    [int]$SsmWaitSeconds = 600
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Aws {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & aws @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed ($LASTEXITCODE): aws $($Arguments -join ' ')"
    }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "Required command 'aws' was not found in PATH."
}

Write-Host "Resolving production EC2..." -ForegroundColor Cyan
$InstanceId = (& aws ec2 describe-instances `
    --profile $AwsProfile `
    --region $Region `
    --filters "Name=tag:Name,Values=$InstanceName" 'Name=instance-state-name,Values=pending,running' `
    --query 'Reservations[0].Instances[0].InstanceId' `
    --output text).Trim()

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($InstanceId) -or $InstanceId -eq 'None') {
    throw "Could not find a pending/running EC2 instance tagged Name=$InstanceName in $Region."
}

Write-Host "Instance ID: $InstanceId" -ForegroundColor Green
Invoke-Aws ec2 describe-instances `
    --profile $AwsProfile `
    --region $Region `
    --instance-ids $InstanceId `
    --query 'Reservations[0].Instances[0].{State:State.Name,Type:InstanceType,AZ:Placement.AvailabilityZone,PrivateIP:PrivateIpAddress,PublicIP:PublicIpAddress}' `
    --output table

Write-Host "`nWaiting for EC2 status checks..." -ForegroundColor Cyan
Invoke-Aws ec2 wait instance-status-ok --profile $AwsProfile --region $Region --instance-ids $InstanceId
Write-Host 'EC2 status checks passed.' -ForegroundColor Green

Write-Host "`nWaiting for Systems Manager to report Online..." -ForegroundColor Cyan
$Deadline = (Get-Date).AddSeconds($SsmWaitSeconds)
$PingStatus = ''
do {
    $PingStatus = (& aws ssm describe-instance-information `
        --profile $AwsProfile `
        --region $Region `
        --filters "Key=InstanceIds,Values=$InstanceId" `
        --query 'InstanceInformationList[0].PingStatus' `
        --output text 2>$null).Trim()

    if ($PingStatus -eq 'Online') { break }
    Start-Sleep -Seconds 10
} while ((Get-Date) -lt $Deadline)

if ($PingStatus -ne 'Online') {
    throw "SSM did not become Online within $SsmWaitSeconds seconds (last status: '$PingStatus')."
}
Write-Host 'SSM is Online.' -ForegroundColor Green

$Commands = @(
    'set -Eeuo pipefail',
    'echo "== cloud-init =="',
    'cloud-init status --wait',
    'echo "== docker =="',
    'systemctl is-active docker',
    'docker --version',
    'docker compose version',
    'echo "== database volume =="',
    'findmnt -no SOURCE,FSTYPE,OPTIONS /opt/mdp/data/postgres',
    'df -h /opt/mdp/data/postgres',
    'test -w /opt/mdp/data/postgres',
    'echo "== swap =="',
    'swapon --show',
    'echo "== bootstrap files =="',
    'test -s /opt/mdp/deploy.env && echo deploy.env:OK',
    'test -s /opt/mdp/compose.production.yml && echo compose.production.yml:OK',
    'test -s /opt/mdp/Caddyfile && echo Caddyfile:OK',
    'test -x /usr/local/bin/mdp-deploy && echo mdp-deploy:OK',
    'echo "== backups =="',
    'systemctl is-enabled mdp-backup.timer',
    'systemctl is-active mdp-backup.timer',
    'echo "HOST_READINESS_OK"'
)

$ParametersFile = Join-Path $env:TEMP 'mdp-production-host-check.json'
$Payload = @{ commands = $Commands } | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText($ParametersFile, $Payload, [System.Text.UTF8Encoding]::new($false))
$ParametersUri = 'file://' + ($ParametersFile -replace '\\','/')

Write-Host "`nRunning bootstrap/readiness checks over SSM..." -ForegroundColor Cyan
try {
    $CommandId = (& aws ssm send-command `
        --profile $AwsProfile `
        --region $Region `
        --instance-ids $InstanceId `
        --document-name AWS-RunShellScript `
        --comment 'Verify My Doctor Professor production host readiness' `
        --parameters $ParametersUri `
        --query 'Command.CommandId' `
        --output text).Trim()

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($CommandId)) {
        throw 'Failed to create SSM readiness command.'
    }

    & aws ssm wait command-executed --profile $AwsProfile --region $Region --command-id $CommandId --instance-id $InstanceId
    $WaitExit = $LASTEXITCODE

    $Result = (& aws ssm get-command-invocation `
        --profile $AwsProfile `
        --region $Region `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --output json) | ConvertFrom-Json

    Write-Host "`nSSM status: $($Result.Status)" -ForegroundColor $(if ($Result.Status -eq 'Success') { 'Green' } else { 'Red' })
    if ($Result.StandardOutputContent) {
        Write-Host "`n--- stdout ---"
        Write-Host $Result.StandardOutputContent
    }
    if ($Result.StandardErrorContent) {
        Write-Host "`n--- stderr ---" -ForegroundColor Yellow
        Write-Host $Result.StandardErrorContent
    }

    if ($WaitExit -ne 0 -or $Result.Status -ne 'Success' -or $Result.StandardOutputContent -notmatch 'HOST_READINESS_OK') {
        throw 'Production host readiness verification failed. Review the SSM output above.'
    }

    Write-Host "`nProduction host is ready for application deployment." -ForegroundColor Green
}
finally {
    Remove-Item $ParametersFile -ErrorAction SilentlyContinue
}
