/* Personal pages use native metadata and the same clipped/cached row path as playlists. */
function ssPersonalDate(value){
  var n=Number(value);if(!isFinite(n)||n<=0)return '时间未知';var d=new Date(n<100000000000?n*1000:n);
  function pad(v){return v<10?'0'+v:String(v);}return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function ssPersonalOutcome(item){
  var labels={playing:'正在播放',completed:'已播完',skipped:'已跳过',stopped:'已停止',interrupted:'播放中断'};
  return (labels[item.outcome]||'未知状态')+' · '+(item.qualified?'有效收听':'未达有效收听')+' · 已听 '+fmtTime(Math.max(0,Number(item.listened)||0));
}
function ssDrawPersonalHeart(gr,x,y,size,active){
  drawIcon(gr,active?'heartFilled':'heart',active?COL.green:COL.text2,x,y,size,size,size*.65);
}
function ssDrawPersonalRowActions(gr){
  if(!ssPersonalEnabled()){HB_PERSONAL_ACTIONS=[];return;}
  var ids=[],prefetch=ssPersonalPrefetchRows(HB_TR);
  for(var i=0;i<HB_TR.length;i++){
    var row=HB_TR[i],index=ssPersonalPrefetchIndex(row),cachedID=prefetch&&index>=prefetch.start&&index<prefetch.end?prefetch.byIndex[index-prefetch.start]:'';
    var id=row.track_id||cachedID||ssPersonalRowID(row);if(!id)continue;ids.push(id);
    if(row.favoriteX===undefined)continue;
    var size=28*ssDensity,y=(row.rowY===undefined?row.y0:row.rowY)+((row.rowH||row.y1-row.y0)-size)/2;
    if(y<row.y0||y+size>row.y1)continue;
    ssDrawPersonalHeart(gr,row.favoriteX,y,size,ssPersonalFlag(id).favorite);
    HB_PERSONAL_ACTIONS.push({x0:row.favoriteX,y0:y,x1:row.favoriteX+size,y1:y+size,kind:'favorites',track_id:id});
  }
  ssPersonalVisible(ids,prefetch?prefetch.ids:[]);
}
function drawPersonal(gr,r){
  if(!ssPersonalEnabled())return;
  HB_TR=[];var s=ssDensity,lx=r.x+M.cpad,rx=r.x+r.w-M.cpad,w=rx-lx,p=ssPersonal;
  var titleY=r.y+18*s,titleH=34*s,subY=titleY+titleH+4*s,headY=subY+46*s,rowsTop=Math.round(headY+28*s);
  var footerH=Math.round(42*s),cropY=Math.max(rowsTop,Math.floor(r.y+r.h-footerH)),viewH=cropY-rowsTop,history=view==='history';
  tL(gr,ssPersonalTitle(view),FONT.sect2,COL.text,lx,titleY,w,titleH);
  tL(gr,history?'从启用后记录 · 最近90天，最多10000次播放':view==='later'?'手动管理，播放后仍会保留':'收藏按歌曲去重，不改写音乐文件',FONT.plSub,COL.text2,lx,subY,w,20*s);
  tL(gr,String(p.total)+(history?' 次播放':' 首歌曲'),FONT.plSub,COL.text2,lx,subY+23*s,w,20*s);
  var bw=Math.min(82*s,Math.max(48*s,w*.23)),gap=8*s,fy=r.y+r.h-36*s;
  function pageButton(label,x,delta,enabled){
    gr.FillRoundRect(x,fy,bw,28*s,5,5,enabled?COL.elev:COL.base);tC(gr,label,FONT.plSub,enabled?COL.text:COL.text3,x,fy,bw,28*s);
    if(enabled)HB_PERSONAL_ACTIONS.push({x0:x,y0:fy,x1:x+bw,y1:fy+28*s,page:delta});
  }
  pageButton('上一页',lx,-1,!p.loading&&p.offset>0);pageButton('下一页',rx-bw,1,!p.loading&&p.offset+p.limit<p.total);
  tC(gr,(Math.floor(p.offset/p.limit)+1)+' / '+Math.max(1,Math.ceil(p.total/p.limit)),FONT.plSub,COL.text2,lx+bw+gap,fy,Math.max(1,w-2*(bw+gap)),28*s);
  if(viewH<=0)return;
  if(p.loading||p.error||!p.items.length){
    tC(gr,p.loading?'正在加载…':p.error||(history?'还没有播放记录':view==='favorites'?'还没有收藏的歌曲':'暂时没有稍后听的歌曲'),FONT.pl,COL.text2,lx,rowsTop+16*s,w,28*s);
    if(p.error)HB_PERSONAL_ACTIONS.push({x0:lx,y0:rowsTop,x1:rx,y1:cropY,retry:true});return;
  }
  var wide=w>580*s,rh=Math.max(M.rowH,Math.round((history?(wide?76:98):66)*s)),contentH=p.items.length*rh,maxPx=Math.max(0,contentH-viewH);
  SS_PERSONAL_MAX=maxPx;ssPersonalScroll=clampPx(ssPersonalScroll,maxPx);ssPersonalScrollT=clampPx(ssPersonalScrollT,maxPx);
  var heartX=rx-28*s,laterX=heartX-30*s,durationX=laterX-54*s;
  var timeW=wide?146*s:0,timeX=durationX-timeW-10*s,titleX=lx+38*s,titleW=Math.max(20,(wide?timeX:durationX)-titleX-12*s);
  tL(gr,'歌曲',FONT.head,COL.text2,titleX,headY,titleW,22*s);
  if(wide)tL(gr,history?'播放时间':'添加时间',FONT.head,COL.text2,timeX,headY,timeW,22*s);
  gr.DrawLine(lx,headY+25*s,rx,headY+25*s,1,COL.line);
  var parent=gr,layer=ssBeginViewport('main-list',gr,r.x,rowsTop,r.w,viewH);gr=layer.gr;
  for(var i=Math.floor(ssPersonalScroll/rh);i<p.items.length;i++){
    var row=p.items[i],y=rowsTop+i*rh-Math.round(ssPersonalScroll);if(y>=cropY)break;
    var y0=Math.max(y,rowsTop),y1=Math.min(y+rh,cropY),handle=ssPersonalHandle(row.id),flag=ssPersonalFlag(row.id);
    ssDrawCachedRow(gr,'personal:'+view+':'+p.revision+':'+(row.event_id||row.id)+':'+i,r.x,y,r.w,rh,function(gr){
      var hov=ssRowHover(lx,y0,rx,y1);if(hov)gr.FillRoundRect(lx-6*s,y,w+12*s,rh,4,4,COL.rowHover);
      if(hov)drawIcon(gr,'play',COL.text,lx,y,28*s,rh,14*s);else tR(gr,String(p.offset+i+1),FONT.rowNum,COL.text2,lx,y,28*s,rh);
      // SDK handles are optional and never synthesized from JSON metadata.
      var cover=handle&&titleW>180*s?36*s:0,tx=titleX+(cover?cover+9*s:0),tw=titleW-(cover?cover+9*s:0);
      if(cover)drawCover(gr,titleX,y+10*s,cover,3,handle,row.album||row.title);
      tL(gr,row.title||'未知歌曲',FONT.rowTitle,COL.text,tx,y+8*s,tw,20*s);
      tL(gr,(row.artist||'未知歌手')+(wide&&row.album?' · '+row.album:''),FONT.rowArtist,COL.text2,tx,y+30*s,tw,16*s);
      var date=ssPersonalDate(history?row.started_at:row.added_at);
      if(history){
        tL(gr,ssPersonalOutcome(row),FONT.plSub,COL.text3,titleX,y+52*s,Math.max(20,durationX-titleX-8*s),18*s);
        if(!wide)tL(gr,date,FONT.plSub,COL.text3,titleX,y+74*s,Math.max(20,rx-titleX),18*s);
      }
      else if(!wide)tL(gr,date,FONT.plSub,COL.text3,titleX,y+48*s,Math.max(20,durationX-titleX-8*s),16*s);
      if(wide)tL(gr,date,FONT.rowCell,COL.text2,timeX,y,timeW,rh);
      tR(gr,fmtTime(Number(row.duration)||0),FONT.rowCell,COL.text2,durationX,y,48*s,rh);
      drawIcon(gr,'clock',flag.later?COL.green:COL.text2,laterX,y+(rh-26*s)/2,26*s,26*s,17*s);
    });
    var hb={x0:lx-6*s,y0:y0,x1:rx+6*s,y1:y1,rowY:y,rowH:rh,personal:true,idx:i,track_id:row.id,pgx0:lx,pgx1:lx+28*s,favoriteX:heartX};HB_TR.push(hb);
    var by=y+(rh-28*s)/2;if(by>=y0&&by+28*s<=y1)HB_PERSONAL_ACTIONS.push({x0:laterX,y0:by,x1:laterX+28*s,y1:by+28*s,kind:'later',track_id:row.id});
  }
  layer.finish();gr=parent;
  drawScrollbar(gr,rx+8*s,rowsTop,viewH,ssPersonalScroll,maxPx,viewH,contentH,hv(r.x,rowsTop,r.x+r.w,cropY)||drag==='scroll');
}
