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

test('in-theme macOS Settings page renders grouped cards and dispatches bridge v1 ops',()=>{
  const {c,load,sent}=context();
  const props={},cmds=[];let outOpened=0,prefOpened=0;
  c.window.SetProperty=(k,v)=>{props[k]=v;};
  c.fb.RunMainMenuCommand=cmd=>{cmds.push(cmd);return true;};
  c.fb.GetOutputDevices=()=>JSON.stringify([{name:'Speakers',output_id:'o1',device_id:'d1',active:true}]);
  c.ssReducedMotion=false;c.WHEEL_PX=72;c.VOL_CEIL=0;
  load('data/output.js');
  c.ssShowOutputs=()=>{outOpened++;};c.ssOpen=()=>{prefOpened++;};
  load('views/settings.js');
  const g=graphics();
  c.ssOpenSettings(false);
  assert.equal(c.view,'settings');
  assert.ok(c.ssSettingsOutputName.includes('Speakers'));
  c.drawSettings(g,{x:260,y:40,w:980,h:1200});
  const click=(act,val)=>{
    const b=c.HB_SETTINGS.find(x=>x.act===act&&(val===undefined||x.val===val));
    assert.ok(b,'missing settings control: '+act+(val!==undefined?'='+val:''));
    assert.equal(c.ssSettingsClick((b.x0+b.x1)/2,(b.y0+b.y1)/2),true);
  };
  click('appearance-dark');
  click('toggle-reduced-motion');
  click('wheel-step',108);
  click('reset-layout');
  click('output-picker');
  click('playback-mode','1');
  click('open-preference');
  click('vol-ceil',-6);
  click('toggle-personal');
  click('toggle-stats');
  click('update-check');
  click('update-install');
  click('toggle-auto-update');
  click('library-configure');
  click('native-settings');
  assert.deepEqual(sent.map(s=>s.op),[
    'theme_appearance','reset_layout','playback_mode','personal_config','listening_stats_config',
    'update_check','update_install','update_config','settings'
  ]);
  assert.equal(sent[0].payload.appearance,'dark','theme_appearance uses bridge v1 appearance key');
  assert.equal(sent[2].payload.order,1);
  assert.equal(sent[3].payload.enabled,true);
  assert.equal(sent[4].payload.enabled,false);
  assert.equal(sent[7].payload.automatic,false);
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

test('file Preferences and playback plugin menu entries route to in-theme Preferences',()=>{
  const {c,load}=context();
  const opened=[];
  c.ssOpenSettings=check=>opened.push(!!check);
  c.ssMenuLabel=s=>s;
  load('ui/menus.js');
  const fileItems=c.ssRewriteMainMenuItems([{label:'参数选项',command:5},{label:'退出',command:6}],'file');
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

console.log(passed+' passed, '+failed+' failed');
if(failed)process.exitCode=1;
