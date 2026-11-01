$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$dist=Join-Path $repo 'dist'
$payload=Join-Path $dist 'payload'
$analyzer=Join-Path $repo 'build\analyzer\smartshuffle-analyzer'
if(-not (Test-Path -LiteralPath (Join-Path $analyzer 'smartshuffle-analyzer.exe'))){throw 'Build the standalone analyzer first'}
if(-not (Test-Path -LiteralPath (Join-Path $repo 'build\foo_smartshuffle.dll'))){throw 'Build the component first'}
New-Item -ItemType Directory -Path $dist -Force | Out-Null
if(Test-Path -LiteralPath $payload){
    $resolved=[IO.Path]::GetFullPath($payload)
    if(-not $resolved.StartsWith([IO.Path]::GetFullPath($repo)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Payload escaped project'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $payload 'components\foo_smartshuffle'),(Join-Path $payload 'components\eslyric-warp'),(Join-Path $payload 'runtime'),(Join-Path $payload 'theme'),(Join-Path $payload 'config'),(Join-Path $payload 'control') -Force | Out-Null
foreach($name in @('switch-mode.ps1','switch_mode.py','profile_style.py')){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $payload 'control')
}
New-Item -ItemType Directory -Path (Join-Path $payload 'update-helper') -Force | Out-Null
foreach($name in @('update_apply.py','update-and-restart.ps1','install.py','switch_mode.py','profile_style.py')){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $payload 'update-helper')
}
Copy-Item -LiteralPath (Join-Path $repo 'build\foo_smartshuffle.dll') -Destination (Join-Path $payload 'components\foo_smartshuffle')
Copy-Item -LiteralPath (Join-Path $repo 'build\eslyric\foo_uie_eslyric.dll') -Destination (Join-Path $payload 'components\eslyric-warp')
Copy-Item -LiteralPath $analyzer -Destination (Join-Path $payload 'runtime') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'assets\fonts') -Destination (Join-Path $payload 'fonts') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'theme\verdant') -Destination (Join-Path $payload 'theme') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'vendor\verdant-foobar2000-theme-master\components\foo_ui_columns') -Destination (Join-Path $payload 'components') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'vendor\verdant-foobar2000-theme-master\components\foo_ui_wizard') -Destination (Join-Path $payload 'components') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'vendor\verdant-foobar2000-theme-master\dist-config\foo_ui_columns.dll.cfg') -Destination (Join-Path $payload 'config')
$component=Join-Path $dist 'foo_smartshuffle.fb2k-component'
if(Test-Path -LiteralPath $component){Remove-Item -LiteralPath $component -Force}
Compress-Archive -LiteralPath (Join-Path $repo 'build\foo_smartshuffle.dll'),(Join-Path $repo 'assets\fonts'),(Join-Path $payload 'update-helper') -DestinationPath (Join-Path $dist 'foo_smartshuffle.zip') -Force
Move-Item -LiteralPath (Join-Path $dist 'foo_smartshuffle.zip') -Destination $component -Force
# Include source and reproducible scripts, but never private listening data or the SDK archive.
$delivery=Join-Path $dist 'foobar-smartshuffle-local'
if(Test-Path -LiteralPath $delivery){
    $resolved=[IO.Path]::GetFullPath($delivery)
    if(-not $resolved.StartsWith([IO.Path]::GetFullPath($repo)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Delivery escaped project'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Path $delivery -Force | Out-Null
Copy-Item -LiteralPath $payload -Destination $delivery -Recurse
foreach($name in @('src','analyzer','scripts','tests','docs','theme','assets','AGENTS.md','foo_smartshuffle.vcxproj','fixture.vcxproj','README.md','.gitignore')){
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $delivery -Recurse -Force
}
Get-ChildItem -LiteralPath $delivery -Directory -Filter '__pycache__' -Recurse | ForEach-Object {
    $resolved=$_.FullName
    if(-not $resolved.StartsWith([IO.Path]::GetFullPath($delivery)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Cache escaped delivery'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Compress-Archive -LiteralPath $delivery -DestinationPath (Join-Path $dist 'foobar-smartshuffle-local.zip') -Force
Write-Host (Join-Path $dist 'foobar-smartshuffle-local.zip')
