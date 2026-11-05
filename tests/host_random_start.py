"""Exercise actual transport callbacks in the disposable null-output player."""
import json,os,sqlite3,subprocess,sys,time,uuid,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile';EXE=PROFILE.parent/'foobar2000.exe'
sys.path.insert(0,str(ROOT/'scripts'));from bridge import Bridge
b=Bridge(PROFILE);checks=[];process=None
with sqlite3.connect(f'{(PROFILE/"config.sqlite").resolve().as_uri()}?mode=ro',uri=True) as db:
 assert db.execute("SELECT value FROM configStrings WHERE name='core.output.mode'").fetchone()[0].strip('{}').upper()=='EEEB07DE-C2C8-44C2-985C-C85856D96DA1'
saved={name:(PROFILE/'smartshuffle'/name).read_bytes() if (PROFILE/'smartshuffle'/name).exists() else None for name in ['store.json','personal.json']}
app=PROFILE/'verdant/app.js';original=app.read_bytes();script=PROFILE/'verdant/random-start-check.js'
request=PROFILE/'smartshuffle/random-start-request.json';reply=PROFILE/'smartshuffle/random-start-reply.json'
script.write_text("""(function(){var last='';window.SetInterval(function(){try{
 var q=JSON.parse(utils.ReadTextFile(fb.ProfilePath+'smartshuffle\\\\random-start-request.json'));
 if(q.id===last)return;last=q.id;if(q.action==='space')on_char(32);else doCtrl('play');
 utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\\\random-start-reply.json',JSON.stringify({id:q.id}),false);
 }catch(e){}},40);})();""",encoding='utf-8-sig')
app.write_text(original.decode('utf-8-sig')+"\ninclude('random-start-check.js');\n",encoding='utf-8-sig')
request.unlink(missing_ok=True)
def check(value,label):
 assert value,label;checks.append(label);print('PASS',label,flush=True)
def call(op,**fields):
 state=b.request(op,**fields);assert state['response']['ok'],state['response'];return state
def fx(op,**fields):
 q={'id':uuid.uuid4().hex,'op':op,**fields};p=PROFILE/'fixture-request.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(q),encoding='utf-8');os.replace(tmp,p)
 until=time.monotonic()+10
 while time.monotonic()<until:
  try:
   r=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
   if r['id']==q['id']:assert r['ok'],r;return r
  except (OSError,ValueError):pass
  time.sleep(.04)
 raise TimeoutError(op)
def action(name):
 q={'id':uuid.uuid4().hex,'action':name};tmp=request.with_suffix('.tmp');tmp.write_text(json.dumps(q),encoding='utf-8');os.replace(tmp,request)
 until=time.monotonic()+8
 while time.monotonic()<until:
  try:
   if json.loads(reply.read_text(encoding='utf-8'))['id']==q['id']:return
  except (OSError,ValueError):pass
  time.sleep(.04)
 raise TimeoutError(name)
def stop():
 subprocess.run([str(EXE),'/stop'],check=True);b.wait(lambda s:not fx('status')['playing'])
def pending(s):return [r['id'] for r in s['remaining']]
try:
 si=subprocess.STARTUPINFO();si.dwFlags|=subprocess.STARTF_USESHOWWINDOW;si.wShowWindow=0
 process=subprocess.Popen([str(EXE)],startupinfo=si);b.wait(lambda s:s.get('pid')==process.pid and s.get('theme',{}).get('layout',{}).get('width'))
 check(call('outputs')['response']['active_output']=='{EEEB07DE-C2C8-44C2-985C-C85856D96DA1}','Disposable host uses null output')
 call('scan_pause',paused=True);stop();fx('clear_queue')
 folder=ROOT/'build'/('random-start-'+uuid.uuid4().hex);folder.mkdir();files=[]
 for i in range(6):
  p=folder/f'{i}.wav'
  with wave.open(str(p),'wb') as out:out.setparams((1,2,8000,0,'NONE','not compressed'));out.writeframes(b'\0\0'*8000*30)
  files.append('file://'+str(p))
 pi=fx('setup',files=files,name='Mode acceptance random start')['playlist'];identities=fx('items',playlist=pi)['items']
 guid=next(p['guid'] for p in call('state')['playlists'] if p['index']==pi)
 call('playback_mode',mode='smart');call('play_playlist',playlist_guid=guid)
 b.wait(lambda s:s['source']==guid and len(pending(s))==5);stop()
 for name in ['button','space']:
  state=call('state');order=pending(state);target=next(i for i,v in enumerate(order) if v!=identities[0] and v!=state['now_id'])
  permutation=[target]+[i for i in range(len(order)) if i!=target]
  state=call('queue_reorder',scope='remaining',source=guid,expected=order,order=permutation);order=pending(state)
  action(name);until=time.monotonic()+5
  while not fx('status')['playing'] and time.monotonic()<until:time.sleep(.04)
  time.sleep(.15);state=call('state')
  check(state['now_id']==order[0] and pending(state)==order[1:],name+' starts the saved random head instead of source row zero')
  before=pending(state);fx('seek',time=5);action(name)
  b.wait(lambda s:fx('status')['paused'],timeout=5)
  check(fx('status')['paused'],'Transport pauses an active track')
  action(name);b.wait(lambda s:not fx('status')['paused'],timeout=5)
  check(fx('status')['position']>=5 and pending(call('state'))==before,'Resume keeps the current position and remaining order')
  stop()
 # Browsing must not replace the saved playback source; a user queue keeps priority.
 other=fx('setup',files=list(reversed(files)),name='Mode acceptance random start browsing')['playlist']
 queue=fx('items',playlist=other)['items'];fx('queue',playlist=other,item=0);fx('queue',playlist=other,item=1)
 action('button');b.wait(lambda s:s['now_id']==queue[0] and len(s['queue'])==1 and fx('status')['playing'])
 state=call('state');check(state['source']==guid and [r['id'] for r in state['queue']]==queue[1:2],'Stopped transport starts the manual queue first and preserves the source')
 call('next');b.wait(lambda s:s['now_id']==queue[1]);state=call('state');target=pending(state)[0]
 call('next');b.wait(lambda s:s['now_id']==target);check(call('state')['source']==guid,'After manual inserts playback returns to the saved random round')
 stop();call('playback_mode',mode='native',order=0);action('space')
 b.wait(lambda s:fx('status')['playing'])
 check(fx('status')['playing'] and not call('state')['enabled'],'Native transport still starts in the selected native mode')
 stop();fx('cleanup');check(all(Path(p.removeprefix('file://')).exists() for p in files),'Generated audio files remain intact')
 (ROOT/'build/random-start-acceptance.json').write_text(json.dumps({'ok':True,'checks':checks},indent=2),encoding='utf-8')
finally:
 if process is not None:
  try:stop();fx('cleanup')
  finally:subprocess.run([str(EXE),'/exit'],check=True);process.wait(timeout=20)
 app.write_bytes(original);script.unlink(missing_ok=True);request.unlink(missing_ok=True);reply.unlink(missing_ok=True);(PROFILE/'fixture-request.json').unlink(missing_ok=True)
 for name,data in saved.items():
  p=PROFILE/'smartshuffle'/name
  if data is None:p.unlink(missing_ok=True)
  else:p.write_bytes(data)
