/* verdant/views/queue.js -- right sidebar: queue and lyrics tabs
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Manually-queued rows have no playlist behind them, so their title/artist are formatted per
   handle rather than read from a playlist's meta. Cached by path: the queue redraws on every
   hover inside the panel, and two EvalWithMetadb calls per row per frame is pure interop. */
var qMetaCache={};
var ssQueueScroll=0,ssQueueScrollT=0,SS_QUEUE_MAX=0,SS_QUEUE_SB=null;
function qRowMeta(h){
  var p=ssTrackID(h), e=qMetaCache[p];
  if(!e) e=qMetaCache[p]={t:TF.title.EvalWithMetadb(h), a:TF.artist.EvalWithMetadb(h)};
  return e;
}
function ssQueueNeedsMetadata(row){
  return !row.title||row.title===row.id||/^file:\/\//i.test(row.title);
}
function ssQueueDisplayMeta(row,contents){
  if(!ssQueueNeedsMetadata(row))return {t:row.title,a:row.artist||''};
  for(var i=0;i<contents.length;i++){
    var handle=contents[i].Handle;
    if(handle&&ssTrackID(handle)===row.id){
      var meta=qRowMeta(handle);
      return {t:meta.t||'未知曲目',a:meta.a||row.artist||''};
    }
  }
  return {t:'未知曲目',a:row.artist||''};
}
function ssDrawQueueTrackLabels(gr,title,artist,x,y,w,h,metrics,next){
  var first=title,second='';
  if(ssMeasureText(gr,title,FONT.rowTitle)>w){
    var prefix=ssTitlePrefix(gr,title,w,FONT.rowTitle),space=prefix.lastIndexOf(' ');
    if(space>prefix.length*.72)prefix=prefix.slice(0,space);
    if(prefix){first=prefix;second=title.slice(prefix.length).trimStart();}
  }
  var height=(second?2:1)*metrics.title+(artist||next?metrics.detail:0);
  var top=y+Math.round((h-height)/2);
  ssDrawFixedLabel(gr,first,FONT.rowTitle,COL.text,x,top,w,metrics.title);
  top+=metrics.title;
  if(second){
    ssDrawFixedLabel(gr,second,FONT.rowTitle,COL.text,x,top,w,metrics.title);
    top+=metrics.title;
  }
  var inset=0;
  if(next){
    var nextWidth=Math.ceil(ssMeasureText(gr,'下一首',FONT.qArtist))+2;
    ssDrawFixedLabel(gr,'下一首',FONT.qArtist,COL.green,x,top,nextWidth,metrics.detail);
    inset=nextWidth+Math.round(8*ssDensity);
  }
  if(artist)ssDrawFixedLabel(gr,artist,FONT.rowArtist,COL.text2,x+inset,top,w-inset,metrics.detail);
}
function ssDrawQueueAction(gr,box){
  var w=box.x1-box.x0,h=box.y1-box.y0;
  var hot=!ssQuietRows&&hv(box.x0,box.y0,box.x1,box.y1);
  if(hot)ssFillContinuousRect(gr,box.x0+1,box.y0+1,w-2,h-2,6,6,COL.buttonHover);
  drawIcon(gr,'more',hot?COL.text:COL.text2,box.x0,box.y0,w,h,Math.round(h*.64));
}
// hover cue + click target for one queue row; rows are rh apart so the boxes tile exactly
function qRow(gr,r,x,qy,rh){
  var x0=x-8, y0=qy-6, x1=r.x+r.w-10, y1=qy+rh-6;
  if(ssRowHover(x0,y0,x1,y1)) ssFillContinuousRect(gr,x0,y0,x1-x0,y1-y0,6,6,COL.rowHover);
  return {x0:x0,y0:y0,x1:x1,y1:y1};
}
function ssDrawQueueNext(gr,r,y,h){
  var s=ssDensity,w=Math.round(55*s),x=r.x+r.w-24-w;
  tR(gr,'下一首',FONT.plSub,COL.text2,x,y,w,h);
  return w+Math.round(8*s);
}
// cover + title + artist, the layout every queue entry shares
function qEntry(gr,r,x,y,cs,h,seed,key,title,artist,tcol,next){
  drawCover(gr,x,y,cs,4,h,seed,key);
  var tx=x+cs+12,tw=r.w-36-cs-12,textH=Math.max(cs,ssTrackTextMetrics(ssDensity,true).height);
  if(next)tw-=ssDrawQueueNext(gr,r,y,textH);
  ssDrawTrackLabels(gr,title,artist,tcol,tx,y,tw,textH,ssDensity,true);
}
function ssDrawLyricsNotice(gr,r,title,description,detail,canPlay){
  var x=r.x+18,w=r.w-36,y=r.y+64;
  var h=Math.min(canPlay?154:detail?122:96,Math.max(0,r.h-76));
  if(h<76)return;
  ssFillContinuousRect(gr,x,y,w,h,8,8,COL.elev);
  drawIcon(gr,'lyric',COL.green,x+12,y+12,24,28,18);
  tL(gr,title,FONT.sect,COL.text,x+44,y+11,w-56,30);
  tL(gr,description,FONT.meta,COL.text2,x+14,y+47,w-28,26);
  if(detail&&h>=107)tL(gr,detail,FONT.plSub,COL.text2,x+14,y+74,w-28,28);
  if(canPlay&&h>=130){
    var bx=x+14,by=y+94,bw=Math.min(118,w-28),bh=36,hot=hv(bx,by,bx+bw,by+bh);
    ssFillContinuousRect(gr,bx,by,bw,bh,6,6,hot?COL.greenHover:COL.green);
    drawIcon(gr,'play',COL.onAccent,bx+6,by,28,bh,16);
    tL(gr,'播放音乐',FONT.pl,COL.onAccent,bx+38,by,bw-42,bh);
    SS_LYRIC_PLAY={x0:bx,y0:by,x1:bx+bw,y1:by+bh};
  }
}
var ssReleasedLyricFrame=null;
function ssDrawResizeLyrics(gr,r,drag){
  var h=Math.max(1,r.h-88);
  if(!drag.lyricFrame||drag.lyricTrack!==NP){
    var width=Math.max(1,drag.startWidth-36);
    var image=gdi.CreateImage(width,h),g=image.GetGraphics();
    try{
      g.FillSolidRect(0,0,width,h,COL.base);
      if(noLyrics())tC(g,'松开后继续显示歌词',FONT.meta,COL.text2,0,Math.floor(h/2)-13,width,26);
      else if(lyrics.synced){
        stopLyAnim();lySnap=true;
        drawRollingLyrics(g,0,0,width,h,FONT.lyric,COL.text,'c',COL.text2);
      }else drawStaticLyrics(g,0,width,6,h,FONT.lyric,0.45);
    }finally{image.ReleaseGraphics(g);}
    drag.lyricFrame=image;drag.lyricTrack=NP;
  }
  var frame=drag.lyricFrame,w=Math.min(frame.Width,Math.max(0,r.w-36));
  if(w>0)gr.DrawImage(frame,r.x+r.w-18-w,r.y+68,w,h,frame.Width-w,0,w,h);
}
function drawQueue(gr){
  if(!R.queue||R.queue.w<=0){HB_TABS=[];HB_Q=[];SS_LYRIC_BTN=SS_LYRIC_PLAY=null;SS_QUEUE_SB=null;return;}
  ssDrawQueueContent(gr);
  var r=R.queue;roundBottom(gr,r.x,r.y,r.w,r.h);
}
function ssDrawQueueContent(gr){
  HB_TABS=[]; HB_Q=[]; SS_LYRIC_BTN=SS_LYRIC_PLAY=null;SS_QUEUE_SB=null;
  var r=R.queue; panelBg(gr,r,COL.base);
  var x=r.x+18;
  var qOn=rightTab==='queue';
  tL(gr,'歌词',FONT.tab,qOn?COL.text2:COL.text,x,r.y+16,64,26);
  tL(gr,'队列',FONT.tab,qOn?COL.text:COL.text2,x+70,r.y+16,64,26);
  gr.FillSolidRect(x,r.y+48,r.w-36,1,COL.line);
  gr.FillSolidRect(qOn?x+70:x,r.y+46,50,3,COL.green);
  HB_TABS.push({x0:x-6,y0:r.y+8,x1:x+64,y1:r.y+48,tab:'lyrics'});
  HB_TABS.push({x0:x+70,y0:r.y+8,x1:x+134,y1:r.y+48,tab:'queue'});

  if(!qOn){
    SS_LYRIC_BTN={x0:r.x+r.w-86,y0:r.y+12,x1:r.x+r.w-12,y1:r.y+44};
    if(hv(SS_LYRIC_BTN.x0,SS_LYRIC_BTN.y0,SS_LYRIC_BTN.x1,SS_LYRIC_BTN.y1))
      ssFillContinuousRect(gr,SS_LYRIC_BTN.x0,SS_LYRIC_BTN.y0,74,32,5,5,COL.rowHover);
    tC(gr,'ESLyric',FONT.plSub,COL.text2,SS_LYRIC_BTN.x0,SS_LYRIC_BTN.y0,74,32);
    if(typeof NP!=='undefined'&&!NP){
      ssDrawLyricsNotice(gr,r,'尚未播放','播放后在此显示歌词','',ssHasTransportSource());
      return;
    }
    if(ssLyricVisible){ssReleasedLyricFrame=null;return;}
    if(ssReleasedLyricFrame){
      if(!ssResizing&&ssReleasedLyricFrame.lyricTrack===NP&&
         ((ssFlight&&ssFlight.op==='lyrics_panel')||ssOut.some(function(q){return q.op==='lyrics_panel';}))){
        ssDrawResizeLyrics(gr,r,ssReleasedLyricFrame);return;
      }
      ssReleasedLyricFrame=null;
    }
    loadLyrics();
    if(typeof ssDrawerDragging==='function'&&ssDrawerDragging()){
      ssDrawResizeLyrics(gr,r,ssResizing);return;
    }
    if(noLyrics()){
      ssDrawLyricsNotice(gr,r,'未找到歌词','将 .lrc 保存到歌曲旁，','或播放器的 lyrics 文件夹。',false);
      return;
    }
    var viewTop=r.y+68, viewBot=r.y+r.h-20, maxW=r.w-36;
    if(lyrics.synced) drawRollingLyrics(gr,r.x+18,viewTop,maxW,viewBot,FONT.lyric,COL.text,'c',COL.text2);
    else drawStaticLyrics(gr,r.x+18,maxW,viewTop+6,viewBot,FONT.lyric,0.45);
    return;
  }

  var qy=r.y+64,compactH=ssTrackTextMetrics(ssDensity,true).height;
  if(!NP&&typeof ssState!=='undefined'&&ssState&&ssState.resume){
    var saved=ssState.resume;
    tL(gr,'上次播放 · '+fmtTime(saved.seconds),FONT.plSub,COL.text2,x,qy,r.w-36,24);
    tL(gr,saved.title,FONT.rowTitle,COL.text,x,qy+26,r.w-36,30);
    qy+=62;
  }
  if(NP){
    drawIcon(gr,fb.IsPaused?'pause':'equalizer',COL.green,x,qy,18,24,15);
    tL(gr,fb.IsPaused?'已暂停':'播放中',FONT.plSub,COL.text2,x+23,qy,r.w-59,24);
    qy+=35;
  }

  var rh=Math.max(56,compactH+6), bottom=r.y+r.h-8, shown=0, qi;
  if(pbRepeat!==2 && ssDrawNativeQueue(gr,r,x,qy,bottom)) return;
  // real manual queue (explicitly-queued tracks) first, if any
  var mq=null; try{ mq=plman.GetPlaybackQueueHandles(); }catch(e){ mq=null; }
  if(mq && mq.Count){
    tL(gr,'优先播放',FONT.sect,COL.text,x,qy,r.w-110,24); qy+=36;
    for(qi=0;qi<mq.Count && shown<18;qi++){
      if(qy+rh>bottom) break;
      var qh=mq[qi]; if(!qh) continue;
      var qhb=qRow(gr,r,x,qy,rh); qhb.q=qi;qhb.scope='priority';qhb.queueIndex=qi;qhb.track_id=ssTrackID(qh);qhb.next=shown===0; HB_Q.push(qhb);
      var qm=qRowMeta(qh);
      qEntry(gr,r,x,qy,44,qh,'mq'+qi,undefined,qm.t,qm.a,COL.text,qhb.next);
      qy+=rh; shown++;
    }
    qy+=10;
  }
  // loop-one: playback just repeats the current song, so show only that
  if(pbRepeat===2){
    if(NP && qy+rh+30<bottom){
      tL(gr,shown?'单曲循环':'下一首 · 单曲循环',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
      qEntry(gr,r,x,qy,44,NP,'np',undefined,npTitleStr,npArtistStr,COL.green);
    }
    return;
  }
  // "Next up" from the playing playlist
  var loc=playingLoc();
  var pli=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist;
  var start=(loc&&loc.IsValid)?loc.PlaylistItemIndex+1:0;
  var rawnm=(pli>=0)?plName(pli):'';
  var pnm=rawnm===SHUF?(ssState?ssState.source_name:''):rawnm;
  if(isHiddenPl(pnm))pnm='';   // Show the source without exposing internal playlist names.
  if(qy+30<bottom){
    tL(gr,pnm?('来自歌单：'+pnm):'接下来',FONT.sect,COL.text,x,qy,r.w-110,24); qy+=36;
    // The playing playlist's metadata is built on ticks like everywhere else -- this runs on the
    // first paint whatever view you are in, so calling getMeta() inline stalled startup on a large
    // playlist even when you were nowhere near it.
    if(pli>=0 && !ensureBuilt('meta'+pli,function(){ return metaReady(pli); },function(){ return metaSteps(pli); })){
      if(skelVisible('meta'+pli)) skelRows(gr,x,qy,r.w-36,Math.min(bottom-qy,rh*4),rh);
    }
    else if(pli>=0){
      var items=getItems(pli), qmeta=getMeta(pli), cnt=plCount(pli);
      for(var k=start;k<cnt&&shown<20;k++){
        if(qy+rh>bottom) break;
        var h=items[k]; if(!h) continue;
        var nhb=qRow(gr,r,x,qy,rh); nhb.pl=pli;nhb.item=k;nhb.next=shown===0; HB_Q.push(nhb);
        qEntry(gr,r,x,qy,44,h,qmeta.album[k]||String(k),qmeta.artkey[k],qmeta.title[k],qmeta.artist[k],COL.text,nhb.next);
        qy+=rh; shown++;
      }
      if(shown===0) tL(gr,'已到歌单末尾',FONT.qArtist,COL.text3,x,qy,r.w-36,18);
    }
  }
}
