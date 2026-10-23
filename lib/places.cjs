'use strict';
const crypto=require('node:crypto');
const {dataset,searchLocal}=require('./local-places.cjs');
class PlacesError extends Error { constructor(message,status=502){super(message);this.status=status;this.code='PLACES_ERROR'} }
function text(value,max=200){return typeof value==='string'?value.slice(0,max):''}
function point(value){
 if(typeof value!=='string'||!/^[-\d.]+,[-\d.]+$/.test(value))return null;
 const [lng,lat]=value.split(',').map(Number);return Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90?{lng,lat}:null;
}
function distance(a,b){const rad=n=>n*Math.PI/180;const x=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return Math.round(6371000*2*Math.asin(Math.sqrt(Math.min(1,x))))}
function mapUrl(name,address){return 'https://uri.amap.com/search?'+new URLSearchParams({keyword:name+' '+address,city:'扬州',view:'list',src:'campus-agent',callnative:'0'})}
async function fetchPlaces(config,query,fetchImpl=fetch){
 const url=new URL('https://restapi.amap.com/v3/place/'+(query.center?'around':'text'));
 url.search=new URLSearchParams({key:config.apiKey,keywords:query.keyword,city:'扬州',citylimit:'true',offset:'10',page:'1',extensions:'all',output:'JSON',...(query.center?{location:query.center.lng.toFixed(6)+','+query.center.lat.toFixed(6),radius:String(query.radius)}:{})}).toString();
 let data;
 try{
  const response=await fetchImpl(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new PlacesError('地图服务暂不可用，请稍后重试。');
  let length=0;const parts=[];for await(const part of response.body){length+=part.length;if(length>600000)throw new PlacesError('地图返回内容过大，请缩小查询范围。');parts.push(part)}
  data=JSON.parse(Buffer.concat(parts).toString('utf8'));
 }catch(e){if(e instanceof PlacesError)throw e;throw new PlacesError('无法连接高德地图，或返回格式异常。请检查网络后重试。')}
 if(String(data.status)!=='1'){
  // Never relay the upstream payload: it may contain the request URL/key.
  const code=String(data.infocode||'');
  if(['10001','10007','10009','10013'].includes(code))throw new PlacesError('高德 Key 无效、已过期或类型不符，请检查 Web 服务 Key。');
  if(['10002','10003','10004','10010','10014','10044','10045'].includes(code))throw new PlacesError('高德服务权限、配额或账户状态不足，请在高德控制台检查。');
  throw new PlacesError('高德未完成查询，请检查服务权限和查询条件。');
 }
 if(!Array.isArray(data.pois))throw new PlacesError('地图返回格式异常，请稍后重试。');
 const seen=new Set();return data.pois.slice(0,25).flatMap(p=>{
  if(!p||typeof p!=='object')return[];
  const name=text(p.name,100),address=text(p.address),city=text(p.cityname,50),id=text(p.id,80),location=point(p.location);
  if(!name||!id||seen.has(id)||city&&!city.includes('扬州')||query.center&&!location)return[];seen.add(id);
  const distanceMeters=query.center&&location?distance(query.center,location):null;
  if(distanceMeters!==null&&distanceMeters>query.radius)return[];
  return[{id,name,address,city:city||'扬州',district:text(p.adname,50),telephone:text(p.tel,100),category:text(p.type,100),location,distanceMeters,mapUrl:mapUrl(name,address)}];
 }).sort((a,b)=>query.center?(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity):0).slice(0,10);
}

// Public landmark selections and temporary search results are session scoped.
// Only explicit search inputs reach AMap; no chat messages or campus files do.
function createPlacesService({getConfig,consume,fetchImpl,now=Date.now,localDataset=dataset}){
 const caches=new WeakMap(),inflight=new WeakSet();
 function state(session){let s=caches.get(session);if(!s){s={centers:new Map(),contexts:new Map()};caches.set(session,s)}
  for(const map of [s.centers,s.contexts])for(const[k,v]of map)if(v.expires<=now())map.delete(k);return s;
 }
 function reset(session){caches.delete(session)}
 function keyword(value){if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw new PlacesError('请输入 1—80 字的地点或搜索关键词。',400);return value.trim()}
 // Amap is optional. With no usable Web service key, stay on the local snapshot.
 function config(provider='amap'){const c={...getConfig()};if(provider==='amap'&&!(c.enabled===true&&c.apiKey))provider='local';c.provider=provider;if(provider==='local'){if(!localDataset?.places?.length)throw new PlacesError('本地点位库暂不可用。',503);return c}if(provider!=='amap')throw new PlacesError('地点来源无效。',400);return c}
 async function run(session,input,centers=false){
  const c=config(input.provider||'amap'),q=keyword(input.keyword),s=state(session),actor=session.actor;if(c.provider==='amap'&&input.consent!==true)throw new PlacesError('请确认将关键词和选定地点发送给高德。',400);
  if(inflight.has(session))throw new PlacesError('上一条地图查询仍在处理中，请稍等。',409);
  let center=null,radius=null;
  if(!centers&&input.scope==='nearby'){
   center=s.centers.get(input.centerToken);if(!center||center.actor!==session.actor||center.revision!==c.revision||center.provider!==c.provider)throw new PlacesError('请重新查找并选择一个有效的出发地点。',400);
   radius=Number(input.radius);if(![1000,3000,5000,10000].includes(radius))throw new PlacesError('查询半径无效。',400);
  }else if(!centers&&input.scope!=='city')throw new PlacesError('请选择扬州全市或附近查询。',400);
  if(c.provider==='amap')consume();inflight.add(session);
  try{
   const places=c.provider==='local'?searchLocal(localDataset,{keyword:q,center:center?.place.location,radius,centers},distance):await fetchPlaces(c,{keyword:q,center:center?.place.location,radius},fetchImpl);
   if(c.revision!==getConfig().revision||actor!==session.actor||caches.get(session)!==s)throw new PlacesError('地图设置或身份在查询期间发生变化，请重试。',409);
   const checkedAt=new Date(now()).toISOString(),expires=now()+10*60*1000;
   if(centers){
    s.centers.clear();const results=places.filter(p=>p.location).map(place=>{const token=crypto.randomUUID();s.centers.set(token,{place,expires,actor:session.actor,revision:c.revision,provider:c.provider});const {location,...visible}=place;return{...visible,token}});
    return{centers:results,checkedAt};
   }
   // Keep only the latest search per session. It expires after 10 minutes.
   s.contexts.clear();const token=crypto.randomUUID();const visible=places.map(({location,...p})=>p);
   const result={places:visible,keyword:q,checkedAt,expiresAt:new Date(expires).toISOString(),scope:input.scope,centerName:center?.place.name||null,radius,contextToken:places.length?token:null,provider:c.provider,...(c.provider==='local'?{dataUpdatedAt:localDataset.collectedAt,scopeNotice:localDataset.scope,attribution:localDataset.attribution}: {})};
   if(places.length)s.contexts.set(token,{result,expires,actor:session.actor,revision:c.revision});return result;
  }finally{inflight.delete(session)}
 }
 function sources(session,token){
  const entry=state(session).contexts.get(token);if(!entry)throw new PlacesError('地点结果已过期或不可用，请先重新查询地点。',400);const c=config(entry.result.provider);
  if(entry.actor!==session.actor||entry.revision!==c.revision)throw new PlacesError('地点结果已过期或不可用，请先重新查询地点。',400);
  const result=entry.result;
  const beijing=value=>new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）';
  if(result.provider==='local')return result.places.map((p,i)=>({docId:'map:'+token+':'+i,title:p.name,source:'OpenStreetMap本地公开点位快照 · © OpenStreetMap contributors · ODbL',sourceType:'map',mapProvider:'local',sourceUrl:p.mapUrl,date:beijing(result.dataUpdatedAt),excerpt:JSON.stringify({名称:p.name,地址:p.address||'未提供',类别:p.category,校园范围线索:p.campusHint?{名称:p.campusHint.name,依据:p.campusHint.sourceUrl,说明:'根据社区地图代表点和校园多边形推测，非官方校界确认，不代表可以进入'}:'未匹配已采集校界，不能据此断言在校外或对公众开放',中心地点:result.centerName||'已收录扬州城区地点',直线距离米:p.distanceMeters,采集日期:beijing(result.dataUpdatedAt),检索时间:beijing(result.checkedAt),覆盖范围:result.scopeNotice,说明:'社区标注的本地采集快照，不是实时高德查询，不代表全量最近。坐标为代表点而非出入口，直线距离不是步行路程。周边地点可能位于其他学校或单位内部，名称和距离不能证明可进入或提供快递代收服务。未逐店核对营业、价格、预约、公众准入；空结果只表示未收录，不能断言附近没有。'})}));
  return result.places.map((p,i)=>({docId:'map:'+token+':'+i,title:p.name,source:'高德地图查询结果（临时数据，未经知识库审核）',sourceType:'map',sourceUrl:p.mapUrl,date:result.checkedAt,excerpt:JSON.stringify({名称:p.name,地址:p.address||'未提供',区域:p.district,类别:p.category,电话:p.telephone||'未提供',中心地点:result.centerName||'扬州全市',直线距离米:p.distanceMeters,查询时间:result.checkedAt,说明:'只是在本次返回结果中排序，不代表全量最近。直线距离不是步行路程；营业、价格、排队和预约未核实，不得声称实时在营业。'})}));
 }
 return {run,sources,reset};
}
module.exports={PlacesError,fetchPlaces,createPlacesService,point,distance};
