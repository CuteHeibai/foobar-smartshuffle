"""Standalone host checks through SDK fixtures; no input injection or screen capture."""
import json,os,sys,time,uuid,wave,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROFILE=Path(os.environ.get('SS_CORE_PROFILE',str(ROOT/'build/core-player/profile')))
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(PROFILE);checks=[]
def check(ok,name):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def fixture(op,**fields):
 q={'id':uuid.uuid4().hex,'op':op,**fields};temp=PROFILE/'fixture-temp.json';temp.write_text(json.dumps(q),encoding='utf-8');os.replace(temp,PROFILE/'fixture-request.json');until=time.monotonic()+10
 while time.monotonic()<until:
  try:
   r=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
   if r.get('id')==q['id']:
    assert r.get('ok'),r
    return r
  except (OSError,ValueError):pass
  time.sleep(.03)
 raise TimeoutError(op)
def wait_apply():
 until=time.monotonic()+5
 while not fixture('panel')['apply_enabled']:
  assert time.monotonic()<until,'Native window did not display its completed preview'
  time.sleep(.05)
s=b.wait(lambda s:s.get('component')=='1.0.18' and s.get('edition')=='core' and
         (not os.environ.get('SS_TEST_PID') or s.get('pid')==int(os.environ['SS_TEST_PID'])))
check(s['fonts']['private_resources']>=3,'Standalone privately loads the bundled Inter fonts')
check(not s['theme']['version'],'Standalone loads without a project theme')
unchanged=s['theme']['appearance']
rejected=b.request('theme_appearance',appearance='light')
check(not rejected['response']['ok'] and rejected['theme']['appearance']==unchanged,
      'Standalone rejects theme changes and preserves existing appearance preferences')
components=b.request('outputs')['response']['components']
check(not any(c['file'] in {'foo_ui_columns','foo_uie_jsplitter','foo_uie_eslyric','foo_ui_wizard'} for c in components),'Standalone requires no optional UI components')
s=b.wait(lambda s:s['update'].get('checked_at'),timeout=35)
check(s['update']['automatic'] and not s['update']['checking'] and not s['update']['error'],'Startup completes a live GitHub check in the background')
check(not fixture('panel',kind='update')['exists'],'No-update startup stays silent')
if fixture('panel')['exists']:fixture('panel',command=2)
audio=ROOT/'build/update-fixtures';audio.mkdir(exist_ok=True);files=[]
for i in range(12):
 path=audio/f'track-{i}.wav'
 with wave.open(str(path),'wb') as out:out.setnchannels(1);out.setsampwidth(2);out.setframerate(8000);out.writeframes(bytes(160000))
 files.append(str(path))
source=fixture('setup',files=files,name='SmartShuffle acceptance')['playlist']
b.request('play',playlist=source,item=0);b.wait(lambda s:s['now_id'].endswith('track-0.wav|0'))
subprocess.run([str(PROFILE.parent/'foobar2000.exe'),'/stop'],check=True)
original=b.wait(lambda s:s['remaining_count']>=8)['remaining']
check(len(original)>=8,'Standalone preview uses a populated fixture playlist')
b.request('native_preferences');p=fixture('panel',render=True)
check(p['exists'] and p['rendered'],'Native preference window renders into a private bitmap')
b.wait(lambda s:s.get('preview') and not s['preview_pending']);fixture('panel',command=1202)
s=b.wait(lambda s:s.get('preview') and s['preview']['point']['x']==.75 and not s['preview_pending'])
check(s['remaining']==original,'Native frequency preset updates only the draft')
wait_apply();check(fixture('panel')['apply_enabled'],'Matching completed preview enables Apply')
fixture('panel',command=2)
check(b.request('state')['remaining']==original and not fixture('panel')['exists'],'Cancel closes the native window and preserves the order')
b.request('native_preferences');fixture('panel',command=1203)
s=b.wait(lambda s:s.get('preview') and s['preview']['point']['x']==-.75 and not s['preview_pending']);expected=[t['id'] for t in s['preview']['tracks']]
wait_apply()
fixture('panel',command=1)
s=b.wait(lambda s:s.get('preview') is None and s['point']['x']==-.75)
check([t['id'] for t in s['remaining'][:8]]==expected,'Native Apply commits the displayed preview order')
b.request('update_open');check(fixture('panel',kind='update',render=True)['rendered'],'Update window renders current version and edition')
b.request('update_config',automatic=False)
check(not b.request('state')['update']['automatic'] and not json.loads((PROFILE/'smartshuffle/updates.json').read_text())['automatic'],'Startup check preference is persisted')
b.request('update_config',automatic=True);fixture('panel',kind='update',command=2)
fixture('cleanup')
(ROOT/'build/host-updates.json').write_text(json.dumps({'checks':checks},indent=2),encoding='utf-8')
print(len(checks),'standalone/update host checks passed')
