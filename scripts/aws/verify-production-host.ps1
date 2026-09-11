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

# AWS-RunShellScript uses /bin/sh. Keep the remote script POSIX-compatible and
# collect diagnostics instead of stopping at the first failing readiness check.
$Commands = @(
    'fail=0',
    'echo "== cloud-init =="',
    'cloud-init status --wait || fail=1',
    'cloud-init status --long || true',
    'if [ "$fail" -ne 0 ]; then echo "== cloud-init output tail =="; tail -n 180 /var/log/cloud-init-output.log 2>/dev/null || true; echo "== cloud-final journal tail =="; journalctl -u cloud-final.service --no-pager -n 120 2>/dev/null || true; fi',
    'echo "== docker =="',
    'if systemctl is-active --quiet docker; then echo active; docker --version || fail=1; docker compose version || fail=1; else echo docker:INACTIVE; fail=1; fi',
    'echo "== database volume =="',
    'if findmnt -no SOURCE,FSTYPE,OPTIONS /opt/mdp/data/postgres; then df -h /opt/mdp/data/postgres || fail=1; test -w /opt/mdp/data/postgres || { echo database-mount:not-writable; fail=1; }; else echo database-mount:MISSING; fail=1; fi',
    'echo "== swap =="',
    'if swapon --show | grep -q /swapfile; then swapon --show; else echo swap:MISSING; fail=1; fi',
    'echo "== bootstrap files =="',
    'test -s /opt/mdp/deploy.env && echo deploy.env:OK || { echo deploy.env:MISSING; fail=1; }',
    'test -s /opt/mdp/compose.production.yml && echo compose.production.yml:OK || { echo compose.production.yml:MISSING; fail=1; }',
    'test -s /opt/mdp/Caddyfile && echo Caddyfile:OK || { echo Caddyfile:MISSING; fail=1; }',
    'test -x /usr/local/bin/mdp-deploy && echo mdp-deploy:OK || { echo mdp-deploy:MISSING; fail=1; }',
    'echo "== backups =="',
    'systemctl is-enabled mdp-backup.timer 2>/dev/null || { echo backup-timer:not-enabled; fail=1; }',
    'systemctl is-active mdp-backup.timer 2>/dev/null || { echo backup-timer:not-active; fail=1; }',
    'if [ "$fail" -eq 0 ]; then echo HOST_READINESS_OK; else echo HOST_READINESS_FAILED; exit 1; fi'
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
        throw 'Production host readiness verification failed. Review the diagnostics above.'
    }

    Write-Host "`nProduction host is ready for application deployment." -ForegroundColor Green
}
finally {
    Remove-Item $ParametersFile -ErrorAction SilentlyContinue
}
