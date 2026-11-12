/* Probe local artwork in small steps and share the metadata helper with artist verification. */
var ssCoverTracks={},ssCoverRows=[],ssCoverBusy=false,ssCoverTimer=0,ssCoverStartup=0,ssCoverRequest='',ssCoverMissing=new Map(),ssCoverBatch=new Map(),ssCoverReadyAt=0;
var ssCoverAttempted=new Set(),ssMediaSeen=new Set(),ssMediaQueued=new Set(),ssMediaNext='artist',ssCoverTF=null;
function ssLoadCovers(){try{var j=JSON.parse(utils.ReadTextFile(SS_ROOT+'covers.json',65001).replace(/^\uFEFF/,''));ssCoverTracks=j.version===1?j.tracks||{}:{};}catch(e){ssCoverTracks={};}}
function ssCachedCover(h){
  var entry=ssCoverTracks[h.Path+'|'+h.SubSong];if(!entry||!entry.cover)return null;
  try{var img=gdi.Image(entry.cover);if(img&&img.Width>ART_MAXPX)img=img.Resize(ART_MAXPX,Math.round(img.Height*ART_MAXPX/img.Width),ART_DOWNSCALE);return img;}catch(e){return null;}
}
function ssCoverRow(h){
  if(!ssCoverTF)ssCoverTF={release:fb.TitleFormat('[%musicbrainz_albumid%]'),group:fb.TitleFormat('[%musicbrainz_releasegroupid%]')};
  return {id:h.Path+'|'+h.SubSong,path:h.Path,subsong:h.SubSong,artist:TF.artist.EvalWithMetadb(h),album:TF.album.EvalWithMetadb(h),album_artist:TF.artistName.EvalWithMetadb(h),musicbrainz_albumid:ssCoverTF.release.EvalWithMetadb(h),musicbrainz_releasegroupid:ssCoverTF.group.EvalWithMetadb(h)};
}
function ssPumpMediaLookups(){
  if(ssCoverRequest||ssArtistAutoRequest)return;
  var coversReady=ssCoverMissing.size&&(ssCoverMissing.size>=2||!ssCoverRows.length||Date.now()>=ssCoverReadyAt);
  if((ssMediaNext==='artist'||!coversReady)&&ssPumpArtistAuto()){
    ssMediaNext='covers';return;
  }
  if(!coversReady)return;
  var batch=[],count=0,refreshMissing=!ssCoverAttempted.has(ssCoverMissing.keys().next().value);ssCoverBatch.clear();
  for(var pair of ssCoverMissing){
    if((!ssCoverAttempted.has(pair[0]))!==refreshMissing)continue;
    ssCoverAttempted.add(pair[0]);
    for(var row of pair[1]){batch.push(row);ssCoverBatch.set(row.id,{key:pair[0],row:row});}
    ssCoverMissing.delete(pair[0]);
    if(++count===2)break;
  }
  ssMediaNext='artist';
  ssCoverRequest=ssSend('metadata',{task:'covers',rows:batch,max_albums:2,time_budget:40,refresh_missing:refreshMissing});
}
function ssCoverStep(){
  ssPumpMediaLookups();
  if(ssCoverBusy)return;
  if(!ssCoverRows.length){
    if(!ssCoverRequest&&!ssCoverMissing.size&&!ssArtistAutoRequest&&!ssArtistAutoQueue.size){
      if(ssCoverTimer)window.ClearInterval(ssCoverTimer);
      ssCoverTimer=0;
    }
    return;
  }
  if(artInFlight>0||ssSelectOwner||ssDragging)return;
  var item=ssCoverRows.shift(),h=item.handle;
  ssMediaQueued.delete(item.key);ssMediaSeen.add(item.key);
  try{
    var row=ssCoverRow(h);
    ssQueueArtistAuto(row.album_artist,row.album,h,false);
    var key=JSON.stringify(row.musicbrainz_albumid||row.musicbrainz_releasegroupid?[row.musicbrainz_albumid,row.musicbrainz_releasegroupid]:[row.album_artist.trim().toLowerCase(),row.album.trim().toLowerCase()]);
    if(!row.musicbrainz_albumid&&!row.musicbrainz_releasegroupid&&(!row.album||!row.album_artist||row.album_artist==='?'))return;
    if(ssCoverTracks[row.id]&&ssCoverTracks[row.id].cover&&!item.retry)return;
    ssCoverBusy=true;
    function done(has){
      if(!has){
        if(item.retry)ssCoverAttempted.delete(key);
        if(!ssCoverMissing.size)ssCoverReadyAt=Date.now()+750;
        if(!ssCoverMissing.has(key))ssCoverMissing.set(key,[]);
        ssCoverMissing.get(key).push(row);
      }
      ssCoverBusy=false;
    }
    try{utils.GetAlbumArtAsyncV2(0,h,0,false,false,false).then(function(r){done(!!(r&&r.image));},function(){done(false);});}catch(e){done(false);}
  }catch(e){console.log('Smart Shuffle metadata: '+String(e));}
}
function ssQueueMedia(handles,retry,first){
  if(!handles)return;
  var added=[];
  for(var i=0;i<handles.Count;i++){
    var h=handles[i],key=h.RawPath+'|'+h.SubSong;
    if(!/^file:\/\//i.test(h.RawPath)||ssMediaQueued.has(key)||(!retry&&ssMediaSeen.has(key)))continue;
    ssMediaQueued.add(key);added.push({handle:h,key:key,retry:retry});
  }
  ssCoverRows=first?added.concat(ssCoverRows):ssCoverRows.concat(added);
  if(added.length)ssStartMediaTimer();
}
function ssStartMediaTimer(){
  if(!ssCoverTimer)ssCoverTimer=window.SetInterval(ssCoverStep,150);
}
function ssResolveMediaTracks(ids){
  var wanted=new Set(ids.filter(function(id){return /^file:\/\//i.test(id);})),selected=fb.CreateHandleList();
  function add(handle){
    if(handle&&wanted.delete(ssTrackID(handle)))selected.Add(handle);
  }
  for(var id of wanted)add(ssCatalogHandle(id));
  if(wanted.size)add(fb.GetNowPlaying());
  if(wanted.size){
    var queue=plman.GetPlaybackQueueContents();
    for(var i=0;i<queue.length&&wanted.size;i++)add(queue[i].Handle);
  }
  return selected;
}
function ssRefreshMedia(handles){
  for(var i=0;i<handles.Count;i++)ssArtistAutoSeen.delete(TF.artistName.EvalWithMetadb(handles[i]));
  ssQueueMedia(handles,true,true);
}
function ssStartCovers(){
  ssLoadCovers();
  ssCoverStartup=window.SetTimeout(function(){
    ssCoverStartup=0;ssQueueMedia(ssCatalogHandles(),false,false);
  },4000);
}
function ssAcceptCovers(state){
  var task=state.metadata&&state.metadata.covers;if(!task||task.id!==ssCoverRequest||task.pending)return;
  ssCoverRequest='';
  if(!task.ok){ssCoverBatch.clear();console.log('Smart Shuffle cover lookup: '+(task.error||'failed'));return;}
  var rows=task.result.covers||[];
  for(var row of rows){
    if(row.status!=='deferred')continue;
    var entry=ssCoverBatch.get(row.id);if(!entry)continue;
    ssCoverAttempted.delete(entry.key);
    if(!ssCoverMissing.has(entry.key))ssCoverMissing.set(entry.key,[]);
    ssCoverMissing.get(entry.key).push(entry.row);
  }
  ssCoverBatch.clear();
  if(!rows.some(function(row){return !!row.cover;}))return;
  ssLoadCovers();
  for(var key in artCache)if(artCache[key]===null)delete artCache[key];
  thumbCache={};cArtCache={};coverPickCache={};plCardCache={};artCardCache={};plCoverCache={};mosaicCache={};warmed={};artWarmRepaint();
}
function ssStopCovers(){
  if(ssCoverTimer)window.ClearInterval(ssCoverTimer);ssCoverTimer=0;
  if(ssCoverStartup)window.ClearTimeout(ssCoverStartup);ssCoverStartup=0;
}
