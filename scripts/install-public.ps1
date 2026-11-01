[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$FoobarRoot,[switch]$NoLaunch,[ValidateSet('full','core')][string]$Edition)
$ErrorActionPreference='Stop'
$editionFile=Join-Path (Split-Path -Parent $PSScriptRoot) 'edition.json'
if(-not $Edition){$Edition=if(Test-Path -LiteralPath $editionFile){(Get-Content -LiteralPath $editionFile -Raw | ConvertFrom-Json).edition}else{'full'}}
$profile=Join-Path ([IO.Path]::GetFullPath($FoobarRoot)) 'profile'
function Test-SavedThemedColumns {
    # Original mode deliberately removes project-added Columns UI. Validate its
    # saved branch read-only; the offline installer restores it before upgrading.
    $validation=@'
import json
from pathlib import Path
import sys
sys.path.insert(0, sys.argv[1])
from switch_mode import _layout, _child, _load_branch
try:
    target, profile, data, flag = _layout(sys.argv[2])
    state = json.loads(flag.read_text(encoding='utf-8'))
    baseline = json.loads(_child(data, 'baseline.json').read_text(encoding='utf-8'))
    if state.get('version') != 1 or state.get('mode') != 'original':
        raise ValueError('Expected original integration mode')
    if baseline.get('version') != 1 or baseline.get('target') != str(target):
        raise ValueError('Saved appearance belongs to another target')
    _load_branch(_child(data, 'original'))
    themed = _child(data, 'themed')
    files, _ = _load_branch(themed)
    component = _child(themed, 'files/user-components-x64/foo_ui_columns/foo_ui_columns.dll')
    if not files['user-components-x64/foo_ui_columns'] or not component.is_file():
        raise ValueError('Saved themed Columns UI is missing')
except Exception:
    sys.exit(1)
'@
    $previousErrorAction=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $null=& python -c $validation $PSScriptRoot $FoobarRoot 2>&1
        return $LASTEXITCODE -eq 0
    } catch {return $false} finally {$ErrorActionPreference=$previousErrorAction}
}
if($Edition -eq 'full'){foreach($component in @('foo_ui_columns/foo_ui_columns.dll','foo_uie_jsplitter/foo_uie_jsplitter.dll')){
    if(-not (Test-Path -LiteralPath (Join-Path $profile ('user-components-x64/'+$component)))){
        if($component -eq 'foo_ui_columns/foo_ui_columns.dll' -and (Test-SavedThemedColumns)){continue}
        throw "Install Columns UI and compatible JSplitter in the target portable foobar first. Missing: $component. See README.md."
    }
}}
& (Join-Path $PSScriptRoot 'install.ps1') -FoobarRoot $FoobarRoot -SkipESLyric -NoLaunch:$NoLaunch -Edition $Edition
