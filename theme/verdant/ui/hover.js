/* Keep the song scene free of pointer state. Hover copies only two row bands,
   with no title-formatting, artwork lookups, or full-window bitmap transfers. */
var ssQuietRows=false,ssHoverFrame=0,ssHoverDirty=false,ssHoverPainted=null;
var ssInteractionPainted=[];
function ssPaintInteractions(gr){
  var hover=ssHoverRow(),current=typeof ssSelectionRects==='function'?ssSelectionRects():[];
  if(hover)current.push(hover);
  var all=ssInteractionPainted.concat(current),rects=[];
  for(var i=0;i<all.length;i++){
    var r=all[i];if(!r||r.w<=0||r.h<=0)continue;var merged=false;
    for(var j=0;j<rects.length;j++){var p=rects[j];if(p.x===r.x&&p.w===r.w&&p.y<=r.y+r.h&&r.y<=p.y+p.h){var bottom=Math.max(p.y+p.h,r.y+r.h);p.y=Math.min(p.y,r.y);p.h=bottom-p.y;merged=true;break;}}
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
    for(var i=0;i<rows.length;i++){var r=rows[i];if(r)window.RepaintRect(r.x,r.y,r.w,r.h);}
  },16);
}
function ssPaintRowHover(gr,restore){
  var row=ssHoverRow(),rows=restore?[ssHoverPainted,row]:[ssHoverPainted];
  if(ssSceneImage)for(var i=0;i<rows.length;i++){
    var r=rows[i];if(r)gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
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
