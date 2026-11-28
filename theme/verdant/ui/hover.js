/* Keep the song scene free of pointer state. Hover copies only two row bands,
   with no title-formatting, artwork lookups, or full-window bitmap transfers. */
var ssQuietRows=false,ssHoverFrame=0,ssHoverDirty=false,ssHoverPainted=null;
var ssInteractionPainted=[];
var ssInteractionDamage=[];
function ssPixelRect(r){var x=Math.floor(r.x),y=Math.floor(r.y);return {x:x,y:y,w:Math.ceil(r.x+r.w)-x,h:Math.ceil(r.y+r.h)-y};}
function ssQueueInteractionDamage(rect){
  if(!rect||rect.w<=0||rect.h<=0)return;
  var r=ssInteractionDamage[0];
  if(!r){ssInteractionDamage=[{x:rect.x,y:rect.y,w:rect.w,h:rect.h}];return;}
  var right=Math.max(r.x+r.w,rect.x+rect.w),bottom=Math.max(r.y+r.h,rect.y+rect.h);
  r.x=Math.min(r.x,rect.x);r.y=Math.min(r.y,rect.y);r.w=right-r.x;r.h=bottom-r.y;
}
function ssPaintInteractions(gr,sceneUpdated){
  var hover=ssHoverRow(),current=typeof ssSelectionRects==='function'?ssSelectionRects():[];
  if(hover)current.push(hover);
  ssMeterDirty=false;
  var all=ssInteractionPainted.concat(current,ssInteractionDamage),rects=[];ssInteractionDamage=[];
  for(var i=0;i<all.length;i++){
    var r=all[i];if(!r||r.w<=0||r.h<=0)continue;r=ssPixelRect(r);var merged=false;
    // The host can clear the bounding band between disjoint invalidations.
    // Restore that band, including rows skipped by fast or reversed movement.
    for(var j=0;j<rects.length;j++){var p=rects[j];if(p.x<r.x+r.w&&r.x<p.x+p.w){var bottom=Math.max(p.y+p.h,r.y+r.h),right=Math.max(p.x+p.w,r.x+r.w);p.y=Math.min(p.y,r.y);p.x=Math.min(p.x,r.x);p.h=bottom-p.y;p.w=right-p.x;merged=true;break;}}
    if(!merged)rects.push({x:r.x,y:r.y,w:r.w,h:r.h});
  }
  if(ssSceneImage&&sceneUpdated!==true)for(i=0;i<rects.length;i++){
    r=rects[i];
    if(sceneUpdated&&sceneUpdated.some(function(p){
      return p&&p.x<=r.x&&p.y<=r.y&&p.x+p.w>=r.x+r.w&&p.y+p.h>=r.y+r.h;
    }))continue;
    gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
  }
  if(typeof ssRestoreHotControls==='function')ssRestoreHotControls(gr,sceneUpdated,rects);
  ssPaintRowHover(gr,false,hover);
  if(ssMeterCell&&(sceneUpdated===true||rects.some(ssTouchesMeter)||(sceneUpdated&&sceneUpdated.some(ssTouchesMeter))))ssDrawMeter(gr);
  if(typeof ssPaintHotControls==='function')ssPaintHotControls(gr);
  if(typeof ssDrawSelection==='function')ssDrawSelection(gr);
  ssInteractionPainted=current;
}
// The list exports only its visible playing occurrence. The base raster leaves
// that number cell empty so animation never writes into a cached bitmap.
var ssMeterCell=null,ssMeterTimer=0,ssMeterDirty=false,ssMeterPhase=0;
var ssMeterFocused=typeof window!=='undefined'&&window.IsFocused===true,ssMeterHidden=false,ssMeterPaused=true,ssMeterFileDrag=false;
function ssMeterRect(){
  var c=ssMeterCell,r=c.row;
  return ssPixelRect({x:c.x,y:r.y0,w:c.w,h:r.y1-r.y0});
}
function ssTouchesMeter(r){
  var c=ssMeterCell;
  return r.x<c.x+c.w&&r.x+r.w>c.x&&r.y<c.row.y1&&r.y+r.h>c.row.y0;
}
function ssMeterHovered(){
  var r=ssMeterCell.row;
  return mx>=r.x0&&mx<r.x1&&my>=r.y0&&my<r.y1;
}
function ssMeterAllowed(){
  return ssMeterCell&&NP&&ssSceneImage&&(view==='playlist'||view==='songs')&&
    ssMeterFocused&&!ssMeterHidden&&!ssMeterPaused&&!fsMode&&!ssReducedMotion&&
    !ssModal&&!ssPopup&&!confirmDel&&!renameEdit&&!dupPrompt&&!rgPrompt&&!sgMenuOpen&&!plSortMenuOpen&&
    !scrollTimer&&!drag&&!ssMeterFileDrag&&!ssSelectOwner&&!ssResizing&&!ssResizeFlow&&!ssMeterHovered();
}
function ssStopMeterTimer(){
  if(ssMeterTimer)window.ClearTimeout(ssMeterTimer);
  ssMeterTimer=0;
}
function ssSyncMeterTimer(){
  if(!ssMeterAllowed()){ssStopMeterTimer();return;}
  if(ssMeterTimer||ssMeterDirty)return;
  ssMeterTimer=window.SetTimeout(function(){
    ssMeterTimer=0;
    if(!ssMeterAllowed()||window.IsVisible===false||
       (typeof UIWizard!=='undefined'&&UIWizard&&UIWizard.WindowState===2))return;
    ssMeterPhase=Math.floor(Date.now()/160);
    var r=ssMeterRect();ssMeterDirty=true;ssQueueInteractionDamage(r);
    window.RepaintRect(r.x,r.y,r.w,r.h,false);
  },160);
}
function ssDrawMeter(gr){
  if(!ssMeterCell||(view!=='playlist'&&view!=='songs'))return;
  var c=ssMeterCell,r=c.row,s=c.scale,unit=Math.max(1,Math.round(2*s));
  var cx=Math.round(c.x+c.w/2),cy=Math.round(r.rowY+r.rowH/2);
  // The existing play button is already painted in its clickable lead cell.
  if(ssMeterHovered())return;
  var base=cy+Math.round(6*s);
  for(var i=0;i<3;i++){
    var height=Math.round((4+8*(.5+.5*Math.sin(ssMeterPhase*(1+i*.3)+i*2)))*s);
    var top=Math.max(r.y0,base-height),bottom=Math.min(r.y1,base);
    if(bottom>top)gr.FillSolidRect(cx+(i-1)*2*unit,top,unit,bottom-top,COL.green);
  }
}
function ssPaintMeterDamage(gr){
  if(!ssMeterDirty)return false;
  if(dirtyAll||anyDirty()||ssHoverDirty||ssSelectionDirty||!ssMeterAllowed()){
    ssMeterDirty=false;ssHoverDirty=true;return false;
  }
  // A timer frame restores only the number cell, including a selection tint.
  var b=ssMeterRect(),r=ssMeterCell.row;
  gr.DrawImage(ssSceneImage,b.x,b.y,b.w,b.h,b.x,b.y,b.w,b.h);
  ssDrawMeter(gr);
  if(ssMainSelect.isSelected(ssMainRowIndex(r)))gr.FillSolidRect(b.x,b.y,b.w,b.h,ssAccent(36));
  ssMeterDirty=false;ssInteractionDamage=[];return true;
}
function ssRowHover(x0,y0,x1,y1){return !ssQuietRows&&hv(x0,y0,x1,y1);}
function ssHoverRow(){
  if(typeof ssSelectOwner!=='undefined'&&ssSelectOwner&&ssSelectOwner.preview()&&ssSelectOwner.preview().mode==='reorder')return null;
  var lists=[HB_TR,HB_Q];
  for(var j=0;j<lists.length;j++)for(var i=0;i<lists[j].length;i++){
    var r=lists[j][i];if(mx>=r.x0&&mx<r.x1&&my>=r.y0&&my<r.y1){
      var panel=j?R.queue:R.main;
      var y0=Math.max(r.y0,panel.y),y1=Math.min(r.y1,panel.y+panel.h);
      if(y1>y0)return {x:Math.max(r.x0,panel.x),y:y0,w:Math.min(r.x1,panel.x+panel.w)-Math.max(r.x0,panel.x),h:y1-y0,
        favoriteAction:r.favoriteAction,pgx0:r.pgx0,pgx1:r.pgx1,playVisible:r.playVisible,queue:j===1,more:j===1&&r.more&&r.more.y0>=y0&&r.more.y1<=y1?r.more:null,
        rowY:r.rowY===undefined?r.y0:r.rowY,rowH:r.rowH===undefined?r.y1-r.y0:r.rowH};
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
function ssPaintRowHover(gr,restore,row){
  if(row===undefined)row=ssHoverRow();
  var rows=restore?[ssHoverPainted,row]:[];
  if(ssSceneImage)for(var i=0;i<rows.length;i++){
    var r=rows[i];if(r){r=ssPixelRect(r);gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);}
  }
  if(row){
    // The original number is hidden only when the complete glyph cell is visible.
    var replaceNumber=!row.playVisible&&row.pgx0!==undefined&&row.y===row.rowY&&row.h===row.rowH;
    if(replaceNumber)gr.FillSolidRect(row.pgx0,row.y,row.pgx1-row.pgx0,row.h,COL.base);
    var rSm=typeof ssRad==='function'?ssRad('sm'):4;
    ssFillContinuousRect(gr,row.x,row.y,row.w,row.h,rSm,rSm,COL.rowHover);
    if(replaceNumber)drawIcon(gr,'play',COL.text,row.pgx0,row.y,row.pgx1-row.pgx0,row.h,14);
    var favorite=row.favoriteAction;
    if(favorite&&inRect(mx,my,favorite))ssDrawPersonalHeart(gr,favorite.x0,favorite.y0,favorite.x1-favorite.x0,favorite.active,true);
    if(row.more&&hv(row.more.x0,row.more.y0,row.more.x1,row.more.y1))ssDrawQueueAction(gr,row.more);
  }
  ssHoverPainted=row;ssHoverDirty=false;
}
