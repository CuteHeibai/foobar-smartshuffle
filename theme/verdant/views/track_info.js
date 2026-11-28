/* verdant/views/track_info.js -- in-theme Apple Music Track Info / Properties sheet
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var ssTrackInfo=null,HB_TRACK_INFO=[],ssTrackInfoBox=null;

function ssEvalTrackField(h,expr){
  if(!h)return '';
  try{
    var tf=fb.TitleFormat(expr),v=tf.EvalWithMetadb(h);
    return v&&v!=='?'?String(v):'';
  }catch(e){return '';}
}
function ssFormatFileSize(bytes){
  var n=Number(bytes)||0;
  if(n<=0)return '';
  if(n>=1024*1024)return (n/(1024*1024)).toFixed(1)+' MB';
  if(n>=1024)return Math.round(n/1024)+' KB';
  return n+' B';
}
function ssFormatDuration(sec){
  var n=Math.max(0,Math.round(Number(sec)||0)),m=Math.floor(n/60),s=n%60;
  return m+':'+(s<10?'0':'')+s;
}
// Read metadata once on open so paint never performs handle/TF evaluation.
function ssOpenTrackInfo(handle,nativeProp){
  if(!handle){if(typeof nativeProp==='function')nativeProp();return;}
  var title=ssEvalTrackField(handle,'%title%')||'未知曲目';
  var artist=ssEvalTrackField(handle,'%artist%')||'未知歌手';
  var album=ssEvalTrackField(handle,'%album%')||'未知专辑';
  var year=ssEvalTrackField(handle,'%date%');
  var track=ssEvalTrackField(handle,'%tracknumber%');
  var genre=ssEvalTrackField(handle,'%genre%');
  var codec=ssEvalTrackField(handle,'%codec%');
  var bitrate=ssEvalTrackField(handle,'%bitrate%');
  var rate=ssEvalTrackField(handle,'%samplerate%');
  var bits=ssEvalTrackField(handle,'%__bitspersample%');
  var ch=ssEvalTrackField(handle,'%channels%');
  var specs=[];
  if(codec)specs.push(codec);
  if(bitrate)specs.push(bitrate+' kbps');
  if(rate)specs.push((Number(rate)>=1000?(Number(rate)/1000).toFixed(Number(rate)%1000?1:0)+' kHz':rate+' Hz'));
  if(bits)specs.push(bits+' bit');
  if(ch)specs.push(ch);
  ssTrackInfo={
    handle:handle,title:title,artist:artist,album:album,year:year,track:track,genre:genre,
    tech:specs.join(' · ')||'未知格式',
    duration:ssFormatDuration(handle.Length),
    size:ssFormatFileSize(handle.FileSize),
    path:String(handle.Path||handle.RawPath||''),
    nativeProp:typeof nativeProp==='function'?nativeProp:null
  };
  if(typeof applyKeyMode==='function')applyKeyMode();
  repaintAll();
}
function ssCloseTrackInfo(){
  if(!ssTrackInfo)return;
  ssTrackInfo=null;HB_TRACK_INFO=[];ssTrackInfoBox=null;
  if(typeof applyKeyMode==='function')applyKeyMode();
  repaintAll();
}
function drawTrackInfo(gr){
  if(!ssTrackInfo)return;
  HB_TRACK_INFO=[];
  var s=ssDensity,info=ssTrackInfo;
  var mw=Math.min(Math.round(540*s),W-Math.round(48*s));
  var mh=Math.min(Math.round(430*s),H-Math.round(48*s));
  var x=Math.round((W-mw)/2),y=Math.round((H-mh)/2);
  ssTrackInfoBox={x0:x,y0:y,x1:x+mw,y1:y+mh};
  var rLg=typeof ssRad==='function'?ssRad('lg',s):Math.round(12*s);
  var rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  gr.FillSolidRect(0,0,W,H,COL.modalScrim);
  ssFillContinuousRect(gr,x-4,y+6,mw+8,mh+6,rLg+4,rLg+4,COL.shadow);
  ssFillContinuousRect(gr,x,y,mw,mh,rLg,rLg,COL.popup||COL.base);
  if(typeof strokeRound==='function')strokeRound(gr,x,y,mw,mh,rLg,1,COL.line);

  var pad=Math.round(24*s),art=Math.round(76*s),hx=x+pad,hy=y+pad;
  drawRounded(gr,hx,hy,art,rMd,info.handle,info.album||info.title);
  var tx=hx+art+Math.round(16*s),tw=Math.max(40,x+mw-pad-tx);
  tL(gr,info.title,FONT.sect2,COL.text,tx,hy+Math.round(4*s),tw,Math.round(28*s));
  tL(gr,info.artist,FONT.pl,COL.text2,tx,hy+Math.round(34*s),tw,Math.round(20*s));
  tL(gr,info.album+(info.year?' · '+info.year:''),FONT.plSub,COL.text3,tx,hy+Math.round(54*s),tw,Math.round(18*s));

  var cardY=hy+art+Math.round(18*s),footerH=Math.round(62*s),cardH=Math.max(Math.round(120*s),y+mh-footerH-cardY);
  ssFillContinuousRect(gr,hx,cardY,mw-pad*2,cardH,rMd,rMd,COL.elev);
  if(typeof strokeRound==='function')strokeRound(gr,hx,cardY,mw-pad*2,cardH,rMd,1,COL.line);
  var rows=[
    ['音质规格',info.tech],
    ['时长 / 大小',[info.duration,info.size].filter(Boolean).join(' · ')||'—'],
    ['音轨 / 流派',[info.track?'第 '+info.track+' 首':'',info.genre].filter(Boolean).join(' · ')||'—'],
    ['文件路径',info.path||'—']
  ];
  var rh=Math.floor(cardH/rows.length),labelW=Math.round(88*s),valX=hx+Math.round(14*s)+labelW,valW=Math.max(40,x+mw-pad-Math.round(14*s)-valX);
  for(var i=0;i<rows.length;i++){
    var ry=cardY+i*rh;
    if(i>0)gr.DrawLine(hx+Math.round(14*s),ry,x+mw-pad-Math.round(14*s),ry,1,COL.line);
    tL(gr,rows[i][0],FONT.plSub,COL.text3,hx+Math.round(14*s),ry,labelW,rh);
    tL(gr,rows[i][1],FONT.pl,COL.text,valX,ry,valW,rh);
  }

  var bh=Math.round(34*s),by=y+mh-Math.round(16*s)-bh,closeW=Math.round(88*s),nativeW=Math.round(128*s);
  var closeX=x+mw-pad-closeW;
  var closeHot=hv(closeX,by,closeX+closeW,by+bh);
  ssFillContinuousRect(gr,closeX,by,closeW,bh,rMd,rMd,closeHot?COL.greenHover:COL.green);
  tC(gr,'完成',FONT.pl,COL.onAccent,closeX,by,closeW,bh);
  HB_TRACK_INFO.push({x0:closeX,y0:by,x1:closeX+closeW,y1:by+bh,act:'close'});

  if(info.nativeProp){
    var natHot=hv(hx,by,hx+nativeW,by+bh);
    ssFillContinuousRect(gr,hx,by,nativeW,bh,rMd,rMd,natHot?COL.hover:COL.elev);
    if(typeof strokeRound==='function')strokeRound(gr,hx,by,nativeW,bh,rMd,1,COL.line);
    tC(gr,'原生标签编辑…',FONT.pl,COL.text,hx,by,nativeW,bh);
    HB_TRACK_INFO.push({x0:hx,y0:by,x1:hx+nativeW,y1:by+bh,act:'native'});
  }
}
function ssTrackInfoClick(x,y){
  if(!ssTrackInfo)return false;
  var b=hit(HB_TRACK_INFO,x,y);
  if(b){
    var fn=b.act==='native'?ssTrackInfo.nativeProp:null;
    ssCloseTrackInfo();
    if(fn)fn();
    return true;
  }
  if(!ssTrackInfoBox||!inRect(x,y,ssTrackInfoBox))ssCloseTrackInfo();
  return true;
}
