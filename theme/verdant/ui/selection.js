/* verdant/ui/selection.js -- pure selection and pointer gesture state.
   No host calls, timers, drawing, or mutations of the supplied item arrays.

   One controller owns one active list context. Use separate instances for main,
   sidebar, and queue (and different keys for different queue sections).
   setContext({kind,key,items,rows,bounds,writable,multiple}) accepts unique stable
   occurrence IDs in DISPLAY order, not file IDs: repeated tracks need separate
   IDs. Rows contain {index,x0,y0,x1,y1}; only visible, clipped rows are needed.
   Update geometry each paint; changing kind/key clears selection. Replacing or
   reordering items preserves selected IDs but cancels any pending gesture.

   start({index,x,y,ctrl,shift}) returns whether this list owns the pointer;
   index=-1 means blank list space. Call only after modal/resize/scroll handling.
   move(x,y) and preview() return {mode,indices,rect,insertIndex,targetIndex,
   indicator}; draw rect for marquee, indicator for reorder. cancel() releases
   the pointer without an action. end(x,y) consumes the gesture and returns:
     {type:'click'|'selection'|'reorder',kind,key,index,indices,ids,moved,
      ctrl,shift,insertIndex,targetIndex,changed}.
   A plain row click has type='click', allowing existing navigation/play glyphs.
   Modified clicks and all drags have type='selection' unless a writable reorder
   is requested. Suppress existing button-up actions for these consumed events.
   Reorder indices and insertIndex are ORIGINAL DISPLAY positions/boundaries;
   targetIndex is the boundary AFTER removing indices. changed=false is a no-op.
   The caller translates display positions to host positions and applies edits.
   Releasing a reorder outside bounds consumes it without requesting an edit. */
function ssCreateSelectionController(options){
  options=options||{};
  var threshold=options.threshold===undefined?5:Math.max(0,options.threshold);
  var holdDelay=options.holdDelay||0,now=options.now||function(){return Date.now();};
  var context=null, items=[], rows=[], positions=Object.create(null);
  var selected=Object.create(null), anchor=null, gesture=null;
  function idKey(id){return typeof id+':'+String(id);}
  function cloneSet(source){var out=Object.create(null);for(var k in source)if(source[k])out[k]=true;return out;}
  function indices(){
    var out=[];for(var k in selected)if(selected[k]&&positions[k]!==undefined)out.push(positions[k]);
    out.sort(function(a,b){return a-b;});return out;
  }
  function selectedAt(index){return index>=0&&index<items.length&&!!selected[idKey(items[index])];}
  function selectOne(index){selected=Object.create(null);if(index>=0)selected[idKey(items[index])]=true;}
  function inside(x,y,b){return !b||(x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1);}
  function clampPoint(x,y){
    var b=context.bounds;if(!b)return {x:x,y:y};
    return {x:Math.max(b.x0,Math.min(b.x1,x)),y:Math.max(b.y0,Math.min(b.y1,y))};
  }
  function setContext(next){
    next=next||{};var incoming=next.items||[];
    var changedContext=!context||context.kind!==next.kind||context.key!==next.key;
    var changedItems=items.length!==incoming.length,i,k;
    if(!changedItems)for(i=0;i<items.length;i++)if(items[i]!==incoming[i]){changedItems=true;break;}
    if(changedContext){selected=Object.create(null);anchor=null;gesture=null;}
    else if(changedItems)gesture=null;
    if(changedContext||changedItems){
      items=incoming.slice(0);positions=Object.create(null);
      for(i=0;i<items.length;i++)positions[idKey(items[i])]=i;
      for(k in selected)if(positions[k]===undefined)delete selected[k];
      if(anchor!==null&&positions[anchor]===undefined)anchor=null;
    }
    context={kind:next.kind,key:next.key,bounds:next.bounds||null,writable:!!next.writable,multiple:next.multiple!==false};
    updateGeometry(next.rows||[],next.bounds||null);
    if(gesture&&!context.writable&&gesture.mode==='reorder')gesture=null;
  }
  // Scrolling/painting replaces only visible geometry, not the playlist identity table.
  function updateGeometry(incoming,bounds){
    if(!context)return;if(bounds!==undefined)context.bounds=bounds;
    rows=[];for(var i=0;i<incoming.length;i++){
      var row=incoming[i];if(row.index>=0&&row.index<items.length&&row.y1>row.y0&&row.x1>row.x0)rows.push(row);
    }
    rows.sort(function(a,b){return a.y0-b.y0||a.index-b.index;});
  }
  function start(event){
    if(!context||!inside(event.x,event.y,context.bounds))return false;
    var index=event.index===undefined?-1:event.index;
    if(index< -1||index>=items.length||index%1!==0)return false;
    if(index<0&&!context.multiple)return false;
    var base=cloneSet(selected), wasSelected=selectedAt(index), ctrl=!!event.ctrl,shift=!!event.shift;
    if(!context.multiple){ctrl=shift=false;if(index>=0){selectOne(index);anchor=idKey(items[index]);}}
    else if(index>=0){
      var key=idKey(items[index]);
      if(shift){
        var from=anchor===null?index:positions[anchor];if(from===undefined)from=index;
        selected=ctrl?cloneSet(selected):Object.create(null);
        for(var i=Math.min(from,index);i<=Math.max(from,index);i++)selected[idKey(items[i])]=true;
        if(anchor===null)anchor=key;
      }else if(ctrl){if(selected[key])delete selected[key];else selected[key]=true;anchor=key;}
      else if(!wasSelected){selectOne(index);anchor=key;}
    }else if(!ctrl&&!shift){selected=Object.create(null);anchor=null;}
    var origin=null;for(var r=0;r<rows.length;r++)if(rows[r].index===index){origin=rows[r];break;}
    gesture={index:index,x:event.x,y:event.y,lastX:event.x,lastY:event.y,base:base,started:now(),origin:origin,
      ctrl:ctrl,shift:shift,wasSelected:wasSelected,mode:'pending',moved:false,
      reorder:index>=0&&context.writable&&!ctrl&&!shift&&(wasSelected||!context.multiple||options.dragUnselected),
      rect:null,insertIndex:null,targetIndex:null,indicator:null};
    return true;
  }
  function updateInsertion(y){
    var insert=items.length, marker=null,i,row;
    for(i=0;i<rows.length;i++){
      row=rows[i];
      if(y<(row.y0+row.y1)/2){insert=row.index;marker={x0:row.x0,x1:row.x1,y:row.y0};break;}
    }
    if(!marker&&rows.length){row=rows[rows.length-1];insert=row.index+1;marker={x0:row.x0,x1:row.x1,y:row.y1};}
    var chosen=indices(),before=0;for(i=0;i<chosen.length;i++)if(chosen[i]<insert)before++;
    gesture.insertIndex=insert;gesture.targetIndex=insert-before;
    gesture.indicator=inside(gesture.lastX,gesture.lastY,context.bounds)&&reorderChanges(chosen,gesture.targetIndex)?marker:null;
  }
  function move(x,y){
    if(!gesture)return null;
    gesture.lastX=x;gesture.lastY=y;
    var dx=x-gesture.x,dy=y-gesture.y;
    var held=now()-gesture.started>=holdDelay;
    if(dx*dx+dy*dy>=threshold*threshold)gesture.moved=true;
    if(gesture.mode==='pending'&&(gesture.moved||holdDelay&&held&&gesture.reorder)&&(!gesture.reorder||held)){
      gesture.moved=true;gesture.mode=gesture.reorder?'reorder':(context.multiple&&options.marquee!==false?'marquee':'pending');
    }
    if(gesture.mode==='reorder')updateInsertion(y);
    else if(gesture.mode==='marquee'){
      var a=clampPoint(gesture.x,gesture.y),b=clampPoint(x,y);
      var rect={x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y)};
      gesture.rect=rect;selected=(gesture.ctrl||gesture.shift)?cloneSet(gesture.base):Object.create(null);
      for(var i=0;i<rows.length;i++){
        var row=rows[i];
        if(row.x0<=rect.x1&&row.x1>=rect.x0&&row.y0<=rect.y1&&row.y1>=rect.y0){
          var key=idKey(items[row.index]);
          if(gesture.ctrl&&!gesture.shift&&gesture.base[key])delete selected[key];else selected[key]=true;
        }
      }
    }
    return preview();
  }
  function preview(){
    if(!gesture)return null;
    return {mode:gesture.mode,indices:indices(),rect:gesture.rect,insertIndex:gesture.insertIndex,
      targetIndex:gesture.targetIndex,indicator:gesture.indicator,moved:gesture.moved,origin:gesture.origin,
      pointer:{x:gesture.lastX,y:gesture.lastY},grab:{x:gesture.x,y:gesture.y}};
  }
  function reorderChanges(chosen,target){
    if(!chosen.length)return false;
    if(target!==chosen[0])return true;
    for(var i=1;i<chosen.length;i++)if(chosen[i]!==chosen[0]+i)return true;
    return false;
  }

  function end(x,y){
    if(!gesture)return null;move(x,y);var g=gesture;
    if(!g.moved&&g.index>=0&&!g.ctrl&&!g.shift){selectOne(g.index);anchor=idKey(items[g.index]);}
    var chosen=indices(),ids=[];for(var i=0;i<chosen.length;i++)ids.push(items[chosen[i]]);
    var type=g.mode==='reorder'&&context.writable&&inside(x,y,context.bounds)?'reorder':
      (!g.moved&&g.index>=0&&!g.ctrl&&!g.shift?'click':'selection');
    var action={type:type,kind:context.kind,key:context.key,index:g.index,indices:chosen,ids:ids,
      moved:g.moved,ctrl:g.ctrl,shift:g.shift,insertIndex:g.insertIndex,targetIndex:g.targetIndex,
      changed:type==='reorder'&&reorderChanges(chosen,g.targetIndex)};
    gesture=null;return action;
  }
  return {setContext:setContext,updateGeometry:updateGeometry,start:start,move:move,end:end,preview:preview,
    cancel:function(){gesture=null;},selectedIndices:indices,isSelected:selectedAt};
}
