/* User-sized columns. Requested widths survive small-window clamping and restarts. */
var SS_WIDTH_KEYS={nav:'SmartShuffle: library width',right:'SmartShuffle: lyrics width',info:'SmartShuffle: track info width',tools:'SmartShuffle: output controls width'};
var ssWidths={},ssResizing=null,ssResizeTimer=0,ssSplitHot='',ssLayoutReportTimer=0;
for(var ssWidthKey in SS_WIDTH_KEYS){
  var ssWidthValue=0;try{ssWidthValue=Number(window.GetProperty(SS_WIDTH_KEYS[ssWidthKey],0));}catch(e){}
  ssWidths[ssWidthKey]=isFinite(ssWidthValue)&&ssWidthValue>0?ssWidthValue:0;
}
function ssResponsiveMetrics(w,h){
  var density=Math.round(Math.max(.85,Math.min(1.25,Math.sqrt(Math.min(w/1180,h/780))))*20)/20;
  if(typeof ssDensity!=='undefined'&&density===ssDensity)return;
  ssDensity=density;
  if(typeof SS_BASE_UI_SCALE!=='undefined')UISCALE=SS_BASE_UI_SCALE*density;
  if(typeof ssCreateFonts==='function'){FONT=ssCreateFonts();LH_F=[];LH_V=[];}
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
  var bar=ssFitWidths(ssWidths.info||Math.min(310,w*.26),ssWidths.tools||Math.min(300,w*.27),w-Math.min(310,w*.34),Math.min(180,w*.2),Math.min(260,w*.28));
  return {nav:panes.left,right:panes.right,info:bar.left,tools:bar.right};
}
function ssSplitAt(x,y){
  if(fsMode||ssModal||ssPopup||!R.main)return '';
  if(y>=R.top.y&&y<R.barY-M.gap){
    if(Math.abs(x-(R.main.x-M.gap/2))<=M.gap/2+1)return 'nav';
    if(Math.abs(x-(R.queue.x-M.gap/2))<=M.gap/2+1)return 'right';
  }else if(y>=R.barY+8&&y<H-8){
    if(Math.abs(x-R.barInfoW)<=4)return 'info';
    if(Math.abs(x-(W-R.barToolsW))<=4)return 'tools';
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
  ssWidths[key]=Math.max(1,key==='nav'?x-M.gap*1.5:key==='right'?W-x-M.gap*1.5:key==='info'?x:W-x);
  layout();ssDropModalImage();ssDropPopupImage();repaintAll();
}
function ssResizeEnd(x,y){
  if(!ssResizing)return false;
  ssResizing.x=x;if(ssResizeTimer){window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;}
  ssResizeApply();var key=ssResizing.key;
  // Save the visible, constrained width rather than an out-of-window pointer position.
  ssWidths[key]=key==='nav'?R.navW:key==='right'?R.queueW:key==='info'?R.barInfoW:R.barToolsW;
  window.SetProperty(SS_WIDTH_KEYS[key],ssWidths[key]);ssResizing=null;ssResizeCursor(false);ssSyncLyricPanel();ssReportLayout();repaintAll();return true;
}
function ssDrawResizers(gr){
  if(fsMode||ssModal||ssPopup)return;
  var key=ssResizing?ssResizing.key:ssSplitHot;if(!key)return;
  var x=key==='nav'?R.main.x-M.gap/2:key==='right'?R.queue.x-M.gap/2:key==='info'?R.barInfoW:W-R.barToolsW;
  var bottom=key==='info'||key==='tools',y=bottom?R.barY+15:R.top.y+14,h=bottom?M.barH-30:R.main.h-28;
  gr.FillRoundRect(Math.round(x-1),y,2,Math.max(4,h),1,1,ssResizing?COL.green:COL.text3);
}
function ssResetLayout(){
  if(ssResizeTimer){window.ClearTimeout(ssResizeTimer);ssResizeTimer=0;}
  ssResizing=null;ssSplitHot='';
  if(fsMode&&typeof exitFullscreen==='function')exitFullscreen();
  if(typeof rightTab!=='undefined')rightTab='lyrics';
  for(var key in SS_WIDTH_KEYS){ssWidths[key]=0;window.SetProperty(SS_WIDTH_KEYS[key],0);}
  if(UIWizard){UIWizard.ExitMaximize();UIWizard.SetWindowSize(1180,780);window.SetProperty('SmartShuffle: comfortable window initialized',true);}
  layout();ssDropModalImage();ssDropPopupImage();ssResizeCursor(false);ssSyncLyricPanel();ssReportLayout();repaintAll();
}
function ssLayoutStatus(){return {width:W,height:H,nav:R.navW,right:R.queueW,info:R.barInfoW,tools:R.barToolsW,density:ssDensity,row_height:M.rowH,cover_size:M.artSz,reset:Number(window.GetProperty('SmartShuffle: layout reset applied',0))};}
function ssReportLayout(){
  if(!ssStarted)return;
  if(ssLayoutReportTimer)window.ClearTimeout(ssLayoutReportTimer);
  ssLayoutReportTimer=window.SetTimeout(function(){ssLayoutReportTimer=0;window.SetProperty('SmartShuffle: last content width',W);window.SetProperty('SmartShuffle: last content height',H);ssSend('state',{theme_layout:ssLayoutStatus()});},160);
}
