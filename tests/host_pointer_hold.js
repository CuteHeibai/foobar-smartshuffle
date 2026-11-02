/* Real script timers, ordinary SDK playlist and GDI painting; no input injection. */
(function(){
 var result={ok:false,checks:[]},oldView=view,oldActive=plman.ActivePlaylist,pi=-1,limit=Date.now()+12000,original=[];
 function check(value,label){if(!value)throw Error(label);result.checks.push(label);}
 function finish(error){
  if(error)result.error=String(error);
  try{ssCancelSelectionGesture();if(oldActive>=0&&oldActive<plman.PlaylistCount)plman.ActivePlaylist=oldActive;if(pi>=0&&pi<plman.PlaylistCount&&plman.GetPlaylistName(pi)==='Mode acceptance hold timer')plman.RemovePlaylist(pi);view=oldView;repaintAll();}catch(cleanup){result.cleanup=String(cleanup);}
  utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\hold-drag-host-result.json',JSON.stringify(result),false);
 }
 function frame(){var image=gdi.CreateImage(W,H),gr=image.GetGraphics();try{on_paint(gr);}finally{image.ReleaseGraphics(gr);}return image;}
 function waitOrder(){try{
  var list=plman.GetPlaylistItems(pi);
  if(list.Count===3&&ssTrackID(list[0])===original[1]&&ssTrackID(list[1])===original[0]){
   check(true,'Ordinary playlist drop executes the real native reorder command');result.ok=true;finish();return;
  }
  if(Date.now()>limit)throw Error('Native reorder did not match the held row drop: '+ssError);
  window.SetTimeout(waitOrder,60);
 }catch(error){finish(error);}}
 function moved(){try{
  check(ssSelectOwner&&ssSelectOwner.preview().mode==='reorder','A real script hold timer lifts an ordinary playlist row');
  var rows=HB_TR.filter(function(r){return r.pl===pi;});check(rows.length>=2,'Ordinary playlist rows remain visible while held');
  var destination=rows[1],x=destination.x0+80,y=destination.y1-2;
  ssSelectionMove(x,y,1);var image=frame();
  check(ssDragOverlay&&ssDragOverlay.image,'The held row is copied into a real GDI drag overlay');
  ssSelectionUp(x,y);check(!ssSelectOwner&&!ssSelectLeftDown,'Release clears pointer ownership and hold state');
  waitOrder();
 }catch(error){finish(error);}}
 function ready(){try{
  if(Date.now()>limit)throw Error('Ordinary playlist never became ready');
  frame();var info=ssPlaylistInfo(pi),rows=HB_TR.filter(function(r){return r.pl===pi;});
  if(!info||!info.writable||rows.length<3){window.SetTimeout(ready,60);return;}
  original=[];var handles=plman.GetPlaylistItems(pi);for(var i=0;i<handles.Count;i++)original.push(ssTrackID(handles[i]));
  var row=rows[0];result.key_poll=utils.IsKeyPressed(1);ssSelectionDown(row.x0+80,(row.y0+row.y1)/2);
  check(!!ssSelectOwner,'Ordinary playlist receives and owns the pointer-down event');window.SetTimeout(moved,220);
 }catch(error){finish(error);}}
 function start(){try{
  var library=fb.GetLibraryItems();if(library.Count<3){if(Date.now()>limit)throw Error('Disposable library did not load');window.SetTimeout(start,80);return;}
  check(true,'Disposable SDK library supplies three handles');
  var selected=fb.CreateHandleList();for(var i=0;i<3;i++)selected.Add(library[i]);
  pi=plman.FindOrCreatePlaylist('Mode acceptance hold timer',true);plman.ClearPlaylist(pi);plman.InsertPlaylistItems(pi,0,selected,false);plman.ActivePlaylist=pi;
  view='playlist';plSort='manual';plSortDir='asc';firstRow=firstRowT=0;repaintAll();window.SetTimeout(ready,80);
 }catch(error){finish(error);}}
 window.SetTimeout(start,80);
})();
