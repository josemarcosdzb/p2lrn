[CmdletBinding()]
param(
  [string]$ReaderCommand = 'p2lrn-reader',
  [string]$IconPath = '',
  [switch]$Remove,
  [switch]$InspectOnly
)
$ErrorActionPreference = 'Stop'
$base = 'HKCU:\Software\Classes'
$className = 'P2LRN.Package'
if ($Remove) {
  $old = Get-Item -LiteralPath "$base\.p2lrn" -ErrorAction SilentlyContinue
  if ($old -and $old.GetValue('') -eq $className) { Remove-Item -LiteralPath "$base\.p2lrn" -Recurse -Force }
  Remove-Item -LiteralPath "$base\$className" -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}

# Do not evaluate shell-provided %1 inside PowerShell -Command or cmd.exe.
$resolved = Get-Command -Name $ReaderCommand -ErrorAction Stop
$reader = $resolved.Source
if (-not $reader -or -not (Test-Path -LiteralPath $reader -PathType Leaf)) { throw 'P2LRN Reader no encontrado.' }
$reader = [IO.Path]::GetFullPath($reader)
$kind = [IO.Path]::GetExtension($reader).ToLowerInvariant()
$dir = Split-Path -Parent $reader
if ($kind -eq '.exe') {
  $command = '"' + $reader + '" "%1"'
} elseif ($kind -in @('.cmd','.bat','.ps1')) {
  # Resolve the official CLI from npm. Never delegate untrusted filenames to cmd.exe.
  $candidates = @(
    (Join-Path $dir 'node_modules\@p2lrn\toolkit\dist\cli\read.js'),
    (Join-Path (Split-Path -Parent $dir) '@p2lrn\toolkit\dist\cli\read.js')
  )
  $js = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ($js) {
    $node = Get-Command -Name node.exe -CommandType Application -ErrorAction Stop
    $command = '"' + [IO.Path]::GetFullPath($node.Source) + '" "' + [IO.Path]::GetFullPath($js) + '" "%1"'
  } elseif ($kind -eq '.ps1') {
    $command = 'powershell.exe -NoProfile -File "' + $reader + '" "%1"'
  } else {
    throw 'Launcher .cmd/.bat no admitido sin Reader JS; instala @p2lrn/toolkit.'
  }
} else {
  throw "Tipo de Reader no admitido: $kind"
}

if ($IconPath) {
  $iconCandidates = @($IconPath)
} else {
  $iconCandidates = @(
    (Join-Path $dir 'p2lrn.ico'),
    (Join-Path $dir 'node_modules\@p2lrn\toolkit\assets\p2lrn.ico'),
    (Join-Path (Split-Path -Parent $dir) '@p2lrn\toolkit\assets\p2lrn.ico'),
    (Join-Path $PSScriptRoot '..\assets\p2lrn.ico'),
    (Join-Path $PSScriptRoot '..\..\packages\toolkit\assets\p2lrn.ico')
  )
}
$found = $iconCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $found) { throw 'Icono P2LRN no encontrado. Instala el Toolkit npm con el icono incluido o usa -IconPath con una ruta .ico permanente.' }
$icon = [IO.Path]::GetFullPath($found)
if ([IO.Path]::GetExtension($icon).ToLowerInvariant() -ne '.ico') { throw 'IconPath debe apuntar a un archivo .ico.' }

if ($InspectOnly) { Write-Output $command; Write-Output "DefaultIcon: $icon"; exit 0 }
New-Item -Path "$base\.p2lrn" -Force | Out-Null
Set-Item -Path "$base\.p2lrn" -Value $className
New-Item -Path "$base\$className\shell\open\command" -Force | Out-Null
Set-Item -Path "$base\$className\shell\open\command" -Value $command
New-Item -Path "$base\$className\DefaultIcon" -Force | Out-Null
Set-Item -Path "$base\$className\DefaultIcon" -Value ('"' + $icon + '",0')
Write-Host "Asociacion .p2lrn registrada con icono oficial: $icon"
