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
  var playSize=Math.round(40*ssDensity),playX=x+w-14*ssDensity-playSize,playY=y+w-14*ssDensity-playSize;
  if(playX>=hx0&&playX+playSize<=hx1){var pbh={x0:playX,y0:playY,x1:playX+playSize,y1:playY+playSize};if(cardHov)pbh=drawPlaylistPlay(gr,playX,playY,playSize,i);HB_PLPLAY.push(pbh);}
  var dx=x+w-32;
  if(cardHov && dx>=hx0 && dx+32<=hx1) drawDots(gr,dx,y+12,i);
  HB_CARD.push({x0:hx0,y0:y,x1:hx1,y1:y+h,kind:'pl',id:i});
}
function drawPlaylistShortcut(gr,x,y,w,h,i,clipL,clipR){
  var left=Math.max(x,clipL),right=Math.min(x+w,clipR);if(right<=left)return;
  var s=ssDensity,hot=hv(left,y,right,y+h),image=gdi.CreateImage(w,h),g=image.GetGraphics();
  g.SetSmoothingMode(2);g.FillSolidRect(0,0,w,h,hot?COL.cardHover:COL.elev);
  var cover=Math.round(36*s),pad=Math.round(10*s),playSize=Math.round(30*s),playX=x+w-pad-playSize;
  drawPlCover(g,pad,Math.round((h-cover)/2),cover,4,i,plName(i));
  var textX=pad+cover+Math.round(10*s),textW=w-textX-pad-playSize-Math.round(4*s);
  tL(g,plName(i),FONT.pl,COL.text,textX,Math.round(10*s),textW,Math.round(24*s));
  tL(g,plCount(i)+' 首歌曲',FONT.plSub,COL.text2,textX,Math.round(35*s),textW,Math.round(20*s));
  image.ReleaseGraphics(g);gr.DrawImage(image,left,y,right-left,h,left-x,0,right-left,h);try{image.Dispose();}catch(e){}
  if(playX>=left&&playX+playSize<=right){
    var playY=y+Math.round((h-playSize)/2);
    var button={x0:playX,y0:playY,x1:playX+playSize,y1:playY+playSize,pl:i,act:'playlist',focus:'play-'+i,label:'播放歌单'};
    var playHot=hv(button.x0,button.y0,button.x1,button.y1)||ssHomeFocus===button.focus;
    if(playHot)gr.FillEllipse(playX,playY,playSize,playSize,COL.rowHover);
    drawIcon(gr,'play',playHot?COL.green:COL.text2,playX+1,playY,playSize,playSize,Math.round(playSize*.57));
    ssHomeFocusRing(gr,button,playSize/2);
    HB_PLPLAY.push(button);
  }
  HB_CARD.push({x0:left,y0:y,x1:right,y1:y+h,kind:'pl',id:i});
}
function paintArtistCard(gr,x,y,w,a,hov){
  ssFillContinuousRect(gr,x,y,w,w+M.cardTextH,8,8,hov?COL.cardHover:COL.elev);
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

// Caller supplies a clipped bitmap viewport; hit targets use that same vertical band.
// Drawer width changes the column count, while cover size follows window density.
function ssAlbumGrid(width,scale,coverSize){
  if(coverSize===undefined)coverSize=157;
  var gap=Math.round(16*scale),size=Math.max(1,Math.min(width,Math.round(coverSize*scale)));
  return {gap:gap,size:size,cols:Math.max(1,Math.floor((width+gap)/(size+gap)))};
}
function ssLibraryReadingRect(r){
  var inset=Math.min(M.cpad,Math.floor((r.w-1)/2));
  return {x:r.x+inset,w:Math.max(1,r.w-2*inset)};
}
function ssDrawLabeledAction(gr,x,y,w,h,label,icon,act){
  var size=Math.min(w,h),gap=Math.round(10*ssDensity);
  var width=Math.min(w,size+gap+Math.ceil(ssMeasureText(gr,label,FONT.pl,h))+4);
  var hot=hv(x,y,x+width,y+h),cy=y+(h-size)/2;
  gr.FillEllipse(x,cy,size,size,hot?COL.hover:COL.elev);
  drawIcon(gr,icon,hot?COL.green:COL.text,x,cy,size,size,Math.round(size*.50));
  tL(gr,label,FONT.pl,COL.text,x+size+gap,y,width-size-gap,h);
  return {x0:x,y0:y,x1:x+width,y1:y+h,act:act};
}
function ssDrawAlbumPlayAction(gr,x,y,w,h){
  return ssDrawLabeledAction(gr,x,y,w,h,'播放专辑','play','featured');
}
var ssAlbumTitleCache=new Map(),ssAlbumTitleFont=null;
function ssAlbumTitleLines(gr,title,w){
  if(ssAlbumTitleFont!==FONT.card){ssAlbumTitleFont=FONT.card;ssAlbumTitleCache.clear();}
  var key=w+'|'+title,cached=ssAlbumTitleCache.get(key);
  if(cached)return cached;
  var lines=[title];
  if(title&&ssMeasureText(gr,title,FONT.card)>w){
    var chars=ssTextClusters(title),lo=1,hi=chars.length;
    while(lo<hi){
      var mid=(lo+hi+1)>>1;
      if(ssMeasureText(gr,chars.slice(0,mid).join(''),FONT.card)<=w)lo=mid;else hi=mid-1;
    }
    var first=chars.slice(0,lo).join(''),space=first.lastIndexOf(' ');
    if(space>first.length*.64)lo=ssTextClusters(first.slice(0,space)).length;
    var remainder=chars.slice(lo).join('').trim();
    lines=[chars.slice(0,lo).join('').trim()];
    if(remainder)lines.push(remainder);
  }
  if(ssAlbumTitleCache.size>=512)ssAlbumTitleCache.clear();
  ssAlbumTitleCache.set(key,lines);
  return lines;
}
function ssAlbumLabelMetrics(s){
  var top=Math.round(7*s),title=Math.max(Math.round(20*s),ssFontLineHeight(FONT.card)+1);
  var detail=Math.max(Math.round(18*s),ssFontLineHeight(FONT.plSub)+1),gap=Math.round(2*s);
  return {top:top,title:title,detail:detail,gap:gap,height:top+2*title+gap+detail};
}
function ssAlbumLabelHeight(s,titleLines){var m=ssAlbumLabelMetrics(s);return m.height-(titleLines===1?m.title:0);}
function ssDrawAlbumLabels(gr,title,detail,x,y,w,s,titleLines){
  var lines=titleLines===1?[title]:ssAlbumTitleLines(gr,title,w),text=ssAlbumLabelMetrics(s),top=y+text.top;
  for(var i=0;i<lines.length;i++)ssDrawFixedLabel(gr,lines[i],FONT.card,COL.text,x,top+i*text.title,w,text.title);
  ssDrawFixedLabel(gr,detail,FONT.plSub,COL.text2,x,top+(titleLines||2)*text.title+text.gap,w,text.detail);
}
function drawLibraryAlbumCard(gr,x,y,w,album,clipTop,clipBot){
  var h=w+ssAlbumLabelHeight(ssDensity,1),top=Math.max(y,clipTop),bottom=Math.min(y+h,clipBot);
  if(bottom<=top)return;
  if(hv(x,top,x+w,bottom))ssFillContinuousRect(gr,x,y,w,h,5,5,COL.cardHover);
  drawRounded(gr,x,y,w,4,album.handle,album.album);
  ssDrawAlbumLabels(gr,album.album,ssArtistName(album.artist),x,y+w,w,ssDensity,1);
  HB_CARD.push({x0:x,y0:top,x1:x+w,y1:bottom,kind:'album',id:album.id});
}
