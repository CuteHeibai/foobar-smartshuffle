/* Startup artwork checks run one at a time; online work lives in the helper. */
var ssCoverTracks={},ssCoverRows=[],ssCoverAt=0,ssCoverMissing=[],ssCoverBusy=false,ssCoverTimer=0,ssCoverRequest='',ssCoverSeen={},ssCoverTF=null;
function ssLoadCovers(){try{var j=JSON.parse(utils.ReadTextFile(SS_ROOT+'covers.json',65001).replace(/^\uFEFF/,''));ssCoverTracks=j.version===1?j.tracks||{}:{};}catch(e){ssCoverTracks={};}}
function ssCachedCover(h){
  var entry=ssCoverTracks[h.Path+'|'+h.SubSong];if(!entry||!entry.cover)return null;
  try{var img=gdi.Image(entry.cover);if(img&&img.Width>ART_MAXPX)img=img.Resize(ART_MAXPX,Math.round(img.Height*ART_MAXPX/img.Width),ART_DOWNSCALE);return img;}catch(e){return null;}
}
function ssCoverRow(t){
  if(!ssCoverTF)ssCoverTF={artist:fb.TitleFormat('$if2(%album artist%,%artist%)'),release:fb.TitleFormat('[%musicbrainz_albumid%]'),group:fb.TitleFormat('[%musicbrainz_releasegroupid%]')};
  return {id:t.id,path:t.h.Path,subsong:t.h.SubSong,artist:t.artist,album:t.album,album_artist:ssCoverTF.artist.EvalWithMetadb(t.h),musicbrainz_albumid:ssCoverTF.release.EvalWithMetadb(t.h),musicbrainz_releasegroupid:ssCoverTF.group.EvalWithMetadb(t.h)};
}
function ssCoverPump(){
  if(ssCoverRequest||!ssCoverMissing.length||ssCoverBusy||ssCoverAt<ssCoverRows.length)return;
  // Two albums per helper job leave opportunities for search and artist requests.
  var batch=[],keys=ssCoverMissing.splice(0,2);for(var i=0;i<keys.length;i++)batch=batch.concat(ssCoverSeen[keys[i]]);
  ssCoverRequest=ssSend('metadata',{task:'covers',rows:batch,max_albums:2,time_budget:40,refresh_missing:true});
}
function ssCoverStep(){
  ssCoverPump();if(ssCoverAt>=ssCoverRows.length&&!ssCoverBusy&&!ssCoverRequest&&!ssCoverMissing.length){ssStopCovers();return;}
  if(ssCoverBusy||ssCoverAt>=ssCoverRows.length||artInFlight>0||ssSelectOwner||ssDragging)return;
  var t=ssCoverRows[ssCoverAt++];ssCoverBusy=true;
  function done(has){
    if(!has)try{var row=ssCoverRow(t),key=(row.musicbrainz_albumid||row.musicbrainz_releasegroupid||row.album_artist+'|'+row.album).toLowerCase();
      // Cache every track mapping while querying each album only once per launch.
      if(!ssCoverSeen[key]){ssCoverSeen[key]=[];ssCoverMissing.push(key);}ssCoverSeen[key].push(row);
    }catch(e){}
    ssCoverBusy=false;ssCoverPump();
  }
  try{utils.GetAlbumArtAsyncV2(0,t.h,0,false,false,false).then(function(r){done(!!(r&&r.image));},function(){done(false);});}catch(e){done(false);}
}
function ssStartCovers(){
  ssLoadCovers();window.SetTimeout(function(){ssCoverRows=getSearchIdx().slice(0);ssCoverAt=0;ssCoverTimer=window.SetInterval(ssCoverStep,400);},4000);
}
function ssAcceptCovers(state){
  var task=state.metadata&&state.metadata.covers;if(!task||task.id!==ssCoverRequest||task.pending)return;
  ssCoverRequest='';if(task.ok){
    ssLoadCovers();var rows=task.result.covers||[];
    for(var i=0;i<rows.length;i++){var row=rows[i];if(!row.cover)continue;
      ssCoverTracks[row.id]=row;for(var key in artCache)if(artCache[key]===null)delete artCache[key];
    }
    thumbCache={};cArtCache={};coverPickCache={};plCardCache={};artCardCache={};plCoverCache={};mosaicCache={};warmed={};artWarmRepaint();
  }
  ssCoverPump();
}
function ssStopCovers(){if(ssCoverTimer)window.ClearInterval(ssCoverTimer);ssCoverTimer=0;}
