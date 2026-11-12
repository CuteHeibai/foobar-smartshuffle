/* Dark in-panel menus retain the original SDK command tree, including plugin commands. */
var ssPopup=null,SS_MENU_HB=[],ssPopupHover='',ssPopupSerial=0,ssMenuPollTimer=0,ssMenuLeaveTimer=0;
function ssMenuKeepOpen(){if(ssMenuLeaveTimer)window.ClearTimeout(ssMenuLeaveTimer);ssMenuLeaveTimer=0;}
function ssMenuLeave(){
  // Menus close by click or Escape, never by pointer travel.
}
function ssShowPopup(items,x,y,token,nativeMenu){
  ssMenuKeepOpen();
  if(typeof ssDropPopupImage==='function')ssDropPopupImage();
  ssPopupRestore=false;ssPopup={serial:++ssPopupSerial,x:x,y:y,token:token||'',nativeMenu:!!nativeMenu,levels:[{items:items,scroll:0,selected:-1}]};
  if(!nativeMenu&&typeof ssHideLyrics==='function')ssHideLyrics();applyKeyMode();repaintAll();
}
function ssStopMenuPoll(){if(ssMenuPollTimer)window.ClearInterval(ssMenuPollTimer);ssMenuPollTimer=0;}
function ssClosePopup(){ssMenuKeepOpen();ssStopMenuPoll();ssPopup=null;SS_MENU_HB=[];ssPopupRestore=!!ssSceneImage;if(typeof ssDropPopupImage==='function')ssDropPopupImage();applyKeyMode();repaintAll();}
function ssOpenNativeMenu(kind,args,x,y,extra){
  if(kind==='main'&&args.root==='view'&&typeof ssAppearanceMenuItems==='function')
    extra=[{label:'外观',children:ssAppearanceMenuItems()},{separator:true}].concat(extra||[]);
  ssShowPopup([{label:'正在读取菜单…',disabled:true}],x,y,'',true);
  ssPopup.root=kind==='main'?args.root:'';
  ssPopup.extra=extra||[];
  var fields={kind:kind};for(var k in args)fields[k]=args[k];
  ssPopup.request=ssSend('menu_open',fields);
  if(!ssMenuPollTimer)ssMenuPollTimer=window.SetInterval(ssPoll,16);
}
function ssAcceptMenu(done,state){
  if(!ssPopup||!done||done.id!==ssPopup.request)return;
  ssStopMenuPoll();
  var result=state.response&&state.response.menu;
  ssPopup.token=result?result.token:'';
  var extras=ssPopup.extra||[];
  if(result&&done.kind==='context'&&typeof ssResolveMediaTracks==='function'){
    var ids=done.tracks&&done.tracks.length?done.tracks:result.track_id?[result.track_id]:[];
    try{
      var handles=ssResolveMediaTracks(ids);
      if(handles.Count)extras=[{label:'补齐封面和歌手资料',run:function(){ssRefreshMedia(handles);}}].concat(extras);
    }catch(e){console.log('Smart Shuffle metadata menu: '+String(e));}
  }
  if(result&&result.track_id)(function(id){extras=extras.concat([{label:'将歌曲文件移到回收站…',run:function(){ssRecyclePrepare(id);}},{separator:true}]);})(result.track_id);
  ssPopup.levels=[{items:result?extras.concat(result.items):[{label:(state.response&&state.response.message)||'菜单不可用',disabled:true}],scroll:0,selected:-1}];
}
function ssPopupChoose(item){
  if(!ssPopup||!item||item.disabled||item.separator)return;
  if(item.children)return;
  var token=ssPopup.token;ssClosePopup();
  if(item.run)item.run();else if(item.command!==undefined)ssSend('menu_execute',{token:token,command:item.command});
}
function ssMenuLabel(label){var text=String(label||'').replace(/&&/g,'\u0001').replace(/&/g,'').replace(/\u0001/g,'&').split('\t')[0];return typeof ssLocalLabel==='function'?ssLocalLabel(text):text;}
function ssDrawPopup(gr){
  SS_MENU_HB=[];if(!ssPopup)return;
  var previous=null,scale=Math.max(1,UISCALE),rh=Math.round(34*scale),pad=6;
  for(var d=0;d<ssPopup.levels.length;d++){
    var level=ssPopup.levels[d],items=level.items,width=Math.min(410,Math.max(230,Math.round(240*scale))),total=pad*2;
    for(var i=0;i<items.length;i++)total+=items[i].separator?9:rh;
    var height=Math.min(total,H-TBH-20),x=d?previous.x+previous.w+4:ssPopup.x,y=d?previous.anchor:ssPopup.y;
    if(x+width>W-8)x=d?Math.max(8,previous.x-width-4):W-width-8;
    x=Math.max(8,x);y=Math.max(TBH+4,Math.min(y,H-height-8));
    level.max=Math.max(0,total-height);level.scroll=Math.max(0,Math.min(level.scroll,level.max));level.rect={x:x,y:y,w:width,h:height};
    gr.FillRoundRect(x+3,y+4,width,height,7,7,COL.shadow);
    gr.FillRoundRect(x,y,width,height,7,7,COL.popup);strokeRound(gr,x,y,width,height,7,1,COL.line);
    var rowY=y+pad-level.scroll,anchor=y;
    for(i=0;i<items.length;i++){
      var it=items[i],ih=it.separator?9:rh;
      if(rowY>=y+pad&&rowY+ih<=y+height-pad){
        if(it.separator)gr.FillSolidRect(x+10,rowY+4,width-20,1,COL.line);
        else{
          if(level.selected===i||level.hover===i)gr.FillRoundRect(x+4,rowY,width-8,ih,4,4,COL.buttonHover);
          if(it.checked)tC(gr,'✓',FONT.pl,COL.green,x+6,rowY,24,ih);
          tL(gr,ssMenuLabel(it.label),FONT.pl,it.disabled?COL.text3:COL.text,x+32,rowY,width-62,ih);
          if(it.children)tC(gr,'›',FONT.pl,COL.text2,x+width-27,rowY,20,ih);
          SS_MENU_HB.push({x0:x,y0:rowY,x1:x+width,y1:rowY+ih,depth:d,index:i,item:it});
        }
      }
      if(level.selected===i)anchor=rowY;
      rowY+=ih;
    }
    if(level.scroll>0)tC(gr,'⌃',FONT.pl,COL.text2,x,y-1,width,14);
    if(level.scroll<level.max)tC(gr,'⌄',FONT.pl,COL.text2,x,y+height-14,width,14);
    previous={x:x,y:y,w:width,anchor:anchor};
  }
}
function ssPopupMove(x,y){
  if(!ssPopup)return false;
  if(ssPopup.root&&y<TBH&&typeof HB_MENU!=='undefined'){
    var title=hit(HB_MENU,x,y);if(title)return true;
  }
  var inside=false;
  for(var d=0;d<ssPopup.levels.length;d++){var r=ssPopup.levels[d].rect;if(r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){inside=true;break;}}
  if(inside)ssMenuKeepOpen();else ssMenuLeave();
  var h=hit(SS_MENU_HB,x,y);if(!h)return true;
  if(ssPopup.root){var hovered=ssPopup.levels[h.depth];if(hovered.hover!==h.index){hovered.hover=h.index;repaintAll();}return true;}
  var level=ssPopup.levels[h.depth];if(level.selected===h.index)return true;
  level.selected=h.index;ssPopup.levels.length=h.depth+1;
  if(h.item.children&&!h.item.disabled)ssPopup.levels.push({items:h.item.children,scroll:0,selected:-1});
  repaintAll();return true;
}
function ssPopupExpand(h){
  if(h.item.disabled)return;
  var level=ssPopup.levels[h.depth],opened=level.selected===h.index&&ssPopup.levels.length>h.depth+1;
  ssPopup.levels.length=h.depth+1;level.selected=opened?-1:h.index;
  if(!opened)ssPopup.levels.push({items:h.item.children,scroll:0,selected:-1});repaintAll();
}
function ssPopupClick(x,y){if(!ssPopup)return false;
  var title=ssPopup.root&&typeof HB_MENU!=='undefined'?hit(HB_MENU,x,y):null;
  if(title){if(title.root===ssPopup.root)ssClosePopup();else ssOpenNativeMenu('main',{root:title.root},title.mx,TBH);return true;}
  var h=hit(SS_MENU_HB,x,y);if(h){if(h.item.children)ssPopupExpand(h);else ssPopupChoose(h.item);}else ssClosePopup();return true;
}
function ssPopupWheel(step){
  if(!ssPopup)return false;
  var level=ssPopup.levels[ssPopup.levels.length-1];level.scroll=Math.max(0,Math.min(level.max||0,level.scroll-step*34));repaintAll();return true;
}
function ssPopupKey(key){
  if(!ssPopup)return false;
  if(key===27){ssClosePopup();return true;}
  var level=ssPopup.levels[ssPopup.levels.length-1];
  if(key===37&&ssPopup.levels.length>1){ssPopup.levels.pop();repaintAll();return true;}
  if(key===38||key===40){
    var step=key===38?-1:1,index=level.selected;
    for(var n=0;n<level.items.length;n++){index=(index+step+level.items.length)%level.items.length;if(!level.items[index].separator&&!level.items[index].disabled)break;}
    level.selected=index;level.scroll=Math.max(0,Math.min(level.max||0,index*Math.round(34*Math.max(1,UISCALE))-100));repaintAll();
  }else if(key===13||key===39){
    var item=level.items[level.selected];
    if(item&&item.children){ssPopup.levels.push({items:item.children,scroll:0,selected:-1});repaintAll();}else ssPopupChoose(item);
  }
  return true;
}
function ssShowPlaybackModes(x,y){
  var items=[{label:'智能随机（每轮全覆盖）',checked:!!(ssState&&ssState.enabled),run:function(){ssSend('playback_mode',{mode:'smart'});}}];
  var orders=(ssState&&ssState.orders)||[{index:0,name:'顺序播放'},{index:1,name:'列表循环'},{index:2,name:'单曲循环'}];
  for(var i=0;i<orders.length;i++)if(orders[i].index<3)(function(order){items.push({label:['顺序播放','列表循环','单曲循环'][order.index],checked:!!(ssState&&!ssState.enabled&&ssState.native_order===order.index),run:function(){ssSend('playback_mode',{mode:'native',order:order.index});}});})(orders[i]);
  items.push({separator:true},{label:'调整随机偏好…',run:ssOpen},{label:'重新开始一轮',run:function(){ssSend('restart');}},{separator:true},{label:(ssState&&ssState.update&&ssState.update.available?'发现更新 '+ssState.update.release.version:'检查更新…'),run:function(){ssSend('update_open');}},{label:'插件设置…',run:function(){ssSend('settings');}});
  ssShowPopup(items,x,y);
}
