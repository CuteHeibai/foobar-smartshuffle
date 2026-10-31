$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$python=Join-Path $repo '.venv/Scripts/python.exe'
if(-not (Test-Path -LiteralPath $python)){throw 'Build the analyzer first with scripts/build-analyzer.ps1'}
& $python (Join-Path $PSScriptRoot 'package_public.py')
if($LASTEXITCODE){throw 'Public packaging failed'}
