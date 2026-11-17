/* Desktop home: playback entry, quick playlists and an album selection. */
var HB_HOME_CONTINUE=null,HB_HOME_ALBUMS=null,ssHomeFocus='';
var ssHomeAlbumSource=null,ssHomeAlbums=[];

function ssHomeAlbumSelection(albums){
  if(ssHomeAlbumSource===albums)return ssHomeAlbums;
  ssHomeAlbumSource=albums;ssHomeAlbums=[];
  var artists=new Set(),titles=new Set();
  var ranked=albums.slice().sort(function(a,b){return (parseInt(b.year,10)||0)-(parseInt(a.year,10)||0);});
  for(var album of ranked){
    if(ssHomeAlbums.length===6)break;
    var title=album.album.trim().toLowerCase();
    if(artists.has(album.artist)||titles.has(title))continue;
    artists.add(album.artist);titles.add(title);ssHomeAlbums.push(album);
  }
  for(var album of ranked){
    if(ssHomeAlbums.length===6)break;
    var title=album.album.trim().toLowerCase();
    if(titles.has(title))continue;
    titles.add(title);ssHomeAlbums.push(album);
  }
  return ssHomeAlbums;
}
function ssHomeActionAt(x,y){
  if(HB_HOME_CONTINUE&&inRect(x,y,HB_HOME_CONTINUE))return HB_HOME_CONTINUE;
  return HB_HOME_ALBUMS&&inRect(x,y,HB_HOME_ALBUMS)?HB_HOME_ALBUMS:null;
}
function ssActivateHomeAction(target){
  if(target.act==='transport'){ssPlayOrPause();return;}
  if(target.act==='featured'){ssPlayCollection('play_album',[target.album]);return;}
  ssHomeFocus='';
  if(target.act==='albums'){view='albums';artScroll=artScrollT=0;}
  else{view='songs';songsScroll=songsScrollT=0;}
  repaintAll();
}
function ssHomeKey(key){
  if(view!=='home'||fsMode||drag||confirmDel||renameEdit||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen)return false;
  if(key!==9&&key!==13&&key!==27)return false;
  var actions=[];
  if(HB_HOME_CONTINUE)actions.push(HB_HOME_CONTINUE);
  if(HB_HOME_ALBUMS)actions.push(HB_HOME_ALBUMS);
  var focused=actions.findIndex(function(target){return target.focus===ssHomeFocus;});
  if(key===13){if(focused<0)return false;ssActivateHomeAction(actions[focused]);return true;}
  if(key===27&&focused<0)return false;
  var backwards=key===9&&utils.IsKeyPressed(16);
  var next=backwards?(focused<0?actions.length-1:focused-1):focused+1;
  ssHomeFocus=key===9&&actions[next]?actions[next].focus:'';
  repaintMain();
  return !!ssHomeFocus;
}
function ssHomeFocusRing(gr,box,radius){
  if(ssHomeFocus===box.focus)ssStrokeContinuousRect(gr,box.x0-2,box.y0-2,box.x1-box.x0+4,box.y1-box.y0+4,radius,radius,1,COL.green);
}
function ssDrawHomePrimary(gr,x,y,w,h,album){
  if(album)HB_HOME_CONTINUE=ssDrawAlbumPlayAction(gr,x,y,w,h);
  else{
    HB_HOME_CONTINUE={x0:x,y0:y,x1:x+w,y1:y+h,act:NP?'transport':'browse'};
    var hot=hv(x,y,x+w,y+h);
    ssFillContinuousRect(gr,x,y,w,h,8,8,hot?COL.greenHover:COL.green);
    tC(gr,NP?(fb.IsPlaying&&!fb.IsPaused?'暂停播放':'继续聆听'):'浏览音乐库',FONT.pl,COL.onAccent,x,y,w,h);
  }
  HB_HOME_CONTINUE.focus='primary';HB_HOME_CONTINUE.album=album;
  ssHomeFocusRing(gr,HB_HOME_CONTINUE,8);
}
function drawHome(gr,r){
  HB_CARD=[];HB_HOME_CONTINUE=HB_HOME_ALBUMS=null;SB=SBH=null;
  HOME_MAXROW=HOME_PLMAX=0;HOME_SHELF_Y0=HOME_SHELF_Y1=-1;
  var s=ssDensity,bottom=r.y+r.h,available=Math.max(1,r.w-2*M.cpad);
  var grid=ssAlbumGrid(available,s),gap=grid.gap,size=grid.size,cols=Math.min(5,grid.cols);
  var w=cols*size+(cols-1)*gap,x=r.x+Math.min(M.cpad,Math.floor((r.w-1)/2)),right=x+w;
  var bh=Math.round(38*s),bw=Math.min(w,Math.round(134*s));
  var selection=ssHomeAlbumSelection(getAlbumCatalog().albums),featured=!NP&&r.h>=Math.round(245*s)?selection[0]:null;
  var albums=selection.slice(featured?1:0,(featured?1:0)+Math.min(5,cols*(r.w>=640*s?1:2)));
  var ty=r.y+Math.round(10*s),titleH=Math.round(43*s);
  var showTitle=r.h>=Math.round(55*s),hero=(NP||featured)&&r.h>=Math.round(245*s);
  gr.FillSolidRect(r.x,r.y,r.w,r.h,COL.base);
  if(showTitle)tL(gr,'唱片室',FONT.title,COL.text,x,ty,Math.max(1,w-(hero?0:bw+gap)),titleH);
  var heroEnd=r.y+Math.round(58*s);
  if(hero){
    var y=r.y+Math.round(69*s),art=Math.min(Math.round(238*s),Math.floor(w*.40),r.h-Math.round(174*s));
    var tx=x+art+Math.round(32*s),tw=Math.max(1,right-tx);
    var labelY=y+Math.max(0,Math.round((art-116*s)/2));
    drawRounded(gr,x,y,art,7,NP||featured.handle,NP?'np':featured.album);
    tL(gr,NP?(fb.IsPaused?'已暂停':'正在播放'):'唱片推荐',FONT.eyebrow,COL.text2,tx,labelY,tw,Math.round(20*s));
    tL(gr,NP?npTitleStr:featured.album,FONT.title,COL.text,tx,labelY+Math.round(22*s),tw,Math.round(42*s));
    tL(gr,NP?npArtistStr:ssArtistName(featured.artist),FONT.meta,COL.text2,tx,labelY+Math.round(64*s),tw,Math.round(20*s));
    ssDrawHomePrimary(gr,tx,labelY+Math.round(88*s),featured?tw:Math.min(tw,bw),featured?Math.max(40,Math.round(42*s)):bh,featured);
    heroEnd=y+Math.max(art,Math.round(88*s)+(featured?Math.max(40,Math.round(42*s)):bh));
  }else if(ty+bh<=bottom){
    ssDrawHomePrimary(gr,showTitle?right-bw:x,ty,bw,bh,null);
  }

  var artY=heroEnd+Math.round((hero?29:7)*s),headingH=Math.round(27*s);
  var top=artY+Math.round(35*s),viewportH=bottom-top;
  if(viewportH<1)return;
  var cardH=size+ssAlbumLabelHeight(s),rowStep=cardH+Math.round(12*s);
  var contentH=albums.length?Math.ceil(albums.length/cols)*rowStep-Math.round(12*s):Math.round(34*s);
  var maxPx=Math.max(0,contentH-viewportH);
  HOME_MAXROW=maxPx;homeScroll=clampPx(homeScroll,maxPx);homeScrollT=clampPx(homeScrollT,maxPx);
  var offset=Math.round(homeScroll),layer=ssBeginViewport('home-albums',gr,r.x,top,r.w,viewportH);
  try{
    for(var i=Math.floor(offset/rowStep)*cols;i<albums.length;i++){
      var ay=top+Math.floor(i/cols)*rowStep-offset;
      if(ay>=bottom)break;
      if(ay+cardH<=top)continue;
      drawLibraryAlbumCard(layer.gr,x+(i%cols)*(size+gap),ay,size,albums[i],top,bottom);
    }
    if(!albums.length&&!selection.length)tL(layer.gr,'还没有带专辑标签的歌曲',FONT.plSub,COL.text2,x,top-offset,w,Math.round(30*s));
  }finally{layer.finish();}

  var linkW=selection.length?Math.min(Math.round(98*s),Math.floor(w/2)):0;
  if(albums.length)tL(gr,'专辑选览',FONT.sect,COL.text,x,artY,w-linkW,headingH);
  if(linkW){
    var visibleCols=Math.min(cols,albums.length),linkX=visibleCols?x+visibleCols*size+(visibleCols-1)*gap-linkW:right-linkW;
    HB_HOME_ALBUMS={x0:linkX,y0:artY,x1:linkX+linkW,y1:artY+headingH,act:'albums',focus:'albums'};
    var hot=hv(linkX,artY,linkX+linkW,artY+headingH);
    if(hot)ssFillContinuousRect(gr,linkX,artY,linkW,headingH,6,6,COL.rowHover);
    tC(gr,'全部专辑 ›',FONT.plSub,hot?COL.text:COL.text2,linkX,artY,linkW,headingH);
    ssHomeFocusRing(gr,HB_HOME_ALBUMS,6);
  }
  drawScrollbar(gr,r.x+r.w-10,top,viewportH,homeScroll,maxPx,viewportH,contentH,hv(r.x,top,r.x+r.w,bottom)||drag==='scroll');
}
