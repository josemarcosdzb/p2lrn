$ErrorActionPreference = 'Stop'

# Reuse installed system/user browsers before provisioning isolated Chrome.
$candidates = @(
  $env:CHROME_BIN, $env:CHROME_PATH, $env:CHROMIUM_BIN, $env:EDGE_BIN,
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
if ($env:LOCALAPPDATA) {
  $candidates += Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'
  $candidates += Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'
  $candidates += Join-Path $env:LOCALAPPDATA 'Chromium\Application\chrome.exe'
}
$browser = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $browser) {
  foreach ($name in @('chrome.exe','msedge.exe','chromium.exe','google-chrome','chromium')) {
    $found = Get-Command -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and $found.Source -and (Test-Path -LiteralPath $found.Source -PathType Leaf)) {
      $browser = $found.Source
      break
    }
  }
}
if (-not $browser) {
  Write-Host 'No installed Chromium browser detected. Fetching official Chrome for Testing.'
  $manifest = Invoke-RestMethod -Uri 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json' -TimeoutSec 60
  $download = $manifest.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq 'win64' } | Select-Object -First 1
  if (-not $download -or -not $download.url -or ([uri]$download.url).Host -ne 'storage.googleapis.com') {
    throw 'Invalid or unavailable official Chrome for Testing Windows download.'
  }
  if (-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is missing from the Windows runner.' }
  $zip = Join-Path $env:RUNNER_TEMP 'p2lrn-chrome-for-testing.zip'
  $folder = Join-Path $env:RUNNER_TEMP 'p2lrn-chrome-for-testing'
  Invoke-WebRequest -Uri $download.url -OutFile $zip -TimeoutSec 240
  Expand-Archive -LiteralPath $zip -DestinationPath $folder -Force
  $browser = Join-Path $folder 'chrome-win64\chrome.exe'
  if (-not (Test-Path -LiteralPath $browser -PathType Leaf)) { throw 'Chrome for Testing executable not found after extraction.' }
}
if (-not $env:GITHUB_ENV) { throw 'GITHUB_ENV is missing: GitHub Actions runner required.' }
# Browser CDP startup and visual screenshot capture are mandatory in the next E2E.
[System.IO.File]::AppendAllText($env:GITHUB_ENV, ('CHROME_BIN=' + $browser + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ('P2LRN_WINDOWS_BROWSER=' + $browser)
