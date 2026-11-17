'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}}
function harness(){
  const writes=[],draws=[];
  const gr=new Proxy({CalcTextWidth(){return 60;},FillEllipse(){draws.push('play');}},{get:(o,k)=>o[k]||(()=>{})});
  const c={console,Date,Math,JSON,isFinite,RGB:()=>0,fb:{ProfilePath:'P:\\'},utils:{WriteTextFile(p,s){writes.push(JSON.parse(s));}},window:{},
    pbShuffle:true,VOL_CEIL:0,ssDensity:1,SS_APPEARANCE:'dark',HB_SONGS_PLAY:null,
    COL:{base:1,green:2,onAccent:3,text:4,text2:5,greenHover:6},FONT:{},M:{cpad:24,artSz:160,rowH:50},SHEAD:260,
    hv:()=>true,hit:(list,x,y)=>list.find(h=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1),inRect:(x,y,h)=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1,repaintAll(){},drawIcon(){},ssHeaderBoxes:()=>({eyeY:0,eyeH:20,titleY:22,titleH:50,metaY:80,metaH:20}),
    ensureBuilt:()=>true,gateReady:()=>true,rowHandlesSongs:()=>[],ROW_GATE_MS:0,songsReady(){},songsSteps(){},
    songsTracks:[{h:{RawPath:'file://A',SubSong:0}},{h:{RawPath:'file://B',SubSong:1}}],songsRows:[{k:'t'}],songsTotalSec:80,songsGroup:'none',
    libChoice:()=>({single:null}),blend:()=>0,artHue:()=>0,drawLibCover(){draws.push('cover');},
    tL(){},tC(){},fmtNum:String,fmtDur:()=>'',CH_DOT:' · ',CH_BULL:'•',drawNormalizePill:(gr,x,y,w,h)=>({x0:x,y0:y,x1:x+w,y1:y+h}),drawDropPill:(gr,x,y,w,h)=>({x0:x,y0:y,x1:x+w,y1:y+h}),
    labelOf:()=>'',SONGS_GROUPS:[],sgMenuOpen:false,songsContentH:0,
    plman:{ExecutePlaylistDefaultAction(){throw Error('All Songs must use native source scheduling');}},
  };
  vm.createContext(c);const load=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),c);
  load('core/corners.js');load('core/util.js');load('data/smartshuffle.js');load('data/playback.js');return {c,writes,gr,draws,load};
}
test('All Songs sends one bounded native library command in smart and native modes',()=>{
  for(const smart of [true,false]){
    const h=harness();h.c.pbShuffle=smart;
    assert.equal(typeof h.c.playLibrary,'function','library-level action is missing');
    assert.equal(h.c.playLibrary(),true);assert.equal(h.writes.length,1);
    assert.equal(h.writes[0].version,1);assert.equal(h.writes[0].op,'play_library');
    assert.deepEqual(Object.keys(h.writes[0]).sort(),['id','op','version'],'library handles stay in the SDK rather than crossing the bridge');
  }
});
test('empty All Songs cannot dispatch playback',()=>{
  const h=harness();h.c.songsTracks=[];assert.equal(h.c.playLibrary(),false);assert.equal(h.writes.length,0);
});
test('All Songs header draws a distinct play target below the library cover at both densities',()=>{
  for(const [s,width] of [[1,900],[1,600],[.75,675],[.75,450]]){
    const h=harness();h.load('views/songs.js');h.c.ssDensity=s;
    h.c.drawSongs(h.gr,{x:0,y:0,w:width,h:100});
    const box=h.c.HB_SONGS_PLAY;assert.ok(box&&box.label&&box.library);assert.ok(box.x1-box.x0>=32&&box.y1-box.y0>=32);
    assert.equal(box.x0,24);assert.ok(box.y0>16*s+Math.min(160,Math.round(168*s)));
    assert.ok(h.draws.indexOf('play')>h.draws.indexOf('cover'),'play follows the existing library cover');
    const group=h.c.HB_SG;assert.ok(box.x1<=group.x0||box.x0>=group.x1||box.y1<=group.y0||box.y0>=group.y1,'play cannot overlap grouping controls');
  }
});
test('loading and empty library clear a previously clickable header action',()=>{
  const h=harness();h.load('views/songs.js');h.c.HB_SONGS_PLAY={x0:0};h.c.ensureBuilt=()=>false;h.c.skelVisible=()=>false;
  h.c.drawSongs(h.gr,{x:0,y:0,w:900,h:100});assert.equal(h.c.HB_SONGS_PLAY,null);
  h.c.ensureBuilt=()=>true;h.c.songsTracks=[];h.c.songsRows=[];h.c.drawSongs(h.gr,{x:0,y:0,w:900,h:100});assert.equal(h.c.HB_SONGS_PLAY,null);
});
test('real application callbacks dispatch the All Songs header before selection and seek',()=>{
  const h=harness(),c=h.c;c.window.Width=1100;c.window.Height=740;c.window.Repaint=()=>{};
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
  Object.assign(c,{ssPopup:null,ssModal:false,SS_ARTIST_HB:null,SS_LYRIC_BTN:null,SS_QUEUE_SB:null,
    repaintBar(){},clamp01:x=>Math.max(0,Math.min(1,x)),vizMenuOpen:false,sgMenuOpen:false,plSortMenuOpen:false,dupPrompt:null,rgPrompt:null,HB_SG:null,HB_RGNORM:null,HB_PLSORT:null,HB_PLSORTDIR:null,
    HB_ALLSONGS:null,ssRecycleClick:()=>false,ssResizeBegin:()=>false,ssResizeEnd:()=>false,ssPopupClick:()=>false,
    ssPointerDown:()=>false,ssPointerUp:()=>false,ssSelectionDown:()=>{throw Error('All Songs action reached selection down');},
    ssSelectionUp:()=>{throw Error('All Songs action reached selection up');},TBH:32});
  c.view='songs';c.HB_SONGS_PLAY={x0:100,y0:100,x1:144,y1:144,library:true,label:'播放全部歌曲'};
  c.HB_SEEK={x0:100,y0:100,x1:144,y1:144,x:100,w:44};
  c.on_mouse_lbtn_down(120,120);assert.equal(c.drag,null);c.on_mouse_lbtn_up(120,120);
  assert.equal(h.writes.at(-1).op,'play_library');assert.equal(c.view,'songs');
  c.ssFlight=null;h.writes.length=0;c.HB_SEEK=null;c.ssSelectOwner={};
  c.ssSelectionUp=()=>{c.ssSelectOwner=null;return true;};c.on_mouse_lbtn_up(120,120);
  assert.equal(h.writes.length,0,'ending a song selection over the header cannot play the library');
  c.ssSelectionDown=c.ssSelectionUp=()=>false;c.on_mouse_lbtn_down(120,120);c.on_mouse_lbtn_up(700,400);
  assert.equal(h.writes.length,0,'release outside cancels a library play press');
  let searchPlays=0;
  c.view='search';c.HB_TR=[{x0:150,y0:100,x1:600,y1:150,pgx0:150,pgx1:184,srch:true,idx:0}];
  c.searchTrks=[{reason:''}];c.ssPlaySearchHit=()=>{searchPlays++;};c.repaintAll=()=>{};
  c.utils.IsKeyPressed=key=>key===17;
  c.on_mouse_lbtn_down(166,124);c.on_mouse_lbtn_up(166,124);
  assert.equal(searchPlays,0,'Ctrl-click on a play glyph stays a selection gesture');
  c.utils.IsKeyPressed=()=>false;
  c.on_mouse_lbtn_down(166,124);c.on_mouse_lbtn_up(166,124);
  assert.equal(searchPlays,1,'the same glyph plays on an unmodified click');
  Object.assign(c.HB_TR[0],{playVisible:true,playId:'first'});
  c.on_mouse_lbtn_down(230,124);c.on_mouse_lbtn_up(166,124);
  assert.equal(searchPlays,1,'pressing the title and releasing over the glyph must not play');
  c.on_mouse_lbtn_down(166,124);c.HB_TR[0]={...c.HB_TR[0],playId:'replacement'};
  c.on_mouse_lbtn_up(166,124);
  assert.equal(searchPlays,1,'changed search results cannot replace a pressed track');
  c.on_mouse_lbtn_down(166,124);c.on_mouse_lbtn_up(166,124);
  assert.equal(searchPlays,2,'press and release on the visible glyph plays the track');


});

test('artist page play sends all albums in page order and preserves subsong identity',()=>{
  const h=harness(),c=h.c;
  Object.assign(c,{view:'artist',viewArtist:'Artist',ssTrackID:t=>t.RawPath+'|'+t.SubSong,
    artistAlbums:[{tracks:[{handle:{RawPath:'file://A',SubSong:2}}]},{tracks:[{handle:{RawPath:'file://B',SubSong:0}}]}]});
  assert.equal(c.playArtist('Previous artist'),false);
  assert.equal(c.playArtist('Artist'),true);
  assert.equal(h.writes[0].op,'play_artist');
  assert.deepEqual(h.writes[0].tracks,['file://A|2','file://B|0']);
  c.artistAlbums=[];assert.equal(c.playArtist('Artist'),false);
});

function artistHarness(){
  const h=harness(),c=h.c;
  h.load('views/cards.js');h.load('views/artist.js');
  Object.assign(c,{view:'artist',viewArtist:'Artist',viewAlbum:'',artScroll:0,artScrollT:0,HB_CARD:[],SS_ARTIST_HB:null,HB_ARTIST_PLAY:null,
    coverCol:()=>0,ssFontLineHeight:()=>0,ssTextClusters:Array.from,ssMeasureText:(g,text)=>g.CalcTextWidth(text),
    ssTrackTextMetrics:()=>({title:22,detail:18,height:48}),ssDrawFixedLabel:(...args)=>c.tL(...args),ssDrawArtistAvatar(){},ssArtistName:String,drawRounded(){},ssRowHover:()=>false,tR(){},
    ssBeginViewport:(key,gr)=>({gr,finish(){}}),drawScrollbar(){},clampPx:(value,max)=>Math.max(0,Math.min(value,max))});
  return {h,c,gr:{FillGradRect(){},FillSolidRect(){},FillPolygon(){},FillEllipse(){},CalcTextWidth:s=>s.length*8}};
}
test('artist play button stays clear of the artist information link and disappears with no songs',()=>{
  const {c,gr}=artistHarness();
  c.artistAlbums=[{tracks:[{}]}];
  c.drawArtist(gr,{x:0,y:0,w:370,h:260});
  assert.equal(c.HB_ARTIST_PLAY.artist,'Artist');
  assert.ok(c.HB_ARTIST_PLAY.x1<c.SS_ARTIST_HB.x0);
  c.artistAlbums=[];c.drawArtist(gr,{x:0,y:0,w:370,h:260});
  assert.equal(c.HB_ARTIST_PLAY,null);
});
test('long single-album artist pages scroll to their final track with clipped hit targets',()=>{
  const {c,gr}=artistHarness(),bounds={x:0,y:0,w:390,h:350};
  c.artistAlbums=[{id:'A',named:true,album:'Album',tracks:Array.from({length:32},(_,i)=>({title:'Track '+i}))}];
  let viewportTop; const viewport=c.ssBeginViewport;
  c.ssBeginViewport=(key,graphics,x,y,w,h)=>{viewportTop=y;return viewport(key,graphics,x,y,w,h);};
  c.drawArtist(gr,bounds);
  assert.ok(c.SS_COLLECTION_SCROLL_MAX>1000);
  assert.ok(c.HB_CARD.some(a=>a.kind==='album'&&a.id==='A'));
  c.artScroll=c.artScrollT=c.SS_COLLECTION_SCROLL_MAX;
  c.HB_CARD=[];c.drawArtist(gr,bounds);
  assert.equal(c.HB_TR.at(-1).idx,31);
  assert.ok(c.HB_TR.every(row=>row.y0>=viewportTop&&row.y1<=bounds.y+bounds.h));
});
test('collection scrolling never changes the cached artwork size limit',()=>{
  const {h,c,gr}=artistHarness();
  h.load('data/art.js');h.load('data/covers.js');c.window.GetProperty=(key,value)=>value;
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
  c.view='artist';c.viewArtist='Artist';c.artistAlbums=[{tracks:[{title:'Song'}]}];c.drawRounded=()=>{};
  c.gdi={Image:()=>({Width:500,Height:500,Resize(){throw Error('500px cover must not be resized');}})};
  c.ssCoverTracks={'fixture|0':{cover:'cached.jpg'}};
  c.drawArtist(gr,{x:0,y:0,w:390,h:350});
  assert.equal(c.SS_COLLECTION_SCROLL_MAX,0);
  assert.equal(c.ART_MAXPX,500);
  assert.equal(c.ssCachedCover({Path:'fixture',SubSong:0}).Width,500);
});
test('album catalog groups by tag across file paths and orders discs then track numbers',()=>{
  const h=harness(),c=h.c;
  h.load('data/library.js');
  const rows=[{title:'second',artist:'Artist',album:'Shared',discno:'1',trackno:'02',RawPath:'file://A'},
              {title:'first',artist:'Artist',album:'Shared',discno:'1',trackno:'01',RawPath:'file://B'},
              {title:'disc two',artist:'Artist',album:'Shared',discno:'2',trackno:'01',RawPath:'file://C'},
              {title:'other artist',artist:'Another',album:'Shared',RawPath:'file://D'},
              {title:'no album',artist:'Artist',album:'',RawPath:'file://E'}];
  rows.Count=rows.length;
  c.ssCatalogHandles=()=>rows;c.ssCatalogArtistNames=()=>rows.map(r=>r.artist);
  c.TF=Object.fromEntries(['title','album','len','year','discno','trackno'].map(k=>[k,{EvalWithMetadbs:list=>list.map(r=>r[k]||'')}]));
  const catalog=c.getAlbumCatalog(),album=catalog.albums.find(a=>a.artist==='Artist');
  assert.equal(catalog.albums.length,2);
  assert.deepEqual(Array.from(album.tracks,t=>t.title),['first','second','disc two']);
  Object.assign(c,{view:'albums',artScroll:50,artScrollT:55,ssOpenCatalog:null,ssAlbumBack:null,ssTrackID:t=>t.RawPath+'|0'});
  c.ssOpenAlbum(album.id);
  assert.equal(c.artScroll,0);assert.equal(c.playAlbum(album.id),true);
  assert.equal(h.writes[0].op,'play_album');assert.deepEqual(h.writes[0].tracks,['file://B|0','file://A|0','file://C|0']);
  c.ssBackFromAlbum();assert.equal(c.view,'albums');assert.equal(c.artScroll,55);
});



test('desktop artist album shelf uses multiple columns and retains track access',()=>{
  const {c,gr}=artistHarness(),bounds={x:0,y:0,w:1000,h:650};
  c.artistAlbums=Array.from({length:7},(_,i)=>({id:'A'+i,named:true,album:'Album '+i,tracks:[{title:'Track '+i}]}));
  c.drawArtist(gr,bounds);
  const cards=c.HB_CARD.filter(a=>a.kind==='album');
  assert.ok(cards.length>=2);
  assert.equal(cards[0].y0,cards[1].y0);
  assert.ok(cards[0].x1<cards[1].x0);
  assert.ok(cards.every(a=>a.y0>=174&&a.y1<=650));
  c.artScroll=c.artScrollT=c.SS_COLLECTION_SCROLL_MAX;c.HB_CARD=[];c.drawArtist(gr,bounds);
  assert.equal(c.HB_TR.at(-1).block,6);
  assert.ok(c.HB_TR.every(a=>a.y0>=174&&a.y1<=650));
});
test('artist album shelf rebuilds when desktop width changes',()=>{
  const {c,gr}=artistHarness();
  c.artistAlbums=Array.from({length:8},(_,i)=>({id:'A'+i,named:true,album:'Album '+i,tracks:[{}]}));
  c.drawArtist(gr,{x:0,y:0,w:1000,h:650});
  const wide=c.ssCollectionRows.find(row=>row.tiles).tiles.length;
  c.drawArtist(gr,{x:0,y:0,w:700,h:650});
  assert.ok(c.ssCollectionRows.find(row=>row.tiles).tiles.length<wide);
  c.drawArtist(gr,{x:0,y:0,w:390,h:650});
  assert.equal(c.ssCollectionRows[0].tiles,undefined);
});
console.log(passed+' All Songs playback checks passed');
