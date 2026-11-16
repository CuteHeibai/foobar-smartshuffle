/* verdant/views/bar.js -- bottom playback bar
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

function ctrlBtn(gr,name,cx,cyc,active,act,rad,isz){
  rad=rad||18; isz=isz||22;
  drawIcon(gr,name,active?COL.green:(hv(cx-rad,cyc-rad,cx+rad,cyc+rad)?COL.text:COL.text2),cx-rad,cyc-rad,rad*2,rad*2,isz);
  HB_CTRL.push({x0:cx-rad,y0:cyc-rad,x1:cx+rad,y1:cyc+rad,act:act});
}
// seek / volume track: filled progress on a dim rail, with a generously padded hitbox
function drawTrackBar(gr,x,y,w,th,trackCol,pos,progCol){
  gr.FillSolidRect(x,y,w,th,trackCol);
  var fw=Math.max(0,Math.round(w*pos)), col=progCol||COL.text;
  if(fw>0) gr.FillSolidRect(x,y,fw,th,col);
  var r=Math.max(3,Math.round(th*1.1)), cx=x+fw, cy=y+th/2;
  gr.FillEllipse(cx-r,cy-r,r*2,r*2,col);
  gr.FillEllipse(cx-r-2,cy-r-2,(r+2)*2,(r+2)*2,COL.base);
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
// A title owns only its text viewport. Cache the complete line on the footer's
// opaque background, then copy a moving crop so glyphs can never reach controls.
var ssFooterMarquee=null,ssFooterMarqueeTimer=null;
function ssFooterMarqueeAllowed(){
  return !!NP&&(fb.IsPlaying||fb.IsPaused)&&!fsMode&&
    !(typeof ssPopup!=='undefined'&&ssPopup)&&!(typeof ssModal!=='undefined'&&ssModal)&&
    !(typeof renameEdit!=='undefined'&&renameEdit)&&!(typeof ctxMenu!=='undefined'&&ctxMenu)&&
    !(typeof confirmDel!=='undefined'&&confirmDel)&&!(typeof dupPrompt!=='undefined'&&dupPrompt)&&
    !(typeof rgPrompt!=='undefined'&&rgPrompt)&&!(typeof sgMenuOpen!=='undefined'&&sgMenuOpen)&&
    !(typeof plSortMenuOpen!=='undefined'&&plSortMenuOpen)&&!(typeof vizMenuOpen!=='undefined'&&vizMenuOpen);
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
  var fitted=ssFitFont(gr,ssScriptFont(text,font),h),textW=Math.ceil(gr.CalcTextWidth(text,fitted));
  if(textW<=w){ssStopFooterMarquee();tL(gr,text,font,col,x,y,w,h);return;}
  var key=ssFooterTrackKey(),m=ssFooterMarquee;
  if(!m||m.track!==key||m.text!==text||m.font!==font||m.fitted!==fitted||m.w!==w||m.h!==h||m.col!==col||m.bg!==COL.black){
    ssStopFooterMarquee();
    var image=gdi.CreateImage(textW+2,h),g=image.GetGraphics();
    g.FillSolidRect(0,0,textW+2,h,COL.black);
    ssText(g,text,fitted,col,0,0,textW+2,h,0,false);image.ReleaseGraphics(g);
    m=ssFooterMarquee={track:key,text:text,font:font,fitted:fitted,w:w,h:h,col:col,bg:COL.black,image:image,
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
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  var s=ssDensity;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var playing=fb.IsPlaying&&!fb.IsPaused;
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
    drawIcon(gr,'clock',summary.now_later?COL.green:COL.text2,fx+28*s,fy,28*s,28*s,18*s);
    HB_CTRL.push({x0:fx+28*s,y0:fy,x1:fx+56*s,y1:fy+28*s,act:'later'});
  }
  // Transport sits between the now-playing block and a compact icon-only right cluster.
  var s2=ssDensity, ry=by+Math.round(M.barH*0.46);
  var fsx=W-Math.round(28*s2), qx=fsx-Math.round(44*s2), lx2=qx-Math.round(40*s2);
  var volW=Math.min(Math.round(76*s2),Math.max(48,R.barToolsW-236)), volX=lx2-Math.round(30*s2)-volW, vix=volX-Math.round(30*s2);
  var shx=vix-Math.round(42*s2);
  var leftInk=Math.min(R.barInfoW,tx+Math.max(gr.CalcTextWidth(npTitleStr,FONT.npTitle),gr.CalcTextWidth(npArtistStr,FONT.npArtist))+12*s2);
  var rightInk=shx-Math.round(30*s2);
  var transport=ssTransportLayout(W,leftInk,rightInk,s2),cxC=transport.center;R.transport=transport;
  var pcy=by+Math.round(M.barH*0.40), pb=(hv(cxC-27*s2,by+7*s2,cxC+27*s2,by+61*s2)?52:48)*s2, pbx=cxC-pb/2, pby=pcy-pb/2;
  ctrlBtn(gr,'prev',cxC-58*s2,pcy,false,'prev',22*s2,26*s2);
  gr.FillEllipse(pbx,pby,pb,pb,COL.play);
  drawIcon(gr,playing?'pause':'play',COL.onPlay,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+58*s2,pcy,false,'next',22*s2,26*s2);
  var sbW=transport.seekWidth, sbX=cxC-sbW/2, sbY=by+Math.round(M.barH*0.76);
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  HB_SEEK=drawTrackBar(gr,sbX,sbY,sbW,4*s2,COL.seekbg,pos,COL.green);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text3,sbX-Math.round(54*s2),sbY-Math.round(7*s2),Math.round(46*s2),Math.round(17*s2));
  tL(gr,fmtTime(len),FONT.time,COL.text3,sbX+sbW+Math.round(10*s2),sbY-Math.round(7*s2),Math.round(46*s2),Math.round(17*s2));
  drawIcon(gr,fsMode?'compress':'expand',hv(fsx-12*s2,ry-12*s2,fsx+12*s2,ry+12*s2)?COL.text:COL.text2,fsx-12*s2,ry-12*s2,24*s2,24*s2,20*s2);
  HB_CTRL.push({x0:fsx-14*s2,y0:ry-14*s2,x1:fsx+14*s2,y1:ry+14*s2,act:'fullscreen'});
  var qOn=typeof ssRightOpen!=='undefined'&&ssRightOpen&&rightTab==='queue';
  drawIcon(gr,'queue',qOn?COL.green:COL.text2,qx-10*s2,ry-10*s2,20*s2,20*s2,17*s2);
  HB_CTRL.push({x0:qx-14*s2,y0:ry-14*s2,x1:qx+14*s2,y1:ry+14*s2,act:'queue'});
  var lOn=typeof ssRightOpen!=='undefined'&&ssRightOpen&&rightTab==='lyrics';
  drawIcon(gr,'lyric',lOn?COL.green:COL.text2,lx2-10*s2,ry-10*s2,20*s2,20*s2,17*s2);
  HB_CTRL.push({x0:lx2-14*s2,y0:ry-14*s2,x1:lx2+14*s2,y1:ry+14*s2,act:'lyrics'});
  drawIcon(gr,'volume',hv(vix-10*s2,ry-10*s2,vix+10*s2,ry+10*s2)?COL.text:COL.text2,vix-10*s2,ry-10*s2,20*s2,20*s2,17*s2);
  HB_CTRL.push({x0:vix-12*s2,y0:ry-12*s2,x1:vix+12*s2,y1:ry+12*s2,act:'output'});
  drawIcon(gr,'shuffle',pbShuffle?COL.green:COL.text2,shx-10*s2,ry-10*s2,20*s2,20*s2,17*s2);
  HB_CTRL.push({x0:shx-14*s2,y0:ry-14*s2,x1:shx+14*s2,y1:ry+14*s2,act:'playback_mode'});
  HB_VOL=drawTrackBar(gr,volX,ry-Math.round(2*s2),volW,4*s2,COL.seekbg,clamp01(vol2pos(fb.Volume)));
  if(ssOutputError||ssError)tL(gr,ssOutputError||ssError,FONT.plSub,COL.error,shx-Math.round(20*s2),ry+Math.round(14*s2),Math.max(1,fsx-shx+Math.round(40*s2)),Math.round(20*s2));
}
