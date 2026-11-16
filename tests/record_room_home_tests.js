const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test');
function harness(){
 const paints=[],layers=[],texts=[],c={ssDensity:1,M:{cpad:24,cardTextH:58,pad:8},FONT:{},COL:{},HB_CARD:[],HB_PLPLAY:[],homeScroll:0,homeScrollT:0,plScroll:0,plScrollT:0,drag:'',fb:{IsPlaying:false},shelfHandles:[],warmed:{},artistList:[],
 visiblePlaylists:()=>[],getAlbumCatalog:()=>({albums:Array.from({length:44},(_,i)=>({id:'album-'+i,album:'Album '+i,artist:'Artist '+i,handle:{i}}))}),ensureBuilt:()=>true,gateReady:()=>true,clampPx:(n,m)=>Math.max(0,Math.min(n,m)),hv:()=>false,ssArtistName:String,
 drawRounded:(gr,x,y,w)=>paints.push({gr,x,y,w}),tL:(gr,text)=>texts.push(text),tC(){},tR(){},drawScrollbar(){},drawScrollbarH(){},drawPlaylistCard(){},startWarmHome(){},
 ssBeginViewport:(key,gr,x,y,w,h)=>{const layer={key,x,y,w,h,gr:{FillRoundRect(){},FillSolidRect(){}},done:false};layers.push(layer);return {gr:layer.gr,finish(){layer.done=true;}};}};
 vm.createContext(c);for(const file of ['cards','home'])vm.runInContext(fs.readFileSync('theme/verdant/views/'+file+'.js','utf8'),c);
 return {c,paints,layers,texts,gr:{FillSolidRect(){},FillRoundRect(){},DrawLine(){}}};
}
test('home shows real album navigation when verified artist list is empty inside a clipped viewport',()=>{
 const {c,paints,layers,texts,gr}=harness(),r={x:240,y:40,w:900,h:750};c.drawHome(gr,r);
 const cards=c.HB_CARD.filter(a=>a.kind==='album');assert.ok(cards.length>=3);assert.equal(cards[0].id,'album-0');assert.equal(cards[0].y0,cards[1].y0);assert.ok(cards[0].x1<cards[1].x0);
 assert.equal(layers.length,1);assert.equal(layers[0].done,true);assert.ok(paints.every(a=>a.gr===layers[0].gr));assert.ok(cards.every(a=>a.y0>=layers[0].y&&a.y1<=r.y+r.h));assert.ok(texts.includes('44 张专辑'));
 c.homeScroll=c.homeScrollT=c.HOME_MAXROW;paints.length=0;c.drawHome(gr,r);assert.equal(c.HB_CARD.at(-1).id,'album-43');assert.ok(c.HB_CARD.every(a=>a.y0>=layers[1].y&&a.y1<=r.y+r.h));
});
