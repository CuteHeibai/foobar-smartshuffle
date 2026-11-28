/* User-sized columns. Requested widths survive small-window clamping and restarts. */
var SS_WIDTH_KEYS={nav:'SmartShuffle: library width',right:'SmartShuffle: lyrics width'};
var ssWidths={},ssResizing=null,ssResizeTimer=0,ssSplitHot='',ssLayoutReportTimer=0;
var ssResizeFlow=null,ssResizeFlowTimer=0,SS_RESIZE_MOVE_MS=110;
var ssWindowClampTimer=0;
var ssRightOpen=false,ssRightTab='lyrics',ssRightForced=false;
try{ssRightOpen=window.GetProperty('SmartShuffle: right pane open',false)===true;ssRightTab=window.GetProperty('SmartShuffle: right pane tab','lyrics')==='queue'?'queue':'lyrics';}catch(e){}
function ssSetRightPane(tab,open){
  if(tab!=='queue'&&tab!=='lyrics')return;
  ssRightTab=rightTab=tab;ssRightOpen=!!open;
  ssRightForced=ssRightOpen&&W<1000*(typeof ssDensity==='number'?ssDensity:1);
  window.SetProperty('SmartShuffle: right pane open',ssRightOpen);
  window.SetProperty('SmartShuffle: right pane tab',tab);
  if(tab==='lyrics'&&ssRightOpen){loadLyrics();lySnap=true;}else stopLyAnim();
  ssHideLyrics();layout();ssDropModalImage();ssDropSceneImage();ssSyncLyricPanel();ssReportLayout();repaintAll();
}
function ssWindowMinimum(){
  var display=ssState&&ssState.display,dpi=Number(window.DPI)||96;
  return {width:Math.min(Math.round(920*dpi/96),Number(display&&display.work_width)||Infinity),
    height:Math.min(Math.round(600*dpi/96),Number(display&&display.work_height)||Infinity)};
}
function ssApplyWindowMinimum(){
  var size=ssWindowMinimum();
  try{
    if(window.MinWidth!==size.width)window.MinWidth=size.width;
    if(window.MinHeight!==size.height)window.MinHeight=size.height;
  }catch(e){}
}
function ssClampWindowSize(w,h){
  var minimum=ssWindowMinimum();
  if((w>=minimum.width&&h>=minimum.height)||!UIWizard||ssWindowClampTimer)return;
  // UIWizard reports 0 for an ordinary restored window.
  try{if(UIWizard.WindowState!==0)return;}catch(e){return;}
  ssWindowClampTimer=window.SetTimeout(function(){
    ssWindowClampTimer=0;
    var width=window.Width,height=window.Height,size=ssWindowMinimum();
    try{
      if(UIWizard.WindowState===0&&width>0&&height>0&&(width<size.width||height<size.height))
        UIWizard.SetWindowSize(Math.max(width,size.width),Math.max(height,size.height));
    }catch(e){console.log('Smart Shuffle window minimum: '+String(e));}
  },16);
}
// Use the current monitor's work area for the initial window proportions.
function ssDefaultWindowSize(){
  var display=ssState&&ssState.display;
  if(!display)return null;
  var w=Number(display.work_width),h=Number(display.work_height);
  if(!isFinite(w)||!isFinite(h)||w<=0||h<=0)return null;
  var area=w*h*.4,ratio=Math.max(1.45,Math.min(1.85,w/h*.9));
  var width=Math.sqrt(area*ratio),height=area/width;
  if(width>w*.94){width=w*.94;height=area/width;}
  if(height>h*.94){height=h*.94;width=area/height;}
  var minimum=ssWindowMinimum();
  return {width:Math.max(minimum.width,Math.round(width)),height:Math.max(minimum.height,Math.round(height))};
}
function ssApplyDefaultWindow(force){
  if(typeof UIWizard==='undefined'||!UIWizard)return false;
  var key='SmartShuffle: proportional window initialized';
  if(!force&&window.GetProperty(key,false))return false;
  var size=ssDefaultWindowSize();if(!size)return false;
  UIWizard.ExitMaximize();UIWizard.SetWindowSize(size.width,size.height);
  var display=ssState.display;
  try{UIWizard.SetWindowPosition(Math.round(Number(display.work_left||0)+(display.work_width-size.width)/2),Math.round(Number(display.work_top||0)+(display.work_height-size.height)/2));}catch(e){}
  window.SetProperty(key,true);return true;
}
for(var ssWidthKey in SS_WIDTH_KEYS){
  var ssWidthValue=0;try{ssWidthValue=Number(window.GetProperty(SS_WIDTH_KEYS[ssWidthKey],0));}catch(e){}
  ssWidths[ssWidthKey]=isFinite(ssWidthValue)&&ssWidthValue>0?ssWidthValue:0;
}
function ssFitWidths(left,right,budget,minLeft,minRight){
  left=Math.max(minLeft,Math.min(left,budget-minRight));right=Math.max(minRight,Math.min(right,budget-minLeft));
  var excess=left+right-budget;
  if(excess>0){var free=left-minLeft+right-minRight,ratio=free?excess/free:0;left-=(left-minLeft)*ratio;right-=(right-minRight)*ratio;}
  return {left:Math.round(left),right:Math.round(right)};
}
function ssDefaultNavWidth(w){
  return Math.max(216,Math.min(264,Math.round(w*.175)));
}
function ssDefaultQueueWidth(w){
  return Math.min(620,Math.round(w*.26));
}
var ssWidthReference={};
for(var key in SS_WIDTH_KEYS){
  try{ssWidthReference[key]=Number(window.GetProperty(SS_WIDTH_KEYS[key]+' window',window.GetProperty('SmartShuffle: last content width',0)));if(ssWidths[key]&&ssWidthReference[key]>0&&!window.GetProperty(SS_WIDTH_KEYS[key]+' window',0))window.SetProperty(SS_WIDTH_KEYS[key]+' window',ssWidthReference[key]);}catch(e){}
}
function ssLibraryScales(w,h){
  var scale=Math.max(1,Math.round(Math.min(w/1180,h/780)*40)/40);
  return {nav:Math.min(scale,1.18),main:Math.min(scale,1.25)};
}
function ssLibraryPadding(w){return w<1050?16:24;}
function ssDesktopBarScale(w,h){
  return Math.max(1,Math.min(1.35,Math.round(Math.min(w/1180,h/780)*40)/40));
}
var ssCompactNavKey='SmartShuffle: compact library width';
var ssCompactNavWidth=window.GetProperty?Number(window.GetProperty(ssCompactNavKey,0))||0:0;
function ssCompactLibrary(w,showRight){return showRight&&w<1440;}
function ssLayoutWidths(w){
  // Divider motion changes the viewport. Only changing the window changes content scale.
  var showRight=ssRightOpen&&(ssRightForced||w>=1000*(typeof ssDensity==='number'?ssDensity:1));
  var available=w-M.gap*(showRight?4:3),scales=ssLibraryScales(w,H);
  var navMin=Math.min(Math.round(192*scales.nav),Math.floor(available*.4));
  var rightMin=showRight?Math.min(240,Math.floor(available*.29)):0;
  var navMax=Math.max(navMin,Math.min(720,Math.round(w*.36)));
  var rightMax=showRight?Math.round(w*.43):0;
  function requested(key,fallback){
    if(!ssWidths[key])return fallback;
    return ssWidthReference[key]>0?ssWidths[key]*w/ssWidthReference[key]:ssWidths[key];
  }
  var navRequest=Math.min(requested('nav',ssDefaultNavWidth(w)),navMax);
  if(ssCompactLibrary(w,showRight)){
    // Leave room for titles when both drawers are visible. Ease out the cap toward desktop width.
    var compactLimit=Math.round(w*.22+Math.max(0,w-1180)*.79);
    navRequest=ssCompactNavWidth?Math.min(navMax,ssCompactNavWidth):Math.min(navRequest,compactLimit);
  }
  var rightRequest=Math.min(requested('right',ssDefaultQueueWidth(w)),rightMax);
  var mainMin=Math.min(available-navMin-rightMin,Math.min(720,Math.ceil(w*.43)));
  var sides=available-mainMin,panes;
  if(ssResizing){
    var drag=ssResizing;
    if(drag.key==='nav'){
      var fixedRight=Math.max(rightMin,Math.min(rightMax,drag.other,sides-navMin));
      panes={left:Math.max(navMin,Math.min(navMax,drag.width,sides-fixedRight)),right:fixedRight};
    }else{
      var fixedNav=Math.max(navMin,Math.min(navMax,drag.other,sides-rightMin));
      panes={left:fixedNav,right:Math.max(rightMin,Math.min(rightMax,drag.width,sides-fixedNav))};
    }
  }else panes=ssFitWidths(navRequest,rightRequest,sides,navMin,rightMin);
  // Let the title use the left third as the window grows; reserve the middle for transport.
  var bar=ssFitWidths(w*.36,Math.min(300,w*.27),w-Math.min(310,w*.34),Math.min(180,w*.2),Math.min(260,w*.28));
  return {nav:panes.left,right:panes.right,info:bar.left,tools:bar.right};
}
function ssSplitAt(x,y){
  if(fsMode||ssModal||ssPopup||!R.main)return '';
  if(y>=R.top.y&&y<R.barY-M.gap){
    if(Math.abs(x-(R.main.x-M.gap/2))<=M.gap/2+1)return 'nav';
    if(R.queue.w>0&&Math.abs(x-(R.queue.x-M.gap/2))<=M.gap/2+1)return 'right';
  }
  return '';
}
function ssAbortResize(){
  if(ssResizeTimer)window.ClearTimeout(ssResizeTimer);
  if(ssResizeFlowTimer)window.ClearTimeout(ssResizeFlowTimer);
  ssResizeTimer=ssResizeFlowTimer=0;ssResizing=ssResizeFlow=null;ssResizeCursor(false);
}
function ssResizeAnimating(){return !!(ssResizeFlow&&ssResizeFlow.page===view);}
function ssSeedResizePosition(key,x,y,origin){
  ssResizeFlow.points[key]={x:x-origin,y:y,fromX:x-origin,fromY:y,at:Date.now()-SS_RESIZE_MOVE_MS};
}
function ssStartResizeFlow(key){
  if(typeof ssReducedMotion!=='undefined'&&ssReducedMotion)return;
  if(ssResizeFlowTimer)window.ClearTimeout(ssResizeFlowTimer);
  ssResizeFlowTimer=0;
  if(typeof view==='undefined')return;
  ssResizeFlow={page:view,points:Object.create(null),indices:[],released:0};
  if(view==='home'||view==='albums')for(var box of HB_CARD){
    if(box.kind!=='album'||box.paintY===undefined)continue;
    ssSeedResizePosition('album:'+box.id,box.paintX,box.paintY,R.main.x);
    if(box.albumIndex!==undefined)ssResizeFlow.indices.push(box.albumIndex);
  }
  if(view==='home'&&typeof HB_HOME_ALBUMS!=='undefined'&&HB_HOME_ALBUMS)
    ssSeedResizePosition('home-albums-link',HB_HOME_ALBUMS.x0,HB_HOME_ALBUMS.y0,R.main.x);
  if(key==='nav'&&typeof HB_SEARCH!=='undefined'&&HB_SEARCH&&R.navTop)
    ssSeedResizePosition('nav-search',HB_SEARCH.x0,HB_SEARCH.y0,R.navTop.x);
}
function ssRequestResizeFrame(){
  if(ssResizeFlowTimer)return;
  ssResizeFlowTimer=window.SetTimeout(function(){
    ssResizeFlowTimer=0;
    if(!ssResizeFlow)return;
    if(ssResizeFlow.released&&Date.now()-ssResizeFlow.released>=SS_RESIZE_MOVE_MS)ssResizeFlow=null;
    repaintPanes();
  },16);
}
// The pane origin follows the divider immediately. Only positions inside it ease between layouts.
function ssResizePosition(key,x,y,origin){
  if(!ssResizeAnimating())return {x:x,y:y};
  if(origin===undefined)origin=R.main.x;
  var points=ssResizeFlow.points,local=x-origin,p=points[key],now=Date.now();
  if(!p){ssSeedResizePosition(key,x,y,origin);return {x:x,y:y};}
  var t=Math.min(1,Math.max(0,(now-p.at)/SS_RESIZE_MOVE_MS)),f=1-Math.pow(1-t,3);
  var px=p.fromX+(p.x-p.fromX)*f,py=p.fromY+(p.y-p.fromY)*f;
  if(p.x!==local||p.y!==y){
    p.fromX=px;p.fromY=py;p.x=local;p.y=y;p.at=now;
  }
  var rx=Math.round(px),ry=Math.round(py);
  if(rx!==local||ry!==y||ssResizeFlow.released)ssRequestResizeFrame();
  return {x:rx+origin,y:ry};
}
function ssResizeBegin(x,y){
  var key=ssSplitAt(x,y);if(!key)return false;
  var nav=key==='nav',width=nav?R.navW:R.queueW;
  ssResizing={key:key,x:x,startX:x,startWidth:width,width:width,other:nav?R.queueW:R.navW};
  if(key==='right'&&rightTab==='lyrics'&&typeof ssStartLyricDrag==='function')ssStartLyricDrag();
  ssStartResizeFlow(key);
  ssResizeCursor(true);return true;
}
function ssResizeCursor(on){try{window.SetCursor(on?32644:32512);}catch(e){}}
function ssResizeMove(x,y){
  if(!ssResizing){var hot=ssSplitAt(x,y);if(hot!==ssSplitHot){ssSplitHot=hot;ssResizeCursor(!!hot);}return false;}
  ssResizing.x=x;
  if(!ssResizeTimer)ssResizeTimer=window.SetTimeout(function(){ssResizeTimer=0;ssResizeApply();},16);
  return true;
}
function ssResizeApply(preview){
  if(!ssResizing)return;
  var drag=ssResizing,nav=drag.key==='nav',previous=nav?R.navW:R.queueW;
  drag.width=Math.round(drag.startWidth+(drag.x-drag.startX)*(nav?1:-1));
  layout(true);
  if(preview!==false&&previous!==(nav?R.navW:R.queueW)){
    repaintPanes();
  }
}
function ssResizeEnd(x,y){
  if(!ssResizing)return false;
  ssResizing.x=x;if(ssResizeTimer){window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;}
  if(ssResizing.width!==Math.round(ssResizing.startWidth+(x-ssResizing.startX)*(ssResizing.key==='nav'?1:-1)))ssResizeApply(false);
  var key=ssResizing.key;
  if(key==='right'&&ssResizing.lyricFrame)ssReleasedLyricFrame=ssResizing;
  // Save the visible, constrained width rather than an out-of-window pointer position.
  if(key==='nav'&&ssCompactLibrary(W,R.queueW>0)){
    if(R.navW!==ssResizing.startWidth){ssCompactNavWidth=R.navW;window.SetProperty(ssCompactNavKey,R.navW);}
  }else{
    ssWidths[key]=key==='nav'?R.navW:R.queueW;
    ssWidthReference[key]=W;window.SetProperty(SS_WIDTH_KEYS[key]+' window',W);
    window.SetProperty(SS_WIDTH_KEYS[key],ssWidths[key]);
  }
  ssResizing=null;

  if(ssResizeFlow){ssResizeFlow.released=Date.now();ssRequestResizeFrame();}
  ssResizeCursor(false);ssReportLayout();
  if(key==='right')repaintPanes();else repaintAll();
  return true;
}
function ssDrawResizers(gr){
  if(fsMode||ssModal||ssPopup||!R.main||!R.queue||!R.top)return;
  var active=ssResizing?ssResizing.key:'',keys=['nav','right'];
  for(var i=0;i<keys.length;i++){
    if(keys[i]==='right'&&R.queue.w<=0)continue;
    var key=keys[i],x=key==='nav'?R.main.x-M.gap/2:R.queue.x-M.gap/2;
    var y=R.top.y+14,h=R.main.h-28;
    if(active&&key!==active)continue;
    gr.FillSolidRect(Math.round(x),Math.round(y),active?2:1,Math.round(Math.max(4,h)),active?COL.green:COL.splitter);
  }
}
function ssResetLayout(){
  ssCompactNavWidth=0;window.SetProperty(ssCompactNavKey,0);
  ssAbortResize();ssSplitHot='';
  if(fsMode&&typeof exitFullscreen==='function')exitFullscreen();
  if(typeof rightTab!=='undefined')rightTab='lyrics';
  ssRightTab='lyrics';ssRightOpen=false;window.SetProperty('SmartShuffle: right pane open',false);window.SetProperty('SmartShuffle: right pane tab','lyrics');
  for(var key in SS_WIDTH_KEYS){ssWidths[key]=0;window.SetProperty(SS_WIDTH_KEYS[key],0);}
  ssApplyDefaultWindow(true);
  layout();ssDropModalImage();ssDropPopupImage();ssResizeCursor(false);ssSyncLyricPanel();ssReportLayout();repaintAll();
}
function ssLayoutStatus(){return {width:W,height:H,nav:R.navW,right:R.queueW,right_open:ssRightOpen,right_tab:rightTab,info:R.barInfoW,tools:R.barToolsW,density:ssDensity,row_height:M.rowH,cover_size:M.artSz,reset:Number(window.GetProperty('SmartShuffle: layout reset applied',0))};}
function ssReportLayout(){
  if(!ssStarted)return;
  if(ssLayoutReportTimer)window.ClearTimeout(ssLayoutReportTimer);
  ssLayoutReportTimer=window.SetTimeout(function(){ssLayoutReportTimer=0;window.SetProperty('SmartShuffle: last content width',W);window.SetProperty('SmartShuffle: last content height',H);ssSend('state',{theme_layout:ssLayoutStatus()});},160);
}
