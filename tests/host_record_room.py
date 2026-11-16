"""Capture actual JSplitter GDI frames using only the disposable test-player."""
import argparse
import json
import sqlite3
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
PLAYER = ROOT / 'test-player'
PROFILE = PLAYER / 'profile'
OUT = ROOT / 'build/record-room'
APP = PROFILE / 'verdant/app.js'
SCRIPT = APP.with_name('record-room-host-check.js')
BACKUP = OUT / 'app.original'
RESULT = OUT / 'acceptance.json'


def prepare():
    if BACKUP.exists():
        raise RuntimeError('Previous capture needs --restore before preparation')
    (OUT / 'screens').mkdir(parents=True, exist_ok=True)
    BACKUP.write_bytes(APP.read_bytes())
    RESULT.unlink(missing_ok=True)
    config = 'var RR_OUTPUT=' + json.dumps(str(OUT) + '\\') + ';\n'
    SCRIPT.write_text(config + (ROOT / 'tests/host_record_room.js').read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
    APP.write_text(BACKUP.read_bytes().decode('utf-8-sig') + "\ninclude('record-room-host-check.js');\n", encoding='utf-8-sig')


def collect(timeout):
    until = time.monotonic() + timeout
    while not RESULT.exists() and time.monotonic() < until:
        time.sleep(.1)
    result = json.loads(RESULT.read_text(encoding='utf-8-sig'))
    assert result['ok'], result
    for capture in result['captures']:
        path = OUT / 'screens' / capture['file']
        assert path.exists() and path.stat().st_size > 1000, path
    print('PASS', len(result['checks']), 'checks;', len(result['captures']), 'real GDI screenshots:', OUT)


def restore():
    if BACKUP.exists():
        APP.write_bytes(BACKUP.read_bytes())
        BACKUP.unlink()
    SCRIPT.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--collect-only', action='store_true')
    parser.add_argument('--restore', action='store_true')
    parser.add_argument('--timeout', type=float, default=150)
    args = parser.parse_args()
    if args.restore:
        restore()
        return
    if args.collect_only:
        collect(args.timeout)
        return
    # Refuse to attach to an already running instance, including the everyday player.
    running = subprocess.check_output(['powershell', '-NoProfile', '-Command', "Get-Process foobar2000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0"], text=True)
    if running.strip():
        raise RuntimeError('Close existing foobar processes before isolated capture: ' + running.strip())
    with sqlite3.connect((PROFILE / 'config.sqlite').resolve().as_uri() + '?mode=ro', uri=True) as database:
        output = database.execute("SELECT value FROM configStrings WHERE name='core.output.mode'").fetchone()
        assert output and output[0].strip('{}').upper() == 'EEEB07DE-C2C8-44C2-985C-C85856D96DA1', 'Disposable null output required'
    prepare()
    if args.prepare_only:
        print('Prepared', SCRIPT)
        return
    process = None
    try:
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        process = subprocess.Popen([str(PLAYER / 'foobar2000.exe')], startupinfo=startup)
        sys.path.insert(0, str(ROOT / 'scripts'))
        from bridge import Bridge
        bridge = Bridge(PROFILE)
        bridge.wait(lambda state: state.get('pid') == process.pid)
        reply = bridge.request('listening_stats', **{'from': '2000-01-01', 'to': '2099-12-31', 'offset': 0, 'limit': 20})
        assert reply.get('response', {}).get('stats') is not None, reply
        (OUT / 'native-stats.json').write_text(json.dumps(reply, ensure_ascii=False, indent=2), encoding='utf-8')
        collect(args.timeout)
    finally:
        if process is not None and process.poll() is None:
            subprocess.run([str(PLAYER / 'foobar2000.exe'), '/exit'], check=True)
            process.wait(timeout=20)
        restore()


if __name__ == '__main__':
    main()
