/* verdant/views/settings.js -- Apple Music / macOS two-column Settings view with dirty-rect micro-animations
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var ssSettingsScroll=0,ssSettingsScrollT=0,SS_SETTINGS_MAX=0,HB_SETTINGS=[];
var ssSettingsBackView='home',ssSettingsOutputName='',ssSettingsTab='appearance';
var ssSettingsFeedback='',ssSettingsFeedbackAt=0,ssSettingsDown='',ssSettingsHoverId='';
var ssSettingsAnim={},ssSettingsAnimTimer=0,ssSettingsPending={};
var ssSettingsWidgets=Object.create(null),ssSettingsDamage=null,ssSettingsScale=1;
var SS_SETTINGS_TABS=[
  {id:'appearance',label:'外观',icon:'sun'},
  {id:'playback',label:'播放与音频',icon:'headphones'},
  {id:'personal',label:'个人与统计',icon:'heart'},
  {id:'updates',label:'软件更新',icon:'refresh'},
  {id:'advanced',label:'高级',icon:'tools'}
];

function ssSettingsRepaint(){
  ssSettingsDamage=null;
  if(typeof repaintMain==='function')repaintMain(true);
  else repaintAll();
}
function ssSettingsWidgetKey(animKey){
  if(!animKey)return '';
  if(animKey.indexOf('h-')===0||animKey.indexOf('p-')===0)return animKey.slice(2);
  return animKey;
}
function ssSettingsRegisterWidget(keys,desc){
  for(var i=0;i<keys.length;i++)ssSettingsWidgets[keys[i]]=desc;
}
function ssSettingsQueueWidgets(keys){
  if(view!=='settings'||typeof ssSceneImage==='undefined'||!ssSceneImage||
     (typeof dirtyAll!=='undefined'&&dirtyAll)||(typeof anyDirty==='function'&&anyDirty())||
     (typeof ssModal!=='undefined'&&ssModal)||(typeof ssPopup!=='undefined'&&ssPopup)||
     (typeof fsMode!=='undefined'&&fsMode))return false;
  if(!keys||!keys.length)return false;
  var queued=[];
  for(var i=0;i<keys.length;i++){
    var w=ssSettingsWidgets[ssSettingsWidgetKey(keys[i])];
    if(!w)return false;
    if(queued.indexOf(w)<0)queued.push(w);
  }
  if(!queued.length)return false;
  if(!ssSettingsDamage)ssSettingsDamage=[];
  for(var j=0;j<queued.length;j++){
    if(ssSettingsDamage.indexOf(queued[j])<0)ssSettingsDamage.push(queued[j]);
    var b=queued[j].bounds;
    if(b&&b.w>0&&b.h>0&&typeof window!=='undefined'&&typeof window.RepaintRect==='function')
      window.RepaintRect(b.x,b.y,b.w,b.h,false);
  }
  return true;
}
function ssSettingsAnimStop(){
  if(ssSettingsAnimTimer){try{window.ClearInterval(ssSettingsAnimTimer);}catch(e){}ssSettingsAnimTimer=0;}
  ssSettingsAnim={};
}
function ssSettingsAnimTick(){
  if(view!=='settings'||(typeof fsMode!=='undefined'&&fsMode)){ssSettingsAnimStop();return;}
  var now=Date.now(),active=false,keys=[];
  for(var k in ssSettingsAnim){
    keys.push(k);
    if(now-ssSettingsAnim[k].t0<ssSettingsAnim[k].dur){active=true;}
    else delete ssSettingsAnim[k];
  }
  if(!active){if(ssSettingsAnimTimer){try{window.ClearInterval(ssSettingsAnimTimer);}catch(e){}ssSettingsAnimTimer=0;}}
  if(!ssSettingsQueueWidgets(keys))ssSettingsRepaint();
}
function ssSettingsAnimStart(key,from,to,dur){
  if((typeof ssReducedMotion!=='undefined'&&ssReducedMotion)||Math.abs(to-from)<0.0005){delete ssSettingsAnim[key];return;}
  ssSettingsAnim[key]={from:from,to:to,t0:Date.now(),dur:Math.min(190,dur||170)};
  if(!ssSettingsAnimTimer)ssSettingsAnimTimer=window.SetInterval(ssSettingsAnimTick,8);
}
function ssSettingsAnimVal(key,target){
  var a=ssSettingsAnim[key];
  if(!a)return target;
  var p=Math.max(0,Math.min(1,(Date.now()-a.t0)/Math.max(1,a.dur)));
  if(p>=1){delete ssSettingsAnim[key];return target;}
  var ease=1-Math.pow(1-p,3.2);
  return a.from+(a.to-a.from)*ease;
}
function ssSettingsSetPending(key,val){
  ssSettingsPending[key]={val:val,expires:Date.now()+900};
}
function ssSettingsResolve(key,actual){
  var p=ssSettingsPending[key];
  if(!p)return actual;
  if(p.val===actual||Date.now()>p.expires){delete ssSettingsPending[key];return actual;}
  return p.val;
}
function ssSettingsTabIndex(id){
  for(var i=0;i<SS_SETTINGS_TABS.length;i++)if(SS_SETTINGS_TABS[i].id===id)return i;
  return 0;
}
function ssSettingsHoverChange(sig){
  var nextId='';
  if(sig&&sig.indexOf('set')===0){
    var idx=Number(sig.slice(3));
    if(HB_SETTINGS[idx])nextId=HB_SETTINGS[idx].id||'';
  }
  if(nextId===ssSettingsHoverId)return true;
  var prevId=ssSettingsHoverId;
  ssSettingsHoverId=nextId;
  var keys=[];
  if(prevId){ssSettingsAnimStart('h-'+prevId,ssSettingsAnimVal('h-'+prevId,1),0,105);keys.push(prevId);}
  if(nextId){ssSettingsAnimStart('h-'+nextId,ssSettingsAnimVal('h-'+nextId,0),1,90);keys.push(nextId);}
  return ssSettingsQueueWidgets(keys);
}
function ssSettingsMouseLeave(){
  var keys=[];
  if(ssSettingsDown){
    var prevDown=ssSettingsDown;ssSettingsDown='';
    ssSettingsAnimStart('p-'+prevDown,ssSettingsAnimVal('p-'+prevDown,1),0,95);
    keys.push(prevDown);
  }
  if(ssSettingsHoverId){
    var prevHov=ssSettingsHoverId;ssSettingsHoverId='';
    ssSettingsAnimStart('h-'+prevHov,ssSettingsAnimVal('h-'+prevHov,1),0,105);
    keys.push(prevHov);
  }
  if(keys.length&&view==='settings'&&!ssSettingsQueueWidgets(keys))ssSettingsRepaint();
}
function ssRefreshSettingsOutput(){
  ssSettingsOutputName='';
  try{
    if(typeof fb!=='undefined'&&typeof fb.GetOutputDevices==='function'&&typeof ssParseOutputs==='function'){
      var list=ssParseOutputs(fb.GetOutputDevices());
      for(var i=0;i<list.length;i++){
        if(list[i].active){ssSettingsOutputName=typeof ssOutputLabel==='function'?ssOutputLabel(list[i]):list[i].name;break;}
      }
    }
  }catch(e){}
}
function ssOpenSettings(checkUpdate){
  if(view!=='settings')ssSettingsBackView=view||'home';
  view='settings';
  ssSettingsTab=checkUpdate?'updates':'appearance';
  ssSettingsScroll=ssSettingsScrollT=0;
  ssSettingsDown='';ssSettingsHoverId='';ssSettingsPending={};
  ssSettingsWidgets=Object.create(null);ssSettingsDamage=null;
  ssSettingsAnimStop();
  ssRefreshSettingsOutput();
  if(checkUpdate&&typeof ssSend==='function')ssSend('update_check');
  repaintAll();
}
function ssSettingsLiveToggleVal(animKey){
  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  var upd=st.update||{};
  if(animKey==='sw-reduced')return typeof ssReducedMotion!=='undefined'&&!!ssReducedMotion;
  if(animKey==='sw-personal')return ssSettingsResolve('sw-personal',!!(st.personal&&st.personal.enabled));
  if(animKey==='sw-stats'){
    var raw=st.listening_stats!==undefined?!!st.listening_stats:!(st.personal&&st.personal.history_enabled===false);
    return ssSettingsResolve('sw-stats',raw);
  }
  if(animKey==='sw-auto')return ssSettingsResolve('sw-auto',upd.automatic!==false);
  return false;
}
function ssSettingsLiveSegVal(animKey){
  if(animKey==='seg-wheel'){var w=typeof WHEEL_PX==='number'?WHEEL_PX:72;return w<=56?48:(w>=90?108:72);}
  if(animKey==='seg-ceil'){var c=typeof VOL_CEIL==='number'?VOL_CEIL:0;return c<=-9?-12:(c<=-3?-6:0);}
  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  var raw=st.enabled?'smart':String(typeof st.native_order==='number'?st.native_order:0);
  return ssSettingsResolve('seg-mode',raw);
}
// Clean macOS toggle switch: true circular-arc capsule + crisp pure FillEllipse circle (zero deformation).
function ssDrawToggleSwitch(gr,x,y,on,disabled,s,animKey,actId){
  var w=Math.round(42*s),h=Math.round(24*s),pad=Math.max(2,Math.round(2.5*s));
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var hot=!disabled&&hv(x,y,x+w,y+h);
  var pressed=!disabled&&ssSettingsDown===actId&&hot;
  var t=Math.max(0,Math.min(1,ssSettingsAnimVal(animKey,on?1:0)));
  var hoverT=disabled?0:ssSettingsAnimVal('h-'+actId,hot?1:0);
  var pressT=disabled?0:ssSettingsAnimVal('p-'+actId,pressed?1:0);

  var offFill=typeof blend==='function'?blend(COL.seekbg,COL.text,Math.max(hoverT*(isDark?0.07:0.05),pressT*0.1)):COL.seekbg;
  var onFill=typeof blend==='function'?blend(COL.green,COL.greenHover,Math.max(hoverT*0.35,pressT*0.7)):COL.green;
  var fill=disabled?COL.seekbg:(typeof blend==='function'?blend(offFill,onFill,t):(on?COL.green:COL.seekbg));
  if(typeof ssFillCapsule==='function')ssFillCapsule(gr,x,y,w,h,fill);
  else ssFillContinuousRect(gr,x,y,w,h,h/2,h/2,fill);
  if(!disabled&&t<0.98&&typeof ssStrokeCapsule==='function'){
    var rimA=Math.round((isDark?28:22)*(1-t));
    if(rimA>2)ssStrokeCapsule(gr,x,y,w,h,1,isDark?RGBA(255,255,255,rimA):RGBA(0,0,0,rimA));
  }

  var d=h-pad*2;
  var kx=x+pad+(w-pad*2-d)*t,ky=y+pad;
  gr.FillEllipse(kx,ky+1,d,d,RGBA(0,0,0,34));
  gr.FillEllipse(kx,ky,d,d,RGB(255,255,255));
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
// Tactile macOS push button with smooth animated hover/press tint & concentric 7px radius.
function ssDrawSettingsActionBtn(gr,x,y,w,h,label,primary,disabled,s,actId){
  var rBtn=Math.max(5,Math.round(7*s));
  var hot=!disabled&&hv(x,y,x+w,y+h),pressed=!disabled&&ssSettingsDown===actId&&hot;
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var hoverT=disabled?0:ssSettingsAnimVal('h-'+actId,hot?1:0);
  var pressT=disabled?0:ssSettingsAnimVal('p-'+actId,pressed?1:0);
  var bg;
  if(primary){
    if(disabled)bg=COL.seekbg;
    else if(typeof blend==='function'){
      var hovCol=blend(COL.green,COL.greenHover,hoverT);
      bg=blend(hovCol,isDark?RGB(32,126,232):RGB(6,88,200),pressT);
    }else bg=pressed||hot?COL.greenHover:COL.green;
  }else{
    if(disabled)bg=COL.elev;
    else if(typeof blend==='function'){
      var baseCol=isDark?COL.button:COL.base;
      var hotCol=isDark?COL.buttonHover:COL.elev;
      var downCol=isDark?COL.hover:COL.rowActive;
      bg=blend(blend(baseCol,hotCol,hoverT),downCol,pressT);
    }else bg=pressed?COL.hover:(hot?(isDark?COL.buttonHover:COL.elev):(isDark?COL.button:COL.base));
  }
  var fg=primary?(disabled?COL.text3:COL.onAccent):(disabled?COL.text3:COL.text);
  var dy=pressT>0.5?1:0;
  if(!disabled&&!isDark){
    var shA=Math.round(15*(1-pressT));
    if(shA>1)ssFillContinuousRect(gr,x,y+1,w,h,rBtn,rBtn,RGBA(0,0,0,shA));
  }
  ssFillContinuousRect(gr,x,y+dy,w,h,rBtn,rBtn,bg);
  if(!primary&&typeof strokeRound==='function'){
    var borderCol=typeof blend==='function'?blend(COL.line,COL.text3,Math.max(hoverT*0.65,pressT)):(hot?COL.text3:COL.line);
    strokeRound(gr,x,y+dy,w,h,rBtn,1,borderCol);
  }
  tC(gr,label,FONT.pl,fg,x+6,y+dy,Math.max(1,w-12),h);
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
// macOS recessed-well segmented control with smooth floating pill thumb.
function ssDrawSegmented(gr,x,y,w,h,items,activeVal,s,pushHit,animKey){
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var rOuter=Math.max(6,Math.round(8*s)),pad=Math.max(2,Math.round(3*s)),rInner=Math.max(3,rOuter-pad);
  var wellBg=typeof ssInk==='function'?ssInk(isDark?20:11):COL.input;
  ssFillContinuousRect(gr,x,y,w,h,rOuter,rOuter,wellBg);
  var innerW=w-pad*2,segW=innerW/items.length,activeIdx=0;
  for(var k=0;k<items.length;k++)if(items[k].val===activeVal){activeIdx=k;break;}
  var curIdx=Math.max(0,Math.min(items.length-1,ssSettingsAnimVal(animKey,activeIdx)));
  var thumbX=x+pad+curIdx*segW,thumbW=segW,thumbH=h-pad*2;
  if(!isDark)ssFillContinuousRect(gr,thumbX,y+pad+1,thumbW,thumbH,rInner,rInner,RGBA(0,0,0,20));
  ssFillContinuousRect(gr,thumbX,y+pad,thumbW,thumbH,rInner,rInner,isDark?COL.hover:COL.base);
  if(typeof strokeRound==='function')strokeRound(gr,thumbX,y+pad,thumbW,thumbH,rInner,1,isDark?COL.submenuLine:RGBA(0,0,0,14));
  for(var i=0;i<items.length;i++){
    var sx=Math.round(x+pad+i*segW),sw=i===items.length-1?(x+w-pad-sx):Math.round(segW);
    var segId=items[i].act+':'+items[i].val;
    var segHot=hv(sx,y+pad,sx+sw,y+h-pad);
    var segHoverT=ssSettingsAnimVal('h-'+segId,segHot?1:0);
    var prox=Math.max(0,1-Math.abs(curIdx-i));
    var textCol=typeof blend==='function'?blend(COL.text2,COL.text,Math.max(prox,segHoverT*0.55)):(items[i].val===activeVal?COL.text:COL.text2);
    tC(gr,items[i].label,FONT.plSub,textCol,sx,y+pad,sw,thumbH);
    if(pushHit)pushHit({x0:sx,y0:y+pad,x1:sx+sw,y1:y+h-pad},items[i].act,true,items[i].val,animKey,activeIdx,i);
  }
}
// Miniature macOS window preview card with concentric radii & exterior selection ring.
function ssDrawAppearanceCard(gr,x,y,w,h,label,darkMode,active,s,actId){
  var rOuter=Math.round(12*s),pad=Math.round(7*s),rInner=Math.max(4,rOuter-pad);
  var hot=hv(x,y,x+w,y+h+Math.round(30*s)),pressed=ssSettingsDown===actId&&hot;
  var hoverT=ssSettingsAnimVal('h-'+actId,hot?1:0);
  var pressT=ssSettingsAnimVal('p-'+actId,pressed?1:0);
  var dy=pressT>0.5?1:0;
  var shellBg=darkMode?RGB(15,16,18):RGB(242,243,246);
  var paneBg=darkMode?RGB(26,27,31):RGB(255,255,255);
  var cardBg=darkMode?RGB(44,46,52):RGB(230,233,239);
  var accent=darkMode?RGB(64,156,255):RGB(10,110,240);
  var lineCol=darkMode?RGB(50,52,58):RGB(222,225,230);
  if(active&&typeof strokeRound==='function')
    strokeRound(gr,x-3,y-3+dy,w+6,h+6,rOuter+3,2,COL.green);
  ssFillContinuousRect(gr,x,y+dy,w,h,rOuter,rOuter,shellBg);
  var tbH=Math.round(15*s),dot=Math.max(4,Math.round(5*s));
  gr.FillEllipse(x+pad+1,y+dy+Math.round((tbH-dot)/2)+Math.round(2*s),dot,dot,RGB(255,98,92));
  gr.FillEllipse(x+pad+1+dot+Math.round(4*s),y+dy+Math.round((tbH-dot)/2)+Math.round(2*s),dot,dot,RGB(243,185,72));
  gr.FillEllipse(x+pad+1+(dot+Math.round(4*s))*2,y+dy+Math.round((tbH-dot)/2)+Math.round(2*s),dot,dot,RGB(85,192,109));
  var sideW=Math.round(w*.28),bodyY=y+dy+tbH+Math.round(3*s),bodyH=Math.max(20,h-tbH-pad-Math.round(3*s));
  var mainX=x+sideW+Math.round(4*s),mainW=Math.max(24,w-sideW-pad-Math.round(4*s));
  ssFillContinuousRect(gr,x+pad,bodyY+Math.round(4*s),Math.max(12,sideW-pad*2+2),Math.round(8*s),3,3,accent);
  ssFillContinuousRect(gr,x+pad,bodyY+Math.round(17*s),Math.max(10,sideW-pad*2-Math.round(4*s)),Math.round(6*s),3,3,cardBg);
  ssFillContinuousRect(gr,x+pad,bodyY+Math.round(28*s),Math.max(10,sideW-pad*2-Math.round(1*s)),Math.round(6*s),3,3,cardBg);
  ssFillContinuousRect(gr,mainX,bodyY,mainW,bodyH,rInner,rInner,paneBg);
  var tileSz=Math.min(Math.round(26*s),Math.floor((mainW-Math.round(22*s))/2),Math.max(12,bodyH-Math.round(22*s)));
  if(tileSz>=10){
    var tx=mainX+Math.round(7*s),ty=bodyY+Math.round(7*s);
    ssFillContinuousRect(gr,tx,ty,tileSz,tileSz,Math.max(3,rInner-1),Math.max(3,rInner-1),accent);
    ssFillContinuousRect(gr,tx+tileSz+Math.round(6*s),ty,tileSz,tileSz,Math.max(3,rInner-1),Math.max(3,rInner-1),cardBg);
  }
  var barY=bodyY+bodyH-Math.round(8*s),barW=Math.max(12,mainW-Math.round(14*s));
  if(typeof ssFillCapsule==='function'){
    ssFillCapsule(gr,mainX+Math.round(7*s),barY,barW,Math.max(3,Math.round(3*s)),lineCol);
    ssFillCapsule(gr,mainX+Math.round(7*s),barY,Math.max(8,Math.round(barW*.46)),Math.max(3,Math.round(3*s)),accent);
  }
  if(!active&&typeof strokeRound==='function'){
    var bCol=typeof blend==='function'?blend(COL.line,COL.text3,hoverT):COL.line;
    strokeRound(gr,x,y+dy,w,h,rOuter,1,bCol);
  }
  var lblCol=active?COL.green:(typeof blend==='function'?blend(COL.text2,COL.text,hoverT):(hot?COL.text:COL.text2));
  tC(gr,label,active?FONT.sect:FONT.pl,lblCol,x,y+h+Math.round(8*s),w,Math.round(22*s));
  return {x0:x,y0:y,x1:x+w,y1:y+h+Math.round(30*s)};
}
function ssDrawSettingsBackBtn(gr,x,y,w,h,s,recordHit){
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var backHot=hv(x,y,x+w,y+h),backPressed=ssSettingsDown==='back'&&backHot;
  var backHoverT=ssSettingsAnimVal('h-back',backHot?1:0),backPressT=ssSettingsAnimVal('p-back',backPressed?1:0);
  var rSm=Math.max(4,Math.round(6*s));
  if(backHoverT>0.02||backPressT>0.02){
    var bFill=typeof ssInk==='function'?ssInk(Math.round((isDark?14:8)*backHoverT+(isDark?10:8)*backPressT)):COL.rowHover;
    ssFillContinuousRect(gr,x,y,w,h,rSm,rSm,bFill);
  }
  var bIco=Math.round(14*s),bFg=typeof blend==='function'?blend(COL.text2,COL.text,Math.max(backHoverT,backPressT)):(backHot?COL.text:COL.text2);
  drawIcon(gr,'back',bFg,x+Math.round(5*s),y+Math.round((h-bIco)/2),bIco,bIco,bIco);
  tL(gr,'返回',FONT.plSub,bFg,x+Math.round(23*s),y,w-Math.round(25*s),h);
  if(recordHit)HB_SETTINGS.push({id:'back',x0:x,y0:y,x1:x+w,y1:y+h,act:'back'});
}
function ssDrawSettingsTabNav(gr,originX,bodyTop,totalW,wide,available,s,recordHit){
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var rMd=Math.max(6,Math.round(8*s));
  var selFill=typeof ssInk==='function'?ssInk(isDark?22:14):COL.rowActive;
  var curTabIdx=ssSettingsTabIndex(ssSettingsTab);
  var animTabIdx=Math.max(0,Math.min(SS_SETTINGS_TABS.length-1,ssSettingsAnimVal('tab',curTabIdx)));
  if(wide){
    var railW=Math.round(174*s),tabH=Math.round(34*s),tabGap=Math.round(4*s);
    var selY=bodyTop+animTabIdx*(tabH+tabGap);
    ssFillContinuousRect(gr,originX,selY,railW,tabH,rMd,rMd,selFill);
    for(var ti=0;ti<SS_SETTINGS_TABS.length;ti++){
      var tab=SS_SETTINGS_TABS[ti],ty=bodyTop+ti*(tabH+tabGap),tabId='tab:'+tab.id;
      var on=ssSettingsTab===tab.id,hot=hv(originX,ty,originX+railW,ty+tabH);
      var hovT=ssSettingsAnimVal('h-'+tabId,hot?1:0);
      if(!on&&hovT>0.02){
        var hCol=typeof ssInk==='function'?ssInk(Math.round((isDark?12:7)*hovT)):COL.rowHover;
        ssFillContinuousRect(gr,originX,ty,railW,tabH,rMd,rMd,hCol);
      }
      var prox=Math.max(0,1-Math.abs(animTabIdx-ti));
      var isz=Math.round(16*s),ix=originX+Math.round(12*s);
      var icoCol=typeof blend==='function'?blend(blend(COL.text2,COL.text,hovT),COL.green,prox):(on?COL.green:(hot?COL.text:COL.text2));
      var txtCol=typeof blend==='function'?blend(COL.text2,COL.text,Math.max(prox,hovT)):(on||hot?COL.text:COL.text2);
      drawIcon(gr,tab.icon,icoCol,ix,ty+Math.round((tabH-isz)/2),isz,isz,isz);
      tL(gr,tab.label,FONT.pl,txtCol,ix+isz+Math.round(10*s),ty,railW-isz-Math.round(36*s),tabH);
      if(tab.id==='updates'&&available){
        var dotSz=Math.max(6,Math.round(7*s));
        gr.FillEllipse(originX+railW-dotSz-Math.round(10*s),ty+Math.round((tabH-dotSz)/2),dotSz,dotSz,COL.green);
      }
      if(recordHit)HB_SETTINGS.push({id:tabId,x0:originX,y0:ty,x1:originX+railW,y1:ty+tabH,act:'tab',val:tab.id});
    }
    return {x:originX-2,y:bodyTop-2,w:railW+4,h:SS_SETTINGS_TABS.length*(tabH+tabGap)+4};
  }
  var stripH=Math.round(32*s),gapP=Math.round(6*s),pillW=Math.floor((totalW-gapP*(SS_SETTINGS_TABS.length-1))/SS_SETTINGS_TABS.length);
  var slideX=originX+animTabIdx*(pillW+gapP);
  ssFillContinuousRect(gr,slideX,bodyTop,pillW,stripH,rMd,rMd,selFill);
  for(var ci=0;ci<SS_SETTINGS_TABS.length;ci++){
    var ct=SS_SETTINGS_TABS[ci],px=originX+ci*(pillW+gapP),pw=ci===SS_SETTINGS_TABS.length-1?(originX+totalW-px):pillW;
    var cId='tab:'+ct.id,cOn=ssSettingsTab===ct.id,cHot=hv(px,bodyTop,px+pw,bodyTop+stripH);
    var cHovT=ssSettingsAnimVal('h-'+cId,cHot?1:0);
    if(!cOn&&cHovT>0.02){
      var cFill=typeof ssInk==='function'?ssInk(Math.round((isDark?12:7)*cHovT)):COL.rowHover;
      ssFillContinuousRect(gr,px,bodyTop,pw,stripH,rMd,rMd,cFill);
    }
    var cProx=Math.max(0,1-Math.abs(animTabIdx-ci));
    var cTxt=typeof blend==='function'?blend(COL.text2,COL.text,Math.max(cProx,cHovT)):(cOn||cHot?COL.text:COL.text2);
    tC(gr,ct.label,FONT.plSub,cTxt,px+2,bodyTop,Math.max(1,pw-4),stripH);
    if(recordHit)HB_SETTINGS.push({id:cId,x0:px,y0:bodyTop,x1:px+pw,y1:bodyTop+stripH,act:'tab',val:ct.id});
  }
  return {x:originX-2,y:bodyTop-2,w:totalW+4,h:stripH+4};
}
// Fast-path localized painter: redraws ONLY the tiny animating/hovered Settings widget onto
// ssSceneImage and blits its exact bounds to gr (<0.2ms, zero full-page redraws).
function ssPaintSettingsDamage(gr){
  if(!ssSettingsDamage||!ssSettingsDamage.length)return false;
  var list=ssSettingsDamage;ssSettingsDamage=null;
  if(view!=='settings'||typeof ssSceneImage==='undefined'||!ssSceneImage||
     (typeof dirtyAll!=='undefined'&&dirtyAll)||(typeof anyDirty==='function'&&anyDirty())||
     (typeof ssModal!=='undefined'&&ssModal)||(typeof ssPopup!=='undefined'&&ssPopup)||
     (typeof fsMode!=='undefined'&&fsMode))return false;
  var sg=ssSceneImage.GetGraphics();
  sg.SetSmoothingMode(2);sg.SetInterpolationMode(5);
  var paintOne=function(g){
    for(var i=0;i<list.length;i++){
      var w=list[i],b=w.bounds;
      if(!b||b.w<=0||b.h<=0)continue;
      g.FillSolidRect(b.x,b.y,b.w,b.h,w.bg);
      if(w.kind==='toggle'){
        ssDrawToggleSwitch(g,w.x,w.y,ssSettingsLiveToggleVal(w.animKey),w.disabled,w.s,w.animKey,w.actId);
      }else if(w.kind==='button'){
        ssDrawSettingsActionBtn(g,w.x,w.y,w.w,w.h,w.label,w.primary,w.disabled,w.s,w.actId);
      }else if(w.kind==='segmented'){
        ssDrawSegmented(g,w.x,w.y,w.w,w.h,w.items,ssSettingsLiveSegVal(w.animKey),w.s,null,w.animKey);
      }else if(w.kind==='card'){
        var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
        ssDrawAppearanceCard(g,w.x,w.y,w.w,w.h,w.label,w.darkMode,w.darkMode?isDark:!isDark,w.s,w.actId);
      }else if(w.kind==='back'){
        ssDrawSettingsBackBtn(g,w.x,w.y,w.w,w.h,w.s,false);
      }else if(w.kind==='rail'){
        var avail=!!(typeof ssState!=='undefined'&&ssState&&ssState.update&&ssState.update.available);
        ssDrawSettingsTabNav(g,w.originX,w.bodyTop,w.totalW,w.wide,avail,w.s,false);
      }
    }
  };
  try{
    if(typeof ssDrawScaledLibrary==='function')ssDrawScaledLibrary(sg,paintOne,ssSettingsScale,false);
    else paintOne(sg);
  }finally{ssSceneImage.ReleaseGraphics(sg);}
  for(var j=0;j<list.length;j++){
    var r=list[j].bounds;
    if(r&&r.w>0&&r.h>0)gr.DrawImage(ssSceneImage,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
  }
  return true;
}
function drawSettings(gr,r){
  HB_SETTINGS=[];
  ssSettingsWidgets=Object.create(null);
  ssSettingsDamage=null;
  var s=ssDensity;ssSettingsScale=s;
  var reading=ssLibraryReadingRect(r);
  var x0=reading.x,fullW=reading.w;
  var wide=fullW>=Math.round(640*s);
  var totalW=Math.min(fullW,Math.round(820*s));
  var originX=x0+Math.max(0,Math.floor((fullW-totalW)/2));
  var bottom=r.y+r.h;
  gr.FillSolidRect(r.x,r.y,r.w,r.h,COL.base);

  var backY=r.y+Math.round(14*s),backH=Math.round(28*s),backW=Math.round(76*s);
  var rLg=Math.max(10,Math.round(12*s));
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  ssDrawSettingsBackBtn(gr,originX,backY,backW,backH,s,true);
  ssSettingsRegisterWidget(['back'],{kind:'back',x:originX,y:backY,w:backW,h:backH,s:s,bg:COL.base,bounds:{x:originX-2,y:backY-2,w:backW+4,h:backH+4}});

  var titleY=backY+backH+Math.round(4*s),titleH=Math.round(40*s);
  tL(gr,'设置',FONT.title,COL.text,originX,titleY,totalW,titleH);

  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  var upd=st.update||{};
  var available=!!upd.available;
  var bodyTop=titleY+titleH+Math.round(16*s);

  var detailX=originX,detailW=totalW;
  var railBounds=ssDrawSettingsTabNav(gr,originX,bodyTop,totalW,wide,available,s,true);
  var tabKeys=['tab'];
  for(var tk=0;tk<SS_SETTINGS_TABS.length;tk++)tabKeys.push('tab:'+SS_SETTINGS_TABS[tk].id);
  ssSettingsRegisterWidget(tabKeys,{kind:'rail',originX:originX,bodyTop:bodyTop,totalW:totalW,wide:wide,s:s,bg:COL.base,bounds:railBounds});

  if(wide){
    var railW=Math.round(174*s),colGap=Math.round(28*s);
    var divX=originX+railW+Math.round(colGap/2);
    gr.DrawLine(divX,bodyTop,divX,Math.min(bottom-Math.round(24*s),bodyTop+Math.round(260*s)),1,COL.line);
    detailX=originX+railW+colGap;
    detailW=Math.max(240,totalW-railW-colGap);
  }else{
    bodyTop+=Math.round(32*s)+Math.round(18*s);
  }

  var viewH=Math.max(0,bottom-bodyTop);
  if(viewH<1)return;

  var personalOn=ssSettingsLiveToggleVal('sw-personal');
  var statsOn=ssSettingsLiveToggleVal('sw-stats');
  var reducedOn=ssSettingsLiveToggleVal('sw-reduced');
  var wheelBucket=ssSettingsLiveSegVal('seg-wheel');
  var ceilBucket=ssSettingsLiveSegVal('seg-ceil');
  var curMode=ssSettingsLiveSegVal('seg-mode');
  var phase=upd.phase||'',busy=phase==='downloading'||phase==='installing',checking=!!upd.checking;
  var autoUpdate=ssSettingsLiveToggleVal('sw-auto');
  var downloaded=Number(upd.downloaded)||0,total=Math.max(1,Number(upd.total)||1),frac=Math.max(0,Math.min(1,downloaded/total));
  var updTitle=checking?'正在检查更新…':phase==='downloading'?('正在下载更新 · '+Math.round(frac*100)+'%'):
    phase==='installing'?'正在校验与安装，完成后重新打开…':
    available?('发现新版本 '+(upd.release&&upd.release.version?upd.release.version:'')):
    upd.error?String(upd.error):upd.checked_at?'当前已是最新版本':'尚未检查更新';
  var updBadge='v'+(upd.current||'1.0.23')+' · '+(upd.edition==='core'?'独立插件版':'完整版');
  var hasFeedback=ssSettingsFeedback&&(Date.now()-ssSettingsFeedbackAt)<3500;

  var pad=Math.round(18*s),rowH=Math.round(62*s),secH=Math.round(28*s),segH=Math.round(32*s),btnH=Math.round(32*s),swW=Math.round(42*s),swH=Math.round(24*s);
  var estH=ssSettingsTab==='appearance'?Math.round(416*s):ssSettingsTab==='playback'?Math.round(376*s):Math.round(270*s);
  SS_SETTINGS_MAX=Math.max(0,estH-viewH);
  ssSettingsScroll=clampPx(ssSettingsScroll,SS_SETTINGS_MAX);
  ssSettingsScrollT=clampPx(ssSettingsScrollT,SS_SETTINGS_MAX);
  var off=Math.round(ssSettingsScroll);

  var layer=ssBeginViewport('settings-list',gr,detailX-4,bodyTop-4,detailW+8,viewH+4);
  var g=layer.gr,y=bodyTop-off;
  function pushHit(box,act,enabled,val,animKey,fromIdx,toIdx){
    if(enabled===false)return;
    var y0=Math.max(bodyTop,box.y0),y1=Math.min(bottom,box.y1);
    var id=val!==undefined?(act+':'+val):act;
    if(y1>y0)HB_SETTINGS.push({id:id,x0:box.x0,y0:y0,x1:box.x1,y1:y1,act:act,val:val,animKey:animKey,fromIdx:fromIdx,toIdx:toIdx});
  }
  function regIfVisible(keys,desc){
    var b=desc.bounds;
    if(b.y>=bodyTop-4&&b.y+b.h<=bottom)ssSettingsRegisterWidget(keys,desc);
  }
  function drawToggleRow(tx,ty,on,disabled,animKey,actId){
    var box=ssDrawToggleSwitch(g,tx,ty,on,disabled,s,animKey,actId);
    pushHit(box,actId,!disabled);
    regIfVisible([animKey,actId],{kind:'toggle',x:tx,y:ty,disabled:disabled,s:s,animKey:animKey,actId:actId,bg:COL.elev,bounds:{x:tx-3,y:ty-3,w:swW+6,h:swH+7}});
  }
  function drawBtnRow(bx,by,bw,bh,label,primary,disabled,actId){
    var box=ssDrawSettingsActionBtn(g,bx,by,bw,bh,label,primary,disabled,s,actId);
    pushHit(box,actId,!disabled);
    regIfVisible([actId],{kind:'button',x:bx,y:by,w:bw,h:bh,label:label,primary:primary,disabled:disabled,s:s,actId:actId,bg:COL.elev,bounds:{x:bx-2,y:by-2,w:bw+4,h:bh+5}});
  }
  function drawSegRow(sx,sy,sw,sh,items,activeVal,animKey){
    ssDrawSegmented(g,sx,sy,sw,sh,items,activeVal,s,pushHit,animKey);
    var keys=[animKey];
    for(var si=0;si<items.length;si++)keys.push(items[si].act+':'+items[si].val);
    regIfVisible(keys,{kind:'segmented',x:sx,y:sy,w:sw,h:sh,items:items,s:s,animKey:animKey,bg:COL.elev,bounds:{x:sx-2,y:sy-2,w:sw+4,h:sh+5}});
  }
  function drawGroupBox(h){
    ssFillContinuousRect(g,detailX,y,detailW,h,rLg,rLg,COL.elev);
    if(typeof strokeRound==='function')strokeRound(g,detailX,y,detailW,h,rLg,1,COL.line);
    var cy=y;y+=h+Math.round(16*s);return cy;
  }
  function drawRow(ry,label,desc,rightW){
    var tw=Math.max(40,detailW-pad*2-rightW-Math.round(14*s));
    if(desc){
      tL(g,label,FONT.pl,COL.text,detailX+pad,ry+Math.round(10*s),tw,Math.round(22*s));
      tL(g,desc,FONT.plSub,COL.text2,detailX+pad,ry+Math.round(33*s),tw,Math.round(20*s));
    }else tL(g,label,FONT.pl,COL.text,detailX+pad,ry,tw,rowH);
  }
  function drawSep(dy){g.DrawLine(detailX+pad,dy,detailX+detailW-pad,dy,1,COL.line);}

  try{
    var seg3W=Math.min(Math.round(192*s),Math.max(Math.round(150*s),Math.floor(detailW*.38)));

    if(ssSettingsTab==='appearance'){
      tL(g,'外观',FONT.sect2,COL.text,detailX,y,detailW,secH);
      y+=secH+Math.round(14*s);
      var cardGap=Math.round(18*s),cardW=Math.floor((detailW-cardGap)/2),cardH=Math.round(104*s);
      pushHit(ssDrawAppearanceCard(g,detailX,y,cardW,cardH,'浅色',false,!isDark,s,'appearance-light'),'appearance-light',true);
      regIfVisible(['appearance-light'],{kind:'card',x:detailX,y:y,w:cardW,h:cardH,label:'浅色',darkMode:false,s:s,actId:'appearance-light',bg:COL.base,bounds:{x:detailX-5,y:y-5,w:cardW+10,h:cardH+Math.round(38*s)}});
      var rCardX=detailX+cardW+cardGap,rCardW=detailW-cardW-cardGap;
      pushHit(ssDrawAppearanceCard(g,rCardX,y,rCardW,cardH,'深色',true,isDark,s,'appearance-dark'),'appearance-dark',true);
      regIfVisible(['appearance-dark'],{kind:'card',x:rCardX,y:y,w:rCardW,h:cardH,label:'深色',darkMode:true,s:s,actId:'appearance-dark',bg:COL.base,bounds:{x:rCardX-5,y:y-5,w:rCardW+10,h:cardH+Math.round(38*s)}});
      y+=cardH+Math.round(46*s);

      var g1=drawGroupBox(rowH*3);
      drawRow(g1,'减少动态效果','停用装饰动效并缩短界面过渡',swW);
      drawToggleRow(detailX+detailW-pad-swW,g1+Math.round((rowH-swH)/2),reducedOn,false,'sw-reduced','toggle-reduced-motion');

      drawSep(g1+rowH);
      drawRow(g1+rowH,'列表滚轮速度','调整歌单与曲库每次滚轮滑动距离',seg3W);
      drawSegRow(detailX+detailW-pad-seg3W,g1+rowH+Math.round((rowH-segH)/2),seg3W,segH,[
        {label:'柔和',val:48,act:'wheel-step'},{label:'标准',val:72,act:'wheel-step'},{label:'快速',val:108,act:'wheel-step'}
      ],wheelBucket,'seg-wheel');

      drawSep(g1+rowH*2);
      var resetW=Math.round(118*s);
      drawRow(g1+rowH*2,'窗口与栏位布局',hasFeedback?ssSettingsFeedback:'恢复默认侧栏宽度与窗口比例，保留歌单与记录',resetW);
      drawBtnRow(detailX+detailW-pad-resetW,g1+rowH*2+Math.round((rowH-btnH)/2),resetW,btnH,'恢复默认布局',false,false,'reset-layout');
    }else if(ssSettingsTab==='playback'){
      tL(g,'播放与音频',FONT.sect2,COL.text,detailX,y,detailW,secH);
      y+=secH+Math.round(14*s);

      var p1=drawGroupBox(rowH*2);
      var outW=Math.round(104*s);
      drawRow(p1,'音频输出设备',ssSettingsOutputName||'跟随 foobar2000 当前输出设置',outW);
      drawBtnRow(detailX+detailW-pad-outW,p1+Math.round((rowH-btnH)/2),outW,btnH,'切换设备…',false,false,'output-picker');
      drawSep(p1+rowH);
      drawRow(p1+rowH,'音量滑块上限衰减','适合后端增益较高的设备，限制最大输出电平',seg3W);
      drawSegRow(detailX+detailW-pad-seg3W,p1+rowH+Math.round((rowH-segH)/2),seg3W,segH,[
        {label:'0 dB',val:0,act:'vol-ceil'},{label:'-6 dB',val:-6,act:'vol-ceil'},{label:'-12 dB',val:-12,act:'vol-ceil'}
      ],ceilBucket,'seg-ceil');

      var p2=drawGroupBox(rowH*2);
      var seg4W=Math.min(Math.round(256*s),Math.max(Math.round(182*s),Math.floor(detailW*.49)));
      drawRow(p2,'播放模式','切换智能随机或顺序与循环模式',seg4W);
      drawSegRow(detailX+detailW-pad-seg4W,p2+Math.round((rowH-segH)/2),seg4W,segH,[
        {label:'智能随机',val:'smart',act:'playback-mode'},{label:'顺序',val:'0',act:'playback-mode'},
        {label:'列表循环',val:'1',act:'playback-mode'},{label:'单曲',val:'2',act:'playback-mode'}
      ],curMode,'seg-mode');
      drawSep(p2+rowH);
      var prefW=Math.round(112*s);
      drawRow(p2+rowH,'二维随机偏好','调节常听/少听与风格相似/跳跃权重',prefW);
      drawBtnRow(detailX+detailW-pad-prefW,p2+rowH+Math.round((rowH-btnH)/2),prefW,btnH,'调整偏好…',false,false,'open-preference');
    }else if(ssSettingsTab==='personal'){
      tL(g,'个人与统计',FONT.sect2,COL.text,detailX,y,detailW,secH);
      y+=secH+Math.round(14*s);
      var pe=drawGroupBox(rowH*2);
      drawRow(pe,'播放历史、收藏与稍后听','在左侧栏显示个人入口，仅保存于本地，不修改音乐文件',swW);
      drawToggleRow(detailX+detailW-pad-swW,pe+Math.round((rowH-swH)/2),personalOn,false,'sw-personal','toggle-personal');
      drawSep(pe+rowH);
      drawRow(pe+rowH,'记录听歌统计','统计有效收听时长与排行，关闭后保留已有记录',swW);
      drawToggleRow(detailX+detailW-pad-swW,pe+rowH+Math.round((rowH-swH)/2),statsOn,false,'sw-stats','toggle-stats');
    }else if(ssSettingsTab==='updates'){
      tL(g,'软件更新',FONT.sect2,COL.text,detailX,y,detailW,secH);
      y+=secH+Math.round(14*s);
      var heroH=Math.round((phase==='downloading'?172:150)*s);
      var u1=drawGroupBox(heroH);
      var pillW=Math.min(detailW-pad*2,Math.max(Math.round(134*s),Math.ceil(ssMeasureText(g,updBadge,FONT.plSub,24))+Math.round(24*s))),pillH=Math.round(24*s);
      if(typeof ssFillCapsule==='function'){
        ssFillCapsule(g,detailX+pad,u1+pad,pillW,pillH,COL.base);
        if(typeof ssStrokeCapsule==='function')ssStrokeCapsule(g,detailX+pad,u1+pad,pillW,pillH,1,COL.line);
      }else ssFillContinuousRect(g,detailX+pad,u1+pad,pillW,pillH,pillH/2,pillH/2,COL.base);
      tC(g,updBadge,FONT.plSub,COL.text2,detailX+pad,u1+pad,pillW,pillH);

      tL(g,updTitle,FONT.sect2,COL.text,detailX+pad,u1+pad+pillH+Math.round(10*s),detailW-pad*2,Math.round(28*s));
      tL(g,'仅读取本仓库 GitHub 公开发布，安装前自动校验并备份配置。',FONT.plSub,COL.text2,detailX+pad,u1+pad+pillH+Math.round(40*s),detailW-pad*2,Math.round(20*s));
      if(phase==='downloading'){
        var barY=u1+pad+pillH+Math.round(68*s),barH=Math.round(6*s),barW=detailW-pad*2;
        if(typeof ssFillCapsule==='function'){
          ssFillCapsule(g,detailX+pad,barY,barW,barH,COL.seekbg);
          ssFillCapsule(g,detailX+pad,barY,Math.max(barH,Math.round(barW*frac)),barH,COL.green);
        }else{
          ssFillContinuousRect(g,detailX+pad,barY,barW,barH,barH/2,barH/2,COL.seekbg);
          ssFillContinuousRect(g,detailX+pad,barY,Math.max(barH,Math.round(barW*frac)),barH,barH/2,barH/2,COL.green);
        }
      }
      var actY=u1+heroH-pad-btnH,chkW=Math.round(100*s),insW=Math.round(112*s);
      if(available){
        drawBtnRow(detailX+pad,actY,insW,btnH,busy?'正在更新…':'更新并重启',true,busy||checking,'update-install');
        drawBtnRow(detailX+pad+insW+Math.round(10*s),actY,chkW,btnH,'立即检查',false,busy||checking,'update-check');
      }else{
        drawBtnRow(detailX+pad,actY,chkW,btnH,checking?'检查中…':'立即检查',true,busy||checking,'update-check');
      }

      var u2=drawGroupBox(rowH);
      drawRow(u2,'启动时自动检查更新','后台读取发布信息，不会打断当前播放',swW);
      drawToggleRow(detailX+detailW-pad-swW,u2+Math.round((rowH-swH)/2),autoUpdate,false,'sw-auto','toggle-auto-update');
    }else{
      tL(g,'高级',FONT.sect2,COL.text,detailX,y,detailW,secH);
      y+=secH+Math.round(14*s);
      var a1=drawGroupBox(rowH*2);
      var advW=Math.round(132*s);
      drawRow(a1,'音乐库监控目录','添加或管理 foobar2000 扫描的本地音乐文件夹',advW);
      drawBtnRow(detailX+detailW-pad-advW,a1+Math.round((rowH-btnH)/2),advW,btnH,'配置目录…',false,false,'library-configure');
      drawSep(a1+rowH);
      drawRow(a1+rowH,'foobar2000 原生设置','管理组件、DSP、快捷键、格式转换器与切回原版界面',advW);
      drawBtnRow(detailX+detailW-pad-advW,a1+rowH+Math.round((rowH-btnH)/2),advW,btnH,'打开原生设置…',false,false,'native-settings');
    }
  }finally{layer.finish();}
  drawScrollbar(gr,r.x+r.w-10,bodyTop,viewH,ssSettingsScroll,SS_SETTINGS_MAX,viewH,estH,[r.x,bodyTop,r.x+r.w,bottom]);
}
function ssSettingsMouseDown(x,y){
  if(view!=='settings')return false;
  var b=hit(HB_SETTINGS,x,y);
  if(!b)return false;
  var id=b.id||b.act;
  ssSettingsDown=id;
  ssSettingsAnimStart('p-'+id,ssSettingsAnimVal('p-'+id,0),1,80);
  if(!ssSettingsQueueWidgets([id]))ssSettingsRepaint();
  return true;
}
function ssSettingsClick(x,y){
  if(view!=='settings')return false;
  var wasDown=ssSettingsDown;ssSettingsDown='';
  if(wasDown)ssSettingsAnimStart('p-'+wasDown,ssSettingsAnimVal('p-'+wasDown,1),0,95);
  var b=hit(HB_SETTINGS,x,y);
  if(!b){if(wasDown&&!ssSettingsQueueWidgets([wasDown]))ssSettingsRepaint();return false;}
  var id=b.id||b.act,dirtyKeys=wasDown&&wasDown!==id?[wasDown,id]:[id];
  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  if(b.act==='back'){
    ssSettingsAnimStop();
    view=typeof ssSettingsBackView==='string'&&ssSettingsBackView?ssSettingsBackView:'home';
    repaintAll();return true;
  }
  if(b.act==='tab'){
    var prevIdx=ssSettingsAnimVal('tab',ssSettingsTabIndex(ssSettingsTab)),nextIdx=ssSettingsTabIndex(b.val);
    ssSettingsTab=b.val;ssSettingsScroll=ssSettingsScrollT=0;
    ssSettingsAnimStart('tab',prevIdx,nextIdx,165);
    if(b.val==='playback')ssRefreshSettingsOutput();
    ssSettingsRepaint();return true;
  }
  if(b.animKey&&b.fromIdx!==undefined&&b.toIdx!==undefined){
    var liveIdx=ssSettingsAnimVal(b.animKey,b.fromIdx);
    ssSettingsAnimStart(b.animKey,liveIdx,b.toIdx,180);
    dirtyKeys.push(b.animKey);
  }
  if(b.act==='appearance-light'){ssSend('theme_appearance',{appearance:'light'});if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(b.act==='appearance-dark'){ssSend('theme_appearance',{appearance:'dark'});if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(b.act==='toggle-reduced-motion'){
    var curR=typeof ssReducedMotion!=='undefined'&&ssReducedMotion?1:0;
    var liveR=ssSettingsAnimVal('sw-reduced',curR),nextR=curR?0:1;
    if(typeof ssReducedMotion!=='undefined'){ssReducedMotion=!ssReducedMotion;try{window.SetProperty('SmartShuffle: reduce motion',ssReducedMotion);}catch(e){}}
    if(typeof ssFadeStart!=='undefined')ssFadeStart=0;
    if(nextR){ssSettingsAnimStop();}
    else ssSettingsAnimStart('sw-reduced',liveR,0,175);
    if(!ssSettingsQueueWidgets(['sw-reduced']))ssSettingsRepaint();
    return true;
  }
  if(b.act==='wheel-step'){
    WHEEL_PX=b.val;
    try{window.SetProperty('Scrolling: wheel step (px)',WHEEL_PX);}catch(e){}
    if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;
  }
  if(b.act==='vol-ceil'){
    VOL_CEIL=b.val;
    try{window.SetProperty('Playback: output ceiling (dB below max)',VOL_CEIL);}catch(e){}
    if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;
  }
  if(b.act==='output-picker'){
    delete ssSettingsAnim['p-'+id];
    if(typeof ssDropSceneImage==='function')ssDropSceneImage();
    if(typeof ssShowOutputs==='function'){ssShowOutputs(b.x0,b.y1,b);return true;}
  }
  if(b.act==='playback-mode'){
    ssSettingsSetPending('seg-mode',String(b.val));
    if(b.val==='smart')ssSend('playback_mode',{mode:'smart'});
    else ssSend('playback_mode',{mode:'native',order:Number(b.val)||0});
    if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;
  }
  if(b.act==='open-preference'){
    delete ssSettingsAnim['p-'+id];
    if(typeof ssDropSceneImage==='function')ssDropSceneImage();
    if(typeof ssOpen==='function'){ssOpen();return true;}
  }
  if(b.act==='reset-layout'){
    ssSend('reset_layout');
    ssSettingsFeedback='已恢复默认布局';ssSettingsFeedbackAt=Date.now();
    repaintAll();return true;
  }
  if(b.act==='toggle-personal'){
    var pOn=ssSettingsLiveToggleVal('sw-personal');
    var pLive=ssSettingsAnimVal('sw-personal',pOn?1:0),pNext=!pOn;
    ssSettingsSetPending('sw-personal',pNext);
    ssSettingsAnimStart('sw-personal',pLive,pNext?1:0,175);
    ssSend('personal_config',{enabled:pNext});
    if(!ssSettingsQueueWidgets(['sw-personal']))ssSettingsRepaint();return true;
  }
  if(b.act==='toggle-stats'){
    var sOn=ssSettingsLiveToggleVal('sw-stats');
    var sLive=ssSettingsAnimVal('sw-stats',sOn?1:0),sNext=!sOn;
    ssSettingsSetPending('sw-stats',sNext);
    ssSettingsAnimStart('sw-stats',sLive,sNext?1:0,175);
    ssSend('listening_stats_config',{enabled:sNext});
    if(!ssSettingsQueueWidgets(['sw-stats']))ssSettingsRepaint();return true;
  }
  if(b.act==='update-check'){ssSend('update_check');if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(b.act==='update-install'){ssSend('update_install');if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(b.act==='toggle-auto-update'){
    var aOn=ssSettingsLiveToggleVal('sw-auto');
    var aLive=ssSettingsAnimVal('sw-auto',aOn?1:0),aNext=!aOn;
    ssSettingsSetPending('sw-auto',aNext);
    ssSettingsAnimStart('sw-auto',aLive,aNext?1:0,175);
    ssSend('update_config',{automatic:aNext});
    if(!ssSettingsQueueWidgets(['sw-auto']))ssSettingsRepaint();return true;
  }
  if(b.act==='library-configure'){try{fb.RunMainMenuCommand('Library/Configure');}catch(e){ssSend('settings');}if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(b.act==='native-settings'){ssSend('settings');if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();return true;}
  if(!ssSettingsQueueWidgets(dirtyKeys))ssSettingsRepaint();
  return true;
}
