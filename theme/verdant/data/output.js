/* Native foobar output picker. Merely opening/reading the list never changes output. */
var ssOutputError='';
function ssOutputLabel(d){
  var n=d.name||'未命名设备';
  if(/ASIO|Null Output|DirectSound|Kernel Streaming|DSD/i.test(n)) return n;
  if(/\[exclusive\]|WASAPI.*exclusive|独占/i.test(n)) return 'WASAPI独占 · '+n;
  if(/WASAPI/i.test(n)) return n;
  return 'WASAPI共享 · '+n;
}
function ssParseOutputs(raw){
  try{
    var list=JSON.parse(raw);
    if(!Array.isArray(list)) return [];
    return list.filter(function(d){return d&&typeof d.name==='string'&&typeof d.output_id==='string'&&d.output_id&&typeof d.device_id==='string'&&d.device_id;});
  }catch(e){ return []; }
}
function ssShowOutputs(x,y){
  try{
    var list=ssParseOutputs(fb.GetOutputDevices()), menu=window.CreatePopupMenu(), active=0;
    if(!list.length){ menu.AppendMenuItem(1,1,'无法读取音频设备，请打开 foobar2000 输出设置。'); }
    for(var i=0;i<list.length;i++){
      menu.AppendMenuItem(0,i+1,ssOutputLabel(list[i]).replace(/&/g,'&&'));
      if(list[i].active) active=i+1;
    }
    if(active) menu.CheckMenuRadioItem(1,list.length,active);
    var id=menu.TrackPopupMenu(x,y);
    if(id>0&&id<=list.length){
      var d=list[id-1];
      if(!d.active) fb.SetOutputDevice(d.output_id,d.device_id);
    }
    ssOutputError='';
  }catch(e){ ssOutputError='输出切换失败：'+e.message; }
  repaintAll();
}
