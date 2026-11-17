/* Statistics requests are scoped to this page and the active filter. */
var ssStats={tab:'rank',from:'',to:'',order:'score',ascending:false,offset:0,limit:20,
  data:null,error:'',edit:null,timer:0,request:'',key:'',next:0,revision:null,dirty:false};
var HB_STATS=[],ssStatsDown=null,ssStatsScroll=0,ssStatsScrollT=0,ssStatsMax=0;
function ssStatsDate(d){
  function pad(n){return String(n).padStart(2,'0');}
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function ssStatsRange(days,now){
  var end=new Date(now===undefined?Date.now():now),start=new Date(end.getTime());
  start.setDate(start.getDate()-days+1);
  return [ssStatsDate(start),ssStatsDate(end)];
}
function ssStatsOpen(){
  fsMode=false;view='stats';ssStats.tab='rank';ssStats.edit=null;
  if(!ssStats.from){var range=ssStatsRange(30);ssStats.from=range[0];ssStats.to=range[1];}
  if(!ssStats.timer)ssStats.timer=window.SetInterval(ssStatsTick,1000);
  ssStatsChanged();
}
function ssStatsStop(){
  if(ssStats.timer)window.ClearInterval(ssStats.timer);
  ssStats.timer=0;ssStats.edit=null;
}
function ssStatsQuery(){
  if(ssStats.request||view!=='stats')return;
  ssStats.dirty=false;ssStats.next=Date.now()+15000;
  ssStats.request=ssSend('listening_stats',{from:ssStats.from,to:ssStats.to,order:ssStats.order,
    ascending:ssStats.ascending,offset:ssStats.offset,limit:ssStats.limit});
  ssStats.key=ssStatsFilterKey();
}
function ssStatsFilterKey(){
  return [ssStats.from,ssStats.to,ssStats.order,ssStats.ascending,ssStats.offset].join('|');
}
function ssStatsChanged(){
  ssStats.error='';ssStats.data=null;ssStats.dirty=true;ssStatsScroll=ssStatsScrollT=0;
  ssStatsQuery();repaintMain();
}
function ssStatsTick(){
  if(view!=='stats'){ssStatsStop();return;}
  if(ssStats.dirty||Date.now()>=ssStats.next)ssStatsQuery();
}
function ssAcceptStats(done,state){
  if(done&&done.id===ssStats.request){
    ssStats.request='';
    if(view==='stats'&&ssStats.key===ssStatsFilterKey()){
      var result=state.response&&state.response.stats;
      if(result){
        if(ssStats.offset>=result.total&&ssStats.offset){ssStats.offset=0;ssStatsChanged();}
        else{ssStats.data=result;ssStats.error='';}
      }else ssStats.error=state.response&&state.response.message||'当前组件无法读取统计';
    }
  }
  if(view!=='stats')return;
  var personal=state.personal||{},key=[personal.revision,personal.history_enabled,state.revision,state.enabled].join('|');
  if(ssStats.revision!==null&&ssStats.revision!==key)ssStats.dirty=true;
  ssStats.revision=key;
}
function ssStatsApplyRange(from,to){
  if(!ssStatsValidDate(from)||!ssStatsValidDate(to)||from>to){
    ssStats.error='请输入有效的日期范围，格式 YYYY-MM-DD';repaintMain();return false;
  }
  ssStats.from=from;ssStats.to=to;ssStats.offset=0;ssStats.edit=null;applyKeyMode();ssStatsChanged();return true;
}
function ssStatsValidDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  var d=new Date(s+'T12:00:00');return isFinite(d.getTime())&&ssStatsDate(d)===s;
}
function ssStatsInput(code){
  if(view!=='stats'||!ssStats.edit)return false;
  var e=ssStats.edit;
  if(code===27){ssStats.edit=null;ssStats.error='';applyKeyMode();}
  else if(code===13){if(e.field==='from'){e.field='to';e.replace=true;}else ssStatsApplyRange(e.from,e.to);}
  else if(code===9){e.field=e.field==='from'?'to':'from';e.replace=true;}
  else if(code===8){e[e.field]=e.replace?'':e[e.field].slice(0,-1);e.replace=false;}
  else if(code===45||(code>=48&&code<=57)){
    if(e.replace){e[e.field]='';e.replace=false;}
    if(e[e.field].length<10)e[e.field]+=String.fromCharCode(code);
  }
  repaintMain();return true;
}
function ssStatsActivate(item){
  if(item.settings){ssSend('settings');return;}
  if(item.tab){ssStats.tab=item.tab;ssStatsScroll=ssStatsScrollT=0;repaintMain();return;}
  if(item.days){var r=ssStatsRange(item.days);ssStatsApplyRange(r[0],r[1]);return;}
  if(item.field){
    if(!ssStats.edit)ssStats.edit={from:ssStats.from,to:ssStats.to};
    ssStats.edit.field=item.field;ssStats.edit.replace=true;applyKeyMode();repaintMain();return;
  }
  if(item.apply){var e=ssStats.edit;if(e)ssStatsApplyRange(e.from,e.to);return;}
  if(item.order){
    ssStats.ascending=item.order===ssStats.order?!ssStats.ascending:false;ssStats.order=item.order;ssStats.offset=0;
  }
  if(item.page)ssStats.offset=Math.max(0,ssStats.offset+item.page*ssStats.limit);
  ssStatsChanged();
}
function ssStatsPointerDown(x,y){
  ssStatsDown=view==='stats'?hit(HB_STATS,x,y):null;return !!ssStatsDown;
}
function ssStatsPointerUp(x,y){
  var item=ssStatsDown;ssStatsDown=null;
  if(!item)return false;
  if(view==='stats'&&!ssPopup&&!ssModal&&inRect(x,y,item))ssStatsActivate(item);
  return true;
}
