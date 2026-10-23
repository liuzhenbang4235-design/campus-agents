const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createApp}=require('../lib/backend.cjs');
const {retrieve,chunks}=require('../lib/retrieval.cjs');
const {generate}=require('../lib/provider.cjs');
const seed=require('../lib/seed.json');
async function setup(t,fetchImpl){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));
 const opts={dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),fetchImpl};
 const app=createApp(opts);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.join(os.tmpdir(),'campus-agent-test-')));fs.rmSync(resolved,{recursive:true,force:true})});
 async function request(route,body,headers={}){const res=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Campus-Client':'1'}:{}),Cookie:cookie,...headers},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const data=await res.json();return {status:res.status,...data}}
 return {request,base,opts,dir,app};
}
const modelResponse=(answer='示例学生证补办需要照片和申请表。[1]',citations=[1])=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer,citations})}}],usage:{total_tokens:80}}),{status:200});
async function enable(request,limit=50){await request('session',{profile:'admin'});const r=await request('config',{model:'ep-test-only',apiKey:'test-key-not-real',enabled:true,dailyLimit:limit,consent:true});assert.equal(r.status,200)}

test('chunking retains final text and filters unapproved, offline and other agent documents',()=>{
 const doc={id:'long',agent:'a',title:'打印指南',content:'打印资料。'.repeat(400)+'末尾唯一内容',status:'approved',cloudAllowed:true};
 assert.ok(chunks(doc).at(-1).excerpt.endsWith('末尾唯一内容'));
 const found=retrieve([doc,{...doc,id:'pending',status:'pending'},{...doc,id:'other',agent:'b'},{...doc,id:'offline',status:'offline'},{...doc,id:'private',cloudAllowed:false}],'a','打印');
 assert.ok(found.length);assert.ok(found.every(s=>s.docId==='long'));assert.deepEqual(retrieve([doc],'a','宇宙黑洞'),[]);
});
test('a directory answer retains the event name and its classification across a former hard boundary',()=>{
 const row='85. 全国大学生职业规划大赛；C类；招生就业处；教务处（创新创业学院）。';
 const prefix=('目录背景说明。'.repeat(100)+'\n');
 const doc={id:'catalog',agent:'study',title:'2025竞赛目录',content:prefix+row+'\n'+('其他说明。'.repeat(100)),status:'approved',cloudAllowed:true};
 const hits=retrieve([doc],'study','全国大学生职业规划大赛属于哪一类竞赛？');
 assert.ok(hits.some(s=>s.excerpt.includes(row)),'The cited excerpt must include both the full name and category');
 assert.ok(chunks(doc).filter(c=>c.excerpt.includes('全国大学生职业规划')).every(c=>c.excerpt.includes(row)),'An indexed event name must not lose its classification at a chunk boundary');
 assert.ok(chunks(doc).every(c=>c.excerpt.length<=720));
});
test('unbroken long content remains bounded and keeps every character through overlapping chunks',()=>{
 const content=Array.from({length:2001},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
 const parts=chunks({id:'long',title:'连续内容',content});
 assert.ok(parts.every(c=>c.excerpt.length<=720));
 assert.ok(parts.at(-1).excerpt.endsWith(content.slice(-100)));
 for(let i=0;i<content.length;i++)assert.ok(parts.some(c=>c.excerpt.includes(content[i])));
});
test('a specific form name survives a colloquial question with little exact wording overlap',()=>{
 const doc={id:'offsite',agent:'affairs',title:'外出毕设申请材料',content:'填写接收单位、研究课题和校内导师意见。',status:'approved',cloudAllowed:true};
 const question='去外面做毕设需要准备什么';
 assert.equal(retrieve([doc],'affairs',question)[0]?.docId,'offsite');
 assert.deepEqual(retrieve([doc],'affairs','外面有没有好吃的餐馆'),[]);
});
test('unconfigured service returns real local results without any model call',async t=>{
 const {request}=await setup(t,()=>{throw Error('must not call')});const r=await request('chat',{agentId:'affairs',question:'学生证怎么补办？'});
 assert.equal(r.status,200);assert.equal(r.message.mode,'retrieval');assert.equal(r.message.sources[0].docId,'d3');assert.equal(r.ai.usedToday,0);
 assert.match(r.message.text,/还没接上云端模型/);
 assert.match(r.message.text,/• .*学生证/);
 assert.doesNotMatch(r.message.text,/尚未启用云端模型 API/);
 assert.doesNotMatch(r.message.text,/\n\n\[1\] /);
 // Avoid date stacking in the student-facing retrieval summary.
 assert.doesNotMatch(r.message.text,/入库于|采集日期|查询时间/);
});
test('unconfigured retrieval summary stays readable and light on dates',async t=>{
 const {request}=await setup(t,()=>{throw Error('must not call')});
 const r=await request('chat',{agentId:'affairs',question:'学生证怎么补办？'});
 assert.equal(r.message.mode,'retrieval');
 assert.match(r.message.text,/供你参考/);
 assert.match(r.message.text,/• /);
 assert.match(r.message.text,/请再核对官方最新通知/);
 if(r.message.sources[0].date)assert.ok(!r.message.text.includes(r.message.sources[0].date),'student summary should not stack source dates');
 assert.doesNotMatch(r.message.text,/(请再核对官方最新通知.*){2}/s);
});
test('retrieval bullets expose source URLs as plain http(s) lines',async t=>{
 const {request,opts}=await setup(t,()=>{throw Error('must not call')});
 const up=await request('action',{action:'upload',agent:'affairs',title:'证卡补办链接说明',source:'演示官网',content:'学生证补办可先在示例窗口提交申请，再到服务中心领取。',sourceUrl:'https://example.com/campus/student-id',publishedAt:'2026-09-01',collectedAt:'2026-09-20',sourceKind:'official',cloudAllowed:true});
 const d=up.state.docs.find(x=>x.title==='证卡补办链接说明');
 await request('session',{profile:'admin'});
 assert.equal((await request('action',{action:'review',kind:'doc',id:d.id,decision:'approve'})).status,200);
 await request('session',{profile:'student'});
 const r=await request('chat',{agentId:'affairs',question:'证卡补办链接说明怎么弄'});
 assert.equal(r.message.mode,'retrieval');
 assert.match(r.message.text,/• .*证卡补办链接说明/);
 assert.match(r.message.text,/https:\/\/example\.com\/campus\/student-id/);
 assert.match(r.message.text,/请再核对官方最新通知/);
});
test('greetings give local guidance without pretending the model was contacted',async t=>{
 const {request}=await setup(t,()=>{throw Error('must not call')});const r=await request('chat',{agentId:'affairs',question:'你好'});
 assert.equal(r.message.mode,'local');assert.match(r.message.text,/校园办事助手/);assert.equal(r.ai.usedToday,0);
});
test('configured greetings call the cloud model and return its actual reply without invented citations',async t=>{
 let calls=0;const {request}=await setup(t,async()=>{calls++;return modelResponse('你好，我是校园办事助手，有什么可以帮你？',[])});
 await enable(request);assert.equal((await request('chat',{agentId:'affairs',question:'你好'})).status,400);
 const r=await request('chat',{agentId:'affairs',question:'你好',cloudConsent:true});
 assert.equal(calls,1);assert.equal(r.message.mode,'ai_general');assert.equal(r.message.text,'你好，我是校园办事助手，有什么可以帮你？');assert.deepEqual(r.message.sources,[]);assert.equal(r.ai.verified,true);
});
test('API key names cannot be saved as model IDs and never count as verified connections',async t=>{
 const {request}=await setup(t);await request('session',{profile:'admin'});
 const r=await request('config',{model:'apikey-example-name',apiKey:'fake-test-key',enabled:true,dailyLimit:50,consent:true});
 assert.equal(r.status,400);assert.match(r.error,/model 字段/);const state=await request('config');assert.equal(state.ai.verified,false);assert.equal(state.ai.hasKey,false);
});
test('generic campus wording does not pull an unrelated library document into a printing answer',()=>{
 const d={id:'printing',agent:'life',title:'校园打印',content:'校园打印在服务台办理。',cloudAllowed:true,status:'approved'};
 assert.deepEqual(retrieve([...seed.docs,d],'life','校园打印').map(x=>x.docId),['printing']);
});
test('server owns review status; student cannot approve and pending records are not retrieved',async t=>{
 const {request,opts}=await setup(t);const upload=await request('action',{action:'upload',agent:'life',title:'打印指南',source:'虚构',content:'打印需要交给示例服务台。',cloudAllowed:true,status:'approved',owner:'admin'});
 const d=upload.state.docs.find(d=>d.title==='打印指南');assert.equal(d.status,'pending');assert.equal(d.owner,'student');
 assert.equal((await request('action',{action:'review',kind:'doc',id:d.id,decision:'approve'})).status,403);
 assert.equal((await request('chat',{agentId:'life',question:'打印'})).message.mode,'no_evidence');
 await request('session',{profile:'admin'});assert.equal((await request('action',{action:'review',kind:'doc',id:d.id,decision:'approve'})).status,200);
 assert.equal((await request('chat',{agentId:'life',question:'打印'})).message.sources[0].docId,d.id);
 const reopened=createApp(opts);assert.equal(reopened.stateFor('student').docs.find(x=>x.id===d.id).status,'approved');
 await request('action',{action:'offline',kind:'doc',id:d.id});const after=await request('chat',{agentId:'life',question:'打印'});assert.equal(after.message.mode,'no_evidence');assert.ok(!JSON.stringify(after.state.chats).includes('打印需要交给'));
});
test('team separation and agent draft-review-publish flow',async t=>{
 const {request}=await setup(t);await request('session',{profile:'team'});
 let r=await request('action',{action:'saveAgent',name:'测试助手',description:'测试说明',rules:'只引用资料',category:'校园生活'});const a=r.state.agents.find(a=>a.name==='测试助手');assert.equal(a.status,'draft');
 await request('session',{profile:'team2'});r=await request('action',{action:'saveAgent',id:a.id,name:'篡改',description:'修改',rules:'修改',category:'校园生活'});assert.equal(r.status,403);
 assert.ok(!(await request('state')).state.agents.some(x=>x.id===a.id));await request('session',{profile:'team'});await request('action',{action:'submitAgent',id:a.id});await request('session',{profile:'admin'});await request('action',{action:'review',kind:'agent',id:a.id,decision:'approve'});await request('session',{profile:'student'});assert.equal((await request('state')).state.agents.find(x=>x.id===a.id).status,'published');
});
test('reject, edit and resubmit preserves ownership and requires reapproval',async t=>{
 const {request}=await setup(t);await request('session',{profile:'admin'});await request('action',{action:'review',kind:'doc',id:'d4',decision:'reject',reason:'请补充来源'});await request('session',{profile:'student'});const r=await request('action',{action:'editDoc',id:'d4',title:'失物招领说明',source:'虚构',content:'示例失物招领说明。'});assert.equal(r.state.docs.find(d=>d.id==='d4').status,'pending');
});
test('Doubao adapter sends only selected approved fragments and never exposes key',async t=>{
 let payload,url,headers;const {request,base}=await setup(t,async(u,init)=>{url=u;headers=init.headers;payload=JSON.parse(init.body);return modelResponse()});await enable(request);
 assert.ok(!JSON.stringify(await request('config')).includes('test-key-not-real'));
 assert.equal((await fetch(base+'/config.local.json')).status,404);
 assert.equal((await request('chat',{agentId:'affairs',question:'学生证补办'})).status,400);
 const r=await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});assert.equal(r.status,200);assert.equal(r.message.mode,'ai');assert.equal(r.ai.usedToday,1);
 assert.equal(url,'https://ark.cn-beijing.volces.com/api/v3/chat/completions');assert.equal(headers.Authorization,'Bearer test-key-not-real');assert.equal(payload.response_format.type,'json_object');assert.deepEqual(payload.thinking,{type:'disabled'});
 assert.equal(payload.messages.length,2);assert.ok(payload.messages[1].content.includes('补办'));assert.ok(!payload.messages[1].content.includes('图书馆'));assert.ok(!payload.messages[1].content.includes('失物招领'));
});

test('config accepts qwen and deepseek providers and routes to their endpoints without doubao thinking flag',async t=>{
 let seen=[];const {request}=await setup(t,async(u,init)=>{seen.push({url:u,body:JSON.parse(init.body)});return modelResponse()});
 await request('session',{profile:'admin'});
 let r=await request('config',{provider:'qwen',model:'qwen-plus',apiKey:'test-key-not-real',enabled:true,dailyLimit:50,consent:true});
 assert.equal(r.status,200);assert.equal(r.ai.provider,'qwen');assert.match(r.ai.providerName,/千问|百炼/);
 r=await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});assert.equal(r.status,200);
 assert.equal(seen[0].url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');assert.equal(seen[0].body.thinking,undefined);
 r=await request('config',{provider:'deepseek',model:'deepseek-chat',apiKey:'test-key-not-real',enabled:true,dailyLimit:50,consent:true});
 assert.equal(r.status,200);assert.equal(r.ai.provider,'deepseek');
 r=await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});assert.equal(r.status,200);
 assert.equal(seen[1].url,'https://api.deepseek.com/chat/completions');assert.equal(seen[1].body.thinking,undefined);
 r=await request('config',{provider:'not-a-real-vendor',model:'x',apiKey:'k',enabled:false,dailyLimit:50});
 assert.equal(r.status,400);
});


test('deadline questions receive the current China calendar date across UTC midnight boundaries',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-04T16:01:00Z')});
 let sent;
 const sources=[{citation:1,title:'2026报名通知',source:'官方公开通知',date:'2026-09-23',excerpt:'本次报名截止2026年10月4日23:59。'}];
 await generate({provider:'doubao',model:'test',apiKey:'not-real'},{name:'学习助手',rules:'依据公开资料'},'现在还可以报名吗？',sources,async(_url,init)=>{sent=JSON.parse(init.body);return modelResponse('该批报名已经截止。[1]',[1]);});
 assert.match(sent.messages[0].content,/当前北京时间（Asia\/Shanghai）：2026-10-05 00:01:00/);
 assert.match(sent.messages[0].content,/入库日期不等于原文发布/);
 const data=JSON.parse(sent.messages[1].content);assert.equal(data.sources[0].date,'2026-09-23');assert.equal(data.sources[0].text,sources[0].excerpt);
});
test('general questions use quota and daily request cap survives resets',async t=>{
 let calls=0;const {request}=await setup(t,async()=>{calls++;return modelResponse("黑洞是一种引力极强的天体。",[])});await enable(request,1);
 const none=await request('chat',{agentId:'affairs',question:'宇宙黑洞',cloudConsent:true});assert.equal(none.message.mode,'ai_general');assert.equal(calls,1);
 await request('action',{action:'reset'});
 assert.equal((await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true})).status,429);assert.equal(calls,1);
});
test('model 401/429 errors are explicit and response bodies cannot leak credentials',async t=>{
 const {request}=await setup(t,async()=>new Response('secret upstream body test-key-not-real',{status:401}));await enable(request);const r=await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});assert.equal(r.status,502);assert.match(r.error,/密钥/);assert.ok(!JSON.stringify(r).includes('test-key-not-real'));assert.equal(Object.keys((await request('state')).state.chats).length,0);
});
test('fabricated citations are rejected instead of shown as sourced AI answers',async()=>{
 const src=retrieve(seed.docs,'affairs','学生证补办'),a=seed.agents.find(a=>a.id==='affairs'),config={provider:'doubao',model:'test',apiKey:'test'};
 await assert.rejects(()=>generate(config,a,'问题',src,async()=>modelResponse('编造答案[99]',[99])),/无效引用/);
 await assert.rejects(()=>generate(config,a,'问题',src,async()=>new Response(JSON.stringify({choices:[{message:{content:'not JSON'}}]}))),/引用格式/);
});
test('revocation during model inference discards result',async t=>{
 let finish,started;const began=new Promise(r=>started=r);const {request}=await setup(t,()=>{started();return new Promise(r=>finish=r)});await enable(request);
 const pending=request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});await began;await request('action',{action:'offline',kind:'doc',id:'d3'});finish(modelResponse());const r=await pending;assert.equal(r.status,409);assert.ok(!JSON.stringify((await request('state')).state.chats).includes('照片'));
});
test('cross-origin API access and unauthorized settings mutation are rejected',async t=>{
 const {request}=await setup(t);assert.equal((await request('session',{profile:'admin'},{Origin:'https://evil.example'})).status,403);assert.equal((await request('config',{enabled:false,dailyLimit:50})).status,403);assert.equal((await request('action',{action:'reset'},{'X-Campus-Client':''})).status,403);
});

test('normal questions without documents reach the model only with consent',async t=>{
 let calls=0;const {request}=await setup(t,async(url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.deepEqual(JSON.parse(body.messages[1].content).sources,[]);return modelResponse('每天练习30分钟：听力10分钟、阅读10分钟、复习10分钟。这是一般学习建议。',[])});
 await enable(request);
 assert.equal((await request('chat',{agentId:'affairs',question:'帮我制定一周英语学习计划'})).status,400);assert.equal(calls,0);
 const r=await request('chat',{agentId:'affairs',question:'帮我制定一周英语学习计划',cloudConsent:true});assert.equal(r.status,200);assert.equal(calls,1);assert.match(r.message.text,/听力/);assert.equal(r.message.mode,'ai_general');assert.deepEqual(r.message.sources,[]);
});
test('uncited answers remain visible when retrieval found incidental matches',async()=>{
 const src=retrieve(seed.docs,'affairs','学生证补办');assert.ok(src.length);
 const result=await generate({provider:'doubao',model:'test',apiKey:'test'},seed.agents.find(a=>a.id==='affairs'),'学生证补办让我焦虑，怎样安排待办？',src,async()=>modelResponse('可以先列出待办，再分成今天和明天两组。这是一般建议。',[]));
 assert.match(result.text,/待办/);assert.equal(result.mode,'ai_general');assert.deepEqual(result.sources,[]);
});

test('citation representation differences preserve known sources without rejecting the answer',async()=>{
 const src=retrieve(seed.docs,'affairs','学生证补办'),a=seed.agents.find(a=>a.id==='affairs'),config={provider:'doubao',model:'test',apiKey:'test'};
 for(const [answer,ids] of [['准备照片。',['1']],['准备照片。【1】',[]],['准备照片。[ 1 ]',[1]]]){
  const r=await generate(config,a,'问题',src,async()=>modelResponse(answer,ids));assert.equal(r.mode,'ai');assert.match(r.text,/\[1\]/);assert.equal(r.sources.length,1);
 }
 await assert.rejects(()=>generate(config,a,'问题',src,async()=>modelResponse('错误引用【99】',[])),/无效引用/);
});
test('invalid model citations fall back to real excerpts and conversation remains usable',async t=>{
 let calls=0;const {request}=await setup(t,async()=>++calls===1?modelResponse('绝不能显示的编造内容[99]',[99]):modelResponse());await enable(request);
 const r=await request('chat',{agentId:'affairs',question:'学生证丢了',cloudConsent:true});assert.equal(r.status,200);assert.equal(r.message.mode,'format_fallback');assert.ok(!r.message.text.includes('绝不能显示'));assert.equal(r.message.sources[0].docId,'d3');
 const next=await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});assert.equal(next.status,200);assert.equal(next.message.mode,'ai');assert.equal(next.ai.usedToday,2);
});
test('invalid answer with no sources produces a truthful clarification without fabricated facts',async t=>{
 const {request}=await setup(t,async()=>modelResponse('绝不能显示[99]',[99]));await enable(request);
 const r=await request('chat',{agentId:'affairs',question:'宇宙黑洞',cloudConsent:true});assert.equal(r.status,200);assert.equal(r.message.mode,'format_fallback');assert.deepEqual(r.message.sources,[]);assert.ok(!r.message.text.includes('绝不能显示'));
});

test('colloquial questions find the topic while source boilerplate does not outrank the answer',()=>{
 const doc=(id,title,content)=>({id,title,content,agent:'life',status:'approved',cloudAllowed:true});
 const docs=[doc('park','宋夹城体育休闲公园','宋夹城适合散步游览。'),doc('food','早茶茶社','这里提供早茶。\n范围：扬州市区，散步路线需核实。'),doc('museum','扬州博物馆','室内展览。'),doc('coffee','咖啡甜品','庭圆咖啡提供咖啡甜品。')];
 assert.equal(retrieve(docs,'life','周末想出去逛逛')[0].docId,'park');
 assert.equal(retrieve(docs,'life','下雨天可以去哪玩')[0].docId,'museum');
 assert.equal(retrieve(docs,'life','想喝咖啡')[0].docId,'coffee');
 assert.ok(!retrieve(docs,'life','早茶').some(s=>s.docId==='park'));
 const cards=[{...doc('card','校园一卡通','校园卡丢失需要挂失补办。'),agent:'affairs'}, {...doc('student','学生证','学生证补办流程。'),agent:'affairs'}];
 assert.deepEqual(new Set(retrieve(cards,'affairs','卡丢了怎么办').map(s=>s.docId)),new Set(['card','student']));
});

test('a long document cannot displace other relevant sources',()=>{
 const d={id:'a',title:'咖啡',content:'咖啡甜品。'.repeat(500),agent:'life',status:'approved',cloudAllowed:true};
 const sources=retrieve([d,{...d,id:'b',title:'茶社咖啡',content:'咖啡甜品也可在此查询。'}],'life','咖啡');
 assert.ok(sources.slice(0,2).some(s=>s.docId==='b'));
});

const programDoc=(id,name,content='培养专业知识与实践能力。')=>({id,agent:'study',title:`通达学院：${name}学什么`,content,status:'approved',cloudAllowed:true});
test('full-name comparisons retain each named program ahead of broad overlapping catalogs',()=>{
 const docs=[programDoc('software','软件工程','软件设计与开发。'),programDoc('computer','计算机科学与技术','计算机系统与通信。'),
  programDoc('management','大数据管理与应用','管理学、数据分析。'),programDoc('data','数据科学与大数据技术','数据科学、系统开发。'),
  ...Array.from({length:5},(_,i)=>({id:'catalog'+i,agent:'study',status:'approved',cloudAllowed:true,title:'计算机科学与技术和数据科学与大数据技术专业对比目录',content:'计算机科学与技术、数据科学与大数据技术、大数据管理与应用，专业有什么不一样。'}))];
 for(const [q,expected] of [
  ['软件工程和计算机科学与技术到底差在哪，平时分别学些啥？',['software','computer']],
  ['大数据管理与应用和数据科学与大数据技术有啥不一样？',['management','data']]
 ])assert.deepEqual(new Set(retrieve(docs,'study',q,2).map(s=>s.docId)),new Set(expected));
});
test('common program abbreviations support comparisons without query-specific rewrites',()=>{
 const docs=[programDoc('media','网络与新媒体','内容传播与运营。'),programDoc('digital','数字媒体技术','图形技术与动画制作。'),
  programDoc('software','软件工程','软件开发。'),programDoc('computer','计算机科学与技术','计算机系统。')];
 for(const [q,ids] of [['网新和数媒是不是都拍视频？',['media','digital']],['我想学计科，还是软工，课程有什么区别？',['computer','software']]]){
  const hits=retrieve(docs,'study',q,2);assert.deepEqual(new Set(hits.map(s=>s.docId)),new Set(ids));assert.deepEqual(hits.map(s=>s.citation),[1,2]);
 }
});
test('abbreviations embedded in unrelated words do not introduce program sources',()=>{
 const docs=[programDoc('media','网络与新媒体','传播内容运营。'),programDoc('ai','人工智能','机器学习算法。'),
  {id:'network',agent:'study',status:'approved',cloudAllowed:true,title:'校园网新增功能',content:'校园网新增功能。'},
  {id:'api',agent:'study',status:'approved',cloudAllowed:true,title:'OpenAI接口说明',content:'OpenAI接口说明。'}];
 assert.deepEqual(retrieve(docs,'study','校园网新增功能').map(s=>s.docId),['network']);
 assert.deepEqual(retrieve(docs,'study','OpenAI接口说明').map(s=>s.docId),['api']);
 assert.equal(retrieve(docs,'study','AI专业学什么')[0]?.docId,'ai');
});
test('a longer program name and a separate short program mention are distinguished',()=>{
 const docs=[programDoc('electrical','电气工程及其自动化','电机、电力系统。'),programDoc('automation','自动化','过程控制、运动控制。'),
  {id:'course',agent:'study',status:'approved',cloudAllowed:true,title:'自动化相关课程差异目录',content:'课程对比。'}];
 assert.equal(retrieve(docs,'study','电气工程及其自动化有哪些课',1)[0].docId,'electrical');
 assert.deepEqual(new Set(retrieve(docs,'study','电气工程及其自动化和自动化是一回事吗，课程差在哪？',2).map(s=>s.docId)),new Set(['electrical','automation']));
});
test('program alias and comparison coverage never bypass approval, cloud consent or agent scope',()=>{
 const media=programDoc('media','网络与新媒体','传播内容运营。');
 const docs=[{...media,status:'pending'},{...media,id:'offline',status:'offline'},{...media,id:'private',cloudAllowed:false},
  {...media,id:'other',agent:'life'},programDoc('digital','数字媒体技术','图形技术与动画制作。')];
 assert.deepEqual(retrieve(docs,'study','网新和数媒有什么区别').map(s=>s.docId),['digital']);
 assert.deepEqual(retrieve(docs,'life','网新'),[]);
});

test('each provider keeps its own API key and requests never use another provider key',async t=>{
 const auth=[];const {request,opts}=await setup(t,async(u,init)=>{auth.push({url:u,key:init.headers.Authorization});return modelResponse()});
 await request('session',{profile:'admin'});
 let r=await request('config',{provider:'doubao',model:'ep-test-only',apiKey:'fake-doubao-key',enabled:true,dailyLimit:50,consent:true});assert.equal(r.status,200);
 r=await request('config',{provider:'qwen',model:'qwen-plus',apiKey:'',enabled:true,dailyLimit:50,consent:true});
 assert.equal(r.status,400);assert.match(r.error,/请填写千问的 API Key/);
 r=await request('config');assert.equal(r.ai.provider,'doubao');
 r=await request('config',{provider:'qwen',model:'qwen-plus',apiKey:'fake-qwen-key',enabled:true,dailyLimit:50,consent:true});assert.equal(r.status,200);
 assert.deepEqual(r.ai.keys,{qwen:true,deepseek:false,doubao:true});assert.equal(r.ai.hasKey,true);
 assert.ok(!JSON.stringify(r).includes('fake-'),'status must not leak keys');
 await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});
 r=await request('config',{provider:'doubao',model:'ep-test-only',enabled:true,dailyLimit:50,consent:true});assert.equal(r.status,200);assert.equal(r.ai.model,'ep-test-only');
 await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});
 r=await request('config',{provider:'qwen',model:'qwen-plus',enabled:true,dailyLimit:50,consent:true});assert.equal(r.status,200);
 await request('chat',{agentId:'affairs',question:'学生证补办',cloudConsent:true});
 assert.deepEqual(auth.map(x=>x.key),['Bearer fake-qwen-key','Bearer fake-doubao-key','Bearer fake-qwen-key']);
 assert.ok(auth.every(x=>x.url.includes('dashscope')===(x.key==='Bearer fake-qwen-key')));
 r=await request('config',{provider:'qwen',model:'qwen-plus',enabled:false,dailyLimit:50,clearKey:true});
 assert.deepEqual(r.ai.keys,{qwen:false,deepseek:false,doubao:true});
 const saved=JSON.parse(fs.readFileSync(opts.configFile,'utf8'));assert.equal(saved.apiKey,undefined);assert.equal(saved.apiKeys.doubao,'fake-doubao-key');
 r=await request('config',{provider:'deepseek',model:'deepseek-chat',enabled:true,dailyLimit:50,consent:true});assert.match(r.error,/请填写DeepSeek的 API Key/);
});
test('review list hides offline for items already offline and offers relist',()=>{
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){}}},querySelectorAll(){return []}};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location:{hash:'#admin',origin:'http://127.0.0.1:4173'},history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
currentProfile='admin';reviewTab='published';
state={version:2,agents:[{id:'life',name:'校园生活助手',status:'published',team:'t1',category:'校园生活',description:'d',rules:'r',icon:'home',color:''},{id:'study',name:'学长学姐学习库',status:'offline',team:'t2',category:'学习资料',description:'d',rules:'r',icon:'book',color:''}],docs:[{id:'d1',title:'图书馆借阅指南',status:'approved',agent:'life',owner:'student',source:'s',date:'2026-09-23',content:'c'},{id:'d3',title:'学生证补办流程',status:'offline',agent:'affairs',owner:'student',source:'s',date:'2026-09-23',content:'c'}],audit:[],chats:{}};
ai={ready:false,provider:'doubao',dailyLimit:50,usedToday:0};
globalThis.__html=admin();
`,ctx);
 const html=ctx.__html;
 assert.match(html,/图书馆借阅指南<\/p><small>资料 · 已入库<\/small><\/div><button class="btn danger small" data-action="offline" data-kind="doc" data-id="d1">下架<\/button>/);
 assert.match(html,/学生证补办流程<\/p><small>资料 · 已下架<\/small><\/div><button class="btn small" data-action="online" data-kind="doc" data-id="d3">重新上架<\/button>/);
 assert.match(html,/校园生活助手<\/p><small>Agent · 已上线<\/small><\/div><button class="btn danger small" data-action="offline" data-kind="agent" data-id="life">下架<\/button>/);
 assert.match(html,/学长学姐学习库<\/p><small>Agent · 已下架<\/small><\/div><button class="btn small" data-action="online" data-kind="agent" data-id="study">重新上架<\/button>/);
 assert.doesNotMatch(html,/data-id="d3">下架/);
 assert.doesNotMatch(html,/data-id="study">下架/);
});
test('offlining an already offline document does not append another audit log',async t=>{
 const {request}=await setup(t);
 await request('session',{profile:'admin'});
 let r=await request('action',{action:'offline',kind:'doc',id:'d3'});
 assert.equal(r.status,200);
 assert.equal(r.state.docs.find(d=>d.id==='d3').status,'offline');
 assert.equal(r.state.audit.filter(a=>a.action==='下架').length,1);
 const again=await request('action',{action:'offline',kind:'doc',id:'d3'});
 assert.equal(again.status,409);
 assert.match(again.error,/已经下架/);
 r=await request('state');
 assert.equal(r.state.docs.find(d=>d.id==='d3').status,'offline');
 assert.equal(r.state.audit.filter(a=>a.action==='下架').length,1);
 await request('session',{profile:'student'});
 assert.equal((await request('action',{action:'online',kind:'doc',id:'d3'})).status,403);
 await request('session',{profile:'admin'});
 r=await request('state');
 assert.equal(r.state.audit.filter(a=>a.action==='重新上架').length,0);
 r=await request('action',{action:'online',kind:'doc',id:'d3'});
 assert.equal(r.status,200);
 assert.equal(r.state.docs.find(d=>d.id==='d3').status,'approved');
 assert.equal(r.state.audit.filter(a=>a.action==='重新上架').length,1);
 assert.equal(r.state.audit.filter(a=>a.action==='下架').length,1);
 const repeat=await request('action',{action:'online',kind:'doc',id:'d3'});
 assert.equal(repeat.status,409);
 assert.match(repeat.error,/重新上架/);
 r=await request('state');
 assert.equal(r.state.docs.find(d=>d.id==='d3').status,'approved');
 assert.equal(r.state.audit.filter(a=>a.action==='重新上架').length,1);
 const found=await request('chat',{agentId:'affairs',question:'学生证怎么补办？'});
 assert.equal(found.message.sources[0].docId,'d3');
 r=await request('action',{action:'offline',kind:'agent',id:'study'});
 assert.equal(r.status,200);
 assert.equal(r.state.agents.find(a=>a.id==='study').status,'offline');
 assert.equal((await request('action',{action:'offline',kind:'agent',id:'study'})).status,409);
 r=await request('state');
 assert.equal(r.state.audit.filter(a=>a.action==='下架'&&a.title==='学长学姐学习库').length,1);
 r=await request('action',{action:'online',kind:'agent',id:'study'});
 assert.equal(r.status,200);
 assert.equal(r.state.agents.find(a=>a.id==='study').status,'published');
 assert.equal(r.state.audit.filter(a=>a.action==='重新上架'&&a.title==='学长学姐学习库').length,1);
});
test('legacy single apiKey/model config migrates only to the saved provider',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-agent-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const configFile=path.join(dir,'config.json');fs.writeFileSync(configFile,JSON.stringify({enabled:true,provider:'doubao',model:'ep-legacy',apiKey:'fake-legacy-key',dailyLimit:50}));
 const app=createApp({dataDir:path.join(dir,'data'),configFile});const s=app.status();
 assert.deepEqual(s.keys,{qwen:false,deepseek:false,doubao:true});assert.equal(s.model,'ep-legacy');assert.equal(s.hasKey,true);assert.equal(s.ready,true);
 assert.ok(!JSON.stringify(s).includes('fake-legacy-key'));
});
