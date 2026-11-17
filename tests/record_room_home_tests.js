const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test');
function harness(){
 const paints=[],layers=[],texts=[],c={ssDensity:1,M:{cpad:24,cardTextH:58,pad:8},FONT:{},COL:{},HB_CARD:[],HB_PLPLAY:[],homeScroll:0,homeScrollT:0,plScroll:0,plScrollT:0,drag:'',NP:null,npTitleStr:'',npArtistStr:'',fb:{IsPlaying:false},shelfHandles:[],warmed:{},artistList:[],
 visiblePlaylists:()=>[],getAlbumCatalog:()=>({albums:Array.from({length:44},(_,i)=>({id:'album-'+i,album:'Album '+i,artist:'Artist '+i,year:i===7?'2025':'',handle:{i}}))}),ensureBuilt:()=>true,gateReady:()=>true,clampPx:(n,m)=>Math.max(0,Math.min(n,m)),hv:()=>false,ssArtistName:String,ssFontLineHeight:()=>0,ssTextClusters:Array.from,
 ssMeasureText:(gr,text,font)=>gr.CalcTextWidth(text,font),ssDrawFixedLabel:(gr,s,f,col,x,y,w,h)=>texts.push(s),
 ssDrawIdleRecord(){},drawIcon(){},drawRounded:(gr,x,y,w)=>paints.push({gr,x,y,w}),tL:(gr,text)=>texts.push(text),tC(){},tR(){},drawScrollbar(){},drawScrollbarH(){},drawPlaylistCard(){},startWarmHome(){},
 ssBeginViewport:(key,gr,x,y,w,h)=>{const layer={key,x,y,w,h,gr:{FillRoundRect(){},FillSolidRect(){},CalcTextWidth:s=>s.length*8},done:false};layers.push(layer);return {gr:layer.gr,finish(){layer.done=true;}};}};
 vm.createContext(c);for(const file of ['../core/corners','cards','home'])vm.runInContext(fs.readFileSync('theme/verdant/views/'+file+'.js','utf8'),c);
 return {c,paints,layers,texts,gr:{FillSolidRect(){},FillRoundRect(){},FillPolygon(){},DrawPolygon(){},FillEllipse(){},SetSmoothingMode(){},DrawLine(){},CalcTextWidth:s=>s.length*8}};
}
test('home shows real album navigation when verified artist list is empty inside a clipped viewport',()=>{
 const {c,paints,layers,texts,gr}=harness(),r={x:240,y:40,w:900,h:470};c.drawHome(gr,r);
 const cards=c.HB_CARD.filter(a=>a.kind==='album');assert.ok(cards.length>=3);assert.equal(c.HB_HOME_CONTINUE.album.id,'album-7');assert.equal(cards[0].id,'album-0');assert.equal(cards[0].y0,cards[1].y0);assert.ok(cards[0].x1<cards[1].x0);
 assert.equal(layers.length,1);assert.equal(layers[0].done,true);assert.ok(paints.some(a=>a.gr===gr));assert.ok(paints.slice(1).every(a=>a.gr===layers[0].gr));assert.ok(cards.every(a=>a.y0>=layers[0].y&&a.y1<=r.y+r.h));assert.ok(texts.includes('唱片推荐'));
 c.homeScroll=c.homeScrollT=c.HOME_MAXROW;paints.length=0;c.drawHome(gr,r);assert.equal(c.ssHomeAlbums.length,9);assert.equal(c.HB_CARD.at(-1).id,'album-5');assert.ok(c.HB_CARD.every(a=>a.y0>=layers[1].y&&a.y1<=r.y+r.h));
});

test('home primary control retains the discovery action while playing or paused',()=>{
 const {c,gr}=harness(),r={x:240,y:40,w:900,h:750};
 let playCalls=0;
 c.getAlbumCatalog=()=>({albums:[]});
 Object.assign(c,{view:'home',songsScroll:25,songsScrollT:25,repaintAll(){},ssPlayOrPause(){playCalls++;}});
 c.drawHome(gr,r);
 assert.equal(c.HB_HOME_CONTINUE.act,'browse');
 c.ssActivateHomeAction(c.HB_HOME_CONTINUE);
 assert.equal(c.view,'songs');assert.equal(c.songsScroll,0);assert.equal(playCalls,0);
 Object.assign(c,{view:'home',NP:{},npTitleStr:'Paused track',npArtistStr:'Artist'});c.fb.IsPaused=true;
 c.drawHome(gr,r);
 assert.equal(c.HB_HOME_CONTINUE.act,'browse');
 c.ssActivateHomeAction(c.HB_HOME_CONTINUE);
 assert.equal(playCalls,0);assert.equal(c.view,'songs');
 c.getAlbumCatalog=()=>({albums:[{id:'album',album:'A real release',artist:'Artist',handle:{}}]});
 c.drawHome(gr,r);assert.equal(c.HB_HOME_CONTINUE.act,'featured');assert.equal(c.HB_HOME_CONTINUE.album.id,'album');
});
test('home opens a parallel album shelf and reflows it without changing tile size',()=>{
 const {c,gr,paints,layers}=harness();
 function grid(width){
  paints.length=0;c.drawHome(gr,{x:300,y:40,w:width,h:750});
  const albums=c.HB_CARD.filter(card=>card.kind==='album'),first=albums[0];
  assert.ok(albums.length>albums.filter(card=>card.y0===first.y0).length);
  assert.equal(paints[0].x,300+c.M.cpad);assert.equal(paints[0].y,first.y0);
  assert.ok(first.x0>paints[0].x+paints[0].w);
  assert.equal(layers.length,0,'the shelf fits without a bitmap seam');assert.ok(paints.every(paint=>paint.gr===gr));
  assert.equal(c.HB_HOME_ALBUMS.x1,Math.max(...albums.map(card=>card.x1)));
  return [albums.filter(card=>card.y0===first.y0).length,first.x1-first.x0];
 }
 assert.deepEqual(grid(1125),[3,157]);
 assert.deepEqual(grid(799),[2,157]);
 grid(1125);
 const g1125=c.HB_CARD.filter(card=>card.kind==='album');
 assert.equal(g1125[1].x0-g1125[0].x1,24,'the shelf keeps the shared column gap');
 assert.equal(c.HB_HOME_ALBUMS.x1,g1125[2].x1,'the link ends on the capped shelf, not the panel');
 assert.ok(c.HB_HOME_ALBUMS.x1<300+c.M.cpad+1125-40);
});

test('a short window keeps the primary action inside the main panel and clears old scroll targets',()=>{
 const {c,gr}=harness(),r={x:182,y:40,w:350,h:95};
 c.SB={};c.SBH={};c.drawHome(gr,r);
 assert.ok(c.HB_HOME_CONTINUE.y1<=r.y+r.h);
 assert.equal(c.HB_HOME_ALBUMS,null);assert.equal(c.HB_CARD.length,0);
 assert.equal(c.SB,null);assert.equal(c.SBH,null);
});


test('the idle homepage can play its featured album through the native collection action',()=>{
 const {c,gr}=harness(),r={x:240,y:40,w:1125,h:750};
 let sent;
 c.ssPlayCollection=(op,albums)=>{sent={op,albums};};
 c.drawHome(gr,r);
 assert.equal(c.HB_HOME_CONTINUE.act,'featured');
 assert.ok(c.HB_HOME_CONTINUE.x1<c.HB_CARD[0].x0);
 c.ssActivateHomeAction(c.HB_HOME_CONTINUE);
 assert.equal(sent.op,'play_album');assert.equal(sent.albums[0].id,'album-7');
});
test('album names reserve two title lines and the selection avoids repeated names',()=>{
 const {c}=harness(),gr={CalcTextWidth:s=>Array.from(s).length*8};
 const long='TV Soundtrack Special Edition';
 const wrapped=Array.from(c.ssAlbumTitleLines(gr,long,112));
 assert.equal(wrapped.length,2);assert.equal(wrapped.join(' '),long);
 const duplicate=[{album:'Same Work',artist:'A',year:'2026'},{album:'Same Work',artist:'B',year:'2026'},{album:'Another Work',artist:'B',year:'2025'}];
 assert.deepEqual(Array.from(c.ssHomeAlbumSelection(duplicate),a=>a.album),['Same Work','Another Work']);
 const discs=[{album:'Soundtrack [Disc 1]',artist:'A'},{album:'Soundtrack [Disc 2]',artist:'B'},{album:'Another Work',artist:'C'}];
 assert.deepEqual(Array.from(c.ssHomeAlbumSelection(discs),a=>a.album),['Soundtrack [Disc 1]','Another Work']);
});
