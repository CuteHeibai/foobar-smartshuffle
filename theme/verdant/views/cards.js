/* verdant/views/cards.js -- playlist + artist cards, shared by home and search
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Nothing may be painted outside [clipL,clipR): RepaintRect does not clip drawing, so anything
   spilling past the panel would be stranded on the neighbouring one by a panel-scoped repaint.
   Edge cards are therefore blitted through a bitmap with a source rect instead of being drawn
   wide and masked over afterwards. Hover and hit target clip to the same band. */
function drawPlaylistCard(gr,x,y,w,i,clipL,clipR){
  var h=w+M.cardTextH;
  var hx0=(clipL!==undefined&&x<clipL)?clipL:x, hx1=(clipR!==undefined&&x+w>clipR)?clipR:x+w;
  if(hx1<=hx0) return;
  var cardHov=hv(hx0,y,hx1,y+h), clipped=(hx0>x)||(hx1<x+w);
  var im=cardHov?null:plCardImg(i,w);
  if(!im && clipped) im=renderPlCard(i,w,cardHov);   // hovered, or art still loading, at an edge
  if(im) gr.DrawImage(im,hx0,y,hx1-hx0,h,hx0-x,0,hx1-hx0,h);
  else paintPlCard(gr,x,y,w,i,cardHov);
  // Draw over the cached card without mutating its cover bitmap. Fully clipped buttons have no target.
  var playSize=Math.round(44*ssDensity),playX=x+w-12*ssDensity-playSize,playY=y+w-12*ssDensity-playSize;
  if(playX>=hx0&&playX+playSize<=hx1)HB_PLPLAY.push(drawPlaylistPlay(gr,playX,playY,playSize,i));
  var dx=x+w-32;
  if(cardHov && dx>=hx0 && dx+32<=hx1) drawDots(gr,dx,y+(w-24)+16,i);
  HB_CARD.push({x0:hx0,y0:y,x1:hx1,y1:y+h,kind:'pl',id:i});
}
function paintArtistCard(gr,x,y,w,a,hov){
  gr.FillRoundRect(x,y,w,w+M.cardTextH,8,8,hov?COL.cardHover:COL.elev);
  var cs=w-24;
  ssDrawArtistAvatar(gr,x+12,y+12,cs,a.name);
  tC(gr,ssArtistName(a.name),FONT.card,COL.text,x+12,y+cs+18,w-24,20);
  tC(gr,'歌手',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
}
/* The artist grid is the bulk of a home frame -- ~30 cards on a wide window, each an antialiased
   rounded rect, a masked circular cover and two centred labels, all redrawn every paint. Cache
   them like playlist cards. Unlike playlists a library can have thousands of artists, so the
   cache is capped and dropped wholesale when it grows past the cap. */
// 120 could not hold a 269-artist library: measurement showed ~400 misses per 30 frames while
// scrolling home, i.e. a dozen cards re-rendered every frame instead of blitted
var artCardCache={}, artCardN=0, ART_CARD_CAP=400, artTick=0;
/* Least-recently-used eviction. Wiping the whole cache on overflow meant the very next frame had
   to re-render every visible card at once -- the worst possible moment, since overflow happens
   while scrolling. Dropping the oldest half instead keeps what is on screen and costs only the
   newly-revealed row. */
function evictArtCards(){
  var keys=[], k, i;
  for(k in artCardCache) keys.push(k);
  keys.sort(function(p,q){ return artCardCache[p].t-artCardCache[q].t; });
  var n=Math.floor(keys.length/2);
  for(i=0;i<n;i++) delete artCardCache[keys[i]];
  artCardN=keys.length-n;
}
function artCardImg(a,w){
  var key=a.name+'|'+w, e=artCardCache[key];
  if(e){ e.t=++artTick; return e.img; }
  // Artist portraits are independently verified; never gate on album artwork.
  if(artCardN>=ART_CARD_CAP) evictArtCards();
  var im=null;
  try{
    im=gdi.CreateImage(w,w+M.cardTextH); var g=im.GetGraphics();
    g.SetSmoothingMode(2);
    g.FillSolidRect(0,0,w,w+M.cardTextH,COL.base);
    paintArtistCard(g,0,0,w,a,false);
    im.ReleaseGraphics(g);
  }catch(e2){ im=null; }
  artCardCache[key]={img:im,t:++artTick}; artCardN++; return im;
}
function drawArtistCard(gr,x,y,w,a,clipTop,clipBot){
  var h=w+M.cardTextH;
  // clip drawing and the click target to the scroll viewport
  var vy0=(clipTop!==undefined&&y<clipTop)?clipTop:y, vy1=(clipBot!==undefined&&y+h>clipBot)?clipBot:y+h;
  if(vy1<=vy0) return;
  var hov=hv(x,vy0,x+w,vy1);
  var im=hov?null:artCardImg(a,w);                   // the one hovered card is painted live
  // angle/alpha omitted on purpose: passing them takes GdiGraphics' transform+colour-matrix path,
  // which is far slower than the plain blit these 1:1 draws need
  if(im) gr.DrawImage(im,x,vy0,w,vy1-vy0,0,vy0-y,w,vy1-vy0);
  else paintArtistCard(gr,x,y,w,a,hov);
  HB_CARD.push({x0:x,y0:vy0,x1:x+w,y1:vy1,kind:'artist',id:a.name});
}
