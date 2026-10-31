/* verdant/views/artist.js -- artist view
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

function drawArtist(gr,r){
  HB_TR=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12, i;
  gr.FillGradRect(r.x,r.y,r.w,220,90,blend(coverCol(viewArtist),COL.base,0.44),COL.base,1.0);
  var art=r.w<600?96:150, ay=r.y+34;
  ssDrawArtistAvatar(gr,x0,ay,art,viewArtist);
  var tx=x0+art+24, tw=w-art-24, songs=0;
  for(i=0;i<artistAlbums.length;i++) songs+=artistAlbums[i].tracks.length;
  tL(gr,'歌手',FONT.eyebrow,COL.text,tx,ay+10,tw,18);
  tL(gr,ssArtistName(viewArtist),FONT.title,COL.text,tx,ay+30,tw,70);
  tL(gr,artistAlbums.length+' 张专辑 '+CH_DOT+' '+songs+' 首歌曲',FONT.meta,COL.text2,tx,ay+112,tw,22);
  var bw=Math.min(w,220),by=r.y+198;gr.FillRoundRect(x0,by,bw,28,8,8,COL.elev);tC(gr,'歌手资料 / 联网核验',FONT.pl,COL.green,x0,by,bw,28);SS_ARTIST_HB={x0:x0,y0:by,x1:x0+bw,y1:by+28};
  ART_MAXBLOCK=Math.max(0,artistAlbums.length-1);
  var y=r.y+236;
  for(var b=artScroll;b<artistAlbums.length;b++){
    if(y+96>bottom) break;
    var al=artistAlbums[b];
    drawRounded(gr,x0,y,72,6,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,x0+88,y+6,w-88,26);
    tL(gr,(al.year||'')+' '+CH_DOT+' '+al.tracks.length+' 首歌曲',FONT.meta,COL.text2,x0+88,y+38,w-88,20);
    var ty=y+84;
    for(var t=0;t<al.tracks.length;t++){
      if(ty+40>bottom) break;
      var tr=al.tracks[t];
      if(ssRowHover(x0-8,ty,r.x+r.w-pad+8,ty+40)) gr.FillRoundRect(x0-8,ty,(r.x+r.w-pad+8)-(x0-8),40,4,4,COL.rowHover);
      tL(gr,String(t+1),FONT.rowNum,COL.text2,x0,ty,26,40);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+36,ty,w-36-64,40);
      tR(gr,tr.dur,FONT.rowCell,COL.text2,r.x+r.w-pad-60,ty,60,40);
      HB_TR.push({x0:x0-8,y0:ty,x1:r.x+r.w-pad+8,y1:ty+40,lib:true,block:b,idx:t});
      ty+=40;
    }
    y=ty+22;
  }
}
