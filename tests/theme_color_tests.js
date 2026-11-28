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
test('light palette keeps text, secondary labels and accent controls legible on white',()=>{
 const {c}=harness('light');assert.equal(c.SS_APPEARANCE,'light');assert.equal(c.COL.base&0xffffff,0xffffff);
 for(const name of ['text','text2','green'])assert.ok(contrast(c.COL[name],c.COL.base)>=4.5,name);
 assert.ok(contrast(c.COL.text3,c.COL.base)>=3);
 assert.ok(contrast(c.COL.onAccent,c.COL.green)>=4.5);assert.ok(contrast(c.COL.onDanger,c.COL.danger)>=4.5);
});
test('dark action labels retain contrast in their normal and hover states',()=>{
 const {c}=harness('dark');
 for(const [foreground,background] of [['onPlay','play'],['onPlay','greenHover'],['onDanger','danger'],['onDanger','dangerHover']]){
  assert.ok(contrast(c.COL[foreground],c.COL[background])>=4.5,background);
 }
});
test('the light divider stays clearer than decorative hairlines on both panel surfaces',()=>{
 const {c}=harness('light');assert.equal(c.COL.line>>>24,255);assert.equal(c.COL.splitter>>>24,255);
 assert.ok(contrast(c.COL.splitter,c.COL.base)>=1.45);assert.ok(contrast(c.COL.splitter,c.COL.elev)>=1.35);
 assert.ok(contrast(c.COL.line,c.COL.base)>=1.2&&contrast(c.COL.line,c.COL.elev)>=1.15);
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
test('text tiers and title menu use the measured desktop baseline',()=>{
 const {c}=harness('light');
 const colors=mode=>{const palette=c.ssPalette(mode);return ['text','text2','text3'].map(key=>palette[key]&0xffffff);};
 assert.deepEqual(colors('light'),[0x3e3e3e,0x666666,0x6e6e6e]);
 assert.deepEqual(colors('dark'),[0xe2e2e2,0xafafaf,0x8f8f8f]);
 assert.deepEqual([c.FONT.titleMenu.Name,c.FONT.titleMenu.Size,c.FONT.titleMenu.Style],['Segoe UI',14,0]);
});
test('personal and menu glyphs rasterize upstream SVG assets with the current theme color',()=>{
 const {c}=harness(),reads=[],images=[];
 c.utils={ReadTextFile(file){reads.push(file);return fs.readFileSync(path.join(root,'assets/icons',file.split('\\').at(-1)),'utf8');}};
 c.gdi.LoadSVG=(xml,size)=>{images.push({xml,size});return {Width:size,Height:size};};
 c.iconImg('bookmark',16,c.COL.text2);c.iconImg('bookmarkFilled',16,c.COL.green);c.iconImg('settings',16,c.COL.text2);
 assert.ok(reads[0].endsWith('verdant\\assets\\icons\\bookmark.svg'));
 assert.equal(reads.length,2);
 assert.match(images[0].xml,/fill="none"/);
 assert.match(images[1].xml,/fill="#409cff"/);
 assert.match(images[2].xml,/stroke="#afafaf"/);
});
test('the Mac-style controls sit before the menu and leave the rest of the bar draggable',()=>{
 const {c,load}=harness(),circles=[],captions=[],icons=[];
 load('core/corners.js');load('ui/chrome.js');
 Object.assign(c,{fsMode:false,hv:()=>true,tC(){},ssMeasureText:()=>28,
  drawIcon:(g,name)=>icons.push(name),UIWizard:{WindowState:2,SetCaptionAreaSize(...rect){captions.push(rect);}}});
 c.drawTitleBar({FillSolidRect(){},FillEllipse:(x,y,w,h)=>circles.push({x,y,w,h}),FillPolygon(){}});
 assert.equal(c.TBH,44);assert.equal(circles.length,3);
 assert.deepEqual([...c.HB_CAP].map(box=>box.act),['close','minimize','maximize']);
 assert.ok(c.HB_CAP.at(-1).x1<c.HB_MENU[0].x0);
 assert.deepEqual(icons,['windowClose','windowMinimize','windowMaximize','sun','settings']);
 assert.deepEqual(captions.at(-1),[c.MENU_END,0,c.W-c.MENU_END-c.TOP_RIGHT_W,c.TBH]);
 c.fsMode=true;c.applyCaption();assert.deepEqual(captions.at(-1),[0,0,0,0]);
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


test('desktop fullscreen centers artwork and metadata above transport',()=>{
 const {c,load}=harness();load('core/util.js');load('views/fullscreen.js');
 for(const [w,h] of [[1024,720],[1280,800],[1920,1080],[2560,1440]]){
 const s=c.ssFsScale(w,h),bottom=c.ssFsStageBottom(w,h);
 const m=c.ssFsDefaultGeometry(w,bottom,s,c.ssFsCoverScale(w,h));
 assert.ok(m.size>0&&Math.abs(m.x+m.size/2-w/2)<=1&&Math.abs(m.textX+m.textW/2-w/2)<=1);
 assert.ok(m.y+m.size<m.textY&&m.textY+Math.round(126*s)<=bottom);
 }
});
test('fullscreen title uses bold Segoe UI while metadata stays regular at desktop scale',()=>{
 const {c,load}=harness();load('core/util.js');load('views/fullscreen.js');
 const roles=['fsTitle','fsArtist','fsSrc','fsSrcName','fsLyric'];
 const faces=roles.map(role=>c.ssFsFont(c.FONT[role],1.4));
 assert.deepEqual(faces.map(f=>[f.Name,f.Style,f.Size]),[
  ['Segoe UI',1,36],['Segoe UI',0,25],['Segoe UI',0,18],['Segoe UI',0,18],['Segoe UI',0,39]
 ]);
 const scriptFace=c.ssScriptFont('日本語',faces[0]);
 assert.deepEqual([scriptFace.Name,scriptFace.Style,scriptFace.Size],['Microsoft YaHei UI',1,36]);
});
test('dark record-room palette retains readable text and accent actions',()=>{
 const {c}=harness('dark');for(const name of ['text','text2','text3','green'])assert.ok(contrast(c.COL[name],c.COL.base)>=4.5,name);assert.ok(contrast(c.COL.onAccent,c.COL.green)>=4.5);
});
console.log(passed+' appearance regression checks passed');
