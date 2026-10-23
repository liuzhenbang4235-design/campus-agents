'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {retrieve,chunks}=require('./retrieval.cjs');
const {generate,endpoint,PROVIDERS,modelIssue}=require('./provider.cjs');
const {createPlacesService}=require('./places.cjs');
const {dataset:localPlaces}=require('./local-places.cjs');
const {campusPlaceIntent}=require('./campus-intent.cjs');
const {sourceMetadata}=require('./source-metadata.cjs');
const seed=require('./seed.json');
const profiles={student:{role:'student',team:null},team:{role:'team',team:'t1'},team2:{role:'team',team:'t2'},admin:{role:'admin',team:null}};
function fail(message,status=400){const e=new Error(message);e.status=status;throw e}
function str(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(label+'为空或超过长度限制');return value.trim()}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file)}
function load(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw new Error('本地数据文件无法读取，请先备份检查，未覆盖原文件。')}}
function summarizeForStudent(text,max=160){
 const t=String(text||'').replace(/\s+/g,' ').trim();
 if(!t)return '（暂无摘录）';
 return t.length<=max?t:t.slice(0,max-1)+'…';
}
const FRESHNESS_NOTE='以上为知识库收录内容，办事项请再核对官方最新通知。';
const MAP_FRESHNESS_NOTE='以上地点供参考，营业与能否进入请再确认。';
function formatSourceBullets(sources){
 return sources.map(s=>{
  if(s.sourceType==='map'){
   const body=summarizeForStudent(s.excerpt,220);
   const lines=['• '+body];
   if(s.sourceUrl)lines.push(String(s.sourceUrl).trim());
   return lines.join('\n');
  }
  const title=s.title||'资料';
  const body=summarizeForStudent(s.excerpt,140);
  const lines=['• '+title+'：'+body];
  if(s.sourceUrl)lines.push(String(s.sourceUrl).trim());
  return lines.join('\n');
 }).join('\n');
}
function retrievalText(sources){
 const hasMap=sources.some(s=>s.sourceType==='map');
 const intro=hasMap?'还没接上云端模型，我先按本地点位整理了附近匹配结果，供你参考：':'还没接上云端模型，我先根据已审核资料整理了几条要点，供你参考：';
 const note=hasMap?MAP_FRESHNESS_NOTE:FRESHNESS_NOTE;
 return intro+'\n\n'+formatSourceBullets(sources)+'\n\n'+note;
}
function formatFallbackText(sources){
 if(!sources.length)return '本次 AI 回答格式未能通过核对，且未找到相关的已审核资料。请补充你要办理的事项，例如是学生证还是校园一卡通。';
 return '刚才云端回答格式没通过核对，我先把可参考的资料要点列在下面，你也可以继续提问：\n\n'+formatSourceBullets(sources)+'\n\n'+FRESHNESS_NOTE;
}
function createApp(options={}) {
 const home=path.resolve(__dirname,'..'),dataDir=options.dataDir||path.join(home,'data'),dataFile=path.join(dataDir,'store.json'),configFile=options.configFile||path.join(home,'config.local.json');
 const defaults={enabled:false,provider:'doubao',apiKeys:{},models:{},endpoint:'',dailyLimit:50};
 const NAMES={qwen:'千问',deepseek:'DeepSeek',doubao:'豆包',custom:'自定义模型'};
 // Each provider keeps its own key/model; legacy single apiKey/model belongs only to the provider it was saved with.
 function migrate(raw){const c={...defaults,...raw,apiKeys:{...(raw.apiKeys||{})},models:{...(raw.models||{})}};if(typeof raw.apiKey==='string'&&raw.apiKey&&!c.apiKeys[c.provider])c.apiKeys[c.provider]=raw.apiKey;if(typeof raw.model==='string'&&raw.model&&!c.models[c.provider])c.models[c.provider]=raw.model;delete c.apiKey;delete c.model;return c}
 let db=load(dataFile,seed),config=migrate(load(configFile,defaults)),configRevision=0,placesRevision=0,modelVerified=false;
 if(db.version!==2||!Array.isArray(db.docs)||!Array.isArray(db.agents))throw new Error('本地数据版本不兼容，未覆盖原文件。');
 db.chats??={};db.usage??={};db.placesUsage??={};const sessions=new Map(),inflight=new Set();
 const active=()=>({...config,apiKey:config.apiKeys[config.provider]||'',model:config.models[config.provider]||''});
 const ready=()=>{const c=active();return config.enabled===true&&Boolean(c.apiKey&&c.model)&&!modelIssue(c.model)};
 const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const placesConfig=()=>({enabled:false,apiKey:'',dailyLimit:50,...config.places,revision:placesRevision});
 function status(){const p=placesConfig(),c=active();return {ready:ready(),verified:modelVerified,configIssue:modelIssue(c.model),enabled:config.enabled===true,provider:config.provider,providerName:PROVIDERS[config.provider]?.name||'自定义模型',model:c.model,models:{...config.models},hasKey:Boolean(c.apiKey),keys:Object.fromEntries(['qwen','deepseek','doubao'].map(k=>[k,Boolean(config.apiKeys[k])])),dailyLimit:config.dailyLimit||50,usedToday:db.usage[today()]||0,storage:'server',version:2,places:{localReady:Boolean(localPlaces.places.length),localCount:localPlaces.places.length,localUpdatedAt:localPlaces.collectedAt,enabled:p.enabled===true,ready:p.enabled===true&&Boolean(p.apiKey),hasKey:Boolean(p.apiKey),dailyLimit:p.dailyLimit,usedToday:db.placesUsage[today()]||0}}}
 const places=createPlacesService({getConfig:placesConfig,fetchImpl:options.placesFetchImpl,consume(){const limit=placesConfig().dailyLimit;if((db.placesUsage[today()]||0)>=limit)fail('已达到本机地图查询每日上限。',429);change(next=>{next.placesUsage[today()]=(next.placesUsage[today()]||0)+1})}});
 function writable(actor,a){return profiles[actor].role==='team'&&a?.team===profiles[actor].team}
 function visibleDoc(actor,d){const a=db.agents.find(a=>a.id===d.agent);return profiles[actor].role==='admin'||d.owner===actor||a&&(writable(actor,a)||(d.status==='approved'&&a.status==='published'))}
 function stateFor(actor){return {version:2,agents:db.agents.filter(a=>a.status==='published'||profiles[actor].role==='admin'||writable(actor,a)),docs:db.docs.filter(d=>visibleDoc(actor,d)).map(d=>({...d,chunkCount:chunks(d).length})),audit:profiles[actor].role==='admin'?db.audit:[],chats:Object.fromEntries(Object.entries(db.chats).filter(([k])=>k.startsWith(actor+':')))}}
 function change(action){const next=structuredClone(db);action(next);atomic(dataFile,next);db=next}
 function log(next,action,item){next.audit.push({action,title:item.title||item.name,time:new Date().toLocaleString('zh-CN')});next.audit=next.audit.slice(-200)}
 function purge(next,docId,agentId){for(const[key,m]of Object.entries(next.chats))if(agentId&&key.endsWith(':'+agentId)||m.some(x=>x.sources?.some(s=>s.docId===docId)))delete next.chats[key]}
 function mutate(actor,b){const p=profiles[actor];const admin=()=>{if(p.role!=='admin')fail('该操作需要管理员演示身份。',403)};
  change(next=>{
   if(b.action==='upload'){
    const a=next.agents.find(a=>a.id===b.agent&&a.status==='published');if(!a)fail('目标助手未上线。');if(b.cloudAllowed!==true)fail('请确认资料可以提供给云端 AI。');
    next.docs.push({id:crypto.randomUUID(),agent:a.id,title:str(b.title,'资料标题',80),source:str(b.source,'资料来源',150),content:str(b.content,'资料正文',20000),filename:typeof b.filename==='string'?b.filename.slice(0,200):'',owner:actor,status:'pending',date:today(),cloudAllowed:true,...sourceMetadata(b)});
   }else if(b.action==='editDoc'){
    const d=next.docs.find(d=>d.id===b.id&&d.owner===actor&&d.status==='rejected');if(!d)fail('只能修改本人被驳回的资料。',403);
    Object.assign(d,{title:str(b.title,'标题',80),source:str(b.source,'来源',150),content:str(b.content,'正文',20000),status:'pending',date:today(),...sourceMetadata(b,d)});delete d.reason;
   }else if(b.action==='saveAgent'){
    if(p.role!=='team')fail('需要团队成员身份。',403);let a=b.id?next.agents.find(a=>a.id===b.id):null;if(b.id&&(!writable(actor,a)||a.status==='pending'))fail('不能编辑该助手。',403);
    const categories={'校园生活':['home','teal'],'学习资料':['book','orange'],'学校事务':['brief','']};if(!Object.hasOwn(categories,b.category))fail('分类无效。');
    const values={name:str(b.name,'助手名称',35),description:str(b.description,'助手介绍',180),rules:str(b.rules,'回答规则',1500),category:b.category,status:'draft',icon:categories[b.category][0],color:categories[b.category][1]};
    if(!a){a={id:crypto.randomUUID(),team:p.team};next.agents.push(a)}Object.assign(a,values);delete a.reason;purge(next,null,a.id);
   }else if(b.action==='submitAgent'){
    const a=next.agents.find(a=>a.id===b.id);if(!writable(actor,a)||!['draft','rejected','offline'].includes(a.status))fail('该助手不能提交。',403);a.status='pending';delete a.reason;
   }else if(b.action==='review'){
    admin();if(!['doc','agent'].includes(b.kind)||!['approve','reject'].includes(b.decision))fail('审核操作无效。');const item=(b.kind==='doc'?next.docs:next.agents).find(x=>x.id===b.id&&x.status==='pending');if(!item)fail('内容已处理，请刷新。',409);
    if(b.decision==='reject'){item.status='rejected';item.reason=str(b.reason,'驳回原因',300)}else{item.status=b.kind==='doc'?'approved':'published';delete item.reason}log(next,b.decision==='reject'?'驳回':b.kind==='doc'?'资料入库':'Agent 上线',item);
   }else if(b.action==='offline'){
    admin();if(!['doc','agent'].includes(b.kind))fail('类型无效。');const item=(b.kind==='doc'?next.docs:next.agents).find(x=>x.id===b.id);if(!item)fail('内容不存在。',404);if(item.status==='offline')fail('该内容已经下架。',409);item.status='offline';purge(next,b.kind==='doc'?item.id:null,b.kind==='agent'?item.id:null);log(next,'下架',item);
   }else if(b.action==='online'){
    admin();if(!['doc','agent'].includes(b.kind))fail('类型无效。');const item=(b.kind==='doc'?next.docs:next.agents).find(x=>x.id===b.id);if(!item)fail('内容不存在。',404);if(item.status!=='offline')fail('只有已下架的内容可以重新上架。',409);item.status=b.kind==='doc'?'approved':'published';delete item.reason;log(next,'重新上架',item);
   }else if(b.action==='reset'){admin();const usage=next.usage;Object.assign(next,structuredClone(seed));next.usage=usage;
   }else fail('不支持的操作。');
  });return {state:stateFor(actor),ai:status()};
 }
 function saveConfig(actor,b){
  if(profiles[actor].role!=='admin')fail('请切换为管理员配置模型。',403);
  const allowed=['doubao','deepseek','qwen'];
  const requested=typeof b.provider==='string'?b.provider.trim():'';
  const provider=allowed.includes(requested)?requested:(allowed.includes(config.provider)?config.provider:'doubao');
  if(requested&&!allowed.includes(requested))fail('请选择千问、DeepSeek 或豆包。');
  const model=typeof b.model==='string'?b.model.trim():'';
  const next={...config,provider,apiKeys:{...config.apiKeys},models:{...config.models,[provider]:model},enabled:b.enabled===true,dailyLimit:Number(b.dailyLimit)};
  if(model.length>150||model&&!/^[\w.:-]+$/.test(model))fail('模型 ID 格式不正确。');if(!Number.isInteger(next.dailyLimit)||next.dailyLimit<1||next.dailyLimit>500)fail('每日调用上限应为 1—500。');
  if(b.clearKey===true)delete next.apiKeys[provider];else if(typeof b.apiKey==='string'&&b.apiKey.trim()){if(/\s/.test(b.apiKey.trim())||b.apiKey.length>1000)fail('API Key 格式不正确。');next.apiKeys[provider]=b.apiKey.trim()}
  if(next.enabled&&!next.apiKeys[provider])fail('请填写'+NAMES[provider]+'的 API Key。');
  if(next.enabled&&(!model||b.consent!==true))fail('启用前请填写'+NAMES[provider]+'的模型 ID，并确认云端传输范围。');
  if(modelIssue(model))fail(modelIssue(model));
  endpoint(next);atomic(configFile,next);config=next;configRevision++;modelVerified=false;return {ai:status()};
 }
 function savePlacesConfig(actor,b){
  if(profiles[actor].role!=='admin')fail('请切换为管理员配置地图。',403);
  const p={...placesConfig(),enabled:b.enabled===true,dailyLimit:Number(b.dailyLimit)};delete p.revision;
  if(!Number.isInteger(p.dailyLimit)||p.dailyLimit<1||p.dailyLimit>200)fail('每日地图调用上限应为 1—200。');
  if(b.clearKey===true)p.apiKey='';else if(typeof b.apiKey==='string'&&b.apiKey.trim()){if(!/^[A-Za-z0-9._-]{8,200}$/.test(b.apiKey.trim()))fail('高德 Key 格式不正确。');p.apiKey=b.apiKey.trim()}
  if(p.enabled&&(!p.apiKey||b.consent!==true))fail('启用前请填写高德 Web 服务 Key，并确认传输范围与计费设置。');
  const next={...config,places:p};atomic(configFile,next);config=next;placesRevision++;configRevision++;return{ai:status()};
 }
 async function answer(actor,b,session){
  const question=str(b.question,'问题',500),a=db.agents.find(a=>a.id===b.agentId&&a.status==='published');if(!a)fail('助手尚未上线或已下架。',404);
  if(b.placesContext&&a.id!=='life')fail('临时地图结果仅用于校园生活助手。');
  let mapSources=b.placesContext?places.sources(session,b.placesContext):[];
  const nearbyIntent=!b.placesContext&&a.id==='life'?campusPlaceIntent(question):null;
  if(nearbyIntent){
   // Use a separate short-lived context so automatic lookup cannot invalidate the map form.
   const localSession={actor};
   const centers=await places.run(localSession,{provider:'local',keyword:'南京邮电大学通达学院'},true);
   const campus=centers.centers.find(p=>p.name==='南京邮电大学通达学院');
   if(campus){const result=await places.run(localSession,{provider:'local',scope:'nearby',centerToken:campus.token,...nearbyIntent});if(result.contextToken)mapSources=places.sources(localSession,result.contextToken);}
  }
  const sources=[...mapSources,...retrieve(db.docs,a.id,question)].slice(0,mapSources.length?12:4).map((s,i)=>({...s,citation:i+1})),chatKey=actor+':'+a.id;if(inflight.has(chatKey))fail('上一条问题仍在处理中，请稍等。',409);
  let result;
  const greeting=/^(你好|您好|嗨|哈喽|hello|hi|你是谁|你能做什么)[！!。.?？\s]*$/i.test(question);
  if(greeting&&!ready())result={text:'你好！我是'+a.name+'，可以根据已审核的校园资料回答问题。当前云端模型尚未配置完成，这是本地引导。配置后可以直接与云端模型打招呼，或提问相关校园问题。',sources:[],mode:'local'};
  else if(nearbyIntent&&!mapSources.length)result={text:'本地点位库暂未找到南京邮电大学通达学院周边'+nearbyIntent.radius/1000+'公里内匹配“'+nearbyIntent.keyword+'”的地点。这表示本库未收录，不能据此判断附近没有。'+(nearbyIntent.radius<5000?'可以明确问“学校周边5公里”再查，':'')+'也可补充具体店名和原文链接供核实。此次未调用云端模型。',sources:[],mode:'no_evidence'};
  else if(config.enabled&&modelIssue(active().model))fail(modelIssue(active().model));
  else if(!sources.length&&!ready())result={text:'没有检索到足够相关的已审核资料，因此没有调用云端 AI。请换一种包含主题关键词的问法，或补充相关资料。',sources:[],mode:'no_evidence'};
  else if(!ready())result={text:retrievalText(sources),sources,mode:'retrieval'};
  else{
   if(b.cloudConsent!==true)fail('请先确认本次对话可以发送给云端模型。');const used=db.usage[today()]||0;if(used>=(config.dailyLimit||50))fail('已达到本机每日调用上限。明天可继续，或由管理员调整上限。',429);
   const rev=configRevision,snapshot=sources.filter(s=>s.sourceType!=='map').map(s=>({id:s.docId,content:db.docs.find(d=>d.id===s.docId).content}));change(next=>{next.usage[today()]=(next.usage[today()]||0)+1});inflight.add(chatKey);
   try{
    try{result=await generate(active(),a,question,sources,options.fetchImpl)}catch(e){
     if(!['MODEL_CITATIONS','MODEL_FORMAT'].includes(e.code))throw e;
     result={text:formatFallbackText(sources),sources,mode:'format_fallback'};
    }
    const current=db.agents.find(x=>x.id===a.id);
    if(rev!==configRevision||!current||current.status!=='published'||current.rules!==a.rules||snapshot.some(s=>!db.docs.some(d=>d.id===s.id&&d.status==='approved'&&d.cloudAllowed&&d.content===s.content)))fail('资料或模型设置在回答期间发生变化，请重新提问。',409);
    modelVerified=true;
   }finally{inflight.delete(chatKey)}
  }
  const message={role:'assistant',text:result.text,sources:result.sources,mode:result.mode,time:new Date().toISOString()};change(next=>{const m=next.chats[chatKey]||[];m.push({role:'user',text:question},message);next.chats[chatKey]=m.slice(-40)});return {message,state:stateFor(actor),ai:status()};
 }
 function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
 async function bodyOf(req){let length=0;const buffers=[];for await(const part of req){length+=part.length;if(length>100000)fail('请求内容过大。',413);buffers.push(part)}try{const b=JSON.parse(Buffer.concat(buffers).toString('utf8'));if(!b||Array.isArray(b)||typeof b!=='object')throw 0;return b}catch{fail('请求 JSON 格式不正确。')}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  try{
   const port=server.address().port;if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))fail('无效的本机访问地址。',403);const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname.startsWith('/api/')){
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('不允许跨站访问本地接口。',403);
    if(!['GET','POST'].includes(req.method))fail('方法不支持。',405);if(req.method==='POST'&&(req.headers['x-campus-client']!=='1'||!req.headers['content-type']?.startsWith('application/json')))fail('需要同源 JSON 请求。',403);
    if(url.pathname==='/api/health')return json(res,200,{version:2,app:'campus-agent'});
    let token=(req.headers.cookie||'').match(/(?:^|;\s*)campus_session=([a-f0-9]{48})(?:;|$)/)?.[1],session=sessions.get(token);
    if(!session||session.expires<Date.now()){if(sessions.size>5000)for(const[k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);token=crypto.randomBytes(24).toString('hex');session={actor:'student',expires:Date.now()+12*3600000};sessions.set(token,session);res.setHeader('Set-Cookie','campus_session='+token+'; HttpOnly; SameSite=Strict; Path=/')}
    const actor=session.actor;
    if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,{state:stateFor(actor),profile:actor,ai:status()});if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{ai:status()});if(req.method!=='POST')fail('接口不存在。',404);
    const b=await bodyOf(req);
    if(url.pathname==='/api/session'){if(!Object.hasOwn(profiles,b.profile))fail('身份无效。');session.actor=b.profile;places.reset(session);return json(res,200,{state:stateFor(session.actor),profile:session.actor,ai:status()})}
    if(url.pathname==='/api/places/config')return json(res,200,savePlacesConfig(actor,b));
    if(['/api/places/centers','/api/places/search'].includes(url.pathname)){if(!db.agents.some(a=>a.id==='life'&&a.status==='published'))fail('生活助手暂不可用。',404);return json(res,200,{...await places.run(session,b,url.pathname.endsWith('/centers')),ai:status()})}
    if(url.pathname==='/api/action')return json(res,200,mutate(actor,b));if(url.pathname==='/api/config')return json(res,200,saveConfig(actor,b));if(url.pathname==='/api/chat')return json(res,200,await answer(actor,b,session));fail('接口不存在。',404);
   }
   if(req.method!=='GET'&&req.method!=='HEAD')fail('方法不支持。',405);
   const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/places.js':'places.js','/styles.css':'styles.css'},filename=Object.hasOwn(files,url.pathname)?files[url.pathname]:null;if(!filename)fail('文件不存在。',404);
   const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript'},content=fs.readFileSync(path.join(home,'dist',filename));res.writeHead(200,{'Content-Type':mime[path.extname(filename)]+'; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){json(res,e.status||(e.code?.startsWith('MODEL_')?502:500),{error:e.status||e.code?.startsWith('MODEL_')?e.message:'本地服务处理失败，请检查数据目录或稍后重试。',code:e.code||'REQUEST_ERROR'})}
 });
 server.requestTimeout=70000;server.headersTimeout=10000;return {server,stateFor,status};
}
module.exports={createApp};
