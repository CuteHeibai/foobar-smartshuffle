"""Round-trip via native SDK menu in test-player; no desktop input or user host access.

Requires --original-backup pointing at a verified pre-install backup. Only its
appearance files and database are copied into a disposable baseline fixture.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'test-player'
PROFILE = TARGET / 'profile'
sys.path.insert(0, str(ROOT / 'scripts'))
from bridge import Bridge
import switch_mode

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--original-backup', required=True, type=Path)
args = parser.parse_args()
assert TARGET.name == 'test-player' and TARGET.parent == ROOT
b = Bridge(PROFILE)
checks = []


def check(value, name):
    assert value, name
    checks.append(name)
    print('PASS', name, flush=True)


def fixture(op, **fields):
    request = {'id': uuid.uuid4().hex, 'op': op, **fields}
    temp = PROFILE / 'fixture-temp.json'
    temp.write_text(json.dumps(request), encoding='utf-8')
    os.replace(temp, PROFILE / 'fixture-request.json')
    until = time.monotonic() + 12
    while time.monotonic() < until:
        try:
            result = json.loads((PROFILE / 'fixture-response.json').read_text(encoding='utf-8'))
            if result.get('id') == request['id']:
                assert result.get('ok'), result
                return result
        except (OSError, ValueError):
            pass
        time.sleep(.05)
    raise TimeoutError(op)


def start():
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    return subprocess.Popen([str(TARGET / 'foobar2000.exe')], startupinfo=startup)


# Backend refuses a running profile before we copy or prepare any fixture.
with switch_mode._locked(PROFILE):
    source = args.original_backup.resolve()
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['version'] == 1
    assert any(e['path'] == 'profile/user-components-x64/foo_smartshuffle' and not e['existed'] for e in manifest['entries'])
    backup = TARGET / 'smartshuffle-backups/integration-original-fixture'
    snapshot = backup / 'profile-snapshot'
    if not snapshot.exists():
        snapshot.mkdir(parents=True)
        for relative in (*switch_mode.APPEARANCE_PATHS, 'config.sqlite'):
            src = source / 'profile-snapshot' / relative
            if src.exists():
                dst = snapshot / relative
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(src, dst) if src.is_dir() else shutil.copy2(src, dst)
        manifest['target'] = str(TARGET)
        (backup / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

control = PROFILE / 'smartshuffle/control'
control.mkdir(parents=True, exist_ok=True)
for name in ('switch-mode.ps1', 'switch_mode.py', 'profile_style.py'):
    shutil.copy2(ROOT / 'scripts' / name, control / name)
(PROFILE / 'smartshuffle/installation.json').write_text('{"edition":"full"}', encoding='utf-8')
switch_mode.prepare(TARGET, backup)
switch_mode.switch_mode(TARGET, 'themed')
process = start()
try:
    before = b.wait(lambda s: s.get('pid') == process.pid and s.get('theme', {}).get('version') == '1.0.15'
                    and s['theme'].get('layout', {}).get('nav'))
    outputs = b.request('outputs')['response']
    check(outputs['active_output'] == '{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}', 'Disposable host remains on null output')
    before_playlists = fixture('status')['names']
    files = [PROFILE / 'smartshuffle' / name for name in ('store.json', 'features.json')]
    store = json.loads(files[0].read_text(encoding='utf-8'))
    menu = fixture('integration_menu')
    check(menu['found'] and not menu['disabled'], 'Native switch menu is available in the themed host')
    fixture('integration_menu', execute=True)
    original = b.wait(lambda s: s.get('integration_mode') == 'original' and s.get('pid') != process.pid, timeout=45)
    check(not original['enabled'] and original['fonts']['private_resources'] == 0 and 'scan' not in original,
          'Original startup omits Engine, scan and private-font loading')
    check(not (PROFILE / 'user-components-x64/foo_ui_columns').exists(), 'Original appearance restores the baseline component set')
    check(fixture('status')['names'] == before_playlists, 'Switching original preserves current playlists')
    check(json.loads(files[0].read_text(encoding='utf-8')) == store, 'Switching original preserves current listening and round data')
    menu = fixture('integration_menu')
    check(menu['found'] and not menu['disabled'], 'Native re-enable menu remains available with Engine inactive')
    fixture('integration_menu', execute=True)
    after = b.wait(lambda s: s.get('pid') not in (process.pid, original['pid']) and s.get('theme', {}).get('version') == '1.0.15'
                   and s['theme'].get('layout', {}).get('nav') and s.get('lyrics_panel', {}).get('visible'), timeout=45)
    check(all(after['theme']['layout'][k] == before['theme']['layout'][k] for k in ('nav', 'right', 'info', 'tools'))
          and after['theme']['appearance'] == before['theme']['appearance'], 'Returning themed restores its own widths and appearance')
    check(fixture('status')['names'] == before_playlists, 'Returning themed preserves current playlists')
    restored = b.request('outputs')['response']
    check((restored['active_output'], restored['active_device']) == (outputs['active_output'], outputs['active_device']),
          'Both switches preserve audio output and device')
    check(after['source'] == before['source'] and after['round'] == before['round'] and after['remaining'] == before['remaining'],
          'Returning themed resumes the saved scheduling round')
finally:
    subprocess.run([str(TARGET / 'foobar2000.exe'), '/exit'], check=True)
    process.wait(timeout=20)
    until = time.monotonic() + 20
    while True:
        try:
            with switch_mode._locked(PROFILE):
                break
        except (ValueError, OSError):
            if time.monotonic() >= until:
                raise
            time.sleep(.1)
(ROOT / 'build/integration-switch-acceptance.json').write_text(json.dumps({'checks': checks}, indent=2), encoding='utf-8')
