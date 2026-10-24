'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {tokens}=require('./retrieval.cjs');

const TYPE_HINTS=['代取','代购','二手教材','陪诊','搬运','摄影','兼职'];
const GENERIC=new Set(['有没','没有','有人','人吗','一下','这个','那个','同学','可以','需要','帮忙','帮个','谁能','找人','想找','现在','请问','是否','什么','怎么','如何','哪里','这儿','那里','今天','明天','后天','上午','下午','晚上','早上','今早','今晚','本周','下周','周一','周二','周三','周四','周五','周六','周日','周末','白天','夜里']);
const C2C_GROUPS=[
 {words:['代取','取件','取快递','代拿','帮取','拿快递']},
 {words:['代购','帮买','代买','跑腿']},
 {words:['代课','替课']},
 {words:['教材','二手书','出书','收书','闲置书']},
 {words:['搬宿舍','搬运','搬家','搬东西','帮搬']},
 {words:['维修','修理','修电脑','修手机']},
 {words:['陪诊','陪同就医','陪去医院']},
 {words:['摄影','拍照','跟拍','约拍']},
 {words:['打印','复印']},
 {words:['洗衣','洗衣服','代洗']},
 {words:['兼职','招兼职','找兼职']},
 {words:['线代','线性代数'],topic:true},
 {words:['高数','高等数学'],topic:true}
];
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
 if(!/^\d{8}$/.test(id))fail('学号应为 8 位数字。');
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
function shanghaiHour(ms){
 return +new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date(ms));
}
function formatWhen(ms){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute;
}
function sliceParts(a,b){
 if(!(b>a))return new Set();
 if(b-a>=20*3600000)return new Set(['am','pm','eve']);
 const parts=new Set();
 for(let t=a;t<b&&t<a+36*3600000;t+=30*60*1000){
  const hour=shanghaiHour(t);
  if(hour>=5&&hour<12)parts.add('am');
  else if(hour>=12&&hour<18)parts.add('pm');
  else parts.add('eve');
 }
 return parts;
}
function hasExplicitWindow(listing){
 return listing.longTerm===true||Boolean(listing.windowStart)||Boolean(listing.windowEnd);
}
function listingEndMs(listing){
 if(listing.longTerm===true){
  const start=Date.parse(listing.windowStart||listing.createdAt||0);
  return (Number.isFinite(start)?start:Date.now())+400*86400000;
 }
 return Date.parse(listing.windowEnd||listing.expiresAt||'');
}
function daySliceParts(listing,dayKey){
 if(!hasExplicitWindow(listing))return null;
 const start=Date.parse(listing.windowStart||listing.createdAt||'');
 const end=listingEndMs(listing);
 if(!Number.isFinite(start)||!Number.isFinite(end))return null;
 const dayStart=Date.parse(dayKey+'T00:00:00+08:00');
 if(!Number.isFinite(dayStart))return null;
 const a=Math.max(start,dayStart),b=Math.min(end,dayStart+86400000);
 if(!(b>a))return new Set();
 return sliceParts(a,b);
}
// 「接代取」「接什么什么事」「我可以接」是帮助方（供给），不是求助。
function stance(text){
 const s=String(text||'');
 const offer=/接(?:代取|代购|代课|单|活|跑腿|快递|取件|送|修|搬|拍|印|洗|什么)|我可以?接|可以接|接一下|本人接/.test(s);
 const need=/有没有人|谁能|求(?!助)|想找|需要人|帮我|收(?:教材|书|闲置)|出(?:教材|书|闲置)|转让/.test(s);
 if(offer&&!need)return 'offer';
 if(need&&!offer)return 'need';
 return 'either';
}
function displayTitle(listing){
 const legacy=String(listing.title||'').trim();
 if(legacy)return legacy;
 const type=String(listing.type||'').trim();
 const desc=String(listing.description||'').replace(/\s+/g,' ').trim();
 const brief=desc.length>28?desc.slice(0,27)+'…':desc;
 if(type&&brief)return type+' · '+brief;
 return type||brief||'同学登记';
}
function windowTextOf(listing){
 if(listing.longTerm===true){
  const start=Date.parse(listing.windowStart||listing.createdAt||'');
  return '长期'+(Number.isFinite(start)?' · '+formatWhen(start)+'起':'');
 }
 const start=Date.parse(listing.windowStart||'');
 const end=Date.parse(listing.windowEnd||listing.expiresAt||'');
 if(Number.isFinite(start)&&Number.isFinite(end))return formatWhen(start)+' – '+formatWhen(end);
 if(Number.isFinite(end))return '有效至 '+formatWhen(end);
 return '长期';
}
function groupHits(text){
 const s=String(text||'');
 const hits=[];
 C2C_GROUPS.forEach((group,i)=>{if(group.words.some(word=>s.includes(word)))hits.push(i)});
 return hits;
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
 const start=Date.parse(listing.windowStart||listing.createdAt||'');
 const end=listingEndMs(listing);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const days=[];
 let k=shanghaiDateKey(start);
 const last=shanghaiDateKey(end-1);
 const cap=listing.longTerm===true?400:120;
 for(let i=0;i<cap&&k&&k<=last;i++){days.push(k);k=addDaysKey(k,1)}
 return days;
}
function partsFit(qParts,windowParts,textParts){
 if(windowParts&&windowParts.size===0)return false;
 let allowed=windowParts&&windowParts.size?new Set(windowParts):null;
 if(textParts&&textParts.size){
  if(!allowed)allowed=new Set(textParts);
  else{
   allowed=new Set([...allowed].filter(p=>textParts.has(p)));
   if(!allowed.size)return false;
  }
 }
 if(!qParts||!qParts.size)return true;
 if(!allowed)return true;
 return [...qParts].some(p=>allowed.has(p));
}
function timeFit(listing,question,now){
 const q=extractTimeQuery(question,now);
 const text=[listing.title,listing.description,listing.timeNote].filter(Boolean).join(' ');
 const ref=Date.parse(listing.createdAt);
 const l=extractTimeQuery(text,Number.isFinite(ref)?ref:now);
 const valid=new Set(validityDays(listing));
 const today=shanghaiDateKey(now);
 const startMs=Date.parse(listing.windowStart||listing.createdAt||0);
 let boost=0;
 const onDay=day=>daySliceParts(listing,day);
 if(!q.days&&Number.isFinite(startMs)&&startMs>now)return {ok:false,boost:0};
 if(q.days){
  const qDays=q.days.filter(d=>valid.has(d));
  if(!qDays.length)return {ok:false,boost:0};
  if(l.days){
   const overlap=l.days.filter(d=>qDays.includes(d));
   if(!overlap.length)return {ok:false,boost:0};
   boost+=3;
   if(q.parts&&!overlap.some(d=>partsFit(q.parts,onDay(d),l.parts)))return {ok:false,boost:0};
   if(q.parts)boost+=2;
  }else{
   boost+=1;
   if(q.parts&&!qDays.some(d=>partsFit(q.parts,onDay(d),l.parts)))return {ok:false,boost:0};
   if(q.parts)boost+=2;
  }
 }else if(l.days){
  if(l.days.some(d=>valid.has(d)&&d>=today))boost+=0.5;
  if(q.parts){
   const days=[...valid].filter(d=>d>=today);
   const probe=l.days.filter(d=>days.includes(d));
   if(probe.length&&!probe.some(d=>partsFit(q.parts,onDay(d),l.parts)))return {ok:false,boost:0};
   if(!probe.length&&l.parts&&![...q.parts].some(p=>l.parts.has(p)))return {ok:false,boost:0};
   boost+=1;
  }
 }else if(q.parts){
  const days=[...valid].filter(d=>d>=today);
  const probe=days.length?days:[today];
  if(!probe.some(d=>partsFit(q.parts,onDay(d),l.parts)))return {ok:false,boost:0};
  boost+=l.parts?1:0;
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
  ?'找到的登记是你自己发的，其他同学这条还对不上。可以换个说法，或等同学来登记。'
  :'互助通达里还没看到和这句话对得上、并且落在生效时段里的登记。任何同学之间的需求或帮助都可以问，不限于固定类别。可以换个说法，或自己登记一条。';
 const lines=['在互助通达里找到这些正处在生效时段、意思也对得上的登记：',''];
 for(const o of offers){
  const name=o.display||[o.type,o.title].filter(Boolean).join(' · ')||o.type||'同学登记';
  const role=o.role==='offer'?'帮助方':o.role==='need'?'需求方':'';
  lines.push('• '+name+'：'+summarizeOffer(o.excerpt)+'（'+o.ownerName+(role?'，'+role:'')+'，'+(o.windowText||'生效中')+'）');
  const urls=[...new Set((String(o.excerpt||'')+' '+String(o.contact||'')).match(/https?:\/\/[^\s<>"']+/g)||[])];
  for(const u of urls.slice(0,2))lines.push(u);
 }
 lines.push('','以上为同学自愿登记，非官方信息，请自行核实后再联系。');
 return lines.join('\n');
}
function parseWhen(value,label){
 if(value==null||value==='')return null;
 const s=String(value).trim();
 let ms=NaN;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))ms=Date.parse(s+':00+08:00');
 else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s))ms=Date.parse(s);
 else fail(label+'请填写日期和时间。');
 if(!Number.isFinite(ms))fail(label+'不是有效时间。');
 return ms;
}
function normalizeType(value){
 const type=String(value||'').replace(/[\u0000-\u001f]/g,'').trim();
 if(!type||type.length>30)fail('类型请自己填写，1—30 字，例如代取、陪诊、出闲置。');
 return type;
}
function stillOpen(listing,now){
 if(listing.status!=='active')return false;
 if(listing.longTerm===true)return true;
 const end=Date.parse(listing.windowEnd||listing.expiresAt||'');
 return Number.isFinite(end)&&end>now;
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
  if(!stillOpen(listing,now))return false;
  const start=Date.parse(listing.windowStart||listing.createdAt||0);
  return !Number.isFinite(start)||start<=now;
 }
 function publicListing(listing,{includeContact=true}={}){
  const out={
   id:listing.id,type:listing.type,description:listing.description,
   display:displayTitle(listing),
   role:listing.role||stance([listing.type,listing.title,listing.description].filter(Boolean).join(' ')),
   ownerStudentId:listing.ownerStudentId,ownerName:listing.ownerName,
   createdAt:listing.createdAt,
   windowStart:listing.windowStart||null,windowEnd:listing.windowEnd||null,
   longTerm:listing.longTerm===true,expiresAt:listing.expiresAt||null,
   windowText:windowTextOf(listing),status:listing.status
  };
  if(String(listing.title||'').trim())out.title=String(listing.title).trim();
  if(includeContact)out.contact=listing.contact;
  return out;
 }
 function createListing(account,b){
  const owner=requireAccount(account);
  const type=normalizeType(b.type);
  const description=String(b.description||'').trim();
  const contact=String(b.contact||'').trim();
  if(!description||description.length>800)fail('说明为空或超过 800 字。');
  if(!contact||contact.length>80)fail('请填写自愿公开的联系方式（不超过 80 字）。');
  const longTerm=b.longTerm===true||b.longTerm==='true'||b.longTerm==='1';
  const now=Date.now();
  let start=parseWhen(b.windowStart,'开始时间');
  const end=parseWhen(b.windowEnd,'结束时间');
  if(longTerm){
   if(start==null)start=now;
   if(end!=null)fail('长期登记不用填写结束时间。');
  }else{
   if(start==null||end==null)fail('请设定生效时段的开始和结束，或选择长期。');
   if(end-start<15*60*1000)fail('生效时段至少 15 分钟。');
   if(end-start>90*86400000)fail('时段最长 90 天；更久请选长期。');
   if(end<=now)fail('结束时间需要晚于现在。');
  }
  if(start<now-3600000)fail('开始时间不能早于当前一个小时。');
  if(start>now+180*86400000)fail('开始时间太远了。');
  const listing={
   id:crypto.randomUUID(),type,description,contact,
   role:stance(type+' '+description),
   ownerStudentId:owner.studentId,ownerName:displayNameOf(owner),status:'active',
   longTerm,createdAt:new Date(now).toISOString(),
   windowStart:new Date(start).toISOString(),
   windowEnd:longTerm?null:new Date(end).toISOString(),
   expiresAt:longTerm?null:new Date(end).toISOString()
  };
  change(next=>next.listings.unshift(listing));
  return publicListing(listing);
 }
 function listActive({q='',type=''}={}){
  const query=String(q||'').trim().toLowerCase();
  const now=Date.now();
  const kind=String(type||'').trim();
  return db.listings.filter(l=>isActive(l,now))
   .filter(l=>!kind||kind==='全部'||l.type===kind||String(l.type).includes(kind))
   .filter(l=>!query||[l.title,l.description,l.type,l.ownerName,displayTitle(l)].some(v=>String(v||'').toLowerCase().includes(query)))
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
  const qText=String(question||'');
  const hayText=[listing.type,listing.title,listing.description,listing.timeNote].filter(Boolean).join(' ');
  const qTokens=[...new Set(tokens(qText))].filter(t=>!GENERIC.has(t));
  const hay=new Set(tokens(hayText).filter(t=>!GENERIC.has(t)));
  let hit=0;
  for(const t of qTokens)if(hay.has(t))hit++;
  const qGroups=groupHits(qText),lGroups=groupHits(hayText);
  const shared=qGroups.filter(i=>lGroups.includes(i));
  const tasks=ids=>ids.filter(i=>!C2C_GROUPS[i].topic);
  const qTask=tasks(qGroups),lTask=tasks(lGroups);
  if(qTask.length&&lTask.length&&!qTask.some(i=>lTask.includes(i)))return 0;
  if(!hit&&!shared.length)return 0;
  const ratio=qTokens.length?hit/qTokens.length:0;
  if(!shared.length&&hit<2&&ratio<0.12)return 0;
  const fit=timeFit(listing,question,now);
  if(!fit.ok)return 0;
  const qRole=stance(qText);
  const lRole=listing.role&&listing.role!=='either'?listing.role:stance(hayText);
  const roleBoost=qRole!=='either'&&lRole!=='either'&&qRole!==lRole?0.8:0;
  return hit+shared.length*1.4+ratio+fit.boost+roleBoost+0.2;
 }
 function matchListings(question,limit=3,now=Date.now()){
  const ranked=db.listings.filter(l=>stillOpen(l,now))
   .map(l=>({listing:l,score:scoreListing(l,question,now)}))
   .filter(x=>x.score>0)
   .sort((a,b)=>b.score-a.score||Date.parse(b.listing.createdAt)-Date.parse(a.listing.createdAt))
   .slice(0,limit);
  return ranked.map(({listing},i)=>{
   const shown=displayTitle(listing);
   const role=listing.role||stance([listing.type,listing.title,listing.description].filter(Boolean).join(' '));
   return {
    sourceType:'campus_board',
    listingId:listing.id,
    docId:'board:'+listing.id,
    title:'[同学提供] '+shown,
    rawTitle:String(listing.title||'').trim(),
    display:shown,
    source:'同学提供，非官方',
    excerpt:listing.description+(listing.contact?' 联系：'+listing.contact:''),
    description:listing.description,
    contact:listing.contact,
    ownerStudentId:listing.ownerStudentId,
    ownerName:listing.ownerName,
    type:listing.type,
    role,
    longTerm:listing.longTerm===true,
    windowStart:listing.windowStart||null,
    windowEnd:listing.windowEnd||null,
    windowText:windowTextOf(listing),
    expiresAt:listing.expiresAt||null,
    createdAt:listing.createdAt,
    date:String(listing.createdAt||'').slice(0,10),
    citation:i+1
   };
  });
 }
 function ask(question,options={}){
  const q=String(question||'').trim();
  if(!q||q.length>500)fail('问题为空或超过 500 字。');
  const now=options.now||Date.now();
  const hits=matchListings(q,3,now);
  const offers=hits.filter(h=>!options.viewerId||h.ownerStudentId!==options.viewerId).map(h=>({
   listingId:h.listingId,type:h.type,title:h.rawTitle,display:h.display,role:h.role,
   ownerName:h.ownerName,ownerStudentId:h.ownerStudentId,
   excerpt:h.description,contact:h.contact,expiresAt:h.expiresAt,createdAt:h.createdAt,
   longTerm:h.longTerm,windowStart:h.windowStart,windowEnd:h.windowEnd,windowText:h.windowText
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
  TYPE_HINTS,
  register,login,requireAccount,publicAccount,
  createListing,listActive,takeDown,matchListings,ask,isActive,publicListing,
  getThread,openThread,sendDm,file,get db(){return db}
 };
}

module.exports={createBoard,hashPassword,verifyPassword,TYPE_HINTS,EMPTY};
