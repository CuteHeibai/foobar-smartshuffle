/* verdant/views/nav.js -- left sidebar: Apple Music grouped nav, playlists, add-playlist footer
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var HB_ARTISTS_NAV=null,HB_STATS_NAV=null;
// one sidebar playlist row: compact cover + name + subtitle
function ssNavSelectFill(){return typeof ssInk==='function'?ssInk(typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark'?22:16):COL.rowActive;}
function ssNavHoverFill(){return typeof ssInk==='function'?ssInk(typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark'?12:8):COL.rowHover;}
function drawNavRow(gr,y,h,on,hov,pi,name,sub,picked){
  var s=ssDensity,pad=Math.round(12*s),rm=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),rs=typeof ssRad==='function'?ssRad('sm',s):Math.round(4*s);
  if(on||hov||picked) ssFillContinuousRect(gr,R.navLib.x+pad,y+2,R.navLib.w-pad*2,h-4,rm,rm,on||picked?ssNavSelectFill():ssNavHoverFill());
  var cs=Math.round(34*s), cx=R.navLib.x+Math.round(18*s), cy=y+Math.round((h-cs)/2);
  if(pi>=0) drawPlCover(gr,cx,cy,cs,rs,pi,name); else drawLibCover(gr,cx,cy,cs,rs);
  var right=R.navLib.x+R.navLib.w,tx=cx+cs+Math.round(10*s),tw=Math.max(1,right-pad-Math.round(8*s)-tx-(picked?36:(hov&&pi>=0)?24:0));
  tL(gr,name,FONT.pl,on?COL.text:COL.text,tx,y+Math.round(7*s),tw,Math.round(18*s));
  tL(gr,sub,FONT.plSub,COL.text3,tx,y+Math.round(25*s),tw,Math.round(15*s));
  if(picked)tC(gr,'\uE73E',FONT.icon,COL.green,right-52,y,24,h);
}
function ssDrawNavItem(gr,x,w,y,h,icon,label,on,hov,rightText,s){
  var pad=Math.round(12*s),rItem=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  if(on||hov) ssFillContinuousRect(gr,x+pad,y+1,w-pad*2,h-2,rItem,rItem,on?ssNavSelectFill():ssNavHoverFill());
  var isz=Math.round(16*s),ix=x+Math.round(20*s),iy=y+Math.round((h-isz)/2);
  drawIcon(gr,icon,on?COL.green:(hov?COL.text:COL.text2),ix,iy,isz,isz,isz);
  var tx=ix+isz+Math.round(10*s),countW=0;
  if(rightText){
    countW=Math.max(Math.round(36*s),Math.round((rightText.length*7+6)*s));
    var countX=x+w-pad-Math.round(6*s)-countW;
    tR(gr,rightText,FONT.plSub,COL.text3,countX,y,countW,h);
    countW+=Math.round(6*s);
  }
  var tw=Math.max(1,x+w-pad-Math.round(8*s)-countW-tx);
  tL(gr,label,FONT.pl,on?COL.text:(hov?COL.text:COL.text2),tx,y,tw,h);
}
function ssDrawNavSearchField(gr,x,w,y,h,on,hov,s){
  var pad=Math.round(12*s),bx=x+pad,bw=w-pad*2,rBox=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  ssFillContinuousRect(gr,bx,y,bw,h,rBox,rBox,on?COL.base:(hov?COL.hover:COL.input));
  if(typeof ssStrokeContinuousRect==='function')
    ssStrokeContinuousRect(gr,bx+.5,y+.5,bw-1,h-1,rBox,rBox,1,on?COL.green:COL.line);
  var isz=Math.round(15*s),ix=x+Math.round(20*s),iy=y+Math.round((h-isz)/2);
  drawIcon(gr,'search',on?COL.green:COL.text3,ix,iy,isz,isz,isz);
  var tx=ix+isz+Math.round(10*s),tw=Math.max(1,bx+bw-Math.round(10*s)-tx);
  tL(gr,'搜索',FONT.pl,on?COL.text:COL.text3,tx,y,tw,h);
  return {x0:bx,y0:y,x1:bx+bw,y1:y+h};
}
function drawNav(gr){
  if(typeof ssScrollGeometry!=='undefined')delete ssScrollGeometry.scrolln;
  HB_PL=[];
  if(typeof HB_PERSONAL!=='undefined')HB_PERSONAL=[];
  // Top primary navigation: macOS-style search field + Home entry.
  gr.FillSolidRect(R.navTop.x,R.navTop.y,R.navTop.w,R.navTop.h,COL.black);
  var s=ssDensity,pad=Math.round(12*s),topGap=Math.round(8*s);
  var searchH=Math.min(Math.round(30*s),Math.max(Math.round(24*s),Math.floor((R.navTop.h-topGap-Math.round(8*s))/2)));
  var itemH=Math.min(Math.round(30*s),Math.max(Math.round(24*s),Math.floor((R.navTop.h-topGap-Math.round(8*s))/2)));
  var sy=R.navTop.y+Math.round((R.navTop.h-searchH-itemH-topGap)/2),hy=sy+searchH+topGap;
  var son=(view==='search'),shov=hv(R.navTop.x+pad,sy,R.navTop.x+R.navTop.w-pad,sy+searchH);
  HB_SEARCH=ssDrawNavSearchField(gr,R.navTop.x,R.navTop.w,sy,searchH,son,shov,s);
  var hon=(view==='home'),hhov=hv(R.navTop.x+pad,hy,R.navTop.x+R.navTop.w-pad,hy+itemH);
  ssDrawNavItem(gr,R.navTop.x,R.navTop.w,hy,itemH,'home','首页',hon,hhov,'',s);
  HB_HOME={x0:R.navTop.x+pad,y0:hy,x1:R.navTop.x+R.navTop.w-pad,y1:hy+itemH};
  var gapY=R.navTop.y+R.navTop.h;
  gr.FillSolidRect(R.navTop.x,gapY,R.navTop.w,R.navLib.y-gapY,COL.black);
  gr.FillSolidRect(R.navLib.x,R.navLib.y,R.navLib.w,R.navLib.h,COL.black);
  var secX=R.navLib.x+Math.round(20*s),secW=Math.max(1,R.navLib.w-Math.round(36*s)),secH=Math.round(20*s),secPad=Math.round(4*s);
  var active=plman.ActivePlaylist, pls=visiblePlaylists();
  var footH=72*s, footTop=R.navLib.y+R.navLib.h-footH;   // pinned "add playlist" footer, always visible
  var rowH=Math.round(30*s),pinY=R.navLib.y+Math.round(48*s),libRowsH=rowH*4;
  tL(gr,'音乐库',FONT.plSub,COL.text3,secX,pinY-secH-secPad,secW,secH);
  var personalEnabled=typeof ssPersonalEnabled==='function'&&ssPersonalEnabled();
  var personalRoom=R.navLib.h-footH-48*s-libRowsH-40*s;
  var personalH=typeof ssPersonalTitle==='function'?Math.max(25*s,Math.min(rowH,personalRoom/3)):0;
  var groupGap=Math.round(14*s),secSpan=groupGap+secH+secPad;
  var secGap=personalH&&personalRoom>rowH*3+secSpan+Math.round(24*s)?secSpan:Math.round(6*s);
  var plHeadH=secSpan;
  // scrollable playlist list (continuous pixel scroll), cropped just above the footer
  var listTop=pinY+libRowsH+(personalH?secGap+personalH*3:0)+plHeadH, rh=Math.round(46*s), cropY=footTop-6, viewH=Math.max(0,cropY-listTop);
  // At short heights, scroll library shortcuts together with playlists.
  var scrollTop=pinY,shortRail=viewH<30*s,headerSpan=listTop-pinY;
  if(shortRail){
    viewH=Math.max(0,cropY-scrollTop);
    if(!viewH){HB_ALLSONGS=HB_ALBUMS=HB_ARTISTS_NAV=HB_STATS_NAV=SBN=null;NAV_MAX=0;drawAddPlaylist(gr,footTop,footH);return;}
  }
  var contentH=pls.length*rh+(shortRail?headerSpan:0), maxPx=Math.max(0,contentH-viewH);
  NAV_MAX=maxPx;
  navScroll=clampPx(navScroll,maxPx); navScrollT=clampPx(navScrollT,maxPx);
  // honour a pending "scroll this playlist into view" request now that the row geometry is known
  if(navRevealPl>=0){
    var rk=-1, ri; for(ri=0;ri<pls.length;ri++){ if(pls[ri]===navRevealPl){ rk=ri; break; } }
    navRevealPl=-1;
    if(rk>=0){
      var rt=rk*rh+(shortRail?headerSpan:0), want=navScrollT;
      if(rt<want) want=rt;
      else if(rt+rh>want+viewH) want=rt+rh-viewH;
      want=Math.max(0,Math.min(want,maxPx));
      if(want!==navScrollT){ navScrollT=want; startScrollAnim(); }
    }
  }
  var layer=null,outer=gr,playlistScroll=navScroll;
  if(shortRail){
    layer=ssBeginViewport('nav-library',gr,R.navLib.x,scrollTop,R.navLib.w,viewH);gr=layer.gr;
    gr.FillSolidRect(R.navLib.x,scrollTop,R.navLib.w,viewH,COL.black);
    pinY-=navScroll;listTop-=navScroll;playlistScroll=0;
  }
  for(var k=Math.max(0,Math.floor((shortRail?scrollTop-listTop:playlistScroll)/rh)); k<pls.length; k++){
    var ry=listTop+k*rh-playlistScroll; if(ry>=cropY) break;
    var i2=pls[k], nm=plName(i2);
    var hy0=Math.max(ry,listTop,shortRail?scrollTop:listTop), hy1=Math.min(ry+rh,cropY);
    var rowHov=(hy1>hy0) && hv(R.navLib.x,hy0,R.navLib.x+R.navLib.w,hy1);
    var info=ssPickedPlaylists.size&&ssPlaylistInfo(i2);
    drawNavRow(gr,ry,rh,view==='playlist'&&i2===active,rowHov,i2,nm,plCount(i2)+' 首歌曲',info&&ssPickedPlaylists.has(info.guid));
    if(rowHov && ry>=Math.max(listTop,shortRail?scrollTop:listTop)) drawDots(gr,R.navLib.x+R.navLib.w-32,ry+(rh-24)/2,i2);
    if(hy1>hy0) HB_PL.push({x0:R.navLib.x,y0:hy0,x1:R.navLib.x+R.navLib.w,y1:hy1,i:i2});
  }
  // crop partial rows top & bottom, redraw the sticky header block, then the scrollbar
  if(!shortRail){
    gr.FillSolidRect(R.navLib.x,R.navLib.y,R.navLib.w,listTop-R.navLib.y,COL.black);
    gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.black);
    tL(gr,'音乐库',FONT.plSub,COL.text3,secX,pinY-secH-secPad,secW,secH);
  }
  var libEntries=[
    {icon:'songs',label:'全部歌曲',on:view==='songs'&&songsGroup!=='artist',count:''},
    {icon:'album',label:'专辑',on:view==='albums'||view==='album',count:''},
    {icon:'artist',label:'歌手',on:view==='artist'||(view==='songs'&&songsGroup==='artist'),count:''},
    {icon:'stats',label:'聆听统计',on:view==='stats',count:''}
  ];
  for(var e=0;e<libEntries.length;e++){
    var ey=pinY+e*rowH,entry=libEntries[e];
    var eb=e===0?{x0:R.navLib.x,y0:ey,x1:R.navLib.x+R.navLib.w,y1:ey+rowH}:{x0:R.navLib.x+pad,y0:ey,x1:R.navLib.x+R.navLib.w-pad,y1:ey+rowH};
    ssDrawNavItem(gr,R.navLib.x,R.navLib.w,ey,rowH,entry.icon,entry.label,entry.on,hv(eb.x0,ey,eb.x1,eb.y1),entry.count,s);
    if(e===0)HB_ALLSONGS=eb;else if(e===1)HB_ALBUMS=eb;else if(e===2)HB_ARTISTS_NAV=eb;else HB_STATS_NAV=eb;
  }
  if(personalH){
    var pBase=pinY+libRowsH+secGap;
    if(secGap>=secSpan)tL(gr,'个人',FONT.plSub,COL.text3,secX,pBase-secH-secPad,secW,secH);
    var kinds=[{id:'history',icon:'clock'},{id:'favorites',icon:'heart'},{id:'later',icon:'bookmark'}],summary=ssState&&ssState.personal||{};
    for(var p=0;p<kinds.length;p++){
      var kind=kinds[p].id,py=pBase+p*personalH,on=view===kind,hot=hv(R.navLib.x+pad,py,R.navLib.x+R.navLib.w-pad,py+personalH);
      var count=summary[kind==='history'?'history_count':kind==='favorites'?'favorites_count':'later_count']||0;
      var countText=personalEnabled?(count>0?fmtNum(count):''):'关闭';
      ssDrawNavItem(gr,R.navLib.x,R.navLib.w,py,personalH,kinds[p].icon,ssPersonalTitle(kind),on,hot,countText,s);
      HB_PERSONAL.push({x0:R.navLib.x+pad,y0:py,x1:R.navLib.x+R.navLib.w-pad,y1:py+personalH,kind:kind});
    }
  }
  tL(gr,'歌单',FONT.plSub,COL.text3,secX,listTop-secH-secPad,secW,secH);
  if(shortRail){
    function clipped(box){
      box.y0=Math.max(box.y0,scrollTop);box.y1=Math.min(box.y1,cropY);
      return box.y0<box.y1?box:null;
    }
    HB_ALLSONGS=clipped(HB_ALLSONGS);HB_ALBUMS=clipped(HB_ALBUMS);
    HB_ARTISTS_NAV=clipped(HB_ARTISTS_NAV);HB_STATS_NAV=clipped(HB_STATS_NAV);
    if(personalH)HB_PERSONAL=HB_PERSONAL.filter(clipped);
    layer.finish();gr=outer;listTop=scrollTop;
  }
  if(navScroll>0)gr.DrawLine(R.navLib.x+12,listTop,R.navLib.x+R.navLib.w-12,listTop,1,COL.line);
  if(navScroll<maxPx)gr.DrawLine(R.navLib.x+12,cropY,R.navLib.x+R.navLib.w-12,cropY,1,COL.line);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-9,listTop,viewH,navScroll,maxPx,viewH,contentH,[R.navLib.x,R.navLib.y,R.navLib.x+R.navLib.w,R.navLib.y+R.navLib.h]);
  drawAddPlaylist(gr,footTop,footH);
}
// pinned sidebar footer: click to create a blank playlist, or drop files on it to import
function drawAddPlaylist(gr,footTop,footH){
  var s=ssDensity,pad=Math.round(10*s),bx=R.navLib.x+pad, bw=R.navLib.w-pad*2, bh=Math.min(footH-14,Math.round(40*s)), by=footTop+Math.round((footH-bh)/2);
  var hot=hv(bx,by,bx+bw,by+bh), drop=navDropHover, rAdd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  if(drop||hot) ssFillContinuousRect(gr,bx,by,bw,bh,rAdd,rAdd,drop?ssAccent(26):COL.rowHover);
  var isz=Math.round(16*s), ax=R.navLib.x+Math.round(18*s), ay=by+Math.round((bh-isz)/2);
  drawIcon(gr,'add',drop?COL.green:(hot?COL.text:COL.text2),ax,ay,isz,isz,isz);
  var tx=ax+isz+Math.round(10*s), tw=Math.max(1,bx+bw-Math.round(8*s)-tx);
  tL(gr,drop?'拖入以导入':'新建歌单',FONT.pl,drop?COL.green:(hot?COL.text:COL.text2),tx,by,tw,bh);
  HB_ADDPL={x0:bx,y0:by,x1:bx+bw,y1:by+bh};
}
