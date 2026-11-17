'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.join(__dirname,'../theme/verdant');
let count=0;
function run(name,fn){fn();console.log('PASS '+name);count++;}
function harness(saved={}){
 const props={...saved},requests=[];
 const c={Math,Number,isFinite,console,ssDensity:1,W:1440,H:900,TBH:32,R:{},
 M:{gap:10,navW:210,queueW:300,rowH:50},FONT:{},
 ssMeasureText:()=>40,ssFontLineHeight:()=>0,ssTrackTextMetrics:()=>({title:22,detail:18,height:48}),ssDrawFixedLabel:(...args)=>c.tL(...args),ssState:{remaining:['a','b'],queue:['c']},
 window:{GetProperty:(k,d)=>k in props?props[k]:d,SetProperty:(k,v)=>props[k]=v},
 fsMode:false,ssModal:false,ssPopup:false,ssStarted:false,rightTab:'lyrics',
 ssHideLyrics(){},ssDropModalImage(){},ssDropSceneImage(){},ssSyncLyricPanel(){},ssReportLayout(){},repaintAll(){},
 loadLyrics(){},stopLyAnim(){},ssSend:(...args)=>requests.push(args),
 layout(){const w=c.ssLayoutWidths(c.W);c.R.queue={x:c.W-w.right,y:40,w:w.right,h:700};},
 };
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'core/corners.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'ui/layout.js'),'utf8'),c);
 return {c,props,requests};
}
run('window and divider scale the affected library panes proportionally',()=>{
 const {c}=harness();
 c.M.navW=240;
 const normal=c.ssLibraryScales(1180,780,228,922,0);
 assert.deepEqual([normal.nav,normal.main],[1,1]);
 const large=c.ssLibraryScales(1440,900,228,1182,0);
 assert.ok(large.nav>1&&large.main>1);
 const widerNav=c.ssLibraryScales(1440,900,256,1154,0);
 assert.ok(widerNav.nav>large.nav&&widerNav.main<large.main);
 const defaultDrawer=c.ssLibraryScales(1440,900,228,872,300);
 const widerDrawer=c.ssLibraryScales(1440,900,228,832,340);
 assert.equal(widerDrawer.nav,defaultDrawer.nav);
 assert.ok(widerDrawer.main<defaultDrawer.main);
});
run('new desktop opens with content space, drawer is optional',()=>{
 const {c}=harness();assert.equal(c.ssRightOpen,false);assert.equal(c.ssLayoutWidths(1440).right,0);
});
run('the standard DPI minimum is registered and stays within the monitor work area',()=>{
 const {c}=harness();c.window.DPI=120;c.ssState.display={work_width:1920,work_height:1080};
 c.ssApplyWindowMinimum();assert.equal(c.window.MinWidth,1150);assert.equal(c.window.MinHeight,750);
 c.ssState.display.work_height=720;c.ssApplyWindowMinimum();assert.equal(c.window.MinHeight,720);
});
run('programmatic resize below the panel minimum requests one corrected window size',()=>{
 const {c}=harness();const jobs=[],requests=[];
 Object.assign(c.window,{Width:700,Height:450,SetTimeout(fn){jobs.push(fn);return jobs.length;}});
 c.UIWizard={WindowState:2,SetWindowSize:(...args)=>requests.push(args)};
 c.ssClampWindowSize(700,450);c.ssClampWindowSize(700,450);assert.equal(jobs.length,1);
 jobs.shift()();assert.deepEqual(requests,[[920,600]]);
 c.ssClampWindowSize(700,450);c.window.Width=1180;c.window.Height=780;jobs.shift()();assert.equal(requests.length,1);
});
run('drawer choice persists without altering playback or queue',()=>{
 const {c,props,requests}=harness(),before=JSON.stringify(c.ssState);
 c.ssSetRightPane('queue',true);assert.equal(c.rightTab,'queue');assert.ok(c.R.queue.w>=220);
 assert.equal(props['SmartShuffle: right pane open'],true);assert.equal(props['SmartShuffle: right pane tab'],'queue');
 assert.equal(JSON.stringify(c.ssState),before);assert.deepEqual(requests,[]);
 const restored=harness(props);assert.equal(restored.c.ssRightOpen,true);assert.equal(restored.c.ssRightTab,'queue');
 c.ssSetRightPane('queue',false);assert.equal(c.R.queue.w,0);
});
run('narrow auto-collapse retains desired open state and requested width',()=>{
 const {c}=harness();c.ssWidths.right=410;c.ssSetRightPane('lyrics',true);
 const wide=c.ssLayoutWidths(1440);assert.equal(wide.right,410);
 assert.equal(c.ssLayoutWidths(800).right,0);assert.equal(c.ssRightOpen,true);assert.equal(c.ssWidths.right,410);
 assert.equal(c.ssLayoutWidths(1440).right,410);
});
run('collapsed drawer cannot paint or receive stale hit targets',()=>{
 const {c}=harness();vm.runInContext(fs.readFileSync(path.join(root,'views/queue.js'),'utf8'),c);
 c.R.queue={x:1440,y:40,w:0,h:700};c.HB_TABS=[{}];c.HB_Q=[{}];c.SS_LYRIC_BTN={};c.SS_QUEUE_SB={};
 c.drawQueue({});assert.equal(c.HB_TABS.length,0);assert.equal(c.HB_Q.length,0);assert.equal(c.SS_LYRIC_BTN,null);assert.equal(c.SS_QUEUE_SB,null);
});
run('collapsed native lyrics child is hidden without negative move geometry',()=>{
 const {c}=harness();vm.runInContext(fs.readFileSync(path.join(root,'views/preference.js'),'utf8'),c);
 let shown; c.ssLyricTried=true;c.ssLyricChild={Move(){throw Error('collapsed pane must not move');},Show(v){shown=v;}};
 c.R.queue={x:1440,y:40,w:0,h:700};c.ssSyncLyricPanel();assert.equal(shown,false);assert.equal(c.ssLyricVisible,false);
});
run('footer reopens an automatically collapsed selected drawer on the first click',()=>{
 const {c}=harness();const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 vm.runInContext(app.slice(app.indexOf('function doCtrl('),app.indexOf('function on_mouse_lbtn_up(')),c);
 c.ssSetRightPane('lyrics',true);c.W=800;c.layout();assert.equal(c.R.queue.w,0);
 c.doCtrl('lyrics');assert.equal(c.ssRightOpen,true);assert.ok(c.R.queue.w>0);
 c.doCtrl('lyrics');assert.equal(c.ssRightOpen,false);assert.equal(c.R.queue.w,0);
});
run('saved oversized navigation stays compact without losing the saved request',()=>{
 const {c,props}=harness({'SmartShuffle: library width':410,'SmartShuffle: right pane open':true});
 for(const width of [800,1180,1440,1800]){
  const layout=c.ssLayoutWidths(width);
  assert.ok(layout.nav<=280 && layout.nav<=width*.24+1);
  assert.ok(width-layout.nav-layout.right-40>=Math.min(480,width*.46)-2);
 }
 assert.equal(c.ssWidths.nav,410);assert.equal(props['SmartShuffle: library width'],410);
});
run('the standard desktop reserves the majority of its width for the main pane',()=>{
 const {c}=harness({'SmartShuffle: library width':280,'SmartShuffle: lyrics width':320,'SmartShuffle: right pane open':true});
 const widths=c.ssLayoutWidths(1180);
 assert.ok(widths.nav<=240&&widths.right<=268);
 assert.ok(1180-40-widths.nav-widths.right>=637);
 assert.equal(c.ssWidths.nav,280);assert.equal(c.ssWidths.right,320);
});
run('artist collections keep multi-track album headers and put singles into consecutive rows',()=>{
 const {c}=harness();for(const file of ['views/cards.js','views/artist.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 c.artistAlbums=[{id:'album',named:true,album:'Album',tracks:[{title:'A'},{title:'B'}]},{id:'single-a',named:true,album:'Single A',tracks:[{title:'C'}]},{id:'single-b',named:true,album:'Single B',tracks:[{title:'D'}]}];
 c.ssBuildCollectionRows(false,1,800);
 const tiles=c.ssCollectionRows.filter(r=>r.tiles).flatMap(r=>Array.from(r.tiles));
 assert.deepEqual(Array.from(tiles,a=>a.album),['Album','Single A','Single B']);
 assert.deepEqual(Array.from(tiles.filter(a=>a.named),a=>a.id),['album','single-a','single-b']);
 assert.ok(c.ssCollectionRows.filter(r=>r.tiles).every(r=>r.size===157));assert.ok(c.ssCollectionRows.filter(r=>r.tiles).every(r=>r.gap===24));
 assert.deepEqual(Array.from(c.ssCollectionRows.filter(r=>r.label),r=>r.label),['专辑','曲目','单曲']);
 assert.equal(c.ssCollectionRows.filter(r=>r.album).length,1);
 const tracks=c.ssCollectionRows.filter(r=>r.track);assert.equal(tracks.length,4);
 assert.equal(tracks[3].y-tracks[2].y,tracks[2].h);
 assert.deepEqual(Array.from(tracks,r=>[r.block,r.idx]),[[0,0],[0,1],[1,0],[2,0]]);
 c.ssBuildCollectionRows(false,1,280);
 const narrow=c.ssCollectionRows.filter(r=>r.tiles);
 assert.equal(narrow.flatMap(r=>Array.from(r.tiles)).length,3);
 assert.ok(narrow.every(r=>r.size===157&&r.tiles.length*r.size+(r.tiles.length-1)*r.gap<=280));
});
run('opening the drawer reflows library columns at the same cover size',()=>{
 const {c}=harness();vm.runInContext(fs.readFileSync(path.join(root,'views/cards.js'),'utf8'),c);
 const wide=c.ssAlbumGrid(1077,1.05),drawer=c.ssAlbumGrid(751,1.05);
 assert.equal(wide.size,drawer.size);assert.equal(wide.cols,5);assert.equal(drawer.cols,4);assert.equal(wide.gap,Math.round(24*1.05));

 const narrow=c.ssAlbumGrid(110,.85,166);assert.equal(narrow.cols,1);assert.equal(narrow.size,110);
 c.M.cpad=24;c.ssDensity=1.05;
 for(const frame of [{x:300,w:1125},{x:300,w:799},{x:190,w:350}]){
  const reading=c.ssLibraryReadingRect(frame);
  assert.equal(reading.x,frame.x+24);
  assert.equal(reading.w,frame.w-48);
 }
});
run('artist portraits fit the complete source photograph without a circular mask',()=>{
 const {c}=harness(),draws=[];vm.runInContext(fs.readFileSync(path.join(root,'data/discovery.js'),'utf8'),c);
 const source={Width:600,Height:400},graphics={SetInterpolationMode(){},FillSolidRect(){},DrawImage(...args){draws.push(args);}};
 c.COL={elev:1};c.gdi={Image:()=>source,CreateImage:()=>({GetGraphics:()=>graphics,ReleaseGraphics(){},ApplyMask(){throw Error('must retain photograph corners');}})};
 c.ssArtists.Name={verified:true,portrait:'source.jpg'};c.ssDrawArtistAvatar({DrawImage(){}},0,0,120,'Name');
 assert.equal(draws.length,1);assert.deepEqual(draws[0].slice(1),[0,20,120,80,0,0,600,400]);
});
run('shallow playlist shortcuts retain separate native play and navigation targets',()=>{
 const {c}=harness(),gr=new Proxy({},{get:()=>()=>{}});
 vm.runInContext(fs.readFileSync(path.join(root,'views/cards.js'),'utf8'),c);
 Object.assign(c,{COL:{},FONT:{},HB_PLPLAY:[],HB_CARD:[],hv:()=>false,plName:()=> 'Playlist',plCount:()=>3,drawPlCover(){},drawIcon(){},ssHomeFocus:'',ssHomeFocusRing(){},tL(){},
  gdi:{CreateImage:()=>({GetGraphics:()=>gr,ReleaseGraphics(){},Dispose(){}})},
  drawPlaylistPlay:(g,x,y,size,pl)=>({x0:x,y0:y,x1:x+size,y1:y+size,pl,label:'播放歌单'})});
 c.drawPlaylistShortcut(gr,20,40,238,64,2,20,600);
 assert.equal(c.HB_CARD[0].kind,'pl');assert.equal(c.HB_CARD[0].id,2);assert.equal(c.HB_CARD[0].y1-c.HB_CARD[0].y0,64);
 assert.equal(c.HB_PLPLAY[0].pl,2);assert.ok(c.HB_PLPLAY[0].label);
 c.HB_PLPLAY=[];c.drawPlaylistShortcut(gr,-200,40,238,64,2,20,600);assert.equal(c.HB_PLPLAY.length,0);
});
run('search keeps a compact artist result immediately above hittable song rows',()=>{
 const {c}=harness(),gr=new Proxy({},{get:()=>()=>{}}),labels=[];
 for(const file of ['core/util.js','views/cards.js','views/search.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 Object.assign(c,{COL:{},FONT:{},M:{cpad:24,rowH:50,pad:8},R:{main:{x:0,y:0,w:900,h:700}},searchQuery:'Artist',
  searchArts:[{name:'Artist'}],searchTrks:[{title:'Song',artist:'Artist',len:'3:00'}],searchScroll:0,searchScrollT:0,
  CH_DOT:'·',caretOn:false,drag:null,computeSearch(){},clampPx:(n,max)=>Math.max(0,Math.min(n,max)),hv:()=>false,ssRowHover:()=>false,
  ssArtistName:n=>n,ssDrawArtistAvatar(){},drawCover(){},drawIcon(){},drawScrollbar(){},tC(){},tR(){},
  tL:(g,text,font,color,x,y,w,h)=>labels.push({text,x,y,w,h})});
 c.drawSearch(gr,c.R.main);
 assert.equal(c.HB_CARD.length,1);assert.equal(c.HB_CARD[0].id,'Artist');assert.ok(c.HB_CARD[0].y1-c.HB_CARD[0].y0<=80);
 assert.equal(c.HB_TR.length,1);assert.equal(c.HB_TR[0].idx,0);assert.equal(c.HB_TR[0].srch,true);assert.equal(c.HB_TR[0].playVisible,true);assert.equal(c.HB_TR[0].playOnHover,true);assert.equal(c.HB_TR[0].pgx0,24);assert.ok(c.HB_TR[0].pgx1>=56);
 assert.ok(c.HB_TR[0].y0-c.HB_CARD[0].y1<70);assert.equal(c.HB_TR[0].x1,884);assert.equal(c.HB_TR[0].x1,c.searchBoxRect().x+c.searchBoxRect().w+2);
});
run('fullscreen scales the centered cover and leaves separate space for text and transport',()=>{
 const {c}=harness();
 Object.assign(c,{COL:{},blend:()=>0,ssInk:()=>0});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 const sizes=[];
 for(const [width,height] of [[1180,780],[1440,900],[1920,1080]]){
  const s=c.ssFsScale(width,height),bot=height-Math.round(172*s),m=c.ssFsDefaultGeometry(width,bot,s);
  assert.ok(Math.abs(m.x+m.size/2-width/2)<1&&Math.abs(m.textX+m.textW/2-width/2)<1);
  assert.ok(m.y+m.size<m.textY&&m.textY+Math.round(126*s)<=bot);
  sizes.push(m.size);
 }
 assert.ok(sizes[2]>sizes[1]&&sizes[1]>sizes[0]);
});
run('fullscreen labels the featured album and the current transport separately',()=>{
 const {c}=harness(),labels=[],actions=[];
 Object.assign(c,{W:1180,H:780,NP:null,pbShuffle:true,ssState:null,isHiddenPl:()=>false,HB_FS:[],COL:{},FONT:{},blend:()=>0,ssInk:()=>0,
  getAlbumCatalog:()=>({albums:[{album:'Example',artist:'Artist'}]}),ssHomeAlbumSelection:albums=>albums,
  ssArtistName:String,npTitleStr:'Current Track',npArtistStr:'Current Artist',npPlaylistSrc:()=> 'Library',
  drawRounded(){},tCE:(g,label)=>labels.push(label),tC:(g,label)=>labels.push(label),hv:()=>false,
  ssDrawAlbumPlayAction:(g,x,y,w,h,label)=>{actions.push(label);return {act:'featured'};},
  ssFooterToolLayout:()=>({}),ssHasTransportSource:()=>true,ssDrawTransport(){},ssDrawFooterTools(){},fb:{IsPaused:false}});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 c.npPlaylistSrc=()=> 'Library';
 c.drawFsDefault({},608);c.drawFsBar({});
 assert.ok(labels.includes('推荐专辑')&&labels.includes('尚未播放 · 开始播放'));
 assert.deepEqual(actions,['播放这张专辑']);
 c.ssState={queue:[],source_name:'Current Playlist'};c.drawFsBar({});
 assert.ok(labels.includes('尚未播放 · 播放歌单 Current Playlist'));
 c.ssState.queue=[{id:'queued'}];c.drawFsBar({});
 assert.ok(labels.includes('尚未播放 · 播放待播队列'));
 labels.length=0;c.NP={};c.drawFsDefault({},608);c.drawFsBar({});
 assert.ok(labels.includes('正在播放')&&labels.includes('Current Track')&&labels.includes('Current Artist')&&labels.includes('歌单 · Library'));
 c.fb.IsPaused=true;c.drawFsBar({});assert.ok(labels.includes('已暂停 · 继续当前曲目'));
});
run('large fullscreen uses the display width for the title and scales secondary controls',()=>{
 const {c}=harness(),labels=[],buttons=[];
 const titleFont={Name:'Inter',Size:28,Style:1},controlFont={Name:'Inter',Size:13,Style:0};
 Object.assign(c,{W:2560,H:1440,NP:null,HB_FS:[],COL:{},FONT:{title:{Size:28},fsTitle:titleFont,fsSrc:controlFont,sect2:controlFont,pl:controlFont,plSub:controlFont},
  fb:{IsPaused:false},pbShuffle:false,ssState:null,blend:()=>0,ssInk:()=>0,hv:()=>false,
  SS_FONT_META:[],gdi:{Font:(Name,Size,Style)=>({Name,Size,Style})},drawRounded(){},drawIcon(){},
  getAlbumCatalog:()=>({albums:[{album:'Long Title',artist:'Artist'}]}),ssHomeAlbumSelection:albums=>albums,ssArtistName:String,
  tCE:(g,text,font,x,y,z,w)=>labels.push({text,font,w}),tC(){},tL:(g,text,font)=>labels.push({text,font}),
  ssDrawAlbumPlayAction:(g,x,y,w,h,label,font)=>{buttons.push({label,font});return {act:'featured'};},
  ssHasTransportSource:()=>true,ssDrawTransport(){},ssFooterToolLayout:()=>({}),
  ssDrawFooterTools:(g,y,h,s,tools)=>{c.modeFont=tools.modeFont;}});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 c.drawFsDefault({},1156);c.drawFsExit({});c.drawFsBar({});
 const title=labels.find(label=>label.text==='Long Title');
 assert.ok(title.w>=1900);
 assert.equal(title.font.Style,1);
 assert.ok(buttons[0].font.Size>controlFont.Size);
 assert.ok(labels.find(label=>label.text==='退出全屏').font.Size>controlFont.Size);
 assert.ok(c.modeFont.Size>controlFont.Size);
 assert.ok(c.HB_FS.find(box=>box.act==='exit').y1-c.HB_FS.find(box=>box.act==='exit').y0>30);
});
console.log(count+' desktop drawer checks passed');
