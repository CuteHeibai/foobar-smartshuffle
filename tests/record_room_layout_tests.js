'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.join(__dirname,'../theme/verdant');
let count=0;
function run(name,fn){fn();console.log('PASS '+name);count++;}
function harness(saved={}){
 const props={...saved},requests=[];
 const c={Math,Number,isFinite,console,ssDensity:1,W:1440,H:900,TBH:32,R:{},
 M:{gap:10,navW:210,queueW:300},ssState:{remaining:['a','b'],queue:['c']},
 window:{GetProperty:(k,d)=>k in props?props[k]:d,SetProperty:(k,v)=>props[k]=v},
 fsMode:false,ssModal:false,ssPopup:false,ssStarted:false,rightTab:'lyrics',
 ssHideLyrics(){},ssDropModalImage(){},ssDropSceneImage(){},ssSyncLyricPanel(){},ssReportLayout(){},repaintAll(){},
 loadLyrics(){},stopLyAnim(){},ssSend:(...args)=>requests.push(args),
 layout(){const w=c.ssLayoutWidths(c.W);c.R.queue={x:c.W-w.right,y:40,w:w.right,h:700};},
 };
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'ui/layout.js'),'utf8'),c);
 return {c,props,requests};
}
run('new desktop opens with content space, drawer is optional',()=>{
 const {c}=harness();assert.equal(c.ssRightOpen,false);assert.equal(c.ssLayoutWidths(1440).right,0);
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
console.log(count+' desktop drawer checks passed');
