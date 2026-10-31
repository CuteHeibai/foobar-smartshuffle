/* Disposable-host bitmap tests; no screen capture or input injection. */
(function(){
 var result={ok:false,checks:[],fonts:[]},saved={font:FONT,scale:UISCALE,view:view,tracks:songsTracks,hb:HB_TR,qhb:HB_Q,scene:ssSceneImage,rows:ssMainRows,index:ssMainIndex,artists:ssArtists,point:{x:mx,y:my},state:ssState,shuffle:pbShuffle,qscroll:ssQueueScroll,qtarget:ssQueueScrollT};
 function check(ok,name){if(!ok)throw Error(name);result.checks.push(name);}
 function colour(image,x,y,w,h){return image.Clone(x,y,w,h).GetColourScheme(1)[0]&0xffffff;}
 function white(value){return ((value>>16)&255)>240&&((value>>8)&255)>240&&(value&255)>240;}
 try{
  var bitmap=gdi.CreateImage(500,240),g=bitmap.GetGraphics();
  for(var n=0;n<3;n++){
   UISCALE=[1,1.5,2][n];FONT=ssCreateFonts();
   var font=ssFitFont(g,FONT.title,24),height=lineH(g,font);check(height<=24,'Actual title font fits 24px at scale '+UISCALE);result.fonts.push({scale:UISCALE,height:height});
   var initials=ssFitFont(g,FONT.title,24,'林俊',24);check(g.CalcTextWidth('林俊',initials)<=24&&lineH(g,initials)<=24,'Actual avatar initials fit both dimensions at scale '+UISCALE);
  }
  g.FillSolidRect(0,0,500,240,RGB(255,255,255));var layer=ssBeginViewport('render-test',g,20,100,200,60);layer.gr.FillSolidRect(-200,-100,1000,500,RGB(255,0,0));layer.gr.DrawString('测试',FONT.pl,COL.text,30,110,100,20,0);
  var cover=gdi.CreateImage(20,20),cg=cover.GetGraphics();cg.FillSolidRect(0,0,20,20,RGB(0,0,255));cover.ReleaseGraphics(cg);layer.gr.DrawImage(cover,75,135,20,20,0,0,20,20);layer.finish();bitmap.ReleaseGraphics(g);
  check(white(colour(bitmap,20,50,200,20)),'Viewport preserves all header pixels above the list');check(white(colour(bitmap,20,180,200,20)),'Viewport preserves pixels below the list');
  var red=colour(bitmap,150,110,40,40);check(((red>>16)&255)>220&&((red>>8)&255)<40&&(red&255)<40,'Viewport still draws its own row content');
  var blue=colour(bitmap,78,138,12,12);check((blue&255)>220&&((blue>>16)&255)<40,'Actual cover bitmap survives translated viewport drawing');
  view='songs';HB_TR=[0,1,2].map(function(i){return {songs:true,ti:i,x0:0,y0:i*50,x1:500,y1:(i+1)*50};});HB_Q=[];songsTracks=[0,1,2].map(function(i){return {h:{Path:'fixture'+i,SubSong:0}};});ssMainSelectionContext();
  ssMainSelect.start({index:0,x:10,y:10});ssMainSelect.end(10,10);ssMainSelect.start({index:1,x:10,y:60,shift:true});ssMainSelect.end(10,60);
  var scene=gdi.CreateImage(500,240),bg=scene.GetGraphics();bg.FillSolidRect(0,0,500,240,COL.base);scene.ReleaseGraphics(bg);ssSceneImage=scene;ssInteractionPainted=[];ssHoverPainted=null;mx=200;my=125;
  var frame=gdi.CreateImage(500,240),fg=frame.GetGraphics();fg.FillSolidRect(0,0,500,240,COL.base);ssPaintInteractions(fg);frame.ReleaseGraphics(fg);var before=colour(frame,50,10,100,20);
  for(n=0;n<40;n++){fg=frame.GetGraphics();ssPaintInteractions(fg);frame.ReleaseGraphics(fg);}check(before===colour(frame,50,10,100,20),'Forty actual bitmap paints retain identical selection opacity');
  ssState={round:1,remaining:Array.from({length:30},function(v,i){return {id:'queue'+i,title:'测试歌曲 '+i,artist:'歌手'};}),queue:[]};pbShuffle=true;ssQueueScroll=ssQueueScrollT=9;HB_Q=[];mx=100;my=300;
  var queueImage=gdi.CreateImage(320,600),qg=queueImage.GetGraphics();qg.FillSolidRect(0,0,320,600,COL.base);ssDrawNativeQueue(qg,{x:0,y:0,w:320,h:600},18,150,580);queueImage.ReleaseGraphics(qg);
  check(HB_Q[0].track_id==='queue0'&&HB_Q[0].y0===209&&HB_Q[HB_Q.length-1].y1===580,'Actual queue renderer retains and clips both partial edge rows');
  check(SS_QUEUE_SB&&SS_QUEUE_SB.maxPx>0,'Actual queue renderer exposes its own scroll thumb');
  var rounded=gdi.CreateImage(200,120),rg=rounded.GetGraphics();rg.FillSolidRect(0,0,200,120,COL.base);roundBottom(rg,0,0,200,120);rounded.ReleaseGraphics(rg);
  check(colour(rounded,0,119,1,1)===0&&colour(rounded,199,119,1,1)===0,'Composed panel retains black rounded bottom corners');
  result.ok=true;
 }catch(error){result.error=String(error);}
 FONT=saved.font;UISCALE=saved.scale;view=saved.view;songsTracks=saved.tracks;HB_TR=saved.hb;HB_Q=saved.qhb;ssSceneImage=saved.scene;ssMainRows=saved.rows;ssMainIndex=saved.index;ssArtists=saved.artists;mx=saved.point.x;my=saved.point.y;ssState=saved.state;pbShuffle=saved.shuffle;ssQueueScroll=saved.qscroll;ssQueueScrollT=saved.qtarget;ssInteractionPainted=[];ssHoverPainted=null;ssInvalidateSelections();repaintAll();
 utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\ui-render-test-result.json',JSON.stringify(result),false);
})();
