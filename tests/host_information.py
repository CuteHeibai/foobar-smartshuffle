"""Native text/resource and packaged worker checks in the disposable host."""
import json,os,sys,time,uuid,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile';CACHE=PROFILE/'smartshuffle'
sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(PROFILE);checks=[]
def check(value,name):
    assert value,name
    checks.append(name);print('PASS',name,flush=True)
def fx(op):
    q={'id':uuid.uuid4().hex,'op':op};p=PROFILE/'fixture-request.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(q),encoding='utf-8');os.replace(tmp,p)
    until=time.monotonic()+12
    while time.monotonic()<until:
        try:
            r=json.loads((PROFILE/'fixture-response.json').read_text(encoding='utf-8'))
            if r.get('id')==q['id']:assert r.get('ok'),r;return r
        except (ValueError,OSError):pass
        time.sleep(.05)
    raise TimeoutError(op)
def task(kind,**fields):
    r=b.request('metadata',task=kind,**fields);identity=r['metadata'][kind]['id']
    s=b.wait(lambda s:s.get('metadata',{}).get(kind,{}).get('id')==identity and not s['metadata'][kind]['pending'],timeout=90)
    r=s['metadata'][kind];assert r['ok'],r;return r['result']
language=b.request('localization')['response']['localization'];check(language['hook'] and language['entries']>=300,'Local translation dictionary and UI-thread hook are loaded')
fx('language_setup');time.sleep(.35);form=fx('language_status')
check(form['title']=='JSplitter 配置' and form['label']=='字体' and form['button']=='应用 (&A)','Actual hidden native dialog receives Chinese title, static label and button mnemonic')
check(form['edit']=='Font family','Native translation preserves editable user content')
artists=CACHE/'artists.json';old=artists.read_bytes() if artists.exists() else None
folder=CACHE/'artist-portraits';folder.mkdir(exist_ok=True);portrait=folder/'resource-fixture.png';portrait.write_bytes(b'fixture')
try:
    artists.write_text(json.dumps({'Fixture':{'verified':True,'portrait':str(portrait),'source':'https://musicbrainz.org/artist/9c9f1380-2516-4fc9-a3e6-f9f61941d090'}}),encoding='utf-8')
    for resource,expected in [('portrait',str(portrait)),('metadata',str(artists)),('source','https://musicbrainz.org/artist/9c9f1380-2516-4fc9-a3e6-f9f61941d090')]:
        s=b.request('artist_resource',name='Fixture',resource=resource,open=False);check(s['response']['ok'] and s['response']['resource']['target']==expected,'Artist action resolves '+resource+' from its actual cache')
    artists.write_text(json.dumps({'Fixture':{'verified':True,'portrait':str(ROOT/'README.md')}}),encoding='utf-8')
    check(not b.request('artist_resource',name='Fixture',resource='portrait',open=False)['response']['ok'],'Artist action rejects a portrait outside its cache')
finally:
    if old is None:artists.unlink(missing_ok=True)
    else:artists.write_bytes(old)
    portrait.unlink(missing_ok=True)
# Cached success exercises the shipped helper without relying on an external service.
manifest=CACHE/'covers.json';old_cover=manifest.read_bytes() if manifest.exists() else None
try:
    from analyzer.covers import _row
    row={'path':str(ROOT/'build/edit-fixtures/edit-0.wav'),'subsong':0,'artist':'Fixture','album':'Fixture','musicbrainz_albumid':'76df3287-6cda-33eb-8e9a-044b5e15ffdd'}
    item,album=_row(row);image=CACHE/'album-covers/host-worker-fixture.jpg';image.parent.mkdir(exist_ok=True);image.write_bytes(b'\xff\xd8\xff'+b'x'*16)
    manifest.write_text(json.dumps({'version':1,'tracks':{},'albums':{album['key']:{'cover':str(image),'source':'https://coverartarchive.org/release/'+row['musicbrainz_albumid']+'/front-500'}}}),encoding='utf-8')
    result=task('covers',rows=[row]);check(result['covers'][0]['status']=='cached' and result['covers'][0]['cover']==str(image),'Packaged cover helper reuses successful local cache through the real worker')
finally:
    image.unlink(missing_ok=True)
    if old_cover is None:manifest.unlink(missing_ok=True)
    else:manifest.write_bytes(old_cover)
(ROOT/'build/host-information-acceptance.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf-8')
print(len(checks),'native information checks passed')
