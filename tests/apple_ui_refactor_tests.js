const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','theme','verdant');
let passed=0,failed=0;
function test(name,fn){
  try{fn();passed++;console.log('PASS '+name);}
  catch(err){failed++;console.error('FAIL '+name+': '+(err&&err.message||err));}
}
function graphics(){
  return new Proxy({
    CalcTextWidth:(s,f)=>String(s||'').length*((f&&f.Size)||13)*0.6,
    CalcTextHeight:(s,f)=>((f&&f.Size)||13)*1.35,
    EstimateLineWrap:(s)=>[String(s||'')]
  },{get:(t,p)=>p in t?t[p]:()=>{}});
}
function context(){
  const sent=[],c={
    console,Date,Math,JSON,Set,Map,Array,Object,Number,String,Boolean,RegExp,Error,parseInt,parseFloat,isFinite,isNaN,
    UISCALE:1,W:1280,H:800,TBH:36,mx:-1,my:-1,fsMode:false,fsView:'default',view:'home',drag:null,
    window:{ID:1,GetProperty:(k,d)=>d,SetProperty(){},Repaint(){},RepaintRect(){},SetTimeout:()=>1,ClearTimeout(){},SetInterval:()=>1,ClearInterval(){},SetCursor(){}},
    utils:{IsKeyPressed:()=>false,ReadTextFile:()=>''},
    fb:{IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:0,ProfilePath:'',TitleFormat:fmt=>({EvalWithMetadb:h=>h[fmt]||''}),Exit(){}},
    gdi:{Font:(Name,Size,Style)=>({Name,Size,Style:Style||0,Height:Math.ceil(Size*1.3)}),CreateImage:(Width,Height)=>({Width,Height,GetGraphics:()=>graphics(),ReleaseGraphics(){},Dispose(){},ApplyMask(){}}),LoadSVG:()=>null},
    plman:{ActivePlaylist:0,PlaylistCount:0},
    UIWizard:null,
    ssState:{enabled:true,personal:{enabled:false,history_enabled:true},listening_stats:true,update:{current:'1.0.23',edition:'full',available:true,automatic:true,checking:false,phase:'',release:{version:'1.0.24'}}},
    ssSend:(op,payload)=>{sent.push({op,payload});return sent.length;},
    ssSetAppearance:mode=>{sent.push({op:'theme_appearance',payload:{mode}});},
    repaintAll(){},repaintMain(){},applyCaption(){},applyKeyMode(){},
    hv:()=>false,hit:(list,x,y)=>(list||[]).find(b=>x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1)||null,
    inRect:(x,y,b)=>!!b&&x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1,
    clampPx:(v,m)=>Math.max(0,Math.min(m,v)),
    ssBeginViewport:(k,g)=>({gr:g,finish(){}}),drawScrollbar(){},
    ssFillContinuousRect(){},ssStrokeContinuousRect(){},strokeRound(){},drawRounded(){},drawCover(){},
    ssLibraryReadingRect:r=>({x:r.x+24,w:r.w-48})
  };
  vm.createContext(c);
  const load=rel=>vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),c,{filename:rel});
  load('core/tokens.js');
  load('core/corners.js');
  return {c,load,sent};
}

test('redesigned macOS Settings page is named 设置 with category tabs and dispatches bridge v1 ops',()=>{
  const {c,load,sent}=context();
  const props={},cmds=[],labels=[];let outOpened=0,prefOpened=0;
  c.window.SetProperty=(k,v)=>{props[k]=v;};
  c.fb.RunMainMenuCommand=cmd=>{cmds.push(cmd);return true;};
  c.fb.GetOutputDevices=()=>JSON.stringify([{name:'Speakers',output_id:'o1',device_id:'d1',active:true}]);
  c.ssReducedMotion=false;c.WHEEL_PX=72;c.VOL_CEIL=0;
  load('data/output.js');
  c.ssShowOutputs=()=>{outOpened++;};c.ssOpen=()=>{prefOpened++;};
  load('views/settings.js');
  const g=graphics();
  const origTL=c.tL;
  c.tL=(gr,text,...rest)=>{labels.push(String(text));return origTL(gr,text,...rest);};

  c.view='playlist';
  c.ssOpenSettings(false);
  assert.equal(c.view,'settings');
  assert.equal(c.ssSettingsTab,'appearance','default open lands on appearance tab');
  assert.ok(c.ssSettingsOutputName.includes('Speakers'));

  const paint=(w=980,h=680)=>{labels.length=0;c.drawSettings(g,{x:260,y:40,w,h});};
  const click=(act,val)=>{
    const b=c.HB_SETTINGS.find(x=>x.act===act&&(val===undefined||x.val===val));
    assert.ok(b,'missing settings control: '+act+(val!==undefined?'='+val:''));
    assert.equal(c.ssSettingsClick((b.x0+b.x1)/2,(b.y0+b.y1)/2),true);
  };

  // Appearance tab (wide two-column)
  paint(980,680);
  assert.ok(labels.includes('设置'),'page heading is renamed to 设置');
  assert.ok(!labels.includes('参数选项'),'old title 参数选项 is removed');
  click('appearance-dark');
  click('toggle-reduced-motion');
  click('wheel-step',108);
  click('reset-layout');

  // Switch to Playback tab
  click('tab','playback');
  assert.equal(c.ssSettingsTab,'playback');
  paint(980,680);
  click('output-picker');
  click('playback-mode','1');
  click('open-preference');
  click('vol-ceil',-6);

  // Switch to Personal tab
  click('tab','personal');
  assert.equal(c.ssSettingsTab,'personal');
  paint(980,680);
  click('toggle-personal');
  click('toggle-stats');

  // Open updates directly via ssOpenSettings(true)
  c.ssOpenSettings(true);
  assert.equal(c.ssSettingsTab,'updates','update entry jumps directly to updates tab');
  paint(980,680);
  click('update-check');
  click('update-install');
  click('toggle-auto-update');

  // Switch to Advanced tab + verify compact layout (< 680px)
  click('tab','advanced');
  assert.equal(c.ssSettingsTab,'advanced');
  paint(520,640);
  const tabs=c.HB_SETTINGS.filter(b=>b.act==='tab');
  assert.equal(tabs.length,5,'all 5 category tabs remain reachable in compact layout');
  assert.ok(tabs.every(b=>b.x0>=260&&b.x1<=260+520),'compact tabs stay inside panel bounds');
  click('library-configure');
  click('native-settings');

  // Back button returns to previous view
  click('back');
  assert.equal(c.view,'playlist','back button restores originating view');

  assert.deepEqual(sent.map(s=>s.op),[
    'theme_appearance','reset_layout','playback_mode','personal_config','listening_stats_config',
    'update_check','update_check','update_install','update_config','settings'
  ]);
  assert.equal(sent[0].payload.appearance,'dark');
  assert.equal(sent[2].payload.order,1);
  assert.equal(sent[3].payload.enabled,true);
  assert.equal(sent[4].payload.enabled,false);
  assert.equal(sent[8].payload.automatic,false);
  assert.equal(c.ssReducedMotion,true);
  assert.equal(props['SmartShuffle: reduce motion'],true);
  assert.equal(c.WHEEL_PX,108);
  assert.equal(props['Scrolling: wheel step (px)'],108);
  assert.equal(c.VOL_CEIL,-6);
  assert.equal(props['Playback: output ceiling (dB below max)'],-6);
  assert.equal(outOpened,1);
  assert.equal(prefOpened,1);
  assert.deepEqual(cmds,['Library/Configure']);
});

test('file Preferences renames to 设置 and routes to in-theme Settings',()=>{
  const {c,load}=context();
  const opened=[];
  c.ssOpenSettings=check=>opened.push(!!check);
  c.ssMenuLabel=s=>s;
  load('ui/menus.js');
  const fileItems=c.ssRewriteMainMenuItems([{label:'参数选项',command:5},{label:'退出',command:6}],'file');
  assert.equal(fileItems[0].label,'设置','file menu item renamed to 设置');
  fileItems[0].run();
  const pbItems=c.ssRewriteMainMenuItems([{label:'随机偏好',children:[{label:'插件设置…',command:7},{label:'检查更新…',command:8}]}],'playback');
  pbItems[0].children[0].run();
  pbItems[0].children[1].run();
  assert.deepEqual(opened,[false,false,true]);
});

test('in-theme Track Info sheet caches metadata once and provides native properties fallback',()=>{
  const {c,load}=context();
  load('views/track_info.js');
  let nativeOpened=0;
  const handle={
    RawPath:'file://D:/music/test.flac',Path:'D:\\music\\test.flac',Length:215,FileSize:31457280,
    '%title%':'空の箱','%artist%':'トゲナシトゲアリ','%album%':'Girls Band Cry','%date%':'2024',
    '%tracknumber%':'02','%genre%':'Rock','%codec%':'FLAC','%bitrate%':'1024','%samplerate%':'48000',
    '%__bitspersample%':'24','%channels%':'stereo'
  };
  c.ssOpenTrackInfo(handle,()=>nativeOpened++);
  assert.ok(c.ssTrackInfo&&c.ssTrackInfo.title==='空の箱');
  assert.ok(c.ssTrackInfo.tech.includes('FLAC')&&c.ssTrackInfo.tech.includes('1024'));
  c.drawTrackInfo(graphics());
  const nativeBtn=c.HB_TRACK_INFO.find(b=>b.act==='native');
  const closeBtn=c.HB_TRACK_INFO.find(b=>b.act==='close');
  assert.ok(nativeBtn&&closeBtn,'track info exposes native editor and close buttons');
  assert.equal(c.ssTrackInfoClick((nativeBtn.x0+nativeBtn.x1)/2,(nativeBtn.y0+nativeBtn.y1)/2),true);
  assert.equal(nativeOpened,1);
  assert.equal(c.ssTrackInfo,null);
});

test('streamlined title bar exposes top-right appearance toggle and settings gear without breaking menu bar',()=>{
  const {c,load}=context();
  c.MENUS=[['文件','file'],['编辑','edit'],['视图','view'],['播放','playback'],['音乐库','library'],['帮助','help']];
  load('ui/chrome.js');
  c.drawTitleBar(graphics());
  assert.equal(c.HB_MENU.length,6);
  assert.ok(Array.isArray(c.HB_TOP_ACTIONS)&&c.HB_TOP_ACTIONS.length===2);
  assert.deepEqual(Array.from(c.HB_TOP_ACTIONS,b=>b.act),['appearance','settings']);
  assert.ok(c.HB_TOP_ACTIONS[0].x0>c.MENU_END,'top-right actions leave draggable caption gap after menus');
});

test('ClearType renders opaque text sharply while transparent overflow fades stay grayscale',()=>{
  const {c}=context();
  assert.equal(c.ssTextRenderingHint,5,'opaque text uses Windows ClearTypeGridFit');
  const hints=[];
  const g=graphics();g.SetTextRenderingHint=h=>hints.push(h);
  c.tL(g,'清晰文字',c.FONT.pl,c.COL.text,0,0,200,24);
  assert.equal(hints.at(-1),5,'direct opaque label uses ClearType');
  const offHints=[];
  c.gdi.CreateImage=(Width,Height)=>({Width,Height,GetGraphics:()=>Object.assign(graphics(),{SetTextRenderingHint:h=>offHints.push(h)}),ReleaseGraphics(){},Dispose(){}});
  c.ssDrawPaneLabels(g,()=>c.tL(g,'这是一段非常非常长会触发透明渐隐截断的歌曲标题文字内容',c.FONT.pl,c.COL.text,0,0,80,24));
  assert.equal(offHints.at(-1),3,'transparent fade bitmap uses grayscale AntiAliasGridFit to avoid black halos');
});

test('concentric capsules and Settings animations glide smoothly within 200ms and stop cleanly',()=>{
  const {c,load}=context();
  let now=1000,timers=new Map(),nextId=0,mainRepaints=0,fullRepaints=0,barRepaints=0,lastMs=0;
  const dirtyRects=[],ellipses=[];
  c.Date={now:()=>now};
  c.window.SetInterval=(fn,ms)=>{const id=++nextId;lastMs=ms;timers.set(id,fn);return id;};
  c.window.ClearInterval=id=>{timers.delete(id);};
  c.window.RepaintRect=(x,y,w,h)=>dirtyRects.push({x,y,w,h});
  c.repaintMain=scrollOnly=>{mainRepaints++;if(!scrollOnly)barRepaints++;};
  c.repaintAll=()=>{fullRepaints++;};
  c.blend=(a,b,t)=>t<.5?a:b;
  c.ssReducedMotion=false;c.WHEEL_PX=72;c.VOL_CEIL=0;
  const g=graphics();
  g.FillEllipse=(x,y,w,h,col)=>ellipses.push({x,y,w,h,col});
  c.ssSceneImage={Width:1280,Height:800,GetGraphics:()=>g,ReleaseGraphics(){}};
  c.dirtyAll=false;c.anyDirty=()=>false;c.ssModal=false;c.ssPopup=null;c.fsMode=false;
  load('views/settings.js');
  assert.equal(typeof c.ssFillCapsule,'function','true circular capsule primitive exists');
  c.ssOpenSettings(false);
  fullRepaints=0;mainRepaints=0;barRepaints=0;dirtyRects.length=0;
  c.drawSettings(g,{x:260,y:40,w:980,h:680});
  const tabBtn=c.HB_SETTINGS.find(b=>b.act==='tab'&&b.val==='personal');
  c.ssSettingsClick((tabBtn.x0+tabBtn.x1)/2,(tabBtn.y0+tabBtn.y1)/2);
  assert.equal(timers.size,1,'tab change starts one animation timer');
  assert.ok(lastMs<=10,'animation timer uses <=10ms cadence to avoid Windows 30fps quantization');
  assert.equal(fullRepaints,0,'tab switch uses main-pane repaint instead of full-window repaint');
  assert.equal(barRepaints,0,'Settings animation never forces bottom-bar redraw');
  now+=80;for(const fn of Array.from(timers.values()))fn();
  assert.ok(dirtyRects.length>0,'mid-animation uses localized dirty-rect RepaintRect instead of redrawing the entire page');
  assert.ok(dirtyRects.at(-1).w<300,'localized rail dirty rect stays much narrower than the whole main panel');
  assert.equal(c.ssPaintSettingsDamage(g),true,'fast-path painter services localized Settings damage directly');
  now+=160;for(const fn of Array.from(timers.values()))fn();
  assert.equal(timers.size,0,'animation timer stops automatically after <=200ms');

  // Async native toggle must glide immediately on click before C++ ssState ack arrives, with a pure circular knob
  c.drawSettings(g,{x:260,y:40,w:980,h:680});
  const swBtn=c.HB_SETTINGS.find(b=>b.act==='toggle-personal');
  assert.ok(swBtn,'personal toggle exists');
  dirtyRects.length=0;ellipses.length=0;mainRepaints=0;
  c.ssSettingsMouseDown((swBtn.x0+swBtn.x1)/2,(swBtn.y0+swBtn.y1)/2);
  assert.ok(c.ssSettingsDown&&c.ssSettingsDown.includes('toggle-personal'),'press records unique control id');
  c.ssSettingsClick((swBtn.x0+swBtn.x1)/2,(swBtn.y0+swBtn.y1)/2);
  assert.equal(c.ssState.personal.enabled,false,'native ssState has not acknowledged yet');
  assert.equal(mainRepaints,0,'toggle click paints via localized dirty rect without full Settings page redraw');
  assert.ok(dirtyRects.length>0&&dirtyRects.at(-1).w<80&&dirtyRects.at(-1).h<50,'toggle dirty rect covers only the switch');
  now+=60;
  const mid=c.ssSettingsAnimVal('sw-personal',0);
  assert.ok(mid>0.3,'async toggle animates smoothly toward optimistic target even before native ack (got '+mid+')');
  for(const fn of Array.from(timers.values()))fn();
  assert.equal(c.ssPaintSettingsDamage(g),true,'toggle mid-flight frame paints on fast path');
  const whiteKnobs=ellipses.filter(e=>e.col===c.RGB(255,255,255));
  assert.ok(whiteKnobs.length>0,'toggle knob draws as a crisp native FillEllipse circle');
  assert.ok(whiteKnobs.every(e=>Math.abs(e.w-e.h)<0.01),'toggle knob stays a pure circle with zero deformation');
  now+=180;for(const fn of Array.from(timers.values()))fn();
  assert.equal(timers.size,0,'toggle animation stops cleanly <=200ms');

  // Turning Reduced Motion ON immediately stops all timers and plays ZERO animation
  const appBtn=c.HB_SETTINGS.find(b=>b.act==='tab'&&b.val==='appearance');
  c.ssSettingsClick((appBtn.x0+appBtn.x1)/2,(appBtn.y0+appBtn.y1)/2);
  now+=220;for(const fn of Array.from(timers.values()))fn();
  c.drawSettings(g,{x:260,y:40,w:980,h:680});
  const redBtn=c.HB_SETTINGS.find(b=>b.act==='toggle-reduced-motion');
  c.ssSettingsClick((redBtn.x0+redBtn.x1)/2,(redBtn.y0+redBtn.y1)/2);
  assert.equal(c.ssReducedMotion,true,'reduced motion toggled on');
  assert.equal(timers.size,0,'turning reduced motion ON immediately snaps with zero animation timer');
  const pbBtn=c.HB_SETTINGS.find(b=>b.act==='tab'&&b.val==='playback');
  c.ssSettingsClick((pbBtn.x0+pbBtn.x1)/2,(pbBtn.y0+pbBtn.y1)/2);
  assert.equal(timers.size,0,'reduced motion skips all transition timers');
});

test('track context menu merges opposite personal toggles by state and exposes top-level local file delete',()=>{
  const {c,load}=context();
  const sent=[];let openedMenu=null,recycled='';
  c.ssSend=(op,args)=>{sent.push({op,...args});return 'req-1';};
  c.ssTrackID=h=>(h.RawPath||h.Path)+'|'+(h.SubSong||0);
  c.ssPersonalEnabled=()=>true;
  c.ssPersonalFlags=Object.create(null);
  c.ssPersonalFlag=id=>c.ssPersonalFlags[id]||{favorite:false,later:false};
  c.ssPersonalSet=(kind,tracks,value)=>sent.push({op:'personal_set',kind,tracks:[...tracks],value});
  c.canEditPl=()=>false;c.isHiddenPl=()=>false;c.ssPlaylistInfo=()=>null;
  c.ssSetContextTargets=()=>{};c.ssOpenNativeMenu=(kind,args,x,y,extra)=>{openedMenu={kind,args,extra};};
  c.ssRecyclePrepare=id=>{recycled=id;};
  c.view='songs';c.R={main:{x:0,y:0,w:800,h:400}};
  c.songsTracks=[{h:{Path:'file://a.flac',SubSong:0}},{h:{Path:'file://b.flac',SubSong:0}}];
  c.HB_TR=[{songs:true,ti:0,x0:0,x1:800,y0:0,y1:48},{songs:true,ti:1,x0:0,x1:800,y0:48,y1:96}];
  c.HB_PL=[];c.HB_Q=[];c.utils={IsKeyPressed:()=>false};
  load('ui/selection.js');load('data/selection_host.js');load('ui/menus.js');
  c.ssOpenNativeMenu=(kind,args,x,y,extra)=>{openedMenu={kind,args,extra};};

  // Unfavorited & not in later -> shows 收藏 + 添加到稍后听 (never both opposite actions)
  c.ssBatchTrackMenu(c.HB_TR[0],100,20);
  let labels=openedMenu.extra.filter(i=>!i.separator).map(i=>i.label);
  assert.ok(labels.includes('收藏')&&!labels.includes('取消收藏'),'unfavorited track shows 收藏 only');
  assert.ok(labels.includes('添加到稍后听')&&!labels.includes('从稍后听移除'),'track not in later shows 添加到稍后听 only');
  openedMenu.extra.find(i=>i.label==='收藏').run();
  assert.deepEqual(sent.at(-1),{op:'personal_set',kind:'favorites',tracks:['file://a.flac|0'],value:true});

  // Favorited & in later -> flips to 取消收藏 + 从稍后听移除
  c.ssPersonalFlags['file://a.flac|0']={favorite:true,later:true};
  c.ssBatchTrackMenu(c.HB_TR[0],100,20);
  labels=openedMenu.extra.filter(i=>!i.separator).map(i=>i.label);
  assert.ok(labels.includes('取消收藏')&&!labels.includes('收藏'),'favorited track shows 取消收藏 only');
  assert.ok(labels.includes('从稍后听移除')&&!labels.includes('添加到稍后听'),'track in later shows 从稍后听移除 only');
  openedMenu.extra.find(i=>i.label==='取消收藏').run();
  assert.deepEqual(sent.at(-1),{op:'personal_set',kind:'favorites',tracks:['file://a.flac|0'],value:false});

  // Top-level local file delete promoted directly on track context menu
  c.ssPopup={request:'req-menu',context:true,extra:openedMenu.extra,levels:[{items:[],scroll:0,selected:-1}]};
  c.ssAcceptMenu({id:'req-menu',tracks:['file://a.flac|0']},{response:{menu:{token:'tok-1',track_id:'file://a.flac|0',items:[{label:'播放',command:1},{label:'属性',command:2}]}}});
  const topItems=c.ssPopup.levels[0].items;
  const delItem=topItems.find(i=>i&&i.label==='删除本地文件…');
  assert.ok(delItem&&delItem.danger===true,'删除本地文件… is exposed directly on top-level track context menu');
  delItem.run();
  assert.equal(recycled,'file://a.flac|0','clicking 删除本地文件… prepares native recycle confirmation');
});

test('Mac traffic-light symbols match circle parity across DPI scales and cold-start resume exposes full bar controls',()=>{
  const {c,load}=context();
  const drawn=[];
  c.hv=()=>true;c.drawIcon=(g,name,col,x,y,w,h,sz)=>drawn.push({name,x,y,w,h,sz});
  load('ui/chrome.js');
  for(const scale of [1,1.25,1.5,1.75,2]){
    drawn.length=0;c.UISCALE=scale;c.TBH=Math.round(44*scale);
    c.drawWindowControls(graphics());
    assert.equal(drawn.length,3);
    for(const item of drawn){
      assert.equal((item.w-item.sz)%2,0,'exact integer centering margin at UISCALE='+scale+' ('+item.w+' vs '+item.sz+')');
    }
  }
  // Vector traffic-light glyphs share exact (x + w/2, y + h/2) center with FillEllipse
  const v=context(),lines=[],polys=[];
  const vg=Object.assign(graphics(),{
    DrawLine:(x1,y1,x2,y2)=>lines.push({x1,y1,x2,y2}),
    FillPolygon:(col,mode,pts)=>polys.push([...pts])
  });
  v.c.drawIcon(vg,'windowClose',1,10,16,12,12,8);
  assert.equal(lines.length,2,'close draws two diagonals');
  for(const l of lines){assert.ok(Math.abs((l.x1+l.x2)/2-16)<1e-6&&Math.abs((l.y1+l.y2)/2-22)<1e-6,'close diagonals centered exactly on circle');}
  lines.length=0;
  v.c.drawIcon(vg,'windowMinimize',1,10,16,12,12,8);
  assert.equal(lines.length,1);
  assert.ok(Math.abs((lines[0].x1+lines[0].x2)/2-16)<1e-6&&Math.abs(lines[0].y1-22)<1e-6,'minimize line centered exactly on circle');
  v.c.drawIcon(vg,'windowMaximize',1,10,16,12,12,8);
  assert.equal(polys.length,2,'maximize draws symmetric opposing triangles');
  const xs=[...polys[0].filter((_,i)=>i%2===0),...polys[1].filter((_,i)=>i%2===0)];
  const ys=[...polys[0].filter((_,i)=>i%2===1),...polys[1].filter((_,i)=>i%2===1)];
  assert.ok(Math.abs((Math.min(...xs)+Math.max(...xs))/2-16)<1e-6&&Math.abs((Math.min(...ys)+Math.max(...ys))/2-22)<1e-6,'maximize triangles centered exactly on circle');

  // Cold-start resume song (NP=null, ssState.resume present) exposes seek rail, heart & bookmark immediately
  const h=context(),s=h.c,sent=[];
  Object.assign(s,{
    W:1200,H:800,M:{barH:96,gap:8},R:{barY:704,barInfoW:340,barToolsW:320},NP:null,npTitleStr:'',npArtistStr:'',pbShuffle:false,drag:null,fsMode:false,vol2pos:()=>.5,ssOutputError:'',ssError:'',
    fb:{IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:0},
    ssState:{resume:{id:'file://song.flac|0',title:'上次歌曲',artist:'测试歌手',duration:240,seconds:60,playlist:'pl-1',item:2},
      playlists:[{index:0,guid:'pl-1',name:'我的歌单'}],personal:{enabled:true}},
    ssPersonalFlags:{'file://song.flac|0':{favorite:true,later:false}},
    ssSend:(op,args)=>sent.push({op,...args}),drawCover(){},ssDrawPersonalHeart(){},ssDrawFooterTools(){},
    ssFooterToolLayout:()=>({modeLeft:820}),ssCatalogHandle:()=>null,getItems:()=>null,isHiddenPl:()=>false
  });
  h.load('core/util.js');h.load('data/personal.js');h.load('views/bar.js');
  s.drawBar(graphics());
  assert.ok(s.HB_SEEK,'seek rail stays interactive on cold-start resume track');
  assert.ok(s.HB_CTRL.some(b=>b.act==='favorite')&&s.HB_CTRL.some(b=>b.act==='later'),'favorite & later controls appear immediately on cold-start resume track');
  s.ssPersonalNow('favorites');
  assert.equal(sent.at(-1).op,'personal_set');
  assert.deepEqual(Array.from(sent.at(-1).tracks),['file://song.flac|0']);
});

console.log(passed+' passed, '+failed+' failed');
if(failed)process.exitCode=1;
