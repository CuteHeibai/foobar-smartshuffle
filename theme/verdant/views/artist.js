/* Artist and album tracks share a clipped pixel viewport. */
var ssCollectionRows=[],ssCollectionRowsSource=null,ssCollectionAlbumOnly=false,ssCollectionDensity=0,ssCollectionHeight=0,ssCollectionWidth=0;
function ssBuildCollectionRows(albumOnly,s,width){
  if(ssCollectionRowsSource===artistAlbums&&ssCollectionAlbumOnly===albumOnly&&ssCollectionDensity===s&&ssCollectionWidth===width)return;
  ssCollectionRowsSource=artistAlbums;ssCollectionAlbumOnly=albumOnly;ssCollectionDensity=s;ssCollectionWidth=width;ssCollectionRows=[];
  var y=0,header=Math.round(62*s),rowH=albumOnly?Math.max(Math.round(40*s),ssTrackTextMetrics(s,false).title):M.rowH;
  var namedAlbums=albumOnly?[]:artistAlbums.filter(function(album){return album.named;});
  if(namedAlbums.length){
    var sectionH=Math.round(34*s),grid=ssAlbumGrid(width,s,138),gap=grid.gap,cols=grid.cols;
    var size=grid.size,step=size+ssAlbumLabelHeight(s,1)+Math.round(10*s);
    ssCollectionRows.push({y:y,h:sectionH,label:'专辑'});y+=sectionH;
    for(var a=0;a<namedAlbums.length;a+=cols){ssCollectionRows.push({y:y,h:step,tiles:namedAlbums.slice(a,a+cols),size:size,gap:gap});y+=step;}
    ssCollectionRows.push({y:y,h:sectionH,label:'曲目'});y+=sectionH;
  }
  var hasAlbumGroups=artistAlbums.some(function(album){return album.tracks.length>1;});
  var singlesStarted=false,singleNumber=0,order=[];
  for(var index=0;index<artistAlbums.length;index++)if(albumOnly||artistAlbums[index].tracks.length>1)order.push(index);
  if(!albumOnly)for(index=0;index<artistAlbums.length;index++)if(artistAlbums[index].tracks.length<=1)order.push(index);
  for(var position=0;position<order.length;position++){
    var b=order[position];
    var al=artistAlbums[b];
    if(!albumOnly&&al.tracks.length>1){ssCollectionRows.push({y:y,h:header,album:al});y+=header;singlesStarted=false;}
    else if(!albumOnly&&!singlesStarted&&(hasAlbumGroups||!namedAlbums.length)){ssCollectionRows.push({y:y,h:Math.round(34*s),label:'单曲'});y+=Math.round(34*s);singlesStarted=true;}
    for(var t=0;t<al.tracks.length;t++){
      ssCollectionRows.push({y:y,h:rowH,block:b,idx:t,track:al.tracks[t],number:!albumOnly&&al.tracks.length===1?++singleNumber:0});y+=rowH;
    }
    if(!albumOnly&&al.tracks.length>1)y+=Math.round(16*s);
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
function drawArtist(gr,r){
  HB_TR=[];HB_ARTIST_PLAY=null;
  var albumOnly=view==='album',album=albumOnly?artistAlbums[0]:null,s=ssDensity;
  var content=ssLibraryReadingRect(r),x=content.x,w=content.w,right=x+w;
  var art=Math.round(Math.min(r.w<600?96:112,Math.max(64,r.h*.24))*s),ay=r.y+Math.round(24*s);
  var name=albumOnly?(album?album.album:'专辑已移除'):ssArtistName(viewArtist);
  var top=ay+art+Math.round(60*s),songs=0;
  for(var group of artistAlbums)songs+=group.tracks.length;
  gr.FillGradRect(r.x,r.y,r.w,Math.min(r.h,top-r.y),90,COL.base,COL.base,1.0);
  if(album){drawRounded(gr,x,ay,art,7,album.handle,album.album);}
  else if(!albumOnly)ssDrawArtistAvatar(gr,x,ay,art,viewArtist);
  var tx=x+art+Math.round(18*s),tw=Math.max(1,right-tx),text=ssHeaderBoxes(art,true,s);
  tL(gr,albumOnly?'专辑':'歌手',FONT.eyebrow,COL.text,tx,ay+text.eyeY,tw,text.eyeH);
  tL(gr,name,FONT.title,COL.text,tx,ay+text.titleY,tw,text.titleH);
  var caption=albumOnly?(album?ssArtistName(album.artist)+CH_DOT:''):artistAlbums.length+' 张专辑 '+CH_DOT+' ';
  tL(gr,caption+songs+' 首歌曲',FONT.meta,COL.text2,tx,Math.min(ay+text.metaY,top-Math.round(72*s)),tw,text.metaH);
  var button=Math.max(32,Math.round(38*s)),by=top-button-Math.round(10*s),infoX=x;
  if(songs){
    HB_ARTIST_PLAY=drawPlaylistPlay(gr,x,by,button,-1);
    if(albumOnly){HB_ARTIST_PLAY.album=viewAlbum;HB_ARTIST_PLAY.label='播放整张专辑';}
    else{HB_ARTIST_PLAY.artist=viewArtist;HB_ARTIST_PLAY.label='播放歌手全部歌曲';}
    infoX+=button+Math.round(10*s);
  }
  var bw=Math.max(1,Math.min(right-infoX,Math.round(116*s)));
  var link={x0:infoX,y0:by,x1:infoX+bw,y1:by+button};
  ssFillContinuousRect(gr,infoX,by,bw,button,8,8,hv(link.x0,link.y0,link.x1,link.y1)?COL.rowHover:COL.elev);
  tC(gr,albumOnly?'返回':'歌手资料',FONT.pl,COL.text2,infoX,by,bw,button);
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
          var detail=[ssDisplayAlbumYear(tile.year),tile.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' ');
          ssDrawAlbumLabels(layer.gr,tile.album,detail,cx,cy+row.size,row.size,s,1);
          if(tile.named&&tileBox.y1>tileBox.y0)HB_CARD.push(tileBox);
        }
      }else if(row.label){
        tL(layer.gr,row.label,FONT.sect,COL.text,x,y,w,row.h);
      }else if(row.album){
        var a=row.album,cs=Math.round(46*s),dx=x+cs+Math.round(12*s);
        if(a.named&&hv(box.x0,box.y0,box.x1,box.y1))ssFillContinuousRect(layer.gr,x-6,y,w+10,row.h,6,6,COL.rowHover);
        drawRounded(layer.gr,x,y+Math.round(8*s),cs,6,a.handle,a.album);
        tL(layer.gr,a.album,FONT.sect2,COL.text,dx,y+Math.round(10*s),right-dx,Math.round(26*s));
        tL(layer.gr,[ssDisplayAlbumYear(a.year),a.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' '),FONT.meta,COL.text2,dx,y+Math.round(34*s),right-dx,Math.round(20*s));
        if(a.named){box.kind='album';box.id=a.id;HB_CARD.push(box);}
      }else{
        var tr=row.track,playW=ssTrackPlayWidth(s),tx=x+playW+Math.round(12*s),durW=Math.round(56*s);
        var active=ssIsCurrentTrack(tr.handle);
        var hovering=ssRowHover(box.x0,box.y0,box.x1,box.y1),group=artistAlbums[row.block];
        if(hovering)ssFillContinuousRect(layer.gr,x-6,y,w+10,row.h,4,4,COL.rowHover);
        ssDrawTrackLead(layer.gr,x,y,playW,row.h,row.number||tr.number||row.idx+1,active);
        ssDrawTrackLabels(layer.gr,tr.title,row.number&&group.named&&group.album!==tr.title?group.album:'',COL.text,tx,y,right-durW-tx,row.h,s);
        tR(layer.gr,tr.dur,FONT.rowCell,COL.text2,right-durW,y,durW,row.h);
        box.lib=true;box.block=row.block;box.idx=row.idx;box.rowY=y;box.rowH=row.h;box.pgx0=x;box.pgx1=x+playW;box.playOnHover=true;box.playVisible=active;box.playId=tr.handle?ssTrackID(tr.handle):row.block+":"+row.idx;HB_TR.push(box);
      }
    }
  }finally{layer.finish();}
}
function drawAlbums(gr,r){
  var s=ssDensity,x=r.x+M.cpad,right=r.x+r.w-M.cpad,w=right-x,albums=getAlbumCatalog().albums;
  var top=r.y+Math.round(92*s);
  tL(gr,'专辑',FONT.title,COL.text,x,r.y+Math.round(10*s),w,Math.round(40*s));
  tL(gr,albums.length+' 张专辑',FONT.meta,COL.text2,x,r.y+Math.round(50*s),w,Math.round(20*s));
  if(!albums.length)tL(gr,'还没有带专辑标签的歌曲',FONT.pl,COL.text2,x,top,w,Math.round(36*s));
  var grid=ssAlbumGrid(w,s),gap=grid.gap,cols=grid.cols;
  var tileW=grid.size,tileH=tileW+ssAlbumLabelHeight(s,1),rowStep=tileH+Math.round(18*s);
  var contentH=Math.ceil(albums.length/cols)*rowStep;
  var layer=ssCollectionViewport(gr,r,top,contentH);
  if(!layer)return;
  try{
    var first=Math.floor(layer.offset/rowStep)*cols;
    for(var i=first;i<albums.length;i++){
      var a=albums[i],row=Math.floor(i/cols),col=i%cols;
      var ty=top+row*rowStep-layer.offset,tx=x+col*(tileW+gap);
      if(ty>=layer.bottom)break;
      if(ty+tileH<=top)continue;
      var box={x0:tx,y0:Math.max(top,ty),x1:tx+tileW,y1:Math.min(layer.bottom,ty+tileH),kind:'album',id:a.id};
      if(hv(box.x0,box.y0,box.x1,box.y1))ssFillContinuousRect(layer.gr,tx-6,ty,tileW+12,tileH+10,8,8,COL.rowHover);
      drawRounded(layer.gr,tx,ty,tileW,6,a.handle,a.album);
      ssDrawAlbumLabels(layer.gr,a.album,ssArtistName(a.artist),tx,ty+tileW,tileW,s,1);
      HB_CARD.push(box);
    }
  }finally{layer.finish();}
}
