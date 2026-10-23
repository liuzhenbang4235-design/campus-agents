'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {tokens}=require('./retrieval.cjs');

const LISTING_TYPES=['代课','代购','二手书','其他'];
const EMPTY={version:1,accounts:[],listings:[],threads:{}};

function fail(message,status=400){const e=new Error(message);e.status=status;throw e}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file)}
function load(file){try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(!raw||typeof raw!=='object')throw 0;return {version:1,accounts:Array.isArray(raw.accounts)?raw.accounts:[],listings:Array.isArray(raw.listings)?raw.listings:[],threads:raw.threads&&typeof raw.threads==='object'&&!Array.isArray(raw.threads)?raw.threads:{}}}catch(e){if(e&&e.code==='ENOENT')return structuredClone(EMPTY);throw new Error('互助通达资料无法读取，请先备份检查。')}}

function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
 const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
 return {salt,hash};
}
function verifyPassword(password,salt,hash){
 try{
  const a=Buffer.from(hash,'hex');
  const b=Buffer.from(crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex'),'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
 }catch{return false}
}

function normalizeStudentId(value){
 const id=String(value||'').trim();
 if(!/^\d{8,12}$/.test(id))fail('学号应为 8—12 位数字。');
 return id;
}
function normalizePassword(value){
 if(typeof value!=='string'||value.length<6||value.length>72)fail('密码长度应为 6—72 位。');
 if(/\s/.test(value))fail('密码不能包含空白字符。');
 return value;
}
function displayNameOf(account){return account.displayName||('同学'+account.studentId.slice(-4))}

function pad(n){return String(n).padStart(2,'0')}
function iso(y,m,d){
 y=+y;m=+m;d=+d;
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
 return y+'-'+pad(m)+'-'+pad(d);
}
function addDaysKey(key,n){
 const [y,m,d]=key.split('-').map(Number);
 const dt=new Date(Date.UTC(y,m-1,d)+n*86400000);
 return iso(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
}
function weekdayOfKey(key){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()}
function mondayOf(key){const wd=weekdayOfKey(key);return addDaysKey(key,wd===0?-6:1-wd)}
function shanghaiDateKey(ms){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return iso(+parts.year,+parts.month,+parts.day);
}
// Day words in a question or a listing are resolved against `refMs` (ask time, or the listing's createdAt).
function extractTimeQuery(text,refMs){
 const src=String(text||'');
 const today=shanghaiDateKey(refMs);
 const days=new Set();
 const parts=new Set();
 let constrained=false;
 const addDay=key=>{if(!key)return;constrained=true;days.add(key)};
 const addRange=(start,end)=>{
  if(!start||!end||start>end)return;
  constrained=true;
  let k=start;
  for(let i=0;i<62&&k&&k<=end;i++){days.add(k);k=addDaysKey(k,1)}
 };
 const wd={一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0};
 const offset=target=>target===0?6:target-1;
 if(/上午|早上|早晨|清晨|今早/.test(src))parts.add('am');
 if(/中午|下午/.test(src))parts.add('pm');
 if(/晚上|傍晚|今晚|夜里|夜间/.test(src))parts.add('eve');
 if(/全天|随时/.test(src)){parts.add('am');parts.add('pm');parts.add('eve')}
 if(/今天|今日|当天|现在|马上|尽快|今早|今晚/.test(src))addDay(today);
 if(/明天|明日/.test(src))addDay(addDaysKey(today,1));
 if(/大后天/.test(src))addDay(addDaysKey(today,3));
 else if(/后天/.test(src))addDay(addDaysKey(today,2));
 if(/下个?月/.test(src)){
  const p=shanghaiDateKey(refMs).split('-').map(Number);
  const y=p[1]===12?p[0]+1:p[0],m=p[1]===12?1:p[1]+1;
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  addRange(iso(y,m,1),iso(y,m,last));
 }
 if(/(?:这周|本周|这个星期|这星期)[一二三四五六日天]/.test(src)){
  for(const m of src.matchAll(/(?:这周|本周|这个星期|这星期)([一二三四五六日天])/g))addDay(addDaysKey(mondayOf(today),offset(wd[m[1]])));
 }else if(/这周|本周|这个星期|这星期/.test(src))addRange(mondayOf(today),addDaysKey(mondayOf(today),6));
 if(/(?:下周|下星期|下礼拜)[一二三四五六日天]/.test(src)){
  const mon=addDaysKey(mondayOf(today),7);
  for(const m of src.matchAll(/(?:下周|下星期|下礼拜)([一二三四五六日天])/g))addDay(addDaysKey(mon,offset(wd[m[1]])));
 }else if(/下周|下个星期|下星期/.test(src)){
  const mon=addDaysKey(mondayOf(today),7);addRange(mon,addDaysKey(mon,6));
 }
 if(/(?:上周|上星期|上礼拜)[一二三四五六日天]/.test(src)){
  const mon=addDaysKey(mondayOf(today),-7);
  for(const m of src.matchAll(/(?:上周|上星期|上礼拜)([一二三四五六日天])/g))addDay(addDaysKey(mon,offset(wd[m[1]])));
 }
 if(/这几天|最近|近日/.test(src))addRange(today,addDaysKey(today,2));
 if(/周末/.test(src)){
  const wd0=weekdayOfKey(today);
  if(wd0===0){addDay(today);addDay(addDaysKey(today,-1))}
  else{const sat=addDaysKey(today,(6-wd0+7)%7);addDay(sat);addDay(addDaysKey(sat,1))}
 }
 for(const m of src.matchAll(/(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})/g))addDay(iso(m[1],m[2],m[3]));
 for(const m of src.matchAll(/(?<!\d)(\d{1,2})月(\d{1,2})[日号]/g)){
  const y=+today.slice(0,4);
  let key=iso(y,m[1],m[2]);
  if(key&&key<today&&addDaysKey(key,7)<today)key=iso(y+1,m[1],m[2]);
  addDay(key);
 }
 for(const m of src.matchAll(/(?<![上下本这])(?:周|星期|礼拜)([一二三四五六日天])/g)){
  let key=addDaysKey(mondayOf(today),offset(wd[m[1]]));
  if(key<today)key=addDaysKey(key,7);
  addDay(key);
 }
 return {constrained:constrained||parts.size>0,days:constrained?[...days]:null,parts:parts.size?parts:null};
}
function validityDays(listing){
 const start=Date.parse(listing.windowStart||listing.createdAt);
 const end=Date.parse(listing.windowEnd||listing.expiresAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const days=[];
 let k=shanghaiDateKey(start);
 const last=shanghaiDateKey(end-1);
 for(let i=0;i<120&&k&&k<=last;i++){days.push(k);k=addDaysKey(k,1)}
 return days;
}
function timeFit(listing,question,now){
 const q=extractTimeQuery(question,now);
 const text=[listing.title,listing.description,listing.timeNote].filter(Boolean).join(' ');
 const ref=Date.parse(listing.createdAt);
 const l=extractTimeQuery(text,Number.isFinite(ref)?ref:now);
 const valid=new Set(validityDays(listing));
 const today=shanghaiDateKey(now);
 let boost=0;
 const partsHit=()=>!q.parts||!l.parts||[...q.parts].some(p=>l.parts.has(p));
 if(q.days){
  const qDays=q.days.filter(d=>valid.has(d));
  if(!qDays.length)return {ok:false,boost:0};
  if(l.days){
   const overlap=l.days.filter(d=>qDays.includes(d));
   if(!overlap.length)return {ok:false,boost:0};
   boost+=3;
  }else boost+=1;
  if(q.parts&&l.parts){
   if(!partsHit())return {ok:false,boost:0};
   boost+=2;
  }
 }else if(l.days){
  if(l.days.some(d=>valid.has(d)&&d>=today))boost+=0.5;
  if(q.parts&&l.parts){
   if(!partsHit())return {ok:false,boost:0};
   boost+=1;
  }
 }else if(q.parts&&l.parts){
  if(!partsHit())return {ok:false,boost:0};
  boost+=1;
 }
 return {ok:true,boost};
}
function summarizeOffer(text,max=120){
 const t=String(text||'').replace(/https?:\/\/\S+/g,' ').replace(/\s+/g,' ').trim();
 if(!t)return '（暂无说明）';
 return t.length<=max?t:t.slice(0,max-1)+'…';
}
function answerText(offers,{selfOnly=false}={}){
 if(!offers.length)return selfOnly
  ?'找到的有效登记是你自己发的，还没有其他同学在这个时间对得上。可以换个说法，或等同学来登记。'
  :'互助通达里暂时没有还在有效期内、并且时间和你的问题对得上的登记。可以换个说法再问，或在下方登记一条。';
 const lines=['在互助通达里找到这些还在有效期内、时间也对得上的登记：',''];
 for(const o of offers){
  lines.push('• '+o.type+' · '+o.title+'：'+summarizeOffer(o.excerpt)+'（'+o.ownerName+'，有效至 '+String(o.expiresAt||'').slice(0,10)+'）');
  const urls=[...new Set((String(o.excerpt||'')+' '+String(o.contact||'')).match(/https?:\/\/[^\s<>"']+/g)||[])];
  for(const u of urls.slice(0,2))lines.push(u);
 }
 lines.push('','以上为同学自愿登记，非官方信息，请自行核实后再联系。');
 return lines.join('\n');
}

function createBoard(options={}){
 const file=options.file||path.join(options.dataDir||'.','campus-board.json');
 let db=load(file);
 function save(next){atomic(file,next);db=next}
 function change(action){const next=structuredClone(db);action(next);save(next)}

 function register(b){
  const studentId=normalizeStudentId(b.studentId);
  const password=normalizePassword(b.password);
  let displayName=typeof b.displayName==='string'?b.displayName.trim().slice(0,20):'';
  if(displayName&&/[\u0000-\u001f]/.test(displayName))fail('昵称含有无效字符。');
  if(db.accounts.some(a=>a.studentId===studentId))fail('该学号已注册。',409);
  const {salt,hash}=hashPassword(password);
  const account={studentId,displayName:displayName||'',passwordSalt:salt,passwordHash:hash,createdAt:new Date().toISOString()};
  change(next=>next.accounts.push(account));
  return publicAccount(account);
 }
 function login(b){
  const studentId=normalizeStudentId(b.studentId);
  const password=normalizePassword(b.password);
  const account=db.accounts.find(a=>a.studentId===studentId);
  if(!account||!verifyPassword(password,account.passwordSalt,account.passwordHash))fail('学号或密码不正确。',401);
  return publicAccount(account);
 }
 function publicAccount(account){return {studentId:account.studentId,displayName:displayNameOf(account)}}
 function requireAccount(account){if(!account||!account.studentId)fail('请先用学号登录后再操作。',401);const full=db.accounts.find(a=>a.studentId===account.studentId);if(!full)fail('账号不存在或已失效，请重新登录。',401);return full}

 function isActive(listing,now=Date.now()){
  return listing.status==='active'&&Date.parse(listing.expiresAt)>now;
 }
 function publicListing(listing,{includeContact=true}={}){
  const out={id:listing.id,type:listing.type,title:listing.title,description:listing.description,ownerStudentId:listing.ownerStudentId,ownerName:listing.ownerName,createdAt:listing.createdAt,expiresAt:listing.expiresAt,status:listing.status};
  if(includeContact)out.contact=listing.contact;
  return out;
 }
 function createListing(account,b){
  const owner=requireAccount(account);
  if(!LISTING_TYPES.includes(b.type))fail('请选择有效类型：代课 / 代购 / 二手书 / 其他。');
  const title=String(b.title||'').trim();
  const description=String(b.description||'').trim();
  const contact=String(b.contact||'').trim();
  if(!title||title.length>60)fail('标题为空或超过 60 字。');
  if(!description||description.length>800)fail('说明为空或超过 800 字。');
  if(!contact||contact.length>80)fail('请填写自愿公开的联系方式（不超过 80 字）。');
  const days=Number(b.days);if(![3,7,14].includes(days))fail('有效期请选择 3 / 7 / 14 天。');
  const now=Date.now();
  const listing={id:crypto.randomUUID(),type:b.type,title,description,contact,ownerStudentId:owner.studentId,ownerName:displayNameOf(owner),status:'active',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+days*86400000).toISOString()};
  change(next=>next.listings.unshift(listing));
  return publicListing(listing);
 }
 function listActive({q='',type=''}={}){
  const query=String(q||'').trim().toLowerCase();
  const now=Date.now();
  return db.listings.filter(l=>isActive(l,now))
   .filter(l=>!type||type==='全部'||l.type===type)
   .filter(l=>!query||[l.title,l.description,l.type,l.ownerName].some(v=>String(v).toLowerCase().includes(query)))
   .map(l=>publicListing(l));
 }
 function takeDown(account,listingId,{asAdmin=false}={}){
  const owner=asAdmin?null:requireAccount(account);
  let found=null;
  change(next=>{
   const listing=next.listings.find(l=>l.id===listingId);
   if(!listing)fail('登记不存在。',404);
   if(!asAdmin&&listing.ownerStudentId!==owner.studentId)fail('只能下架自己登记的信息。',403);
   if(listing.status!=='active')fail('该登记已下架。',409);
   listing.status='taken_down';found=listing;
  });
  return publicListing(found,{includeContact:false});
 }

 function scoreListing(listing,question,now){
  const qTokens=[...new Set(tokens(question))];
  if(!qTokens.length)return 0;
  const hay=tokens(listing.type+' '+listing.title+' '+listing.description+' '+(listing.timeNote||''));
  if(!hay.length)return 0;
  let hit=0;
  for(const t of qTokens)if(hay.includes(t))hit++;
  const ratio=hit/qTokens.length;
  const intent=/代课|代购|二手|教材|高数|出书|收书|跑腿|帮买|帮带|转让|出闲置|有没有人|代取|快递|取件/.test(question)?1.2:1;
  if(hit===0)return 0;
  if(ratio<0.12&&hit<2)return 0;
  const fit=timeFit(listing,question,now);
  if(!fit.ok)return 0;
  return hit*intent+ratio+fit.boost;
 }
 function matchListings(question,limit=3,now=Date.now()){
  const ranked=db.listings.filter(l=>isActive(l,now)&&(!l.windowEnd||Date.parse(l.windowEnd)>now))
   .map(l=>({listing:l,score:scoreListing(l,question,now)}))
   .filter(x=>x.score>0)
   .sort((a,b)=>b.score-a.score||Date.parse(b.listing.createdAt)-Date.parse(a.listing.createdAt))
   .slice(0,limit);
  return ranked.map(({listing},i)=>({
   sourceType:'campus_board',
   listingId:listing.id,
   docId:'board:'+listing.id,
   title:'[同学提供] '+listing.type+' · '+listing.title,
   rawTitle:listing.title,
   source:'同学提供，非官方',
   excerpt:listing.description+(listing.contact?' 联系：'+listing.contact:''),
   description:listing.description,
   contact:listing.contact,
   ownerStudentId:listing.ownerStudentId,
   ownerName:listing.ownerName,
   type:listing.type,
   expiresAt:listing.expiresAt,
   createdAt:listing.createdAt,
   date:String(listing.createdAt||'').slice(0,10),
   citation:i+1
  }));
 }
 function ask(question,options={}){
  const q=String(question||'').trim();
  if(!q||q.length>500)fail('问题为空或超过 500 字。');
  const now=options.now||Date.now();
  const hits=matchListings(q,3,now);
  const offers=hits.filter(h=>!options.viewerId||h.ownerStudentId!==options.viewerId).map(h=>({
   listingId:h.listingId,type:h.type,title:h.rawTitle,ownerName:h.ownerName,ownerStudentId:h.ownerStudentId,
   excerpt:h.description,contact:h.contact,expiresAt:h.expiresAt,createdAt:h.createdAt
  }));
  return {question:q,text:answerText(offers,{selfOnly:Boolean(options.viewerId)&&hits.length>0&&offers.length===0}),offers};
 }

 function threadKey(listingId,a,b){
  const [x,y]=[a,b].sort();
  return listingId+':'+x+':'+y;
 }
 function threadView(me,listing,messages){
  return {
   key:threadKey(listing.id,me.studentId,listing.ownerStudentId),
   listing:publicListing(listing),
   peer:{studentId:listing.ownerStudentId,displayName:listing.ownerName},
   messages
  };
 }
 function loadChat(account,listingId){
  const me=requireAccount(account);
  const listing=db.listings.find(l=>l.id===listingId);
  if(!listing)fail('登记不存在。',404);
  if(!isActive(listing)&&listing.status!=='taken_down')fail('登记不可用。',404);
  if(listing.ownerStudentId===me.studentId)fail('不能与自己开聊。');
  return {me,listing};
 }
 function readThread(account,listingId){
  const {me,listing}=loadChat(account,listingId);
  const key=threadKey(listing.id,me.studentId,listing.ownerStudentId);
  return threadView(me,listing,db.threads[key]||[]);
 }
 function openThread(account,listingId){
  const {me,listing}=loadChat(account,listingId);
  const key=threadKey(listing.id,me.studentId,listing.ownerStudentId);
  if(!db.threads[key])change(next=>{next.threads[key]=next.threads[key]||[]});
  return threadView(me,listing,db.threads[key]||[]);
 }
 function sendDm(account,{listingId,text}){
  const me=requireAccount(account);
  const body=String(text||'').trim();
  if(!body||body.length>500)fail('消息为空或超过 500 字。');
  const thread=openThread(account,listingId);
  const message={id:crypto.randomUUID(),from:me.studentId,text:body,time:new Date().toISOString()};
  change(next=>{
   const list=next.threads[thread.key]||[];
   list.push(message);
   next.threads[thread.key]=list.slice(-200);
  });
  return {thread:openThread(account,listingId),message};
 }
 function getThread(account,listingId){return readThread(account,listingId)}

 return {
  LISTING_TYPES,
  register,login,requireAccount,publicAccount,
  createListing,listActive,takeDown,matchListings,ask,isActive,publicListing,
  getThread,openThread,sendDm,file,get db(){return db}
 };
}

module.exports={createBoard,hashPassword,verifyPassword,LISTING_TYPES,EMPTY};
