/* verdant/ui/chrome.js -- window chrome + shared widgets: title bar, scrollbars, panels, overlays, menus
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Custom window title bar via UI Wizard (foo_ui_wizard) - frameless + our own controls */
var TBH=Math.round(44*UISCALE);
var UIWizard=null; try{ UIWizard=new ActiveXObject('UIWizard'); }catch(e){ UIWizard=null; }
var MENUS=[['文件','file'],['编辑','edit'],['视图','view'],['播放','playback'],['音乐库','library'],['帮助','help']];
var MENU_END=0,capW=-1,capEnd=-1,capFullscreen=false;
function applyCaption(){
  if(!UIWizard)return;
  var immersive=typeof fsMode!=='undefined'&&fsMode;
  if(capW===W&&capEnd===MENU_END&&capFullscreen===immersive)return;
  try{
    var rightReserve=typeof TOP_RIGHT_W==='number'?TOP_RIGHT_W:0;
    if(immersive)UIWizard.SetCaptionAreaSize(0,0,0,0);
    else UIWizard.SetCaptionAreaSize(MENU_END,0,Math.max(0,W-MENU_END-rightReserve),TBH);
    capW=W;capEnd=MENU_END;capFullscreen=immersive;
  }catch(e){}
}
function ssConfigureChrome(){
  if(!UIWizard)return false;
  try{
    if(UIWizard.FrameStyle!==3)UIWizard.FrameStyle=3;
    UIWizard.MoveStyle=0;UIWizard.DisableWindowSizing=false;UIWizard.DisableWindowMaximizing=false;UIWizard.DarkMode=typeof SS_APPEARANCE==='undefined'||SS_APPEARANCE==='dark';
    ssApplyDefaultWindow(false);
    capW=-1;applyCaption();
    return UIWizard.FrameStyle===3&&!UIWizard.DisableWindowSizing&&!UIWizard.DisableWindowMaximizing&&capW===W;
  }catch(e){return false;}
}
function openMenu(root,x,y){ ssOpenNativeMenu('main',{root:root},x,y); }

// small hover "..." button; records a HB_DOTS target that opens the menu just below it
function drawDots(gr,cx,cy,pl){
  if(hv(cx,cy,cx+24,cy+24)) gr.FillEllipse(cx,cy,24,24,ssInk(26));
  drawIcon(gr,'more',COL.text,cx,cy,24,24,18);
  HB_DOTS.push({x0:cx-2,y0:cy-2,x1:cx+26,y1:cy+26,pl:pl,mx:cx,my:cy+26});
}
// Rounded outline. GDI+ rejects an arc bigger than half the side and centres a stroke on the
// path, so inset by the line width first, then clamp the radius to what's left.
function strokeRound(gr,x,y,w,h,rad,lw,col){
  var i=lw/2, sw=w-lw, sh=h-lw;
  if(sw<=0 || sh<=0) return;
  var a=Math.max(0,Math.min(rad-i,sw/2,sh/2));
  ssStrokeContinuousRect(gr,x+i,y+i,sw,sh,a,a,lw,col);
}
/* Draggable pixel scrollbar, hidden until its section is hovered. Thumb size comes from
   viewport vs content height, position from scrollPx/maxPx. Each scrollable view calls this
   at the end of its draw; the matching set*() maps a drag/click back to a scroll offset. */
var SB_MAIN={sw:6,min:36,track:20,on:175,off:95,key:'scroll'};
var SB_NAV ={sw:5,min:30,track:16,on:150,off:80,key:'scrolln'};
var SB_QUEUE={sw:6,min:36,track:20,on:175,off:95,key:'scrollq'};
// The scene contains the content under each scrollbar. Store only geometry so that
// crossing a rail or its reveal area can restore and redraw a narrow strip.
var ssScrollGeometry={},ssControlDamage=null,ssControlStates={},ssPaintedControls={};
function ssScrollShown(b){
  var show=b.visual.show;
  return drag===b.visual.key||(Array.isArray(show)?hv(show[0],show[1],show[2],show[3]):show);
}
function ssControlState(b){
  if(!b||!b.visual)return 0;
  var d=b.visual,hot=drag===d.key||hv(b.x0,b.y0,b.x1,b.y1);
  if(d.track!==undefined)return hot?2:0;
  return ssScrollShown(b)?(hot?2:1):0;
}
var ssControlKeys=['seek','vol','scroll','scrolln','scrollq','scrollh'];
function ssRailControl(key){
  return key==='seek'?HB_SEEK:key==='vol'?HB_VOL:ssScrollGeometry[key];
}
function ssSetScrollHit(key,b){
  if(key==='scroll')SB=b;
  else if(key==='scrolln')SBN=b;
  else if(key==='scrollh')SBH=b;
  else if(key==='scrollq')SS_QUEUE_SB=b;
}
function ssUpdateControlHover(){
  if(fsMode||!ssSceneImage||ssPopup||ssModal||renameEdit||confirmDel||rgPrompt||dupPrompt||plSortMenuOpen||sgMenuOpen)return;
  for(var i=0;i<ssControlKeys.length;i++){
    var key=ssControlKeys[i],b=ssRailControl(key);if(!b||!b.visual)continue;
    var state=ssControlState(b);
    if(b.visual.show!==undefined)ssSetScrollHit(key,state?b:null);
    if(state===(ssControlStates[key]||0))continue;
    ssControlStates[key]=state;
    var r=b.visual.bounds;if(!ssControlDamage)ssControlDamage={};ssControlDamage[key]=r;
    window.RepaintRect(r.x,r.y,r.w,r.h,false);
  }
}
function ssRestoreControl(gr,r){
  gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
}
function ssRestoreHotControls(gr,sceneUpdated,rows){
  for(var key in ssPaintedControls){
    var r=ssPaintedControls[key],restored=sceneUpdated===true;
    function overlaps(p){return p&&p.x<r.x+r.w&&p.x+p.w>r.x&&p.y<r.y+r.h&&p.y+p.h>r.y;}
    var b=ssRailControl(key);
    if(!restored&&b&&b.visual&&b.visual.bounds===r&&ssControlState(b)===ssControlStates[key]&&
       !rows.some(overlaps)&&!(sceneUpdated&&sceneUpdated.some(overlaps)))continue;
    if(!restored&&sceneUpdated)restored=sceneUpdated.some(function(p){
      return p&&p.x<=r.x&&p.y<=r.y&&p.x+p.w>=r.x+r.w&&p.y+p.h>=r.y+r.h;
    });
    if(!restored)ssRestoreControl(gr,r);
    delete ssPaintedControls[key];
  }
}
function ssPaintHotControls(gr,only){
  if(!ssSceneImage||fsMode)return;
  for(var i=0;i<ssControlKeys.length;i++){
    var key=ssControlKeys[i];if(ssPaintedControls[key]||(only&&!only[key]))continue;
    var b=ssRailControl(key),state=ssControlState(b);
    ssControlStates[key]=state;
    if(!state)continue;
    if(b.visual.show!==undefined)ssPaintScrollRail(gr,b,state);
    else ssPaintTrackRail(gr,b,true);
    ssPaintedControls[key]=b.visual.bounds;
  }
}
function ssPaintControlDamage(gr){
  if(!ssControlDamage)return false;
  var damage=ssControlDamage;ssControlDamage=null;
  if(!ssSceneImage||fsMode||ssPopup||ssModal||renameEdit||confirmDel||rgPrompt||dupPrompt||plSortMenuOpen||sgMenuOpen)return false;
  var combined=Object.keys(damage).length>1||dirtyAll||anyDirty()||ssSelectionDirty||ssHoverDirty||ssHoverFrame||ssInteractionDamage.length||
               (typeof ssMeterDirty!=='undefined'&&ssMeterDirty);
  for(var key in damage){
    var r=damage[key];
    if(!combined)combined=ssInteractionPainted.some(function(p){
      return p.x<r.x+r.w&&p.x+p.w>r.x&&p.y<r.y+r.h&&p.y+p.h>r.y;
    });
  }
  if(combined){
    for(key in damage)ssQueueInteractionDamage(damage[key]);
    ssHoverDirty=true;return false;
  }
  for(key in damage){ssRestoreControl(gr,damage[key]);delete ssPaintedControls[key];}
  ssPaintHotControls(gr,damage);return true;
}
function ssPaintScrollRail(gr,b,state){
  if(!state)return;
  var d=b.visual,wide=state===2?d.hot:d.thin,offset=Math.floor((d.span-wide)/2);
  var color=ssInk(state===2?d.on:d.off);
  if(d.horizontal)gr.FillSolidRect(d.start,d.cross+offset,b.thumbW,wide,color);
  else gr.FillSolidRect(d.cross+offset,d.start,wide,b.thumbH,color);
}
function ssRegisterScroll(gr,b,show,key,cross,start,span,on,off,horizontal){
  var thin=Math.max(1,Math.round(2*ssDensity)),hot=Math.max(thin+1,Math.round(4*ssDensity));
  var offset=Math.floor((span-hot)/2),length=horizontal?b.thumbW:b.thumbH;
  b.visual={key:key,show:show,horizontal:horizontal,cross:cross,start:start,span:span,hot:hot,thin:thin,on:on,off:Math.round(off*.58),
    bounds:horizontal?{x:Math.floor(start),y:Math.floor(cross+offset),w:Math.ceil(length)+1,h:hot+1}
                     :{x:Math.floor(cross+offset),y:Math.floor(start),w:hot+1,h:Math.ceil(length)+1}};
  var state=ssControlState(b);
  if(ssQuietRows)ssScrollGeometry[key]=b;
  else ssPaintScrollRail(gr,b,state);
  return state?b:null;
}
function drawSBV(gr,sx,top,h,scrollPx,maxPx,viewH,contentH,show,s){
  if(contentH<=viewH||h<=6)return null;
  var thumbH=Math.min(h,Math.max(s.min,Math.round(h*viewH/contentH)));
  var ty=top+(maxPx>0?Math.round((h-thumbH)*scrollPx/maxPx):0);
  var b={x0:sx-6,y0:top,x1:sx+s.sw+6,y1:top+h,top:top,h:h,thumbH:thumbH,maxPx:maxPx};
  return ssRegisterScroll(gr,b,show,s.key,sx,ty,s.sw,s.on,s.off,false);
}
function drawScrollbar(gr,sx,top,h,sp,mp,vh,ch,show){ SB=drawSBV(gr,sx,top,h,sp,mp,vh,ch,show,SB_MAIN); }
function drawScrollbarN(gr,sx,top,h,sp,mp,vh,ch,show){ SBN=drawSBV(gr,sx,top,h,sp,mp,vh,ch,show,SB_NAV); }
function sbFrac(v,start,size,thumb){ return clamp01((v-start-thumb/2)/Math.max(1,size-thumb)); }
// scroll + target are set together so the easing animation doesn't fight the drag
function setScroll(y){
  if(!SB) return;
  var px=Math.round(sbFrac(y,SB.top,SB.h,SB.thumbH)*SB.maxPx);
  if(fsMode){if(fsView==='stats'){ssStatsScroll=ssStatsScrollT=px;repaintAll();}return;}
  if(view==='playlist') firstRow=firstRowT=px;
  else if(view==='home') homeScroll=homeScrollT=px;
  else if(view==='songs') songsScroll=songsScrollT=px;
  else if(view==='search') searchScroll=searchScrollT=px;
  else if(view==='stats') ssStatsScroll=ssStatsScrollT=px;
  else if(view==='artist'||view==='albums'||view==='album')artScroll=artScrollT=px;
  else if(typeof ssIsPersonal==='function'&&ssIsPersonal(view))ssPersonalScroll=ssPersonalScrollT=px;
  repaintMain();
}
function setScrollN(y){ if(!SBN) return; navScroll=navScrollT=Math.round(sbFrac(y,SBN.top,SBN.h,SBN.thumbH)*SBN.maxPx); repaintNav(); }

function drawScrollbarH(gr,sx,top,w,scrollX,maxX,viewW,contentW,show){
  if(contentW<=viewW||w<=6){SBH=null;return;}
  var sh=5,thumbW=Math.min(w,Math.max(40,Math.round(w*viewW/contentW)));
  var tx=sx+(maxX>0?Math.round((w-thumbW)*scrollX/maxX):0);
  var b={x0:sx,y0:top-6,x1:sx+w,y1:top+sh+6,left:sx,w:w,thumbW:thumbW,maxPx:HOME_PLMAX};
  SBH=ssRegisterScroll(gr,b,show,'scrollh',top,tx,sh,175,95,true);
}
function setScrollH(x){   // free pixel scrolling; target set with it so the easing doesn't fight the drag
  if(!SBH) return;
  plScroll=plScrollT=Math.round(sbFrac(x,SBH.left,SBH.w,SBH.thumbW)*SBH.maxPx); repaintAll();
}

/* ------------------------- paint ------------------------- */
/* FillRoundRect rasterises an antialiased path over the panel's whole area -- ~1.7Mpx for the
   main panel, on every repaint of every panel, and it showed up as ~8ms of each frame that no
   content loop accounted for. A flat fill plus four cached corner stamps avoids that cost, while retaining the
   same continuous corners as the controls and cover masks.
   The stamps use the surrounding canvas color. */
function panelBg(gr,r,c){
  var rad=M.radius; if(!CORN) CORN=buildCorners(rad);
  gr.FillSolidRect(r.x,r.y,r.w,r.h,c);
  gr.DrawImage(CORN.tl,r.x,r.y,rad,rad,0,0,rad,rad);
  gr.DrawImage(CORN.tr,r.x+r.w-rad,r.y,rad,rad,0,0,rad,rad);
  gr.DrawImage(CORN.bl,r.x,r.y+r.h-rad,rad,rad,0,0,rad,rad);
  gr.DrawImage(CORN.br,r.x+r.w-rad,r.y+r.h-rad,rad,rad,0,0,rad,rad);
}
// carve rounded corners over already-drawn square content: blit black corner masks (no clip API)
var CORN=null;
function buildCorners(rad){
  var specs={tl:[0,0],tr:[-rad,0],bl:[0,-rad],br:[-rad,-rad]}, q={}, key;
  for(key in specs){
    var im=gdi.CreateImage(rad,rad), g=im.GetGraphics(); g.FillSolidRect(0,0,rad,rad,COL.black); im.ReleaseGraphics(g);
    var mk=gdi.CreateImage(rad,rad), mg=mk.GetGraphics();
    mg.FillSolidRect(0,0,rad,rad,RGB(0,0,0)); mg.SetSmoothingMode(2); ssFillContinuousRect(mg,specs[key][0],specs[key][1],rad*2,rad*2,rad,rad,RGB(255,255,255));
    mk.ReleaseGraphics(mg); im.ApplyMask(mk); q[key]=im;
  }
  return q;
}
// carve only the top corners, where a square gradient/band overrides panelBg's rounding
function roundTop(gr,x,y,w){
  var rad=M.radius; if(!CORN) CORN=buildCorners(rad);
  gr.DrawImage(CORN.tl,x,y,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.tr,x+w-rad,y,rad,rad,0,0,rad,rad,0,255);
}
function roundBottom(gr,x,y,w,h){
  var rad=M.radius; if(!CORN) CORN=buildCorners(rad);
  gr.DrawImage(CORN.bl,x,y+h-rad,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.br,x+w-rad,y+h-rad,rad,rad,0,0,rad,rad,0,255);
}

/* ---- modal dialogs: dim backdrop + drop-shadowed rounded panel, and a capsule button ---- */
function modalPanel(gr,cw,ch,cy){
  gr.FillSolidRect(0,0,W,H,COL.modalScrim||COL.scrim);
  var cx=Math.round((W-cw)/2),rLg=typeof ssRad==='function'?ssRad('lg'):12;
  ssFillContinuousRect(gr,cx-4,cy+6,cw+8,ch+6,rLg+4,rLg+4,COL.shadow);
  ssFillContinuousRect(gr,cx,cy,cw,ch,rLg,rLg,COL.popup||COL.base);
  if(typeof strokeRound==='function')strokeRound(gr,cx,cy,cw,ch,rLg,1,COL.line);
  return cx;
}
function dlgBtn(gr,x,y,w,h,label,col,hcol,txt){
  var rad=h/2;
  ssFillContinuousRect(gr,x,y,w,h,rad,rad,hv(x,y,x+w,y+h)?hcol:col);
  tC(gr,label,FONT.pl,txt,x,y,w,h);
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
// themed context menu + modal overlays, painted on top of everything
function drawOverlays(gr){
  CONF_HB=null; RENAME_HB=null; RG_HB=null;
  if(renameEdit){
    var rw=Math.min(420,W-40), rhh=196, ry0=Math.round((H-rhh)/2), rx0=modalPanel(gr,rw,rhh,ry0);
    tL(gr,'重命名歌单',FONT.sect,COL.text,rx0+28,ry0+22,rw-56,26);
    var ix=rx0+28, iyf=ry0+64, iw=rw-56, ih=46, rMd=typeof ssRad==='function'?ssRad('md'):8;
    ssFillContinuousRect(gr,ix,iyf,iw,ih,rMd,rMd,COL.input);
    if(typeof strokeRound==='function')strokeRound(gr,ix,iyf,iw,ih,rMd,1,COL.line);
    var tw3=gr.CalcTextWidth(renameEdit.text,FONT.pl);
    tL(gr,renameEdit.text,FONT.pl,COL.text,ix+14,iyf,iw-28,ih);
    if(caretOn){ var cxr=ix+14+Math.min(iw-30,tw3)+2; gr.FillSolidRect(cxr,iyf+Math.round((ih-20)/2),2,20,COL.text); }
    var canSave=renameEdit.text.replace(/^\s+|\s+$/g,'').length>0;
    var bw=118, bh=40, by=ry0+rhh-bh-22, dx=rx0+rw-28-bw, ccx=dx-14-bw;
    RENAME_HB={
      panel:{x0:rx0,y0:ry0,x1:rx0+rw,y1:ry0+rhh},
      cancel:dlgBtn(gr,ccx,by,bw,bh,'取消',COL.button,COL.buttonHover,COL.text),
      save:dlgBtn(gr,dx,by,bw,bh,'保存',canSave?COL.green:COL.accentMuted,canSave?COL.greenHover:COL.accentMuted,canSave?COL.onAccent:COL.text3),
      canSave:canSave
    };
  }
  if(confirmDel&&confirmDel.kind==='file')ssDrawRecycleConfirm(gr);
  else if(confirmDel){
    var cw=380, ch=180, cy=Math.round((H-ch)/2), cx=modalPanel(gr,cw,ch,cy);
    tL(gr,'删除此歌单？',FONT.sect,COL.text,cx+28,cy+24,cw-56,26);
    tL(gr,'将从音乐库移除歌单「'+confirmDel.name+'」。',FONT.pl,COL.text2,cx+28,cy+58,cw-56,40);
    var cbw=118, cbh=40, cby=cy+ch-cbh-22, cdx=cx+cw-28-cbw, cccx=cdx-14-cbw;
    CONF_HB={
      cancel:dlgBtn(gr,cccx,cby,cbw,cbh,'取消',COL.button,COL.buttonHover,COL.text),
      del:dlgBtn(gr,cdx,cby,cbw,cbh,'删除',COL.danger,COL.dangerHover,COL.onDanger)
    };
  }
  if(dupPrompt) drawDupPrompt(gr);
  if(rgPrompt) drawRgPrompt(gr);
}
// wrapped paragraph; returns the y just past the last line drawn
function tPara(gr,s,f,c,x,y,w,lh){
  var wr=gr.EstimateLineWrap(s,f,w);
  for(var i=0;i<wr.length;i+=2){ tL(gr,wr[i],f,c,x,y,w,lh); y+=lh; }
  return y;
}

function winMaxed(){ if(!UIWizard) return false; try{ return UIWizard.WindowState===1; }catch(e){ return false; } }
function drawWindowControls(gr){
  var left=Math.round(13*UISCALE),step=Math.round(20*UISCALE),diameter=Math.round(12*UISCALE);
  var h=Math.round(28*UISCALE),top=Math.round((TBH-h)/2),bottom=top+h;
  var hot=hv(left,top,left+3*step,bottom),symbol=Math.round(8*UISCALE);
  if((diameter-symbol)%2!==0)symbol+=symbol<diameter-2?1:-1;
  var controls=[
    ['close','windowClose',RGB(255,95,87),RGBA(224,68,62,185),RGBA(96,0,4,195)],
    ['minimize','windowMinimize',RGB(254,188,46),RGBA(218,158,28,185),RGBA(153,87,0,215)],
    ['maximize',winMaxed()?'windowRestore':'windowMaximize',RGB(40,200,64),RGBA(24,166,40,185),RGBA(0,101,0,215)]
  ];
  HB_CAP=[];
  for(var i=0;i<controls.length;i++){
    var x=left+i*step,item=controls[i],cx=x+Math.round((step-diameter)/2),cy=Math.round((TBH-diameter)/2);
    gr.FillEllipse(cx,cy,diameter,diameter,item[2]);
    if(typeof gr.DrawEllipse==='function')gr.DrawEllipse(cx,cy,diameter,diameter,0.6,item[3]);
    if(hot)drawIcon(gr,item[1],item[4],cx,cy,diameter,diameter,symbol);
    HB_CAP.push({x0:x,y0:top,x1:x+step,y1:bottom,act:item[0]});
  }
  return left+controls.length*step;
}
function ssWindowControl(act){
  if(act==='close'){fb.Exit();return;}
  if(!UIWizard)return;
  try{
    if(act==='minimize')UIWizard.WindowMinimize();
    else if(act==='maximize'){UIWizard.ToggleMaximize();repaintAll();}
  }catch(e){}
}
var HB_TOP_ACTIONS=[],TOP_RIGHT_W=0;
function drawTitleBar(gr){
  gr.FillSolidRect(0,0,W,TBH,COL.black);
  gr.FillSolidRect(0,TBH-1,W,1,COL.line);
  // menu bar (left): compact foobar File / Edit / View / Playback / Library / Help
  HB_MENU=[];HB_TOP_ACTIONS=[];
  var mx0=drawWindowControls(gr)+Math.round(10*UISCALE),pad=Math.round(22*UISCALE);
  var itemH=Math.round(28*UISCALE),itemY=Math.round((TBH-itemH)/2);
  var rTitle=typeof ssRad==='function'?ssRad('sm',UISCALE):4;
  for(var mi=0;mi<MENUS.length;mi++){
    var lbl=MENUS[mi][0],mw=Math.ceil(ssMeasureText(gr,lbl,FONT.titleMenu,TBH))+pad;
    var mhover=hv(mx0,0,mx0+mw,TBH)||(typeof ssPopup!=='undefined'&&ssPopup&&ssPopup.root===MENUS[mi][1]);
    if(mhover)ssFillContinuousRect(gr,mx0+2,itemY,mw-4,itemH,rTitle,rTitle,COL.rowHover);
    tC(gr,lbl,FONT.titleMenu,mhover?COL.text:COL.text2,mx0,0,mw,TBH);
    HB_MENU.push({x0:mx0,y0:0,x1:mx0+mw,y1:TBH,root:MENUS[mi][1],mx:mx0});
    mx0+=mw;
  }
  MENU_END=mx0;
  // right toolbar: one-click appearance toggle + in-theme Settings gear
  var btnW=Math.round(30*UISCALE),btnGap=Math.round(4*UISCALE),rightPad=Math.round(10*UISCALE),isz=Math.round(16*UISCALE);
  var needW=btnW*2+btnGap+rightPad;
  if(W-MENU_END>=needW+Math.round(24*UISCALE)){
    var setX=W-rightPad-btnW,appX=setX-btnGap-btnW;
    var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
    var appHot=hv(appX,itemY,appX+btnW,itemY+itemH);
    if(appHot)ssFillContinuousRect(gr,appX,itemY,btnW,itemH,rTitle,rTitle,COL.rowHover);
    drawIcon(gr,isDark?'sun':'moon',appHot?COL.text:COL.text2,appX,itemY,btnW,itemH,isz);
    HB_TOP_ACTIONS.push({x0:appX,y0:0,x1:appX+btnW,y1:TBH,act:'appearance'});

    var setOn=typeof view!=='undefined'&&view==='settings';
    var setHot=hv(setX,itemY,setX+btnW,itemY+itemH);
    if(setOn||setHot)ssFillContinuousRect(gr,setX,itemY,btnW,itemH,rTitle,rTitle,setOn?COL.rowActive:COL.rowHover);
    drawIcon(gr,'settings',setOn?COL.green:(setHot?COL.text:COL.text2),setX,itemY,btnW,itemH,isz);
    if(typeof ssState!=='undefined'&&ssState&&ssState.update&&ssState.update.available){
      var dot=Math.max(5,Math.round(6*UISCALE));
      gr.FillEllipse(setX+btnW-dot-3,itemY+3,dot,dot,COL.green);
    }
    HB_TOP_ACTIONS.push({x0:setX,y0:0,x1:setX+btnW,y1:TBH,act:'settings'});
    TOP_RIGHT_W=needW;
  }else TOP_RIGHT_W=0;
  applyCaption();
}

/* ---- Header dropdowns: a pill that opens a floating menu. Shared by the playlist sort-by and
   the All Songs group-by; items are [label,value] pairs and the menu is drawn last so it
   floats over the track list. ---- */
function drawDropPill(gr,x,y,w,h,label,open){
  var rMd=typeof ssRad==='function'?ssRad('md'):8;
  if(open||hv(x,y,x+w,y+h)) ssFillContinuousRect(gr,x,y,w,h,rMd,rMd,COL.rowHover);
  tL(gr,label,FONT.pl,COL.text,x+8,y,w-40,h);
  drawIcon(gr,'chevron',COL.text2,x+w-24,y+(h-18)/2,18,18,16);
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
function drawDropMenu(gr,anchor,items,cur,minW){
  var out=[];
  if(!anchor) return out;
  var bw=Math.max(minW,anchor.x1-anchor.x0), ih=40, bx=anchor.x1-bw, iy=anchor.y1+6, bh=items.length*ih+10;
  var rMd=typeof ssRad==='function'?ssRad('md'):8, rSm=typeof ssRad==='function'?ssRad('sm'):4;
  ssFillContinuousRect(gr,bx+2,iy+4,bw,bh,rMd,rMd,COL.shadow);
  ssFillContinuousRect(gr,bx,iy,bw,bh,rMd,rMd,COL.popupAlt);
  strokeRound(gr,bx,iy,bw,bh,rMd,1,COL.line);
  for(var i=0;i<items.length;i++){
    var ry=iy+5+i*ih;
    if(hv(bx,ry,bx+bw,ry+ih)) ssFillContinuousRect(gr,bx+4,ry,bw-8,ih,rSm,rSm,ssInk(20));
    tL(gr,items[i][0],FONT.pl,(items[i][1]===cur)?COL.green:COL.text,bx+18,ry,bw-30,ih);
    out.push({x0:bx,y0:ry,x1:bx+bw,y1:ry+ih,v:items[i][1]});
  }
  return out;
}

function drawSortDirBtn(gr,x,y,w,h){
  ssFillContinuousRect(gr,x,y,w,h,h/2,h/2,hv(x,y,x+w,y+h)?COL.buttonHover:COL.pill);
  drawIcon(gr,plSortDir==='asc'?'sortAsc':'sortDesc',COL.text,x,y,w,h,18);
  HB_PLSORTDIR={x0:x,y0:y,x1:x+w,y1:y+h};
}
function drawSortMenu(gr){ PL_SORT_HB=plSortMenuOpen?drawDropMenu(gr,HB_PLSORT,PL_SORTS,plSort,180):[]; }
function drawGroupMenu(gr){ SG_HB=sgMenuOpen?drawDropMenu(gr,HB_SG,SONGS_GROUPS,songsGroup,216):[]; }
