/* verdant/views/stats.js -- Apple Music / macOS Listening Stats view (rankings, overview KPIs, trends, smart progress)
   Part of Verdant, an Apple Music-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */
function ssStatsTime(seconds){
  var n=Math.max(0,Math.round(Number(seconds)||0)),m=Math.floor(n/60);
  return n>=3600?Math.floor(n/3600)+' 小时 '+m%60+' 分':m?m+' 分 '+n%60+' 秒':n+' 秒';
}
function drawFsStats(gr,bottom){
  var s=ssFsScale(W,H),w=Math.min(W-Math.round(100*s),Math.round(960*s)),x=Math.round((W-w)/2);
  var y=Math.round(28*s),h=Math.round(32*s),bw=Math.round(176*s),rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s);
  if(hv(x,y,x+bw,y+h))ssFillContinuousRect(gr,x,y,bw,h,rMd,rMd,COL.rowHover);
  tC(gr,'‹  返回全屏播放',FONT.pl,COL.text2,x,y,bw,h);
  HB_FS.push({x0:x,y0:y,x1:x+bw,y1:y+h,act:'stats-back'});
  var top=y+h+Math.round(8*s);
  drawStats(gr,{x:x,y:top,w:w,h:Math.max(0,bottom-top)});
}
function ssDrawStatsSegmented(gr,x,y,w,h,items,s){
  var isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var rOuter=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),pad=Math.max(2,Math.round(3*s)),rInner=Math.max(3,rOuter-pad);
  var wellBg=typeof ssInk==='function'?ssInk(isDark?20:11):COL.elev;
  ssFillContinuousRect(gr,x,y,w,h,rOuter,rOuter,wellBg);
  var segW=(w-pad*2)/items.length;
  for(var i=0;i<items.length;i++){
    var item=items[i],sx=Math.round(x+pad+i*segW),sw=i===items.length-1?(x+w-pad-sx):Math.round(segW),sy=y+pad,sh=h-pad*2;
    var box={x0:i===0?x:sx,y0:y,x1:i===items.length-1?x+w:sx+sw,y1:y+h};
    var hot=!item.disabled&&hv(box.x0,box.y0,box.x1,box.y1);
    if(item.active){
      if(!isDark&&typeof RGBA==='function')ssFillContinuousRect(gr,sx,sy+1,sw,sh,rInner,rInner,RGBA(0,0,0,20));
      ssFillContinuousRect(gr,sx,sy,sw,sh,rInner,rInner,isDark?COL.hover:COL.base);
      if(typeof strokeRound==='function')strokeRound(gr,sx,sy,sw,sh,rInner,1,isDark?COL.submenuLine:(typeof RGBA==='function'?RGBA(0,0,0,14):COL.line));
    }else if(hot){
      ssFillContinuousRect(gr,sx,sy,sw,sh,rInner,rInner,COL.rowHover);
    }
    var fg=item.disabled?COL.text3:item.active?COL.text:(hot?COL.text:COL.text2);
    tC(gr,item.label,FONT.plSub,fg,sx+2,sy,Math.max(1,sw-4),sh);
    if(!item.disabled)HB_STATS.push(Object.assign(box,item));
  }
}
function drawStats(gr,r){
  HB_STATS=[];ssStatsMax=0;
  var p=ssStats,s=ssDensity,isDark=typeof SS_APPEARANCE!=='undefined'&&SS_APPEARANCE==='dark';
  var rSm=typeof ssRad==='function'?ssRad('sm',s):Math.round(4*s),rMd=typeof ssRad==='function'?ssRad('md',s):Math.round(8*s),rLg=typeof ssRad==='function'?ssRad('lg',s):Math.round(12*s);
  var padX=typeof M!=='undefined'&&M&&M.cpad?M.cpad:Math.round(24*s);
  var x=r.x+padX,right=r.x+r.w-padX,w=Math.max(120,right-x);
  var top=r.y+Math.round(14*s),end=r.y+r.h,ctrlH=Math.round(32*s),gap=Math.round(10*s);
  var data=p.data,rank=p.tab==='rank',emptyRank=rank&&data&&!data.rows.length;
  var pausedEmpty=emptyRank&&data.recording===false&&!data.first&&!data.last&&!p.edit&&!p.error;

  tL(gr,'聆听统计',FONT.title,COL.text,x,top,w,Math.round(40*s));
  if(data&&!pausedEmpty&&w>=Math.round(320*s)){
    var stLabel=data.recording?'记录已开启':'记录已暂停';
    var pillW=Math.round(98*s),pillH=Math.round(24*s),pillX=right-pillW,pillY=top+Math.round(8*s);
    if(typeof ssFillCapsule==='function'){
      ssFillCapsule(gr,pillX,pillY,pillW,pillH,COL.elev);
      if(typeof ssStrokeCapsule==='function')ssStrokeCapsule(gr,pillX,pillY,pillW,pillH,1,COL.line);
    }else ssFillContinuousRect(gr,pillX,pillY,pillW,pillH,pillH/2,pillH/2,COL.elev);
    var dotSz=Math.max(5,Math.round(6*s));
    gr.FillEllipse(pillX+Math.round(10*s),pillY+Math.round((pillH-dotSz)/2),dotSz,dotSz,data.recording?COL.green:COL.text3);
    tL(gr,stLabel,FONT.plSub,data.recording?COL.text:COL.text2,pillX+Math.round(21*s),pillY,pillW-Math.round(26*s),pillH);
  }
  top+=Math.round(48*s);

  var tabsW=Math.min(w,Math.round(348*s));
  ssDrawStatsSegmented(gr,x,top,tabsW,ctrlH,[
    {label:'歌曲排行',tab:'rank',active:p.tab==='rank'},
    {label:'听歌概览',tab:'overview',active:p.tab==='overview'},
    {label:'智能随机进度',tab:'progress',active:p.tab==='progress'}
  ],s);
  top+=ctrlH+Math.round(12*s);

  if(!pausedEmpty){
    var daysItems=[7,30,90].map(function(days){
      var range=ssStatsRange(days);return {label:'近 '+days+' 天',days:days,active:p.from===range[0]&&p.to===range[1]};
    });
    var e=p.edit||p;
    var daysW=Math.min(w,Math.round(216*s)),dateW=Math.round(106*s),applyW=Math.round(80*s),subGap=Math.round(8*s);
    var oneLine=w>=daysW+dateW*2+applyW+subGap*4+Math.round(12*s);
    ssDrawStatsSegmented(gr,x,top,daysW,ctrlH,daysItems,s);
    var dx=oneLine?(x+daysW+Math.round(14*s)):x,dy=oneLine?top:(top+ctrlH+subGap);
    if(!oneLine)dateW=Math.min(Math.round(122*s),Math.floor((w-applyW-subGap*2)/2));
    var dateFields=[
      {label:e.from+(p.edit&&e.field==='from'?' ▏':''),field:'from',active:p.edit&&e.field==='from',x:dx,w:dateW},
      {label:e.to+(p.edit&&e.field==='to'?' ▏':''),field:'to',active:p.edit&&e.field==='to',x:dx+dateW+subGap,w:dateW}
    ];
    for(var df=0;df<dateFields.length;df++){
      var f=dateFields[df],fHot=hv(f.x,dy,f.x+f.w,dy+ctrlH);
      var fBg=isDark?COL.input:COL.base;
      ssFillContinuousRect(gr,f.x,dy,f.w,ctrlH,rMd,rMd,fHot?COL.elev:fBg);
      if(typeof strokeRound==='function')strokeRound(gr,f.x,dy,f.w,ctrlH,rMd,f.active?2:1,f.active?COL.green:(fHot?COL.text3:COL.line));
      tC(gr,f.label,FONT.plSub,f.active?COL.text:COL.text2,f.x+4,dy,Math.max(1,f.w-8),ctrlH);
      HB_STATS.push({x0:f.x,y0:dy,x1:f.x+f.w,y1:dy+ctrlH,field:f.field,active:f.active});
    }
    var ax=dx+dateW*2+subGap*2,aDisabled=!p.edit,aHot=!aDisabled&&hv(ax,dy,ax+applyW,dy+ctrlH);
    var aBg=aDisabled?COL.elev:(aHot?COL.greenHover:COL.green),aFg=aDisabled?COL.text3:COL.onAccent;
    ssFillContinuousRect(gr,ax,dy,applyW,ctrlH,rMd,rMd,aBg);
    if(aDisabled&&typeof strokeRound==='function')strokeRound(gr,ax,dy,applyW,ctrlH,rMd,1,COL.line);
    tC(gr,'应用日期',FONT.plSub,aFg,ax+4,dy,Math.max(1,applyW-8),ctrlH);
    if(!aDisabled)HB_STATS.push({x0:ax,y0:dy,x1:ax+applyW,y1:dy+ctrlH,apply:true});
    top=dy+ctrlH+Math.round(10*s);

    var rightText=typeof tR==='function'?tR:tL;
  if(rank){
      var metrics=[['综合分','score'],['有效次数','plays'],['平均时长','average'],['切走次数','switches']];
      var chipH=Math.round(28*s),chipGap=Math.round(8*s),cx=x;
      for(var mi=0;mi<metrics.length;mi++){
        var pair=metrics[mi],mAct=p.order===pair[1];
        var mLbl=pair[0]+(mAct?(p.ascending?' ↑':' ↓'):'');
        var cw=Math.min(Math.round(96*s),Math.floor((w-chipGap*(metrics.length-1))/metrics.length));
        var mHot=hv(cx,top,cx+cw,top+chipH);
        var cFill=mAct?(typeof ssAccent==='function'?ssAccent(isDark?32:18):COL.rowActive):(mHot?COL.rowHover:COL.elev);
        if(typeof ssFillCapsule==='function')ssFillCapsule(gr,cx,top,cw,chipH,cFill);
        else ssFillContinuousRect(gr,cx,top,cw,chipH,chipH/2,chipH/2,cFill);
        if(!mAct&&typeof ssStrokeCapsule==='function')ssStrokeCapsule(gr,cx,top,cw,chipH,1,COL.line);
        tC(gr,mLbl,FONT.plSub,mAct?COL.green:(mHot?COL.text:COL.text2),cx+4,top,Math.max(1,cw-8),chipH);
        HB_STATS.push({x0:cx,y0:top,x1:cx+cw,y1:top+chipH,order:pair[1],active:mAct});
        cx+=cw+chipGap;
      }
      top+=chipH+Math.round(8*s);
    }

    var note=p.error||(p.edit?'输入 YYYY-MM-DD，回车应用，Esc 取消。':data?
      (data.recording?'记录已开启':'记录已暂停')+' · '+(data.first?data.first+' 至 '+data.last:'暂无可用记录'):'正在读取统计…');
    tL(gr,note,FONT.plSub,p.error?COL.error:COL.text2,x,top,w,Math.round(22*s));
    top+=Math.round(28*s);
    gr.FillSolidRect(x,top-Math.round(4*s),w,1,COL.line);
  }
  if(!data||top>=end)return;

  if(emptyRank){
    var emptyY=top+Math.round(12*s),detailY=emptyY+Math.round(34*s),by=emptyY+Math.round(68*s);
    var samples=data.overview&&Object.keys(data.overview.daily||{}).length>0;
    var title=pausedEmpty?'听歌统计已暂停':samples?'该日期范围没有可排行的歌曲':'该日期范围还没有记录';
    var detail=pausedEmpty?'在插件设置中开启「记录听歌统计」，保存之后的收听记录。':samples?'试试其他排序方式或日期范围。':'试试其他日期范围。';
    var cardW=Math.min(w,Math.round(520*s)),cardPad=Math.round(18*s),actionH=Math.round(38*s);
    var cardH=Math.min(end-emptyY+cardPad,(!data.recording?Math.round(138*s):Math.round(92*s)));
    if(cardH>20){
      ssFillContinuousRect(gr,x-cardPad,emptyY-Math.round(12*s),Math.min(r.x+r.w-(x-cardPad)-Math.round(12*s),cardW+cardPad*2),cardH,rLg,rLg,COL.elev);
      if(typeof strokeRound==='function')strokeRound(gr,x-cardPad,emptyY-Math.round(12*s),Math.min(r.x+r.w-(x-cardPad)-Math.round(12*s),cardW+cardPad*2),cardH,rLg,1,COL.line);
    }
    if(emptyY+ctrlH<=end)tL(gr,title,FONT.sect2,COL.text,x,emptyY,cardW,ctrlH);
    if(detailY+ctrlH<=end)tL(gr,detail,FONT.meta,COL.text2,x,detailY,cardW,ctrlH);
    if(!data.recording&&by+actionH<=end)HB_STATS.push(ssDrawSettingsButton(gr,x,by,cardW,actionH));
    return;
  }

  var rightText=typeof tR==='function'?tR:tL;
  if(rank){
    var page=Math.floor(p.offset/p.limit)+1,pages=Math.max(1,Math.ceil(data.total/p.limit));
    var pagerH=pages>1?Math.round(44*s):0,bottom=end-pagerH;
    if(bottom>top){
      ssDrawStatsRows(gr,r,top,bottom,data.rows.length,Math.round(66*s),function(g,i,y,h){
        var row=data.rows[i],pos=p.offset+i+1,topThree=pos<=3;
        var rowHot=hv(x,y+2,right,y+h-2);
        if(rowHot||(i%2===1&&w>=Math.round(520*s)))
          ssFillContinuousRect(g,x-Math.round(6*s),y+Math.round(2*s),w+Math.round(12*s),h-Math.round(4*s),rMd,rMd,rowHot?COL.rowHover:(typeof ssInk==='function'?ssInk(isDark?6:4):COL.elev));
        var badgeSz=Math.round(28*s),bx=x+Math.round(2*s),by=y+Math.round((h-badgeSz)/2);
        if(topThree){
          ssFillContinuousRect(g,bx,by,badgeSz,badgeSz,rSm,rSm,typeof ssAccent==='function'?ssAccent(isDark?32:18):COL.rowActive);
          tC(g,String(pos),FONT.sect,COL.green,bx,by,badgeSz,badgeSz);
        }else{
          tC(g,String(pos),FONT.rowNum,COL.text2,bx,by,badgeSz,badgeSz);
        }
        var statW=w>=Math.round(460*s)?Math.round(124*s):0;
        var tx=bx+badgeSz+Math.round(12*s),tw=Math.max(40,right-tx-(statW?statW+Math.round(10*s):0));
        var status=row.samples===0?' · 未听':row.plays===0?' · 未达有效门槛':'';
        var title=(row.title||'未知歌曲')+(row.artist?' · '+row.artist:'');
        tL(g,title,FONT.rowTitle,COL.text,tx,y+Math.round(9*s),tw,Math.round(22*s));
        tL(g,'有效 '+row.plays+' 次 · 切走 '+row.switches+' 次 · 样本 '+row.samples+status,FONT.plSub,COL.text2,tx,y+Math.round(35*s),tw,Math.round(20*s));
        if(statW){
          var sx=right-statW;
          rightText(g,'综合 '+(row.score===null?'—':row.score.toFixed(1)),FONT.sect,row.score!==null?COL.text:COL.text3,sx,y+Math.round(10*s),statW,Math.round(22*s));
          rightText(g,'平均 '+(row.average===null?'—':ssStatsTime(row.average)),FONT.plSub,COL.text2,sx,y+Math.round(35*s),statW,Math.round(20*s));
        }
      },true);
      if(pages>1){
        gr.FillSolidRect(x,bottom,w,1,COL.line);
        var pbW=Math.round(78*s),pbH=Math.round(28*s),midW=Math.round(76*s),totalPW=pbW*2+midW+Math.round(16*s);
        var px=x+Math.max(0,Math.floor((w-totalPW)/2)),py=bottom+Math.round((pagerH-pbH)/2);
        var pBtns=[{label:'上一页',page:-1,disabled:page<=1,x:px},{label:'下一页',page:1,disabled:page>=pages,x:px+pbW+midW+Math.round(16*s)}];
        for(var pi=0;pi<pBtns.length;pi++){
          var pb=pBtns[pi],pHot=!pb.disabled&&hv(pb.x,py,pb.x+pbW,py+pbH);
          ssFillContinuousRect(gr,pb.x,py,pbW,pbH,rMd,rMd,pb.disabled?COL.base:(pHot?COL.rowHover:COL.elev));
          if(typeof strokeRound==='function')strokeRound(gr,pb.x,py,pbW,pbH,rMd,1,pb.disabled?COL.line:(pHot?COL.text3:COL.line));
          tC(gr,pb.label,FONT.plSub,pb.disabled?COL.text3:COL.text,pb.x,py,pbW,pbH);
          if(!pb.disabled)HB_STATS.push({x0:pb.x,y0:py,x1:pb.x+pbW,y1:py+pbH,page:pb.page});
        }
        tC(gr,page+' / '+pages,FONT.plSub,COL.text2,px+pbW+Math.round(8*s),py,midW,pbH);
      }
    }
  }else if(p.tab==='overview'){
    var o=data.overview,blocks=[];
    blocks.push({kind:'kpi',h:Math.round(88*s)});
    blocks.push({kind:'trend',h:Math.round(126*s)});
    blocks.push({kind:'heading',label:'歌手排行',h:Math.round(36*s)});
    var maxArt=Math.max(1,...o.artists.map(function(a){return a.seconds||a.plays||1;}));
    for(var ai=0;ai<o.artists.length;ai++)blocks.push({kind:'rankRow',idx:ai+1,title:o.artists[ai].name,meta:o.artists[ai].plays+' 次 · '+ssStatsTime(o.artists[ai].seconds),frac:(o.artists[ai].seconds||o.artists[ai].plays||0)/maxArt,h:Math.round(48*s)});
    if(!o.artists.length)blocks.push({kind:'empty',label:'暂无歌手记录',h:Math.round(42*s)});
    blocks.push({kind:'heading',label:'专辑排行',h:Math.round(40*s)});
    var maxAlb=Math.max(1,...o.albums.map(function(a){return a.seconds||a.plays||1;}));
    for(var bi=0;bi<o.albums.length;bi++)blocks.push({kind:'rankRow',idx:bi+1,title:o.albums[bi].name,meta:(o.albums[bi].artist?o.albums[bi].artist+' · ':'')+o.albums[bi].plays+' 次 · '+ssStatsTime(o.albums[bi].seconds),frac:(o.albums[bi].seconds||o.albums[bi].plays||0)/maxAlb,h:Math.round(48*s)});
    if(!o.albums.length)blocks.push({kind:'empty',label:'暂无专辑记录',h:Math.round(42*s)});
    ssDrawStatsBlocks(gr,r,top,end,blocks,function(g,blk,y){
      if(blk.kind==='kpi'){
        var kg=Math.round(12*s),kw=Math.floor((w-kg*2)/3),kh=blk.h-Math.round(12*s),ky=y+Math.round(6*s);
        var kpis=[
          {title:'总收听时长',val:ssStatsTime(o.seconds),sub:'有效 '+o.plays+' 次'},
          {title:'有效播放',val:o.plays+' 次',sub:'收听 '+ssStatsTime(o.seconds)},
          {title:'听过曲目',val:o.unique+' 首',sub:'不重复歌曲'}
        ];
        for(var ki=0;ki<3;ki++){
          var kx=x+ki*(kw+kg),cw=ki===2?(right-kx):kw;
          ssFillContinuousRect(g,kx,ky,cw,kh,rLg,rLg,COL.elev);
          if(typeof strokeRound==='function')strokeRound(g,kx,ky,cw,kh,rLg,1,COL.line);
          tL(g,kpis[ki].title,FONT.plSub,COL.text2,kx+Math.round(14*s),ky+Math.round(10*s),cw-Math.round(28*s),Math.round(18*s));
          tL(g,kpis[ki].val,FONT.sect2,COL.text,kx+Math.round(14*s),ky+Math.round(30*s),cw-Math.round(28*s),Math.round(26*s));
          tL(g,kpis[ki].sub,FONT.plSub,COL.text3,kx+Math.round(14*s),ky+Math.round(56*s),cw-Math.round(28*s),Math.round(16*s));
        }
      }else if(blk.kind==='trend'){
        var ch=blk.h-Math.round(12*s),cy=y+Math.round(4*s),cp=Math.round(16*s);
        ssFillContinuousRect(g,x,cy,w,ch,rLg,rLg,COL.elev);
        if(typeof strokeRound==='function')strokeRound(g,x,cy,w,ch,rLg,1,COL.line);
        tL(g,'每日收听时长',FONT.sect,COL.text,x+cp,cy+Math.round(10*s),Math.round(160*s),Math.round(22*s));
        ssDrawStatsTrend(g,x+cp,cy+Math.round(36*s),w-cp*2,ch-Math.round(48*s),o.daily,x+cp+Math.round(164*s),cy+Math.round(10*s),w-cp*2-Math.round(164*s));
      }else if(blk.kind==='heading'){
        tL(g,blk.label,FONT.sect2,COL.text,x,y+Math.round(10*s),w,Math.round(24*s));
      }else if(blk.kind==='empty'){
        tL(g,blk.label,FONT.plSub,COL.text2,x,y+Math.round(8*s),w,Math.round(22*s));
      }else{
        var barH=Math.max(3,Math.round(4*s)),numW=Math.round(26*s),tx=x+numW+Math.round(8*s),tw=Math.max(40,right-tx);
        rightText(g,String(blk.idx),FONT.rowNum,blk.idx<=3?COL.green:COL.text2,x,y+Math.round(4*s),numW,Math.round(22*s));
        tL(g,blk.title,FONT.pl,COL.text,tx,y+Math.round(4*s),Math.floor(tw*.56),Math.round(22*s));
        rightText(g,blk.meta,FONT.plSub,COL.text2,tx+Math.floor(tw*.56),y+Math.round(4*s),tw-Math.floor(tw*.56),Math.round(22*s));
        var trackY=y+Math.round(31*s),fillW=Math.max(barH,Math.round(tw*Math.max(0,Math.min(1,blk.frac))));
        if(typeof ssFillCapsule==='function'){
          ssFillCapsule(g,tx,trackY,tw,barH,COL.seekbg);
          if(blk.frac>0)ssFillCapsule(g,tx,trackY,fillW,barH,COL.green);
        }else{
          g.FillSolidRect(tx,trackY,tw,barH,COL.seekbg);
          if(blk.frac>0)g.FillSolidRect(tx,trackY,fillW,barH,COL.green);
        }
      }
    });
  }else{
    var q=data.progress;
    if(!q){
      var msg=data.smart?'当前没有播放来源':'当前未启用智能随机';
      var ecY=top+Math.round(12*s),ecW=Math.min(w,Math.round(440*s)),ecH=Math.round(76*s);
      ssFillContinuousRect(gr,x,ecY,ecW,ecH,rLg,rLg,COL.elev);
      if(typeof strokeRound==='function')strokeRound(gr,x,ecY,ecW,ecH,rLg,1,COL.line);
      tL(gr,msg,FONT.sect2,COL.text,x+Math.round(18*s),ecY+Math.round(24*s),ecW-Math.round(36*s),Math.round(28*s));
      return;
    }
    var pct=Math.round(q.attempted*100/Math.max(1,q.total));
    var pBlocks=[
      {kind:'coverage',h:Math.round(112*s)},
      {kind:'pair',title:'当前偏好',val:'频率 '+q.point.x.toFixed(2)+' · 风格 '+q.point.y.toFixed(2),h:Math.round(68*s)},
      {kind:'dist',title:'前 8 首待播分布',sub:'当前队列 · 与上方历史日期范围无关',counts:q.first,h:Math.round(92*s)},
      {kind:'dist',title:'全部剩余歌曲分布',sub:ssStatsDistribution(q.distribution),counts:q.distribution,h:Math.round(86*s)}
    ];
    ssDrawStatsBlocks(gr,r,top,end,pBlocks,function(g,blk,y){
      var cy=y+Math.round(6*s),ch=blk.h-Math.round(12*s),cp=Math.round(16*s);
      ssFillContinuousRect(g,x,cy,w,ch,rLg,rLg,COL.elev);
      if(typeof strokeRound==='function')strokeRound(g,x,cy,w,ch,rLg,1,COL.line);
      if(blk.kind==='coverage'){
        tL(g,'播放来源 · '+(isHiddenPl(q.source)?'临时歌曲列表':q.source),FONT.plSub,COL.text2,x+cp,cy+Math.round(12*s),w-cp*2,Math.round(20*s));
        tL(g,'本轮覆盖 '+pct+'%',FONT.sect2,COL.text,x+cp,cy+Math.round(34*s),Math.round(180*s),Math.round(26*s));
        rightText(g,q.attempted+' / '+q.total+' 首已尝试 · 剩余 '+q.remaining+' 首',FONT.plSub,COL.text2,x+cp+Math.round(160*s),cy+Math.round(38*s),w-cp*2-Math.round(160*s),Math.round(20*s));
        var barY=cy+ch-Math.round(22*s),barH=Math.max(6,Math.round(7*s)),barW=w-cp*2;
        if(typeof ssFillCapsule==='function'){
          ssFillCapsule(g,x+cp,barY,barW,barH,COL.seekbg);
          if(pct>0)ssFillCapsule(g,x+cp,barY,Math.max(barH,Math.round(barW*pct/100)),barH,COL.green);
        }
      }else if(blk.kind==='pair'){
        tL(g,blk.title,FONT.plSub,COL.text2,x+cp,cy+Math.round(10*s),w-cp*2,Math.round(18*s));
        tL(g,blk.val,FONT.sect,COL.text,x+cp,cy+Math.round(30*s),w-cp*2,Math.round(22*s));
      }else{
        tL(g,blk.title,FONT.sect,COL.text,x+cp,cy+Math.round(12*s),w-cp*2,Math.round(22*s));
        tL(g,ssStatsDistribution(blk.counts),FONT.plSub,COL.text2,x+cp,cy+Math.round(36*s),w-cp*2,Math.round(18*s));
        var sum=Math.max(1,(blk.counts[0]||0)+(blk.counts[1]||0)+(blk.counts[2]||0));
        var dBarY=cy+ch-Math.round(18*s),dBarH=Math.max(5,Math.round(6*s)),dBarW=w-cp*2;
        var w0=Math.round(dBarW*(blk.counts[0]||0)/sum),w1=Math.round(dBarW*(blk.counts[1]||0)/sum),w2=Math.max(0,dBarW-w0-w1);
        g.FillSolidRect(x+cp,dBarY,w0,dBarH,COL.green);
        g.FillSolidRect(x+cp+w0,dBarY,w1,dBarH,typeof ssAccent==='function'?ssAccent(130):COL.text2);
        g.FillSolidRect(x+cp+w0+w1,dBarY,w2,dBarH,COL.seekbg);
      }
    });
  }
}
function ssStatsDistribution(counts){
  return '未听 '+counts[0]+' 首 · 1 次 '+counts[1]+' 首 · 2 次及以上 '+counts[2]+' 首';
}
function ssDrawStatsTrend(gr,x,y,w,h,daily,tipX,tipY,tipW){
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
  var max=Math.max(1,...days.map(function(d){return d.seconds;})),bar=w/days.length,hovered=null;
  for(var i=0;i<days.length;i++){
    var sec=days[i].seconds,bh=sec?Math.max(4,Math.round(h*sec/max)):2,bx=x+bar*i,bw=Math.max(2,bar-Math.max(1,bar*.22));
    var isHot=hv(bx,y,bx+bar,y+h);
    if(isHot)hovered=days[i];
    var col=sec?(isHot?COL.greenHover:COL.green):COL.line;
    if(bw>=4&&bh>=4)ssFillContinuousRect(gr,bx,y+h-bh,bw,bh,Math.min(3,bw/2),Math.min(3,bh/2),col);
    else gr.FillSolidRect(bx,y+h-bh,Math.max(1,bw),bh,col);
  }
  if(hovered&&tipW>40){
    (typeof tR==='function'?tR:tL)(gr,hovered.date+' · '+ssStatsTime(hovered.seconds),FONT.plSub,COL.green,tipX,tipY,tipW,Math.round(22*ssDensity));
  }
}
function ssDrawStatsBlocks(gr,r,top,bottom,blocks,draw){
  var height=bottom-top,totalH=0,ys=[];
  for(var i=0;i<blocks.length;i++){ys.push(totalH);totalH+=blocks[i].h;}
  ssStatsMax=Math.max(0,totalH-height);
  ssStatsScroll=clampPx(ssStatsScroll,ssStatsMax);ssStatsScrollT=clampPx(ssStatsScrollT,ssStatsMax);
  if(height<=0||!blocks.length)return;
  var layer=ssBeginViewport('stats-list',gr,r.x,top,r.w,height),off=Math.round(ssStatsScroll);
  try{
    for(var j=0;j<blocks.length;j++){
      var y=top+ys[j]-off;
      if(y>=bottom)break;
      if(y+blocks[j].h<=top)continue;
      draw(layer.gr,blocks[j],y);
    }
  }finally{layer.finish();}
  drawScrollbar(gr,r.x+r.w-10,top,height,ssStatsScroll,ssStatsMax,height,totalH,[r.x,top,r.x+r.w,bottom]);
}
function ssDrawStatsRows(gr,r,top,bottom,count,rh,draw,noRule){
  var height=bottom-top;
  ssStatsMax=Math.max(0,count*rh-height);
  ssStatsScroll=clampPx(ssStatsScroll,ssStatsMax);ssStatsScrollT=clampPx(ssStatsScrollT,ssStatsMax);
  if(height<=0||!count)return;
  var layer=ssBeginViewport('stats-list',gr,r.x,top,r.w,height),off=Math.round(ssStatsScroll);
  try{
    for(var i=Math.floor(off/rh);i<count;i++){
      var y=top+i*rh-off;if(y>=bottom)break;
      draw(layer.gr,i,y,rh);
      if(!noRule)layer.gr.DrawLine(r.x+16,y+rh-1,r.x+r.w-16,y+rh-1,1,COL.line);
    }
  }finally{layer.finish();}
  drawScrollbar(gr,r.x+r.w-10,top,height,ssStatsScroll,ssStatsMax,height,count*rh,[r.x,top,r.x+r.w,bottom]);
}
