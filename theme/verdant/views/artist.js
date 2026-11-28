/* verdant/views/artist.js -- Apple Music-style Albums grid, Album detail, and Artist detail views
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */
var ssCollectionRows=[],ssCollectionRowsSource=null,ssCollectionAlbumOnly=false,ssCollectionDensity=0,ssCollectionHeight=0,ssCollectionWidth=0;
function ssDrawCoverElevated(gr,x,y,size,rad,handle,seed){
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  if(typeof RGBA==='function'){
    ssFillContinuousRect(gr,x,y+3,size,size,rad,rad,RGBA(0,0,0,isDark?36:18));
    ssFillContinuousRect(gr,x,y+1,size,size,rad,rad,RGBA(0,0,0,isDark?20:10));
  }
  drawRounded(gr,x,y,size,rad,handle,seed);
  if(typeof strokeRound==='function')strokeRound(gr,x,y,size,size,rad,1,typeof ssInk==='function'?ssInk(isDark?22:14):COL.line);
}
function ssBuildCollectionRows(albumOnly,s,width){
  if(ssCollectionRowsSource===artistAlbums&&ssCollectionAlbumOnly===albumOnly&&ssCollectionDensity===s&&ssCollectionWidth===width)return;
  ssCollectionRowsSource=artistAlbums;ssCollectionAlbumOnly=albumOnly;ssCollectionDensity=s;ssCollectionWidth=width;ssCollectionRows=[];
  var y=0,header=Math.round(66*s),rowH=albumOnly?Math.max(Math.round(42*s),ssTrackTextMetrics(s,false).title):Math.round(M.rowH*s);
  var namedAlbums=albumOnly?[]:artistAlbums.filter(function(album){return album.named;});
  if(namedAlbums.length){
    var sectionH=Math.round(38*s),grid=ssAlbumGrid(width,s),gap=grid.gap,cols=grid.cols;
    var size=grid.size,step=size+ssAlbumLabelHeight(s)+Math.round(14*s);
    ssCollectionRows.push({y:y,h:sectionH,label:'专辑'});y+=sectionH;
    for(var a=0;a<namedAlbums.length;a+=cols){ssCollectionRows.push({y:y,h:step,tiles:namedAlbums.slice(a,a+cols),size:size,gap:gap});y+=step;}
    ssCollectionRows.push({y:y,h:sectionH,label:'曲目',rule:true});y+=sectionH;
  }
  var hasAlbumGroups=artistAlbums.some(function(album){return album.tracks.length>1;});
  var singlesStarted=false,singleNumber=0,order=[];
  for(var index=0;index<artistAlbums.length;index++)if(albumOnly||artistAlbums[index].tracks.length>1)order.push(index);
  if(!albumOnly)for(index=0;index<artistAlbums.length;index++)if(artistAlbums[index].tracks.length<=1)order.push(index);
  for(var position=0;position<order.length;position++){
    var b=order[position];
    var al=artistAlbums[b];
    if(!albumOnly&&al.tracks.length>1){ssCollectionRows.push({y:y,h:header,album:al});y+=header;singlesStarted=false;}
    else if(!albumOnly&&!singlesStarted&&(hasAlbumGroups||!namedAlbums.length)){ssCollectionRows.push({y:y,h:Math.round(36*s),label:'单曲',rule:hasAlbumGroups});y+=Math.round(36*s);singlesStarted=true;}
    for(var t=0;t<al.tracks.length;t++){
      ssCollectionRows.push({y:y,h:rowH,block:b,idx:t,track:al.tracks[t],number:!albumOnly&&al.tracks.length===1?++singleNumber:0});y+=rowH;
    }
    if(!albumOnly&&al.tracks.length>1)y+=Math.round(18*s);
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
    drawScrollbar(gr,r.x+r.w-10,top,height,artScroll,SS_COLLECTION_SCROLL_MAX,height,contentH,[r.x,top,r.x+r.w,bottom]);
  }};
}
function ssDisplayAlbumYear(year){return /^[1-9]\d{3}$/.test(year)?year:'';}
function drawArtist(gr,r){
  HB_TR=[];HB_ARTIST_PLAY=null;
  var albumOnly=view==='album',album=albumOnly?artistAlbums[0]:null,s=ssDensity;
  var rSm=typeof ssRad==='function'?ssRad('sm',s):Math.round(4*s),rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),rLg=typeof ssRad==='function'?ssRad('lg',s):Math.round(12*s);
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var content=ssLibraryTrackLayout(r,s,undefined,Math.round(1440*s)),x=content.x,w=content.w,right=content.right;
  var art=Math.round(Math.min(r.w<600?96:116,Math.max(64,r.h*.24))*s),ay=r.y+Math.round(24*s);
  var name=albumOnly?(album?album.album:'专辑已移除'):ssArtistName(viewArtist);
  var top=ay+art+Math.round(62*s),songs=0;
  for(var group of artistAlbums)songs+=group.tracks.length;
  var numX=x+content.playW+Math.round(4*s),numW=albumOnly?ssTrackNumberWidth(s,songs):0;
  var trackX=(albumOnly?numX+numW:x+content.playW)+content.gap,trackW=content.moreX-content.gap-trackX;
  gr.FillSolidRect(r.x,r.y,r.w,Math.min(r.h,top-r.y),COL.base);
  if(album){ssDrawCoverElevated(gr,x,ay,art,rMd,album.handle,album.album);}
  else if(!albumOnly){
    ssDrawArtistAvatar(gr,x,ay,art,viewArtist);
    if(typeof gr.DrawEllipse==='function')gr.DrawEllipse(x,ay,art,art,1,typeof ssInk==='function'?ssInk(isDark?24:16):COL.line);
  }
  var tx=x+art+Math.round(20*s),tw=Math.max(1,right-tx),text=ssHeaderBoxes(art,true,s);
  tL(gr,albumOnly?'专辑':'歌手',FONT.eyebrow,COL.text2,tx,ay+text.eyeY,tw,text.eyeH);
  tL(gr,name,FONT.title,COL.text,tx,ay+text.titleY,tw,text.titleH);
  var caption=albumOnly?(album?ssArtistName(album.artist)+CH_DOT:''):artistAlbums.length+' 张专辑 '+CH_DOT+' ';
  tL(gr,caption+songs+' 首歌曲',FONT.meta,COL.text2,tx,Math.min(ay+text.metaY,top-Math.round(72*s)),tw,text.metaH);
  var button=Math.max(32,Math.round(36*s)),by=top-button-Math.round(12*s),infoX=x;
  if(songs){
    HB_ARTIST_PLAY=drawPlaylistPlay(gr,x,by,button,-1);
    if(albumOnly){HB_ARTIST_PLAY.album=viewAlbum;HB_ARTIST_PLAY.label='播放整张专辑';}
    else{HB_ARTIST_PLAY.artist=viewArtist;HB_ARTIST_PLAY.label='播放歌手全部歌曲';}
    infoX+=button+Math.round(10*s);
  }
  var bw=Math.max(1,Math.min(right-infoX,Math.round((albumOnly?82:112)*s)));
  var link={x0:infoX,y0:by,x1:infoX+bw,y1:by+button},linkHot=hv(link.x0,link.y0,link.x1,link.y1);
  if(albumOnly){
    if(linkHot)ssFillContinuousRect(gr,infoX,by,bw,button,rMd,rMd,COL.rowHover);
    if(linkHot&&typeof strokeRound==='function')strokeRound(gr,infoX,by,bw,button,rMd,1,COL.line);
    var isz=Math.round(15*s);
    drawIcon(gr,'back',linkHot?COL.text:COL.text2,infoX+Math.round(8*s),by+Math.round((button-isz)/2),isz,isz,isz);
    tL(gr,'返回',FONT.pl,linkHot?COL.text:COL.text2,infoX+Math.round(28*s),by,Math.max(1,bw-Math.round(34*s)),button);
  }else{
    ssFillContinuousRect(gr,infoX,by,bw,button,rMd,rMd,linkHot?COL.rowHover:COL.elev);
    if(typeof strokeRound==='function')strokeRound(gr,infoX,by,bw,button,rMd,1,linkHot?COL.text3:COL.line);
    tC(gr,'歌手资料',FONT.pl,linkHot?COL.text:COL.text2,infoX,by,bw,button);
  }
  if(albumOnly)HB_ALBUM_BACK=link;else SS_ARTIST_HB=link;
  if(albumOnly&&songs){
    var headerH=Math.round(26*s);
    tR(gr,'#',FONT.head,COL.text2,numX,top,numW,headerH);
    tL(gr,'歌曲',FONT.head,COL.text2,trackX,top,trackW,headerH);
    drawIcon(gr,'clock',COL.text2,right-Math.round(16*s),top,Math.round(16*s),headerH,Math.round(15*s));
    gr.FillSolidRect(x,top+headerH-1,w,1,COL.line);
    top+=headerH;
  }else if(!albumOnly){
    gr.FillSolidRect(x,top-1,w,1,COL.line);
  }
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
          var tile=row.tiles[j],cx=x+j*(row.size+row.gap),cy=y+Math.round(6*s);
          var tileBox={x0:cx,y0:Math.max(top,cy),x1:cx+row.size,y1:Math.min(layer.bottom,y+row.h),kind:'album',id:tile.id};
          var tHot=tile.named&&hv(tileBox.x0,tileBox.y0,tileBox.x1,tileBox.y1);
          if(tHot){
            var hp=Math.round(6*s),th=row.size+ssAlbumLabelHeight(s);
            ssFillContinuousRect(layer.gr,cx-hp,cy-hp,row.size+hp*2,th+hp*2,rLg,rLg,COL.rowHover);
          }
          ssDrawCoverElevated(layer.gr,cx,cy,row.size,rMd,tile.handle,tile.album);
          var detail=[ssDisplayAlbumYear(tile.year),tile.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' ');
          ssDrawAlbumLabels(layer.gr,tile.album,detail,cx,cy+row.size,row.size,s);
          if(tile.named&&tileBox.y1>tileBox.y0)HB_CARD.push(tileBox);
        }
      }else if(row.label){
        if(row.rule&&y>top+2)layer.gr.FillSolidRect(x,y+Math.round(4*s),w,1,COL.line);
        tL(layer.gr,row.label,FONT.sect2,COL.text,x,y+Math.round((row.rule?8:4)*s),w,row.h-Math.round((row.rule?8:4)*s));
      }else if(row.album){
        var a=row.album,cs=Math.round(48*s),dx=x+cs+Math.round(14*s);
        var aHot=a.named&&hv(box.x0,box.y0,box.x1,box.y1);
        if(aHot){
          ssFillContinuousRect(layer.gr,x-6,y+2,w+12,row.h-4,rMd,rMd,COL.rowHover);
          if(typeof strokeRound==='function')strokeRound(layer.gr,x-6,y+2,w+12,row.h-4,rMd,1,COL.line);
        }
        ssDrawCoverElevated(layer.gr,x,y+Math.round((row.h-cs)/2),cs,rSm,a.handle,a.album);
        tL(layer.gr,a.album,FONT.sect2,COL.text,dx,y+Math.round(10*s),right-dx,Math.round(26*s));
        tL(layer.gr,[ssDisplayAlbumYear(a.year),a.tracks.length+' 首歌曲'].filter(Boolean).join(' '+CH_DOT+' '),FONT.meta,COL.text2,dx,y+Math.round(36*s),right-dx,Math.round(20*s));
        if(a.named){box.kind='album';box.id=a.id;HB_CARD.push(box);}
      }else{
        var tr=row.track,moreX=content.moreX,moreW=content.moreW,moreY=y+Math.round((row.h-moreW)/2);
        var active=ssIsCurrentTrack(tr.handle);
        box.x0=content.rowLeft;box.x1=content.personalRight;
        var hovering=ssRowHover(box.x0,box.y0,box.x1,box.y1),group=artistAlbums[row.block];
        ssDrawLibraryRowSurface(layer.gr,content,y,row.h,hovering,row.idx%2===1);
        ssDrawTrackLead(layer.gr,x,y,content.playW,row.h,active);
        if(albumOnly)tR(layer.gr,String(row.idx+1),FONT.rowNum,active?COL.green:COL.text2,numX,y,numW,row.h);
        ssDrawTrackLabels(layer.gr,tr.title,row.number&&group.named&&group.album!==tr.title?group.album:'',active?COL.green:COL.text,trackX,y,trackW,row.h,s);
        drawIcon(layer.gr,'more',hovering?COL.text:COL.text2,moreX,moreY,moreW,moreW,Math.round(17*s));
        tR(layer.gr,tr.dur,FONT.rowCell,COL.text2,right-content.durW,y,content.durW,row.h);
        box.lib=true;box.block=row.block;box.idx=row.idx;box.rowY=y;box.rowH=row.h;box.pgx0=x;box.pgx1=x+content.playW;box.playOnHover=true;box.playVisible=true;box.playId=tr.handle?ssTrackID(tr.handle):row.block+":"+row.idx;box.more={x0:moreX,y0:moreY,x1:moreX+moreW,y1:moreY+moreW};HB_TR.push(box);
      }
    }
  }finally{layer.finish();}
}
function drawAlbums(gr,r){
  var s=ssDensity,rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),rLg=typeof ssRad==='function'?ssRad('lg',s):Math.round(12*s);
  var x=r.x+M.cpad,right=r.x+r.w-M.cpad,w=right-x,albums=getAlbumCatalog().albums;
  var top=r.y+Math.round(92*s);
  tL(gr,'专辑',FONT.title,COL.text,x,r.y+Math.round(12*s),w,Math.round(40*s));
  tL(gr,albums.length+' 张专辑',FONT.meta,COL.text2,x,r.y+Math.round(52*s),w,Math.round(20*s));
  gr.FillSolidRect(x,top-Math.round(10*s),w,1,COL.line);
  if(!albums.length){
    var boxW=Math.min(w,Math.round(420*s)),boxH=Math.round(108*s),pad=Math.round(20*s);
    ssFillContinuousRect(gr,x,top+Math.round(8*s),boxW,boxH,rLg,rLg,COL.elev);
    if(typeof strokeRound==='function')strokeRound(gr,x,top+Math.round(8*s),boxW,boxH,rLg,1,COL.line);
    tL(gr,'还没有带专辑标签的歌曲',FONT.sect2,COL.text,x+pad,top+Math.round(28*s),boxW-pad*2,Math.round(26*s));
    tL(gr,'为曲库歌曲补充专辑标签后，将按封面网格整齐展示。',FONT.meta,COL.text2,x+pad,top+Math.round(58*s),boxW-pad*2,Math.round(22*s));
    return;
  }
  var grid=ssAlbumGrid(w,s,undefined,7),gap=grid.gap,cols=grid.cols;
  var tileW=grid.size,tileH=tileW+ssAlbumLabelHeight(s),rowStep=tileH+Math.round(22*s);
  var contentH=Math.ceil(albums.length/cols)*rowStep+Math.round(12*s);
  var layer=ssCollectionViewport(gr,r,top,contentH);
  if(!layer)return;
  try{
    var first=Math.floor(layer.offset/rowStep)*cols,last=Math.min(albums.length,Math.ceil((layer.bottom-top+layer.offset)/rowStep)*cols);
    var moving=typeof ssResizeAnimating==='function'&&ssResizeAnimating(),indices=[];
    for(var index=first;index<last;index++)indices.push(index);
    if(moving)for(var old of ssResizeFlow.indices)if(old<albums.length&&(old<first||old>=last))indices.push(old);
    var edge=r.x+r.w,leftFade=false,rightFade=false,hpad=Math.round(7*s);
    for(var i of indices){
      var a=albums[i],row=Math.floor(i/cols),col=i%cols;
      var ty=top+Math.round(8*s)+row*rowStep-layer.offset,tx=x+col*(tileW+gap);
      if(moving){var p=ssResizePosition('album:'+a.id,tx,ty);tx=p.x;ty=p.y;}
      if(ty>=layer.bottom||ty+tileH<=top||tx>=edge||tx+tileW<=r.x)continue;
      leftFade=leftFade||tx<r.x;rightFade=rightFade||tx+tileW>edge;
      var box={x0:Math.max(r.x,tx),y0:Math.max(top,ty),x1:Math.min(edge,tx+tileW),y1:Math.min(layer.bottom,ty+tileH),
        kind:'album',id:a.id,paintX:tx,paintY:ty,albumIndex:i};
      var hot=hv(box.x0,box.y0,box.x1,box.y1);
      if(hot){
        ssFillContinuousRect(layer.gr,tx-hpad,ty-hpad,tileW+hpad*2,tileH+hpad*2,rLg,rLg,COL.rowHover);
        if(typeof strokeRound==='function')strokeRound(layer.gr,tx-hpad,ty-hpad,tileW+hpad*2,tileH+hpad*2,rLg,1,COL.line);
      }
      ssDrawCoverElevated(layer.gr,tx,ty,tileW,rMd,a.handle,a.album);
      ssDrawAlbumLabels(layer.gr,a.album,ssArtistName(a.artist),tx,ty+tileW,tileW,s);
      HB_CARD.push(box);
    }
    if(moving&&(leftFade||rightFade))ssResizeEdgeFade(layer.gr,r.x,top,r.w,layer.bottom-top,leftFade,rightFade);
  }finally{layer.finish();}
}
