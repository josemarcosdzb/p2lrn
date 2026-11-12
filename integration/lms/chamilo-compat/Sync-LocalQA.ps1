param(
    [Parameter(Mandatory = $true)]
    [string]$InstanceDir
)
$ErrorActionPreference = 'Stop'
$instance = (Resolve-Path -LiteralPath $InstanceDir).Path
$dockerfile = Join-Path $instance 'Dockerfile.p2lrn-lti-qa'
$overrides = Join-Path $instance 'overrides'
if (!(Test-Path -LiteralPath $dockerfile -PathType Leaf)) {
    throw 'The original QA Dockerfile is missing; refusing to create a second installation.'
}
if (!(Test-Path -LiteralPath $overrides -PathType Container)) {
    throw 'The original Chamilo override directory is missing.'
}
$names = @(
    'ImsLtiCourseToolLookupPatch.php',
    'ImsLtiGradebookCourseIdsPatch.php',
    'ImsLtiTeacherPickerCompatibilityPatch.php',
    'ImsLtiDeepLinkReturnCompatibilityPatch.php'
)
$build = [IO.File]::ReadAllText($dockerfile)
foreach ($name in $names) {
    if (!$build.Contains('COPY overrides/' + $name)) {
        throw 'The existing Dockerfile must explicitly install ' + $name
    }
    $from = Join-Path $PSScriptRoot $name
    $to = Join-Path $overrides $name
    if (!(Test-Path -LiteralPath $from -PathType Leaf)) {
        throw 'Canonical patch is absent: ' + $name
    }
    if (Test-Path -LiteralPath $to -PathType Leaf) {
        $sourceHash = (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash
        if ($sourceHash -ne $targetHash) {
            throw 'Existing local changes differ; refusing overwrite: ' + $name
        }
        Write-Output ('UNCHANGED ' + $name)
    } else {
        Copy-Item -LiteralPath $from -Destination $to -ErrorAction Stop
        Write-Output ('INSTALLED ' + $name)
    }
}
Write-Output 'CHAMILO_QA_PATCH_SOURCES_VERIFIED'