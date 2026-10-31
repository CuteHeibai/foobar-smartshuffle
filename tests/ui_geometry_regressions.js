'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../theme/verdant');let count=0,failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);count++;}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
function context(){
 const timers=new Map();let serial=0,now=0;
 const c={console,Math,JSON,Number,isFinite,Date:{now:()=>now},UISCALE:2,SS_BASE_UI_SCALE:2,ssDensity:1,window:{Width:1180,Height:780,GetProperty:(k,d)=>d,SetProperty(){},SetTimeout(fn){timers.set(++serial,fn);return serial;},ClearTimeout(id){timers.delete(id);},SetInterval:()=>++serial,ClearInterval(){},Repaint(){},RepaintRect(){}},
 fb:{ProfilePath:'P:\\',IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:-10},plman:{ActivePlaylist:0},utils:{},
 gdi:{Font:(Name,Size,Style)=>({Name,Size,Style}),CreateImage:(Width,Height)=>({Width,Height,GetGraphics:()=>graphics(),ReleaseGraphics(){}})},
 repaintAll(){},applyKeyMode(){},repaintBar(){},repaintMain(){},repaintQueue(){},repaintNav(){},drawIcon(){},drawCover(){},
 DLGC_WANTCHARS:128,ssModal:false,ssPopup:null,ssResizeMove:()=>false,ssPopupMove:()=>false,ssPointerMove:()=>false,ssPopupWheel:()=>false,
 ssSend(){},ssOutputError:'',ssError:'',vol2pos:()=>.5,ssPlaylistInfo:()=>null};vm.createContext(c);
 function load(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);}
 load('core/tokens.js');load('core/util.js');load('ui/motion.js');load('ui/hover.js');load('ui/viewport.js');load('ui/selection.js');load('data/selection_host.js');
 function app(){let text=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(text.slice(0,text.lastIndexOf('\nlayout();')),c);c.dupPrompt=c.rgPrompt=null;c.sgMenuOpen=c.plSortMenuOpen=c.vizMenuOpen=false;}
 return {c,load,app,tick(ms){now+=ms;c.scrollTick();},flush(){let jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
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
test('all-songs header cover is never erased by a row crop mask and has no scan caption',()=>{
 const {c,load}=context();load('views/songs.js');c.ROW_GATE_MS=0;c.ssDensity=1.25;c.M.cpad=24;c.M.artSz=200;c.SHEAD=320;c.SG_CROP=120;
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
console.log(count+' passed, '+failed+' failed');if(failed)process.exitCode=1;
