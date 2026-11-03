"""Theme transactions in the disposable SDK host; no input automation."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
PROFILE=ROOT/'test-player/profile'
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge

b=Bridge(PROFILE)
startup=subprocess.STARTUPINFO()
startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW
startup.wShowWindow=0
checks=[]

def start():
    p=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
    b.wait(lambda s:s.get('pid')==p.pid and s.get('component')=='1.0.16'
           and s.get('theme',{}).get('chrome_ready'),timeout=25)
    return p

def stop(p):
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True)
    p.wait(timeout=20)

def ready(mode):
    return b.wait(lambda s:s.get('theme',{}).get('appearance')==mode
                  and s['theme'].get('rendered_appearance')==mode
                  and s.get('lyrics_panel',{}).get('appearance')==mode
                  and s['lyrics_panel'].get('ready') and s['lyrics_panel'].get('visible'))

def check(value,label):
    assert value,label
    checks.append(label)
    print('PASS',label,flush=True)

p=start()
original=b.state()['theme']['appearance']
try:
    before=b.request('state')
    for mode in ['light','dark','light']:
        reply=b.request('theme_appearance',appearance=mode)
        check(reply['response'].get('ok'),mode+' transaction accepted')
        state=ready(mode)
        check(all(state[k]==before[k] for k in ['source','round','point','remaining','enabled']),
              mode+' preserves playlist progress and random preferences')
        check(state['theme']['layout']['width']==before['theme']['layout']['width']
              and state['theme']['layout']['height']==before['theme']['layout']['height'],
              mode+' preserves manual window size')
    invalid=b.request('theme_appearance',appearance='invalid')
    check(not invalid['response']['ok'] and invalid['theme']['appearance']=='light',
          'Unsupported appearance cannot alter the saved theme')
    stop(p)
    p=start()
    check(ready('light')['theme']['rendered_appearance']=='light',
          'Native, JSplitter and ESLyric restore the saved light theme on restart')
    b.request('theme_appearance',appearance=original)
    ready(original)
    check(True,'Original disposable theme restored')
finally:
    if p.poll() is None:
        b.request('theme_appearance',appearance=original)
        stop(p)
(ROOT/'build/theme-appearance-acceptance.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf-8')
