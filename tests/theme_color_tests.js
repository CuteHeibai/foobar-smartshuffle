'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../theme/verdant');let passed=0;
function test(name,fn){fn();console.log('PASS '+name);passed++;}
function harness(mode){
 const props=new Map([['SmartShuffle: appearance',mode||'dark']]),sent=[],calls=[];
 const c={console,Math,Number,JSON,isFinite,Date,UISCALE:1,ssState:null,ssStarting:false,fb:{ProfilePath:'P:\\'},
 window:{GetProperty:(k,d)=>props.has(k)?props.get(k):d,SetProperty:(k,v)=>props.set(k,v)},
 gdi:{Font:(Name,Size,Style)=>({Name,Size,Style})},
 ssSend:(op,args)=>sent.push({op,...args}),repaintAll:()=>calls.push('paint'),
 ssDropModalImage:()=>calls.push('modal'),ssDropSceneImage:()=>calls.push('scene'),
 ssSyncLyricPanel:()=>calls.push('lyrics'),applyKeyMode(){},
 W:1536,H:960,TBH:32,ssModal:false,ssPopup:null,ssStarted:true,
 UIWizard:{DarkMode:true},plCardCache:{old:1},artCardCache:{old:1},skelImgs:{old:1},
 CORN:{old:1},ssGridImage:{Dispose:()=>calls.push('grid')},ssGridSize:300,
 ssNativeLyricKey:'old',ssSceneKey:'old',ssFadeStart:0,ssArtists:{},artCache:{keep:1}};
 vm.createContext(c);function load(name){vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c);}
 load('core/tokens.js');load('ui/appearance.js');return {c,load,props,sent,calls};
}
function luminance(c){return [.2126,.7152,.0722].reduce((v,weight,i)=>{let n=((c>>((2-i)*8))&255)/255;return v+weight*(n<=.04045?n/12.92:((n+.055)/1.055)**2.4);},0);}
function contrast(a,b){let x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('light palette keeps text, secondary labels and green controls legible on white surfaces',()=>{
 const {c}=harness('light');assert.equal(c.SS_APPEARANCE,'light');assert.equal(c.COL.base&0xffffff,0xffffff);
 for(const name of ['text','text2','text3','green'])assert.ok(contrast(c.COL[name],c.COL.base)>=4.5,name);
 assert.ok(contrast(c.COL.onAccent,c.COL.green)>=4.5);assert.ok(contrast(c.COL.onDanger,c.COL.danger)>=4.5);
});
test('changing appearance clears every colour-dependent bitmap while preserving music and geometry',()=>{
 const {c,props,calls}=harness();const art=c.artCache,state={source:'keep',remaining:['song']};c.ssState=state;
 c.ssApplyAppearance('light');assert.equal(props.get('SmartShuffle: appearance'),'light');assert.equal(c.UIWizard.DarkMode,false);
 assert.equal(c.CORN,null);assert.equal(c.ssGridImage,null);assert.equal(Object.keys(c.plCardCache).length,0);assert.equal(Object.keys(c.artCardCache).length,0);assert.equal(Object.keys(c.skelImgs).length,0);
 assert.ok(calls.includes('scene')&&calls.includes('modal')&&calls.includes('paint')&&calls.includes('lyrics'));
 assert.equal(c.ssState,state);assert.equal(c.artCache,art);assert.equal(c.W,1536);assert.equal(c.H,960);
 const count=calls.length;c.ssApplyAppearance('light');assert.equal(calls.length,count);
});
test('appearance menu uses a native transaction and retains deep and light choices',()=>{
 const {c,sent}=harness();const menu=c.ssAppearanceMenuItems();assert.equal(menu[0].label,'深色');assert.equal(menu[1].label,'浅色');
 assert.equal(menu[0].checked,true);menu[1].run();assert.equal(sent[0].op,'theme_appearance');assert.equal(sent[0].appearance,'light');
 assert.equal(c.SS_APPEARANCE,'dark','wait for native acknowledgement');
});
test('native view menus get appearance choices on click and hover-open paths',()=>{
 const {c,load}=harness();c.ssShowPopup=()=>{};load('ui/menus.js');
 c.ssShowPopup=(items,x,y)=>{c.ssPopup={levels:[{items}]};};c.window.SetInterval=()=>1;c.ssPoll=()=>{};
 c.ssOpenNativeMenu('main',{root:'view'},12,32);
 const item=c.ssPopup.extra.find(x=>x.label==='外观');assert.ok(item&&item.children.some(x=>x.label==='浅色'));
});
test('literal RGB values remain untouched for image masks and original artwork',()=>{
 const {c}=harness('light');assert.equal(c.RGB(0,0,0)&0xffffff,0);assert.equal(c.RGB(255,255,255)&0xffffff,0xffffff);
 assert.equal(c.RGB(83,62,140)&0xffffff,0x533e8c);assert.equal((c.ssInk(42)>>>24),42);
});
test('audio spectrum peak and axis colours refresh in both appearance directions',()=>{
 const {c,load}=harness();load('core/util.js');load('views/fullscreen.js');
 c.ssApplyAppearance('light');assert.equal(c.VIZ_PEAK,c.blend(c.COL.green,c.COL.text,.22));assert.ok(contrast(c.vizCol(1),c.COL.base)>=4.5);
 c.ssApplyAppearance('dark');assert.equal(c.VIZ_PEAK,c.blend(c.COL.green,c.COL.text,.22));
});
test('native lyrics requests include appearance in their geometry cache key',()=>{
 const {c,load,sent}=harness();c.R={queue:{x:100,y:40,w:300,h:600}};c.window.ID=123;load('views/preference.js');
 c.ssRequestNativeLyrics(true);c.ssRequestNativeLyrics(true);assert.equal(sent.length,1);assert.equal(sent[0].appearance,'dark');
 c.SS_APPEARANCE='light';c.ssRequestNativeLyrics(true);assert.equal(sent.length,2);assert.equal(sent[1].appearance,'light');
});
test('native state selects the saved appearance without sending another setting transaction',()=>{
 const {c,load}=harness();c.pbShuffle=false;c.ssFlight=null;c.ssOut=[];c.ssPump=()=>{};c.ssSeenOpen=0;load('data/smartshuffle.js');
 c.ssAcceptState({version:1,theme:{appearance:'light'},ui_open:0});assert.equal(c.SS_APPEARANCE,'light');
 assert.ok(!c.ssOut.some(q=>q.op==='theme_appearance'));
});
console.log(passed+' appearance regression checks passed');
