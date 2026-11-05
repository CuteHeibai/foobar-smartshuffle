'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}}
function harness(){
  const writes=[],draws=[];
  const gr=new Proxy({DrawImage(){draws.push('image');},FillEllipse(){draws.push('play');}},{get:(o,k)=>o[k]||(()=>{})});
  const c={console,Date,Math,JSON,isFinite,fb:{ProfilePath:'P:\\'},utils:{WriteTextFile(p,s){writes.push(JSON.parse(s));}},window:{},
    pbShuffle:true,pbRepeat:0,VOL_CEIL:0,ssDensity:1,SS_APPEARANCE:'dark',HB_PLPLAY:[],HB_DOTS:[],HB_CARD:[],HB_PLAYLIST_PLAY:null,
    COL:{base:1,green:2,black:3,text:4,text2:5,elev:6},FONT:{},M:{cardTextH:64,cpad:24,headH:260,artSz:160,rowH:56},
    plman:{PlaylistCount:4,PlaylistItemCount:()=>3,GetPlaylistName:i=>['A','B','__smartshuffle__','__verdant_np__'][i],ExecutePlaylistDefaultAction(){throw Error('playlist play must go through native engine');}},
    hv:()=>true,drawIcon(){},plCardImg:()=>({}),renderPlCard:()=>({}),paintPlCard(){},
    drawDots(g,x,y,pl){c.HB_DOTS.push({x0:x-2,y0:y-2,x1:x+26,y1:y+26,pl});},
    ssHeaderBoxes:()=>({eyeY:0,eyeH:20,titleY:22,titleH:50,metaY:80,metaH:20}),
    activePl:()=>({i:1,name:'B',count:3}),ensureBuilt:()=>true,gateReady:()=>true,rowHandlesPl:()=>[],ROW_GATE_MS:0,
    blend:()=>0,artHue:()=>0,plChoice:()=>({single:null}),drawPlCover(){},canEditPl:()=>false,tL(){},tC(){},getMeta:()=>({totalSec:10}),
    CH_DOT:' · ',fmtDur:()=>'',drawDropPill:()=>({}),drawSortDirBtn(){},labelOf:()=>'',PL_SORTS:[],plSort:0,plSortMenuOpen:false,
    hit:(list,x,y)=>list.find(h=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1),inRect:(x,y,h)=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1,repaintAll(){},
  };
  vm.createContext(c);const load=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),c);load('data/smartshuffle.js');load('data/playback.js');
  return {c,writes,gr,draws,load};
}
test('playlist action emits v1 GUID command in smart and native modes',()=>{
  for(const smart of [true,false]){
    const h=harness();h.c.pbShuffle=smart;h.c.ssState={playlists:[{index:1,guid:'{playlist-b}',name:'B'}]};
    assert.equal(typeof h.c.playPlaylist,'function','playlist-level playback is missing');
    h.c.playPlaylist(1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].version,1);assert.equal(h.writes[0].op,'play_playlist');
    assert.equal(h.writes[0].playlist_guid,'{playlist-b}');assert.equal(h.writes[0].playlist,undefined);assert.equal(h.writes[0].item,undefined);
  }
});
test('playlist action rejects stale missing or internal identity without sending an index',()=>{
  const h=harness();h.c.ssState={playlists:[{index:2,guid:'{internal}',name:'__smartshuffle__'},{index:3,guid:'{route}',name:'__verdant_np__'}]};
  h.c.playPlaylist(1);h.c.playPlaylist(2);h.c.playPlaylist(3);h.c.playPlaylist(-1);assert.equal(h.writes.length,0);
});
test('cover play target stays distinct from dots and card navigation and preserves cached image',()=>{
  const h=harness();h.load('views/cards.js');h.c.hv=()=>false;h.c.drawPlaylistCard(h.gr,10,20,176,1,0,220);
  assert.ok(h.draws.indexOf('image')>=0&&h.draws.indexOf('play')>h.draws.indexOf('image'),'overlay must draw after original cached cover');
  h.c.HB_PLPLAY=[];h.c.HB_CARD=[];h.c.hv=()=>true;h.c.drawPlaylistCard(h.gr,10,20,176,1,0,220);
  assert.equal(h.c.HB_PLPLAY.length,1);assert.equal(h.c.HB_CARD.length,1);const play=h.c.HB_PLPLAY[0],dots=h.c.HB_DOTS[0];
  assert.equal(play.pl,1);assert.ok(play.label);assert.ok(play.x1-play.x0>=40&&play.y1-play.y0>=40);
  assert.ok(play.x1<=dots.x0||play.y1<=dots.y0||play.y0>=dots.y1||play.x0>=dots.x1,'play target must not open dots');
  assert.notDeepEqual(play,h.c.HB_CARD[0]);
  h.c.HB_PLPLAY=[];h.c.drawPlaylistCard(h.gr,-130,20,176,1,0,30);assert.equal(h.c.HB_PLPLAY.length,0,'off-viewport action must not be clickable');
});
test('playlist header action is available before track viewport and cleared while loading',()=>{
  const h=harness();h.load('views/playlist.js');h.c.drawPlaylist(h.gr,{x:0,y:0,w:900,h:100});
  assert.equal(h.c.HB_PLAYLIST_PLAY.pl,1);assert.ok(h.c.HB_PLAYLIST_PLAY.label);h.c.ensureBuilt=()=>false;
  h.c.skelVisible=()=>false;h.c.drawPlaylist(h.gr,{x:0,y:0,w:900,h:100});assert.equal(h.c.HB_PLAYLIST_PLAY,null);
});
test('playlist play glyph uses the contrasting accent token in either appearance',()=>{
  const h=harness();let color=null,fill=null;h.c.COL.onAccent=99;h.c.COL.greenHover=9;
  h.c.drawIcon=(g,name,col)=>{color=col;};h.c.drawPlaylistPlay({FillEllipse(x,y,w,z,col){fill=col;}},0,0,44,1);
  assert.equal(color,99);assert.equal(fill,9,'hover uses the themed green hover token');
});
test('real application callbacks play cards and header before selection, navigation and seek',()=>{
  const h=harness(),c=h.c;c.window.Width=1100;c.window.Height=740;c.window.Repaint=()=>{};
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
  Object.assign(c,{ssPopup:null,ssModal:false,SS_ARTIST_HB:null,SS_LYRIC_BTN:null,SS_QUEUE_SB:null,
    repaintBar(){},clamp01:x=>Math.max(0,Math.min(1,x)),vizMenuOpen:false,sgMenuOpen:false,dupPrompt:null,rgPrompt:null,HB_SG:null,HB_RGNORM:null,HB_PLSORT:null,HB_PLSORTDIR:null,
    HB_ALLSONGS:null,ssRecycleClick:()=>false,ssResizeBegin:()=>false,ssResizeEnd:()=>false,ssPopupClick:()=>false,
    ssPointerDown:()=>false,ssPointerUp:()=>false,ssSelectionDown:()=>{throw Error('playlist button reached selection down');},
    ssSelectionUp:()=>{throw Error('playlist button reached selection up');},TBH:32});
  c.ssState={playlists:[{index:1,guid:'{playlist-b}',name:'B'}]};c.HB_PLPLAY=[{x0:100,y0:100,x1:144,y1:144,pl:1}];
  c.HB_CARD=[{x0:50,y0:50,x1:200,y1:250,kind:'pl',id:1}];c.HB_DOTS=[{x0:160,y0:210,x1:190,y1:240,pl:1}];
  c.HB_SEEK={x0:100,y0:100,x1:144,y1:144,x:100,w:44};c.on_mouse_lbtn_down(120,120);assert.equal(c.drag,null);
  c.on_mouse_lbtn_up(120,120);assert.equal(h.writes.at(-1).op,'play_playlist');assert.equal(c.view,'home');assert.equal(c.plman.ActivePlaylist,undefined);
  c.ssFlight=null;h.writes.length=0;c.HB_PLAYLIST_PLAY={x0:300,y0:100,x1:344,y1:144,pl:1};c.HB_SEEK=null;
  c.on_mouse_lbtn_down(320,120);c.on_mouse_lbtn_up(320,120);assert.equal(h.writes.at(-1).playlist_guid,'{playlist-b}');
  c.ssSelectOwner={};c.ssSelectionUp=()=>{c.ssSelectOwner=null;return true;};h.writes.length=0;
  c.on_mouse_lbtn_up(320,120);assert.equal(h.writes.length,0,'releasing a song gesture over play cannot start playback');assert.equal(c.ssSelectOwner,null);
  c.ssSelectionUp=()=>false;c.HB_SEEK={x0:480,y0:700,x1:620,y1:730,x:480,w:140};
  c.on_mouse_lbtn_down(500,715);assert.equal(c.drag,'seek');c.on_mouse_lbtn_up(320,120);
  assert.equal(h.writes.length,0,'seek drag release cannot trigger a playlist button');assert.equal(c.drag,null,'seek gesture ends even over playlist button');
  c.HB_SEEK=null;c.on_mouse_lbtn_down(320,120);c.on_mouse_lbtn_up(700,400);assert.equal(h.writes.length,0,'button release outside cancels playback');
  c.ssSelectionDown=()=>false;c.ssSelectionUp=()=>false;let menus=0;c.openPlaylistMenu=()=>menus++;h.writes.length=0;
  c.on_mouse_lbtn_up(170,220);assert.equal(menus,1);assert.equal(h.writes.length,0);
  c.on_mouse_lbtn_up(60,70);assert.equal(c.view,'playlist');assert.equal(c.plman.ActivePlaylist,1);assert.equal(h.writes.length,0);
});
test('transport button and Space share the native smart-start path instead of starting the source first row',()=>{
 const h=harness(),c=h.c;const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 Object.assign(c.window,{Width:1180,Height:780,GetProperty:(k,d)=>d,Repaint(){},RepaintRect(){}});
 vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')),c);
 Object.assign(c,{ssModal:false,ssPopup:null,ctxMenu:null,confirmDel:null,dupPrompt:null,rgPrompt:null,sgMenuOpen:false,plSortMenuOpen:false,vizMenuOpen:false,renameEdit:null,view:'playlist'});
 c.fb.PlayOrPause=()=>{throw Error('transport must start from the engine remaining order');};
 c.doCtrl('play');assert.equal(h.writes.at(-1).op,'play_pause');
 // Resolve the first bridge flight, so the second request is observable.
 c.ssFlight=null;c.on_char(32);assert.equal(h.writes.length,2);assert.equal(h.writes.at(-1).op,'play_pause');
 c.ssFlight=null;c.view='search';c.searchQuery='a';c.searchScroll=c.searchScrollT=0;c.on_char(32);
 assert.equal(c.searchQuery,'a ');assert.equal(h.writes.length,2,'typing a space in search cannot start playback');
});
console.log(passed+' playlist playback checks passed');
