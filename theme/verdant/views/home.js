/* Desktop home: playback entry, quick playlists and an album selection. */
var HB_HOME_CONTINUE=null,HB_HOME_ALBUMS=null,HB_HOME_FEATURED=null,ssHomeFocus='';
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
  if(HB_HOME_FEATURED&&inRect(x,y,HB_HOME_FEATURED))return HB_HOME_FEATURED;
  return HB_HOME_ALBUMS&&inRect(x,y,HB_HOME_ALBUMS)?HB_HOME_ALBUMS:null;
}
function ssActivateHomeAction(target){
  if(target.act==='transport'){ssPlayOrPause();return;}
  if(target.act==='playlist'){playPlaylist(target.pl);return;}
  if(target.act==='featured'){ssPlayCollection('play_album',[target.album]);return;}
  ssHomeFocus='';
  if(target.act==='albums'){view='albums';artScroll=artScrollT=0;}
  else{view='songs';songsScroll=songsScrollT=0;}
  repaintAll();
}
function ssHomeKey(key){
  if(view!=='home'||fsMode||drag||ctxMenu||confirmDel||renameEdit||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen)return false;
  if(key!==9&&key!==13&&key!==27)return false;
  var actions=[];
  if(HB_HOME_CONTINUE)actions.push(HB_HOME_CONTINUE);
  if(HB_HOME_FEATURED)actions.push(HB_HOME_FEATURED);
  if(HB_HOME_ALBUMS)actions.push(HB_HOME_ALBUMS);
  for(var button of HB_PLPLAY)if(button.act==='playlist')actions.push(button);
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
function ssDrawHomePrimary(gr,x,y,w,h,quiet){
  HB_HOME_CONTINUE={x0:x,y0:y,x1:x+w,y1:y+h,act:NP?'transport':'browse',focus:'primary'};
  var hot=hv(x,y,x+w,y+h);
  if(!quiet||hot)ssFillContinuousRect(gr,x,y,w,h,8,8,quiet?COL.rowHover:hot?COL.greenHover:COL.green);
  tC(gr,NP?(fb.IsPlaying&&!fb.IsPaused?'暂停播放':'继续聆听'):'浏览音乐库',FONT.pl,quiet?COL.text2:COL.onAccent,x,y,w,h);
  ssHomeFocusRing(gr,HB_HOME_CONTINUE,8);
}
function ssDrawHomeShortcuts(gr,x,y,w,grid,pls,top,bottom){
  var s=ssDensity,hy=y+Math.round(33*s),h=Math.round(56*s);
  var size=Math.min(w,Math.floor((4*grid.size+grid.gap)/3)),stride=size+grid.gap;
  tL(gr,'歌单快捷入口',FONT.sect,COL.text,x,y,w,Math.round(26*s));
  if(hy>=bottom||hy+h<=top)return;
  var shelfW=pls.length*stride-grid.gap,right=x+w;
  HOME_PLMAX=Math.max(0,shelfW-w);HOME_STRIDE=stride;
  HOME_SHELF_Y0=Math.max(hy,top);HOME_SHELF_Y1=Math.min(hy+h,bottom);
  plScroll=clampPx(plScroll,HOME_PLMAX);plScrollT=clampPx(plScrollT,HOME_PLMAX);
  var ready=ensureBuilt('shelfh',function(){return shelfHandles!==null;},function(){return shelfSteps(pls);})&&gateReady('shelf',shelfHandles);
  if(!ready)skelCardsCached(gr,x,hy,w,h,size,grid.gap);
  else{
    var firstCard=HB_CARD.length,firstPlay=HB_PLPLAY.length;
    for(var i=Math.floor(plScroll/stride);i<pls.length;i++){
      var cx=Math.round(x+i*stride-plScroll);if(cx>=right)break;
      drawPlaylistShortcut(gr,cx,hy,size,h,pls[i],x,right);
    }
    for(var list of [HB_CARD,HB_PLPLAY]){
      var start=list===HB_CARD?firstCard:firstPlay;
      for(var i=list.length-1;i>=start;i--){
        list[i].y0=Math.max(top,list[i].y0);list[i].y1=Math.min(bottom,list[i].y1);
        if(list[i].y1<=list[i].y0)list.splice(i,1);
      }
    }
  }
  var sbY=hy+h+5;
  if(sbY>=top&&sbY+8<=bottom)drawScrollbarH(gr,x,sbY,w,plScroll,HOME_PLMAX,w,shelfW,hv(x,hy,right,sbY+8)||drag==='scrollh');
}
function drawHome(gr,r){
  HB_CARD=[];HB_HOME_CONTINUE=HB_HOME_ALBUMS=HB_HOME_FEATURED=null;SB=SBH=null;
  HOME_MAXROW=HOME_PLMAX=0;HOME_SHELF_Y0=HOME_SHELF_Y1=-1;
  var s=ssDensity,x=r.x+M.cpad,w=Math.max(1,r.w-M.cpad*2),right=x+w,bottom=r.y+r.h;
  var bh=Math.round(36*s),bw=Math.min(w,Math.round(128*s));
  var grid=ssAlbumGrid(w,s),gap=grid.gap,size=grid.size,cols=grid.cols;
  var selection=ssHomeAlbumSelection(getAlbumCatalog().albums);
  var albums=selection.slice(0,cols*(r.w>=640*s?1:2)),pls=visiblePlaylists().slice(0,3);
  var ty=r.y+Math.round(10*s),titleH=Math.round(43*s);
  var showTitle=r.h>=Math.round(55*s),fullTrack=NP&&r.h>=Math.round(210*s);
  gr.FillSolidRect(r.x,r.y,r.w,r.h,COL.base);
  if(showTitle)tL(gr,'唱片室',FONT.title,COL.text,x,ty,Math.max(1,w-(fullTrack?0:bw+gap)),titleH);
  if(fullTrack){
    var heroY=r.y+Math.round(64*s),coverSize=Math.min(Math.round(98*s),Math.floor(w*.34));
    var tx=x+coverSize+Math.round(18*s),tw=Math.max(1,right-tx);
    if(coverSize>0)drawRounded(gr,x,heroY,coverSize,7,NP,'np');
    tL(gr,npTitleStr,FONT.sect2,COL.text,tx,heroY,tw,Math.round(30*s));
    tL(gr,npArtistStr,FONT.meta,COL.text2,tx,heroY+Math.round(31*s),tw,Math.round(20*s));
    ssDrawHomePrimary(gr,tx,heroY+Math.round(56*s),Math.min(tw,bw),bh);
  }else if(ty+bh<=bottom){
    ssDrawHomePrimary(gr,showTitle?right-bw:x,ty,bw,bh,!NP&&albums.length>0);
  }

  var artY=r.y+Math.round((fullTrack?186:65)*s),headingH=Math.round(27*s);
  var top=artY+Math.round(35*s),viewportH=bottom-top;
  if(viewportH<1)return;
  var cardH=size+ssAlbumLabelHeight(s),rowStep=cardH+Math.round(12*s);
  var albumHeight=albums.length?Math.ceil(albums.length/cols)*rowStep-Math.round(12*s):Math.round(34*s);
  var shelfOffset=albumHeight+Math.round(20*s),contentH=pls.length?shelfOffset+Math.round(103*s):albumHeight;
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
    if(!albums.length)tL(layer.gr,'还没有带专辑标签的歌曲',FONT.plSub,COL.text2,x,top-offset,w,Math.round(30*s));
    var shelfY=top+shelfOffset-offset;
    if(pls.length&&shelfY<bottom)ssDrawHomeShortcuts(layer.gr,x,shelfY,w,grid,pls,top,bottom);
  }finally{layer.finish();}

  var linkW=albums.length?Math.min(Math.round(98*s),Math.floor(w/2)):0;
  var recentYear=new Date().getFullYear()-4;
  var recent=albums.length>0&&albums.every(function(album){return Number(album.year)>=recentYear;});
  tL(gr,recent?'近年发行':'专辑选览',FONT.sect,COL.text,x,artY,Math.min(w-linkW,Math.round(102*s)),headingH);
  if(!NP&&albums.length&&w>=Math.round(430*s)){
    var playX=x+Math.round(108*s),playW=Math.min(Math.round(195*s),w-linkW-(playX-x));
    var play={x0:playX,y0:artY,x1:playX+playW,y1:artY+headingH,act:'featured',focus:'featured',album:albums[0]};
    var playHot=hv(play.x0,play.y0,play.x1,play.y1);
    if(playHot)ssFillContinuousRect(gr,playX,artY,playW,headingH,6,6,COL.rowHover);
    drawIcon(gr,'play',COL.green,playX+3,artY,22,headingH,14);
    tL(gr,'播放 '+albums[0].album,FONT.plSub,COL.green,playX+27,artY,playW-30,headingH);
    HB_HOME_FEATURED=play;ssHomeFocusRing(gr,play,6);
  }
  if(linkW){
    var linkX=x+size*cols+gap*(cols-1)-linkW;
    HB_HOME_ALBUMS={x0:linkX,y0:artY,x1:linkX+linkW,y1:artY+headingH,act:'albums',focus:'albums'};
    var hot=hv(linkX,artY,linkX+linkW,artY+headingH);
    if(hot)ssFillContinuousRect(gr,linkX,artY,linkW,headingH,6,6,COL.rowHover);
    tC(gr,'全部专辑 ›',FONT.plSub,hot?COL.text:COL.text2,linkX,artY,linkW,headingH);
    ssHomeFocusRing(gr,HB_HOME_ALBUMS,6);
  }
  drawScrollbar(gr,right+8,top,viewportH,homeScroll,maxPx,viewportH,contentH,hv(x,top,right+16,bottom)||drag==='scroll');
}
