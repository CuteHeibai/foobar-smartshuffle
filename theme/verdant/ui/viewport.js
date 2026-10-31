/* RepaintRect is not a drawing clip. Row content is rendered into a reusable
   viewport bitmap, then copied through its exact bounds without masking headers. */
var ssViewports={};
function ssBeginViewport(key,parent,x,y,w,h){
  w=Math.max(1,Math.ceil(w));h=Math.max(1,Math.ceil(h));var entry=ssViewports[key];
  if(!entry||entry.w!==w||entry.h!==h){entry={w:w,h:h,image:gdi.CreateImage(w,h)};ssViewports[key]=entry;}
  var target=entry.image.GetGraphics();target.SetSmoothingMode(2);target.SetInterpolationMode(5);target.FillSolidRect(0,0,w,h,COL.base);
  var proxy={};
  function shifted(name,xi,yi){proxy[name]=function(){var args=Array.prototype.slice.call(arguments);args[xi]-=x;args[yi]-=y;return target[name].apply(target,args);};}
  ['FillSolidRect','FillRoundRect','DrawRoundRect','FillEllipse','DrawEllipse','DrawRect','FillGradRect'].forEach(function(name){shifted(name,0,1);});
  shifted('DrawImage',1,2);shifted('DrawString',3,4);shifted('GdiDrawText',3,4);
  proxy.DrawLine=function(x0,y0,x1,y1,width,col){return target.DrawLine(x0-x,y0-y,x1-x,y1-y,width,col);};
  ['CalcTextHeight','CalcTextWidth','MeasureString','SetTextRenderingHint','SetSmoothingMode','SetInterpolationMode'].forEach(function(name){proxy[name]=function(){return target[name].apply(target,arguments);};});
  return {gr:proxy,finish:function(){entry.image.ReleaseGraphics(target);parent.DrawImage(entry.image,x,y,w,h,0,0,w,h);}};
}
