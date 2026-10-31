/* Verdant MIT adaptation: ordering belongs to foo_smartshuffle. */

/* The slider's full position is VOL_CEIL dB rather than foobar's 0 dB (see core/props.js, where
   the property is read and defaults to 0 = no change). The curve itself is untouched -- still
   10 dB per halving of the slider, only shifted down -- so the control feels the same at any
   ceiling, and at the default these are exactly the functions they always were. */
function vol2pos(v){ return Math.pow(2, (v-VOL_CEIL)/10); }                                        // dB(-100..VOL_CEIL) -> 0..1
function pos2vol(p){ return p<=0?-100:Math.max(-100,Math.min(VOL_CEIL,10*Math.log(p)/Math.LN2+VOL_CEIL)); } // 0..1 -> dB
/* foobar remembers its volume across restarts and its own menu/keys are not bound by the ceiling,
   so a session left louder than it is pulled back down once at load. Only at load: fighting
   foobar's native controls on every change would make them look broken. A no-op at the default. */
function capVolume(){ try{ if(fb.Volume>VOL_CEIL) fb.Volume=VOL_CEIL; }catch(e){} }
function readOrder(){ try{ return plman.PlaybackOrder; }catch(e){ return 0; } }
function setOrder(o){ try{ plman.PlaybackOrder=o; }catch(e){} }
// Native repeat-one remains an explicit exception to intelligent ordering.
var pbShuffle=true, pbRepeat=0;
function applyPlaybackOrder(){ setOrder(pbRepeat===2?2:(pbRepeat===1?1:0)); }
function syncOrderFromFb(){ var o=readOrder(); pbRepeat=o===2?2:(o===1?1:0); }
function toggleShuffle(){ ssSend('enable',{enabled:!pbShuffle}); repaintAll(); }
function cycleRepeat(){ pbRepeat=(pbRepeat+1)%3; applyPlaybackOrder(); }
var ROUTE='__verdant_np__', SHUF='__smartshuffle__';
function isHiddenPl(nm){ return nm===SHUF; }
function playlistOfName(nm){ for(var i=0;i<plman.PlaylistCount;i++) if(plman.GetPlaylistName(i)===nm) return i; return -1; }
function sameHandle(a,b){ return !!(a&&b&&a.Path===b.Path&&a.SubSong===b.SubSong); }
function playPlaylistItem(pl,item){
  if(pbShuffle) ssSend('play',{playlist:pl,item:item});
  else plman.ExecutePlaylistDefaultAction(pl,item);
}
function playQueueNext(pl,item){ playPlaylistItem(pl,item); }
function playQueueItem(qi){
  var c=null; try{ c=plman.GetPlaybackQueueContents(); }catch(e){}
  if(!c||qi>=c.length) return;
  var it=c[qi]; try{ plman.RemoveItemFromPlaybackQueue(qi); }catch(e){}
  if(it.PlaylistIndex>=0&&it.PlaylistItemIndex>=0) playPlaylistItem(it.PlaylistIndex,it.PlaylistItemIndex);
  else if(it.Handle) playHandleList([it.Handle],0);
}
function npIsShuffleOf(name){ return !!(pbShuffle&&NP&&ssState&&ssState.source_name===name); }
