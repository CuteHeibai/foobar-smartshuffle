'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}}
function harness(){
  const writes=[],draws=[];
  const gr=new Proxy({CalcTextWidth(){return 60;},FillEllipse(){draws.push('play');}},{get:(o,k)=>o[k]||(()=>{})});
  const c={console,Date,Math,JSON,isFinite,fb:{ProfilePath:'P:\\'},utils:{WriteTextFile(p,s){writes.push(JSON.parse(s));}},window:{},
    pbShuffle:true,VOL_CEIL:0,ssDensity:1,SS_APPEARANCE:'dark',HB_SONGS_PLAY:null,
    COL:{base:1,green:2,onAccent:3,text:4,text2:5,greenHover:6},FONT:{},M:{cpad:24,artSz:160},SHEAD:260,
    hv:()=>true,hit:(list,x,y)=>list.find(h=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1),inRect:(x,y,h)=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1,repaintAll(){},drawIcon(){},ssHeaderBoxes:()=>({eyeY:0,eyeH:20,titleY:22,titleH:50,metaY:80,metaH:20}),
    ensureBuilt:()=>true,gateReady:()=>true,rowHandlesSongs:()=>[],ROW_GATE_MS:0,songsReady(){},songsSteps(){},
    songsTracks:[{h:{RawPath:'file://A',SubSong:0}},{h:{RawPath:'file://B',SubSong:1}}],songsRows:[{k:'t'}],songsTotalSec:80,songsGroup:'none',
    libChoice:()=>({single:null}),blend:()=>0,artHue:()=>0,drawLibCover(){draws.push('cover');},
    tL(){},tC(){},fmtNum:String,fmtDur:()=>'',CH_DOT:' · ',CH_BULL:'•',drawNormalizePill:(gr,x,y,w,h)=>({x0:x,y0:y,x1:x+w,y1:y+h}),drawDropPill:(gr,x,y,w,h)=>({x0:x,y0:y,x1:x+w,y1:y+h}),
    labelOf:()=>'',SONGS_GROUPS:[],sgMenuOpen:false,songsContentH:0,
    plman:{ExecutePlaylistDefaultAction(){throw Error('All Songs must use native source scheduling');}},
  };
  vm.createContext(c);const load=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),c);
  load('data/smartshuffle.js');load('data/playback.js');return {c,writes,gr,draws,load};
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
test('All Songs header draws a distinct play target over the library cover at both densities',()=>{
  for(const [s,width] of [[1,900],[1,600],[.75,675],[.75,450]]){
    const h=harness();h.load('views/songs.js');h.c.ssDensity=s;
    h.c.drawSongs(h.gr,{x:0,y:0,w:width,h:100});
    const box=h.c.HB_SONGS_PLAY;assert.ok(box&&box.label&&box.library);assert.ok(box.x1-box.x0>=32&&box.y1-box.y0>=32);
    assert.ok(box.x0>=24&&box.x1<=24+160&&box.y0>=44*s&&box.y1<=44*s+160);
    assert.ok(h.draws.indexOf('play')>h.draws.indexOf('cover'),'play overlays the existing library cover');
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
});
console.log(passed+' All Songs playback checks passed');
