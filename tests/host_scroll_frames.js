/* Disposable wheel/animation benchmark using SDK lists and offscreen GDI. */
(function(){
 var result={ok:false,checks:[]},oldView=view,oldActive=plman.ActivePlaylist,oldWidth=W,oldHeight=H,pi=-1,limit=Date.now()+18000,image=null,tick=scrollTick,restore=[],warmed=false;
 function check(value,label){if(!value)throw Error(label);result.checks.push(label);}
 function finish(error){
  if(error)result.error=String(error);
  try{stopScrollAnim();scrollTick=tick;for(var ri=0;ri<restore.length;ri++)restore[ri]();if(oldActive>=0&&oldActive<plman.PlaylistCount)plman.ActivePlaylist=oldActive;if(pi>=0&&plman.GetPlaylistName(pi)==='Mode acceptance scroll frames')plman.RemovePlaylist(pi);view=oldView;W=oldWidth;H=oldHeight;layout(true);ssDropSceneImage();if(image&&typeof image.Dispose==='function')image.Dispose();repaintAll();}catch(e){result.cleanup=String(e);}
  utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\scroll-frames-host-result.json',JSON.stringify(result),false);
 }
 function paint(){var g=image.GetGraphics();try{on_paint(g);}finally{image.ReleaseGraphics(g);}}
 function ready(){try{
  paint();if(HB_TR.length<4){if(Date.now()>limit)throw Error('Scroll list readiness timed out');window.SetTimeout(ready,80);return;}
  if(!warmed){warmed=true;window.SetTimeout(ready,2500);return;}
  ssFadeStart=0;if(ssFrame){window.ClearTimeout(ssFrame);ssFrame=0;}
  var originalPaint=on_paint,paintTimes=[];on_paint=function(g){var started=Date.now();try{return originalPaint(g);}finally{paintTimes.push(Date.now()-started);}};restore.push(function(){on_paint=originalPaint;});
  var row=HB_TR[0],intervals=[],draws=[],last=Date.now();mx=row.x0+120;my=row.y0+90;scrollKey='pl';hoverZoneKey='main';
  scrollTick=function(){try{var now=Date.now();intervals.push(now-last);last=now;tick();draws.push(0);
   if(draws.length===24||!scrollTimer){stopScrollAnim();scrollTick=tick;if(!paintTimes.length)throw Error('No native paint callbacks observed');draws=paintTimes;intervals.sort(function(a,b){return a-b;});draws.sort(function(a,b){return a-b;});result.frames={mean_ms:draws.reduce(function(a,b){return a+b;},0)/draws.length,p95_ms:draws[Math.floor((draws.length-1)*.95)],count:draws.length,tick_mean_ms:intervals.reduce(function(a,b){return a+b;},0)/intervals.length,tick_p95_ms:intervals[Math.floor((intervals.length-1)*.95)]};check(HB_TR.length>=4,'Scrolled SDK list retains its visible rows');check(HB_TR.every(function(r){return r.y0>=R.main.y&&r.y1<=R.main.y+R.main.h;}),'Scroll hit targets remain inside the song panel');result.ok=true;finish();}
  }catch(e){finish(e);}};
  var before=firstRowT;on_mouse_wheel(-1);result.wheel={configured:WHEEL_PX,one_notch:firstRowT-before,row_height:M.rowH};firstRowT=Math.min(PL_MAXPX,firstRow+6000);
 }catch(e){finish(e);}}
 function start(){try{
  var library=fb.GetLibraryItems();if(library.Count<4){if(Date.now()>limit)throw Error('Library readiness timed out');window.SetTimeout(start,80);return;}
  pi=plman.FindOrCreatePlaylist('Mode acceptance scroll frames',true);plman.ClearPlaylist(pi);plman.InsertPlaylistItems(pi,0,library,false);plman.ActivePlaylist=pi;view='playlist';plSort='manual';plSortDir='asc';firstRow=firstRowT=0;W=2560;H=1440;layout(true);ssDropSceneImage();image=gdi.CreateImage(W,H);repaintAll();window.SetTimeout(ready,80);
 }catch(e){finish(e);}}
 window.SetTimeout(start,80);
})();
