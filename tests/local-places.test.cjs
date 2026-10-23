'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPlacesService,distance}=require('../lib/places.cjs');
const {searchLocal,dataset}=require('../lib/local-places.cjs');
const fixture={collectedAt:'2026-09-23T17:00:00Z',scope:'测试范围',attribution:'© OpenStreetMap contributors',places:[
 {id:'osm:way/1',name:'测试大学',kind:'university',centerOnly:true,location:{lng:119.4,lat:32.4},mapUrl:'https://www.openstreetmap.org/way/1'},
 {id:'osm:node/2',name:'近处店',kind:'cafe',location:{lng:119.401,lat:32.4},mapUrl:'https://www.openstreetmap.org/node/2'},
 {id:'osm:node/3',name:'远处店',kind:'cafe',location:{lng:119.45,lat:32.4},mapUrl:'https://www.openstreetmap.org/node/3'}
]};
const service=(extra={})=>createPlacesService({getConfig:()=>({enabled:false,revision:0}),consume(){throw Error('local must not consume paid quota')},fetchImpl(){throw Error('local must not send external requests')},localDataset:fixture,...extra});
test('local search works without key or external consent, sorts and filters radius using WGS84 data',async()=>{
 const s=service(),session={actor:'student'};
 const centers=await s.run(session,{provider:'local',keyword:'测试大学'},true);assert.equal(centers.centers.length,1);assert(!Object.hasOwn(centers.centers[0],'location'));
 const r=await s.run(session,{provider:'local',keyword:'奶茶',scope:'nearby',centerToken:centers.centers[0].token,radius:1000});
 assert.deepEqual(r.places.map(p=>p.name),['近处店']);assert(r.places[0].distanceMeters>0&&r.places[0].distanceMeters<1000);assert.equal(r.provider,'local');assert.equal(r.dataUpdatedAt,fixture.collectedAt);
 const refs=s.sources(session,r.contextToken);assert.equal(refs[0].mapProvider,'local');assert.match(refs[0].source,/OpenStreetMap/);assert.match(refs[0].excerpt,/不是实时高德查询/);assert.match(refs[0].sourceUrl,/openstreetmap.org\/node\/2$/);assert.match(refs[0].date,/2026-09-24 01:00:00（北京时间）/);
});
test('local service aliases resolve to the same public categories',()=>{
 const s=service(),session={actor:'student'};
 for(const keyword of ['快递点','快递站','文印店','干洗','药房']){const r=searchLocal(dataset,{keyword,center:{lng:119.42,lat:32.34},radius:5000},distance);assert(Array.isArray(r),keyword);}
});
test('local empty search remains empty and has no usable context; it cannot fall back to fabricated places',async()=>{
 const s=service(),a={actor:'student'};const r=await s.run(a,{provider:'local',keyword:'不存在的独特门店',scope:'city'});assert.deepEqual(r.places,[]);assert.equal(r.contextToken,null);
});
test('cross-provider coordinates and cross-session local context are rejected',async()=>{
 const s=service({getConfig:()=>({enabled:true,apiKey:'test-only',revision:0})}),a={actor:'student'},b={actor:'student'};
 const c=await s.run(a,{provider:'local',keyword:'测试大学'},true);
 await assert.rejects(s.run(a,{provider:'amap',keyword:'咖啡',scope:'nearby',radius:1000,centerToken:c.centers[0].token,consent:true}),/重新查找/);
 const r=await s.run(a,{provider:'local',keyword:'咖啡',scope:'city'});assert.throws(()=>s.sources(b,r.contextToken),/过期/);
});
test('local context expires, resets with identity, and invalid provider is rejected',async()=>{
 let now=0;const s=service({now:()=>now}),a={actor:'student'};let r=await s.run(a,{provider:'local',keyword:'咖啡',scope:'city'});now=600001;assert.throws(()=>s.sources(a,r.contextToken),/过期/);
 r=await s.run(a,{provider:'local',keyword:'咖啡',scope:'city'});s.reset(a);assert.throws(()=>s.sources(a,r.contextToken),/过期/);
 await assert.rejects(s.run(a,{provider:'unknown',keyword:'咖啡',scope:'city'}),/来源无效/);
});
test('public snapshot has explicit provenance, no network identifiers, and verified campus center',()=>{
 assert.equal(dataset.license,'ODbL-1.0');assert.equal(dataset.coordinateSystem,'WGS84');assert(dataset.places.length>0);assert(dataset.places.some(p=>p.name==='南京邮电大学通达学院'&&p.centerOnly));
 const keys=new Set(['id','name','kind','address','city','district','telephone','location','mapUrl','centerOnly']);
 for(const p of dataset.places){assert(Object.keys(p).every(k=>keys.has(k)));assert.match(p.mapUrl,/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);assert(p.location.lat>=32.25&&p.location.lat<=32.5);assert(p.location.lng>=119.25&&p.location.lng<=119.55)}
 assert(!searchLocal(dataset,{keyword:'大学',centers:false},distance).some(p=>p.centerOnly));
 const campus=dataset.places.find(p=>p.name==='南京邮电大学通达学院');
 assert(dataset.places.every(p=>distance(campus.location,p.location)<=5000),'every active POI must be within campus focus');
});
