[CmdletBinding()]
param([string]$ReaderCommand = "p2lrn-reader", [switch]$Remove, [switch]$InspectOnly)
$ErrorActionPreference = "Stop"
$base = "HKCU:\Software\Classes"
$className = "P2LRN.Package"
if ($Remove) {
  $old = Get-Item -LiteralPath "$base\.p2lrn" -ErrorAction SilentlyContinue
  if ($old -and $old.GetValue("") -eq $className) { Remove-Item -LiteralPath "$base\.p2lrn" -Recurse -Force }
  Remove-Item -LiteralPath "$base\$className" -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}
# Never evaluate the shell-supplied %1 filename inside PowerShell -Command.
$resolved = Get-Command -Name $ReaderCommand -ErrorAction Stop
$reader = $resolved.Source
if (-not $reader -or -not (Test-Path -LiteralPath $reader -PathType Leaf)) { throw "P2LRN Reader no encontrado." }
$reader = [IO.Path]::GetFullPath($reader)
$kind = [IO.Path]::GetExtension($reader).ToLowerInvariant()
if ($kind -eq ".exe") {
  $command = '"' + $reader + '" "%1"'
} elseif ($kind -in @(".cmd",".bat",".ps1")) {
  # npm installs .cmd/.ps1 shims. Invoke the vetted Toolkit JS directly, not cmd.exe.
  $dir = Split-Path -Parent $reader
  $candidates = @(
    (Join-Path $dir "node_modules\@p2lrn\toolkit\dist\cli\read.js"),
    (Join-Path (Split-Path -Parent $dir) "@p2lrn\toolkit\dist\cli\read.js")
  )
  $js = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ($js) {
    $node = Get-Command -Name node.exe -CommandType Application -ErrorAction Stop
    $command = '"' + [IO.Path]::GetFullPath($node.Source) + '" "' + [IO.Path]::GetFullPath($js) + '" "%1"'
  } elseif ($kind -eq ".ps1") {
    $command = 'powershell.exe -NoProfile -File "' + $reader + '" "%1"'
  } else {
    throw "Launcher .cmd/.bat no admitido sin el Reader JS; instala @p2lrn/toolkit."
  }
} else {
  throw "Tipo de Reader no admitido: $kind"
}
if ($InspectOnly) { Write-Output $command; exit 0 }
New-Item -Path "$base\.p2lrn" -Force | Out-Null
Set-ItemProperty -Path "$base\.p2lrn" -Name "(default)" -Value $className
New-Item -Path "$base\$className\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$base\$className\shell\open\command" -Name "(default)" -Value $command
Write-Host "Asociacion .p2lrn segura registrada; vuelve a ejecutar este script si tenias una asociacion antigua."
