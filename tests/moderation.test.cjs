'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs');
const {createModerator}=require('../lib/moderation.cjs');

function windowFields(days=7,now=Date.now()){
 return {windowStart:new Date(now-60*1000).toISOString(),windowEnd:new Date(now+days*86400000).toISOString()};
}
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-moderation-content-'));
 const app=createApp({dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 async function request(route,body){
  const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie},body:body!==undefined?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  return {status:res.status,...await res.json()};
 }
 return {request};
}

test('local keyword rules block without a model and do not echo the word',async()=>{
 const moderator=createModerator({getConfig:()=>({enabled:false})});
 assert.equal((await moderator.check('南门代取快递，六点前')).ok,true);
 const hit=await moderator.check('可以代写论文，价格私聊');
 assert.equal(hit.ok,false);
 assert.equal(hit.via,'local');
 assert.doesNotMatch(hit.reason,/代写论文/);
});

test('model screening blocks, allows, and fails open on errors',async()=>{
 const config={enabled:true,apiKey:'test-key',model:'test-model',provider:'doubao'};
 const reply=payload=>async()=>({ok:true,status:200,json:async()=>payload});
 const block=createModerator({getConfig:()=>config,fetchImpl:reply({choices:[{message:{content:JSON.stringify({blocked:true,categories:['诈骗']})}}]})});
 const blocked=await block.check('帮我弄一个假的成绩单');
 assert.equal(blocked.ok,false);
 assert.equal(blocked.via,'ai');
 assert.match(blocked.reason,/诈骗/);

 const allow=createModerator({getConfig:()=>config,fetchImpl:reply({choices:[{message:{content:JSON.stringify({blocked:false,categories:[]})}}]})});
 assert.equal((await allow.check('南门代取快递')).ok,true);

 const broken=createModerator({getConfig:()=>config,fetchImpl:async()=>{throw new Error('network')}});
 assert.equal((await broken.check('南门代取快递')).ok,true);
 const garbage=createModerator({getConfig:()=>config,fetchImpl:reply({choices:[{message:{content:'not json'}}]})});
 assert.equal((await garbage.check('南门代取快递')).ok,true);
});

test('blocked listings are rejected before they are stored',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250081',password:'secret1',displayName:'甲'});
 const blocked=await request('board/create',{type:'代取快递',description:'可以代写论文，价格私聊',contact:'微信 a',...windowFields(7)});
 assert.equal(blocked.status,400);
 assert.match(blocked.error,/不允许/);
 const board=await request('board');
 assert.equal(board.mine.length,0);
 assert.equal(board.listings.length,0);
 const ok=await request('board/create',{type:'代取快递',description:'南门代取快递',contact:'微信 a',...windowFields(7)});
 assert.equal(ok.status,200);
});

test('blocked private messages are rejected and not stored',async t=>{
 const {request,app}=await setup(t);
 await request('auth/register',{studentId:'20250082',password:'secret1',displayName:'东'});
 const created=await request('board/create',{type:'代取快递',description:'南门代取快递',contact:'微信 d',...windowFields(7)});
 const id=created.listing.id;
 await request('auth/logout',{});
 await request('auth/register',{studentId:'20250083',password:'secret1',displayName:'西'});
 assert.equal((await request('board/open',{listingId:id})).status,200);
 const blocked=await request('board/dm',{listingId:id,text:'加微信刷单返利'});
 assert.equal(blocked.status,400);
 assert.match(blocked.error,/不允许/);
 const thread=await request('board/dm?listingId='+encodeURIComponent(id));
 assert.equal(thread.messages.length,0);
 assert.equal((await request('board/dm',{listingId:id,text:'你好，还能代取吗？'})).status,200);
});

test('moderation can be disabled for local experiments',async()=>{
 const previous=process.env.BOARD_MODERATION;
 process.env.BOARD_MODERATION='0';
 try{
  const moderator=createModerator({getConfig:()=>({enabled:false}),enabled:process.env.BOARD_MODERATION!=='0'});
  assert.equal((await moderator.check('代写论文')).ok,true);
 } finally {
  if (previous===undefined) delete process.env.BOARD_MODERATION;
  else process.env.BOARD_MODERATION=previous;
 }
});
