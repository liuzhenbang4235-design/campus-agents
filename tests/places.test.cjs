'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs'),{fetchPlaces,createPlacesService}=require('../lib/places.cjs');
const poi=(i,location='119.400000,32.400000')=>({id:'B'+i,name:'测试地点'+i,address:'测试路'+i+'号',cityname:'扬州市',adname:'邗江区',location,tel:[],type:'餐饮服务'});
const response=(pois)=>new Response(JSON.stringify({status:'1',pois}));
async function setup(t,placesFetchImpl,fetchImpl){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-places-test-'));const app=createApp({dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),placesFetchImpl,fetchImpl});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));assert(path.resolve(dir).startsWith(path.join(os.tmpdir(),'campus-places-test-')));fs.rmSync(dir,{recursive:true,force:true})});
 function client(){let cookie='';return async(route,b)=>{const r=await fetch(base+'/api/'+route,{method:b?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-Campus-Client':'1'},body:b?JSON.stringify(b):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,...await r.json()}}}
 const request=client();return{request,client,base,dir};
}
async function enable(request,dailyLimit=50){await request('session',{profile:'admin'});const r=await request('places/config',{apiKey:'map-test-key-only',enabled:true,dailyLimit,consent:true});assert.equal(r.status,200)}

test('map settings require admin and keep the map key separate from model settings and responses',async t=>{
 const {request,dir,base}=await setup(t,()=>{throw Error('no automatic request')});
 assert.equal((await request('places/config',{apiKey:'test-only'})).status,403);await enable(request);
 assert(!JSON.stringify(await request('state')).includes('map-test-key-only'));
 await request('config',{apiKey:'model-test-key-only',model:'ep-test',enabled:true,dailyLimit:50,consent:true});
 const config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));assert.equal(config.places.apiKey,'map-test-key-only');assert.equal(config.apiKeys[config.provider],'model-test-key-only');assert.equal(config.apiKey,undefined);
 assert.equal((await fetch(base+'/config.local.json')).status,404);
 assert.equal((await request('places/search',{keyword:'咖啡',scope:'city'})).status,400);
 assert.equal((await request('state')).ai.places.usedToday,0);
});

test('city and nearby use only fixed AMap endpoints and explicitly selected public centers',async t=>{
 const urls=[];const {request}=await setup(t,async url=>{urls.push(new URL(url));return response(url.includes('/around?')?[poi(1,'119.400000,32.400000'),poi(2,'119.500000,32.500000'),poi(3,'')]:[poi(0)])});await enable(request);
 const c=await request('places/centers',{keyword:'学院',consent:true});assert.equal(c.centers.length,1);assert(!Object.hasOwn(c.centers[0],'location'));
 assert.equal((await request('places/search',{keyword:'咖啡',scope:'nearby',centerToken:'forged',radius:1000,consent:true})).status,400);
 const r=await request('places/search',{keyword:'咖啡',scope:'nearby',centerToken:c.centers[0].token,radius:1000,consent:true});assert.equal(r.status,200);assert.deepEqual(r.places.map(p=>p.id),['B1']);assert.equal(r.places[0].distanceMeters,0);assert.equal(r.places[0].telephone,'');
 assert.equal(urls[0].origin,'https://restapi.amap.com');assert.equal(urls[0].searchParams.get('city'),'扬州');assert.equal(urls[0].searchParams.get('citylimit'),'true');assert.equal(urls[1].pathname,'/v3/place/around');assert.equal(urls[1].searchParams.get('location'),'119.400000,32.400000');assert(!urls[1].searchParams.has('question'));
 const s=await request('state');assert(!s.state.docs.some(d=>d.title==='测试地点1'));assert.equal(s.ai.places.usedToday,2);
});

test('tokens are scoped to the session and expire after ten minutes',async()=>{
 let now=1000;const service=createPlacesService({now:()=>now,getConfig:()=>({apiKey:'test-key',enabled:true,revision:0}),consume(){},fetchImpl:async()=>response([poi(1)])});const a={actor:'student'},b={actor:'student'};
 const r=await service.run(a,{keyword:'咖啡',scope:'city',consent:true});assert.equal(service.sources(a,r.contextToken).length,1);assert.throws(()=>service.sources(b,r.contextToken),/过期/);
 now+=600001;assert.throws(()=>service.sources(a,r.contextToken),/过期/);
});

test('identity and configuration changes discard an in-flight result',async()=>{
 for(const change of ['actor','revision']){
  let resolveFetch,revision=0;const s={actor:'student'};const service=createPlacesService({getConfig:()=>({apiKey:'test-key',enabled:true,revision}),consume(){},fetchImpl:()=>new Promise(r=>resolveFetch=r)});
  const pending=service.run(s,{keyword:'咖啡',scope:'city',consent:true});
  if(change==='actor'){s.actor='admin';service.reset(s)}else revision++;
  resolveFetch(response([poi(1)]));await assert.rejects(pending,/发生变化/);
 }
});

test('all displayed places can reach AI with explicit context and consent; keys do not',async t=>{
 let payload;const {request,client}=await setup(t,async()=>response(Array.from({length:10},(_,i)=>poi(i))),async(u,init)=>{payload=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'第十个是测试地点9。[10]',citations:[10]})}}]}))});
 await enable(request);await request('config',{apiKey:'model-test-key-only',model:'ep-test',enabled:true,dailyLimit:50,consent:true});
 const result=await request('places/search',{keyword:'咖啡',scope:'city',consent:true});
 assert.equal((await request('chat',{agentId:'life',question:'比较一下',placesContext:result.contextToken})).status,400);
 const another=client();assert.equal((await another('chat',{agentId:'life',question:'比较一下',placesContext:result.contextToken,cloudConsent:true})).status,400);
 const r=await request('chat',{agentId:'life',question:'第十个叫什么',placesContext:result.contextToken,cloudConsent:true});assert.equal(r.status,200);assert.equal(r.message.sources[0].sourceType,'map');assert.equal(r.message.sources[0].citation,10);assert.match(r.message.sources[0].sourceUrl,/^https:\/\/uri\.amap\.com\//);
 const sent=JSON.parse(payload.messages[1].content);assert.equal(sent.sources.filter(s=>s.kind==='map').length,10);assert(!JSON.stringify(payload).includes('map-test-key-only'));assert(!JSON.stringify(payload).includes('model-test-key-only'));
});

test('map quotas survive reset and errors cannot leak upstream credentials',async t=>{
 const {request}=await setup(t,async()=>new Response(JSON.stringify({status:'0',infocode:'10001',info:'map-test-key-only private upstream'})));await enable(request,1);
 const r=await request('places/search',{keyword:'咖啡',scope:'city',consent:true});assert.equal(r.status,502);assert(!JSON.stringify(r).includes('map-test-key-only'));assert.match(r.error,/Key/);
 await request('action',{action:'reset'});assert.equal((await request('places/search',{keyword:'咖啡',scope:'city',consent:true})).status,429);assert.equal((await request('state')).ai.places.usedToday,1);
});

test('map failure does not fabricate or reuse a stale successful result',async()=>{
 await assert.rejects(fetchPlaces({apiKey:'test-key'},{keyword:'咖啡'},async()=>{throw new Error('http://private?key=test-key')}),/无法连接/);
 await assert.rejects(fetchPlaces({apiKey:'test-key'},{keyword:'咖啡'},async()=>new Response('not json')),/格式异常/);
 assert.deepEqual(await fetchPlaces({apiKey:'test-key'},{keyword:'咖啡'},async()=>response([])),[]);
});

test('campus chat automatically uses local places, preserves manual contexts and never calls a map provider',async t=>{
 let modelCalls=0,payload;
 const {request}=await setup(t,()=>{throw Error('automatic lookup must stay local')},async(u,init)=>{modelCalls++;payload=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'根据本地快照查询附近地点。[1]',citations:[1]})}}]}))});
 const old=await request('places/search',{provider:'local',keyword:'咖啡',scope:'city'});assert(old.contextToken);
 await request('session',{profile:'admin'});await request('config',{apiKey:'test-only',model:'ep-test',enabled:true,dailyLimit:50,consent:true});
 const manual=await request('places/search',{provider:'local',keyword:'咖啡',scope:'city'});
 assert.equal((await request('chat',{agentId:'life',question:'通达附近有什么吃的？'})).status,400);assert.equal(modelCalls,0);
 const r=await request('chat',{agentId:'life',question:'通达附近有什么吃的？',cloudConsent:true});assert.equal(r.status,200);assert.equal(r.message.sources[0].mapProvider,'local');
 const sent=JSON.parse(payload.messages[1].content);assert(sent.sources.some(s=>s.kind==='map'));assert.equal((await request('state')).ai.places.usedToday,0);
 assert.equal((await request('chat',{agentId:'life',question:'看看这些地点',placesContext:manual.contextToken,cloudConsent:true})).status,200);
});

test('no matching local place reports a collection gap without calling the model or claiming none exist',async t=>{
 const {request}=await setup(t,()=>{throw Error('no map request')},()=>{throw Error('no model request for empty result')});
 const r=await request('chat',{agentId:'life',question:'学校附近哪里看电影？'});assert.equal(r.status,200);assert.equal(r.message.mode,'no_evidence');assert.match(r.message.text,/不能据此判断附近没有/);assert.deepEqual(r.message.sources,[]);
 const other=await request('chat',{agentId:'study',question:'通达附近有什么吃的？'});assert(!other.message.sources.some(s=>s.sourceType==='map'));
});

test('source provenance survives reject and resubmit and is sent to the model only after approval',async t=>{
 let sent;const {request}=await setup(t,()=>{throw Error('no map')},async(u,init)=>{sent=JSON.parse(JSON.parse(init.body).messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'该活动为历史商家宣传。[1]',citations:[1]})}}]}))});
 await request('session',{profile:'admin'});
 const body={action:'upload',agent:'life',title:'旧年测试餐馆活动',source:'商家抖音',content:'旧年测试餐馆活动现在需重新核实价格。',sourceUrl:'https://www.douyin.com/video/123',publishedAt:'2025-09-01',collectedAt:'2026-09-24',sourceKind:'merchant',cloudAllowed:true};
 assert.equal((await request('action',{...body,sourceUrl:'javascript:alert(1)'})).status,400);
 let r=await request('action',body);assert.equal(r.status,200);let d=r.state.docs.find(d=>d.title===body.title);assert.equal(d.status,'pending');
 await request('action',{action:'review',kind:'doc',id:d.id,decision:'reject',reason:'补充说明'});
 r=await request('action',{action:'editDoc',id:d.id,title:body.title,source:body.source,content:body.content});d=r.state.docs.find(x=>x.id===d.id);assert.equal(d.sourceUrl,body.sourceUrl);assert.equal(d.sourceKind,'merchant');assert.equal(d.status,'pending');
 await request('action',{action:'review',kind:'doc',id:d.id,decision:'approve'});
 await request('config',{apiKey:'test-only',model:'ep-test',enabled:true,dailyLimit:50,consent:true});
 r=await request('chat',{agentId:'life',question:'旧年测试餐馆活动',cloudConsent:true});assert.equal(r.status,200);const s=sent.sources.find(s=>s.title===body.title);assert.equal(s.publishedAt,'2025-09-01');assert.equal(s.collectedAt,'2026-09-24');assert.equal(s.sourceKind,'merchant');assert.equal(s.url,body.sourceUrl);
});
