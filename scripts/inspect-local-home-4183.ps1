# Inspect the missing 2026-10-20 P2LRN landing page, read-only.
$ErrorActionPreference='Stop'
$root=Join-Path $env:USERPROFILE 'P2LRN-local-4183'
$site=Join-Path $root 'site'
Write-Host 'HOME_AUDIT_BEGIN'
Write-Host ('HOST='+$env:COMPUTERNAME+' RUNNER='+$env:RUNNER_NAME)
Write-Host ('LOCAL_SITE_PRESENT='+(Test-Path -LiteralPath $site -PathType Container))
if (!(Test-Path -LiteralPath $site -PathType Container)) { Write-Host 'HOME_AUDIT_NO_SITE'; exit 0 }

foreach($rel in @('index.html','p2lrn.js','p2lrn.css','player/current/dist/release.json','index.json','health.json')){
  $p=Join-Path $site $rel
  if(!(Test-Path -LiteralPath $p -PathType Leaf)){ Write-Host ('MISSING='+$rel); continue }
  $item=Get-Item -LiteralPath $p
  $value=Get-Content -LiteralPath $p -Raw -ErrorAction Stop
  $hash=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
  $found=@([regex]::Matches($value,'inward-carousel-20261020|Paquete en movimiento|carousel|carrusel|0[.]5[.]0[^< ]*','IgnoreCase') |
    Select-Object -First 16 | ForEach-Object { $_.Value })
  Write-Host ('LOCAL='+$rel+' bytes='+$item.Length+' modifiedUTC='+$item.LastWriteTimeUtc.ToString('o')+' sha='+$hash+' markers='+($found -join '|'))
  if($rel -match '\.json$'){
    try{
      $j=$value|ConvertFrom-Json
      Write-Host ('LOCAL_JSON_VERSION='+$rel+' webSdkVersion='+$j.webSdkVersion+' playerVersion='+$j.playerVersion+' build='+$j.build+' formatVersion='+$j.formatVersion)
    }catch{}
  }
}
$home=Join-Path $site 'index.html'
$source=Join-Path $env:GITHUB_WORKSPACE 'deploy/netlify/site/index.html'
if((Test-Path -LiteralPath $source) -and (Test-Path -LiteralPath $home)){
  $match=((Get-FileHash $source -Algorithm SHA256).Hash -eq (Get-FileHash $home -Algorithm SHA256).Hash)
  Write-Host ('LOCAL_HOME_MATCHES_MAIN='+$match)
}
Write-Host 'SITE_ROOT_CONTENTS_BEGIN'
Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue|Select-Object -First 75|
  ForEach-Object { Write-Host ('ROOT_ENTRY='+$_.Name+' type='+$(if($_.PSIsContainer){'dir'}else{'file'})+' lastWrite='+$_.LastWriteTimeUtc.ToString('o')) }
Write-Host 'SITE_ROOT_CONTENTS_END'
Write-Host 'CAROUSEL_RECOVERY_CANDIDATES_BEGIN'
$dirs=@($root,(Join-Path $env:USERPROFILE 'Downloads'))
$seen=@{}
foreach($dir in $dirs){
 if(!(Test-Path -LiteralPath $dir -PathType Container)) { continue }
 $items=@(Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue)
 foreach($entry in $items){
   if($entry.Name -match 'p2lrn|carousel|portada|landing|backup|respaldo'){
     Write-Host ('CANDIDATE='+$entry.FullName+' isDir='+$entry.PSIsContainer+' modified='+$entry.LastWriteTimeUtc.ToString('o'))
   }
 }
}
# Read a bounded collection of possible backups, never recurse into node_modules or binaries.
$folders=@($root,(Join-Path $root 'backup'),(Join-Path $root 'backups'),(Join-Path $root 'site'))
foreach($dir in $folders){
 if(!(Test-Path -LiteralPath $dir -PathType Container)){continue}
 $candidateFiles=@(Get-ChildItem -LiteralPath $dir -File -Force -ErrorAction SilentlyContinue |
   Where-Object {$_.Name -match 'index|carousel|portada|landing|backup|old|20261020'} |
   Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 60)
 foreach($item in $candidateFiles){
   $fp=$item.FullName
   if($seen.ContainsKey($fp)){continue};$seen[$fp]=$true
   if($item.Length -gt 1300000){continue}
   Write-Host ('POSSIBLE_BACKUP='+$fp+' bytes='+$item.Length+' modified='+$item.LastWriteTimeUtc.ToString('o'))
   if($item.Extension -notin @('.html','.js','.css','.txt','.bak','.old','.backup')){continue}
   try {
     $content=Get-Content -LiteralPath $fp -Raw -ErrorAction Stop
     if($content -match 'inward-carousel-20261020|Paquete en movimiento|carousel|carrusel|swiper|fan-cover'){
       Write-Host ('CAROUSEL_TEXT_FOUND='+$fp)
       $snips=@([regex]::Matches($content,'.{0,80}(?:inward-carousel-20261020|Paquete en movimiento|carousel|carrusel).{0,120}','IgnoreCase') |
         Select-Object -First 10|ForEach-Object {$_.Value})
       $snips | ForEach-Object{Write-Host ('CAROUSEL_SNIPPET='+($_ -replace '\s+',' '))}
     }
   }catch {}
 }
}
$media=@(Get-ChildItem -LiteralPath $site -File -Recurse -ErrorAction SilentlyContinue|
   Where-Object {$_.Extension -match 'mp4|webm|png|jpg|jpeg|webp|svg|avif'} |
   Select-Object -First 40)
foreach($item in $media){
 Write-Host ('LOCAL_MEDIA='+$item.FullName.Substring($site.Length+1)+' bytes='+$item.Length)
}
Write-Host 'CAROUSEL_RECOVERY_CANDIDATES_END'
Write-Host 'HOME_AUDIT_COMPLETE'
