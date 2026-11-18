/* Dark in-panel menus retain the original SDK command tree, including plugin commands. */
var ssPopup=null,SS_MENU_HB=[],ssPopupHover='',ssPopupSerial=0,ssMenuPollTimer=0,ssMenuLeaveTimer=0;
function ssMenuKeepOpen(){if(ssMenuLeaveTimer)window.ClearTimeout(ssMenuLeaveTimer);ssMenuLeaveTimer=0;}
function ssMenuLeave(){
  // Menus close by click or Escape, never by pointer travel.
}
function ssShowPopup(items,x,y,token,nativeMenu,kind){
  ssMenuKeepOpen();
  if(typeof ssDropPopupImage==='function')ssDropPopupImage();
  ssPopupRestore=false;ssPopup={serial:++ssPopupSerial,x:x,y:y,token:token||'',nativeMenu:!!nativeMenu,context:kind==='context',clickSubmenus:kind==='playback',levels:[{items:items,scroll:0,selected:-1}]};
  if(!nativeMenu&&typeof ssHideLyrics==='function')ssHideLyrics();applyKeyMode();repaintAll();
}
function ssStopMenuPoll(){if(ssMenuPollTimer)window.ClearInterval(ssMenuPollTimer);ssMenuPollTimer=0;}
function ssClosePopup(){ssMenuKeepOpen();ssStopMenuPoll();ssPopup=null;SS_MENU_HB=[];ssPopupRestore=!!ssSceneImage;if(typeof ssDropPopupImage==='function')ssDropPopupImage();applyKeyMode();repaintAll();}
function ssSetContextTargets(rows){
  if(ssPopup)ssPopup.targets={w:W,h:H,rows:rows};
}
function ssDrawContextTargets(gr){
  var targets=ssPopup.targets;
  if(!targets||targets.w!==W||targets.h!==H)return;
  for(var i=0;i<targets.rows.length;i++){
    var row=targets.rows[i],w=row.x1-row.x0,h=row.y1-row.y0;
    if(w<2||h<4)continue;
    ssFillContinuousRect(gr,row.x0,row.y0,w,h,4,4,COL.rowActive);
    if(h>8)gr.FillSolidRect(row.x0+2,row.y0+4,2,h-8,COL.green);
  }
}
function ssOpenNativeMenu(kind,args,x,y,extra){
  if(kind==='main'&&args.root==='view'&&typeof ssAppearanceMenuItems==='function')
    extra=[{label:'外观',children:ssAppearanceMenuItems()},{separator:true}].concat(extra||[]);
  ssShowPopup([{label:'正在读取菜单…',disabled:true}],x,y,'',true,kind);
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
  var extras=ssPopup.extra||[],details=[];
  if(result&&ssPopup.context&&typeof ssResolveMediaTracks==='function'){
    var ids=done.tracks&&done.tracks.length?done.tracks:result.track_id?[result.track_id]:[];
    try{
      var handles=ssResolveMediaTracks(ids);
      if(handles.Count)details.push({label:'补齐封面和歌手资料',run:function(){ssRefreshMedia(handles);}});
    }catch(e){console.log('Smart Shuffle metadata menu: '+String(e));}
  }
  if(result&&ssPopup.context&&result.track_id)details.push({label:'将歌曲文件移到回收站…',danger:true,run:function(){ssRecyclePrepare(result.track_id);}});
  var items=result?(ssPopup.context?ssTrackContextItems(result.items,extras,details):extras.concat(result.items)):[{label:(state.response&&state.response.message)||'菜单不可用',disabled:true}];
  ssPopup.levels=[{items:items,scroll:0,selected:-1}];
}
function ssTrackContextItems(nativeItems,extra,details){
  var play=null,properties=null,items=extra.slice(0);
  var audio=[],files=[],info=[],extensions=[];
  for(var i=0;i<nativeItems.length;i++){
    var item=nativeItems[i],label=ssMenuLabel(item.label);
    if(item.separator)continue;
    if(!item.disabled&&item.command!==undefined&&!item.children){
      if(!play&&label==='播放'){play=Object.assign({},item,{primary:true});continue;}
      if(!properties&&label==='属性'){properties=item;continue;}
    }
    if(label==='添加到播放队列')audio.push(Object.assign({},item,{label:'添加到 foobar2000 播放队列'}));
    else if(['播放增益','转换','播放统计信息'].indexOf(label)>=0)audio.push(item);
    else if(['打开所在文件夹','文件操作','复制名称','复制'].indexOf(label)>=0)files.push(item);
    else if(['标签','封面工具','收集'].indexOf(label)>=0)info.push(item);
    else extensions.push(item);
  }
  for(i=0;i<details.length;i++){
    if(details[i].danger){if(files.length)files.push({separator:true});files.push(details[i]);}
    else info.push(details[i]);
  }
  var more=[{label:'播放与音频',children:audio},{label:'文件与复制',children:files},
    {label:'标签与资料',children:info},{label:'工具与扩展',children:extensions}].filter(function(group){return group.children.length;});
  if(items.length&&items[items.length-1].separator)items.pop();
  if(play)items.splice(items.length&&items[0].heading?1:0,0,play);
  if(items.length>1&&(properties||more.length))items.push({separator:true});
  if(properties)items.push(properties);
  if(more.length)items.push({label:'音频、文件、标签与工具',children:more,drill:true});
  return items;
}
function ssPopupChoose(item){
  if(!ssPopup||!item||item.disabled||item.separator||item.heading)return;
  if(item.children)return;
  var token=ssPopup.token;ssClosePopup();
  if(item.run)item.run();else if(item.command!==undefined)ssSend('menu_execute',{token:token,command:item.command});
}
function ssMenuLabel(label){var text=String(label||'').replace(/&&/g,'\u0001').replace(/&/g,'').replace(/\u0001/g,'&').split('\t')[0];return typeof ssLocalLabel==='function'?ssLocalLabel(text):text;}
function ssPopupMenuWidth(gr,level,rh,scale,style){
  var items=level.items,width=level.drill?Math.max(200,level.drill.w):style.minWidth;
  for(var i=0;i<items.length;i++)if(!items[i].separator){
    if(items[i].drill)width=Math.max(width,200);
    var item=items[i],font=item.primary||style.playback&&item.checked?style.primary:style.label;
    width=Math.max(width,Math.ceil(ssMeasureText(gr,ssMenuLabel(item.label),font,rh))+(item.children||item.checked?46:30));
  }
  return Math.max(1,Math.min(width,Math.round(308*scale),W-16));
}
function ssDrawContextChevron(gr,x,y,direction,color){
  gr.DrawLine(x-2*direction,y-4,x+2*direction,y,1.5,color);
  gr.DrawLine(x+2*direction,y,x-2*direction,y+4,1.5,color);
}
function ssPopupContains(rect,x,y){return rect&&x>=rect.x&&x<rect.x+rect.w&&y>=rect.y&&y<rect.y+rect.h;}
function ssPopupFirstVisible(){var last=ssPopup.levels.length-1;return ssPopup.levels[last].drill?last:0;}
function ssPopupHit(x,y){
  if(!ssPopup.context)return hit(SS_MENU_HB,x,y);
  for(var depth=ssPopup.levels.length-1;depth>=ssPopupFirstVisible();depth--)if(ssPopupContains(ssPopup.levels[depth].rect,x,y)){
    return SS_MENU_HB.find(function(box){return box.depth===depth&&inRect(x,y,box);});
  }
  return null;
}
function ssDrawContextScroll(gr,x,y,width,height,depth,step){
  var cx=Math.round(x+width/2),cy=Math.round(y+height/2);
  if(mx>=x&&mx<x+width&&my>=y&&my<y+height)ssFillContinuousRect(gr,x+5,y,width-10,height,4,4,COL.rowHover);
  gr.DrawLine(cx-4,cy+step*2,cx,cy-step*2,1.5,COL.text2);
  gr.DrawLine(cx,cy-step*2,cx+4,cy+step*2,1.5,COL.text2);
  SS_MENU_HB.push({x0:x,y0:y,x1:x+width,y1:y+height,depth:depth,step:step});
}
function ssDrawPopup(gr){
  SS_MENU_HB=[];if(!ssPopup)return;
  var previous=null,context=ssPopup.context,playback=ssPopup.clickSubmenus,scale=Math.max(1,UISCALE),pad=6;
  var menuScale=playback?Math.max(1,Math.min(1.32,W/1280,H/800)):1;
  var style={playback:playback,minWidth:playback?Math.round(204*menuScale):156,
    primary:menuScale>1?ssFsFont(FONT.menuPrimary,menuScale):FONT.menuPrimary,
    label:menuScale>1?ssFsFont(FONT.pl,menuScale):FONT.pl};
  var rh=Math.max(30,Math.round(24*scale),Math.round(30*menuScale)),inset=14;
  var widths=ssPopup.levels.map(function(level){return ssPopupMenuWidth(gr,level,rh,scale,style);});
  var first=ssPopupFirstVisible();
  var limit=context&&typeof R!=='undefined'&&R.barY>TBH+80?R.barY-6:H-8;
  for(var d=first;d<ssPopup.levels.length;d++){
    var level=ssPopup.levels[d],items=level.items,total=pad*2,offsets=[],width=widths[d];
    var header=level.drill?rh+6:0;
    for(var i=0;i<items.length;i++){
      offsets.push(total-pad*2);total+=items[i].separator?9:items[i].heading?Math.round(rh*.8):rh;
    }
    var height=Math.min(total+header,limit-TBH-12),scrollBand=context&&height<total+header?18:0;
    var x=d&&!level.drill?previous.x+previous.w+6:ssPopup.x,y=d&&!level.drill?previous.anchor-(context?pad+scrollBand:0):ssPopup.y;
    if(!d&&ssPopup.anchor){x=ssPopup.anchor.x1-width;y=ssPopup.anchor.y0-height-8;}
    if(level.drill){x=Math.min(level.drill.x,W-width-8);y=level.drill.y;}
    else if(context&&!d){x+=4;y+=4;if(y+height>limit)y=ssPopup.y-height-4;}
    if(x+width>W-8)x=d?Math.max(8,previous.x-width-6):context?Math.max(8,ssPopup.x-width-4):W-width-8;
    x=Math.max(8,x);y=Math.max(TBH+4,Math.min(y,limit-height));
    level.max=Math.max(0,total+header-height+scrollBand*2);level.scroll=Math.max(0,Math.min(level.scroll,level.max));level.rect={x:x,y:y,w:width,h:height};
    level.rowHeight=rh;level.offsets=offsets;level.visibleHeight=height-2*(pad+scrollBand)-header;
    ssFillContinuousRect(gr,x+2,y+3,width,height,8,8,COL.shadow);
    ssFillContinuousRect(gr,x,y,width,height,8,8,COL.popup);
    ssStrokeContinuousRect(gr,x+.5,y+.5,width-1,height-1,8,8,1,COL.line);
    if(level.drill){
      var backY=y+pad;
      if(mx>=x&&mx<x+width&&my>=backY&&my<backY+rh)ssFillContinuousRect(gr,x+4,backY,width-8,rh,4,4,COL.rowHover);
      ssDrawContextChevron(gr,x+inset+4,Math.round(backY+rh/2),-1,COL.text2);
      tL(gr,level.title,FONT.menuPrimary,COL.text,x+32,backY,width-44,rh);
      gr.FillSolidRect(x+inset,backY+rh+2,width-inset*2,1,COL.line);
      SS_MENU_HB.push({x0:x,y0:backY,x1:x+width,y1:backY+rh,depth:d,back:true});
    }
    var top=y+pad+header+scrollBand,bottom=y+height-pad-scrollBand,rowY=top-level.scroll,anchor=y;
    for(i=0;i<items.length;i++){
      var it=items[i],ih=it.separator?9:it.heading?Math.round(rh*.8):rh;
      if(rowY>=top&&rowY+ih<=bottom){
        if(it.separator)gr.FillSolidRect(x+inset,rowY+4,width-2*inset,1,COL.line);
        else if(it.heading)tL(gr,ssMenuLabel(it.label),FONT.plSub,COL.text2,x+inset,rowY,width-inset*2,ih);
        else{
          var current=playback&&it.checked;
          if(!it.disabled&&(current||level.selected===i||level.hover===i))
            ssFillContinuousRect(gr,x+4,rowY,width-8,ih,4,4,current?COL.rowActive:COL.rowHover);
          var color=it.disabled?COL.text3:it.danger?COL.dangerHover:current?COL.green:COL.text;
          tL(gr,ssMenuLabel(it.label),it.primary||current?style.primary:style.label,color,x+inset,rowY,width-inset-(it.children||it.checked?29:inset),ih);
          if(it.children){
            var left=level.selected===i&&widths[d+1]&&width+6+x+widths[d+1]>W-8;
            ssDrawContextChevron(gr,x+width-17,Math.round(rowY+ih/2),left?-1:1,it.disabled?COL.text3:COL.text2);
          }else if(it.checked)tC(gr,'✓',style.label,COL.green,x+width-27,rowY,18,ih);
          SS_MENU_HB.push({x0:x,y0:rowY,x1:x+width,y1:rowY+ih,depth:d,index:i,item:it});
        }
      }
      if(level.selected===i)anchor=rowY;
      rowY+=ih;
    }
    if(scrollBand){
      if(level.scroll>0)ssDrawContextScroll(gr,x,y+pad+header,width,scrollBand,d,1);
      if(level.scroll<level.max)ssDrawContextScroll(gr,x,bottom,width,scrollBand,d,-1);
    }else{
      if(level.scroll>0)tC(gr,'⌃',FONT.pl,COL.text2,x,y-1,width,14);
      if(level.scroll<level.max)tC(gr,'⌄',FONT.pl,COL.text2,x,y+height-14,width,14);
    }
    previous={x:x,y:y,w:width,anchor:anchor};
  }
}
function ssPopupMove(x,y){
  if(!ssPopup)return false;
  if(ssPopup.root&&y<TBH&&typeof HB_MENU!=='undefined'){
    var title=hit(HB_MENU,x,y);if(title)return true;
  }
  var inside=ssPopup.levels.slice(ssPopupFirstVisible()).some(function(level){return ssPopupContains(level.rect,x,y);});
  if(inside)ssMenuKeepOpen();else ssMenuLeave();
  var h=ssPopupHit(x,y);if(!h||!h.item)return true;
  if(ssPopup.root||ssPopup.clickSubmenus){var hovered=ssPopup.levels[h.depth];if(hovered.hover!==h.index){hovered.hover=h.index;repaintAll();}return true;}
  var level=ssPopup.levels[h.depth];if(level.selected===h.index||ssPopup.context&&h.item.disabled)return true;
  level.selected=h.index;ssPopup.levels.length=h.depth+1;
  if(h.item.children&&!h.item.disabled&&!h.item.drill&&!level.drill)ssPopup.levels.push({items:h.item.children,scroll:0,selected:-1});
  repaintAll();return true;
}
function ssPopupChild(level,item){
  var child={items:item.children,scroll:0,selected:-1};
  if(ssPopup.context&&(item.drill||level.drill)&&level.rect){child.drill=level.drill||level.rect;child.title=ssMenuLabel(item.label);}
  return child;
}
function ssPopupExpand(h){
  if(h.item.disabled)return;
  var level=ssPopup.levels[h.depth],opened=level.selected===h.index&&ssPopup.levels.length>h.depth+1;
  ssPopup.levels.length=h.depth+1;level.selected=opened?-1:h.index;
  if(!opened)ssPopup.levels.push(ssPopupChild(level,h.item));repaintAll();
}
function ssPopupClick(x,y){if(!ssPopup)return false;
  var title=ssPopup.root&&typeof HB_MENU!=='undefined'?hit(HB_MENU,x,y):null;
  if(title){if(title.root===ssPopup.root)ssClosePopup();else ssOpenNativeMenu('main',{root:title.root},title.mx,TBH);return true;}
  var h=ssPopupHit(x,y);
  if(h){if(h.back){ssPopup.levels.pop();repaintAll();}else if(h.step)ssPopupScroll(h.depth,h.step);else if(h.item.children)ssPopupExpand(h);else ssPopupChoose(h.item);}
  else if(!ssPopup.context||!ssPopup.levels.slice(ssPopupFirstVisible()).some(function(level){return ssPopupContains(level.rect,x,y);}))ssClosePopup();
  return true;
}
function ssPopupScroll(depth,step){
  var level=ssPopup.levels[depth],distance=ssPopup.context?3*(level.rowHeight||34):34;
  level.scroll=Math.max(0,Math.min(level.max||0,level.scroll-step*distance));
  ssPopup.levels.length=depth+1;repaintAll();
}
function ssPopupWheel(step){
  if(!ssPopup)return false;
  var depth=ssPopup.levels.length-1;
  if(ssPopup.context){for(var i=depth;i>=ssPopupFirstVisible();i--)if(ssPopupContains(ssPopup.levels[i].rect,mx,my)){depth=i;break;}}
  ssPopupScroll(depth,step);return true;
}
function ssPopupKey(key){
  if(!ssPopup)return false;
  if(key===27){ssClosePopup();return true;}
  var level=ssPopup.levels[ssPopup.levels.length-1];
  if(key===37&&ssPopup.levels.length>1){ssPopup.levels.pop();repaintAll();return true;}
  if(key===38||key===40){
    var step=key===38?-1:1,index=level.selected<0&&step<0?0:level.selected;
    for(var n=0;n<level.items.length;n++){index=(index+step+level.items.length)%level.items.length;if(!level.items[index].separator&&!level.items[index].disabled&&!level.items[index].heading)break;}
    if(n===level.items.length)return true;
    level.selected=index;
    if(level.offsets){
      var top=level.offsets[index],bottom=top+level.rowHeight;
      if(top<level.scroll)level.scroll=top;
      else if(bottom>level.scroll+level.visibleHeight)level.scroll=bottom-level.visibleHeight;
    }
    repaintAll();
  }else if(key===13||key===39){
    var item=level.items[level.selected];
    if(item&&item.children&&!item.disabled){ssPopup.levels.push(ssPopupChild(level,item));repaintAll();}else if(key===13)ssPopupChoose(item);
  }
  return true;
}
function ssShowPlaybackModes(x,y,anchor){
  var smart=!!(ssState&&ssState.enabled),update=ssState&&ssState.update;
  var items=[{label:'智能随机',checked:smart,run:function(){ssSend('playback_mode',{mode:'smart'});}}];
  var orders=(ssState&&ssState.orders)||[{index:0,name:'顺序播放'},{index:1,name:'列表循环'},{index:2,name:'单曲循环'}];
  for(var i=0;i<orders.length;i++)if(orders[i].index<3)(function(order){items.push({label:['顺序播放','列表循环','单曲循环'][order.index],checked:!!(ssState&&!smart&&ssState.native_order===order.index),run:function(){ssSend('playback_mode',{mode:'native',order:order.index});}});})(orders[i]);
  items.push({separator:true},{label:'调整随机偏好…',run:ssOpen});
  if(smart)items.push({label:'重新开始一轮',run:function(){ssSend('restart');}});
  if(typeof ssStatsOpen==='function'&&ssState&&ssState.listening_stats)items.push({label:'聆听统计…',run:ssStatsOpen});
  var hasUpdate=update&&update.available;
  items.push({separator:true},{label:hasUpdate?'插件 · 有更新':'插件',children:[
    {label:'插件设置…',run:function(){ssSend('settings');}},
    {label:hasUpdate?'发现更新 '+update.release.version:'检查更新…',run:function(){ssSend('update_open');}}
  ]});
  ssShowPopup(items,x,y,'',false,'playback');
  if(anchor)ssPopup.anchor=anchor;
}
