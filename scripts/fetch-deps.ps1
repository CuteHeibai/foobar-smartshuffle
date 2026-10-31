$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$vendor=Join-Path $repo 'vendor'
New-Item -ItemType Directory -Path $vendor -Force | Out-Null
if(-not (Test-Path -LiteralPath (Join-Path $vendor 'foobar2000\SDK\foobar2000.h'))){
    Invoke-WebRequest 'https://www.foobar2000.org/downloads/SDK-2025-03-07.7z' -OutFile (Join-Path $vendor 'sdk.7z')
    & tar -xf (Join-Path $vendor 'sdk.7z') -C $vendor
    if($LASTEXITCODE){throw 'SDK extraction failed'}
}
if(-not (Test-Path -LiteralPath (Join-Path $vendor 'json.hpp'))){Invoke-WebRequest 'https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp' -OutFile (Join-Path $vendor 'json.hpp')}
# UI component and layout originals are needed only for making a fresh full payload.
if(-not (Test-Path -LiteralPath (Join-Path $vendor 'verdant-foobar2000-theme-master\dist-config'))){
    Invoke-WebRequest 'https://github.com/superziper/verdant-foobar2000-theme/archive/refs/heads/master.zip' -OutFile (Join-Path $vendor 'verdant.zip')
    Expand-Archive -LiteralPath (Join-Path $vendor 'verdant.zip') -DestinationPath $vendor -Force
}
