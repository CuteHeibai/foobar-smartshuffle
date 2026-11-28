/* Dark in-panel menus retain the original SDK command tree, including plugin commands. */
var ssPopup=null,SS_MENU_HB=[],ssPopupHover='',ssPopupSerial=0,ssMenuPollTimer=0,ssMenuLeaveTimer=0;
function ssMenuKeepOpen(){if(ssMenuLeaveTimer)window.ClearTimeout(ssMenuLeaveTimer);ssMenuLeaveTimer=0;}
function ssMenuLeave(){
  // Menus close by click or Escape, never by pointer travel.
}
function ssShowPopup(items,x,y,token,nativeMenu,kind,anchor,below){
  ssMenuKeepOpen();
  if(typeof ssDropPopupImage==='function')ssDropPopupImage();
  ssPopupRestore=false;ssPopup={serial:++ssPopupSerial,x:x,y:y,token:token||'',nativeMenu:!!nativeMenu,kind:kind,
    anchor:anchor,below:!!below,context:kind==='context',clickSubmenus:kind==='playback',levels:[{items:items,scroll:0,selected:-1}]};
  applyKeyMode();repaintAll();
}
function ssStopMenuPoll(){if(ssMenuPollTimer)window.ClearInterval(ssMenuPollTimer);ssMenuPollTimer=0;}
function ssClosePopup(){ssMenuKeepOpen();ssStopMenuPoll();ssPopup=null;SS_MENU_HB=[];ssPopupRestore=!fsMode&&!!ssSceneImage;if(typeof ssDropPopupImage==='function')ssDropPopupImage();applyKeyMode();repaintAll();}
function ssSetContextTargets(rows){
  if(ssPopup)ssPopup.targets={w:W,h:H,rows:rows};
}
function ssDrawContextTargets(gr){
  var targets=ssPopup.targets;
  if(!targets||targets.w!==W||targets.h!==H)return;
  for(var i=0;i<targets.rows.length;i++){
    var row=targets.rows[i],w=row.x1-row.x0,h=row.y1-row.y0,rSm=typeof ssRad==='function'?ssRad('sm'):4;
    if(w<2||h<4)continue;
    ssFillContinuousRect(gr,row.x0,row.y0,w,h,rSm,rSm,COL.rowActive);
    if(h>8)gr.FillSolidRect(row.x0+2,row.y0+4,2,h-8,COL.green);
  }
}
function ssOpenNativeMenu(kind,args,x,y,extra,showExtra){
  if(kind==='main'&&args.root==='view'&&typeof ssAppearanceMenuItems==='function')
    extra=[{label:'外观',children:ssAppearanceMenuItems()},{separator:true}].concat(extra||[]);
  var pending=[{label:'正在读取菜单…',disabled:true}];
  ssShowPopup(showExtra?extra.concat([{separator:true}],pending):pending,x,y,'',true,kind);
  ssPopup.root=kind==='main'?args.root:'';
  ssPopup.extra=extra||[];
  ssPopup.showExtra=!!showExtra;
  var fields={kind:kind,keep_lyrics:true};for(var k in args)fields[k]=args[k];
  ssPopup.request=ssSend('menu_open',fields);
  if(!ssMenuPollTimer)ssMenuPollTimer=window.SetInterval(ssPoll,16);
}
function ssRewriteMainMenuItems(items,root){
  if(!Array.isArray(items)||typeof ssOpenSettings!=='function')return items;
  return items.map(function(item){
    if(!item)return item;
    var label=ssMenuLabel(item.label||'');
    if(item.children)return Object.assign({},item,{children:ssRewriteMainMenuItems(item.children,root)});
    if(root==='file'&&(label==='参数选项'||label==='Preferences')){
      return Object.assign({},item,{label:'设置',icon:'settings',run:function(){ssOpenSettings(false);}});
    }
    if(root==='playback'&&label==='插件设置…'){
      return Object.assign({},item,{run:function(){ssOpenSettings(false);}});
    }
    if(root==='playback'&&label==='检查更新…'){
      return Object.assign({},item,{run:function(){ssOpenSettings(true);}});
    }
    return item;
  });
}
function ssAcceptMenu(done,state){
  if(!ssPopup||!done||done.id!==ssPopup.request)return;
  ssStopMenuPoll();
  // Older components hide the lyrics child while resolving SDK menus.
  ssNativeLyricKey='';
  var result=state.response&&state.response.menu;
  ssPopup.token=result?result.token:'';
  var extras=ssPopup.extra||[],details=[];
  var handles=null;
  if(result&&ssPopup.context&&typeof ssResolveMediaTracks==='function'){
    var ids=done.tracks&&done.tracks.length?done.tracks:result.track_id?[result.track_id]:[];
    try{
      handles=ssResolveMediaTracks(ids);
      if(handles.Count)details.push({label:'补齐封面和歌手资料',run:function(){ssRefreshMedia(handles);}});
    }catch(e){console.log('Smart Shuffle metadata menu: '+String(e));}
  }
  if(result&&ssPopup.context&&result.track_id)details.push({label:'删除本地文件…',danger:true,run:function(){ssRecyclePrepare(result.track_id);}});
  var failure=[{label:(state.response&&state.response.message)||'菜单不可用',disabled:true}];
  var items=result?(ssPopup.context?ssTrackContextItems(result.items,extras,details):extras.concat(ssRewriteMainMenuItems(result.items,ssPopup.root))):
    ssPopup.showExtra?extras.concat([{separator:true}],failure):failure;
  if(result&&ssPopup.context&&handles&&handles.Count===1&&typeof ssOpenTrackInfo==='function'){
    var singleHandle=handles[0],menuToken=ssPopup.token;
    for(var pi=0;pi<items.length;pi++){
      if(items[pi]&&!items[pi].children&&items[pi].command!==undefined&&ssMenuLabel(items[pi].label)==='属性'){
        var nativeCmd=items[pi].command;
        items[pi]=Object.assign({},items[pi],{run:function(){ssOpenTrackInfo(singleHandle,function(){ssSend('menu_execute',{token:menuToken,command:nativeCmd});});}});
        break;
      }
    }
  }
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
  var dangers=[];
  for(i=0;i<details.length;i++){
    if(details[i].danger)dangers.push(details[i]);
    else info.push(details[i]);
  }
  var more=[{label:'播放与音频',icon:'headphones',children:audio},{label:'文件与复制',icon:'folderOpen',children:files},
    {label:'标签与资料',icon:'tag',children:info},{label:'工具与扩展',icon:'tools',children:extensions}].filter(function(group){return group.children.length;});
  if(items.length&&items[items.length-1].separator)items.pop();
  if(play)items.splice(items.length&&items[0].heading?1:0,0,play);
  if(items.length>1&&(properties||more.length))items.push({separator:true});
  if(properties)items.push(properties);
  if(more.length)items.push({label:'音频、文件、标签与工具',children:more,drill:true});
  if(dangers.length){
    if(items.length)items.push({separator:true});
    for(i=0;i<dangers.length;i++)items.push(dangers[i]);
  }
  return items;
}
function ssPopupChoose(item){
  if(!ssPopup||!item||item.disabled||item.separator||item.heading)return;
  if(item.children)return;
  var token=ssPopup.token;ssClosePopup();
  if(item.run)item.run();else if(item.command!==undefined)ssSend('menu_execute',{token:token,command:item.command});
}
function ssMenuLabel(label){var text=String(label||'').replace(/&&/g,'\u0001').replace(/&/g,'').replace(/\u0001/g,'&').split('\t')[0];return typeof ssLocalLabel==='function'?ssLocalLabel(text):text;}
var SS_SUBMENU_EDGE=12,SS_SUBMENU_GAP=5;
function ssMenuIconColumn(items,scale){
  return items.some(function(item){return !!item.icon;})?Math.round(24*scale):0;
}
function ssPopupMenuWidth(gr,level,rh,scale,style,secondary){
  var items=level.items,width=level.drill?Math.max(200,level.drill.w):secondary?style.submenuWidth:style.minWidth;
  var leading=ssMenuIconColumn(items,scale);
  for(var i=0;i<items.length;i++)if(!items[i].separator){
    if(items[i].drill)width=Math.max(width,200);
    var item=items[i],font=item.primary||style.playback&&item.checked?style.primary:style.label;
    width=Math.max(width,Math.ceil(ssMeasureText(gr,ssMenuLabel(item.label),font,rh))+leading+(item.children||item.checked?46:30));
  }
  return Math.max(1,Math.min(width,Math.round(308*scale),W-2*(secondary?SS_SUBMENU_EDGE:8)));
}
function ssSubmenuSide(parent,width){
  var right=W-parent.x-parent.w,left=parent.x;
  if(right>=width+SS_SUBMENU_EDGE+SS_SUBMENU_GAP)return 1;
  if(left>=width+SS_SUBMENU_EDGE+SS_SUBMENU_GAP)return -1;
  return right>=left?1:-1;
}
function ssDrawSubmenuSurface(gr,x,y,w,h){
  var radius=typeof ssRad==='function'?ssRad('lg'):12,density=Math.min(48,COL.shadow>>>24);
  // The light falloff follows the corners and leaves the neighboring menu clear.
  for(var spread=SS_SUBMENU_GAP-1;spread>0;spread--){
    var alpha=Math.max(1,Math.round((SS_SUBMENU_GAP-spread)*density/44));
    ssFillContinuousRect(gr,x-spread,y+2-spread,w+2*spread,h+2*spread,radius+spread,radius+spread,ssAlpha(COL.shadow,alpha));
  }
  ssFillContinuousRect(gr,x,y,w,h,radius,radius,COL.popup);
  ssStrokeContinuousRect(gr,x+.5,y+.5,w-1,h-1,radius,radius,1,COL.line);
}
function ssPopupItemHeight(item,rowHeight,separatorHeight){
  return item.separator?separatorHeight:item.heading?Math.round(rowHeight*.8):rowHeight;
}
function ssDrawContextChevron(gr,x,y,direction,color,scale){
  scale=scale||1;
  var dx=2*direction*scale,dy=4*scale;
  gr.DrawLine(x-dx,y-dy,x+dx,y,1.5,color);
  gr.DrawLine(x+dx,y,x-dx,y+dy,1.5,color);
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
  var cx=Math.round(x+width/2),cy=Math.round(y+height/2),rSm=typeof ssRad==='function'?ssRad('sm'):4;
  if(mx>=x&&mx<x+width&&my>=y&&my<y+height)ssFillContinuousRect(gr,x+5,y,width-10,height,rSm,rSm,COL.rowHover);
  gr.DrawLine(cx-4,cy+step*2,cx,cy-step*2,1.5,COL.text2);
  gr.DrawLine(cx,cy-step*2,cx+4,cy+step*2,1.5,COL.text2);
  SS_MENU_HB.push({x0:x,y0:y,x1:x+width,y1:y+height,depth:depth,step:step});
}
function ssDrawPopup(gr){
  SS_MENU_HB=[];if(!ssPopup)return;
  var previous=null,context=ssPopup.context,playback=ssPopup.clickSubmenus,scale=Math.max(1,UISCALE);
  var menuScale=playback?Math.max(1,Math.min(1.32,W/1280,H/800)):1;
  var style={playback:playback,minWidth:playback?Math.round(204*menuScale):156,submenuWidth:Math.round(204*menuScale),
    primary:menuScale>1?ssFsFont(FONT.menuPrimary,menuScale):FONT.menuPrimary,
    label:menuScale>1?ssFsFont(FONT.lib,menuScale):FONT.lib};
  var rootRow=Math.max(36,Math.round(24*scale),Math.round(30*menuScale));
  var childRow=Math.max(35,Math.round(22*scale),Math.round(28*menuScale));
  var widths=ssPopup.levels.map(function(level,d){return ssPopupMenuWidth(gr,level,d?childRow:rootRow,scale,style,d>0);});
  var first=ssPopupFirstVisible();
  var contentBottom=context&&typeof R!=='undefined'&&R.barY>TBH+80?R.barY:H;
  for(var d=first;d<ssPopup.levels.length;d++){
    var secondary=d>0,rh=secondary?childRow:rootRow,pad=6,inset=16,separator=10;
    var edge=secondary?SS_SUBMENU_EDGE:8,topBound=TBH+(secondary?SS_SUBMENU_EDGE:4);
    var limit=contentBottom-(secondary?SS_SUBMENU_EDGE:context&&contentBottom!==H?6:8);
    if(secondary&&playback&&ssPopup.anchor)limit=Math.min(limit,Math.floor(ssPopup.anchor.y0)-SS_SUBMENU_EDGE-8);
    var level=ssPopup.levels[d],items=level.items,total=pad*2,offsets=[],width=widths[d];
    var leading=secondary?Math.max(28,ssMenuIconColumn(items,scale)):ssMenuIconColumn(items,scale),iconSize=Math.min(rh-8,Math.round((playback&&!secondary?19:16)*scale));
    var header=level.drill?rh+5:0;
    for(var i=0;i<items.length;i++){
      offsets.push(total-pad*2);total+=ssPopupItemHeight(items[i],rh,separator);
    }
    var height=Math.max(1,Math.min(total+header,limit-topBound-8)),scrollBand=height<total+header&&height>rh+2*pad+36?18:0;
    var x=ssPopup.x,y=ssPopup.y;
    if(secondary&&!level.drill){
      x=ssSubmenuSide(previous,width)>0?previous.x+previous.w+SS_SUBMENU_GAP:previous.x-width-SS_SUBMENU_GAP;
      y=previous.anchor-pad-scrollBand;
    }
    if(!d&&ssPopup.anchor){
      x=ssPopup.anchor.x1-width;y=ssPopup.below?ssPopup.anchor.y1+8:ssPopup.anchor.y0-height-8;
    }
    if(level.drill){x=level.drill.x;y=level.drill.y;}
    else if(context&&!d){x+=4;y+=4;if(y+height>limit)y=ssPopup.y-height-4;}
    if(!d&&context&&x+width>W-edge)x=ssPopup.x-width-4;
    x=Math.max(edge,Math.min(x,W-width-edge));y=Math.max(topBound,Math.min(y,limit-height));
    if(secondary){x=Math.round(x);y=Math.round(y);}
    level.max=Math.max(0,total+header-height+scrollBand*2);level.scroll=Math.max(0,Math.min(level.scroll,level.max));level.rect={x:x,y:y,w:width,h:height};
    level.rowHeight=rh;level.offsets=offsets;level.visibleHeight=height-2*(pad+scrollBand)-header;
    var rMenu=typeof ssRad==='function'?ssRad('md'):8,rItem=typeof ssRad==='function'?ssRad('sm'):4;
    if(secondary)ssDrawSubmenuSurface(gr,x,y,width,height);
    else{
      ssFillContinuousRect(gr,x+2,y+3,width,height,rMenu,rMenu,COL.shadow);
      ssFillContinuousRect(gr,x,y,width,height,rMenu,rMenu,COL.popup);
      ssStrokeContinuousRect(gr,x+.5,y+.5,width-1,height-1,rMenu,rMenu,1,COL.line);
    }
    if(level.drill){
      var backY=y+pad;
      if(mx>=x&&mx<x+width&&my>=backY&&my<backY+rh)ssFillContinuousRect(gr,x+4,backY,width-8,rh,rItem,rItem,COL.rowHover);
      ssDrawContextChevron(gr,x+inset+4,Math.round(backY+rh/2),-1,COL.text,1.35);
      tL(gr,level.title,style.primary,COL.text,x+inset+16,backY,width-2*inset-16,rh);
      gr.FillSolidRect(x+inset,backY+rh+2,width-inset*2,1,COL.line);
      SS_MENU_HB.push({x0:x,y0:backY,x1:x+width,y1:backY+rh,depth:d,back:true});
    }
    var top=y+pad+header+scrollBand,bottom=y+height-pad-scrollBand,rowY=top-level.scroll,anchor=y;
    for(i=0;i<items.length;i++){
      var it=items[i],ih=ssPopupItemHeight(it,rh,separator);
      if(rowY>=top&&rowY+ih<=bottom){
        if(it.separator)gr.FillSolidRect(x+inset,rowY+Math.floor(ih/2),width-2*inset,1,COL.line);
        else if(it.heading)tL(gr,ssMenuLabel(it.label),FONT.plSub,COL.text2,x+inset,rowY,width-inset*2,ih);
        else{
          var current=playback&&it.checked;
          if(!it.disabled&&(current||level.selected===i||level.hover===i))
            ssFillContinuousRect(gr,x+4,rowY,width-8,ih,rItem,rItem,current?COL.rowActive:COL.rowHover);
          var color=it.disabled?COL.text3:it.danger?COL.dangerHover:current?COL.green:COL.text;
          if(it.icon)drawIcon(gr,it.icon,it.disabled?COL.text3:current?COL.green:COL.text2,x+inset,rowY,iconSize,ih,iconSize);
          tL(gr,ssMenuLabel(it.label),it.primary||current?style.primary:style.label,color,x+inset+leading,rowY,width-inset-leading-(it.children||it.checked?29:inset),ih);
          if(it.children){
            var next=ssPopup.levels[d+1];
            var left=level.selected===i&&next&&!next.drill&&ssSubmenuSide(level.rect,widths[d+1])<0;
            ssDrawContextChevron(gr,x+width-17,Math.round(rowY+ih/2),left?-1:1,it.disabled?COL.text3:COL.text2);
          }else if(it.checked)drawIcon(gr,'check',it.disabled?COL.text3:COL.text2,x+width-27,rowY,18,ih,Math.min(iconSize,16));
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
  if(!fsMode&&ssPopup.root&&y<TBH&&typeof HB_MENU!=='undefined'){
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
  var title=!fsMode&&ssPopup.root&&typeof HB_MENU!=='undefined'?hit(HB_MENU,x,y):null;
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
  var items=[{label:'智能随机',icon:'shuffle',checked:smart,run:function(){ssSend('playback_mode',{mode:'smart'});}}];
  var orders=(ssState&&ssState.orders)||[{index:0},{index:1},{index:2}];
  var labels=['顺序播放','列表循环','单曲循环'],icons=['sequence','repeat','repeat1'];
  orders.forEach(function(order){
    var index=order.index;
    if(index<0||index>=labels.length)return;
    items.push({label:labels[index],icon:icons[index],checked:!!(ssState&&!smart&&ssState.native_order===index),
      run:function(){ssSend('playback_mode',{mode:'native',order:index});}});
  });
  items.push({separator:true},{label:'调整随机偏好…',run:ssOpen});
  if(smart)items.push({label:'重新开始一轮',run:function(){ssSend('restart');}});
  if(typeof ssStatsOpen==='function'&&ssState&&ssState.listening_stats)items.push({label:'聆听统计…',run:ssStatsOpen});
  var hasUpdate=update&&update.available;
  items.push({separator:true},{label:hasUpdate?'插件 · 有更新':'插件',children:[
    {label:'插件设置…',icon:'settings',run:function(){if(typeof ssOpenSettings==='function')ssOpenSettings(false);else ssSend('settings');}},
    {label:hasUpdate?'发现更新 '+update.release.version:'检查更新…',icon:'refresh',run:function(){if(typeof ssOpenSettings==='function')ssOpenSettings(true);else ssSend('update_open');}}
  ]});
  ssShowPopup(items,x,y,'',false,'playback',anchor);
}
