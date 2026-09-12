param(
  [string]$PythonExe = "python",
  [switch]$Remove
)
$base = "HKCU:\Software\Classes"
if ($Remove) {
  Remove-Item "$base\.p2lrn" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$base\P2LRN.Package" -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}
New-Item "$base\.p2lrn" -Force | Out-Null
Set-ItemProperty "$base\.p2lrn" -Name "(default)" -Value "P2LRN.Package"
New-Item "$base\P2LRN.Package\shell\open\command" -Force | Out-Null
$command = '"' + $PythonExe + '" -m p2lrn_reader "%1"'
Set-ItemProperty "$base\P2LRN.Package\shell\open\command" -Name "(default)" -Value $command
