/* Actual host graphics; no desktop capture, mouse injection or invented statistics. */
(function(){
 var result={ok:false,checks:[],captures:[],limitations:[]},jobs=[],index=0;
 var maximized=[1440,900],standard=[1180,780];
 var saved={w:W,h:H,view:view,artist:viewArtist,album:viewAlbum,appearance:SS_APPEARANCE,rightOpen:ssRightOpen,rightTab:rightTab,rightForced:ssRightForced,fsMode:fsMode,fsView:fsView,modal:ssModal,query:searchQuery,
  appearanceProp:window.GetProperty('SmartShuffle: appearance',null),openProp:window.GetProperty('SmartShuffle: right pane open',null),tabProp:window.GetProperty('SmartShuffle: right pane tab',null)};
 function check(value,name){if(!value)throw Error(name);result.checks.push(name);}
 function appearanceReady(mode){return ssState&&ssState.theme&&ssState.theme.appearance===mode&&SS_APPEARANCE===mode;}
 function writeResult(){result.ok=!result.error&&!result.cleanup;utils.WriteTextFile(RR_OUTPUT+'acceptance.json',JSON.stringify(result,null,2),false);}
 function finish(error){
  if(error)result.error=String(error)+(error.stack?'\n'+String(error.stack):'');
  try{
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
 function reset(){ssModal=false;fsMode=false;view='home';ssDropModalImage();ssDropSceneImage();ssSetRightPane('queue',false);}
 function checkResize(){
  var font=FONT.rowTitle,rowHeight=M.rowH,min=ssWindowMinimum(),requested={nav:ssWidths.nav,right:ssWidths.right};
  var savedNav=window.GetProperty(SS_WIDTH_KEYS.nav,0),savedRight=window.GetProperty(SS_WIDTH_KEYS.right,0);
  var image=null,gr=null;
  try{
   check(window.MinWidth===min.width&&window.MinHeight===min.height,'Host panel reports its DPI-aware minimum');result.minimum=min;
   on_size(min.width,min.height);ssSetRightPane('queue',true);
   image=gdi.CreateImage(W,H);gr=image.GetGraphics();
   function paint(){dirtyAll=true;on_paint(gr);}
   paint();
   for(var side of ['nav','right']){
    var pane=side==='nav'?R.navLib:R.queue,old=pane.w;
    var x=side==='nav'?R.main.x-M.gap/2:R.queue.x-M.gap/2,y=R.main.y+40;
    check(ssResizeBegin(x,y),'Minimum window accepts the '+side+' divider');
    var target=x+(side==='nav'?(old>225?-28:28):(old>255?28:-28));
    ssResizing.x=target;ssResizeApply();paint();
    pane=side==='nav'?R.navLib:R.queue;
    check(old!==pane.w&&R.navLib.x+R.navLib.w<R.main.x&&R.main.x+R.main.w<R.queue.x&&R.main.y+R.main.h<R.barY,'Live '+side+' reflow keeps panes and footer disjoint');
    ssResizeEnd(target,y);
   }
   check(FONT.rowTitle===font&&M.rowH===rowHeight,'Window and divider resize preserve the text and row sizes');
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
  try{ssDropSceneImage();ssDropModalImage();dirtyAll=true;on_paint(gr);}finally{image.ReleaseGraphics(gr);}
  if(ssIsPersonal(job.page)&&!ssPersonalEnabled())check(HB_TR.length===0&&HB_PERSONAL_ACTIONS.length===0,'Disabled personal page exposes no rows or actions: '+job.page+' '+job.mode+' '+W);
  var name=job.mode+'-'+job.w+'x'+job.h+'-'+job.page+'.png';
  try{image.SaveAs(RR_OUTPUT+'screens\\'+name,'image/png');}finally{if(typeof image.Dispose==='function')image.Dispose();}
  result.captures.push({file:name,view:view,width:W,height:H,appearance:SS_APPEARANCE,nativeAppearance:ssState.theme.appearance,rightOpen:ssRightOpen,rightTab:rightTab,rightWidth:R.queue.w,mainWidth:R.main.w,statsError:ssStats.error||'',personalError:ssPersonal.error||''});
  check(R.main.w>0&&R.main.h>0,name+' has positive content bounds');
 }
 function next(){
  if(index>=jobs.length){finish();return;}
  var job=jobs[index++];
  try{
   reset();ssSend('theme_appearance',{appearance:job.mode});W=job.w;H=job.h;layout(true);
   var catalog=getAlbumCatalog(),album=catalog.albums[0],counts={},best=0;
   for(var a of catalog.albums)counts[a.artist]=(counts[a.artist]||0)+1;
   for(var a of catalog.albums)if(counts[a.artist]>best){best=counts[a.artist];album=a;}
   if(job.page==='artist'){view='artist';viewArtist=album?album.artist:'';ssOpenCatalog=null;ssSyncCollection();}
   else if(job.page==='album'){view='album';viewAlbum=album?album.id:'';ssOpenCatalog=null;ssSyncCollection();}
   else if(job.page==='search'){view='search';searchQuery=album?album.artist:'test';computeSearch();}
   else if(job.page==='favorites'||job.page==='history'||job.page==='later'){if(ssPersonalEnabled()){ssOpenPersonal(job.page);check(view===job.page,'Native personal feature opens '+job.page);}else{view=job.page;HB_TR=[];HB_PERSONAL_ACTIONS=[];}}
   else if(job.page==='stats')ssStatsOpen();
   else if(job.page==='queue'||job.page==='lyrics'){ssSetRightPane(job.page,true);check(ssRightOpen&&rightTab===job.page,'Explicit '+job.page+' selection retains desired drawer state');}
   else if(job.page==='fullscreen'){fsMode=true;fsView='default';}
   else if(job.page==='modal')ssShow(true);
   else view=job.page;
   layout(true);
   // Warm a real frame to enqueue the library/cover work, then allow its timers to run.
   var warm=gdi.CreateImage(W,H),warmGr=warm.GetGraphics();
   try{dirtyAll=true;on_paint(warmGr);}finally{warm.ReleaseGraphics(warmGr);if(typeof warm.Dispose==='function')warm.Dispose();}
   var started=Date.now();
   (function ready(){try{
    var loaded=appearanceReady(job.mode)&&(job.page!=='stats'||!!ssStats.data||!!ssStats.error)&&(!ssIsPersonal(job.page)||!ssPersonalEnabled()||!ssPersonal.loading);
    if(Date.now()-started<1000||!loaded){if(Date.now()-started>12000)throw Error('Capture readiness timed out: '+job.mode+' '+job.page);window.SetTimeout(ready,100);return;}
    capture(job);next();
   }catch(e){finish(e);}})();
  }catch(e){finish(e);}
 }
 window.SetTimeout(function(){try{
  check(typeof ssSetRightPane==='function','Drawer controller is available');
  saved.nativeAppearance=ssState&&ssState.theme?ssState.theme.appearance:saved.appearance;
  if(!ssPersonalEnabled())result.limitations.push('Personal library is disabled and remains disabled. Personal screenshots capture its disabled empty surface; enabled personal behavior requires the separate host test.');
  W=maximized[0];H=maximized[1];layout(true);ssSetRightPane('queue',false);layout(true);
  check(!ssRightOpen&&R.queue.w===0,'Closed drawer releases all right pane width');var closed=R.main.w;
  ssSetRightPane('queue',true);layout(true);check(ssRightOpen&&rightTab==='queue'&&R.queue.w>0&&R.main.w<closed,'Opening queue allocates width from main content');
  ssSetRightPane('lyrics',true);layout(true);check(ssRightOpen&&rightTab==='lyrics'&&R.queue.w>0,'Selecting lyrics keeps drawer open');
  W=standard[0];H=standard[1];layout(true);check(ssRightOpen&&rightTab==='lyrics'&&R.queue.w>0,'The standard window keeps the selected drawer visible');result.standardRightWidth=R.queue.w;
  W=maximized[0];H=maximized[1];layout(true);check(R.queue.w>0&&rightTab==='lyrics','Maximizing keeps the selected drawer visible');
  ssSetRightPane('lyrics',false);layout(true);check(!ssRightOpen&&R.queue.w===0,'Explicit close releases drawer width');
  checkResize();
  var catalog=getAlbumCatalog();result.libraryAlbums=catalog.albums.length;if(!catalog.albums.length)result.limitations.push('Artist and album pages have no real album fixture; empty-state captures only.');
  ['light','dark'].forEach(function(mode){[maximized,standard].forEach(function(size){['home','artist','album','albums','playlist','songs','search','favorites','history','later','stats','queue','lyrics','fullscreen','modal'].forEach(function(page){jobs.push({mode:mode,w:size[0],h:size[1],page:page});});});});
  next();
 }catch(e){finish(e);}},2500);
})();
