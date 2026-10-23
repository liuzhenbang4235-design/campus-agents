'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs');
const {createBoard}=require('../lib/campus-board.cjs');

async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-board-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json')};
 const app=createApp(opts);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 async function request(route,body,headers={}){
  const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body!==undefined?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();
  return {status:res.status,...data};
 }
 return {request,app,opts,dir};
}

test('studentId register and login failures',async t=>{
 const {request}=await setup(t);
 assert.equal((await request('auth/register',{studentId:'abc',password:'secret1'})).status,400);
 assert.equal((await request('auth/register',{studentId:'20210001',password:'123'})).status,400);
 let r=await request('auth/register',{studentId:'20210001',password:'secret1',displayName:'甲同学'});
 assert.equal(r.status,200);assert.equal(r.account.studentId,'20210001');
 assert.equal((await request('auth/register',{studentId:'20210001',password:'secret1'})).status,409);
 await request('auth/logout',{});
 r=await request('auth/login',{studentId:'20210001',password:'wrong!!'});
 assert.equal(r.status,401);
 r=await request('auth/login',{studentId:'20210001',password:'secret1'});
 assert.equal(r.status,200);assert.equal(r.account.displayName,'甲同学');
 assert.equal((await request('board/create',{type:'二手书',title:'高数教材',description:'大一高数上下册，八成新',contact:'微信 demo-only',days:7})).status,200);
});

test('expired listings are hidden from board list and chat retrieval',async t=>{
 const {request,opts}=await setup(t);
 await request('auth/register',{studentId:'20220001',password:'secret1',displayName:'乙'});
 const created=await request('board/create',{type:'代课',title:'高数代课',description:'周三下午高等数学代课',contact:'QQ 10001',days:3});
 assert.equal(created.status,200);
 const id=created.listing.id;
 const board=JSON.parse(fs.readFileSync(opts.boardFile,'utf8'));
 board.listings.find(l=>l.id===id).expiresAt=new Date(Date.now()-3600000).toISOString();
 fs.writeFileSync(opts.boardFile,JSON.stringify(board,null,2));
 // reload app from disk
 const app2=createApp(opts);
 assert.deepEqual(app2.board.listActive(),[]);
 assert.deepEqual(app2.board.matchListings('有没有高数代课'),[]);
});

test('chat retrieval hits active campus board listings as peer sources',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20230001',password:'secret1',displayName:'丙'});
 assert.equal((await request('board/create',{type:'二手书',title:'出高数教材',description:'高等数学教材转让，成色良好',contact:'微信 peer-only',days:7})).status,200);
 await request('auth/logout',{});
 await request('auth/register',{studentId:'20230002',password:'secret1',displayName:'丁'});
 const chat=await request('chat',{agentId:'life',question:'有没有二手高数教材'});
 assert.equal(chat.status,200);
 assert.equal(chat.message.mode,'retrieval');
 assert.ok(chat.message.sources.some(s=>s.sourceType==='campus_board'));
 assert.match(chat.message.text,/同学提供/);
 assert.match(chat.message.text,/高数/);
 const listingId=chat.message.sources.find(s=>s.sourceType==='campus_board').listingId;
 const dm=await request('board/dm',{listingId,text:'你好，书还在吗？'});
 assert.equal(dm.status,200);
 assert.equal(dm.thread.messages.at(-1).text,'你好，书还在吗？');
 assert.ok(!JSON.stringify(dm).includes('secret1'));
});

test('board create requires student account',async t=>{
 const {request}=await setup(t);
 const r=await request('board/create',{type:'代购',title:'帮带奶茶',description:'下午帮带一杯奶茶',contact:'手机 13800000000',days:3});
 assert.equal(r.status,401);
});

test('unit: matchListings scores topical campus intents',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-board-unit-'));
 const file=path.join(dir,'board.json');
 const board=createBoard({file});
 board.register({studentId:'20240001',password:'secret1',displayName:'戊'});
 board.createListing({studentId:'20240001'},{type:'二手书',title:'线性代数',description:'线代教材出闲置',contact:'c',days:7});
 assert.ok(board.matchListings('有没有二手线性代数').length);
 assert.deepEqual(board.matchListings('宇宙黑洞'),[]);
 fs.rmSync(dir,{recursive:true,force:true});
});
