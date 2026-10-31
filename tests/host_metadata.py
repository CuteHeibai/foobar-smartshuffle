"""Real packaged helper through the disposable foobar, without UI automation."""
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from bridge import Bridge
b=Bridge(ROOT/'test-player/profile');root=ROOT/'test-player/profile/smartshuffle';checks=[]
def check(ok,name):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def task(kind,**fields):
 state=b.request('metadata',task=kind,**fields);identity=state['metadata'][kind]['id']
 before=time.monotonic();b.request('state');check(time.monotonic()-before<2,'Playback state remains responsive during '+kind)
 s=b.wait(lambda s:s.get('metadata',{}).get(kind,{}).get('id')==identity and not s['metadata'][kind]['pending'],timeout=80)
 result=s['metadata'][kind];assert result.get('ok'),result
 return result['result']
catalog=root/'metadata-catalog.json';original=catalog.read_bytes() if catalog.exists() else None
artists=root/'artists.json';old_artists=artists.read_bytes() if artists.exists() else None
portrait=root/'artist-portraits/9c9f1380-2516-4fc9-a3e6-f9f61941d090.jpg';old_portrait=portrait.read_bytes() if portrait.exists() else None
try:
 catalog.write_text(json.dumps({'catalog':'host-metadata-fixture','rows':[
  {'id':'cn|0','path':str(ROOT/'build/metadata-cn.flac'),'title':'夜曲','artist':'周杰伦','album':'十一月的萧邦','lyrics':'窗外的麻雀'},
  {'id':'jp|0','path':str(ROOT/'build/metadata-jp.flac'),'title':'青春コンプレックス','artist':'結束バンド','album':'結束バンド','lyrics':''}]}),encoding='utf-8')
 for query,expected in [('zhou jie lun','cn|0'),('seishun','jp|0'),('窗外','cn|0')]:
  result=task('search',query=query,catalog='host-metadata-fixture');check(result['matches'][0]['id']==expected,'Packaged offline search finds '+query)
 result=task('artist_lookup',name='Muse');check(any(c['mbid']=='9c9f1380-2516-4fc9-a3e6-f9f61941d090' for c in result['candidates']),'Live MusicBrainz candidates contain the independently identified UK band')
 result=task('artist_confirm',name='Muse',mbid='9c9f1380-2516-4fc9-a3e6-f9f61941d090')['artist']
 check(result['verified'] and result['country']=='GB' and Path(result['portrait']).is_file() and result['portrait_license'],'Live verified identity and independent licensed portrait persist locally')
 check(json.loads(artists.read_text(encoding='utf-8'))['Muse']['source']==result['source'],'Stored artist information retains its provenance')
 result=task('artist_auto',name='Muse',albums=['Black Holes and Revelations'],mbids=['9c9f1380-2516-4fc9-a3e6-f9f61941d090'])['artist']
 check(result['mbid']=='9c9f1380-2516-4fc9-a3e6-f9f61941d090' and result['verification']=='embedded MusicBrainz artist ID' and Path(result['portrait']).is_file(),'Silent artist verification validates the supplied artist identity and downloads its portrait')
finally:
 if original is None:catalog.unlink(missing_ok=True)
 else:catalog.write_bytes(original)
 if old_artists is None:artists.unlink(missing_ok=True)
 else:artists.write_bytes(old_artists)
 if old_portrait is None:portrait.unlink(missing_ok=True)
 else:portrait.write_bytes(old_portrait)
(ROOT/'build/host-metadata-acceptance.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(len(checks),'real metadata/search checks passed',flush=True)
