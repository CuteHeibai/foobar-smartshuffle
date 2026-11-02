'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0,failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+': '+e.message);failed++;}}
function harness(title='A very long title that must scroll across its own viewport'){
  let now=0,serial=0,repaints=0;const timers=new Map(),images=[],copies=[],words=[];
  function graphics(){return {CalcTextWidth:(s,f)=>String(s).length*10,CalcTextHeight:()=>16,SetTextRenderingHint(h){this.hint=h;},SetSmoothingMode(){},SetInterpolationMode(){},FillSolidRect(){},FillEllipse(){},
    DrawString(s,f,col,x,y,w,h,flags){words.push({s,f,x,y,w,h,flags,hint:this.hint});},DrawImage(im,x,y,w,h,sx,sy,sw,sh){copies.push({im,x,y,w,h,sx,sy,sw,sh});}};}
  const c={console,Math,Number,JSON,isFinite,Date:{now:()=>now},UISCALE:1,SS_BASE_UI_SCALE:1,ssDensity:1,
    window:{GetProperty:(k,d)=>d,SetInterval(fn,ms){timers.set(++serial,{fn,ms});return serial;},ClearInterval(id){timers.delete(id);}},
    gdi:{Font:(Name,Size,Style)=>({Name,Size,Style}),CreateImage(Width,Height){const im={Width,Height,disposed:false,GetGraphics:graphics,ReleaseGraphics(){},Dispose(){this.disposed=true;}};images.push(im);return im;}},
    fb:{IsPlaying:true,IsPaused:false,PlaybackLength:180,PlaybackTime:1,Volume:-10},NP:{RawPath:'file://song.flac',SubSong:0},npTitleStr:title,npArtistStr:'Artist',
    R:{barY:680,barInfoW:300,barToolsW:300},W:1180,M:{barH:96},fsMode:false,ssPopup:null,ssModal:false,renameEdit:null,ctxMenu:null,confirmDel:null,dupPrompt:null,rgPrompt:null,sgMenuOpen:false,plSortMenuOpen:false,vizMenuOpen:false,
    pbShuffle:false,ssState:null,ssOutputError:'',ssError:'',drag:null,HB_CTRL:[],hv:()=>false,drawIcon(){},drawCover(){},vol2pos:()=>.5,
    repaintBar(){repaints++;},repaintAll(){throw Error('marquee must never request a full window repaint');}};
  vm.createContext(c);for(const file of ['core/tokens.js','core/util.js','views/bar.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
  c.M.barH=96;const gr=graphics();return {c,gr,timers,images,copies,words,draw(){c.drawBar(gr);},get repaints(){return repaints;},advance(ms,tick=true){now+=ms;if(tick)for(const timer of [...timers.values()])timer.fn();},titleCopy(){return copies.filter(d=>images.includes(d.im)).at(-1);}};
}
test('long footer title starts a bounded animation and caches antialiased untrimmed text',()=>{
  const h=harness();h.draw();assert.equal(h.timers.size,1,'an overlong now-playing title needs an animation timer');
  const copy=h.titleCopy();assert.ok(copy,'the title must be composited through its own bitmap crop');
  assert.equal(copy.x,94);assert.equal(copy.y,706);assert.equal(copy.w,194);assert.equal(copy.h,20);assert.equal(copy.sw,copy.w);assert.equal(copy.sh,copy.h);
  const text=h.words.find(w=>w.s===h.c.npTitleStr);assert.equal(text.hint,5,'keep the existing text antialiasing');assert.equal((text.flags>>>20)&15,0,'long title bitmap must contain the whole title without ellipsis');
  h.advance(1500);h.draw();assert.equal(h.images.length,1,'moving frames should reuse the rendered title');assert.ok(h.titleCopy().sx>0);
});
test('fitting title and absent track create no animation or title bitmap',()=>{
  for(const mutate of [c=>{c.npTitleStr='Short';},c=>{c.NP=null;},c=>{c.fb.IsPlaying=c.fb.IsPaused=false;}]){
    const h=harness();mutate(h.c);h.draw();assert.equal(h.timers.size,0);assert.equal(h.images.length,0);
  }
});
test('title movement depends on elapsed time and pauses at both ends',()=>{
  function run(steps){const h=harness();h.draw();for(const ms of steps)h.advance(ms);h.draw();return h.titleCopy().sx;}
  assert.equal(run([600]),0,'initial reading pause');assert.equal(run([1500]),run(Array(15).fill(100)),'timer frequency cannot affect distance');assert.ok(run([1500])>0);
  const h=harness('123456789012345678901234567890');h.draw();h.advance(6000);h.draw();const end=h.titleCopy().sx;
  assert.ok(end>0);h.advance(200);h.draw();assert.equal(h.titleCopy().sx,end,'pause at the far end before reversing');
  h.advance(1500);h.draw();assert.ok(h.titleCopy().sx<end,'the title returns toward its start');
});
test('viewport, font, title and track changes restart the reading pause and dispose old images',()=>{
  for(const mutate of [c=>{c.R.barInfoW=340;},c=>{c.FONT.npTitle={Name:'Inter',Size:15,Style:1};},c=>{c.npTitleStr+=' updated';},c=>{c.NP={RawPath:'file://other.flac',SubSong:0};},c=>{c.NP={RawPath:'file://song.flac',SubSong:1};}]){
    const h=harness();h.draw();h.advance(1800);h.draw();assert.ok(h.titleCopy().sx>0);const old=h.images[0];mutate(h.c);h.draw();assert.equal(h.titleCopy().sx,0);assert.equal(old.disposed,true);assert.equal(h.timers.size,1);
  }
});
test('fullscreen and modal overlays stop the timer before any footer repaint',()=>{
  for(const key of ['fsMode','ssPopup','ssModal','renameEdit','ctxMenu','confirmDel','dupPrompt','rgPrompt','sgMenuOpen','plSortMenuOpen','vizMenuOpen']){
    const h=harness();h.draw();h.c[key]=true;h.advance(2000);assert.equal(h.timers.size,0,key+' must suspend marquee');assert.equal(h.repaints,0,key+' must not trigger a full overlay paint');
  }
  const h=harness();h.draw();h.c.NP=null;h.advance(2000);assert.equal(h.timers.size,0);h.draw();assert.equal(h.images[0].disposed,true);
});
test('marquee repaints only the bar and never changes transport or click target geometry',()=>{
  const h=harness();h.draw();const buttons=JSON.stringify(h.c.HB_CTRL),transport=JSON.stringify(h.c.R.transport),seek=JSON.stringify(h.c.HB_SEEK);h.advance(1800);assert.ok(h.repaints>0);h.draw();
  assert.equal(JSON.stringify(h.c.HB_CTRL),buttons);assert.equal(JSON.stringify(h.c.R.transport),transport);assert.equal(JSON.stringify(h.c.HB_SEEK),seek);
  assert.ok(h.titleCopy().x+h.titleCopy().w<=h.c.HB_CTRL[0].x0,'clipping must stop before transport buttons');
  h.c.ssStopFooterMarquee();assert.equal(h.timers.size,0);assert.equal(h.images[0].disposed,true);
});
console.log(passed+' footer marquee checks passed');if(failed)process.exitCode=1;
