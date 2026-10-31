"""Recycle only uniquely created fixture audio under build; never user music."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
import wave

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / 'test-player/profile'
sys.path.insert(0, str(ROOT / 'scripts'))
from bridge import Bridge
b = Bridge(PROFILE)


def fixture(op, **fields):
    q = dict(id=uuid.uuid4().hex, op=op, **fields)
    temporary = PROFILE / 'fixture-temp.json'
    temporary.write_text(json.dumps(q), encoding='utf-8')
    os.replace(temporary, PROFILE / 'fixture-request.json')
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
before = b.request('state')
media = (ROOT / 'build/fixture-media').resolve()
media.mkdir(exist_ok=True)
key = uuid.uuid4().hex
song = media / ('回收测试-' + key + '.wav')
neighbor = media / ('keep-' + key + '.wav')
cue = media / ('cue-' + key + '.cue')
for path in (song, neighbor):
    assert path.parent == media and path.is_relative_to(ROOT)
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, 16000, 3200, 'NONE', 'not compressed'))
        output.writeframes(b'\0\0' * 3200)
setup = fixture('setup', files=['file://' + str(song), 'file://' + str(neighbor)], name='Recycle acceptance ' + key)
ids = fixture('items', playlist=setup['playlist'])['items']
prepared = b.request('recycle_prepare', track_id=ids[0])['response']['recycle']
assert song.exists() and Path(prepared['path']) == song
token = prepared['token']
b.request('recycle_cancel')
assert not b.request('recycle_apply', token=token)['response']['ok'] and song.exists()
print('PASS Preparation and cancellation leave the physical audio file intact', flush=True)
token = b.request('recycle_prepare', track_id=ids[0])['response']['recycle']['token']
with song.open('ab') as output:
    output.write(b'\0\0')
assert not b.request('recycle_apply', token=token)['response']['ok'] and song.exists()
print('PASS A changed file invalidates the previous confirmation token', flush=True)
cue.write_text('FILE "' + neighbor.name + '" WAVE\n', encoding='utf-8')
assert not b.request('recycle_prepare', track_id='file://' + str(cue) + '|1')['response']['ok']
assert not b.request('recycle_prepare', track_id='file://' + str(media) + '|0')['response']['ok']
assert cue.exists() and neighbor.exists() and media.is_dir()
print('PASS External CUE and directories are refused without touching referenced files', flush=True)
fixture('queue', playlist=setup['playlist'], item=0)
token = b.request('recycle_prepare', track_id=ids[0])['response']['recycle']['token']
result = b.request('recycle_apply', token=token)
assert result['response'].get('recycled'), result['response']
assert not song.exists() and neighbor.exists() and media.is_dir()
assert fixture('items', playlist=setup['playlist'])['items'] == [ids[1]]
assert fixture('status')['queue'] == 0
after = b.request('state')
assert all(after[k] == before[k] for k in ['source', 'round', 'point'])
print('PASS Windows confirms the fixture file entered Recycle Bin; only its queue/playlist references are removed', flush=True)
assert not b.request('recycle_apply', token=token)['response']['ok']
print('PASS A completed recycle token cannot be applied twice', flush=True)
fixture('cleanup')
neighbor.unlink()
cue.unlink()
(ROOT / 'build/recycle-acceptance.json').write_text(json.dumps({'count': 5, 'fixture': str(song)}, indent=2), encoding='utf-8')
