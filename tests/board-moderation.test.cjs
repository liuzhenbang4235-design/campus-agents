'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createApp}=require('../lib/backend.cjs');

function windowFields(days=7,now=Date.now()){
 return {windowStart:new Date(now-60*1000).toISOString(),windowEnd:new Date(now+days*86400000).toISOString()};
}
async function setup(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-moderation-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json'),...options};
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const port=app.server.address().port,base='http://127.0.0.1:'+port;
 let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 async function request(route,body,headers={}){
  const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body!==undefined?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();
  return {status:res.status,...data};
 }
 return {request,app,port,base};
}
function raw(port,{path:route='/api/health',headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,path:route,method:'GET',headers},res=>{
   let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
  });
  req.on('error',reject);
  req.end();
 });
}

test('login attempts are throttled per account',async t=>{
 const {request}=await setup(t);
 let last;
 for(let i=0;i<10;i++)last=await request('auth/login',{studentId:'20250031',password:'wrong-pass'});
 assert.equal(last.status,401);
 assert.equal((await request('auth/login',{studentId:'20250031',password:'wrong-pass'})).status,429);
 assert.equal((await request('auth/login',{studentId:'20250032',password:'wrong-pass'})).status,401);
});

test('students can report a listing and only admin can resolve it',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250041',password:'secret1',displayName:'甲'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 a',...windowFields(7)});
 assert.equal(created.status,200);
 const id=created.listing.id;
 await request('auth/logout',{});
 await request('auth/register',{studentId:'20250042',password:'secret1',displayName:'乙'});
 assert.equal((await request('board/report',{listingId:id,reason:'联系方式像广告'})).status,200);
 assert.equal((await request('board/report',{listingId:id,reason:'重复举报'})).status,409);
 await request('auth/login',{studentId:'20250041',password:'secret1'});
 assert.equal((await request('board/report',{listingId:id,reason:'自己的登记'})).status,400);
 assert.equal((await request('board/report-resolve',{id:'whatever',decision:'dismiss'})).status,403);

 const switched=await request('session',{profile:'admin'});
 assert.equal(switched.status,200);
 const reports=switched.state.boardReports;
 assert.equal(reports.length,1);
 assert.equal(reports[0].reason,'联系方式像广告');
 assert.equal(JSON.stringify(reports).includes('2025004'),false);
 assert.equal((await request('board/report-resolve',{id:reports[0].id,decision:'dismiss'})).status,200);
 assert.equal((await request('state')).state.boardReports.length,0);

 await request('session',{profile:'student'});
 await request('auth/login',{studentId:'20250042',password:'secret1'});
 assert.equal((await request('board/report',{listingId:id,reason:'还是广告'})).status,200);
 await request('session',{profile:'admin'});
 const pending=(await request('state')).state.boardReports;
 assert.equal(pending.length,1);
 assert.equal((await request('board/report-resolve',{id:pending[0].id,decision:'take_down'})).status,200);
 const after=await request('board');
 assert.equal(after.listings.some(l=>l.id===id),false);
 await request('session',{profile:'student'});
 await request('auth/login',{studentId:'20250042',password:'secret1'});
 assert.equal((await request('board/report',{listingId:id,reason:'已经下架了'})).status,409);
});

test('owner inbox counts unread messages until the thread is opened',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250051',password:'secret1',displayName:'东'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 d',...windowFields(7)});
 const id=created.listing.id;
 await request('auth/logout',{});
 await request('auth/register',{studentId:'20250052',password:'secret1',displayName:'西'});
 await request('board/open',{listingId:id});
 await request('board/dm',{listingId:id,text:'第一条消息'});

 await request('auth/login',{studentId:'20250051',password:'secret1'});
 let board=await request('board');
 assert.equal(board.inbox[0].unread,1);
 const threadId=board.inbox[0].threadId;
 await request('board/thread?threadId='+encodeURIComponent(threadId));
 board=await request('board');
 assert.equal(board.inbox[0].unread,0);

 await request('auth/login',{studentId:'20250052',password:'secret1'});
 await request('board/dm',{listingId:id,text:'第二条消息'});
 await request('auth/login',{studentId:'20250051',password:'secret1'});
 board=await request('board');
 assert.equal(board.inbox[0].unread,1);
 await request('board/reply',{threadId,text:'收到'});
 board=await request('board');
 assert.equal(board.inbox[0].unread,0);
});

test('CAMPUS_ORIGINS gates proxied hosts, origins and the session cookie',async t=>{
 const {port}=await setup(t,{origins:['https://campus.example.com']});
 assert.equal((await raw(port,{path:'/api/health'})).status,200);
 assert.equal((await raw(port,{path:'/api/health',headers:{host:'campus.example.com',origin:'https://campus.example.com'}})).status,200);
 assert.equal((await raw(port,{path:'/api/health',headers:{host:'evil.example.com'}})).status,403);
 assert.equal((await raw(port,{path:'/api/health',headers:{host:'campus.example.com',origin:'https://evil.example.com'}})).status,403);
 const state=await raw(port,{path:'/api/state',headers:{host:'campus.example.com',origin:'https://campus.example.com'}});
 assert.equal(state.status,200);
 assert.match(String(state.headers['set-cookie']),/Secure/);
 assert.throws(()=>createApp({origins:['ftp://campus.example.com'],dataDir:path.join(os.tmpdir(),'x'),configFile:path.join(os.tmpdir(),'x.json'),boardFile:path.join(os.tmpdir(),'x-board.json')}),/CAMPUS_ORIGINS/);
});

test('pre-publication review holds new listings until an admin approves',async t=>{
 const {request}=await setup(t,{boardReview:true});
 await request('auth/register',{studentId:'20250061',password:'secret1',displayName:'甲'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 a',...windowFields(7)});
 assert.equal(created.status,200);
 assert.equal(created.listing.status,'pending');
 let board=await request('board');
 assert.equal(board.reviewMode,true);
 assert.equal(board.listings.length,0);
 assert.equal(board.mine.length,1);
 assert.equal(board.mine[0].status,'pending');
 assert.equal((await request('board/ask',{question:'现在有没有人代取快递'})).offers.length,0);
 assert.equal((await request('board/review-listing',{id:created.listing.id,decision:'approve'})).status,403);

 const switched=await request('session',{profile:'admin'});
 assert.equal(switched.state.boardPendingListings.length,1);
 assert.equal((await request('board/review-listing',{id:created.listing.id,decision:'approve'})).status,200);
 board=await request('board');
 assert.equal(board.listings.some(l=>l.id===created.listing.id),true);

 const second=await request('board/create',{type:'陪诊',description:'可以陪诊',contact:'微信 b',...windowFields(7)});
 assert.equal(second.listing.status,'pending');
 assert.equal((await request('board/review-listing',{id:second.listing.id,decision:'reject',reason:'联系方式不清楚'})).status,200);
 board=await request('board');
 const rejected=board.mine.find(l=>l.id===second.listing.id);
 assert.equal(rejected.status,'rejected');
 assert.equal(rejected.reason,'联系方式不清楚');
 assert.equal(board.listings.some(l=>l.id===second.listing.id),false);
});

test('pre-publication review is opt-in and defaults to immediate listings',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250071',password:'secret1',displayName:'乙'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 c',...windowFields(7)});
 assert.equal(created.listing.status,'active');
});

test('admin report queue and unread polling are wired in the web app',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 assert.match(app,/互助举报/);
 assert.match(app,/board-report-form/);
 assert.match(app,/board-report-resolve/);
 assert.match(app,/条未读/);
 assert.match(app,/setInterval\(refreshBoardQuietly/);
 assert.match(app,/startBoardPolling\(\)/);
 assert.match(app,/互助登记审核/);
 assert.match(app,/board-approve-listing/);
 assert.match(app,/board-review-form/);
 assert.match(app,/boardReviewMode/);
});
