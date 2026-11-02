'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../theme/verdant');let count=0,failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);count++;}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
function context(){
 const timers=new Map();let serial=0,now=0;
 const c={console,Math,JSON,Number,isFinite,Date:{now:()=>now},UISCALE:2,SS_BASE_UI_SCALE:2,ssDensity:1,TBH:32,window:{Width:1180,Height:780,GetProperty:(k,d)=>d,SetProperty(){},SetTimeout(fn){timers.set(++serial,fn);return serial;},ClearTimeout(id){timers.delete(id);},SetInterval:()=>++serial,ClearInterval(){},Repaint(){},RepaintRect(){}},
 fb:{ProfilePath:'P:\\',IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:-10},plman:{ActivePlaylist:0},utils:{},
 gdi:{Font:(Name,Size,Style)=>({Name,Size,Style}),CreateImage:(Width,Height)=>({Width,Height,GetGraphics:()=>graphics(),ReleaseGraphics(){}})},
 repaintAll(){},applyKeyMode(){},repaintBar(){},repaintMain(){},repaintQueue(){},repaintNav(){},drawIcon(){},drawCover(){},
 DLGC_WANTCHARS:128,ssModal:false,ssPopup:null,ssResizeMove:()=>false,ssPopupMove:()=>false,ssPointerMove:()=>false,ssPopupWheel:()=>false,
 ssSend(){},ssOutputError:'',ssError:'',vol2pos:()=>.5,ssPlaylistInfo:()=>null};vm.createContext(c);
 function load(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);}
 load('core/tokens.js');load('core/util.js');load('ui/motion.js');load('ui/hover.js');load('ui/viewport.js');load('ui/selection.js');load('data/selection_host.js');
 function app(){let text=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(text.slice(0,text.lastIndexOf('\nlayout();')),c);c.dupPrompt=c.rgPrompt=null;c.sgMenuOpen=c.plSortMenuOpen=c.vizMenuOpen=false;}
 return {c,load,app,advance(ms){now+=ms;},tick(ms){now+=ms;c.scrollTick();},flush(){let jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
function graphics(){return {SetTextRenderingHint(){},SetSmoothingMode(){},SetInterpolationMode(){},CalcTextHeight:(s,f)=>f.Size*1.3,CalcTextWidth:(s,f)=>Array.from(String(s)).length*f.Size*.9,DrawString(){},DrawImage(){},FillSolidRect(){},FillRoundRect(){},FillEllipse(){},DrawLine(){},DrawRect(){}};}
test('large fonts stay inside each supplied text box at 200 percent scale',()=>{
 const {c}=context(),draws=[],g=graphics();g.DrawString=(s,f,col,x,y,w,h)=>draws.push({s,f,x,y,w,h});
 c.tL(g,'大标题',c.FONT.title,1,10,10,180,26);c.tL(g,'副标题',c.FONT.meta,1,10,40,180,18);
 for(const d of draws){assert.ok(g.CalcTextHeight(d.s,d.f)<=d.h,'font must fit reserved height');assert.ok(d.y>=10);}
 assert.ok(draws[0].y+draws[0].h<=40,'title must not expand into subtitle');
});
test('small avatar initials fit inside the circle instead of using a heading font',()=>{
 const {c,load}=context();load('data/discovery.js');c.ssArtistName=()=> '林俊杰';c.ssArtistRecord=()=>null;c.coverCol=()=>1;let box;
 const g=graphics();g.DrawString=(s,f,col,x,y,w,h)=>box={s,f,x,y,w,h};c.ssDrawArtistAvatar(g,10,20,40,'林俊杰');assert.ok(box);
 assert.ok(g.CalcTextWidth(box.s,box.f)<=box.w);assert.ok(g.CalcTextHeight(box.s,box.f)<=box.h);assert.ok(box.x>10&&box.y>20&&box.x+box.w<50&&box.y+box.h<60);
});
test('footer removes analysis counts and ineffective scan controls',()=>{
 const {c,load}=context();load('views/bar.js');c.R={barY:680,barInfoW:300,barToolsW:300};c.W=1180;c.M.barH=96;c.NP=null;c.npTitleStr=c.npArtistStr='';c.drag=null;c.pbShuffle=true;c.ssState={scan:{completed:24,total:24,paused:false}};c.mx=c.my=-1;c.HB_CTRL=[];c.hv=()=>false;let words=[];
 c.tL=c.tR=c.tC=(g,s)=>words.push(s);c.drawBar(graphics());assert.ok(!words.some(s=>/分析|暂停|继续/.test(s)));assert.ok(!c.HB_CTRL.some(h=>h.act==='scan_pause'||h.act==='scan_retry'));
});
test('queue keeps partial rows at both viewport edges during fractional scrolling',()=>{
 const {c,load}=context();load('views/preference.js');c.UISCALE=1;c.pbShuffle=true;c.ssState={remaining:Array.from({length:30},(_,i)=>({id:'t'+i,title:'song'+i})),queue:[]};c.ssQueueScroll=9;c.ssQueueScrollT=9;c.HB_Q=[];c.qRow=(g,r,x,y,rh)=>({x0:x,y0:y,x1:r.x+r.w,y1:y+rh});c.tL=()=>{};c.drawSBV=()=>null;c.SB_QUEUE={};c.hv=()=>false;c.drag=null;
 c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:600},18,150,580);
 assert.equal(c.HB_Q[0].track_id,'t0','partially visible first item must remain');assert.ok(c.HB_Q[0].y0>=209);assert.equal(c.HB_Q.at(-1).y1,580,'last partial row stays clipped and hittable');
});

test('queue header hides the round counter and retains the remaining track count',()=>{
 const {c,load}=context();load('views/preference.js');c.pbShuffle=true;c.ssState={round:42,remaining_count:17,remaining:[],queue:[]};c.ssQueueScroll=c.ssQueueScrollT=0;c.HB_Q=[];c.hv=()=>false;c.drag=null;c.drawSBV=()=>null;c.SB_QUEUE={};const words=[];c.tL=(g,s)=>words.push(s);
 c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:600},18,150,580);
 assert.ok(words.includes('接下来'));assert.ok(words.includes('本轮剩余 17 首'));assert.ok(!words.some(s=>/第\s*42\s*轮/.test(s)));
});
test('all-songs header cover is never erased by a row crop mask and has no scan caption',()=>{
 const {c,load}=context();load('data/playback.js');load('views/songs.js');c.ROW_GATE_MS=0;c.ssDensity=1.25;c.M.cpad=24;c.M.artSz=200;c.SHEAD=320;c.SG_CROP=120;
 c.ensureBuilt=c.gateReady=()=>true;c.songsReady=c.songsSteps=c.rowHandlesSongs=()=>[];c.libChoice=()=>({single:null});c.artHue=()=>1;c.songsGroup='none';c.songsScroll=c.songsScrollT=0;c.songsContentH=70;c.songsTotalSec=1000;c.songsFirstAt=()=>0;c.NP=null;
 c.songsTracks=Array.from({length:214},()=>({}));c.songsRows=[{k:'t',y:0,h:70,n:1,ti:0,t:{title:'Title',artist:'Artist',album:'Album',len:'1:00'}}];c.rgStat={scanned:1,total:214,missing:[1]};c.rgScanFailed=false;c.rgModeOn=()=>false;
 c.drawNormalizePill=c.drawDropPill=()=>null;c.SONGS_GROUPS=[['不分组','none']];c.drawScrollbar=c.drawGroupMenu=()=>{};c.sgMenuOpen=false;c.hv=()=>false;c.drag=null;
 const g=graphics(),fills=[],words=[],labels=[];g.FillGradRect=()=>{};g.FillSolidRect=(x,y,w,h)=>fills.push({x,y,w,h});c.tL=c.tR=c.tC=(g,s,f,col,x,y,w,h)=>{words.push(s);labels.push({s,x,y,w,h});};let cover;c.drawLibCover=(g,x,y,size)=>cover={x,y,size};
 c.drawSongs(g,{x:200,y:40,w:1200,h:800});assert.ok(cover);assert.ok(!words.some(s=>/of 214|tracks scanned/.test(s)));
 assert.ok(!fills.some(r=>r.x<=cover.x&&r.y<cover.y+cover.size&&r.y+r.h>cover.y),'row masking must not paint over the header cover');
 labels.length=0;c.M.artSz=72;c.SHEAD=236;c.drawSongs(g,{x:200,y:40,w:600,h:800});
 const title=labels.find(r=>r.s==='全部歌曲'),meta=labels.find(r=>/214 首歌曲/.test(r.s));assert.ok(title.y+title.h<=meta.y,'compact heading must end before its full-width subtitle');
});
test('queue wheel follows the hovered panel without changing the main list',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:200,y:40,w:600,h:600},queue:{x:810,y:40,w:300,h:600},barY:650};c.rightTab='queue';c.mx=900;c.my=300;c.ssQueueScroll=0;c.ssQueueScrollT=0;c.SS_QUEUE_MAX=1000;c.WHEEL_PX=96;
 c.on_mouse_wheel(-1);assert.ok(c.ssQueueScrollT>0,'wheel must set a smooth queue target');assert.equal(c.ssQueueScroll,0,'queue must not jump');assert.equal(c.firstRowT,0);
});
test('scroll damping depends on elapsed time rather than callback count',()=>{
 function run(ms){const h=context(),c=h.c;h.app();c.repaintMain=c.repaintNav=c.repaintQueue=()=>{};Object.assign(c,{firstRowT:500,navScrollT:0,homeScrollT:0,songsScrollT:0,songsScroll:0,searchScrollT:0,searchScroll:0,plScrollT:0,plScroll:0,ssQueueScrollT:0,ssQueueScroll:0,shimCount:0});for(let n=0;n<160;n+=ms)h.tick(ms);return c.firstRow;}
 assert.ok(Math.abs(run(16)-run(32))<3,'slow frames must cover the same distance per second');
});
test('repeated interaction paints never accumulate selection opacity on untouched rows',()=>{
 const h=context(),c=h.c;h.app();c.view='songs';c.R={main:{x:0,y:0,w:500,h:200},queue:{x:510,y:0,w:300,h:200}};c.HB_TR=[0,1,2].map(i=>({songs:true,ti:i,x0:0,x1:500,y0:i*50,y1:(i+1)*50}));c.HB_Q=[];c.songsTracks=[0,1,2].map(i=>({h:{Path:'t'+i,SubSong:0}}));c.ssMainSelectionContext();
 c.ssMainSelect.start({index:0,x:10,y:10});c.ssMainSelect.end(10,10);c.ssMainSelect.start({index:1,x:10,y:60,shift:true});c.ssMainSelect.end(10,60);c.ssSceneImage={};c.mx=10;c.my=125;
 let alpha=[0,0,0];const g=graphics();g.DrawImage=(im,x,y,w,ht)=>{for(let i=0;i<3;i++)if(y<=i*50&&y+ht>i*50)alpha[i]=0;};g.FillRoundRect=(x,y,w,ht)=>{for(let i=0;i<3;i++)if(y<=i*50&&y+ht>i*50)alpha[i]++;};
 function paint(){if(c.ssPaintInteractions)c.ssPaintInteractions(g);else{c.ssPaintRowHover(g,true);c.ssDrawSelection(g);}}
 paint();let first=alpha.slice();for(let i=0;i<8;i++)paint();assert.deepEqual(alpha,first,'each overlay must start from clean scene pixels');
});
test('re-entering after a released drag cannot turn plain hovering into a stuck selection',()=>{
 const h=context(),c=h.c;h.app();c.view='songs';c.R={main:{x:0,y:0,w:500,h:200}};c.HB_TR=[{songs:true,ti:0,x0:0,y0:0,x1:500,y1:50}];c.HB_Q=c.HB_PL=[];c.songsTracks=[{h:{Path:'song',SubSong:0}}];c.utils.IsKeyPressed=k=>k===1;
 c.ssSelectionDown(10,20);assert.ok(c.ssSelectOwner);c.utils.IsKeyPressed=()=>false;assert.equal(c.ssSelectionMove(10,45,0),false);assert.equal(c.ssSelectOwner,null,'a lost button-up must cancel the gesture');
});
test('main and queue restore bottom corner masks after composing content',()=>{
 const h=context(),c=h.c;h.app();h.load('views/queue.js');c.R={main:{x:10,y:10,w:500,h:500},queue:{x:520,y:10,w:300,h:500}};let stamps=[];
 c.drawMain=()=>stamps.push('main');c.roundTop=()=>{};c.roundBottom=(g,x,y,w,ht)=>stamps.push([x,y,w,ht]);c.shimSettle=()=>{};
 c.drawMainCounted(graphics());assert.deepEqual(stamps,['main',[10,10,500,500]]);
 stamps=[];c.ssDrawQueueContent=()=>stamps.push('queue');c.drawQueue(graphics());assert.deepEqual(stamps,['queue',[520,10,300,500]]);
});
test('hover jumps restore the whole invalidated band including skipped rows',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:0,y:0,w:500,h:200}};c.HB_TR=[0,1,2].map(i=>({x0:0,y0:i*50,x1:500,y1:(i+1)*50}));c.HB_Q=[];c.ssSelectionRects=()=>[];c.ssDrawSelection=()=>{};c.ssSceneImage={};c.mx=20;c.my=20;
 c.ssPaintInteractions(graphics());c.my=120;let restored=[];const g=graphics();g.DrawImage=(im,x,y,w,ht)=>restored.push({y,ht});c.ssPaintInteractions(g);assert.ok(restored.some(r=>r.y<=50&&r.y+r.ht>=100),'the middle row must be restored after a jump');
});
test('queued hover damage survives a pointer reversal before the paint callback',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:0,y:0,w:500,h:200}};c.HB_TR=[0,1,2].map(i=>({x0:0,y0:i*50,x1:500,y1:(i+1)*50}));c.HB_Q=[];c.ssSelectionRects=()=>[];c.ssDrawSelection=()=>{};c.ssSceneImage={};c.mx=20;c.my=20;c.ssPaintInteractions(graphics());
 c.my=120;c.ssRequestRowHover();h.flush();c.my=20;let restored=[];const g=graphics();g.DrawImage=(im,x,y,w,ht)=>restored.push({y,ht});c.ssPaintInteractions(g);assert.ok(restored.some(r=>r.y<=100&&r.y+r.ht>=150),'previously invalidated rows still need pixels after the pointer moves back');
});
test('drag selection refresh restores its entire invalidated panel',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:0,y:0,w:500,h:200}};c.HB_TR=[];c.HB_Q=[];c.ssSelectionRects=()=>[];c.ssDrawSelection=()=>{};c.ssSceneImage={};c.ssSelectionZone=c.R.main;c.ssSelectionRepaint();h.flush();let restored=[];const g=graphics();g.DrawImage=(im,x,y,w,ht)=>restored.push({y,ht});c.ssPaintInteractions(g);assert.ok(restored.some(r=>r.y===0&&r.ht===200));
});
test('track identity uses RawPath so playlist context validation matches the SDK',()=>{
 const {c}=context();assert.equal(c.ssTrackID({Path:'D:\\music\\song.flac',RawPath:'file://D:\\music\\song.flac',SubSong:2}),'file://D:\\music\\song.flac|2');
});
test('Ctrl left-click toggles songs; right-click keeps its menu and holding left drag reorders',()=>{
 const h=context(),c=h.c;h.app();c.view='playlist';c.R={main:{x:0,y:0,w:500,h:200}};c.ssState={playlists:[{index:0,guid:'list',writable:true}]};c.plman.ActivePlaylist=0;c.getPlOrder=()=>[0,1,2];c.getItems=()=>[0,1,2].map(i=>({Path:'song'+i,RawPath:'file://song'+i,SubSong:0}));c.HB_TR=[0,1,2].map(i=>({pl:0,item:i,x0:0,y0:i*50,x1:500,y1:(i+1)*50}));c.HB_Q=c.HB_PL=[];c.utils.IsKeyPressed=k=>k===17||k===1;let menus=0;c.ssBatchTrackMenu=()=>{menus++;return true;};
 for(const y of [20,120]){c.ssSelectionDown(20,y);assert.equal(c.ssSelectionUp(20,y),true);}assert.deepEqual(Array.from(c.ssMainSelect.selectedIndices()),[0,2]);
 c.ssSelectionDown(20,20);c.ssSelectionUp(20,20);assert.deepEqual(Array.from(c.ssMainSelect.selectedIndices()),[2]);
 c.on_mouse_rbtn_up(20,20);assert.equal(menus,1);
 c.utils.IsKeyPressed=k=>k===1;c.ssSelectionDown(20,20);c.ssSelectionMove(20,120,1);assert.equal(c.ssMainSelect.preview().mode,'pending');h.advance(170);c.ssSelectionMove(20,120,1);assert.equal(c.ssMainSelect.preview().mode,'reorder');assert.deepEqual(Array.from(c.ssMainSelect.selectedIndices()),[0]);
});
test('Chinese text explicitly uses YaHei UI and English uses subpixel antialiasing',()=>{
 const {c}=context(),g=graphics(),draws=[],hints=[];g.SetTextRenderingHint=v=>hints.push(v);g.DrawString=(s,f)=>draws.push({s,f});
 c.tL(g,'歌曲列表',c.FONT.rowTitle,1,0,0,200,32);c.tL(g,'English song',c.FONT.rowTitle,1,0,40,200,32);
 assert.equal(draws[0].f.Name,'Microsoft YaHei UI');assert.equal(draws[1].f.Name,'Inter');assert.deepEqual(hints,[5,5]);
});
test('scene restore copies align source and destination to whole pixels',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:0,y:0,w:500,h:200}};c.HB_TR=[{x0:10.2,y0:49.3,x1:480.8,y1:99.3}];c.HB_Q=[];c.ssSelectionRects=()=>[];c.ssDrawSelection=()=>{};c.ssSceneImage={};c.mx=40;c.my=70;let copies=[];const g=graphics();g.DrawImage=(im,...args)=>copies.push(args);c.ssPaintInteractions(g);assert.ok(copies.length);assert.ok(copies.every(args=>args.every(Number.isInteger)));
});
test('footer uses the whole-window center and shrinks the seek rail before moving transport',()=>{
 const {c,load}=context();load('views/bar.js');
 for(const [w,left,right] of [[1536,470,1200],[1180,510,920],[2560,400,2200]]){
  const a=c.ssTransportLayout(w,left,right,1);assert.equal(a.center,Math.round(w/2));assert.ok(a.seekWidth<=2*Math.min(a.center-left,right-a.center)-110);
 }
 const pushed=c.ssTransportLayout(1180,560,960,1);assert.ok(pushed.center>590);assert.ok(pushed.center-560>=80);
});

test('responsive playback bar keeps long track labels clear of transport and output controls',()=>{
 const {c,load}=context();load('ui/layout.js');load('views/bar.js');c.NP=null;c.npTitleStr='A long song title '.repeat(12);c.npArtistStr='An artist '.repeat(10);c.drag=null;c.pbShuffle=true;c.ssState={};c.hv=()=>false;
 const g=graphics(),labels=[];c.tL=c.tR=c.tC=(gr,text,font,color,x,y,w,h)=>labels.push({text,x,y,w,h});
 for(const [width,density] of [[800,.85],[1180,1],[1800,1.25],[2560,1.25]]){
  c.W=width;c.ssDensity=density;c.M.barH=Math.round(96*density);const widths=c.ssLayoutWidths(width);c.R={barY:680,barInfoW:widths.info,barToolsW:widths.tools};labels.length=0;c.drawBar(g);
  const title=labels.find(r=>r.text===c.npTitleStr),prev=c.HB_CTRL.find(h=>h.act==='prev'),next=c.HB_CTRL.find(h=>h.act==='next'),mode=c.HB_CTRL.find(h=>h.act==='playback_mode');
  assert.ok(title.x+title.w<=prev.x0,'track text must end before previous control');assert.ok(next.x1<=mode.x0,'next control must end before playback-mode menu');assert.ok(c.HB_SEEK.x>=title.x+title.w,'seek rail must clear long track text');
  if(width>=1180)assert.equal(c.R.transport.center,Math.round(width/2));
 }
});
test('footer track area grows with the window instead of stopping at a compact fixed width',()=>{
 const {c,load}=context();load('ui/layout.js');
 const widths=[1180,1800,2560].map(w=>c.ssLayoutWidths(w).info);
 assert.ok(widths[0]>=375,'normal windows need more room for the current song');
 assert.ok(widths[2]>widths[0]*1.8,'maximized windows should offer substantially more title space');
 for(let i=0;i<widths.length;i++)assert.ok(widths[i]<[1180,1800,2560][i]/2-80,'keep space before the centered transport');
});

test('permanent dividers use quiet opaque colours in both appearances',()=>{
 const {c}=context();
 for(const mode of ['light','dark']){
  const palette=c.ssPalette(mode);assert.equal((palette.splitter>>>24)&255,255);
  for(const shift of [0,8,16]){
   const contrast=Math.abs(((palette.splitter>>>shift)&255)-((palette.black>>>shift)&255));
   assert.ok(contrast>=25&&contrast<=65,mode+' divider should stay visible without a heavy edge');
  }
 }
});

test('only upper pane splitters paint permanent lines and footer stays clear',()=>{
 const {c,load}=context();load('ui/layout.js');c.W=1180;c.H=780;c.R={top:{y:40},main:{x:230,h:600},queue:{x:850},barY:680,barInfoW:300,barToolsW:300};c.fsMode=false;let lines=[];const g=graphics();g.FillSolidRect=(...a)=>lines.push(a);c.ssDrawResizers(g);assert.equal(lines.length,2);assert.ok(lines.every(a=>a[2]===1&&a[1]<680&&a[1]+a[3]<680));
});
test('top menus open submenus by click and remain open when the pointer leaves',()=>{
 const h=context(),c=h.c;h.load('ui/menus.js');c.TBH=32;c.ssPoll=()=>{};
 c.ssShowPopup([{label:'A',children:[{label:'B'}]}],10,40);c.ssPopup.root='file';
 c.SS_MENU_HB=[{x0:10,y0:40,x1:200,y1:80,depth:0,index:0,item:c.ssPopup.levels[0].items[0]}];
 c.ssPopupMove(20,60);assert.equal(c.ssPopup.levels.length,1);c.ssPopupClick(20,60);assert.equal(c.ssPopup.levels.length,2);
 c.ssPopupMove(1000,700);c.ssMenuLeave();h.flush();assert.ok(c.ssPopup);c.ssPopupClick(1000,700);assert.equal(c.ssPopup,null);
});
test('preference movement caches static controls instead of redrawing their text every frame',()=>{
 const {c}=context();c.W=1180;c.H=780;c.ssModal=true;c.ssDraft={x:0,y:0};c.ssState={preview:null};c.ssApplyId=c.ssMessage=c.ssError='';c.ssReady=()=>false;c.ssPreferenceLabel=()=> '均衡';c.ssGeometry=()=>({x:100,y:80,w:940,h:600,grid:{x:600,y:200,size:240}});c.ssDrawBase=()=>{};c.ssDrawGlassBall=()=>{};let controls=0;c.drawPreference=()=>controls++;const g=graphics();for(let i=0;i<40;i++)c.ssPaintModal(g);assert.equal(controls,1);
});
test('raw pointer updates allocate one preview timer and one rendering frame',()=>{
 const h=context(),c=h.c;h.load('data/smartshuffle.js');let allocations=0;const original=c.window.SetTimeout;c.window.SetTimeout=(...a)=>{allocations++;return original(...a);};c.ssModal=true;c.ssDragging=true;
 for(let i=0;i<100;i++)c.ssSetDraft(i/100,0);assert.equal(c.ssDraft.x,.99);assert.ok(allocations<=2,'timer churn must not scale with mouse polling rate');
});
test('trail samples depend on elapsed time rather than mouse polling frequency',()=>{
 function sample(step){const h=context(),c=h.c;c.ssDragging=true;for(let t=0;t<=120;t+=step){c.ssDraft={x:t/120,y:0};c.ssRecordTrail(c.ssDraft);h.advance(step);}return Array.from(c.ssTrailSamples(120),p=>p.x);}
 const fast=sample(2),slow=sample(10);assert.equal(fast.length,slow.length);assert.ok(fast.length>2);for(let i=0;i<fast.length;i++)assert.ok(Math.abs(fast[i]-slow[i])<.001);
});
test('song drag overlay captures one whole row and tracks the actual pointer delta',()=>{
 const h=context(),c=h.c;c.W=1000;c.H=700;c.TBH=32;let captures=0,copies=[];
 c.ssSceneImage={Clone(x,y,w,h){captures++;return {Width:w,Height:h};}};
 const p={mode:'reorder',indices:[1],origin:{index:1,x0:100,y0:100,x1:600,y1:150},grab:{x:120,y:120},pointer:{x:180,y:220}};
 const g=graphics();g.DrawRoundRect=()=>{};g.DrawImage=(im,...args)=>copies.push(args);
 c.ssDrawDragOverlay(g,p);p.pointer.y=250;c.ssDrawDragOverlay(g,p);
 assert.equal(captures,1);assert.equal(copies[0][0],160);assert.equal(copies[0][1],200);assert.equal(copies[1][1],230);assert.equal(copies[0][2],500);assert.equal(copies[0][3],50);
});
test('ordinary playlist hold uses delivered button events even if a key poll is false',()=>{
 const h=context(),c=h.c;h.app();c.view='playlist';c.R={main:{x:0,y:0,w:500,h:200}};c.ssState={playlists:[{index:0,guid:'ordinary',writable:true}]};c.getPlOrder=()=>[0,1,2];c.getItems=()=>[0,1,2].map(i=>({RawPath:'file://song'+i,Path:'song'+i,SubSong:0}));c.HB_TR=[0,1,2].map(i=>({pl:0,item:i,x0:0,y0:i*50,x1:500,y1:(i+1)*50}));c.HB_Q=c.HB_PL=[];c.utils.IsKeyPressed=()=>false;
 c.ssSelectionDown(20,20);h.advance(170);h.flush();assert.equal(c.ssMainSelect.preview().mode,'reorder','a delivered down must lift at the deadline without keyboard polling');
 c.ssSelectionMove(60,120);assert.ok(c.ssSelectOwner,'legacy callbacks without mask must retain an owned press');assert.equal(c.ssMainSelect.preview().pointer.y,120);
 c.ssSelectionMove(60,120,0);assert.equal(c.ssSelectOwner,null,'an explicit released mask still cancels lost mouse-up');
});
test('a playlist may allow row reordering while blocking add and remove',()=>{
 const h=context(),c=h.c;h.app();c.view='playlist';c.R={main:{x:0,y:0,w:500,h:200}};c.ssState={playlists:[{index:0,guid:'auto',writable:false,reorderable:true}]};c.getPlOrder=()=>[0,1,2];c.getItems=()=>[0,1,2].map(i=>({RawPath:'file://song'+i,SubSong:0}));c.HB_TR=[0,1,2].map(i=>({pl:0,item:i,x0:0,y0:i*50,x1:500,y1:(i+1)*50}));c.HB_Q=c.HB_PL=[];c.utils.IsKeyPressed=()=>false;
 c.ssSelectionDown(20,20);h.advance(170);h.flush();assert.equal(c.ssMainSelect.preview().mode,'reorder');
 c.ssCancelSelectionGesture();c.ssState.playlists[0].writable=true;c.ssState.playlists[0].reorderable=false;c.ssSelectionDown(20,20);h.advance(170);h.flush();assert.notEqual(c.ssMainSelect.preview().mode,'reorder','an explicit order lock takes priority over the legacy edit flag');
});

test('drag repaint bounds cover old and new row overlays without repainting the whole panel',()=>{
 const h=context(),c=h.c;h.app();c.W=1400;c.H=1000;c.TBH=32;c.R={main:{x:200,y:40,w:800,h:850}};c.HB_TR=[];c.HB_Q=[];
 c.ssSceneImage={};c.ssSelectionZone=c.R.main;c.ssInteractionPainted=[{x:200,y:300,w:800,h:60}];c.ssSelectionRects=()=>[{x:200,y:320,w:800,h:60}];let regions=[];c.window.RepaintRect=(x,y,w,h)=>regions.push({x,y,w,h});
 c.ssSelectionRepaint();h.flush();assert.equal(regions.length,1);assert.ok(regions[0].y<=300&&regions[0].y+regions[0].h>=380);assert.ok(regions[0].h<150,'nearby drag movement should only restore its row band');
});

test('song drag requests paint immediately and merges pending damage under rapid movement',()=>{
 const h=context(),c=h.c;h.app();c.W=1400;c.H=1000;c.R={main:{x:200,y:40,w:800,h:850}};c.ssSceneImage={};c.HB_TR=[];c.HB_Q=[];c.ssSelectionZone=c.R.main;c.ssInteractionPainted=[{x:200,y:300,w:800,h:60}];
 let y=320,paints=[];c.ssSelectionRects=()=>[{x:200,y,w:800,h:60}];c.window.RepaintRect=(...a)=>paints.push(a);
 c.ssSelectionRepaint();assert.equal(paints.length,1,'the host should receive damage in the pointer callback, without a script timer');assert.equal(paints[0][4],false,'use the host deferred/coalesced paint rather than synchronous drawing');
 for(let i=0;i<200;i++){y=320+(i%40)*4;c.ssSelectionRepaint();}
 assert.equal(c.ssInteractionDamage.length,1,'pending mouse events must not allocate a growing list of dirty rectangles');
 const damage=c.ssInteractionDamage[0];assert.ok(damage.y<=300&&damage.y+damage.h>=536,'all queued positions survive a pointer reversal before paint');
});

test('wheel movement is modest at display density and animation avoids a second 16ms timer quantum',()=>{
 const h=context(),c=h.c;h.app();c.view='playlist';c.ssDensity=1.25;c.WHEEL_PX=72;c.PL_MAXPX=5000;c.firstRow=c.firstRowT=0;c.R={main:{x:200,y:40,w:900,h:900},barY:960};c.mx=500;c.my=600;let interval;c.window.SetInterval=(fn,ms)=>{interval=ms;return 99;};
 c.on_mouse_wheel(-1);assert.equal(c.firstRowT,90,'one notch should move about one row at this density');assert.ok(interval<=8,'request animation within one host timer quantum');
});

test('scroll row rasters reuse full-size pixels and invalidate with content paints',()=>{
 const h=context(),c=h.c;h.app();c.ssQuietRows=true;c.R={main:{x:0,y:0,w:800,h:700},barY:720};let drawn=0,copies=[];const gr=graphics();gr.DrawImage=(im,...a)=>copies.push(a);
 const draw=g=>{drawn++;g.FillSolidRect(0,0,800,56,1);};
 c.ssDrawCachedRow(gr,'row',0,120,800,56,draw);c.ssDrawCachedRow(gr,'row',0,97,800,56,draw);
 assert.equal(drawn,1,'scrolling the same row must not rerender its text or artwork');assert.equal(copies.at(-1)[2],copies.at(-1)[6],'cache copies must retain 1:1 pixels');
 c.repaintMain(true);c.ssDrawCachedRow(gr,'row',0,90,800,56,draw);assert.equal(drawn,1);
 c.repaintMain();c.ssDrawCachedRow(gr,'row',0,80,800,56,draw);assert.equal(drawn,2,'new content must rebuild a row');
 c.repaintAll();c.ssDrawCachedRow(gr,'row',0,80,800,56,draw);assert.equal(drawn,3);
});

test('small wheel steps still move the home playlist shelf by a card',()=>{
 const h=context(),c=h.c;h.app();c.view='home';c.WHEEL_PX=72;c.ssDensity=1;c.HOME_STRIDE=192;c.HOME_PLMAX=1000;c.plScrollT=0;c.R={main:{x:200,y:40,w:900,h:900}};c.HOME_SHELF_Y0=100;c.HOME_SHELF_Y1=250;c.mx=500;c.my=180;
 c.on_mouse_wheel(-1);assert.equal(c.plScrollT,192);c.on_mouse_wheel(-1);assert.equal(c.plScrollT,384);
});

test('only viewport-clipped lists skip footer redraw while scrolling',()=>{
 const h=context(),c=h.c;h.app();c.R={main:{x:0,y:0,w:800,h:700},barY:720};let bar=0;c.repaintBar=()=>bar++;
 for(const view of ['home','search']){c.view=view;c.repaintMain(true);}assert.equal(bar,2,'unclipped views still need the footer mask');
 for(const view of ['playlist','songs']){c.view=view;c.repaintMain(true);}assert.equal(bar,2,'clipped rows cannot overwrite the footer');
});

test('splitters paint opaque whole-pixel columns independent of hover',()=>{
 const h=context(),c=h.c;h.load('ui/layout.js');c.W=1180;c.R={main:{x:218,y:40,w:600,h:600},queue:{x:826},top:{y:40},barY:650};c.fsMode=false;c.ssModal=false;c.ssPopup=null;c.ssSplitHot='';let columns=[];
 c.ssDrawResizers({DrawLine(){},FillSolidRect(x,y,w,h,color){columns.push({x,y,w,h,color});}});assert.equal(columns.length,2);assert.ok(columns.every(r=>Number.isInteger(r.x)&&r.w===1&&r.h>550&&((r.color>>>24)&255)===255));
 const normal=columns.map(r=>r.color);columns=[];c.ssSplitHot='nav';c.ssDrawResizers({DrawLine(){},FillSolidRect(x,y,w,h,color){columns.push({color});}});assert.deepEqual(columns.map(r=>r.color),normal);
});
console.log(count+' passed, '+failed+' failed');if(failed)process.exitCode=1;
