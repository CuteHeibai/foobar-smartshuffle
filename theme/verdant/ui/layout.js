/* User-sized columns. Requested widths survive small-window clamping and restarts. */
var SS_WIDTH_KEYS={nav:'SmartShuffle: library width',right:'SmartShuffle: lyrics width'};
var ssWidths={},ssResizing=null,ssResizeTimer=0,ssSplitHot='',ssLayoutReportTimer=0;
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
  // UIWizard reports 2 for an ordinary restored window.
  try{if(UIWizard.WindowState!==2)return;}catch(e){return;}
  ssWindowClampTimer=window.SetTimeout(function(){
    ssWindowClampTimer=0;
    var width=window.Width,height=window.Height,size=ssWindowMinimum();
    try{
      if(UIWizard.WindowState===2&&width>0&&height>0&&(width<size.width||height<size.height))
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
function ssLayoutWidths(w){
  var navMin=Math.min(180,Math.round(w*.18)),rightMin=Math.min(220,Math.round(w*.24));
  var standard=w<1280,navMax=Math.min(standard?240:260,Math.round(w*.24));
  var navRequest=Math.min(ssWidths.nav||Math.min(M.navW,228),navMax);
  var rightRequest=Math.min(ssWidths.right||Math.min(M.queueW,Math.round(w*.225)),standard?268:w);
  var available=w-M.gap*4,mainMin=Math.min(available-navMin-rightMin,Math.min(720,Math.ceil(w*.54)));
  var panes=ssFitWidths(navRequest,rightRequest,available-mainMin,navMin,rightMin);
  // Keep the saved request intact while a smaller window temporarily gives content priority.
  var showRight=ssRightOpen&&(ssRightForced||w>=1000*(typeof ssDensity==='number'?ssDensity:1));
  if(!showRight){panes.right=0;panes.left=Math.round(Math.max(navMin,navRequest));}
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
function ssAbortResize(){if(ssResizeTimer)window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;ssResizing=null;ssResizeCursor(false);}
function ssResizeBegin(x,y){
  var key=ssSplitAt(x,y);if(!key)return false;
  ssResizing={key:key,x:x};ssHideLyrics();ssResizeCursor(true);return true;
}
function ssResizeCursor(on){try{window.SetCursor(on?32644:32512);}catch(e){}}
function ssResizeMove(x,y){
  if(!ssResizing){var hot=ssSplitAt(x,y);if(hot!==ssSplitHot){ssSplitHot=hot;ssResizeCursor(!!hot);}return false;}
  ssResizing.x=x;
  if(!ssResizeTimer)ssResizeTimer=window.SetTimeout(function(){ssResizeTimer=0;ssResizeApply();},16);
  return true;
}
function ssResizeApply(){
  if(!ssResizing)return;
  var key=ssResizing.key,x=ssResizing.x;
  ssWidths[key]=Math.max(1,key==='nav'?x-M.gap*1.5:W-x-M.gap*1.5);
  layout(true);repaintAll();
}
function ssResizeEnd(x,y){
  if(!ssResizing)return false;
  ssResizing.x=x;if(ssResizeTimer){window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;}
  ssResizeApply();var key=ssResizing.key;
  // Save the visible, constrained width rather than an out-of-window pointer position.
  ssWidths[key]=key==='nav'?R.navW:R.queueW;
  window.SetProperty(SS_WIDTH_KEYS[key],ssWidths[key]);ssResizing=null;ssResizeCursor(false);ssSyncLyricPanel();ssReportLayout();repaintAll();return true;
}
function ssDrawResizers(gr){
  if(fsMode||ssModal||ssPopup||!R.main||!R.queue||!R.top)return;
  var active=ssResizing?ssResizing.key:'',keys=['nav','right'];
  for(var i=0;i<keys.length;i++){
    if(keys[i]==='right'&&R.queue.w<=0)continue;
    var key=keys[i],x=key==='nav'?R.main.x-M.gap/2:R.queue.x-M.gap/2;
    var y=R.top.y+14,h=R.main.h-28;
    gr.FillSolidRect(Math.round(x),Math.round(y),1,Math.round(Math.max(4,h)),key===active?COL.text2:COL.splitter);
  }
}
function ssResetLayout(){
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
