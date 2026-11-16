/* Desktop library navigation. Destinations share one icon rhythm; playlists keep their artwork. */
var HB_ARTISTS_NAV=null,HB_STATS_NAV=null;
function drawNavDestination(gr,y,h,icon,label,on,count){
  var s=ssDensity,x=R.navLib.x+10*s,w=R.navLib.w-20*s,hot=hv(x,y,x+w,y+h);
  if(on||hot)gr.FillRoundRect(x,y,w,h-2*s,6,6,on?COL.rowActive:COL.rowHover);
  var ink=on?COL.green:COL.text2;
  drawIcon(gr,icon,ink,x+8*s,y,24*s,h-2*s,18*s);
  var showCount=count!==undefined&&w>=185*s,countW=showCount?36*s:0;
  tL(gr,label,FONT.pl,ink,x+43*s,y,w-51*s-countW,h-2*s);
  if(showCount)tR(gr,fmtNum(count),FONT.plSub,on?COL.green:COL.text3,x+w-countW-10*s,y,countW,h-2*s);
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
function drawNavRow(gr,y,h,on,hov,pi,name,sub){
  var s=ssDensity,x=R.navLib.x+10*s,w=R.navLib.w-20*s;
  if(on||hov)gr.FillRoundRect(x,y,w,h-3*s,6,6,on?COL.rowActive:COL.rowHover);
  var cs=36*s,cx=x+8*s,cy=y+(h-cs)/2;
  if(pi>=0)drawRounded(gr,cx,cy,cs,4,plChoice(pi).single,name);else drawLibCover(gr,cx,cy,cs,4);
  var tx=cx+cs+12*s,tw=x+w-8*s-tx-((hov&&pi>=0)?22*s:0);
  tL(gr,name,FONT.pl,on?COL.green:COL.text,tx,y+7*s,tw,20*s);
  tL(gr,sub,FONT.plSub,COL.text3,tx,y+28*s,tw,17*s);
}
function drawNav(gr){
  HB_PL=[];if(typeof HB_PERSONAL!=='undefined')HB_PERSONAL=[];
  var s=ssDensity,bh=36*s;
  gr.FillSolidRect(R.navTop.x,R.navTop.y,R.navTop.w,R.navTop.h,COL.black);
  HB_HOME=drawNavDestination(gr,R.navTop.y+4*s,bh,'home','首页',view==='home');
  HB_SEARCH=drawNavDestination(gr,R.navTop.y+4*s+bh,bh,'search','搜索',view==='search');
  var gapY=R.navTop.y+R.navTop.h;
  gr.FillSolidRect(R.navTop.x,gapY,R.navTop.w,R.navLib.y-gapY,COL.black);
  gr.FillSolidRect(R.navLib.x,R.navLib.y,R.navLib.w,R.navLib.h,COL.black);
  var active=plman.ActivePlaylist,pls=visiblePlaylists(),footH=48*s,footTop=R.navLib.y+R.navLib.h-footH;
  var pinY=R.navLib.y+34*s,personalOn=typeof ssPersonalEnabled==='function'&&ssPersonalEnabled(),personalH=personalOn?32*s:0;
  var destBottom=pinY+bh*4+personalH*3,listTop=destBottom+34*s,rh=54*s,cropY=footTop-7*s,viewH=Math.max(0,cropY-listTop);
  var contentH=pls.length*rh,maxPx=Math.max(0,contentH-viewH);NAV_MAX=maxPx;
  navScroll=clampPx(navScroll,maxPx);navScrollT=clampPx(navScrollT,maxPx);
  if(navRevealPl>=0){
    var rk=-1;for(var ri=0;ri<pls.length;ri++)if(pls[ri]===navRevealPl){rk=ri;break;}
    navRevealPl=-1;
    if(rk>=0){var rt=rk*rh,want=navScrollT;if(rt<want)want=rt;else if(rt+rh>want+viewH)want=rt+rh-viewH;
      want=Math.max(0,Math.min(want,maxPx));if(want!==navScrollT){navScrollT=want;startScrollAnim();}}
  }
  for(var k=Math.floor(navScroll/rh);k<pls.length;k++){
    var ry=listTop+k*rh-navScroll;if(ry>=cropY)break;
    var i2=pls[k],nm=plName(i2),hy0=Math.max(ry,listTop),hy1=Math.min(ry+rh,cropY);
    var rowHov=hy1>hy0&&hv(R.navLib.x,hy0,R.navLib.x+R.navLib.w,hy1);
    drawNavRow(gr,ry,rh,view==='playlist'&&i2===active,rowHov,i2,nm,plCount(i2)+' 首歌曲');
    if(rowHov&&ry>=listTop)drawDots(gr,R.navLib.x+R.navLib.w-31*s,ry+(rh-24)/2,i2);
    if(hy1>hy0)HB_PL.push({x0:R.navLib.x,y0:hy0,x1:R.navLib.x+R.navLib.w,y1:hy1,i:i2});
  }
  gr.FillSolidRect(R.navLib.x,R.navLib.y,R.navLib.w,listTop-R.navLib.y,COL.black);
  gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.black);
  tL(gr,'音乐库',FONT.lib,COL.text3,R.navLib.x+18*s,R.navLib.y+8*s,R.navLib.w-36*s,22*s);
  HB_ALLSONGS=drawNavDestination(gr,pinY,bh,'music','全部歌曲',view==='songs'&&songsGroup!=='artist',libCount());
  HB_ALBUMS=drawNavDestination(gr,pinY+bh,bh,'albums','专辑',view==='albums'||view==='album');
  HB_ARTISTS_NAV=drawNavDestination(gr,pinY+bh*2,bh,'artists','歌手',view==='artist'||(view==='songs'&&songsGroup==='artist'));
  HB_STATS_NAV=drawNavDestination(gr,pinY+bh*3,bh,'stats','聆听统计',view==='stats');
  if(personalOn){
    var kinds=['history','favorites','later'],icons=['clock','heart','clock'],summary=ssState&&ssState.personal||{};
    for(var pi=0;pi<kinds.length;pi++){
      var kind=kinds[pi],count=summary[kind==='history'?'history_count':kind==='favorites'?'favorites_count':'later_count']||0;
      var hb=drawNavDestination(gr,pinY+bh*4+pi*personalH,personalH,icons[pi],ssPersonalTitle(kind),view===kind,count);hb.kind=kind;HB_PERSONAL.push(hb);
    }
  }
  tL(gr,'我的歌单',FONT.lib,COL.text3,R.navLib.x+18*s,destBottom+10*s,R.navLib.w-36*s,22*s);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-6,listTop,viewH,navScroll,maxPx,viewH,contentH,hv(R.navLib.x,listTop,R.navLib.x+R.navLib.w,cropY)||drag==='scrolln');
  drawAddPlaylist(gr,footTop,footH);
}
function drawAddPlaylist(gr,footTop,footH){
  var s=ssDensity,bx=R.navLib.x+10*s,bw=R.navLib.w-20*s,by=footTop+4*s,bh=footH-8*s;
  var hot=hv(bx,by,bx+bw,by+bh),drop=navDropHover;
  if(drop||hot)gr.FillRoundRect(bx,by,bw,bh,6,6,drop?COL.rowActive:COL.rowHover);
  drawIcon(gr,'add',drop?COL.green:COL.text2,bx+8*s,by,24*s,bh,18*s);
  tL(gr,drop?'拖入以导入':'新建歌单',FONT.pl,drop?COL.green:COL.text2,bx+43*s,by,bw-51*s,bh);
  HB_ADDPL={x0:bx,y0:by,x1:bx+bw,y1:by+bh};
}
