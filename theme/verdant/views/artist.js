/* Artist and album tracks share a clipped pixel viewport. */
var ssCollectionRows=[],ssCollectionRowsSource=null,ssCollectionAlbumOnly=false,ssCollectionDensity=0,ssCollectionHeight=0,ssCollectionWidth=0;
function ssBuildCollectionRows(albumOnly,s,width){
  if(ssCollectionRowsSource===artistAlbums&&ssCollectionAlbumOnly===albumOnly&&ssCollectionDensity===s&&ssCollectionWidth===width)return;
  ssCollectionRowsSource=artistAlbums;ssCollectionAlbumOnly=albumOnly;ssCollectionDensity=s;ssCollectionWidth=width;ssCollectionRows=[];
  var y=0,header=Math.round(49*s),rowH=Math.round(40*s);
  var gallery=!albumOnly&&width>=560*s&&artistAlbums.length>1;
  if(gallery){
    var gap=Math.round(24*s),cols=Math.min(artistAlbums.length,5,Math.max(2,Math.floor((width+gap)/(164*s+gap)))),size=Math.min(Math.round(224*s),Math.floor((width-gap*(cols-1))/cols)),step=size+Math.round(70*s);
    var albumsH=Math.round(38*s);ssCollectionRows.push({y:y,h:albumsH,caption:'专辑'});y+=albumsH;
    for(var a=0;a<artistAlbums.length;a+=cols){ssCollectionRows.push({y:y,h:step,tiles:artistAlbums.slice(a,a+cols),size:size,gap:gap});y+=step;}
    var sectionH=Math.round(42*s);ssCollectionRows.push({y:y,h:sectionH,caption:'曲目'});y+=sectionH;
  }
  for(var b=0;b<artistAlbums.length;b++){
    var al=artistAlbums[b];
    if(!albumOnly&&(!gallery||al.tracks.length!==1)){ssCollectionRows.push({y:y,h:header,album:al});y+=header;}
    for(var t=0;t<al.tracks.length;t++){
      ssCollectionRows.push({y:y,h:rowH,block:b,idx:t,track:al.tracks[t],sequence:gallery&&al.tracks.length===1?b+1:0});y+=rowH;
    }
    if(!albumOnly&&(!gallery||al.tracks.length!==1))y+=Math.round(10*s);
  }
  ssCollectionHeight=y;
}
function ssFirstCollectionRow(offset){
  var lo=0,hi=ssCollectionRows.length;
  while(lo<hi){
    var mid=(lo+hi)>>1,row=ssCollectionRows[mid];
    if(row.y+row.h<=offset)lo=mid+1;else hi=mid;
  }
  return lo;
}
function ssCollectionViewport(gr,r,top,contentH){
  var bottom=r.y+r.h,height=bottom-top;
  SS_COLLECTION_SCROLL_MAX=Math.max(0,contentH-Math.max(0,height));
  artScroll=clampPx(artScroll,SS_COLLECTION_SCROLL_MAX);artScrollT=clampPx(artScrollT,SS_COLLECTION_SCROLL_MAX);
  if(height<=0||!contentH)return null;
  var offset=Math.round(artScroll),layer=ssBeginViewport('collection-list',gr,r.x,top,r.w,height);
  return {gr:layer.gr,bottom:bottom,offset:offset,finish:function(){
    layer.finish();
    drawScrollbar(gr,r.x+r.w-10,top,height,artScroll,SS_COLLECTION_SCROLL_MAX,height,contentH,hv(r.x,top,r.x+r.w,bottom)||drag==='scroll');
  }};
}
function ssDisplayAlbumYear(year){return /^[1-9]\d{3}$/.test(year)?year:'';}
// A verified portrait keeps its original aspect ratio. Group photos must retain every face.
function ssDrawArtistPortrait(gr,x,y,height,name){
  var record=ssArtistRecord(name),key=name+'|portrait|'+height,img=ssArtistImages[key];
  if(img===undefined){
    img=null;var source=null;
    if(record&&record.portrait)try{
      source=gdi.Image(record.portrait);
      var width=Math.max(1,Math.min(Math.round(height*1.35),Math.round(height*source.Width/source.Height)));
      var fit=Math.min(width/source.Width,height/source.Height),drawW=Math.round(source.Width*fit),drawH=Math.round(source.Height*fit);
      img=gdi.CreateImage(width,height);var g=img.GetGraphics();g.SetInterpolationMode(7);
      g.DrawImage(source,Math.round((width-drawW)/2),Math.round((height-drawH)/2),drawW,drawH,0,0,source.Width,source.Height);
      img.ReleaseGraphics(g);
    }catch(e){img=null;}finally{if(source&&typeof source.Dispose==='function')source.Dispose();}
    if(Object.keys(ssArtistImages).length>120)ssArtistImages={};ssArtistImages[key]=img;
  }
  if(img){gr.DrawImage(img,x,y,img.Width,height,0,0,img.Width,height);return img.Width;}
  ssDrawArtistAvatar(gr,x,y,height,name);return height;
}
function drawArtist(gr,r){
  HB_TR=[];HB_ARTIST_PLAY=null;
  var albumOnly=view==='album',album=albumOnly?artistAlbums[0]:null,s=ssDensity;
  var x=r.x+M.cpad,right=r.x+r.w-M.cpad,w=right-x;
  var narrow=r.w<600*s,art=Math.round(Math.min(narrow?116:174,Math.max(84,r.h*.29))*s);
  var name=albumOnly?(album?album.album:'专辑已移除'):ssArtistName(viewArtist);
  var heroTop=r.y+Math.round(28*s),heroH=Math.max(art,Math.round(144*s)),top=heroTop+heroH+Math.round(36*s),songs=0,heroW=art;
  for(var group of artistAlbums)songs+=group.tracks.length;
  if(album)drawRounded(gr,x,heroTop,art,7,album.handle,album.album);
  else if(!albumOnly)heroW=ssDrawArtistPortrait(gr,x,heroTop,art,viewArtist);
  var tx=x+heroW+Math.round((narrow?24:32)*s),tw=Math.max(1,right-tx),textY=heroTop+Math.round((narrow?0:4)*s);
  var nameH=Math.round((narrow?39:58)*s),eyeH=Math.round(20*s);
  tL(gr,albumOnly?'专辑':'歌手',FONT.eyebrow,COL.text3,tx,textY,tw,eyeH);
  tL(gr,name,narrow?FONT.title:FONT.display,COL.text,tx,textY+eyeH,tw,nameH);
  var caption=albumOnly?(album?ssArtistName(album.artist)+' '+CH_DOT+' ':''):artistAlbums.length+' 张专辑 '+CH_DOT+' ';
  tL(gr,caption+songs+' 首歌曲',FONT.meta,COL.text2,tx,textY+eyeH+nameH+2*s,tw,Math.round(24*s));
  var button=Math.round(34*s),by=heroTop+heroH-button,infoX=tx;
  if(songs){
    var actionW=Math.min(Math.round(94*s),tw);
    gr.FillRoundRect(tx,by,actionW,button,6,6,hv(tx,by,tx+actionW,by+button)?COL.greenHover:COL.green);
    drawIcon(gr,'play',COL.onAccent,tx+10*s,by,22*s,button,16*s);
    tL(gr,'播放',FONT.pl,COL.onAccent,tx+36*s,by,Math.max(1,actionW-38*s),button);
    HB_ARTIST_PLAY={x0:tx,y0:by,x1:tx+actionW,y1:by+button,pl:-1};
    if(albumOnly){HB_ARTIST_PLAY.album=viewAlbum;HB_ARTIST_PLAY.label='播放整张专辑';}
    else{HB_ARTIST_PLAY.artist=viewArtist;HB_ARTIST_PLAY.label='播放歌手全部歌曲';}
    infoX+=actionW+Math.round(16*s);
  }
  var bw=Math.max(1,Math.min(right-infoX,Math.round(106*s)));
  var link={x0:infoX,y0:by,x1:infoX+bw,y1:by+button};
  if(hv(link.x0,link.y0,link.x1,link.y1))gr.FillRoundRect(infoX,by,bw,button,6,6,COL.rowHover);
  tL(gr,albumOnly?'返回':'歌手资料',FONT.pl,COL.text2,infoX+5*s,by,bw-10*s,button);
  if(albumOnly)HB_ALBUM_BACK=link;else SS_ARTIST_HB=link;
  ssBuildCollectionRows(albumOnly,s,w);
  var layer=ssCollectionViewport(gr,r,top,ssCollectionHeight);
  if(!layer)return;
  try{
    for(var i=ssFirstCollectionRow(layer.offset);i<ssCollectionRows.length;i++){
      var row=ssCollectionRows[i],y=top+row.y-layer.offset;
      if(y>=layer.bottom)break;
      var box={x0:x-6,y0:Math.max(y,top),x1:right+4,y1:Math.min(y+row.h,layer.bottom)};
      if(row.tiles){
        for(var j=0;j<row.tiles.length;j++){
          var tile=row.tiles[j],cx=x+j*(row.size+row.gap),cy=y+Math.round(4*s);
          var tileBox={x0:cx,y0:Math.max(top,cy),x1:cx+row.size,y1:Math.min(layer.bottom,y+row.h),kind:'album',id:tile.id};
          drawRounded(layer.gr,cx,cy,row.size,4,tile.handle,tile.album);
          tL(layer.gr,tile.album,FONT.pl,COL.text,cx,cy+row.size+Math.round(8*s),row.size,Math.round(22*s));
          tL(layer.gr,[ssDisplayAlbumYear(tile.year),tile.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' '),FONT.plSub,COL.text2,cx,cy+row.size+Math.round(31*s),row.size,Math.round(20*s));
          if(tile.named&&tileBox.y1>tileBox.y0)HB_CARD.push(tileBox);
        }
      }else if(row.caption){
        tL(layer.gr,row.caption,FONT.sect,COL.text,x,y,w,row.h-4);

      }else if(row.album){
        var a=row.album,cs=Math.round(34*s),dx=x+cs+Math.round(12*s);
        if(a.named&&hv(box.x0,box.y0,box.x1,box.y1))layer.gr.FillRoundRect(x-6,y,w+10,row.h,6,6,COL.rowHover);
        drawRounded(layer.gr,x,y+Math.round(8*s),cs,6,a.handle,a.album);
        tL(layer.gr,a.album,FONT.card,COL.text,dx,y+Math.round(6*s),right-dx,Math.round(21*s));
        tL(layer.gr,[ssDisplayAlbumYear(a.year),a.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' '),FONT.meta,COL.text2,dx,y+Math.round(27*s),right-dx,Math.round(18*s));
        if(a.named){box.kind='album';box.id=a.id;HB_CARD.push(box);}
      }else{
        var tr=row.track,numberX=x+Math.round(32*s),durW=Math.round(56*s);
        if(ssRowHover(box.x0,box.y0,box.x1,box.y1))layer.gr.FillRoundRect(x-6,y,w+10,row.h,4,4,COL.rowHover);
        tL(layer.gr,String(row.sequence||tr.number||row.idx+1),FONT.rowNum,COL.text2,x,y,numberX-x,row.h);
        tL(layer.gr,tr.title,FONT.rowTitle,COL.text,numberX,y,Math.max(1,right-durW-numberX),row.h);
        tR(layer.gr,tr.dur,FONT.rowCell,COL.text2,right-durW,y,durW,row.h);

        box.lib=true;box.block=row.block;box.idx=row.idx;box.rowY=y;box.rowH=row.h;HB_TR.push(box);
      }
    }
  }finally{layer.finish();}
}
function drawAlbums(gr,r){
  var s=ssDensity,x=r.x+M.cpad,right=r.x+r.w-M.cpad,albums=getAlbumCatalog().albums;
  var top=r.y+Math.round(84*s),rowH=Math.round(70*s),cover=Math.round(48*s);
  tL(gr,'专辑',FONT.title,COL.text,x,r.y+Math.round(10*s),right-x,Math.round(54*s));
  if(!albums.length)tL(gr,'还没有带专辑标签的歌曲',FONT.pl,COL.text2,x,top,right-x,Math.round(36*s));
  var layer=ssCollectionViewport(gr,r,top,albums.length*rowH);
  if(!layer)return;
  try{
    for(var i=Math.floor(layer.offset/rowH);i<albums.length;i++){
      var a=albums[i],y=top+i*rowH-layer.offset;
      if(y>=layer.bottom)break;
      var box={x0:x-6,y0:Math.max(top,y),x1:right+4,y1:Math.min(layer.bottom,y+rowH),kind:'album',id:a.id};
      if(hv(box.x0,box.y0,box.x1,box.y1))layer.gr.FillRoundRect(x-6,y,right-x+10,rowH,6,6,COL.rowHover);
      drawRounded(layer.gr,x,y+(rowH-cover)/2,cover,5,a.handle,a.album);
      var tx=x+cover+Math.round(12*s);
      tL(layer.gr,a.album,FONT.pl,COL.text,tx,y+Math.round(9*s),right-tx,Math.round(24*s));
      tL(layer.gr,ssArtistName(a.artist)+' '+CH_DOT+' '+a.tracks.length+' 首歌曲',FONT.plSub,COL.text2,tx,y+Math.round(35*s),right-tx,Math.round(22*s));
      HB_CARD.push(box);
    }
  }finally{layer.finish();}
}
