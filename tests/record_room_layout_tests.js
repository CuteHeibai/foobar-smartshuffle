'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.join(__dirname,'../theme/verdant');
let count=0;
function run(name,fn){fn();console.log('PASS '+name);count++;}
function harness(saved={}){
 const props={...saved},requests=[];
 const c={Math,Number,isFinite,console,ssDensity:1,W:1440,H:900,TBH:32,R:{},
 M:{gap:10,navW:210,queueW:300,rowH:50},FONT:{},
 ssMeasureText:()=>40,ssFontLineHeight:()=>0,ssFontFloor:()=>12,ssTrackTextMetrics:()=>({title:22,detail:18,height:48}),ssDrawFixedLabel:(...args)=>c.tL(...args),ssState:{remaining:['a','b'],queue:['c']},
 window:{GetProperty:(k,d)=>k in props?props[k]:d,SetProperty:(k,v)=>props[k]=v},
 fsMode:false,ssModal:false,ssPopup:false,ssStarted:false,rightTab:'lyrics',
 ssHideLyrics(){},ssDropModalImage(){},ssDropSceneImage(){},ssSyncLyricPanel(){},ssReportLayout(){},repaintAll(){},
 loadLyrics(){},stopLyAnim(){},ssSend:(...args)=>requests.push(args),
 layout(){const w=c.ssLayoutWidths(c.W);c.R.queue={x:c.W-w.right,y:40,w:w.right,h:700};},
 };
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'core/corners.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'ui/layout.js'),'utf8'),c);
 return {c,props,requests};
}
run('only window size changes content scale, and the floor stays at normal size',()=>{
 const {c}=harness();
 c.M.navW=240;
 const normal=c.ssLibraryScales(1180,780,228,922,0);
 assert.deepEqual([normal.nav,normal.main],[1,1]);
 const large=c.ssLibraryScales(1440,900,228,1182,0);
 assert.ok(large.nav>1&&large.main>1);
 const widerNav=c.ssLibraryScales(1440,900,256,1154,0);
 assert.deepEqual(widerNav,large);
 const defaultDrawer=c.ssLibraryScales(1440,900,228,872,300);
 const widerDrawer=c.ssLibraryScales(1440,900,228,832,340);
 assert.deepEqual(widerDrawer,defaultDrawer);
 assert.deepEqual(c.ssLibraryScales(920,600),normal);
});
run('large screens give transport more scale than the library content',()=>{
 const {c}=harness();
 c.M.navW=240;
 const panes=c.ssLibraryScales(2560,1440,407,2123,0);
 assert.equal(panes.nav,1.18);assert.equal(panes.main,1.25);
 assert.equal(c.ssDesktopBarScale(2560,1440),1.35);
 assert.equal(c.ssDesktopBarScale(1180,780),1);
 c.blend=()=>0;c.ssInk=()=>0;c.COL={};
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 assert.equal(c.ssFsScale(2560,1440),1.4);
 assert.equal(c.ssFsTransportScale(2560,1440),1.7);
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
run('narrow windows constrain the library and larger windows restore the saved width',()=>{
 const {c,props}=harness({'SmartShuffle: library width':410,'SmartShuffle: right pane open':true});
 for(const width of [800,1180]){
  const layout=c.ssLayoutWidths(width);
  assert.ok(layout.nav<=width*.36+1);
  assert.ok(width-layout.nav-layout.right-40>=Math.min(480,width*.42)-2);
 }
 assert.equal(c.ssLayoutWidths(1800).nav,410);
 assert.equal(c.ssLayoutWidths(2560).nav,410);
 c.ssWidths.nav=0;
 assert.ok(c.ssLayoutWidths(2560).nav>330);
 assert.equal(props['SmartShuffle: library width'],410);
});
run('the standard desktop reserves the majority of its width for the main pane',()=>{
 const {c}=harness({'SmartShuffle: library width':280,'SmartShuffle: lyrics width':320,'SmartShuffle: right pane open':true});
 const widths=c.ssLayoutWidths(1180);
 assert.ok(widths.nav<=260&&widths.right===320);
 c.ssRightOpen=false;assert.equal(c.ssLayoutWidths(1180).nav,280);
 assert.ok(1180-40-widths.nav-widths.right>=530);
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
run('featured album action can use the primary transport colors',()=>{
 const {c}=harness(),fills=[],icons=[],gr={FillEllipse:(x,y,w,h,color)=>fills.push(color)};
 vm.runInContext(fs.readFileSync(path.join(root,'views/cards.js'),'utf8'),c);
 c.COL={play:1,onPlay:2,greenHover:3,elev:4,text:5,onAccent:6};c.hv=()=>false;c.tL=()=>{};
 c.drawIcon=(g,icon,color)=>icons.push(color);
 c.ssDrawAlbumPlayAction(gr,20,40,160,38,'Play this album',c.FONT.pl,true);
 c.hv=()=>true;c.ssDrawAlbumPlayAction(gr,20,40,160,38,'Play this album',c.FONT.pl,true);
 c.hv=()=>false;c.ssDrawAlbumPlayAction(gr,20,40,160,38);
 assert.deepEqual(fills,[c.COL.play,c.COL.greenHover,c.COL.elev]);
 assert.deepEqual(icons,[c.COL.onAccent,c.COL.onAccent,c.COL.text]);
});
run('wide track tables span the available pane and keep subtle row guides',()=>{
 const {c}=harness(),fills=[];
 for(const file of ['core/util.js','views/cards.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 c.M.cpad=30;c.ssDensity=1.25;c.COL={rowHover:19};c.ssInk=alpha=>alpha;
 c.ssFillContinuousRect=(gr,x,y,w,h,radius,other,color)=>fills.push({x,y,w,h,color});
 const bounds={x:430,w:2123},layout=c.ssLibraryTrackLayout(bounds,1.25);
 assert.equal(layout.x,bounds.x+30);assert.equal(layout.w,bounds.w-60);
 assert.ok(layout.moreX+layout.moreW<layout.right-layout.durW);
 c.ssDrawLibraryRowSurface({},layout,100,50,false,true);
 c.ssDrawLibraryRowSurface({},layout,150,50,true,true);
 assert.deepEqual(fills.map(fill=>fill.color),[7,19]);
 assert.ok(fills.every(fill=>fill.x===layout.rowLeft&&fill.x+fill.w===layout.personalRight));
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
function libraryPaintHarness(){
 const {c}=harness(),labels=[],times=[],covers=[],fills=[],lines=[],gr=new Proxy({
  FillSolidRect:(x,y,w,h)=>fills.push({x,y,w,h}),DrawLine:(x0,y0,x1)=>lines.push({x0,x1})
 },{get:(target,key)=>target[key]||(()=>{})});
 for(const file of ['core/util.js','views/cards.js','views/artist.js','views/playlist.js','views/songs.js','views/search.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 const track={h:{id:'track'},title:'A track title',artist:'An artist',album:'The Original Soundtrack and Additional Recordings',len:'3:00',artkey:'release'};
 const album={id:'release',named:true,album:track.album,artist:track.artist,tracks:[{handle:track.h,title:track.title,dur:track.len}]};
 Object.assign(c,{COL:{},CH_DOT:'·',CH_BULL:'•',HB_CARD:[],drag:null,caretOn:false,searchQuery:'query',searchArts:[],searchTrks:[track],searchScroll:0,searchScrollT:0,computeSearch(){},
  view:'album',artistAlbums:[album],artScroll:0,artScrollT:0,viewArtist:track.artist,viewAlbum:album.id,getAlbumCatalog:()=>({albums:[album]}),
  M:{cpad:24,artSz:100,headH:190,rowH:50,pad:8,gap:10,navW:240},SHEAD:190,ssArtistName:String,ssDrawArtistAvatar(){},
  ensureBuilt:()=>true,gateReady:()=>true,rowHandlesPl:()=>[],rowHandlesSongs:()=>[],songsReady(){},songsSteps(){},ROW_GATE_MS:0,
  activePl:()=>({i:1,name:'Test Playlist',count:1}),plChoice:()=>({single:null}),canEditPl:()=>false,playingLoc:()=>null,npIsShuffleOf:()=>false,
  getItems:()=>[track.h],getMeta:()=>({title:[track.title],artist:[track.artist],album:[track.album],len:[track.len],artkey:[track.artkey]}),getPlOrder:()=>[0],warmOnce(){},
  firstRow:0,firstRowT:0,plSort:0,PL_SORTS:[],plSortMenuOpen:false,plDropHover:false,drawSortDirBtn(){},drawSortMenu(){},drawPlCover(){},
  songsTracks:[track],songsRows:[{k:'t',y:0,h:50,t:track,ti:0,n:1}],songsGroup:'none',songsTotalSec:180,songsContentH:50,songsScroll:0,songsScrollT:0,
  songsFirstAt:()=>0,libChoice:()=>({single:null}),sgMenuOpen:false,SONGS_GROUPS:[],drawNormalizePill(){},drawGroupMenu(){},drawLibCover(){},
  blend:()=>0,artHue:()=>0,ssInk:()=>0,SS_APPEARANCE:'light',hv:()=>false,ssRowHover:()=>false,ssTrackID:h=>h.id,ssTextClusters:text=>Array.from(text),
  drawIcon(){},drawRounded(){},drawCover:(g,x,y,w,rad,handle)=>covers.push({x,y,w,handle}),drawDropPill(){},drawScrollbar(){},
  drawPlaylistPlay:(g,x,y,w)=>({x0:x,y0:y,x1:x+w,y1:y+w}),ssBeginViewport:(key,g)=>({gr:g,finish(){}}),ssDrawCachedRow:(g,key,x,y,w,h,draw)=>draw(g),
  tC(){},tL:(g,text,font,col,x,y,w,h)=>labels.push({text,font,x,y,w,h}),tR:(g,text,font,col,x,y,w,h)=>times.push({text,x,y,w,h})});
 return {c,gr,labels,times,covers,fills,lines,album,track};
}
run('library views fill the pane at desktop scale while keeping actions and metadata aligned',()=>{
 const {c,gr,labels,times,lines,album,track}=libraryPaintHarness();
 for(const [width,scale,padding] of [[2123,1.25,24],[640,1,16]]){
  const frame={x:427,y:40,w:width,h:880};
  c.ssDensity=scale;c.R={main:frame,libraryScales:{main:scale}};
  c.ssPersonalGutter=()=>32*c.ssDensity;
  const bounds=[];
  for(const [draw,view] of [['drawArtist','album'],['drawArtist','artist'],['drawPlaylist','playlist'],['drawSongs','songs'],['drawSearch','search']]){
   c.view=view;c.M.cpad=draw==='drawSearch'?padding:Math.round(padding*scale);
   c.artistAlbums=[album];labels.length=times.length=lines.length=0;c.HB_CARD=[];
   c[draw](gr,frame);
   const row=c.HB_TR[0],time=times.find(label=>label.text===track.len);
   const right=time.x+time.w;
   if(['album','playlist','songs'].includes(view)){
    const number=times.find(label=>label.text==='1');
    assert.ok(number&&number.x>row.pgx1&&number.x+number.w<row.more.x0,view+' has a separate visible track number');
   }
   const inset=Math.round(padding*scale),available=frame.w-2*inset-Math.round(32*scale);
   const limit=draw==='drawArtist'||draw==='drawPlaylist'?Math.round(1440*scale):Infinity;
   assert.equal(right,frame.x+inset+Math.min(available,limit),view+' respects its reading width');
   assert.equal(row.pgx0,frame.x+Math.round(padding*scale),view+' left gutter');
   assert.ok(row.x0>=frame.x&&row.x1<=frame.x+frame.w&&row.y1<=frame.y+frame.h,view+' clipped row');
   assert.ok(row.more.x1<=time.x&&row.more.x0>=row.x0&&row.more.x1<=row.x1,view+' action spacing');
   if(view==='playlist'||view==='songs'){
    const title=labels.find(label=>label.text===track.title),head=labels.find(label=>label.text==='歌曲');
    assert.equal(head.x,title.x,view+' title header');
    assert.equal(lines.at(-1).x1,right,view+' header rule');
    assert.ok(row.favoriteX>right&&row.favoriteX+28<=row.x1,view+' favorite gutter');
   }
   if(view==='songs'&&width===2123){
    const albumCell=labels.find(label=>label.text===track.album),header=labels.find(label=>label.text==='专辑');
    assert.ok(albumCell.w>=620&&albumCell.x===header.x&&albumCell.w===header.w,'wide album metadata column');
   }
   if(limit===Infinity||available<=limit)bounds.push([right,row.more.x0,row.more.x1]);
  }
  assert.ok(bounds.every(box=>box.every((x,index)=>x===bounds[0][index])),JSON.stringify(bounds));
 }
});
run('search caret damage matches the text and pill drawn at each pane scale',()=>{
 const {c,gr,labels,fills}=libraryPaintHarness();
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 vm.runInContext(app.slice(app.indexOf('var ssLibraryFonts='),app.indexOf('function drawLibraryNav(')),c);
 c.FONT={searchTxt:{size:16}};c.ssFsFont=(font,scale)=>({size:font.size*scale});c.caretOn=true;
 for(const [width,scale,padding] of [[2123,1.25,24],[901,1.05,24],[555,.8,16]]){
  const frame={x:317,y:46,w:width,h:710};c.R={main:frame,libraryScales:{main:scale}};c.M.cpad=padding;
  const requested={...c.searchBoxRect()};fills.length=labels.length=0;
  c.ssDrawScaledLibrary(gr,g=>c.drawSearch(g,frame),c.ssSearchScale(frame),false);
  const full=labels.find(label=>label.text==='query'),caret=fills.at(-1);
  fills.length=labels.length=0;
  c.ssDrawScaledLibrary(gr,g=>c.drawSearchBox(g,frame),c.ssSearchScale(frame),false);
  assert.equal(requested.x,frame.x+Math.round(padding*scale)-2);
  assert.deepEqual(fills[0],requested);assert.deepEqual(labels[0],full);assert.deepEqual(fills.at(-1),caret);
  assert.equal(full.font.size,16*scale);assert.ok(full.x>=requested.x&&full.x+full.w<=requested.x+requested.w);
 }
});
run('every playlist row shows artwork while labels identify album runs',()=>{
 const {c,gr,labels,covers,track}=libraryPaintHarness();
 const order=[0,2,1,3],items=order.map((_,i)=>({id:'track-'+i}));
 const meta={title:['First','Different release','Same release','Return to first'],artist:['First Artist','Different Artist','Guest Artist','First Artist'],album:order.map(()=>track.album),len:order.map(()=>track.len),artkey:['album-a','album-b','album-a','album-a']};
 Object.assign(c,{activePl:()=>({i:1,name:'Read only playlist',count:4}),getItems:()=>items,getMeta:()=>meta,getPlOrder:()=>order});
 c.drawPlaylist(gr,{x:250,y:40,w:1100,h:720});
 assert.deepEqual(Array.from(c.HB_TR,row=>row.item),order);
 assert.deepEqual(Array.from(c.HB_TR,row=>row.playId),order.map(i=>items[i].id));
 assert.ok(c.HB_TR.every(row=>row.rowH===c.HB_TR[0].rowH&&row.more.x0===c.HB_TR[0].more.x0));
 assert.deepEqual(covers.map(art=>art.handle.id),order.map(i=>items[i].id));
 assert.deepEqual(labels.filter(label=>label.text.includes(track.album)).map(label=>label.text),['First Artist · '+track.album,'Different Artist · '+track.album,'First Artist · '+track.album]);
 assert.ok(labels.some(label=>label.text==='Guest Artist'));
 assert.equal(new Set(labels.filter(label=>meta.title.includes(label.text)).map(label=>label.x)).size,1);
});
run('desktop catalog tiles keep long release versions distinguishable on two lines',()=>{
 const {c,gr,labels,album}=libraryPaintHarness(),prefix='Original Television Soundtrack Complete Recordings and Previously Unreleased Bonus Music';
 const versions=['[Disc 1]','[Disc 2]','(Deluxe Edition)'];
 const albums=Array.from({length:15},(_,i)=>({...album,id:'album-'+i,album:prefix+' '+(versions[i]||'[Disc '+(i+1)+']')}));
 c.ssMeasureText=(g,text)=>Array.from(text).length*10;
 c.getAlbumCatalog=()=>({albums});c.W=2560;c.H=1440;c.ssDensity=1.25;c.M.cpad=30;
 const frame={x:427,y:40,w:2123,h:900};c.drawAlbums(gr,frame);
 const first=c.HB_CARD[0],columns=c.HB_CARD.filter(box=>box.y0===first.y0);
 assert.ok(columns.length>=6&&columns.length<=7);assert.ok(first.x1-first.x0>250);
 assert.equal(c.ssAlbumGrid(2063,1.25,undefined,7).size,c.ssAlbumGrid(1400,1.25,undefined,7).size);
 for(const [index,version] of versions.entries()){
  const box=columns[index],titleLines=labels.filter(label=>label.x===box.x0&&label.y>box.y0&&label.y<box.y1&&label.text!==album.artist);
  assert.equal(titleLines.length,2);assert.ok(titleLines[1].text.endsWith(version));
  assert.ok(titleLines.every(line=>!line.text.includes('…')&&line.y+line.h<=box.y1));
  assert.ok(titleLines[1].text.length*10<=titleLines[1].w);
 }
 assert.ok(c.HB_CARD.every(box=>box.x0>=frame.x&&box.x1<=frame.x+frame.w&&box.y1<=frame.y+frame.h));
});
run('fullscreen scales the centered cover and leaves separate space for text and transport',()=>{
 const {c}=harness();
 Object.assign(c,{COL:{},blend:()=>0,ssInk:()=>0});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 const sizes=[];
 for(const [width,height] of [[1180,780],[1440,900],[1920,1080],[2560,1440]]){
  const s=c.ssFsScale(width,height),bot=c.ssFsStageBottom(width,height),m=c.ssFsDefaultGeometry(width,bot,s,c.ssFsCoverScale(width,height));
  assert.ok(Math.abs(m.x+m.size/2-width/2)<1&&Math.abs(m.textX+m.textW/2-width/2)<1);
  assert.ok(m.y+m.size<m.textY&&m.textY+Math.round(126*s)<=bot);
  sizes.push(m.size);
 }
 assert.ok(sizes[2]>sizes[1]&&sizes[1]>sizes[0]);
 assert.equal(sizes[3],693);
 assert.equal(c.ssFsScale(2560,1440),1.4);
});
run('fullscreen labels the featured album and the current transport separately',()=>{
 const {c}=harness(),labels=[],actions=[],transports=[];
 Object.assign(c,{W:1180,H:780,NP:null,pbShuffle:true,ssState:null,isHiddenPl:()=>false,HB_FS:[],COL:{},FONT:{},blend:()=>0,ssInk:()=>0,
  getAlbumCatalog:()=>({albums:[{album:'Example',artist:'Artist'}]}),ssHomeAlbumSelection:albums=>albums,
  ssArtistName:String,npTitleStr:'Current Track',npArtistStr:'Current Artist',npPlaylistSrc:()=> 'Library',
  drawRounded(){},tCE:(g,label)=>labels.push(label),tC:(g,label)=>labels.push(label),hv:()=>false,
  ssDrawAlbumPlayAction:(g,x,y,w,h,label,font,primary)=>{actions.push({label,primary});return {act:'featured'};},
  ssFooterToolLayout:()=>({}),ssHasTransportSource:()=>true,ssDrawTransport:(g,y,h,s,transport)=>transports.push(transport),ssDrawFooterTools(){},fb:{IsPaused:false}});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 c.npPlaylistSrc=()=> 'Library';
 const featured=c.drawFsDefault({},608);c.drawFsBar({},featured);
 assert.ok(labels.includes('推荐专辑'));
 assert.deepEqual(actions,[{label:'播放这张专辑',primary:true}]);
 assert.ok(transports.at(-1).secondaryPlay&&transports.at(-1).hideIdleSeek);
 assert.equal(transports.at(-1).startLabel,'开始播放');
 c.ssState={queue:[],source_name:'Current Playlist'};c.drawFsBar({},featured);
 assert.equal(transports.at(-1).startLabel,'播放歌单「Current Playlist」');
 c.ssState.queue=[{id:'queued'}];c.drawFsBar({},featured);
 assert.equal(transports.at(-1).startLabel,'播放待播队列');
 labels.length=0;c.NP={};c.drawFsDefault({},608);c.drawFsBar({});
 assert.ok(labels.includes('正在播放')&&labels.includes('Current Track')&&labels.includes('Current Artist')&&labels.includes('歌单 · Library'));
 assert.ok(!labels.some(label=>label.includes('暂停当前曲目'))&&!transports.at(-1).startLabel);
 c.fb.IsPaused=true;c.drawFsDefault({},608);c.drawFsBar({});assert.ok(labels.includes('已暂停')&&!labels.includes('已暂停 · 继续当前曲目'));
});
run('large fullscreen uses the display width for the title and scales secondary controls',()=>{
 const {c}=harness(),labels=[],buttons=[];
 const titleFont={Name:'Segoe UI',Size:26,Style:0},controlFont={Name:'Segoe UI',Size:13,Style:0};
 Object.assign(c,{W:2560,H:1440,NP:null,HB_FS:[],COL:{},FONT:{title:{Size:28},fsTitle:titleFont,fsArtist:controlFont,fsSrc:controlFont,sect2:controlFont,pl:controlFont,plSub:controlFont,time:controlFont},
  fb:{IsPaused:false},pbShuffle:false,ssState:null,blend:()=>0,ssInk:()=>0,hv:()=>false,
  SS_FONT_META:[],gdi:{Font:(Name,Size,Style)=>({Name,Size,Style})},drawRounded(){},drawIcon(){},
  getAlbumCatalog:()=>({albums:[{album:'Long Title',artist:'Artist'}]}),ssHomeAlbumSelection:albums=>albums,ssArtistName:String,
  tCE:(g,text,font,x,y,z,w)=>labels.push({text,font,w}),tC(){},tL:(g,text,font)=>labels.push({text,font}),
  ssDrawAlbumPlayAction:(g,x,y,w,h,label,font)=>{buttons.push({label,font});return {act:'featured'};},
  ssHasTransportSource:()=>true,ssDrawTransport(){},ssFooterToolLayout:()=>({}),
  ssDrawFooterTools:(g,y,h,s,tools)=>{c.modeFont=tools.modeFont;c.panelLabelFont=tools.panelLabelFont;}});
 vm.runInContext(fs.readFileSync(path.join(root,'views/fullscreen.js'),'utf8'),c);
 c.drawFsDefault({},1156);c.drawFsBar({});
 const title=labels.find(label=>label.text==='Long Title');
 assert.ok(title.w>=1900);
 assert.equal(title.font.Name,titleFont.Name);
 assert.equal(title.font.Size,36);
 assert.ok(buttons[0].font.Size>controlFont.Size);
 assert.ok(c.modeFont.Size>controlFont.Size);
 assert.ok(c.panelLabelFont&&c.panelLabelFont.Size<=c.modeFont.Size);
});
console.log(count+' desktop drawer checks passed');
