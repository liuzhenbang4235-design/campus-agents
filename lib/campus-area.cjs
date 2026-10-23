'use strict';
function containsPoint(point,ring){
 if(!point||!Number.isFinite(point.lng)||!Number.isFinite(point.lat)||!Array.isArray(ring)||ring.length<4)return false;
 if(ring[0].lng!==ring.at(-1).lng||ring[0].lat!==ring.at(-1).lat)return false;
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i];if(!Number.isFinite(a.lng)||!Number.isFinite(a.lat)||!Number.isFinite(b.lng)||!Number.isFinite(b.lat))return false;
  const cross=(point.lng-a.lng)*(b.lat-a.lat)-(point.lat-a.lat)*(b.lng-a.lng);
  if(Math.abs(cross)<1e-12&&point.lng>=Math.min(a.lng,b.lng)&&point.lng<=Math.max(a.lng,b.lng)&&point.lat>=Math.min(a.lat,b.lat)&&point.lat<=Math.max(a.lat,b.lat))return true;
  if((a.lat>point.lat)!==(b.lat>point.lat)&&point.lng<(b.lng-a.lng)*(point.lat-a.lat)/(b.lat-a.lat)+a.lng)inside=!inside;
 }return inside;
}
function campusHint(point,areas){const matches=areas.filter(a=>containsPoint(point,a.ring));return matches.length===1?{name:matches[0].name,sourceUrl:matches[0].sourceUrl,checkedAt:matches[0].checkedAt}:null;}
module.exports={containsPoint,campusHint};
