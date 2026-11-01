'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={};vm.createContext(context);
const source=path.join(__dirname,'../theme/verdant/ui/selection.js');
if(fs.existsSync(source))vm.runInContext(fs.readFileSync(source,'utf8'),context);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function controller(kind='track',writable=true){
  assert.equal(typeof context.ssCreateSelectionController,'function','selection controller must exist');
  const c=context.ssCreateSelectionController({threshold:5});
  c.setContext(makeContext(kind,writable));return c;
}
function makeContext(kind='track',writable=true){
  return {kind,key:'list-a',items:['a','b','c','d','e'],writable,multiple:kind==='track',
    rows:[0,1,2,3,4].map(index=>({index,x0:0,y0:index*20,x1:100,y1:(index+1)*20})),bounds:{x0:0,y0:0,x1:120,y1:130}};
}
function list(c){return Array.from(c.selectedIndices());}
function click(c,index,mods={}){c.start(Object.assign({index,x:10,y:index*20+10},mods));return c.end(10,index*20+10);}

test('plain click, Ctrl toggle, Shift range, and Ctrl Shift additive range',()=>{
  const c=controller();click(c,1);assert.deepEqual(list(c),[1]);
  click(c,3,{ctrl:true});assert.deepEqual(list(c),[1,3]);
  click(c,1,{ctrl:true});assert.deepEqual(list(c),[3]);
  click(c,3);click(c,1,{shift:true});assert.deepEqual(list(c),[1,2,3]);
  click(c,4,{ctrl:true});click(c,3,{ctrl:true,shift:true});assert.deepEqual(list(c),[1,2,3,4]);
});
test('unselected track and blank area left drag select intersecting visible rows',()=>{
  const c=controller();c.start({index:1,x:10,y:25});c.move(80,78);
  assert.equal(c.preview().mode,'marquee');assert.deepEqual(list(c),[1,2,3]);
  assert.equal(c.end(80,78).type,'selection');
  c.start({index:-1,x:110,y:120});c.move(20,42);assert.deepEqual(list(c),[2,3,4]);
  assert.equal(c.end(20,42).moved,true);
});
test('Ctrl marquee toggles from original selection rather than each mouse move',()=>{
  const c=controller();click(c,0);click(c,2,{ctrl:true});
  c.start({index:-1,x:110,y:5,ctrl:true});c.move(10,55);assert.deepEqual(list(c),[1]);
  c.move(11,56);assert.deepEqual(list(c),[1]);c.end(11,56);
});
test('selected block waits for threshold then computes insertion after removal',()=>{
  const c=controller();click(c,1);click(c,2,{ctrl:true});
  c.start({index:1,x:10,y:30});c.move(12,32);assert.equal(c.preview().mode,'pending');
  c.move(10,99);assert.equal(c.preview().mode,'reorder');assert.deepEqual(list(c),[1,2]);
  const action=c.end(10,99);assert.equal(action.type,'reorder');assert.deepEqual(Array.from(action.indices),[1,2]);
  assert.equal(action.insertIndex,5);assert.equal(action.targetIndex,3);assert.equal(action.changed,true);
});
test('click selected row collapses group while block drop into itself is a no-op',()=>{
  const c=controller();click(c,1);click(c,2,{ctrl:true});click(c,1);assert.deepEqual(list(c),[1]);
  click(c,2,{ctrl:true});c.start({index:1,x:10,y:30});c.move(20,45);
  const a=c.end(20,45);assert.equal(a.type,'reorder');assert.equal(a.changed,false);
});
test('locked view still selects but never emits reorder',()=>{
  const c=controller('track',false);click(c,1);c.start({index:1,x:10,y:30});c.move(40,95);
  assert.equal(c.preview().mode,'marquee');assert.equal(c.end(40,95).type,'selection');
});
test('context changes reset selection and cancel stale gesture',()=>{
  const c=controller();click(c,1);c.start({index:1,x:10,y:30});
  const next=makeContext();next.key='other';c.setContext(next);
  assert.deepEqual(list(c),[]);assert.equal(c.end(20,99),null);
});
test('stable occurrence IDs preserve duplicate rows independently across reorder',()=>{
  const c=controller();const next=makeContext();next.items=['file#0','file#1','other','d','e'];c.setContext(next);
  click(c,1);next.items=['file#1','other','file#0','d','e'];c.setContext(next);
  assert.deepEqual(list(c),[0]);assert.equal(c.isSelected(2),false);
  next.items=['other','file#0','d','e'];next.rows=next.rows.slice(0,4);c.setContext(next);assert.deepEqual(list(c),[]);
});
test('item order changes cancel an in-flight reorder',()=>{
  const c=controller();click(c,0);c.start({index:0,x:10,y:10});c.move(10,99);
  const next=makeContext();next.items=['b','a','c','d','e'];c.setContext(next);assert.equal(c.end(10,99),null);
});
test('queue and sidebar reorder on first drag and preserve click action',()=>{
  for(const kind of ['queue','playlist']){
    const c=controller(kind);const clickAction=click(c,2);assert.equal(clickAction.type,'click');
    c.start({index:3,x:10,y:70});c.move(10,1);const a=c.end(10,1);
    assert.equal(a.type,'reorder');assert.deepEqual(Array.from(a.indices),[3]);assert.equal(a.insertIndex,0);assert.equal(a.targetIndex,0);
  }
});
test('visible row geometry accepts clipped and grouped row gaps',()=>{
  const c=controller();const next=makeContext();next.rows=[{index:2,x0:0,x1:100,y0:10,y1:25},{index:3,x0:0,x1:100,y0:50,y1:70}];c.setContext(next);
  click(c,0);c.start({index:0,x:10,y:10});c.move(20,40);const a=c.end(20,40);assert.equal(a.insertIndex,3);assert.equal(a.targetIndex,2);
});
test('cancelled gestures do not trigger an action or change subsequent clicks',()=>{
  const c=controller();c.start({index:0,x:10,y:10});c.move(80,90);c.cancel();assert.equal(c.preview(),null);assert.equal(c.end(80,90),null);
  assert.equal(click(c,4).type,'click');assert.deepEqual(list(c),[4]);
});
test('drag release outside list cancels reorder and blank click clears selection',()=>{
  const c=controller();click(c,1);c.start({index:1,x:10,y:30});c.move(10,95);assert.equal(c.end(200,95).type,'selection');
  c.start({index:-1,x:110,y:120});assert.equal(c.end(110,120).type,'selection');assert.deepEqual(list(c),[]);
});
test('long press lifts one row and a drop into its original position has no indicator',()=>{
 let now=0;const c=context.ssCreateSelectionController({marquee:false,dragUnselected:true,holdDelay:160,now:()=>now});c.setContext(makeContext());
 c.start({index:1,x:10,y:30});c.move(20,36);assert.equal(c.preview().mode,'pending');now=170;c.move(20,36);assert.equal(c.preview().mode,'reorder');assert.equal(c.preview().indicator,null);assert.ok(c.preview().origin);assert.equal(c.preview().pointer.x,20);assert.equal(c.end(20,36).changed,false);
});
test('movement before the hold deadline consumes release without a destination click',()=>{
 let now=0;const c=context.ssCreateSelectionController({marquee:false,dragUnselected:true,holdDelay:160,now:()=>now});c.setContext(makeContext());
 c.start({index:0,x:10,y:10});now=80;c.move(10,90);assert.equal(c.preview().mode,'pending');now=100;
 const a=c.end(10,90);assert.equal(a.type,'selection');assert.equal(a.moved,true);
});
console.log(passed+' selection regressions passed');
