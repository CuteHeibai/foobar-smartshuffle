/* Selection is keyed by row occurrence, so duplicate files stay independent. */
var ssMainSelect=ssCreateSelectionController({marquee:false,dragUnselected:true,holdDelay:160}),ssNavSelect=ssCreateSelectionController(),ssQueueSelect=ssCreateSelectionController({holdDelay:160});
var ssSelectOwner=null,ssMainRows=[],ssMainIndex={},ssNavRows=[],ssQueueRows=[],ssSelectionDirty=false,ssSelectionZone=null,ssSelectionContextKey='';
var ssSelectContext=null,ssSelectScroll=0;
var ssSelectHold=0,ssDragOverlay=null,ssSelectLeftDown=false;
function ssDropDragOverlay(){if(ssDragOverlay&&ssDragOverlay.image)try{ssDragOverlay.image.Dispose();}catch(e){}ssDragOverlay=null;}
function ssInvalidateSelections(){
  ssSelectLeftDown=false;
  ssDropDragOverlay();if(ssSelectHold)window.ClearTimeout(ssSelectHold);ssSelectHold=0;
  if(ssSelectScroll)window.ClearInterval(ssSelectScroll);ssSelectScroll=0;ssSelectOwner=null;ssMainRows=[];ssSelectionContextKey='';
  ssMainSelect.setContext({kind:'track',key:'invalidated',items:[],rows:[]});
}
function ssTrackID(h){return (h.RawPath||h.Path)+'|'+h.SubSong;}
function ssPlaylistInfo(index){var lists=ssState&&ssState.playlists||[];for(var i=0;i<lists.length;i++)if(lists[i].index===index)return lists[i];return null;}
function ssSelectionRepaint(){
  ssSelectionDirty=true;
  var areas=ssInteractionPainted.concat(ssSelectionRects(),ssInteractionDamage),r=null;
  // Submit one bounding damage rectangle: the host may clear the band between
  // invalidations, so restoration and invalidation must cover exactly that band.
  for(var i=0;i<areas.length;i++){var a=areas[i];if(!a||a.w<=0||a.h<=0)continue;
    if(!r)r={x:a.x,y:a.y,w:a.w,h:a.h};else{var right=Math.max(r.x+r.w,a.x+a.w),bottom=Math.max(r.y+r.h,a.y+a.h);r.x=Math.min(r.x,a.x);r.y=Math.min(r.y,a.y);r.w=right-r.x;r.h=bottom-r.y;}}
  if(!ssSceneImage||!r)r=ssSelectionZone||R.main;
  r=ssPixelRect(r);ssQueueInteractionDamage(r);window.RepaintRect(r.x,r.y,r.w,r.h,false);
}
function ssCanReorder(info){return !!info&&(typeof info.reorderable==='boolean'?info.reorderable:!!info.writable);}
function ssMainSelectionContext(){
  var rows=[],key=view,items=[],i,j,pi,order,handles,info;
  if(view==='playlist'){
    pi=plman.ActivePlaylist;info=ssPlaylistInfo(pi);key='pl:'+(info?info.guid:pi);order=getPlOrder(pi);handles=getItems(pi);
    for(i=0;i<order.length;i++)rows.push({pl:pi,item:order[i],h:handles[order[i]]});
  }else if(view==='songs'){for(i=0;i<(songsTracks||[]).length;i++)rows.push({h:songsTracks[i].h});}
  else if(view==='search'){for(i=0;i<searchTrks.length;i++)rows.push({h:searchTrks[i].h});key+=':'+searchQuery;}
  else if(view==='artist'){key+=':'+viewArtist;for(i=0;i<artistAlbums.length;i++)for(j=0;j<artistAlbums[i].tracks.length;j++)rows.push({h:artistAlbums[i].tracks[j].handle,block:i,idx:j});}
  else if(typeof ssIsPersonal==='function'&&ssIsPersonal(view)){key=ssPersonalSelectionKey();for(i=0;i<ssPersonal.items.length;i++)rows.push({track_id:ssPersonal.items[i].id,event_id:ssPersonal.items[i].event_id});}
  ssMainIndex={};for(i=0;i<rows.length;i++){items.push((rows[i].event_id!==undefined?rows[i].event_id:rows[i].item===undefined?i:rows[i].item)+':'+(rows[i].track_id||ssTrackID(rows[i].h)));if(rows[i].item!==undefined)ssMainIndex['p'+rows[i].pl+':'+rows[i].item]=i;else if(rows[i].block!==undefined)ssMainIndex['a'+rows[i].block+':'+rows[i].idx]=i;}
  var geometry=[];for(i=0;i<HB_TR.length;i++){var hb=HB_TR[i],at=ssMainRowIndex(hb,rows);if(at>=0)geometry.push({index:at,x0:hb.x0,y0:hb.y0,x1:hb.x1,y1:hb.y1});}
  ssMainRows=rows;var b=geometry.length?{x0:R.main.x,y0:geometry[0].y0,x1:R.main.x+R.main.w,y1:R.main.y+R.main.h}:null;
  ssSelectionContextKey=key;ssSelectContext={kind:'track',key:key,items:items,rows:geometry,bounds:b,writable:view==='playlist'&&ssCanReorder(info),multiple:true};ssMainSelect.setContext(ssSelectContext);
}
function ssMainRowIndex(row,rows){
  rows=rows||ssMainRows;if(row.personal)return row.idx;if(row.songs)return row.ti;if(row.srch)return row.idx;
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
  ssQueueRows=rows;ssSelectContext={kind:'queue',key:scope+':'+(scope==='remaining'?ssState.source:row.pl===undefined?'':row.pl),items:items,rows:geo,bounds:geo.length?{x0:R.queue.x,y0:geo[0].y0,x1:R.queue.x+R.queue.w,y1:geo[geo.length-1].y1}:null,writable:scope!=='native'||ssCanReorder(info),multiple:false};ssQueueSelect.setContext(ssSelectContext);
}
function ssSelectionDown(x,y){
  mx=x;my=y;
  var row=hit(HB_TR,x,y),nav=hit(HB_PL,x,y),queue=hit(HB_Q,x,y),ctrl=utils.IsKeyPressed(17),shift=utils.IsKeyPressed(16),index=-1;
  if(row){ssMainSelectionContext();ssSelectOwner=ssMainSelect;index=ssMainRowIndex(row);}
  else if(nav){ssNavSelectionContext();ssSelectOwner=ssNavSelect;index=ssNavRows.indexOf(nav.i);}
  else if(queue){ssQueueSelectionContext(queue);ssSelectOwner=ssQueueSelect;index=queue.queueIndex===undefined?queue.item:queue.queueIndex;}
  else if(HB_TR.length&&x>=R.main.x&&x<R.main.x+R.main.w&&y>=HB_TR[0].y0&&y<R.main.y+R.main.h){ssMainSelectionContext();ssSelectOwner=ssMainSelect;}
  else return false;
  ssSelectionZone=ssSelectOwner===ssMainSelect?R.main:ssSelectOwner===ssNavSelect?R.navLib:R.queue;
  if(!ssSelectOwner.start({index:index,x:x,y:y,ctrl:ctrl&&ssSelectOwner===ssMainSelect,shift:false})){ssSelectOwner=null;return false;}
  ssSelectLeftDown=true;
  if(ssSelectHold)window.ClearTimeout(ssSelectHold);
  var owner=ssSelectOwner,deadline=Date.now()+160;
  function lift(){ssSelectHold=0;if(ssSelectOwner!==owner||!ssSelectLeftDown)return;var delay=deadline-Date.now();if(delay>0){ssSelectHold=window.SetTimeout(lift,delay);return;}owner.move(mx>=0?mx:x,my>=0?my:y);ssSelectionRepaint();}
  if(!ctrl)ssSelectHold=window.SetTimeout(lift,160);
  if(!ssSelectScroll)ssSelectScroll=window.SetInterval(ssSelectionScroll,50);
  ssSelectionRepaint();return true;
}
function ssMoveOrder(count,chosen,target){var rest=[],moving={},i;for(i=0;i<chosen.length;i++)moving[chosen[i]]=true;for(i=0;i<count;i++)if(!moving[i])rest.push(i);return rest.slice(0,target).concat(chosen,rest.slice(target));}
function ssSelectionUp(x,y){
  ssSelectLeftDown=false;
  if(ssSelectHold)window.ClearTimeout(ssSelectHold);ssSelectHold=0;ssDropDragOverlay();
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
function ssCancelSelectionGesture(){ssSelectLeftDown=false;if(ssSelectHold)window.ClearTimeout(ssSelectHold);ssSelectHold=0;ssDropDragOverlay();if(ssSelectOwner)ssSelectOwner.cancel();ssSelectOwner=null;if(ssSelectScroll)window.ClearInterval(ssSelectScroll);ssSelectScroll=0;ssSelectionRepaint();}
function ssSelectionMove(x,y,mask){
  if(!ssSelectOwner)return false;var held=typeof mask==='number'?!!(mask&1):ssSelectLeftDown;
  if(!held){ssCancelSelectionGesture();return false;}ssSelectOwner.move(x,y);ssSelectionRepaint();return true;
}
function ssSelectionScroll(){
  if(ssSelectOwner&&(mx<0||my<0)&&typeof utils.IsKeyPressed==='function'&&!utils.IsKeyPressed(1)){ssCancelSelectionGesture();return;}
  if(!ssSelectOwner||!ssSelectOwner.preview()||!ssSelectOwner.preview().moved)return;
  var b=ssSelectContext.bounds;if(!b||mx<b.x0||mx>b.x1)return;var delta=my<b.y0+24?-24:my>b.y1-24?24:0;if(!delta)return;
  if(ssSelectOwner===ssMainSelect){
    if(view==='playlist')firstRow=firstRowT=clampPx(firstRow+delta,PL_MAXPX);
    else if(view==='songs')songsScroll=songsScrollT=clampPx(songsScroll+delta,SONGS_MAXPX);
    else if(view==='search')searchScroll=searchScrollT=clampPx(searchScroll+delta,SEARCH_MAXPX);
    else if(typeof ssIsPersonal==='function'&&ssIsPersonal(view))ssPersonalScroll=ssPersonalScrollT=clampPx(ssPersonalScroll+delta,SS_PERSONAL_MAX);else return;repaintMain();
  }else if(ssSelectOwner===ssNavSelect){navScroll=navScrollT=clampPx(navScroll+delta,NAV_MAX);repaintNav();}
  else{ssQueueScroll=ssQueueScrollT=clampPx(ssQueueScroll+delta,SS_QUEUE_MAX);repaintQueue();}
  ssSelectionRefreshGeometry();ssSelectOwner.move(mx,my);
}
function ssSelectionRefreshGeometry(){
  if(!ssSelectOwner||!ssSelectContext)return;var geo=[],list=ssSelectOwner===ssMainSelect?HB_TR:ssSelectOwner===ssNavSelect?HB_PL:HB_Q;
  for(var i=0;i<list.length;i++){var h=list[i],at=ssSelectOwner===ssMainSelect?ssMainRowIndex(h):ssSelectOwner===ssNavSelect?ssNavRows.indexOf(h.i):h.queueIndex===undefined?h.item:h.queueIndex;
    if(ssSelectOwner===ssQueueSelect&&(h.scope||'native')!==ssSelectContext.key.split(':')[0])continue;geo.push({index:at,x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1});}
  ssSelectContext.rows=geo;ssSelectOwner.updateGeometry(geo,ssSelectContext.bounds);
}
function ssSelectionRects(){
  var rects=[];for(var i=0;i<HB_TR.length;i++){var h=HB_TR[i];if(ssMainSelect.isSelected(ssMainRowIndex(h)))rects.push({x:h.x0,y:h.y0,w:h.x1-h.x0,h:h.y1-h.y0});}
  var p=ssSelectOwner&&ssSelectOwner.preview();if(p&&p.rect){var r=p.rect;rects.push({x:r.x0-2,y:r.y0-2,w:r.x1-r.x0+4,h:r.y1-r.y0+4});}
  if(p&&p.indicator){var q=p.indicator;rects.push({x:q.x0-2,y:q.y-2,w:q.x1-q.x0+4,h:5});}
  if(p&&p.mode==='reorder'&&p.origin){rects.push({x:p.origin.x0,y:p.origin.y0,w:p.origin.x1-p.origin.x0,h:p.origin.y1-p.origin.y0});var ghost=ssDragRect(p),gx=Math.max(0,ghost.x-5),gy=Math.max(0,ghost.y-5);rects.push({x:gx,y:gy,w:Math.min(W-gx,ghost.w+10),h:Math.min(H-gy,ghost.h+12)});}
  return rects;
}
function ssDragRect(p){return {x:Math.round(Math.max(4,Math.min(W-(p.origin.x1-p.origin.x0)-4,p.origin.x0+p.pointer.x-p.grab.x))),y:Math.round(Math.max(TBH,Math.min(H-(p.origin.y1-p.origin.y0)-4,p.origin.y0+p.pointer.y-p.grab.y))),w:Math.round(p.origin.x1-p.origin.x0),h:Math.round(p.origin.y1-p.origin.y0)};}
function ssDrawDragOverlay(gr,p){
  if(!p.origin||!ssSceneImage)return;
  var source=p.origin,r=ssDragRect(p);
  if(!ssDragOverlay){var sx=Math.max(0,Math.floor(source.x0)),sy=Math.max(0,Math.floor(source.y0));ssDragOverlay={image:ssSceneImage.Clone(sx,sy,Math.min(r.w,W-sx),Math.min(r.h,H-sy))};}
  gr.FillRoundRect(r.x+2,r.y+4,r.w,r.h,6,6,COL.shadow);
  gr.DrawImage(ssDragOverlay.image,r.x,r.y,r.w,r.h,0,0,r.w,r.h,0,248);
  gr.DrawRoundRect(r.x+.5,r.y+.5,r.w-1,r.h-1,6,6,1,COL.line);
  if(p.indices.length>1){gr.FillEllipse(r.x+r.w-30,r.y+7,24,24,COL.text);tC(gr,String(p.indices.length),FONT.pl,COL.base,r.x+r.w-30,r.y+7,24,24);}
}
function ssDrawSelection(gr){
  ssSelectionDirty=false;
  ssSelectionRefreshGeometry();
  var info=view==='playlist'?ssPlaylistInfo(plman.ActivePlaylist):null,key=view==='playlist'?'pl:'+(info?info.guid:plman.ActivePlaylist):view==='artist'?view+':'+viewArtist:view==='search'?view+':'+searchQuery:view;
  if(typeof ssIsPersonal==='function'&&ssIsPersonal(view))key=ssPersonalSelectionKey();
  if(key!==ssSelectionContextKey){ssMainRows=[];ssMainSelect.setContext({kind:'track',key:key,items:[],rows:[]});}
  var p=ssSelectOwner&&ssSelectOwner.preview(),lifting=p&&p.mode==='reorder';
  for(var i=0;i<HB_TR.length;i++){var h=HB_TR[i],at=ssMainRowIndex(h);if(ssMainSelect.isSelected(at))gr.FillRoundRect(h.x0,h.y0,h.x1-h.x0,h.y1-h.y0,4,4,lifting&&ssSelectOwner===ssMainSelect?COL.elev:ssAccent(28));}
  if(lifting&&ssSelectOwner!==ssMainSelect&&p.origin){var rows=ssSelectContext.rows;for(i=0;i<rows.length;i++)if(rows[i].index===p.origin.index){var slot=rows[i];gr.FillRoundRect(slot.x0,slot.y0,slot.x1-slot.x0,slot.y1-slot.y0,4,4,COL.elev);break;}}
  if(!p)return;
  if(p.rect){var r=p.rect,w=r.x1-r.x0,h2=r.y1-r.y0;if(w>0&&h2>0){gr.FillSolidRect(r.x0,r.y0,w,h2,ssAccent(28));gr.DrawRect(r.x0,r.y0,w,h2,1,COL.green);}}
  if(p.indicator){var q=p.indicator;gr.DrawLine(q.x0,q.y,q.x1,q.y,2,COL.green);}
  if(lifting)ssDrawDragOverlay(gr,p);
}
function ssSelectionPayload(row){
  ssMainSelectionContext();var index=ssMainRowIndex(row);
  if(!ssMainSelect.isSelected(index)){ssMainSelect.start({index:index,x:row.x0+1,y:row.y0+1});ssMainSelect.end(row.x0+1,row.y0+1);}
  var indices=ssMainSelect.selectedIndices(),selected=indices.map(function(i){return ssMainRows[i];}),args={tracks:selected.map(function(r){return r.track_id||ssTrackID(r.h);})};
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
  if(typeof ssPersonalSet==='function'){
    extra.push({label:'收藏所选歌曲',run:function(){ssPersonalSet('favorites',args.tracks,true);}});
    extra.push({label:'取消收藏所选歌曲',run:function(){ssPersonalSet('favorites',args.tracks,false);}});
    extra.push({label:'添加到稍后听',run:function(){ssPersonalSet('later',args.tracks,true);}});
    extra.push({label:'从稍后听移除',run:function(){ssPersonalSet('later',args.tracks,false);}});
    extra.push({separator:true});
  }
  ssOpenNativeMenu('context',args,x,y,extra);repaintAll();return true;
}
function ssEnqueueRow(row){var h=row.pl!==undefined?getItems(row.pl)[row.item]:row.songs?songsTracks[row.ti].h:row.srch?searchTrks[row.idx].h:row.lib?artistAlbums[row.block].tracks[row.idx].handle:null,id=row.track_id||(h?ssTrackID(h):'');if(id){rightTab='queue';ssSend('queue_add',{tracks:[id],play:true});repaintAll();}}
