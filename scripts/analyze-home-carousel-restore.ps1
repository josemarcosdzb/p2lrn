# Read-only diff between the original 3D carousel site and canonical site.
$ErrorActionPreference='Stop'
$backup=Join-Path $env:USERPROFILE 'Downloads\P2LRN-local-4183-site-backup-20261021-1311'
$src=Join-Path $env:GITHUB_WORKSPACE 'deploy/netlify/site'
$live=Join-Path $env:USERPROFILE 'P2LRN-local-4183\site'
Write-Host 'CAROUSEL_RESTORE_ANALYSIS_BEGIN'
foreach($filename in @('index.html','p2lrn.js','p2lrn.css')){
  $aPath=Join-Path $backup $filename
  $bPath=Join-Path $src $filename
  if(!(Test-Path $aPath) -or !(Test-Path $bPath)){throw 'Missing source '+$filename}
  $a=[IO.File]::ReadAllText($aPath,[Text.Encoding]::UTF8)
  $b=[IO.File]::ReadAllText($bPath,[Text.Encoding]::UTF8)
  $pre=0
  while($pre -lt $a.Length -and $pre -lt $b.Length -and $a[$pre] -ceq $b[$pre]){$pre++}
  $suf=0
  while($suf -lt ($a.Length-$pre) -and $suf -lt ($b.Length-$pre) -and $a[$a.Length-$suf-1] -ceq $b[$b.Length-$suf-1]){$suf++}
  Write-Host ('SOURCE_COMPARISON='+$filename+' backupChars='+$a.Length+' sourceChars='+$b.Length+
    ' commonPrefix='+$pre+' commonSuffix='+$suf+
    ' backupIsExtension='+$a.StartsWith($b)+' sourceIsExtension='+$b.StartsWith($a))
  $pos=$pre
  Write-Host ('BACKUP_CHANGED_SNIPPET='+$filename+' '+($a.Substring([Math]::Max(0,$pos-120),[Math]::Min(440,$a.Length-[Math]::Max(0,$pos-120))) -replace '\s+',' '))
  Write-Host ('SOURCE_CHANGED_SNIPPET='+$filename+' '+($b.Substring([Math]::Max(0,$pos-120),[Math]::Min(440,$b.Length-[Math]::Max(0,$pos-120))) -replace '\s+',' '))
  if($filename -eq 'index.html'){
    $scripts=@([regex]::Matches($a,'<(?:script|link)[^>]+(?:src|href)=["''][^"''>]+["''][^>]*>','IgnoreCase')|ForEach-Object{$_.Value})
    foreach($script in $scripts){Write-Host ('ORIGINAL_PAGE_ASSET='+$script)}
    $labels=@([regex]::Matches($a,'data-build=["''][^"''>]+["'']|data-player-version[^>]*>[^<]+','IgnoreCase')|ForEach-Object{$_.Value})
    foreach($label in $labels){Write-Host ('ORIGINAL_PAGE_VERSION='+$label)}
  }
}
foreach($filename in @('docs.png','games.png','player.png','preview.mp4','questionnaires.png','studio.png','video-reference.jpg')){
  $rel='assets\hero\'+$filename
  $a=Join-Path $backup $rel
  $b=Join-Path $live $rel
  if(!(Test-Path $a)){throw ('Missing original carousel media '+$filename)}
  $sha=(Get-FileHash $a -Algorithm SHA256).Hash.ToLowerInvariant()
  $installed=(Test-Path $b) -and ((Get-FileHash $b -Algorithm SHA256).Hash.ToLowerInvariant() -eq $sha)
  Write-Host ('HERO_MEDIA='+$filename+' bytes='+(Get-Item $a).Length+' originalSHA='+$sha+' alreadyInstalled='+$installed)
}
Write-Host 'CAROUSEL_RESTORE_ANALYSIS_END'
