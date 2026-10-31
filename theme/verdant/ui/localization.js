var ssLabels={};
try{ssLabels=JSON.parse(utils.ReadTextFile(fb.ProfilePath+'verdant\\locale\\zh-CN.json',65001).replace(/^\uFEFF/,''));}catch(e){}
function ssLocalLabel(label){
  var text=String(label),plain=text.replace(/&&/g,'\u0001').replace(/&/g,'').replace(/\u0001/g,'&');
  if(ssLabels.hasOwnProperty(text))return ssLabels[text];if(ssLabels.hasOwnProperty(plain))return ssLabels[plain];
  var dots=plain.replace(/…$/,'...');return ssLabels.hasOwnProperty(dots)?ssLabels[dots]:text;
}
