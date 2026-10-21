# Restore the exact backed-up P2LRN landing in localhost:4183 from main.
# Refuses unexpected local changes, backs up replaced files, leaves Player/Studio alone.
$ErrorActionPreference='Stop'
$site=Join-Path $env:USERPROFILE 'P2LRN-local-4183\site'
$src=Join-Path $env:GITHUB_WORKSPACE 'deploy\netlify\site'
$oldHomeSha='704793c14fceaaed809f4a6f43c7d821a2d9acea7bc99d6f3cb9eb0b73c1fb34'
$originalMedia=@{
 'docs.png'='f3869760a0caac504bbf47d007473660bc0b82c66c55dd24d5a1a444a6f8002a'
 'games.png'='63be58974c3e9bccab84010f314d2edc62d9b98d1454c1f26eb04f25c9082ecc'
 'player.png'='73121e1ed0777122b126c01a75dfae4f90e845f1fe4abfbe74635390b30fb5ff'
 'preview.mp4'='76462d1527cba28f8eac47afc61ac6ee10b3774e69d89c84fc9904eb0ac05ead'
 'questionnaires.png'='4e10f5e48910f4f56b84270069395dae920f65a1dc01ba16f9715fab55ea10ad'
 'studio.png'='2a855a42f00f67592e21fb37591874de30b36d1b1e64f34f51f5ce921097399d'
 'video-reference.jpg'='cb717d70605dbba0556ee2b0087256396998d5ca26e3dc8545b83976e42c11eb'
}
Write-Host 'P2LRN_HOME_RESTORE_PREFLIGHT_BEGIN'
if(!(Test-Path -LiteralPath $site -PathType Container)){throw 'Local P2LRN site folder not found'}
$port=@(Get-NetTCPConnection -LocalPort 4183 -State Listen -ErrorAction SilentlyContinue)
if($port.Count -lt 1){throw 'Local port 4183 is not listening: refusing to modify site'}
foreach($name in @('index.html','p2lrn.js','p2lrn.css')){
  $p=Join-Path $src $name
  if(!(Test-Path -LiteralPath $p -PathType Leaf)){throw ('Missing canonical source '+$name)}
}
$srcHome=[IO.File]::ReadAllText((Join-Path $src 'index.html'),[Text.Encoding]::UTF8)
$srcJs=[IO.File]::ReadAllText((Join-Path $src 'p2lrn.js'),[Text.Encoding]::UTF8)
$srcCss=[IO.File]::ReadAllText((Join-Path $src 'p2lrn.css'),[Text.Encoding]::UTF8)
if(!$srcHome.Contains('data-hero-carousel-root') -or
   !$srcHome.Contains('Paquete en movimiento') -or
   !$srcHome.Contains('data-site-build') -or
   !$srcJs.Contains('P2LRN homepage media carousel') -or
   !$srcCss.Contains('inward perspective + deterministic carousel behavior')){
  throw 'The checked-out main does not contain verified canonical 3D carousel sources'
}
foreach($name in @($originalMedia.Keys)){
  $p=Join-Path $src ('assets\hero\'+$name)
  if(!(Test-Path -LiteralPath $p -PathType Leaf)){throw ('Missing carousel media '+$name)}
  $hash=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -ne $originalMedia[$name]){throw ('Original carousel media hash mismatch '+$name)}
}
$current=Join-Path $site 'index.html'
if(!(Test-Path -LiteralPath $current -PathType Leaf)){throw 'Local homepage missing'}
$localHash=(Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash.ToLowerInvariant()
if($localHash -ne $oldHomeSha){
  $html=[IO.File]::ReadAllText($current,[Text.Encoding]::UTF8)
  if(!$html.Contains('data-hero-carousel-root')){
    throw ('Homepage changed since read-only audit ('+$localHash+'); preserve user changes and abort')
  }
}
Write-Host ('CURRENT_HOME_SHA='+$localHash)
$ref=(& git -C $env:GITHUB_WORKSPACE rev-parse --short=12 HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $ref -notmatch '^[a-f0-9]{12}$'){throw 'Could not resolve source revision'}
Write-Host ('CHECKED_OUT_REVISION='+$ref)
$backup=Join-Path $env:USERPROFILE ('Downloads\P2LRN-local-4183-before-home-restore-'+$env:GITHUB_RUN_ID)
New-Item -ItemType Directory -Force -Path $backup|Out-Null
foreach($name in @('index.html','p2lrn.js','p2lrn.css')){
  $target=Join-Path $site $name
  if(Test-Path -LiteralPath $target -PathType Leaf){Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) -Force}
}
Write-Host ('LOCAL_BACKUP='+$backup)
Write-Host 'P2LRN_HOME_RESTORE_COPY_BEGIN'
foreach($name in @('index.html','p2lrn.js','p2lrn.css')){
  Copy-Item -LiteralPath (Join-Path $src $name) -Destination (Join-Path $site $name) -Force
}
$destination=Join-Path $site 'assets\hero'
New-Item -ItemType Directory -Force -Path $destination|Out-Null
foreach($name in @($originalMedia.Keys)){
  Copy-Item -LiteralPath (Join-Path $src ('assets\hero\'+$name)) -Destination (Join-Path $destination $name) -Force
  $hash=(Get-FileHash (Join-Path $destination $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -ne $originalMedia[$name]){throw ('Copied asset checksum mismatch: '+$name)}
}
# Bust stale Chrome profile caches for the HTML's own CSS and JS.
$indexPath=Join-Path $site 'index.html'
$html=[IO.File]::ReadAllText($indexPath,[Text.Encoding]::UTF8)
$html=[regex]::Replace($html,'(?<=href="/p2lrn\.css)\?[^"]*','?v='+$ref)
$html=[regex]::Replace($html,'(?<=src="/p2lrn\.js)\?[^"]*','?v='+$ref)
[IO.File]::WriteAllText($indexPath,$html,(New-Object System.Text.UTF8Encoding($false)))
Write-Host 'P2LRN_HOME_RESTORE_HTTP_CHECK_BEGIN'
$resp=Invoke-WebRequest -Uri 'http://127.0.0.1:4183/' -UseBasicParsing -TimeoutSec 8
if($resp.StatusCode -ne 200 -or
   !$resp.Content.Contains('data-hero-carousel-root') -or
   !$resp.Content.Contains('Paquete en movimiento') -or
   !$resp.Content.Contains('data-site-build') -or
   !$resp.Content.Contains('?v='+$ref)){throw 'Live server did not serve the restored homepage'}
foreach($name in @($originalMedia.Keys)){
  $url='http://127.0.0.1:4183/assets/hero/'+$name
  $response=Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 8
  if($response.StatusCode -ne 200){throw ('Restored media not served: '+$url)}
}
Write-Host ('RESTORED_HOME_BUILD='+$ref)
Write-Host ('RESTORED_HOME_BYTES='+(Get-Item $indexPath).Length)
Write-Host ('RESTORED_MEDIA_COUNT='+$originalMedia.Count)
Write-Host 'P2LRN_HOME_RESTORE_SUCCESS'
