/* verdant/views/nav.js -- left sidebar: nav rows, playlist list, add-playlist footer
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

// one sidebar row: cover + name + subtitle. pi<0 draws the library mosaic instead of a playlist cover.
function drawNavRow(gr,y,h,on,hov,pi,name,sub){
  if(on||hov) gr.FillRoundRect(R.navLib.x+8,y,R.navLib.w-16,h-4,6,6,on?COL.rowActive:COL.rowHover);
  var s=ssDensity,cs=44*s, cx=R.navLib.x+16*s, cy=y+(h-cs)/2;
  if(pi>=0) drawPlCover(gr,cx,cy,cs,4,pi,name); else drawLibCover(gr,cx,cy,cs,4);
  var tx=cx+cs+12, tw=R.navLib.x+R.navLib.w-16-tx-((hov&&pi>=0)?26:0);   // leave room for the "..." button
  tL(gr,name,FONT.pl,on?COL.green:COL.text,tx,y+8*s,tw,20*s);
  tL(gr,sub,FONT.plSub,COL.text2,tx,y+30*s,tw,16*s);
}
function drawNav(gr){
  HB_PL=[];
  if(typeof HB_PERSONAL!=='undefined')HB_PERSONAL=[];
  // top card: Home + Search as two wide icon buttons spanning the sidebar
  panelBg(gr,R.navTop,COL.base);
  var s=ssDensity,m=16*s, g=12*s, bh=54*s, iy=R.navTop.y+Math.round((R.navTop.h-bh)/2);
  var bw=Math.floor((R.navTop.w-2*m-g)/2);
  var hx=R.navTop.x+m, sx2=hx+bw+g;
  var hon=(view==='home'), hhov=hv(hx,iy,hx+bw,iy+bh);
  if(hon||hhov) gr.FillRoundRect(hx,iy,bw,bh,10,10,hon?COL.rowActive:COL.rowHover);
  drawIcon(gr,'home',hon?COL.text:COL.text2,hx,iy-8*s,bw,bh-8*s,23*s);
  tC(gr,'首页',FONT.plSub,hon?COL.text:COL.text2,hx,iy+32*s,bw,22*s);
  HB_HOME={x0:hx,y0:iy,x1:hx+bw,y1:iy+bh};
  var son=(view==='search'), shov=hv(sx2,iy,sx2+bw,iy+bh);
  if(son||shov) gr.FillRoundRect(sx2,iy,bw,bh,10,10,son?COL.rowActive:COL.rowHover);
  drawIcon(gr,'search',son?COL.text:COL.text2,sx2,iy-8*s,bw,bh-8*s,23*s);
  tC(gr,'搜索',FONT.plSub,son?COL.text:COL.text2,sx2,iy+32*s,bw,22*s);
  HB_SEARCH={x0:sx2,y0:iy,x1:sx2+bw,y1:iy+bh};
  // The canvas gap between the two cards is inside the region repaintNavAll invalidates but is
  // painted by neither of them -- it used to survive only because a full paint cleared the whole
  // window first, so drawNav has to own it now.
  var gapY=R.navTop.y+R.navTop.h;
  gr.FillSolidRect(R.navTop.x,gapY,R.navTop.w,R.navLib.y-gapY,COL.black);
  // library card
  panelBg(gr,R.navLib,COL.base);
  tL(gr,'音乐库',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  var active=plman.ActivePlaylist, pls=visiblePlaylists();
  var footH=72*s, footTop=R.navLib.y+R.navLib.h-footH;   // pinned "add playlist" footer, always visible
  var pinY=R.navLib.y+48*s, pinH=58*s;
  var personalH=typeof ssPersonalEnabled==='function'&&ssPersonalEnabled()?Math.max(25*s,Math.min(34*s,(R.navLib.h-footH-48*s-pinH-40*s)/3)):0;
  // scrollable playlist list (continuous pixel scroll), cropped just above the footer
  var listTop=pinY+pinH+personalH*3+10*s, rh=58*s, cropY=footTop-6, viewH=Math.max(0,cropY-listTop);
  var contentH=pls.length*rh, maxPx=Math.max(0,contentH-viewH);
  NAV_MAX=maxPx;
  navScroll=clampPx(navScroll,maxPx); navScrollT=clampPx(navScrollT,maxPx);
  // honour a pending "scroll this playlist into view" request now that the row geometry is known
  if(navRevealPl>=0){
    var rk=-1, ri; for(ri=0;ri<pls.length;ri++){ if(pls[ri]===navRevealPl){ rk=ri; break; } }
    navRevealPl=-1;
    if(rk>=0){
      var rt=rk*rh, want=navScrollT;
      if(rt<want) want=rt;                                 // above the viewport: bring it to the top edge
      else if(rt+rh>want+viewH) want=rt+rh-viewH;          // below it: bring it to the bottom edge
      want=Math.max(0,Math.min(want,maxPx));
      if(want!==navScrollT){ navScrollT=want; startScrollAnim(); }   // eased, same as wheel scrolling
    }
  }
  for(var k=Math.floor(navScroll/rh); k<pls.length; k++){
    var ry=listTop+k*rh-navScroll; if(ry>=cropY) break;
    var i2=pls[k], nm=plName(i2);
    // clamp hover + click targets to the visible band: a row scrolled under the pinned
    // "All Songs" header is painted over, so it must not answer the mouse there either
    var hy0=Math.max(ry,listTop), hy1=Math.min(ry+rh,cropY);
    var rowHov=(hy1>hy0) && hv(R.navLib.x,hy0,R.navLib.x+R.navLib.w,hy1);
    drawNavRow(gr,ry,rh,view==='playlist'&&i2===active,rowHov,i2,nm,plCount(i2)+' 首歌曲');
    if(rowHov && ry>=listTop) drawDots(gr,R.navLib.x+R.navLib.w-32,ry+(rh-24)/2,i2);
    if(hy1>hy0) HB_PL.push({x0:R.navLib.x,y0:hy0,x1:R.navLib.x+R.navLib.w,y1:hy1,i:i2});
  }
  // crop partial rows top & bottom, redraw the sticky header block (title + All Songs), then the scrollbar
  // (clear starts below the panel's rounded corners so a square fill can't square them off)
  gr.FillSolidRect(R.navLib.x,R.navLib.y+M.radius+2,R.navLib.w,listTop-R.navLib.y-M.radius-2,COL.base);
  gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.base);
  tL(gr,'音乐库',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  drawNavRow(gr,pinY,pinH,view==='songs',hv(R.navLib.x,pinY,R.navLib.x+R.navLib.w,pinY+pinH),-1,'全部歌曲',fmtNum(libCount())+' 首歌曲');
  HB_ALLSONGS={x0:R.navLib.x,y0:pinY,x1:R.navLib.x+R.navLib.w,y1:pinY+pinH};
  if(personalH){
    var kinds=['history','favorites','later'],summary=ssState&&ssState.personal||{};
    for(var p=0;p<kinds.length;p++){
      var kind=kinds[p],py=pinY+pinH+p*personalH,on=view===kind,hot=hv(R.navLib.x,py,R.navLib.x+R.navLib.w,py+personalH);
      if(on||hot)gr.FillRoundRect(R.navLib.x+8,py,R.navLib.w-16,personalH-2,5,5,on?COL.rowActive:COL.rowHover);
      var count=summary[kind==='history'?'history_count':kind==='favorites'?'favorites_count':'later_count']||0;
      var tx=R.navLib.x+20*s,tw=Math.max(1,R.navLib.w-76*s);
      tL(gr,ssPersonalTitle(kind),FONT.pl,on?COL.green:COL.text2,tx,py,tw,personalH);
      tR(gr,fmtNum(count),FONT.plSub,COL.text3,R.navLib.x+R.navLib.w-54*s,py,34*s,personalH);
      HB_PERSONAL.push({x0:R.navLib.x+8,y0:py,x1:R.navLib.x+R.navLib.w-8,y1:py+personalH,kind:kind});
    }
  }
  gr.DrawLine(R.navLib.x+16,listTop-6,R.navLib.x+R.navLib.w-16,listTop-6,1,COL.line);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-9,listTop,viewH,navScroll,maxPx,viewH,contentH,hv(R.navLib.x,R.navLib.y,R.navLib.x+R.navLib.w,R.navLib.y+R.navLib.h)||drag==='scrolln');
  drawAddPlaylist(gr,footTop,footH);
}
// pinned sidebar footer: click to create a blank playlist, or drop files on it to import
function drawAddPlaylist(gr,footTop,footH){
  var bx=R.navLib.x+12, bw=R.navLib.w-24, by=footTop+6, bh=footH-16;
  var hot=hv(bx,by,bx+bw,by+bh), drop=navDropHover;
  var rad=Math.min(10,bw/2,bh/2);
  if(drop)      gr.FillRoundRect(bx,by,bw,bh,rad,rad,ssAccent(26));
  else if(hot)  gr.FillRoundRect(bx,by,bw,bh,rad,rad,COL.rowHover);
  strokeRound(gr,bx,by,bw,bh,rad,drop?2:1,drop?COL.green:(hot?COL.text3:COL.line));
  // circular badge, echoing the empty-playlist state in the main panel
  var bs=30, ax=bx+13, ay=by+Math.round((bh-bs)/2);
  gr.FillEllipse(ax,ay,bs,bs,drop?ssAccent(46):ssInk(hot?26:16));
  drawIcon(gr,'add',drop?COL.green:(hot?COL.text:COL.text2),ax,ay,bs,bs,18);
  var tx=ax+bs+12, tw=bx+bw-12-tx;
  if(drop){ tL(gr,'拖入以导入',FONT.pl,COL.green,tx,by+Math.round((bh-20)/2),tw,20); }
  else {
    var firstH=Math.max(Math.ceil(20*ssDensity),lineH(gr,FONT.pl)),secondH=Math.max(Math.ceil(17*ssDensity),lineH(gr,FONT.plSub)),gap=Math.ceil(4*ssDensity);
    if(firstH+secondH+gap<=bh-4){
      var ty=by+Math.round((bh-firstH-secondH-gap)/2);
      tL(gr,'新建歌单',FONT.pl,hot?COL.text:COL.text2,tx,ty,tw,firstH);
      tL(gr,'拖入文件或点击',FONT.plSub,COL.text3,tx,ty+firstH+gap,tw,secondH);
    }else tL(gr,'新建歌单',FONT.pl,hot?COL.text:COL.text2,tx,by,tw,bh);

  }
  HB_ADDPL={x0:bx,y0:by,x1:bx+bw,y1:by+bh};
}
