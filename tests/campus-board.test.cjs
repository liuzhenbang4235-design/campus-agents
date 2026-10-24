'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createApp}=require('../lib/backend.cjs');
const {createBoard}=require('../lib/campus-board.cjs');

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
 assert.equal((await request('auth/register',{studentId:'20210001',password:'123'})).status,400);
 let r=await request('auth/register',{studentId:'20210001',password:'secret1',displayName:'甲同学'});
 assert.equal(r.status,200);assert.equal(r.account.studentId,'20210001');
 assert.equal((await request('auth/register',{studentId:'20210001',password:'secret1'})).status,409);
 await request('auth/logout',{});
 r=await request('auth/login',{studentId:'20210001',password:'wrong!!'});
 assert.equal(r.status,401);
 r=await request('auth/login',{studentId:'20210001',password:'secret1'});
 assert.equal(r.status,200);assert.equal(r.account.displayName,'甲同学');
 assert.equal((await request('board/create',{type:'二手书',title:'高数教材',description:'大一高数上下册，八成新',contact:'微信 demo-only',days:7})).status,200);
});

test('expired listings are hidden from board list and chat retrieval',async t=>{
 const {request,opts}=await setup(t);
 await request('auth/register',{studentId:'20220001',password:'secret1',displayName:'乙'});
 const created=await request('board/create',{type:'代课',title:'高数代课',description:'周三下午高等数学代课',contact:'QQ 10001',days:3});
 assert.equal(created.status,200);
 const id=created.listing.id;
 const board=JSON.parse(fs.readFileSync(opts.boardFile,'utf8'));
 board.listings.find(l=>l.id===id).expiresAt=new Date(Date.now()-3600000).toISOString();
 fs.writeFileSync(opts.boardFile,JSON.stringify(board,null,2));
 // reload app from disk
 const app2=createApp(opts);
 assert.deepEqual(app2.board.listActive(),[]);
 assert.deepEqual(app2.board.matchListings('有没有高数代课'),[]);
});

test('chat retrieval hits active campus board listings as peer sources',async t=>{
 const {request}=await setup(t);
 await request('auth/register',{studentId:'20230001',password:'secret1',displayName:'丙'});
 assert.equal((await request('board/create',{type:'二手书',title:'出高数教材',description:'高等数学教材转让，成色良好',contact:'微信 peer-only',days:7})).status,200);
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
 const r=await request('board/create',{type:'代购',title:'帮带奶茶',description:'下午帮带一杯奶茶',contact:'手机 13800000000',days:3});
 assert.equal(r.status,401);
});

test('unit: matchListings scores topical campus intents',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-board-unit-'));
 const file=path.join(dir,'board.json');
 const board=createBoard({file});
 board.register({studentId:'20240001',password:'secret1',displayName:'戊'});
 board.createListing({studentId:'20240001'},{type:'二手书',title:'线性代数',description:'线代教材出闲置',contact:'c',days:7});
 assert.ok(board.matchListings('有没有二手线性代数').length);
 assert.deepEqual(board.matchListings('宇宙黑洞'),[]);
 fs.rmSync(dir,{recursive:true,force:true});
});

function fixtureListing(over){
 return {id:over.id,type:over.type||'其他',title:over.title,description:over.description||over.title,contact:over.contact||'微信 a',ownerStudentId:over.ownerStudentId||'20240001',ownerName:over.ownerName||'戊',status:'active',createdAt:over.createdAt,expiresAt:over.expiresAt,...(over.windowEnd?{windowEnd:over.windowEnd}:{})};
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
  fixtureListing({id:'closed-window',type:'其他',title:'代取快递',description:'代取快递仍在公示期',createdAt:created,expiresAt:new Date(now+7*day).toISOString(),windowEnd:new Date(now-1000).toISOString()})
 ]},null,2));
 const board=createBoard({file});
 const afternoon=board.matchListings('今天下午有没有人代取快递',3,now);
 assert.equal(afternoon[0].listingId,'afternoon');
 assert.ok(afternoon.some(x=>x.listingId==='anytime'));
 assert.ok(!afternoon.some(x=>x.listingId==='tomorrow-am'||x.listingId==='closed-window'));
 assert.deepEqual(board.matchListings('下个月有没有代购奶茶',3,now),[]);
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
 assert.deepEqual(board.db.threads,{});
 fs.rmSync(dir,{recursive:true,force:true});
});

test('ask does not open a chat until the student accepts',async t=>{
 const {request,app}=await setup(t);
 await request('auth/register',{studentId:'20250001',password:'secret1',displayName:'己'});
 assert.equal((await request('board/create',{type:'其他',title:'代取快递',description:'今天下午可以代取快递',contact:'微信 noon',days:7})).status,200);
 await request('auth/logout',{});
 const asked=await request('board/ask',{question:'今天下午有没有人代取快递'});
 assert.equal(asked.status,200);
 assert.match(asked.text,/互助通达/);
 assert.match(asked.text,/• /);
 assert.ok(asked.offers.length);
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
state={version:2,agents:[{id:'affairs',name:'校园办事助手',status:'published',team:'t1',category:'学校事务',description:'办事',rules:'只依据资料',icon:'brief',color:''}],docs:[{id:'d1',title:'学生证补办',status:'approved',agent:'affairs',owner:'student',source:'学生工作处',date:'2026-09-23',content:'c',chunkCount:1}],audit:[],chats:{}};
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
`,ctx);
 assert.equal(ctx.__page,'board');
 const home=ctx.__home;
 assert.match(home,/互助通达/);
 assert.match(home,/找助手/);
 assert.match(home,/学号登录/);
 assert.match(home,/more-menu/);
 assert.doesNotMatch(home,/团队工作台|审核管理|重置演示数据|本地资料问答|CAMPUS AGENTS|MUTUAL AID/);
 assert.doesNotMatch(home,/<label for="profile">演示身份<\/label>/);
 const chat=ctx.__chat;
 assert.match(chat,/chat-layout solo/);
 assert.doesNotMatch(chat,/cloud-consent|已审核知识库|火山方舟|我同意将当前问题/);
 assert.match(chat,/id="chat-form"/);
 const team=ctx.__team;
 assert.match(team,/团队工作台/);
 assert.match(team,/审核管理/);
 assert.doesNotMatch(team,/重置演示数据/);
 assert.match(ctx.__admin,/重置演示数据/);
 assert.match(ctx.__admin,/审核管理/);
 assert.match(ctx.__adminChat,/已审核知识库/);
 assert.doesNotMatch(ctx.__adminChat,/cloud-consent/);
});
