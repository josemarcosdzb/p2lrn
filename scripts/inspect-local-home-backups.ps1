# Read-only inspection of verified P2LRN localhost 4183 site backups.
$ErrorActionPreference='Stop'
$base=Join-Path $env:USERPROFILE 'Downloads'
$dirs=@(
 'P2LRN-local-4183-site-backup-20261021-1311',
 'p2lrn-original-untracked-backup-20261021-1305',
 'p2lrn-sync-backup-20261021-1230',
 'p2lrn-final-sync',
 'p2lrn-final2',
 'p2lrn-sync-main',
 'p2lrn-generated-after-sync-20261021-1310'
)
Write-Host 'P2LRN_CAROUSEL_BACKUPS_BEGIN'
foreach($name in $dirs){
 $dir=Join-Path $base $name
 if(!(Test-Path -LiteralPath $dir -PathType Container)){Write-Host ('BACKUP_NOT_FOUND='+$dir);continue}
 Write-Host ('BACKUP_DIR='+$dir)
 Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue | Select-Object -First 25 |
  ForEach-Object{Write-Host ('BACKUP_TOP='+$name+'/'+$_.Name+' type='+$(if($_.PSIsContainer){'dir'}else{'file'}))}
 $candidateDirs=@($dir,(Join-Path $dir 'site'),(Join-Path $dir '.netlify-cdn'),(Join-Path $dir 'deploy/netlify/site'))
 foreach($folder in $candidateDirs){
  if(!(Test-Path -LiteralPath $folder -PathType Container)){continue}
  $rel=$folder.Substring($dir.Length)
  foreach($filename in @('index.html','p2lrn.js','p2lrn.css','home-carousel.js','home-carousel.css','carousel.js','carousel.css')){
   $fp=Join-Path $folder $filename
   if(!(Test-Path -LiteralPath $fp -PathType Leaf)){continue}
   $file=Get-Item -LiteralPath $fp
   if($file.Length -gt 300000){continue}
   $body=Get-Content -LiteralPath $fp -Raw -ErrorAction Stop
   $terms=@([regex]::Matches($body,'inward-carousel-20261020|Paquete en movimiento|carousel|carrusel|3d-fan|video|<source|<img','IgnoreCase')|
    Select-Object -First 15 | ForEach-Object {$_.Value})
   $hash=(Get-FileHash -LiteralPath $fp -Algorithm SHA256).Hash.ToLowerInvariant()
   Write-Host ('BACKUP_FILE='+$name+$rel+'/'+$filename+' bytes='+$file.Length+' modified='+$file.LastWriteTimeUtc.ToString('o')+' hash='+$hash+' MATCHES='+($terms -join '|'))
   if($terms.Count -gt 0){
    $snippets=@([regex]::Matches($body,'.{0,95}(inward-carousel-20261020|Paquete en movimiento|carousel|carrusel).{0,155}','IgnoreCase')|
      Select-Object -First 7|ForEach-Object{$_.Value})
    $snippets|ForEach-Object{Write-Host ('BACKUP_SNIPPET='+($_ -replace '\s+',' '))}
   }
  }
  foreach($folderName in @('assets','media','videos','img','images','home')){
   $sub=Join-Path $folder $folderName
   if(!(Test-Path -LiteralPath $sub -PathType Container)){continue}
   Get-ChildItem -LiteralPath $sub -Recurse -File -ErrorAction SilentlyContinue|
    Where-Object {$_.Extension -match '^.(mp4|webm|png|jpg|jpeg|webp|svg)$'} |
    Select-Object -First 16|
    ForEach-Object{Write-Host ('BACKUP_MEDIA='+$name+'/'+$_.FullName.Substring($dir.Length+1)+' bytes='+$_.Length)}
  }
 }
}
Write-Host 'P2LRN_CAROUSEL_BACKUPS_COMPLETE'
