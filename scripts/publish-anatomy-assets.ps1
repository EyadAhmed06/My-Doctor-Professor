param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,

  [string]$Region = "eu-central-1",
  [string]$Repository = "EyadAhmed06/My-Doctor-Professor",
  [string]$DeployBranch = "agent/phase1-interactions",
  [string]$AppOrigin = "https://18-102-130-45.sslip.io",
  [switch]$NoDeploy
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Regions = @(
  "skeleton",
  "skull",
  "skull-exploded",
  "skull-base",
  "vertebrae",
  "upper-limb",
  "lower-limb",
  "hand"
)

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or is not on PATH."
  }
}

function Invoke-Native([scriptblock]$Command, [string]$FailureMessage) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

Require-Command "aws"
Require-Command "gh"
Require-Command "curl.exe"

$ZipPath = (Resolve-Path $ZipPath).Path
if (-not (Test-Path $ZipPath -PathType Leaf)) {
  throw "ZIP not found: $ZipPath"
}

$identityJson = & aws sts get-caller-identity --output json
if ($LASTEXITCODE -ne 0) {
  throw "AWS authentication failed. Run 'aws configure' or sign in to the intended AWS account first."
}
$identity = $identityJson | ConvertFrom-Json
$accountId = [string]$identity.Account
if (-not $accountId) { throw "Could not determine AWS account id." }

$bucket = "my-doctor-professor-demo-anatomy-$accountId".ToLowerInvariant()
$packageHash = (Get-FileHash -Algorithm SHA256 $ZipPath).Hash.ToLowerInvariant()
$releaseId = $packageHash.Substring(0, 16)
$releasePrefix = "releases/$releaseId"
$assetBase = "https://$bucket.s3.$Region.amazonaws.com/$releasePrefix"

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("mdp-anatomy-" + [Guid]::NewGuid().ToString("N"))
$extractRoot = Join-Path $tempRoot "package"
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

try {
  Write-Host "[1/7] Extracting and validating anatomy package..."
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractRoot -Force
  $anatomyDir = Join-Path $extractRoot "anatomy"
  if (-not (Test-Path $anatomyDir -PathType Container)) {
    throw "Package must contain an anatomy/ directory."
  }

  foreach ($regionName in $Regions) {
    $glb = Join-Path $anatomyDir "$regionName.glb"
    $poster = Join-Path $anatomyDir "$regionName-fallback.png"
    if (-not (Test-Path $glb -PathType Leaf)) { throw "Missing required model: anatomy/$regionName.glb" }
    if (-not (Test-Path $poster -PathType Leaf)) { throw "Missing required poster: anatomy/$regionName-fallback.png" }

    $bytes = [IO.File]::ReadAllBytes($glb)
    if ($bytes.Length -lt 20) { throw "Invalid GLB (too short): $glb" }
    $magic = [Text.Encoding]::ASCII.GetString($bytes, 0, 4)
    $version = [BitConverter]::ToUInt32($bytes, 4)
    $declaredLength = [BitConverter]::ToUInt32($bytes, 8)
    $jsonChunkLength = [BitConverter]::ToUInt32($bytes, 12)
    $jsonChunkType = [BitConverter]::ToUInt32($bytes, 16)
    if ($magic -ne "glTF" -or $version -ne 2 -or $declaredLength -ne $bytes.Length) {
      throw "Invalid GLB header/length: $glb"
    }
    if ($jsonChunkType -ne 0x4E4F534A -or (20 + $jsonChunkLength) -gt $bytes.Length) {
      throw "Invalid GLB JSON chunk: $glb"
    }
    try {
      $jsonText = [Text.Encoding]::UTF8.GetString($bytes, 20, $jsonChunkLength).Trim([char]0, ' ', "`t", "`r", "`n")
      $null = $jsonText | ConvertFrom-Json
    } catch {
      throw "Invalid GLB JSON payload: $glb ($($_.Exception.Message))"
    }

    $posterBytes = [IO.File]::ReadAllBytes($poster)
    if ($posterBytes.Length -lt 8) { throw "Invalid PNG poster (too short): $poster" }
    $pngHeader = $posterBytes[0..7]
    $expectedPngHeader = [byte[]](137,80,78,71,13,10,26,10)
    if ([Convert]::ToBase64String($pngHeader) -ne [Convert]::ToBase64String($expectedPngHeader)) {
      throw "Invalid PNG poster: $poster"
    }
  }

  Write-Host "Package SHA-256: $packageHash"
  Write-Host "Release id: $releaseId"

  Write-Host "[2/7] Ensuring dedicated public-read anatomy bucket exists..."
  & aws s3api head-bucket --bucket $bucket 2>$null
  if ($LASTEXITCODE -ne 0) {
    if ($Region -eq "us-east-1") {
      Invoke-Native { aws s3api create-bucket --bucket $bucket --region $Region | Out-Null } "Could not create S3 bucket $bucket."
    } else {
      Invoke-Native { aws s3api create-bucket --bucket $bucket --region $Region --create-bucket-configuration "LocationConstraint=$Region" | Out-Null } "Could not create S3 bucket $bucket."
    }
  }

  $publicAccessPath = Join-Path $tempRoot "public-access.json"
  Write-Utf8NoBom $publicAccessPath @'
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": false,
  "RestrictPublicBuckets": false
}
'@
  Invoke-Native { aws s3api put-public-access-block --bucket $bucket --public-access-block-configuration "file://$publicAccessPath" | Out-Null } "Could not configure S3 public access block for anatomy assets."

  $policyPath = Join-Path $tempRoot "bucket-policy.json"
  Write-Utf8NoBom $policyPath @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAnatomyReleases",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$bucket/releases/*"
    }
  ]
}
"@
  Invoke-Native { aws s3api put-bucket-policy --bucket $bucket --policy "file://$policyPath" | Out-Null } "Could not apply the public-read policy. If account-level S3 Block Public Access is enabled, use CloudFront/OAC instead of disabling it account-wide."

  $corsPath = Join-Path $tempRoot "cors.json"
  Write-Utf8NoBom $corsPath @"
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": ["$AppOrigin"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 86400
    }
  ]
}
"@
  Invoke-Native { aws s3api put-bucket-cors --bucket $bucket --cors-configuration "file://$corsPath" | Out-Null } "Could not configure S3 CORS."

  Write-Host "[3/7] Uploading immutable release to S3..."
  foreach ($file in Get-ChildItem -LiteralPath $anatomyDir -File) {
    $key = "$releasePrefix/anatomy/$($file.Name)"
    $contentType = if ($file.Extension -ieq ".glb") { "model/gltf-binary" } elseif ($file.Extension -ieq ".png") { "image/png" } else { "application/octet-stream" }
    Invoke-Native {
      aws s3api put-object `
        --bucket $bucket `
        --key $key `
        --body $file.FullName `
        --content-type $contentType `
        --cache-control "public,max-age=31536000,immutable" | Out-Null
    } "Upload failed for $($file.Name)."
  }

  Write-Host "[4/7] Verifying all public model and poster URLs..."
  foreach ($regionName in $Regions) {
    $modelUrl = "$assetBase/anatomy/$regionName.glb"
    $posterUrl = "$assetBase/anatomy/$regionName-fallback.png"

    $modelMagic = (& curl.exe -fsSL --range 0-3 $modelUrl)
    if ($LASTEXITCODE -ne 0 -or (($modelMagic -join "") -ne "glTF")) {
      throw "Published model failed GLB probe: $modelUrl"
    }
    & curl.exe -fsSI $posterUrl | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Published poster is not reachable: $posterUrl" }
  }

  Write-Host "[5/7] Setting GitHub build-time asset origin..."
  Invoke-Native { gh variable set NEXT_PUBLIC_ANATOMY_ASSET_BASE --repo $Repository --body $assetBase } "Could not set GitHub variable NEXT_PUBLIC_ANATOMY_ASSET_BASE. Run 'gh auth login' and retry."

  Write-Host "[6/7] Confirming GitHub variable..."
  $configuredBase = (& gh variable get NEXT_PUBLIC_ANATOMY_ASSET_BASE --repo $Repository).Trim()
  if ($LASTEXITCODE -ne 0 -or $configuredBase -ne $assetBase) {
    throw "GitHub variable verification failed. Expected '$assetBase', got '$configuredBase'."
  }

  if ($NoDeploy) {
    Write-Host "[7/7] Deployment skipped (-NoDeploy)."
  } else {
    Write-Host "[7/7] Triggering exact AWS deployment workflow..."
    Invoke-Native { gh workflow run deploy-aws.yml --repo $Repository --ref $DeployBranch -f confirm=DEPLOY } "Could not trigger deploy-aws.yml."
  }

  Write-Host ""
  Write-Host "Anatomy assets published successfully." -ForegroundColor Green
  Write-Host "Asset base: $assetBase"
  Write-Host "Skeleton:   $assetBase/anatomy/skeleton.glb"
  if (-not $NoDeploy) {
    Write-Host "Deployment was queued. Watch it with: gh run watch --repo $Repository"
  }
}
finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
