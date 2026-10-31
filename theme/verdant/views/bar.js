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
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var playing=fb.IsPlaying&&!fb.IsPaused;
  // left: cover + title/artist
  var cs=64, cx=16, cy=by+(M.barH-cs)/2;
  drawCover(gr,cx,cy,cs,5,NP,'np');
  var tx=cx+cs+14;
  tL(gr,npTitleStr,FONT.npTitle,COL.text,tx,by+26,Math.max(80,W/2-150-tx),20);
  tL(gr,npArtistStr,FONT.npArtist,COL.text2,tx,by+50,Math.max(80,W/2-150-tx),18);
  // center: transport row + seekbar
  var cxC=Math.round(W/2);
  var pcy=by+34, pb=hv(cxC-27,by+7,cxC+27,by+61)?52:48, pbx=cxC-pb/2, pby=pcy-pb/2;
  ctrlBtn(gr,'shuffle',cxC-108,pcy,pbShuffle,'shuffle',22,26);
  ctrlBtn(gr,'prev',cxC-58,pcy,false,'prev',22,26);
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  drawIcon(gr,playing?'pause':'play',COL.black,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+58,pcy,false,'next',22,26);
  ctrlBtn(gr,pbRepeat===2?'repeat1':'repeat',cxC+108,pcy,pbRepeat>0,'repeat',22,26);
  var sbW=Math.min(Math.round(W*0.36),560), sbX=cxC-sbW/2, sbY=by+74;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  HB_SEEK=drawTrackBar(gr,sbX,sbY,sbW,5,COL.seekbg,pos);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-54,sbY-7,46,17);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+10,sbY-7,46,17);
  // right: volume + fullscreen
  var prefX=W-282;
  tC(gr,'随机偏好',FONT.pl,COL.green,prefX,by+4,112,30);
  HB_CTRL.push({x0:prefX,y0:by+4,x1:prefX+112,y1:by+34,act:'preference'});
  tC(gr,'音频输出',FONT.plSub,COL.text2,prefX+118,by+4,90,30);
  HB_CTRL.push({x0:prefX+118,y0:by+4,x1:prefX+208,y1:by+34,act:'output'});
  tC(gr,'新一轮',FONT.plSub,COL.text2,prefX+212,by+4,66,30);
  HB_CTRL.push({x0:prefX+212,y0:by+4,x1:prefX+278,y1:by+34,act:'restart'});
  var scan=ssState&&ssState.scan;
  var scanText=scan?('分析 '+scan.completed+'/'+scan.total+(scan.failed?' · 失败 '+scan.failed:'')):'等候智能随机组件';
  tL(gr,ssOutputError||ssError||scanText,FONT.plSub,(ssError||ssOutputError)?RGB(245,150,130):COL.text3,prefX,by+70,170,22);
  if(scan){
    tC(gr,scan.paused?'继续':'暂停',FONT.plSub,COL.text2,W-110,by+68,52,26);
    HB_CTRL.push({x0:W-110,y0:by+68,x1:W-58,y1:by+94,act:'scan_pause'});
    if(scan.failed){
      tC(gr,'重试',FONT.plSub,COL.green,W-56,by+68,48,26);
      HB_CTRL.push({x0:W-56,y0:by+68,x1:W-8,y1:by+94,act:'scan_retry'});
    }
  }
  var gearC=by+50, fsx=W-46;
  drawIcon(gr,'expand',hv(fsx-8,gearC-16,fsx+30,gearC+16)?COL.text:COL.text2,fsx,gearC-13,26,26,22);
  HB_CTRL.push({x0:fsx-8,y0:gearC-16,x1:fsx+30,y1:gearC+16,act:'fullscreen'});
  var volW=104, volX=fsx-24-volW, volY=gearC-2;
  drawIcon(gr,'volume',COL.text2,volX-32,gearC-13,26,26,22);
  HB_VOL=drawTrackBar(gr,volX,volY,volW,5,COL.seekbg,clamp01(vol2pos(fb.Volume)));
}
