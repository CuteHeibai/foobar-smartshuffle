/* Actual host graphics; no desktop capture, mouse injection or invented statistics. */
(function(){
 var result={ok:false,checks:[],captures:[],limitations:[]},jobs=[],index=0,startedPlayback=false;
 var maximized=[1440,900],standard=[1180,780];
 var pages=['home','artist','album','albums','playlist','songs','search','favorites','history','later','stats','queue','lyrics','fullscreen','fullscreen-playing','modal','track-menu','playback-menu'];
 var saved={w:W,h:H,view:view,artist:viewArtist,album:viewAlbum,appearance:SS_APPEARANCE,rightOpen:ssRightOpen,rightTab:rightTab,rightForced:ssRightForced,fsMode:fsMode,fsView:fsView,modal:ssModal,query:searchQuery,
  wasMaximized:winMaxed(),appearanceProp:window.GetProperty('SmartShuffle: appearance',null),openProp:window.GetProperty('SmartShuffle: right pane open',null),tabProp:window.GetProperty('SmartShuffle: right pane tab',null)};
 function check(value,name){if(!value)throw Error(name);result.checks.push(name);}
 function appearanceReady(mode){return ssState&&ssState.theme&&ssState.theme.appearance===mode&&SS_APPEARANCE===mode;}
 function writeResult(){result.ok=!result.error&&!result.cleanup;utils.WriteTextFile(RR_OUTPUT+'acceptance.json',JSON.stringify(result,null,2),false);}
 function finish(error){
  if(ssPopup)ssClosePopup();
  if(error)result.error=String(error)+(error.stack?'\n'+String(error.stack):'');
  try{
   if(startedPlayback)fb.Stop();
   if(RR_MONITOR&&!saved.wasMaximized&&winMaxed())UIWizard.ExitMaximize();
   ssStatsStop();ssModal=false;ssDropModalImage();W=saved.w;H=saved.h;view=saved.view;viewArtist=saved.artist;viewAlbum=saved.album;ssOpenCatalog=null;
   searchQuery=saved.query;computeSearch();ssApplyAppearance(saved.appearance);ssSetRightPane(saved.rightTab,saved.rightOpen);ssRightForced=saved.rightForced;
   fsMode=saved.fsMode;fsView=saved.fsView;ssModal=saved.modal;
   window.SetProperty('SmartShuffle: appearance',saved.appearanceProp);window.SetProperty('SmartShuffle: right pane open',saved.openProp);window.SetProperty('SmartShuffle: right pane tab',saved.tabProp);
   layout(true);ssDropSceneImage();repaintAll();result.restored=true;
  }catch(cleanup){result.cleanup=String(cleanup)+(cleanup.stack?'\n'+String(cleanup.stack):'');}
  try{
   ssSend('theme_appearance',{appearance:saved.nativeAppearance||saved.appearance});var until=Date.now()+10000;
   (function restored(){try{
    if(!appearanceReady(saved.nativeAppearance||saved.appearance)){if(Date.now()>until)throw Error('Native appearance restore timed out');window.SetTimeout(restored,100);return;}
    window.SetProperty('SmartShuffle: appearance',saved.appearanceProp);result.nativeAppearanceRestored=true;writeResult();
   }catch(e){result.cleanup=String(e)+(e.stack?'\n'+String(e.stack):'');writeResult();}})();
  }catch(e){result.cleanup=String(e)+(e.stack?'\n'+String(e.stack):'');writeResult();}
 }
 function reset(){if(ssPopup)ssClosePopup();ssModal=false;fsMode=false;view='home';ssDropModalImage();ssDropSceneImage();ssSetRightPane('queue',false);}
 function checkResize(){
  var fontSize=FONT.rowTitle.Size,min=ssWindowMinimum(),requested={nav:ssWidths.nav,right:ssWidths.right};
  var savedNav=window.GetProperty(SS_WIDTH_KEYS.nav,0),savedRight=window.GetProperty(SS_WIDTH_KEYS.right,0);
  var image=null,gr=null;
  try{
   check(window.MinWidth===min.width&&window.MinHeight===min.height,'Host panel reports its DPI-aware minimum');result.minimum=min;
   on_size(min.width,min.height);ssSetRightPane('queue',true);
   image=gdi.CreateImage(W,H);gr=image.GetGraphics();
   function paint(){dirtyAll=true;on_paint(gr);}
   function proportional(){
    var main=R.libraryScales.main;
    ssDrawScaledLibrary(gr,function(){
     check(Math.abs(FONT.rowTitle.Size-fontSize*main)<=1,'Library font follows the main pane scale');
    },main,true);
   }
   proportional();paint();
   for(var side of ['nav','right']){
    var pane=side==='nav'?R.navLib:R.queue,old=pane.w,scaleBefore=R.libraryScales[side==='nav'?'nav':'main'];
    var x=side==='nav'?R.main.x-M.gap/2:R.queue.x-M.gap/2,y=R.main.y+40;
    check(ssResizeBegin(x,y),'Minimum window accepts the '+side+' divider');
    var target=x+(side==='nav'?(old>225?-28:28):(old>255?28:-28));
    ssResizing.x=target;ssResizeApply();paint();
    pane=side==='nav'?R.navLib:R.queue;
    check(old!==pane.w&&R.navLib.x+R.navLib.w<R.main.x&&R.main.x+R.main.w<R.queue.x&&R.main.y+R.main.h<R.barY,'Live '+side+' reflow keeps panes and footer disjoint');
    var scaleAfter=R.libraryScales[side==='nav'?'nav':'main'];
    check((scaleAfter-scaleBefore)*(pane.w-old)*(side==='nav'?1:-1)>0,'Dragging '+side+' changes the library scale in the expected direction');
    proportional();
    ssResizeEnd(target,y);
   }
  }finally{
   if(gr)image.ReleaseGraphics(gr);if(image&&typeof image.Dispose==='function')image.Dispose();
   ssAbortResize();ssWidths.nav=requested.nav;ssWidths.right=requested.right;
   window.SetProperty(SS_WIDTH_KEYS.nav,savedNav);window.SetProperty(SS_WIDTH_KEYS.right,savedRight);
  }
 }
 function capture(job){
  check(appearanceReady(job.mode),'Native and rendered appearance agree: '+job.mode+' '+job.page+' '+W);
  if(job.page==='stats')check(!!ssStats.data&&!ssStats.error,'Statistics page receives native data at '+job.mode+' '+W);
  if(ssIsPersonal(job.page)&&ssPersonalEnabled())check(!ssPersonal.loading&&!ssPersonal.error,'Personal page receives native data: '+job.page+' '+job.mode+' '+W);
  var image=gdi.CreateImage(W,H),gr=image.GetGraphics();
  try{
   ssDropSceneImage();ssDropModalImage();dirtyAll=true;on_paint(gr);
   if(RR_MONITOR&&fsMode){
    var scale=ssFsScale(W,H),stage=ssFsDefaultGeometry(W,H-Math.round(172*scale),scale);
    if(job.page==='fullscreen-playing'){
     var titleWidth=ssMeasureText(gr,npTitleStr,ssFsFont(FONT.fsTitle,scale),Math.round(45*scale));
     result.fullscreenTitle={titleWidth:titleWidth,availableWidth:stage.textW};
    }
    var exit=HB_FS.find(function(box){return box.act==='exit';});
    var mode=HB_CTRL.find(function(box){return box.act==='playback_mode';});
    check(!!exit&&exit.x1<=W&&exit.y1<=stage.y,'Fullscreen exit control fits above the stage');
    check(!!mode&&mode.x0>W/2&&mode.x1<=W,'Fullscreen playback mode fits beside the transport');
   }
  }finally{image.ReleaseGraphics(gr);}
  if(ssIsPersonal(job.page)&&!ssPersonalEnabled())check(HB_TR.length===0&&HB_PERSONAL_ACTIONS.length===1&&HB_PERSONAL_ACTIONS[0].settings,'Disabled personal page shows a settings action and no track rows: '+job.page+' '+job.mode+' '+W);
  var name=job.mode+'-'+job.w+'x'+job.h+'-'+job.page+'.png';
  try{image.SaveAs(RR_OUTPUT+'screens\\'+name,'image/png');}finally{if(typeof image.Dispose==='function')image.Dispose();}
  var geometry=null;
  if(job.page==='songs'||job.page==='playlist'||job.page==='albums'){
   var nav=HB_PL.find(function(row){return row.y1-row.y0>=Math.floor(58*R.libraryScales.nav);});
   var item=job.page==='albums'?HB_CARD[0]:HB_TR[0];
   check(!!nav&&!!item,'Library page has rendered nav and content targets: '+name);
   if(job.page==='albums'){
    check(Math.abs(item.x1-item.x0-157*R.libraryScales.main)<=1,'Album cover follows the main pane scale: '+name);
    geometry=item.x1-item.x0;
   }else{
    check(Math.abs(item.rowH-M.rowH*R.libraryScales.main)<=1,'Track row follows the main pane scale: '+name);
    geometry=item.rowH;
   }
   check(Math.abs(nav.y1-nav.y0-58*R.libraryScales.nav)<=1,'Playlist nav row follows the sidebar scale: '+name);
  }
  result.captures.push({libraryScale:R.libraryScales,libraryGeometry:geometry,file:name,view:view,width:W,height:H,appearance:SS_APPEARANCE,nativeAppearance:ssState.theme.appearance,rightOpen:ssRightOpen,rightTab:rightTab,rightWidth:R.queue.w,mainWidth:R.main.w,statsError:ssStats.error||'',personalError:ssPersonal.error||''});
  check(R.main.w>0&&R.main.h>0,name+' has positive content bounds');
 }
 function next(){
  if(index>=jobs.length){finish();return;}
  var job=jobs[index++];
  try{
   if(startedPlayback){fb.Stop();startedPlayback=false;}
   reset();ssSend('theme_appearance',{appearance:job.mode});
   var isFullscreen=job.page==='fullscreen'||job.page==='fullscreen-playing';
   if(RR_MONITOR){W=window.Width;H=window.Height;}else{W=job.w;H=job.h;}
   layout(true);
   var catalog=getAlbumCatalog(),album=catalog.albums[0],counts={},best=0;
   for(var a of catalog.albums)counts[a.artist]=(counts[a.artist]||0)+1;
   for(var a of catalog.albums)if(counts[a.artist]>best){best=counts[a.artist];album=a;}
   if(job.page==='artist'){view='artist';viewArtist=album?album.artist:'';ssOpenCatalog=null;ssSyncCollection();}
   else if(job.page==='album'){
    var detail=catalog.albums.reduce(function(best,entry){return !best||entry.tracks.length>best.tracks.length?entry:best;},null);
    view='album';viewAlbum=detail?detail.id:'';ssOpenCatalog=null;ssSyncCollection();
   }
   else if(job.page==='search'){view='search';searchQuery=album?album.artist:'test';computeSearch();}
   else if(ssIsPersonal(job.page)){ssOpenPersonal(job.page);check(view===job.page,'Personal page opens with its current feature state: '+job.page);}
   else if(job.page==='stats')ssStatsOpen();
   else if(job.page==='queue'||job.page==='lyrics'){ssSetRightPane(job.page,true);check(ssRightOpen&&rightTab===job.page,'Explicit '+job.page+' selection retains desired drawer state');}
   else if(job.page==='track-menu'||job.page==='playback-menu')view='playlist';
   else if(isFullscreen){
    fsView='default';
    if(RR_MONITOR)enterFullscreen();else fsMode=true;
   }
   else if(job.page==='modal')ssShow(true);
   else view=job.page;
   var demoId='';
   if((job.page==='queue'&&!(ssState.queue||[]).length)||job.page==='fullscreen-playing'){
    var tracks=getItems(plman.ActivePlaylist);
    check(!!tracks[0],'An active playlist track is available for '+job.page);
    demoId=ssTrackID(tracks[job.page==='fullscreen-playing'&&tracks[1]?1:0]);
    startedPlayback=job.page==='fullscreen-playing';
    ssSend('queue_add',{tracks:[demoId],play:startedPlayback});
   }
   layout(true);
   // Warm a real frame to enqueue the library/cover work, then allow its timers to run.
   var warm=gdi.CreateImage(W,H),warmGr=warm.GetGraphics();
   try{dirtyAll=true;on_paint(warmGr);}finally{warm.ReleaseGraphics(warmGr);if(typeof warm.Dispose==='function')warm.Dispose();}
   if(job.page==='playback-menu'){
    var modeButton=HB_CTRL.find(function(box){return box.act==='playback_mode';});
    check(!!modeButton,'Playback mode capture uses the live footer button');
    doCtrl('playback_mode',modeButton);
   }
   if(job.page==='track-menu'){
    var row=HB_TR.find(function(row){return !!row.more;});
    check(!!row,'Playlist has a track for the context-menu capture');
    ssBatchTrackMenu(row,row.more.x0,row.more.y1);
   }
   var started=Date.now();
   (function ready(){try{
    var loaded=appearanceReady(job.mode)&&(job.page!=='stats'||!!ssStats.data||!!ssStats.error)&&(!ssIsPersonal(job.page)||!ssPersonalEnabled()||!ssPersonal.loading);
    if(RR_MONITOR)loaded=loaded&&winMaxed()&&window.Width===job.w&&window.Height===job.h;
    if(job.page==='track-menu')loaded=loaded&&!!(ssPopup&&ssPopup.token);
    if(job.page==='queue'&&demoId)loaded=loaded&&ssState.queue.some(function(row){return row.id===demoId;});
    if(job.page==='fullscreen-playing')loaded=loaded&&!!NP&&ssTrackID(NP)===demoId&&fb.IsPlaying;
    if(Date.now()-started<1000||!loaded){if(Date.now()-started>12000)throw Error('Capture readiness timed out: '+job.mode+' '+job.page+(RR_MONITOR?' panel '+window.Width+'x'+window.Height+' maximized='+winMaxed():''));window.SetTimeout(ready,100);return;}
    if(RR_MONITOR){
     W=window.Width;H=window.Height;layout(true);
     check(fsMode===isFullscreen&&winMaxed()&&W===RR_MONITOR.width&&H===RR_MONITOR.height,'Panel covers the physical monitor in '+(isFullscreen?'player fullscreen':'maximized library')+': '+job.mode+' '+job.page);
    }
    capture(job);
    if(job.page==='queue'&&demoId){
     var queued=HB_Q.find(function(row){return row.scope==='priority'&&row.track_id===demoId;});
     check(!!queued&&!!queued.remove&&!!queued.more,'Priority queue exposes both row actions');
     var remove=queued.remove,x=(remove.x0+remove.x1)/2,y=(remove.y0+remove.y1)/2;
     on_mouse_lbtn_down(x,y);on_mouse_lbtn_up(x,y);
     check(!plman.GetPlaybackQueueContents().some(function(item){return ssTrackID(item.Handle)===demoId;}),'Clicking remove clears the exact priority entry');
    }
    next();
   }catch(e){finish(e);}})();
  }catch(e){finish(e);}
 }
 window.SetTimeout(function(){try{
  check(typeof ssSetRightPane==='function','Drawer controller is available');
  saved.nativeAppearance=ssState&&ssState.theme?ssState.theme.appearance:saved.appearance;
  if(!ssPersonalEnabled())result.limitations.push('Personal library is disabled and remains disabled. Personal screenshots capture its disabled empty surface; enabled personal behavior requires the separate host test.');
  if(RR_MONITOR){
   result.monitor=RR_MONITOR;
   if(RR_MONITOR_PAGES&&!winMaxed())UIWizard.ToggleMaximize();
   var monitorPages=RR_MONITOR_PAGES?pages:['fullscreen','fullscreen-playing'];
   ['light','dark'].forEach(function(mode){
    monitorPages.forEach(function(page){jobs.push({mode:mode,w:RR_MONITOR.width,h:RR_MONITOR.height,page:page});});
   });
   next();return;
  }
  W=maximized[0];H=maximized[1];layout(true);ssSetRightPane('queue',false);layout(true);
  check(!ssRightOpen&&R.queue.w===0,'Closed drawer releases all right pane width');var closed=R.main.w;
  ssSetRightPane('queue',true);layout(true);check(ssRightOpen&&rightTab==='queue'&&R.queue.w>0&&R.main.w<closed,'Opening queue allocates width from main content');
  ssSetRightPane('lyrics',true);layout(true);check(ssRightOpen&&rightTab==='lyrics'&&R.queue.w>0,'Selecting lyrics keeps drawer open');
  W=standard[0];H=standard[1];layout(true);check(ssRightOpen&&rightTab==='lyrics'&&R.queue.w>0,'The standard window keeps the selected drawer visible');result.standardRightWidth=R.queue.w;
  W=maximized[0];H=maximized[1];layout(true);check(R.queue.w>0&&rightTab==='lyrics','Maximizing keeps the selected drawer visible');
  ssSetRightPane('lyrics',false);layout(true);check(!ssRightOpen&&R.queue.w===0,'Explicit close releases drawer width');
  checkResize();
  var catalog=getAlbumCatalog();result.libraryAlbums=catalog.albums.length;if(!catalog.albums.length)result.limitations.push('Artist and album pages have no real album fixture; empty-state captures only.');
  ['light','dark'].forEach(function(mode){[maximized,standard].forEach(function(size){pages.forEach(function(page){jobs.push({mode:mode,w:size[0],h:size[1],page:page});});});});
  next();
 }catch(e){finish(e);}},2500);
})();
