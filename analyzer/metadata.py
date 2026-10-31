"""Local search index and explicitly requested MusicBrainz/Wikidata artist verification."""
import hashlib
import html
import json
import re
import sqlite3
import time
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, unquote
from analyzer.__main__ import _publish

VERSION=3
UA='foobar-smartshuffle/1.0.1 (https://github.com/CuteHeibai/foobar-smartshuffle)'

def norm(text):
    text=unicodedata.normalize('NFKC',str(text)).casefold()
    result=[]
    for char in text:
        # Japanese voicing distinguishes names; only Latin accent marks are folded.
        if '\u3040'<=char<='\u30ff':
            if char.isalnum():result.append(char)
        else:result.extend(c for c in unicodedata.normalize('NFKD',char) if c.isalnum() and not unicodedata.combining(c))
    return ''.join(result)

@lru_cache(maxsize=12000)
def aliases(text):
    from pypinyin import lazy_pinyin, Style
    import jaconv
    from sudachipy import dictionary
    if not hasattr(aliases,'tokenizer'):aliases.tokenizer=dictionary.Dictionary(dict='small').create()
    py=lazy_pinyin(text,style=Style.NORMAL,errors=lambda x:list(x))
    kana=''.join(t.reading_form() for t in aliases.tokenizer.tokenize(text))
    return list(dict.fromkeys([norm(text),norm(''.join(py)),norm(''.join(p[:1] for p in py)),norm(jaconv.kana2alphabet(jaconv.kata2hira(kana)))]))

def read_lyric_document(row,root):
    text=str(row.get('lyrics',''))[:64000]
    path=str(row.get('path',''))
    if path.lower().startswith('file://'):path=path[7:]
    if path.lower().startswith('file-relative://'):path=str(root.parent.parent/path[16:])
    if path and not re.match(r'^\w+://',path):
        p=Path(path);clean=lambda s:re.sub(r'[<>:"/\\|?*]','_',s).rstrip('. ')
        title=str(row.get('title',''));artist=str(row.get('artist',''));folder=root.parent/'lyrics'
        candidates=[p.with_suffix('.lrc'),p.with_suffix('.txt')]
        for stem in [artist+' - '+title,artist+'-'+title,title]:
            candidates.extend([folder/(clean(stem)+'.lrc'),folder/(clean(stem)+'.txt')])
        candidates.append(folder/clean(artist)/(clean(title)+'.lrc'))
        for candidate in candidates:
            try:
                if candidate.stat().st_size>1024*1024:continue
                raw=candidate.read_bytes()
                encodings=['utf-16'] if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else ['utf-8-sig']
                if encodings==['utf-8-sig']:
                    try:raw.decode('utf-8-sig')
                    except UnicodeError:
                        from charset_normalizer import from_bytes
                        best=from_bytes(raw).best()
                        if best is not None:encodings.append(best.encoding)
                        encodings.extend(['gb18030','cp932'])
                for encoding in encodings:
                    try:text+='\n'+raw.decode(encoding);break
                    except UnicodeError:continue
                break
            except OSError:continue
    lines=[]
    offsets=re.findall(r'\[offset:([+-]?\d+)\]',text,re.I)
    offset=int(offsets[-1])/1000 if offsets else 0
    for line in text.splitlines():
        if re.match(r'^\s*\[(?:ar|al|ti|by|offset|re|ve):',line,re.I):continue
        times=[max(0,int(m)*60+float(s)-offset) for m,s in re.findall(r'\[(\d+):(\d+(?:\.\d+)?)\]',line)]
        line=re.sub(r'\[[\d:.]+\]|<\d[\d:.]*>','',line).strip()
        if line:
            for timestamp in times or [None]:lines.append({'text':line,'time':timestamp})
    return {'text':'\n'.join(dict.fromkeys(line['text'] for line in lines))[:64000],'lines':lines}

def read_lyrics(row,root):
    return read_lyric_document(row,root)['text']

def search(root,request):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    rows=request.get('rows')
    if rows is None:
        catalog=json.loads((root/'metadata-catalog.json').read_text(encoding='utf-8-sig'))
        if catalog.get('catalog','')!=request.get('catalog',''):raise ValueError('曲库已变化，请重新搜索')
        rows=catalog['rows']
    try:artists=json.loads((root/'artists.json').read_text(encoding='utf-8'))
    except (OSError,ValueError):artists={}
    # The DB contains only derivatives. Refresh content/sidecar stamps on each search;
    # transliteration is reused byte-for-byte for unchanged tracks, including after restart.
    db=sqlite3.connect(root/'search.sqlite')
    db.execute('CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY, fingerprint TEXT, data TEXT)')
    terms=[norm(t) for t in request.get('query','').strip().split() if norm(t)]
    matches=[];seen=set()
    try:
        for index,row in enumerate(rows):
            identity=row['id']
            if identity in seen:continue
            seen.add(identity);document=read_lyric_document(row,root);lyric=document['text']
            signature=hashlib.sha256(json.dumps([VERSION,row,document,artists.get(row.get('artist',''),{})],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
            cached=db.execute('SELECT fingerprint,data FROM tracks WHERE id=?',(identity,)).fetchone()
            if cached and cached[0]==signature:data=json.loads(cached[1])
            else:
                fields=[str(row.get(k,'')) for k in ('title','artist','album')]
                verified=artists.get(row.get('artist',''),{})
                if verified.get('verified'):fields.extend([verified.get('name','')]+verified.get('aliases',[]))
                data={'fields':[aliases(f) for f in fields],'lyrics':lyric,'lyric_lines':document['lines'],'lyric_keys':[norm(lyric)]}
                # Lyric text is searched literally; phonetic search indexes metadata, not entire lyric books.
                db.execute('INSERT OR REPLACE INTO tracks VALUES(?,?,?)',(identity,signature,json.dumps(data,ensure_ascii=False)))
            if not terms:continue
            scores=[];reasons=[];lyric_terms=[]
            for term in terms:
                best=0;reason=''
                for field in data['fields']:
                    for j,key in enumerate(field):
                        score=(110 if key==term else 100 if key.startswith(term) else 85 if term in key else 0)-(j*8)
                        if not score and term.isascii() and len(term)>=5:
                            words=re.findall('[a-z0-9]+',str(row.get('title','')).casefold())+re.findall('[a-z0-9]+',str(row.get('artist','')).casefold())
                            if any(abs(len(word)-len(term))<=2 and SequenceMatcher(None,word,term).ratio()>=.8 for word in words):score=45
                        if score>best:best=score;reason='文字' if j==0 else '拼音 / 罗马音'
                if not best and term in data['lyric_keys'][0]:best=35;reason='歌词'
                if not best:break
                scores.append(best);reasons.append(reason)
                if reason=='歌词':lyric_terms.append(term)
            if len(scores)!=len(terms):continue
            reason='歌词' if '歌词' in reasons else '拼音 / 罗马音' if '拼音 / 罗马音' in reasons else '文字'
            snippet='';lyric_time=None
            if reason=='歌词':
                lines=[line for line in data['lyric_lines'] if any(t in norm(line['text']) for t in lyric_terms)]
                if lines:
                    line=min(lines,key=lambda line:(-sum(t in norm(line['text']) for t in lyric_terms),line['time'] is None,line['time'] or 0))
                    snippet=line['text'][:160];lyric_time=line['time']
            matches.append({'id':identity,'index':index,'score':sum(scores),'reason':reason,'snippet':snippet,'lyric_time':lyric_time})
        db.executemany('DELETE FROM tracks WHERE id=?',[(r[0],) for r in db.execute('SELECT id FROM tracks').fetchall() if r[0] not in seen]);db.commit()
    finally:db.close()
    matches.sort(key=lambda r:(-r['score'],r['index']))
    return {'matches':matches[:150],'total':len(matches),'query':request.get('query',''),'catalog':request.get('catalog','')}

def get_json(url,params=None):
    import requests
    for attempt in range(3):
        r=requests.get(url,params=params,headers={'User-Agent':UA},timeout=(8,20))
        if r.status_code not in (429,503) or attempt==2:r.raise_for_status();return r.json()
        try:delay=float(r.headers.get('Retry-After',2*(attempt+1)))
        except ValueError:delay=2*(attempt+1)
        time.sleep(max(1,min(30,delay)))

def mb_endpoint(root,entity,suffix,params):
    # Requests across worker processes share the rate limit marker.
    marker=root/'musicbrainz-time.txt'
    try:delay=1.1-(time.time()-float(marker.read_text()))
    except (OSError,ValueError):delay=0
    if delay>0:time.sleep(min(delay,1.1))
    marker.write_text(str(time.time()),encoding='ascii')
    return get_json('https://musicbrainz.org/ws/2/'+entity+'/'+suffix,{**params,'fmt':'json'})

def mb_request(root,suffix,params):return mb_endpoint(root,'artist',suffix,params)

def lookup_artist(root,request):
    name=str(request['name']).strip()[:240];escaped=re.sub(r'([+\-!(){}\[\]^"~*?:\\/])',r'\\\1',name)
    result=mb_request(root,'',{'query':'artist:"'+escaped+'"','limit':8})
    return {'name':name,'candidates':[{'mbid':r['id'],'name':r['name'],'country':r.get('country',''),'type':r.get('type',''),'description':r.get('disambiguation',''),'score':r.get('score',0),'aliases':[a.get('name','') for a in r.get('aliases',[])]} for r in result.get('artists',[])]}

def confirm_artist(root,request):
    name=str(request['name'])[:240];mbid=str(request['mbid'])
    if not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}',mbid):raise ValueError('Invalid artist ID')
    detail=mb_request(root,mbid,{'inc':'url-rels+aliases'})
    if detail.get('id')!=mbid:raise ValueError('Artist identity changed')
    record={'verified':True,'verification':request.get('verification','selected'),'mbid':mbid,'name':detail['name'],'original':name,'country':detail.get('country',''),'type':detail.get('type',''),
            'description':detail.get('disambiguation',''),'aliases':[a['name'] for a in detail.get('aliases',[])],'source':'https://musicbrainz.org/artist/'+mbid,'checked_at':int(time.time())}
    qid=None
    for relation in detail.get('relations',[]):
        match=re.fullmatch(r'https?://(?:www\.)?wikidata.org/(?:wiki|entity)/(Q\d+)',relation.get('url',{}).get('resource',''))
        if match:qid=match[1];break
    if qid:
        record['wikidata']='https://www.wikidata.org/wiki/'+qid
        try:
            entity=get_json('https://www.wikidata.org/wiki/Special:EntityData/'+qid+'.json')['entities'][qid]
            claims=entity.get('claims',{}).get('P18',[])
            kind='photo'
            if not claims:claims=entity.get('claims',{}).get('P154',[]);kind='logo'
            if claims:
                filename=claims[0]['mainsnak']['datavalue']['value']
                data=get_json('https://commons.wikimedia.org/w/api.php',{'action':'query','format':'json','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':500})
                pages=data['query']['pages'];page=next(iter(pages.values()));image=page.get('imageinfo',[{}])[0];url=image.get('thumburl','')
                if urlparse(url).scheme=='https' and urlparse(url).hostname in ('upload.wikimedia.org','thumb.wikimedia.org'):
                    import requests
                    response=requests.get(url,headers={'User-Agent':UA},timeout=(8,25));response.raise_for_status()
                    if len(response.content)>8*1024*1024:raise ValueError('Portrait too large')
                    if not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Portrait response is not an image')
                    folder=root/'artist-portraits';folder.mkdir(exist_ok=True);portrait=folder/(mbid+'.jpg');portrait.write_bytes(response.content)
                    meta=image.get('extmetadata',{})
                    plain=lambda k:html.unescape(re.sub('<[^>]+>','',meta.get(k,{}).get('value','')))
                    record.update(portrait_kind=kind,portrait=str(portrait),portrait_source=image.get('descriptionurl',''),portrait_author=plain('Artist'),portrait_license=plain('LicenseShortName'),portrait_license_url=plain('LicenseUrl'))
        except Exception as error:record['portrait_error']=str(error)
    if not record.get('portrait') or record.get('portrait_kind')=='logo':
        # The linked Spotify ARTIST entity supplies its independent artist image,
        # never a track/album thumbnail. Keep provenance and do not redistribute caches.
        for relation in detail.get('relations',[]):
            link=relation.get('url',{}).get('resource','')
            if not re.fullmatch(r'https://open\.spotify\.com/artist/[A-Za-z0-9]{22}',link):continue
            try:
                embed=get_json('https://open.spotify.com/oembed',{'url':link});image=embed.get('thumbnail_url','');host=urlparse(image).hostname or ''
                if embed.get('provider_name')!='Spotify' or urlparse(image).scheme!='https' or not (host=='i.scdn.co' or host.endswith('.spotifycdn.com')):continue
                import requests
                response=requests.get(image,headers={'User-Agent':UA},timeout=(8,25));response.raise_for_status()
                if len(response.content)>8*1024*1024 or not response.headers.get('Content-Type','').startswith('image/'):raise ValueError('Invalid artist image')
                folder=root/'artist-portraits';folder.mkdir(exist_ok=True);portrait=folder/(mbid+'.jpg');portrait.write_bytes(response.content)
                record.update(portrait=str(portrait),portrait_kind='photo',portrait_source=link,portrait_author='Spotify / 原权利人',portrait_license='未提供开放许可；本地缓存',portrait_license_url='https://www.spotify.com/legal/end-user-agreement/')
                record.pop('portrait_error',None);break
            except Exception as error:record['portrait_error']=str(error)
    path=root/'artists.json'
    try:artists=json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError):artists={}
    old=artists.get(name,{})
    if old.get('mbid')==mbid and not record.get('portrait') and old.get('portrait') and Path(old['portrait']).is_file():
        for key in ('portrait','portrait_source','portrait_author','portrait_license','portrait_license_url','portrait_kind'):record[key]=old.get(key,'')
    artists[name]=record;_publish(path,artists)
    return {'artist':record}

def wikidata_artist_ids(name):
    language='ja' if re.search('[\u3040-\u30ff]',name) else 'zh' if re.search('[\u3400-\u9fff]',name) else 'en'
    found=get_json('https://www.wikidata.org/w/api.php',{'action':'wbsearchentities','search':name,'language':language,'type':'item','limit':5,'format':'json'})
    identities=set()
    for candidate in found.get('search',[])[:5]:
        qid=candidate.get('id','')
        if not re.fullmatch(r'Q\d+',qid):continue
        entity=get_json('https://www.wikidata.org/wiki/Special:EntityData/'+qid+'.json')['entities'][qid]
        names=[v.get('value','') for v in entity.get('labels',{}).values()]
        names.extend(a.get('value','') for aliases in entity.get('aliases',{}).values() for a in aliases)
        if norm(name) not in {norm(n) for n in names}:continue
        for claim in entity.get('claims',{}).get('P434',[]):
            identity=claim.get('mainsnak',{}).get('datavalue',{}).get('value')
            if isinstance(identity,str):identities.add(identity)
    return list(identities)

def auto_artist(root,request):
    name=str(request['name']).strip()[:240]
    identities=list(dict.fromkeys(m for m in request.get('mbids',[]) if re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',m,re.I)))
    if len(identities)==1:return confirm_artist(root,{'name':name,'mbid':identities[0],'verification':'embedded MusicBrainz artist ID'})
    try:cached=json.loads((root/'artists.json').read_text(encoding='utf-8')).get(name,{})
    except (OSError,ValueError):cached={}
    if cached.get('verified') and cached.get('mbid'):
        return confirm_artist(root,{'name':name,'mbid':cached['mbid'],'verification':cached.get('verification','previously verified identity')})
    try:candidates=lookup_artist(root,{'name':name})['candidates']
    except Exception:
        identities=wikidata_artist_ids(name)
        if len(identities)==1:return confirm_artist(root,{'name':name,'mbid':identities[0],'verification':'Wikidata name / alias with MusicBrainz artist ID'})
        raise
    exact=[c for c in candidates if norm(name) in [norm(c['name'])]+[norm(a) for a in c.get('aliases',[])]]
    if len(exact)==1:return confirm_artist(root,{'name':name,'mbid':exact[0]['mbid'],'verification':'unique matching artist name / alias'})
    # Multiple identical names require actual release credits rather than popularity scores.
    credited=set();candidate_ids={c['mbid'] for c in candidates}
    escaped=lambda text:re.sub(r'([+\-!(){}\[\]^"~*?:\\/])',r'\\\1',str(text))
    for album in request.get('albums',[])[:3]:
        if not album or album in ('未知专辑','?'):continue
        result=mb_endpoint(root,'release-group','',{'query':'releasegroup:"'+escaped(album)+'" AND artist:"'+escaped(name)+'"','limit':8})
        for release in result.get('release-groups',[]):
            if norm(release.get('title',''))!=norm(album):continue
            for credit in release.get('artist-credit',[]):
                identity=credit.get('artist',{}).get('id')
                if identity in candidate_ids:credited.add(identity)
        if len(credited)==1:break
    if len(credited)==1:return confirm_artist(root,{'name':name,'mbid':next(iter(credited)),'verification':'matching release artist credit'})
    try:
        identities=wikidata_artist_ids(name)
        if len(identities)==1:return confirm_artist(root,{'name':name,'mbid':identities[0],'verification':'Wikidata name / alias with MusicBrainz artist ID'})
    except Exception:pass
    return {'name':name,'needs_review':True,'candidates':candidates}

def execute(root,request):
    root=Path(root).resolve()
    task=request.get('task')
    if task=='search':return search(root,request)
    if task=='artist_lookup':return lookup_artist(root,request)
    if task=='artist_confirm':return confirm_artist(root,request)
    if task=='artist_auto':return auto_artist(root,request)
    raise ValueError('Unknown metadata task')
