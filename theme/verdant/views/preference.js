/* Random preference modal: native preview is the only source of proposed tracks. */
var SS_HB=[], SS_GRID=null, SS_LYRIC_BTN=null, SS_LYRIC_PLAY=null;
var ssLyricChild=null, ssLyricTried=false, ssLyricVisible=false, ssLyricShown=null, ssLyricBounds='';
var ssNativeLyricKey='';
var ssGridImage=null,ssGridSize=0;
function ssGradientGrid(size){
  if(ssGridImage&&ssGridSize===size)return ssGridImage;
  if(ssGridImage)try{ssGridImage.Dispose();}catch(e){}
  ssGridSize=size;ssGridImage=gdi.CreateImage(size,size);var g=ssGridImage.GetGraphics();
  function mix(a,b,t){return RGB(Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t));}
  var light=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='light';
  for(var y=0;y<size;y+=4){var t=y/Math.max(1,size-1);g.FillGradRect(0,y,size,Math.min(4,size-y),0,mix(light?[235,222,220]:[77,48,55],light?[239,233,221]:[66,59,47],t),mix(light?[220,193,199]:[111,56,69],light?[225,211,190]:[94,76,52],t));}
  ssGridImage.ReleaseGraphics(g);return ssGridImage;
}
function ssDrawGlassBall(gr,gx,gy,size){
  var now=Date.now(),samples=ssTrailSamples(now),previous=null;
  for(var i=0;i<samples.length;i++){
    var p=samples[i],a=p.fade,r=2+6*a;
    var tx=gx+(p.x+1)*size/2,ty=gy+(1-p.y)*size/2;
    if(previous)gr.DrawLine(previous.x,previous.y,tx,ty,r*2,ssAccent(Math.round(30*a)));
    gr.FillEllipse(tx-r,ty-r,r*2,r*2,ssAccent(Math.round(34*a)));previous={x:tx,y:ty};
  }
  var bx=gx+(ssDraft.x+1)*size/2,by=gy+(1-ssDraft.y)*size/2;
  gr.FillEllipse(bx-24,by-24,48,48,ssAccent(28));
  gr.FillEllipse(bx-17,by-17,34,34,ssAccent(100));
  gr.FillEllipse(bx-13,by-13,26,26,ssAccent(175));
  gr.DrawEllipse(bx-16,by-16,32,32,1.5,ssAlpha(COL.onAccent,155));
  gr.FillEllipse(bx-10,by-11,12,7,RGBA(255,255,255,130));
  if(ssTrail.length)ssRepaintPreference();
}
function ssRequestNativeLyrics(visible){
  var parent=Number(window.ID)||0, r=R.queue;
  if(!parent||!r) return;
  var p={parent:parent,x:r.x+10,y:r.y+58,w:Math.max(1,r.w-20),h:Math.max(1,r.h-68),visible:!!visible,appearance:typeof SS_APPEARANCE!=='undefined'?SS_APPEARANCE:'dark'};
  var key=[parent,p.x,p.y,p.w,p.h,p.visible,p.appearance].join(',');
  if(key!==ssNativeLyricKey){ ssNativeLyricKey=key; ssSend('lyrics_panel',p); }
}
function ssSyncLyricPanel(){
  if(!ssLyricTried){
    ssLyricTried=true;
    try{ ssLyricChild=window.GetPanel('ESLyric'); }catch(e){ ssLyricChild=null; }
  }
  var visible=(typeof NP==='undefined'||!!NP)&&rightTab==='lyrics'&&!fsMode&&!ssModal&&!ssPopup&&!(typeof confirmDel!=='undefined'&&confirmDel)&&!(typeof ssResizing!=='undefined'&&ssResizing)&&R.queue&&R.queue.w>80&&R.queue.h>80;
  if(ssPopup&&ssPopup.nativeMenu&&!ssLyricChild){ssNativeLyricKey='';ssLyricVisible=false;return;}
  if(!ssLyricChild){
    ssRequestNativeLyrics(visible);
    var state=ssState&&ssState.lyrics_panel;
    ssLyricVisible=!!(visible&&state&&state.ready&&state.visible);
    return;
  }
  try{
    var key=visible?[R.queue.x,R.queue.y,R.queue.w,R.queue.h].join(','):'';
    if(visible&&key!==ssLyricBounds){
      ssLyricChild.Move(R.queue.x+10,R.queue.y+58,R.queue.w-20,R.queue.h-68,true); ssLyricBounds=key;
    }
    if(ssLyricShown!==!!visible){ ssLyricChild.Show(!!visible); ssLyricShown=!!visible; }
    ssLyricVisible=!!visible;
  }catch(e){ ssLyricVisible=false; }
}
function ssHideLyrics(){
  if(ssLyricChild){ try{ ssLyricChild.Show(false);ssLyricShown=false; }catch(e){} }
  else if(ssNativeLyricKey||(ssState&&ssState.lyrics_panel&&ssState.lyrics_panel.ready)) ssRequestNativeLyrics(false);
  ssLyricVisible=false;
}
function ssButton(gr,x,y,w,h,label,act,enabled,primary){
  var hot=enabled&&hv(x,y,x+w,y+h),color=primary?(enabled?(hot?COL.greenHover:COL.green):COL.seekbg):(hot?COL.hover:COL.elev),radius=Math.min(6,h/2);
  ssFillContinuousRect(gr,x,y,w,h,radius,radius,color);
  if(!primary)strokeRound(gr,x,y,w,h,radius,1,COL.line);
  tC(gr,label,FONT.pl,primary&&enabled?COL.onAccent:(enabled?COL.text:COL.text3),x,y,w,h);
  SS_HB.push({x0:x,y0:y,x1:x+w,y1:y+h,act:act,enabled:enabled});
}
function ssPreferenceLabel(){
  var x=ssDraft.x, y=ssDraft.y;
  return (x<-.2?'少听探索':x>.2?'常听优先':'均衡聆听')+' · '+(y>.2?'风格跳跃':y<-.2?'风格相似':'风格均衡');
}
function ssGeometry(w,h){
  var mw=Math.min(940,w-32), mh=Math.min(600,h-32), x=Math.round((w-mw)/2), y=Math.round((h-mh)/2);
  var left=Math.round(mw*.49), top=y+104, areaH=mh-236;
  var rightX=x+left+28, rightW=mw-left-52, labelW=Math.ceil(46*UISCALE), size=Math.max(80,Math.min(300,areaH-46,rightW-labelW*2-12));
  return {x:x,y:y,w:mw,h:mh,left:left,top:top,areaH:areaH,rightX:rightX,rightW:rightW,labelW:labelW,
    grid:{x:Math.round(rightX+(rightW-size)/2),y:Math.round(top+32),size:Math.round(size)}};
}
function drawPreference(gr,staticOnly){
  if(!ssModal) return;
  SS_HB=[];
  var m=ssGeometry(W,H), x=m.x,y=m.y,w=m.w,h=m.h, gx=m.grid.x,gy=m.grid.y,size=m.grid.size;
  SS_GRID=m.grid;
  ssFillContinuousRect(gr,x,y,w,h,12,12,COL.base);
  strokeRound(gr,x,y,w,h,12,1,COL.line);
  tL(gr,'随机偏好',FONT.sect2,COL.text,x+24,y+18,w-48,34);
  tL(gr,ssPreferenceLabel()+'  ·  拖动圆点或按方向键微调',FONT.meta,COL.text2,x+24,y+60,w-48,28);
  var px=x+24,pw=m.left-12, rowH=Math.floor((m.areaH-30)/8), tracks=(ssState&&ssState.preview&&ssState.preview.tracks)||[];
  var count=Math.min(tracks.length,8),hasSource=!!(ssState&&ssState.source);
  var pending=!!(ssState&&ssState.preview_pending);
  tL(gr,count?'播放顺序预览 · 前 '+count+' 首':'播放顺序预览',FONT.sect,COL.text,px,m.top,pw,28);
  if(!count){
    var emptyY=m.top+Math.round(m.areaH*.33);
    drawIcon(gr,'queue',COL.text2,px,emptyY,pw,36,24);
    tC(gr,pending?'正在生成预览…':hasSource?'暂无可预览的歌曲':'播放歌单后即可生成预览',
      FONT.pl,COL.text2,px+12,emptyY+44,pw-24,30);
  }
  for(var i=0;i<count;i++){
    var ry=m.top+34+i*rowH, tr=tracks[i];
    if(i%2===0) gr.FillSolidRect(px,ry,pw,rowH,COL.elev);
    tL(gr,String(i+1),FONT.rowNum,COL.text3,px+6,ry,28,rowH);
    var label=(tr.title||'未知曲目')+(tr.artist?' · '+tr.artist:'')+(tr.analyzed===false?' [待分析]':'');
    tL(gr,label,FONT.qName,COL.text,px+36,ry,pw-42,rowH);
  }
  tC(gr,'风格跳跃',FONT.pl,COL.text2,m.rightX,m.top,m.rightW,26);
  gr.DrawImage(ssGradientGrid(size),gx,gy,size,size,0,0,size,size);
  for(var j=0;j<=4;j++){
    var p=Math.round(j*size/4);
    var line=j===2?ssInk(92):ssInk(40);
    gr.DrawLine(gx+p+.5,gy,gx+p+.5,gy+size,j===2?1.5:1,line);
    gr.DrawLine(gx,gy+p+.5,gx+size,gy+p+.5,j===2?1.5:1,line);
  }
  strokeRound(gr,gx,gy,size,size,5,1,COL.line);
  tC(gr,'极少听',FONT.pl,COL.text2,m.rightX,gy+size/2-18,m.labelW,36);
  tC(gr,'最常听',FONT.pl,COL.text2,gx+size+4,gy+size/2-18,m.labelW,36);
  tC(gr,'风格相似',FONT.pl,COL.text2,m.rightX,gy+size+5,m.rightW,26);
  if(!staticOnly)ssDrawGlassBall(gr,gx,gy,size);
  var fy=y+h-118, gap=8, btnW=Math.floor((m.rightW-gap*2)/3), bh=36;
  ssButton(gr,m.rightX,fy,btnW,bh,'均衡','balanced',!ssApplyId,false);
  ssButton(gr,m.rightX+btnW+gap,fy,btnW,bh,'常听优先','familiar',!ssApplyId,false);
  ssButton(gr,m.rightX+(btnW+gap)*2,fy,btnW,bh,'少听探索','explore',!ssApplyId,false);
  var ready=ssReady(), waiting=ssApplyId?'正在应用…':ready?'应用后按此预览顺序播放':count?'正在更新预览…':'';
  var error=ssError||ssMessage||(ssState&&ssState.error)||'';
  tL(gr,error||waiting,FONT.plSub,error?COL.error:COL.text2,x+24,fy+42,w-304,28);
  ssButton(gr,x+w-266,fy+46,110,40,'取消','cancel',!ssApplyId,false);
  ssButton(gr,x+w-144,fy+46,120,40,ssApplyId?'应用中…':'应用','apply',ready,true);
}
function ssPointerDown(x,y){
  if(!ssModal) return false;
  if(!ssApplyId&&SS_GRID&&x>=SS_GRID.x-14&&x<=SS_GRID.x+SS_GRID.size+14&&y>=SS_GRID.y-14&&y<=SS_GRID.y+SS_GRID.size+14){
    ssDragging=true; var p=ssMapPoint(x,y,SS_GRID); ssSetDraft(p.x,p.y);
  }
  return true;
}
function ssPointerMove(x,y){
  if(!ssModal) return false;
  if(ssDragging){ var p=ssMapPoint(x,y,SS_GRID); ssSetDraft(p.x,p.y); }
  else ssRepaintPreference();
  return true;
}
function ssPointerUp(x,y){
  if(!ssModal) return false;
  if(ssDragging){ var p=ssMapPoint(x,y,SS_GRID); ssSetDraft(p.x,p.y); ssDragging=false; return true; }
  var b=hit(SS_HB,x,y); if(!b||!b.enabled) return true;
  if(b.act==='apply') ssApply(); else if(b.act==='cancel') ssCancel();
  else if(b.act==='familiar') ssSetDraft(.75,0); else if(b.act==='explore') ssSetDraft(-.75,0); else ssSetDraft(0,0);
  return true;
}
function ssDrawNativeQueue(gr,r,x,qy,bottom){
  if(!ssState) return false;
  var list=(pbShuffle?ssState.remaining:ssState.native_next)||[], priority=ssState.queue||[], count=priority.length+list.length;
  var metrics=ssTrackTextMetrics(ssDensity,true);
  var rh=Math.max(56,metrics.height+metrics.title+4);
  var headerH=Math.round(30*ssDensity),act=Math.max(34,Math.round(32*ssDensity)),actGap=Math.round(5*ssDensity),width=r.w-36;
  var labelRemove=r.w>=380,removeW=labelRemove?Math.max(act,Math.round(50*ssDensity)):act;
  var source=ssState.source_name,showSource=source&&!isHiddenPl(source);
  var autoLabel=pbShuffle?'智能随机 · 本轮剩余':showSource?'歌单 · '+source:'歌单后续';
  var sections=[];
  if(priority.length)sections.push({label:'手动待播',scope:'priority',items:priority});
  if(list.length)sections.push({label:autoLabel,scope:pbShuffle?'remaining':'native',items:list});
  var queued=null;
  tL(gr,NP?'接下来':'待播放',FONT.sect,COL.text,x,qy,width,28); qy+=29;
  if(count){
    var canSort=priority.length>1||(list.length>1&&(pbShuffle||ssCanReorder(ssPlaylistInfo(list[0].playlist))));
    var sortW=canSort?Math.min(width,Math.round(114*ssDensity)):0;
    tL(gr,count+' 首',FONT.qArtist,COL.text2,x,qy,width-sortW,24);
    if(canSort)tR(gr,'长按拖动排序',FONT.pl,COL.text2,x+width-sortW,qy,sortW,24);
  }else{
    tL(gr,pbShuffle?(ssState.source?'本轮已播完，可重新开始一轮。':'播放歌单后查看待播曲目。'):'已到歌单末尾',FONT.plSub,COL.text2,x,qy,width,32);
  }
  qy+=30;
  var viewport=Math.max(0,bottom-qy),contentH=count*rh+sections.length*headerH;
  SS_QUEUE_MAX=Math.max(0,contentH-viewport);ssQueueScroll=clampPx(ssQueueScroll,SS_QUEUE_MAX);ssQueueScrollT=clampPx(ssQueueScrollT,SS_QUEUE_MAX);
  if(viewport<1||!count)return true;
  var drawScroll=Math.round(ssQueueScroll),top=qy,sectionY=top-drawScroll;
  var parentGr=gr,layer=ssBeginViewport('queue-list',gr,r.x,top,r.w,viewport);
  gr=layer.gr;
  try{
    for(var section of sections){
      if(sectionY>=bottom)break;
      var rowTop=sectionY+headerH,first=Math.max(0,Math.floor((top-rowTop)/rh));
      if(rowTop>top){
        gr.FillSolidRect(x,sectionY,width,1,COL.line);
        tL(gr,section.label,FONT.pl,COL.text,x,sectionY+1,width-58,headerH-1);
        tR(gr,section.items.length+' 首',FONT.qArtist,COL.text2,x,sectionY+1,width,headerH-1);
      }
      for(var i=first;i<section.items.length;i++){
        var rowY=rowTop+i*rh;
        if(rowY>=bottom)break;
        var tr=section.items[i],next=section===sections[0]&&i===0;
        if(queued===null&&ssQueueNeedsMetadata(tr)){
          try{queued=plman.GetPlaybackQueueContents()||[];}catch(e){queued=[];}
        }
        var meta=ssQueueDisplayMeta(tr,queued||[]);
        var hb={x0:x-8,y0:Math.max(top,rowY),x1:r.x+r.w-18,y1:Math.min(bottom,rowY+rh),rowY:rowY,rowH:rh,next:next};
        hb.track_id=tr.id;hb.scope=section.scope;hb.queueIndex=section.scope==='native'?tr.item:i;
        if(tr.playlist!==undefined){hb.pl=tr.playlist;hb.item=tr.item;}
        var right=r.x+r.w-18,actionY=rowY+Math.round((rh-act)/2);
        hb.more={x0:right-act,y0:actionY,x1:right,y1:actionY+act};
        if(section.scope==='priority')hb.remove={x0:hb.more.x0-actGap-removeW,y0:actionY,x1:hb.more.x0-actGap,y1:actionY+act};
        HB_Q.push(hb);
        var actionLeft=(hb.remove||hb.more).x0;
        ssDrawCachedRow(gr,'queue:'+section.scope+':'+i+':'+tr.id+':'+meta.t+':'+meta.a+(next?':next':''),r.x,rowY,r.w,rh,function(gr){
          ssDrawQueueTrackLabels(gr,meta.t,meta.a,x,rowY,actionLeft-x-Math.round(10*ssDensity),rh,metrics,next);
          ssDrawQueueAction(gr,hb.more,'more','');
          if(hb.remove)ssDrawQueueAction(gr,hb.remove,'close',labelRemove?'移除':'');
        });
      }
      sectionY=rowTop+section.items.length*rh;
    }
  }finally{layer.finish();}
  gr=parentGr;
  SS_QUEUE_SB=drawSBV(gr,r.x+r.w-10,top,viewport,ssQueueScroll,SS_QUEUE_MAX,viewport,contentH,hv(r.x,top,r.x+r.w,bottom)||drag==='scrollq',SB_QUEUE);
  return true;
}
function ssNativeLyrics(){
  if(ssLyricChild){ rightTab='lyrics'; ssSyncLyricPanel(); repaintAll(); return; }
  if(Number(window.ID)>0){ rightTab='lyrics'; ssNativeLyricKey=''; ssSyncLyricPanel(); repaintAll(); return; }
  // ESLyric's own menu remains available, independent of local timed lyrics.
  var cmds=['View/ESLyric/显示歌词面板','View/ESLyric/Show lyric panel','View/ESLyric/桌面歌词','View/ESLyric/Desktop lyric'];
  for(var i=0;i<cmds.length;i++){ try{ if(fb.RunMainMenuCommand(cmds[i])) return; }catch(e){} }
  openMenu('view',R.queue.x+16,R.queue.y+50);
}
