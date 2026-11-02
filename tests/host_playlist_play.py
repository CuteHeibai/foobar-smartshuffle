"""Playlist play checks against an ALREADY RUNNING disposable test-player with fixture.

Never launches a host. SS_TEST_PID optionally pins the expected running process.
Only generated WAVs and fixture playlists are used; no desktop input is sent.
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
PROFILE = ROOT / 'test-player/profile'
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
        assert Path(text.value).resolve() == (ROOT / 'test-player/foobar2000.exe').resolve(), 'Refusing to touch a non-disposable host'
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
    subprocess.run([str(ROOT / 'test-player/foobar2000.exe'), '/stop'], check=True)
    end = time.monotonic() + 5
    while fx('status')['playing'] and time.monotonic() < end:
        time.sleep(.05)
    assert not fx('status')['playing'], 'Disposable playback did not stop'


def playlist(index):
    return next(p for p in call('state')['playlists'] if p['index'] == index)


verify_disposable()
media = ROOT / 'build/playlist-play-fixtures' / uuid.uuid4().hex
media.mkdir(parents=True, exist_ok=True)
files = []
for n in range(4):
    p = media / f'playlist-{n}.wav'
    with wave.open(str(p), 'wb') as audio:
        audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
        audio.writeframes(b'\x00\x00' * 8000 * 40)
    files.append('file://' + str(p))
try:
    stop()
    fx('clear_queue')
    a = fx('setup', files=files, name='Mode acceptance playlist play A')['playlist']
    a_guid = playlist(a)['guid']
    a_ids = fx('items', playlist=a)['items']
    other = fx('setup', files=files[1:], name='Mode acceptance playlist play B')
    other_index = other['playlist']
    other_guid = playlist(other_index)['guid']
    call('playback_mode', mode='smart')
    call('play', playlist=a, item=0)
    first = started(a_ids[0])
    stop()
    saved = call('state')
    pending = ids(saved)
    call('play_playlist', playlist=other_index)
    b.wait(lambda s: s['source'] == other_guid and len(ids(s)) == 2)
    call('play_playlist', playlist_guid=a_guid)
    resumed = started(pending[0])
    check(resumed['source'] == a_guid and resumed['round'] == saved['round'] and ids(resumed) == pending[1:],
          'Returning to a smart playlist resumes its saved remaining order and round')
    fx('seek', time=8.0)
    fx('pause', paused=True)
    paused = call('state')
    call('play_playlist', playlist_guid=a_guid)
    time.sleep(.2)
    same = call('state')
    check(same['now_id'] == paused['now_id'] and same['round'] == paused['round'] and ids(same) == ids(paused)
          and fx('status')['position'] >= 8.0,
          'Current smart playlist resumes paused audio without replay or consumption')
    before_position = fx('status')['position']
    call('play_playlist', playlist_guid=a_guid)
    check(fx('status')['position'] >= before_position and ids(call('state')) == ids(same),
          'Clicking an already playing smart playlist does not restart its song')
    fx('queue', playlist=other['outside'], item=2)
    fx('queue', playlist=other['outside'], item=1)
    queued = queue_ids(call('state'))
    call('play_playlist', playlist_guid=other_guid)
    state = b.wait(lambda s: s['source'] == other_guid and s['now_id'] not in ids(s))
    check(conserve_queue(queued, state),
          'Starting another playlist keeps every queued entry or audibly starts only its head')
    # Drain by real playback, never clear away entries that could have been silently lost.
    # If the default action already started the head, observe that same start first.
    for index, target in enumerate(queued):
        if queue_ids(state) == queued[index:]:
            call('next')
        state = b.wait(lambda s: s['now_id'] == target and queue_ids(s) == queued[index + 1:])
        check(state['source'] == other_guid,
              f'User queue entry {index + 1} plays in order without replacing the selected source')
    tail = b.wait(lambda s: s['source'] == other_guid and bool(ids(s)))
    next_target = ids(tail)[0]
    call('next')
    returned = b.wait(lambda s: s['now_id'] == next_target and s['source'] == other_guid)
    check(queue_ids(returned) == [], 'Playback returns from the user queue to the selected smart round')
    for order in (0, 1, 2, 4):
        call('playback_mode', mode='native', order=order)
        call('play_playlist', playlist_guid=a_guid)
        b.wait(lambda s: s['now_id'] == a_ids[0] and s['source'] == a_guid)
        state = call('state')
        check(state['native_order'] == order and not state['enabled']
              and fx('status')['playing_playlist'] == a and queue_ids(state) == [],
              f'Native mode {order} starts the source first song and retains its mode')
        fx('queue', playlist=other['outside'], item=2)
        fx('queue', playlist=other['outside'], item=1)
        queued_native = queue_ids(call('state'))
        call('play_playlist', playlist_guid=a_guid)
        state = call('state')
        check(state['native_order'] == order and not state['enabled'] and conserve_queue(queued_native, state),
              f'Native mode {order} preserves queued entries or audibly starts only their head')
        for index, target in enumerate(queued_native):
            if queue_ids(state) == queued_native[index:]:
                call('next')
            state = b.wait(lambda s: s['now_id'] == target and queue_ids(s) == queued_native[index + 1:])
        check(queue_ids(state) == [], f'Native mode {order} plays both manual queue entries in order')
    stop()
    fx('clear_queue')
    call('playback_mode', mode='smart')
    before = call('state')
    invalid = b.request('play_playlist', playlist=999999)
    check(not invalid['response']['ok'] and invalid['source'] == before['source'], 'Missing playlist index fails without changing source')
    invalid = b.request('play_playlist', playlist_guid='{00000000-0000-0000-0000-000000000000}')
    check(not invalid['response']['ok'] and invalid['source'] == before['source'], 'Missing playlist GUID fails without changing source')
    call('play_playlist', playlist_guid=a_guid)
    active = b.wait(lambda s: any(p['name'] == '__smartshuffle__' for p in s['playlists']))
    hidden = next(p for p in active['playlists'] if p['name'] == '__smartshuffle__')
    invalid = b.request('play_playlist', playlist=hidden['index'])
    check(not invalid['response']['ok'], 'Internal managed playlist is rejected')
    empty = fx('setup', files=[], name='Mode acceptance empty playlist play')['playlist']
    invalid = b.request('play_playlist', playlist=empty)
    check(not invalid['response']['ok'] and invalid['source'] == before['source'], 'Empty playlist fails cleanly without replacing the source')
    # Consume actual remaining songs through the managed projection, then cross a round boundary.
    call('play_playlist', playlist_guid=a_guid)
    current = b.wait(lambda s: s['source'] == a_guid and bool(s['now_id']))
    heard = [current['now_id']]
    initial_round = current['round']
    for _ in range(5):
        old = call('state')['now_id']
        call('next')
        # A newly prepared round may include the current song later in its order.
        state = b.wait(lambda s: s['now_id'] != old)
        heard.append(state['now_id'])
        time.sleep(.15)
    check(state['round'] > initial_round and all(a != b for a, b in zip(heard, heard[1:])),
          'Playlist playback continues into a new round without adjacent repetition')
    check(all(Path(p.removeprefix('file://')).exists() for p in files), 'All generated audio files remain intact')
finally:
    stop()
    fx('clear_queue')
(ROOT / 'build/host-playlist-play.json').write_text(json.dumps({'count': len(checks), 'checks': checks}, indent=2), encoding='utf-8')
print(f'{len(checks)} disposable-host playlist playback checks passed')
