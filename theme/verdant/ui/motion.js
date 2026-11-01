/* Frame-coalesced interaction; modal background is painted once, never per pointer event. */
var ssFrame=0,ssModalImage=null,ssModalImageW=0,ssModalImageH=0,ssTrail=[],ssSceneKey='',ssFadeStart=0,ssFadeZone='main';
var ssPopupImage=null,ssPopupImageOwned=false,ssSceneImage=null,ssSceneW=0,ssSceneH=0,ssPopupRestore=false;
function ssDropSceneImage(){ssDropPopupImage();if(ssSceneImage)try{ssSceneImage.Dispose();}catch(e){}ssSceneImage=null;ssPopupRestore=false;ssHoverPainted=null;ssHoverDirty=false;ssInteractionPainted=[];ssInteractionDamage=[];}
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
function ssDropModalImage(){if(ssModalImage){try{ssModalImage.Dispose();}catch(e){}}ssModalImage=null;ssTrail=[];}
function ssRepaintPreference(){
  if(ssFrame) return;
  ssFrame=window.SetTimeout(function(){
    ssFrame=0;
    if(ssModal&&typeof ssGeometry==='function'){
      var r=ssGeometry(W,H);window.RepaintRect(r.x-2,r.y-2,r.w+4,r.h+4);
    }else repaintAll();
  },16);
}
function ssRecordTrail(point){
  if(!ssDragging)return;
  var now=Date.now(),last=ssTrail.length?ssTrail[ssTrail.length-1]:null;
  if(!last||Math.abs(last.x-point.x)+Math.abs(last.y-point.y)>.007)ssTrail.push({x:point.x,y:point.y,time:now});
  if(ssTrail.length>22)ssTrail.shift();
}
function ssPaintModal(gr){
  if(!ssModalImage||ssModalImageW!==W||ssModalImageH!==H){
    ssDropModalImage();ssModalImage=gdi.CreateImage(Math.max(1,W),Math.max(1,H));ssModalImageW=W;ssModalImageH=H;
    var background=ssModalImage.GetGraphics();
    if(ssSceneImage&&ssSceneW===W&&ssSceneH===H)background.DrawImage(ssSceneImage,0,0,W,H,0,0,W,H);else ssDrawBase(background);
    background.FillSolidRect(0,0,W,H,RGBA(0,0,0,188));ssModalImage.ReleaseGraphics(background);
  }
  gr.DrawImage(ssModalImage,0,0,W,H,0,0,W,H);
  drawPreference(gr);
}
function ssDrawTransitions(gr){
  var active=plman.ActivePlaylist, key=[view,active,viewArtist,rightTab,fsMode].join('|');
  if(ssSceneKey!==key){ssFadeZone=ssSceneKey&&ssSceneKey.split('|')[3]!==rightTab?'queue':'main';ssFadeStart=ssSceneKey?Date.now():0;ssSceneKey=key;}
  if(!ssFadeStart)return;
  var elapsed=Date.now()-ssFadeStart;
  if(elapsed>=145){ssFadeStart=0;return;}
  var r=ssFadeZone==='queue'?R.queue:R.main;
  if(r)gr.FillSolidRect(r.x,r.y,r.w,r.h,RGBA(0,0,0,Math.round(170*Math.pow(1-elapsed/145,2))));
  if(!ssFrame)ssFrame=window.SetTimeout(function(){ssFrame=0;if(ssFadeZone==='queue')repaintQueue();else repaintMain();},16);
}
