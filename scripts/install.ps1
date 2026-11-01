[CmdletBinding()]
param([string]$FoobarRoot='C:\Program Files\foobar2000',[switch]$SkipESLyric,[switch]$NoLaunch,[ValidateSet('full','core')][string]$Edition='full')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$payload=Join-Path $repo 'payload'
if(-not (Test-Path -LiteralPath $payload)){$payload=Join-Path $repo 'dist\payload'}
if(-not (Test-Path -LiteralPath $payload)){throw 'Run scripts/package.ps1 first'}
$exe=Join-Path ([IO.Path]::GetFullPath($FoobarRoot)) 'foobar2000.exe'
$players=Get-Process -Name foobar2000 -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $exe}
if($players){& $exe /exit; $players | Wait-Process -Timeout 20 -ErrorAction Stop}
$argsForInstall=@((Join-Path $PSScriptRoot 'install.py'),'--payload',$payload,'--target',$FoobarRoot,'--edition',$Edition)
if($SkipESLyric){$argsForInstall+='--skip-eslyric'}
& python @argsForInstall
if($LASTEXITCODE){throw "Install failed ($LASTEXITCODE)"}
if(-not $NoLaunch){Start-Process -FilePath $exe -ArgumentList '/show'}
