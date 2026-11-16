/* verdant/views/home.js -- home view: playlist shelf + album grid
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var HB_HOME_CONTINUE=null;
function drawHome(gr,r){
  HB_CARD=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rightEdge=x0+w, i;
  var gap=Math.round(24*ssDensity), cardW=Math.round(172*ssDensity), cols=Math.max(1,Math.floor((w+gap)/(cardW+gap)));
  cols=Math.max(1,cols);
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+M.cardTextH;
  var s=ssDensity;
  var gy=r.y+Math.round(119*s);
  var cropY=r.y+r.h, rowStep=cardH+Math.round(19*s), viewH=cropY-gy;
  var albums=getAlbumCatalog().albums;
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

  gr.FillSolidRect(r.x,r.y,r.w,Math.min(r.h,gy-r.y),COL.base);
  var buttonW=Math.min(Math.round(112*s),w*.39),buttonH=Math.round(36*s),buttonX=rightEdge-buttonW,buttonY=r.y+Math.round(34*s);
  HB_HOME_CONTINUE={x0:buttonX,y0:buttonY,x1:buttonX+buttonW,y1:buttonY+buttonH};
  tL(gr,'专辑',FONT.homeTitle,COL.text,x0,r.y+Math.round(19*s),Math.max(1,w-buttonW-16),Math.round(44*s));
  tL(gr,albums.length+' 张专辑',FONT.meta,COL.text2,x0,r.y+Math.round(62*s),Math.max(1,w-buttonW-16),Math.round(24*s));
  gr.FillRoundRect(buttonX,buttonY,buttonW,buttonH,6,6,hv(buttonX,buttonY,buttonX+buttonW,buttonY+buttonH)?COL.greenHover:COL.green);
  tC(gr,fb.IsPlaying&&!fb.IsPaused?'暂停':fb.IsPaused?'继续播放':'播放音乐',FONT.pl,COL.onAccent,buttonX,buttonY,buttonW,buttonH);

  HOME_SHELF_Y0=HOME_SHELF_Y1=HOME_PLMAX=plScroll=plScrollT=0;
  HOME_STRIDE=1;


  // ---- 3) album scrollbar (continuous, pixel) ----
  drawScrollbar(gr,x0+w+8,gy,viewH,homeScroll,maxPx,viewH,contentH,hv(x0,gy,x0+w+16,cropY)||drag==='scroll');
}
