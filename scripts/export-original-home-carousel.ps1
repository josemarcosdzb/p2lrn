# Export only verified public landing assets from the preserved local site.
# No credentials, configuration files or user content are exported.
$ErrorActionPreference='Stop'
$base=Join-Path $env:USERPROFILE 'Downloads\P2LRN-local-4183-site-backup-20261021-1311'
$items=@(
 'index.html',
 'p2lrn.js',
 'p2lrn.css',
 'assets/hero/docs.png',
 'assets/hero/games.png',
 'assets/hero/player.png',
 'assets/hero/preview.mp4',
 'assets/hero/questionnaires.png',
 'assets/hero/studio.png',
 'assets/hero/video-reference.jpg'
)
$expected=@{
 'index.html'='d51fc7210aa36d5c0aed277919d6299104027c4d606b68334134c8ec28768080'
 'p2lrn.js'='a6f069d266add957981038ebaa481fe36bc5e54010baa22b6693baa7f16a0bde'
 'p2lrn.css'='bd6c1d315712ea51a6139c54c867730856f5323a16a2bff5efb8c32f1c480d43'
 'assets/hero/docs.png'='f3869760a0caac504bbf47d007473660bc0b82c66c55dd24d5a1a444a6f8002a'
 'assets/hero/games.png'='63be58974c3e9bccab84010f314d2edc62d9b98d1454c1f26eb04f25c9082ecc'
 'assets/hero/player.png'='73121e1ed0777122b126c01a75dfae4f90e845f1fe4abfbe74635390b30fb5ff'
 'assets/hero/preview.mp4'='76462d1527cba28f8eac47afc61ac6ee10b3774e69d89c84fc9904eb0ac05ead'
 'assets/hero/questionnaires.png'='4e10f5e48910f4f56b84270069395dae920f65a1dc01ba16f9715fab55ea10ad'
 'assets/hero/studio.png'='2a855a42f00f67592e21fb37591874de30b36d1b1e64f34f51f5ce921097399d'
 'assets/hero/video-reference.jpg'='cb717d70605dbba0556ee2b0087256396998d5ca26e3dc8545b83976e42c11eb'
}
$cssRef=[IO.File]::ReadAllText((Join-Path $env:GITHUB_WORKSPACE 'deploy/netlify/site/p2lrn.css'),[Text.Encoding]::UTF8)
$cssBackup=[IO.File]::ReadAllText((Join-Path $base 'p2lrn.css'),[Text.Encoding]::UTF8)
$common=0
while($common -lt $cssRef.Length -and $common -lt $cssBackup.Length -and
      $cssRef[$common] -ceq $cssBackup[$common]){$common++}
Write-Host ('CSS_COMMON_PREFIX='+$common)
Write-Host ('CSS_CANONICAL_SUFFIX_INSIDE_BACKUP='+$cssBackup.Contains($cssRef.Substring($common)))
$jsRef=[IO.File]::ReadAllText((Join-Path $env:GITHUB_WORKSPACE 'deploy/netlify/site/p2lrn.js'),[Text.Encoding]::UTF8)
$jsBackup=[IO.File]::ReadAllText((Join-Path $base 'p2lrn.js'),[Text.Encoding]::UTF8)
if(!$jsBackup.StartsWith($jsRef)){throw 'The original carousel javascript is not an extension of current canonical JS'}
Write-Host ('JS_BACKUP_EXTENDS_CANONICAL=true additional='+($jsBackup.Length-$jsRef.Length))
Write-Host 'CAROUSEL_ASSET_EXPORT_BEGIN'
foreach($name in $items){
 $fp=Join-Path $base ($name.Replace('/','\'))
 if(!(Test-Path -LiteralPath $fp -PathType Leaf)){throw 'Missing original '+$name}
 $bytes=[IO.File]::ReadAllBytes($fp)
 $sha=(Get-FileHash -LiteralPath $fp -Algorithm SHA256).Hash.ToLowerInvariant()
 if($sha -ne $expected[$name]){throw 'Original asset changed: '+$name}
 $base64=[Convert]::ToBase64String($bytes)
 $step=2800
 $parts=[int][Math]::Ceiling($base64.Length/[double]$step)
 Write-Host ('CAROUSEL_FILE_BEGIN|'+$name+'|'+$bytes.Length+'|'+$sha+'|'+$parts)
 for($i=0;$i -lt $parts;$i++){
  $offset=$i*$step
  $len=[Math]::Min($step,$base64.Length-$offset)
  Write-Host ('CAROUSEL_FILE_PART|'+$name+'|'+$i+'|'+$base64.Substring($offset,$len))
 }
 Write-Host ('CAROUSEL_FILE_END|'+$name)
}
Write-Host 'CAROUSEL_ASSET_EXPORT_COMPLETE'
