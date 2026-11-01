[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$FoobarRoot,
    [ValidateSet('original','themed','toggle')][string]$Mode='toggle'
)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($FoobarRoot)
$exe=Join-Path $target 'foobar2000.exe'
$backend=Join-Path $PSScriptRoot 'switch_mode.py'
function Get-IntegrationMode {
    $flag=Join-Path $target 'profile\smartshuffle\integration-mode.json'
    try {
        $state=Get-Content -LiteralPath $flag -Raw | ConvertFrom-Json
        if($state.mode -in @('original','themed')){return $state.mode}
    } catch {}
    return $null
}
function Write-IntegrationResult([bool]$Ok,[string]$ActiveMode,[string]$Failure) {
    # Diagnostic writes have the same target boundary as appearance writes.
    $cursor=$target
    while($cursor){
        if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe integration result target'}
        $parent=Split-Path -Parent $cursor
        if($parent -eq $cursor){break}
        $cursor=$parent
    }
    $directory=$target
    foreach($part in @('profile','smartshuffle')){
        $directory=Join-Path $directory $part
        if(Test-Path -LiteralPath $directory){
            if((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe integration result directory'}
        } else {[void](New-Item -ItemType Directory -Path $directory)}
    }
    $path=Join-Path $directory 'integration-switch-result.json'
    $temporary=$path+'.tmp'
    foreach($candidate in @($path,$temporary)){
        if((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe integration result file'}
    }
    $result=@{ok=$Ok;mode=$(if($ActiveMode){$ActiveMode}else{$null});error=$(if($Failure){$Failure}else{$null});timestamp=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($temporary,($result | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $path -Force
}
$restart=$false
try {
    if(-not (Test-Path -LiteralPath $exe -PathType Leaf)){throw 'The target foobar2000 executable is missing'}
    if(-not (Test-Path -LiteralPath $backend -PathType Leaf)){throw 'The integration switch backend is missing'}
    # Resolve the existing installation dependency before closing a user session.
    $python=(Get-Command python -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $players=@(Get-Process -Name foobar2000 -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and [string]::Equals([IO.Path]::GetFullPath($_.Path),$exe,[StringComparison]::OrdinalIgnoreCase)
    })
    if($players.Count){
        & $exe /exit
        $players | Wait-Process -Timeout 30 -ErrorAction Stop
    }
    $restart=$true
    $previousErrorAction=$ErrorActionPreference
    try {
        # Windows PowerShell presents redirected native stderr as ErrorRecords.
        # Collect all lines so hidden launches retain the actual backend error.
        $ErrorActionPreference='Continue'
        $backendOutput=@(& $python $backend --target $target --mode $Mode 2>&1)
        $backendExitCode=$LASTEXITCODE
    } finally {$ErrorActionPreference=$previousErrorAction}
    $outputText=($backendOutput | ForEach-Object {$_.ToString()}) -join [Environment]::NewLine
    if($backendExitCode -ne 0){throw "Integration switch failed ($backendExitCode): $outputText"}
    $activeMode=$outputText.Trim()
    if($activeMode -notin @('original','themed')){$activeMode=Get-IntegrationMode}
    Write-IntegrationResult $true $activeMode $null
} catch {
    $failure=$_
    Write-IntegrationResult $false (Get-IntegrationMode) $failure.Exception.Message
    throw $failure
} finally {
    if($restart){Start-Process -FilePath $exe -ArgumentList '/show' -WorkingDirectory $target}
}
