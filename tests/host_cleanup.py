"""Remove only known disposable test playlists and verify runtime temporary-list cleanup."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / 'test-player/profile'
sys.path.insert(0, str(ROOT / 'scripts'))
from bridge import Bridge
b = Bridge(PROFILE)


def fixture(op, **fields):
    q = dict(id=uuid.uuid4().hex, op=op, **fields)
    temp = PROFILE / 'fixture-temp.json'
    temp.write_text(json.dumps(q), encoding='utf-8')
    os.replace(temp, PROFILE / 'fixture-request.json')
    until = time.monotonic() + 12
    while time.monotonic() < until:
        try:
            result = json.loads((PROFILE / 'fixture-response.json').read_text(encoding='utf-8'))
            if result.get('id') == q['id']:
                assert result.get('ok'), result
                return result
        except (OSError, ValueError):
            pass
        time.sleep(.03)
    raise TimeoutError(op)


subprocess.run([str(ROOT / 'test-player/foobar2000.exe'), '/stop'], check=True)
time.sleep(.2)
music = next(p['index'] for p in fixture('status')['names'] if p['name'] == 'Music')
original = fixture('items', playlist=music)['items']
setup = fixture('setup', files=[s.rsplit('|', 1)[0] for s in original[:3]], name='__verdant_np__')
b.request('playback_mode', mode='smart')
b.request('play', playlist=setup['playlist'], item=0)
b.wait(lambda s: s['source_name'] == '__verdant_np__' and s['now_id'] == original[0])
assert any(p['name'] == '__verdant_np__' for p in fixture('status')['names'])
print('PASS Temporary source is retained while it supplies active playback', flush=True)
subprocess.run([str(ROOT / 'test-player/foobar2000.exe'), '/stop'], check=True)
until = time.monotonic() + 10
while time.monotonic() < until:
    names = [p['name'] for p in fixture('status')['names']]
    if '__verdant_np__' not in names and '__smartshuffle__' not in names:
        break
assert '__verdant_np__' not in names and '__smartshuffle__' not in names
print('PASS Stop removes the completed temporary source and managed playback list', flush=True)
removed = fixture('cleanup')['removed']
names = fixture('status')['names']
music = next(p['index'] for p in names if p['name'] == 'Music')
assert fixture('items', playlist=music)['items'] == original
assert not any(p['name'].startswith(('Mode acceptance ', 'Failed prefix ', 'All failed ', 'SmartShuffle ')) for p in names)
print('PASS Disposable acceptance playlists removed; original Music contents remain identical', flush=True)
(ROOT / 'build/cleanup-acceptance.json').write_text(json.dumps({'count': 3, 'removed': removed}, indent=2))
