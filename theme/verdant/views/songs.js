/* verdant/views/songs.js -- all songs view: header, group-by, grouped/flat rows
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ---- All Songs: header + group-by pill + grouped/flat track list ---- */
function drawSongs(gr,r){
  ssMeterCell=null; HB_TR=[]; HB_CARD=[]; HB_SG=null; HB_RGNORM=null; HB_SONGS_PLAY=null;
  var songsOk=ensureBuilt('songs',songsReady,songsSteps);
  if(!songsOk || !gateReady('songsart',rowHandlesSongs(),0,ROW_GATE_MS)){   // 0 = the default cap
    if(songsOk || skelVisible('songs')) drawViewSkeleton(gr,r);
    return;
  }
  var cov=libChoice(), g=songsGroup;
  // header: gradient wash + mosaic cover + title/meta, mirroring the playlist header
  gr.FillGradRect(r.x,r.y,r.w,SHEAD,90,ssLibraryHeaderColor(artHue(cov.single,'__lib__')),COL.base,1.0);
  var s=ssDensity,rSm=typeof ssRad==='function'?ssRad('sm',s):Math.round(4*s),rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  var compact=r.w<940*s,flat=g==='none',showAlbum=flat&&!compact,showArtist=g==='album';
  var list=ssLibraryTrackLayout(r,s),rx=list.right,lx=list.x,ay=r.y+16*s,art=Math.min(M.artSz,Math.round(168*s));
  drawLibCover(gr,lx,ay,art,rMd);
  var button=Math.max(32,Math.round(38*s)),barY=ay+art+Math.round(6*s),playSpace=0;
  if(songsTracks.length){
    HB_SONGS_PLAY=drawPlaylistPlay(gr,lx,barY,button,-1);
    playSpace=button+Math.round(10*s);
    HB_SONGS_PLAY.label='播放全部歌曲';HB_SONGS_PLAY.library=true;
  }
  var pgap=8,toolbarW=Math.max(2,list.w-pgap-playSpace);
  var gpW=Math.min(232,Math.floor(toolbarW*.54)),nzW=Math.min(196,toolbarW-gpW);
  var gpX=rx-gpW,clX=gpX-pgap-nzW;
  var tx=lx+art+24*s,tw=Math.max(1,rx-tx);
  var text=ssHeaderBoxes(art,false,s);
  tL(gr,'音乐库',FONT.eyebrow,COL.text2,tx,ay+text.eyeY,tw,text.eyeH);
  tL(gr,g==='artist'?'歌手':'全部歌曲',FONT.title,COL.text,tx,ay+text.titleY,tw,text.titleH);
  var artistCount=g==='artist'?songsRows.filter(function(r){return r.k==='g1';}).length:0;
  var metaStr=(artistCount?fmtNum(artistCount)+' 位歌手 '+CH_DOT+' ':'')+fmtNum(songsTracks.length)+' 首歌曲'+(songsTotalSec>0?(' '+CH_DOT+' '+fmtDur(songsTotalSec)):'');
  tL(gr,metaStr,FONT.meta,SS_APPEARANCE==='dark'?COL.text:COL.text2,tx,ay+text.metaY,tw,text.metaH);
  HB_RGNORM=drawNormalizePill(gr,clX,barY,nzW,button);
  HB_SG=drawDropPill(gr,gpX,barY,gpW,button,'分组：'+labelOf(SONGS_GROUPS,songsGroup,'不分组'),sgMenuOpen);

  if(!songsRows.length){
    tC(gr,'音乐库还是空的',FONT.sect,COL.text2,r.x,r.y+SHEAD+40,r.w,24);
    tC(gr,'请通过「音乐库」菜单添加音乐文件夹 '+CH_BULL+' 配置。',FONT.qArtist,COL.text3,r.x,r.y+SHEAD+70,r.w,18);
    return;
  }

  /* ---- columns: flat mode mirrors the playlist view (cover + two-line title/artist + ALBUM).
     Grouped mode drops all of that -- the header above already shows artwork, album and artist --
     so rows go single-line and indent one step per nesting level. Secondary column follows:
     ALBUM when flat, ARTIST when grouped by album, nothing when grouped by artist. */
  var tind=flat?0:Math.round(SG_IND*(g==='both'?2:1)*s);
  var playW=list.playW,durW=list.durW,cgap=list.gap,moreW=list.moreW,moreX=list.moreX;
  var playX=lx+tind,numX=playX+playW+Math.round(4*s),numW=ssTrackNumberWidth(s,songsTracks.length);
  var coverX=numX+numW+cgap,cs=Math.round(40*s),titleX=coverX+(flat?cs+cgap:0);
  var colSpace=Math.max(0,moreX-titleX-cgap*2);
  var colW=showAlbum?Math.min(Math.round(540*s),Math.round(colSpace*.48)):(showArtist?Math.round(colSpace*.28):0);
  var colX=moreX-cgap-colW;
  var titleW=(colW?colX:moreX)-cgap-titleX;

  var listTop=r.y+SHEAD+Math.round(8*s);
  var rowsTop=listTop+Math.round(34*s), cropY=r.y+r.h, viewH=cropY-rowsTop;
  var contentH=Math.round(songsContentH*s), maxPx=Math.max(0,contentH-viewH);
  if(viewH<1)return;
  SONGS_MAXPX=maxPx;
  songsScroll=clampPx(songsScroll,maxPx); songsScrollT=clampPx(songsScrollT,maxPx);
  var drawScroll=Math.round(songsScroll),j0=songsFirstAt(drawScroll/s);
  var parentGr=gr,layer=ssBeginViewport('main-list',gr,r.x,rowsTop,r.w,Math.max(1,viewH));gr=layer.gr;
  // Nested mode: a rail runs from each artist banner past all of its albums, so the owning
  // artist stays visible. Drawn before the rows so hover fills paint over it, and started from
  // the group owning the first visible row -- the banner itself is often scrolled away.
  if(g==='both' && j0<songsRows.length){
    var q0=(songsRows[j0].g1i!==undefined)?songsRows[j0].g1i:j0;
    for(var q=q0;q<songsRows.length;q++){
      var gq=songsRows[q]; if(gq.k!=='g1') continue;
      var rt=rowsTop+Math.round((gq.y+gq.h-4)*s)-drawScroll, rb=rowsTop+Math.round(((gq.y1||0)-8)*s)-drawScroll;
      if(rt>=cropY) break;
      var t0=Math.max(rt,rowsTop), t1=Math.min(rb,cropY);
      if(t1>t0) gr.FillSolidRect(lx+SG_IND*s/2-1,t0,2,t1-t0,ssInk(30));   // centred in the indent gutter
    }
  }
  for(var j=j0; j<songsRows.length; j++){
    var row=songsRows[j], rowTop=Math.round(row.y*s),ry=rowsTop+rowTop-drawScroll,gh=Math.round((row.y+row.h)*s)-rowTop;
    if(ry>=cropY) break;
    var vy0=Math.max(ry,rowsTop), vy1=Math.min(ry+gh,cropY);   // visible band: rows scrolled
    if(vy1<=vy0) continue;                                     // under the sticky header don't take the mouse
    if(row.k==='t'){
      var t=row.t,isPlaying=ssIsCurrentTrack(t.h),moreY=ry+Math.round((gh-moreW)/2);
      isPlaying=isPlaying&&!ssMeterCell;
      ssDrawCachedRow(gr,'song:'+row.ti+(isPlaying?':playing':''),r.x,ry,r.w,gh,function(gr){
        var isHover=ssRowHover(list.rowLeft,vy0,list.personalRight,vy1);
        ssDrawLibraryRowSurface(gr,list,ry,gh,isHover,j%2===1);
        ssDrawTrackLead(gr,playX,ry,playW,gh,false);
        if(!isPlaying)tR(gr,String(row.n),FONT.rowNum,COL.text2,numX,ry,numW,gh);
        var detail='';
        if(flat){
          drawCover(gr,coverX,ry+(gh-cs)/2,cs,rSm,t.h,t.album||t.title,t.artkey);
          detail=!showAlbum&&t.album&&t.album!==t.title?[t.artist,t.album].filter(Boolean).join(' '+CH_DOT+' '):t.artist;
        }
        ssDrawTrackLabels(gr,t.title,detail,isPlaying?COL.green:COL.text,titleX,ry,titleW,gh,s);
        if(showAlbum)tL(gr,t.album,FONT.rowCell,COL.text2,colX,ry,colW,gh);
        else if(showArtist)tL(gr,t.artist,FONT.rowCell,COL.text2,colX,ry,colW,gh);
        drawIcon(gr,'more',isHover?COL.text:COL.text2,moreX,moreY,moreW,moreW,Math.round(17*s));
        tR(gr,t.len,FONT.rowCell,COL.text2,rx-durW,ry,durW,gh);
      },flat);
      HB_TR.push({x0:list.rowLeft,y0:vy0,x1:list.personalRight,y1:vy1,rowY:ry,rowH:gh,songs:true,ti:row.ti,pgx0:playX,pgx1:playX+playW,playOnHover:true,playVisible:true,playId:t.h?ssTrackID(t.h):row.ti,more:{x0:moreX,y0:moreY,x1:moreX+moreW,y1:moreY+moreW},favoriteX:rx+Math.round(4*s)});
      if(isPlaying)ssMeterCell={row:HB_TR[HB_TR.length-1],x:numX,w:numW,scale:s};
    } else {
      /* Group header: every kind is the same block on the same rhythm (GAP, artwork, PADB),
         differing only in indent, artwork size and -- for the artist banner -- a slab + eyebrow. */
      var nest=(row.k==='g2'), isArt=(row.kind==='artist'), banner=(isArt && g==='both');
      var gap=Math.round((nest?SG_GAP2:SG_GAP1)*s),acs=Math.round((nest?SG_ART2:SG_ART1)*s);
      var blockTop=ry+gap, blockH=gh-gap-Math.round((nest?SG_PADB2:SG_PADB1)*s);
      var hx=lx+(nest?Math.round(SG_IND*s):0),hy=blockTop+(banner?Math.round(SG_SLABP*s):0);
      // divider only once the row's top edge is actually in view (it sits above the crop band)
      if(j>0 && !nest && ry+2>=rowsTop) gr.DrawLine(lx,ry+2,rx,ry+2,banner?2:1,COL.line);
      var hb0=Math.max(blockTop-(banner?0:4),rowsTop), hb1=vy1;
      var hHov=isArt&&hb1>hb0&&hv(list.rowLeft,hb0,list.rowRight,hb1),bandW=list.rowRight-list.rowLeft;
      if(banner)ssFillContinuousRect(gr,list.rowLeft,blockTop,bandW,blockH,rMd,rMd,hHov?COL.hover:COL.banner);
      else if(hHov){
        ssFillContinuousRect(gr,list.rowLeft,blockTop-4,bandW,blockH+8,rMd,rMd,COL.rowHover);
        if(typeof strokeRound==='function')strokeRound(gr,list.rowLeft,blockTop-4,bandW,blockH+8,rMd,1,COL.line);
      }
      if(isArt){
        ssDrawArtistAvatar(gr,hx,hy,acs,row.label);
        if(typeof gr.DrawEllipse==='function')gr.DrawEllipse(hx,hy,acs,acs,1,typeof ssInk==='function'?ssInk(SS_APPEARANCE==='dark'?24:16):COL.line);
      }else drawRounded(gr,hx,hy,acs,rSm,row.handle,row.seed);
      // text block centred against the artwork, running to the same right edge as the rows
      var htx=hx+acs+Math.round(SG_TGAP*s),htw=rx-htx-(isArt&&hHov?Math.round(74*s):0);
      var eyeH=banner?Math.round(16*s):0,nameH=Math.round((nest?22:26)*s),subH=Math.round(16*s);
      var ty0=Math.round(hy+acs/2-(eyeH+nameH+subH)/2);
      var sub=banner?(fmtNum(row.albums||1)+' 张专辑  '+CH_DOT+'  '+fmtNum(row.count)+' 首歌曲')
                    :((row.sub?row.sub+'  '+CH_DOT+'  ':'')+fmtNum(row.count)+' 首歌曲');
      if(banner) tL(gr,'歌手',FONT.eyebrow,COL.text3,htx,ty0,htw,eyeH);
      tL(gr,isArt?ssArtistName(row.label):row.label,nest?FONT.sect:FONT.sect2,COL.text,htx,ty0+eyeH,htw,nameH);
      tL(gr,sub,FONT.plSub,COL.text2,htx,ty0+eyeH+nameH,htw,subH);
      if(isArt&&hHov)tR(gr,'查看歌手 ›',FONT.plSub,COL.green,rx-Math.round(72*s),hy,Math.round(68*s),acs);
      // artist headers are a shortcut to the full artist page
      if(isArt && hb1>hb0) HB_CARD.push({x0:list.rowLeft,y0:hb0,x1:list.rowRight,y1:hb1,kind:'artist',id:row.label});
    }
  }
  layer.finish();gr=parentGr;
  var headH=Math.round(20*s),clockW=Math.round(16*s),ruleY=listTop+Math.round(26*s);
  tR(gr,'#',FONT.head,COL.text2,numX,listTop,numW,headH);
  tL(gr,'歌曲',FONT.head,COL.text2,titleX,listTop,titleW,headH);
  if(showAlbum)tL(gr,'专辑',FONT.head,COL.text2,colX,listTop,colW,headH);
  else if(showArtist)tL(gr,'歌手',FONT.head,COL.text2,colX,listTop,colW,headH);
  drawIcon(gr,'clock',COL.text2,rx-clockW,listTop,clockW,headH,Math.round(15*s));
  gr.DrawLine(lx,ruleY,rx,ruleY,1,COL.line);
  drawScrollbar(gr,r.x+r.w-10,rowsTop,viewH,songsScroll,maxPx,viewH,contentH,[r.x,r.y,r.x+r.w,cropY]);
  drawGroupMenu(gr);
}
