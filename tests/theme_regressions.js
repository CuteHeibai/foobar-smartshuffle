'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name);throw e;}}
function harness(){
  let paints=0,next=0,now=Date.now();const timers=new Map(),writes=[];
  const c={console,Date:{now:()=>now},Math,Number,JSON,isFinite,UISCALE:1,W:1100,H:740,TBH:32,CAPBW:46,
    window:{Width:1100,Height:740,ID:123,Repaint(){paints++;},RepaintRect(){paints++;},SetTimeout(fn){timers.set(++next,fn);return next;},ClearTimeout(id){timers.delete(id);},SetInterval(){return 1;},ClearInterval(){}},
    fb:{ProfilePath:'P:\\',IsPlaying:false},plman:{ActivePlaylist:0},utils:{WriteTextFile(p,t){writes.push(JSON.parse(t));return true;}},
    repaintAll(){paints++;},applyKeyMode(){},pbShuffle:true,fsMode:false,ssLyricVisible:true,confirmDel:null,
    RGB:(r,g,b)=>(0xff000000|(r<<16)|(g<<8)|b),RGBA:(r,g,b,a)=>((a<<24)|(r<<16)|(g<<8)|b),
    ssInk:a=>((a<<24)|0xffffff),ssAccent:a=>((a<<24)|0x1ed760),ssAlpha:(c,a)=>((a<<24)|(c&0xffffff)),
    COL:{base:1,black:2,text:3,text2:4,green:5,line:6},FONT:{},M:{radius:10,barH:96},R:{queue:{x:800,y:40,w:290,h:600}},
    panelBg(){},roundBottom(){},tL(){},tC(){},repaintBar(){},repaintQueue(){},ssHideLyrics(){},ssSyncLyricPanel(){},
    drawIcon(){},drawCover(){},vol2pos(){return 0;},clamp01:x=>x,fmtTime(){return '';},tR(){},
    hit:(rows,x,y)=>rows.find(r=>x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1)||null,
  };vm.createContext(c);
  function load(file){const p=path.join(root,file);if(fs.existsSync(p))vm.runInContext(fs.readFileSync(p,'utf8'),c);}
  load('data/smartshuffle.js');load('ui/motion.js');load('ui/menus.js');load('ui/layout.js');load('ui/files.js');load('ui/hover.js');load('ui/selection.js');load('data/selection_host.js');
  return {c,load,writes,paints:()=>paints,advance(ms){now+=ms;},flush(){now+=200;const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
test('lyrics are the initial right pane and its first tab',()=>{
  const h=harness(),c=h.c;let app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
  assert.equal(c.rightTab,'lyrics');c.R={queue:{x:800,y:40,w:290,h:600}};c.ssLyricVisible=true;
  h.load('views/queue.js');c.drawQueue({FillSolidRect(){}});assert.equal(c.HB_TABS[0].tab,'lyrics');
});
test('rapid pointer events update the ball immediately and schedule at most one frame',()=>{
  const h=harness(),c=h.c;c.ssModal=true;c.ssDragging=true;
  for(let i=0;i<100;i++)c.ssSetDraft(i/100,.4);
  assert.equal(c.ssDraft.x,.99);assert.ok(h.paints()<=1,'pointer events must not redraw the full player each time');
  h.flush();assert.ok(h.paints()<=2);
});
test('track right-click retains plugin context commands even in locked playlists',()=>{
  const h=harness(),c=h.c;c.plman={IsPlaylistLocked:()=>true,GetPlaylistName:()=>'',IsAutoPlaylist:()=>true};
  h.load('data/playlist_edit.js');assert.equal(c.openTrackMenu(2,4,10,20),true);
  assert.equal(h.writes.at(-1).op,'menu_open');assert.equal(h.writes.at(-1).kind,'context');
  assert.equal(h.writes.at(-1).playlist,2);assert.equal(h.writes.at(-1).item,4);
});
test('playback modes and preference share one menu',()=>{
  const h=harness(),c=h.c;c.ssState={enabled:true,orders:[{index:0,name:'默认'},{index:1,name:'列表循环'},{index:2,name:'单曲循环'},{index:4,name:'随机'}]};
  assert.equal(typeof c.ssShowPlaybackModes,'function');c.ssShowPlaybackModes(100,200);
  const rows=c.ssPopup.levels[0].items;
  assert.ok(rows.some(r=>r.label==='智能随机（每轮全覆盖）'));
  assert.ok(rows.some(r=>r.label==='调整随机偏好…'));
  assert.ok(rows.some(r=>r.label==='列表循环'));
  c.ssPopupChoose(rows.find(r=>r.label==='列表循环'));
  assert.equal(h.writes.at(-1).op,'playback_mode');assert.equal(h.writes.at(-1).order,1);
});
test('output picker uses themed rows and changes only explicit different devices',()=>{
  const h=harness(),c=h.c,changes=[];h.load('data/output.js');
  c.window.CreatePopupMenu=()=>{throw Error('native light popup must not be opened');};
  c.fb.GetOutputDevices=()=>JSON.stringify([{name:'Current',active:true,output_id:'a',device_id:'1'},{name:'Other',output_id:'b',device_id:'2'}]);
  c.fb.SetOutputDevice=(...args)=>changes.push(args);c.ssShowOutputs(10,20);
  assert.equal(changes.length,0);c.ssPopupChoose(c.ssPopup.levels[0].items[1]);assert.deepEqual(changes,[['b','2']]);
});
test('preference drag frames reuse one dimmed background instead of repainting the library',()=>{
  const h=harness(),c=h.c;let base=0,modal=0;
  const graphics={FillSolidRect(){},DrawImage(){},SetSmoothingMode(){},SetInterpolationMode(){}};c.gdi={CreateImage(){return {GetGraphics:()=>graphics,ReleaseGraphics(){},Dispose(){}};}};
  c.ssDrawBase=()=>base++;c.drawPreference=()=>modal++;c.ssModal=true;
  const target={DrawImage(){}};for(let i=0;i<60;i++)c.ssPaintModal(target);
  assert.equal(base,1);assert.equal(modal,1);c.W++;c.ssPaintModal(target);assert.equal(base,2);
});
test('gradient is cached and the glass ball uses translucent trail layers',()=>{
  const h=harness(),c=h.c;let gradients=0;const alpha=[];
  c.gdi={CreateImage(){return {GetGraphics:()=>({FillGradRect(){gradients++;}}),ReleaseGraphics(){},Dispose(){}};}};
  h.load('views/preference.js');c.ssGradientGrid(200);const once=gradients;c.ssGradientGrid(200);assert.equal(gradients,once);assert.ok(once>1);
  c.ssDraft={x:.4,y:.2};c.ssTrail=[{x:0,y:0,time:Date.now()}];
  c.ssDrawGlassBall({FillEllipse(x,y,w,h,col){alpha.push((col>>>24)&255);},DrawEllipse(){},DrawLine(){}},10,10,200);
  assert.ok(alpha.length>=4);assert.ok(alpha.every(a=>a>0&&a<255));
});
test('native submenu response retains hierarchy, disabled state and exact command token',()=>{
  const h=harness(),c=h.c;c.ssOpenNativeMenu('main',{root:'file'},0,10);const request=h.writes.at(-1);
  c.ssAcceptState({version:1,request_id:request.id,response:{ok:true,menu:{token:'native-7',items:[{label:'Plugin',children:[{label:'Action',command:42}]}]}}});
  assert.equal(c.ssPopup.levels[0].items[0].children[0].command,42);
  c.ssPopupKey(40);c.ssPopupKey(39);c.ssPopupKey(40);c.ssPopupKey(13);
  assert.equal(h.writes.at(-1).op,'menu_execute');assert.equal(h.writes.at(-1).token,'native-7');assert.equal(h.writes.at(-1).command,42);
});
test('default geometry occupies forty percent on laptop, desktop, ultrawide and portrait monitors',()=>{
  const {c}=harness();
  for(const [width,height] of [[1280,680],[1920,1040],[2560,1400],[3840,2080],[5120,1400],[1080,1880]]){
    c.ssState={display:{work_width:width,work_height:height}};
    const size=c.ssDefaultWindowSize();
    assert.ok(Math.abs(size.width*size.height/(width*height)-.4)<.002);
    assert.ok(size.width<=width*.94+1&&size.height<=height*.94+1);
    if(width>height)assert.ok(size.width/size.height>=1.45&&size.width/size.height<=1.86);
  }
  c.ssState=null;assert.equal(c.ssDefaultWindowSize(),null);
  for(const width of [0,-1,NaN,Infinity]){c.ssState={display:{work_width:width,work_height:1040}};assert.equal(c.ssDefaultWindowSize(),null);}
});
test('initial proportional window waits for monitor data and later manual sizes are retained',()=>{
  const h=harness(),c=h.c,props=new Map(),sizes=[];let restores=0;
  c.window.GetProperty=(key,dflt)=>props.has(key)?props.get(key):dflt;
  c.window.SetProperty=(key,value)=>props.set(key,value);
  const wizard={FrameStyle:0,SetCaptionAreaSize(){},ExitMaximize(){restores++;},SetWindowSize(w,h){sizes.push([w,h]);}};
  c.ActiveXObject=function(){return wizard;};h.load('ui/chrome.js');
  assert.equal(c.ssConfigureChrome(),true);assert.deepEqual(sizes,[]);
  c.ssAcceptState({version:1,display:{work_width:2560,work_height:1400}});
  const size=c.ssDefaultWindowSize();assert.deepEqual(sizes,[[size.width,size.height]]);
  c.ssConfigureChrome();assert.equal(sizes.length,1);assert.equal(restores,1);
});
test('proportional restore centers on a secondary monitor with negative coordinates',()=>{
  const {c}=layoutHarness(),moves=[];
  c.UIWizard={ExitMaximize(){},SetWindowSize(){},SetWindowPosition(x,y){moves.push([x,y]);}};
  c.ssState={display:{work_left:-2560,work_top:-100,work_width:2560,work_height:1400}};
  c.ssApplyDefaultWindow(true);const size=c.ssDefaultWindowSize();
  assert.deepEqual(moves,[[Math.round(-2560+(2560-size.width)/2),Math.round(-100+(1400-size.height)/2)]]);
});
test('stale open counter at theme startup does not cover the default lyrics',()=>{
  const h=harness(),c=h.c;c.utils.ReadTextFile=()=>JSON.stringify({version:1,pid:1,ui_open:9});
  c.ssStart();assert.equal(c.ssModal,false);assert.equal(c.ssSeenOpen,9);
});
function layoutHarness(){
  const h=harness(),c=h.c,props=new Map();
  c.window.GetProperty=(key,dflt)=>props.has(key)?props.get(key):dflt;c.window.SetProperty=(key,value)=>props.set(key,value);
  c.W=1180;c.H=780;c.M={gap:8,navW:210,queueW:350,barH:96,navTopH:84};c.R={};c.UIWizard=null;c.applyCaption=()=>{};
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  vm.runInContext(app.slice(app.indexOf('function layout(){'),app.indexOf('// bitmaps are keyed')),c);
  c.layout();return {h,c,props};
}
test('all three columns and footer regions keep content space at different window widths',()=>{
  const {c}=layoutHarness();c.ssWidths={nav:470,right:520,info:430,tools:450};
  for(const w of [800,1180,1800]){c.W=w;c.layout();assert.ok(c.R.main.w>=Math.min(330,w*.36)-2);assert.ok(c.R.navW>0&&c.R.queueW>0);assert.ok(w-c.R.barInfoW-c.R.barToolsW>=Math.min(310,w*.34)-2);}
});

test('legacy footer widths cannot override the responsive footer layout',()=>{
  const {h,c}=layoutHarness();
  for(const width of [800,1180,1800]){
    c.W=width;c.ssWidths={nav:210,right:350};c.layout();
    const expected=[c.R.barInfoW,c.R.barToolsW];
    c.window.GetProperty=(key,dflt)=>key==='SmartShuffle: track info width'?640:key==='SmartShuffle: output controls width'?620:dflt;
    h.load('ui/layout.js');c.layout();
    assert.deepEqual([c.R.barInfoW,c.R.barToolsW],expected,'saved footer widths must no longer change playback-bar geometry');
  }
});

test('footer divider positions no longer capture drags while both upper dividers do',()=>{
  const {c,props}=layoutHarness();
  assert.equal(c.ssSplitAt(c.R.main.x-c.M.gap/2,c.R.top.y+30),'nav');
  assert.equal(c.ssSplitAt(c.R.queue.x-c.M.gap/2,c.R.top.y+30),'right');
  for(const x of [c.R.barInfoW,c.W-c.R.barToolsW]){
    assert.equal(c.ssSplitAt(x,c.R.barY+30),'');
    assert.equal(c.ssResizeBegin(x,c.R.barY+30),false);
  }
  assert.equal(c.ssResizing,null);assert.equal(props.size,0);
});
test('splitter drags coalesce geometry updates and save the constrained width',()=>{
  const {h,c,props}=layoutHarness();let hidden=0;c.ssHideLyrics=()=>hidden++;
  assert.equal(c.ssResizeBegin(c.R.main.x-c.M.gap/2,120),true);
  for(let i=0;i<100;i++)c.ssResizeMove(260+i,120);
  assert.equal(c.R.navW,210);h.flush();assert.ok(c.R.navW>300);assert.equal(hidden,1);
  c.ssResizeEnd(359,120);assert.equal(props.get(c.SS_WIDTH_KEYS.nav),c.R.navW);assert.equal(c.ssResizing,null);
  c.ssModal=true;assert.equal(c.ssResizeBegin(c.R.main.x-c.M.gap/2,120),false);
});
test('settings reset clears every width and restores the window without changing playback state',()=>{
  const {c,props}=layoutHarness(),sizes=[];c.ssWidths={nav:300,right:400,info:280,tools:360};
  c.UIWizard={ExitMaximize(){},SetWindowSize(w,h){sizes.push([w,h]);},SetCaptionAreaSize(){}};
  c.ssState={display:{work_width:1920,work_height:1040},now_id:'song',point:{x:.6,y:-.5},remaining:[{id:'next'}],enabled:true};const before=JSON.stringify(c.ssState);
  c.rightTab='queue';
  c.ssResetLayout();for(const key of Object.keys(c.SS_WIDTH_KEYS)){assert.equal(c.ssWidths[key],0);assert.equal(props.get(c.SS_WIDTH_KEYS[key]),0);}
  const size=c.ssDefaultWindowSize();assert.deepEqual(sizes,[[size.width,size.height]]);assert.equal(c.rightTab,'lyrics');assert.equal(JSON.stringify(c.ssState),before);
});
test('reset uses the current monitor while repeated state updates preserve a manual resize',()=>{
  const {c}=layoutHarness(),sizes=[];
  c.UIWizard={ExitMaximize(){},SetWindowSize(w,h){sizes.push([w,h]);},SetCaptionAreaSize(){}};
  c.ssAcceptState({version:1,display:{work_width:1920,work_height:1040}});
  c.ssAcceptState({version:1,display:{work_width:1080,work_height:1880}});
  assert.equal(sizes.length,1);c.ssResetLayout();assert.equal(sizes.length,2);
  assert.ok(Math.abs(sizes[1][0]*sizes[1][1]/(1080*1880)-.4)<.002);
});
test('persisted native layout reset is consumed once across state refreshes',()=>{
  const {c}=layoutHarness();let resets=0;c.ssResetLayout=()=>resets++;
  c.ssAcceptState({version:1,ui_layout_reset:3});c.ssAcceptState({version:1,ui_layout_reset:3});assert.equal(resets,1);
  c.ssAcceptState({version:1,ui_layout_reset:4});assert.equal(resets,2);
});
test('opening native menus sends their request before any separate lyrics-hide round trip',()=>{
  const h=harness(),c=h.c;c.ssHideLyrics=()=>c.ssSend('lyrics_panel',{visible:false});
  c.ssOpenNativeMenu('main',{root:'file'},12,32);
  assert.equal(h.writes[0].op,'menu_open');assert.equal(c.ssPopup.nativeMenu,true);assert.ok(c.ssMenuPollTimer);
});
test('menu opening, nested hover and closing reuse the displayed scene without rebuilding the library',()=>{
  const h=harness(),c=h.c;let base=0,draws=0,disposed=0;
  c.ssSceneImage={Dispose(){disposed++;}};c.ssSceneW=c.W;c.ssSceneH=c.H;
  c.ssDrawBase=()=>base++;c.drawTitleBar=()=>{};c.ssDrawPopup=()=>draws++;
  c.ssShowPopup([{label:'File'}],12,32,'',true);
  for(let i=0;i<10;i++)c.ssPaintPopup({DrawImage(){}});
  assert.equal(base,0);assert.equal(draws,10);c.ssClosePopup();assert.equal(c.ssPopupRestore,true);assert.equal(disposed,0);
});
test('top menus remain open during pointer travel until explicitly dismissed',()=>{
  const h=harness(),c=h.c;c.ssShowPopup([{label:'A'}],10,40);c.ssPopup.root='file';
  c.ssPopup.levels[0].rect={x:10,y:40,w:230,h:100};c.ssPopup.levels.push({items:[],rect:{x:244,y:40,w:230,h:100}});
  c.ssPopupMove(242,60);assert.equal(c.ssMenuLeaveTimer,0);c.ssPopupMove(250,60);
  h.flush();assert.ok(c.ssPopup);c.ssPopupMove(600,300);h.flush();assert.ok(c.ssPopup);c.ssPopupKey(27);assert.equal(c.ssPopup,null);
});
test('window resizing scales real font sizes, row heights and covers while retaining custom widths',()=>{
  const {h,c}=layoutHarness();c.gdi={Font:(name,size,style)=>({name,size,style})};h.load('core/tokens.js');
  c.ssWidths.nav=290;c.W=850;c.H=600;c.layout();const small={font:c.FONT.rowTitle.size,row:c.M.rowH,cover:c.M.artSz,scale:c.ssDensity};
  c.W=1800;c.H=1100;c.layout();assert.ok(c.FONT.rowTitle.size>small.font);assert.ok(c.M.rowH>small.row);assert.ok(c.M.artSz>small.cover);assert.ok(c.ssDensity>small.scale);
  assert.equal(c.ssWidths.nav,290);assert.equal(c.R.navW,290);
});
test('recycle action requires a matching preparation and explicit confirmation; cancel never applies',()=>{
  const h=harness(),c=h.c;c.ssRecyclePrepare('file://D:/music/song.flac|0');
  assert.equal(h.writes[0].op,'recycle_prepare');c.ssRecycleConfirm();assert.equal(h.writes.length,1);
  const id=h.writes[0].id;c.ssAcceptState({version:1,request_id:id,response:{ok:true,recycle:{token:'file-identity',path:'D:/music/song.flac'}}});
  assert.equal(h.writes.length,1);c.ssRecycleCancel();assert.equal(h.writes.at(-1).op,'recycle_cancel');assert.equal(c.confirmDel,null);assert.ok(!h.writes.some(q=>q.op==='recycle_apply'));
});
test('confirmed recycle sends only the native identity token and keeps the dialog until acknowledgement',()=>{
  const h=harness(),c=h.c;c.ssRecyclePrepare('file://D:/music/song.flac|0');const id=h.writes[0].id;
  c.ssAcceptState({version:1,request_id:id,response:{ok:true,recycle:{token:'exact-token',path:'D:/music/song.flac'}}});
  c.ssRecycleConfirm();assert.equal(h.writes.at(-1).op,'recycle_apply');assert.equal(h.writes.at(-1).token,'exact-token');assert.ok(!('path' in h.writes.at(-1)));assert.ok(c.confirmDel);
  c.ssAcceptState({version:1,request_id:h.writes.at(-1).id,response:{ok:true,recycled:true}});assert.equal(c.confirmDel,null);
});


test('4K song hover coalesces 100 moves and restores only the old and new rows',()=>{
  const h=harness(),c=h.c,blits=[],invalid=[];c.W=3840;c.H=2160;
  c.mx=110;c.my=110;c.R.main={x:80,y:40,w:2900,h:1950};c.HB_Q=[];
  c.HB_TR=[{x0:100,y0:100,x1:2800,y1:160},{x0:100,y0:160,x1:2800,y1:220}];
  c.window.RepaintRect=(...r)=>invalid.push(r);c.ssSceneImage={};c.ssSceneW=c.W;c.ssSceneH=c.H;
  c.drawMain=()=>{throw Error('hover must never rebuild song list');};
  const gr={DrawImage(...r){blits.push(r);},FillRoundRect(){},FillSolidRect(){}};
  c.ssPaintRowHover(gr,false);blits.length=0;
  for(let i=0;i<100;i++){c.my=170;c.ssRequestRowHover();}
  assert.equal(invalid.length,0);h.flush();assert.equal(invalid.length,2);
  c.ssPaintRowHover(gr,true);assert.equal(blits.length,2);
  assert.ok(blits.every(r=>r[3]===2700&&r[4]===60),'copies must be row-sized at 4K');
  c.mx=c.my=-1;c.ssRequestRowHover();h.flush();c.ssPaintRowHover(gr,true);
  assert.equal(c.ssHoverPainted,null,'leaving clears the last row');
});
test('partial scene copy is bounded to its dirty panel',()=>{
  const h=harness(),c=h.c,blits=[];c.W=3840;c.H=2160;c.ssSceneImage={ReleaseGraphics(){}};
  c.ssEndScene({DrawImage(...r){blits.push(r);}}, {},[{x:0,y:2000,w:3840,h:160}]);
  assert.equal(blits.length,1);assert.deepEqual(blits[0].slice(1),[0,2000,3840,160,0,2000,3840,160]);
});



test('text uses subpixel antialiasing on opaque surfaces and keeps ellipsis alignment',()=>{
 const h=harness(),c=h.c,draws=[],hints=[];c.gdi={Font:(n,s)=>({n,s})};h.load('core/tokens.js');
 const gr={CalcTextHeight:()=>22,SetTextRenderingHint:v=>hints.push(v),DrawString:(...v)=>draws.push(v),GdiDrawText(){throw Error('ClearType on a bitmap is unsupported');}};
 c.tL(gr,'中文 & 日本語',c.FONT.pl,1,1.2,2.5,100,20);c.tR(gr,'Right',c.FONT.pl,1,0,0,100,20);
 assert.deepEqual(hints,[5,5]);assert.equal(draws[0][0],'中文 & 日本語');assert.equal((draws[0][7]>>>20)&15,3);assert.equal((draws[1][7]>>>28)&15,2);
});
test('new playlist footer has separated measured lines at normal and enlarged density',()=>{
 const h=harness(),c=h.c,lines=[];h.load('views/nav.js');c.R.navLib={x:0,y:0,w:260,h:700};c.hv=()=>false;c.navDropHover=false;c.strokeRound=()=>{};c.lineH=(g,f)=>f==='primary'?25:22;c.FONT={pl:'primary',plSub:'sub'};c.tL=(g,t,f,col,x,y,w,h)=>lines.push({t,y,h});
 const gr={FillEllipse(){},FillRoundRect(){}};
 for(const density of [1,1.25]){lines.length=0;c.ssDensity=density;c.drawAddPlaylist(gr,600,72*density);if(lines.length===2)assert.ok(lines[0].y+lines[0].h<lines[1].y);}
});
test('late background search results never replace newer input and lyrics retain snippets',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');c.searchTrks=[];c.getSearchIdx=()=>[{id:'a',title:'Song'}];c.getArtistList=()=>[];
 c.ssSearchCatalog='cat';c.ssSearchQuery='new';c.ssSearchRequest='new-id';
 c.ssAcceptDiscovery({metadata:{search:{id:'old',ok:true,pending:false,result:{query:'old',catalog:'cat',matches:[{id:'a',index:0}]}}}});assert.equal(c.searchTrks.length,0);
 c.ssAcceptDiscovery({metadata:{search:{id:'new-id',ok:true,pending:false,result:{query:'new',catalog:'cat',matches:[{id:'a',index:0,reason:'歌词',snippet:'new lyric'}]}}}});assert.equal(c.searchTrks[0].snippet,'new lyric');
});
test('artist cards use verified names and their own portraits, never album covers',()=>{
 const h=harness(),c=h.c,calls=[];h.load('views/cards.js');c.ssDrawArtistAvatar=(...args)=>calls.push(args.at(-1));c.ssArtistName=()=> 'Verified';c.ssArtistRecord=()=>({verified:true});c.tC=(g,t)=>calls.push(t);c.artistCover=()=>{throw Error('album cover is not an artist portrait');};
 c.paintArtistCard({FillRoundRect(){}},0,0,160,{name:'Original'},false);assert.deepEqual(calls,['Original','Verified','歌手']);
});


test('minimized host surface never replaces the last usable content geometry',()=>{
 const h=harness(),c=h.c;c.window.GetProperty=(k,d)=>d;
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
 c.W=1180;c.H=780;c.layout=()=>{throw Error('minimizing must not recalculate typography');};c.on_size(199,34);assert.equal(c.W,1180);assert.equal(c.H,780);
});


test('actual mouse callback and paint dispatcher bypass main rendering between song rows',()=>{
 const h=harness(),c=h.c;c.window.GetProperty=(k,d)=>d;const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
 c.ssResizeMove=c.ssPopupMove=c.ssPointerMove=()=>false;c.hoverSig=(x,y)=>'r'+Math.floor(y/60);c.scrollSection=()=> 'pl';c.hoverZone=()=> 'main';
 c.dupPrompt=c.rgPrompt=null;c.sgMenuOpen=c.plSortMenuOpen=false;c.hoverZoneKey='main';c.scrollKey='pl';c.hoverKey='r0';c.ssSceneImage={};c.HB_TR=[];c.HB_Q=[];c.repaintMain=()=>{throw Error('row movement redrew main');};
 for(let i=1;i<100;i++)c.on_mouse_move(400,i*60);h.flush();c.clearDirty();c.ssHoverDirty=true;
 let overlays=0;c.ssPaintRowHover=()=>overlays++;c.ssSyncLyricPanel=()=>{throw Error('hover must not issue lyrics geometry work');};c.on_paint({});assert.equal(overlays,1);
});


test('every artist opening requests silent identity verification without showing a popup',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');c.artistAlbums=[{album:'Album',handle:{}}];c.fb.TitleFormat=()=>({EvalWithMetadb:()=>'?'});c.ssShowPopup=()=>{throw Error('automatic lookup must stay silent');};
 c.ssArtistAuto('Name');const first=c.ssArtistAutoRequest;assert.equal(h.writes.at(-1).task,'artist_auto');assert.equal(h.writes.at(-1).name,'Name');
 c.ssArtistAuto('Name');assert.notEqual(c.ssArtistAutoRequest,first);assert.equal(c.ssArtistAutoStatus.Name,'正在联网核验…');
});


test('context menus stay open after mouse leaves and close on outside click',()=>{
 const h=harness(),c=h.c;c.ssShowPopup([{label:'Tagging'}],10,40,'native',true);c.ssPopup.root='';c.ssPopup.levels[0].rect={x:10,y:40,w:230,h:100};
 c.ssPopupMove(700,500);c.ssMenuLeave();h.flush();assert.ok(c.ssPopup,'track context menu must remain open');c.ssPopupClick(700,500);assert.equal(c.ssPopup,null);
});
test('a valid GdiBitmap without Dispose remains available for artist rendering',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');let drawn=0;
 const graphics={SetInterpolationMode(){},DrawImage(){}};const bitmap={Width:120,Height:80};
 c.gdi={Image:()=>bitmap,CreateImage:()=>({GetGraphics:()=>graphics,ReleaseGraphics(){},ApplyMask(){}})};
 c.circleMask=()=>({});c.coverCol=()=>1;c.ssArtists.Name={verified:true,name:'Name',portrait:'local.jpg'};
 c.ssDrawArtistAvatar({DrawImage(){drawn++;},FillEllipse(){}},0,0,64,'Name');assert.equal(drawn,1);assert.ok(c.ssArtistImages['Name|64']);
});
test('artist lists contain only confirmed records while all song handles remain intact',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');h.load('data/library.js');
 const handles={Count:3,0:{Path:'a'},1:{Path:'b'},2:{Path:'c'}};c.libItems=()=>handles;c.libTF=()=>['One','Unknown','Two'];c.ssArtists={One:{verified:true},Two:{verified:true}};
 const artists=c.getArtistList();assert.deepEqual(Array.from(artists,a=>a.name),['One','Two']);assert.equal(handles.Count,3);
 c.utils.ReadTextFile=()=>JSON.stringify({Two:{verified:true}});c.ssLoadArtists();assert.equal(c.artistList,null);assert.deepEqual(Array.from(c.getArtistList(),a=>a.name),['Two']);
});


test('both internal playlists are excluded from navigation while normal lists remain visible',()=>{
 const h=harness(),c=h.c;h.load('data/playback.js');h.load('data/library.js');const names=['Music','__verdant_np__','__smartshuffle__','Custom'];c.plman.PlaylistCount=names.length;c.plman.GetPlaylistName=i=>names[i];assert.deepEqual(Array.from(c.visiblePlaylists()),[0,3]);
});
test('lyric search activation sends the exact target and timestamp with the search sequence',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');c.rightTab='queue';c.searchTrks=[{id:'a|0'},{id:'b|0',reason:'歌词',lyric_time:12.5}];
 assert.equal(c.ssPlaySearchHit(1),true);const request=h.writes.at(-1);assert.equal(request.op,'play_match');assert.equal(request.track_id,'b|0');assert.equal(request.seconds,12.5);assert.deepEqual(Array.from(request.tracks),['a|0','b|0']);assert.equal(c.rightTab,'lyrics');
});
test('untimed search hit plays normally without a fabricated seek',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');c.searchTrks=[{id:'a|0',reason:'歌词',lyric_time:null}];c.ssPlaySearchHit(0);assert.equal('seconds' in h.writes.at(-1),false);
});
test('artist menu entries open artist details, provenance or the actual local image',()=>{
 const h=harness(),c=h.c;h.load('data/discovery.js');c.ssArtists.Name={verified:true,name:'Canonical',country:'JP',description:'Description',source:'https://musicbrainz.org/artist/id',portrait:'local.png',portrait_license:'CC BY'};
 let artist='';c.loadArtist=name=>artist=name;c.ssArtistMenu('Name',10,40);let items=c.ssPopup.levels[0].items;items[0].run();assert.equal(artist,'Name');assert.equal(c.view,'artist');assert.ok(items.filter(i=>!i.separator).every(i=>typeof i.run==='function'));
 items.find(i=>i.label.indexOf('头像')===0).run();assert.equal(h.writes.at(-1).op,'artist_resource');assert.equal(h.writes.at(-1).resource,'portrait');
});
test('sorted playlist drag submits native indices and duplicate occurrences stay independent',()=>{
 const h=harness(),c=h.c;let sent;c.ssSend=(op,args)=>sent={op,args};c.view='playlist';c.R={main:{x:0,y:0,w:600,h:300}};c.window.SetInterval=()=>1;c.utils.IsKeyPressed=k=>k===1;
 c.ssState={playlists:[{index:0,guid:'guid',writable:true,name:'List'}]};c.plman.ActivePlaylist=0;c.getPlOrder=()=>[2,0,1];const hs=[{Path:'same',SubSong:0},{Path:'same',SubSong:0},{Path:'z',SubSong:0}];hs.Count=3;c.getItems=()=>hs;
 c.HB_TR=[2,0,1].map((item,i)=>({pl:0,item,x0:0,x1:600,y0:i*50,y1:(i+1)*50}));c.HB_PL=[];c.HB_Q=[];
 c.ssSelectionDown(100,20);c.ssSelectionUp(100,20);c.ssSelectionDown(100,20);h.advance(170);c.ssSelectionMove(100,145);c.ssSelectionUp(100,145);
 assert.equal(sent.op,'track_reorder');assert.deepEqual(Array.from(sent.args.order),[0,1,2]);assert.deepEqual(Array.from(sent.args.expected),['same|0','same|0','z|0']);assert.equal(c.plSort,'manual');
});
test('multi-select context menu sends the full selected occurrence set to native Converter',()=>{
 const h=harness(),c=h.c;c.view='songs';c.R={main:{x:0,y:0,w:600,h:300}};c.utils.IsKeyPressed=k=>k===16;c.window.SetInterval=()=>1;c.ssState={playlists:[]};c.canEditPl=()=>false;c.isHiddenPl=()=>false;
 c.songsTracks=[0,1,2].map(i=>({h:{Path:'track'+i,SubSong:0}}));c.HB_TR=[0,1,2].map(i=>({songs:true,ti:i,x0:0,x1:600,y0:i*50,y1:(i+1)*50}));c.HB_PL=[];c.HB_Q=[];
 c.utils.IsKeyPressed=()=>false;c.ssToggleTrackSelection(c.HB_TR[0]);c.ssToggleTrackSelection(c.HB_TR[1]);c.ssToggleTrackSelection(c.HB_TR[2]);
 let request;c.ssOpenNativeMenu=(kind,args,x,y,extra)=>request={kind,args,extra};c.ssBatchTrackMenu(c.HB_TR[1],100,60);
 assert.equal(request.args.tracks.length,3);assert.ok(request.extra.find(i=>i.label==='移动到歌单').disabled);assert.ok(request.extra.find(i=>i.label==='添加到歌单').children[0].run);
});
test('a double click inserts and starts one song without creating a route playlist',()=>{
 const h=harness(),c=h.c;h.load('data/library.js');c.vizMenuOpen=false;c.window.GetProperty=(k,d)=>d;const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
 c.ssModal=false;c.dupPrompt=c.rgPrompt=null;c.HB_TR=[{songs:true,ti:0,x0:0,y0:0,x1:500,y1:60}];c.songsTracks=[{h:{Path:'song',SubSong:2}}];c.HB_Q=[];c.on_mouse_lbtn_dblclk(100,20);
 assert.equal(h.writes.at(-1).op,'queue_add');assert.equal(h.writes.at(-1).play,true);assert.deepEqual(Array.from(h.writes.at(-1).tracks),['song|2']);assert.equal(c.rightTab,'queue');
});
test('playback menu hides redundant native random modes and keeps four choices',()=>{
 const h=harness(),c=h.c;c.ssState={orders:[0,1,2,3,4,5,6].map(index=>({index,name:'order'+index}))};c.ssShowPlaybackModes(0,40);
 assert.deepEqual(Array.from(c.ssPopup.levels[0].items.slice(0,4),i=>i.label),['智能随机（每轮全覆盖）','顺序播放','列表循环','单曲循环']);assert.equal(c.ssPopup.levels[0].items.length,10);
});
test('startup cover filter skips real artwork and groups missing tracks for one album lookup',()=>{
 const h=harness(),c=h.c;h.load('data/covers.js');c.artInFlight=0;c.ssSelectOwner=null;c.ssDragging=false;c.ssCoverRow=t=>({id:t.id,path:t.id,subsong:0,artist:'Artist',album:'Album',album_artist:'Artist'});
 c.ssCoverRows=[{id:'existing'},{id:'a'},{id:'b'}];let row=0;c.utils.GetAlbumArtAsyncV2=()=>({then(fn){fn(row++===0?{image:{}}:{image:null});}});c.ssCoverStep();c.ssCoverStep();c.ssCoverStep();
 const req=h.writes.at(-1);assert.equal(req.task,'covers');assert.equal(req.refresh_missing,true);assert.deepEqual(Array.from(req.rows,r=>r.id),['a','b']);assert.equal(c.ssCoverAt,3);
});
test('Chinese menu labels preserve native command identity and user-defined text',()=>{
 const h=harness(),c=h.c;c.utils.ReadTextFile=()=>fs.readFileSync(path.join(root,'locale/zh-CN.json'),'utf8');h.load('ui/localization.js');assert.equal(c.ssMenuLabel('&Convert...\tCtrl+X'),'转换…');assert.equal(c.ssMenuLabel('My preset'),'My preset');
 c.ssShowPopup([{label:'Convert',command:21}],0,40,'token',true);c.ssPopupChoose(c.ssPopup.levels[0].items[0]);assert.equal(h.writes.at(-1).command,21);assert.equal(h.writes.at(-1).token,'token');
});
console.log(passed+' interaction regression checks passed');
