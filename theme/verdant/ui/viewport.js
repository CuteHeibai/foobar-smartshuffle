/* RepaintRect is not a drawing clip. Row content is rendered into a reusable
   viewport bitmap, then copied through its exact bounds without masking headers. */
var ssViewports={};
function ssBeginViewport(key,parent,x,y,w,h){
  w=Math.max(1,Math.ceil(w));h=Math.max(1,Math.ceil(h));var entry=ssViewports[key];
  if(!entry||entry.w!==w||entry.h!==h){entry={w:w,h:h,image:gdi.CreateImage(w,h)};ssViewports[key]=entry;}
  var target=entry.image.GetGraphics();target.SetSmoothingMode(2);target.SetInterpolationMode(5);target.FillSolidRect(0,0,w,h,COL.base);
  var proxy=ssTranslatedGraphics(target,x,y);
  return {gr:proxy,finish:function(){entry.image.ReleaseGraphics(target);parent.DrawImage(entry.image,x,y,w,h,0,0,w,h);}};
}

function ssTranslatedGraphics(target,x,y){
  var proxy={};
  function shifted(name,xi,yi){proxy[name]=function(){var args=Array.prototype.slice.call(arguments);args[xi]-=x;args[yi]-=y;return target[name].apply(target,args);};}
  ['FillSolidRect','FillRoundRect','DrawRoundRect','FillEllipse','DrawEllipse','DrawRect','FillGradRect'].forEach(function(name){shifted(name,0,1);});
  shifted('DrawImage',1,2);shifted('DrawString',3,4);shifted('GdiDrawText',3,4);
  proxy.DrawLine=function(x0,y0,x1,y1,width,col){return target.DrawLine(x0-x,y0-y,x1-x,y1-y,width,col);};
  ['CalcTextHeight','CalcTextWidth','MeasureString','SetTextRenderingHint','SetSmoothingMode','SetInterpolationMode'].forEach(function(name){proxy[name]=function(){return target[name].apply(target,arguments);};});
  return proxy;
}

/* Only row pixels are reused. Hitboxes and visible indices are still rebuilt by
   the view on every frame; content/appearance paints invalidate the row cache. */
var ssRowRasters=Object.create(null),ssRowRasterCount=0;
function ssDisposeRowRaster(entry){if(entry&&entry.image&&typeof entry.image.Dispose==='function')entry.image.Dispose();}
function ssInvalidateRowRasters(){for(var key in ssRowRasters)ssDisposeRowRaster(ssRowRasters[key]);ssRowRasters=Object.create(null);ssRowRasterCount=0;}
function ssDrawCachedRow(parent,key,x,y,w,h,draw,enabled){
  if(enabled===false||!ssQuietRows){draw(parent);return;}
  w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));key=key+'|'+w+'|'+h;
  var entry=ssRowRasters[key];
  if(!entry){
    if(ssRowRasterCount>=64)for(var oldest in ssRowRasters){ssDisposeRowRaster(ssRowRasters[oldest]);delete ssRowRasters[oldest];ssRowRasterCount--;break;}
    var image=gdi.CreateImage(w,h),gr=image.GetGraphics();
    gr.SetSmoothingMode(2);gr.SetInterpolationMode(5);gr.FillSolidRect(0,0,w,h,COL.base);
    try{draw(ssTranslatedGraphics(gr,x,y));}finally{image.ReleaseGraphics(gr);}
    entry=ssRowRasters[key]={image:image};ssRowRasterCount++;
  }
  parent.DrawImage(entry.image,Math.round(x),Math.round(y),w,h,0,0,w,h);
}
