[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$FoobarRoot,[switch]$NoLaunch,[ValidateSet('full','core')][string]$Edition)
$ErrorActionPreference='Stop'
$editionFile=Join-Path (Split-Path -Parent $PSScriptRoot) 'edition.json'
if(-not $Edition){$Edition=if(Test-Path -LiteralPath $editionFile){(Get-Content -LiteralPath $editionFile -Raw | ConvertFrom-Json).edition}else{'full'}}
$profile=Join-Path ([IO.Path]::GetFullPath($FoobarRoot)) 'profile'
if($Edition -eq 'full'){foreach($component in @('foo_ui_columns/foo_ui_columns.dll','foo_uie_jsplitter/foo_uie_jsplitter.dll')){
    if(-not (Test-Path -LiteralPath (Join-Path $profile ('user-components-x64/'+$component)))){
        throw "Install Columns UI and compatible JSplitter in the target portable foobar first. Missing: $component. See README.md."
    }
}}
& (Join-Path $PSScriptRoot 'install.ps1') -FoobarRoot $FoobarRoot -SkipESLyric -NoLaunch:$NoLaunch -Edition $Edition
