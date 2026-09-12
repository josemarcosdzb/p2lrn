param([string]$ReaderCommand = "p2lrn-reader",[switch]$Remove)
$ErrorActionPreference = "Stop"
$base = "HKCU:\Software\Classes"
if ($Remove) { Remove-Item "$base\.p2lrn" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item "$base\P2LRN.Package" -Recurse -Force -ErrorAction SilentlyContinue; exit 0 }
$resolved = Get-Command $ReaderCommand -ErrorAction Stop
$readerPath = $resolved.Source
if (-not $readerPath) { throw "No se pudo resolver el comando P2LRN Reader: $ReaderCommand" }
$escapedReaderPath = $readerPath.Replace("'", "''")
New-Item "$base\.p2lrn" -Force | Out-Null
Set-ItemProperty "$base\.p2lrn" -Name "(default)" -Value "P2LRN.Package"
New-Item "$base\P2LRN.Package\shell\open\command" -Force | Out-Null
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ''' + $escapedReaderPath + ''' ''%1''"'
Set-ItemProperty "$base\P2LRN.Package\shell\open\command" -Name "(default)" -Value $command
Write-Host "Asociacion .p2lrn registrada con: $readerPath"
