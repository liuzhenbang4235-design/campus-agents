'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../lib/backend.cjs');

function windowFields(days=7,now=Date.now()){
 return {windowStart:new Date(now-60*1000).toISOString(),windowEnd:new Date(now+days*86400000).toISOString()};
}

async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-auth-user-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json')};
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 async function request(route,body,headers={}){
  const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body!==undefined?JSON.stringify(body):undefined});
  const set=res.headers.get('set-cookie')||'';
  if(set)cookie=set.split(';')[0];
  const data=await res.json();
  return {status:res.status,cookie:set,...data};
 }
 return {request,base,opts,dir,cookie:()=>cookie};
}

test('username register is unique, nickname may repeat, and the password is only stored as a hash',async t=>{
 const {request,opts}=await setup(t);
 assert.equal((await request('auth/register',{username:'ab',password:'secret1'})).status,400);
 assert.equal((await request('auth/register',{username:'20210001',password:'secret1'})).status,400);
 let r=await request('auth/register',{username:' Lin ',password:'secret1',displayName:'小林',remember:true});
 assert.equal(r.status,200);
 assert.equal(r.account.username,'lin');
 assert.equal(r.account.displayName,'小林');
 assert.equal(/^\d{8}$/.test(r.account.studentId),false);
 assert.equal(r.account.password,undefined);
 assert.equal(r.account.passwordHash,undefined);
 assert.match(r.cookie,/Max-Age=2592000/);
 assert.doesNotMatch(r.cookie,/Secure/);
 assert.equal((await request('auth/register',{username:'LIN',password:'secret1'})).status,409);
 const other=await request('auth/register',{username:'chen',password:'secret1',displayName:'小林'});
 assert.equal(other.status,200);
 assert.equal(other.account.displayName,'小林');
 const blank=await request('auth/register',{username:'noname',password:'secret1',displayName:'  '});
 assert.equal(blank.status,200);
 assert.match(blank.account.displayName,/^同学\d{4}$/);
 const disk=JSON.parse(fs.readFileSync(opts.boardFile,'utf8'));
 const saved=disk.accounts.find(a=>a.username==='lin');
 assert.ok(saved.passwordHash&&saved.passwordSalt);
 assert.equal(saved.password,undefined);
 assert.equal(JSON.stringify(disk).includes('secret1'),false);
 assert.equal(saved.studentId,r.account.studentId);
});

test('checked and unchecked persistence, logout revocation, and legacy school-number ownership stay intact',async t=>{
 const {request,base}=await setup(t);
 const legacy=await request('auth/register',{studentId:'20210001',password:'secret1',displayName:'甲同学'});
 assert.equal(legacy.status,200);
 assert.equal(legacy.account.studentId,'20210001');
 assert.equal(legacy.account.username,'');
 const made=await request('board/create',{type:'代取快递',description:'南门代取，只属于这个学号',contact:'',...windowFields()});
 assert.equal(made.status,200);
 await request('auth/logout',{});
 const session=await request('auth/login',{username:'20210001',password:'secret1',remember:false});
 assert.equal(session.status,200);
 assert.equal(session.account.studentId,'20210001');
 assert.doesNotMatch(session.cookie,/Max-Age=/);
 const kept=await request('auth/login',{username:'lin',password:'secret1'});
 assert.equal(kept.status,401);
 const created=await request('auth/register',{username:'lin',password:'secret1',displayName:'小林',remember:true});
 assert.equal(created.status,200);
 assert.notEqual(created.account.studentId,'20210001');
 const stolen=await request('board/takedown',{id:made.listing.id});
 assert.equal(stolen.status,403);
 const wrong=await request('auth/login',{username:'lin',password:'wrong-pass'});
 assert.equal(wrong.status,401);
 const again=await request('auth/login',{username:'Lin',password:'secret1',remember:true});
 assert.equal(again.status,200);
 assert.match(again.cookie,/Max-Age=2592000/);
 const old=again.cookie.match(/campus_session=([a-f0-9]{48})/)[1];
 const out=await request('auth/logout',{});
 assert.match(out.cookie,/Max-Age=0/);
 assert.equal(out.account,null);
 const reused=await fetch(base+'/api/board',{headers:{Cookie:'campus_session='+old}});
 const body=await reused.json();
 assert.equal(body.account,null);
 const renamed=await request('auth/login',{username:'lin',password:'secret1',remember:false});
 assert.equal(renamed.status,200);
 const nick=await request('auth/nickname',{displayName:'小陈'});
 assert.equal(nick.status,200);
 assert.equal(nick.account.displayName,'小陈');
 assert.equal(nick.account.username,'lin');
 assert.equal(nick.account.studentId,created.account.studentId);
});
