"""Update-only 1.0.7 bootstrap and download cancellation in the disposable host.

Run with the bootstrap DLL/theme/helper staged in test-player, already stopped.
No desktop input is sent. Playback uses the saved null output.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
PROFILE=ROOT/'test-player/profile'
EXE=ROOT/'test-player/foobar2000.exe'
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(PROFILE)


def fixture(op,**fields):
    req={'id':uuid.uuid4().hex,'op':op,**fields}
    temp=PROFILE/'fixture-temp.json'
    temp.write_text(json.dumps(req),encoding='utf-8')
    os.replace(temp,PROFILE/'fixture-request.json')
    until=time.monotonic()+10
    while time.monotonic()<until:
        try:
            result=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
            if result.get('id')==req['id']:
                assert result.get('ok'),result
                return result
        except (OSError,ValueError):
            pass
        time.sleep(.04)
    raise TimeoutError(op)


startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
p=subprocess.Popen([str(EXE)],startupinfo=startup)
try:
    state=b.wait(lambda s:s.get('pid')==p.pid and s.get('component')=='1.0.7'
                 and s.get('theme',{}).get('version')=='1.0.7' and s.get('update',{}).get('in_app'),timeout=25)
    assert b.request('outputs')['response']['active_output']=='{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}'
    assert not fixture('integration_menu')['found'],'Bootstrap must not add the later theme switch feature'
    print('PASS bootstrap keeps 1.0.7 component/theme and excludes later native menu',flush=True)
    b.request('update_open')
    state=b.wait(lambda s:not s['update']['checking'] and s['update']['available'],timeout=30)
    until=time.monotonic()+3
    while True:
        panel=fixture('panel',kind='update',render=True)
        if panel.get('update_enabled'):break
        assert time.monotonic()<until,panel
    assert panel['exists'] and panel['rendered'] and panel['update_label']=='更新并重启' and panel['update_enabled']
    print('PASS native update window renders the in-app action for the current edition',flush=True)
    before={p.name for p in (PROFILE/'smartshuffle/updates').glob('*')}
    reply=b.request('update_install');assert reply['response']['ok']
    state=b.wait(lambda s:s['update']['phase']=='downloading')
    until=time.monotonic()+3
    while fixture('panel',kind='update')['update_enabled']:
        assert time.monotonic()<until
    print('PASS update starts a background download and disables duplicate actions',flush=True)
    time.sleep(.15)
    started=time.monotonic()
    subprocess.run([str(EXE),'/exit'],check=True);p.wait(timeout=10)
    elapsed=time.monotonic()-started
    assert elapsed<3,elapsed
    jobs=[p for p in (PROFILE/'smartshuffle/updates').glob('*') if p.name not in before]
    assert len(jobs)==1 and not (jobs[0]/'package.zip').exists() and not (jobs[0]/'package.zip.part').exists()
    print('PASS closing during download cancels without installing; exit seconds',round(elapsed,3),flush=True)
    (ROOT/'build/bootstrap-update-acceptance.json').write_text(json.dumps({'ok':True,'exit_seconds':elapsed,'job':str(jobs[0])}),encoding='utf-8')
finally:
    if p.poll() is None:
        subprocess.run([str(EXE),'/exit'],check=True)
        p.wait(timeout=15)
