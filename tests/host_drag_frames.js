/* Disposable SDK/GDI drag frame measurements, without desktop input. */
(function(){
 var result={ok:false,checks:[]},oldView=view,oldActive=plman.ActivePlaylist,oldWidth=W,oldHeight=H,pi=-1,limit=Date.now()+18000,image=null;
 function check(value,label){if(!value)throw Error(label);result.checks.push(label);}
 function finish(error){
  if(error)result.error=String(error);
  try{ssCancelSelectionGesture();if(oldActive>=0&&oldActive<plman.PlaylistCount)plman.ActivePlaylist=oldActive;if(pi>=0&&plman.GetPlaylistName(pi)==='Mode acceptance drag frames')plman.RemovePlaylist(pi);view=oldView;W=oldWidth;H=oldHeight;layout(true);ssDropSceneImage();if(image&&typeof image.Dispose==='function')image.Dispose();repaintAll();}catch(e){result.cleanup=String(e);}
  utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\drag-frames-host-result.json',JSON.stringify(result),false);
 }
 function paint(){var g=image.GetGraphics();try{on_paint(g);}finally{image.ReleaseGraphics(g);}}
 function sample(){try{
  check(ssSelectOwner&&ssSelectOwner.preview().mode==='reorder','The full pointer callback and hold timer activate a drag');
  var row=HB_TR[0],times=[],ops={},paintBase=ssDrawBase,full=0;
  ssDrawBase=function(g){full++;return paintBase(g);};
  for(var f=0;f<100;f++){
   var start=Date.now(),x=row.x0+100+(f%20),y=row.y0+row.y1-row.y0+100+(f*13)%650;
   on_mouse_move(x,y,1);ssSelectionDirty=true;
   var g=image.GetGraphics(),proxy={};
   ['DrawImage','FillSolidRect','FillRoundRect','DrawRoundRect','FillEllipse','DrawLine','DrawRect','DrawString','SetTextRenderingHint','CalcTextHeight','CalcTextWidth','SetSmoothingMode','SetInterpolationMode'].forEach(function(name){proxy[name]=function(){var t=Date.now(),args=arguments,value=g[name].apply(g,args),entry=ops[name]||(ops[name]={count:0,ms:0,area:0});entry.count++;entry.ms+=Date.now()-t;if(name==='DrawImage')entry.area+=args[3]*args[4];return value;};});
   try{on_paint(proxy);}finally{image.ReleaseGraphics(g);}times.push(Date.now()-start);
  }
  ssDrawBase=paintBase;times.sort(function(a,b){return a-b;});result.frames={mean_ms:times.reduce(function(a,b){return a+b;},0)/times.length,p95_ms:times[94],max_ms:times[99],full_rebuilds:full,ops:ops};
  check(full===0,'Pointer-only drag frames do not rebuild song content');
  var chosen=ssMainSelect.selectedIndices();check(chosen.length===1&&chosen[0]===0,'Dragging retains the original selected song');measureScheduling();
 }catch(e){finish(e);}}
 function measureScheduling(){
  var damage=ssQueueInteractionDamage,delays=[],started=0,waiting=false;
  ssQueueInteractionDamage=function(r){damage(r);if(!waiting)return;waiting=false;delays.push(Date.now()-started);window.SetTimeout(next,1);};
  function next(){try{
   if(delays.length>=24){ssQueueInteractionDamage=damage;delays.sort(function(a,b){return a-b;});result.scheduling={mean_ms:delays.reduce(function(a,b){return a+b;},0)/delays.length,p95_ms:delays[22],max_ms:delays[23]};check(result.scheduling.mean_ms<12,'Drag damage reaches the host without another frame of timer delay');result.ok=true;finish();return;}
   var row=HB_TR[0];started=Date.now();waiting=true;on_mouse_move(row.x0+100,row.y0+160+delays.length*3,1);
  }catch(e){ssQueueInteractionDamage=damage;finish(e);}}
  next();
 }
 function ready(){try{
  paint();var info=ssPlaylistInfo(pi);if(!info||!info.reorderable||HB_TR.length<4){if(Date.now()>limit)throw Error('Drag list readiness timed out');window.SetTimeout(ready,80);return;}
  var row=HB_TR[0];on_mouse_lbtn_down(row.x0+100,(row.y0+row.y1)/2);window.SetTimeout(sample,220);
 }catch(e){finish(e);}}
 function start(){try{
  var library=fb.GetLibraryItems();if(library.Count<4){if(Date.now()>limit)throw Error('Library readiness timed out');window.SetTimeout(start,80);return;}
  pi=plman.FindOrCreatePlaylist('Mode acceptance drag frames',true);plman.ClearPlaylist(pi);plman.InsertPlaylistItems(pi,0,library,false);plman.ActivePlaylist=pi;view='playlist';plSort='manual';plSortDir='asc';firstRow=firstRowT=0;W=2560;H=1440;layout(true);ssDropSceneImage();image=gdi.CreateImage(W,H);repaintAll();window.SetTimeout(ready,80);
 }catch(e){finish(e);}}
 window.SetTimeout(start,80);
})();
