$ErrorActionPreference = 'Stop'

$candidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
$browser = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $browser) {
  Write-Host 'Chrome and Edge are absent. Downloading official portable Chrome for Testing.'
  $manifest = Invoke-RestMethod -Uri 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json' -TimeoutSec 60
  $download = $manifest.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq 'win64' } | Select-Object -First 1
  if (-not $download -or -not $download.url) { throw 'Official Windows Chrome for Testing distribution is missing.' }
  $zip = Join-Path $env:RUNNER_TEMP 'p2lrn-chrome-for-testing.zip'
  $folder = Join-Path $env:RUNNER_TEMP 'p2lrn-chrome-for-testing'
  Invoke-WebRequest -Uri $download.url -OutFile $zip -TimeoutSec 240
  Expand-Archive -LiteralPath $zip -DestinationPath $folder -Force
  $browser = Join-Path $folder 'chrome-win64\chrome.exe'
  if (!(Test-Path -LiteralPath $browser -PathType Leaf)) { throw 'Portable Chrome executable not found.' }
}
& $browser --version
if ($LASTEXITCODE -ne 0) { throw 'Selected Chromium browser cannot execute.' }
if (!$env:GITHUB_ENV) { throw 'GITHUB_ENV is missing: GitHub Actions runner required.' }
[System.IO.File]::AppendAllText($env:GITHUB_ENV, ('CHROME_BIN=' + $browser + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ('PUBLIC_NPM_BROWSER=' + $browser)
