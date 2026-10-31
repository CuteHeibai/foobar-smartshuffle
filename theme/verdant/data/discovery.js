/* Background local search and separately verified artist identities. */
var ssSearchTimer=0,ssSearchRequest='',ssSearchQuery='',ssSearchCatalog='',ssSearchBusy=false,ssSearchError='';
var ssArtists={},ssArtistImages={},ssArtistRequest='',ssArtistAction='',ssArtistRaw='',SS_ARTIST_HB=null;
function ssInvalidateSearch(){searchIdx=null;searchQ2=null;ssSearchCatalog='';ssSearchQuery='';ssSearchRequest='';}
function ssLoadArtists(){
  try{ssArtists=JSON.parse(utils.ReadTextFile(SS_ROOT+'artists.json',65001).replace(/^\uFEFF/,''));}catch(e){ssArtists={};}
  ssArtistImages={};artCardCache={};artCardN=0;
  artistList=null;artistTracksMap=null;artistCandCache={};ssInvalidateSearch();
}
function ssArtistName(name){var r=ssArtists[name];return r&&r.verified?r.name:name;}
function ssArtistRecord(name){return ssArtists[name]&&ssArtists[name].verified?ssArtists[name]:null;}
function ssDrawArtistAvatar(gr,x,y,size,name){
  var record=ssArtistRecord(name),key=name+'|'+size,img=ssArtistImages[key];
  if(img===undefined){
    img=null;
    if(record&&record.portrait)try{
      var source=gdi.Image(record.portrait),side=Math.min(source.Width,source.Height);
      img=gdi.CreateImage(size,size);var graphics=img.GetGraphics();graphics.SetInterpolationMode(7);
      graphics.DrawImage(source,0,0,size,size,(source.Width-side)/2,(source.Height-side)/2,side,side);
      img.ReleaseGraphics(graphics);img.ApplyMask(circleMask(size));
    }catch(e){img=null;}
    if(Object.keys(ssArtistImages).length>120)ssArtistImages={};ssArtistImages[key]=img;
  }
  if(img)gr.DrawImage(img,x,y,size,size,0,0,size,size);
  else{gr.FillEllipse(x,y,size,size,coverCol(name));tC(gr,String(ssArtistName(name)).slice(0,2),FONT.title,COL.text,x,y,size,size);}
}
var ssArtistAutoRequest='',ssArtistAutoName='',ssArtistAutoStatus={};
function ssArtistAuto(name){
  var albums=[],mbids=[];
  for(var i=0;i<artistAlbums.length;i++){
    if(artistAlbums[i].album)albums.push(artistAlbums[i].album);
    try{
      var raw=fb.TitleFormat('%musicbrainz_artistid%').EvalWithMetadb(artistAlbums[i].handle);
      var ids=String(raw).match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/ig)||[];
      for(var j=0;j<ids.length;j++)if(mbids.indexOf(ids[j])<0)mbids.push(ids[j]);
    }catch(e){}
  }
  ssArtistAutoName=name;ssArtistAutoStatus[name]='正在联网核验…';
  ssArtistAutoRequest=ssSend('metadata',{task:'artist_auto',name:name,albums:albums.slice(0,3),mbids:mbids});
}
function ssArtistLookup(name,x,y){
  ssArtistRaw=name;ssArtistAction='artist_lookup';
  ssArtistRequest=ssSend('metadata',{task:'artist_lookup',name:name});
  ssShowPopup([{label:'正在联网核验歌手身份…',disabled:true}],x,y);
  ssPopup.discovery=ssArtistRequest;
}
function ssArtistMenu(name,x,y){
  var r=ssArtistRecord(name),items=[];
  if(r){
    items.push({label:r.name,disabled:true},{label:'MusicBrainz · '+(r.country||r.type||'歌手资料'),disabled:true});
    if(r.description)items.push({label:r.description,disabled:true});
    if(r.portrait_license)items.push({label:'头像：'+r.portrait_license+' · '+(r.portrait_author||'Wikimedia Commons'),disabled:true});
    items.push({separator:true});
  }
  items.push({label:r?'重新联网核验…':'联网核验歌手…',run:function(){ssArtistLookup(name,x,y);}});
  ssShowPopup(items,x,y);
}
function ssScheduleSearch(query){
  if(query===ssSearchQuery&&ssSearchCatalog)return;
  ssSearchRequest='';ssSearchQuery=query;ssSearchBusy=!!query;ssSearchError='';
  if(ssSearchTimer)window.ClearTimeout(ssSearchTimer);
  ssSearchTimer=window.SetTimeout(function(){
    ssSearchTimer=0;if(!ssSearchQuery)return;
    var index=getSearchIdx();
    if(!ssSearchCatalog){
      ssSearchCatalog=ssSession+'-'+Date.now();
      var rows=index.map(function(t){return {id:t.id,path:t.h.Path,title:t.title,artist:t.artist,album:t.album,lyrics:t.lyrics||''};});
      try{if(utils.WriteTextFile(SS_ROOT+'metadata-catalog.json',JSON.stringify({catalog:ssSearchCatalog,rows:rows}),false)===false)throw Error('无法保存搜索索引');}
      catch(e){ssSearchBusy=false;ssSearchError=String(e);return;}
    }
    ssSearchRequest=ssSend('metadata',{task:'search',query:ssSearchQuery,catalog:ssSearchCatalog});
  },220);
}
function ssAcceptDiscovery(state){
  var tasks=state.metadata||{},search=tasks.search,automatic=tasks.artist_auto;
  if(automatic&&automatic.id===ssArtistAutoRequest&&!automatic.pending){
    ssArtistAutoRequest='';
    if(automatic.ok&&automatic.result.artist){ssArtistAutoStatus[ssArtistAutoName]='已联网核验';ssLoadArtists();}
    else ssArtistAutoStatus[ssArtistAutoName]=automatic.ok?'存在同名歌手，待确认':'网络暂不可用，使用本地缓存';
  }
  if(search&&search.id===ssSearchRequest&&!search.pending){
    ssSearchRequest='';ssSearchBusy=false;
    if(search.ok&&search.result.query===ssSearchQuery&&search.result.catalog===ssSearchCatalog){
      var index=getSearchIdx(),matches=search.result.matches||[];
      searchTrks=[];
      for(var i=0;i<matches.length;i++){
        var match=matches[i],t=index[match.index];if(!t||t.id!==match.id)continue;
        var copy={};for(var k in t)copy[k]=t[k];copy.reason=match.reason;copy.snippet=match.snippet;searchTrks.push(copy);
      }
      var names={};for(i=0;i<searchTrks.length;i++)names[searchTrks[i].artist]=true;
      searchArts=getArtistList().filter(function(a){return names[a.name];}).slice(0,24);
    }else if(!search.ok)ssSearchError=search.error||'搜索索引暂不可用';
  }
  var artist=tasks[ssArtistAction];
  if(artist&&artist.id===ssArtistRequest&&!artist.pending){
    var request=ssArtistRequest;ssArtistRequest='';
    if(!ssPopup||ssPopup.discovery!==request)return;
    var x=ssPopup.x,y=ssPopup.y,raw=ssArtistRaw;
    if(!artist.ok){ssShowPopup([{label:'核验失败，可稍后重试',disabled:true},{label:artist.error||'网络不可用',disabled:true},{label:'重试',run:function(){ssArtistLookup(raw,x,y);}}],x,y);return;}
    if(ssArtistAction==='artist_lookup'){
      var items=(artist.result.candidates||[]).map(function(c){return {label:c.name+' · '+(c.country||c.type||'')+(c.description?' · '+c.description:''),run:function(){
        ssArtistAction='artist_confirm';ssArtistRequest=ssSend('metadata',{task:'artist_confirm',name:raw,mbid:c.mbid});
        ssShowPopup([{label:'正在保存歌手资料及独立头像…',disabled:true}],x,y);ssPopup.discovery=ssArtistRequest;
      }};});
      ssShowPopup([{label:'请选择正确的歌手身份',disabled:true}].concat(items.length?items:[{label:'没有找到可核验资料',disabled:true}]),x,y);
    }else{ssLoadArtists();ssClosePopup();}
  }
}
