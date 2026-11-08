'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createApp,rateLimitActor}=require('../lib/backend.cjs');

const ASK_MAX=40;

function jwt(payload){
 const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 return part({alg:'none',typ:'JWT'})+'.'+part(payload)+'.sig';
}

async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-rate-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json')};
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const port=app.server.address().port,base='http://127.0.0.1:'+port;
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 function client(){
  let cookie='';
  return async function request(route,body,headers={}){
   const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body!==undefined?JSON.stringify(body):undefined});
   if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
   const data=await res.json();
   return {status:res.status,...data};
  };
 }
 async function open(){
  const request=client();
  assert.equal((await request('state')).status,200);
  return request;
 }
 function post(headers,body){
  return new Promise((resolve,reject)=>{
   const payload=JSON.stringify(body);
   const req=http.request({host:'127.0.0.1',port,path:'/api/board/ask',method:'POST',headers:{'content-type':'application/json','x-campus-client':'1','content-length':Buffer.byteLength(payload),...headers}},res=>{
    let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(raw)}));
   });
   req.on('error',reject);
   req.end(payload);
  });
 }
 return {open,post,client};
}

async function fillAsks(request,headers){
 let last;
 for(let i=0;i<ASK_MAX;i++)last=await request('board/ask',{question:'有没有人代取快递'},headers);
 assert.equal(last.status,200);
 const blocked=await request('board/ask',{question:'有没有人代取快递'},headers);
 assert.equal(blocked.status,429);
 assert.equal(blocked.error,'操作过于频繁，请稍后再试。');
}

test('ask buckets follow the session cookie when the proxy address is shared',async t=>{
 const {open}=await setup(t);
 const a=await open(),b=await open();
 const forwarded={'x-forwarded-for':'203.0.113.77'};
 await fillAsks(a,forwarded);
 assert.equal((await a('board/ask',{question:'有没有人代取快递'},forwarded)).status,429);
 assert.equal((await b('board/ask',{question:'有没有人代取快递'},forwarded)).status,200);
});

test('ask buckets prefer the logged-in studentId over the session cookie',async t=>{
 const {open}=await setup(t);
 const a=await open(),b=await open(),c=await open();
 assert.equal((await a('auth/register',{studentId:'20210001',password:'secret1',displayName:'甲'})).status,200);
 assert.equal((await b('auth/login',{studentId:'20210001',password:'secret1'})).status,200);
 await fillAsks(a);
 assert.equal((await b('board/ask',{question:'有没有人代取快递'})).status,429);
 assert.equal((await c('board/ask',{question:'有没有人代取快递'})).status,200);
});

test('ask buckets share a Cloudflare Access email across session cookies',async t=>{
 const {open}=await setup(t);
 const a=await open(),b=await open(),c=await open();
 const same={'cf-access-authenticated-user-email':'stu@example.com'};
 await fillAsks(a,same);
 assert.equal((await b('board/ask',{question:'有没有人代取快递'},same)).status,429);
 assert.equal((await c('board/ask',{question:'有没有人代取快递'},{'cf-access-authenticated-user-email':'other@example.com'})).status,200);
});

test('ask buckets use a Cloudflare Access JWT claim when the email header is absent',async t=>{
 const {open}=await setup(t);
 const a=await open(),b=await open();
 const headers={'cf-access-jwt-assertion':jwt({email:'jwt@example.com',sub:'user-1'})};
 await fillAsks(a,headers);
 assert.equal((await b('board/ask',{question:'有没有人代取快递'},headers)).status,429);
 assert.equal((await b('board/ask',{question:'有没有人代取快递'},{'cf-access-jwt-assertion':jwt({sub:'user-2'})})).status,200);
});

test('failed logins stay bounded per session and per studentId',async t=>{
 const {open}=await setup(t);
 const a=await open(),b=await open();
 let last;
 for(let i=0;i<10;i++)last=await a('auth/login',{studentId:'20250031',password:'wrong-pass'});
 assert.equal(last.status,401);
 assert.equal((await a('auth/login',{studentId:'20250031',password:'wrong-pass'})).status,429);
 assert.equal((await a('auth/login',{studentId:'20250032',password:'wrong-pass'})).status,401);
 assert.equal((await b('auth/login',{studentId:'20250031',password:'wrong-pass'})).status,401);
});

test('requests that drop the session cookie share an address bucket',async t=>{
 const {post,open}=await setup(t);
 let last;
 for(let i=0;i<ASK_MAX;i++)last=await post({},{question:'有没有人代取快递'});
 assert.equal(last.status,200);
 assert.equal((await post({},{question:'有没有人代取快递'})).status,429);
 assert.equal((await post({'x-forwarded-for':'10.9.8.7'},{question:'有没有人代取快递'})).status,429);
 assert.equal((await post({'x-forwarded-for':'10.0.0.4, 203.0.113.50'},{question:'有没有人代取快递'})).status,200);
 const again=await post({'x-real-ip':'203.0.113.60'},{question:'有没有人代取快递'});
 assert.equal(again.status,200);
 for(let i=0;i<ASK_MAX-1;i++)await post({'x-real-ip':'203.0.113.60'},{question:'有没有人代取快递'});
 assert.equal((await post({'x-real-ip':'203.0.113.60'},{question:'有没有人代取快递'})).status,429);
 const session=await open();
 assert.equal((await session('board/ask',{question:'有没有人代取快递'},{'x-real-ip':'203.0.113.60'})).status,200);
});

test('rateLimitActor keeps studentId, Access identity, session, then a trusted forwarded address',()=>{
 const token='ab'.repeat(24);
 const req={socket:{remoteAddress:'8.8.8.8'},headers:{'x-forwarded-for':'203.0.113.5','cf-access-authenticated-user-email':'A@Example.com'}};
 assert.equal(rateLimitActor(req,{account:{studentId:'20210001'}},token,{RENDER:'true'}),'sid:20210001');
 assert.equal(rateLimitActor(req,{account:null},token,{RENDER:'true'}),'cf:a@example.com');
 delete req.headers['cf-access-authenticated-user-email'];
 req.headers['cf-access-jwt-assertion']=jwt({email:'jwt@example.com',sub:'abc'});
 assert.equal(rateLimitActor(req,{account:null},token,{RENDER:'true'}),'cf:jwt@example.com');
 req.headers['cf-access-jwt-assertion']=jwt({sub:'user-1'});
 assert.equal(rateLimitActor(req,{account:null},token,{RENDER:'true'}),'cf:sub:user-1');
 req.headers['cf-access-jwt-assertion']='not-a-jwt';
 assert.equal(rateLimitActor(req,{account:null},token,{RENDER:'true'}),'sess:'+token);
 assert.equal(rateLimitActor(req,{account:null},'',{RENDER:'true'}),'ip:203.0.113.5');
 assert.equal(rateLimitActor(req,{account:null},'',{}),'ip:8.8.8.8');
 req.headers['cf-access-authenticated-user-email']='spoof@example.com';
 assert.equal(rateLimitActor(req,{account:null},'',{}),'ip:8.8.8.8');
 req.socket.remoteAddress='::ffff:127.0.0.1';
 delete req.headers['cf-access-authenticated-user-email'];
 delete req.headers['cf-access-jwt-assertion'];
 assert.equal(rateLimitActor(req,{account:null},'',{}),'ip:203.0.113.5');
 req.headers['x-forwarded-for']='10.0.0.4, 192.168.1.2';
 req.headers['x-real-ip']='198.51.100.20';
 assert.equal(rateLimitActor(req,{account:null},'',{}),'ip:198.51.100.20');
 req.headers['x-forwarded-for']='not-an-ip, 203.0.113.9';
 delete req.headers['x-real-ip'];
 assert.equal(rateLimitActor(req,{account:null},'',{}),'ip:203.0.113.9');
});
