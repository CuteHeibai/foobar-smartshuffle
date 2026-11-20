/* Actual host graphics; no desktop capture, mouse injection or invented statistics. */
(function(){
 var result={ok:false,checks:[],captures:[],limitations:[]},jobs=[],index=0,startedPlayback=false,visualPlaylist=-1;
 var maximized=[1440,900],standard=[1180,780];
 var pages=['home','artist','album','albums','playlist','songs','search','favorites','history','later','stats','queue','lyrics','fullscreen','fullscreen-playing','modal','track-menu','playback-menu'];
 var fullscreenPages=['fullscreen','fullscreen-playing','fullscreen-menu','fullscreen-submenu','fullscreen-viz'];
 var saved={w:W,h:H,view:view,artist:viewArtist,album:viewAlbum,appearance:SS_APPEARANCE,rightOpen:ssRightOpen,rightTab:rightTab,rightForced:ssRightForced,fsMode:fsMode,fsView:fsView,modal:ssModal,query:searchQuery,
  playlist:plman.ActivePlaylist,wasMaximized:winMaxed(),appearanceProp:window.GetProperty('SmartShuffle: appearance',null),openProp:window.GetProperty('SmartShuffle: right pane open',null),tabProp:window.GetProperty('SmartShuffle: right pane tab',null)};
 function check(value,name){if(!value)throw Error(name);result.checks.push(name);}
 function appearanceReady(mode){return ssState&&ssState.theme&&ssState.theme.appearance===mode&&SS_APPEARANCE===mode;}
 function writeResult(){result.ok=!result.error&&!result.cleanup;utils.WriteTextFile(RR_OUTPUT+'acceptance.json',JSON.stringify(result,null,2),false);}
 function finish(error){
  if(ssPopup)ssClosePopup();
  if(error)result.error=String(error)+(error.stack?'\n'+String(error.stack):'');
  try{
   if(startedPlayback)fb.Stop();
   if(saved.playlist>=0&&saved.playlist<plman.PlaylistCount)plman.ActivePlaylist=saved.playlist;
   if(RR_MONITOR&&!RR_BACKGROUND&&!saved.wasMaximized&&winMaxed())UIWizard.ExitMaximize();
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
 function reset(){if(ssPopup)ssClosePopup();if(fsMode)exitFullscreen();ssModal=false;view='home';ssDropModalImage();ssDropSceneImage();ssSetRightPane('queue',false);}
 function click(box){var x=(box.x0+box.x1)/2,y=(box.y0+box.y1)/2;on_mouse_lbtn_down(x,y);on_mouse_lbtn_up(x,y);}
 function clickFullscreen(box){
  var wizard=UIWizard;
  if(RR_BACKGROUND)UIWizard=null;
  try{click(box);}finally{UIWizard=wizard;}
 }
 function footerControl(action){return HB_CTRL.find(function(box){return box.act===action;});}
 function warmFrame(){
  var image=gdi.CreateImage(W,H),gr=image.GetGraphics();
  try{dirtyAll=true;on_paint(gr);}finally{image.ReleaseGraphics(gr);if(typeof image.Dispose==='function')image.Dispose();}
 }
 function checkSpectrumFrames(image){
  var band=ssFsVizRect(W,H),ink=gdi.CreateImage(24,1),sample=ink.GetGraphics();
  sample.FillSolidRect(0,0,24,1,COL.base);ink.ReleaseGraphics(sample);
  // JSplitter quantizes the palette, so use an opaque GDI sample as the reference.
  var base=ink.GetColourScheme(1)[0]&0xffffff;
  if(typeof ink.Dispose==='function')ink.Dispose();
  for(var frame=0;frame<12;frame++){
   var gr=image.GetGraphics();
   try{
    gr.FillSolidRect(band.x,band.y,band.w,band.h,RGB(233,31,173));
    clearDirty();repaintViz();on_paint(gr);
   }finally{image.ReleaseGraphics(gr);}
   for(var row of [band.y-1,band.y,band.y+band.h-1,band.y+band.h]){
    var clip=image.Clone(20,row,24,1);
    try{
     var colour=clip.GetColourScheme(1)[0]&0xffffff;
     if(colour!==base)throw Error('Partial spectrum paint leaves a seam at '+row+' on frame '+frame+
       ' ('+colour.toString(16)+' vs '+base.toString(16)+')');
    }finally{if(typeof clip.Dispose==='function')clip.Dispose();}
   }
  }
  check(true,'Twelve real GDI partial frames leave both spectrum boundaries in the theme colour');
 }
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
    check(pane.w>0&&R.navLib.x+R.navLib.w<R.main.x&&R.main.x+R.main.w<R.queue.x&&R.main.y+R.main.h<R.barY,'Live '+side+' viewport stays within the minimum layout');
    var scaleAfter=R.libraryScales[side==='nav'?'nav':'main'];
    check(scaleAfter===scaleBefore,'Dragging '+side+' preserves the content scale');
    proportional();
    ssResizeEnd(target,y);
   }
  }finally{
   if(gr)image.ReleaseGraphics(gr);if(image&&typeof image.Dispose==='function')image.Dispose();
   ssAbortResize();ssWidths.nav=requested.nav;ssWidths.right=requested.right;
   window.SetProperty(SS_WIDTH_KEYS.nav,savedNav);window.SetProperty(SS_WIDTH_KEYS.right,savedRight);
  }
 }
 function checkMaximizedLibraryResize(){
  var requested=ssWidths.nav,property=window.GetProperty(SS_WIDTH_KEYS.nav,0);
  var requestedRight=ssWidths.right,propertyRight=window.GetProperty(SS_WIDTH_KEYS.right,0);
  var open=ssRightOpen,tab=rightTab;
  try{
   ssWidths.nav=260;ssSetRightPane('queue',true);
   var start=R.main.x-M.gap/2,y=R.top.y+40,target=start+240;
   var navScale=R.libraryScales.nav,mainScale=R.libraryScales.main,cover=M.artSz,queueWidth=R.queue.w;
   var image=gdi.CreateImage(W,H),gr=image.GetGraphics();
   try{
    dirtyAll=true;on_paint(gr);
    var base=ssSceneImage,elapsed=Date.now();
    on_mouse_lbtn_down(start,y);
    for(var step=1;step<=12;step++){
     on_mouse_move(start+step*20,y);ssResizeApply();on_paint(gr);
     var pin=HB_ALLSONGS;
     check(ssSceneImage===base&&R.navW===260+step*20&&pin.x1-pin.x0===R.navW,
       'The library content and click bounds follow the divider before release at frame '+step);
    }
    check(R.libraryScales.nav===navScale&&R.libraryScales.main===mainScale&&M.artSz===cover&&R.queue.w===queueWidth,
      'Live library resizing preserves type, artwork and the opposite pane');
    result.maximizedLibraryPreview={frames:12,milliseconds:Date.now()-elapsed};
   }finally{image.ReleaseGraphics(gr);if(typeof image.Dispose==='function')image.Dispose();}
   on_mouse_move(target,y);
   check(!!ssResizing&&ssResizing.key==='nav','Maximized library divider accepts the mouse callbacks');
   ssResizeApply();
   check(R.navW===500,'Maximized library grows from 260 to 500 pixels while dragging');
   on_mouse_lbtn_up(target,y);
   check(R.main.w>=720&&R.queue.w>=220&&window.GetProperty(SS_WIDTH_KEYS.nav,0)===500,'Maximized library saves the widened width and preserves the other panels');
   layout(true);
   check(R.navW===500,'Maximized library retains the adjusted width after layout');
   result.maximizedLibraryResize={before:260,after:R.navW,windowWidth:W,windowHeight:H};
   var rightStart=R.queue.x-M.gap/2,right=R.queue.w,tabStart=HB_TABS[0].x0;
   requireRight(48);
   function requireRight(distance){
    on_mouse_lbtn_down(rightStart,y);on_mouse_move(rightStart-distance,y);ssResizeApply();warmFrame();
    check(R.queue.w===right+distance&&HB_TABS[0].x0===tabStart-distance&&R.navW===500,
      'Right pane content moves with its divider before release');
    on_mouse_lbtn_up(rightStart-distance,y);
   }
  }finally{
   ssAbortResize();ssWidths.nav=requested;ssWidths.right=requestedRight;
   window.SetProperty(SS_WIDTH_KEYS.nav,property);
   window.SetProperty(SS_WIDTH_KEYS.right,propertyRight);
   ssSetRightPane(tab,open);
  }
 }
 function capture(job){
  check(appearanceReady(job.mode),'Native and rendered appearance agree: '+job.mode+' '+job.page+' '+W);
  if(job.page==='stats')check(!!ssStats.data&&!ssStats.error,'Statistics page receives native data at '+job.mode+' '+W);
  if(ssIsPersonal(job.page)&&ssPersonalEnabled())check(!ssPersonal.loading&&!ssPersonal.error,'Personal page receives native data: '+job.page+' '+job.mode+' '+W);
  var image=gdi.CreateImage(W,H),gr=image.GetGraphics();
  var numbers=[],drawRight=tR,numbered=['playlist','album','songs'].indexOf(job.page)>=0;
  if(numbered)tR=function(g,label,font,color,x,y,w,h){
   if(font===FONT.rowNum&&/^\d+$/.test(label))numbers.push({x:x,y:y});
   drawRight(g,label,font,color,x,y,w,h);
  };
  try{
   if(!job.entry)ssDropSceneImage();
   ssDropModalImage();dirtyAll=true;on_paint(gr);
   if(numbered){
    var row=HB_TR.find(function(item){return numbers.some(function(number){return number.y===item.rowY&&number.x>item.pgx1;});});
    check(!!row,'Native row paint has a visible number beside its independent playback hit target: '+job.page);
   }
   if(job.page==='albums'&&RR_MONITOR){
    var disks=getAlbumCatalog().albums.filter(function(album){return /\[Disc\s+\d+\]$/i.test(album.album);});
    if(disks.length)ssDrawScaledLibrary(gr,function(graphics){
     var grid=ssAlbumGrid(R.main.w-2*M.cpad,ssDensity,undefined,7);
     check(disks.every(function(album){
      var tag=album.album.match(/\[Disc\s+\d+\]$/i)[0],lines=ssAlbumTitleLines(graphics,album.album,grid.size);
      var tail=lines[lines.length-1];
      return tail.endsWith(tag)&&ssMeasureText(graphics,tail,FONT.card)<=grid.size+1;
     }),'Album cards preserve real disc suffixes within their measured width');
    },R.libraryScales.main,true);
   }
   if(RR_MONITOR&&fsMode){
    var scale=ssFsScale(W,H),stage=ssFsDefaultGeometry(W,ssFsStageBottom(W,H),scale,ssFsCoverScale(W,H));
    if(job.page!=='fullscreen'){
     var titleWidth=ssMeasureText(gr,npTitleStr,ssFsFont(FONT.fsTitle,scale),Math.round(45*scale));
     result.fullscreenTitle={titleWidth:titleWidth,availableWidth:stage.textW,cover:stage.size};
     check(!!HB_SEEK,'Playing fullscreen retains an interactive seek rail');
    }else{
     check(!HB_SEEK&&HB_FS.some(function(box){return box.act==='featured';}),'Idle fullscreen keeps the album action and hides the inactive seek rail');
    }
    var exit=footerControl('fullscreen'),mode=footerControl('playback_mode');
    check(!!exit&&['x0','y0','x1','y1'].every(function(key){return exit[key]===job.entry[key];}),
      'Fullscreen toggle uses the identical desktop footer rectangle');
    check(!!mode&&mode.x0>W/2&&mode.x1<=W,'Fullscreen playback mode fits beside the transport');
    if(job.modeAnchor){
     check(!!ssPopup&&ssPopup.anchor===job.modeAnchor&&fsMode&&ssPopupImage===null,
       'Opening playback order uses the fullscreen frame above the live footer button');
     check(ssPopup.levels[0].rect.y+ssPopup.levels[0].rect.h<=job.modeAnchor.y0,'Playback order menu opens above its button');
    }
    if(job.page==='fullscreen-viz'){
     var band=ssFsVizRect(W,H);
     check(vizTimer!==null&&band.y>=HB_VIZ.y1&&band.y+band.h<mode.y0,'Spectrum paints inside the stage between the picker and transport');
    }
   }
   if(job.page==='playback-menu'||job.modeAnchor){
    var modeIcons=['shuffle','sequence','repeat','repeat1'];
    check(modeIcons.every(function(icon){
      return SS_MENU_HB.some(function(box){return box.depth===0&&box.item&&box.item.icon===icon;})&&!!iconImg(icon,20,COL.text);
    }),'All four playback modes load and display SVG assets in '+job.page+' '+job.mode);
   }
  }finally{tR=drawRight;image.ReleaseGraphics(gr);}
  if(job.page==='fullscreen-submenu'||job.page==='track-submenu'){
   var secondary=ssPopup.levels[1],r=secondary.rect;
   check(ssPopup.levels.length===2&&r.x>=SS_SUBMENU_EDGE&&r.x+r.w<=W-SS_SUBMENU_EDGE&&r.y+r.h<=H-SS_SUBMENU_EDGE,
     'The actual submenu reserves room around the edges for the soft shadow');
   if(job.page==='track-submenu')check(!!secondary.drill&&SS_MENU_HB.some(function(box){return box.back;}),'Track action submenu keeps a visible Back target');
   else check(SS_MENU_HB.some(function(box){return box.depth===1&&box.item.label==='插件设置…';}),'Fullscreen plugin submenu exposes its settings command');
  }
  if(job.page==='queue'){
   var priorityRows=HB_Q.filter(function(row){return row.scope==='priority';});
   var nextGroup=HB_Q.find(function(row){return row.scope!=='priority';});
   if(priorityRows.length&&nextGroup){
    var last=priorityRows[priorityRows.length-1];
    check(last.y1<nextGroup.y0&&(nextGroup.scope!=='remaining'||nextGroup.queueIndex===0),'Manual queue and automatic rows have separate sections and retain their own indices');
   }
  }
  if(job.page==='modal')check(SS_HB.length===5,'Preference modal exposes three presets plus Cancel and Apply');
  if(ssIsPersonal(job.page)&&!ssPersonalEnabled())check(HB_TR.length===0&&HB_PERSONAL_ACTIONS.length===1&&HB_PERSONAL_ACTIONS[0].settings,'Disabled personal page shows a settings action and no track rows: '+job.page+' '+job.mode+' '+W);
  var name=job.mode+'-'+job.w+'x'+job.h+'-'+job.page+'.png';
  try{
   image.SaveAs(RR_OUTPUT+'screens\\'+name,'image/png');
   if(job.page==='fullscreen-viz')checkSpectrumFrames(image);
  }finally{if(typeof image.Dispose==='function')image.Dispose();}
  var geometry=null;
  if(job.page==='songs'||job.page==='playlist'||job.page==='albums'){
   var nav=HB_PL.find(function(row){return row.y1-row.y0>=Math.floor(58*R.libraryScales.nav);});
   var item=job.page==='albums'?HB_CARD[0]:HB_TR[0];
   check(!!nav&&!!item,'Library page has rendered nav and content targets: '+name);
   var mainScale=R.libraryScales.main,padding=Math.round(M.cpad*mainScale);
   if(job.page==='albums'){
    var grid=ssAlbumGrid(R.main.w-2*padding,mainScale,undefined,7);
    check(Math.abs(item.x1-item.x0-grid.size)<=1&&grid.cols<=7,'Album grid uses at most seven readable columns: '+name);
    geometry=item.x1-item.x0;
   }else{
    var hasMetadataColumn=job.page==='songs'&&(songsGroup==='album'||(songsGroup==='none'&&R.main.w>=940*mainScale));
    var columns=ssLibraryTrackLayout(R.main,mainScale,padding,hasMetadataColumn);
    check(Math.abs(item.rowH-M.rowH*mainScale)<=1,'Track row follows the main pane scale: '+name);
    check(!!item.more&&Math.abs(item.more.x0-columns.moreX)<=1,'Track actions match the shared reading columns: '+name);
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
   if(visualPlaylist>=0&&plman.ActivePlaylist!==visualPlaylist)plman.ActivePlaylist=visualPlaylist;
   var isFullscreen=fullscreenPages.indexOf(job.page)>=0;
   var fullPlaying=isFullscreen&&job.page!=='fullscreen';
   var fullMenu=job.page==='fullscreen-menu'||job.page==='fullscreen-submenu';
   var trackMenu=job.page==='track-menu'||job.page==='track-submenu';
   if(RR_MONITOR&&!RR_BACKGROUND){W=window.Width;H=window.Height;}else{W=job.w;H=job.h;}
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
   else if(trackMenu||job.page==='playback-menu')view='playlist';
   else if(isFullscreen){
    fsView=job.page==='fullscreen-viz'?'viz':'default';
    if(!RR_MONITOR)fsMode=true;
   }
   else if(job.page==='modal')ssShow(true);
   else view=job.page;
   var demoId='',demoIds=[];
   if((job.page==='queue'&&!(ssState.queue||[]).length)||fullPlaying){
    var tracks=getItems(visualPlaylist);
    check(tracks.Count>0,'A review playlist track is available for '+job.page);
    demoId=ssTrackID(tracks[fullPlaying&&tracks.Count>1?1:0]);
    startedPlayback=fullPlaying;
    demoIds.push(demoId);
    if(job.page==='queue')for(var i=1;i<tracks.Count&&demoIds.length<3;i++){
     var candidate=ssTrackID(tracks[i]);if(demoIds.indexOf(candidate)<0)demoIds.push(candidate);
    }
    ssSend('queue_add',{tracks:demoIds,play:startedPlayback});
   }
   layout(true);
   // Warm a real frame to enqueue the library/cover work, then allow its timers to run.
   warmFrame();
   if(RR_MONITOR&&isFullscreen){
    job.entry=footerControl('fullscreen');
    check(!!job.entry,'Fullscreen opens from the desktop footer');
    clickFullscreen(job.entry);check(fsMode,'Clicking the desktop footer enters fullscreen');warmFrame();
   }
   if(job.page==='playback-menu'){
    var modeButton=footerControl('playback_mode');
    check(!!modeButton,'Playback mode capture uses the live footer button');
    job.modeAnchor=modeButton;click(modeButton);
   }
   if(trackMenu){
    var row=HB_TR.find(function(row){return !!row.more;});
    check(!!row,'Playlist has a track for the context-menu capture');
    ssBatchTrackMenu(row,row.more.x0,row.more.y1);
   }
   var started=Date.now();
   (function ready(){try{
    var loaded=appearanceReady(job.mode)&&(job.page!=='stats'||!!ssStats.data||!!ssStats.error)&&(!ssIsPersonal(job.page)||!ssPersonalEnabled()||!ssPersonal.loading);
    if(RR_MONITOR&&!RR_BACKGROUND){
     if(UIWizard.WindowState===0&&!job.restoredWindow){
      job.restoredWindow=true;UIWizard.WindowRestore();if(!winMaxed())UIWizard.ToggleMaximize();
     }
     loaded=loaded&&winMaxed()&&window.Width===job.w&&window.Height===job.h;
    }
    if(trackMenu)loaded=loaded&&!!(ssPopup&&ssPopup.token);
    if(job.page==='queue'&&demoId)loaded=loaded&&demoIds.every(function(id){return ssState.queue.some(function(row){return row.id===id;});});
    if(fullPlaying)loaded=loaded&&!!NP&&ssTrackID(NP)===demoId&&fb.IsPlaying;
    if(Date.now()-started<1000||!loaded){if(Date.now()-started>12000)throw Error('Capture readiness timed out: '+job.mode+' '+job.page+(RR_MONITOR?' panel '+window.Width+'x'+window.Height+' window state='+UIWizard.WindowState:''));window.SetTimeout(ready,100);return;}
    if(RR_MONITOR){
     if(RR_BACKGROUND){W=job.w;H=job.h;}else{W=window.Width;H=window.Height;}
     layout(true);
     check(fsMode===isFullscreen&&(RR_BACKGROUND||winMaxed())&&W===RR_MONITOR.width&&H===RR_MONITOR.height,
       (RR_BACKGROUND?'Bitmap matches the physical monitor in ':'Panel covers the physical monitor in ')+(isFullscreen?'player fullscreen':'maximized library')+': '+job.mode+' '+job.page);
     if(RR_MONITOR_PAGES&&job.page==='home'&&job.mode==='light'&&W>=1920)checkMaximizedLibraryResize();
    }
    if(fullMenu){
     warmFrame();job.modeAnchor=footerControl('playback_mode');
     check(!!job.modeAnchor,'Fullscreen playback mode uses the live footer button');
     click(job.modeAnchor);
    }
    if(job.page==='fullscreen-submenu'||job.page==='track-submenu'){
     warmFrame();
     var submenu=SS_MENU_HB.find(function(box){return box.item&&box.item.children&&
       (fullMenu?box.item.label.indexOf('插件')===0:box.item.drill);});
     check(!!submenu,'A live secondary menu is available: '+job.page);
     click(submenu);
    }
    capture(job);
    if(fullMenu){
     on_key_down(27);warmFrame();
     check(fsMode&&(RR_BACKGROUND||winMaxed())&&!ssPopup&&!ssPopupRestore,'Closing the playback order popup keeps fullscreen');
     click(footerControl('fullscreen'));
     check(!fsMode&&(RR_BACKGROUND||winMaxed()),'Clicking the same footer control exits fullscreen playback');
    }
    if(job.page==='queue'&&demoId){
     var queued=HB_Q.find(function(row){return row.scope==='priority'&&row.track_id===demoId;});
     check(!!queued&&!queued.remove&&!!queued.more&&queued.more.x1-queued.more.x0>=34,
       'Priority queue exposes a single full-sized action target');
     var more=queued.more,x=(more.x0+more.x1)/2,y=(more.y0+more.y1)/2;
     on_mouse_lbtn_down(x,y);on_mouse_lbtn_up(x,y);
     check(!!ssPopup&&ssPopup.context&&!!ssPopup.request,'Queue More opens the native context menu');
     warmFrame();
     var remove=SS_MENU_HB.find(function(box){return box.item&&box.item.label==='从待播队列移除';});
     check(!!remove,'The queue menu has a visible remove action');
     click(remove);
     var liveIds=plman.GetPlaybackQueueContents().map(function(item){return ssTrackID(item.Handle);});
     check(liveIds.indexOf(demoId)<0&&demoIds.slice(1).every(function(id){return liveIds.indexOf(id)>=0;}),'Remove affects only the chosen priority track');
     for(var k=liveIds.length-1;k>=0;k--)if(demoIds.indexOf(liveIds[k])>=0)plman.RemoveItemFromPlaybackQueue(k);
    }
    if(job.page==='lyrics'&&!NP&&ssHasTransportSource()){
     check(!!SS_LYRIC_PLAY,'The idle lyrics panel offers playback when a source is available');
     var play=SS_LYRIC_PLAY,px=(play.x0+play.x1)/2,py=(play.y0+play.y1)/2;
     startedPlayback=true;
     on_mouse_lbtn_down(px,py);on_mouse_lbtn_up(px,py);
     var playDeadline=Date.now()+5000;
     (function waitForLyricsPlay(){try{
      if(fb.IsPlaying&&NP){check(true,'Clicking the idle lyrics action starts playback in the isolated player');next();return;}
      if(Date.now()>playDeadline)throw Error('Idle lyrics playback did not start');
      window.SetTimeout(waitForLyricsPlay,60);
     }catch(e){finish(e);}})();
     return;
    }
    next();
   }catch(e){finish(e);}})();
  }catch(e){finish(e);}
 }
 window.SetTimeout(function(){try{
  check(typeof ssSetRightPane==='function','Drawer controller is available');
  check(ssTextRenderingHint===3&&FONT.title.Name==='Segoe UI'&&FONT.title.Style===0&&FONT.fsTitle.Name==='Segoe UI'&&FONT.fsTitle.Style===0,
    'Real GDI uses grayscale antialiasing and regular Latin title faces');
  var cjk=ssScriptFont('字体测试',FONT.title);
  check(cjk.Name==='Microsoft YaHei UI'&&cjk.Style===0,'Real GDI uses a regular CJK face');
  // Starting playback from the lyrics action can change the host's active playlist.
  // Keep the review playlist stable and representative across both themes.
  var bestCount=0;
  for(var pi of visiblePlaylists()){
   var items=plCount(pi);
   if(items>bestCount){visualPlaylist=pi;bestCount=items;}
  }
  saved.nativeAppearance=ssState&&ssState.theme?ssState.theme.appearance:saved.appearance;
  if(!ssPersonalEnabled())result.limitations.push('Personal library is disabled and remains disabled. Personal screenshots capture its disabled empty surface; enabled personal behavior requires the separate host test.');
  if(RR_MONITOR){
   result.monitor=RR_MONITOR;result.background=RR_BACKGROUND;
   if(!RR_BACKGROUND&&!winMaxed())UIWizard.ToggleMaximize();
   var monitorPages=RR_MONITOR_PAGES?pages.concat(fullscreenPages.slice(2),['track-submenu']):fullscreenPages;
   ['light','dark'].forEach(function(mode){
    monitorPages.forEach(function(page){jobs.push({mode:mode,w:RR_MONITOR.width,h:RR_MONITOR.height,page:page});});
   });
   if(RR_BACKGROUND){next();return;}
   var deadline=Date.now()+10000;
   (function monitorReady(){try{
    if(winMaxed()&&window.Width===RR_MONITOR.width&&window.Height===RR_MONITOR.height){next();return;}
    if(Date.now()>deadline)throw Error('The host panel did not reach the physical monitor size');
    window.SetTimeout(monitorReady,100);
   }catch(e){finish(e);}})();return;
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
