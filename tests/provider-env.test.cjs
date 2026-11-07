const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {createApp}=require('../lib/backend.cjs');
const {applyProviderEnv}=require('../lib/provider.cjs');
const KEY='sk-test-not-real';
const OFFLINE_NO_EVIDENCE='没有检索到足够相关的已审核资料，因此没有调用云端 AI。请换一种包含主题关键词的问法，或补充相关资料。';

function aiEnv(extra={}){
 return {CAMPUS_AI_ENABLED:'true',CAMPUS_AI_PROVIDER:'deepseek',CAMPUS_AI_API_KEY:KEY,CAMPUS_AI_MODEL:'deepseek-chat',...extra};
}
function modelResponse(answer='示例学生证补办需要照片和申请表。[1]',citations=[1]){
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer,citations})}}],usage:{total_tokens:80}}),{status:200});
}
async function setup(t,env,fetchImpl){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),env,fetchImpl};
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 async function request(route,body,headers={}){
  const res=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();
  return {status:res.status,...data};
 }
 return {request,opts,dir,app};
}
function assertNoKey(value){
 const text=typeof value==='string'?value:JSON.stringify(value);
 assert.equal(text.includes(KEY),false);
 assert.equal(text.includes('stale-disk-key'),false);
}

test('applyProviderEnv fills provider config from env and keeps the default daily limit',()=>{
 const disk={provider:'deepseek',apiKeys:{deepseek:'stale-disk-key'},models:{deepseek:'old-model'},enabled:false,dailyLimit:80};
 const frozen=structuredClone(disk);
 const over=applyProviderEnv(disk,aiEnv());
 assert.deepEqual(disk,frozen);
 assert.equal(over.enabled,true);
 assert.equal(over.provider,'deepseek');
 assert.equal(over.apiKeys.deepseek,KEY);
 assert.equal(over.models.deepseek,'deepseek-chat');
 assert.equal(over.dailyLimit,80);
 assert.equal(applyProviderEnv({dailyLimit:80},{}).dailyLimit,80);
 assert.equal(applyProviderEnv({dailyLimit:80},{CAMPUS_AI_DAILY_LIMIT:''}).dailyLimit,50);
 assert.equal(applyProviderEnv({dailyLimit:80},{CAMPUS_AI_DAILY_LIMIT:'nope'}).dailyLimit,50);
 assert.equal(applyProviderEnv({dailyLimit:80},{CAMPUS_AI_DAILY_LIMIT:'0'}).dailyLimit,50);
 assert.equal(applyProviderEnv({},{CAMPUS_AI_DAILY_LIMIT:'12'}).dailyLimit,12);
 for(const value of ['true','TRUE','1','yes','Yes','on'])assert.equal(applyProviderEnv({},{CAMPUS_AI_ENABLED:value}).enabled,true);
 for(const value of ['false','0','no','off','NO'])assert.equal(applyProviderEnv({enabled:true},{CAMPUS_AI_ENABLED:value}).enabled,false);
 assert.equal(applyProviderEnv({enabled:true,provider:'qwen'},{CAMPUS_AI_ENABLED:''}).enabled,true);
 const kept=applyProviderEnv({provider:'qwen',apiKeys:{qwen:'keep'},enabled:true,dailyLimit:50},{CAMPUS_AI_PROVIDER:'openai',CAMPUS_AI_API_KEY:KEY});
 assert.equal(kept.provider,'qwen');
 assert.equal(kept.apiKeys.qwen,KEY);
 assert.equal(applyProviderEnv({provider:'qwen',apiKeys:{qwen:'keep'}},{CAMPUS_AI_API_KEY:'  '}).apiKeys.qwen,'keep');
 const named=applyProviderEnv({provider:'doubao',apiKeys:{},models:{}},{CAMPUS_AI_PROVIDER:'DeepSeek',CAMPUS_AI_API_KEY:KEY,CAMPUS_AI_MODEL:'deepseek-chat'});
 assert.equal(named.provider,'deepseek');
 assert.equal(named.apiKeys.deepseek,KEY);
 assert.equal(named.apiKeys.doubao,undefined);
});

test('env vars alone make ready() true and chat calls the cloud model',async t=>{
 const seen=[];
 const {request,opts}=await setup(t,aiEnv(),async(_url,init)=>{seen.push(init.headers.Authorization);return modelResponse()});
 const before=await request('config');
 assert.equal(before.ai.ready,true);
 assert.equal(before.ai.enabled,true);
 assert.equal(before.ai.provider,'deepseek');
 assert.equal(before.ai.model,'deepseek-chat');
 assert.equal(before.ai.hasKey,true);
 assert.equal(before.ai.dailyLimit,50);
 assert.deepEqual(before.ai.keys,{qwen:false,deepseek:true,doubao:false});
 assert.equal(before.ai.apiKey,undefined);
 assert.equal(before.ai.apiKeys,undefined);
 assert.equal(typeof before.ai.hasKey,'boolean');
 assertNoKey(before);
 assert.equal(fs.existsSync(opts.configFile),false);
 const blocked=await request('chat',{agentId:'affairs',question:'学生证怎么补办？'});
 assert.equal(blocked.status,400);
 assert.match(blocked.error,/请先确认本次对话可以发送给云端模型/);
 assert.equal(seen.length,0);
 const cited=await request('chat',{agentId:'affairs',question:'学生证怎么补办？',cloudConsent:true});
 assert.equal(cited.status,200);
 assert.equal(cited.message.mode,'ai');
 assert.match(cited.message.text,/示例学生证补办/);
 assert.doesNotMatch(cited.message.text,/还没接上云端模型/);
 assert.doesNotMatch(cited.message.text,/没有调用云端 AI/);
 assert.equal(cited.ai.hasKey,true);
 assert.equal(cited.ai.ready,true);
 assertNoKey(cited);
 const general=await request('chat',{agentId:'affairs',question:'xyzzyplugh完全无关',cloudConsent:true});
 assert.notEqual(general.message.mode,'no_evidence');
 assert.doesNotMatch(general.message.text,/没有调用云端 AI/);
 assert.doesNotMatch(general.message.text,/还没接上云端模型/);
 assertNoKey(general);
 assert.deepEqual(seen,['Bearer '+KEY,'Bearer '+KEY]);
 assert.equal(fs.existsSync(opts.configFile),false);
 const state=await request('state');
 assert.equal(state.ai.hasKey,true);
 assertNoKey(state);
});

test('a missing disk key still uses the env key, including daily limit and a second process',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));
 const configFile=path.join(dir,'config.json');
 fs.writeFileSync(configFile,JSON.stringify({enabled:false,provider:'doubao',apiKey:'',model:'',dailyLimit:50}));
 const seen=[];
 const env=aiEnv({CAMPUS_AI_DAILY_LIMIT:'1',CAMPUS_AI_ENABLED:'yes'});
 const app=createApp({dataDir:path.join(dir,'data'),configFile,env,fetchImpl:async(_url,init)=>{seen.push(init.headers.Authorization);return modelResponse('云端回答',[])}});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 assert.equal(app.status().ready,true);
 assert.equal(app.status().hasKey,true);
 assert.equal(app.status().provider,'deepseek');
 assert.equal(app.status().dailyLimit,1);
 assert.equal(JSON.parse(fs.readFileSync(configFile,'utf8')).apiKey,'');
 assert.equal(fs.readFileSync(configFile,'utf8').includes(KEY),false);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r))});
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='';
 async function request(route,body){
  const res=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Campus-Client':'1',Cookie:cookie},body:JSON.stringify(body)});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  return {status:res.status,...await res.json()};
 }
 await request('session',{profile:'student'});
 const first=await request('chat',{agentId:'affairs',question:'学生证怎么补办？',cloudConsent:true});
 assert.equal(first.status,200);
 assert.equal(first.message.mode,'ai_general');
 assert.doesNotMatch(first.message.text,/还没接上云端模型/);
 const second=await request('chat',{agentId:'affairs',question:'学生证怎么补办？',cloudConsent:true});
 assert.equal(second.status,429);
 assert.match(second.error,/每日调用上限/);
 assert.deepEqual(seen,['Bearer '+KEY]);
 const again=createApp({dataDir:path.join(dir,'data'),configFile,env,fetchImpl:async()=>{throw new Error('must not call')}});
 t.after(()=>again.server.close());
 assert.equal(again.status().ready,true);
 assert.equal(again.status().hasKey,true);
 assertNoKey(again.status());
});

test('an env key wins over a stale disk key and is not written back or returned',async t=>{
 const seen=[];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));
 const configFile=path.join(dir,'config.json');
 fs.writeFileSync(configFile,JSON.stringify({enabled:true,provider:'deepseek',apiKey:'stale-disk-key',model:'old-model',dailyLimit:40}));
 const snapshot=fs.readFileSync(configFile,'utf8');
 const reloaded=createApp({dataDir:path.join(dir,'data'),configFile,env:aiEnv({CAMPUS_AI_ENABLED:'1'}),fetchImpl:async(_url,init)=>{seen.push(init.headers.Authorization);return modelResponse()}});
 await new Promise(r=>reloaded.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{reloaded.server.closeAllConnections();await new Promise(r=>reloaded.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 assert.match(snapshot,/stale-disk-key/);
 assert.equal(snapshot.includes(KEY),false);
 const base='http://127.0.0.1:'+reloaded.server.address().port;
 let cookie='';
 async function call(route,body){
  const res=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie},body:body?JSON.stringify(body):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();
  assertNoKey(data);
  return {status:res.status,...data};
 }
 const state=await call('config');
 assert.equal(state.ai.ready,true);
 assert.equal(state.ai.model,'deepseek-chat');
 assert.equal(state.ai.hasKey,true);
 assert.equal(state.ai.dailyLimit,40);
 const chat=await call('chat',{agentId:'affairs',question:'学生证怎么补办？',cloudConsent:true});
 assert.equal(chat.message.mode,'ai');
 assert.doesNotMatch(chat.message.text,/还没接上云端模型/);
 assert.deepEqual(seen,['Bearer '+KEY]);
 assert.equal(fs.readFileSync(configFile,'utf8'),snapshot);
 await call('session',{profile:'admin'});
 const saved=await call('config',{provider:'deepseek',model:'deepseek-chat',apiKey:'',enabled:true,dailyLimit:40,consent:true});
 assert.equal(saved.status,200);
 assert.equal(saved.ai.hasKey,true);
 assert.equal(saved.ai.keys.deepseek,true);
 assert.equal(typeof saved.ai.hasKey,'boolean');
 const disk=fs.readFileSync(configFile,'utf8');
 assert.equal(disk.includes(KEY),false);
 assert.match(disk,/stale-disk-key/);
});

test('unset or disabled env keeps the offline replies and does not call the model',async t=>{
 const cases=[{env:{},hasKey:false},{env:aiEnv({CAMPUS_AI_ENABLED:'false'}),hasKey:true},{env:aiEnv({CAMPUS_AI_ENABLED:'0'}),hasKey:true}];
 for(const item of cases){
  const {request}=await setup(t,item.env,()=>{throw new Error('must not call')});
  const state=await request('config');
  assert.equal(state.ai.ready,false);
  assert.equal(state.ai.enabled,false);
  assert.equal(state.ai.hasKey,item.hasKey);
  assertNoKey(state);
  const cited=await request('chat',{agentId:'affairs',question:'学生证怎么补办？'});
  assert.equal(cited.status,200);
  assert.equal(cited.message.mode,'retrieval');
  assert.match(cited.message.text,/还没接上云端模型/);
  assertNoKey(cited);
  const missed=await request('chat',{agentId:'affairs',question:'xyzzyplugh完全无关'});
  assert.equal(missed.message.mode,'no_evidence');
  assert.equal(missed.message.text,OFFLINE_NO_EVIDENCE);
  assertNoKey(missed);
 }
});

test('admin save does not log or echo the env API key',()=>{
 const child=`
const {createApp}=require('./lib/backend.cjs');
const fs=require('fs'),os=require('os'),path=require('path');
(async()=>{
 const key=process.env.CAMPUS_AI_API_KEY;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));
 const configFile=path.join(dir,'config.json');
 const app=createApp({dataDir:path.join(dir,'data'),configFile,fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'云端回复',citations:[]})}}]}),{status:200})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='';
 async function call(route,body){
  const res=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json','x-campus-client':'1'}:{}),cookie},body:body?JSON.stringify(body):undefined});
  const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const text=await res.text();
  if(text.includes(key))throw new Error('response leaked');
  return {status:res.status,json:JSON.parse(text)};
 }
 const state=await call('config');
 if(!state.json.ai||state.json.ai.hasKey!==true||state.json.ai.ready!==true||state.json.ai.apiKey||state.json.ai.apiKeys)throw new Error('status shape');
 await call('session',{profile:'admin'});
 const saved=await call('config',{provider:'deepseek',model:'deepseek-chat',apiKey:'',enabled:true,dailyLimit:50,consent:true});
 if(saved.status!==200||saved.json.ai.hasKey!==true)throw new Error('save failed');
 const disk=fs.existsSync(configFile)?fs.readFileSync(configFile,'utf8'):'';
 if(disk.includes(key))throw new Error('disk leaked');
 const chat=await call('chat',{agentId:'affairs',question:'xyzzyplugh完全无关',cloudConsent:true});
 if(chat.json.message.mode!=='ai_general')throw new Error('mode');
 if(/还没接上云端模型|没有调用云端 AI/.test(chat.json.message.text))throw new Error('offline copy');
 console.log('ok');
 app.server.close();
 fs.rmSync(dir,{recursive:true,force:true});
})().catch(e=>{const message=String(e&&e.message||'fail');console.error(message.includes(process.env.CAMPUS_AI_API_KEY)?'fail':message);process.exit(1)});
`;
 const result=spawnSync(process.execPath,['-e',child],{
  cwd:path.join(__dirname,'..'),
  env:{...process.env,CAMPUS_AI_ENABLED:'true',CAMPUS_AI_PROVIDER:'deepseek',CAMPUS_AI_API_KEY:KEY,CAMPUS_AI_MODEL:'deepseek-chat'},
  encoding:'utf8'
 });
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/ok/);
 assert.equal(result.stdout.includes(KEY),false);
 assert.equal((result.stderr||'').includes(KEY),false);
});
