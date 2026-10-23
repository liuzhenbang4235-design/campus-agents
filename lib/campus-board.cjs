'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {tokens}=require('./retrieval.cjs');

const LISTING_TYPES=['代课','代购','二手书','其他'];
const EMPTY={version:1,accounts:[],listings:[],threads:{}};

function fail(message,status=400){const e=new Error(message);e.status=status;throw e}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file)}
function load(file){try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(!raw||typeof raw!=='object')throw 0;return {version:1,accounts:Array.isArray(raw.accounts)?raw.accounts:[],listings:Array.isArray(raw.listings)?raw.listings:[],threads:raw.threads&&typeof raw.threads==='object'&&!Array.isArray(raw.threads)?raw.threads:{}}}catch(e){if(e&&e.code==='ENOENT')return structuredClone(EMPTY);throw new Error('校园信息库无法读取，请先备份检查。')}}

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

 function scoreListing(listing,question){
  const qTokens=[...new Set(tokens(question))];
  if(!qTokens.length)return 0;
  const hay=tokens(listing.type+' '+listing.title+' '+listing.description);
  if(!hay.length)return 0;
  let hit=0;
  for(const t of qTokens)if(hay.includes(t))hit++;
  const ratio=hit/qTokens.length;
  // Prefer topical campus-board intents; still allow plain keyword overlap.
  const intent=/代课|代购|二手|教材|高数|出书|收书|跑腿|帮买|帮带|转让|出闲置|有没有人/.test(question)?1.2:1;
  if(hit===0)return 0;
  if(ratio<0.12&&hit<2)return 0;
  return hit*intent+ratio;
 }
 function matchListings(question,limit=3){
  const now=Date.now();
  const ranked=db.listings.filter(l=>isActive(l,now))
   .map(l=>({listing:l,score:scoreListing(l,question)}))
   .filter(x=>x.score>0)
   .sort((a,b)=>b.score-a.score)
   .slice(0,limit);
  return ranked.map(({listing},i)=>({
   sourceType:'campus_board',
   listingId:listing.id,
   docId:'board:'+listing.id,
   title:'[同学提供] '+listing.type+' · '+listing.title,
   source:'同学提供，非官方',
   excerpt:listing.description+(listing.contact?' 联系：'+listing.contact:''),
   contact:listing.contact,
   ownerStudentId:listing.ownerStudentId,
   ownerName:listing.ownerName,
   type:listing.type,
   expiresAt:listing.expiresAt,
   date:listing.createdAt.slice(0,10),
   citation:i+1
  }));
 }

 function threadKey(listingId,a,b){
  const [x,y]=[a,b].sort();
  return listingId+':'+x+':'+y;
 }
 function openThread(account,listingId){
  const me=requireAccount(account);
  const listing=db.listings.find(l=>l.id===listingId);
  if(!listing)fail('登记不存在。',404);
  if(!isActive(listing)&&listing.status!=='taken_down')fail('登记不可用。',404);
  if(listing.ownerStudentId===me.studentId)fail('不能与自己开聊。');
  const key=threadKey(listingId,me.studentId,listing.ownerStudentId);
  if(!db.threads[key])change(next=>{next.threads[key]=next.threads[key]||[]});
  return {
   key,
   listing:publicListing(listing),
   peer:{studentId:listing.ownerStudentId,displayName:listing.ownerName},
   messages:db.threads[key]||[]
  };
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
 function getThread(account,listingId){return openThread(account,listingId)}

 return {
  LISTING_TYPES,
  register,login,requireAccount,publicAccount,
  createListing,listActive,takeDown,matchListings,isActive,publicListing,
  getThread,sendDm,file,get db(){return db}
 };
}

module.exports={createBoard,hashPassword,verifyPassword,LISTING_TYPES,EMPTY};
