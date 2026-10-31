/* Test-player only: exercise the actual JSplitter bitmap API without desktop input. */
(function(){
 var saved=ssArtists,result={ok:false,images:[],dispose_supported:null};
 try{
  var input=JSON.parse(utils.ReadTextFile(fb.ProfilePath+'smartshuffle\\portrait-test-input.json',65001));
  var probe=gdi.Image(input[0].portrait);result.dispose_supported=typeof probe.Dispose==='function';
  ssArtists={};ssArtistImages={};
  for(var i=0;i<input.length;i++){
   var name='Fixture '+i;ssArtists[name]={verified:true,name:name,portrait:input[i].portrait};
   var image=gdi.CreateImage(64,64),graphics=image.GetGraphics();ssDrawArtistAvatar(graphics,0,0,64,name);image.ReleaseGraphics(graphics);
   var loaded=!!ssArtistImages[name+'|64'];if(!loaded)throw Error('Portrait did not reach the bitmap renderer: '+i);
   result.images.push({index:i,loaded:loaded,width:image.Width,height:image.Height});
  }
  var names=libTF('artistName');ssArtists={};if(names.length)ssArtists[names[0]]={verified:true,name:names[0]};artistList=null;
  var list=getArtistList();if(list.some(function(a){return !ssArtistRecord(a.name);}))throw Error('Unconfirmed artist is still listed');
  result.filtered_artists=list.length;result.ok=true;
 }catch(error){result.error=String(error);}
 ssArtists=saved;ssArtistImages={};artistList=null;artistTracksMap=null;artistCandCache={};artCardCache={};artCardN=0;
 utils.WriteTextFile(fb.ProfilePath+'smartshuffle\\portrait-test-result.json',JSON.stringify(result),false);
})();
