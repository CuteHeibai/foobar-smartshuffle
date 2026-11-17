/* verdant/views/search.js -- search view: box + artist/song results
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

// factored out so the blinking caret repaints just this strip (dirtySearch), not the whole view
var SBOX_H=44, SBOX_TOP=26;   // box height + offset below R.main.y
function searchBoxRect(){ var r=R.main,content=ssLibraryReadingRect(r);return {x:content.x-2,y:r.y+SBOX_TOP-4,w:content.w+8,h:SBOX_H+8}; }
function drawSearchBox(gr,r){
  var content=ssLibraryReadingRect(r),x0=content.x,boxH=SBOX_H,boxY=r.y+SBOX_TOP,boxW=content.w;
  gr.FillSolidRect(x0-2,boxY-4,boxW+8,boxH+8,COL.base);   // clean bg for partial repaints
  ssFillContinuousRect(gr,x0,boxY,boxW,boxH,boxH/2,boxH/2,COL.hover);
  var txtX=x0+48, txtW=boxW-(txtX-x0)-18;
  drawIcon(gr,'search',COL.text2,x0+16,boxY,22,boxH,18);
  var empty=!searchQuery.length, caretH=20, caretY=boxY+(boxH-caretH)/2, caretX;
  if(empty){
    caretX=txtX;
    tL(gr,'歌曲、拼音、罗马音或歌词',FONT.searchTxt,COL.text3,txtX+12,boxY,txtW-12,boxH);
  } else {
    tL(gr,searchQuery,FONT.searchTxt,COL.text,txtX,boxY,txtW,boxH);
    caretX=txtX+Math.min(txtW,ssMeasureText(gr,searchQuery,FONT.searchTxt,boxH))+2;
  }
  if(caretOn) gr.FillSolidRect(caretX,caretY,2,caretH,empty?COL.text2:COL.text);
}
/* Artists + Songs are one continuously-scrolled document (same model as the home artist grid).
   The search box stays pinned: content is drawn first and allowed to overflow upward, then the
   band above the viewport is painted over and the box redrawn on top. */
function drawSearch(gr,r){
  HB_CARD=[]; HB_TR=[];
  computeSearch();
  var content=ssLibraryReadingRect(r),x0=content.x,w=content.w,i;
  var boxH=SBOX_H, boxY=r.y+SBOX_TOP;
  if(!searchQuery.length){
    drawSearchBox(gr,r);
    tL(gr,'支持拼音 / 首字母、日语罗马音、近似拼写及本地歌词。',FONT.qArtist,COL.text3,x0+2,boxY+boxH+18,w,18);
    return;
  }
  if(!searchArts.length && !searchTrks.length){
    drawSearchBox(gr,r);
    tC(gr,ssSearchBusy?'正在检索本地索引…':ssSearchError||('未找到相关结果：'+searchQuery),FONT.sect,COL.text2,x0,r.y+Math.round(r.h/2),w,24);
    return;
  }
  var top=boxY+boxH+26, cropY=r.y+r.h, viewH=cropY-top;
  // ---- measure the document, then clamp the scroll to it ----
  var s=ssDensity,gap=Math.round(16*s),cardW=Math.round(300*s),cols=Math.max(1,Math.floor((w+gap)/(cardW+gap)));
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=Math.round(76*s), rh=M.rowH, durW=Math.round(54*s);
  var artsH=searchArts.length?(Math.round(36*s)+Math.ceil(searchArts.length/cols)*(cardH+8)+Math.round(12*s)):0;
  var contentH=artsH+(searchTrks.length?(38+searchTrks.length*rh):0);
  var maxPx=Math.max(0,contentH-viewH);
  SEARCH_MAXPX=maxPx;
  searchScroll=clampPx(searchScroll,maxPx); searchScrollT=clampPx(searchScrollT,maxPx);
  var cy=top-searchScroll;
  // ---- artists ----
  if(searchArts.length){
    tL(gr,'歌手',FONT.sect2,COL.text,x0,cy,w,28);
    var gy=cy+Math.round(36*s);
    for(i=0;i<searchArts.length;i++){
      var ay=gy+Math.floor(i/cols)*(cardH+8);
      if(ay>=cropY) break;
      if(ay+cardH<=top) continue;
      var ax=x0+(i%cols)*(cardW+gap),portrait=Math.round(64*s),artist=searchArts[i];
      var ab={x0:ax,y0:Math.max(ay,top),x1:ax+cardW,y1:Math.min(ay+cardH,cropY),kind:'artist',id:artist.name};
      if(hv(ab.x0,ab.y0,ab.x1,ab.y1))ssFillContinuousRect(gr,ax,ay,cardW,cardH,4,4,COL.rowHover);
      ssDrawArtistAvatar(gr,ax,ay+Math.round(4*s),portrait,artist.name);
      var atx=ax+portrait+Math.round(14*s),atw=Math.max(1,ax+cardW-atx-8);
      tL(gr,ssArtistName(artist.name),FONT.card,COL.text,atx,ay,atw,cardH);
      HB_CARD.push(ab);
    }
    cy+=artsH;
  }
  // ---- songs ----
  if(searchTrks.length){
    var trackW=Math.min(w,Math.round(852*s));
    tL(gr,'歌曲',FONT.sect2,COL.text,x0,cy,trackW,28);
    var ry0=cy+38;
    for(i=0;i<searchTrks.length;i++){
      var ry=ry0+i*rh;
      if(ry>=cropY) break;
      if(ry+rh<=top) continue;
      var tr=searchTrks[i];
      var hot=ssRowHover(x0-8,Math.max(ry,top),x0+trackW+8,Math.min(ry+rh,cropY));
      if(hot)ssFillContinuousRect(gr,x0-8,ry,trackW+16,rh,4,4,COL.rowHover);
      var playW=ssTrackPlayWidth(s),artX=x0+playW,cs=Math.round(40*s),textX=artX+cs+Math.round(12*s);
      var active=ssIsCurrentTrack(tr.h);
      ssDrawTrackLead(gr,x0,ry,playW,rh,i+1,active);
      drawCover(gr,artX,ry+(rh-cs)/2,cs,4,tr.h,tr.album||tr.title);
      var detail=tr.snippet?('歌词 '+(tr.lyric_time!==null&&tr.lyric_time!==undefined?fmtTime(tr.lyric_time):'无时间轴')+' · '+tr.snippet):[tr.artist,tr.album].filter(Boolean).join(' '+CH_DOT+' ');
      ssDrawTrackLabels(gr,tr.title,detail,COL.text,textX,ry,x0+trackW-durW-textX,rh,s);
      tR(gr,tr.len,FONT.rowCell,COL.text2,x0+trackW-durW,ry,durW,rh);
      var hy0=Math.max(ry,top), hy1=Math.min(ry+rh,cropY);   // clip the click target to the viewport
      if(hy1>hy0) HB_TR.push({x0:x0-8,y0:hy0,x1:x0+trackW+8,y1:hy1,rowY:ry,rowH:rh,srch:true,idx:i,pgx0:x0,pgx1:artX,playOnHover:true,playVisible:active,playId:tr.id||i});
    }
  }
  // ---- mask the overflow, re-pin the search box, then the scrollbar ----
  gr.FillSolidRect(r.x,r.y,r.w,top-r.y,COL.base);
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);
  drawSearchBox(gr,r);
  drawScrollbar(gr,r.x+r.w-10,top,viewH,searchScroll,maxPx,viewH,contentH,hv(r.x,top,r.x+r.w,cropY)||drag==='scroll');
}
