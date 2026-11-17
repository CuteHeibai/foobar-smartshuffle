/* Desktop home: playback entry, quick playlists and an album selection. */
var HB_HOME_CONTINUE=null,HB_HOME_ALBUMS=null,ssHomeFocus='';
var ssHomeAlbumSource=null,ssHomeAlbums=[];
var SS_HOME_ALBUM_LIMIT=9;

function ssHomeReleaseKey(title){
  return String(title||'').normalize('NFKC').trim().toLowerCase().replace(/\s*[\[(](?:disc|disk|cd)[ ._-]*\d+\s*[\])]\s*$/i,'');
}
var ssHomeNowTrack='',ssHomeNowRelease='';
function ssHomePlayingRelease(){
  if(!NP||typeof TF==='undefined')return '';
  var track=ssTrackID(NP);
  if(track!==ssHomeNowTrack){ssHomeNowTrack=track;ssHomeNowRelease=ssHomeReleaseKey(TF.album.EvalWithMetadb(NP));}
  return ssHomeNowRelease;
}

function ssHomeAlbumSelection(albums){
  if(ssHomeAlbumSource===albums)return ssHomeAlbums;
  ssHomeAlbumSource=albums;ssHomeAlbums=[];
  var artists=new Set(),titles=new Set();
  var ranked=albums.slice().sort(function(a,b){return (parseInt(b.year,10)||0)-(parseInt(a.year,10)||0);});
  for(var album of ranked){
    if(ssHomeAlbums.length===SS_HOME_ALBUM_LIMIT)break;
    var title=ssHomeReleaseKey(album.album);
    if(artists.has(album.artist)||titles.has(title))continue;
    artists.add(album.artist);titles.add(title);ssHomeAlbums.push(album);
  }
  for(var album of ranked){
    if(ssHomeAlbums.length===SS_HOME_ALBUM_LIMIT)break;
    var title=ssHomeReleaseKey(album.album);
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
  else HB_HOME_CONTINUE=ssDrawLabeledAction(gr,x,y,w,h,'浏览音乐库','search','browse');
  HB_HOME_CONTINUE.focus='primary';HB_HOME_CONTINUE.album=album;
  ssHomeFocusRing(gr,HB_HOME_CONTINUE,8);
}
function drawHome(gr,r){
  HB_CARD=[];HB_HOME_CONTINUE=HB_HOME_ALBUMS=null;SB=SBH=null;
  HOME_MAXROW=HOME_PLMAX=0;HOME_SHELF_Y0=HOME_SHELF_Y1=-1;
  var s=ssDensity,bottom=r.y+r.h,content=ssLibraryReadingRect(r),x=content.x,w=content.w,right=x+w;
  var bh=Math.round(38*s),bw=Math.min(w,Math.round(134*s));
  var selection=ssHomeAlbumSelection(getAlbumCatalog().albums),hasAlbums=selection.length>0,playingRelease=ssHomePlayingRelease();
  var featured=r.h>=Math.round(245*s)?selection[0]:null,hero=!!featured;
  selection=selection.filter(function(album){return album!==featured&&(!playingRelease||ssHomeReleaseKey(album.album)!==playingRelease);});
  var showTitle=r.h>=Math.round(55*s);
  var split=hero&&selection.length>0&&w>=Math.round(575*s)&&r.h>=Math.round(400*s);
  var wide=split&&w>=Math.round(1100*s);
  var ty=r.y+Math.round(12*s),titleH=Math.round(43*s),headingH=Math.round(26*s);
  var artY=r.y+Math.round(64*s),shelfX=x,shelfW=w;
  gr.FillSolidRect(r.x,r.y,r.w,r.h,COL.base);
  if(showTitle)tL(gr,'唱片室',FONT.title,COL.text,x,ty,Math.max(1,w-(hero?0:bw+16)),titleH);
  if(split){
    artY+=Math.min(Math.round(38*s),Math.max(0,Math.round((r.h-590*s)*.24)));
    var cover=Math.round((w>=970*s?330:w>=730*s?270:204)*s);
    if(wide)cover=Math.min(Math.round(420*s),Math.round(w*.29));
    cover=Math.min(cover,Math.max(1,r.h-Math.round(208*s)));
    var coverY=artY+Math.round(34*s),metaY=coverY+cover+Math.round(12*s);
    shelfX=x+cover+Math.round(36*s);shelfW=right-shelfX;
    tL(gr,'唱片推荐',FONT.sect,COL.text,x,artY,cover,headingH);
    drawRounded(gr,x,coverY,cover,6,featured.handle,featured.album);
    tL(gr,featured.album,FONT.title,COL.text,x,metaY,cover,Math.round(40*s));
    tL(gr,ssArtistName(featured.artist),FONT.meta,COL.text2,x,metaY+Math.round(42*s),cover,Math.round(23*s));
    ssDrawHomePrimary(gr,x,metaY+Math.round(70*s),cover,Math.max(40,Math.round(42*s)),featured);
  }else if(hero){
    var y=artY+Math.round(5*s),art=Math.min(Math.round(238*s),Math.floor(w*.40),r.h-Math.round(174*s));
    var tx=x+art+Math.round(32*s),tw=Math.max(1,right-tx);
    var labelY=y+Math.max(0,Math.round((art-116*s)/2));
    drawRounded(gr,x,y,art,7,featured.handle,featured.album);
    tL(gr,'唱片推荐',FONT.eyebrow,COL.text2,tx,labelY,tw,Math.round(20*s));
    tL(gr,featured.album,FONT.title,COL.text,tx,labelY+Math.round(22*s),tw,Math.round(42*s));
    tL(gr,ssArtistName(featured.artist),FONT.meta,COL.text2,tx,labelY+Math.round(64*s),tw,Math.round(20*s));
    var buttonH=Math.max(40,Math.round(42*s));
    ssDrawHomePrimary(gr,tx,labelY+Math.round(88*s),tw,buttonH,featured);
    artY=y+Math.max(art,Math.round(88*s)+buttonH)+Math.round(25*s);
  }else if(ty+bh<=bottom){
    ssDrawHomePrimary(gr,showTitle?right-bw:x,ty,bw,bh,null);
  }

  var grid=ssAlbumGrid(shelfW,s),size=grid.size,cols=Math.min(split?3:6,grid.cols);
  if(wide){
    cols=Math.min(4,grid.cols);
    size=Math.min(Math.round(280*s),Math.floor((shelfW-grid.gap*(cols-1))/cols));
  }
  var albums=selection.slice(0,Math.min(split?cols*2:6,8));
  var visibleCols=Math.max(1,Math.min(cols,albums.length));
  var gap=grid.gap;
  var shelfEnd=shelfX+visibleCols*size+(visibleCols-1)*gap;
  var top=artY+Math.round(34*s),viewportH=bottom-top;
  if(viewportH<1)return;
  var cardH=size+ssAlbumLabelHeight(s,1),rowStep=cardH+Math.round(18*s);
  var contentH=albums.length?Math.ceil(albums.length/cols)*rowStep-Math.round(18*s):Math.round(34*s);
  var maxPx=Math.max(0,contentH-viewportH);
  HOME_MAXROW=maxPx;homeScroll=clampPx(homeScroll,maxPx);homeScrollT=clampPx(homeScrollT,maxPx);
  var offset=Math.round(homeScroll),layer=maxPx?ssBeginViewport('home-albums',gr,shelfX,top,shelfW,viewportH):null;
  var cardsGr=layer?layer.gr:gr;
  try{
    for(var i=Math.floor(offset/rowStep)*cols;i<albums.length;i++){
      var ay=top+Math.floor(i/cols)*rowStep-offset;
      if(ay>=bottom)break;
      if(ay+cardH<=top)continue;
      drawLibraryAlbumCard(cardsGr,shelfX+(i%cols)*(size+gap),ay,size,albums[i],top,bottom);
    }
    if(!hasAlbums)tL(cardsGr,'还没有带专辑标签的歌曲',FONT.plSub,COL.text2,x,top-offset,w,Math.round(30*s));
  }finally{if(layer)layer.finish();}

  var linkW=hasAlbums?Math.min(Math.round(98*s),Math.floor(shelfW/2)):0;
  if(albums.length)tL(gr,'专辑选览',FONT.sect,COL.text,shelfX,artY,shelfW-linkW,headingH);
  if(linkW){
    var linkX=shelfEnd-linkW;
    HB_HOME_ALBUMS={x0:linkX,y0:artY,x1:linkX+linkW,y1:artY+headingH,act:'albums',focus:'albums'};
    var hot=hv(linkX,artY,linkX+linkW,artY+headingH);
    if(hot)ssFillContinuousRect(gr,linkX,artY,linkW,headingH,6,6,COL.rowHover);
    tC(gr,'全部专辑 ›',FONT.plSub,hot?COL.text:COL.text2,linkX,artY,linkW,headingH);
    ssHomeFocusRing(gr,HB_HOME_ALBUMS,6);
  }
  drawScrollbar(gr,r.x+r.w-10,top,viewportH,homeScroll,maxPx,viewportH,contentH,hv(r.x,top,r.x+r.w,bottom)||drag==='scroll');
}
