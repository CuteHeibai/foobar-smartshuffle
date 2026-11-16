/* verdant/core/tokens.js -- design tokens: colours, metrics, fonts, glyphs, text + icon drawing
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- colour helpers ------------------------- */
function RGB(r,g,b){ return (0xff000000|(r<<16)|(g<<8)|b); }
function RGBA(r,g,b,a){ return ((a<<24)|(r<<16)|(g<<8)|b); }

/* ------------------------- tokens -------------------------
   The two knobs worth touching are UISCALE (a panel property now -- see core/props.js) and
   M.navW / M.queueW (sidebar and queue-pane widths). Everything else is derived layout. */
var SS_APPEARANCE='dark';try{if(window.GetProperty('SmartShuffle: appearance','dark')==='light')SS_APPEARANCE='light';}catch(e){}
function ssAlpha(c,a){return ((a<<24)|(c&0xffffff));}
function ssInk(a){return ssAlpha(COL.text,a);}
function ssAccent(a){return ssAlpha(COL.green,a);}
/* Historical green names remain aliases for the single record-room accent. */
function ssPalette(mode){
  if(mode==='light')return {
    black:RGB(232,229,223),base:RGB(250,248,244),elev:RGB(242,239,233),hover:RGB(232,227,220),
    text:RGB(43,41,39),text2:RGB(91,85,80),text3:RGB(112,104,97),
    green:RGB(132,48,66),greenC:RGB(132,48,66),greenHover:RGB(109,35,52),
    rowHover:RGBA(67,52,43,12),rowActive:RGBA(132,48,66,23),line:RGB(198,190,180),seekbg:RGB(207,199,190),
    splitter:RGB(198,190,180),gridLine:RGBA(91,75,66,55),gridAxis:RGBA(91,75,66,105),
    popup:RGB(250,248,244),popupAlt:RGB(245,242,237),button:RGB(235,230,223),buttonHover:RGB(224,216,206),
    input:RGB(239,235,229),banner:RGB(242,237,230),cardHover:RGB(235,229,221),skeleton:RGB(228,222,214),
    pill:RGB(237,232,226),accentMuted:RGB(230,209,210),onAccent:RGB(255,251,246),onDanger:RGB(255,255,255),
    danger:RGB(171,43,39),dangerHover:RGB(147,32,31),error:RGB(167,43,39),
    shadow:RGBA(49,37,29,24),scrim:RGBA(49,37,29,62),modalScrim:RGBA(49,37,29,80),
    play:RGB(132,48,66),onPlay:RGB(255,251,246)
  };
  return {
    black:RGB(24,23,22),base:RGB(32,30,29),elev:RGB(40,37,35),hover:RGB(55,49,46),
    text:RGB(245,239,231),text2:RGB(193,183,172),text3:RGB(158,147,137),
    green:RGB(224,151,162),greenC:RGB(224,151,162),greenHover:RGB(239,174,183),
    rowHover:RGBA(245,239,231,15),rowActive:RGBA(224,151,162,28),
    line:RGB(74,66,60),splitter:RGB(74,66,60),gridLine:RGBA(227,213,199,30),gridAxis:RGBA(227,213,199,70),seekbg:RGB(90,79,71),
    popup:RGB(43,39,36),popupAlt:RGB(49,44,40),button:RGB(57,50,45),buttonHover:RGB(71,61,54),
    input:RGB(50,44,40),banner:RGB(43,38,34),cardHover:RGB(49,43,39),skeleton:RGB(46,40,36),
    pill:RGB(45,39,35),accentMuted:RGB(88,57,62),onAccent:RGB(36,25,27),onDanger:RGB(255,255,255),
    danger:RGB(190,65,57),dangerHover:RGB(209,78,69),error:RGB(242,158,141),
    shadow:RGBA(0,0,0,100),scrim:RGBA(0,0,0,145),modalScrim:RGBA(0,0,0,180),
    play:RGB(224,151,162),onPlay:RGB(36,25,27)
  };
}
var COL=ssPalette(SS_APPEARANCE);
var M = { pad:8, gap:10, navW:210, queueW:300, barH:96, navTopH:84, rowH:50, cardTextH:52, radius:6, cpad:24, headH:280, artSz:200 };
var PALETTE=[RGB(105,75,68),RGB(108,95,78),RGB(130,74,85),RGB(81,91,101),RGB(133,108,76),RGB(102,105,87),RGB(119,93,100),RGB(95,107,111),RGB(115,87,66),RGB(94,86,91)];

/* ------------------------- fonts (create once) -------------------------
   Every font is built here at load time from UISCALE, which core/props.js has already resolved
   from the panel property (or the display DPI). That is why props.js loads first, and why a
   scale change needs a panel reload rather than just a repaint.
   Regular text uses Inter; headings use its medium weight. */
var SS_BASE_UI_SCALE=UISCALE,ssDensity=1;
var SS_FONT_META=[],SS_FIT_FONTS=[],SS_SCRIPT_FONTS={};
function gf(name,sz,style){var size=Math.max(1,Math.round(sz*UISCALE)),font=gdi.Font(name,size,style||0);SS_FONT_META.push({font:font,name:name,size:size,style:style||0});return font;}
function F(sz,bold){ return gf(bold?'Inter Medium':'Inter', sz, 0); }
function ssCreateFonts(){return {
  lib:F(15,1), pl:F(13,1), plSub:F(11,0),
  eyebrow:F(11,1), title:F(28,1), meta:F(13,0),
  rowTitle:F(14,0), rowArtist:F(12,0), rowNum:F(13,0), rowCell:F(13,0), head:F(12,1),
  tab:F(16,1), sect:F(15,1), qName:F(13,0), qArtist:F(11,0),
  npTitle:F(15,0), npArtist:F(12,0), time:F(12,0),
  icon:gf('Segoe MDL2 Assets',15), iconBtn:gf('Segoe MDL2 Assets',18),
  navIco:gf('Segoe MDL2 Assets',24), cap:gf('Segoe MDL2 Assets',10),
  menu:F(12), card:F(14,1), sect2:F(20,1),
  searchTxt:F(16),
  lyric:F(18,1), fsLyric:F(30,1),
  fsSrc:F(13),
  fsSrcName:F(13,1)   // bold: the playlist name, vs. the plain-weight fixed caption
};}
var FONT=ssCreateFonts();
function chr(c){ return String.fromCharCode(c); }
// MDL2 fallbacks for drawIcon when gdi.LoadSVG is unavailable (keys mirror ICONS), plus caption buttons
var GLYPH = {
  play:chr(0xE768), pause:chr(0xE769), prev:chr(0xE892), next:chr(0xE893),
  shuffle:chr(0xE8B1), repeat:chr(0xE8EE), repeat1:chr(0xE8ED), volume:chr(0xE767),
  search:chr(0xE721), home:chr(0xE80F), add:chr(0xE710), more:chr(0xE712), clock:chr(0xE823),
  heart:chr(0xEB51),heartFilled:chr(0xEB52),
  cmin:chr(0xE921), cmax:chr(0xE922), crestore:chr(0xE923), cclose:chr(0xE8BB)
};
var CH_DOT=chr(0xB7), CH_BULL=chr(0x2022);

/* ------------------------- DrawText flags ------------------------- */
var DT_L = 0x4|0x20|0x800|0x8000;        // left + vcenter + singleline + noprefix + end-ellipsis
var DT_R = 0x2|0x4|0x20|0x800;           // right + vcenter + singleline + noprefix
var DT_C = 0x1|0x4|0x20|0x800;           // center + vcenter + singleline + noprefix
/* A label owns exactly its supplied rectangle. Shrink its font when necessary;
   never enlarge the rectangle into the next label or neighbouring panel. */
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
  var limit=Math.max(1,Math.floor(height)),fitWidth=width!==undefined;
  if(lineH(gr,font)<=limit&&(!fitWidth||gr.CalcTextWidth(text,font)<=width))return font;
  var key=fitWidth?String(text)+'|'+Math.floor(width):'';
  for(var i=0;i<SS_FIT_FONTS.length;i++){var c=SS_FIT_FONTS[i];if(c.base===font&&c.height===limit&&c.key===key)return c.font;}
  var meta=null;for(i=0;i<SS_FONT_META.length;i++)if(SS_FONT_META[i].font===font){meta=SS_FONT_META[i];break;}
  if(!meta)meta={name:font.Name||'Inter',size:font.Size||14,style:font.Style||0};
  var ratio=Math.min(1,limit/Math.max(1,lineH(gr,font)));if(fitWidth)ratio=Math.min(ratio,width/Math.max(1,gr.CalcTextWidth(text,font)));
  var size=Math.max(1,Math.floor(meta.size*ratio)),f;
  do{f=gdi.Font(meta.name,size,meta.style);if(lineH(gr,f)<=limit&&(!fitWidth||gr.CalcTextWidth(text,f)<=width))break;}while(--size>0);
  if(SS_FIT_FONTS.length>=192)SS_FIT_FONTS=[];SS_FIT_FONTS.push({base:font,height:limit,key:key,font:f});return f;
}
function ssScriptFont(text,font){
  var name=/[\u3040-\u30ff]/.test(text)?'Yu Gothic UI':/[\u2e80-\u9fff\uff00-\uffef]/.test(text)?'Microsoft YaHei UI':null;if(!name)return font;
  var meta=null;for(var i=0;i<SS_FONT_META.length;i++)if(SS_FONT_META[i].font===font){meta=SS_FONT_META[i];break;}
  if(!meta||meta.name===name)return font;var key=name+'|'+meta.size+'|'+meta.style;if(!SS_SCRIPT_FONTS[key]){var f=gdi.Font(name,meta.size,meta.style);SS_FONT_META.push({font:f,name:name,size:meta.size,style:meta.style});SS_SCRIPT_FONTS[key]=f;}return SS_SCRIPT_FONTS[key];
}
function ssText(gr,s,f,c,x,y,w,h,align,ellipsis){
  if(w<=0||h<=0)return;s=String(s);gr.SetTextRenderingHint(5);f=ssFitFont(gr,ssScriptFont(s,f),h);
  gr.DrawString(String(s),f,c,Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),
    (align<<28)|(1<<24)|((ellipsis?3:0)<<20)|0x1000);
}
function tL(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,0,true);}
function tR(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,2,false);}
function tC(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,1,false);}
function tCE(gr,s,f,c,x,y,w,h){ssText(gr,s,f,c,x,y,w,h,1,true);}

/* ------------------------- vector icons (SVG rasterized via gdi.LoadSVG, tinted + cached) ------------------------- */
var ICONS={
 play:"<path d='M8 5v14l11-7z'/>",
 pause:"<rect x='6' y='5' width='4' height='14' rx='1.3'/><rect x='14' y='5' width='4' height='14' rx='1.3'/>",
 prev:"<path d='M6 6h2.2v12H6zm3 6l9 6V6z'/>",
 next:"<path d='M15.8 6H18v12h-2.2zM6 18l9-6-9-6z'/>",
 shuffle:"<path d='M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z'/>",
 repeat:"<path d='M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z'/>",
 repeat1:"<path d='M13 15V9h-1l-2 1v1h1.5v4zm4-8v3l4-4-4-4v3H5v6h2V7zm0 10H7v-3l-4 4 4 4v-3h12v-6h-2z'/>",
 volume:"<path d='M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'/>",
 home:"<path d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/>",
 search:"<path d='M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14z'/>",
 add:"<path d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/>",
 more:"<path d='M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'/>",
 clock:"<path d='M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2zM12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'/>",
 heart:"<path fill-rule='evenodd' d='M12 21.2 3.2 12.6C-2.1 7.3 5.8-.7 12 5.4 18.2-.7 26.1 7.3 20.8 12.6ZM12 18.4l7.4-7.2C23.3 7.3 17.5 1.5 13.4 5.6L12 7l-1.4-1.4C6.5 1.5.7 7.3 4.6 11.2Z'/>",
 heartFilled:"<path d='M12 21.2 3.2 12.6C-2.1 7.3 5.8-.7 12 5.4 18.2-.7 26.1 7.3 20.8 12.6Z'/>",
 expand:"<path d='M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z'/>",
 compress:"<path d='M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z'/>",
 mic:"<path d='M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z'/>",
 equalizer:"<path d='M10 20h4V4h-4zm-6 0h4v-8H4zm12-11v11h4V9z'/>",
 chevron:"<path d='M7 10l5 5 5-5z'/>",
 sortAsc:"<path d='M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z'/>",
 sortDesc:"<path d='M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.59-5.58L4 12l8 8 8-8z'/>"
};
var svgCache={};
// keyed on the numeric colour (alpha stripped -- drawIcon applies that at blit time), so a hit
// costs one concat instead of unpacking the channels into a string on every icon of every frame
function iconImg(name,size,col){
  var key=name+'|'+size+'|'+(col&0xffffff);
  if(svgCache.hasOwnProperty(key)) return svgCache[key];
  var rgb=((col>>16)&0xff)+','+((col>>8)&0xff)+','+(col&0xff);
  var xml="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='"+size+"' height='"+size+"'><g fill='rgb("+rgb+")'>"+ICONS[name]+"</g></svg>";
  var bmp=null; try{ bmp=gdi.LoadSVG(xml,size); }catch(e){ bmp=null; }
  svgCache[key]=bmp; return bmp;
}
// draw a crisp size-px vector icon centred in [x,y,w,h]; falls back to the MDL2 glyph if LoadSVG is unavailable
function drawIcon(gr,name,col,x,y,w,h,size){
  var s=size||Math.min(w,h), img=iconImg(name,s,col);
  if(img){ var a=(col>>>24)&0xff; if(!a) a=255; gr.DrawImage(img,Math.round(x+(w-s)/2),Math.round(y+(h-s)/2),s,s,0,0,img.Width,img.Height,0,a); return; }
  tC(gr,GLYPH[name]||'?',(s>=26?FONT.navIco:(s>=18?FONT.iconBtn:FONT.icon)),col,x,y,w,h);
}
