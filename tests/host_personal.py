"""Personal library checks in the isolated null-output player; generated WAVs only."""
import json,os,stat,subprocess,sys,time,uuid,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile';EXE=ROOT/'test-player/foobar2000.exe'
sys.path.insert(0,str(ROOT/'scripts'));from bridge import Bridge
b=Bridge(PROFILE);checks=[];process=None;saved={}
for name in ['personal.json','store.json']:
 p=PROFILE/'smartshuffle'/name;saved[name]=p.read_bytes() if p.exists() else None

def check(value,label):
 assert value,label;checks.append(label);print('PASS',label,flush=True)
def start():
 global process
 si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
 process=subprocess.Popen([str(EXE)],startupinfo=si);s=b.wait(lambda s:s.get('pid')==process.pid)
 check(b.request('outputs')['response']['active_output']=='{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}','Disposable player uses null output');return s

def stop():
 global process
 if process is not None:subprocess.run([str(EXE),'/exit'],check=True);process.wait(timeout=20);process=None

def call(op,**kwargs):
 s=b.request(op,**kwargs);assert s['response']['ok'],s['response'];return s

def fixture(op,**fields):
 q={'id':uuid.uuid4().hex,'op':op,**fields};p=PROFILE/'fixture-temp.json';p.write_text(json.dumps(q),encoding='utf-8');os.replace(p,PROFILE/'fixture-request.json');until=time.monotonic()+12
 while time.monotonic()<until:
  try:
   r=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
   if r.get('id')==q['id']:assert r['ok'],r;return r
  except (OSError,ValueError):pass
  time.sleep(.04)
 raise TimeoutError(op)
def history():return call('personal_list',kind='history',offset=0,limit=100)['response']['personal']['items']
def last(identity):return next(r for r in history() if r['id']==identity)
try:
 s=start();check('personal' in s,'Native state exposes a small personal-library summary')
 folder=ROOT/'build'/('personal-audio-'+uuid.uuid4().hex);folder.mkdir()
 paths=[]
 for name,seconds in [('short.wav',1.2),('long.wav',8)]:
  p=folder/name
  with wave.open(str(p),'wb') as out:out.setparams((1,2,8000,0,'NONE','not compressed'));out.writeframes(b'\0\0'*round(seconds*8000))
  paths.append(p)
 pi=fixture('setup',files=['file://'+str(p) for p in paths],name='Mode acceptance personal library')['playlist'];identities=fixture('items',playlist=pi)['items'];a,c=identities
 call('scan_pause',paused=True);call('playback_mode',mode='native',order=0)
 baseline=s['personal']['favorites_count'];source=b.state()['source']
 call('personal_set',kind='favorites',tracks=[a,a],value=True);call('personal_set',kind='favorites',tracks=[a],value=True)
 page=call('personal_list',kind='favorites',offset=0,limit=100)['response']['personal'];check(sum(r['id']==a for r in page['items'])==1,'Favorite operations deduplicate SDK path and subsong')
 check(page['total']==baseline+1 and page['items'][0]['title'],'Favorite page contains real SDK metadata')
 call('personal_set',kind='later',tracks=[c],value=True);flags=call('personal_flags',tracks=identities)['response']['personal_flags'];check(flags[0]['favorite'] and flags[1]['later'],'Batched membership flags match both collections')
 check(b.state()['source']==source,'Browsing and changing personal collections keeps the playback source')
 data=PROFILE/'smartshuffle/personal.json';until=time.monotonic()+5
 while not data.exists() and time.monotonic()<until:time.sleep(.05)
 os.chmod(data,stat.S_IREAD);call('personal_set',kind='favorites',tracks=[c],value=True)
 b.wait(lambda s:bool(s.get('personal',{}).get('error')),timeout=8)
 check(call('personal_flags',tracks=[c])['response']['personal_flags'][0]['favorite'],'A failed disk write keeps the in-memory favorite for retry')
 os.chmod(data,stat.S_IWRITE|stat.S_IREAD);until=time.monotonic()+8
 while time.monotonic()<until:
  if any(r['id']==c for r in json.loads(data.read_text(encoding='utf-8'))['favorites']):break
  time.sleep(.05)
 check(any(r['id']==c for r in json.loads(data.read_text(encoding='utf-8'))['favorites']),'Background persistence recovers after the destination becomes writable')
 call('personal_set',kind='favorites',tracks=[c],value=False)

 menu=call('menu_open',kind='context',tracks=[a])['response']['menu'];check(menu['selected_count']==1,'Native context menus accept personal-view track identities')
 fixture('play',playlist=pi,item=0);b.wait(lambda s:s['now_id']==a);b.wait(lambda s:s['now_id']==c,timeout=8)
 check(last(a)['outcome']=='completed' and last(a)['qualified'],'Natural EOF creates a completed qualified history event')
 live_before=call('state')['personal'];time.sleep(.3);live_after=call('state')['personal']
 check(live_after['revision']==live_before['revision'] and live_after['current']['event_id']==live_before['current']['event_id'] and live_after['current']['listened']>live_before['current']['listened'],'Active history progress advances without invalidating collection revisions')
 fixture('pause',paused=True);time.sleep(.7);fixture('seek',time=6);fixture('pause',paused=False);time.sleep(.2);subprocess.run([str(EXE),'/stop'],check=True)
 b.wait(lambda s:any(r['id']==c for r in history()))
 row=last(c);check(row['outcome']=='stopped' and row['listened']<2 and not row['qualified'],'Pause and seek do not become listened time')
 fixture('play',playlist=pi,item=1);b.wait(lambda s:s['now_id']==c);time.sleep(.2);fixture('play',playlist=pi,item=0);b.wait(lambda s:s['now_id']==a)
 check(last(c)['outcome']=='skipped','Manual switching records the previous song as skipped')
 for _ in range(3):time.sleep(.4);fixture('seek',time=.05)
 call('next');b.wait(lambda s:s['now_id']==c)
 repeated=last(a);check(repeated['listened']>repeated['duration']*.9 and repeated['outcome']=='skipped','Rewinding and listening past ninety percent never turns a manual next into completion')
 fixture('seek',time=7.8)
 until=time.monotonic()+6
 while time.monotonic()<until:
  if last(c)['outcome']=='completed':break
  time.sleep(.05)
 ended=last(c);check(ended['outcome']=='completed' and not ended['qualified'],'Seeking near the end then reaching EOF is completed without invented effective listening')
 check(len([r for r in history() if r['id']==c])>=2,'Replaying the same file retains distinct history events')
 failure=fixture('setup',files=['file://'+str(paths[1]),'file://'+str(folder/'missing.flac')],name='Mode acceptance personal failure')['playlist']
 fixture('play',playlist=failure,item=0);b.wait(lambda s:s['personal'].get('current') and s['personal']['current']['id']==c);time.sleep(.2);call('next')
 until=time.monotonic()+6
 while time.monotonic()<until:
  if last(c)['outcome']!='playing':break
  time.sleep(.05)
 check(last(c)['outcome']=='skipped','An unsuccessful manual advance cannot mark the previous song as naturally completed')

 subprocess.run([str(EXE),'/stop'],check=True);fixture('cleanup');stop()
 s=start();flags=call('personal_flags',tracks=identities)['response']['personal_flags'];check(flags[0]['favorite'] and flags[1]['later'],'Favorite and later lists survive normal restart')
 check(len([r for r in history() if r['id']==c])>=2 and all(r['outcome']!='playing' for r in history()),'History survives restart without a stale playing session')
 call('personal_set',kind='favorites',tracks=[a],value=False);call('personal_set',kind='later',tracks=[c],value=False)
 flags=call('personal_flags',tracks=identities)['response']['personal_flags'];check(not flags[0]['favorite'] and not flags[1]['later'],'Removing a personal membership does not remove the music file');check(all(p.is_file() for p in paths),'Generated audio files are unchanged')
 stop();corrupt=b'{"version":999,"private_marker":"keep-original"}';(PROFILE/'smartshuffle/personal.json').write_bytes(corrupt)
 broken=start();check(bool(broken['personal']['error']),'Unsupported personal data exposes an error rather than silently resetting')
 rejected=b.request('personal_set',kind='favorites',tracks=[a],value=True);check(not rejected['response']['ok'],'A broken personal file rejects mutations')
 fixture('play',playlist=fixture('setup',files=['file://'+str(paths[1])],name='Mode acceptance personal library')['playlist'],item=0);time.sleep(.15);subprocess.run([str(EXE),'/stop'],check=True);fixture('cleanup');stop()
 check((PROFILE/'smartshuffle/personal.json').read_bytes()==corrupt,'Playback and shutdown cannot overwrite unsupported personal data')
 (ROOT/'build/personal-host-acceptance.json').write_text(json.dumps({'ok':True,'checks':checks},indent=2),encoding='utf-8')
finally:
 if process is not None:
  try:subprocess.run([str(EXE),'/stop'],check=True);fixture('cleanup')
  finally:stop()
 for name,content in saved.items():
  p=PROFILE/'smartshuffle'/name
  if p.exists():os.chmod(p,stat.S_IWRITE|stat.S_IREAD)
  if content is None:p.unlink(missing_ok=True)
  else:p.write_bytes(content)
 (PROFILE/'fixture-request.json').unlink(missing_ok=True)
