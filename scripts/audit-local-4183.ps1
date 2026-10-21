# Read-only audit of the Windows site served on localhost:4183.
# This script never copies, deletes, resets or overwrites local files.
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE 'P2LRN-local-4183'
$site = Join-Path $root 'site'
$repo = $env:GITHUB_WORKSPACE
Write-Host 'P2LRN_LOCAL_4183_AUDIT_BEGIN'
Write-Host ('HOST=' + $env:COMPUTERNAME)
Write-Host ('RUNNER=' + $env:RUNNER_NAME)
Write-Host ('LOCAL_ROOT=' + $root)
Write-Host ('LOCAL_ROOT_EXISTS=' + (Test-Path -LiteralPath $root -PathType Container))
Write-Host ('SITE_EXISTS=' + (Test-Path -LiteralPath $site -PathType Container))
Write-Host ('SOURCE_SHA=' + $env:GITHUB_SHA)

try {
  $listeners = @(Get-NetTCPConnection -LocalPort 4183 -State Listen -ErrorAction Stop)
  foreach ($entry in $listeners) {
    $process = Get-Process -Id $entry.OwningProcess -ErrorAction SilentlyContinue
    Write-Host ('PORT_4183=' + $entry.LocalAddress + ':' + $entry.LocalPort +
      ' PID=' + $entry.OwningProcess + ' PROCESS=' + $process.ProcessName)
  }
  if ($listeners.Count -eq 0) { Write-Host 'PORT_4183=NOT_LISTENING' }
} catch {
  Write-Host ('PORT_CHECK_UNAVAILABLE=' + $_.Exception.Message)
}

foreach ($name in @('','demo/','health.json','player/current/dist/release.json')) {
  $url = 'http://127.0.0.1:4183/' + $name
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
    $body = [string]$response.Content
    $digest = [Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $hash = [BitConverter]::ToString($digest.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()
    Write-Host ('HTTP ' + $url + ' STATUS=' + $response.StatusCode +
      ' BYTES=' + $bytes.Length + ' SHA256=' + $hash)
    if ($name -match '(health|release)\.json$') {
      try {
        $json = $body | ConvertFrom-Json
        $version = if ($null -ne $json.webSdkVersion) { $json.webSdkVersion } else { $json.playerVersion }
        Write-Host ('HTTP_VERSION ' + $name + ' VERSION=' + $version)
      } catch { Write-Host ('HTTP_INVALID_JSON=' + $name) }
    }
  } catch {
    Write-Host ('HTTP ' + $url + ' ERROR=' + $_.Exception.Message)
  }
}
if (!(Test-Path -LiteralPath $site -PathType Container)) {
  Write-Host 'P2LRN_LOCAL_4183_AUDIT_NO_LOCAL_SITE'
  exit 0
}
Write-Host 'LOCAL_TOP_LEVEL_BEGIN'
Get-ChildItem -LiteralPath $site -Force -ErrorAction Stop |
  Select-Object -First 45 |
  ForEach-Object { Write-Host ('LOCAL_ENTRY=' + $_.Name + ' TYPE=' + $(if ($_.PSIsContainer) {'dir'} else {'file'})) }
Write-Host 'LOCAL_TOP_LEVEL_END'

foreach ($candidate in @($root,$site)) {
  if (!(Test-Path -LiteralPath (Join-Path $candidate '.git'))) { continue }
  Write-Host ('LOCAL_GIT_REPOSITORY=' + $candidate)
  $localHead = & git -C $candidate rev-parse HEAD 2>&1
  Write-Host ('LOCAL_GIT_HEAD=' + ($localHead -join ' '))
  $status = @(& git -C $candidate status --porcelain=v1 -uno 2>&1)
  Write-Host ('LOCAL_GIT_MODIFIED_COUNT=' + $status.Count)
  $status | Select-Object -First 35 | ForEach-Object { Write-Host ('LOCAL_GIT_STATUS=' + $_) }
}

$paths = @(
  'demo/index.html',
  'demo/viewer.js',
  'studio/studio.js',
  'studio/studio.css',
  'p2lrn.js',
  'p2lrn.css',
  'player/current/dist/release.json',
  'player/current/dist/p2lrn.js'
)
foreach ($relative in $paths) {
  $file = Join-Path $site $relative
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { Write-Host ('LOCAL_MISSING=' + $relative); continue }
  $item = Get-Item -LiteralPath $file
  $sha = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host ('LOCAL_FILE=' + $relative + ' SIZE=' + $item.Length +
    ' MODIFIED=' + $item.LastWriteTimeUtc.ToString('o') + ' SHA256=' + $sha)
}
$latestSources = @(
  @{relative='demo/viewer.js';source='deploy/netlify/site/demo/viewer.js'},
  @{relative='studio/studio.js';source='deploy/netlify/site/studio/studio.js'},
  @{relative='studio/studio.css';source='deploy/netlify/site/studio/studio.css'}
)
foreach ($entry in $latestSources) {
  $local = Join-Path $site $entry.relative
  $source = Join-Path $repo $entry.source
  if (!(Test-Path -LiteralPath $local -PathType Leaf) -or !(Test-Path -LiteralPath $source -PathType Leaf)) { continue }
  $same = ((Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash)
  Write-Host ('COMPARE=' + $entry.relative + ' MATCHES_MAIN_SOURCE=' + $same)
}

$roscoFiles = @(
  Get-ChildItem -LiteralPath $site -Filter 'questionnaire-rosco.js' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 8
)
foreach ($file in $roscoFiles) {
  $body = Get-Content -LiteralPath $file.FullName -Raw
  Write-Host ('LOCAL_ROSCO_MODULE=' + $file.FullName.Substring($site.Length+1) +
    ' HAS_CIRCULAR=' + $body.Contains('p2lrn-rosco-center') +
    ' SHA256=' + (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())
}
if ($roscoFiles.Count -eq 0) { Write-Host 'LOCAL_ROSCO_MODULE=NONE_FOUND' }
$cssFiles = @(Get-ChildItem -LiteralPath $site -Filter 'questionnaire-games.css' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 8)
foreach ($file in $cssFiles) {
  $body = Get-Content -LiteralPath $file.FullName -Raw
  Write-Host ('LOCAL_GAME_STYLES=' + $file.FullName.Substring($site.Length+1) +
    ' HAS_CIRCLE_LAYOUT=' + $body.Contains('p2lrn-rosco-center') +
    ' SHA256=' + (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())
}
Write-Host 'P2LRN_LOCAL_4183_AUDIT_COMPLETE'
