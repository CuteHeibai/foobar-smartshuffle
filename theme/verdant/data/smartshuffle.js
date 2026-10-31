/* Native smartshuffle JSON bridge. MIT; Verdant adaptation.
   One unacknowledged request owns request.json. Coalesce ONLY unsent previews. */
var SS_ROOT=fb.ProfilePath+'smartshuffle\\', ssState=null, ssFlight=null, ssOut=[], ssSerial=0;
var ssSession=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2), ssPollTimer=null;
var ssModal=false, ssDraft={x:0,y:0}, ssDraftTimer=null, ssDragging=false, ssSeenOpen=0;
var ssOwnOpen={}, ssApplyId='', ssMessage='', ssError='', ssLastJSON='', ssOpenDraftPending=false;
var ssStarted=false,ssStarting=false;
function ssClamp(v){ v=Number(v); return isFinite(v)?Math.max(-1,Math.min(1,v)):0; }
function ssPoint(p){ return {x:ssClamp(p&&p.x),y:ssClamp(p&&p.y)}; }
function ssPointSame(a,b){ return !!a&&!!b&&Math.abs(a.x-b.x)<0.00001&&Math.abs(a.y-b.y)<0.00001; }
function ssSend(op,args){
  var r={version:1,id:ssSession+'-'+(++ssSerial),op:op}, k;
  for(k in (args||{})) if(k!=='version'&&k!=='id'&&k!=='op') r[k]=args[k];
  if(op==='preview') ssOut=ssOut.filter(function(q){return q.op!=='preview';});
  if(op==='lyrics_panel') ssOut=ssOut.filter(function(q){return q.op!=='lyrics_panel';});
  if(op==='menu_open') ssOut=ssOut.filter(function(q){return q.op!=='menu_open';});
  if(op==='cancel') ssOut=ssOut.filter(function(q){return q.op!=='preview';});
  ssOut.push(r); ssPump(); return r.id;
}
function ssPump(){
  if(ssFlight||!ssOut.length) return;
  ssFlight=ssOut.shift(); ssFlight.sentAt=Date.now();
  try{
    var wire={}; for(var k in ssFlight) if(k!=='sentAt') wire[k]=ssFlight[k];
    if(utils.WriteTextFile(SS_ROOT+'request.json',JSON.stringify(wire),false)===false) throw Error('无法写入请求文件');
    ssError='';
  }catch(e){ ssError='请求未发送：'+e.message+'。请检查 smartshuffle 目录和组件。'; ssOut.unshift(ssFlight); ssFlight=null; }
}
function ssAcceptState(s){
  if(!s||s.version!==1) return;
  if(ssState&&s.pid&&ssState.pid!==s.pid)ssSeenOpen=0;
  if(ssStarting)ssSeenOpen=s.ui_open||0;
  ssState=s;
  if(s.ui_layout_reset&&typeof ssResetLayout==='function'){
    var resetSeen=Number(window.GetProperty('SmartShuffle: layout reset applied',0));
    if(s.ui_layout_reset>resetSeen){
      try{ssResetLayout();window.SetProperty('SmartShuffle: layout reset applied',s.ui_layout_reset);}
      catch(e){ssError='布局恢复未完成：'+String(e);console.log('Smart Shuffle layout reset: '+String(e));}
    }
  }
  if(typeof s.enabled==='boolean') pbShuffle=s.enabled;
  var done=null;
  if(ssFlight&&s.request_id===ssFlight.id){ done=ssFlight; ssFlight=null; }
  if(typeof ssAcceptMenu==='function')ssAcceptMenu(done,s);
  if(typeof ssAcceptFiles==='function')ssAcceptFiles(done,s);
  if(s.ui_open>ssSeenOpen){
    ssSeenOpen=s.ui_open;
    if(!ssModal&&!ssOwnOpen[s.request_id]) ssShow(false);
  }
  if(done&&done.op==='open'&&ssOpenDraftPending&&ssModal){
    ssOpenDraftPending=false;
    // A ball moved while the open request was in flight always wins.
    if(!ssDraftTimer&&!ssOut.some(function(q){return q.op==='preview';})) ssDraft=ssPoint((s.preview&&s.preview.point)||s.point);
  }
  if(done&&s.response&&s.response.ok===false){
    ssMessage=s.response.code==='stale_preview'?'歌单已变化，预览已更新；请核对后再次应用。':('操作失败：'+(s.response.message||s.response.code||'请重试'));
    if(!ssModal)ssError=ssMessage;
  }else if(done){ ssMessage=''; }
  if(done&&done.id===ssApplyId){
    ssApplyId='';
    if(!s.response||s.response.ok!==false){ ssModal=false; ssDragging=false; applyKeyMode(); }
  }
  if(typeof ssAcceptDiscovery==='function')ssAcceptDiscovery(s);
  if(typeof ssAcceptCovers==='function')ssAcceptCovers(s);
  ssPump(); if(ssModal&&typeof ssRepaintPreference==='function')ssRepaintPreference();else repaintAll();
}
function ssPoll(){
  try{
    var raw=utils.ReadTextFile?utils.ReadTextFile(SS_ROOT+'state.json',65001):utils.ReadUTF8(SS_ROOT+'state.json');
    raw=raw.replace(/^\uFEFF/,'');
    if(raw!==ssLastJSON){ var s=JSON.parse(raw); if(s&&s.version===1){ ssLastJSON=raw; ssAcceptState(s); } }
  }catch(e){ /* Atomic replacement/first startup: retain the last complete state. */ }
  if(ssFlight&&Date.now()-ssFlight.sentAt>6000){
    var msg='组件尚未回应。请确认智能随机组件已加载，再重新打开播放器。';
    if(ssError!==msg){ ssError=msg; repaintAll(); }
  }
  if(!ssFlight&&ssOut.length) ssPump();
}
function ssStart(){
  if(ssStarted) return;
  ssStarted=true;ssStarting=true;ssPoll();ssStarting=false;
  ssSend('state',{theme_version:'1.0.3',theme_window:Number(window.ID)||0,ui_wizard:typeof UIWizard!=='undefined'&&!!UIWizard});
  if(typeof ssReportLayout==='function')ssReportLayout();
  if(typeof UIWizard!=='undefined'&&UIWizard)window.SetTimeout(function(){
    ssSend('state',{theme_chrome_ready:ssConfigureChrome()});
  },100);
  ssPollTimer=window.SetInterval(ssPoll,50);
}
function ssStop(){ if(ssPollTimer) window.ClearInterval(ssPollTimer); if(ssDraftTimer) window.ClearTimeout(ssDraftTimer); }
function ssShow(local){
  if(typeof ssDropModalImage==='function')ssDropModalImage();
  ssModal=true; ssDragging=false; ssMessage=''; ssApplyId='';
  if(typeof ssSyncLyricPanel==='function') ssSyncLyricPanel();
  ssDraft=ssPoint(ssState&&((ssState.preview&&ssState.preview.point)||ssState.point));
  if(typeof stopScrollAnim==='function') stopScrollAnim();
  applyKeyMode(); repaintAll();
}
function ssOpen(){
  if(ssModal) return;
  ssShow(true); ssOpenDraftPending=true;
  var id=ssSend('open'); ssOwnOpen[id]=true;
}
function ssSetDraft(x,y){
  if(!ssModal||ssApplyId) return;
  ssDraft={x:ssClamp(x),y:ssClamp(y)}; ssOpenDraftPending=false; ssMessage='';
  if(typeof ssRecordTrail==='function')ssRecordTrail(ssDraft);
  if(ssDraftTimer) window.ClearTimeout(ssDraftTimer);
  ssDraftTimer=window.SetTimeout(function(){ ssDraftTimer=null; if(ssModal) ssSend('preview',ssDraft); },150);
  if(typeof ssRepaintPreference==='function')ssRepaintPreference();else repaintAll();
}
function ssReady(){
  var p=ssState&&ssState.preview;
  return !!(ssModal&&!ssApplyId&&!ssDraftTimer&&!ssFlight&&!ssOut.length&&p&&p.token&&!ssState.preview_pending&&ssPointSame(p.point,ssDraft));
}
function ssApply(){
  if(!ssReady()) return false;
  ssApplyId=ssSend('apply',{token:ssState.preview.token}); repaintAll(); return true;
}
function ssCancel(){
  if(ssApplyId) return; // An applied transaction already sent cannot be undone by a late cancel.
  if(ssDraftTimer){ window.ClearTimeout(ssDraftTimer); ssDraftTimer=null; }
  ssModal=false; ssDragging=false; ssOpenDraftPending=false;
  if(typeof ssDropModalImage==='function')ssDropModalImage();
  ssSend('cancel'); applyKeyMode(); repaintAll();
}
function ssMapPoint(x,y,g){ return {x:ssClamp((x-g.x)/g.size*2-1),y:ssClamp(1-(y-g.y)/g.size*2)}; }
function ssKeyDown(key){
  if(!ssModal) return false;
  if(key===27) ssCancel();
  else if(key===13) ssApply();
  else if(key>=37&&key<=40){
    var dx=key===37?-.05:(key===39?.05:0), dy=key===38?.05:(key===40?-.05:0);
    ssSetDraft(ssDraft.x+dx,ssDraft.y+dy);
  }
  return true;
}
