/* verdant/views/cards.js -- playlist + artist cards, shared by home and search
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
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
  if(cardHov&&playX>=hx0&&playX+playSize<=hx1)HB_PLPLAY.push(drawPlaylistPlay(gr,playX,playY,playSize,i));
  var dx=x+w-32;
  if(cardHov && dx>=hx0 && dx+32<=hx1) drawDots(gr,dx,y+12,i);
  HB_CARD.push({x0:hx0,y0:y,x1:hx1,y1:y+h,kind:'pl',id:i});
}
function drawPlaylistShortcut(gr,x,y,w,h,i,clipL,clipR){
  var left=Math.max(x,clipL),right=Math.min(x+w,clipR);if(right<=left)return;
  var s=ssDensity,hot=hv(left,y,right,y+h),image=gdi.CreateImage(w,h),g=image.GetGraphics();
  g.SetSmoothingMode(2);g.FillSolidRect(0,0,w,h,hot?COL.cardHover:COL.elev);
  var cover=Math.round(36*s),pad=Math.round(10*s),playSize=Math.round(30*s),playX=x+w-pad-playSize,rSm=typeof ssRad==='function'?ssRad('sm',s):Math.round(4*s);
  drawPlCover(g,pad,Math.round((h-cover)/2),cover,rSm,i,plName(i));
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
  var rMd=typeof ssRad==='function'?ssRad('md'):8;
  ssFillContinuousRect(gr,x,y,w,w+M.cardTextH,rMd,rMd,hov?COL.cardHover:COL.elev);
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
function ssAlbumGrid(width,scale,coverSize,maxCols){
  if(coverSize===undefined)coverSize=157;
  var gap=Math.round(24*scale),natural=Math.round(coverSize*scale);
  if(maxCols){
    var padding=Math.round(ssLibraryPadding(W)*scale);
    var windowContent=W-ssDefaultNavWidth(W)-3*M.gap-2*padding;
    natural=Math.max(natural,Math.floor((windowContent-gap*(maxCols-1))/maxCols));
  }
  var size=Math.max(1,Math.min(width,natural));
  var cols=Math.max(1,Math.floor((width+gap)/(size+gap)));
  if(maxCols)cols=Math.min(cols,maxCols);
  return {gap:gap,size:size,cols:cols};
}
function ssLibraryReadingRect(r,padding){
  var inset=Math.max(0,Math.min(padding===undefined?M.cpad:padding,Math.floor((r.w-1)/2)));
  return {x:r.x+inset,w:Math.max(1,r.w-2*inset)};
}
function ssTrackNumberWidth(s,count){return Math.round((Math.max(4,String(count).length)*8+6)*s);}
function ssLibraryHeaderColor(art){
  return blend(art,COL.base,SS_APPEARANCE==='light' ? .92 : .90);
}
function ssLibraryTrackLayout(r,s,padding,limit){
  var pane=ssLibraryReadingRect(r,padding),x=pane.x,end=r.x+r.w;
  // The caret queries this layout outside the scaled paint scope.
  var gutter=typeof ssPersonalGutter==='function'?Math.round(ssPersonalGutter()*s/ssDensity):0;
  var w=Math.max(1,Math.min(pane.w-gutter,limit||Infinity)),right=x+w;
  var gap=Math.round(12*s),durW=Math.round(64*s),moreW=Math.round(24*s);
  return {x:x,w:w,right:right,gap:gap,durW:durW,moreW:moreW,moreX:right-durW-gap-moreW,playW:ssTrackPlayWidth(s),
    rowLeft:Math.max(r.x,x-8),rowRight:Math.min(end,right+8),personalRight:Math.min(end,right+gutter+8)};
}
function ssDrawLibraryRowSurface(gr,layout,y,h,hot,alternate){
  var rSm=typeof ssRad==='function'?ssRad('sm'):4;
  if(hot||(alternate&&layout.w>=760))
    ssFillContinuousRect(gr,layout.rowLeft,y,layout.personalRight-layout.rowLeft,h,rSm,rSm,hot?COL.rowHover:ssInk(7));
}
function ssDrawLabeledAction(gr,x,y,w,h,label,icon,act,font,primary){
  font=font||FONT.pl;
  var size=Math.min(w,h),gap=Math.round(10*ssDensity);
  var width=Math.min(w,size+gap+Math.ceil(ssMeasureText(gr,label,font,h))+4);
  var hot=hv(x,y,x+width,y+h),cy=y+(h-size)/2;
  var fill=hot?COL.hover:COL.elev,glyph=hot?COL.green:COL.text;
  if(primary){fill=hot?COL.greenHover:COL.play;glyph=COL.onAccent;}
  gr.FillEllipse(x,cy,size,size,fill);
  drawIcon(gr,icon,glyph,x,cy,size,size,Math.round(size*.50));
  tL(gr,label,font,COL.text,x+size+gap,y,width-size-gap,h);
  return {x0:x,y0:y,x1:x+width,y1:y+h,act:act};
}
function ssDrawSettingsButton(gr,x,y,maxWidth,h){
  var s=ssDensity,w=Math.min(maxWidth,Math.round(168*s)),pad=Math.round(12*s),icon=Math.round(18*s);
  var tx=x+pad+icon+Math.round(8*s),rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  ssFillContinuousRect(gr,x,y,w,h,rMd,rMd,hv(x,y,x+w,y+h)?COL.greenHover:COL.green);
  drawIcon(gr,'settings',COL.onAccent,x+pad,y,icon,h,icon);
  tL(gr,'打开插件设置',FONT.pl,COL.onAccent,tx,y,x+w-pad-tx,h);
  return {x0:x,y0:y,x1:x+w,y1:y+h,settings:true};
}
function ssDrawAlbumPlayAction(gr,x,y,w,h,label,font,primary){
  return ssDrawLabeledAction(gr,x,y,w,h,label||'播放专辑','play','featured',font,primary);
}
var ssAlbumTitleCache=new Map(),ssAlbumTitleFont=null;
function ssTitlePrefix(gr,title,w,font){
  var chars=ssTextClusters(title),lo=0,hi=chars.length;
  while(lo<hi){
    var mid=(lo+hi+1)>>1;
    if(ssMeasureText(gr,chars.slice(0,mid).join(''),font)<=w)lo=mid;else hi=mid-1;
  }
  return chars.slice(0,lo).join('').trimEnd();
}
function ssAlbumTitleLines(gr,title,w){
  if(ssAlbumTitleFont!==FONT.card){ssAlbumTitleFont=FONT.card;ssAlbumTitleCache.clear();}
  var key=w+'|'+title,cached=ssAlbumTitleCache.get(key);
  if(cached)return cached;
  var lines=[title];
  if(title&&ssMeasureText(gr,title,FONT.card)>w){
    var tag=title.match(/(?:\[[^\[\]]+\]|\([^()]+\)|［[^［］]+］|（[^（）]+）|\b(?:disc|disk|cd|vol(?:ume)?|part)\.?\s*\d+(?:\s*\/\s*\d+)?|\b(?:deluxe|special|expanded|limited|anniversary|remastered)\s+(?:edition|version))\s*$/i);
    var suffix=tag?tag[0].trimEnd():'',keepSuffix=suffix&&ssMeasureText(gr,suffix,FONT.card)<=w;
    var stem=keepSuffix?title.slice(0,tag.index).trimEnd():title;
    var first=ssTitlePrefix(gr,stem,w,FONT.card)||ssTextClusters(stem)[0]||'',space=first.lastIndexOf(' ');
    if(first.length<stem.length&&space>first.length*.64)first=first.slice(0,space).trimEnd();
    var remainder=title.slice(first.length).trim();
    if(keepSuffix&&ssMeasureText(gr,remainder,FONT.card)>w){
      first=stem;
      remainder=suffix;
    }
    if(first&&remainder)lines=[first,remainder];
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
function drawLibraryAlbumCard(gr,x,y,w,album,clipTop,clipBot,clipLeft,clipRight){
  var h=w+ssAlbumLabelHeight(ssDensity,1),top=Math.max(y,clipTop),bottom=Math.min(y+h,clipBot);
  var left=Math.max(x,clipLeft),right=Math.min(x+w,clipRight);
  if(bottom<=top||right<=left)return;
  var rMd=typeof ssRad==='function'?ssRad('md'):Math.round(8*ssDensity);
  if(hv(left,top,right,bottom))ssFillContinuousRect(gr,x,y,w,h,rMd,rMd,COL.cardHover);
  drawRounded(gr,x,y,w,rMd,album.handle,album.album);
  ssDrawAlbumLabels(gr,album.album,ssArtistName(album.artist),x,y+w,w,ssDensity,1);
  HB_CARD.push({x0:left,y0:top,x1:right,y1:bottom,paintX:x,paintY:y,kind:'album',id:album.id});
}
