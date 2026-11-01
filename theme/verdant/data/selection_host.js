/* Selection is keyed by row occurrence, so duplicate files stay independent. */
var ssMainSelect=ssCreateSelectionController({marquee:false,dragUnselected:true}),ssNavSelect=ssCreateSelectionController(),ssQueueSelect=ssCreateSelectionController();
var ssSelectOwner=null,ssMainRows=[],ssMainIndex={},ssNavRows=[],ssQueueRows=[],ssSelectPaint=0,ssSelectionDirty=false,ssSelectionZone=null,ssSelectionContextKey='';
var ssSelectContext=null,ssSelectScroll=0;
function ssInvalidateSelections(){
  if(ssSelectScroll)window.ClearInterval(ssSelectScroll);ssSelectScroll=0;ssSelectOwner=null;ssMainRows=[];ssSelectionContextKey='';
  ssMainSelect.setContext({kind:'track',key:'invalidated',items:[],rows:[]});
}
function ssTrackID(h){return (h.RawPath||h.Path)+'|'+h.SubSong;}
function ssPlaylistInfo(index){var lists=ssState&&ssState.playlists||[];for(var i=0;i<lists.length;i++)if(lists[i].index===index)return lists[i];return null;}
function ssSelectionRepaint(){if(ssSelectPaint)return;ssSelectPaint=window.SetTimeout(function(){ssSelectPaint=0;ssSelectionDirty=true;var r=ssSelectionZone||R.main;ssQueueInteractionDamage(r);window.RepaintRect(r.x,r.y,r.w,r.h);},16);}
function ssMainSelectionContext(){
  var rows=[],key=view,items=[],i,j,pi,order,handles,info;
  if(view==='playlist'){
    pi=plman.ActivePlaylist;info=ssPlaylistInfo(pi);key='pl:'+(info?info.guid:pi);order=getPlOrder(pi);handles=getItems(pi);
    for(i=0;i<order.length;i++)rows.push({pl:pi,item:order[i],h:handles[order[i]]});
  }else if(view==='songs'){for(i=0;i<(songsTracks||[]).length;i++)rows.push({h:songsTracks[i].h});}
  else if(view==='search'){for(i=0;i<searchTrks.length;i++)rows.push({h:searchTrks[i].h});key+=':'+searchQuery;}
  else if(view==='artist'){key+=':'+viewArtist;for(i=0;i<artistAlbums.length;i++)for(j=0;j<artistAlbums[i].tracks.length;j++)rows.push({h:artistAlbums[i].tracks[j].handle,block:i,idx:j});}
  ssMainIndex={};for(i=0;i<rows.length;i++){items.push((rows[i].item===undefined?i:rows[i].item)+':'+ssTrackID(rows[i].h));if(rows[i].item!==undefined)ssMainIndex['p'+rows[i].pl+':'+rows[i].item]=i;else if(rows[i].block!==undefined)ssMainIndex['a'+rows[i].block+':'+rows[i].idx]=i;}
  var geometry=[];for(i=0;i<HB_TR.length;i++){var hb=HB_TR[i],at=ssMainRowIndex(hb,rows);if(at>=0)geometry.push({index:at,x0:hb.x0,y0:hb.y0,x1:hb.x1,y1:hb.y1});}
  ssMainRows=rows;var b=geometry.length?{x0:R.main.x,y0:geometry[0].y0,x1:R.main.x+R.main.w,y1:R.main.y+R.main.h}:null;
  ssSelectionContextKey=key;ssSelectContext={kind:'track',key:key,items:items,rows:geometry,bounds:b,writable:view==='playlist'&&info&&info.writable,multiple:true};ssMainSelect.setContext(ssSelectContext);
}
function ssMainRowIndex(row,rows){
  rows=rows||ssMainRows;if(row.songs)return row.ti;if(row.srch)return row.idx;
  var key=row.pl!==undefined?'p'+row.pl+':'+row.item:row.lib?'a'+row.block+':'+row.idx:'';return ssMainIndex[key]===undefined?-1:ssMainIndex[key];
}
function ssNavSelectionContext(){
  var visible=visiblePlaylists(),items=[],geo=[];ssNavRows=visible.slice(0);
  for(var i=0;i<visible.length;i++){var info=ssPlaylistInfo(visible[i]);items.push(info?info.guid:String(visible[i]));}
  for(i=0;i<HB_PL.length;i++){var h=HB_PL[i];geo.push({index:visible.indexOf(h.i),x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1});}
  ssSelectContext={kind:'playlist',key:'sidebar',items:items,rows:geo,bounds:geo.length?{x0:R.navLib.x,y0:geo[0].y0,x1:R.navLib.x+R.navLib.w,y1:R.navLib.y+R.navLib.h}:null,writable:true,multiple:false};ssNavSelect.setContext(ssSelectContext);
}
function ssQueueSelectionContext(row){
  var scope=row.scope||'native',rows=[],items=[],geo=[],i,list;
  if(scope==='priority'||scope==='remaining'){
    list=scope==='priority'?(ssState.queue||[]):(ssState.remaining||[]);
    for(i=0;i<list.length;i++)rows.push({track_id:list[i].id});
  }else if(row.pl!==undefined){var hs=getItems(row.pl);for(i=0;i<hs.Count;i++)rows.push({pl:row.pl,item:i,h:hs[i],track_id:ssTrackID(hs[i])});}
  for(i=0;i<rows.length;i++)items.push(i+':'+rows[i].track_id);
  for(i=0;i<HB_Q.length;i++){var h=HB_Q[i];if((h.scope||'native')!==scope)continue;geo.push({index:h.queueIndex===undefined?h.item:h.queueIndex,x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1});}
  var info=row.pl===undefined?null:ssPlaylistInfo(row.pl);
  ssQueueRows=rows;ssSelectContext={kind:'queue',key:scope+':'+(scope==='remaining'?ssState.source:row.pl===undefined?'':row.pl),items:items,rows:geo,bounds:geo.length?{x0:R.queue.x,y0:geo[0].y0,x1:R.queue.x+R.queue.w,y1:geo[geo.length-1].y1}:null,writable:scope!=='native'||!!(info&&info.writable),multiple:false};ssQueueSelect.setContext(ssSelectContext);
}
function ssSelectionDown(x,y){
  var row=hit(HB_TR,x,y),nav=hit(HB_PL,x,y),queue=hit(HB_Q,x,y),ctrl=utils.IsKeyPressed(17),shift=utils.IsKeyPressed(16),index=-1;
  if(row){ssMainSelectionContext();ssSelectOwner=ssMainSelect;index=ssMainRowIndex(row);}
  else if(nav){ssNavSelectionContext();ssSelectOwner=ssNavSelect;index=ssNavRows.indexOf(nav.i);}
  else if(queue){ssQueueSelectionContext(queue);ssSelectOwner=ssQueueSelect;index=queue.queueIndex===undefined?queue.item:queue.queueIndex;}
  else if(HB_TR.length&&x>=R.main.x&&x<R.main.x+R.main.w&&y>=HB_TR[0].y0&&y<R.main.y+R.main.h){ssMainSelectionContext();ssSelectOwner=ssMainSelect;}
  else return false;
  ssSelectionZone=ssSelectOwner===ssMainSelect?R.main:ssSelectOwner===ssNavSelect?R.navLib:R.queue;
  if(!ssSelectOwner.start({index:index,x:x,y:y,ctrl:false,shift:false})){ssSelectOwner=null;return false;}
  if(!ssSelectScroll)ssSelectScroll=window.SetInterval(ssSelectionScroll,50);
  ssSelectionRepaint();return true;
}
function ssMoveOrder(count,chosen,target){var rest=[],moving={},i;for(i=0;i<chosen.length;i++)moving[chosen[i]]=true;for(i=0;i<count;i++)if(!moving[i])rest.push(i);return rest.slice(0,target).concat(chosen,rest.slice(target));}
function ssSelectionUp(x,y){
  if(!ssSelectOwner)return false;if(ssSelectScroll)window.ClearInterval(ssSelectScroll);ssSelectScroll=0;var owner=ssSelectOwner,action=owner.end(x,y);ssSelectOwner=null;if(!action)return false;
  if(action.type==='reorder'&&action.changed){
    if(owner===ssMainSelect){
      var pi=plman.ActivePlaylist,info=ssPlaylistInfo(pi),hs=getItems(pi),expected=[],order=ssMoveOrder(ssMainRows.length,action.indices,action.targetIndex).map(function(i){return ssMainRows[i].item;});
      for(var k=0;k<hs.Count;k++)expected.push(ssTrackID(hs[k]));
      plSort='manual';plSortDir='asc';ssSend('track_reorder',{playlist_guid:info.guid,expected:expected,order:order});
    }else if(owner===ssNavSelect){
      var all=ssState.playlists,visible=ssNavRows,permutation=ssMoveOrder(visible.length,action.indices,action.targetIndex),slots={},next=0,order2=[];
      for(var i=0;i<visible.length;i++)slots[visible[i]]=true;
      for(i=0;i<all.length;i++)order2.push(slots[i]?visible[permutation[next++]]:i);
      ssSend('playlist_reorder',{expected:all.map(function(p){return p.guid;}),order:order2});
    }else{
      var scope=action.key.split(':')[0],ids=ssQueueRows.map(function(r){return r.track_id;}),order3=ssMoveOrder(ids.length,action.indices,action.targetIndex);
      if(scope==='native'){var entry=ssQueueRows[0],inf=ssPlaylistInfo(entry.pl);ssSend('track_reorder',{playlist_guid:inf.guid,expected:ids,order:order3});}
      else ssSend('queue_reorder',{scope:scope,source:ssState.source,expected:ids,order:order3});
    }
  }
  ssSelectionRepaint();return action.type!=='click';
}
function ssCancelSelectionGesture(){if(ssSelectOwner)ssSelectOwner.cancel();ssSelectOwner=null;if(ssSelectScroll)window.ClearInterval(ssSelectScroll);ssSelectScroll=0;ssSelectionRepaint();}
function ssSelectionMove(x,y,mask){
  if(!ssSelectOwner)return false;var held=mask!==undefined?!!(mask&1):typeof utils.IsKeyPressed==='function'?utils.IsKeyPressed(1):true;
  if(!held){ssCancelSelectionGesture();return false;}ssSelectOwner.move(x,y);ssSelectionRepaint();return true;
}
function ssSelectionScroll(){
  if(ssSelectOwner&&(mx<0||my<0)&&typeof utils.IsKeyPressed==='function'&&!utils.IsKeyPressed(1)){ssCancelSelectionGesture();return;}
  if(!ssSelectOwner||!ssSelectOwner.preview()||!ssSelectOwner.preview().moved)return;
  var b=ssSelectContext.bounds;if(!b||mx<b.x0||mx>b.x1)return;var delta=my<b.y0+24?-24:my>b.y1-24?24:0;if(!delta)return;
  if(ssSelectOwner===ssMainSelect){
    if(view==='playlist')firstRow=firstRowT=clampPx(firstRow+delta,PL_MAXPX);
    else if(view==='songs')songsScroll=songsScrollT=clampPx(songsScroll+delta,SONGS_MAXPX);
    else if(view==='search')searchScroll=searchScrollT=clampPx(searchScroll+delta,SEARCH_MAXPX);else return;repaintMain();
  }else if(ssSelectOwner===ssNavSelect){navScroll=navScrollT=clampPx(navScroll+delta,NAV_MAX);repaintNav();}
  else{ssQueueScroll=ssQueueScrollT=clampPx(ssQueueScroll+delta,SS_QUEUE_MAX);repaintQueue();}
  ssSelectionRefreshGeometry();ssSelectOwner.move(mx,my);
}
function ssSelectionRefreshGeometry(){
  if(!ssSelectOwner||!ssSelectContext)return;var geo=[],list=ssSelectOwner===ssMainSelect?HB_TR:ssSelectOwner===ssNavSelect?HB_PL:HB_Q;
  for(var i=0;i<list.length;i++){var h=list[i],at=ssSelectOwner===ssMainSelect?ssMainRowIndex(h):ssSelectOwner===ssNavSelect?ssNavRows.indexOf(h.i):h.queueIndex===undefined?h.item:h.queueIndex;
    if(ssSelectOwner===ssQueueSelect&&(h.scope||'native')!==ssSelectContext.key.split(':')[0])continue;geo.push({index:at,x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1});}
  ssSelectContext.rows=geo;ssSelectOwner.setContext(ssSelectContext);
}
function ssSelectionRects(){
  var rects=[];for(var i=0;i<HB_TR.length;i++){var h=HB_TR[i];if(ssMainSelect.isSelected(ssMainRowIndex(h)))rects.push({x:h.x0,y:h.y0,w:h.x1-h.x0,h:h.y1-h.y0});}
  var p=ssSelectOwner&&ssSelectOwner.preview();if(p&&p.rect){var r=p.rect;rects.push({x:r.x0-2,y:r.y0-2,w:r.x1-r.x0+4,h:r.y1-r.y0+4});}
  if(p&&p.indicator){var q=p.indicator;rects.push({x:q.x0-2,y:q.y-2,w:q.x1-q.x0+4,h:5});}return rects;
}
function ssDrawSelection(gr){
  ssSelectionDirty=false;
  ssSelectionRefreshGeometry();
  var info=view==='playlist'?ssPlaylistInfo(plman.ActivePlaylist):null,key=view==='playlist'?'pl:'+(info?info.guid:plman.ActivePlaylist):view==='artist'?view+':'+viewArtist:view==='search'?view+':'+searchQuery:view;
  if(key!==ssSelectionContextKey){ssMainRows=[];ssMainSelect.setContext({kind:'track',key:key,items:[],rows:[]});}
  for(var i=0;i<HB_TR.length;i++){var h=HB_TR[i],at=ssMainRowIndex(h);if(ssMainSelect.isSelected(at))gr.FillRoundRect(h.x0,h.y0,h.x1-h.x0,h.y1-h.y0,4,4,RGBA(30,215,96,28));}
  if(!ssSelectOwner)return;var p=ssSelectOwner.preview();if(!p)return;
  if(p.rect){var r=p.rect,w=r.x1-r.x0,h2=r.y1-r.y0;if(w>0&&h2>0){gr.FillSolidRect(r.x0,r.y0,w,h2,RGBA(30,215,96,28));gr.DrawRect(r.x0,r.y0,w,h2,1,COL.green);}}
  if(p.indicator){var q=p.indicator;gr.DrawLine(q.x0,q.y,q.x1,q.y,2,COL.green);}
}
function ssSelectionPayload(row){
  ssMainSelectionContext();var index=ssMainRowIndex(row);
  if(!ssMainSelect.isSelected(index)){ssMainSelect.start({index:index,x:row.x0+1,y:row.y0+1});ssMainSelect.end(row.x0+1,row.y0+1);}
  var indices=ssMainSelect.selectedIndices(),selected=indices.map(function(i){return ssMainRows[i];}),args={tracks:selected.map(function(r){return ssTrackID(r.h);})};
  if(row.pl!==undefined){var info=ssPlaylistInfo(row.pl);if(info){args.playlist_guid=info.guid;args.items=selected.map(function(r){return r.item;});}}
  return args;
}
function ssToggleTrackSelection(row){
  ssCancelSelectionGesture();ssMainSelectionContext();var index=ssMainRowIndex(row);if(index<0)return true;
  ssMainSelect.start({index:index,x:row.x0+1,y:row.y0+1,ctrl:true});ssMainSelect.end(row.x0+1,row.y0+1);
  ssSelectionZone=R.main;ssSelectionRepaint();return true;
}
function ssBatchTrackMenu(row,x,y){
  var args=ssSelectionPayload(row),lists=ssState&&ssState.playlists||[],copy=[],move=[],canMove=row.pl!==undefined&&canEditPl(row.pl);
  function transfer(target,moving,create){var fields={};for(var k in args)fields[k]=args[k];fields.move=moving;fields.new_playlist=!!create;if(target)fields.target_guid=target;ssSend('tracks_transfer',fields);}
  copy.push({label:'新建歌单',run:function(){transfer('',false,true);}});move.push({label:'新建歌单',run:function(){transfer('',true,true);}});
  for(var i=0;i<lists.length;i++)(function(p){if(isHiddenPl(p.name)||!p.writable||p.index===row.pl)return;copy.push({label:p.name,run:function(){transfer(p.guid,false,false);}});move.push({label:p.name,run:function(){transfer(p.guid,true,false);}});})(lists[i]);
  var extra=[{label:'已选择 '+args.tracks.length+' 首歌曲',disabled:true},{label:'添加到歌单',children:copy},{label:'移动到歌单',disabled:!canMove,children:move},{label:'加入待播队列',run:function(){ssSend('queue_add',args);}},{separator:true}];
  if(canMove)extra.splice(4,0,{label:'从此歌单移除所选歌曲',run:function(){ssSend('tracks_remove',args);}});
  ssOpenNativeMenu('context',args,x,y,extra);repaintAll();return true;
}
function ssEnqueueRow(row){var h=row.pl!==undefined?getItems(row.pl)[row.item]:row.songs?songsTracks[row.ti].h:row.srch?searchTrks[row.idx].h:row.lib?artistAlbums[row.block].tracks[row.idx].handle:null;if(h){rightTab='queue';ssSend('queue_add',{tracks:[ssTrackID(h)],play:true});repaintAll();}}
