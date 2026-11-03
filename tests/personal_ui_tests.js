'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+': '+e.stack);process.exitCode=1;}}
function harness(enabled=true){
  const sent=[],timers=new Map();let timer=0;
  const c={console,Date,Math,JSON,Number,isFinite,view:'home',HB_TR:[],HB_Q:[],HB_PL:[],NP:null,drag:null,
    ssSend(op,args){const r=Object.assign({op,id:'r'+(sent.length+1)},args);sent.push(r);return r.id;},
    window:{SetTimeout(fn){timers.set(++timer,fn);return timer;},ClearTimeout(id){timers.delete(id);}},
    repaintAll(){},repaintMain(){},ssInvalidateSelections(){},ssState:{personal:{revision:1,enabled}},ssDensity:1,
    clampPx:(x,max)=>Math.max(0,Math.min(x,max)),R:{main:{x:0,y:0,w:500,h:400}},M:{cpad:16,rowH:56},
    getSearchIdx:()=>[],plman:{},rightTab:'lyrics',ssInteractionPainted:[],ssInteractionDamage:[],utils:{IsKeyPressed:()=>false},
  };
  vm.createContext(c);function load(file){const p=path.join(root,file);if(fs.existsSync(p))vm.runInContext(fs.readFileSync(p,'utf8'),c);}
  load('data/personal.js');
  if(typeof c.ssAcceptPersonal==='function')c.ssAcceptPersonal(null,{personal:c.ssState.personal});
  return {c,sent,load,tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},
    accept(r,personal,ok=true){c.ssAcceptPersonal(r,{personal:c.ssState.personal,response:{ok,personal}});}};
}
const item=(id,title=id)=>({id,title,artist:'歌手',album:'专辑',duration:123});

test('personal library defaults off and does not query, mutate or reserve list space while disabled',()=>{
 const h=harness(false),c=h.c;h.load('views/personal.js');
 assert.equal(c.ssPersonalEnabled(),false);assert.equal(c.ssPersonalGutter(),0);
 c.ssOpenPersonal('history');c.ssPersonalSet('favorites',['a'],true);c.ssPersonalVisible(['a']);h.tick();
 assert.equal(c.view,'home');assert.equal(h.sent.length,0);
 c.HB_PERSONAL_ACTIONS=[{track_id:'stale'}];c.HB_TR=[{track_id:'a',favoriteX:100}];c.ssDrawPersonalRowActions({});
 assert.equal(c.HB_PERSONAL_ACTIONS.length,0);assert.equal(h.sent.length,0);
 c.ssState=null;assert.equal(c.ssPersonalEnabled(),false,'startup without a state must stay hidden');
});

test('turning the feature off exits its page and discards pending gestures and late responses',()=>{
 const h=harness(),c=h.c;c.ssOpenPersonal('history');const request=h.sent[0];
 c.ssPersonalVisible(['a']);c.ssPersonalPressed={track_id:'a'};c.ssState.personal.enabled=false;
 c.ssAcceptPersonal(null,{personal:c.ssState.personal});h.tick();
 assert.equal(c.view,'home');assert.equal(c.ssPersonalPressed,null);assert.equal(c.ssPersonal.request,'');assert.equal(c.ssPersonal.items.length,0);
 h.accept(request,{kind:'history',offset:0,total:1,revision:1,items:[item('a')]});assert.equal(c.ssPersonal.items.length,0);assert.equal(h.sent.length,1);
 c.ssState.personal.enabled=true;c.ssAcceptPersonal(null,{personal:c.ssState.personal});c.ssOpenPersonal('favorites');
 assert.equal(h.sent.at(-1).kind,'favorites');assert.equal(c.ssPersonalGutter(),32);
});

test('disabled state refreshes leave ordinary playlist selection and dragging intact',()=>{
 const h=harness(false),c=h.c;let invalidated=0;c.view='playlist';c.ssInvalidateSelections=()=>invalidated++;
 c.ssAcceptPersonal(null,{personal:c.ssState.personal});c.ssAcceptPersonal(null,{personal:c.ssState.personal});
 assert.equal(invalidated,0,'disabled snapshots must not reset the existing list interaction');
});
test('browsing requests only one bounded page and never changes playback source',()=>{
  const h=harness();assert.equal(typeof h.c.ssOpenPersonal,'function','personal data module must exist');
  h.c.ssOpenPersonal('history');assert.equal(h.c.view,'history');assert.deepEqual(JSON.parse(JSON.stringify(h.sent)),[{op:'personal_list',id:'r1',kind:'history',offset:0,limit:50}]);
  h.accept(h.sent[0],{kind:'history',offset:0,total:10000,revision:1,items:[item('a')]});
  assert.equal(h.c.ssPersonal.items[0].title,'a');assert.equal(h.c.ssPersonal.total,10000);
  h.c.ssPersonalPage(1);assert.equal(h.sent.at(-1).offset,50);assert.equal(h.c.ssPersonal.items.length,0,'hide old page while loading');
});
test('late view and page responses cannot overwrite current data; failures clear old rows',()=>{
  const h=harness();h.c.ssOpenPersonal('history');const old=h.sent[0];h.c.ssOpenPersonal('favorites');const current=h.sent[1];
  h.accept(old,{kind:'history',offset:0,total:1,revision:1,items:[item('old')]});assert.equal(h.c.ssPersonal.items.length,0);
  h.accept(current,{kind:'favorites',offset:0,total:1,revision:1,items:[item('new')]});assert.equal(h.c.ssPersonal.items[0].id,'new');
  h.c.ssPersonalReload();h.accept(h.sent.at(-1),null,false);assert.equal(h.c.ssPersonal.items.length,0);assert.ok(h.c.ssPersonal.error);
});
test('summary revision invalidates pages and coalesces refresh while the old page is in flight',()=>{
  const h=harness();h.c.ssOpenPersonal('history');const old=h.sent[0];h.c.ssState.personal.revision=2;
  h.c.ssAcceptPersonal(null,{personal:{revision:2}});h.c.ssAcceptPersonal(null,{personal:{revision:2}});
  assert.equal(h.sent.length,1,'do not queue duplicate pages behind in-flight response');
  h.accept(old,{kind:'history',offset:0,total:1,revision:1,items:[item('old')]});
  assert.equal(h.c.ssPersonal.items.length,0);assert.equal(h.sent.length,2);
  h.accept(h.sent[1],{kind:'history',offset:0,total:1,revision:2,items:[item('fresh')]});assert.equal(h.c.ssPersonal.items[0].id,'fresh');
});
test('visible flags are batched, cached by revision and stale responses are rejected',()=>{
  const h=harness();h.c.ssPersonalVisible(['a','a','b']);h.c.ssPersonalVisible(['b','a']);h.tick();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].op,'personal_flags');assert.deepEqual(Array.from(h.sent[0].tracks).sort(),['a','b']);
  const req=h.sent[0];h.c.ssAcceptPersonal(req,{personal:{revision:1},response:{ok:true,personal_flags:[{id:'a',favorite:true,later:false},{id:'b',favorite:false,later:true}]}});
  assert.equal(h.c.ssPersonalFlag('a').favorite,true);h.c.ssPersonalVisible(['a','b']);h.tick();assert.equal(h.sent.length,1);
  h.c.ssAcceptPersonal(null,{personal:{revision:2}});h.c.ssPersonalVisible(['a']);h.tick();const second=h.sent.at(-1);
  h.c.ssAcceptPersonal(second,{personal:{revision:3},response:{ok:true,personal_flags:[{id:'a',favorite:true,later:true}]}});
  assert.equal(h.c.ssPersonalFlag('a').favorite,false,'old revision must not restore membership');
});
test('set actions deduplicate batch tracks and single-song toggles remain atomic',()=>{
  const h=harness();h.c.ssPersonalSet('favorites',['a','a','b'],true);assert.deepEqual(Array.from(h.sent[0].tracks),['a','b']);assert.equal(h.sent[0].value,true);
  h.c.ssPersonalSet('later',['a']);assert.equal('value' in h.sent[1],false);h.c.ssPersonalSet('later',['a','b']);assert.equal(h.sent.length,2);
});
test('personal IDs support selection, batch native context and queue playback without SDK handles',()=>{
  const h=harness();h.load('ui/selection.js');h.load('data/selection_host.js');h.c.ssOpenPersonal('history');
  h.accept(h.sent[0],{kind:'history',offset:0,total:2,revision:1,items:[Object.assign(item('file|0'),{event_id:1}),Object.assign(item('file|0'),{event_id:2})]});
  h.c.HB_TR=[{personal:true,idx:0,track_id:'file|0',x0:0,y0:0,x1:450,y1:56},{personal:true,idx:1,track_id:'file|0',x0:0,y0:56,x1:450,y1:112}];
  h.c.ssMainSelectionContext();assert.equal(h.c.ssSelectContext.writable,false);assert.notEqual(h.c.ssSelectContext.items[0],h.c.ssSelectContext.items[1]);
  h.c.ssMainSelect.start({index:1,x:1,y:60});h.c.ssMainSelect.end(1,60);const payload=h.c.ssSelectionPayload(h.c.HB_TR[1]);assert.deepEqual(Array.from(payload.tracks),['file|0']);
  h.c.ssEnqueueRow(h.c.HB_TR[0]);assert.equal(h.sent.at(-1).op,'queue_add');assert.equal(h.sent.at(-1).play,true);assert.equal(h.sent.at(-1).tracks[0],'file|0');
});
test('personal rendering uses native metadata and a clipped cached viewport with no fake cover handles',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c,text=[],covers=[],viewports=[];
  Object.assign(c,{COL:{},FONT:{},ssRowHover:()=>false,tL:(g,t)=>text.push(t),tC:(g,t)=>text.push(t),tR:(g,t)=>text.push(t),fmtTime:String,drawIcon(){},
    drawCover:(g,x,y,s,r,handle)=>{covers.push(handle);assert.ok(handle&&handle.RawPath);},
    ssBeginViewport:(key,g,x,y,w,z)=>{viewports.push({y,h:z});return {gr:g,finish(){}};},ssDrawCachedRow:(g,key,x,y,w,z,draw)=>draw(g),drawScrollbar(){},hv:()=>false});
  c.ssOpenPersonal('history');h.accept(h.sent[0],{kind:'history',offset:0,total:2,revision:1,items:[Object.assign(item('missing|0','原生标题'),{started_at:1700000000,outcome:'skipped',qualified:false})]});
  const gr=new Proxy({},{get:()=>()=>{}});c.drawPersonal(gr,c.R.main);assert.ok(text.includes('原生标题'));assert.ok(text.some(t=>String(t).includes('已跳过')));assert.equal(covers.length,0);
  assert.equal(viewports.length,1);assert.ok(viewports[0].y+viewports[0].h<=400);assert.equal(c.HB_TR.length,1);assert.ok(c.HB_TR[0].y1<=400);
});
test('narrow history rows reserve separate lines for outcome and event time',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c,labels=[];
  Object.assign(c,{COL:{},FONT:{},ssRowHover:()=>false,tL:(g,t,f,col,x,y,w,z)=>labels.push({t,y,w,h:z}),tC(){},tR(){},fmtTime:String,drawIcon(){},
    ssBeginViewport:(key,g)=>({gr:g,finish(){}}),ssDrawCachedRow:(g,key,x,y,w,z,draw)=>draw(g),drawScrollbar(){},hv:()=>false});
  c.R.main.w=310;c.ssOpenPersonal('history');h.accept(h.sent[0],{kind:'history',offset:0,total:1,revision:1,items:[Object.assign(item('a'),{started_at:1700000000,outcome:'interrupted'})]});
  c.drawPersonal(new Proxy({},{get:()=>()=>{}}),c.R.main);const outcome=labels.find(l=>String(l.t).startsWith('播放中断')),date=labels.find(l=>/^2023-/.test(l.t));
  assert.ok(outcome,'outcome must lead its own visible line');assert.ok(date,'timestamp must retain its own visible line');assert.ok(outcome.y+outcome.h<=date.y);
});
test('real app callbacks give heart presses their own gesture and preserve personal row double-click',()=>{
  const h=harness(),c=h.c;h.load('ui/selection.js');h.load('data/selection_host.js');
  Object.assign(c.window,{Width:1100,Height:740,GetProperty:(k,d)=>d});const source=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(source.slice(0,source.lastIndexOf('\nlayout();')),c);
  Object.assign(c,{ssPopup:null,ssModal:false,ctxMenu:null,confirmDel:null,renameEdit:null,sgMenuOpen:false,plSortMenuOpen:false,vizMenuOpen:false,dupPrompt:null,rgPrompt:null,
    SS_ARTIST_HB:null,SS_LYRIC_BTN:null,SS_QUEUE_SB:null,ssPointerDown:()=>false,ssPointerUp:()=>false,ssResizeBegin:()=>false,ssResizeEnd:()=>false,ssRecycleClick:()=>false,ssPopupClick:()=>false,
    HB_SG:null,HB_RGNORM:null,HB_PLSORT:null,HB_PLSORTDIR:null,HB_ALLSONGS:null,TBH:32,
    inRect:(x,y,r)=>x>=r.x0&&x<r.x1&&y>=r.y0&&y<r.y1,hit:(a,x,y)=>a.find(r=>c.inRect(x,y,r)),
    ssSelectionDown(){throw Error('heart must not initiate row drag');},ssSelectionUp:()=>false});
  c.repaintAll=()=>{};c.HB_PERSONAL_ACTIONS=[{x0:400,y0:100,x1:428,y1:128,track_id:'a',kind:'favorites'}];
  c.HB_TR=[{personal:true,idx:0,track_id:'a',x0:10,y0:80,x1:460,y1:140,pgx0:10,pgx1:38}];
  c.on_mouse_lbtn_down(410,110);c.on_mouse_lbtn_up(410,110);assert.equal(h.sent.at(-1).op,'personal_set');assert.equal('value' in h.sent.at(-1),false);
  const count=h.sent.length;c.on_mouse_lbtn_dblclk(410,110);assert.equal(h.sent.length,count,'double-click heart cannot play');
  c.on_mouse_lbtn_dblclk(100,110);assert.equal(h.sent.at(-1).op,'queue_add');assert.equal(h.sent.at(-1).play,true);
  c.on_mouse_lbtn_down(410,110);c.on_mouse_lbtn_up(500,200);assert.equal(h.sent.length,count+1,'release outside cancels toggle');
  c.ssState.source='another-playlist';c.on_mouse_lbtn_up(20,110);
  assert.equal(h.sent.at(-1).op,'queue_add','personal play glyph must resolve across playback sources without a handle');
  assert.deepEqual(Array.from(h.sent.at(-1).tracks),['a']);assert.equal(h.sent.at(-1).play,true);
});
test('personal cached row origins and heights align to pixels at fractional density',()=>{
 const h=harness();h.load('views/personal.js');const c=h.c;
 Object.assign(c,{COL:{},FONT:{},ssDensity:1.25,ssRowHover:()=>false,tL(){},tC(){},tR(){},fmtTime:String,drawIcon(){},ssBeginViewport:(key,g)=>({gr:g,finish(){}}),ssDrawCachedRow:(g,key,x,y,w,z,draw)=>draw(g),drawScrollbar(){},hv:()=>false});
 c.R.main.w=310;c.ssOpenPersonal('history');h.accept(h.sent[0],{kind:'history',offset:0,total:2,revision:1,items:[Object.assign(item('a'),{event_id:1}),Object.assign(item('b'),{event_id:2})]});c.drawPersonal(new Proxy({},{get:()=>()=>{}}),c.R.main);
 assert.ok(c.HB_TR.length>0);assert.ok(c.HB_TR.every(r=>Number.isInteger(r.rowH)&&Number.isInteger(r.rowY)),'cached rows must not move through half-pixel origins');
});

test('favorite icons use cached vector icons rather than depending on a text font heart glyph',()=>{
  const h=harness();h.load('views/personal.js');let names=[];Object.assign(h.c,{COL:{green:1,text2:2},FONT:{},tC(){},drawIcon:(g,n)=>names.push(n)});
  h.c.ssDrawPersonalHeart({},0,0,28,false);h.c.ssDrawPersonalHeart({},0,0,28,true);assert.deepEqual(names,['heart','heartFilled']);
});
test('pending membership timer is released when the theme unloads',()=>{
  const h=harness();h.c.ssPersonalVisible(['a']);assert.equal(typeof h.c.ssStopPersonal,'function');h.c.ssStopPersonal();h.tick();assert.equal(h.sent.length,0);
});
test('narrow resizable sidebar gives all three personal views distinct bounded targets',()=>{
  const h=harness();h.load('views/nav.js');const c=h.c;
  Object.assign(c,{COL:{},FONT:{},M:{radius:10},R:{navTop:{x:8,y:40,w:156,h:72},navLib:{x:8,y:128,w:156,h:370}},
    plman:{ActivePlaylist:0},panelBg(){},hv:()=>false,drawIcon(){},tL(){},tC(){},tR(){},visiblePlaylists:()=>[],
    navScroll:0,navScrollT:0,navRevealPl:-1,drawLibCover(){},fmtNum:String,libCount:()=>0,drawScrollbarN(){},drag:null});
  c.drawAddPlaylist=()=>{};c.drawNav(new Proxy({},{get:()=>()=>{}}));assert.deepEqual(Array.from(c.HB_PERSONAL,h=>h.kind),['history','favorites','later']);
  for(let i=0;i<3;i++){const b=c.HB_PERSONAL[i];assert.ok(b.x0>=8&&b.x1<=164&&b.y1<=498-72);if(i)assert.ok(c.HB_PERSONAL[i-1].y1<=b.y0);}
});
test('personal cover resolution reuses library handles without building the full text search index during paint',()=>{
  const h=harness(),handle={RawPath:'file://a',SubSong:0},library=[handle];library.Count=1;
  h.c.libItems=()=>library;h.c.ssTrackID=x=>x.RawPath+'|'+x.SubSong;let builds=0;h.c.getSearchIdx=()=>{builds++;return [];};
  assert.equal(h.c.ssPersonalHandle('file://a|0'),handle);assert.equal(h.c.ssPersonalHandle('missing|0'),null);assert.equal(builds,0);
});
test('same-revision live history merges the exact event without page reloads or invalidating membership',()=>{
  const h=harness(),c=h.c;c.ssPersonalVisible(['a']);h.tick();
  c.ssAcceptPersonal(h.sent[0],{personal:{revision:1},response:{ok:true,personal_flags:[{id:'a',favorite:true,later:true}]}});
  c.ssOpenPersonal('history');h.accept(h.sent.at(-1),{kind:'history',offset:0,total:2,revision:1,items:[
    Object.assign(item('a'),{event_id:10,listened:0,outcome:'playing',qualified:false}),Object.assign(item('a'),{event_id:9,listened:1,outcome:'skipped',qualified:false})]});
  const count=h.sent.length;c.ssAcceptPersonal(null,{personal:{revision:1,current:Object.assign(item('a'),{event_id:10,listened:61,outcome:'playing',qualified:true})}});h.tick();
  assert.equal(c.ssPersonal.items[0].listened,61);assert.equal(c.ssPersonal.items[0].qualified,true);assert.equal(c.ssPersonal.items[1].listened,1,'same track other event remains independent');
  assert.equal(c.ssPersonalFlag('a').favorite,true);assert.equal(c.ssPersonalFlag('a').later,true);assert.equal(h.sent.length,count,'live progress cannot refetch the page or flags');
});
test('a delayed page reply overlays the latest active event rather than returning progress to zero',()=>{
  const h=harness(),c=h.c;c.ssOpenPersonal('history');const request=h.sent[0];
  c.ssAcceptPersonal(null,{personal:{revision:1,current:Object.assign(item('a'),{event_id:10,listened:42,qualified:true,outcome:'playing'})}});
  c.ssAcceptPersonal(request,{personal:{revision:1,current:Object.assign(item('a'),{event_id:10,listened:1,qualified:false,outcome:'playing'})},response:{ok:true,personal:{kind:'history',offset:0,total:1,revision:1,items:[Object.assign(item('a'),{event_id:10,listened:0,qualified:false,outcome:'playing'})]}}});
  assert.equal(c.ssPersonal.items[0].listened,42);assert.equal(c.ssPersonal.items[0].qualified,true);assert.equal(h.sent.length,1);
  c.ssAcceptPersonal(null,{personal:{revision:1,current:null}});
  c.ssPersonalReload();h.accept(h.sent.at(-1),{kind:'history',offset:0,total:1,revision:1,items:[Object.assign(item('a'),{event_id:10,listened:45,qualified:true,outcome:'stopped'})]});
  assert.equal(c.ssPersonal.items[0].outcome,'stopped','finished events cannot retain the cached playing state');
});
test('personal page membership prefetch covers all bounded page items and deduplicates IDs',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c;c.ssOpenPersonal('history');
  h.accept(h.sent[0],{kind:'history',offset:0,total:50,revision:1,items:Array.from({length:50},(_,i)=>Object.assign(item('t'+(i%40)),{event_id:i}))});
  c.HB_TR=[{personal:true,idx:0,track_id:'t0'}];c.ssDrawPersonalRowActions({});h.tick();
  const request=h.sent.at(-1);assert.equal(request.op,'personal_flags');assert.equal(request.tracks.length,40,'prefetch the whole page rather than only the visible item');assert.equal(new Set(request.tracks).size,40);
  c.ssAcceptPersonal(request,{personal:{revision:1},response:{ok:true,personal_flags:Array.from(request.tracks,id=>({id,favorite:false,later:false}))}});
  const count=h.sent.length;for(let i=1;i<35;i++){c.HB_TR=[{personal:true,idx:i,track_id:'t'+(i%40)}];c.ssDrawPersonalRowActions({});h.tick();}assert.equal(h.sent.length,count);
});
test('playlist membership prefetch follows display order and reuses SDK identity windows while scrolling',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c;let reads=0;
  const handles=Array.from({length:5000},(_,i)=>({get RawPath(){reads++;return 'file://'+i;},SubSong:0}));
  let order=Array.from({length:5000},(_,i)=>4999-i);c.view='playlist';c.getItems=()=>handles;c.getPlOrder=()=>order;c.ssTrackID=x=>x.RawPath+'|'+x.SubSong;
  function draw(start){c.HB_TR=Array.from({length:8},(_,i)=>({pl:3,item:order[start+i],displayIndex:start+i}));c.ssDrawPersonalRowActions({});h.tick();}
  function ack(){const request=h.sent.at(-1);assert.equal(request.op,'personal_flags');assert.ok(request.tracks.length<=256);assert.equal(new Set(request.tracks).size,request.tracks.length);c.ssAcceptPersonal(request,{personal:{revision:c.ssPersonalRevision},response:{ok:true,personal_flags:Array.from(request.tracks,id=>({id,favorite:false,later:false}))}});}
  draw(80);const first=h.sent.at(-1);assert.equal(first.tracks[0],'file://4919|0','visible IDs lead the request');assert.ok(first.tracks.includes('file://4930|0'),'prefetch before the viewport');assert.ok(first.tracks.includes('file://4800|0'),'prefetch after the viewport');ack();
  const initialReads=reads,count=h.sent.length;for(let i=81;i<170;i++)draw(i);assert.equal(h.sent.length,count,'new rows inside the prepared window cannot create per-row queries');assert.equal(reads,initialReads,'frames within one window cannot reread 256 SDK identities');
  draw(300);ack();assert.ok(reads>initialReads&&reads<=initialReads+256,'window transition reads only a bounded batch');
  const beforeSort=reads;order=order.slice().reverse();draw(300);assert.ok(reads>beforeSort,'display order identity invalidates the window');ack();
  const beforeRevision=reads;c.ssAcceptPersonal(null,{personal:{revision:2}});draw(300);assert.ok(reads>beforeRevision,'personal revision rebuilds the cached window');ack();
});
test('all-songs membership prefetch handles grouped display track indices without repeated identity work',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c;let reads=0;c.view='songs';c.songsGroup='both';
  c.songsTracks=Array.from({length:600},(_,i)=>({h:{get RawPath(){reads++;return 's'+i;},SubSong:0}}));c.ssTrackID=x=>x.RawPath+'|'+x.SubSong;
  c.HB_TR=[{songs:true,ti:160},{songs:true,ti:161}];c.ssDrawPersonalRowActions({});h.tick();const request=h.sent.at(-1);
  assert.equal(request.tracks.length,256);assert.ok(request.tracks.includes('s120|0')&&request.tracks.includes('s300|0'));c.ssAcceptPersonal(request,{personal:{revision:1},response:{ok:true,personal_flags:Array.from(request.tracks,id=>({id,favorite:false,later:false}))}});
  const initial=reads,count=h.sent.length;for(let i=162;i<220;i++){c.HB_TR=[{songs:true,ti:i}];c.ssDrawPersonalRowActions({});h.tick();}assert.equal(reads,initial);assert.equal(h.sent.length,count);
});
test('visible identities take priority over a full prefetch window and newly exposed unknown tracks remain queryable',()=>{
  const h=harness();h.load('views/personal.js');const c=h.c;c.view='favorites';c.ssPersonal.kind='favorites';c.ssPersonal.items=Array.from({length:50},(_,i)=>item('p'+i));
  c.HB_TR=[{personal:true,idx:0,track_id:'just-changed'}];c.ssDrawPersonalRowActions({});h.tick();const request=h.sent.at(-1);
  assert.equal(request.tracks[0],'just-changed');assert.ok(request.tracks.includes('p49'));assert.equal(new Set(request.tracks).size,request.tracks.length);
  c.ssAcceptPersonal(request,{personal:{revision:1},response:{ok:true,personal_flags:Array.from(request.tracks,id=>({id,favorite:false,later:false}))}});
  c.ssPersonalVisible(['new-visible'],Array.from({length:300},(_,i)=>'prefetch'+i));h.tick();const next=h.sent.at(-1);
  assert.equal(next.tracks[0],'new-visible');assert.equal(next.tracks.length,256);assert.equal(new Set(next.tracks).size,256);
});
console.log(passed+' personal UI checks passed');
