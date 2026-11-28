/* verdant/views/settings.js -- in-theme macOS grouped Preferences & Software Update page
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

var ssSettingsScroll=0,ssSettingsScrollT=0,SS_SETTINGS_MAX=0,HB_SETTINGS=[];
var ssSettingsBackView='home',ssSettingsOutputName='';

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
  ssSettingsScroll=ssSettingsScrollT=0;
  ssRefreshSettingsOutput();
  if(checkUpdate&&typeof ssSend==='function')ssSend('update_check');
  repaintAll();
}
function ssDrawToggleSwitch(gr,x,y,on,disabled,s){
  var w=Math.round(40*s),h=Math.round(22*s),rad=h/2,pad=Math.max(2,Math.round(2*s));
  var fill=disabled?COL.seekbg:(on?COL.green:COL.seekbg);
  ssFillContinuousRect(gr,x,y,w,h,rad,rad,fill);
  var d=h-pad*2,kx=on?(x+w-pad-d):(x+pad);
  gr.FillEllipse(kx,y+pad,d,d,RGB(255,255,255));
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
function ssDrawSettingsActionBtn(gr,x,y,w,h,label,primary,disabled,s){
  var rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  var hot=!disabled&&hv(x,y,x+w,y+h);
  var bg=primary?(disabled?COL.seekbg:(hot?COL.greenHover:COL.green)):(disabled?COL.elev:(hot?COL.hover:COL.base));
  var fg=primary?(disabled?COL.text3:COL.onAccent):(disabled?COL.text3:COL.text);
  ssFillContinuousRect(gr,x,y,w,h,rMd,rMd,bg);
  if(!primary&&typeof strokeRound==='function')strokeRound(gr,x,y,w,h,rMd,1,COL.line);
  tC(gr,label,FONT.pl,fg,x+4,y,Math.max(1,w-8),h);
  return {x0:x,y0:y,x1:x+w,y1:y+h};
}
function ssDrawSegmented(gr,x,y,w,h,items,activeVal,s,pushHit){
  var rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),rSeg=Math.max(4,rMd-2);
  ssFillContinuousRect(gr,x,y,w,h,rMd,rMd,COL.base);
  if(typeof strokeRound==='function')strokeRound(gr,x,y,w,h,rMd,1,COL.line);
  var innerW=w-4,segW=Math.floor(innerW/items.length);
  for(var i=0;i<items.length;i++){
    var sx=x+2+i*segW,sw=i===items.length-1?(x+w-2-sx):segW;
    var on=items[i].val===activeVal;
    if(on)ssFillContinuousRect(gr,sx,y+2,sw,h-4,rSeg,rSeg,COL.green);
    tC(gr,items[i].label,FONT.plSub,on?COL.onAccent:COL.text2,sx,y+2,sw,h-4);
    pushHit({x0:sx,y0:y+2,x1:sx+sw,y1:y+h-2},items[i].act,true,items[i].val);
  }
}
function drawSettings(gr,r){
  HB_SETTINGS=[];
  var s=ssDensity,reading=ssLibraryReadingRect(r);
  var maxW=Math.min(reading.w,Math.round(740*s));
  var x=reading.x+Math.max(0,Math.floor((reading.w-maxW)/2)),w=maxW;
  var headTop=r.y+Math.round(16*s),titleH=Math.round(38*s),subH=Math.round(20*s);
  var top=headTop+titleH+subH+Math.round(14*s),bottom=r.y+r.h,viewH=Math.max(0,bottom-top);
  gr.FillSolidRect(r.x,r.y,r.w,r.h,COL.base);
  tL(gr,'参数选项',FONT.title,COL.text,x,headTop,w,titleH);
  tL(gr,'外观、播放与音频、个人记录、听歌统计与软件更新',FONT.meta,COL.text2,x,headTop+titleH,w,subH);
  if(viewH<1)return;

  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  var personalOn=!!(st.personal&&st.personal.enabled);
  var statsOn=st.listening_stats!==undefined?!!st.listening_stats:!(st.personal&&st.personal.history_enabled===false);
  var reducedOn=typeof ssReducedMotion!=='undefined'&&!!ssReducedMotion;
  var curWheel=typeof WHEEL_PX==='number'?WHEEL_PX:72;
  var wheelBucket=curWheel<=56?48:(curWheel>=90?108:72);
  var curCeil=typeof VOL_CEIL==='number'?VOL_CEIL:0;
  var ceilBucket=curCeil<=-9?-12:(curCeil<=-3?-6:0);
  var smartOn=!!st.enabled,curMode=smartOn?'smart':String(typeof st.native_order==='number'?st.native_order:0);
  var upd=st.update||{};
  var phase=upd.phase||'',busy=phase==='downloading'||phase==='installing';
  var available=!!upd.available,checking=!!upd.checking,autoUpdate=upd.automatic!==false;
  var downloaded=Number(upd.downloaded)||0,total=Math.max(1,Number(upd.total)||1);
  var frac=Math.max(0,Math.min(1,downloaded/total));
  var updTitle=checking?'正在检查更新…':phase==='downloading'?('正在下载更新 · '+Math.round(frac*100)+'%'):
    phase==='installing'?'正在校验与安装，完成后重新打开…':
    available?('发现新版本 '+(upd.release&&upd.release.version?upd.release.version:'')):
    upd.error?String(upd.error):upd.checked_at?'当前已是最新版本':'从 GitHub 检查新版本';
  var updSub='当前版本 '+(upd.current||'1.0.23')+' · '+(upd.edition==='core'?'独立插件版':'完整版');

  var pad=Math.round(18*s),rowH=Math.round(56*s),secH=Math.round(24*s),gap=Math.round(18*s);
  var rLg=typeof ssRad==='function'?ssRad('lg',s):Math.round(12*s);
  var card1H=rowH*4,card2H=rowH*4,card3H=rowH*2,card4H=rowH*2+(phase==='downloading'?Math.round(20*s):0),card5H=rowH*2;
  var contentH=secH*5+card1H+card2H+card3H+card4H+card5H+gap*4+Math.round(48*s);
  SS_SETTINGS_MAX=Math.max(0,contentH-viewH);
  ssSettingsScroll=clampPx(ssSettingsScroll,SS_SETTINGS_MAX);
  ssSettingsScrollT=clampPx(ssSettingsScrollT,SS_SETTINGS_MAX);
  var off=Math.round(ssSettingsScroll);

  var layer=ssBeginViewport('settings-list',gr,r.x,top,r.w,viewH);
  var g=layer.gr,y=top-off;
  function pushHit(box,act,enabled,val){
    if(enabled===false)return;
    var y0=Math.max(top,box.y0),y1=Math.min(bottom,box.y1);
    if(y1>y0)HB_SETTINGS.push({x0:box.x0,y0:y0,x1:box.x1,y1:y1,act:act,val:val});
  }
  function drawCard(title,h){
    tL(g,title,FONT.sect,COL.text,x+Math.round(4*s),y,w,secH);
    y+=secH+Math.round(4*s);
    ssFillContinuousRect(g,x,y,w,h,rLg,rLg,COL.elev);
    if(typeof strokeRound==='function')strokeRound(g,x,y,w,h,rLg,1,COL.line);
    var cy=y;y+=h+gap;return cy;
  }
  function drawRowText(ry,label,desc,rightW){
    var tw=Math.max(40,w-pad*2-rightW-Math.round(12*s));
    if(desc){
      tL(g,label,FONT.pl,COL.text,x+pad,ry+Math.round(10*s),tw,Math.round(20*s));
      tL(g,desc,FONT.plSub,COL.text2,x+pad,ry+Math.round(31*s),tw,Math.round(16*s));
    }else tL(g,label,FONT.pl,COL.text,x+pad,ry,tw,rowH);
  }
  function drawDivider(dy){g.DrawLine(x+pad,dy,x+w-pad,dy,1,COL.line);}

  try{
    var segH=Math.round(30*s),btnH=Math.round(32*s),swW=Math.round(40*s),swH=Math.round(22*s);
    var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';

    // Card 1: 外观与交互
    var c1=drawCard('外观与交互',card1H);
    var seg2W=Math.round(136*s);
    drawRowText(c1,'外观主题','在浅色与深色之间即时切换',seg2W);
    ssDrawSegmented(g,x+w-pad-seg2W,c1+Math.round((rowH-segH)/2),seg2W,segH,[
      {label:'浅色',val:'light',act:'appearance-light'},{label:'深色',val:'dark',act:'appearance-dark'}
    ],isDark?'dark':'light',s,pushHit);

    drawDivider(c1+rowH);
    drawRowText(c1+rowH,'减少动态效果','停用装饰动效并缩短过渡，降低视觉干扰',swW);
    pushHit(ssDrawToggleSwitch(g,x+w-pad-swW,c1+rowH+Math.round((rowH-swH)/2),reducedOn,false,s),'toggle-reduced-motion',true);

    drawDivider(c1+rowH*2);
    var seg3W=Math.round(186*s);
    drawRowText(c1+rowH*2,'列表滚轮速度','调整歌单与曲库每次滚轮滑动的距离',seg3W);
    ssDrawSegmented(g,x+w-pad-seg3W,c1+rowH*2+Math.round((rowH-segH)/2),seg3W,segH,[
      {label:'柔和',val:48,act:'wheel-step'},{label:'标准',val:72,act:'wheel-step'},{label:'快速',val:108,act:'wheel-step'}
    ],wheelBucket,s,pushHit);

    drawDivider(c1+rowH*3);
    var btnW=Math.round(118*s);
    drawRowText(c1+rowH*3,'窗口与栏位布局','恢复默认侧栏宽度与窗口尺寸，保留歌单与播放记录',btnW);
    pushHit(ssDrawSettingsActionBtn(g,x+w-pad-btnW,c1+rowH*3+Math.round((rowH-btnH)/2),btnW,btnH,'恢复默认布局',false,false,s),'reset-layout',true);

    // Card 2: 播放与音频
    var c2=drawCard('播放与音频',card2H);
    var outBtnW=Math.round(108*s);
    drawRowText(c2,'音频输出设备',ssSettingsOutputName||'跟随当前 foobar2000 输出设置',outBtnW);
    pushHit(ssDrawSettingsActionBtn(g,x+w-pad-outBtnW,c2+Math.round((rowH-btnH)/2),outBtnW,btnH,'切换设备…',false,false,s),'output-picker',true);

    drawDivider(c2+rowH);
    var seg4W=Math.min(Math.round(256*s),Math.max(Math.round(180*s),Math.floor(w*.45)));
    drawRowText(c2+rowH,'播放模式','切换智能随机或原生顺序/循环模式',seg4W);
    ssDrawSegmented(g,x+w-pad-seg4W,c2+rowH+Math.round((rowH-segH)/2),seg4W,segH,[
      {label:'智能随机',val:'smart',act:'playback-mode'},{label:'顺序',val:'0',act:'playback-mode'},
      {label:'列表循环',val:'1',act:'playback-mode'},{label:'单曲',val:'2',act:'playback-mode'}
    ],curMode,s,pushHit);

    drawDivider(c2+rowH*2);
    var prefBtnW=Math.round(118*s);
    drawRowText(c2+rowH*2,'二维随机偏好','调整常听/少听与风格相似/跳跃权重',prefBtnW);
    pushHit(ssDrawSettingsActionBtn(g,x+w-pad-prefBtnW,c2+rowH*2+Math.round((rowH-btnH)/2),prefBtnW,btnH,'调整随机偏好…',false,false,s),'open-preference',true);

    drawDivider(c2+rowH*3);
    drawRowText(c2+rowH*3,'音量滑块上限衰减','适合后端增益较高的声卡，限制最高输出电平',seg3W);
    ssDrawSegmented(g,x+w-pad-seg3W,c2+rowH*3+Math.round((rowH-segH)/2),seg3W,segH,[
      {label:'0 dB',val:0,act:'vol-ceil'},{label:'-6 dB',val:-6,act:'vol-ceil'},{label:'-12 dB',val:-12,act:'vol-ceil'}
    ],ceilBucket,s,pushHit);

    // Card 3: 个人记录与听歌统计
    var c3=drawCard('个人记录与听歌统计',card3H);
    drawRowText(c3,'播放历史、收藏与稍后听','在左侧栏显示个人记录入口，数据保存在本地不改写音乐文件',swW);
    pushHit(ssDrawToggleSwitch(g,x+w-pad-swW,c3+Math.round((rowH-swH)/2),personalOn,false,s),'toggle-personal',true);
    drawDivider(c3+rowH);
    drawRowText(c3+rowH,'记录听歌统计','统计有效收听时长与排行，关闭后保留已有历史记录',swW);
    pushHit(ssDrawToggleSwitch(g,x+w-pad-swW,c3+rowH+Math.round((rowH-swH)/2),statsOn,false,s),'toggle-stats',true);

    // Card 4: 软件更新
    var c4=drawCard('软件更新',card4H);
    var checkW=Math.round(92*s),instW=available?Math.round(104*s):0,btnsW=checkW+(instW?instW+Math.round(8*s):0);
    drawRowText(c4,updTitle,updSub,btnsW);
    var by4=c4+Math.round((rowH-btnH)/2);
    if(instW){
      pushHit(ssDrawSettingsActionBtn(g,x+w-pad-instW,by4,instW,btnH,busy?'正在更新…':'更新并重启',true,busy||checking,s),'update-install',!busy&&!checking);
      pushHit(ssDrawSettingsActionBtn(g,x+w-pad-instW-Math.round(8*s)-checkW,by4,checkW,btnH,'立即检查',false,busy||checking,s),'update-check',!busy&&!checking);
    }else{
      pushHit(ssDrawSettingsActionBtn(g,x+w-pad-checkW,by4,checkW,btnH,checking?'检查中…':'立即检查',false,busy||checking,s),'update-check',!busy&&!checking);
    }
    var autoY=c4+rowH;
    if(phase==='downloading'){
      var barY=c4+rowH+Math.round(4*s),barH=Math.round(6*s),barW=w-pad*2;
      ssFillContinuousRect(g,x+pad,barY,barW,barH,barH/2,barH/2,COL.seekbg);
      ssFillContinuousRect(g,x+pad,barY,Math.max(barH,Math.round(barW*frac)),barH,barH/2,barH/2,COL.green);
      autoY+=Math.round(20*s);
    }
    drawDivider(autoY);
    drawRowText(autoY,'启动时自动检查 GitHub 更新','仅后台读取公开发布信息，不阻塞播放',swW);
    pushHit(ssDrawToggleSwitch(g,x+w-pad-swW,autoY+Math.round((rowH-swH)/2),autoUpdate,false,s),'toggle-auto-update',true);

    // Card 5: 高级与原版 foobar2000
    var c5=drawCard('高级与原版 foobar2000',card5H);
    var advW=Math.round(142*s);
    drawRowText(c5,'音乐库监控目录','添加或管理 foobar2000 扫描的本地音乐文件夹',advW);
    pushHit(ssDrawSettingsActionBtn(g,x+w-pad-advW,c5+Math.round((rowH-btnH)/2),advW,btnH,'配置音乐库目录…',false,false,s),'library-configure',true);
    drawDivider(c5+rowH);
    drawRowText(c5+rowH,'foobar2000 原生参数选项','管理组件、DSP、快捷键、格式转换器与一键切回原版界面',advW);
    pushHit(ssDrawSettingsActionBtn(g,x+w-pad-advW,c5+rowH+Math.round((rowH-btnH)/2),advW,btnH,'打开原生参数选项…',false,false,s),'native-settings',true);
  }finally{layer.finish();}
  drawScrollbar(gr,r.x+r.w-10,top,viewH,ssSettingsScroll,SS_SETTINGS_MAX,viewH,contentH,[r.x,top,r.x+r.w,bottom]);
}
function ssSettingsClick(x,y){
  if(view!=='settings')return false;
  var b=hit(HB_SETTINGS,x,y);
  if(!b)return false;
  var st=typeof ssState!=='undefined'&&ssState?ssState:{};
  if(b.act==='appearance-light')ssSend('theme_appearance',{appearance:'light'});
  else if(b.act==='appearance-dark')ssSend('theme_appearance',{appearance:'dark'});
  else if(b.act==='toggle-reduced-motion'){
    if(typeof ssReducedMotion!=='undefined'){ssReducedMotion=!ssReducedMotion;try{window.SetProperty('SmartShuffle: reduce motion',ssReducedMotion);}catch(e){}}
    if(typeof ssFadeStart!=='undefined')ssFadeStart=0;
  }
  else if(b.act==='wheel-step'){
    WHEEL_PX=b.val;
    try{window.SetProperty('Scrolling: wheel step (px)',WHEEL_PX);}catch(e){}
  }
  else if(b.act==='vol-ceil'){
    VOL_CEIL=b.val;
    try{window.SetProperty('Playback: output ceiling (dB below max)',VOL_CEIL);}catch(e){}
  }
  else if(b.act==='output-picker'){
    if(typeof ssShowOutputs==='function'){ssShowOutputs(b.x0,b.y1,b);return true;}
  }
  else if(b.act==='playback-mode'){
    if(b.val==='smart')ssSend('playback_mode',{mode:'smart'});
    else ssSend('playback_mode',{mode:'native',order:Number(b.val)||0});
  }
  else if(b.act==='open-preference'){
    if(typeof ssOpen==='function'){ssOpen();return true;}
  }
  else if(b.act==='reset-layout')ssSend('reset_layout');
  else if(b.act==='toggle-personal')ssSend('personal_config',{enabled:!(st.personal&&st.personal.enabled)});
  else if(b.act==='toggle-stats'){var cur=st.listening_stats!==undefined?!!st.listening_stats:!(st.personal&&st.personal.history_enabled===false);ssSend('listening_stats_config',{enabled:!cur});}
  else if(b.act==='update-check')ssSend('update_check');
  else if(b.act==='update-install')ssSend('update_install');
  else if(b.act==='toggle-auto-update')ssSend('update_config',{automatic:!(st.update&&st.update.automatic!==false)});
  else if(b.act==='library-configure'){try{fb.RunMainMenuCommand('Library/Configure');}catch(e){ssSend('settings');}}
  else if(b.act==='native-settings')ssSend('settings');
  repaintAll();
  return true;
}
