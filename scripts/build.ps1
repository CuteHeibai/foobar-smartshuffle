[CmdletBinding()]
param([switch]$TestsOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$vs=& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $vs){throw 'Visual Studio C++ tools are required'}
if($TestsOnly){
    $envBat=Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
    Push-Location $repo
    try {
        & cmd.exe /d /c "`"$envBat`" >nul && cl /nologo /std:c++20 /EHsc /MD /O2 /utf-8 /I vendor /I src tests\core_tests.cpp src\core.cpp /Fe:build\core_tests.exe /Fo:build\ && build\core_tests.exe"
        if($LASTEXITCODE){throw "Core tests failed ($LASTEXITCODE)"}
        & cmd.exe /d /c "`"$envBat`" >nul && cl /nologo /std:c++20 /EHsc /MD /O2 /utf-8 /I src tests\focus_policy_tests.cpp user32.lib /Fe:build\focus_policy_tests.exe /Fo:build\focus-policy.obj && build\focus_policy_tests.exe"
        if($LASTEXITCODE){throw "Hover focus tests failed ($LASTEXITCODE)"}
        & cmd.exe /d /c "`"$envBat`" >nul && cl /nologo /std:c++20 /EHsc /MD /O2 /utf-8 /I vendor /I src tests\update_tests.cpp /Fe:build\update_tests.exe /Fo:build\update-policy.obj && build\update_tests.exe"
        if($LASTEXITCODE){throw "Update tests failed ($LASTEXITCODE)"}
    }finally{Pop-Location}
}else{
    & (Join-Path $vs 'MSBuild\Current\Bin\MSBuild.exe') (Join-Path $repo 'foo_smartshuffle.vcxproj') /m /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v143 /p:WindowsTargetPlatformVersion=10.0.22621.0 /v:minimal /nologo
    if($LASTEXITCODE){throw "Native build failed ($LASTEXITCODE)"}
}
