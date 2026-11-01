[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$FoobarRoot,
    [Parameter(Mandatory=$true)][string]$Job,
    [Parameter(Mandatory=$true)][int]$ParentPid
)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($FoobarRoot).TrimEnd('\','/')
$jobDirectory=[IO.Path]::GetFullPath($Job).TrimEnd('\','/')
$exe=Join-Path $target 'foobar2000.exe'
$backend=Join-Path $PSScriptRoot 'update_apply.py'
$document=$null
$boundaryValidated=$false
$restart=$false
$failure=$null

function Assert-NoUpdateLinks([string]$Path) {
    $cursor=[IO.Path]::GetFullPath($Path)
    while($cursor){
        if(Test-Path -LiteralPath $cursor){
            if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){
                throw ('Unsafe update link or reparse point: '+$cursor)
            }
        }
        $parent=Split-Path -Parent $cursor
        if($parent -eq $cursor){break}
        $cursor=$parent
    }
}

function Write-UpdateResult([string]$Message) {
    if(-not $boundaryValidated){return}
    $directory=Join-Path $target 'profile/smartshuffle'
    $path=Join-Path $directory 'update-result.json'
    $temporary=$path+'.tmp'
    Assert-NoUpdateLinks $directory
    Assert-NoUpdateLinks $path
    Assert-NoUpdateLinks $temporary
    $backup=$null
    if(Test-Path -LiteralPath $path){
        try {
            $previous=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
            if($previous.job -eq $jobDirectory){$backup=$previous.backup}
        } catch {}
    }
    $report=@{ok=$false;version=$document.release.version;edition=$document.edition;job=$jobDirectory;
              error=$Message.Substring(0,[Math]::Min(4096,$Message.Length));backup=$backup;timestamp=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($temporary,($report | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Get-ExactParent {
    $parent=Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
    if(-not $parent){return $null}
    if(-not $parent.Path -or -not [string]::Equals([IO.Path]::GetFullPath($parent.Path),$exe,[StringComparison]::OrdinalIgnoreCase)){
        throw 'Update parent PID does not belong to the exact target executable'
    }
    return $parent
}

function Invoke-UpdateBackend([string]$Phase) {
    $previousAction=$ErrorActionPreference
    try {
        # Collect native stderr under Windows PowerShell without losing its text.
        $ErrorActionPreference='Continue'
        $output=@(& $python $backend $Phase --target $target --job $jobDirectory 2>&1)
        $code=$LASTEXITCODE
    } finally {$ErrorActionPreference=$previousAction}
    if($code -ne 0){
        $details=($output | ForEach-Object {$_.ToString()}) -join [Environment]::NewLine
        throw ('Update '+$Phase+' failed ('+$code+'): '+$details)
    }
}

try {
    Assert-NoUpdateLinks $target
    Assert-NoUpdateLinks $jobDirectory
    Assert-NoUpdateLinks $exe
    Assert-NoUpdateLinks (Join-Path $target 'portable_mode_enabled')
    if(-not (Test-Path -LiteralPath $exe -PathType Leaf) -or
       -not (Test-Path -LiteralPath (Join-Path $target 'portable_mode_enabled') -PathType Leaf)){
        throw 'A marked portable foobar2000 target is required'
    }
    $owner=Join-Path $target 'profile/smartshuffle/updates'
    if(-not [string]::Equals((Split-Path -Parent $jobDirectory),$owner,[StringComparison]::OrdinalIgnoreCase) -or
       (Split-Path -Leaf $jobDirectory) -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'){
        throw 'Update job is outside its owned directory'
    }
    $jobFile=Join-Path $jobDirectory 'job.json'
    Assert-NoUpdateLinks $jobFile
    if((Get-Item -LiteralPath $jobFile).Length -gt 8388608){throw 'Update job exceeds the size limit'}
    $document=Get-Content -LiteralPath $jobFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if($document.version -ne 1 -or -not [string]::Equals($document.target,$target,[StringComparison]::OrdinalIgnoreCase) -or
       $document.edition -notin @('full','core')){throw 'Invalid update job target or schema'}
    $boundaryValidated=$true
    if($ParentPid -le 0 -or $document.pid -ne $ParentPid){throw 'Update parent PID differs from the job'}
    foreach($name in @('update_apply.py','install.py','switch_mode.py','profile_style.py')){
        $helper=Join-Path $PSScriptRoot $name
        Assert-NoUpdateLinks $helper
        if(-not (Test-Path -LiteralPath $helper -PathType Leaf)){throw ('Trusted update helper is missing: '+$name)}
    }
    # Resolve and check Python before requesting a normal player exit.
    $python=$null
    foreach($command in @('python','python3')){
        try {
            $candidate=(Get-Command $command -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
            if(-not $candidate -or $candidate -match '\\WindowsApps\\'){continue}
            $previousAction=$ErrorActionPreference
            try {
                $ErrorActionPreference='Continue'
                $probe=@(& $candidate -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>&1)
                $probeCode=$LASTEXITCODE
            } finally {$ErrorActionPreference=$previousAction}
            if($probeCode -eq 0){$python=$candidate;break}
        } catch {}
    }
    if(-not $python){throw 'A local Python 3.10 or newer is required to update; the player remains open'}
    $parent=Get-ExactParent
    if(-not $parent){throw 'The original target player has already exited; launch the update again'}
    Invoke-UpdateBackend '--prepare'
    # Re-check the identity after extraction: a stale/reused PID cannot close a
    # different player. The process is asked to exit normally, never terminated.
    $parent=Get-ExactParent
    if(-not $parent){throw 'The original target player exited before the update was ready'}
    Start-Process -FilePath $exe -ArgumentList '/exit' -WorkingDirectory $target -WindowStyle Hidden
    try {
        Wait-Process -Id $ParentPid -Timeout 30 -ErrorAction Stop
    } catch {
        # A timeout is not permission to replace files or launch a second player.
        # A normal fast exit can precede Wait-Process's initial PID lookup.
        # Continue when the exact old player has gone; retain genuine failures
        # while it remains alive.
        if(Get-ExactParent){throw}
    }
    if(Get-ExactParent){throw 'Target player did not exit; update was not applied'}
    $restart=$true
    Invoke-UpdateBackend '--apply'
} catch {
    $failure=$_
    Write-UpdateResult $failure.Exception.Message
} finally {
    if($restart){
        try {Start-Process -FilePath $exe -ArgumentList '/show' -WorkingDirectory $target}
        catch {
            $restartError=$_.Exception.Message
            if($failure){$restartError=$failure.Exception.Message+'; restart failed: '+$restartError}
            else {$restartError='Update installed but restart failed: '+$restartError}
            Write-UpdateResult $restartError
            $failure=$_
        }
    }
}
if($failure){throw $failure}
