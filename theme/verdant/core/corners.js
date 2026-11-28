// The cubic superellipse has zero curvature where it meets each straight edge.
// Cache the normalized quarter profile. GDI+ rasterizes the sampled outline in
// a single pass, so translucent hover and selection colors cannot overlap.
var ssCornerProfiles=Object.create(null);
function ssCornerDepth(u){ return 1-Math.cbrt(1-u*u*u); }
function ssContinuousRectPoints(x,y,w,h,rx,ry){
  var steps=Math.max(8,Math.min(32,Math.ceil(Math.sqrt(Math.max(rx,ry))*2)));
  var profile=ssCornerProfiles[steps];
  if(!profile){
    profile=[];
    for(var i=0;i<=steps;i++){
      var u=i===steps?1:Math.pow(Math.sin(i*Math.PI/(2*steps)),2/3);
      profile.push(u,ssCornerDepth(u));
    }
    ssCornerProfiles[steps]=profile;
  }
  var points=[],right=x+w,bottom=y+h;
  for(var corner=0;corner<4;corner++){
    for(var j=0;j<profile.length;j+=2){
      var u=profile[j],v=profile[j+1];
      if(corner===0)points.push(right-rx*(1-u),y+ry*v);
      else if(corner===1)points.push(right-rx*v,bottom-ry*(1-u));
      else if(corner===2)points.push(x+rx*(1-u),bottom-ry*v);
      else points.push(x+rx*v,y+ry*(1-u));
    }
  }
  return points;
}
function ssFillContinuousRect(gr,x,y,w,h,rx,ry,color){
  if(w<=0||h<=0)return;
  if(rx<=0||ry<=0){gr.FillSolidRect(x,y,w,h,color);return;}
  rx=Math.min(rx,w/2);ry=Math.min(ry,h/2);
  gr.FillPolygon(color,0,ssContinuousRectPoints(x,y,w,h,rx,ry));
}
function ssStrokeContinuousRect(gr,x,y,w,h,rx,ry,width,color){
  if(w<=0||h<=0||width<=0)return;
  if(rx<=0||ry<=0){gr.DrawRect(x,y,w,h,width,color);return;}
  rx=Math.min(rx,w/2);ry=Math.min(ry,h/2);
  gr.DrawPolygon(color,width,ssContinuousRectPoints(x,y,w,h,rx,ry));
}
// True circular-arc capsule for switches, pills and progress rails so ends stay semicircular.
var ssArcProfiles=Object.create(null);
function ssCapsulePoints(x,y,w,h){
  var r=Math.min(w,h)/2,steps=Math.max(10,Math.min(24,Math.ceil(r*1.5)));
  var profile=ssArcProfiles[steps];
  if(!profile){
    profile=[];
    for(var i=0;i<=steps;i++){
      var a=i*Math.PI/(2*steps);
      profile.push(Math.sin(a),1-Math.cos(a));
    }
    ssArcProfiles[steps]=profile;
  }
  var points=[],right=x+w,bottom=y+h;
  for(var corner=0;corner<4;corner++){
    for(var j=0;j<profile.length;j+=2){
      var u=profile[j],v=profile[j+1];
      if(corner===0)points.push(right-r*(1-u),y+r*v);
      else if(corner===1)points.push(right-r*v,bottom-r*(1-u));
      else if(corner===2)points.push(x+r*(1-u),bottom-r*v);
      else points.push(x+r*v,y+r*(1-u));
    }
  }
  return points;
}
function ssFillCapsule(gr,x,y,w,h,color){
  if(w<=0||h<=0)return;
  gr.FillPolygon(color,0,ssCapsulePoints(x,y,w,h));
}
function ssStrokeCapsule(gr,x,y,w,h,width,color){
  if(w<=0||h<=0||width<=0)return;
  var i=width/2,sw=w-width,sh=h-width;
  if(sw<=0||sh<=0)return;
  gr.DrawPolygon(color,width,ssCapsulePoints(x+i,y+i,sw,sh));
}
