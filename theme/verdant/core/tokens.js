/* verdant/core/tokens.js -- design tokens: colours, metrics, fonts, glyphs, text + icon drawing
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- colour helpers ------------------------- */
function RGB(r,g,b){ return (0xff000000|(r<<16)|(g<<8)|b); }
function RGBA(r,g,b,a){ return ((a<<24)|(r<<16)|(g<<8)|b); }

/* ------------------------- tokens -------------------------
   The two knobs worth touching are UISCALE (a panel property now -- see core/props.js) and
   M.navW / M.queueW (sidebar and queue-pane widths). Everything else is derived layout. */
var SS_APPEARANCE='light';try{if(window.GetProperty('SmartShuffle: appearance','light')==='dark')SS_APPEARANCE='dark';}catch(e){}
function ssAlpha(c,a){return ((a<<24)|(c&0xffffff));}
function ssInk(a){return ssAlpha(COL.text,a);}
function ssAccent(a){return ssAlpha(COL.green,a);}
/* Historical green names remain aliases for the single record-room accent. */
function ssPalette(mode){
  if(mode==='light')return {
    black:RGB(244,245,247),base:RGB(255,255,255),elev:RGB(246,247,249),hover:RGB(235,236,240),
    text:RGB(62,62,62),text2:RGB(102,102,102),text3:RGB(110,110,110),
    green:RGB(10,110,240),greenC:RGB(10,110,240),greenHover:RGB(0,92,214),
    rowHover:RGBA(16,17,19,10),rowActive:RGBA(10,110,240,18),line:RGB(228,230,234),seekbg:RGB(219,222,227),
    splitter:RGB(210,212,218),gridLine:RGBA(16,17,19,40),gridAxis:RGBA(16,17,19,80),
    popup:RGB(255,255,255),popupAlt:RGB(249,250,252),submenuLine:RGB(212,216,224),button:RGB(238,239,243),buttonHover:RGB(228,230,235),
    input:RGB(242,243,246),banner:RGB(246,247,250),cardHover:RGB(242,243,246),skeleton:RGB(236,237,241),
    pill:RGB(240,241,245),accentMuted:RGB(214,228,252),onAccent:RGB(255,255,255),onDanger:RGB(255,255,255),
    danger:RGB(215,38,61),dangerHover:RGB(180,28,48),error:RGB(200,40,60),
    shadow:RGBA(10,12,16,18),scrim:RGBA(10,12,16,54),modalScrim:RGBA(10,12,16,72),
    play:RGB(10,110,240),onPlay:RGB(255,255,255)
  };
  return {
    black:RGB(15,16,18),base:RGB(22,23,26),elev:RGB(30,31,35),hover:RGB(40,42,47),
    text:RGB(226,226,226),text2:RGB(175,175,175),text3:RGB(143,143,143),
    green:RGB(64,156,255),greenC:RGB(64,156,255),greenHover:RGB(100,180,255),
    rowHover:RGBA(255,255,255,14),rowActive:RGBA(64,156,255,26),
    line:RGB(48,50,55),splitter:RGB(48,50,55),gridLine:RGBA(255,255,255,26),gridAxis:RGBA(255,255,255,64),seekbg:RGB(62,65,72),
    popup:RGB(30,31,35),popupAlt:RGB(36,38,43),submenuLine:RGB(76,79,87),button:RGB(44,46,52),buttonHover:RGB(54,57,64),
    input:RGB(38,40,45),banner:RGB(32,34,39),cardHover:RGB(38,40,45),skeleton:RGB(36,38,43),
    pill:RGB(36,38,43),accentMuted:RGB(40,60,90),onAccent:RGB(8,10,14),onDanger:RGB(255,255,255),
    danger:RGB(255,69,58),dangerHover:RGB(255,95,84),error:RGB(255,120,110),
    shadow:RGBA(0,0,0,110),scrim:RGBA(0,0,0,150),modalScrim:RGBA(0,0,0,185),
    play:RGB(64,156,255),onPlay:RGB(255,255,255)
  };
}
var COL=ssPalette(SS_APPEARANCE);
var M = { pad:8, gap:10, navW:240, queueW:300, barH:96, navTopH:58, rowH:50, cardTextH:52, radius:6, cpad:24, headH:280, artSz:200 };
var PALETTE=[RGB(105,75,68),RGB(108,95,78),RGB(130,74,85),RGB(81,91,101),RGB(133,108,76),RGB(102,105,87),RGB(119,93,100),RGB(95,107,111),RGB(115,87,66),RGB(94,86,91)];

/* ------------------------- fonts (create once) -------------------------
   Every font is built here at load time from UISCALE, which core/props.js has already resolved
   from the panel property (or the display DPI). That is why props.js loads first, and why a
   scale change needs a panel reload rather than just a repaint.
   Titles, controls and metadata are distinguished by size and colour. */
var ssDensity=1;
var SS_FONT_META=[],SS_FIT_FONTS=[],SS_SCRIPT_FONTS={};
var SS_MIN_TEXT_SIZE=12;
function ssFontFloor(name){return name==='Segoe MDL2 Assets'?1:SS_MIN_TEXT_SIZE;}
function ssCreateFont(name,sz){
  var size=Math.max(ssFontFloor(name),Math.round(sz*UISCALE)),font=gdi.Font(name,size,0);
  SS_FONT_META.push({font:font,name:name,size:size,style:0});
  return font;
}
function ssUIFont(sz){return ssCreateFont('Segoe UI',sz);}
function ssCreateFonts(){return {
  // Page titles, sections and artwork captions.
  title:ssUIFont(28), sect2:ssUIFont(20), sect:ssUIFont(15),
  card:ssUIFont(14), meta:ssUIFont(13), eyebrow:ssUIFont(11),
  // Navigation, menus and search input.
  searchTxt:ssUIFont(16), tab:ssUIFont(16), lib:ssUIFont(15),
  pl:ssUIFont(13), plSub:ssUIFont(11), menuPrimary:ssUIFont(13), menu:ssUIFont(12),
  titleMenu:ssCreateFont('Segoe UI',14),
  // Track lists, lyrics and now playing.
  rowTitle:ssUIFont(14), rowArtist:ssUIFont(12), rowNum:ssUIFont(13), rowCell:ssUIFont(13),
  head:ssUIFont(12), qName:ssUIFont(13), qArtist:ssUIFont(11), lyric:ssUIFont(16),
  npTitle:ssUIFont(15), npArtist:ssUIFont(12), time:ssUIFont(12),
  // Fullscreen text.
  fsTitle:ssCreateFont('Segoe UI',26), fsArtist:ssCreateFont('Segoe UI',18),
  fsSrc:ssCreateFont('Segoe UI',13), fsSrcName:ssCreateFont('Segoe UI',13), fsLyric:ssCreateFont('Segoe UI',28),
  // Fallback symbols.
  icon:ssCreateFont('Segoe MDL2 Assets',15), iconBtn:ssCreateFont('Segoe MDL2 Assets',18),
  navIco:ssCreateFont('Segoe MDL2 Assets',24)
};}
var FONT=ssCreateFonts();
function chr(c){ return String.fromCharCode(c); }
// MDL2 fallbacks for legacy icons when gdi.LoadSVG is unavailable.
var GLYPH = {
  play:chr(0xE768), pause:chr(0xE769), prev:chr(0xE892), next:chr(0xE893),
  volume:chr(0xE767),
  search:chr(0xE721), home:chr(0xE80F), add:chr(0xE710), more:chr(0xE712), close:chr(0xE711), clock:chr(0xE823),
};
var CH_DOT=chr(0xB7), CH_BULL=chr(0x2022);

/* ------------------------- DrawText flags ------------------------- */
var DT_L = 0x4|0x20|0x800|0x8000;        // left + vcenter + singleline + noprefix + end-ellipsis
var DT_R = 0x2|0x4|0x20|0x800;           // right + vcenter + singleline + noprefix
var DT_C = 0x1|0x4|0x20|0x800;           // center + vcenter + singleline + noprefix
// Labels own their supplied rectangles. Fit their height down to the readable floor.
var LH_F=[], LH_V=[];
function lineH(gr,f){
  for(var i=0;i<LH_F.length;i++) if(LH_F[i]===f) return LH_V[i];
  var n=0; try{ n=Math.ceil(gr.CalcTextHeight('国Agあ',f)); }catch(e){ n=0; }
  if(LH_F.length>=512){LH_F=[];LH_V=[];}
  LH_F.push(f); LH_V.push(n); return n;
}
var fitY=0, fitH=0;
function fitV(gr,f,y,h){fitY=y;fitH=h;}
function ssFitFont(gr,font,height,text,width){
  var limit=Math.max(1,Math.floor(height)),fitWidth=width!==undefined,floor=ssFontFloor(font.Name);
  if((font.Size||floor)>=floor&&lineH(gr,font)<=limit&&(!fitWidth||gr.CalcTextWidth(text,font)<=width))return font;
  var key=fitWidth?String(text)+'|'+Math.floor(width):'';
  for(var i=0;i<SS_FIT_FONTS.length;i++){var c=SS_FIT_FONTS[i];if(c.base===font&&c.height===limit&&c.key===key)return c.font;}
  var meta=null;for(i=0;i<SS_FONT_META.length;i++)if(SS_FONT_META[i].font===font){meta=SS_FONT_META[i];break;}
  if(!meta)meta={name:font.Name||'Segoe UI',size:font.Size||14,style:font.Style||0};
  var ratio=Math.min(1,limit/Math.max(1,lineH(gr,font)));if(fitWidth)ratio=Math.min(ratio,width/Math.max(1,gr.CalcTextWidth(text,font)));
  var size=Math.max(floor,Math.floor(meta.size*ratio)),f;
  do{f=gdi.Font(meta.name,size,meta.style);if(lineH(gr,f)<=limit&&(!fitWidth||gr.CalcTextWidth(text,f)<=width))break;}while(--size>=floor);
  if(SS_FIT_FONTS.length>=192)SS_FIT_FONTS=[];SS_FIT_FONTS.push({base:font,height:limit,key:key,font:f});return f;
}
var SS_CJK=/[⺀-鿿぀-ヿ가-퟿豈-﫿＀-￯\u{20000}-\u{323af}]/u;
var SS_WESTERN=/[A-Za-z0-9À-ʯ]/;
var SS_BIDI=/[֐-ࣿ‎‏‪-‮⁦-⁩יִ-﷿ﹰ-﻿\u{10800}-\u{10fff}\u{1e800}-\u{1eeff}]/u;
var SS_FONT_MARK=/[̀-゙ͯ-゚︀-️\u{e0100}-\u{e01ef}]/u;
var SS_RUN_FORMAT=0x1800; // NoWrap and MeasureTrailingSpaces
var SS_GRAPHEMES=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'?new Intl.Segmenter():null;
function ssCjkFont(font){
  var meta=null;for(var i=0;i<SS_FONT_META.length;i++)if(SS_FONT_META[i].font===font){meta=SS_FONT_META[i];break;}
  if(!meta||(meta.name!=='Inter'&&meta.name!=='Segoe UI'))return font;
  var size=meta.size;
  // YaHei UI covers both Chinese and kana at the same regular weight.
  if(!SS_SCRIPT_FONTS[size]){
    var face=gdi.Font('Microsoft YaHei UI',size,0);
    SS_FONT_META.push({font:face,name:'Microsoft YaHei UI',size:size,style:0});
    SS_SCRIPT_FONTS[size]=face;
  }
  return SS_SCRIPT_FONTS[size];
}
function ssScriptFont(text,font){return SS_CJK.test(text)?ssCjkFont(font):font;}
function ssTextClusters(text){
  if(SS_GRAPHEMES)return Array.from(SS_GRAPHEMES.segment(text),function(part){return part.segment;});
  var clusters=[];
  for(var ch of text){
    var last=clusters.length-1;
    if(last>=0&&(SS_FONT_MARK.test(ch)||ch==='‍'||clusters[last].endsWith('‍')))clusters[last]+=ch;
    else clusters.push(ch);
  }
  return clusters;
}
function ssTextRuns(text,font){
  if(!SS_CJK.test(text)||SS_BIDI.test(text))return [{text:text,font:font}];
  var cjk=ssCjkFont(font);
  if(!SS_WESTERN.test(text)||cjk===font)return [{text:text,font:cjk}];
  var runs=[],part='',face=null;
  for(var ch of text){
    var next=SS_CJK.test(ch)?cjk:SS_WESTERN.test(ch)?font:face||font;
    if(face&&next!==face){runs.push({text:part,font:face});part='';}
    part+=ch;face=next;
  }
  runs.push({text:part,font:face||font});
  return runs;
}
function ssFontLineHeight(font){
  var cjk=ssCjkFont(font);
  return Math.ceil(Math.max(font.Height||font.Size*1.3||0,cjk.Height||cjk.Size*1.3||0));
}
var SS_TRACK_LINE_HEIGHTS=null;
function ssTrackTextMetrics(s,compact){
  var lines=SS_TRACK_LINE_HEIGHTS;
  if(!lines||lines.fonts!==FONT)lines=SS_TRACK_LINE_HEIGHTS={fonts:FONT,title:ssFontLineHeight(FONT.rowTitle)+1,detail:ssFontLineHeight(FONT.rowArtist)+1};
  var title=Math.max(Math.round((compact?20:22)*s),lines.title);
  var detail=Math.max(Math.round((compact?16:18)*s),lines.detail);
  return {title:title,detail:detail,height:title+detail+Math.round((compact?5:8)*s)};
}
M.rowH=Math.max(M.rowH,ssTrackTextMetrics(1,false).height);
function ssRunWidth(gr,text,font){
  if(!text)return 0;
  var measure=typeof gr.MeasureString==='function'&&gr.MeasureString(text,font,0,0,Math.max(4096,text.length*(font.Size||32)*2),1024,SS_RUN_FORMAT);
  return measure&&measure.Width>0?measure.Width:gr.CalcTextWidth(text,font,true);
}
function ssMeasuredRuns(gr,text,font,h,fixed){
  var runs=ssTextRuns(String(text),font);
  for(var run of runs){
    if(h!==undefined&&!fixed)run.font=ssFitFont(gr,run.font,h);
    run.width=ssRunWidth(gr,run.text,run.font);
  }
  return runs;
}
function ssMeasureText(gr,text,font,h){
  var width=0;
  for(var run of ssMeasuredRuns(gr,text,font,h,false))width+=run.width;
  return width;
}
var ssTextRenderingHint=3; // GDI+ AntiAliasGridFit gives text grayscale edges on both panels and cached bitmaps.
var ssPaneTextFade=false,ssPaneLabelWidths=new Map(),ssPaneLabelImages=new Map();
function ssDrawPaneLabels(gr,draw){
  var old=ssPaneTextFade;ssPaneTextFade=true;
  try{draw(gr);}finally{ssPaneTextFade=old;}
}
function ssDrawOverflowLabel(gr,s,font,col,x,y,w,h,fixed){
  var textKey=JSON.stringify([s,font.Name,font.Size,font.Style||0,h,!!fixed]);
  var measured=ssPaneLabelWidths.get(textKey);
  if(measured===undefined){
    measured=ssMeasuredRuns(gr,s,font,h,fixed).reduce(function(sum,run){return sum+run.width;},0);
    if(ssPaneLabelWidths.size>=768)ssPaneLabelWidths.delete(ssPaneLabelWidths.keys().next().value);
    ssPaneLabelWidths.set(textKey,measured);
  }
  if(measured<=w)return false;
  x=Math.round(x);y=Math.round(y);w=Math.max(1,Math.floor(w));h=Math.max(1,Math.round(h));
  var textW=Math.min(Math.ceil(measured)+3,Math.max(4096,w+3));
  var imageKey=textKey+'|'+col+'|'+textW,image=ssPaneLabelImages.get(imageKey);
  if(!image){
    if(ssPaneLabelImages.size>=80){
      var oldest=ssPaneLabelImages.keys().next().value,previous=ssPaneLabelImages.get(oldest);
      if(typeof previous.Dispose==='function')previous.Dispose();
      ssPaneLabelImages.delete(oldest);
    }
    image=gdi.CreateImage(textW,h);var raster=image.GetGraphics();
    try{ssText(raster,s,font,col,0,0,textW,h,0,false,fixed);}finally{image.ReleaseGraphics(raster);}
    ssPaneLabelImages.set(imageKey,image);
  }
  // Copy at 1:1; only the last few source columns lose opacity.
  var fade=Math.max(1,Math.min(Math.floor(w/2),Math.round(26*Math.max(1,UISCALE)))),body=w-fade;
  if(body>0)gr.DrawImage(image,x,y,body,h,0,0,body,h);
  for(var step=0;step<fade;step+=2){
    var span=Math.min(2,fade-step),opacity=(fade-step-span)/fade;
    var alpha=Math.round(255*opacity*opacity*(3-2*opacity));
    if(alpha>0)gr.DrawImage(image,x+body+step,y,span,h,body+step,0,span,h,0,alpha);
  }
  return true;
}
function ssText(gr,s,f,c,x,y,w,h,align,ellipsis,fixed){
  if(w<=0||h<=0)return;
  s=String(s);
  if(ssPaneTextFade&&ellipsis){
    if(ssDrawOverflowLabel(gr,s,f,c,x,y,w,h,fixed))return;
    ellipsis=false;
  }
  gr.SetTextRenderingHint(ssTextRenderingHint);
  var runs=ssTextRuns(s,f);
  if(runs.length===1){
    var font=fixed?runs[0].font:ssFitFont(gr,runs[0].font,h);
    gr.DrawString(s,font,c,Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),
      (align<<28)|(1<<24)|((ellipsis?3:0)<<20)|0x1000);
    return;
  }
  var width=0;
  for(var run of runs){
    if(!fixed)run.font=ssFitFont(gr,run.font,h);
    run.width=ssRunWidth(gr,run.text,run.font);width+=run.width;
  }
  if(width>w&&ellipsis){
    var suffix='…',suffixFont=fixed?f:ssFitFont(gr,f,h),suffixW=ssRunWidth(gr,suffix,suffixFont);
    var budget=Math.max(0,w-suffixW),visible=[];
    width=0;
    for(var run of runs){
      if(width+run.width<=budget){visible.push(run);width+=run.width;continue;}
      var chars=ssTextClusters(run.text),lo=0,hi=chars.length;
      while(lo<hi){
        var mid=(lo+hi+1)>>1;
        if(width+ssRunWidth(gr,chars.slice(0,mid).join(''),run.font)<=budget)lo=mid;else hi=mid-1;
      }
      var prefix=chars.slice(0,lo).join('').trimEnd(),prefixW=ssRunWidth(gr,prefix,run.font);
      if(prefix){visible.push({text:prefix,font:run.font,width:prefixW});width+=prefixW;}
      break;
    }
    if(suffixW<=w){visible.push({text:suffix,font:suffixFont,width:suffixW});width+=suffixW;}
    runs=visible;
  }
  var offset=align===0?0:Math.max(0,(w-width)/(align===1?2:1));
  for(var run of runs){
    var span=Math.min(w-offset,Math.ceil(run.width)+2);
    if(span<=0)break;
    gr.DrawString(run.text,run.font,c,Math.round(x+offset),Math.round(y),Math.max(1,Math.round(span)),Math.max(1,Math.round(h)),(1<<24)|SS_RUN_FORMAT);
    offset+=run.width;
  }
}
function tL(gr,s,f,c,x,y,w,h,fixed){ssText(gr,s,f,c,x,y,w,h,0,true,fixed);}
function tR(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,2,false);}
function tC(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,1,false);}
function tCE(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,1,true);}
function ssDrawFixedLabel(gr,s,f,c,x,y,w,h){tL(gr,s,f,c,x,y,w,h,true);}

/* ------------------------- vector icons (SVG rasterized via gdi.LoadSVG, tinted + cached) ------------------------- */
var ICONS={
 play:"<path d='M8 5v14l11-7z'/>",
 pause:"<rect x='6' y='5' width='4' height='14' rx='1.3'/><rect x='14' y='5' width='4' height='14' rx='1.3'/>",
 prev:"<path d='M6 6h2.2v12H6zm3 6l9 6V6z'/>",
 next:"<path d='M15.8 6H18v12h-2.2zM6 18l9-6-9-6z'/>",
 order:"<path d='M5 6h14v2H5zm0 5h14v2H5zm0 5h14v2H5z'/>",
 volume:"<path d='M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'/>",
 home:"<path d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/>",
 search:"<path d='M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14z'/>",
 add:"<path d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/>",
 more:"<path d='M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'/>",
 close:"<path d='M6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z'/>",
 clock:"<path d='M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2zM12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'/>",
 expand:"<path d='M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z'/>",
 compress:"<path d='M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z'/>",
 mic:"<path d='M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z'/>",
 lyric:"<path d='M4 4h16v12h-7l-5 4v-4H4z'/>",
 queue:"<path d='M3 6h11v2H3zm0 4h11v2H3zm0 4h7v2H3zm12-1 6 3.5-6 3.5z'/>",
 equalizer:"<path d='M10 20h4V4h-4zm-6 0h4v-8H4zm12-11v11h4V9z'/>",
 chevron:"<path d='M7 10l5 5 5-5z'/>",
 sortAsc:"<path d='M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z'/>",
 sortDesc:"<path d='M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.59-5.58L4 12l8 8 8-8z'/>"
};
var svgCache={},ssIconSources={};
var SS_SVG_FILES={heart:'heart',heartFilled:'heart',bookmark:'bookmark',bookmarkFilled:'bookmark',
  settings:'settings',refresh:'refresh-cw',headphones:'headphones',folderOpen:'folder-open',tag:'tag',
  tools:'wrench',sun:'sun',moon:'moon',windowClose:'x',windowMinimize:'minus',
  windowMaximize:'maximize-2',windowRestore:'minimize-2',
  shuffle:'shuffle',check:'check',sequence:'list-ordered',repeat:'repeat',repeat1:'repeat-1'};
function ssAssetSvg(name,color){
  var file=SS_SVG_FILES[name];
  if(!ssIconSources.hasOwnProperty(file)){
    try{ssIconSources[file]=utils.ReadTextFile(fb.ProfilePath+'verdant\\assets\\icons\\'+file+'.svg',65001);}
    catch(e){ssIconSources[file]='';}
  }
  var xml=ssIconSources[file].replace(/currentColor/g,color);
  return name==='heartFilled'||name==='bookmarkFilled'?xml.replace('fill="none"','fill="'+color+'"'):xml;
}
// keyed on the numeric colour (alpha stripped -- drawIcon applies that at blit time), so a hit
// costs one concat instead of unpacking the channels into a string on every icon of every frame
function iconImg(name,size,col){
  var key=name+'|'+size+'|'+(col&0xffffff);
  if(svgCache.hasOwnProperty(key)) return svgCache[key];
  var color='#'+(col&0xffffff).toString(16).padStart(6,'0');
  var xml=SS_SVG_FILES.hasOwnProperty(name)?ssAssetSvg(name,color):
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='"+size+"' height='"+size+"'><g fill='"+color+"'>"+ICONS[name]+"</g></svg>";
  var bmp=null; try{ if(xml)bmp=gdi.LoadSVG(xml,size); }catch(e){ bmp=null; }
  svgCache[key]=bmp; return bmp;
}
// draw a crisp size-px vector icon centred in [x,y,w,h]; falls back to the MDL2 glyph if LoadSVG is unavailable
function drawIcon(gr,name,col,x,y,w,h,size){
  var s=Math.max(1,Math.round(size||Math.min(w,h))), img=iconImg(name,s,col);
  if(img){ var a=(col>>>24)&0xff; if(!a) a=255; gr.DrawImage(img,Math.round(x+(w-s)/2),Math.round(y+(h-s)/2),s,s,0,0,img.Width,img.Height,0,a); return; }
  if(!SS_SVG_FILES.hasOwnProperty(name))tC(gr,GLYPH[name]||'?',(s>=26?FONT.navIco:(s>=18?FONT.iconBtn:FONT.icon)),col,x,y,w,h);
}
