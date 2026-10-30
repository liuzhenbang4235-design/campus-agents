'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs');

async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-admin-team-'));
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

test('platform admin can maintain and submit a team agent',async t=>{
 const {request}=await setup(t);
 const switched=await request('session',{profile:'admin'});
 assert.equal(switched.status,200);
 const saved=await request('action',{action:'saveAgent',name:'管理员测试助手',description:'给管理员在团队工作台里维护的助手',rules:'仅依据已审核资料回答，标注来源。',category:'学校事务'});
 assert.equal(saved.status,200);
 const agent=saved.state.agents.find(a=>a.name==='管理员测试助手');
 assert.ok(agent);
 assert.equal(agent.status,'draft');
 assert.equal((await request('action',{action:'submitAgent',id:agent.id})).status,200);
 assert.equal((await request('state')).state.agents.find(a=>a.id===agent.id).status,'pending');
 assert.equal((await request('action',{action:'review',kind:'agent',id:agent.id,decision:'approve',reason:'内容清楚'})).status,200);
 assert.equal((await request('state')).state.agents.find(a=>a.id===agent.id).status,'published');
});

test('student still cannot save a team agent',async t=>{
 const {request}=await setup(t);
 await request('session',{profile:'student'});
 const saved=await request('action',{action:'saveAgent',name:'学生越权助手',description:'不应保存',rules:'规则',category:'学校事务'});
 assert.equal(saved.status,403);
});
