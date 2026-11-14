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
 async function send(route,{method='GET',body,headers={}}={}){
  const res=await fetch(base+'/api/'+route,{method,headers:{'X-Campus-Client':'1',Cookie:cookie,...headers},body});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const type=res.headers.get('content-type')||'';
  if(type.includes('application/json')){const data=await res.json();return {status:res.status,type,...data}}
  return {status:res.status,type,body:Buffer.from(await res.arrayBuffer())};
 }
 return {request,send,app,opts,dir};
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

test('board contact is optional and a filled contact is still saved',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20261027',password:'secret1',displayName:'辛'});
 const missing=await request('board/create',{type:'代取快递',description:'南门可以代取，联系方式稍后在开聊里说',...windowFields(3)});
 assert.equal(missing.status,200);
 assert.equal(missing.listing.contact,'');
 assert.equal(missing.listing.type,'代取快递');
 const blank=await request('board/create',{type:'陪诊',description:'下午可以陪去校医院',contact:'   ',longTerm:true,windowStart:new Date(Date.now()-60*1000).toISOString()});
 assert.equal(blank.status,200);
 assert.equal(blank.listing.contact,'');
 assert.equal(blank.listing.longTerm,true);
 const filled=await request('board/create',{type:'出闲置',description:'出一台闲置显示器，九成新',contact:'微信 optional-ok',...windowFields(5)});
 assert.equal(filled.status,200);
 assert.equal(filled.listing.contact,'微信 optional-ok');
 const tooLong=await request('board/create',{type:'代购',description:'可以帮忙代购',contact:'微'.repeat(81),...windowFields(2)});
 assert.equal(tooLong.status,400);
 const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 const field=app.match(/<label for="board-contact">[\s\S]*?<\/label><input id="board-contact"[^>]*>/);
 assert.ok(field);
 assert.match(field[0],/自愿公开/);
 assert.match(field[0],/可选/);
 assert.doesNotMatch(field[0],/\brequired\b/);
 assert.doesNotMatch(field[0],/class="required"/);
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
 assert.equal((await request('board/create',{type:'代取快递',description:'南门可以代取快递',contact:'微信 noon',...windowFields(7)})).status,200);
 await request('auth/logout',{});
 // Ask about the current moment, not "今天下午": the listing is created with a
 // window that starts now, so an afternoon question would correctly stop
 // matching once the wall clock passes 18:00 (the test used to fail after dusk).
 const asked=await request('board/ask',{question:'现在有没有人代取快递'});
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
 assert.equal(Object.keys(app.board.db.threads).length,1);
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
state.boardReports=[{id:'r1',reason:'联系方式是广告',createdAt:'2026-10-27T10:00:00.000Z',listing:{id:'old',display:'代取快递',description:'南门代取快递',ownerName:'甲'},reporter:{displayName:'乙'}}];
state.boardPendingListings=[{id:'p1',type:'代取快递',description:'待审核的登记',ownerName:'甲',contact:'微信 a',windowText:'长期'}];
state.boardActiveListings=[{id:'a1',type:'陪诊',description:'已生效的陪诊登记',display:'陪诊',ownerName:'丙',contact:'微信 c',windowText:'长期',status:'active'}];
globalThis.__adminPage=admin();
globalThis.__adminTeam=team();
account={studentId:'20261024',displayName:'测'};
boardPublishOpen=true;
boardReviewMode=true;
boardListings=[];
boardMine=[{id:'old',type:'二手书',title:'旧标题仍可显示',description:'以前登记过标题',status:'active',mine:true,windowText:'长期'},{id:'pend',type:'代取快递',description:'等管理员审核的登记',status:'pending',mine:true,windowText:'长期'}];
boardInbox=[{threadId:'0123456789abcdef01234567',listing:{id:'old',type:'代取快递',display:'代取快递'},peer:{displayName:'同学甲'},last:{text:'你好，还能代取吗？',time:'2026-10-27T10:00:00.000Z',mine:false}}];
globalThis.__form=boardPage();
`,ctx);
 assert.equal(ctx.__page,'board');
 const home=ctx.__home;
 assert.match(home,/互助通达/);
 assert.match(home,/找助手/);
 assert.match(home,/data-action="auth-open">登录</);
 assert.match(home,/去登录/);
 assert.match(home,/提问不用登录/);
 assert.doesNotMatch(home,/8 位数字学号/);
 assert.doesNotMatch(home,/设计预览/);
 assert.doesNotMatch(home,/8—12/);
 assert.match(home,/接摄影|接一下陪诊/);
 assert.match(home,/more-menu/);
 assert.match(home,/model-chip/);
 assert.match(home,/模型已连接/);
 assert.doesNotMatch(home,/豆包已接入|豆包已连接|豆包已接上|豆包已配置/);
 assert.match(home,/class="board-split"/);
 assert.match(home,/class="panel board-register"/);
 assert.match(home,/class="panel board-ask"/);
 assert.match(home,/>互助登记</);
 assert.match(home,/>问别人</);
 assert.ok(home.indexOf('board-register')<home.indexOf('board-ask'));
 assert.match(home,/aria-label="主导航"/);
 assert.match(home,/href="#board"/);
 assert.match(home,/href="#chat"/);
 assert.match(home,/href="#gallery"/);
 assert.match(home,/href="#upload"/);
 assert.match(home,/class="menu-square"/);
 assert.match(home,/aria-expanded="false"/);
 assert.match(home,/aria-label="打开菜单"/);
 assert.match(home,/同学互助/);
 assert.match(home,/问同学，或问校园助手。/);
 assert.match(home,/href="#home"/);
 assert.doesNotMatch(home,/sidebar is-open|menu-open/);
 assert.doesNotMatch(home,/团队工作台|审核管理|重置演示数据|本地资料问答|CAMPUS AGENTS|MUTUAL AID/);
 assert.doesNotMatch(home,/<label for="profile">演示身份<\/label>/);
 const chat=ctx.__chat;
 assert.match(chat,/chat-layout solo/);
 assert.doesNotMatch(chat,/cloud-consent|已审核知识库|火山方舟|我同意将当前问题/);
 assert.match(chat,/id="chat-form"/);
 assert.match(chat,/https:\/\/xgc\.nytdc\.edu\.cn\/guide/);
 assert.match(chat,/是否开聊/);
 assert.doesNotMatch(chat,/豆包已接上|还没接上云端|份已审核资料|查看来源|Enter 发送|Shift \+ Enter|今日云端调用/);
 const team=ctx.__team;
 assert.match(team,/团队工作台/);
 assert.match(team,/校集团队/);
 assert.doesNotMatch(team,/周同学|学习互助组|校园共创组/);
 assert.doesNotMatch(team,/审核管理/);
 assert.doesNotMatch(team,/校园共创平台/);
 assert.doesNotMatch(team,/重置演示数据/);
 assert.match(ctx.__admin,/重置演示数据/);
 assert.match(ctx.__admin,/审核管理/);
 assert.match(ctx.__adminPage,/互助举报/);
 assert.match(ctx.__adminPage,/互助登记审核/);
 assert.match(ctx.__adminPage,/待审核的登记/);
 assert.match(ctx.__adminPage,/通过上线/);
 assert.match(ctx.__adminPage,/联系方式是广告/);
 assert.doesNotMatch(ctx.__adminTeam,/团队创作空间/);
 assert.match(ctx.__adminTeam,/当前是平台管理员身份/);
 assert.match(ctx.__adminTeam,/创建 Agent/);
 assert.match(ctx.__adminPage,/南门代取快递/);
 assert.match(ctx.__adminPage,/下架登记/);
 assert.match(ctx.__adminPage,/已生效互助登记/);
 assert.match(ctx.__adminPage,/已生效的陪诊登记/);
 assert.match(ctx.__adminPage,/data-action="board-admin-takedown" data-id="a1"/);
 assert.match(ctx.__adminPage,/主动下架/);
 assert.match(ctx.__adminChat,/已审核知识库/);
 assert.match(ctx.__adminChat,/份已审核资料/);
 assert.match(ctx.__adminChat,/查看来源/);
 assert.match(ctx.__adminChat,/Enter 发送/);
 assert.doesNotMatch(ctx.__adminChat,/今日云端调用|次（本机限制）/);
 assert.match(ctx.__adminChat,/豆包已接上/);
 assert.doesNotMatch(ctx.__adminChat,/cloud-consent/);
 const form=ctx.__form;
 assert.match(form,/别人发来的消息/);
 assert.match(form,/打开对话/);
 assert.match(form,/你好，还能代取吗/);
 assert.match(form,/我发布的登记/);
 assert.doesNotMatch(form,/当前开启发布前审核/);
 assert.match(form,/问别人/);
 assert.match(form,/互助通达按意思/);
 assert.match(form,/待审核/);
 assert.match(form,/id="board-type"/);
 assert.match(form,/type="text"/);
 assert.match(form,/指定时段/);
 assert.match(form,/今天/);
 assert.match(form,/明天/);
 assert.match(form,/选一天/);
 assert.match(form,/type="time"/);
 assert.match(form,/北京时间/);
 assert.match(form,/从现在起/);
 assert.match(form,/放图片/);
 assert.match(form,/证件/);
 assert.match(form,/id="board-list"/);
 assert.doesNotMatch(form,/datetime-local/);
 assert.match(form,/长期有效/);
 assert.match(form,/旧标题仍可显示/);
 assert.match(form,/data-action="board-takedown"/);
 assert.doesNotMatch(form,/asAdmin|board-admin-takedown/);
 assert.match(form,/class="board-split"/);
 assert.match(form,/class="panel board-register"/);
 assert.match(form,/class="panel board-ask"/);
 assert.ok(form.indexOf('id="board-register"')<form.indexOf('id="board-ask-form"'));
 assert.doesNotMatch(form,/id="board-title"|id="board-days"|<select id="board-type"/);
});

test('one team member sees life, affairs and study without a second identity',()=>{
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'#team',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}},cityDiscovery:()=>''});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
state={version:2,agents:[
 {id:'life',name:'校园生活助手',status:'published',team:'t1',category:'校园生活',description:'生活',rules:'只依据资料',icon:'home',color:'teal'},
 {id:'study',name:'学长学姐学习库',status:'published',team:'t2',category:'学习资料',description:'学习',rules:'引用经验',icon:'book',color:'orange'},
 {id:'affairs',name:'校园办事助手',status:'published',team:'t1',category:'学校事务',description:'办事',rules:'只依据资料',icon:'brief',color:''},
 {id:'freshman',name:'新生入学助手',status:'pending',team:'t1',category:'校园生活',description:'新生',rules:'只根据指南',icon:'home',color:'teal'}
],docs:[{id:'d2',title:'课程复习建议',status:'approved',agent:'study',owner:'team',source:'校集团队',date:'2026-09-23',content:'c',chunkCount:1},{id:'d3',title:'学生证补办',status:'approved',agent:'affairs',owner:'student',source:'校集团队',date:'2026-09-23',content:'c',chunkCount:1}],audit:[],chats:{}};
ai={ready:true,verified:true,provider:'doubao',enabled:true,hasKey:true,model:'ep-demo',dailyLimit:50,usedToday:1,configIssue:''};
currentProfile='team';location.hash='#team';
globalThis.__team=shell(team());
location.hash='#gallery';
globalThis.__home=gallery();
location.hash='#upload';
globalThis.__upload=upload();
location.hash='#chat/study';
globalThis.__chat=chat();
currentProfile='student';
globalThis.__lock=team();
currentProfile='admin';
globalThis.__adminSelect=profileSelect();
currentProfile='student';location.hash='#chat/affairs';
globalThis.__studentChat=shell(chat());
globalThis.__studentSelect=profileSelect();
`,ctx);
 const team=ctx.__team;
 assert.equal((team.match(/<option /g)||[]).length,3);
 assert.match(team,/校集团队 · 陈同学/);
 assert.match(team,/校集团队 <span>\/ 团队工作台/);
 assert.match(team,/打开校园生活助手/);
 assert.match(team,/打开校园办事助手/);
 assert.match(team,/打开学长学姐学习库/);
 assert.match(team,/待处理草稿 1/);
 assert.match(team,/新生入学助手/);
 assert.match(team,/图书馆几点开放/);
 assert.match(team,/学生证怎么补办/);
 assert.match(team,/课程复习怎么安排/);
 assert.match(team,/贡献资料/);
 assert.match(team,/class="eyebrow">一个入口</);
 assert.match(team,/生活、办事和学习都在这个工作台/);
 assert.match(team,/class="team-guide"/);
 assert.match(team,/生活、办事和学习<\/h2>/);
 assert.match(team,/同一支校集团队维护这三类助手/);
 assert.match(team,/生活 · 打开校园生活助手/);
 assert.match(team,/办事 · 打开校园办事助手/);
 assert.match(team,/学习 · 打开学长学姐学习库/);
 const lifeAt=team.indexOf('生活 · 打开校园生活助手');
 const affairsAt=team.indexOf('办事 · 打开校园办事助手');
 const studyAt=team.indexOf('学习 · 打开学长学姐学习库');
 assert.ok(lifeAt>=0&&lifeAt<affairsAt&&affairsAt<studyAt);
 assert.match(team,/生活、办事和学习助手都可以提交。/);
 assert.doesNotMatch(team,/优先交给本组|本组优先|切换组别|交给生活、办事或学习/);
 assert.doesNotMatch(team,/周同学|学习互助组|校园共创组|校园共创平台|审核管理|切换为校园共创组成员|切换为学习互助组成员|后台按当前演示身份/);
 assert.match(ctx.__home,/校集团队一个入口，负责生活、办事和学习/);
 assert.match(ctx.__home,/生活、办事和学习，在同一工作台/);
 assert.match(ctx.__home,/进入团队工作台/);
 assert.match(ctx.__upload,/生活、办事和学习助手都可以提交/);
 assert.match(ctx.__upload,/学生证补办材料，或课程复习方法/);
 assert.doesNotMatch(ctx.__upload,/优先交给本组/);
 assert.match(ctx.__chat,/已审核知识库/);
 assert.match(ctx.__chat,/贡献资料/);
 assert.match(ctx.__chat,/团队资料在本机/);
 assert.doesNotMatch(ctx.__chat,/豆包已接上|Enter 发送|知识库和检索保存在本机|<div class="banner">|今日云端调用/);
 assert.match(ctx.__lock,/切换为校集团队成员/);
 assert.equal((ctx.__lock.match(/data-action="switch"/g)||[]).length,1);
 assert.doesNotMatch(ctx.__lock,/切换为校园共创组成员|切换为学习互助组成员/);
 assert.match(ctx.__adminSelect,/校集团队 · 陈同学/);
 assert.doesNotMatch(ctx.__adminSelect,/周同学|学习互助组|校园共创/);
 assert.equal((ctx.__studentSelect.match(/<option /g)||[]).length,3);
 assert.doesNotMatch(ctx.__studentChat,/豆包已接上|豆包已接入|豆包已连接|份已审核资料|Enter 发送|已审核知识库|<div class="banner">|今日云端调用/);
 assert.match(ctx.__studentChat,/模型已连接/);
 assert.match(ctx.__studentChat,/chat-layout solo/);
});

test('student board uses a 2:3 register-ask split and public mode removes demo identity',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
 assert.match(css,/\.board-split\{[^}]*grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)/);
 assert.match(css,/max-width:900px\)\{[\s\S]*\.board-split>\.board-ask\{order:-1\}/);
 assert.match(css,/\.sidebar \.nav-link\.active\{[^}]*inset 3px 0 0 #d9f887/);
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'#board',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
demoIdentities=false;
currentProfile='student';
ai={ready:true,verified:true,provider:'doubao',enabled:true,hasKey:true,model:'ep-demo',dailyLimit:50,usedToday:0,configIssue:''};
state={version:2,agents:[],docs:[],audit:[],chats:{}};
location.hash='#board';
globalThis.__public=shell(boardPage());
globalThis.__select=profileSelect();
globalThis.__connected=studentModelLabel();
ai.verified=false;ai.ready=true;
globalThis.__ready=studentModelLabel();
currentProfile='admin';
globalThis.__lock=guard('admin');
`,ctx);
 const html=ctx.__public;
 assert.match(html,/class="board-split"/);
 assert.match(html,/class="panel board-register"/);
 assert.match(html,/class="panel board-ask"/);
 assert.match(html,/>互助登记</);
 assert.match(html,/>问别人</);
 assert.match(html,/board-chips/);
 assert.match(html,/去登录/);
 assert.match(html,/提问不用登录/);
 assert.doesNotMatch(html,/8 位数字学号/);
 assert.match(html,/model-chip/);
 assert.match(html,/role="status"/);
 assert.match(html,/模型已连接/);
 assert.equal(ctx.__connected,'模型已连接');
 assert.equal(ctx.__ready,'模型已配置');
 assert.doesNotMatch(html,/豆包已接入|豆包已连接|豆包已接上|豆包已配置/);
 assert.doesNotMatch(html,/演示身份|id="profile"|data-action="switch"|普通学生|校集团队|平台管理员|切换管理员/);
 assert.equal(ctx.__select,'');
 assert.doesNotMatch(ctx.__lock,/data-action="switch"|切换为管理员/);
 assert.match(ctx.__lock,/公开访问不提供演示身份/);
 assert.match(html,/class="sidebar"/);
 assert.match(html,/aria-label="主导航"/);
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

test('public board payloads never expose student IDs or thread keys',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250011',password:'secret1',displayName:'甲'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 a',...windowFields(7)});
 assert.equal(created.status,200);
 assert.equal(created.listing.mine,true);
 assert.equal('ownerStudentId' in created.listing,false);
 const id=created.listing.id;
 await request('auth/logout',{});
 const list=await request('board');
 const row=list.listings.find(l=>l.id===id);
 assert.ok(row);
 assert.equal(row.mine,false);
 assert.equal('ownerStudentId' in row,false);
 assert.doesNotMatch(JSON.stringify(list.listings),/20250011/);
 const asked=await request('board/ask',{question:'现在有没有人代取快递'});
 assert.ok(asked.offers.length);
 assert.equal('ownerStudentId' in asked.offers[0],false);
 assert.doesNotMatch(JSON.stringify(asked.offers),/20250011/);
 await request('auth/register',{studentId:'20250012',password:'secret1',displayName:'乙'});
 const opened=await request('board/open',{listingId:id});
 assert.equal(opened.status,200);
 assert.equal(opened.thread.peer.displayName,'甲');
 assert.equal('studentId' in opened.thread.peer,false);
 assert.equal('key' in opened.thread,false);
 assert.doesNotMatch(JSON.stringify(opened.thread),/20250011/);
 const sent=await request('board/dm',{listingId:id,text:'你好'});
 assert.equal(sent.status,200);
 const last=sent.thread.messages.at(-1);
 assert.equal(last.text,'你好');
 assert.equal(last.mine,true);
 assert.equal('from' in last,false);
 assert.doesNotMatch(JSON.stringify(sent.thread),/20250011/);
});

test('listing owner receives DM threads and can reply without seeing student IDs',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20250021',password:'secret1',displayName:'东'});
 const created=await request('board/create',{type:'代取快递',description:'现在可以代取快递',contact:'微信 dong',...windowFields(7)});
 assert.equal(created.status,200);
 const id=created.listing.id;
 await request('auth/logout',{});
 await request('auth/register',{studentId:'20250022',password:'secret1',displayName:'西'});
 assert.equal((await request('board/open',{listingId:id})).status,200);
 assert.equal((await request('board/dm',{listingId:id,text:'你好，还能代取吗？'})).status,200);

 await request('auth/login',{studentId:'20250021',password:'secret1'});
 const board=await request('board');
 assert.equal(board.inbox.length,1);
 assert.equal(board.inbox[0].peer.displayName,'西');
 assert.equal(board.inbox[0].last.text,'你好，还能代取吗？');
 assert.equal(board.inbox[0].last.mine,false);
 assert.equal(JSON.stringify(board.inbox).includes('20250021'),false);
 assert.equal(JSON.stringify(board.inbox).includes('20250022'),false);
 const threadId=board.inbox[0].threadId;
 const view=await request('board/thread?threadId='+encodeURIComponent(threadId));
 assert.equal(view.status,200);
 assert.equal(view.thread.peer.displayName,'西');
 assert.equal(view.thread.messages.at(-1).mine,false);
 assert.equal(JSON.stringify(view.thread).includes('20250022'),false);
 assert.equal((await request('board/reply',{threadId,text:'可以的，六点前'})).status,200);
 const after=await request('board/thread?threadId='+encodeURIComponent(threadId));
 assert.equal(after.thread.messages.at(-1).text,'可以的，六点前');
 assert.equal(after.thread.messages.at(-1).mine,true);

 await request('auth/login',{studentId:'20250022',password:'secret1'});
 const askerView=await request('board/dm?listingId='+encodeURIComponent(id));
 assert.equal(askerView.messages.at(-1).text,'可以的，六点前');
 assert.equal(askerView.messages.at(-1).mine,false);

 await request('auth/register',{studentId:'20250023',password:'secret1',displayName:'南'});
 assert.equal((await request('board/thread?threadId='+encodeURIComponent(threadId))).status,403);
});

test('chat footer omits the daily cloud quota line for every agent and profile',()=>{
 const document={addEventListener(){},getElementById(){return {innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'#chat/life',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
function cityDiscovery(){return ''}
state={version:2,agents:[
 {id:'life',name:'校园生活助手',status:'published',team:'t1',category:'校园生活',description:'生活',rules:'只依据资料',icon:'home',color:'teal'},
 {id:'affairs',name:'校园办事助手',status:'published',team:'t1',category:'学校事务',description:'办事',rules:'只依据资料',icon:'brief',color:''},
 {id:'study',name:'学长学姐学习库',status:'published',team:'t1',category:'学习资料',description:'学习',rules:'引用经验',icon:'book',color:'orange'}
],docs:[],audit:[],chats:{}};
ai={ready:true,verified:true,provider:'doubao',enabled:true,hasKey:true,model:'ep-demo',dailyLimit:80,usedToday:3,configIssue:''};
globalThis.__pages={};
for (const profile of ['student','team','admin']) {
 currentProfile=profile;
 for (const id of ['life','affairs','study']) {
  location.hash='#chat/'+id;
  globalThis.__pages[profile+':'+id]=shell(chat());
 }
}
`,ctx);
 for (const profile of ['student','team','admin']) {
  for (const id of ['life','affairs','study']) {
   const html=ctx.__pages[profile+':'+id];
   assert.equal(typeof html,'string',profile+' '+id);
   assert.doesNotMatch(html,/今日云端调用/);
   assert.doesNotMatch(html,/次（本机限制）/);
   assert.doesNotMatch(html,/3\s*\/\s*80/);
   if (profile==='admin') assert.match(html,/Enter 发送，Shift \+ Enter 换行/);
   else assert.doesNotMatch(html,/Enter 发送/);
  }
 }
});

function shanghaiParts(ms){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return parts;
}
function plusDate(key,days){
 const [y,m,d]=key.split('-').map(Number);
 const dt=new Date(Date.UTC(y,m-1,d)+days*86400000),p=n=>String(n).padStart(2,'0');
 return dt.getUTCFullYear()+'-'+p(dt.getUTCMonth()+1)+'-'+p(dt.getUTCDate());
}
function atBeijing(day,hm){return Date.parse(day+'T'+hm+':00+08:00')}

test('lighter window maps onto the existing listing window',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20261107',password:'secret1',displayName:'窗'});
 const lasting=await request('board/create',{type:'出闲置',description:'长期出一本闲置高数',windowMode:'long'});
 assert.equal(lasting.status,200);
 assert.equal(lasting.listing.longTerm,true);
 assert.equal(lasting.listing.windowEnd,null);
 assert.equal(lasting.listing.image,'');
 assert.match(lasting.listing.windowText,/长期/);
 const parts=shanghaiParts(Date.now());
 const today=parts.year+'-'+parts.month+'-'+parts.day;
 const start=parts.hour+':'+parts.minute;
 const end=String((+parts.hour+2)%24).padStart(2,'0')+':'+parts.minute;
 const endDay=end<=start?plusDate(today,1):today;
 const todayWindow=await request('board/create',{type:'代取快递',description:'今天这段时间可以代取快递',windowDay:'today',windowStartTime:start,windowEndTime:end});
 assert.equal(todayWindow.status,200);
 assert.equal(todayWindow.listing.longTerm,false);
 assert.equal(Date.parse(todayWindow.listing.windowStart),atBeijing(today,start));
 assert.equal(Date.parse(todayWindow.listing.windowEnd),atBeijing(endDay,end));
 assert.match(todayWindow.listing.windowText,/–/);
 assert.equal(todayWindow.listing.image,'');
 const quick=await request('board/create',{type:'陪诊',description:'从现在起两小时可以陪诊',windowHours:2});
 assert.equal(quick.status,200);
 assert.equal(Date.parse(quick.listing.windowEnd)-Date.parse(quick.listing.windowStart),2*3600000);
 const tooLong=await request('board/create',{type:'代取快递',description:'时段拉得太长的登记',windowStart:new Date(Date.now()-1000).toISOString(),windowEnd:new Date(Date.now()+91*86400000).toISOString()});
 assert.equal(tooLong.status,400);
 assert.match(tooLong.error,/长期/);
 const far=await request('board/create',{type:'代取快递',description:'日期太远的短时段',windowDay:plusDate(today,100),windowStartTime:'10:00',windowEndTime:'12:00'});
 assert.equal(far.status,400);
 assert.match(far.error,/长期/);
 await request('auth/logout',{});
 const asked=await request('board/ask',{question:'现在有没有人代取快递'});
 assert.equal(asked.status,200);
 assert.ok(asked.offers.some(o=>o.listingId===todayWindow.listing.id&&/–/.test(o.windowText)));
});

test('optional listing image is stored and served without secrets',async t=>{
 const {request,send,opts,dir}=await setup(t);
 await request('auth/register',{studentId:'20261108',password:'secret1',displayName:'图'});
 const plain=await request('board/create',{type:'搬运',description:'不带图片也可以帮忙搬运',longTerm:true});
 assert.equal(plain.status,200);
 assert.equal(plain.listing.image,'');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
 const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.from([4,0,0,0]),Buffer.from('WEBP')]);
 const jpg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(12,0)]);
 for(const [body,type,ext] of [[gif,'image/gif','gif'],[webp,'image/webp','webp'],[jpg,'image/jpeg','jpg']]){
  const sniffed=await send('board/image',{method:'POST',body,headers:{'Content-Type':type}});
  assert.equal(sniffed.status,200);
  assert.match(sniffed.image.url,new RegExp('\\.'+ext+'$'));
  assert.equal(JSON.stringify(sniffed).includes(dir),false);
 }
 const uploaded=await send('board/image',{method:'POST',body:png,headers:{'Content-Type':'image/png'}});
 assert.equal(uploaded.status,200);
 assert.match(uploaded.image.url,/^\/api\/board\/images\/[0-9a-f-]{36}\.png$/);
 assert.equal(uploaded.image.mime,'image/png');
 assert.equal(JSON.stringify(uploaded).includes(dir),false);
 assert.equal(JSON.stringify(uploaded).includes('secret1'),false);
 const parts=shanghaiParts(Date.now());
 const start=parts.hour+':'+parts.minute;
 const end=String((+parts.hour+2)%24).padStart(2,'0')+':'+parts.minute;
 const made=await request('board/create',{type:'出闲置',description:'附上一张闲置显示器的照片',image:uploaded.image.url,windowDay:'today',windowStartTime:start,windowEndTime:end});
 assert.equal(made.status,200);
 assert.equal(made.listing.image,uploaded.image.url);
 assert.equal(JSON.stringify(made.listing).includes(dir),false);
 assert.equal(JSON.stringify(made.listing).includes('secret1'),false);
 const disk=JSON.parse(fs.readFileSync(opts.boardFile,'utf8'));
 const row=disk.listings.find(l=>l.id===made.listing.id);
 assert.equal(row.image,uploaded.image.url);
 assert.equal(JSON.stringify(row).includes(dir),false);
 const board=await request('board');
 assert.equal(board.listings.find(l=>l.id===made.listing.id).image,uploaded.image.url);
 assert.equal(board.mine.find(l=>l.id===made.listing.id).image,uploaded.image.url);
 const got=await send('board/images/'+uploaded.image.url.split('/').pop());
 assert.equal(got.status,200);
 assert.match(got.type,/image\/png/);
 assert.ok(got.body.equals(png));
 const missing=await send('board/images/not-a-real-file.png');
 assert.equal(missing.status,404);
 const escaped=await send('board/images/..%2F..%2Fconfig.local.json');
 assert.equal(escaped.status,404);
 const junk=await send('board/image',{method:'POST',body:Buffer.from('<html></html>'),headers:{'Content-Type':'image/png'}});
 assert.equal(junk.status,400);
 assert.match(junk.error,/JPEG|PNG|WebP|GIF/);
 const forged=await request('board/create',{type:'代取快递',description:'伪造图片路径不应被接受',image:'/etc/passwd',longTerm:true});
 assert.equal(forged.status,400);
 const huge=await send('board/image',{method:'POST',body:Buffer.alloc(4*1024*1024+1),headers:{'Content-Type':'application/octet-stream'}});
 assert.equal(huge.status,413);
 const admin=await request('session',{profile:'admin'});
 assert.equal(admin.state.boardActiveListings.find(l=>l.id===made.listing.id).image,uploaded.image.url);
 await request('auth/logout',{});
 const anon=await send('board/image',{method:'POST',body:png,headers:{'Content-Type':'image/png'}});
 assert.equal(anon.status,401);
});

test('listing image renders on the board list, own card and admin views',()=>{
 const modalBox={innerHTML:'',open:false,setAttribute(){},showModal(){this.open=true},classList:{add(){},remove(){}}};
 const document={addEventListener(){},getElementById(id){return id==='modal'?modalBox:{innerHTML:'',classList:{add(){},remove(){}},setAttribute(){},scrollTop:0}},querySelectorAll(){return []}};
 const location={hash:'#board',origin:'http://127.0.0.1:4173'};
 const ctx=vm.createContext({document,modalBox,URL,URLSearchParams,fetch:async()=>({ok:false,json:async()=>({})}),setTimeout,clearTimeout,location,history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},window:{addEventListener(){}}});
 const image='/api/board/images/11111111-1111-4111-8111-111111111111.png';
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+`
account={studentId:'20261108',displayName:'图'};
currentProfile='student';
boardListings=[{id:'img1',type:'出闲置',description:'闲置显示器',ownerName:'图',windowText:'11-07 10:00 – 11-07 12:00',image:${JSON.stringify(image)},role:'offer',display:'出闲置 · 闲置显示器'}];
boardMine=[{id:'img1',type:'出闲置',description:'闲置显示器',status:'active',mine:true,windowText:'11-07 10:00 – 11-07 12:00',image:${JSON.stringify(image)}}];
location.hash='#board';
globalThis.__board=boardPage();
openOfferModal([{listingId:'img1',type:'出闲置',display:'出闲置',ownerName:'图',windowText:'11-07 10:00 – 11-07 12:00',image:${JSON.stringify(image)}}]);
globalThis.__offer=document.getElementById('modal').innerHTML;
state.boardPendingListings=[{id:'p9',type:'出闲置',description:'待审核的图片登记',ownerName:'图',contact:'',windowText:'长期',image:${JSON.stringify(image)}}];
state.boardActiveListings=[{id:'img1',type:'出闲置',description:'闲置显示器',display:'出闲置',ownerName:'图',contact:'',windowText:'长期',status:'active',image:${JSON.stringify(image)}}];
currentProfile='admin';
location.hash='#admin';
globalThis.__admin=admin();
`,ctx);
 assert.match(ctx.__board,/id="board-list"/);
 assert.match(ctx.__board,/class="listing-thumb"/);
 assert.equal((ctx.__board.match(new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length>=2,true);
 assert.match(ctx.__offer,/class="listing-thumb"/);
 assert.match(ctx.__offer,new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(ctx.__admin,/待审核的图片登记/);
 assert.match(ctx.__admin,/class="listing-thumb"/);
 assert.doesNotMatch(ctx.__board,/\/data\/board-images\//);
 assert.doesNotMatch(ctx.__admin,/\/etc\/passwd|config\.local/);
});
