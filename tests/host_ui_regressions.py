"""Acceptance through the disposable host's SDK/COM APIs; never mouse/keyboard automation."""
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
checks = []


def check(value, name):
    assert value, name
    checks.append(name)
    print('PASS', name, flush=True)


def fixture(op, **fields):
    q = {'id': uuid.uuid4().hex, 'op': op, **fields}
    temp = PROFILE / 'fixture-temp.json'
    temp.write_text(json.dumps(q), encoding='utf-8')
    os.replace(temp, PROFILE / 'fixture-request.json')
    until = time.monotonic() + 12
    while time.monotonic() < until:
        try:
            result = json.loads((PROFILE / 'fixture-response.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            time.sleep(.03)
            continue
        if result.get('id') == q['id']:
            if not result.get('ok'):
                raise RuntimeError(result)
            return result
        time.sleep(.03)
    raise TimeoutError(op)


s = b.wait(lambda s: s.get('theme', {}).get('chrome_ready') and s.get('lyrics_panel', {}).get('visible')
           and s.get('theme', {}).get('layout', {}).get('width')
           and (not os.environ.get('SS_TEST_PID') or s.get('pid') == int(os.environ['SS_TEST_PID'])))
check(s['theme']['ui_wizard'], 'Window chrome dependency is instantiated and frame setup completed')
check(s['lyrics_panel']['ready'] and s['lyrics_panel']['configuration_segoe_ui'] and
      not s['lyrics_panel']['configuration_simsun'], 'Native ESLyric opens by default with the saved Segoe UI panel configuration')
a = b.request('appearance')['response']
check(a['dark_mode'] and all(v['family'] == 'Segoe UI' for v in a['fonts'].values()),
      'Live host reads dark mode and all six standard plugin font roles as Segoe UI')
before = b.request('state')
preferences = fixture('settings', reset=True)
check(preferences['found'] and preferences['window'] and preferences['state'] & (1 << 16),
      'Native plugin settings page instantiates with dark-mode support')
check(preferences['draft_state'] & 1 and not preferences['applied_state'] & 1,
      'Settings Reset previews a change and Apply invokes the shared layout-restore action')
reset = b.wait(lambda s: s.get('ui_layout_reset', 0) > before.get('ui_layout_reset', 0)
               and s.get('theme', {}).get('layout', {}).get('reset') == s.get('ui_layout_reset'))
check(reset['theme']['layout']['width'] == 1180 and reset['theme']['layout']['height'] == 780
      and all(reset[k] == before[k] for k in ['source', 'round', 'point', 'remaining', 'enabled']),
      'Actual theme consumes settings reset once, restores 1180x780, and preserves scheduling state')

original = fixture('window')
fixture('window', action='unmax')
normal = fixture('window')
try:
    fixture('window', action='resize', w=850, h=600)
    small = b.wait(lambda s: s['theme']['layout'].get('width') == 850)['theme']['layout']
    fixture('window', action='resize', w=1700, h=1050)
    large = b.wait(lambda s: s['theme']['layout'].get('width') == 1700)['theme']['layout']
    check(large['density'] > small['density'] and large['row_height'] > small['row_height'] and large['cover_size'] > small['cover_size'],
          'Actual window resizing updates content scale, row height and cover size together')
    resized = fixture('window', action='resize', w=1040, h=720)
    check(abs(resized['w'] - 1040) <= 16 and abs(resized['h'] - 720) <= 16, 'Window API resizing changes the real host bounds')
    moved = fixture('window', action='move', x=normal['x'] + 16, y=normal['y'] + 16)
    check(abs(moved['x'] - normal['x'] - 16) <= 8 and abs(moved['y'] - normal['y'] - 16) <= 8, 'Window API movement changes the real host position')
    check(fixture('window', action='min')['minimized'], 'Window minimize API works')
    check(not fixture('window', action='restore')['minimized'], 'Window restore API works')
    check(fixture('window', action='max')['maximized'], 'Window maximize API works')
    check(not fixture('window', action='unmax')['maximized'], 'Window exits maximized state')
finally:
    fixture('window', action='resize', w=normal['w'], h=normal['h'])
    fixture('window', action='move', x=normal['x'], y=normal['y'])
    if original['maximized']:
        fixture('window', action='max')

status = fixture('status')
music = next(p['index'] for p in status['names'] if p['name'] == 'Music')
ids = fixture('items', playlist=music)['items'][:3]
setup = fixture('setup', files=[i.rsplit('|', 1)[0] for i in ids], name='Mode acceptance ' + uuid.uuid4().hex)
source = setup['playlist']
b.request('playback_mode', mode='smart')
b.request('play', playlist=source, item=0)
b.wait(lambda s: s['now_id'] == ids[0])
time.sleep(.25)
position = fixture('status')['position']
s = b.request('playback_mode', mode='native', order=0)
check(not s['enabled'] and s['native_order'] == 0 and s['now_id'] == ids[0] and
      fixture('status')['position'] >= position - .05, 'Selecting native sequential mode preserves the current song and playback position')
b.request('next')
b.wait(lambda s: s['now_id'] == ids[1])
check(fixture('status')['playing_playlist'] == source, 'Native Next resumes the original playlist order')
b.request('playback_mode', mode='smart')
b.request('play', playlist=source, item=0)
b.wait(lambda s: s['now_id'] == ids[0])
b.request('playback_mode', mode='native', order=0)
fixture('queue', playlist=source, item=1)
deadline = time.monotonic() + 5
while fixture('status')['queue'] != 1 and time.monotonic() < deadline:
    time.sleep(.03)
check(fixture('status')['queue'] == 1, 'A user queue entry identical to the temporary native bridge is preserved exactly once')
b.request('next')
b.wait(lambda s: s['now_id'] == ids[1])
b.request('play', playlist=source, item=2)
b.wait(lambda s: s['now_id'] == ids[2])
check(not b.state()['enabled'], 'Manual song selection preserves the chosen native mode')
b.request('play', playlist=source, item=1)
b.wait(lambda s: s['now_id'] == ids[1])
s = b.request('playback_mode', mode='smart')
check(s['enabled'] and s['native_order'] == 0 and s['now_id'] == ids[1], 'Selecting smart mode restores one native scheduling authority without restarting audio')
s = b.request('playback_mode', mode='native', order=2)
check(not s['enabled'] and s['native_order'] == 2, 'Repeat-one and smart random share mutually exclusive mode state')
b.request('next')
b.wait(lambda s: s['now_id'] == ids[1] and fixture('status')['playing_playlist'] == source)
check(not b.state()['enabled'], 'Repeat-one transition rejoins the source while keeping the current song')
b.request('playback_mode', mode='smart')
b.request('play', playlist=source, item=2)
b.wait(lambda s: s['now_id'] == ids[2])
b.request('playback_mode', mode='native', order=0)
b.request('next')
deadline = time.monotonic() + 10
while fixture('status')['playing'] and time.monotonic() < deadline:
    time.sleep(.05)
check(not fixture('status')['playing'], 'Native sequential mode at the final source track stops without restarting at the first')
b.request('playback_mode', mode='smart')
b.request('play', playlist=source, item=2)
b.wait(lambda s: s['now_id'] == ids[2])
b.request('playback_mode', mode='native', order=1)
b.request('next')
b.wait(lambda s: s['now_id'] == ids[0])
check(fixture('status')['playing_playlist'] == source, 'Native playlist loop wraps to the first source track')
subprocess.run([str(ROOT / 'test-player/foobar2000.exe'), '/stop'], check=True)
b.request('playback_mode', mode='smart')
fixture('clear_queue')

m = b.request('menu_open', kind='context', playlist=music, item=0)['response']['menu']
labels = [r.get('label', '') for r in m['items']]
check(all(any(word in name for name in labels) for word in ['标签', '文件操作', '转换', '播放统计']),
      'Track menu retains actual tagging, file operations, converter and playback-statistics plugin submenus')
add = next(i for i in m['items'] if '添加到播放队列' in i.get('label', ''))
b.request('menu_open', kind='main', root='file')
rejected = b.request('menu_execute', token=m['token'], command=add['command'])
check(not rejected['response']['ok'], 'An old native menu cannot execute after its token is replaced')
m = b.request('menu_open', kind='context', playlist=music, item=0)['response']['menu']
add = next(i for i in m['items'] if '添加到播放队列' in i.get('label', ''))
s = b.request('menu_execute', token=m['token'], command=add['command'])
check(s['response']['ok'] and fixture('status')['queue'] == 1, 'The themed menu executes the original SDK queue command')
fixture('clear_queue')
(ROOT / 'build/host-ui-regressions.json').write_text(json.dumps({'count': len(checks), 'checks': checks}, indent=2), encoding='utf-8')
print(len(checks), 'actual host UI/API regressions passed', flush=True)
