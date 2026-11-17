/* Main pane for date filters, track rankings and the current smart round. */
function ssStatsTime(seconds){
  var n=Math.max(0,Math.round(Number(seconds)||0)),m=Math.floor(n/60);
  return n>=3600?Math.floor(n/3600)+' 小时 '+m%60+' 分':m?m+' 分 '+n%60+' 秒':n+' 秒';
}
function drawStats(gr,r){
  HB_STATS=[];
  var p=ssStats,s=ssDensity,x=r.x+Math.round(16*s),right=r.x+r.w-Math.round(16*s),w=right-x;
  var top=r.y+Math.round(12*s),end=r.y+r.h,buttonH=Math.round(32*s),gap=Math.round(8*s);
  function buttons(items,y,maxWidth,plain){
    var width=Math.min(maxWidth||w,(w-gap*(items.length-1))/items.length);
    for(var i=0;i<items.length;i++){
      var item=items[i],left=Math.round(x+i*(width+gap)),edge=Math.round(x+i*(width+gap)+width);
      var box={x0:left,y0:y,x1:edge,y1:y+buttonH};
      var hot=hv(left,y,edge,y+buttonH);
      if(hot||(!plain&&!item.disabled))ssFillContinuousRect(gr,left,y,edge-left,buttonH,5,5,item.active?COL.rowActive:hot?COL.rowHover:COL.elev);
      if(plain&&item.active)gr.FillSolidRect(left,y+buttonH-2,edge-left,2,COL.green);
      tC(gr,item.label,FONT.pl,item.active?COL.green:COL.text,left+2,y,Math.max(1,edge-left-4),buttonH);
      if(!item.disabled)HB_STATS.push(Object.assign(box,item));
    }
    return y+buttonH+gap;
  }
  tL(gr,'聆听统计',FONT.title,COL.text,x,top,w,Math.round(36*s));
  top+=Math.round(42*s);
  top=buttons([{label:'歌曲排行',tab:'rank',active:p.tab==='rank'},{label:'听歌概览',tab:'overview',active:p.tab==='overview'},{label:'智能随机进度',tab:'progress',active:p.tab==='progress'}],top,Math.round(126*s),true)+gap;
  top=buttons([7,30,90].map(function(days){
    var r=ssStatsRange(days);return {label:'近 '+days+' 天',days:days,active:p.from===r[0]&&p.to===r[1]};
  }),top,Math.round(80*s));
  var e=p.edit||p;
  top=buttons([{label:e.from+(p.edit&&e.field==='from'?' ▏':''),field:'from',active:p.edit&&e.field==='from'},
    {label:e.to+(p.edit&&e.field==='to'?' ▏':''),field:'to',active:p.edit&&e.field==='to'},
    {label:'应用日期',apply:true,disabled:!p.edit}],top,Math.round(135*s))+gap;
  if(p.tab==='rank'){
    var metrics=[['综合分','score'],['有效次数','plays'],['平均时长','average'],['切走次数','switches']];
    top=buttons(metrics.map(function(pair){
      var active=p.order===pair[1];
      return {label:pair[0]+(active?(p.ascending?' ↑':' ↓'):''),order:pair[1],active:active};
    }),top,Math.round(92*s),true);
  }
  var data=p.data;
  var note=p.error||(p.edit?'输入 YYYY-MM-DD，回车应用，Esc 取消。':data?
    (data.recording?'记录已开启':'记录已暂停')+' · '+(data.first?data.first+' 至 '+data.last:'暂无可用记录'):'正在读取统计…');
  tL(gr,note,FONT.meta,p.error?COL.error:COL.text2,x,top,w,buttonH);
  top+=buttonH+gap;
  if(!data||top>=end)return;
  if(p.tab==='rank'&&!data.rows.length){
    var width=Math.min(w,800*s),left=x+(w-width)/2,emptyY=top+Math.min((end-top)*.24,108*s);
    if(emptyY+(data.recording?101:142)*s<=end){
      drawIcon(gr,'equalizer',COL.text2,left,emptyY,width,40*s,28*s);
      tC(gr,data.recording?'该日期范围还没有记录':'听歌统计已暂停',FONT.sect2,COL.text,left,emptyY+44*s,width,30*s);
      tC(gr,data.recording?'试试其他日期范围':'在插件设置中开启「记录听歌统计」',FONT.meta,COL.text2,left,emptyY+78*s,width,23*s);
      if(!data.recording){
        var bw=Math.min(w,156*s),bx=x+(w-bw)/2,by=emptyY+110*s;
        ssFillContinuousRect(gr,bx,by,bw,buttonH,6,6,hv(bx,by,bx+bw,by+buttonH)?COL.rowHover:COL.elev);
        tC(gr,'打开插件设置',FONT.pl,COL.text,bx,by,bw,buttonH);
        HB_STATS.push({x0:bx,y0:by,x1:bx+bw,y1:by+buttonH,settings:true});
      }
    }else tL(gr,'该日期范围没有可排行的歌曲',FONT.pl,COL.text2,x,top,w,buttonH);
    return;
  }
  if(p.tab==='rank'){
    var page=Math.floor(p.offset/p.limit)+1,pages=Math.max(1,Math.ceil(data.total/p.limit));
    var bottom=pages>1?end-buttonH-gap*2:end;
    if(bottom>top){
      ssDrawStatsRows(gr,r,top,bottom,data.rows.length,Math.round(60*s),function(g,i,y,h){
        var row=data.rows[i],status=row.samples===0?' · 未听':row.plays===0?' · 未达有效门槛':'';
        var title=(p.offset+i+1)+'. '+(row.title||'未知歌曲')+(row.artist?' · '+row.artist:'');
        tL(g,title,FONT.rowTitle,COL.text,x,y,w,h/3);
        tL(g,'有效 '+row.plays+' 次  ·  切走 '+row.switches+' 次  ·  样本 '+row.samples+status,FONT.plSub,COL.text2,x,y+h/3,w,h/3);
        tL(g,'平均 '+(row.average===null?'—':ssStatsTime(row.average))+'  ·  综合 '+(row.score===null?'—':row.score.toFixed(1)),FONT.plSub,COL.text2,x,y+h*2/3,w,h/3);
      });
      if(pages>1)buttons([{label:'上一页',page:-1,disabled:page<=1},{label:page+' / '+pages,disabled:true},{label:'下一页',page:1,disabled:page>=pages}],bottom+gap,Math.round(90*s));
    }
  }else if(p.tab==='overview'){
    var o=data.overview,rows=[
      ['收听 '+ssStatsTime(o.seconds),'有效 '+o.plays+' 次 · 听过 '+o.unique+' 首'],
      ['每日收听时长',''],['歌手排行','']
    ];
    for(var a of o.artists)rows.push([a.name,a.plays+' 次 · '+ssStatsTime(a.seconds)]);
    if(!o.artists.length)rows.push(['暂无歌手记录','']);
    rows.push(['专辑排行','']);
    for(var a of o.albums)rows.push([a.name,(a.artist?a.artist+' · ':'')+a.plays+' 次 · '+ssStatsTime(a.seconds)]);
    if(!o.albums.length)rows.push(['暂无专辑记录','']);
    ssDrawStatsRows(gr,r,top,end,rows.length,Math.round(42*s),function(g,i,y,h){
      tL(g,rows[i][0],FONT.pl,COL.text,x,y,w,h/2);
      if(i===1)ssDrawStatsTrend(g,x,y+h/2,w,h/2-3,o.daily);
      else tL(g,rows[i][1],FONT.plSub,COL.text2,x,y+h/2,w,h/2);
    });
  }else{
    var q=data.progress,rows=q?[
      ['播放来源',isHiddenPl(q.source)?'临时歌曲列表':q.source],
      ['本轮覆盖 '+Math.round(q.attempted*100/q.total)+'%',q.attempted+' / '+q.total+' 首已尝试 · 剩余 '+q.remaining+' 首'],
      ['当前偏好','频率 '+q.point.x.toFixed(2)+' · 风格 '+q.point.y.toFixed(2)],
      ['近 30 天收听分布','当前队列 · 与上方历史日期范围无关'],
      ['前 8 首待播',ssStatsDistribution(q.first)],
      ['全部剩余歌曲',ssStatsDistribution(q.distribution)]
    ]:[[data.smart?'当前没有播放来源':'当前未启用智能随机','']];
    ssDrawStatsRows(gr,r,top,end,rows.length,Math.round(48*s),function(g,i,y,h){
      tL(g,rows[i][0],FONT.pl,COL.text,x,y,w,h/2);
      tL(g,rows[i][1],FONT.plSub,COL.text2,x,y+h/2,w,h/2);
    });
  }
}
function ssStatsDistribution(counts){
  return '未听 '+counts[0]+' 首 · 1 次 '+counts[1]+' 首 · 2 次及以上 '+counts[2]+' 首';
}
function ssDrawStatsTrend(gr,x,y,w,h,daily){
  var end=new Date(ssStats.to+'T12:00:00'),start=new Date(ssStats.from+'T12:00:00');
  var today=new Date(),lastDate=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12);
  if(end>lastDate)end=lastDate;
  var days=[],axisStart=new Date(end.getTime());axisStart.setDate(axisStart.getDate()-89);
  if(start<axisStart)start=axisStart;
  for(var d=new Date(start.getTime());d<=end;d.setDate(d.getDate()+1)){
    var date=ssStatsDate(d);
    days.push({date:date,seconds:daily[date]||0});
  }
  if(!days.length)return;
  var max=Math.max(1,...days.map(function(d){return d.seconds;})),bar=w/days.length;
  for(var i=0;i<days.length;i++){
    var height=Math.max(1,h*days[i].seconds/max),bx=x+bar*i;
    gr.FillSolidRect(bx,y+h-height,Math.max(1,bar-1),height,days[i].seconds?COL.green:COL.line);
    if(hv(bx,y,bx+bar,y+h)){
      gr.FillSolidRect(x,y,w,h,COL.base);
      tL(gr,days[i].date+'  '+ssStatsTime(days[i].seconds),FONT.plSub,COL.text2,x,y,w,h);return;
    }
  }
}
function ssDrawStatsRows(gr,r,top,bottom,count,rh,draw){
  var height=bottom-top;
  ssStatsMax=Math.max(0,count*rh-height);
  ssStatsScroll=clampPx(ssStatsScroll,ssStatsMax);ssStatsScrollT=clampPx(ssStatsScrollT,ssStatsMax);
  if(height<=0||!count)return;
  var layer=ssBeginViewport('stats-list',gr,r.x,top,r.w,height),off=Math.round(ssStatsScroll);
  try{
    for(var i=Math.floor(off/rh);i<count;i++){
      var y=top+i*rh-off;if(y>=bottom)break;
      draw(layer.gr,i,y,rh);
      layer.gr.DrawLine(r.x+16,y+rh-1,r.x+r.w-16,y+rh-1,1,COL.line);
    }
  }finally{layer.finish();}
  drawScrollbar(gr,r.x+r.w-10,top,height,ssStatsScroll,ssStatsMax,height,count*rh,hv(r.x,top,r.x+r.w,bottom)||drag==='scroll');
}
