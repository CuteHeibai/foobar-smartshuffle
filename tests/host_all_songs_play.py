"""All Songs checks against an ALREADY RUNNING disposable test-player with fixture.

Never launches a host. SS_TEST_PID optionally pins the expected running process.
Uses the actual SDK library with the host already configured for null output.
Only generated queue WAVs are created; no music is changed or removed.
"""
from pathlib import Path
import ctypes
from ctypes import wintypes
import json
import os
import subprocess
import sys
import time
import uuid
import wave

ROOT = Path(__file__).resolve().parents[1]
PROFILE = Path(os.environ.get('SS_LIBRARY_PROFILE', str(ROOT / 'test-player/profile'))).resolve()
assert PROFILE in {(ROOT / 'test-player/profile').resolve(), (ROOT / 'build/core-player/profile').resolve()}, 'Disposable profiles only'
sys.path.insert(0, str(ROOT / 'scripts'))
from bridge import Bridge
b = Bridge(PROFILE)
checks = []


def check(value, name):
    assert value, name
    checks.append(name)
    print('PASS', name, flush=True)


def verify_disposable():
    state = b.wait(lambda s: s.get('pid') == int(os.environ['SS_TEST_PID'])) if os.environ.get('SS_TEST_PID') else b.state()
    pid = state.get('pid', 0)
    if os.environ.get('SS_TEST_PID'):
        assert pid == int(os.environ['SS_TEST_PID']), 'Disposable host PID differs'
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    process = kernel.OpenProcess(0x1000, False, pid)
    assert process, 'Disposable host must already be running'
    try:
        text = ctypes.create_unicode_buffer(32768)
        length = wintypes.DWORD(len(text))
        assert kernel.QueryFullProcessImageNameW(process, 0, text, ctypes.byref(length)), 'Cannot inspect host executable'
        assert Path(text.value).resolve() == (PROFILE.parent / 'foobar2000.exe').resolve(), 'Refusing to touch a non-disposable host'
    finally:
        kernel.CloseHandle(process)
    return pid


def fx(op, **fields):
    q = {'id': uuid.uuid4().hex, 'op': op, **fields}
    pending = PROFILE / 'fixture-request.json'
    temp = pending.with_suffix('.tmp')
    temp.write_text(json.dumps(q), encoding='utf-8')
    os.replace(temp, pending)
    end = time.monotonic() + 12
    while time.monotonic() < end:
        try:
            result = json.loads((PROFILE / 'fixture-response.json').read_text(encoding='utf-8'))
            if result.get('id') == q['id']:
                assert result.get('ok'), result
                return result
        except (OSError, ValueError):
            pass
        time.sleep(.05)
    raise TimeoutError(op)


def call(op, **fields):
    state = b.request(op, **fields)
    assert state['response']['ok'], state['response']
    return state


def ids(state):
    return [t['id'] for t in state['remaining']]


def started(target):
    return b.wait(lambda s: s['now_id'] == target and target not in ids(s))


def queue_ids(state):
    return [t['id'] for t in state['queue']]


def conserve_queue(before, state):
    # Executing a playlist default action may start the queue head immediately.
    # Every original entry must remain in order, except that one audible head.
    after = queue_ids(state)
    return after == before or (bool(before) and after == before[1:] and state['now_id'] == before[0])


def stop():
    # verify_disposable above is required before sending an existing instance its /stop command.
    verify_disposable()
    subprocess.run([str(PROFILE.parent / 'foobar2000.exe'), '/stop'], check=True)
    end = time.monotonic() + 5
    while fx('status')['playing'] and time.monotonic() < end:
        time.sleep(.05)
    assert not fx('status')['playing'], 'Disposable playback did not stop'


def playlist(index):
    return next(p for p in call('state')['playlists'] if p['index'] == index)


verify_disposable()
assert call('outputs')['response']['active_output'] == '{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}', 'Null output is required'
# The caller must configure this disposable host to null output before running.
# This test never edits Media Library folders, tags, source files, or output settings.
library = list(dict.fromkeys(fx('library_items')['items']))
initial = call('state')
if not library:
    rejected = b.request('play_library')
    check(not rejected['response']['ok'] and '没有可播放' in rejected['response'].get('message', '')
          and rejected['source'] == initial['source'],
          'Empty SDK library fails without replacing the selected source')
    print('SKIP populated library playback: disposable SDK library is empty', flush=True)
else:
    media = ROOT / 'build/all-songs-play-fixtures' / uuid.uuid4().hex
    media.mkdir(parents=True, exist_ok=True)
    files = []
    for n in range(2):
        path = media / f'queue-only-{n}.wav'
        with wave.open(str(path), 'wb') as audio:
            audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
            audio.writeframes(b'\x00\x00' * 8000 * 40)
        files.append('file://' + str(path))
    try:
        stop()
        fx('clear_queue')
        queue_playlist = fx('setup', files=files, name='Mode acceptance All Songs queue')['playlist']
        queue_tracks = fx('items', playlist=queue_playlist)['items']
        check(not any(t in library for t in queue_tracks), 'Playlist-only queue tracks are outside the SDK library')
        call('playback_mode', mode='smart')
        # A prior artist/search subset must not lend its seen set to a new full-library source.
        subset = None
        if len(library) > 1:
            call('play_match', track_id=library[0], tracks=library[:2] if len(library) > 2 else [library[0]])
            subset = started(library[0])
            fx('pause', paused=True)
        call('play_library')
        playing = b.wait(lambda s: s['source_name'] == '__smartshuffle_library__' and s['now_id'] in library
                         and s['now_id'] not in ids(s))
        check(set(ids(playing)) == set(library) - {playing['now_id']},
              'First All Songs round covers the full library after an artist/search subset was played')
        source = playing['source']
        if subset:
            check(source != subset['source'], 'Artist/search playback and All Songs retain distinct source identities')
        route = next(p for p in playing['playlists'] if p['guid'] == source)
        route_ids = fx('items', playlist=route['index'])['items']
        check(set(route_ids) == set(library) and len(route_ids) == len(library),
              'All Songs source contains every SDK library identity once and excludes playlist-only tracks')
        for fields in ({'playlist': route['index']}, {'playlist_guid': route['guid']}):
            rejected = b.request('play_playlist', **fields)
            check(not rejected['response']['ok'] and rejected['source'] == source,
                  'Public playlist playback rejects the internal library source ' + ('GUID' if 'playlist_guid' in fields else 'index'))
        check(set(ids(playing)).issubset(set(library)) and len(ids(playing)) == len(library) - 1,
              'Smart All Songs consumes its first track from a full library round')
        fx('seek', time=1.0)
        fx('pause', paused=True)
        saved = call('state')
        position = fx('status')['position']
        call('play_library')
        resumed = call('state')
        check(resumed['source'] == source and resumed['now_id'] == saved['now_id']
              and resumed['round'] == saved['round'] and ids(resumed) == ids(saved)
              and fx('status')['position'] >= position,
              'Repeated All Songs resumes paused audio without consuming or restarting its round')
        before = fx('status')['position']
        call('play_library')
        check(fx('status')['position'] >= before and ids(call('state')) == ids(saved),
              'Repeated playing All Songs preserves its current track position and remaining order')
        for item in (0, 1):
            fx('queue', playlist=queue_playlist, item=item)
        queued = queue_ids(call('state'))
        call('play_library')
        check(queue_ids(call('state')) == queued, 'Repeated All Songs keeps every manual queue entry in FIFO order')
        for index, target in enumerate(queued):
            call('next')
            state = b.wait(lambda s: s['now_id'] == target and queue_ids(s) == queued[index + 1:])
            check(state['source'] == source, f'Manual queue entry {index + 1} keeps the library source')
        target = ids(call('state'))[0] if ids(call('state')) else None
        call('next')
        returned = b.wait(lambda s: s['source'] == source and s['now_id'] in library)
        check(target is None or returned['now_id'] == target,
              'Smart playback returns to the remaining library round after manual queue entries')
        for order in (0, 1, 2, 4):
            stop()
            fx('clear_queue')
            call('playback_mode', mode='native', order=order)
            call('play_library')
            state = b.wait(lambda s: s['source_name'] == '__smartshuffle_library__' and s['now_id'] in library)
            native_source = state['source']
            route = next(p for p in state['playlists'] if p['guid'] == native_source)
            route_ids = fx('items', playlist=route['index'])['items']
            check(state['native_order'] == order and not state['enabled']
                  and fx('status')['playing_playlist'] == route['index']
                  and set(route_ids) == set(library) and len(route_ids) == len(library),
                  f'Native All Songs order {order} retains the selected mode and full SDK source')
            fx('pause', paused=True)
            prior = call('state')
            position = fx('status')['position']
            call('play_library')
            check(call('state')['now_id'] == prior['now_id'] and fx('status')['position'] >= position,
                  f'Native All Songs order {order} resumes without restarting')
            for item in (0, 1):
                fx('queue', playlist=queue_playlist, item=item)
            queued = queue_ids(call('state'))
            call('play_library')
            check(queue_ids(call('state')) == queued and call('state')['native_order'] == order,
                  f'Native All Songs order {order} preserves manual queue contents and mode')
        check(all(Path(p.removeprefix('file://')).exists() for p in files), 'Generated queue audio remains intact')
    finally:
        stop()
        fx('clear_queue')
        # Engine owns temporary source cleanup after playback stops.
        b.wait(lambda s: all(p['name'] not in ('__verdant_np__', '__smartshuffle_library__', '__smartshuffle__') for p in s['playlists']))
(ROOT / 'build/host-all-songs-play.json').write_text(json.dumps({'count': len(checks), 'checks': checks, 'library_count': len(library)}, indent=2), encoding='utf-8')
print(f'{len(checks)} disposable-host All Songs checks passed')
