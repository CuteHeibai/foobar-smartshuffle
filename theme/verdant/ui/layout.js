/* User-sized columns. Requested widths survive small-window clamping and restarts. */
var SS_WIDTH_KEYS={nav:'SmartShuffle: library width',right:'SmartShuffle: lyrics width'};
var ssWidths={},ssResizing=null,ssResizeTimer=0,ssSplitHot='',ssLayoutReportTimer=0;
// Work-area proportions, not a fixed requested pixel size. Native code supplies
// the monitor containing the player, so taskbars and secondary screens are respected.
function ssDefaultWindowSize(){
  var display=ssState&&ssState.display;
  if(!display)return null;
  var w=Number(display.work_width),h=Number(display.work_height);
  if(!isFinite(w)||!isFinite(h)||w<=0||h<=0)return null;
  var area=w*h*.4,ratio=Math.max(1.45,Math.min(1.85,w/h*.9));
  var width=Math.sqrt(area*ratio),height=area/width;
  if(width>w*.94){width=w*.94;height=area/width;}
  if(height>h*.94){height=h*.94;width=area/height;}
  return {width:Math.round(width),height:Math.round(height)};
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
function ssResponsiveMetrics(w,h){
  var density=Math.round(Math.max(.85,Math.min(1.25,Math.sqrt(Math.min(w/1180,h/780))))*20)/20;
  if(typeof ssDensity!=='undefined'&&density===ssDensity)return;
  ssDensity=density;
  if(typeof SS_BASE_UI_SCALE!=='undefined')UISCALE=SS_BASE_UI_SCALE*density;
  if(typeof ssCreateFonts==='function'){SS_FONT_META=[];SS_FIT_FONTS=[];SS_SCRIPT_FONTS={};FONT=ssCreateFonts();LH_F=[];LH_V=[];}
  var base={pad:8,gap:8,navW:210,queueW:350,barH:96,navTopH:84,rowH:56,cardTextH:56,radius:10};
  for(var key in base)M[key]=Math.round(base[key]*density);
  TBH=Math.round(32*UISCALE);CAPBW=Math.round(46*UISCALE);
  if(typeof SG_IND!=='undefined'){
    SG_IND=Math.round(32*density);SG_GAP1=Math.round(24*density);SG_GAP2=Math.round(14*density);SG_PADB1=Math.round(12*density);SG_PADB2=Math.round(10*density);
    SG_ART1=Math.round(56*density);SG_ART2=Math.round(44*density);SG_TGAP=Math.round(18*density);SG_SLABP=Math.round(10*density);
    SG_H1=SG_GAP1+SG_ART1+SG_PADB1;SG_H1B=SG_H1+SG_SLABP*2;SG_H2=SG_GAP2+SG_ART2+SG_PADB2;SG_TRH=Math.round(44*density);SG_CROP=Math.round(96*density);
    if(songsRows)buildSongsRows();
  }
  if(typeof plCardCache!=='undefined')plCardCache={};if(typeof artCardCache!=='undefined'){artCardCache={};artCardN=0;}
  if(typeof CORN!=='undefined')CORN=null;
}
function ssFitWidths(left,right,budget,minLeft,minRight){
  left=Math.max(minLeft,Math.min(left,budget-minRight));right=Math.max(minRight,Math.min(right,budget-minLeft));
  var excess=left+right-budget;
  if(excess>0){var free=left-minLeft+right-minRight,ratio=free?excess/free:0;left-=(left-minLeft)*ratio;right-=(right-minRight)*ratio;}
  return {left:Math.round(left),right:Math.round(right)};
}
function ssLayoutWidths(w){
  var mainMin=Math.min(330,Math.round(w*.36)),navMin=Math.min(156,Math.round(w*.18)),rightMin=Math.min(220,Math.round(w*.24));
  var panes=ssFitWidths(ssWidths.nav||Math.min(M.navW,w*.19),ssWidths.right||Math.min(M.queueW,w*.27),w-M.gap*4-mainMin,navMin,rightMin);
  var bar=ssFitWidths(Math.min(310,w*.26),Math.min(300,w*.27),w-Math.min(310,w*.34),Math.min(180,w*.2),Math.min(260,w*.28));
  return {nav:panes.left,right:panes.right,info:bar.left,tools:bar.right};
}
function ssSplitAt(x,y){
  if(fsMode||ssModal||ssPopup||!R.main)return '';
  if(y>=R.top.y&&y<R.barY-M.gap){
    if(Math.abs(x-(R.main.x-M.gap/2))<=M.gap/2+1)return 'nav';
    if(Math.abs(x-(R.queue.x-M.gap/2))<=M.gap/2+1)return 'right';
  }
  return '';
}
function ssResizeBegin(x,y){
  var key=ssSplitAt(x,y);if(!key)return false;
  ssResizing={key:key,x:x};ssHideLyrics();ssResizeCursor(true);return true;
}
function ssResizeCursor(on){try{window.SetCursor(on?32644:32512);}catch(e){}}
function ssResizeMove(x,y){
  if(!ssResizing){var hot=ssSplitAt(x,y);if(hot!==ssSplitHot){ssSplitHot=hot;repaintAll();}ssResizeCursor(!!ssSplitHot);return false;}
  ssResizing.x=x;
  if(!ssResizeTimer)ssResizeTimer=window.SetTimeout(function(){ssResizeTimer=0;ssResizeApply();},16);
  return true;
}
function ssResizeApply(){
  if(!ssResizing)return;
  var key=ssResizing.key,x=ssResizing.x;
  ssWidths[key]=Math.max(1,key==='nav'?x-M.gap*1.5:W-x-M.gap*1.5);
  layout();ssDropModalImage();ssDropPopupImage();repaintAll();
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
    var key=keys[i],x=key==='nav'?R.main.x-M.gap/2:R.queue.x-M.gap/2;
    var y=R.top.y+14,h=R.main.h-28;
    gr.FillSolidRect(Math.round(x),Math.round(y),1,Math.round(Math.max(4,h)),key===active?COL.text2:COL.splitter);
  }
}
function ssResetLayout(){
  if(ssResizeTimer){window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;}
  ssResizing=null;ssSplitHot='';
  if(fsMode&&typeof exitFullscreen==='function')exitFullscreen();
  if(typeof rightTab!=='undefined')rightTab='lyrics';
  for(var key in SS_WIDTH_KEYS){ssWidths[key]=0;window.SetProperty(SS_WIDTH_KEYS[key],0);}
  ssApplyDefaultWindow(true);
  layout();ssDropModalImage();ssDropPopupImage();ssResizeCursor(false);ssSyncLyricPanel();ssReportLayout();repaintAll();
}
function ssLayoutStatus(){return {width:W,height:H,nav:R.navW,right:R.queueW,info:R.barInfoW,tools:R.barToolsW,density:ssDensity,row_height:M.rowH,cover_size:M.artSz,reset:Number(window.GetProperty('SmartShuffle: layout reset applied',0))};}
function ssReportLayout(){
  if(!ssStarted)return;
  if(ssLayoutReportTimer)window.ClearTimeout(ssLayoutReportTimer);
  ssLayoutReportTimer=window.SetTimeout(function(){ssLayoutReportTimer=0;window.SetProperty('SmartShuffle: last content width',W);window.SetProperty('SmartShuffle: last content height',H);ssSend('state',{theme_layout:ssLayoutStatus()});},160);
}
