param([switch]$Offline, [switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repo '.venv/Scripts/python.exe'
$buildRoot = Join-Path $repo 'build'
$wheelhouse = Join-Path $buildRoot 'analyzer-wheels'

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
}

Push-Location $repo
try {
    if (-not (Test-Path -LiteralPath $venvPython)) {
        $basePython = $null
        try {
            $candidate = & py -3.13 -c 'import sys; print(sys.executable)' 2>$null
            if ($LASTEXITCODE -eq 0 -and $candidate -and (Test-Path -LiteralPath $candidate)) {
                $basePython = [string]$candidate
            }
        } catch { } # Stale Windows Python registrations are common.
        if (-not $basePython) {
            $basePython = Join-Path $buildRoot 'python313/python.exe'
            if (-not (Test-Path -LiteralPath $basePython)) {
                # Python Install Manager --target extracts locally without registration.
                Invoke-Checked 'py' @('install', "--target=$(Join-Path $buildRoot 'python313')", '3.13')
            }
        }
        Invoke-Checked $basePython @('-m', 'venv', (Join-Path $repo '.venv'))
    }
    Invoke-Checked $venvPython @('-c', 'import sys; assert sys.version_info[:2] == (3, 13), "Python 3.13 is required"')
    if (-not $SkipInstall) {
        New-Item -ItemType Directory -Force -Path $wheelhouse | Out-Null
        $requirements = Join-Path $repo 'analyzer/requirements.txt'
        if (-not $Offline) {
            Invoke-Checked $venvPython @('-m', 'pip', 'download', '--only-binary=:all:', '--dest', $wheelhouse, '-r', $requirements)
        }
        Invoke-Checked $venvPython @('-m', 'pip', 'install', '--no-index', '--find-links', $wheelhouse, '-r', $requirements)
    }
    Invoke-Checked $venvPython @('-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_analyzer.py', '-v')
    Invoke-Checked $venvPython @('-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
        '--name', 'smartshuffle-analyzer', '--distpath', (Join-Path $buildRoot 'analyzer'),
        '--workpath', (Join-Path $buildRoot 'analyzer-work'), '--specpath', (Join-Path $buildRoot 'analyzer-spec'),
        '--paths', $repo, '--collect-all', 'librosa', '--collect-all', 'soundfile', '--collect-all', 'soxr',
        '--collect-all', 'sudachipy', '--collect-all', 'sudachidict_small', '--collect-all', 'pypinyin', '--collect-all', 'jaconv',
        '--hidden-import', 'analyzer.metadata', '--hidden-import', 'analyzer.core', '--exclude-module', 'matplotlib', '--exclude-module', 'tkinter',
        (Join-Path $repo 'analyzer/__main__.py'))
    $exe = Join-Path $buildRoot 'analyzer/smartshuffle-analyzer/smartshuffle-analyzer.exe'
    $previousExecutable = $env:SMARTSHUFFLE_ANALYZER_EXE
    try {
        $env:SMARTSHUFFLE_ANALYZER_EXE = $exe
        Invoke-Checked $venvPython @('-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_analyzer.py', '-v')
    } finally {
        $env:SMARTSHUFFLE_ANALYZER_EXE = $previousExecutable
    }
    Write-Host "Portable analyzer built and CLI-tested: $exe"
} finally { Pop-Location }
