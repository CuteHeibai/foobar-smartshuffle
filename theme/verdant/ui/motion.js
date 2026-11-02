/* Frame-coalesced interaction; modal background is painted once, never per pointer event. */
var ssFrame=0,ssModalImage=null,ssModalImageW=0,ssModalImageH=0,ssTrail=[],ssSceneKey='',ssFadeStart=0,ssFadeZone='main';
var ssPopupImage=null,ssPopupImageOwned=false,ssSceneImage=null,ssSceneW=0,ssSceneH=0,ssPopupRestore=false;
var ssPreferenceFrame=0,ssPreferenceFrameAt=0,ssPreferenceImage=null,ssPreferenceKey='',ssPreferencePartial=false;
function ssDropSceneImage(){if(typeof ssInvalidateRowRasters==='function')ssInvalidateRowRasters();ssDropPopupImage();if(ssSceneImage)try{ssSceneImage.Dispose();}catch(e){}ssSceneImage=null;ssPopupRestore=false;ssHoverPainted=null;ssHoverDirty=false;ssInteractionPainted=[];ssInteractionDamage=[];}
function ssBeginScene(){
  if(!ssSceneImage||ssSceneW!==W||ssSceneH!==H){ssDropSceneImage();ssSceneImage=gdi.CreateImage(Math.max(1,W),Math.max(1,H));ssSceneW=W;ssSceneH=H;}
  ssQuietRows=true;var g=ssSceneImage.GetGraphics();g.SetSmoothingMode(2);g.SetInterpolationMode(5);return g;
}
function ssEndScene(gr,g,regions){
  ssSceneImage.ReleaseGraphics(g);ssQuietRows=false;
  if(!regions){gr.DrawImage(ssSceneImage,0,0,W,H,0,0,W,H);return;}
  for(var i=0;i<regions.length;i++){var r=regions[i];if(r&&r.w>0&&r.h>0)gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);}
}
function ssDropPopupImage(){if(ssPopupImage&&ssPopupImageOwned){try{ssPopupImage.Dispose();}catch(e){}}ssPopupImage=null;ssPopupImageOwned=false;}
function ssPaintPopup(gr){
  if(!ssPopupImage){
    if(ssSceneImage&&ssSceneW===W&&ssSceneH===H){ssPopupImage=ssSceneImage;ssPopupImageOwned=false;}
    else{ssPopupImage=gdi.CreateImage(Math.max(1,W),Math.max(1,H));ssPopupImageOwned=true;var background=ssPopupImage.GetGraphics();ssDrawBase(background);ssPopupImage.ReleaseGraphics(background);}
  }
  gr.DrawImage(ssPopupImage,0,0,W,H,0,0,W,H);drawTitleBar(gr);ssDrawPopup(gr);
}
function ssDropModalImage(){if(ssModalImage){try{ssModalImage.Dispose();}catch(e){}}ssModalImage=null;if(ssPreferenceImage)try{ssPreferenceImage.Dispose();}catch(e){}ssPreferenceImage=null;ssPreferenceKey='';ssTrail=[];if(ssPreferenceFrame)window.ClearTimeout(ssPreferenceFrame);ssPreferenceFrame=0;ssPreferencePartial=false;}
function ssRepaintPreference(){
  if(ssPreferenceFrame) return;
  ssPreferenceFrame=window.SetTimeout(function(){
    ssPreferenceFrame=0;ssPreferenceFrameAt=Date.now();ssPreferencePartial=true;
    if(ssModal&&typeof ssGeometry==='function'){
      var r=ssGeometry(W,H);window.RepaintRect(r.x-2,r.y-2,r.w+4,r.h+4);
    }else repaintAll();
  },Math.max(0,16-(Date.now()-ssPreferenceFrameAt)));
}
function ssRecordTrail(point){
  if(!ssDragging){ssTrail=[];return;}
  var now=Date.now(),last=ssTrail.length?ssTrail[ssTrail.length-1]:null;
  if(last&&last.x===point.x&&last.y===point.y)return;
  var sample={x:point.x,y:point.y,time:now};
  if(last&&(now===last.time||ssTrail.length>1&&now-ssTrail[ssTrail.length-2].time<6))ssTrail[ssTrail.length-1]=sample;
  else ssTrail.push(sample);
  while(ssTrail.length>2&&ssTrail[1].time<now-140)ssTrail.shift();
}
function ssTrailSamples(now){
  var out=[],last=ssTrail.length?ssTrail[ssTrail.length-1]:null;if(!last||now-last.time>=120){ssTrail=[];return out;}
  for(var age=100;age>=20;age-=16){var t=now-age;if(t<ssTrail[0].time)continue;var a=ssTrail[0],b=last;
    for(var i=1;i<ssTrail.length;i++){b=ssTrail[i];if(b.time>=t)break;a=b;}
    var f=Math.max(0,Math.min(1,(t-a.time)/Math.max(1,b.time-a.time))),x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f;
    if(Math.abs(x-ssDraft.x)+Math.abs(y-ssDraft.y)>.025)out.push({x:x,y:y,fade:1-age/120});
  }return out;
}
function ssPreferenceCacheKey(){
  var hot=-1;if(typeof SS_HB!=='undefined')for(var i=0;i<SS_HB.length;i++){var b=SS_HB[i];if(mx>=b.x0&&mx<=b.x1&&my>=b.y0&&my<=b.y1){hot=i;break;}}
  var state=ssState||{};
  return JSON.stringify([W,H,typeof SS_APPEARANCE==='undefined'?'dark':SS_APPEARANCE,ssPreferenceLabel(),ssApplyId,ssError,ssMessage,state.error,state.preview_pending,ssReady(),state.preview&&state.preview.tracks,hot]);
}
function ssPaintModal(gr,forceFull){
  if(!ssModalImage||ssModalImageW!==W||ssModalImageH!==H){
    ssDropModalImage();ssModalImage=gdi.CreateImage(Math.max(1,W),Math.max(1,H));ssModalImageW=W;ssModalImageH=H;
    var background=ssModalImage.GetGraphics();
    if(ssSceneImage&&ssSceneW===W&&ssSceneH===H)background.DrawImage(ssSceneImage,0,0,W,H,0,0,W,H);else ssDrawBase(background);
    background.FillSolidRect(0,0,W,H,COL.modalScrim);ssModalImage.ReleaseGraphics(background);
  }
  // Static typography and controls do not participate in the pointer render loop.
  var key=typeof ssPreferenceLabel==='function'?ssPreferenceCacheKey():'fallback',fresh=!ssPreferenceImage;
  if(fresh||key!==ssPreferenceKey){
    if(ssPreferenceImage)try{ssPreferenceImage.Dispose();}catch(e){}
    ssPreferenceImage=gdi.CreateImage(Math.max(1,W),Math.max(1,H));var fg=ssPreferenceImage.GetGraphics();fg.SetSmoothingMode(2);fg.SetInterpolationMode(5);
    fg.DrawImage(ssModalImage,0,0,W,H,0,0,W,H);drawPreference(fg,true);ssPreferenceImage.ReleaseGraphics(fg);ssPreferenceKey=key;
  }
  if(!fresh&&!forceFull&&ssPreferencePartial&&Date.now()-ssPreferenceFrameAt<80&&typeof ssGeometry==='function'){
    var r=ssGeometry(W,H),x=Math.max(0,r.x-2),y=Math.max(0,r.y-2),w=Math.min(W-x,r.w+4),h=Math.min(H-y,r.h+4);gr.DrawImage(ssPreferenceImage,x,y,w,h,x,y,w,h);
  }else gr.DrawImage(ssPreferenceImage,0,0,W,H,0,0,W,H);
  ssPreferencePartial=false;
  if(typeof ssDrawGlassBall==='function'&&typeof ssGeometry==='function'){var grid=ssGeometry(W,H).grid;ssDrawGlassBall(gr,grid.x,grid.y,grid.size);}
}
function ssDrawTransitions(gr){
  var active=plman.ActivePlaylist, key=[view,active,viewArtist,rightTab,fsMode].join('|');
  if(ssSceneKey!==key){ssFadeZone=ssSceneKey&&ssSceneKey.split('|')[3]!==rightTab?'queue':'main';ssFadeStart=ssSceneKey?Date.now():0;ssSceneKey=key;}
  if(!ssFadeStart)return;
  var elapsed=Date.now()-ssFadeStart;
  if(elapsed>=145){ssFadeStart=0;return;}
  var r=ssFadeZone==='queue'?R.queue:R.main;
  if(r)gr.FillSolidRect(r.x,r.y,r.w,r.h,ssAlpha(COL.base,Math.round(170*Math.pow(1-elapsed/145,2))));
  if(!ssFrame)ssFrame=window.SetTimeout(function(){ssFrame=0;if(ssFadeZone==='queue')repaintQueue();else repaintMain();},16);
}
