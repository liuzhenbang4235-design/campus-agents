'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createApp}=require('../lib/backend.cjs');
const {createBoard}=require('../lib/campus-board.cjs');
const {generate}=require('../lib/provider.cjs');

function windowFields(days=7,now=Date.now()){
 return {windowStart:new Date(now-60*1000).toISOString(),windowEnd:new Date(now+days*86400000).toISOString()};
}

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
 assert.equal((await request('auth/register',{studentId:'2021000',password:'secret1'})).status,400);
 assert.equal((await request('auth/register',{studentId:'202100011',password:'secret1'})).status,400);
 assert.equal((await request('auth/register',{studentId:'20210001',password:'123'})).status,400);
 let r=await request('auth/register',{studentId:'20210001',password:'secret1',displayName:'甲同学'});
 assert.equal(r.status,200);assert.equal(r.account.studentId,'20210001');
 assert.equal((await request('auth/register',{studentId:'20210001',password:'secret1'})).status,409);
 await request('auth/logout',{});
 r=await request('auth/login',{studentId:'20210001',password:'wrong!!'});
 assert.equal(r.status,401);
 r=await request('auth/login',{studentId:'20210001',password:'secret1'});
 assert.equal(r.status,200);assert.equal(r.account.displayName,'甲同学');
 const made=await request('board/create',{type:'二手教材',description:'大一高数上下册，八成新',contact:'微信 demo-only',...windowFields(7)});
 assert.equal(made.status,200);
 assert.equal(made.listing.type,'二手教材');
 assert.equal(made.listing.title,undefined);
 assert.equal(made.listing.longTerm,false);
 assert.ok(made.listing.windowStart&&made.listing.windowEnd);
 assert.equal((await request('board/create',{type:'',description:'没有类型',contact:'微信 a',...windowFields(3)})).status,400);
});

test('expired listings are hidden from board list and chat retrieval',async t=>{
 const {request,opts}=await setup(t);
 await request('auth/register',{studentId:'20220001',password:'secret1',displayName:'乙'});
 const created=await request('board/create',{type:'代课',description:'周三下午高等数学代课',contact:'QQ 10001',...windowFields(3)});
 assert.equal(created.status,200);
 const id=created.listing.id;
 const board=JSON.parse(fs.readFileSync(opts.boardFile,'utf8'));
 const past=new Date(Date.now()-3600000).toISOString();
 const row=board.listings.find(l=>l.id===id);
 row.expiresAt=past;row.windowEnd=past;
 fs.writeFileSync(opts.boardFile,JSON.stringify(board,null,2));
 // reload app from disk
 const app2=createApp(opts);
 assert.deepEqual(app2.board.listActive(),[]);
 assert.deepEqual(app2.board.matchListings('有没有高数代课'),[]);
});

test('chat retrieval hits active campus board listings as peer sources',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20230001',password:'secret1',displayName:'丙'});
 assert.equal((await request('board/create',{type:'二手教材',description:'出高数教材，高等数学教材转让，成色良好',contact:'微信 peer-only',...windowFields(7)})).status,200);
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
 const r=await request('board/create',{type:'代购',description:'下午帮带一杯奶茶',contact:'手机 13800000000',...windowFields(3)});
 assert.equal(r.status,401);
});

test('unit: matchListings scores topical campus intents',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-board-unit-'));
 const file=path.join(dir,'board.json');
 const board=createBoard({file});
 board.register({studentId:'20240001',password:'secret1',displayName:'戊'});
 const book=board.createListing({studentId:'20240001'},{type:'二手书',description:'线代教材出闲置',contact:'c',...windowFields(7)});
 assert.equal(book.title,undefined);
 assert.ok(board.matchListings('有没有二手线性代数').length);
 assert.deepEqual(board.matchListings('宇宙黑洞'),[]);
 const ride=board.createListing({studentId:'20240001'},{type:'搬运',description:'我可以接搬运，帮搬宿舍',contact:'c',longTerm:true,windowStart:new Date(Date.now()-60*1000).toISOString()});
 assert.equal(ride.role,'offer');
 assert.equal(ride.longTerm,true);
 assert.equal(ride.expiresAt,null);
 assert.ok(board.matchListings('谁能帮我搬宿舍').some(x=>x.listingId===ride.id));
 const escort=board.createListing({studentId:'20240001'},{type:'陪诊',description:'接一下去医院',contact:'c',...windowFields(2)});
 assert.ok(board.matchListings('有没有人接陪诊').some(x=>x.listingId===escort.id));
 assert.throws(()=>board.createListing({studentId:'20240001'},{type:'代课',description:'只写了说明但没时段',contact:'c'}),/生效时段|长期/);
 fs.rmSync(dir,{recursive:true,force:true});
});

function fixtureListing(over){
 const row={id:over.id,type:over.type||'其他',description:over.description||over.title,contact:over.contact||'微信 a',ownerStudentId:over.ownerStudentId||'20240001',ownerName:over.ownerName||'戊',status:'active',createdAt:over.createdAt,expiresAt:over.expiresAt};
 if(over.title)row.title=over.title;
 if(over.windowStart)row.windowStart=over.windowStart;
 if(over.windowEnd)row.windowEnd=over.windowEnd;
 if(over.longTerm)row.longTerm=true;
 return row;
}
test('time-aligned listings outrank vague ones and miss the window when they do not overlap',()=>{
 const now=Date.parse('2026-10-23T04:00:00.000Z');
 const day=86400000;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-board-time-'));
 const file=path.join(dir,'board.json');
 const created=new Date(now-3600000).toISOString();
 fs.writeFileSync(file,JSON.stringify({version:1,accounts:[],threads:{},listings:[
  fixtureListing({id:'afternoon',type:'其他',title:'代取快递',description:'今天下午可以去南门代取快递',createdAt:created,expiresAt:new Date(now+7*day).toISOString()}),
  fixtureListing({id:'tomorrow-am',type:'其他',title:'代取快递',description:'明天上午可以代取快递',createdAt:created,expiresAt:new Date(now+7*day).toISOString()}),
  fixtureListing({id:'anytime',type:'其他',title:'代取快递',description:'南门可以代取快递 https://example.com/pickup',createdAt:created,expiresAt:new Date(now+7*day).toISOString()}),
  fixtureListing({id:'milk',type:'代购',title:'代购奶茶',description:'可以代购奶茶',createdAt:created,expiresAt:new Date(now+3*day).toISOString()}),
  fixtureListing({id:'book-soon',type:'二手书',title:'收高数教材',description:'收高等数学教材',createdAt:created,expiresAt:new Date(now+2*3600000).toISOString()}),
  fixtureListing({id:'book-week',type:'二手书',title:'收高数教材',description:'收高等数学教材，成色不限',createdAt:created,expiresAt:new Date(now+7*day).toISOString()}),
  fixtureListing({id:'wed',type:'代课',title:'高数代课',description:'周三下午可以代高数课',createdAt:created,expiresAt:new Date(now+14*day).toISOString()}),
  fixtureListing({id:'fri-am',type:'代课',title:'高数代课',description:'周五上午可以代高数课',createdAt:created,expiresAt:new Date(now+14*day).toISOString()}),
  fixtureListing({id:'closed-window',type:'其他',title:'代取快递',description:'代取快递仍在公示期',createdAt:created,expiresAt:new Date(now+7*day).toISOString(),windowEnd:new Date(now-1000).toISOString()}),
  fixtureListing({id:'milk-long',type:'代购奶茶',description:'长期可以代购奶茶',createdAt:created,longTerm:true,windowStart:created,expiresAt:null}),
  fixtureListing({id:'alarm-pm',type:'代取快递',description:'南门可以代取快递',createdAt:created,windowStart:new Date(now+30*60*1000).toISOString(),windowEnd:new Date(now+3*3600000).toISOString(),expiresAt:new Date(now+3*3600000).toISOString()})
 ]},null,2));
 const board=createBoard({file});
 const afternoon=board.matchListings('今天下午有没有人代取快递',4,now);
 assert.equal(afternoon[0].listingId,'afternoon');
 assert.ok(afternoon.some(x=>x.listingId==='anytime'));
 assert.ok(afternoon.some(x=>x.listingId==='alarm-pm'));
 assert.ok(!afternoon.some(x=>x.listingId==='tomorrow-am'||x.listingId==='closed-window'));
 assert.ok(!board.matchListings('今天上午有没有人代取快递',8,now).some(x=>x.listingId==='alarm-pm'));
 assert.deepEqual(board.matchListings('下个月有没有代购奶茶',3,now).map(x=>x.listingId),['milk-long']);
 const tomorrowBook=board.matchListings('明天有没有人收高数教材',3,now);
 assert.deepEqual(tomorrowBook.map(x=>x.listingId),['book-week']);
 const wed=board.matchListings('周三下午有没有高数代课',3,now);
 assert.deepEqual(wed.map(x=>x.listingId),['wed']);
 const asked=board.ask('今天下午有没有人代取快递',{now});
 assert.match(asked.text,/互助通达/);
 assert.match(asked.text,/• /);
 assert.match(asked.text,/https:\/\/example\.com\/pickup/);
 assert.equal(asked.offers[0].listingId,'afternoon');
 assert.equal(asked.offers[0].title,'代取快递');
 assert.match(asked.offers[0].windowText,/–|有效至|长期/);
 assert.deepEqual(board.db.threads,{});
 fs.rmSync(dir,{recursive:true,force:true});
});

test('ask does not open a chat until the student accepts',async t=>{
 const {request,app}=await setup(t);
 await request('auth/register',{studentId:'20250001',password:'secret1',displayName:'己'});
 assert.equal((await request('board/create',{type:'代取快递',description:'今天下午可以代取快递',contact:'微信 noon',...windowFields(7)})).status,200);
 await request('auth/logout',{});
 const asked=await request('board/ask',{question:'今天下午有没有人代取快递'});
 assert.equal(asked.status,200);
 assert.match(asked.text,/互助通达/);
 assert.match(asked.text,/• /);
 assert.ok(asked.offers.length);
 assert.equal(asked.offers[0].title,'');
 assert.match(asked.offers[0].display,/代取快递/);
 assert.match(asked.offers[0].windowText,/–/);
 assert.deepEqual(app.board.db.threads,{});
 const id=asked.offers[0].listingId;
 assert.equal((await request('board/dm?listingId='+encodeURIComponent(id))).status,401);
 assert.deepEqual(app.board.db.threads,{});
 await request('auth/register',{studentId:'20250002',password:'secret1',displayName:'庚'});
 const peek=await request('board/dm?listingId='+encodeURIComponent(id));
 assert.equal(peek.status,200);
 assert.deepEqual(peek.messages,[]);
 assert.deepEqual(app.board.db.threads,{});
 const opened=await request('board/open',{listingId:id});
 assert.equal(opened.status,200);
 assert.equal(opened.thread.peer.displayName,'己');
 assert.deepEqual(opened.thread.messages,[]);
 assert.ok(app.board.db.threads[opened.thread.key]);
 const declined=await request('board/ask',{question:'宇宙黑洞'});
 assert.equal(declined.offers.length,0);
 assert.equal(Object.keys(app.board.db.threads).length,1);
});

test('互助通达 replaces 校园信息 in the student UI',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 const backend=fs.readFileSync(path.join(__dirname,'../lib/backend.cjs'),'utf8');
 assert.match(app,/互助通达/);
 assert.doesNotMatch(app,/校园信息/);
 assert.doesNotMatch(backend,/校园信息/);
 assert.match(app,/同意开聊/);
 assert.match(app,/考虑一下/);
 assert.match(app,/board-ask-form/);
 assert.match(app,/board-decline/);
 assert.match(app,/board-accept/);
 assert.doesNotMatch(app,/data-action="board-contact"|action==='board-contact'/);
 assert.match(app,/board-suggest/);
 assert.doesNotMatch(app,/MUTUAL AID|CAMPUS AGENTS|本地资料问答|我同意将当前问题|和信息发出者聊聊|cloud-consent/);
});

test('student shell hides staff tools, consent checkbox and knowledge sidebar',()=>{
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
currentProfile='student';
account=null;
ai={ready:true,verified:true,provider:'doubao',enabled:true,hasKey:true,model:'ep-demo',dailyLimit:50,usedToday:0,configIssue:''};
state={version:2,agents:[{id:'affairs',name:'校园办事助手',status:'published',team:'t1',category:'学校事务',description:'办事',rules:'只依据资料',icon:'brief',color:''}],docs:[{id:'d1',title:'学生证补办',status:'approved',agent:'affairs',owner:'student',source:'学生工作处',date:'2026-09-23',content:'c',chunkCount:1}],audit:[],chats:{'student:affairs':[{role:'assistant',text:'补办需要照片。\\nhttps://xgc.nytdc.edu.cn/guide',mode:'retrieval',sources:[{citation:1,title:'学生证补办',docId:'d1'},{citation:2,sourceType:'campus_board',listingId:'L1',title:'接摄影',display:'接摄影'}]}],'admin:affairs':[{role:'assistant',text:'补办需要照片。',mode:'retrieval',sources:[{citation:1,title:'学生证补办',docId:'d1'}]}]}};
location.hash='';
globalThis.__page=route().page;
globalThis.__home=shell(boardPage());
location.hash='#chat/affairs';
globalThis.__chat=shell(chat());
currentProfile='team';
location.hash='#team';
globalThis.__team=shell(team());
currentProfile='admin';
location.hash='#chat/affairs';
globalThis.__adminChat=shell(chat());
location.hash='#admin';
globalThis.__admin=shell('<div></div>');
account={studentId:'20261024',displayName:'测'};
boardPublishOpen=true;
boardListings=[{id:'old',type:'二手书',title:'旧标题仍可显示',description:'以前登记过标题',ownerStudentId:'20261024',expiresAt:'2026-12-01T00:00:00.000Z',status:'active'}];
globalThis.__form=boardPage();
`,ctx);
 assert.equal(ctx.__page,'board');
 const home=ctx.__home;
 assert.match(home,/互助通达/);
 assert.match(home,/找助手/);
 assert.match(home,/学号登录/);
 assert.match(home,/8 位数字学号/);
 assert.doesNotMatch(home,/8—12/);
 assert.match(home,/接摄影|接一下陪诊/);
 assert.match(home,/more-menu/);
 assert.doesNotMatch(home,/团队工作台|审核管理|重置演示数据|本地资料问答|CAMPUS AGENTS|MUTUAL AID/);
 assert.doesNotMatch(home,/<label for="profile">演示身份<\/label>/);
 const chat=ctx.__chat;
 assert.match(chat,/chat-layout solo/);
 assert.doesNotMatch(chat,/cloud-consent|已审核知识库|火山方舟|我同意将当前问题/);
 assert.match(chat,/id="chat-form"/);
 assert.match(chat,/https:\/\/xgc\.nytdc\.edu\.cn\/guide/);
 assert.match(chat,/是否开聊/);
 assert.doesNotMatch(chat,/豆包已接上|还没接上云端|份已审核资料|查看来源|Enter 发送|Shift \+ Enter/);
 const team=ctx.__team;
 assert.match(team,/团队工作台/);
 assert.match(team,/校园共创组/);
 assert.doesNotMatch(team,/审核管理/);
 assert.doesNotMatch(team,/校园共创平台/);
 assert.doesNotMatch(team,/重置演示数据/);
 assert.match(ctx.__admin,/重置演示数据/);
 assert.match(ctx.__admin,/审核管理/);
 assert.match(ctx.__adminChat,/已审核知识库/);
 assert.match(ctx.__adminChat,/份已审核资料/);
 assert.match(ctx.__adminChat,/查看来源/);
 assert.match(ctx.__adminChat,/Enter 发送/);
 assert.match(ctx.__adminChat,/豆包已接上/);
 assert.doesNotMatch(ctx.__adminChat,/cloud-consent/);
 const form=ctx.__form;
 assert.match(form,/id="board-type"/);
 assert.match(form,/type="text"/);
 assert.match(form,/datetime-local/);
 assert.match(form,/长期有效/);
 assert.match(form,/旧标题仍可显示/);
 assert.doesNotMatch(form,/id="board-title"|id="board-days"|<select id="board-type"/);
});

test('team identities keep their own workspace and do not share the co-creation shell',()=>{
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'#team',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}},cityDiscovery:()=>''});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
state={version:2,agents:[
 {id:'life',name:'校园生活助手',status:'published',team:'t1',category:'校园生活',description:'生活',rules:'只依据资料',icon:'home',color:'teal'},
 {id:'study',name:'学长学姐学习库',status:'published',team:'t2',category:'学习资料',description:'学习',rules:'引用经验',icon:'book',color:'orange'},
 {id:'affairs',name:'校园办事助手',status:'published',team:'t1',category:'学校事务',description:'办事',rules:'只依据资料',icon:'brief',color:''},
 {id:'freshman',name:'新生入学助手',status:'pending',team:'t1',category:'校园生活',description:'新生',rules:'只根据指南',icon:'home',color:'teal'}
],docs:[{id:'d2',title:'课程复习建议',status:'approved',agent:'study',owner:'team2',source:'学习互助组',date:'2026-09-23',content:'c',chunkCount:1},{id:'d3',title:'学生证补办',status:'approved',agent:'affairs',owner:'student',source:'校园共创组',date:'2026-09-23',content:'c',chunkCount:1}],audit:[],chats:{}};
ai={ready:true,verified:true,provider:'doubao',enabled:true,hasKey:true,model:'ep-demo',dailyLimit:50,usedToday:1,configIssue:''};
currentProfile='team';location.hash='#team';
globalThis.__co=shell(team());
location.hash='#gallery';
globalThis.__coHome=gallery();
location.hash='#chat/affairs';
globalThis.__coChat=chat();
currentProfile='team2';location.hash='#team';
globalThis.__study=shell(team());
location.hash='#gallery';
globalThis.__studyHome=gallery();
location.hash='#upload';
globalThis.__studyUpload=upload();
location.hash='#chat/study';
globalThis.__studyChat=shell(chat());
currentProfile='admin';
globalThis.__lock=team();
currentProfile='student';location.hash='#chat/affairs';
globalThis.__studentChat=chat();
`,ctx);
 const co=ctx.__co,study=ctx.__study;
 assert.match(co,/校园共创组 <span>\/ 团队工作台/);
 assert.match(co,/生活 · 办事助手/);
 assert.match(co,/打开校园生活助手/);
 assert.match(co,/打开校园办事助手/);
 assert.match(co,/待处理草稿 1/);
 assert.match(co,/学生证怎么补办/);
 assert.match(co,/贡献生活 \/ 办事资料/);
 assert.doesNotMatch(co,/审核管理|校园共创平台|后台按当前演示身份/);
 assert.match(ctx.__coHome,/本组 · 生活与办事/);
 assert.doesNotMatch(ctx.__coHome,/复习前，先问问学长学姐学习库/);
 assert.match(ctx.__coChat,/已审核知识库/);
 assert.match(ctx.__coChat,/贡献生活 \/ 办事资料/);
 assert.match(ctx.__coChat,/本组资料在本机/);
 assert.doesNotMatch(ctx.__coChat,/豆包已接上|Enter 发送|知识库和检索保存在本机|<div class="banner">/);
 assert.match(study,/学习互助组 <span>\/ 团队工作台/);
 assert.match(study,/打开学长学姐学习库/);
 assert.match(study,/课程复习怎么安排/);
 assert.match(study,/这份经验算官方要求吗/);
 assert.match(study,/贡献学习资料/);
 assert.doesNotMatch(study,/审核管理|校园共创平台|切换为校园共创组成员|待处理草稿|后台按当前演示身份/);
 assert.match(ctx.__studyHome,/本组 · 学习资料/);
 assert.match(ctx.__studyHome,/复习前，先问问学长学姐学习库/);
 assert.match(ctx.__studyUpload,/课程复习方法/);
 assert.match(ctx.__studyUpload,/value="study" selected/);
 assert.doesNotMatch(ctx.__studyUpload,/学生证补办材料/);
 assert.match(ctx.__studyChat,/学习互助组 <span>/);
 assert.match(ctx.__studyChat,/已审核知识库/);
 assert.match(ctx.__studyChat,/贡献学习资料/);
 assert.doesNotMatch(ctx.__studyChat,/豆包已接上|Enter 发送|校园共创平台|审核管理|<div class="banner">/);
 assert.match(ctx.__lock,/切换为校园共创组成员/);
 assert.match(ctx.__lock,/切换为学习互助组成员/);
 assert.doesNotMatch(ctx.__lock,/校园共创平台/);
 assert.doesNotMatch(ctx.__studentChat,/豆包已接上|份已审核资料|Enter 发送|已审核知识库|<div class="banner">/);
 assert.match(ctx.__studentChat,/chat-layout solo/);
});

test('open C2C prompt is attached for doubao, qwen and deepseek when the board is in play',async()=>{
 const backend=fs.readFileSync(path.join(__dirname,'../lib/backend.cjs'),'utf8');
 const note=(backend.match(/const BOARD_ASK_NOTE='([^']+)'/)||[])[1];
 assert.match(note,/帮助方/);
 assert.match(note,/长期/);
 assert.match(note,/不限于代购/);
 assert.doesNotMatch(note,/请选择有效类型/);
 const source={citation:1,sourceType:'campus_board',title:'[同学提供] 代取',source:'同学提供，非官方',excerpt:'接代取快递',type:'代取',role:'offer',longTerm:true,windowText:'长期',windowStart:'2026-10-24T04:00:00.000Z',windowEnd:null};
 for(const provider of ['doubao','qwen','deepseek']){
  let sent;
  await generate({provider,model:'test-model',apiKey:'test'},{name:'校园生活助手',rules:'依据资料'},'谁能接代取',[source],async(_url,init)=>{
   sent=JSON.parse(init.body);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'可以看看这条同学登记。[1]',citations:[1]})}}]}),{status:200});
  },note);
  assert.match(sent.messages[0].content,/帮助方/);
  assert.match(sent.messages[0].content,/长期/);
  const user=JSON.parse(sent.messages[1].content);
  assert.equal(user.sources[0].kind,'campus_board');
  assert.equal(user.sources[0].role,'offer');
  assert.equal(user.sources[0].longTerm,true);
  assert.equal(user.sources[0].windowText,'长期');
 }
});
