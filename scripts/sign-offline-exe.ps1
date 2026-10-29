# Signs the FINAL P2LRN course-specific Windows EXE after Studio export.
# A trusted Authenticode certificate with a private signing key must already
# be available in the publisher's Windows certificate store.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$CertificateThumbprint,
  [string]$TimestampServer = 'https://timestamp.digicert.com'
)
$ErrorActionPreference='Stop'
$path=(Resolve-Path -LiteralPath $Executable -ErrorAction Stop).Path
if(-not $path.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){throw 'Firma solo ejecutables .exe.'}
$previous=Get-AuthenticodeSignature -FilePath $path
if($previous.Status -ne 'NotSigned'){throw 'El archivo ya tiene firma. Utiliza el EXE original y firma solo una vez.'}
$cert=Get-ChildItem Cert:\CurrentUser\My,Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
  Where-Object { $_.Thumbprint -eq $CertificateThumbprint -and $_.HasPrivateKey } |
  Select-Object -First 1
if(-not $cert){throw 'No se ha encontrado un certificado con clave privada en el almacén de Windows.'}
$codeSigningOid='1.3.6.1.5.5.7.3.3'
if(-not ($cert.EnhancedKeyUsageList | Where-Object {$_.ObjectId -eq $codeSigningOid})){
  throw 'El certificado no permite firma de código (Code Signing EKU).'
}
$tool=Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if(-not $tool){throw 'Se requiere SignTool del Windows SDK. No se ha modificado el archivo.'}
& $tool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /v $path
if($LASTEXITCODE -ne 0){throw 'SignTool no pudo firmar el archivo.'}
& $tool.Source verify /pa /v $path
if($LASTEXITCODE -ne 0){throw 'SignTool no pudo verificar la firma final.'}
$final=Get-AuthenticodeSignature -FilePath $path
if($final.Status -ne 'Valid'){throw ('Firma Authenticode no válida: '+$final.Status)}
Write-Output ('FIRMA_VERIFICADA '+$path+' EDITOR='+$final.SignerCertificate.Subject)
Write-Output 'La firma autentica el editor del ejecutable. No certifica al alumno ni elimina los avisos de reputación SmartScreen.'
