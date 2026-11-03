/* Native personal library: bounded pages and revision-scoped visible membership. */
var ssPersonal={kind:'',offset:0,limit:50,total:0,revision:-1,items:[],loading:false,error:'',request:''};
var ssPersonalRevision=-1,ssPersonalRequests={},ssPersonalFlags=Object.create(null),ssPersonalFlagFlight='',ssPersonalFlagTimer=0,ssPersonalVisibleIDs=[];
var ssPersonalPrefetchCache=null,ssPersonalPrefetchIDs=[],ssPersonalWantedIDs=[];
var ssPersonalHandleSource=null,ssPersonalHandles=Object.create(null),ssPersonalPID=0,ssPersonalCurrent=null;
var HB_PERSONAL=[],HB_PERSONAL_ACTIONS=[],ssPersonalPressed=null,ssPersonalScroll=0,ssPersonalScrollT=0,SS_PERSONAL_MAX=0;
function ssIsPersonal(kind){return kind==='history'||kind==='favorites'||kind==='later';}
function ssPersonalTitle(kind){return kind==='history'?'播放历史':kind==='favorites'?'我的收藏':'稍后听';}
function ssPersonalSelectionKey(){return view+':'+ssPersonal.offset+':'+ssPersonal.revision;}
function ssPersonalIDs(ids){var seen=Object.create(null),out=[];for(var i=0;i<(ids||[]).length;i++){var id=ids[i];if(typeof id==='string'&&id&&!seen[id]){seen[id]=true;out.push(id);}}return out;}
function ssPersonalClear(){ssPersonal.items=[];ssPersonal.error='';if(typeof ssInvalidateSelections==='function')ssInvalidateSelections();}
function ssOpenPersonal(kind){
  if(!ssIsPersonal(kind))return;
  view=kind;ssPersonal.kind=kind;ssPersonal.offset=0;ssPersonal.total=0;ssPersonal.request='';ssPersonalScroll=ssPersonalScrollT=0;
  if(ssState&&ssState.personal)ssPersonalRevision=Number(ssState.personal.revision);
  ssPersonalReload();
}
function ssPersonalReload(){
  if(!ssIsPersonal(view)||ssPersonal.kind!==view)return;
  ssPersonalClear();ssPersonal.loading=true;
  if(!ssPersonal.request){
    var id=ssSend('personal_list',{kind:ssPersonal.kind,offset:ssPersonal.offset,limit:ssPersonal.limit});
    ssPersonal.request=id;ssPersonalRequests[id]={kind:ssPersonal.kind,offset:ssPersonal.offset,revision:ssPersonalRevision};
  }
  repaintAll();
}
function ssPersonalPage(delta){
  if(ssPersonal.loading)return;
  var offset=Math.max(0,Math.min(Math.max(0,Math.ceil(ssPersonal.total/ssPersonal.limit)-1)*ssPersonal.limit,ssPersonal.offset+delta*ssPersonal.limit));
  if(offset===ssPersonal.offset)return;
  ssPersonal.offset=offset;ssPersonalScroll=ssPersonalScrollT=0;ssPersonalReload();
}
function ssPersonalSet(kind,tracks,value){
  if(kind!=='favorites'&&kind!=='later')return;
  tracks=ssPersonalIDs(tracks);if(!tracks.length||(typeof value!=='boolean'&&tracks.length!==1))return;
  var args={kind:kind,tracks:tracks};if(typeof value==='boolean')args.value=value;ssSend('personal_set',args);
}
function ssPersonalFlag(id){return ssPersonalFlags[id]||{favorite:false,later:false};}
function ssPersonalVisible(ids,prefetch){
  if(arguments.length>1)ssPersonalPrefetchIDs=prefetch||[];
  ssPersonalVisibleIDs=ssPersonalIDs(ids).slice(0,256);
  ssPersonalWantedIDs=ssPersonalIDs(ssPersonalVisibleIDs.concat(ssPersonalPrefetchIDs)).slice(0,256);
  if(!ssPersonalFlagTimer&&!ssPersonalFlagFlight&&ssPersonalWantedIDs.some(function(id){return !ssPersonalFlags[id];}))
    ssPersonalFlagTimer=window.SetTimeout(ssPersonalFetchFlags,40);
}
function ssPersonalFetchFlags(){
  ssPersonalFlagTimer=0;if(ssPersonalFlagFlight)return;
  var ids=ssPersonalWantedIDs.filter(function(id){return !ssPersonalFlags[id];});if(!ids.length)return;
  var id=ssSend('personal_flags',{tracks:ids});ssPersonalFlagFlight=id;ssPersonalRequests[id]={flags:true,revision:ssPersonalRevision,tracks:ids};
}
function ssPersonalPrefetchIndex(row){return row.personal?row.idx:row.songs?row.ti:row.displayIndex;}
function ssPersonalPrefetchRows(rows){
  if(!rows.length)return null;
  var first=rows[0],last=rows[rows.length-1],source=null,order=null,key='',count=0,personal=ssIsPersonal(view);
  var low=ssPersonalPrefetchIndex(first),high=ssPersonalPrefetchIndex(last);
  if(typeof low!=='number'||typeof high!=='number')return null;
  if(personal){source=ssPersonal.items;count=source.length;key=view+':'+ssPersonal.offset;}
  else if(view==='playlist'&&first.pl!==undefined){
    source=getItems(first.pl);order=getPlOrder(first.pl);count=order.length;key='playlist:'+first.pl;
  }else if(view==='songs'&&typeof songsTracks!=='undefined'&&songsTracks){source=songsTracks;count=source.length;key='songs';}
  else return null;
  var cache=ssPersonalPrefetchCache;
  // Keep a 32-row buffer before a window transition; rebuilding only at its
  // edges avoids rereading SDK identities for every newly exposed song.
  var keep=cache&&cache.key===key&&cache.source===source&&cache.order===order&&cache.revision===ssPersonalRevision&&cache.count===count&&low>=cache.start&&high<cache.end;
  if(keep&&(personal||(cache.start===0||low>=cache.start+32)&&(cache.end===count||high<cache.end-32)))return cache;
  var start=personal?0:Math.max(0,Math.min(low-64,count-256)),end=Math.min(count,start+256),ids=[],byIndex=[];
  for(var i=start;i<end;i++){
    var entry=source[order?order[i]:i],id=personal?entry.id:entry?ssTrackID(view==='songs'?entry.h:entry):'';
    byIndex.push(id);if(id)ids.push(id);
  }
  cache={key:key,source:source,order:order,revision:ssPersonalRevision,count:count,start:start,end:end,ids:ssPersonalIDs(ids),byIndex:byIndex};
  ssPersonalPrefetchCache=cache;return cache;
}
function ssAcceptPersonal(done,s){
  var summary=s.personal,revision=summary?Number(summary.revision):ssPersonalRevision;
  var restarted=!!(s.pid&&ssPersonalPID&&s.pid!==ssPersonalPID);if(s.pid)ssPersonalPID=s.pid;
  var changed=restarted||revision!==ssPersonalRevision;
  if(changed){ssPersonalRevision=revision;ssPersonalFlags=Object.create(null);ssPersonalCurrent=null;ssPersonalPrefetchCache=null;}
  if(summary&&Object.prototype.hasOwnProperty.call(summary,'current')){
    var incoming=summary.current&&summary.current.event_id!==undefined?summary.current:null,previous=ssPersonalCurrent;
    ssPersonalCurrent=null;
    if(incoming){
      ssPersonalCurrent={};for(var field in incoming)if(Object.prototype.hasOwnProperty.call(incoming,field))ssPersonalCurrent[field]=incoming[field];
      if(previous&&String(previous.event_id)===String(incoming.event_id)){
        ssPersonalCurrent.listened=Math.max(Number(previous.listened)||0,Number(incoming.listened)||0);
        ssPersonalCurrent.qualified=!!(previous.qualified||incoming.qualified);
      }
    }
  }
  var request=done&&ssPersonalRequests[done.id],response=s.response||{},reload=false;
  if(request){
    delete ssPersonalRequests[done.id];
    if(request.flags){
      if(ssPersonalFlagFlight===done.id)ssPersonalFlagFlight='';
      if(request.revision===ssPersonalRevision&&!restarted){
        // A failed query is retried on the next revision, not every paint/mouse move.
        for(var f=0;f<request.tracks.length;f++)ssPersonalFlags[request.tracks[f]]={favorite:false,later:false};
        if(response.ok!==false)for(f=0;f<(response.personal_flags||[]).length;f++){
          var flag=response.personal_flags[f];if(request.tracks.indexOf(flag.id)>=0)ssPersonalFlags[flag.id]={favorite:!!flag.favorite,later:!!flag.later};
        }
      }
    }else if(done.id===ssPersonal.request){
      ssPersonal.request='';ssPersonal.loading=false;
      if(view===request.kind&&ssPersonal.kind===request.kind&&ssPersonal.offset===request.offset){
        var page=response.personal;
        if(response.ok===false||!page){ssPersonalClear();ssPersonal.error='加载失败，请点击重试';}
        else if(page.kind===request.kind&&page.offset===request.offset&&Number(page.revision)===ssPersonalRevision&&!restarted){
          ssPersonal.items=(page.items||[]).slice(0,ssPersonal.limit);ssPersonal.total=Math.max(0,Number(page.total)||0);ssPersonal.revision=Number(page.revision);ssPersonal.error='';
          if(!ssPersonal.items.length&&ssPersonal.offset>0&&ssPersonal.offset>=ssPersonal.total){ssPersonal.offset=Math.max(0,Math.ceil(ssPersonal.total/ssPersonal.limit)-1)*ssPersonal.limit;reload=true;}
        }else reload=true;
      }
    }
  }
  if(done&&done.op==='personal_set'&&response.ok!==false){ssPersonalFlags=Object.create(null);ssPersonalPrefetchCache=null;reload=true;}
  if((reload||(changed&&ssPersonal.revision!==ssPersonalRevision))&&ssIsPersonal(view))ssPersonalReload();
  if(view==='history'&&ssPersonal.kind==='history'&&ssPersonalCurrent){
    // Live progress is separate from membership/page revisions. Match the play
    // occurrence, including when a delayed page carries an older elapsed value.
    for(var i=0;i<ssPersonal.items.length;i++)if(ssPersonal.items[i].event_id!==undefined&&String(ssPersonal.items[i].event_id)===String(ssPersonalCurrent.event_id)){
      for(var k in ssPersonalCurrent)if(Object.prototype.hasOwnProperty.call(ssPersonalCurrent,k))ssPersonal.items[i][k]=ssPersonalCurrent[k];
      break;
    }
  }
  ssPersonalVisible(ssPersonalVisibleIDs);
}
function ssPersonalHandle(id){
  // Cache real SDK objects only. Metadata-only tracks still have native ID actions.
  // Prefer already prepared handles; a paint must not build the text/lyrics index.
  var indexed=typeof searchIdx!=='undefined'&&searchIdx,source=indexed||(typeof libItems==='function'?libItems():[]);
  if(source!==ssPersonalHandleSource){
    ssPersonalHandleSource=source;ssPersonalHandles=Object.create(null);
    for(var i=0,n=indexed?source.length:source.Count||source.length||0;i<n;i++){
      var handle=indexed?source[i].h:source[i];if(handle)ssPersonalHandles[ssTrackID(handle)]=handle;
    }
  }
  return ssPersonalHandles[id]||null;
}
function ssPersonalRowID(row){
  if(row.track_id)return row.track_id;
  var h=row.pl!==undefined?getItems(row.pl)[row.item]:row.songs?songsTracks[row.ti].h:row.srch?searchTrks[row.idx].h:row.lib?artistAlbums[row.block].tracks[row.idx].handle:null;
  return h?ssTrackID(h):'';
}
function ssPersonalActionAt(x,y){for(var i=0;i<HB_PERSONAL_ACTIONS.length;i++){var h=HB_PERSONAL_ACTIONS[i];if(inRect(x,y,h))return h;}return null;}
function ssPersonalPointerDown(x,y){ssPersonalPressed=ssPersonalActionAt(x,y);return !!ssPersonalPressed;}
function ssPersonalPointerUp(x,y){
  var pressed=ssPersonalPressed;ssPersonalPressed=null;if(!pressed)return false;
  if(inRect(x,y,pressed)&&!ssModal&&!ssPopup){if(pressed.page!==undefined)ssPersonalPage(pressed.page);else if(pressed.retry)ssPersonalReload();else ssPersonalSet(pressed.kind,[pressed.track_id]);}
  return true;
}
function ssPersonalNow(kind){if(NP)ssPersonalSet(kind,[ssTrackID(NP)]);}
function ssStopPersonal(){if(ssPersonalFlagTimer)window.ClearTimeout(ssPersonalFlagTimer);ssPersonalFlagTimer=0;ssPersonalPressed=null;ssPersonalHandles=Object.create(null);ssPersonalHandleSource=null;ssPersonalPrefetchCache=null;ssPersonalPrefetchIDs=[];ssPersonalWantedIDs=[];}
