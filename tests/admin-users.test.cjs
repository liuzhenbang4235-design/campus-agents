'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs');

async function setup(t,extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-admin-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'data','campus-board.json'),...extra};
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 function client(){
  let cookie='';
  async function request(route,body){
   const res=await fetch(base+'/api/'+route,{method:body!==undefined?'POST':'GET',headers:{...(body!==undefined?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie},body:body!==undefined?JSON.stringify(body):undefined});
   const set=res.headers.get('set-cookie')||'';
   if(set)cookie=set.split(';')[0];
   let data;try{data=await res.json()}catch{data={}}
   return {status:res.status,...data};
  }
  return {request,getCookie:()=>cookie};
 }
 return {app,base,opts,client};
}

async function loginAdmin(app,client,password='secret12'){
 app.board.createAccountByAdmin({username:'root',password,displayName:'管理员',role:'super_admin'});
 let r=await client.request('auth/login',{username:'root',password});
 assert.equal(r.status,200);
 r=await client.request('auth/change-password',{oldPassword:password,newPassword:'secret1234'});
 assert.equal(r.status,200);
 return r;
}

test('super admin creates accounts, forces first-login password change, and audit records actions',async t=>{
 const {app,client}=await setup(t);
 const root=client();
 await loginAdmin(app,root);
 let r=await root.request('admin/users',{username:'alice',displayName:'爱丽丝',password:'alicepass',role:'user'});
 assert.equal(r.status,200);
 assert.equal(r.created.username,'alice');
 assert.match(r.created.initialPassword,/^.{8,}$/);
 r=await root.request('admin/users');
 assert.equal(r.status,200);
 assert.ok(r.users.some(u=>u.username==='alice'&&u.role==='user'));
 r=await root.request('admin/audit');
 assert.equal(r.status,200);
 assert.ok(r.audit.some(a=>a.action==='USER_CREATE'&&a.operator&&a.target));
});

test('normal user cannot use admin APIs; disable and password reset invalidate old sessions',async t=>{
 const {app,client}=await setup(t);
 const root=client(),alice=client();
 await loginAdmin(app,root);
 const made=await root.request('admin/users',{username:'alice',displayName:'爱丽丝',password:'alicepass',role:'user'});
 const aliceId=made.created.studentId;
 let r=await alice.request('auth/login',{username:'alice',password:'alicepass'});
 assert.equal(r.status,200);
 assert.equal(r.account.mustChangePwd,true);
 assert.equal((await alice.request('auth/nickname',{displayName:'改名'})).status,403);
 r=await alice.request('auth/change-password',{oldPassword:'alicepass',newPassword:'alicepass1'});
 assert.equal(r.status,200);
 assert.equal(r.account.mustChangePwd,false);
 assert.equal((await alice.request('admin/users')).status,403);
 r=await root.request('admin/users/status',{studentId:aliceId,status:2});
 assert.equal(r.status,200);
 r=await alice.request('state');
 assert.equal(r.account,null);
 await root.request('admin/users/status',{studentId:aliceId,status:1});
 r=await alice.request('auth/login',{username:'alice',password:'alicepass1'});
 assert.equal(r.status,200);
 const reset=await root.request('admin/users/reset-password',{studentId:aliceId});
 assert.equal(reset.status,200);
 assert.ok(reset.initialPassword);
 r=await alice.request('state');
 assert.equal(r.account,null);
 r=await alice.request('auth/login',{username:'alice',password:reset.initialPassword});
 assert.equal(r.status,200);
 assert.equal(r.account.mustChangePwd,true);
 const rootRow=(await root.request('admin/users')).users.find(u=>u.username==='root');
 assert.equal((await root.request('admin/users/status',{studentId:rootRow.studentId,status:2})).status,400);
 assert.equal((await root.request('admin/users/role',{studentId:rootRow.studentId,role:'user'})).status,409);
});

test('public mode closes self registration unless explicitly allowed',async t=>{
 const closed=await setup(t,{env:{PUBLIC_MODE:'1'}});
 assert.equal((await closed.client().request('auth/register',{username:'newuser',password:'secret12'})).status,403);
 const open=await setup(t,{env:{PUBLIC_MODE:'1',ALLOW_SELF_REGISTER:'1'}});
 const r=await open.client().request('auth/register',{username:'newuser',password:'secret12'});
 assert.equal(r.status,200);
 assert.equal(r.account.role,'user');
});

test('repeated failed logins do not lock the account',async t=>{
 const {app,client}=await setup(t);
 app.board.createAccountByAdmin({username:'nolock',password:'secret12',displayName:'不锁定',role:'user'});
 const user=client();
 for(let i=0;i<5;i++)await user.request('auth/login',{username:'nolock',password:'wrongpass'});
 const r=await user.request('auth/login',{username:'nolock',password:'secret12'});
 assert.equal(r.status,200);
 assert.equal(r.account.username,'nolock');
});

test('CSV import creates valid accounts and reports invalid lines',async t=>{
 const {app,client}=await setup(t);
 const root=client();
 await loginAdmin(app,root);
 const r=await root.request('admin/users/import',{csv:'\uFEFFusername,displayName,password,role\nbob,鲍勃,,user\ncarol,卡罗,carolpass,reviewer\na,短,123,user'});
 assert.equal(r.status,200);
 assert.equal(r.created,2);
 assert.equal(r.errors.length,1);
 const list=await root.request('admin/users');
 assert.ok(list.users.some(u=>u.username==='bob'&&u.role==='user'));
 assert.ok(list.users.some(u=>u.username==='carol'&&u.role==='reviewer'));
 assert.ok(!list.users.some(u=>/username/i.test(u.username)));
});
