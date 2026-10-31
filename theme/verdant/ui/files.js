/* Physical-file recycling is a separate, explicit confirmation from playlist removal. */
var SS_RECYCLE_HB=null;
function ssRecyclePrepare(id){
  confirmDel={kind:'file',track_id:id,info:null,error:'',commit:'',request:''};
  confirmDel.request=ssSend('recycle_prepare',{track_id:id});ssHideLyrics();applyKeyMode();repaintAll();
}
function ssAcceptFiles(done,state){
  if(!done||!confirmDel||confirmDel.kind!=='file')return;
  var dialog=confirmDel,response=state.response||{};
  if(done.id===dialog.request){
    if(response.ok===false)dialog.error=response.message||'无法读取歌曲文件';else dialog.info=response.recycle;
    repaintAll();
  }else if(done.id===dialog.commit){
    if(response.ok===false){dialog.error=response.message||'回收站操作未完成';dialog.commit='';dialog.info=null;}
    else{confirmDel=null;if(typeof invalidateItems==='function')invalidateItems();if(typeof updateNP==='function')updateNP();applyKeyMode();}
    repaintAll();
  }
}
function ssRecycleCancel(){
  if(!confirmDel||confirmDel.kind!=='file'||confirmDel.commit)return;
  confirmDel=null;ssSend('recycle_cancel');applyKeyMode();repaintAll();
}
function ssRecycleConfirm(){
  if(!confirmDel||confirmDel.kind!=='file'||!confirmDel.info||confirmDel.error||confirmDel.commit)return;
  confirmDel.commit=ssSend('recycle_apply',{token:confirmDel.info.token});repaintAll();
}
function ssRecycleKey(key){
  if(!confirmDel||confirmDel.kind!=='file')return false;
  if(key===27)ssRecycleCancel();else if(key===13)ssRecycleConfirm();return true;
}
function ssRecycleClick(x,y){
  if(!confirmDel||confirmDel.kind!=='file')return false;
  if(SS_RECYCLE_HB){if(inRect(x,y,SS_RECYCLE_HB.cancel))ssRecycleCancel();else if(inRect(x,y,SS_RECYCLE_HB.confirm))ssRecycleConfirm();}
  return true;
}
function ssDrawRecycleConfirm(gr){
  var dialog=confirmDel,info=dialog.info,path=info?info.path:dialog.error||'正在确认歌曲文件…';
  var w=Math.min(740,W-40),wrapped=gr.EstimateLineWrap(path,FONT.pl,w-48),lines=Math.max(1,wrapped.length/2);
  var h=Math.min(H-50,Math.max(310,210+lines*23)),y=Math.round((H-h)/2),x=modalPanel(gr,w,h,y);
  tL(gr,'将歌曲文件移到回收站？',FONT.sect2,COL.text,x+24,y+18,w-48,38);
  tPara(gr,path,FONT.pl,dialog.error?RGB(245,150,130):COL.text,x+24,y+76,w-48,23);
  var note=info&&info.shared_file?'此文件包含多个子曲目，整个文件移走后，这些子曲目都会受影响。':'实际文件将进入 Windows 回收站，同一文件的歌单引用也会移除。';
  if(info&&info.playing)note+=' 正在播放的文件会先停止播放。';
  tPara(gr,note,FONT.plSub,COL.text2,x+24,y+h-130,w-48,20);
  var by=y+h-64,ready=!!(info&&!dialog.error&&!dialog.commit);
  SS_RECYCLE_HB={cancel:dlgBtn(gr,x+w-300,by,110,40,'取消',COL.elev,COL.hover,COL.text),confirm:dlgBtn(gr,x+w-178,by,154,40,dialog.commit?'正在移入…':'移到回收站',ready?COL.green:COL.hover,ready?COL.green:COL.hover,ready?COL.black:COL.text3)};
}
