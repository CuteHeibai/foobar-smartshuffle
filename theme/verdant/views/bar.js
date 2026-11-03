/* verdant/views/bar.js -- bottom playback bar
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

function ctrlBtn(gr,name,cx,cyc,active,act,rad,isz){
  rad=rad||18; isz=isz||22;
  drawIcon(gr,name,active?COL.green:(hv(cx-rad,cyc-rad,cx+rad,cyc+rad)?COL.text:COL.text2),cx-rad,cyc-rad,rad*2,rad*2,isz);
  HB_CTRL.push({x0:cx-rad,y0:cyc-rad,x1:cx+rad,y1:cyc+rad,act:act});
}
// seek / volume track: filled progress on a dim rail, with a generously padded hitbox
function drawTrackBar(gr,x,y,w,th,trackCol,pos){
  gr.FillSolidRect(x,y,w,th,trackCol);
  if(pos>0) gr.FillSolidRect(x,y,Math.max(1,Math.round(w*pos)),th,COL.text);
  return {x0:x,y0:y-10,x1:x+w,y1:y+10+th,x:x,w:w};
}
function ssTransportLayout(w,left,right,s){
  var half=80*s,center=Math.round(w/2);
  if(right-left>=half*2)center=Math.round(Math.max(left+half,Math.min(center,right-half)));
  else center=Math.round((left+right)/2);
  var room=Math.max(0,Math.min(center-left,right-center));
  return {center:center,seekWidth:Math.max(24,Math.min(560*s,room*2-112*s))};
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
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  var s=ssDensity;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var playing=fb.IsPlaying&&!fb.IsPaused;
  // left: cover + title/artist
  var cs=Math.round(64*s), cx=Math.round(16*s), cy=by+(M.barH-cs)/2;
  drawCover(gr,cx,cy,cs,5,NP,'np');
  var tx=cx+cs+14*s;
  var personalSpace=NP&&typeof ssPersonalNow==='function'?56*s:0;
  ssDrawFooterTitle(gr,npTitleStr,FONT.npTitle,COL.text,tx,by+26*s,Math.max(20,R.barInfoW-tx-12*s-personalSpace),20*s);
  tL(gr,npArtistStr,FONT.npArtist,COL.text2,tx,by+50*s,Math.max(20,R.barInfoW-tx-12*s-personalSpace),18*s);
  if(personalSpace){
    var summary=ssState&&ssState.personal||{},fx=R.barInfoW-54*s,fy=by+(M.barH-28*s)/2;
    ssDrawPersonalHeart(gr,fx,fy,28*s,!!summary.now_favorite);
    HB_CTRL.push({x0:fx,y0:fy,x1:fx+28*s,y1:fy+28*s,act:'favorite'});
    drawIcon(gr,'clock',summary.now_later?COL.green:COL.text2,fx+28*s,fy,28*s,28*s,18*s);
    HB_CTRL.push({x0:fx+28*s,y0:fy,x1:fx+56*s,y1:fy+28*s,act:'later'});
  }
  // Anchor to the window, using actual side content rather than unused panel space.
  var prefX=W-R.barToolsW+6,modeW=R.barToolsW-114;
  var modeName=pbShuffle?'智能随机':(ssState&&ssState.order_name)||'顺序播放';
  var gearC=by+50*s,fsx=W-46,volW=Math.min(104*s,R.barToolsW-110),volX=fsx-24-volW,volY=gearC-2*s;
  var leftInk=Math.min(R.barInfoW,tx+Math.max(gr.CalcTextWidth(npTitleStr,FONT.npTitle),gr.CalcTextWidth(npArtistStr,FONT.npArtist))+12*s);
  var rightInk=Math.min(volX-32,prefX+Math.max(0,(modeW-gr.CalcTextWidth(modeName+' ▾',FONT.pl))/2));
  var transport=ssTransportLayout(W,leftInk,rightInk,s),cxC=transport.center;R.transport=transport;
  var pcy=by+34*s, pb=(hv(cxC-27*s,by+7*s,cxC+27*s,by+61*s)?52:48)*s, pbx=cxC-pb/2, pby=pcy-pb/2;
  ctrlBtn(gr,'prev',cxC-58*s,pcy,false,'prev',22*s,26*s);
  gr.FillEllipse(pbx,pby,pb,pb,COL.play);
  drawIcon(gr,playing?'pause':'play',COL.onPlay,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+58*s,pcy,false,'next',22*s,26*s);
  var sbW=transport.seekWidth, sbX=cxC-sbW/2, sbY=by+74*s;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  HB_SEEK=drawTrackBar(gr,sbX,sbY,sbW,5*s,COL.seekbg,pos);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-54*s,sbY-7*s,46*s,17*s);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+10*s,sbY-7*s,46*s,17*s);
  // right: volume + fullscreen
  tC(gr,modeName+' ▾',FONT.pl,pbShuffle?COL.green:COL.text,prefX,by+4*s,modeW,30*s);
  HB_CTRL.push({x0:prefX,y0:by+4*s,x1:prefX+modeW,y1:by+34*s,act:'playback_mode'});
  tC(gr,'音频输出 ▾',FONT.plSub,COL.text2,W-106,by+4*s,100,30*s);
  HB_CTRL.push({x0:W-106,y0:by+4*s,x1:W-6,y1:by+34*s,act:'output'});
  if(ssOutputError||ssError)tL(gr,ssOutputError||ssError,FONT.plSub,COL.error,prefX,by+70*s,R.barToolsW-16,22*s);
  drawIcon(gr,'expand',hv(fsx-8,gearC-16,fsx+30,gearC+16)?COL.text:COL.text2,fsx,gearC-13,26,26,22);
  HB_CTRL.push({x0:fsx-8,y0:gearC-16,x1:fsx+30,y1:gearC+16,act:'fullscreen'});
  drawIcon(gr,'volume',COL.text2,volX-32,gearC-13,26,26,22);
  HB_VOL=drawTrackBar(gr,volX,volY,volW,5,COL.seekbg,clamp01(vol2pos(fb.Volume)));
}
