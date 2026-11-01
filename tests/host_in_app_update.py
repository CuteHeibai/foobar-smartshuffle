"""Real GitHub download/apply/restart in the stopped disposable test-player.

Stage the 1.0.7 update-only bootstrap and helpers first. No user player or
desktop input is used; the disposable instance must retain null audio output.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile';EXE=ROOT/'test-player/foobar2000.exe'
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(PROFILE)
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--target-version',required=True);args=parser.parse_args()
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
p=subprocess.Popen([str(EXE)],startupinfo=startup)
try:
    before=b.wait(lambda s:s.get('pid')==p.pid and s.get('component')=='1.0.7' and s.get('update',{}).get('in_app'),timeout=25)
    outputs=b.request('outputs')['response'];assert outputs['active_output']=='{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}'
    b.request('update_check');state=b.wait(lambda s:not s['update']['checking'] and s['update']['available'],timeout=30)
    assert state['update']['release']['version']==args.target_version,state['update']
    assert b.request('update_install')['response']['ok']
    print('PASS explicit action starts verified GitHub download',flush=True)
    until=time.monotonic()+360
    last=-1
    while p.poll() is None:
        state=b.state();update=state['update'];phase=update.get('phase')
        assert phase!='failed',update
        percent=int(update.get('downloaded',0)*100/max(1,update.get('total',1)))
        if percent//20!=last:
            print('Download',percent,'%',phase,flush=True);last=percent//20
        assert time.monotonic()<until,'Update did not close the disposable instance'
        time.sleep(.2)
    print('PASS updater normally exits the original instance after verification',flush=True)
    after=b.wait(lambda s:s.get('pid')!=p.pid and s.get('component')==args.target_version and s.get('theme',{}).get('version')==args.target_version,timeout=100)
    result=json.loads((PROFILE/'smartshuffle/update-result.json').read_text(encoding='utf-8'))
    assert result['ok'] and result['version']==args.target_version and result['edition']=='full',result
    backup=Path(result['backup']);assert (backup/'manifest.json').is_file()
    assert not (backup/'profile-snapshot/smartshuffle/updates').exists()
    print('PASS local helper installs, saves a backup without download recursion, and reopens the same target',flush=True)
    assert all(after[k]==before[k] for k in ('source','round','point','remaining','enabled'))
    current=b.request('outputs')['response'];assert (current['active_output'],current['active_device'])==(outputs['active_output'],outputs['active_device'])
    print('PASS scheduling state and audio output survive the real update',flush=True)
    (ROOT/'build/in-app-update-acceptance.json').write_text(json.dumps({'ok':True,'old_pid':p.pid,'new_pid':after['pid'],'result':result},ensure_ascii=False,indent=2),encoding='utf-8')
finally:
    subprocess.run([str(EXE),'/exit'],check=True)
    p.wait(timeout=20)
