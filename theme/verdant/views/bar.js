/* verdant/views/bar.js -- bottom playback bar
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

function ctrlBtn(gr,name,cx,cyc,active,act,rad,isz,enabled){
  rad=rad||18; isz=isz||22;
  drawIcon(gr,name,enabled===false?COL.text3:active?COL.green:(hv(cx-rad,cyc-rad,cx+rad,cyc+rad)?COL.text:COL.text2),cx-rad,cyc-rad,rad*2,rad*2,isz);
  if(enabled!==false)HB_CTRL.push({x0:cx-rad,y0:cyc-rad,x1:cx+rad,y1:cyc+rad,act:act});
}
// seek / volume track: filled progress on a dim rail, with a generously padded hitbox
function drawTrackBar(gr,x,y,w,th,trackCol,pos,progCol,bg){
  gr.FillSolidRect(x,y,w,th,trackCol);
  var fw=Math.max(0,Math.round(w*pos)), col=progCol||COL.text;
  if(fw>0) gr.FillSolidRect(x,y,fw,th,col);
  var r=Math.max(3,Math.round(th*1.1)), cx=x+fw, cy=y+th/2;
  gr.FillEllipse(cx-r,cy-r,r*2,r*2,col);
  gr.FillEllipse(cx-r-2,cy-r-2,(r+2)*2,(r+2)*2,bg===undefined?COL.base:bg);
  gr.FillEllipse(cx-r,cy-r,r*2,r*2,col);
  return {x0:x,y0:y-10,x1:x+w,y1:y+10+th,x:x,w:w};
}
function ssTransportLayout(w,left,right,s){
  var half=80*s,center=Math.round(w/2);
  if(right-left>=half*2)center=Math.round(Math.max(left+half,Math.min(center,right-half)));
  else center=Math.round((left+right)/2);
  var room=Math.max(0,Math.min(center-left,right-center));
  return {center:center,seekWidth:Math.max(24,Math.min(380*s,room*2-112*s))};
}
function ssHasTransportSource(){
  if(NP||fb.IsPlaying||fb.IsPaused)return true;
  if(ssState&&ssState.queue&&ssState.queue.length)return true;
  if(typeof plman==='undefined'||typeof plCount!=='function')return false;
  if(pbShuffle&&ssState&&ssState.source){
    var source=(ssState.playlists||[]).find(function(list){return list.guid===ssState.source;});
    if(source)return plCount(source.index)>0;
  }
  return plman.ActivePlaylist>=0&&plCount(plman.ActivePlaylist)>0;
}
function ssDrawTransport(gr,by,height,s,layout,trackBg,timeFont){
  timeFont=timeFont||FONT.time;
  var center=layout.center,cy=by+Math.round(height*.40),side=58*s,enabled=ssHasTransportSource();
  var hot=enabled&&hv(center-27*s,by+7*s,center+27*s,by+61*s);
  var size=(hot?52:48)*s,px=center-size/2,py=cy-size/2;
  ctrlBtn(gr,'prev',center-side,cy,false,'prev',22*s,26*s,enabled);
  var secondary=enabled&&layout.secondaryPlay;
  gr.FillEllipse(px,py,size,size,secondary?(hot?COL.hover:COL.elev):enabled?COL.play:COL.elev);
  drawIcon(gr,fb.IsPlaying&&!fb.IsPaused?'pause':'play',secondary?COL.text:enabled?COL.onPlay:COL.text3,px,py,size,size,Math.round(size*.5));
  if(enabled)HB_CTRL.push({x0:px,y0:py,x1:px+size,y1:py+size,act:'play'});
  ctrlBtn(gr,'next',center+side,cy,false,'next',22*s,26*s,enabled);

  var w=layout.seekWidth,x=center-w/2,y=by+Math.round(height*.76),th=4*s,len=Number(fb.PlaybackLength);
  HB_SEEK=null;
  if(!NP){
    if(layout.startLabel){
      var labelH=Math.round(20*s),labelW=Math.min(360*s,W),labelY=Math.round(py+size+4*s);
      tCE(gr,layout.startLabel,timeFont,secondary?COL.text2:COL.text,center-labelW/2,labelY,labelW,labelH);
    }
    if(!layout.hideIdleSeek)gr.FillSolidRect(x,y,w,th,COL.seekbg);
    return;
  }
  if(!(len>0)){gr.FillSolidRect(x,y,w,th,COL.seekbg);return;}
  var pos=drag==='seek'?dragFrac:clamp01(fb.PlaybackTime/len);
  HB_SEEK=drawTrackBar(gr,x,y,w,th,COL.seekbg,pos,COL.green,trackBg);
  HB_SEEK.y0=Math.max(HB_SEEK.y0,cy+size/2+1);
  var timeColor=layout.timeColor||COL.text2;
  tR(gr,fmtTime(drag==='seek'?len*dragFrac:fb.PlaybackTime),timeFont,timeColor,x-Math.round(54*s),y-Math.round(7*s),Math.round(46*s),Math.round(17*s));
  tL(gr,fmtTime(len),timeFont,timeColor,x+w+Math.round(10*s),y-Math.round(7*s),Math.round(46*s),Math.round(17*s));
}
function ssFooterToolEnd(s){return W-Math.round(28*s);}
function ssFooterToolY(by,height){return by+Math.round(height*.46);}
function ssFooterToolLayout(s,fullscreen){
  var end=ssFooterToolEnd(s),gap=Math.max(44,Math.round(46*s)),queue=end-gap,lyrics=queue-gap;
  var volW=Math.min(Math.round(76*s),Math.max(48,R.barToolsW-236)),volX=lyrics-Math.round(30*s)-volW;
  var output=volX-Math.round(30*s),modeWidth=Math.round((W>=1080?(fullscreen?120:104):38)*s);
  var modeLeft=output-Math.round(24*s)-modeWidth;
  return {end:end,queue:queue,lyrics:lyrics,volW:volW,volX:volX,output:output,modeLeft:modeLeft,modeWidth:modeWidth};
}
function ssPlaybackModeIndicator(){
  if(pbShuffle)return {icon:'shuffle',title:'智能随机',active:true};
  var order=ssState&&typeof ssState.native_order==='number'?ssState.native_order:(typeof pbRepeat==='number'?pbRepeat:0);
  if(order===1)return {icon:'repeat',title:'列表循环',active:true};
  if(order===2)return {icon:'repeat1',title:'单曲循环',active:true};
  if(order===0)return {icon:'sequence',title:'顺序播放',active:false};
  return {icon:'order',title:'播放模式',active:false};
}
function ssDrawFooterTools(gr,by,height,s,tools,fullscreen){
  var y=ssFooterToolY(by,height),mode=ssPlaybackModeIndicator();
  var lyricsOn=fullscreen?fsView==='lyrics':typeof ssRightOpen!=='undefined'&&ssRightOpen&&R.queue&&R.queue.w>0&&rightTab==='lyrics';
  var modeH=Math.round(36*s),modeBox={x0:tools.modeLeft,y0:y-modeH/2,x1:tools.modeLeft+tools.modeWidth,y1:y+modeH/2,act:'playback_mode'};
  var modeHot=hv(modeBox.x0,modeBox.y0,modeBox.x1,modeBox.y1),iconW=Math.round(34*s);
  if(modeHot)ssFillContinuousRect(gr,modeBox.x0,modeBox.y0,tools.modeWidth,modeH,6,6,COL.rowHover);
  drawIcon(gr,mode.icon,mode.active?COL.green:COL.text2,modeBox.x0,modeBox.y0,iconW,modeH,Math.round(21*s));
  if(tools.modeWidth>iconW+16)tL(gr,mode.title,tools.modeFont||FONT.plSub,COL.text2,modeBox.x0+iconW,modeBox.y0,tools.modeWidth-iconW-4,modeH);
  HB_CTRL.push(modeBox);
  var hint=ssDrawFooterTool(gr,tools.output,y,s,'output','volume',false,'音频输出');
  hint=ssDrawFooterTool(gr,tools.lyrics,y,s,'lyrics','lyric',lyricsOn,'歌词',tools.panelLabelFont)||hint;
  if(fullscreen){
    hint=ssDrawFooterTool(gr,tools.queue,y,s,'viz','equalizer',fsView==='viz','频谱',tools.panelLabelFont)||hint;
  }else{
    var queueOn=typeof ssRightOpen!=='undefined'&&ssRightOpen&&R.queue&&R.queue.w>0&&rightTab==='queue';
    hint=ssDrawFooterTool(gr,tools.queue,y,s,'queue','queue',queueOn,'播放队列')||hint;
  }
  // Keep this toggle at the desktop footer position when the fullscreen rail grows.
  var toggleScale=fullscreen?R.barScale:s,toggleY=fullscreen?ssFooterToolY(R.barY,M.barH):y;
  var toggleHint=ssDrawFooterTool(gr,ssFooterToolEnd(toggleScale),toggleY,toggleScale,'fullscreen',
    fullscreen?'compress':'expand',false,fullscreen?'退出全屏':'全屏');
  hint=toggleHint||hint;
  var labelY=by+Math.round(4*s),labelH=Math.round(19*s);
  if(fullscreen&&toggleHint)labelY=Math.floor(HB_CTRL[HB_CTRL.length-1].y0-labelH-5*toggleScale);
  if(hint||modeHot)tR(gr,hint||'播放模式 · '+mode.title,FONT.plSub,COL.text2,tools.modeLeft,labelY,
    tools.end-tools.modeLeft+Math.round(18*s),labelH);
  HB_VOL=drawTrackBar(gr,tools.volX,y-Math.round(2*s),tools.volW,4*s,COL.seekbg,clamp01(vol2pos(fb.Volume)),
    null,fullscreen?COL.base:COL.black);
  if(ssOutputError||ssError)tL(gr,ssOutputError||ssError,FONT.plSub,COL.error,tools.modeLeft,y+Math.round(20*s),
    Math.max(1,tools.end-tools.modeLeft+Math.round(20*s)),Math.round(20*s));
}
// A title owns only its text viewport. Cache the complete line on the footer's
// opaque background, then copy a moving crop so glyphs can never reach controls.
var ssFooterMarquee=null,ssFooterMarqueeTimer=null;
function ssFooterMarqueeAllowed(){
  return !!NP&&(fb.IsPlaying||fb.IsPaused)&&!fsMode&&
    !(typeof ssPopup!=='undefined'&&ssPopup)&&!(typeof ssModal!=='undefined'&&ssModal)&&
    !(typeof renameEdit!=='undefined'&&renameEdit)&&
    !(typeof confirmDel!=='undefined'&&confirmDel)&&!(typeof dupPrompt!=='undefined'&&dupPrompt)&&
    !(typeof rgPrompt!=='undefined'&&rgPrompt)&&!(typeof sgMenuOpen!=='undefined'&&sgMenuOpen)&&
    !(typeof plSortMenuOpen!=='undefined'&&plSortMenuOpen);
}
function ssFooterTrackKey(){return String(NP.RawPath||NP.Path||'')+'|'+String(NP.SubSong||0);}
function ssStopFooterMarquee(){
  if(ssFooterMarqueeTimer!==null){window.ClearInterval(ssFooterMarqueeTimer);ssFooterMarqueeTimer=null;}
  if(ssFooterMarquee&&ssFooterMarquee.image)try{ssFooterMarquee.image.Dispose();}catch(e){}
  ssFooterMarquee=null;
}
function ssFooterMarqueeOffset(now){
  var m=ssFooterMarquee,pause=900,travel=m.distance/m.speed*1000;
  var phase=Math.max(0,now-m.started)%(2*pause+2*travel);
  if(phase<pause)return 0;
  if(phase<pause+travel)return Math.round((phase-pause)*m.speed/1000);
  if(phase<2*pause+travel)return m.distance;
  return Math.round(m.distance-(phase-2*pause-travel)*m.speed/1000);
}
function ssFooterMarqueeTick(){
  if(!ssFooterMarqueeAllowed()){ssStopFooterMarquee();return;}
  var m=ssFooterMarquee;if(!m)return;
  var offset=ssFooterMarqueeOffset(Date.now());
  if(offset!==m.offset){m.offset=offset;repaintBar();}
}
function ssDrawFooterTitle(gr,text,font,col,x,y,w,h){
  x=Math.round(x);y=Math.round(y);w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
  if(!ssFooterMarqueeAllowed()){ssStopFooterMarquee();tL(gr,text,font,col,x,y,w,h);return;}
  var textW=Math.ceil(ssMeasureText(gr,text,font,h));
  if(textW<=w){ssStopFooterMarquee();tL(gr,text,font,col,x,y,w,h);return;}
  var key=ssFooterTrackKey(),m=ssFooterMarquee;
  if(!m||m.track!==key||m.text!==text||m.font!==font||m.w!==w||m.h!==h||m.col!==col||m.bg!==COL.black){
    ssStopFooterMarquee();
    var image=gdi.CreateImage(textW+2,h),g=image.GetGraphics();
    g.FillSolidRect(0,0,textW+2,h,COL.black);
    ssText(g,text,font,col,0,0,textW+2,h,0,false);image.ReleaseGraphics(g);
    m=ssFooterMarquee={track:key,text:text,font:font,w:w,h:h,col:col,bg:COL.black,image:image,
      distance:textW+2-w,speed:24*ssDensity,started:Date.now(),offset:0};
    ssFooterMarqueeTimer=window.SetInterval(ssFooterMarqueeTick,33);
  }
  m.offset=ssFooterMarqueeOffset(Date.now());
  gr.DrawImage(m.image,x,y,w,h,m.offset,0,w,h);
}
function ssDrawIdleRecord(gr,x,y,size){
  ssFillContinuousRect(gr,x,y,size,size,6,6,COL.elev);
  var d=Math.round(size*.44),ix=Math.round(x+(size-d)/2),iy=Math.round(y+(size-d)/2),dot=Math.max(2,Math.round(size*.07));
  gr.DrawEllipse(ix,iy,d,d,Math.max(1,Math.round(size*.035)),COL.text3);
  gr.FillEllipse(Math.round(x+(size-dot)/2),Math.round(y+(size-dot)/2),dot,dot,COL.text3);
}
function ssDrawFooterTool(gr,x,y,s,act,icon,active,label,labelFont){
  var panel=act==='queue'||act==='lyrics'||act==='fullscreen'||act==='viz';
  var size=panel?Math.max(38,Math.round((labelFont?44:40)*s)):Math.max(34,Math.round(34*s)),r=size/2;
  var box={x0:x-r,y0:y-r,x1:x+r,y1:y+r,act:act};
  var hot=hv(box.x0,box.y0,box.x1,box.y1);
  if(hot||(panel&&active))ssFillContinuousRect(gr,box.x0,box.y0,size,size,7,7,panel&&active?COL.rowActive:COL.rowHover);
  var color=active?COL.green:hot?COL.text:COL.text2,iconW=labelFont?Math.round(18*s):size;
  drawIcon(gr,icon,color,box.x0,box.y0,iconW,size,Math.round((act==='fullscreen'?24:labelFont?15:19)*s));
  if(labelFont)tL(gr,label,labelFont,color,box.x0+iconW+Math.round(2*s),box.y0,size-iconW-Math.round(3*s),size);
  HB_CTRL.push(box);
  return hot&&!labelFont?label:'';
}
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  var s=ssDensity;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  // left: cover + title/artist
  var cs=Math.round(64*s), cx=Math.round(16*s), cy=by+(M.barH-cs)/2;
  if(NP)drawCover(gr,cx,cy,cs,5,NP,'np');else ssDrawIdleRecord(gr,cx,cy,cs);
  var tx=cx+cs+14*s;
  var personalSpace=NP&&typeof ssPersonalEnabled==='function'&&ssPersonalEnabled()?56*s:0;
  ssDrawFooterTitle(gr,NP?npTitleStr:'尚未播放',FONT.npTitle,COL.text,tx,by+26*s,Math.max(20,R.barInfoW-tx-12*s-personalSpace),20*s);
  tL(gr,npArtistStr,FONT.npArtist,COL.text2,tx,by+50*s,Math.max(20,R.barInfoW-tx-12*s-personalSpace),18*s);
  if(personalSpace){
    var summary=ssState&&ssState.personal||{},fx=R.barInfoW-54*s,fy=by+(M.barH-28*s)/2;
    ssDrawPersonalHeart(gr,fx,fy,28*s,!!summary.now_favorite);
    HB_CTRL.push({x0:fx,y0:fy,x1:fx+28*s,y1:fy+28*s,act:'favorite'});
    drawIcon(gr,summary.now_later?'bookmarkFilled':'bookmark',summary.now_later?COL.green:COL.text2,fx+28*s,fy,28*s,28*s,18*s);
    HB_CTRL.push({x0:fx+28*s,y0:fy,x1:fx+56*s,y1:fy+28*s,act:'later'});
  }
  var tools=ssFooterToolLayout(s),transport=ssTransportLayout(W,R.barInfoW,tools.modeLeft-Math.round(8*s),s);
  R.transport=transport;
  ssDrawTransport(gr,by,M.barH,s,transport,COL.black);
  ssDrawFooterTools(gr,by,M.barH,s,tools,false);
}
