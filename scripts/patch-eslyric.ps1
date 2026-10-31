[CmdletBinding()]
param(
    [string]$SourcePath = 'C:\Program Files\foobar2000\profile\user-components-x64\foo_uie_eslyric\foo_uie_eslyric.dll'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This version-specific experiment only writes project build artifacts.
$expectedHash = 'AC2E2C8FA2A481C8C217CE53D57F2BD8582C771BF75DEAB888207E43AF43C583'
$expectedVersion = '1.0.6.7'
$expectedLength = 5830144
$contextOffset = 0x2600b
[byte[]]$expectedContext = 0x45,0x8d,0x4e,0x20,0x45,0x33,0xc0,0x41,0x8d,0x50,0x01,0x33,0xc9,0xff,0x15,0x5a,0xbf,0x41,0x00
$patchOffset = 0x26015
$source = (Resolve-Path -LiteralPath $SourcePath).ProviderPath
$outputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\eslyric'
$originalPath = Join-Path $outputDirectory 'foo_uie_eslyric.original.dll'
$patchedPath = Join-Path $outputDirectory 'foo_uie_eslyric.dll'

foreach ($destination in @($originalPath, $patchedPath)) {
    if ([IO.Path]::GetFullPath($destination).Equals([IO.Path]::GetFullPath($source), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Source must be outside the generated artifact paths; installed input is never overwritten.'
    }
}

$version = [Diagnostics.FileVersionInfo]::GetVersionInfo($source)
if ($version.FileVersion -ne $expectedVersion -or $version.ProductVersion -ne $expectedVersion) {
    throw "Unsupported ESLyric version: $($version.FileVersion) / $($version.ProductVersion). Expected $expectedVersion."
}
$signature = Get-AuthenticodeSignature -LiteralPath $source
if ($signature.Status.ToString() -ne 'NotSigned') {
    throw "Unexpected Authenticode status: $($signature.Status). This exact original was unsigned."
}
[byte[]]$original = [IO.File]::ReadAllBytes($source)
if ($original.Length -ne $expectedLength) { throw "Unexpected DLL length: $($original.Length)." }

function Get-BytesSha256([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '') }
    finally { $sha.Dispose() }
}

if ((Get-BytesSha256 $original) -ne $expectedHash) { throw 'Source SHA-256 mismatch; refusing version-specific patch.' }
for ($index = 0; $index -lt $expectedContext.Length; $index++) {
    if ($original[$contextOffset + $index] -ne $expectedContext[$index]) {
        throw ('Instruction context mismatch at file offset 0x{0:x}.' -f ($contextOffset + $index))
    }
}
[byte[]]$patched = $original.Clone()
$patched[$patchOffset] = 0x05
$patchedHash = Get-BytesSha256 $patched

# Validate existing outputs before writing. Reruns accept only identical artifacts.
foreach ($entry in @(
    @{ Path = $originalPath; Hash = $expectedHash },
    @{ Path = $patchedPath; Hash = $patchedHash }
)) {
    if ((Test-Path -LiteralPath $entry.Path) -and (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash -ne $entry.Hash) {
        throw "Existing artifact differs; refusing to overwrite: $($entry.Path)"
    }
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $originalPath)) { [IO.File]::WriteAllBytes($originalPath, $original) }
if (-not (Test-Path -LiteralPath $patchedPath)) { [IO.File]::WriteAllBytes($patchedPath, $patched) }

if ((Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash -ne $expectedHash -or
    (Get-FileHash -LiteralPath $patchedPath -Algorithm SHA256).Hash -ne $patchedHash -or
    (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Post-write verification failed; do not install the output.'
}
[pscustomobject]@{
    Source = $source
    SourceUnchanged = $true
    OriginalCopy = $originalPath
    PatchedCopy = $patchedPath
    OriginalSHA256 = $expectedHash.ToLowerInvariant()
    PatchedSHA256 = $patchedHash.ToLowerInvariant()
    FileVersion = $expectedVersion
    OriginalAuthenticodeStatus = $signature.Status.ToString()
    ChangedByteOffset = '0x26015'
    Change = '01 -> 05 (D3D_DRIVER_TYPE_HARDWARE -> D3D_DRIVER_TYPE_WARP)'
    RuntimeResult = 'Not tested by this script; NVIDIA overlay behavior remains unverified.'
}
