/* verdant/views/home.js -- home view: playlist shelf + album grid
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var HB_HOME_CONTINUE=null;
function drawHome(gr,r){
  HB_CARD=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rightEdge=r.x+r.w, i;
  var gap=Math.round(16*ssDensity), cardW=Math.round(176*ssDensity), cols=Math.max(1,Math.floor((w+gap)/(cardW+gap)));
  cols=Math.max(1,cols);
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+M.cardTextH;
  // ---- geometry ----
  var entryH=Math.round(62*ssDensity),shelfTitleY=r.y+entryH+18, shelfY=shelfTitleY+38;
  var pls=visiblePlaylists();
  var scardW=(pls.length>cols)?Math.floor((w-cols*gap)/(cols+0.4)):cardW, scardH=scardW+M.cardTextH;
  var artTitleY=shelfY+scardH+(pls.length>cols?26:16), gy=artTitleY+42;   // album grid top
  var cropY=r.y+r.h, rowStep=cardH+8, viewH=cropY-gy;
  var albums=getAlbumCatalog().albums;
  var shelfReady=ensureBuilt('shelfh',function(){ return shelfHandles!==null; },function(){ return shelfSteps(pls); })
                 && gateReady('shelf',shelfHandles);
  var totalRows=Math.ceil(albums.length/cols), contentH=totalRows*rowStep, maxPx=Math.max(0,contentH-Math.max(0,viewH));
  HOME_MAXROW=maxPx;
  homeScroll=clampPx(homeScroll,maxPx); homeScrollT=clampPx(homeScrollT,maxPx);

  // The real album catalog does not depend on online artist verification. A bitmap viewport
  // owns every cover/text pixel as well as the clipped targets during continuous scrolling.
  if(viewH>0){
    var layer=ssBeginViewport('home-albums',gr,r.x,gy,r.w,viewH),offset=Math.round(homeScroll);
    try{
      for(i=Math.floor(offset/rowStep)*cols;i<albums.length;i++){
        var col=i%cols,row=Math.floor(i/cols),ay=gy+row*rowStep-offset;
        if(ay>=cropY)break;
        if(ay+cardH<=gy)continue;
        drawLibraryAlbumCard(layer.gr,x0+col*(cardW+gap),ay,cardW,albums[i],gy,cropY);
      }
      if(!albums.length)tL(layer.gr,'还没有带专辑标签的歌曲',FONT.plSub,COL.text2,x0,gy,w,32*ssDensity);
    }finally{layer.finish();}
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel

  // ---- 2) shelf + section titles drawn ON TOP (covers the grid's top overflow) ----
  gr.FillSolidRect(r.x,r.y,r.w,gy-r.y,COL.base);
  var buttonW=Math.min(Math.round(132*ssDensity),w*.35),buttonH=Math.round(34*ssDensity),buttonX=x0+w-buttonW,buttonY=r.y+Math.round(15*ssDensity);
  HB_HOME_CONTINUE={x0:buttonX,y0:buttonY,x1:buttonX+buttonW,y1:buttonY+buttonH};
  tL(gr,'唱片室',FONT.sect2,COL.text,x0,r.y+Math.round(10*ssDensity),Math.max(1,w-buttonW-16),Math.round(28*ssDensity));
  tL(gr,albums.length+' 张专辑',FONT.plSub,COL.text2,x0,r.y+Math.round(37*ssDensity),Math.max(1,w-buttonW-16),Math.round(20*ssDensity));
  gr.FillRoundRect(buttonX,buttonY,buttonW,buttonH,5,5,hv(buttonX,buttonY,buttonX+buttonW,buttonY+buttonH)?COL.rowActive:COL.elev);
  tC(gr,fb.IsPlaying&&!fb.IsPaused?'暂停播放':'继续聆听',FONT.pl,COL.green,buttonX,buttonY,buttonW,buttonH);
  tL(gr,'我的歌单',FONT.sect2,COL.text,x0,shelfTitleY,w,28);
  // continuous pixel scroll (same model as the album grid): start one card left of the viewport
  // so a partially-scrolled card still draws -- drawPlaylistCard clips it to [x0,rightEdge)
  var stride=scardW+gap, shelfW=Math.max(0,pls.length*stride-gap);
  HOME_PLMAX=Math.max(0,shelfW-w); HOME_STRIDE=stride;
  plScroll=clampPx(plScroll,HOME_PLMAX); plScrollT=clampPx(plScrollT,HOME_PLMAX);
  if(!shelfReady){
    skelCardsCached(gr,x0,shelfY,w,scardH,scardW,gap); shimmer(gr,x0,shelfY,w,scardH);
  } else {
    for(i=Math.floor(plScroll/stride);i<pls.length;i++){
      // snap to whole pixels: the eased offset is fractional, and an antialiased card at a
      // sub-pixel x leaves a translucent fringe at the clip seam
      var cx=Math.round(x0+i*stride-plScroll); if(cx>=rightEdge) break;
      drawPlaylistCard(gr,cx,shelfY,scardW,pls[i],x0,rightEdge);
    }
  }
  HOME_SHELF_Y0=shelfY; HOME_SHELF_Y1=shelfY+scardH;
  var sbY=shelfY+scardH+6;
  drawScrollbarH(gr,x0,sbY,w,plScroll,HOME_PLMAX,w,shelfW,hv(x0,shelfY,rightEdge,sbY+10)||drag==='scrollh');
  tL(gr,'音乐库中的专辑',FONT.sect2,COL.text,x0,artTitleY,w,28);

  // ---- 3) album scrollbar (continuous, pixel) ----
  drawScrollbar(gr,x0+w+8,gy,viewH,homeScroll,maxPx,viewH,contentH,hv(x0,gy,x0+w+16,cropY)||drag==='scroll');
}
