/* Windows UI Automation uses the same panel coordinates and commands as the painted controls. */
var ssReaderRevision=Date.now(),ssReaderSignature='',ssReaderItems=new Map(),ssReaderTimer=0,ssReaderSerial=0;
function ssReaderTree(){
  var items=[],bindings=new Map();
  function add(id,role,name,b,action,options,target){
    if(!b||!name)return;
    var x=Math.max(0,Math.round(b.x0)),y=Math.max(0,Math.round(b.y0));
    var w=Math.min(W,Math.round(b.x1))-x,h=Math.min(H,Math.round(b.y1))-y;
    if(!(w>0&&h>0))return;
    var item=Object.assign({id:id,role:role,name:name,x:x,y:y,w:w,h:h,focused:ssKeyboardFocus===id},options);
    var identity=JSON.stringify([role,name,!!item.checked,!!item.disabled,target||'']);
    items.push(item);bindings.set(id,{item:item,action:action,identity:identity});
  }
  if(ssPopup){
    for(let b of SS_MENU_HB){
      let level=ssPopup.levels[b.depth],it=b.item;
      if(!level||b.depth<ssPopupFirstVisible()||(it&&level.items&&level.items[b.index]!==it))continue;
      let label=it?ssMenuLabel(it.label):b.back?'返回上级菜单':b.step>0?'向上滚动菜单':'向下滚动菜单';
      let branch=ssPopup.levels.slice(0,b.depth).map(function(l){return l.selected;}).join('/');
      let id='menu:'+ssPopup.serial+':'+branch+':'+(it?b.index:b.back?'back':'scroll'+b.step)+':'+label;
      add(id,'menuitem',label,b,function(kind){
        if(kind==='focus'){
          if(it){level.selected=b.index;ssPopup.levels.length=b.depth+1;repaintAll();}
          return;
        }
        if(it){if(it.children)ssPopupExpand(b);else ssPopupChoose(it);}
        else if(b.back){ssPopup.levels.pop();repaintAll();}
        else ssPopupScroll(b.depth,b.step);
      },{checked:!!(it&&it.checked),disabled:!!(it&&it.disabled),focused:!!it&&b.depth===ssPopup.levels.length-1&&level.selected===b.index},it&&it.command);
    }
    return {items:items,bindings:bindings};
  }
  if(!ssKeyboardAvailable())return {items:items,bindings:bindings};
  if(!fsMode){
    for(let b of HB_MENU){
      let menu=MENUS.find(function(m){return m[1]===b.root;});
      if(menu)add('topMenu:'+b.root,'menuitem',ssMenuLabel(menu[0]),b,function(){openMenu(b.root,b.mx,TBH);});
    }
    if(R.queue&&R.queue.w>0){
      for(let b of HB_TABS)add('tab:'+b.tab,'tab',b.tab==='lyrics'?'歌词':'播放队列',b,function(){ssSetRightPane(b.tab,true);},{checked:rightTab===b.tab});
      if(rightTab==='queue')for(let b of HB_Q){
        let idx=b.queueIndex===undefined?b.item:b.queueIndex,id='queue:'+ssQueueRowKey(b)+':'+idx+':'+b.track_id;
        add(id,'listitem',[b.next?'下一首':'',b.title||'未知曲目',b.artist].filter(Boolean).join('，'),b,function(){ssOpenQueueMenu(b,b.x0,b.y1);});
      }
    }
  }
  var status=fb.IsPlaying?(fb.IsPaused?'已暂停':'正在播放'):'已停止';
  var resume=ssState&&ssState.resume;
  var title=NP?npTitleStr:resume&&resume.title,artist=NP?npArtistStr:resume&&resume.artist;
  add('player:status','text',[status,title,artist].filter(Boolean).join('，'),{x0:0,y0:R.barY,x1:R.barInfoW,y1:H},null);
  var labels={prev:'上一首',next:'下一首',play:fb.IsPlaying&&!fb.IsPaused?'暂停':'播放',playback_mode:'播放模式，'+ssPlaybackModeIndicator().title,
    lyrics:'歌词',viz:'频谱',queue:'播放队列',fullscreen:fsMode?'退出全屏':'进入全屏',output:'音频输出',favorite:'收藏',later:'稍后听',preference:'智能随机偏好'};
  var personal=ssState&&ssState.personal||{};
  var trackKey=NP&&typeof ssTrackID==='function'?ssTrackID(NP):(ssState&&ssState.now_id)||[title,artist].join('/');
  for(let b of HB_CTRL){
    let check=b.act==='favorite'||b.act==='later';
    add('control:'+b.act,check?'checkbox':'button',labels[b.act],b,function(){doCtrl(b.act,b);},
      {checked:check&&(b.act==='favorite'?!!personal.now_favorite:!!personal.now_later)},check||b.act==='play'?trackKey:'');
  }
  if(fb.PlaybackLength>0)add('slider:seek','slider','播放进度（秒）',HB_SEEK,function(kind,value){fb.PlaybackTime=value;},
    {min:0,max:fb.PlaybackLength,value:Math.floor(fb.PlaybackTime),smallChange:5,largeChange:30},trackKey);
  if(HB_VOL)add('slider:volume','slider','音量（百分比）',HB_VOL,function(kind,value){fb.Volume=pos2vol(value/100);},
    {min:0,max:100,value:Math.round(vol2pos(fb.Volume)*100),smallChange:4,largeChange:10});
  return {items:items,bindings:bindings};
}
function ssPublishAccessibility(){
  if(!ssStarted||!W||!H)return;
  var tree=ssReaderTree(),identities=[];
  for(var binding of tree.bindings.values())identities.push(binding.identity);
  var signature=JSON.stringify([tree.items,identities]);
  if(signature===ssReaderSignature)return;
  ssReaderSignature=signature;
  ++ssReaderRevision;
  for(var [id,binding] of tree.bindings){
    var prior=ssReaderItems.get(id);
    // Geometry and time updates can overtake a request. Keep the first revision
    // of each uninterrupted action identity, including its target track.
    binding.since=prior&&prior.identity===binding.identity?prior.since:ssReaderRevision;
  }
  ssReaderItems=tree.bindings;
  ssSend('state',{theme_accessibility:{revision:ssReaderRevision,items:tree.items}});
}
function ssScheduleAccessibility(){
  if(!ssStarted||ssReaderTimer)return;
  ssReaderTimer=window.SetTimeout(function(){ssReaderTimer=0;ssPublishAccessibility();},160);
}
function ssAccessibilityAction(command){
  if(!command||!Number.isSafeInteger(command.serial)||command.serial<=ssReaderSerial)return;
  ssReaderSerial=command.serial;
  ssSend('state',{theme_accessibility_ack:command.serial});
  if(!Number.isSafeInteger(command.revision)||command.revision>ssReaderRevision)return;
  var previous=ssReaderItems.get(command.id),current=ssReaderTree().bindings.get(command.id);
  if(!current||!previous||command.revision<previous.since||current.identity!==previous.identity||current.item.disabled||!current.action)return;
  if(command.kind==='focus'){
    if(ssPopup)current.action('focus');
    else{ssKeyboardFocus=command.id;applyKeyMode();repaintAll();}
  }else if(command.kind==='invoke'&&current.item.role!=='slider')current.action('invoke');
  else if(command.kind==='setValue'&&current.item.role==='slider'&&Number.isFinite(command.value)){
    current.action('setValue',Math.max(current.item.min,Math.min(current.item.max,command.value)));
  }
}
