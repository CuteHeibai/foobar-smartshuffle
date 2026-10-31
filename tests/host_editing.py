"""Real SDK checks on our disposable WAVs; no desktop input automation."""
import json, os, sys, time, uuid, wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile'
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(PROFILE);checks=[]
def check(value,name):
    assert value,name
    checks.append(name);print('PASS',name,flush=True)
def fx(op,**fields):
    q={'id':uuid.uuid4().hex,'op':op,**fields};p=PROFILE/'fixture-request.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(q),encoding='utf-8');os.replace(tmp,p)
    until=time.monotonic()+12
    while time.monotonic()<until:
        try:
            r=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
            if r.get('id')==q['id']:
                assert r.get('ok'),r
                return r
        except (OSError,ValueError):pass
        time.sleep(.05)
    raise TimeoutError(op)
def call(op,**fields):
    s=b.request(op,**fields);assert s['response']['ok'],s['response'];return s
def info(pi):return next(p for p in call('state')['playlists'] if p['index']==pi)
def items(pi):return fx('items',playlist=pi)['items']
media=ROOT/'build/edit-fixtures';media.mkdir(exist_ok=True)
files=[]
for i in range(4):
    p=media/f'edit-{i}.wav'
    with wave.open(str(p),'wb') as f:f.setparams((1,2,8000,0,'NONE','not compressed'));f.writeframes(b'\x00\x00'*8000*40)
    files.append(str(p))
new_guids=[]
try:
    fx('clear_queue');setup=fx('setup',files=files);pi=setup['playlist'];outside=setup['outside'];original=items(pi);guid=info(pi)['guid']
    for smart in (False,True):
        call('playback_mode',mode='smart' if smart else 'native',order=0)
        s=call('play_match',track_id=original[1],tracks=original,seconds=12.25)
        b.wait(lambda s:s['now_id']==original[1] and not s['seek_pending'])
        check(12<=fx('status')['position']<15,f'Lyric search seeks actual decoder in {smart=}')
        call('restart')
        before=call('state');call('play_match',track_id=original[1],tracks=original,seconds=5)
        b.wait(lambda s:not s['seek_pending'])
        after=call('state')
        stable=before['source']==after['source'] and before['round']==after['round'] and [t['id'] for t in before['remaining']]==[t['id'] for t in after['remaining']]
        if not stable:print('SEEK CHANGE',json.dumps({k:{f:v[f] for f in ('source','round','remaining','now_id','seek_pending')} for k,v in [('before',before),('after',after)]}),flush=True)
        check(stable,'Same-track lyric seek preserves source and round')
        check(5<=fx('status')['position']<8,'Same-track lyric seek updates position')
    # Play from an ordinary source before editing it.
    call('play',playlist=pi,item=0);b.wait(lambda s:s['now_id']==original[0]);call('restart');before=call('state')
    call('track_reorder',playlist_guid=guid,expected=original,order=[3,0,2,1]);check(items(pi)==[original[i] for i in [3,0,2,1]],'Track reorder changes host playlist in requested order')
    after=call('state');check(before['now_id']==after['now_id'] and before['round']==after['round'],'Reorder preserves playing song and round')
    stale=b.request('track_reorder',playlist_guid=guid,expected=original,order=[0,1,2,3]);check(not stale['response']['ok'],'Stale reorder is rejected')
    current=items(pi);selected=[current[0],current[2]]
    menu=call('menu_open',kind='context',playlist_guid=guid,items=[0,2],tracks=selected)['response']['menu']
    def labels(nodes):
        return [n.get('label','') for n in nodes]+sum((labels(n.get('children',[])) for n in nodes),[])
    check(menu['selected_count']==2 and 'track_id' not in menu and any('Convert' in n or '转换' in n for n in labels(menu['items'])),'Real multi-track context menu retains Converter and no single-file recycle action')
    s=call('tracks_transfer',playlist_guid=guid,items=[0,2],tracks=selected,new_playlist=True,name='Mode acceptance moved',move=True);target=s['response']['target_playlist'];new_guids.append(info(target)['guid'])
    check(items(target)==selected and items(pi)==[current[1],current[3]],'Batch move creates real playlist and removes only selected occurrences')
    check(all(Path(p).exists() for p in files),'Moving playlist entries leaves audio files intact')
    fx('clear_queue');call('queue_add',tracks=[original[2]],play=False);call('queue_add',tracks=[original[3]],play=False)
    s=call('state');ids=[t['id'] for t in s['queue']];call('queue_reorder',scope='priority',expected=ids,order=[1,0]);check([t['id'] for t in call('state')['queue']]==ids[::-1],'Priority queue reorder uses real host queue')
    before=call('state');call('queue_add',tracks=[original[1]],play=True);b.wait(lambda s:s['now_id']==original[1] and (s['round']>before['round'] or original[1] not in [t['id'] for t in s['remaining']]));s=call('state')
    check(s['source']==before['source'] and (s['round']>before['round'] or original[1] not in [t['id'] for t in s['remaining']]) and len(s['queue'])==2,'Double-click insertion plays first, consumes the attempt and preserves existing queue and source')
    call('next');b.wait(lambda s:s['now_id']==ids[1]);check(not call('state')['seek_pending'],'Next cancels any lyric-seek target')
    fx('clear_queue');s=call('state');remaining=[t['id'] for t in s['remaining']]
    if len(remaining)>1:
        call('queue_reorder',scope='remaining',source=s['source'],expected=remaining,order=list(reversed(range(len(remaining)))));check([t['id'] for t in call('state')['remaining']]==remaining[::-1],'Smart queue drag reorders remaining songs without replacement')
    s=call('state');expected=[p['guid'] for p in s['playlists']];order=list(reversed(range(len(expected))));call('playlist_reorder',expected=expected,order=order);check([p['guid'] for p in call('state')['playlists']]==expected[::-1],'Sidebar reorder preserves playlist identities')
    call('playlist_reorder',expected=expected[::-1],order=order)
finally:
    import subprocess
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/stop'],check=True)
    time.sleep(.5);fx('cleanup')
(ROOT/'build/host-editing-acceptance.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf-8')
print(len(checks),'actual SDK editing checks passed')
