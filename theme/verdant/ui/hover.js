/* Keep the song scene free of pointer state. Hover copies only two row bands,
   with no title-formatting, artwork lookups, or full-window bitmap transfers. */
var ssQuietRows=false,ssHoverFrame=0,ssHoverDirty=false,ssHoverPainted=null;
var ssInteractionPainted=[];
var ssInteractionDamage=[];
function ssPixelRect(r){var x=Math.floor(r.x),y=Math.floor(r.y);return {x:x,y:y,w:Math.ceil(r.x+r.w)-x,h:Math.ceil(r.y+r.h)-y};}
function ssQueueInteractionDamage(rect){if(rect&&rect.w>0&&rect.h>0)ssInteractionDamage.push({x:rect.x,y:rect.y,w:rect.w,h:rect.h});}
function ssPaintInteractions(gr){
  var hover=ssHoverRow(),current=typeof ssSelectionRects==='function'?ssSelectionRects():[];
  if(hover)current.push(hover);
  var all=ssInteractionPainted.concat(current,ssInteractionDamage),rects=[];ssInteractionDamage=[];
  for(var i=0;i<all.length;i++){
    var r=all[i];if(!r||r.w<=0||r.h<=0)continue;r=ssPixelRect(r);var merged=false;
    // The host can clear the bounding band between disjoint invalidations.
    // Restore that band, including rows skipped by fast or reversed movement.
    for(var j=0;j<rects.length;j++){var p=rects[j];if(p.x<r.x+r.w&&r.x<p.x+p.w){var bottom=Math.max(p.y+p.h,r.y+r.h),right=Math.max(p.x+p.w,r.x+r.w);p.y=Math.min(p.y,r.y);p.x=Math.min(p.x,r.x);p.h=bottom-p.y;p.w=right-p.x;merged=true;break;}}
    if(!merged)rects.push({x:r.x,y:r.y,w:r.w,h:r.h});
  }
  if(ssSceneImage)for(i=0;i<rects.length;i++){r=rects[i];gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);}
  ssPaintRowHover(gr,false);
  if(typeof ssDrawSelection==='function')ssDrawSelection(gr);
  ssInteractionPainted=current;
}
function ssRowHover(x0,y0,x1,y1){return !ssQuietRows&&hv(x0,y0,x1,y1);}
function ssHoverRow(){
  var lists=[HB_TR,HB_Q];
  for(var j=0;j<lists.length;j++)for(var i=0;i<lists[j].length;i++){
    var r=lists[j][i];if(mx>=r.x0&&mx<r.x1&&my>=r.y0&&my<r.y1){
      var panel=j?R.queue:R.main;
      var y0=Math.max(r.y0,panel.y),y1=Math.min(r.y1,panel.y+panel.h);
      if(y1>y0)return {x:Math.max(r.x0,panel.x),y:y0,w:Math.min(r.x1,panel.x+panel.w)-Math.max(r.x0,panel.x),h:y1-y0,
        pgx0:r.pgx0,pgx1:r.pgx1,rowY:r.rowY===undefined?r.y0:r.rowY,rowH:r.rowH===undefined?r.y1-r.y0:r.rowH};
    }
  }
  return null;
}
function ssRequestRowHover(){
  if(ssHoverFrame)return;
  ssHoverFrame=window.SetTimeout(function(){
    ssHoverFrame=0;if(!ssSceneImage)return;
    ssHoverDirty=true;var rows=[ssHoverPainted,ssHoverRow()];
    for(var i=0;i<rows.length;i++){var r=rows[i];if(r){r=ssPixelRect(r);ssQueueInteractionDamage(r);window.RepaintRect(r.x,r.y,r.w,r.h);}}
  },16);
}
function ssPaintRowHover(gr,restore){
  var row=ssHoverRow(),rows=restore?[ssHoverPainted,row]:[ssHoverPainted];
  if(ssSceneImage)for(var i=0;i<rows.length;i++){
    var r=rows[i];if(r){r=ssPixelRect(r);gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);}
  }
  if(row){
    // The original number is hidden only when the complete glyph cell is visible.
    if(row.pgx0!==undefined&&row.y===row.rowY&&row.h===row.rowH)
      gr.FillSolidRect(row.pgx0,row.y,row.pgx1-row.pgx0,row.h,COL.base);
    gr.FillRoundRect(row.x,row.y,row.w,row.h,4,4,RGBA(255,255,255,18));
    if(row.pgx0!==undefined&&row.y===row.rowY&&row.h===row.rowH)
      drawIcon(gr,'play',COL.text,row.pgx0,row.y,row.pgx1-row.pgx0,row.h,14);
  }
  ssHoverPainted=row;ssHoverDirty=false;
}
