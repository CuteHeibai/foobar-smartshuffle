/* verdant/core/util.js -- small pure helpers with no foobar or paint state
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- helpers ------------------------- */
function hash(s){ s=String(s); var h=2166136261; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }
function coverCol(seed){ return PALETTE[hash(seed)%PALETTE.length]; }
function blend(c1,c2,t){ var r=(c1>>16)&255,g=(c1>>8)&255,b=c1&255,r2=(c2>>16)&255,g2=(c2>>8)&255,b2=c2&255; return RGB(Math.round(r+(r2-r)*t),Math.round(g+(g2-g)*t),Math.round(b+(b2-b)*t)); }
function fmtTime(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
function inRect(x,y,r){ return x>=r.x0 && x<r.x1 && y>=r.y0 && y<r.y1; }
function cxOf(x,w,cw){ return x+Math.round((w-cw)/2); }   // x that centres a cw-wide thing inside [x,w]
function clamp01(v){ return v<0?0:(v>1?1:v); }
function clampPx(v,max){ return v<0?0:(v>max?max:v); }
function ssHeaderBoxes(art,compact,scale){
  var eyeH=16*scale,gap=6*scale,metaH=22*scale,titleY=eyeH+gap,metaY=compact?art+12*scale:art-metaH;
  return {eyeY:0,eyeH:eyeH,titleY:titleY,titleH:Math.max(1,Math.min(76*scale,(compact?art:metaY-gap)-titleY)),metaY:metaY,metaH:metaH};
}
function hitIdx(list,x,y){ for(var i=0;i<list.length;i++) if(inRect(x,y,list[i])) return i; return -1; }
function hit(list,x,y){ var i=hitIdx(list,x,y); return i<0?null:list[i]; }
function labelOf(list,v,dflt){ for(var i=0;i<list.length;i++) if(list[i][1]===v) return list[i][0]; return dflt; }
function playingLoc(){ return plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null; }

function fmtNum(n){ n=String(n); var out='', c=0; for(var i=n.length-1;i>=0;i--){ out=n.charAt(i)+out; if(++c%3===0 && i>0) out=','+out; } return out; }

// "1 hr 23 min" / "42 min" / "38 sec" style duration
function fmtDur(s){
  s=Math.max(0,Math.round(s)); var h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  if(h>0) return h+' 小时 '+m+' 分钟';
  if(m>0) return m+' 分钟';
  return s+' 秒';
}
