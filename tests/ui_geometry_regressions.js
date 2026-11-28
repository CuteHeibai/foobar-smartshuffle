'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../theme/verdant');let count=0,failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);count++;}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
function context(){
 const timers=new Map();let serial=0,now=0;
 const c={console,Math,JSON,Number,isFinite,Date:{now:()=>now},UISCALE:2,SS_BASE_UI_SCALE:2,ssDensity:1,H:780,TBH:32,window:{Width:1180,Height:780,GetProperty:(k,d)=>d,SetProperty(){},SetTimeout(fn){timers.set(++serial,fn);return serial;},ClearTimeout(id){timers.delete(id);},SetInterval:()=>++serial,ClearInterval(){},Repaint(){},RepaintRect(){}},
 fb:{ProfilePath:'P:\\',IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:-10},plman:{ActivePlaylist:0},utils:{},
 gdi:{Font:(Name,Size,Style)=>({Name,Size,Style}),CreateImage:(Width,Height)=>({Width,Height,GetGraphics:()=>graphics(),ReleaseGraphics(){}})},
 repaintAll(){},applyKeyMode(){},repaintBar(){},repaintMain(){},repaintQueue(){},repaintNav(){},drawIcon(){},drawCover(){},
 DLGC_WANTCHARS:128,fsMode:false,ssModal:false,ssPopup:null,ssResizeMove:()=>false,ssPopupMove:()=>false,ssPointerMove:()=>false,ssPopupWheel:()=>false,
 ssSend(){},ssOutputError:'',ssError:'',vol2pos:()=>.5,ssPlaylistInfo:()=>null};vm.createContext(c);
 function load(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);}
 load('core/tokens.js');load('core/util.js');load('core/corners.js');load('ui/motion.js');load('ui/hover.js');load('ui/viewport.js');load('ui/selection.js');load('data/selection_host.js');
 function app(){let text=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(text.slice(0,text.lastIndexOf('\nlayout();')),c);c.dupPrompt=c.rgPrompt=null;c.sgMenuOpen=c.plSortMenuOpen=c.vizMenuOpen=false;}
 return {c,load,app,advance(ms){now+=ms;},tick(ms){now+=ms;c.scrollTick();},flush(){let jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
function graphics(){return {SetTextRenderingHint(){},SetSmoothingMode(){},SetInterpolationMode(){},CalcTextHeight:(s,f)=>f.Size*1.3,CalcTextWidth:(s,f)=>Array.from(String(s)).length*f.Size*.9,MeasureString(s,f){return {Width:this.CalcTextWidth(s,f)};},DrawString(){},DrawImage(){},FillSolidRect(){},FillRoundRect(){},FillPolygon(){},DrawPolygon(){},FillEllipse(){},DrawEllipse(){},DrawLine(){},DrawRect(){}};}
test('both library lists reserve a four-digit number column even before reaching 1000 tracks',()=>{
 const {c,load}=context();load('views/cards.js');
 for(const scale of [1,1.25])assert.equal(c.ssTrackNumberWidth(scale,99),c.ssTrackNumberWidth(scale,9999));
});
test('a cramped module label keeps a readable font and fades its original text at the edge',()=>{
 const {c}=context(),called=[],raster=graphics(),g=graphics(),text='A long title 全部歌曲 that exceeds the pane';
 c.UISCALE=1;c.FONT=c.ssCreateFonts();
 assert.ok(c.FONT.plSub.Size>=12&&c.FONT.qArtist.Size>=12);
 assert.equal(c.ssFitFont(g,c.FONT.rowTitle,8).Size,12);
 c.ssPaneTextFade=true;
 raster.DrawString=(label,font,col,x,y,w,h,flags)=>called.push({label,font,flags});
 c.gdi.CreateImage=(w,h)=>({GetGraphics:()=>raster,ReleaseGraphics(){}});
 const copies=[];g.DrawImage=(...a)=>copies.push(a);
 c.tL(g,text,c.FONT.rowTitle,c.COL.text,15,20,118,21);
 assert.ok(called.length>0);
 assert.ok(called.every(entry=>!entry.label.includes('…')&&(entry.flags>>>20&15)===0&&entry.font.Size>=12));
 assert.ok(copies.length>3&&copies.at(-1)[10]<copies.at(-2)[10]);
 assert.ok(copies.every(a=>a[3]===a[7]&&a[4]===a[8]&&a[1]+a[3]<=133),'every piece is a 1:1 source copy inside the label');
});
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
 const {c,load}=context();load('views/queue.js');load('views/preference.js');c.R={};c.UISCALE=1;c.pbShuffle=true;c.ssState={remaining:Array.from({length:30},(_,i)=>({id:'t'+i,title:'song'+i})),queue:[{id:'manual',title:'Manually queued'}]};c.ssQueueScroll=c.ssQueueScrollT=40;c.HB_Q=[];c.qRow=(g,r,x,y,rh)=>({x0:x,y0:y,x1:r.x+r.w,y1:y+rh});c.tL=()=>{};c.drawSBV=()=>null;c.SB_QUEUE={};c.hv=()=>false;c.drag=null;
 const marks=[];c.ssDrawQueueTrackLabels=(g,title,artist,x,y,w,h)=>{marks.push({title,x,y,w,h});};
 c.NP=null;c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:600},18,150,580);
 assert.equal(c.HB_Q[0].track_id,'manual','partially visible priority item must remain');assert.ok(c.HB_Q[0].y0>c.HB_Q[0].rowY);assert.equal(c.HB_Q.at(-1).y1,580,'last partial row stays clipped and hittable');
 assert.deepEqual(Array.from(c.HB_Q.filter(row=>row.next),row=>row.track_id),['manual'],'only the first upcoming item is marked next');
 assert.equal(c.HB_Q[0].rowH,c.HB_Q[1].rowH,'the next cue shares the row instead of stacking a heading above it');
 const next=marks.find(m=>m.title==='Manually queued');assert.ok(next);assert.equal(next.x,marks.find(m=>m.title==='song0').x,'all titles start on the same column');
 assert.deepEqual(Array.from(c.HB_Q.slice(0,3),row=>[row.scope,row.queueIndex]),[['priority',0],['remaining',0],['remaining',1]]);
 c.R.queue={x:0,w:300};c.ssQueueSelectionContext(c.HB_Q[0]);
 const {x0,y0}=c.HB_Q[0];c.ssQueueSelect.start({x:x0+1,y:y0+1,index:0});c.ssQueueSelect.end(x0+1,y0+1);
 assert.ok(c.ssQueueRowSelected(c.HB_Q[0]));assert.ok(!c.ssQueueRowSelected(c.HB_Q[1]));
 assert.ok(!c.ssQueueRowSelected({...c.HB_Q[0],track_id:'replacement'}),'a changed track cannot inherit the selection');
});

test('replaying overlapping album tracks counts identities once across both queue sections',()=>{
 const {c,load}=context();load('views/queue.js');load('views/preference.js');
 c.R={};c.NP=null;c.HB_Q=[];c.hv=()=>false;c.drawSBV=()=>null;c.SB_QUEUE={};c.drag=null;
 const row=id=>({id,title:'Same title',artist:'Artist'}),totals=[]; c.ssDrawQueueTrackLabels=()=>{};
 c.tL=(g,label)=>{if(/^\d+ 首$/.test(label))totals.push(label);};
 c.tR=()=>{};
 for(const shuffle of [true,false]){
  c.pbShuffle=shuffle;
  const auto=['a|0','b|0','b|1'].map(row);
  c.ssState={queue:['a|0','a|0','b|0'].map(row),remaining:auto,native_next:auto.map((r,i)=>({...r,playlist:2,item:i}))};
  c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:700},18,150,680);
  assert.equal(totals.pop(),'3 首');
 }
});

test('queue actions outside a clipped row ignore the pointer',()=>{
 const {c}=context();
 const hidden={x0:170,y0:204,x1:195,y1:224};
 c.HB_Q=[{x0:18,y0:224,x1:220,y1:249,more:hidden}];
 assert.equal(c.ssQueueActionAt(180,215),null);
});
test('queue rows share one visible action column and give manual titles the same width',()=>{
 const {c,load}=context();load('views/queue.js');load('views/preference.js');c.R={};c.UISCALE=1;c.pbShuffle=true;
 c.ssState={remaining:[{id:'a',title:'A'},{id:'b',title:'B'}],queue:[{id:'m',title:'Manual'}],remaining_count:2};c.ssQueueScroll=c.ssQueueScrollT=0;c.HB_Q=[];
 c.drawSBV=()=>null;c.SB_QUEUE={};c.hv=()=>false;c.drag=null;c.NP={};const words=[],icons=[],marks=[];
 c.tL=c.tR=c.tC=(g,s)=>words.push(s);c.drawIcon=(g,name,col,x,y,w,h)=>icons.push({name,x,y,w,h});c.ssDrawQueueTrackLabels=(g,title,artist,x,y,w,h,metrics,next)=>marks.push({title,x,w,next});c.ssDrawCachedRow=(g,k,x,y,w,h,draw)=>draw(g);
 c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:600},18,150,580);
 assert.equal(c.HB_Q.length,3);
 assert.ok(c.HB_Q[0].more.x1-c.HB_Q[0].more.x0>=34);
 for(const row of c.HB_Q){assert.ok(row.more,'every queue row exposes a more button');assert.ok(icons.some(i=>i.name==='more'&&i.x>=row.more.x0&&i.x+i.w<=row.more.x1+1&&i.y>=row.more.y0-1));}
 assert.ok(c.HB_Q.every(row=>!row.remove));
 assert.ok(icons.every(icon=>icon.name!=='close'));
 for(const m of marks){const row=c.HB_Q.find(r=>m.title.endsWith(r.track_id==='m'?'Manual':r.track_id.toUpperCase()));assert.ok(m.x+m.w<=row.more.x0,'labels end before the action button');}
 assert.ok(words.includes('长按拖动排序'),'the header explains how to start a reorder');
 assert.ok(words.includes('手动待播')&&words.includes('智能随机 · 本轮剩余'),'each source has a visible section heading');
 assert.ok(words.includes('1 首')&&words.includes('2 首')&&words.includes('3 首'),'section counts are distinct from the total');
 assert.equal(marks[0].x,marks[1].x);assert.equal(marks[0].w,marks[1].w);assert.equal(marks[0].next,true);
 c.HB_Q=[];words.length=0;c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:420,h:600},18,150,580);
 assert.ok(!words.includes('移除'),'wide drawers also use one button per row');
});
test('the queue row menu offers safe removal only for the matching manual item',()=>{
 const {c,load}=context();load('ui/menus.js');
 c.W=1180;c.ssPoll=()=>{};c.ssSend=()=> 'request';
 const removed=[];c.ssRemoveQueueRow=row=>{removed.push(row.track_id);return true;};c.repaintQueue=()=>{};
 const manual={scope:'priority',track_id:'manual',queueIndex:1};
 c.ssOpenQueueMenu(manual,22,80);
 const remove=c.ssPopup.levels[0].items.find(item=>item.label==='从待播队列移除');
 assert.ok(remove,'removal is available immediately from the only row button');
 c.ssAcceptMenu({id:'request'}, {response:{ok:false,message:'无法读取曲目菜单'}});
 c.ssPopupChoose(c.ssPopup.levels[0].items.find(item=>item.label===remove.label));
 assert.deepEqual(removed,['manual']);
 c.ssOpenQueueMenu({...manual,scope:'remaining'},22,80);
 assert.ok(!c.ssPopup.levels[0].items.some(item=>item.label===remove.label));
});
test('queue remove button drops the matching manual queue entry',()=>{
 const {c,load}=context();load('views/queue.js');load('data/playback.js');const removed=[];
 c.plman.GetPlaybackQueueContents=()=>[{Handle:{Path:'x',RawPath:'x',SubSong:0}},{Handle:{Path:'y',RawPath:'y',SubSong:0}}];c.plman.RemoveItemFromPlaybackQueue=i=>removed.push(i);
 c.ssState={queue:[{id:'x|0'},{id:'y|0'}]};
 c.HB_Q=[{scope:'priority',track_id:'y|0',queueIndex:1}];
 assert.ok(c.ssRemoveQueueRow(c.HB_Q[0]));assert.deepEqual([...removed],[1]);
 assert.ok(!c.ssRemoveQueueRow({scope:'remaining',track_id:'y|0',queueIndex:0}));
});
test('long queue titles wrap before routing actions and retain the artist and next cue',()=>{
 const {c,load}=context();load('views/cards.js');load('views/queue.js');
 const lines=[],gr=graphics(),metrics=c.ssTrackTextMetrics(1,true);
 c.ssDrawFixedLabel=(g,text,font,color,x,y,w,h)=>lines.push({text,x,y,w,h});
 const title='A deliberately long title that needs a second row';
 const height=Math.max(56,metrics.height+metrics.title+4);
 c.ssDrawQueueTrackLabels(gr,title,'Tagged Artist',30,80,285,height,metrics,true);
 assert.equal(lines.length,4);
 assert.equal(lines[0].x,30);assert.equal(lines[1].x,30);
 assert.ok(lines[1].y>lines[0].y);
 assert.equal(lines[2].text,'下一首');assert.equal(lines[3].text,'Tagged Artist');
 assert.ok(lines[3].x>lines[2].x&&lines[3].y===lines[2].y);
 assert.ok(lines.every(line=>line.x+line.w<=315&&line.y>=80&&line.y+line.h<=80+height));
});
test('playlist header play sits below the cover and every row shows play and more',()=>{
 const {c,load}=context();load('data/playback.js');load('views/cards.js');load('views/playlist.js');
 c.M.cpad=24;c.M.artSz=160;c.M.headH=260;c.M.rowH=56;c.ssDensity=1;c.ROW_GATE_MS=0;
 c.activePl=()=>({i:1,name:'B',count:2});c.ensureBuilt=c.gateReady=()=>true;c.metaReady=()=>true;c.metaSteps=c.rowHandlesPl=()=>[];
 c.plChoice=()=>({single:null});c.artHue=()=>1;c.canEditPl=()=>false;c.playingLoc=()=>null;c.npIsShuffleOf=()=>false;
 c.getItems=()=>[{RawPath:'file://A',SubSong:0},{RawPath:'file://B',SubSong:0}];
 c.getMeta=()=>({totalSec:200,title:['Alpha','Beta'],artist:['歌手甲','歌手乙'],album:['同一张很长的专辑名称','同一张很长的专辑名称'],len:['3:00','4:00'],artkey:[0,0]});
 c.getPlOrder=()=>[0,1];c.warmOnce=()=>{};c.firstRow=c.firstRowT=0;c.clampPx=(v)=>v;c.sameHandle=()=>false;c.drawPlCover=()=>{};
 c.PL_SORTS=[['歌手','artist']];c.plSort=0;c.plSortMenuOpen=false;c.drawSortDirBtn=()=>{};c.drawScrollbar=c.drawSortMenu=()=>{};c.plDropHover=false;
 c.drawDropPill=(g,x,y,w,h)=>({x0:x,y0:y,x1:x+w,y1:y+h});c.hv=()=>false;c.drag=null;c.ssDrawCachedRow=(g,k,x,y,w,h,draw)=>draw(g);
 const g=graphics(),icons=[];g.FillGradRect=()=>{};c.drawIcon=(g,name,col,x,y,w,h)=>icons.push({name,x,y,w,h});
 const labels=[];c.tL=c.tR=c.tC=(g,s,f,col,x,y,w,h)=>labels.push({s,x,y,w,h});
 c.ssPersonalGutter=()=>36;c.canEditPl=()=>true;
 let sortEnd;c.drawSortDirBtn=(g,x,y,w)=>{sortEnd=x+w;};
 c.drawPlaylist(g,{x:0,y:0,w:1440,h:900});
 assert.equal(sortEnd,1440-24-36);assert.equal(c.HB_PLADD_FOLDER.x1,sortEnd);
 const play=c.HB_PLAYLIST_PLAY,sort=c.HB_PLSORT,coverBottom=16+160;
 assert.ok(play&&play.label);assert.ok(play.y0>=coverBottom,'header play must sit below the cover, not on it');
 assert.equal(play.x0,24);assert.ok(play.x1-play.x0>=32&&play.y1-play.y0>=32);
 assert.ok(sort.x0>=play.x1,'sort controls follow the play button');
 assert.equal(c.HB_TR.length,2);
 for(const row of c.HB_TR){
  assert.equal(row.playOnHover,true);assert.ok(row.playId);
  assert.ok(row.more&&row.more.x1-row.more.x0>=20&&row.more.y1-row.more.y0>=20,'every row needs a visible more button');
  assert.ok(row.more.x1<=row.x1&&row.more.x0>=row.x0);
 }
 assert.ok(icons.filter(i=>i.name==='more').length>=2,'the more glyph is drawn without hovering');
 assert.ok(!labels.some(l=>l.s==='专辑'),'the album column heading is gone');
 assert.ok(labels.some(l=>String(l.s).includes('同一张很长的专辑名称')),'the album stays readable on the secondary line');
});
test('empty queue omits sorting instructions and names the completed round state',()=>{
 const {c,load}=context();load('views/preference.js');c.R={};c.pbShuffle=true;c.ssState={source:'list',round:42,remaining_count:0,remaining:[],queue:[]};c.ssQueueScroll=c.ssQueueScrollT=0;c.HB_Q=[];c.hv=()=>false;c.drag=null;c.drawSBV=()=>null;c.SB_QUEUE={};const words=[];c.NP={};c.tL=c.tR=(g,s)=>words.push(s);
 c.ssDrawNativeQueue(graphics(),{x:0,y:0,w:300,h:600},18,150,580);
 assert.ok(words.includes('接下来'));assert.ok(words.some(s=>s.includes('本轮已播完')));assert.ok(!words.includes('拖动排序')&&!words.some(s=>/第\s*42\s*轮/.test(s)));
});
test('idle lyrics has an easy to find play action only when a source is ready',()=>{
 const {c,load}=context();load('views/preference.js');load('views/queue.js');c.NP=null;c.rightTab='lyrics';c.R={queue:{x:900,y:40,w:330,h:620}};
 c.panelBg=()=>{};c.hv=()=>false;c.ssHasTransportSource=()=>true;const labels=[];c.tC=c.tL=(g,label)=>labels.push(label);
 c.ssDrawQueueContent(graphics());
 assert.ok(labels.includes('播放音乐')&&labels.includes('播放后在此显示歌词'));
 assert.ok(c.SS_LYRIC_PLAY&&c.SS_LYRIC_PLAY.x1<=1230);
 c.ssHasTransportSource=()=>false;c.ssDrawQueueContent(graphics());
 assert.equal(c.SS_LYRIC_PLAY,null);
});
test('random preferences center the controls in the compact state and expand for real tracks',()=>{
 const {c,load}=context();load('views/preference.js');c.W=1440;c.H=900;c.ssModal=true;c.ssDraft={x:0,y:0};
 c.ssDragging=false;c.ssApplyId=c.ssMessage='';c.ssState={source:'',preview:null};c.ssReady=()=>false;c.hv=()=>false;c.strokeRound=()=>{};c.ssGradientGrid=()=>({});
 const labels=[];c.tL=c.tC=(g,label)=>labels.push(label);
 c.drawPreference(graphics(),true);
 const compact=c.ssGeometry(c.W,c.H);
 assert.ok(compact.w<=560&&Math.abs(compact.grid.x+compact.grid.size/2-c.W/2)<=1);
 assert.ok(labels.includes('播放歌单后即可生成预览'));
 assert.ok(!labels.includes('—')&&!labels.includes('正在等待预览…'));
 assert.deepEqual(Array.from(c.SS_HB,b=>b.act),['balanced','familiar','explore','cancel','apply']);
 assert.equal(c.SS_HB.find(b=>b.act==='apply').enabled,false);
 labels.length=0;c.ssState.preview={tracks:[{title:'one'},{title:'two'}]};
 c.ssDragging=true;assert.equal(c.ssGeometry(c.W,c.H).w,compact.w,'incoming results must not move the grid under the pointer');
 c.ssDragging=false;c.drawPreference(graphics(),true);
 assert.ok(c.ssGeometry(c.W,c.H).w>compact.w);
 assert.ok(labels.includes('播放顺序预览 · 前 2 首')&&labels.includes('two'));
 c.H=420;c.ssState.preview.tracks=Array.from({length:8},(_,i)=>({title:'track '+i}));
 const rows=[];labels.length=0;c.tL=(g,label,font,color,x,y,w,h)=>{labels.push(label);if(label.startsWith('track '))rows.push({y,h});};
 c.drawPreference(graphics(),true);
 assert.ok(rows.length>0&&rows.length<8);
 assert.ok(labels.includes('播放顺序预览 · 前 '+rows.length+' 首'));
 assert.ok(rows.every(row=>row.h>=24));
 assert.ok(rows[rows.length-1].y+rows[rows.length-1].h<=c.ssGeometry(c.W,c.H).presetY);
 assert.ok(!labels.includes('—'));
});
test('all-songs header cover is never erased by a row crop mask and has no scan caption',()=>{
 const {c,load}=context();load('data/playback.js');load('views/cards.js');load('views/songs.js');c.ROW_GATE_MS=0;c.ssDensity=1.25;c.M.cpad=24;c.M.artSz=200;c.SHEAD=320;c.SG_CROP=120;
 c.ensureBuilt=c.gateReady=()=>true;c.songsReady=c.songsSteps=c.rowHandlesSongs=()=>[];c.libChoice=()=>({single:null});c.artHue=()=>1;c.songsGroup='none';c.songsScroll=c.songsScrollT=0;c.songsContentH=70;c.songsTotalSec=1000;c.songsFirstAt=()=>0;c.NP=null;
 c.songsTracks=Array.from({length:214},()=>({}));c.songsRows=[{k:'t',y:0,h:70,n:1,ti:0,t:{title:'Title',artist:'Artist',album:'Album',len:'1:00'}}];c.rgStat={scanned:1,total:214,missing:[1]};c.rgScanFailed=false;c.rgModeOn=()=>false;
 c.drawNormalizePill=c.drawDropPill=()=>null;c.SONGS_GROUPS=[['不分组','none']];c.drawScrollbar=c.drawGroupMenu=()=>{};c.sgMenuOpen=false;c.hv=()=>false;c.drag=null;
 const g=graphics(),fills=[],words=[],labels=[];g.FillGradRect=()=>{};g.FillSolidRect=(x,y,w,h)=>fills.push({x,y,w,h});c.tL=c.tR=c.tC=(g,s,f,col,x,y,w,h)=>{words.push(s);labels.push({s,x,y,w,h});};let cover;c.drawLibCover=(g,x,y,size)=>cover={x,y,size};
 c.SS_APPEARANCE='dark';c.COL=c.ssPalette('dark');c.artHue=()=>c.RGB(255,255,255);
 let header;g.FillGradRect=(x,y,w,h,angle,colour)=>{if(header===undefined)header=colour;};
 const draw=c.drawSongs;
 c.drawSongs=(gr,r)=>{draw(gr,r);assert.ok((header&255)<62,'even white artwork leaves a dark header');};
 c.ssPersonalGutter=()=>45;
 c.drawDropPill=(g,x,y,w)=>({x1:x+w});
 c.drawSongs(g,{x:200,y:40,w:1200,h:800});assert.equal(c.HB_SG.x1,1400-24-45);assert.ok(cover);assert.ok(!words.some(s=>/of 214|tracks scanned/.test(s)));
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
 let alpha=[0,0,0];const g=graphics();g.DrawImage=(im,x,y,w,ht)=>{for(let i=0;i<3;i++)if(y<=i*50&&y+ht>i*50)alpha[i]=0;};g.FillPolygon=(color,mode,points)=>{const ys=points.filter((_,i)=>i%2);for(let i=0;i<3;i++)if(Math.min(...ys)<=i*50&&Math.max(...ys)>i*50)alpha[i]++;};
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
test('Chinese, kana and Latin titles draw with bold heading faces and regular body faces',()=>{
 const {c}=context(),g=graphics(),draws=[];g.DrawString=(s,f)=>draws.push({s,f});
 c.tL(g,'歌曲列表',c.FONT.title,1,0,0,400,80);c.tL(g,'夜に駆ける',c.FONT.title,1,0,100,400,80);
 c.tL(g,'Library',c.FONT.title,1,0,200,400,80);c.tL(g,'English song',c.FONT.rowTitle,1,0,300,400,40);
 assert.deepEqual(draws.map(({f})=>[f.Name,f.Style,f.Size]),[
  ['Microsoft YaHei UI',1,56],['Microsoft YaHei UI',1,56],['Segoe UI',1,56],['Segoe UI',0,28]
 ]);
 const mixed=c.ssTextRuns('夜に駆ける / Racing into the Night',c.FONT.rowTitle);
 assert.equal(mixed.length,2);
 assert.ok(/^夜/.test(mixed[0].text)&&mixed[0].text.endsWith(' '),'kana and the separator stay with the CJK face');
 assert.equal(mixed[1].text,'Racing into the Night');
 assert.deepEqual([...mixed.map(r=>r.font.Name)],['Microsoft YaHei UI','Segoe UI']);assert.deepEqual([...mixed.map(r=>r.font.Style)],[0,0]);
});
test('navigation and menu labels use regular Segoe UI while section headings use bold',()=>{
 const {c}=context(),g=graphics(),draws=[];g.DrawString=(s,f)=>draws.push([s,f.Name,f.Style]);
 const labels={lib:'Library',pl:'Playlist',menuPrimary:'Play',head:'Track',tab:'Queue',sect:'Up Next',sect2:'Albums',card:'Album title',lyric:'Lyrics'};
 for(const [role,label] of Object.entries(labels))c.tL(g,label,c.FONT[role],1,0,0,400,40);
 assert.deepEqual(draws,Object.entries(labels).map(([role,label])=>[label,'Segoe UI',role==='sect'||role==='sect2'||role==='card'?1:0]));
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
 const {c,load}=context();load('ui/layout.js');load('views/bar.js');c.NP={RawPath:'file://test.flac',SubSong:0};c.fb.PlaybackLength=143;c.npTitleStr='A long song title '.repeat(12);c.npArtistStr='An artist '.repeat(10);c.drag=null;c.pbShuffle=true;c.ssState={};c.hv=()=>false;
 const g=graphics(),labels=[];c.tL=c.tR=c.tC=(gr,text,font,color,x,y,w,h)=>labels.push({text,x,y,w,h});
 for(const [width,density] of [[800,.85],[1180,1],[1800,1.25],[2560,1.25]]){
  c.W=width;c.ssDensity=density;c.M.barH=Math.round(96*density);const widths=c.ssLayoutWidths(width);c.R={barY:680,barInfoW:widths.info,barToolsW:widths.tools};labels.length=0;c.drawBar(g);
  const title=labels.find(r=>r.text===c.npTitleStr),prev=c.HB_CTRL.find(h=>h.act==='prev'),next=c.HB_CTRL.find(h=>h.act==='next'),mode=c.HB_CTRL.find(h=>h.act==='playback_mode'||h.act==='player_settings');
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
test('track context promotes playback and properties and preserves native commands',()=>{
 const {c,load}=context();load('ui/menus.js');
 const play={label:'播放',command:17},props={label:'属性',command:28},queue={label:'添加到播放队列',command:19},tools={label:'工具',children:[{label:'组件命令',command:29}]};
 const add={label:'加入待播队列',run(){}},recycle={label:'移到回收站',danger:true,run(){}};
 const items=c.ssTrackContextItems([queue,play,tools,{separator:true},props],[add],[recycle]);
 assert.deepEqual(Array.from(items.filter(item=>!item.separator),item=>item.label),['播放','加入待播队列','属性','音频、文件、标签与工具','移到回收站']);
 const more=items.find(item=>item.drill);assert.ok(more&&more.drill);assert.equal(more.children.find(item=>item.label==='播放与音频').children[0].command,queue.command);
 assert.equal(more.children.find(item=>item.label==='工具与扩展').children[0],tools);assert.equal(items.at(-1),recycle);
 assert.notEqual(items[0].label,add.label);
 c.ssShowPopup(items,50,70,'native-token',true,'context');let command;c.ssSend=(op,args)=>command={op,token:args.token,id:args.command};
 c.ssPopupChoose(tools.children[0]);assert.deepEqual(command,{op:'menu_execute',token:'native-token',id:29});
});
test('playback mode menu enlarges and highlights the selected row on a large screen',()=>{
 const {c,load}=context();load('ui/menus.js');load('views/fullscreen.js');
 c.W=2560;c.H=1440;c.UISCALE=1;c.mx=c.my=-1;c.ssState={enabled:true};c.ssOpen=()=>{};
 const active=[],labels=[],g=graphics();
 c.ssFillContinuousRect=(gr,x,y,w,h,rx,ry,ink)=>{if(ink===c.COL.rowActive&&w>200)active.push({x,y,w,h});};
 c.tL=(gr,text,font)=>labels.push({text,font});
 c.ssShowPlaybackModes(2210,1200,{x0:2160,y0:1290,x1:2350,y1:1325});c.ssDrawPopup(g);
 const current=c.SS_MENU_HB.find(box=>box.item.checked);
 assert.ok(current.x1-current.x0>=240&&current.y1-current.y0>=36);
 assert.ok(active.some(fill=>fill.y===current.y0&&fill.h===current.y1-current.y0));
 assert.ok(labels.find(label=>label.text==='智能随机').font.Size>c.FONT.pl.Size);
});
test('more actions replace the context panel and Back restores its source',()=>{
 const {c,load}=context();load('ui/menus.js');c.W=760;c.H=500;c.UISCALE=1;c.R={barY:410};c.mx=c.my=-1;const g=graphics();
 const more={label:'更多操作',drill:true,children:[{label:'文件与复制',children:[{label:'打开所在文件夹',command:31}]}]};
 c.ssShowPopup([{label:'播放',command:2},more],728,378,'native-token',true,'context');c.ssDrawPopup(g);
 const root=c.ssPopup.levels[0],bounds={...root.rect};assert.ok(bounds.y+bounds.h<c.R.barY);
 let hit=c.SS_MENU_HB.find(h=>h.item===more);c.ssPopupMove(hit.x0+15,hit.y0+10);assert.equal(c.ssPopup.levels.length,1);
 c.ssPopupClick(hit.x0+15,hit.y0+10);c.ssDrawPopup(g);
 assert.equal(c.ssPopup.levels.length,2);assert.equal(c.ssPopup.levels[1].rect.x,bounds.x);assert.ok(c.SS_MENU_HB.every(h=>h.depth===1));
 c.ssPopupKey(40);c.ssPopupKey(39);c.ssDrawPopup(g);assert.equal(c.ssPopup.levels.length,3);
 hit=c.SS_MENU_HB.find(h=>h.back);c.ssPopupClick(hit.x0+15,hit.y0+10);c.ssPopupKey(37);c.ssDrawPopup(g);
 assert.equal(c.ssPopup.levels.length,1);assert.deepEqual({...root.rect},bounds);
});
test('context submenus flip at desktop edges and keep keyboard selection visible',()=>{
 const {c,load}=context();load('ui/menus.js');c.W=760;c.H=600;c.UISCALE=1;c.mx=c.my=-1;const g=graphics();
 const destination=Array.from({length:35},(_,i)=>({label:'歌单 '+(i+1),run(){}}));
 c.ssShowPopup([{label:'添加到歌单',children:destination}],740,570,'',false,'context');c.ssDrawPopup(g);
 const root=c.ssPopup.levels[0],target=c.SS_MENU_HB[0];assert.ok(root.rect.x+root.rect.w<740&&root.rect.y+root.rect.h<570);
 c.ssPopupClick(target.x0+12,target.y0+10);c.ssDrawPopup(g);
 const child=c.ssPopup.levels[1];assert.ok(child.rect.x+child.rect.w<=root.rect.x);assert.ok(child.rect.y>=c.TBH&&child.rect.y+child.rect.h<c.H);
 c.ssPopupKey(38);c.ssDrawPopup(g);
 assert.equal(child.selected,34);assert.ok(c.SS_MENU_HB.some(h=>h.depth===1&&h.index===34));
 c.ssPopupKey(37);assert.equal(c.ssPopup.levels.length,1);c.ssPopupKey(27);assert.equal(c.ssPopup,null);
});
test('submenus align to the invoking row with compact spacing and a soft shadow protected at the edges',()=>{
 const {c,load}=context();load('ui/menus.js');
 Object.assign(c,{W:1360,H:720,UISCALE:1,mx:-1,my:-1});const g=graphics();
 let paints=[],strokes=[];c.ssFillContinuousRect=(gr,x,y,w,h,rx,ry,colour)=>paints.push({x,y,w,h,rx,colour,alpha:colour>>>24});
 c.ssStrokeContinuousRect=(gr,x,y,w,h,rx,ry,line,colour)=>strokes.push({x,colour});
 for(const appearance of ['light','dark'])for(const x of [18,1348]){
  c.COL=c.ssPalette(appearance);c.ssShowPopup([{label:'选项',children:[{label:'设置'},{label:'检查更新'}]}],x,180);
  c.ssDrawPopup(g);const entry=c.SS_MENU_HB[0];
  c.ssPopupClick(entry.x0+12,entry.y0+10);paints=[];c.ssDrawPopup(g);
  const [parent,child]=c.ssPopup.levels,rect=child.rect;
  assert.ok(paints.some(mark=>mark.x===rect.x&&mark.y===rect.y&&mark.colour===c.COL.popup));
  assert.ok(strokes.some(mark=>mark.x===rect.x+.5&&mark.colour===c.COL.line));
  assert.equal(c.SS_MENU_HB.find(box=>box.depth===1).y0,entry.y0);
  assert.ok(child.rowHeight<parent.rowHeight);
  assert.ok(x>1000?rect.x+rect.w+5<=parent.rect.x:rect.x-5>=parent.rect.x+parent.rect.w);
  const shadow=paints.filter(mark=>mark.x<rect.x&&mark.x+mark.w>rect.x+rect.w&&mark.alpha<255);
  assert.ok(shadow.length>=4);
  assert.ok(shadow.every(mark=>mark.x>=0&&mark.y>=c.TBH&&mark.x+mark.w<=c.W&&mark.y+mark.h<=c.H));
  assert.ok(shadow[0].alpha<shadow.at(-1).alpha&&shadow.at(-1).alpha<30);
  c.ssClosePopup();
 }
});
test('the playback submenu shadow stays above the active footer controls',()=>{
 const {c,load}=context();load('ui/menus.js');load('views/fullscreen.js');
 Object.assign(c,{W:2560,H:1440,UISCALE:1,mx:-1,my:-1,ssState:{enabled:true},ssOpen(){}});
 const g=graphics(),anchor={x0:1850,x1:2060,y0:1295,y1:1355};
 c.ssShowPlaybackModes(anchor.x0,anchor.y0,anchor);c.ssDrawPopup(g);
 const plugins=c.SS_MENU_HB.find(box=>box.item.label==='插件');
 c.ssPopupClick(plugins.x0+12,plugins.y0+10);c.ssDrawPopup(g);
 const child=c.ssPopup.levels[1].rect;
 assert.ok(child.y+child.h+10<=anchor.y0-8);
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

test('desktop sliders only show the thumb on hover or drag without changing seek geometry',()=>{
 const h=context(),c=h.c;h.app();h.load('ui/chrome.js');h.load('views/bar.js');c.drag=null;
 for(const density of [1,1.25,1.5])for(const mode of ['light','dark']){
  c.COL=c.ssPalette(mode);c.ssDensity=density;
  const th=4*density,x=50,y=32,w=80,g=graphics(),rects=[],dots=[];
  g.FillSolidRect=(...a)=>rects.push(a);g.FillEllipse=(...a)=>dots.push(a);
  const draw=(px,py,drag,pos)=>{c.mx=px;c.my=py;c.drag=drag;rects.length=dots.length=0;
   const box=c.drawTrackBar(g,x,y,w,th,c.COL.seekbg,pos,c.COL.green,c.COL.base,'seek',y-5);
   return {geometry:[box.x0,box.y0,box.x1,box.y1],height:rects[0][3],dots:dots.slice()};};
  const idle=draw(0,0,null,0);assert.equal(idle.dots.length,0);
  assert.deepEqual(idle.geometry,[x,y-5,x+w,y+10+th]);
  for(const active of [draw(x,y,null,0),draw(0,0,'seek',1)]){
   assert.deepEqual(active.geometry,idle.geometry);assert.ok(active.height>idle.height);
   assert.ok(active.dots.length>0);const dot=active.dots.at(-1);assert.equal(dot[2],dot[3]);
  }
  assert.equal(draw(x,y-6,null,0).dots.length,0,'honor the seek exclusion above the rail');
 }
});

test('scrollbar proximity changes the visual thickness only and respects its original show condition',()=>{
 const h=context(),c=h.c;h.app();h.load('ui/chrome.js');c.HOME_PLMAX=300;
 for(const density of [1,1.25,1.5])for(const mode of ['light','dark']){
  c.COL=c.ssPalette(mode);c.ssDensity=density;
  for(const key of ['scroll','scrolln','scrollq','scrollh']){
   const style=key==='scroll'?c.SB_MAIN:key==='scrolln'?c.SB_NAV:c.SB_QUEUE,horiz=key==='scrollh';
   const g=graphics(),rects=[];g.FillSolidRect=(...args)=>rects.push(args);
   const draw=(px,drag,show)=>{c.mx=px;c.my=45;c.drag=drag;rects.length=0;
    const box=horiz?(c.drawScrollbarH(g,40,44,100,30,300,100,400,show),c.SBH):c.drawSBV(g,40,44,100,30,300,100,400,show,style);
    if(!box)return null;
    return {geometry:[box.x0,box.y0,box.x1,box.y1,box.thumbH||box.thumbW],thickness:rects.at(-1)[horiz?3:2],alpha:rects.at(-1)[4]>>>24};};
   assert.equal(draw(40,null,false),null);
   const idle=draw(0,null,true),hot=draw(42,null,true),dragged=draw(0,key,true);
   assert.deepEqual(hot.geometry,idle.geometry);assert.deepEqual(dragged.geometry,idle.geometry);
   assert.ok(hot.thickness>idle.thickness);assert.equal(dragged.thickness,hot.thickness);assert.ok(idle.alpha<hot.alpha);
  }
 }
});

test('a cached desktop rail appears, expands and hides with only thumb-strip paint requests',()=>{
 const h=context(),c=h.c;h.app();h.load('ui/chrome.js');c.clearDirty();c.ssSceneImage={};
 c.view='playlist';c.R={main:{x:80,y:20,w:360,h:300},barY:350};
 c.mx=c.my=-1;c.ssQuietRows=true;
 const g=graphics(),fills=[],copies=[],damage=[];g.FillSolidRect=(...a)=>fills.push(a);g.DrawImage=(...a)=>copies.push(a);
 c.drawScrollbar(g,430,100,180,50,320,180,500,[80,20,440,280]);c.ssQuietRows=false;
 assert.equal(c.SB,null);assert.equal(fills.length,0,'hover must not be baked into the scene');
 c.window.RepaintRect=(...a)=>damage.push(a);c.window.Repaint=()=>assert.fail('full paint');
 c.hoverSig=()=>'';c.ssSelectionMove=()=>false;
 for(const [x,y,visible] of [[100,60,true],[430,200,true],[-1,-1,false]]){
  damage.length=copies.length=fills.length=0;
  if(x>=0)c.on_mouse_move(x,y,0);else{c.ssMenuLeave=()=>{};c.on_mouse_leave();}
  assert.equal(!!c.SB,visible);assert.equal(damage.length,1);
  assert.ok(damage[0][2]<12&&damage[0][3]<180);assert.equal(c.ssPaintControlDamage(g),true);
  assert.equal(copies.length,1);assert.equal(fills.length,visible?1:0);assert.equal(c.dirtyMain,false);
 }
});
test('control damage shares pending row restoration and never restores pixels above a drag overlay',()=>{
 const h=context(),c=h.c;h.app();h.load('ui/chrome.js');h.load('views/bar.js');c.clearDirty();
 const g=graphics(),calls=[];g.DrawImage=()=>calls.push('scene');g.FillEllipse=()=>calls.push('thumb');
 c.ssSceneImage={};c.ssQuietRows=true;c.mx=c.my=-1;c.HB_VOL=c.drawTrackBar(g,50,120,100,4,7,.5,8,9,'vol');c.ssQuietRows=false;
 c.mx=60;c.my=124;c.ssHoverFrame=1;c.ssUpdateControlHover();assert.equal(c.ssPaintControlDamage(g),false);
 assert.ok(c.ssHoverDirty);assert.ok(c.ssInteractionDamage.length);
 c.ssHoverFrame=0;c.ssPaintRowHover=()=>calls.push('row');c.ssDrawSelection=()=>calls.push('selection/drag');
 c.ssSelectionRects=()=>[];c.ssHoverRow=()=>null;c.ssPaintInteractions(g);
 assert.ok(calls.indexOf('thumb')>calls.indexOf('row'));assert.equal(calls.at(-1),'selection/drag');
 calls.length=0;c.ssPaintInteractions(g);
 assert.deepEqual(calls,['row','selection/drag'],'unrelated row frames leave the stable slider pixels alone');
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
test('three-tier radii scale with density while preserving capsules, masks and bounded mask cache',()=>{
 const h=context(),c=h.c;h.load('ui/chrome.js');h.load('views/playlist.js');h.load('views/search.js');h.load('data/art.js');
 assert.equal(c.M.radius,6,'viewport panel mask radius stays fixed');
 assert.deepEqual({sm:c.SS_RAD.sm,md:c.SS_RAD.md,lg:c.SS_RAD.lg},{sm:4,md:8,lg:12});
 for(const density of [1,1.25,1.5]){
  c.ssDensity=density;
  assert.equal(c.ssRad('sm'),Math.round(4*density));
  assert.equal(c.ssRad('md'),Math.round(8*density));
  assert.equal(c.ssRad('lg'),Math.round(12*density));
 }
 c.ssDensity=1;c.plSortDir=1;const radii=[];c.hv=()=>false;c.tC=()=>{};c.tL=()=>{};c.drawIcon=()=>{};
 c.ssFillContinuousRect=(gr,x,y,w,h,rx,ry)=>radii.push({w,h,rx,ry});
 const g=graphics();
 c.dlgBtn(g,0,0,120,40,'保存',1,2,3);
 c.drawSortDirBtn(g,0,0,38,38);
 c.drawPill(g,0,0,140,'选择文件',true);
 c.R={main:{x:0,y:0,w:900,h:700},libraryScales:{main:1}};c.searchQuery='';c.caretOn=false;
 c.drawSearchBox(g,c.R.main,{s:1,box:{x:24,y:26,w:400,h:44},damage:{x:22,y:22,w:408,h:52}});
 assert.deepEqual(radii.map(r=>r.rx),[20,19,21,22],'capsule controls retain h/2 radii');
 let disposed=0;
 c.gdi.CreateImage=(Width,Height)=>({Width,Height,GetGraphics:()=>graphics(),ReleaseGraphics(){},ApplyMask(){},Dispose(){disposed++;}});
 for(let i=0;i<80;i++)c.roundMask(40+i,c.ssRad('md'));
 assert.ok(Object.keys(c.maskCache).length<=64,'maskCache stays bounded under varied sizes/radii');
 assert.ok(disposed>0,'evicted masks dispose their native bitmaps');
});

test('key cards, covers, buttons and notices map cleanly into sm/md/lg tiers',()=>{
 const h=context(),c=h.c;
 for(const f of ['ui/chrome.js','ui/menus.js','views/cards.js','views/nav.js','views/artist.js','views/bar.js','views/queue.js','views/personal.js','views/preference.js'])h.load(f);
 c.ssDensity=1.25;const sm=c.ssRad('sm'),md=c.ssRad('md'),lg=c.ssRad('lg');
 const fills=[],covers=[],strokes=[];
 c.ssFillContinuousRect=(gr,x,y,w,h,rx)=>fills.push(rx);
 c.ssStrokeContinuousRect=(gr,x,y,w,h,rx)=>strokes.push(rx);
 c.drawRounded=(gr,x,y,sz,rad)=>covers.push(rad);
 c.drawCover=(gr,x,y,sz,rad)=>covers.push(rad);
 c.hv=()=>true;c.tL=()=>{};c.tC=()=>{};c.tR=()=>{};c.drawIcon=()=>{};c.ssArtistName=x=>x;
 c.HB_CARD=[];c.ssDrawAlbumLabels=()=>{};
 c.drawLibraryAlbumCard(graphics(),0,0,160,{id:'a',album:'A',artist:'B'},0,400,0,400);
 assert.equal(fills.at(-1),md,'home album card hover uses md');
 assert.equal(covers.at(-1),md,'home album card cover uses md');
 fills.length=covers.length=0;
 c.HB_CTRL=[];c.ssDrawFooterTool(graphics(),50,50,1.25,'queue','queue',true,'播放队列');
 assert.equal(fills.at(-1),md,'footer tool button uses md');
 c.ssDrawIdleRecord(graphics(),0,0,64);
 assert.equal(fills.at(-1),md,'idle record placeholder uses md');
 fills.length=0;c.W=1200;c.H=800;c.view='history';c.ssState={personal:{}};c.ssPersonal={items:[],total:0,loading:false,error:''};
 c.ssPersonalEnabled=()=>false;c.ssPersonalTitle=()=>'播放历史';c.HB_PERSONAL_ACTIONS=[];c.HB_TR=[];
 const g=graphics();g.FillGradRect=()=>{};
 c.drawPersonal(g,{x:0,y:0,w:800,h:600});
 assert.equal(fills[0],md,'personal empty notice card uses md');
 assert.equal(fills[1],md,'settings CTA button uses md');
 fills.length=0;c.ssDrawLyricsNotice(g,{x:0,y:0,w:300,h:500},'尚未播放','说明','',true);
 assert.equal(fills[0],md,'lyrics notice card uses md');
 assert.equal(fills[1],md,'lyrics notice play button uses md');
 fills.length=0;c.ssDrawSubmenuSurface(g,100,100,200,160);
 assert.equal(fills.at(-1),lg,'submenu surface uses lg radius');
 fills.length=strokes.length=0;c.ssButton(g,0,0,100,36,'均衡','balanced',true,false);
 assert.equal(fills[0],md,'preference button uses md');
 fills.length=0;c.ssDrawPersonalHeart(g,0,0,28,false,true);
 assert.equal(fills[0],sm,'favorite heart hover uses sm');
 fills.length=covers.length=0;c.R={navLib:{x:0,y:60,w:240,h:500}};c.drawPlCover=(gr,x,y,sz,rad)=>covers.push(rad);
 c.drawNavRow(g,80,58,true,false,0,'歌单','10 首歌曲',false);
 assert.equal(fills[0],md,'sidebar playlist row highlight uses md');
 assert.equal(covers[0],sm,'sidebar playlist cover uses sm');
});
test('Apple Music typography uses bold headings, centered idle footer and aligned fullscreen bar',()=>{
 const h=context(),c=h.c;h.load('views/bar.js');
 assert.equal(c.FONT.title.Style,1,'page title uses bold weight');
 assert.equal(c.FONT.sect2.Style,1,'secondary section heading uses bold weight');
 assert.equal(c.FONT.sect.Style,1,'section heading uses bold weight');
 assert.equal(c.FONT.fsTitle.Style,1,'fullscreen title uses bold weight');
 assert.equal(c.ssCjkFont(c.FONT.title).Style,1,'CJK page title preserves bold weight');
 assert.equal(c.FONT.rowTitle.Style,0,'track row title stays regular');
 assert.equal(c.FONT.pl.Style,0,'sidebar label stays regular');
 c.W=1440;c.H=900;c.ssDensity=1;c.M.barH=96;c.R={barY:804,barInfoW:380,barToolsW:320,barScale:1};
 c.NP=null;c.ssState=null;c.pbShuffle=false;c.drag=null;c.fb={IsPlaying:false,IsPaused:false,PlaybackLength:0,PlaybackTime:0,Volume:0};
 c.hv=()=>false;c.drawIcon=()=>{};c.ssFillContinuousRect=()=>{};c.tR=()=>{};c.tC=()=>{};c.tCE=()=>{};
 const idleLabels=[];c.tL=(g,text,f,col,x,y,w,h)=>idleLabels.push({text,x,y,w,h});
 c.drawBar(graphics());
 const idle=idleLabels.find(l=>l.text==='尚未播放');
 assert.ok(idle,'idle footer draws label');
 assert.ok(Math.abs((idle.y+idle.h/2)-(c.R.barY+c.M.barH/2))<=2,'idle footer label is vertically centered');
 c.HB_CTRL=[];c.fsView='default';c.ssOutputError='';c.ssError='';c.drawTrackBar=()=>{};
 const fsH=144,fsBy=c.H-fsH,fsScale=1.15;
 c.ssDrawFooterTools(graphics(),fsBy,fsH,fsScale,c.ssFooterToolLayout(fsScale,true),true);
 const viz=c.HB_CTRL.find(b=>b.act==='viz'),exit=c.HB_CTRL.find(b=>b.act==='fullscreen');
 assert.ok(viz&&exit,'fullscreen tools include viz and exit');
 assert.ok(Math.abs((viz.y0+viz.y1)/2-(exit.y0+exit.y1)/2)<=1,'fullscreen exit button aligns with tools centerline');
});

console.log(count+' passed, '+failed+' failed');if(failed)process.exitCode=1;
