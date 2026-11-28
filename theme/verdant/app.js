/* verdant/app.js -- panel state, layout, paint dispatch, input, and foobar callbacks
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- state ------------------------- */
var W=window.Width>=400?window.Width:Number(window.GetProperty('SmartShuffle: last content width',1180)), H=window.Height>=200?window.Height:Number(window.GetProperty('SmartShuffle: last content height',780)), R={}, NP=null, npTitleStr='', npArtistStr='';
// Repaint scope flags. dirtyAll (sticky) forces a full paint; partial flags accumulate.
// A full window.Repaint() MUST set dirtyAll (use repaintAll) so a paint serviced while a
// partial flag is pending can't blank the rest of the window.
var dirtyAll=true, dirtyBar=false, dirtyQueue=false, dirtySearch=false, dirtyMain=false, dirtyNav=false, dirtyTitle=false, dirtyViz=false,dirtyPanes=false;
function clearDirty(){ dirtyAll=dirtyBar=dirtyQueue=dirtySearch=dirtyMain=dirtyNav=dirtyTitle=dirtyViz=dirtyPanes=false; }
/* When the oldest pending partial flag was raised. A RepaintRect is serviced within a frame or two,
   so a flag still pending long after it went up means its paint was DEFERRED -- the window was
   minimised, and a minimised window gets no WM_PAINT. The paint that finally arrives on restore is
   the OS repainting the whole window onto a fresh surface, not the region we asked for; taking the
   partial path then drew one panel and left the rest a flat grey until something was hovered. The
   1 Hz clock guarantees a pending flag whenever the window is minimised mid-song, and the mouse
   leaving for the taskbar raises one even when paused. Every partial setter calls markDirty() FIRST,
   so the clock records the oldest flag rather than being reset by each new one. */
var dirtySince=0, DIRTY_STALE_MS=250;
function anyDirty(){ return dirtyBar||dirtyQueue||dirtySearch||dirtyMain||dirtyNav||dirtyTitle||dirtyViz||dirtyPanes; }
function markDirty(){ if(!anyDirty()) dirtySince=Date.now(); }
function repaintAll(){ if(typeof ssInvalidateRowRasters==='function')ssInvalidateRowRasters();dirtyAll=true; window.Repaint(); }
/* Main's views draw the row/card straddling their crop line at full height and mask only the
   10px gutter below it (see the FillSolidRect(r.x,cropY,...) in each), so the remainder lands on
   the player bar. drawBar runs after main in the partial path, so pairing them covers it -- and
   it is far cheaper than the full-window repaint that used to hide this. */
function repaintMain(scrollOnly){ if(!scrollOnly&&typeof ssInvalidateRowRasters==='function')ssInvalidateRowRasters();markDirty(); dirtyMain=true; window.RepaintRect(R.main.x,R.main.y,R.main.w,R.main.h); if(!scrollOnly||(view!=='stats'&&view!=='playlist'&&view!=='songs'&&view!=='artist'&&view!=='album'&&view!=='albums'))repaintBar(); }
function repaintNav(){ markDirty(); dirtyNav=true; window.RepaintRect(R.navLib.x,R.navLib.y,R.navLib.w,R.navLib.h); }
// drawNav paints both nav cards, so a hover crossing between them must invalidate their union
function repaintNavAll(){ markDirty(); dirtyNav=true; window.RepaintRect(R.navTop.x,R.navTop.y,R.navTop.w,(R.navLib.y+R.navLib.h)-R.navTop.y); }
function repaintQueue(scrollOnly){ if(!R.queue||R.queue.w<=0)return; if(!scrollOnly&&typeof ssInvalidateRowRasters==='function')ssInvalidateRowRasters();markDirty(); dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
function repaintPanes(){
  markDirty();dirtyPanes=true;window.RepaintRect(0,R.top.y,W,R.top.bottom-R.top.y);
}
// the visualizer's own band, 30 times a second -- see the fullscreen branch of on_paint
function repaintViz(){
  var r=ssFsVizRect(W,H);
  if(!r.h)return;
  markDirty();dirtyViz=true;window.RepaintRect(r.x,r.y,r.w,r.h);
}
function repaintTitle(){ markDirty(); dirtyTitle=true; window.RepaintRect(0,0,W,TBH); }
/* A hover only changes one panel's appearance, so repaint that panel rather than the whole
   window. Hitbox ownership is cleanly panel-aligned (HB_PL/HB_HOME/SBN -> nav, HB_CARD/HB_TR/
   SB/SBH -> main, HB_Q/HB_TABS -> queue, HB_CTRL -> bar, HB_MENU/HB_CAP -> title), so the
   cursor position alone picks the right one. */
function hoverZone(x,y){
  if(y<TBH) return 'title';
  if(R.barY!==undefined && y>=R.barY) return 'bar';
  if(R.queue && x>=R.queue.x) return 'queue';
  if(R.main && x>=R.main.x) return 'main';
  return 'nav';
}
function repaintZone(z){
  if(z==='main') repaintMain();
  else if(z==='nav') repaintNavAll();
  else if(z==='queue') repaintQueue();
  else if(z==='bar') repaintBar();
  else if(z==='title') repaintTitle();
}
var firstRow=0, hoverKey='', scrollKey='', hoverZoneKey='', mx=-1, my=-1, drag=null, dragFrac=0;   // WHEEL_PX: core/props.js
// eased scrolling: animate each rendered position toward its target, repainting only the moving region
var firstRowT=0, navScrollT=0, homeScrollT=0, PL_MAXPX=0, scrollTimer=null,scrollLast=Date.now();
function scrollTick(){
  var now=Date.now(),dt=Math.max(1,Math.min(80,now-scrollLast));scrollLast=now;
  var alpha=typeof ssReducedMotion!=='undefined'&&ssReducedMotion?1:1-Math.exp(-dt/95),mm=false,nm=false,qm=false;
  function step(current,target,zone){var d=target-current;if(Math.abs(d)<.5)return target;if(zone==='nav')nm=true;else if(zone==='queue')qm=true;else mm=true;return current+d*alpha;}
  firstRow=step(firstRow,firstRowT);homeScroll=step(homeScroll,homeScrollT);songsScroll=step(songsScroll,songsScrollT);
  searchScroll=step(searchScroll,searchScrollT);artScroll=step(artScroll,artScrollT);plScroll=step(plScroll,plScrollT);navScroll=step(navScroll,navScrollT,'nav');
  ssQueueScroll=step(ssQueueScroll,ssQueueScrollT,'queue');
  if(typeof ssPersonalScroll!=='undefined')ssPersonalScroll=step(ssPersonalScroll,ssPersonalScrollT);
  if(typeof ssSettingsScroll!=='undefined'&&view==='settings')ssSettingsScroll=step(ssSettingsScroll,ssSettingsScrollT);
  if((fsMode?fsView:view)==='stats')ssStatsScroll=step(ssStatsScroll,ssStatsScrollT);
  if(mm){if(fsMode)repaintAll();else repaintMain(true);}
  if(nm) repaintNav();
  if(qm) repaintQueue(true);
  // one more frame after the scroll settles, so shimSettle can restart the sweep it suppressed
  if(!mm && !nm && !qm){ stopScrollAnim(); if(shimCount>0) repaintMain(); }
}
function startScrollAnim(){ if(!scrollTimer){if(typeof ssStopMeterTimer==='function')ssStopMeterTimer();scrollLast=Date.now();scrollTimer=window.SetInterval(scrollTick,8);} }
function stopScrollAnim(){ if(scrollTimer){ window.ClearInterval(scrollTimer); scrollTimer=null; } }

function hv(x0,y0,x1,y1){ return mx>=x0 && mx<x1 && my>=y0 && my<y1; }
var HB_PL=[], HB_TR=[], HB_CTRL=[], HB_TABS=[], HB_SEEK=null, HB_VOL=null, HB_Q=[];
var HB_CARD=[],HB_PLPLAY=[],HB_PLAYLIST_PLAY=null,HB_SONGS_PLAY=null,HB_ARTIST_PLAY=null,HB_ALBUMS=null,HB_ALBUM_BACK=null,ssPlaylistPlayDown=null,ssTrackPlayDown=null,ssRowMoreDown=null, HB_HOME=null, HB_CAP=[], HB_MENU=[], SB=null;
var navScroll=0, NAV_MAX=0, SBN=null, HB_ADDPL=null, navDropHover=false;
// deferred "scroll this playlist into view" -- only drawNav knows the row geometry, so it consumes this
var navRevealPl=-1;
function revealPlaylist(i){ navRevealPl=i; }
var plDropHover=false, HB_PLADD_FILES=null, HB_PLADD_FOLDER=null;   // empty-playlist "add songs" zone
// playlist edit: context menu, inline rename, delete confirm
var HB_DOTS=[], renameEdit=null, confirmDel=null, CONF_HB=null, RENAME_HB=null, ssPlaylistPickDown=null, ssLyricPlayDown=false;

var rightTab=typeof ssRightTab==='string'?ssRightTab:'lyrics';
var view='home', viewArtist='', viewAlbum='', artistAlbums=[], homeScroll=0, artScroll=0, artScrollT=0,ssOpenCatalog=null,ssAlbumBack=null;
// Fullscreen "chill" mode + its sub-view (default now-playing / lyrics / visualizer)
var fsMode=false, fsView='default', HB_FS=[], vizTimer=null, vizBars=[];
// Re-asserted every full paint + on_size: JSplitter can reset window.DlgCode on resize/reload.
/* Search and rename need every key, because the user is typing into them. Everywhere else the
   panel still asks for character keys, which is what lets Space reach on_char and act as
   play/pause -- without it the dialog manager swallows Space before the panel ever sees it. */
function applyKeyMode(){ try{ window.DlgCode=(ssModal||ssPopup||fsMode||confirmDel||view==='search'||renameEdit||(view==='stats'&&ssStats.edit))?DLGC_WANTALLKEYS:(DLGC_WANTCHARS|2| (ssKeyboardFocus?1:0)); }catch(e){} }

var searchQuery='', searchScroll=0, searchScrollT=0, searchIdx=null, searchQ2=null, searchArts=[], searchTrks=[], HB_SEARCH=null;
var HOME_MAXROW=0, SS_COLLECTION_SCROLL_MAX=0, SEARCH_MAXPX=0;
// Home "Your Playlists" horizontal shelf: pixel scroll offset + eased target, max, wheel hit-band, h-scrollbar.
var plScroll=0, plScrollT=0, HOME_PLMAX=0, HOME_SHELF_Y0=0, HOME_SHELF_Y1=0, SBH=null;
// The shelf glides freely but always *targets* a card boundary, so the leftmost card keeps its
// rounded edge instead of being cut mid-body (COL.elev against COL.base reads as a seam).
// HOME_STRIDE is published by drawHome, which is the only place the card pitch is known.
var HOME_STRIDE=0;
function snapShelf(px){ var st=HOME_STRIDE||1; return clampPx(Math.round(px/st)*st,HOME_PLMAX); }


function layout(contentOnly){
  var g=M.gap, top0=TBH+g;   // one uniform gap on every side, incl. below the title bar and above the bar
  R.barScale=ssDesktopBarScale(W,H);
  M.barH=Math.round(96*R.barScale);
  R.barY=H-M.barH;
  R.top={x:g,y:top0,bottom:R.barY-g};
  var widths=ssLayoutWidths(W);
  R.navX=g; R.navW=widths.nav;
  R.queueW=widths.right; R.queueX=W-g-R.queueW;
  R.barInfoW=widths.info;R.barToolsW=widths.tools;
  R.mainX=R.navX+R.navW+g; R.mainW=R.queueX-(R.queueW>0?g:0)-R.mainX;
  var topH=R.top.bottom-R.top.y;
  R.libraryScales=ssLibraryScales(W,H);
  M.cpad=Math.round(ssLibraryPadding(W)*ssDensity);
  M.artSz=Math.round(Math.max(72*ssDensity,Math.min(110*ssDensity,topH*.25)));
  M.headH=Math.round(66*ssDensity+M.artSz);SHEAD=M.headH;
  var navTopH=Math.round(M.navTopH*ssDensity);
  R.navTop={x:R.navX,y:top0,w:R.navW,h:navTopH};
  R.navLib={x:R.navX,y:top0+navTopH+g,w:R.navW,h:topH-navTopH-g};
  R.main={x:R.mainX,y:top0,w:R.mainW,h:topH};
  R.queue={x:R.queueX,y:top0,w:R.queueW,h:topH};
  if(contentOnly)return;
  // frameless; the title-bar strip minus our 3 buttons becomes an OS caption (drag/dbl-click)
  if(UIWizard){ try{ UIWizard.FrameStyle=3; UIWizard.MoveStyle=0; UIWizard.DisableWindowSizing=false; }catch(e){} }
  capW=-1; applyCaption();
  applyKeyMode();
}
// bitmaps are keyed by geometry; and the panel's surface is rebuilt, so the next paint must be full
function on_size(w,h){
  if(!(w>0&&h>0)){w=window.Width;h=window.Height;}
  ssMeterHidden=!(w>0&&h>0);if(ssMeterHidden)ssStopMeterTimer();
  if(w>0&&h>0)ssClampWindowSize(w,h);
  if(w<400||h<200)return;
  if(typeof ssAbortResize==='function')ssAbortResize();
  if(W!==w||H!==h){ssRightForced=false;ssHideLyrics();}
  W=w;H=h;layout();ssDropModalImage();ssDropSceneImage();
  plCardCache={};artCardCache={};artCardN=0;skelImgs={};dirtyAll=true;ssReportLayout();window.Repaint();
}

// name/count come from the per-playlist caches, not fresh interop: this runs on every paint of the playlist view
function activePl(){ var i=plman.ActivePlaylist; return {i:i, name:i>=0?plName(i):'', count:i>=0?plCount(i):0}; }
function updateNP(){
  var m=(fb.IsPlaying||fb.IsPaused)?fb.GetNowPlaying():null;
  NP=m;ssMeterPaused=!m||fb.IsPaused;
  npTitleStr=m?TF.npTitle.EvalWithMetadb(m):'';
  npArtistStr=m?TF.npArtist.EvalWithMetadb(m):'';
}
function repaintBar(){ if(fsMode){ repaintAll(); return; } markDirty(); dirtyBar=true; window.RepaintRect(0,R.barY,W,M.barH); }

/* Only frames that actually redraw main may settle the shimmer -- a bar-only repaint (the 1Hz
   clock) would otherwise count zero skeletons and stop the animation while one is on screen. */
var ssLibraryFonts=new Map();
function ssDrawScaledLibrary(gr,draw,scale,main){
  if(!scale||scale===1){draw(gr);return;}
  var fonts=FONT,density=ssDensity,padding=M.cpad,art=M.artSz,header=M.headH;
  var scaled=ssLibraryFonts.get(scale);
  if(!scaled){
    scaled={};
    for(var name in fonts)scaled[name]=ssFsFont(fonts[name],scale);
    ssLibraryFonts.set(scale,scaled);
  }
  FONT=scaled;ssDensity=scale;
  if(main){
    M.cpad=Math.round(padding*scale);
    M.artSz=Math.round(art*scale);
    M.headH=SHEAD=Math.round(header*scale);
  }
  try{draw(gr);}
  finally{FONT=fonts;ssDensity=density;M.cpad=padding;M.artSz=art;M.headH=SHEAD=header;}
}
function drawLibraryNav(gr){
  ssDrawScaledLibrary(gr,function(g){ssDrawPaneLabels(g,drawNav);},R.libraryScales&&R.libraryScales.nav,false);
}
function drawMainCounted(gr){
  ssMeterCell=null;shimCount=0; gateWaiting=0;
  var scales=R.libraryScales;
  var scale=scales&&['songs','playlist','artist','album','albums','stats','settings','favorites','history','later'].indexOf(view)>=0?scales.main:1;
  if(scales&&view==='home'&&W>=1600)scale=scales.main;
  if(view==='search'&&typeof ssSearchScale==='function')scale=ssSearchScale(R.main);
  ssDrawScaledLibrary(gr,function(g){ssDrawPaneLabels(g,drawMain);},scale,view!=='search'); roundTop(gr,R.main.x,R.main.y,R.main.w);
  if(typeof ssDrawPersonalRowActions==='function')ssDrawPersonalRowActions(gr);
  roundBottom(gr,R.main.x,R.main.y,R.main.w,R.main.h);
  shimSettle();
}
function drawDesktopBar(gr){
  ssDrawScaledLibrary(gr,drawBar,R.barScale,false);
}
function ssDrawBase(gr){
  HB_DOTS=[];gr.FillSolidRect(0,0,W,H,COL.black);
  drawTitleBar(gr);drawMainCounted(gr);drawLibraryNav(gr);ssDrawPaneLabels(gr,drawQueue);drawDesktopBar(gr);ssDrawResizers(gr);
}
function on_paint(gr){
  var meterOnly=ssPaintFrame(gr);
  ssSyncMeterTimer();
  if(meterOnly){
    var box=ssMeterFocusBox;
    if(ssKeyboardFocus&&box&&ssTouchesMeter({x:box.x0,y:box.y0,w:box.x1-box.x0,h:box.y1-box.y0}))ssPaintFocusBox(gr,box);
    return;
  }
  ssMeterFocusBox=null;
  if(typeof ssScheduleAccessibility==='function')ssScheduleAccessibility();
  if(ssKeyboardFocus&&ssKeyboardAvailable()){
    var focus=ssKeyboardTargets().find(function(t){return t.id===ssKeyboardFocus;});
    if(focus){ssMeterFocusBox=focus.box;ssPaintFocusBox(gr,focus.box);}
  }
  if(!ssModal&&!ssPopup&&!fsMode&&!confirmDel&&!renameEdit&&!dupPrompt&&!rgPrompt&&!(typeof ssTrackInfo!=='undefined'&&ssTrackInfo))ssDrawResizers(gr);
  if(typeof ssTrackInfo!=='undefined'&&ssTrackInfo&&typeof drawTrackInfo==='function')drawTrackInfo(gr);
}
var ssMeterFocusBox=null;
function ssPaintFocusBox(gr,b){
  var rSm=typeof ssRad==='function'?ssRad('sm'):4;
  ssStrokeContinuousRect(gr,b.x0+1,b.y0+1,b.x1-b.x0-2,b.y1-b.y0-2,rSm,rSm,2,COL.green);
}
function ssPaintFrame(gr){
  if(typeof ssPaintControlDamage==='function'&&ssPaintControlDamage(gr))return;
  if(ssPaintMeterDamage(gr))return true;
  if(ssSelectionDirty&&!dirtyAll&&!anyDirty()&&ssSceneImage&&!ssModal&&!ssPopup&&!fsMode){
    ssPaintInteractions(gr);return;
  }
  if(ssHoverDirty&&!dirtyAll&&!anyDirty()&&ssSceneImage&&!fsMode&&!ssModal&&!ssPopup&&
     !renameEdit&&!confirmDel&&!dupPrompt&&!rgPrompt&&!sgMenuOpen&&!plSortMenuOpen){
    ssPaintInteractions(gr);return;
  }
  if(!ssPopup)ssSyncLyricPanel();
  visPlCache=null;   // one playlist scan per frame, shared by drawNav and drawHome
  gr.SetSmoothingMode(2);
  gr.SetInterpolationMode(5);   // NearestNeighbor: every DrawImage here is 1:1, so filtering is pure cost
  if(ssPopupRestore){
    ssPopupRestore=false;
    if(!fsMode&&!ssPopup&&!ssModal&&ssSceneImage){
      gr.DrawImage(ssSceneImage,0,0,W,H,0,0,W,H);window.SetTimeout(repaintAll,32);return;
    }
  }
  if(ssModal){var modalFull=dirtyAll||anyDirty();clearDirty();ssPaintModal(gr,modalFull);return;}
  if(ssPopup){clearDirty();ssPaintPopup(gr);return;}
  var stale=anyDirty() && (Date.now()-dirtySince)>DIRTY_STALE_MS;   // see markDirty
  if(fsMode&&!ssModal){
    /* A visualizer frame changes only the bars. Redrawing the cover, the title, the seek bar and
       the whole transport underneath them 30 times a second was most of the frame's cost, so a
       frame flagged ONLY by the viz repaints just that band. Any other flag (or a paint we did not
       ask for) still takes the full path, so nothing can be left stale behind the bars. */
    var vizOnly=dirtyViz && !stale && fsView==='viz' && !dirtyAll && !dirtyBar && !dirtyMain
                && !dirtyNav && !dirtyQueue && !dirtySearch && !dirtyTitle;
    clearDirty();
    if(vizOnly){ drawVizBand(gr); return; }
    HB_DOTS=[]; drawFullscreen(gr); return;
  }
  var anyPartial=dirtyBar||dirtyQueue||dirtySearch||dirtyMain||dirtyNav||dirtyTitle||dirtyPanes;
  // A partial paint skips drawOverlays, so a modal's dim backdrop would not be reapplied over the
  // region it redraws (the bar's 1 Hz repaint would flash back to full brightness). While an
  // overlay owns the screen, every paint takes the full path.
  var modal=ssPopup||renameEdit||confirmDel||dupPrompt||rgPrompt;
  if(dirtyAll || !anyPartial || modal || stale || !ssSceneImage){ // full paint, or an OS/stale paint we can't scope
    clearDirty();
    var baseGraphics=ssBeginScene();ssDrawBase(baseGraphics);ssEndScene(gr,baseGraphics);ssPaintInteractions(gr,true);
    drawOverlays(gr);
    ssDrawTransitions(gr);ssDrawPopup(gr);
    return;
  }
  // partial composite: only the regions actually flagged (each drawn over live content)
  var regions=[];
  if(dirtyTitle)regions.push({x:0,y:0,w:W,h:TBH});
  if(dirtyPanes)regions.push({x:0,y:R.top.y,w:W,h:R.top.bottom-R.top.y});
  else{
    if(dirtyMain||dirtySearch)regions.push(R.main);
    if(dirtyNav)regions.push({x:R.navTop.x,y:R.navTop.y,w:R.navLib.w,h:R.navLib.y+R.navLib.h-R.navTop.y});
    if(dirtyQueue)regions.push(R.queue);
  }
  if(dirtyBar)regions.push({x:0,y:R.barY,w:W,h:M.barH});
  var targetGraphics=gr;gr=ssBeginScene();
  if(dirtyTitle){ dirtyTitle=false; drawTitleBar(gr); }
  if(dirtyMain||dirtyNav||dirtyPanes) HB_DOTS=[];   // these rebuild their hover targets
  if(dirtyPanes){
    dirtyPanes=dirtyMain=dirtyNav=dirtyQueue=dirtySearch=false;
    gr.SetSmoothingMode(3);gr.FillSolidRect(0,R.top.y,W,R.top.bottom-R.top.y,COL.black);gr.SetSmoothingMode(2);
    drawMainCounted(gr);drawLibraryNav(gr);ssDrawPaneLabels(gr,drawQueue);
  }
  if(dirtyMain){ dirtyMain=false; drawMainCounted(gr); }
  if(dirtyNav){ dirtyNav=false; drawLibraryNav(gr); }
  if(dirtyQueue){ dirtyQueue=false; ssDrawPaneLabels(gr,drawQueue); }
  if(dirtySearch){
    dirtySearch=false;
    if(view==='search')ssDrawScaledLibrary(gr,function(g){drawSearchBox(g,R.main);},ssSearchScale(R.main),false);
  }
  if(dirtyBar){ dirtyBar=false; drawDesktopBar(gr); }
  ssEndScene(targetGraphics,gr,regions);gr=targetGraphics;ssPaintInteractions(gr,regions);
  ssDrawTransitions(gr);
  ssDrawResizers(gr);
}

function drawMain(gr){
  if(typeof ssScrollGeometry!=='undefined'){delete ssScrollGeometry.scroll;delete ssScrollGeometry.scrollh;}
  if(typeof HB_PERSONAL_ACTIONS!=='undefined')HB_PERSONAL_ACTIONS=[];
  HB_PLPLAY=[];HB_PLAYLIST_PLAY=null;HB_SONGS_PLAY=null;HB_ARTIST_PLAY=null;HB_ALBUM_BACK=null;
  HB_CARD=[]; HB_TR=[]; SB=null; SBH=null;SS_ARTIST_HB=null;   // clear stale click targets from the previous view
  if(view!=='songs'){ HB_SG=null; SG_HB=[]; HB_RGNORM=null; }
  if(view!=='playlist'){ HB_PLSORT=null; HB_PLSORTDIR=null; PL_SORT_HB=[]; }
  applyKeyMode();
  if(view==='search') startCaret(); else stopCaret();
  var r=R.main; panelBg(gr,r,COL.base);
  if(view==='home'){ drawHome(gr,r); return; }
  if(view==='search'){ drawSearch(gr,r); return; }
  if(view==='stats'){drawStats(gr,r);return;}
  if(view==='settings'&&typeof drawSettings==='function'){drawSettings(gr,r);return;}
  if(view==='artist'||view==='album'){ssSyncCollection();drawArtist(gr,r);return;}
  if(view==='albums'){drawAlbums(gr,r);return;}
  if(view==='songs'){ drawSongs(gr,r); return; }
  if(typeof ssIsPersonal==='function'&&ssIsPersonal(view)){drawPersonal(gr,r);return;}
  drawPlaylist(gr,r);
}

/* ------------------------- input ------------------------- */
function seekFrac(x){ return HB_SEEK?clamp01((x-HB_SEEK.x)/HB_SEEK.w):0; }
function applyVol(x){ if(HB_VOL){ fb.Volume=pos2vol(clamp01((x-HB_VOL.x)/HB_VOL.w)); repaintBar(); } }
function setQueueScroll(y){if(!SS_QUEUE_SB)return;var s=SS_QUEUE_SB;ssQueueScroll=ssQueueScrollT=Math.round(sbFrac(y,s.top,s.h,s.thumbH)*s.maxPx);repaintQueue();}
function ssActivateHeaderPlay(target){
    if(target.album!==undefined)playAlbum(target.album);
    else if(target.artist!==undefined)playArtist(target.artist);
    else if(target.library)playLibrary();
    else playPlaylist(target.pl);
}
function ssHeaderPlayAt(x,y){if(HB_ARTIST_PLAY&&inRect(x,y,HB_ARTIST_PLAY))return HB_ARTIST_PLAY;return HB_SONGS_PLAY&&inRect(x,y,HB_SONGS_PLAY)?HB_SONGS_PLAY:hit(HB_PLPLAY,x,y)||(HB_PLAYLIST_PLAY&&inRect(x,y,HB_PLAYLIST_PLAY)?HB_PLAYLIST_PLAY:null);}
function ssRowPlayAt(x,y){
  var row=hit(HB_TR,x,y);
  return row&&(row.playVisible||row.playOnHover)&&x>=row.pgx0&&x<row.pgx1?row:null;
}
function on_mouse_lbtn_down(x,y){
  if(ssKeyboardFocus){ssKeyboardFocus='';applyKeyMode();repaintAll();}
  ssPlaylistPlayDown=ssTrackPlayDown=ssRowMoreDown=null;
  ssPlaylistPickDown=null;
  ssLyricPlayDown=false;
  if(ssPopup)return;
  if(typeof ssTrackInfo!=='undefined'&&ssTrackInfo)return;
  if(ssPointerDown(x,y)) return;
  if(fsMode){
    if(fsView==='stats'&&ssStatsPointerDown(x,y))return;
    if(HB_SEEK&&inRect(x,y,HB_SEEK)){drag='seek';dragFrac=seekFrac(x);repaintBar();}
    else if(HB_VOL&&inRect(x,y,HB_VOL)){drag='vol';applyVol(x);}
    else if(fsView==='stats'&&SB&&inRect(x,y,SB)){drag='scroll';setScroll(y);}
    return;
  }
  if(confirmDel||renameEdit||sgMenuOpen||plSortMenuOpen||dupPrompt||rgPrompt) return;
  if(view==='stats'&&ssStatsPointerDown(x,y))return;
  if(!fsMode&&typeof ssPersonalPointerDown==='function'&&ssPersonalPointerDown(x,y))return;
  if(!fsMode){var playTarget=ssHeaderPlayAt(x,y);if(playTarget){ssPlaylistPlayDown=playTarget;return;}}
  if(ssResizeBegin(x,y))return;
  if(!fsMode&&rightTab==='lyrics'&&typeof SS_LYRIC_PLAY!=='undefined'&&SS_LYRIC_PLAY&&inRect(x,y,SS_LYRIC_PLAY)){ssLyricPlayDown=true;return;}
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ drag='seek'; dragFrac=seekFrac(x); repaintBar(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ drag='vol'; applyVol(x); return; }
  if(SS_QUEUE_SB&&inRect(x,y,SS_QUEUE_SB)){drag='scrollq';setQueueScroll(y);return;}
  var qAct=fsMode?null:ssQueueActionAt(x,y);if(qAct){ssQueueActionDown=qAct;return;}
  if(SBH && inRect(x,y,SBH)){ drag='scrollh'; setScrollH(x); return; }
  if(SBN && inRect(x,y,SBN)){ drag='scrolln'; setScrollN(y); return; }
  if(SB && inRect(x,y,SB)){ drag='scroll'; setScroll(y); return; }
  var card=hit(HB_CARD,x,y);if(card&&card.kind==='album')return;
  var moreRow=fsMode?null:hit(HB_TR,x,y);
  if(moreRow&&moreRow.more&&inRect(x,y,moreRow.more)){ssRowMoreDown={view:view,id:moreRow.playId};return;}
  var trackButton=fsMode?null:ssRowPlayAt(x,y);
  if(trackButton&&!utils.IsKeyPressed(17)){ssTrackPlayDown={view:view,id:trackButton.playId};return;}
  var navRow=!fsMode&&utils.IsKeyPressed(17)&&!hit(HB_DOTS,x,y)&&hit(HB_PL,x,y);
  if(navRow){ssPlaylistPickDown=ssPlaylistInfo(navRow.i)||{};return;}
  ssSelectionDown(x,y);
}
function on_mouse_rbtn_up(x,y){
  if(ssPopup){ssClosePopup();return true;}
  if(ssModal||fsMode) return true;
  if(confirmDel||renameEdit||dupPrompt||rgPrompt) return true;   // a modal is open: swallow
  var i;
  for(i=0;i<HB_TR.length;i++)if(inRect(x,y,HB_TR[i])){
    var row=HB_TR[i];
    return ssBatchTrackMenu(row,x,y);
  }
  for(i=0;i<HB_CARD.length;i++)if(HB_CARD[i].kind==='artist'&&inRect(x,y,HB_CARD[i])){ssArtistMenu(HB_CARD[i].id,x,y);ssSetContextTargets([HB_CARD[i]]);return true;}
  for(i=0;i<HB_Q.length;i++)if(inRect(x,y,HB_Q[i])&&HB_Q[i].track_id){ssOpenQueueMenu(HB_Q[i],x,y);return true;}
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ openPlaylistMenu(HB_PL[i].i,x,y); return true; } }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i]) && HB_CARD[i].kind==='pl'){ openPlaylistMenu(HB_CARD[i].id,x,y); return true; } }
  return false;   // elsewhere: let JSplitter's own panel menu through (Reload / Configure / Properties)
}
function playHandleList(handles,idx){
  var arr=[]; for(var i=0;i<handles.length;i++) arr.push(handles[i]);
  var hl=fb.CreateHandleList();
  for(i=0;i<arr.length;i++) hl.Add(arr[i]);
  var pi=plman.FindOrCreatePlaylist(ROUTE,true);
  try{ plman.ClearPlaylist(pi); }catch(e){}
  plman.InsertPlaylistItems(pi,0,hl,false);
  plman.ActivePlaylist=pi; invalidateItems();
  playPlaylistItem(pi,idx);
}
function playArtistTrack(block,idx){
  var al=artistAlbums[block]; if(!al) return;
  var hs=[]; for(var i=0;i<al.tracks.length;i++) hs.push(al.tracks[i].handle);
  playHandleList(hs,idx);
}
function getSearchIdx(){
  if(searchIdx)return searchIdx;
  var list=ssCatalogHandles(),i;
  var out=[];
  if(list.Count){
    var titles=TF.title.EvalWithMetadbs(list),artists=TF.artist.EvalWithMetadbs(list),albums=TF.album.EvalWithMetadbs(list),lengths=TF.len.EvalWithMetadbs(list),ly=[];
    try{ly=fb.TitleFormat('$if2(%lyrics%,$if2(%unsynced lyrics%,$if2(%unsyncedlyrics%,%syncedlyrics%)))').EvalWithMetadbs(list);}catch(e){}
    for(i=0;i<list.Count;i++)out.push({id:list[i].Path+'|'+list[i].SubSong,h:list[i],title:titles[i],artist:artists[i],album:albums[i],len:lengths[i],lyrics:ly[i]||'',key:(titles[i]+' '+artists[i]+' '+albums[i]).toLowerCase()});
  }
  searchIdx=out;return out;
}

function computeSearch(){
  var q=searchQuery.trim().toLowerCase();
  if(q===searchQ2) return;
  searchQ2=q; searchArts=[]; searchTrks=[];ssScheduleSearch(q);
  if(!q) return;
  var arts=getArtistList(), i;
  for(i=0;i<arts.length && searchArts.length<24;i++){ if(arts[i].name.toLowerCase().indexOf(q)>=0) searchArts.push(arts[i]); }
  var idx=getSearchIdx(), cnt=0;
  for(i=0;i<idx.length && cnt<150;i++){ if(idx[i].key.indexOf(q)>=0){ searchTrks.push(idx[i]); cnt++; } }
}
function doCtrl(act,button){
  if(fsMode&&(act==='lyrics'||act==='viz')){doFsAct(act);return;}
  if(act==='lyrics'||act==='queue'){ssSetRightPane(act,!(ssRightOpen&&rightTab===act&&R.queue&&R.queue.w>0));return;}
  else if(act==='favorite')ssPersonalNow('favorites');
  else if(act==='later')ssPersonalNow('later');
  else if(act==='play') ssPlayOrPause();
  else if(act==='next') ssSend('next');
  else if(act==='prev') ssSend('previous');
  else if(act==='playback_mode') ssShowPlaybackModes(Math.max(8,W-320),R.barY,button);
  else if(act==='preference') ssOpen();
  else if(act==='output') ssShowOutputs(Math.max(0,W-350),R.barY,button);
  else if(act==='scan_pause') ssSend('scan_pause',{paused:!(ssState&&ssState.scan&&ssState.scan.paused)});
  else if(act==='scan_retry') ssSend('scan_retry');
  else if(act==='restart') ssSend('restart');
  else if(act==='fullscreen'){if(fsMode)exitFullscreen();else enterFullscreen();return;}
  repaintAll();
}
function on_mouse_lbtn_up(x,y){
  var playlistPressed=ssPlaylistPlayDown,trackPressed=ssTrackPlayDown,queuePressed=ssQueueActionDown,morePressed=ssRowMoreDown;
  var playlistPick=ssPlaylistPickDown;ssPlaylistPickDown=null;
  var lyricPlay=ssLyricPlayDown;ssLyricPlayDown=false;
  ssPlaylistPlayDown=ssTrackPlayDown=ssQueueActionDown=ssRowMoreDown=null;
  if(ssRecycleClick(x,y))return;
  if(!fsMode&&!trackPressed&&!ssPopup&&!ssModal&&SS_ARTIST_HB&&inRect(x,y,SS_ARTIST_HB)){ssArtistMenu(viewArtist,x,y);return;}
  if(ssResizeEnd(x,y))return;
  if(ssPopupClick(x,y))return;
  if(ssPointerUp(x,y)) return;
  if(typeof ssStatsPointerUp==='function'&&ssStatsPointerUp(x,y))return;
  var t;
  if(fsMode){
    if(drag==='seek'){if(fb.PlaybackLength>0)fb.PlaybackTime=fb.PlaybackLength*dragFrac;drag=null;repaintAll();return;}
    if(drag==='vol'||drag==='scroll'){drag=null;return;}
    if(HB_VIZ&&inRect(x,y,HB_VIZ)){ssShowVizStyles(HB_VIZ);return;}
    if((t=hit(HB_FS,x,y)))doFsAct(t.act,t.album);
    else if((t=hit(HB_CTRL,x,y)))doCtrl(t.act,t);
    return;
  }
  if(typeof ssPersonalPointerUp==='function'&&ssPersonalPointerUp(x,y))return;
  if(lyricPlay){
    if(!fsMode&&!NP&&rightTab==='lyrics'&&R.queue&&R.queue.w>0&&SS_LYRIC_PLAY&&inRect(x,y,SS_LYRIC_PLAY))doCtrl('play');
    return;
  }
  if(playlistPick){
    var navRow=!fsMode&&!ssModal&&!drag&&hit(HB_PL,x,y), info=navRow&&ssPlaylistInfo(navRow.i);
    if(info&&info.guid===playlistPick.guid&&!hit(HB_DOTS,x,y)){
      if(ssPickedPlaylists.has(info.guid))ssPickedPlaylists.delete(info.guid);
      else ssPickedPlaylists.add(info.guid);
      repaintNav();
    }
    return;
  }
  if(morePressed){
    var moreAgain=fsMode?null:hit(HB_TR,x,y);
    if(!drag&&!ssModal&&view===morePressed.view&&moreAgain&&moreAgain.more&&moreAgain.playId===morePressed.id&&inRect(x,y,moreAgain.more))ssBatchTrackMenu(moreAgain,moreAgain.more.x0,moreAgain.more.y1);
    return;
  }
  if(queuePressed){
    var again=fsMode?null:ssQueueActionAt(x,y);
    if(!drag&&!ssModal&&again&&again.scope===queuePressed.scope&&
       again.queueIndex===queuePressed.queueIndex&&again.track_id===queuePressed.track_id)ssOpenQueueMenu(again,again.more.x0,again.more.y1);
    return;
  }
  if(typeof ssSelectOwner!=='undefined'&&ssSelectOwner&&ssSelectionUp(x,y))return;
  if(playlistPressed){
    if(drag||fsMode||ssPopup||ssModal||!inRect(x,y,playlistPressed))return;
    var target=ssHeaderPlayAt(x,y);
    if(!target||target.pl!==playlistPressed.pl||target.library!==playlistPressed.library||
       target.artist!==playlistPressed.artist||target.album!==playlistPressed.album)return;
    ssActivateHeaderPlay(target);
    return;
  }
  if(ssSelectionUp(x,y))return;
  if(trackPressed){
    var rowButton=ssRowPlayAt(x,y);
    if(!fsMode&&!drag&&!utils.IsKeyPressed(17)&&view===trackPressed.view&&rowButton&&rowButton.playId===trackPressed.id)playRow(rowButton);
    return;
  }
  if(SS_LYRIC_BTN && inRect(x,y,SS_LYRIC_BTN)){ ssNativeLyrics(); return; }
  // ---- modal overlays first ----
  if(dupPrompt){
    if(DUP_HB && inRect(x,y,DUP_HB.skip)) dupSkip(); else dupKeep();   // "Add anyway"/outside: leave as-is
    return;
  }
  if(rgPrompt){
    if(RG_HB && inRect(x,y,RG_HB.scan)){ rgConfirmScan(); return; }
    rgPrompt=null; repaintAll(); return;      // cancel / click outside
  }
  if(confirmDel){
    if(CONF_HB && inRect(x,y,CONF_HB.del)){ doDeletePlaylist(confirmDel.pl); return; }
    confirmDel=null; repaintAll(); return;   // cancel / click outside
  }
  if(renameEdit){
    if(RENAME_HB){
      if(inRect(x,y,RENAME_HB.save)){ if(RENAME_HB.canSave) commitRename(); return; }
      if(inRect(x,y,RENAME_HB.cancel)){ cancelRename(); return; }
      if(inRect(x,y,RENAME_HB.panel)) return;     // click inside the dialog: keep it open
    }
    cancelRename(); return;                        // click on backdrop: dismiss
  }
  if((t=hit(HB_DOTS,x,y))){ openPlaylistMenu(t.pl,t.mx,t.my); return; }
  if(drag==='seek'){ if(fb.PlaybackLength>0) fb.PlaybackTime=fb.PlaybackLength*dragFrac; drag=null; repaintAll(); return; }
  if(drag==='vol'){ drag=null; return; }
  if(drag==='scroll'||drag==='scrollh'||drag==='scrolln'||drag==='scrollq'){
    var wasH=(drag==='scrollh'); drag=null;
    if(wasH){ plScrollT=snapShelf(plScroll); startScrollAnim(); }   // release the thumb -> settle on a boundary
    repaintAll(); return;
  }
  // an open dropdown is modal-ish: any click either picks an item or closes it
  if(sgMenuOpen){
    if((t=hit(SG_HB,x,y))){ setSongsGroup(t.v); return; }
    sgMenuOpen=false; repaintAll(); return;
  }
  if(HB_SG && inRect(x,y,HB_SG)){ sgMenuOpen=true; repaintAll(); return; }
  if(HB_RGNORM && inRect(x,y,HB_RGNORM)){ rgToggle(); return; }
  if(plSortMenuOpen){
    if((t=hit(PL_SORT_HB,x,y))){ setPlSort(t.v); return; }
    plSortMenuOpen=false; repaintAll(); return;
  }
  if(HB_PLSORT && inRect(x,y,HB_PLSORT)){ plSortMenuOpen=true; repaintAll(); return; }
  if(HB_PLSORTDIR && inRect(x,y,HB_PLSORTDIR)){ togglePlSortDir(); return; }
  if(typeof ssTrackInfoClick==='function'&&ssTrackInfoClick(x,y))return;
  if(y<TBH){
    if(typeof HB_TOP_ACTIONS!=='undefined'&&(t=hit(HB_TOP_ACTIONS,x,y))){
      if(t.act==='appearance'){var nextMode=(typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark')?'light':'dark';ssSend('theme_appearance',{appearance:nextMode});}
      else if(t.act==='settings'&&typeof ssOpenSettings==='function')ssOpenSettings(false);
      return;
    }
    if((t=hit(HB_MENU,x,y))){ openMenu(t.root,t.mx,TBH); return; }
    if((t=hit(HB_CAP,x,y)))ssWindowControl(t.act);
    return;
  }
  if(view==='settings'&&typeof ssSettingsClick==='function'&&ssSettingsClick(x,y))return;
  if((t=hit(HB_TABS,x,y))){ssSetRightPane(t.tab,true);return;}
  if((t=hit(HB_CTRL,x,y))){ doCtrl(t.act,t); return; }
  if(HB_HOME && inRect(x,y,HB_HOME)){ ssAdvanceHomeRecommendation(); view='home'; repaintAll(); return; }
  if(view==='home'&&typeof ssHomeActionAt==='function'&&(t=ssHomeActionAt(x,y))){ssActivateHomeAction(t);return;}
  if(ssActivateLibraryAt(x,y))return;
  if((t=hit(HB_PL,x,y))){ ssPickedPlaylists.clear(); plman.ActivePlaylist=t.i; firstRow=firstRowT=0; view='playlist'; repaintAll(); return; }
  if((t=hit(HB_Q,x,y)))return;
  // Keep the lyric hit and legacy row action for lists with a hover-only play glyph.
  if((t=hit(HB_TR,x,y))){
    if(utils.IsKeyPressed(17))return;
    if((t.srch&&searchTrks[t.idx].reason==='歌词')||(!t.playVisible&&!t.playOnHover&&t.pgx1!==undefined&&x>=t.pgx0&&x<t.pgx1))playRow(t);
    return;
  }
}
function ssActivateLibraryAt(x,y){
  var t;
  if(typeof HB_ARTISTS_NAV!=='undefined'&&HB_ARTISTS_NAV&&inRect(x,y,HB_ARTISTS_NAV)){view='songs';setSongsGroup('artist');songsScroll=songsScrollT=0;repaintAll();return true;}
  if(typeof HB_STATS_NAV!=='undefined'&&HB_STATS_NAV&&inRect(x,y,HB_STATS_NAV)){ssStatsOpen();return true;}
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)){ view='search'; repaintAll(); return true; }
  if(HB_ALBUMS&&inRect(x,y,HB_ALBUMS)){if(view!=='albums'){view='albums';artScroll=artScrollT=0;}repaintAll();return true;}
  if(HB_ALBUM_BACK&&inRect(x,y,HB_ALBUM_BACK)){ssBackFromAlbum();repaintAll();return true;}
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)){ if(view!=='songs'){ view='songs'; songsScroll=songsScrollT=0; } if(songsGroup==='artist')setSongsGroup('none'); repaintAll(); return true; }
  if(typeof HB_PERSONAL!=='undefined'&&(t=hit(HB_PERSONAL,x,y))){ssOpenPersonal(t.kind);return true;}
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)){ var np=createNewPlaylist(); plman.ActivePlaylist=np; revealPlaylist(np); firstRow=firstRowT=0; view='playlist'; repaintAll(); return true; }
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)){ addFilesToPl(plman.ActivePlaylist); return true; }
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)){ addFolderToPl(plman.ActivePlaylist); return true; }
  if((t=hit(HB_CARD,x,y))){
    if(t.kind==='pl'){ plman.ActivePlaylist=t.id; firstRow=firstRowT=0; view='playlist'; }
    else if(t.kind==='album')ssOpenAlbum(t.id);
    else loadArtist(t.id);
    repaintAll(); return true;
  }
  return false;
}
function playRow(t){
  if(t.personal){ssEnqueueRow(t);}
  else if(t.srch){ssPlaySearchHit(t.idx);}
  else if(t.songs) playSongsRow(t.ti);
  else if(t.lib) playArtistTrack(t.block,t.idx);
  else playPlaylistItem(t.pl,t.item);
  repaintAll();
}
// Double-click inserts this song at the head of the user queue and starts it.
function on_mouse_lbtn_dblclk(x,y){
  if(ssPopup||ssModal||fsMode||utils.IsKeyPressed(17)||ssRowPlayAt(x,y))return;
  var moreDbl=hit(HB_TR,x,y);if((moreDbl&&moreDbl.more&&inRect(x,y,moreDbl.more))||ssQueueActionAt(x,y))return;
  if(fsMode||confirmDel||renameEdit||sgMenuOpen||plSortMenuOpen||dupPrompt||rgPrompt) return;
  if(typeof ssPersonalActionAt==='function'&&ssPersonalActionAt(x,y))return;
  var t=hit(HB_TR,x,y);
  if(t&&!(t.srch&&searchTrks[t.idx].reason==='歌词')) ssEnqueueRow(t);
  else if(!t&&(t=hit(HB_Q,x,y))){rightTab='queue';if(t.scope==='priority')playQueueItem(t.queueIndex);else if(t.track_id)ssSend('play_id',{track_id:t.track_id});else playQueueNext(t.pl,t.item);repaintAll();}
}
function hoverSig(x,y){
  if(!fsMode){
    if(view==='home'&&typeof ssHomeActionAt==='function'){var homeAction=ssHomeActionAt(x,y);if(homeAction)return homeAction.focus;}
    if(typeof HB_ARTISTS_NAV!=='undefined'&&HB_ARTISTS_NAV&&inRect(x,y,HB_ARTISTS_NAV))return 'artists-nav';
    if(typeof HB_STATS_NAV!=='undefined'&&HB_STATS_NAV&&inRect(x,y,HB_STATS_NAV))return 'stats-nav';
  }
  if(!fsMode){if(HB_ARTIST_PLAY&&inRect(x,y,HB_ARTIST_PLAY))return 'artist-play-header';if(HB_SONGS_PLAY&&inRect(x,y,HB_SONGS_PLAY))return 'library-play-header';if(HB_PLAYLIST_PLAY&&inRect(x,y,HB_PLAYLIST_PLAY))return 'playlist-play-header';var playlistPlay=hit(HB_PLPLAY,x,y);if(playlistPlay)return 'playlist-play-'+playlistPlay.pl;}
  var i;
  if(fsMode){
    if(HB_VIZ && inRect(x,y,HB_VIZ)) return 'vzb';
    if((i=hitIdx(HB_FS,x,y))>=0) return 'f'+i;      // fullscreen icons: hover feedback, same as anywhere
    if((i=hitIdx(HB_CTRL,x,y))>=0)return 'ctrl'+i;
    if(fsView==='stats'&&(i=hitIdx(HB_STATS,x,y))>=0)return 'stats'+i;
    return '';
  }
  if(dupPrompt){ if(DUP_HB){ if(inRect(x,y,DUP_HB.skip)) return 'dps'; if(inRect(x,y,DUP_HB.keep)) return 'dpk'; } return 'dp'; }
  if(renameEdit){ if(RENAME_HB){ if(inRect(x,y,RENAME_HB.save)) return 'rns'; if(inRect(x,y,RENAME_HB.cancel)) return 'rnc'; } return 'rn'; }
  if(rgPrompt){ if(RG_HB){ if(inRect(x,y,RG_HB.scan)) return 'rgs'; if(inRect(x,y,RG_HB.cancel)) return 'rgc'; } return 'rg'; }
  if(confirmDel){ if(CONF_HB && inRect(x,y,CONF_HB.del)) return 'cfd'; if(CONF_HB && inRect(x,y,CONF_HB.cancel)) return 'cfc'; return 'cf'; }
  if(sgMenuOpen){ i=hitIdx(SG_HB,x,y); return (i<0)?'sg':('sg'+i); }
  if(plSortMenuOpen){ i=hitIdx(PL_SORT_HB,x,y); return (i<0)?'ps':('ps'+i); }
  if((i=hitIdx(HB_DOTS,x,y))>=0) return 'd'+i;
  if(y<TBH){
    if((i=hitIdx(HB_MENU,x,y))>=0) return 'mnu'+i;
    if((i=hitIdx(HB_CAP,x,y))>=0)return 'cap'+i;
    return '';
  }
  if(typeof SS_QUEUE_SB!=='undefined'&&SS_QUEUE_SB&&inRect(x,y,SS_QUEUE_SB))return 'sbq';
  if(SBH && inRect(x,y,SBH)) return 'sbh';
  if(SBN && inRect(x,y,SBN)) return 'sbn';
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)) return 'addpl';
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)) return 'pladdf';
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)) return 'pladdd';
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)) return 'als';
  if(HB_ALBUMS&&inRect(x,y,HB_ALBUMS))return 'albums-nav';
  if(HB_ALBUM_BACK&&inRect(x,y,HB_ALBUM_BACK))return 'album-back';
  if(typeof HB_PERSONAL!=='undefined'&&(i=hitIdx(HB_PERSONAL,x,y))>=0)return 'personal-nav-'+i;
  if(SS_ARTIST_HB && inRect(x,y,SS_ARTIST_HB))return 'artistverify';
  if(HB_SG && inRect(x,y,HB_SG)) return 'sgb';
  if(HB_RGNORM && inRect(x,y,HB_RGNORM)) return 'nzb';
  if(HB_PLSORT && inRect(x,y,HB_PLSORT)) return 'psb';
  if(HB_PLSORTDIR && inRect(x,y,HB_PLSORTDIR)) return 'psd';
  if(view==='stats'){var iStats=hitIdx(HB_STATS,x,y);if(iStats>=0)return 'stats-'+iStats;}
  if(SB && inRect(x,y,SB)) return 'sb';
  if((i=hitIdx(HB_CTRL,x,y))>=0) return 'c'+i;
  if((i=hitIdx(HB_TABS,x,y))>=0) return 't'+i;
  if(!fsMode&&rightTab==='lyrics'){
    if(typeof SS_LYRIC_PLAY!=='undefined'&&SS_LYRIC_PLAY&&inRect(x,y,SS_LYRIC_PLAY))return 'lyrics-play';
    if(typeof SS_LYRIC_BTN!=='undefined'&&SS_LYRIC_BTN&&inRect(x,y,SS_LYRIC_BTN))return 'lyrics-component';
  }
  if(HB_HOME && inRect(x,y,HB_HOME)) return 'h';
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)) return 's';
  if((i=hitIdx(HB_CARD,x,y))>=0) return 'k'+i;
  if((i=hitIdx(HB_PL,x,y))>=0) return 'p'+HB_PL[i].i;
  if((i=hitIdx(HB_Q,x,y))>=0){
    var row=HB_Q[i];
    return 'q'+i+(row.more&&inRect(x,y,row.more)?'-more':'');
  }
  if((i=hitIdx(HB_TR,x,y))>=0){
    var favorite=HB_TR[i].favoriteAction;
    return 'r'+i+(favorite&&inRect(x,y,favorite)?'-favorite':'');
  }
  return '';
}
function on_mouse_move(x,y,mask){
  mx=x; my=y;
  if(ssResizeMove(x,y))return;
  if(ssPopupMove(x,y))return;
  if(ssPointerMove(x,y)) return;
  if(drag==='seek'){ dragFrac=seekFrac(x); repaintBar(); return; }
  if(drag==='vol'){ applyVol(x); return; }
  if(drag==='scroll'){ setScroll(y); return; }
  if(drag==='scrollh'){ setScrollH(x); return; }
  if(drag==='scrolln'){ setScrollN(y); return; }
  if(drag==='scrollq'){setQueueScroll(y);return;}
  if(fsMode){
    var fullSig=hoverSig(x,y);
    if(fullSig!==hoverKey){hoverKey=fullSig;repaintAll();}
    return;
  }
  if(ssSelectionMove(x,y,mask))return;
  if(typeof ssUpdateControlHover==='function')ssUpdateControlHover();
  var sig=hoverSig(x,y), sk=scrollSection(x,y), z=hoverZone(x,y);
  if(sig!==hoverKey || sk!==scrollKey){   // sk change reveals/hides the section scrollbar
    var localSig=/^(r\d+(?:-favorite)?|q\d+|sb[hqn]?|)$/;
    var localOnly=localSig.test(sig)&&localSig.test(hoverKey);
    var rowChanged=sig!==hoverKey&&(/^[rq]\d/.test(sig)||/^[rq]\d/.test(hoverKey));
    hoverKey=sig; scrollKey=sk;
    // an overlay owns the whole screen and on_paint forces a full paint while one is open
    if(fsMode||renameEdit||confirmDel||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen) repaintAll();
    else if(localOnly&&!fsMode&&ssSceneImage){if(rowChanged)ssRequestRowHover();}
    else { repaintZone(hoverZoneKey); if(z!==hoverZoneKey) repaintZone(z); }   // clear the old highlight, then draw the new
  }
  hoverZoneKey=z;
}
// which scrollable section the cursor is over (so entering/leaving reveals the hover scrollbar even over gaps)
function scrollSection(x,y){
  if(R.queue&&rightTab==='queue'&&x>=R.queue.x&&x<R.queue.x+R.queue.w&&y>=R.queue.y&&y<R.queue.y+R.queue.h)return 'queue';
  if(R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h) return 'nav';
  if(R.main && x>=R.main.x && x<R.main.x+R.main.w+16 && y>=R.main.y && y<R.main.y+R.main.h){
    if(view==='home') return (y>=HOME_SHELF_Y0 && y<HOME_SHELF_Y1+16)?'shelf':'arts';
    if(view==='playlist') return 'pl';
    if(view==='songs') return 'songs';
    if(view==='search') return 'srch';
    if(view==='stats')return 'stats';
    if(view==='artist'||view==='albums'||view==='album')return 'collection';
    if(typeof ssIsPersonal==='function'&&ssIsPersonal(view))return 'personal';
  }
  return '';
}
function on_mouse_leave(){
  ssMenuLeave();
  mx=-1; my=-1;
  if(typeof ssUpdateControlHover==='function')ssUpdateControlHover();
  if(fsMode){if(hoverKey){hoverKey='';repaintAll();}return;}
  if(hoverKey!==''||scrollKey!==''){
    var wasRow=/^(?:r\d+(?:-favorite)?|q\d+)$/.test(hoverKey),wasRail=/^(?:sb[hqn]?)?$/.test(hoverKey);hoverKey=''; scrollKey='';
    if(renameEdit||confirmDel||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen) repaintAll();
    else if(wasRow&&ssSceneImage&&!fsMode)ssRequestRowHover();
    else if(!wasRail||!ssSceneImage)repaintZone(hoverZoneKey);
  }
  hoverZoneKey='';
}
var ssKeyboardFocus='';
function ssKeyboardTargets(){
  var targets=[],occurrences=new Map();
  function add(kind,box,id){
    if(!box||box.x1<=box.x0||box.y1<=box.y0)return;
    var key=kind+':'+id,count=occurrences.get(key)||0;
    occurrences.set(key,count+1);
    targets.push({kind:kind,box:box,id:count?key+'#'+count:key});
  }
  if(fsMode){for(var b of HB_FS)add('stage',b,b.act);add('viz',HB_VIZ,'styles');}
  else{
    for(var menu of HB_MENU)add('topMenu',menu,menu.root);
    for(var cap of HB_CAP)add('window',cap,cap.act);
    add('libraryHome',HB_HOME,'home');
    add('library',HB_SEARCH,'search');
    add('library',HB_ALLSONGS,'songs');
    add('library',HB_ALBUMS,'albums');
    if(typeof HB_ARTISTS_NAV!=='undefined')add('library',HB_ARTISTS_NAV,'artists');
    if(typeof HB_STATS_NAV!=='undefined')add('library',HB_STATS_NAV,'stats');
    if(typeof HB_PERSONAL!=='undefined')for(var personal of HB_PERSONAL)add('library',personal,personal.kind);
    add('library',HB_ADDPL,'newPlaylist');
    if(view==='playlist'){
      add('library',HB_PLADD_FILES,'files');
      add('library',HB_PLADD_FOLDER,'folder');
    }
    for(var card of HB_CARD)add('library',card,'card:'+card.kind+':'+card.id);
    for(var nav of HB_PL)add('playlist',nav,nav.i);
    if(view==='home'){add('home',HB_HOME_CONTINUE,'primary');add('home',HB_HOME_ALBUMS,'albums');}
    add('library',HB_ALBUM_BACK,'albumBack');
    add('headerPlay',HB_PLAYLIST_PLAY,'playlist');
    add('headerPlay',HB_ARTIST_PLAY,'artist');
    add('headerPlay',HB_SONGS_PLAY,'songs');
    for(var b of HB_TR){
      if(view==='playlist')add('track',b,b.pl+':'+b.item+':'+b.playId);
      else add('playRow',b,[b.playId,b.block,b.idx,b.ti,b.track_id].join(':'));
      if(b.more)add('rowMenu',b.more,[b.pl,b.item,b.block,b.idx,b.ti].join(':'));
    }
    if(R.queue.w>0)for(var tab of HB_TABS)add('tab',tab,tab.tab);
    if(rightTab==='queue'&&R.queue.w>0)for(var b of HB_Q)add('queue',b,ssQueueRowKey(b)+':'+(b.queueIndex===undefined?b.item:b.queueIndex)+':'+b.track_id);
  }
  if((fsMode?fsView:view)==='stats')for(var stat of HB_STATS)add('stat',stat,stat.label||stat.tab||stat.action);
  if(!fsMode)for(var action of HB_PERSONAL_ACTIONS)add('personalAction',action,[action.kind,action.page,action.track_id,action.settings,action.retry].join(':'));
  for(var b of HB_CTRL)add('control',b,b.act);
  if(fb.PlaybackLength>0)add('slider',HB_SEEK,'seek');
  add('slider',HB_VOL,'volume');
  return targets;
}
function ssKeyboardAvailable(){
  return !(ssModal||ssPopup||confirmDel||renameEdit||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen||drag);
}
function ssFocusKey(key){
  if(!ssKeyboardAvailable()||![9,13,37,38,39,40].includes(key))return false;
  if((fsMode?fsView:view)==='stats'&&ssStats.edit)return false;
  var list=ssKeyboardTargets(),i=list.findIndex(function(t){return t.id===ssKeyboardFocus;}),target=list[i];
  if(key===9&&list.length){
    var back=utils.IsKeyPressed(16);
    ssKeyboardFocus=list[((i<0?(back?0:-1):i)+(back?-1:1)+list.length)%list.length].id;
    applyKeyMode();repaintAll();return true;
  }
  if(!target)return false;
  var b=target.box;
  if(target.kind==='slider'&&key>=37&&key<=40){
    var step=key===38||key===39?1:-1;
    if(b===HB_SEEK)fb.PlaybackTime=Math.max(0,Math.min(fb.PlaybackLength,fb.PlaybackTime+5*step));
    else fb.Volume=pos2vol(clamp01(vol2pos(fb.Volume)+step*0.04));
    repaintBar();return true;
  }
  if(key===13){
    if(target.kind==='stage')doFsAct(b.act,b.album);
    else if(target.kind==='control')doCtrl(b.act,b);
    else if(target.kind==='topMenu')openMenu(b.root,b.mx,TBH);
    else if(target.kind==='window')ssWindowControl(b.act);
    else if(target.kind==='viz')ssShowVizStyles(b);
    else if(target.kind==='rowMenu'){
      var row=HB_TR.find(function(r){return r.more===b;});
      if(row)ssBatchTrackMenu(row,b.x0,b.y1);
    }
    else if(target.kind==='stat'||target.kind==='personalAction'){
      var x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2;
      if(target.kind==='stat'){ssStatsPointerDown(x,y);ssStatsPointerUp(x,y);}
      else{ssPersonalPointerDown(x,y);ssPersonalPointerUp(x,y);}
    }
    else if(target.kind==='playRow')playRow(b);
    else if(target.kind==='headerPlay')ssActivateHeaderPlay(b);
    else if(target.kind==='libraryHome'){ssAdvanceHomeRecommendation();view='home';repaintAll();}
    else if(target.kind==='library')ssActivateLibraryAt((b.x0+b.x1)/2,(b.y0+b.y1)/2);
    else if(target.kind==='playlist'){ssPickedPlaylists.clear();plman.ActivePlaylist=b.i;firstRow=firstRowT=0;view='playlist';repaintAll();}
    else if(target.kind==='tab')ssSetRightPane(b.tab,true);
    else if(target.kind==='home')ssActivateHomeAction(b);
    else if(target.kind==='track')ssSend('play',{playlist:b.pl,item:b.item});
    else if(target.kind==='queue')ssOpenQueueMenu(b,b.x0,b.y1);
    return true;
  }
  if((key===38||key===40)&&utils.IsKeyPressed(18)&&(target.kind==='track'||target.kind==='queue')){
    var track=target.kind==='track',delta=key===38?-1:1;
    if(track)ssMainSelectionContext();else ssQueueSelectionContext(b);
    var source=track?ssMainRows:ssQueueRows,at=track?ssMainRowIndex(b):b.queueIndex,to=at+delta;
    if(!ssSelectContext.writable||!Number.isInteger(at)||to<0||to>=source.length||ssFlight||ssOut.length)return true;
    ssCommitSelectionOrder(track?ssMainSelect:ssQueueSelect,{key:ssSelectContext.key,indices:[at],targetIndex:to});
    ssKeyboardFocus=track?'track:'+b.pl+':'+to+':'+b.playId:'queue:'+ssQueueRowKey(b)+':'+to+':'+b.track_id;
    var visible=track?HB_TR:HB_Q.filter(function(r){return r.scope===b.scope;});
    if(visible.length&&(delta<0&&visible[0]===b||delta>0&&visible[visible.length-1]===b)){
      if(track)firstRow=firstRowT=clampPx(firstRow+delta*b.rowH,PL_MAXPX);
      else ssQueueScroll=ssQueueScrollT=clampPx(ssQueueScroll+delta*b.rowH,SS_QUEUE_MAX);
    }
    repaintAll();return true;
  }
  return false;
}
function on_key_down(key){
  if(ssRecycleKey(key)||ssPopupKey(key)||ssKeyDown(key))return;
  if(ssFocusKey(key))return;
  if(fsMode){
    if(key===27){
      if(fsView==='stats'){if(!ssStatsInput(key))doFsAct('stats-back');}
      else exitFullscreen();
    }
    return;
  }
  if(typeof ssTrackInfo!=='undefined'&&ssTrackInfo){if(key===27&&typeof ssCloseTrackInfo==='function')ssCloseTrackInfo();return;}
  if(key===27&&view==='settings'){view=typeof ssSettingsBackView==='string'&&ssSettingsBackView?ssSettingsBackView:'home';repaintAll();return;}
  if(typeof ssHomeKey==='function')ssHomeKey(key);
}
function on_focus(focused){ssMeterFocused=focused;ssSyncMeterTimer();if(!focused&&ssKeyboardFocus){ssKeyboardFocus='';applyKeyMode();repaintAll();}if(!focused&&typeof ssHomeFocus!=='undefined'&&ssHomeFocus){ssHomeFocus='';if(view==='home')repaintMain();}}
function on_char(code){
  if(ssPopup)return;
  if(ssModal) return;
  if(confirmDel)return;
  if((fsMode?fsView:view)==='stats'&&ssStatsInput(code))return;
  if(fsMode){if(code===32)ssPlayOrPause();return;}
  if(renameEdit){
    if(code===8) renameEdit.text=renameEdit.text.slice(0,-1);
    else if(code===27){ cancelRename(); return; }              // Esc = cancel
    else if(code===13){ commitRename(); return; }              // Enter = commit
    else if(code>=32) renameEdit.text+=String.fromCharCode(code);
    caretOn=true; repaintAll(); return;
  }
  if(view==='search'){
    if(code===8) searchQuery=searchQuery.slice(0,-1);
    else if(code===27) searchQuery='';
    else if(code>=32) searchQuery+=String.fromCharCode(code);
    searchScroll=searchScrollT=0; caretOn=true; repaintAll();   // keep caret solid right after a keystroke
    return;
  }
  /* Space = play/pause, the way every media player behaves. Deliberately after the two cases
     above: in Search and while renaming a playlist a space is a character the user meant to
     type, not a transport command. A modal owns the keyboard while it is open, so Space must
     not reach playback from underneath one either. */
  if(code===32 && !confirmDel && !dupPrompt && !rgPrompt &&
     !sgMenuOpen && !plSortMenuOpen){
    try{ ssPlayOrPause(); }catch(e){}
  }
}
function ssWheelStep(){return Math.max(20,Math.round(WHEEL_PX*ssDensity));}
function on_mouse_wheel(step){
  if(ssPopupWheel(step))return;
  if(ssModal) return;
  if(fsMode){
    if(fsView==='stats'){ssStatsScrollT=clampPx(ssStatsScrollT-step*ssWheelStep(),ssStatsMax);startScrollAnim();return;}
    // lyrics with no timestamps don't roll themselves, so here the wheel scrolls them; with nothing
    // to scroll (synced, short enough to fit, or another view) it stays the volume control
    if(fsView==='lyrics' && !ssLyricVisible && lyStWheel(step)){ repaintAll(); return; }
    fb.Volume=pos2vol(clamp01(vol2pos(fb.Volume)+step*0.04)); repaintAll(); return;
  }
  // right pane: same deal on the Lyrics tab. Consume the wheel either way -- it belongs to this
  // panel, and falling through would scroll the playlist behind the pointer.
  if(R.queue && rightTab==='lyrics' && mx>=R.queue.x && mx<R.queue.x+R.queue.w && my>=R.queue.y && my<R.queue.y+R.queue.h){
    if(lyStWheel(step)) repaintQueue();
    return;
  }
  if(R.queue&&rightTab==='queue'&&mx>=R.queue.x&&mx<R.queue.x+R.queue.w&&my>=R.queue.y&&my<R.queue.y+R.queue.h){ssQueueScrollT=clampPx(ssQueueScrollT-step*ssWheelStep(),SS_QUEUE_MAX);startScrollAnim();return;}
  if(R.navLib && mx>=R.navLib.x && mx<R.navLib.x+R.navLib.w && my>=R.navLib.y && my<R.navLib.y+R.navLib.h){
    navScrollT=clampPx(navScrollT-step*ssWheelStep(),NAV_MAX); startScrollAnim(); return;
  }
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){
    if(HOME_PLMAX>0&&my>=HOME_SHELF_Y0&&my<HOME_SHELF_Y1){
      var nextShelf=snapShelf(plScrollT-step*Math.max(ssWheelStep(),HOME_STRIDE||0));
      if(nextShelf!==plScrollT){plScrollT=nextShelf;startScrollAnim();return;}
    }
    homeScrollT=clampPx(homeScrollT-step*Math.round(ssWheelStep()*1.7),HOME_MAXROW);
    startScrollAnim();
    return;
  }
  else if(view==='stats'){ssStatsScrollT=clampPx(ssStatsScrollT-step*ssWheelStep(),ssStatsMax);startScrollAnim();return;}
  else if(view==='settings'&&typeof ssSettingsScrollT!=='undefined'){ssSettingsScrollT=clampPx(ssSettingsScrollT-step*ssWheelStep(),SS_SETTINGS_MAX);startScrollAnim();return;}
  else if(view==='songs'){ songsScrollT=clampPx(songsScrollT-step*ssWheelStep(),SONGS_MAXPX); startScrollAnim(); return; }
  else if(view==='search'){ searchScrollT=clampPx(searchScrollT-step*ssWheelStep(),SEARCH_MAXPX); startScrollAnim(); return; }
  else if(view==='artist'||view==='albums'||view==='album'){artScrollT=clampPx(artScrollT-step*ssWheelStep(),SS_COLLECTION_SCROLL_MAX);startScrollAnim();return;}
  else if(typeof ssIsPersonal==='function'&&ssIsPersonal(view)){ssPersonalScrollT=clampPx(ssPersonalScrollT-step*ssWheelStep(),SS_PERSONAL_MAX);startScrollAnim();return;}
  firstRowT=clampPx(firstRowT-step*ssWheelStep(),PL_MAXPX); startScrollAnim();
}
/* ---- drag & drop external files: two targets, the library section (-> new playlist) and the
   playlist view body (-> appends to it); everywhere else denies. We never see the dropped paths
   (DropTargetAction is write-only), so we name a destination and the component does the insert. */
function overLib(x,y){ return !!R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h; }
// body of the playlist view -> index of the playlist to append to, or -1 if that's not a valid target
function plDropTarget(x,y){
  if(fsMode || view!=='playlist' || !R.main) return -1;
  if(x<R.main.x || x>=R.main.x+R.main.w || y<R.main.y || y>=R.main.y+R.main.h) return -1;
  var i=plman.ActivePlaylist;
  if(i<0 || plman.IsPlaylistLocked(i)) return -1;   // autoplaylists etc. can't take manual inserts
  return i;
}
function dragUpdate(action,x,y){
  if(ssModal||ssPopup||fsMode){ action.Effect=0; return; }
  var ext=!action.IsInternal;                        // ignore drags started inside the skin
  var onLib=ext && overLib(x,y), onPl=!onLib && ext && plDropTarget(x,y)>=0;
  if(onLib||onPl) action.Effect=(action.Effect&1)?1:((action.Effect&4)?4:0);  // prefer copy, else link
  else action.Effect=0;                                                        // deny elsewhere
  setDropHover(onLib,onPl);
}
// repaint only the section whose cue changed -- drag-over fires on every mouse move
function setDropHover(onLib,onPl){
  if(onLib!==navDropHover){ navDropHover=onLib; repaintNav(); }
  if(onPl!==plDropHover){ plDropHover=onPl; repaintMain(); }
}
function on_drag_enter(action,x,y,mask){
  ssMeterFileDrag=true;ssStopMeterTimer();dragUpdate(action,x,y);
}
function on_drag_over(action,x,y,mask){ dragUpdate(action,x,y); }
function on_drag_leave(){ssMeterFileDrag=false;setDropHover(false,false);ssSyncMeterTimer();}
function on_drag_drop(action,x,y,mask){
  ssMeterFileDrag=false;
  if(ssModal||ssPopup||fsMode){ action.Effect=0; return; }
  var ext=!action.IsInternal, hit=ext&&(action.Effect&5), pi=hit?plDropTarget(x,y):-1;   // 5 = copy|link
  if(hit && overLib(x,y)){
    var np=createNewPlaylist();
    action.Playlist=np; action.Base=0; action.ToSelect=true;            // component drops the files into it
    action.Effect=(action.Effect&1)?1:4;
    plman.ActivePlaylist=np; revealPlaylist(np); firstRow=firstRowT=0; view='playlist';
  } else if(pi>=0){
    plman.UndoBackup(pi);                                              // so ctrl+Z undoes the import
    armDupWatch(pi);                                                   // snapshot before the component inserts
    action.Playlist=pi; action.Base=plman.PlaylistItemCount(pi); action.ToSelect=true;   // append at end
    action.Effect=(action.Effect&1)?1:4;
  } else action.Effect=0;
  navDropHover=false; plDropHover=false; repaintAll();
}
function on_script_unload(){
  ssMeterFocused=false;ssStopMeterTimer();
  ssStopFooterMarquee();ssInvalidateSelections();ssAbortResize();
  ssStopCovers();ssStatsStop();
  ssHideLyrics();
  ssStop();if(typeof ssStopPersonal==='function')ssStopPersonal();if(ssSearchTimer)window.ClearTimeout(ssSearchTimer);
  stopLyAnim(); stopCaret(); stopViz(); stopScrollAnim(); stopShimAnim(); stopMemWatch();
  if(dupWatch && dupWatch.timer) window.ClearTimeout(dupWatch.timer);
}
function invalidateLibrary(){
  ssSearchCatalog='';ssSearchQuery='';ssSearchRequest='';
  ssInvalidateCatalog(); coverPickCache={}; warmed={}; searchIdx=null; searchQ2=null;
  songsIdx=null; songsRows=null; songsTracks=null; libCovCache=null; libCount_=-1;
  libItems_=null; libTFCache={};   // everything above is derived from these
  rgStat=null; rgScanFailed=false;
  warmJob=null; jobs={};           // anything in flight refers to the old library
  gates={}; rowGate={}; shelfHandles=null; artsGating=false;   // every section re-gates
}
function libChanged(){ invalidateLibrary(); artCardCache={}; artCardN=0; repaintAll(); }
function on_library_items_added(handles){ libChanged();ssQueueMedia(handles||libItems(),false,true); }
function on_library_items_removed(){ libChanged(); }
function on_library_items_changed(handles){ libChanged();if(handles)ssQueueMedia(handles,true,true); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){
  var entering=!NP;
  updateNP();
  if(entering&&NP&&!fsMode)ssBeginPlaybackReveal();
  repaintAll();
}
function npChanged(){ updateNP(); repaintAll(); }
function on_playback_dynamic_info_track(){ npChanged(); }
function on_playback_stop(reason){ if(reason===2)return;ssHideLyrics();npChanged(); }
function on_playback_pause(){ npChanged(); }
function on_playback_time(){
  repaintBar();
  var lyricsShown=fsMode?fsView==='lyrics':rightTab==='lyrics'&&R.queue&&R.queue.w>0;
  if(lyricsShown && !ssLyricVisible && lyrics && lyrics!=='none' && lyrics.synced){ var c=currentLyricLine(); if(c!==lyCur){ lyCur=c; startLyAnim(); } }
}
function on_playback_seek(){ repaintAll(); }
function on_playback_order_changed(){ syncOrderFromFb(); repaintAll(); }
function on_playback_queue_changed(){ repaintAll(); }
function on_volume_change(){ repaintBar(); }
// ReplayGain can also be switched from foobar's own Playback menu -- keep the pill honest
function on_replaygain_mode_changed(){ repaintMain(); }
// rgStat included: a ReplayGain scan lands as a tag write, so this is how the pill learns it finished
function on_metadb_changed(handles,fromhook){ if(fromhook) return;qMetaCache={};ssInvalidateSearch(); ssInvalidateCatalog(); invalidateItems(); albKeyCache={}; hueCache={}; artistCandCache={}; coverPickCache={}; songsIdx=null; songsRows=null; songsTracks=null; rgStat=null; updateNP(); repaintAll(); }
/* A switch changes which playlist is ACTIVE, not what any playlist contains -- and every cache
   invalidateItems() drops is keyed by playlist index, so none of them went stale here. Dropping
   them meant each switch re-derived covers and re-ran the art gates against an artCache that had
   since evicted those albums: the view fell back to its skeleton and the artwork reloaded. The
   caches that genuinely depend on playlist CONTENT are still cleared by the callbacks that mean
   content changed (items added/removed/reordered, playlists changed). */
function on_playlist_switch(){ firstRow=firstRowT=0; repaintAll(); }
function on_playlists_changed(){ ssInvalidateSelections();ssInvalidateSearch();ssInvalidateCatalog();invalidateItems(); repaintAll(); }
function on_playlist_items_added(pl){
  ssInvalidateSelections();ssInvalidateSearch();invalidateItems();
  if(!isHiddenPl(plName(pl))){
    ssInvalidateCatalog();
    ssQueueMedia(plman.GetPlaylistItems(pl),false,true);
  }
  if(dupWatch&&dupWatch.pl===pl)scheduleDupScan();
  repaintAll();
}
function on_playlist_items_removed(pl){ ssInvalidateSelections();ssInvalidateSearch();invalidateItems();if(!(pl>=0&&pl<plman.PlaylistCount)||!isHiddenPl(plName(pl)))ssInvalidateCatalog();repaintAll(); }
function on_playlist_items_reordered(){ ssInvalidateSelections();invalidateItems(); repaintAll(); }
function on_item_focus_change(){ repaintAll(); }

layout();
updateNP();
syncOrderFromFb();   // Mode is owned by the native component; loading a theme never changes it.
capVolume();       // pull a remembered volume back under the slider's ceiling
startMemWatch();   // caches grow into the component's spare memory and back off as it fills
drpSync();         // make foo_verdant agree with the Discord property before anything plays

ssLoadArtists();ssStart();
ssStartCovers();
console.log('Smart Shuffle Chinese Verdant 1.0.23 ready');
