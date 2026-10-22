param(
  [string[]]$Patterns = @('npm-studio-ui.png','native-npm-rosco.png','native-npm-crossword.png')
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir=Join-Path $env:GITHUB_WORKSPACE '.npm-pack-gate\visual-evidence'
if(-not (Test-Path -LiteralPath $dir)){
  Write-Host 'VISUAL_PREVIEW_MISSING=true'
  exit 0
}
$files=@(Get-ChildItem -LiteralPath $dir -Filter '*.png' -File)
Write-Host ('VISUAL_SCREENSHOT_FILES='+$files.Count)
foreach($pattern in $Patterns){
  $file=$files|Where-Object{$_.Name -like $pattern}|Select-Object -First 1
  if(-not $file){Write-Host ('VISUAL_PREVIEW_NOT_FOUND='+$pattern);continue}
  $src=[System.Drawing.Image]::FromFile($file.FullName)
  $canvas=$null;$graphics=$null;$ms=$null
  try{
    $width=[int][Math]::Min(740,$src.Width)
    $height=[int][Math]::Max(1,[Math]::Round($src.Height*$width/[double]$src.Width))
    $canvas=New-Object System.Drawing.Bitmap($width,$height)
    $graphics=[System.Drawing.Graphics]::FromImage($canvas)
    $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($src,0,0,$width,$height)
    $ms=New-Object IO.MemoryStream
    $codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}|Select-Object -First 1
    $args=New-Object System.Drawing.Imaging.EncoderParameters(1)
    $args.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]52)
    $canvas.Save($ms,$codec,$args)
    Write-Host ('VISUAL_JPEG_B64|'+$file.Name+'|'+[Convert]::ToBase64String($ms.ToArray()))
  }finally{
    if($graphics){$graphics.Dispose()}
    if($canvas){$canvas.Dispose()}
    if($ms){$ms.Dispose()}
    $src.Dispose()
  }
}
