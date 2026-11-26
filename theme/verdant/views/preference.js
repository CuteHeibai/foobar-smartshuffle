/* Random preference modal: native preview is the only source of proposed tracks. */
var SS_HB=[], SS_GRID=null, SS_LYRIC_BTN=null, SS_LYRIC_PLAY=null;
var ssLyricChild=null, ssLyricTried=false, ssLyricVisible=false, ssLyricShown=null, ssLyricBounds='';
var ssNativeLyricKey='';
function ssStartLyricDrag(){
  ssPlaceLyrics(null);
}
function ssDrawerDragging(){
  return typeof ssResizing!=='undefined'&&ssResizing&&ssResizing.key==='right'&&!fsMode&&rightTab==='lyrics';
}
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
function ssDrawerLyricsRect(){
  var r=R.queue;
  if(!r||r.w<=80||r.h<=88) return null;
  return {x:r.x+18,y:r.y+68,w:r.w-36,h:r.h-88};
}
function ssRequestNativeLyrics(visible,r,fontSize,exclude){
  var parent=Number(window.ID)||0;
  if(!parent) return false;
  var p={parent:parent,visible:!!visible,appearance:typeof SS_APPEARANCE!=='undefined'?SS_APPEARANCE:'dark'};
  if(visible){
    r=r||ssDrawerLyricsRect();
    if(!r) return false;
    p.x=r.x; p.y=r.y; p.w=r.w; p.h=r.h;
    if(fontSize)p.font_size=fontSize;
    if(fontSize||(exclude&&exclude.length))p.exclude=exclude||[];
  }
  var key=JSON.stringify(p);
  if(key!==ssNativeLyricKey){ ssNativeLyricKey=key; ssSend('lyrics_panel',p); }
  return true;
}
function ssPlaceLyrics(r,fontSize,exclude){
  if(!ssLyricTried){
    ssLyricTried=true;
    try{ ssLyricChild=window.GetPanel('ESLyric'); }catch(e){ ssLyricChild=null; }
  }
  var state=ssState&&ssState.lyrics_panel;
  var nativeClip=state&&state.region_clip===true&&!ssLyricChild;
  if(r&&exclude&&exclude.length&&!nativeClip)r=ssLyricsClearOfMenu(r,exclude);
  var visible=!!r;
  if(ssLyricChild){
    try{
      if(visible){
        var key=[r.x,r.y,r.w,r.h].join(',');
        if(key!==ssLyricBounds){ ssLyricChild.Move(r.x,r.y,r.w,r.h,true); ssLyricBounds=key; }
      }
      if(ssLyricShown!==visible){ ssLyricChild.Show(visible); ssLyricShown=visible; }
      ssLyricVisible=visible;
      return;
    }catch(e){
      try{ ssLyricChild.Show(false); }catch(ignored){}
      ssLyricChild=null; ssLyricShown=null; ssLyricBounds='';
    }
  }
  ssLyricVisible=false;
  if(visible){
    ssLyricVisible=!!(ssRequestNativeLyrics(true,r,fontSize,nativeClip?exclude:[])&&state&&state.ready&&state.visible&&!state.error);
  }else if(ssNativeLyricKey||(state&&state.ready)) ssRequestNativeLyrics(false);
}
function ssLyricsMenuExclusions(){
  var levels=ssPopup.levels,out=[];
  for(var i=ssPopupFirstVisible();i<levels.length;i++){
    var r=levels[i].rect;
    if(r){
      var x=Math.floor(r.x)-SS_SUBMENU_EDGE,y=Math.floor(r.y)-SS_SUBMENU_EDGE;
      out.push({x:x,y:y,w:Math.ceil(r.x+r.w)+SS_SUBMENU_EDGE-x,h:Math.ceil(r.y+r.h)+SS_SUBMENU_EDGE-y});
    }
  }
  return out;
}
// Older components and named JSplitter children cannot apply window regions.
function ssLyricsClearOfMenu(r,exclude){
  for(var i=0;i<exclude.length;i++){
    var cut=exclude[i],right=r.x+r.w,bottom=r.y+r.h;
    if(cut.x>=right||cut.x+cut.w<=r.x||cut.y>=bottom||cut.y+cut.h<=r.y)continue;
    var choices=[
      {x:r.x,y:r.y,w:cut.x-r.x,h:r.h},
      {x:cut.x+cut.w,y:r.y,w:right-cut.x-cut.w,h:r.h},
      {x:r.x,y:r.y,w:r.w,h:cut.y-r.y},
      {x:r.x,y:cut.y+cut.h,w:r.w,h:bottom-cut.y-cut.h}
    ];
    r=choices.filter(function(p){return p.w>0&&p.h>0;}).sort(function(a,b){return b.w*b.h-a.w*a.h;})[0];
    if(!r)return null;
  }
  return r;
}
function ssSyncLyricPanel(){
  if(ssDrawerDragging())return;
  var r=null,fontSize=0,exclude=[];
  var liveLyrics=fsMode&&fsView==='lyrics';
  if((typeof NP==='undefined'||NP)&&(liveLyrics||!ssModal)&&
     !(typeof confirmDel!=='undefined'&&confirmDel)&&!(typeof renameEdit!=='undefined'&&renameEdit)&&
     !(typeof dupPrompt!=='undefined'&&dupPrompt)&&!(typeof rgPrompt!=='undefined'&&rgPrompt)){
    if(fsMode){
      if(fsView==='lyrics'){
        r=ssFsLyricsRect(W,H,ssFsStageBottom(W,H));
        fontSize=Math.max(26,Math.round(28*ssFsScale(W,H)));
        if(ssModal){
          var panel=ssGeometry(W,H);
          exclude.push({x:panel.x-4,y:panel.y-4,w:panel.w+8,h:panel.h+8});
        }
      }
    }else if(rightTab==='lyrics') r=ssDrawerLyricsRect();
  }
  if(r&&ssPopup)exclude=exclude.concat(ssLyricsMenuExclusions());
  ssPlaceLyrics(r,fontSize,exclude);
}
function ssLyricPanelAvailable(){
  if(ssLyricChild) return true;
  if(!Number(window.ID)) return false;
  var state=ssState&&ssState.lyrics_panel;
  if(state&&state.ready&&!state.error) return true;
  function showsLyrics(request){ return request&&request.op==='lyrics_panel'&&request.visible; }
  return !!(showsLyrics(ssFlight)||ssOut.some(showsLyrics));
}
function ssHideLyrics(){
  if(ssLyricTried)ssPlaceLyrics(null);else ssLyricVisible=false;
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
  var tracks=ssState&&ssState.preview&&ssState.preview.tracks;
  var withPreview=SS_GRID&&ssDragging?SS_GRID.withPreview:!!(tracks&&tracks.length);
  var mw=Math.min(withPreview?940:540,w-32),mh=Math.min(600,h-32),x=Math.round((w-mw)/2),y=Math.round((h-mh)/2);
  var left=withPreview?Math.round(mw*.49):0,top=y+(withPreview?104:126),areaH=mh-236;
  var rightX=x+(withPreview?left+28:24),rightW=x+mw-24-rightX,labelW=Math.ceil(46*UISCALE);
  var presetY=y+mh-118,gridY=top+32;
  var size=Math.max(1,Math.min(300,presetY-gridY-36,rightW-labelW*2-12));
  return {x:x,y:y,w:mw,h:mh,left:left,top:top,areaH:areaH,rightX:rightX,rightW:rightW,labelW:labelW,withPreview:withPreview,presetY:presetY,
    grid:{x:Math.round(rightX+(rightW-size)/2),y:gridY,size:size,withPreview:withPreview}};
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
  var count=m.withPreview?Math.min(tracks.length,8):0,hasSource=!!(ssState&&ssState.source);
  var pending=!!(ssState&&ssState.preview_pending);
  var notice=pending?'正在生成预览…':hasSource?'暂无可预览的歌曲':'播放歌单后即可生成预览';
  if(m.withPreview)tL(gr,count?'播放顺序预览 · 前 '+count+' 首':'播放顺序预览',FONT.sect,COL.text,px,m.top,pw,28);
  else tL(gr,notice,FONT.pl,COL.text,px,y+88,w-48,28);
  if(m.withPreview&&!count){
    var emptyY=m.top+Math.round(m.areaH*.33);
    drawIcon(gr,'queue',COL.text2,px,emptyY,pw,36,24);
    tC(gr,notice,FONT.pl,COL.text2,px+12,emptyY+44,pw-24,30);
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
  tC(gr,'极少听',FONT.pl,COL.text2,gx-m.labelW-4,gy+size/2-18,m.labelW,36);
  tC(gr,'最常听',FONT.pl,COL.text2,gx+size+4,gy+size/2-18,m.labelW,36);
  tC(gr,'风格相似',FONT.pl,COL.text2,m.rightX,gy+size+5,m.rightW,26);
  if(!staticOnly)ssDrawGlassBall(gr,gx,gy,size);
  var fy=m.presetY,gap=8,btnW=Math.floor((m.rightW-gap*2)/3),bh=36;
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
// Bridge snapshots replace the arrays. Reuse the counts while scrolling the same queue.
var ssQueueCountCache=null;
function ssQueueSongCounts(priority,following){
  if(ssQueueCountCache&&ssQueueCountCache.priority===priority&&ssQueueCountCache.following===following)return ssQueueCountCache;
  var manualIds=new Set(priority.map(function(row){return row.id;}));
  var followingIds=new Set(following.map(function(row){return row.id;}));
  var total=manualIds.size;
  for(var id of followingIds)if(!manualIds.has(id))total++;
  ssQueueCountCache={priority:priority,following:following,manual:manualIds.size,automatic:followingIds.size,total:total};
  return ssQueueCountCache;
}
function ssDrawNativeQueue(gr,r,x,qy,bottom){
  if(!ssState) return false;
  var list=(pbShuffle?ssState.remaining:ssState.native_next)||[], priority=ssState.queue||[], rowCount=priority.length+list.length;
  var counts=ssQueueSongCounts(priority,list);
  var metrics=ssTrackTextMetrics(ssDensity,true);
  var rh=Math.max(56,metrics.height+metrics.title+4);
  var headerH=Math.round(30*ssDensity),act=Math.max(34,Math.round(32*ssDensity)),width=r.w-36;
  var source=ssState.source_name,showSource=source&&!isHiddenPl(source);
  var autoLabel=pbShuffle?'智能随机 · 本轮剩余':showSource?'歌单 · '+source:'歌单后续';
  var sections=[];
  if(priority.length)sections.push({label:'手动待播',scope:'priority',items:priority,songs:counts.manual});
  if(list.length)sections.push({label:autoLabel,scope:pbShuffle?'remaining':'native',items:list,songs:counts.automatic});
  var queued=null;
  tL(gr,NP?'接下来':'待播放',FONT.sect,COL.text,x,qy,width,28); qy+=29;
  if(rowCount){
    var canSort=priority.length>1||(list.length>1&&(pbShuffle||ssCanReorder(ssPlaylistInfo(list[0].playlist))));
    var sortW=canSort?Math.min(width,Math.round(114*ssDensity)):0;
    tL(gr,counts.total+' 首',FONT.qArtist,COL.text2,x,qy,width-sortW,24);
    if(canSort)tR(gr,'长按拖动排序',FONT.pl,COL.text2,x+width-sortW,qy,sortW,24);
  }else{
    tL(gr,pbShuffle?(ssState.source?'本轮已播完，可重新开始一轮。':'播放歌单后查看待播曲目。'):'已到歌单末尾',FONT.plSub,COL.text2,x,qy,width,32);
  }
  qy+=30;
  var viewport=Math.max(0,bottom-qy),contentH=rowCount*rh+sections.length*headerH;
  SS_QUEUE_MAX=Math.max(0,contentH-viewport);ssQueueScroll=clampPx(ssQueueScroll,SS_QUEUE_MAX);ssQueueScrollT=clampPx(ssQueueScrollT,SS_QUEUE_MAX);
  if(viewport<1||!rowCount)return true;
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
        tR(gr,section.songs+' 首',FONT.qArtist,COL.text2,x,sectionY+1,width,headerH-1);
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
        hb.title=meta.t;hb.artist=meta.a;hb.track_id=tr.id;hb.scope=section.scope;hb.queueIndex=section.scope==='native'?tr.item:i;
        if(tr.playlist!==undefined){hb.pl=tr.playlist;hb.item=tr.item;}
        var right=r.x+r.w-18,actionY=rowY+Math.round((rh-act)/2);
        hb.more={x0:right-act,y0:actionY,x1:right,y1:actionY+act};
        HB_Q.push(hb);
        ssDrawCachedRow(gr,'queue:'+section.scope+':'+i+':'+tr.id+':'+meta.t+':'+meta.a+(next?':next':''),r.x,rowY,r.w,rh,function(gr){
          ssDrawQueueTrackLabels(gr,meta.t,meta.a,x,rowY,hb.more.x0-x-Math.round(6*ssDensity),rh,metrics,next);
          ssDrawQueueAction(gr,hb.more);
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
