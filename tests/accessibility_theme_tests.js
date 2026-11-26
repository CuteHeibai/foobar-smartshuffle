'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function harness(){
 const box={x0:8,y0:9,x1:48,y1:49},sent=[],activated=[];
 const c={Date,Math,JSON,ssStarted:true,window:{ID:11},W:900,H:600,R:{barY:530,barInfoW:150,queue:{w:300}},NP:true,npTitleStr:'歌曲',npArtistStr:'歌手',fb:{IsPlaying:true,IsPaused:false,PlaybackLength:180,PlaybackTime:24,Volume:-12},MENUS:[['文件','file']],HB_MENU:[{...box,root:'file'}],HB_CTRL:[{...box,act:'play'}],HB_TABS:[],HB_Q:[],HB_SEEK:null,HB_VOL:null,fsMode:false,ssModal:false,ssPopup:null,confirmDel:false,renameEdit:false,dupPrompt:false,rgPrompt:false,sgMenuOpen:false,plSortMenuOpen:false,drag:null,rightTab:'queue',ssRightOpen:true,ssKeyboardFocus:'',ssState:{},ssResizing:null,ssSend:(op,args)=>sent.push(args),doCtrl:a=>activated.push(a),ssMenuLabel:s=>s,ssKeyboardAvailable:()=>true,SS_MENU_HB:[],TBH:30,ssPlaybackModeIndicator:()=>({title:'顺序播放'}),ssQueueRowKey:()=> 'priority:',ssPopupFirstVisible:()=>0,applyKeyMode(){},repaintAll(){}};
 vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../theme/verdant/ui/accessibility.js'),'utf8'),c);
 return {c,box,sent,activated};
}
test('publishes changed semantics only and checks current playback state before invocation',()=>{
 const {c,sent,activated}=harness();
 c.ssPublishAccessibility();c.ssPublishAccessibility();assert.equal(sent.length,1);
 const tree=sent[0].theme_accessibility,play=tree.items.find(x=>x.name==='暂停');
 assert.equal(play.role,'button');assert.equal(play.w,40);
 c.fb.IsPaused=true;
 c.ssAccessibilityAction({revision:tree.revision,id:play.id,kind:'invoke',serial:1});
 assert.deepEqual(activated,[]);
 c.ssPublishAccessibility();const paused=sent.at(-1).theme_accessibility;
 const cmd={revision:paused.revision,id:play.id,kind:'invoke',serial:2};
 c.ssAccessibilityAction(cmd);c.ssAccessibilityAction(cmd);assert.deepEqual(activated,['play']);
});
test('an open menu replaces background actions and carries checked and disabled states',()=>{
 const {c,box,sent}=harness(),item={label:'单曲循环',checked:true,disabled:true};
 c.ssPopup={levels:[{selected:0}]};c.SS_MENU_HB=[{...box,depth:0,index:0,item}];
 c.ssPublishAccessibility();const items=sent[0].theme_accessibility.items;
 assert.equal(items.length,1);assert.equal(items[0].role,'menuitem');assert.ok(items[0].disabled&&items[0].checked);
});

test('focuses without invoking and sends one acknowledgement per command',()=>{
 const {c,sent,activated}=harness();
 c.ssPublishAccessibility();
 const tree=sent[0].theme_accessibility,play=tree.items.find(i=>i.id==='control:play');
 const focus={kind:'focus',id:play.id,serial:4,revision:tree.revision};
 c.ssAccessibilityAction(focus);c.ssAccessibilityAction(focus);
 assert.equal(c.ssKeyboardFocus,play.id);assert.deepEqual(activated,[]);
 assert.equal(sent.filter(q=>q.theme_accessibility_ack===4).length,1);
});

test('sets seek and volume through their native units and rejects invalid values',()=>{
 const {c,box,sent}=harness();c.HB_SEEK=box;c.HB_VOL=box;c.vol2pos=()=>.5;c.pos2vol=v=>v*100-100;
 c.ssPublishAccessibility();const tree=sent[0].theme_accessibility;
 const seek=tree.items.find(i=>i.id==='slider:seek'),volume=tree.items.find(i=>i.id==='slider:volume');
 assert.equal(seek.max,180);assert.equal(volume.value,50);
 c.ssAccessibilityAction({kind:'setValue',id:seek.id,revision:tree.revision,serial:1,value:54});
 c.ssAccessibilityAction({kind:'setValue',id:volume.id,revision:tree.revision,serial:2,value:80});
 assert.equal(c.fb.PlaybackTime,54);assert.equal(c.fb.Volume,-20);
 c.ssAccessibilityAction({kind:'setValue',id:seek.id,revision:tree.revision,serial:3,value:NaN});
 assert.equal(c.fb.PlaybackTime,54);
});

test('queue items expose track details and route actions to the current row',()=>{
 const {c,sent,box}=harness();const row={...box,queueIndex:0,track_id:'track-a',title:'春日',artist:'乐团',next:true};
 c.HB_Q=[row];let selected;c.ssOpenQueueMenu=r=>selected=r;
 c.ssPublishAccessibility();const tree=sent[0].theme_accessibility,item=tree.items.find(i=>i.role==='listitem');
 assert.match(item.name,/春日，乐团/);
 c.ssAccessibilityAction({kind:'invoke',id:item.id,revision:tree.revision,serial:1});assert.equal(selected,row);
 c.HB_Q=[];selected=null;c.ssAccessibilityAction({kind:'invoke',id:item.id,revision:tree.revision,serial:2});assert.equal(selected,null);
});
test('progress, geometry, and focus changes keep pending unrelated commands valid',()=>{
 const {c,sent,box,activated}=harness();
 c.HB_SEEK=box;c.ssPublishAccessibility();const first=sent[0].theme_accessibility;
 c.fb.PlaybackTime++;c.HB_CTRL[0].x0++;c.ssKeyboardFocus='control:play';c.ssPublishAccessibility();
 assert.notEqual(sent.at(-1).theme_accessibility.revision,first.revision);
 c.ssAccessibilityAction({kind:'invoke',id:'control:play',revision:first.revision,serial:1});
 assert.deepEqual(activated,['play']);
});
test('replaced or temporarily removed controls reject commands from their previous lifetime',()=>{
 const {c,sent,activated}=harness();c.ssPublishAccessibility();const initial=sent[0].theme_accessibility;
 const boxes=c.HB_CTRL;c.HB_CTRL=[];c.ssPublishAccessibility();c.HB_CTRL=boxes;c.ssPublishAccessibility();
 c.ssAccessibilityAction({kind:'invoke',id:'control:play',revision:initial.revision,serial:1});assert.deepEqual(activated,[]);
 const beforePause=sent.findLast(q=>q.theme_accessibility).theme_accessibility;
 c.fb.IsPaused=true;c.ssPublishAccessibility();c.fb.IsPaused=false;c.ssPublishAccessibility();
 c.ssAccessibilityAction({kind:'invoke',id:'control:play',revision:beforePause.revision,serial:2});assert.deepEqual(activated,[]);
});
