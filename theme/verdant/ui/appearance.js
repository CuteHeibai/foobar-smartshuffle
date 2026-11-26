/* Theme colours are acknowledged by the native engine before becoming visible. */
function ssApplyAppearance(mode){
  if(mode!=='light'&&mode!=='dark')return false;
  if(mode===SS_APPEARANCE)return false;
  SS_APPEARANCE=mode;COL=ssPalette(mode);
  window.SetProperty('SmartShuffle: appearance',mode);
  if(ssStarted)ssSend('state',{theme_color:mode});
  if(typeof UIWizard!=='undefined'&&UIWizard)try{UIWizard.DarkMode=mode==='dark';}catch(e){}
  ssDropModalImage();ssDropSceneImage();
  if(typeof CORN!=='undefined')CORN=null;
  plCardCache={};artCardCache={};artCardN=0;skelImgs={};
  if(ssGridImage)try{ssGridImage.Dispose();}catch(e){}ssGridImage=null;ssGridSize=0;
  if(typeof VIZ_AXIS!=='undefined')VIZ_AXIS=ssInk(14);
  if(typeof VIZ_PEAK!=='undefined')VIZ_PEAK=blend(COL.green,COL.text,.22);
  ssNativeLyricKey='';ssSyncLyricPanel();ssSceneKey='';ssFadeStart=0;repaintAll();return true;
}
var ssReducedMotion=false;
try{ssReducedMotion=window.GetProperty('SmartShuffle: reduce motion',false)===true;}catch(e){}
function ssAppearanceMenuItems(){
  return [{label:'深色',icon:'moon',checked:SS_APPEARANCE==='dark',run:function(){ssSend('theme_appearance',{appearance:'dark'});}},
    {label:'浅色',icon:'sun',checked:SS_APPEARANCE==='light',run:function(){ssSend('theme_appearance',{appearance:'light'});}},
    {separator:true},{label:'减少动态效果',checked:ssReducedMotion,run:function(){
      ssReducedMotion=!ssReducedMotion;window.SetProperty('SmartShuffle: reduce motion',ssReducedMotion);
      ssFadeStart=0;repaintAll();
    }}];
}
