/* Disposable-host bitmap tests; no screen capture or input injection. */
(function(){
 var result={ok:false,checks:[],fonts:[]},saved={font:FONT,scale:UISCALE,view:view,tracks:songsTracks,hb:HB_TR,qhb:HB_Q,scene:ssSceneImage,rows:ssMainRows,index:ssMainIndex,artists:ssArtists,point:{x:mx,y:my},state:ssState,shuffle:pbShuffle,qscroll:ssQueueScroll,qtarget:ssQueueScrollT};
 function check(ok,name){if(!ok)throw Error(name);result.checks.push(name);}
 function colour(image,x,y,w,h){return image.Clone(x,y,w,h).GetColourScheme(1)[0]&0xffffff;}
 function white(value){return ((value>>16)&255)>240&&((value>>8)&255)>240&&(value&255)>240;}
 try{
  var bitmap=gdi.CreateImage(500,240),g=bitmap.GetGraphics();
  result.font_family=FONT.rowTitle.Name;check(FONT.rowTitle.Name==='Inter','Actual theme resolves the bundled Inter font family');
  check(ssScriptFont('中文歌曲',FONT.rowTitle).Name==='Microsoft YaHei UI','Chinese resolves to an explicit sans serif family instead of a KaiTi fallback');
  var aa=gdi.CreateImage(300,60),ag=aa.GetGraphics();ag.FillSolidRect(0,0,300,60,COL.base);tL(ag,'English antialias Aa',FONT.rowTitle,RGB(255,255,255),8,8,280,40);aa.ReleaseGraphics(ag);
  check(aa.GetColourScheme(32).some(function(c){var v=c&255;return v>35&&v<220;}),'English glyph edges contain antialiasing coverage in the actual bitmap');
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
  var oldR=R;R={main:{x:0,y:0,w:500,h:200},queue:{x:510,y:0,w:300,h:200}};HB_TR=[0,1,2].map(function(i){return {songs:true,ti:i,x0:0,y0:i*50,x1:500,y1:(i+1)*50};});HB_Q=[];ssMainSelect.cancel();ssMainSelect.setContext({kind:'track',key:'raster-hover',items:[],rows:[]});ssInteractionPainted=[];ssInteractionDamage=[];ssHoverPainted=null;
  var clean=gdi.CreateImage(500,240),cl=clean.GetGraphics();cl.FillSolidRect(0,0,500,240,COL.base);for(n=0;n<3;n++)cl.FillSolidRect(150,n*50+20,80,8,RGB(250,250,250));clean.ReleaseGraphics(cl);ssSceneImage=clean;mx=200;my=10;
  fg=frame.GetGraphics();fg.DrawImage(clean,0,0,500,240,0,0,500,240);ssPaintInteractions(fg);frame.ReleaseGraphics(fg);my=110;
  fg=frame.GetGraphics();fg.FillSolidRect(0,0,500,150,COL.black);ssPaintInteractions(fg);frame.ReleaseGraphics(fg);check(white(colour(frame,160,70,50,8)),'Hover jump redraws skipped row pixels after a cleared damage band');
  my=10;fg=frame.GetGraphics();ssPaintInteractions(fg);frame.ReleaseGraphics(fg);ssQueueInteractionDamage({x:0,y:100,w:500,h:50});fg=frame.GetGraphics();fg.FillSolidRect(0,0,500,150,COL.black);ssPaintInteractions(fg);frame.ReleaseGraphics(fg);check(white(colour(frame,160,120,50,8)),'Pointer reversal restores pixels from previously queued hover damage');
  ssQueueInteractionDamage(R.main);fg=frame.GetGraphics();fg.FillSolidRect(0,0,500,200,COL.black);ssPaintInteractions(fg);frame.ReleaseGraphics(fg);check(white(colour(frame,160,70,50,8))&&white(colour(frame,160,120,50,8)),'Drag repaint retains every unrelated song row in the cleared panel');R=oldR;
  var oldAppearance=SS_APPEARANCE;ssApplyAppearance('light');
  var lightImage=gdi.CreateImage(500,300),lg=lightImage.GetGraphics();lg.FillSolidRect(0,0,500,300,COL.black);panelBg(lg,{x:10,y:10,w:470,h:270},COL.base);lightImage.ReleaseGraphics(lg);
  check(colour(lightImage,50,50,30,30)===0xffffff,'Actual light panel uses an opaque white surface');
  var corner=colour(lightImage,10,10,1,1),canvas=colour(lightImage,0,0,1,1);
  check(corner===canvas,'Light rounded corners match an actual opaque canvas sample ('+corner.toString(16)+' / '+canvas.toString(16)+')');
  var grid=ssGradientGrid(200);check((colour(grid,10,10,10,10)&255)>180,'Preference grid rebuilds with the light pastel gradient');
  var oldPopup=ssPopup;ssPopup={x:20,y:60,levels:[{items:[{label:'浅色菜单'}],scroll:0,selected:-1}]};lg=lightImage.GetGraphics();ssDrawPopup(lg);lightImage.ReleaseGraphics(lg);
  check(colour(lightImage,35,65,4,4)===0xffffff,'Actual nested-menu renderer uses the light popup surface');ssPopup=oldPopup;
  var splitImage=gdi.CreateImage(W,H),splitG=splitImage.GetGraphics(),oldModal=ssModal,oldFs=fsMode;
  ssModal=false;fsMode=false;splitG.FillSolidRect(0,0,W,H,COL.base);ssDrawResizers(splitG);splitImage.ReleaseGraphics(splitG);
  var sx=Math.round(R.main.x-M.gap/2),sy=Math.round(R.top.y+36);
  result.splitter_pixels=[colour(splitImage,sx-1,sy,1,5),colour(splitImage,sx,sy,1,5),colour(splitImage,sx+1,sy,1,5),COL.splitter&0xffffff];
  // GetColourScheme quantizes colours; verify strong coverage and untouched
  // adjacent pixels rather than comparing its palette entry to an exact RGB.
  var splitColour=result.splitter_pixels[1];
  check(((splitColour>>16)&255)<190&&((splitColour>>8)&255)<190&&(splitColour&255)<190&&result.splitter_pixels[0]===0xffffff&&result.splitter_pixels[2]===0xffffff,'Light splitter remains one strong pixel wide without pointer hover');
  check(Math.abs(ssTransportLayout(W,80,W-140,1).center-W/2)<=1,'Transport geometry stays at the whole-window midpoint with asymmetric side widths');
  ssModal=oldModal;fsMode=oldFs;ssApplyAppearance(oldAppearance);
  check(COL.base===(oldAppearance==='light'?ssPalette('light'):ssPalette('dark')).base,'Returning to the previous appearance restores its palette');
  var draftSaved=ssDraft,trailSaved=ssTrail,staticDraw=drawPreference,staticCount=0;
  ssDraft={x:0,y:0};ssTrail=[];ssDropModalImage();drawPreference=function(gr,only){staticCount++;return staticDraw(gr,only);};
  var modalImage=gdi.CreateImage(W,H),modalG=modalImage.GetGraphics();ssPaintModal(modalG,true);modalImage.ReleaseGraphics(modalG);
  var stable=colour(modalImage,4,4,4,4),started=Date.now();
  for(n=0;n<40;n++){ssDraft={x:(n%8)/100,y:0};ssPreferencePartial=true;ssPreferenceFrameAt=Date.now();modalG=modalImage.GetGraphics();ssPaintModal(modalG,false);modalImage.ReleaseGraphics(modalG);}
  result.warm_modal_frame_ms=(Date.now()-started)/40;
  check(staticCount===1,'Forty actual ball frames reuse the static panel typography and controls');
  check(colour(modalImage,4,4,4,4)===stable,'Actual cached ball frames retain the dimmed background without opacity accumulation');
  drawPreference=staticDraw;ssDropModalImage();ssDraft=draftSaved;ssTrail=trailSaved;
  var oldNP=NP,allowMarquee=ssFooterMarqueeAllowed;NP={RawPath:'fixture-long-title',SubSong:0};ssFooterMarqueeAllowed=function(){return true;};
  var footer=gdi.CreateImage(400,80),footerG=footer.GetGraphics(),longTitle='Long English title 中文歌曲名称 '.repeat(5);footerG.FillSolidRect(0,0,400,80,RGB(255,0,255));
  ssDrawFooterTitle(footerG,longTitle,FONT.npTitle,COL.text,30,20,140,28);var titleBitmap=ssFooterMarquee.image;ssFooterMarquee.started-=2500;ssDrawFooterTitle(footerG,longTitle,FONT.npTitle,COL.text,30,20,140,28);footer.ReleaseGraphics(footerG);
  check(ssFooterMarquee.offset>0&&ssFooterMarquee.image===titleBitmap,'Actual long-title marquee scrolls using one cached text bitmap');
  check(colour(footer,171,20,20,28)===0xff00ff&&colour(footer,5,20,20,28)===0xff00ff,'Actual marquee crop keeps every pixel outside the title viewport unchanged');
  ssStopFooterMarquee();NP=oldNP;ssFooterMarqueeAllowed=allowMarquee;
  for(var pi=0;pi<plman.PlaylistCount;pi++){if(isHiddenPl(plman.GetPlaylistName(pi)))continue;var handles=plman.GetPlaylistItems(pi);if(handles.Count>=2){result.context={playlist:pi,items:[0,1],tracks:[ssTrackID(handles[0]),ssTrackID(handles[1])],path:handles[0].Path,raw:handles[0].RawPath};break;}}
  check(!!result.context,'Real JSplitter handles supply a native playlist context payload');result.ok=true;
 }catch(error){if(typeof oldR!=="undefined")R=oldR;result.error=String(error);}
 FONT=saved.font;UISCALE=saved.scale;view=saved.view;songsTracks=saved.tracks;HB_TR=saved.hb;HB_Q=saved.qhb;ssSceneImage=saved.scene;ssMainRows=saved.rows;ssMainIndex=saved.index;ssArtists=saved.artists;mx=saved.point.x;my=saved.point.y;ssState=saved.state;pbShuffle=saved.shuffle;ssQueueScroll=saved.qscroll;ssQueueScrollT=saved.qtarget;ssInteractionPainted=[];ssHoverPainted=null;ssInvalidateSelections();repaintAll();
 utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\ui-render-test-result.json',JSON.stringify(result),false);
})();
