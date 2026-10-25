'use strict';
const icons={grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',chat:'<path d="M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5Z"/><path d="M7 10h10M7 14h6"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',book:'<path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z"/>',home:'<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',brief:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18m-9-2v4"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',file:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m4 12 5 5L20 6"/>',lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',spark:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',board:'<path d="M8 4h8v4H8zM5 8h14v12H5z"/><path d="M9 12h6M9 16h4"/>'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.spark}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function linkifyEscaped(escaped){
 return String(escaped).replace(/https?:\/\/[^\s<>"']+/g,m=>{
  try{
   const href=m.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
   const u=new URL(href);
   if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return m;
   return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+m+'</a>';
  }catch{return m}
 });
}
function formatBubble(text){
 const lines=String(text??'').split('\n');
 const out=[];let list=[];
 const flush=()=>{if(!list.length)return;out.push('<ul class="answer-list">'+list.map(item=>'<li>'+linkifyEscaped(esc(item))+'</li>').join('')+'</ul>');list=[]};
 const bullet=/^\s*(?:[•\-–]|\d+[\.、])\s+(.*)$/;
 for(const line of lines){
  const m=line.match(bullet);
  if(m){list.push(m[1]);continue}
  flush();
  if(!line){out.push('<br>');continue}
  out.push(linkifyEscaped(esc(line))+'<br>');
 }
 flush();
 return out.join('').replace(/(?:<br>)+$/,'');
}
function sourceMarkup(s){
 if(s.sourceType==='campus_board'){
  return '<button class="source-btn" data-action="board-offer" data-id="'+esc(s.listingId)+'" data-title="'+esc(s.display||s.rawTitle||s.title||'同学登记')+'" data-owner="'+esc(s.ownerName||'')+'" data-type="'+esc(s.type||'')+'" data-expires="'+esc(s.windowText||s.expiresAt||'')+'">['+s.citation+'] '+esc(s.title||'同学登记')+' · 是否开聊</button>';
 }
 if(s.sourceType==='map'){
  let url;try{url=new URL(s.sourceUrl);if(url.protocol!=='https:'||!((url.hostname==='uri.amap.com'&&url.pathname==='/search')||(url.hostname==='www.openstreetmap.org'&&/^\/(node|way|relation)\/\d+$/.test(url.pathname)))||url.username||url.password)return ''}catch{return ''}
  return '<a class="source-btn" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">['+s.citation+'] '+esc(s.title)+' · '+(url.hostname==='www.openstreetmap.org'?'本地快照，非实时':'高德查询结果')+' ↗</a>';
 }
 const label='['+s.citation+'] '+esc(s.title||'资料');
 if(s.sourceUrl){
  try{
   const url=new URL(s.sourceUrl);
   if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)
    return '<a class="source-btn" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">'+label+' · 打开原文 ↗</a>';
  }catch{}
 }
 return '<button class="source-btn" data-action="view-doc" data-id="'+esc(s.docId)+'">'+label+' · 查看来源</button>';
}
const KEY='xiaoji-prototype-v1';
const profiles={student:{name:'林同学',label:'普通学生 · 林同学',role:'student',team:null},team:{name:'陈同学',label:'校集团队 · 陈同学',role:'team',team:'t1'},admin:{name:'管理员',label:'平台管理员',role:'admin',team:null}};
const AI_PROVIDERS={
 qwen:{id:'qwen',short:'千问',name:'通义千问 · 阿里云百炼',vendor:'阿里云百炼',console:'https://bailian.console.aliyun.com/',consoleLabel:'打开阿里云百炼控制台',docs:'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen',docsLabel:'接入说明',notice:'新账号通常有免费额度；建议在百炼控制台开启「用完即停」，避免额度用完后自动扣费。资格与额度以控制台为准；本机次数上限不能保证不产生费用。',placeholder:'例如 qwen-plus / qwen-turbo',hint:'从百炼控制台复制模型名称（如 qwen-plus）；不要填 API Key 或中文名。'},
 deepseek:{id:'deepseek',short:'DeepSeek',name:'DeepSeek',vendor:'DeepSeek',console:'https://platform.deepseek.com/',consoleLabel:'打开 DeepSeek 开放平台',docs:'https://api-docs.deepseek.com/zh-cn/',docsLabel:'API 文档',notice:'请在 DeepSeek 开放平台查看余额与计费设置。本机次数上限不能保证不产生费用。',placeholder:'例如 deepseek-chat',hint:'常用模型名 deepseek-chat 或 deepseek-reasoner；不要填 API Key。'},
 doubao:{id:'doubao',short:'豆包',name:'豆包 · 火山方舟',vendor:'火山方舟',console:'https://console.volcengine.com/ark/',consoleLabel:'打开火山方舟控制台',docs:'https://docs.volcengine.com/docs/ark/free-tokens-only-mode?lang=zh',docsLabel:'安心体验说明',notice:'先在火山方舟首次开通模型时选择“安心体验模式”。免费资格、额度和有效范围以控制台为准；本机次数上限不能保证不产生费用。',placeholder:'粘贴方舟控制台给出的模型 ID 或 ep-…',hint:'从模型调用示例复制 model 字段（doubao-… 或 ep-…）；不要填 apikey-… 或模型中文名。'}
};
let draftProvider='qwen',draftConfig={model:'',dailyLimit:'',enabled:false};
const providerMeta=id=>AI_PROVIDERS[id]||AI_PROVIDERS.qwen;
const providerShort=()=>providerMeta(ai.provider).short;
function aiConfigLabel(){const s=providerShort();return ai.configIssue?'配置需修正':ai.verified?s+'已连接':ai.ready?s+'已配置':'配置模型'}
function aiStatusNote(){const s=providerShort();return ai.configIssue?'模型 ID 需修正':ai.verified?s+'已连接':ai.ready?s+'已配置':'模型待配置'}

let state={version:2,agents:[],docs:[],audit:[],chats:{},account:null};
let account=null,boardListings=[],boardBusy=false,boardNeedsRefresh=true,dmListingId=null,boardQuestion='',boardAnswer=null,boardAsking=false,boardPublishOpen=false;
let ai={ready:false,hasKey:false,model:'',dailyLimit:50,usedToday:0},busy=false,pendingChat=null,chatError='';
async function api(path,body){
 const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Campus-Client':'1'}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json()}catch{throw new Error('当前运行的仍是旧版预览，请关闭旧预览并重新启动。')}
 if(!response.ok)throw new Error(data.error||'请求失败，请重试。');return data;
}
function applyResult(data){if(data.state)state=data.state;if(data.ai)ai=data.ai;if(data.profile)currentProfile=data.profile;if('account' in data)account=data.account;else if(data.state&&'account' in data.state)account=data.state.account}
async function perform(body,message){if(busy)return;busy=true;try{const data=await api('action',body);applyResult(data);closeModal();render();toast(message)}catch(e){toast(e.message)}finally{busy=false;updateBusy()}}
function updateBusy(){document.querySelectorAll('#profile,#chat-agent,#chat-form button,#chat-form textarea,.suggestions button,#places-form input,#places-form select,#places-form button').forEach(el=>el.disabled=busy||(el.closest('#places-form')&&el.tagName==='BUTTON'&&!(placesUi.provider==='local'?ai.places?.localReady:ai.places?.ready)))}
async function switchProfile(value){if(busy)return;try{chatPrefill='';applyResult(await api('session',{profile:value}));resetPlaces();closeModal();render();toast('已切换至'+me().label)}catch(e){toast(e.message);render()}}
async function boot(){try{applyResult(await api('state'));if(!location.hash||location.hash==='#')history.replaceState(null,'','#'+homePage());render()}catch(e){document.getElementById('app').innerHTML='<main class="panel lock-page"><h1>请启动第二步本地服务</h1><p>'+(/Mac/i.test(navigator.platform||navigator.userAgent)?'在终端进入项目文件夹运行 <code>node server.cjs</code>，或双击“打开原型.command”':'双击项目文件夹内的“打开原型.cmd”')+'，再访问 '+esc(location.origin)+'。</p><p>'+esc(e.message)+'</p></main>'}}

let currentProfile='student',category='全部',query='',reviewTab='docs',teamTab='agents',chatPrefill='';
const me=()=>profiles[currentProfile];
const isStudent=()=>me().role==='student';
const homePage=()=>isStudent()?'board':'gallery';
const teamProfile={name:'校集团队',lens:'校园助手',blurb:'统一维护生活、办事和学习助手，把能用的资料交给同学。',home:'校集团队负责生活、办事和学习。',heroEye:'校集团队',heroTitle:'生活、办事和学习，在同一工作台',heroBody:'已上线的助手可以直接打开。草稿集中在这里提交审核。',emptyAgents:'还没有助手。创建一个，覆盖校园生活、办事或学习。',emptyDocs:'暂时没有关联资料。贡献一份，审核通过后会出现在助手里。',emptySearch:'没有找到相关助手。草稿在团队工作台，也可以换个分类。',uploadSub:'交给生活、办事或学习助手。管理员审核通过后，同学才能问到。',uploadPh:'例如：学生证补办材料，或课程复习方法（示例）',contribute:'贡献资料',prompts:[{id:'life',q:'图书馆几点开放？'},{id:'affairs',q:'学生证怎么补办？'},{id:'study',q:'课程复习怎么安排？'}]};
const ours=a=>a&&(a.team==='t1'||a.team==='t2');
const teamPack=()=>me().role==='team'?teamProfile:null;
const teamName=id=>id?'校集团队':'';
const productCrumb=()=>me().role==='team'?teamProfile.name:'校集';
const statusLabel={draft:'草稿',pending:'待审核',published:'已上线',approved:'已入库',rejected:'已驳回',offline:'已下架'};
const badge=s=>`<span class="tag ${['published','approved'].includes(s)?'green':s==='pending'?'amber':s==='rejected'?'red':''}">${statusLabel[s]||s}</span>`;
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3500)}
function route(){const parts=location.hash.slice(1).split('/');if(parts[0]==='collect'){history.replaceState(null,'','#upload');parts[0]='upload'}return {page:['gallery','board','chat','upload','team','admin'].includes(parts[0])?parts[0]:homePage(),id:parts[1]||'affairs'}}
function go(page,id){const hash='#'+page+(id?'/'+id:'');if(location.hash===hash)render();else location.hash=hash}
const titles={gallery:'找助手',board:'互助通达',chat:'与助手对话',upload:'资料贡献',team:'团队工作台',admin:'审核管理'};
function profileSelect(){return `<select id="profile" aria-label="切换演示身份">${Object.entries(profiles).map(([k,p])=>`<option value="${k}" ${currentProfile===k?'selected':''}>${p.label}</option>`).join('')}</select>`}
function accountControls(){return account?`<span class="tag blue">学号 ${esc(account.studentId)}</span><button class="btn text small" data-action="auth-logout">退出</button>`:`<button class="btn small" data-action="auth-open">学号登录</button>`}
function configButton(){return `<button class="btn small" data-action="configure">${icon('spark')}${aiConfigLabel()}</button>`}
function navLinks(page){
 const items=[['board','board','互助通达',false],['chat','chat','与助手对话',false],['gallery','grid','找助手',true],['upload','upload','资料贡献',true]];
 if(!isStudent())items.push(['team','team','团队工作台',false]);
 if(me().role==='admin')items.push(['admin','shield','审核管理',false]);
 return items.map(([p,i,l,quiet])=>{
  const extra=isStudent()&&quiet?' quiet'+(p==='gallery'?' nav-section':''):'';
  return `<a class="nav-link${page===p?' active':''}${extra}" href="#${p}" ${page===p?'aria-current="page"':''}>${icon(i)}${l}</a>`;
 }).join('');
}
function sidebarFoot(){
 if(me().role==='admin')return `<div class="sidebar-bottom"><button data-action="reset">重置演示数据</button></div>`;
 if(isStudent())return `<div class="sidebar-bottom"><p class="sidebar-note">问同学，或问校园助手。</p></div>`;
 return '';
}
function identityBar(){
 const avatar=`<span class="avatar" aria-hidden="true">${esc(me().name[0])}</span>`;
 if(isStudent())return `<div class="identity student-identity">${accountControls()}<details class="more-menu"><summary>更多</summary><div class="more-panel"><p class="more-label">演示身份</p>${profileSelect()}${configButton()}</div></details>${avatar}</div>`;
 return `<div class="identity">${accountControls()}${configButton()}<label for="profile">演示身份</label>${profileSelect()}${avatar}</div>`;
}
function shell(content){
 const r=route();
 return `<div class="shell"><aside class="sidebar"><a class="brand" href="#${homePage()}"><span class="brand-mark">集</span><div><strong>校集</strong><small>同学互助</small></div></a><div class="nav-title">${isStudent()?'常用':'导航'}</div><nav class="nav" aria-label="主导航">${navLinks(r.page)}</nav>${sidebarFoot()}</aside><div class="main"><header class="topbar"><div class="breadcrumb">${productCrumb()} <span>/ ${titles[r.page]}</span></div>${identityBar()}</header><main class="content" id="main-content">${content}</main></div></div>`;
}
function heading(eye,title,sub,action=''){return `<div class="page-heading"><div>${eye?`<div class="eyebrow">${eye}</div>`:''}<h1>${title}</h1><p>${sub}</p></div>${action}</div>`}
function galleryHero(){const pack=teamPack();if(!pack)return `<section class="hero"><div class="hero-main"><div class="eyebrow">本周推荐 · 学校事务</div><h2>办事前，先问问校园办事助手</h2><p>准备哪些材料、下一步怎么做？<br>从有来源的资料中，找到清楚的答案。</p><button class="btn" data-action="chat" data-id="affairs">开始对话 ${icon('arrow')}</button></div><div class="hero-aside"><div><span class="hero-number">01</span><div>校集团队<small>每个助手都有维护团队</small></div></div><div><span class="hero-number">02</span><div>审核入库<small>资料通过审核后才可使用</small></div></div><div><span class="hero-number">03</span><div>来源可查<small>让每份回答有据可循</small></div></div></section>`;return `<section class="hero"><div class="hero-main"><div class="eyebrow">${esc(pack.heroEye)}</div><h2>${esc(pack.heroTitle)}</h2><p>${esc(pack.heroBody)}</p><button class="btn" data-action="nav" data-page="team">进入团队工作台 ${icon('arrow')}</button></div><div class="hero-aside"><div><span class="hero-number">01</span><div>生活 · 办事 · 学习<small>${esc(pack.name)}统一维护</small></div></div><div><span class="hero-number">02</span><div>审核入库<small>资料通过审核后才可使用</small></div></div><div><span class="hero-number">03</span><div>来源可查<small>让每份回答有据可循</small></div></div></section>`}
function gallery(){const pack=teamPack();const items=state.agents.filter(a=>a.status==='published'&&(category==='全部'||a.category===category)&&(!query||[a.name,a.description,teamName(a.team)].some(v=>v.includes(query))));return `${heading('','你的校园问题，从这里开始',pack?`${esc(pack.home)} 也可以先挑一个已上线助手。`:'挑一个校园助手，直接问就行。',`<button class="btn" data-action="nav" data-page="upload">${icon('plus')}${pack?esc(pack.contribute):'贡献一份资料'}</button>`)}${galleryHero()}<div class="toolbar"><div class="chips" role="group" aria-label="助手分类">${['全部','校园生活','学习资料','学校事务'].map(c=>`<button class="chip ${category===c?'active':''}" data-action="category" data-value="${c}">${c==='全部'?'全部助手':c}</button>`).join('')}</div><label class="search">${icon('search')}<input id="search" aria-label="搜索助手或团队" placeholder="搜索助手或团队" value="${esc(query)}"></label></div><div class="section-heading"><h2>发现校园助手</h2><span>${items.length} 个已上线助手</span></div><div class="cards">${items.map(a=>`<article class="agent-card"><div class="card-top"><div class="agent-icon ${a.color}">${icon(a.icon)}</div><span class="tag green">已审核上线</span></div><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p><div><span class="tag">${a.category}</span></div><div class="team-line">${icon('team')}${teamName(a.team)}</div><div class="card-foot"><small>${state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length} 份已审核资料</small><button class="btn text small" data-action="chat" data-id="${a.id}">开始对话 ${icon('arrow')}</button></div></article>`).join('')}</div>${!items.length?`<div class="empty"><p>${pack?esc(pack.emptySearch):'没有找到相关助手，试试其他分类或关键词。'}</p></div>`:''}<div class="bottom-note"><span>${icon('shield')} 回答会标出来源</span><span>${isStudent()?'公开资料会注明出处':'公开资料与演示资料均有标注 · '+aiStatusNote()}</span></div>`}
function clockInputValue(ms){
 try{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
 }catch(e){
  const d=new Date(ms+8*3600000),p=n=>String(n).padStart(2,'0');
  return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+'T'+p(d.getUTCHours())+':'+p(d.getUTCMinutes());
 }
}
function listingHeadline(l){return l.display||[l.type,l.title].filter(Boolean).join(' · ')||l.type||'同学登记'}
function listingWhen(l){return l.windowText||(l.longTerm?'长期':(l.expiresAt?'有效至 '+String(l.expiresAt).slice(0,16).replace('T',' '):''))}
function roleTag(role){return role==='offer'?'我来帮忙':role==='need'?'我需要':''}
function boardPage(){
 const logged=!!account;
 const mine=(Array.isArray(boardListings)?boardListings:[]).filter(l=>logged&&l.ownerStudentId===account.studentId);
 const answer=boardAnswer;
 const suggestions=['今天下午有没有人代取快递？','谁能接一下陪诊？','有没有人出闲置显示器？'];
 const startAt=clockInputValue(Date.now()),endAt=clockInputValue(Date.now()+2*3600000);
 return heading('','互助通达','同学之间的事，直接问。代取、陪诊、出闲置、接摄影，或其他你想写的互助，都可以。')+
 '<section class="panel board-ask"><h2>想找同学，或看看谁在接活？直接问</h2><p class="hint">互助通达按意思去对同学登记，不限固定类别。只会用正处在生效时段里的信息。「接……」表示对方来帮忙。</p>'+
 '<form id="board-ask-form"><textarea name="question" aria-label="向互助通达提问" required maxlength="500" rows="3" placeholder="例如：今天下午有没有人代取快递？谁能接一下陪诊？有没有人出闲置显示器？">'+esc(boardQuestion)+'</textarea>'+
 '<div class="board-ask-bar"><div class="board-chips">'+suggestions.map(s=>'<button type="button" data-action="board-suggest" data-value="'+esc(s)+'">'+esc(s)+'</button>').join('')+'</div>'+
 '<button class="btn primary" type="submit"'+(boardAsking?' disabled':'')+'>'+(boardAsking?'正在查找…':'提问')+'</button></div></form>'+
 (answer?'<div class="bubble rich board-answer" id="board-answer">'+formatBubble(answer.text)+'</div>':'<div class="empty" style="margin-top:16px"><p>还没提问。想找人帮忙，或看看谁在接活，直接写在上面。</p></div>')+
 '</section>'+
 '<details class="panel board-publish" id="board-publish"'+(boardPublishOpen?' open':'')+'><summary>登记一条互助信息</summary>'+
 '<p class="small muted">登记你能提供的帮助，或你的需求。类型自己写。「接……」表示你来做这件事。发布需要学号登录。</p>'+
 (logged
  ?('<p class="muted small" style="margin:12px 0">当前学号：'+esc(account.studentId)+(account.displayName?' · '+esc(account.displayName):'')+'</p>'+
    '<form id="board-form"><div class="field"><label for="board-type">类型 <span class="required">*</span></label><input id="board-type" name="type" type="text" required maxlength="30" placeholder="自己写，例如：代取快递、陪诊、出闲置、接摄影"></div>'+
    '<fieldset class="alarm-window"><legend>'+icon('clock')+' 生效时段</legend><label class="check alarm-long"><input id="board-long" name="longTerm" type="checkbox"><span>长期有效，直到我下架</span></label><div class="alarm-range" id="board-range"><div class="alarm-face" aria-hidden="true"></div><div class="field"><label for="board-start">开始（北京时间）</label><input id="board-start" name="windowStart" type="datetime-local" required value="'+esc(startAt)+'"></div><div class="field alarm-end"><label for="board-end">结束（北京时间）</label><input id="board-end" name="windowEnd" type="datetime-local" required value="'+esc(endAt)+'"></div><p class="small muted alarm-note">像设闹钟一样，写清这段互助从何时到何时有效。超过 90 天请改选长期。</p></div></fieldset>'+
    '<div class="field"><label for="board-desc">说明 <span class="required">*</span></label><textarea id="board-desc" name="description" required maxlength="800" rows="4" placeholder="写清你能做什么，或你需要什么。例如：接代取，南门快递。不要写敏感隐私。"></textarea></div><div class="field"><label for="board-contact">联系方式（自愿公开） <span class="required">*</span></label><input id="board-contact" name="contact" required maxlength="80" placeholder="例如 QQ / 微信 / 手机号"></div><button class="btn primary" type="submit">'+icon('plus')+'提交登记</button></form>'+
    '<h3 style="margin-top:8px">我的有效登记 <span class="count">'+mine.length+'</span></h3>'+
    (mine.length?mine.map(l=>'<article class="record"><div><p><span class="tag blue">'+esc(l.type)+'</span> '+(roleTag(l.role)?'<span class="tag">'+esc(roleTag(l.role))+'</span> ':'')+esc(listingHeadline(l))+'</p><small>'+esc(l.description)+'</small><small>'+esc(listingWhen(l))+'</small><div class="actions" style="margin-top:8px"><button class="btn danger small" data-action="board-takedown" data-id="'+esc(l.id)+'">下架</button></div></div></article>').join(''):'<p class="small muted">你还没有正在生效的登记。</p>'))
  :('<form id="auth-form"><div class="field"><label for="auth-id">学号</label><input id="auth-id" name="studentId" required pattern="\\d{8}" maxlength="8" minlength="8" inputmode="numeric" placeholder="8 位数字学号"></div><div class="field"><label for="auth-name">昵称（注册时可选）</label><input id="auth-name" name="displayName" maxlength="20" placeholder="例如：小陈"></div><div class="field"><label for="auth-pass">密码</label><input id="auth-pass" name="password" type="password" required minlength="6" maxlength="72" autocomplete="new-password"></div><div class="actions"><button class="btn primary" type="submit" data-auth="login">登录</button><button class="btn" type="submit" data-auth="register">注册学号账号</button></div><p class="small muted" style="margin-top:12px">提问不用登录。登记和开聊需要 8 位学号。</p></form>'))+
 '</details>';
}
function empty(text){return `<div class="empty">${icon('file')}<p>${text}</p></div>`}
function guard(kind){if(kind==='admin')return `<div class="panel lock-page"><div class="agent-icon">${icon('lock')}</div><h1>管理员审核空间</h1><p>审核管理仅对管理员演示身份开放。<br>此处为演示身份切换，不是真实登录认证。</p><button class="btn primary" data-action="switch" data-value="admin">切换为管理员</button></div>`;return `<div class="panel lock-page"><div class="agent-icon">${icon('lock')}</div><h1>团队创作空间</h1><p>请切换为校集团队成员，统一管理生活、办事和学习助手。<br>此处为演示身份切换，不是真实登录认证。</p><button class="btn primary" data-action="switch" data-value="team">切换为校集团队成员</button></div>`}
function sourceFields(d={},prefix='source-meta'){return `<div class="field"><label for="${prefix}-url">原文链接（可选）</label><input id="${prefix}-url" name="sourceUrl" type="url" maxlength="2000" value="${esc(d.sourceUrl||'')}" placeholder="粘贴抖音、小红书或官网原文链接"><small>仅保存链接，不会自动读取网页。内容摘要仍需填写并审核。</small></div><div class="form-grid"><div class="field"><label for="${prefix}-published">原文发布时间</label><input id="${prefix}-published" name="publishedAt" type="date" value="${esc(d.publishedAt||'')}"><small>不知道可留空，不要用今天代替。</small></div><div class="field"><label for="${prefix}-collected">采集日期</label><input id="${prefix}-collected" name="collectedAt" type="date" value="${esc(d.collectedAt||'')}"></div></div><div class="field"><label for="${prefix}-kind">内容性质（需审核）</label><select id="${prefix}-kind" name="sourceKind">${Object.entries({unknown:'未确认',official:'官方通知',experience:'个人体验',merchant:'商家宣传'}).map(([k,v])=>`<option value="${k}" ${(d.sourceKind||'unknown')===k?'selected':''}>${v}</option>`).join('')}</select></div>`}
function sourceDetails(d){return '<p class="small muted">原文发布：'+esc(d.publishedAt||'未填写')+' · 采集：'+esc(d.collectedAt||'未填写')+' · 入库/提交：'+esc(d.date)+'</p><p class="small muted">内容性质：'+esc(({official:'官方通知（提交者标注）',experience:'个人体验',merchant:'商家宣传',unknown:'未确认'})[d.sourceKind]||'未确认')+'</p>'}
function upload(){const mine=state.docs.filter(d=>d.owner===currentProfile).slice().reverse();const agents=state.agents.filter(a=>a.status==='published');const pack=teamPack();return `${heading('','让你的资料，帮助更多同学',pack?pack.uploadSub:'提交一份有用的知识，由管理员审核后加入对应助手。')}<div class="two-col"><section class="panel"><h2>提交资料</h2><p class="muted small" style="margin:7px 0 23px">仅使用公开或虚构内容，不要提交真实个人信息。</p><form id="upload-form"><div class="field"><label for="doc-title">资料标题 <span class="required">*</span></label><input id="doc-title" name="title" required maxlength="80" placeholder="${pack?esc(pack.uploadPh):'例如：图书馆借阅指南（示例）'}"></div><div class="form-grid"><div class="field"><label for="doc-agent">提交给哪个助手 <span class="required">*</span></label><select id="doc-agent" name="agent" required>${agents.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>${pack?'<small>生活、办事和学习助手都可以提交。</small>':''}</div><div class="field"><label for="doc-source">资料来源 <span class="required">*</span></label><input id="doc-source" name="source" required maxlength="150" placeholder="例如：学校公开通知 / 虚构示例"></div></div>${sourceFields()}<div class="field"><label for="doc-file">选择文件（可选）</label><div class="dropzone">${icon('upload')}<strong>选择本地文件，或直接填写下方文字</strong><small>TXT / MD 可读取文字；PDF / DOCX 请另填内容摘要。最大 2 MB。</small><input id="doc-file" type="file" accept=".txt,.md,.pdf,.docx"></div><small id="file-note">只会保存文件名和文字，不保存原文件。</small></div><div class="field"><label for="doc-content">资料正文 / 内容摘要 <span class="required">*</span></label><textarea id="doc-content" name="content" required maxlength="20000" rows="6" placeholder="填写需要审核的文字内容。选择 TXT / MD 文件后，会自动填入这里。"></textarea><small>当前只处理文字，不会解析 PDF 或 Word。</small></div><label class="check"><input type="checkbox" name="consent" required><span>我确认资料可公开分享，不含敏感信息；审核后允许把相关片段发送至云端 AI。</span></label><button class="btn primary" type="submit">${icon('upload')}提交审核</button></form></section><aside class="stack"><section class="panel"><h2>资料如何成为知识？</h2><ol class="steps"><li><span class="step-no">1</span><div><strong>提交资料</strong><p>选择助手，补充内容与来源。</p></div></li><li><span class="step-no">2</span><div><strong>管理员审核</strong><p>检查内容、来源与分享范围。</p></div></li><li><span class="step-no">3</span><div><strong>通过后入库</strong><p>在本地建立检索片段，供助手查找与引用。</p></div></li></ol></section><section class="panel"><h2>我的提交 <span class="count">${mine.length}</span></h2>${mine.length?mine.map(d=>`<div class="record"><div><p>${esc(d.title)}</p><small>${d.date} · ${esc(state.agents.find(a=>a.id===d.agent)?.name||'助手')}</small>${d.reason?`<div class="reason">审核意见：${esc(d.reason)}</div>`:''}<button class="btn text small" data-action="view-doc" data-id="${d.id}">查看内容</button>${d.status==='rejected'?`<button class="btn text small" data-action="edit-doc" data-id="${d.id}">修改并重新提交</button>`:''}</div>${badge(d.status)}</div>`).join(''):empty('还没有提交过资料。')}</section></aside></div>`}
function teamQuick(pack,agents){
 const published=agents.filter(a=>a.status==='published');
 const pending=agents.filter(a=>a.status!=='published');
 const open=published.map(a=>`<button class="btn small" data-action="chat" data-id="${a.id}">打开${esc(a.name)}</button>`).join('');
 const drafts=pending.length?`<button class="btn small" data-action="team-tab" data-value="agents">待处理草稿 ${pending.length}</button>`:'';
 const prompts=(pack.prompts||[]).filter(p=>published.some(a=>a.id===p.id)).map(p=>`<button class="btn small" data-action="prefill-chat" data-id="${esc(p.id)}" data-value="${esc(p.q)}">${esc(p.q)}</button>`).join('');
 return `<div class="actions team-quick">${open}${drafts}${prompts}<button class="btn primary small" data-action="nav" data-page="upload">${icon('plus')}${esc(pack.contribute)}</button></div>`;
}
function team(){
 if(me().role!=='team')return guard('team');
 const pack=teamPack();
 const agents=state.agents.filter(ours);
 const docs=state.docs.filter(d=>agents.some(a=>a.id===d.agent));
 return `${heading('',pack.name,pack.blurb,`<button class="btn primary" data-action="new-agent">${icon('plus')}创建 Agent</button>`)}<div class="stats"><div class="stat"><span>${esc(pack.lens)}助手</span><strong>${agents.length}</strong></div><div class="stat"><span>已上线</span><strong>${agents.filter(a=>a.status==='published').length}</strong></div><div class="stat"><span>已审核资料</span><strong>${docs.filter(d=>d.status==='approved').length}</strong></div></div>${teamQuick(pack,agents)}<section class="panel"><div class="review-tabs" role="group" aria-label="团队内容"><button class="${teamTab==='agents'?'active':''}" data-action="team-tab" data-value="agents">团队 Agent</button><button class="${teamTab==='docs'?'active':''}" data-action="team-tab" data-value="docs">关联资料</button></div>${teamTab==='agents'?(agents.length?agents.map(a=>`<article class="workspace-record"><div class="agent-icon ${a.color}">${icon(a.icon)}</div><div class="info"><h3>${esc(a.name)} ${badge(a.status)}</h3><p>${esc(a.description)}</p><small class="muted">${a.category} · ${state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length} 份已审核资料</small>${a.reason?`<div class="reason">审核意见：${esc(a.reason)}</div>`:''}</div><div class="actions">${a.status==='published'?`<button class="btn small" data-action="chat" data-id="${a.id}">打开助手</button>`:''}${a.status!=='pending'?`<button class="btn small" data-action="edit-agent" data-id="${a.id}">编辑</button>`:'<span class="muted small">等待管理员审核</span>'}${['draft','rejected','offline'].includes(a.status)?`<button class="btn primary small" data-action="submit-agent" data-id="${a.id}">提交审核</button>`:''}</div></article>`).join(''):empty(pack.emptyAgents)):(docs.length?'<div class="resource-list">'+docs.map(d=>`<div class="record"><div><p>${esc(d.title)}</p><small>${esc(state.agents.find(a=>a.id===d.agent)?.name)} · ${esc(d.source)}</small><button class="btn text small" data-action="view-doc" data-id="${d.id}">查看资料</button></div>${badge(d.status)}</div>`).join(''):empty(pack.emptyDocs))}</section>`;
}
function chatBanner(){
 if(ai.configIssue)return esc(ai.configIssue);
 if(!ai.ready)return '还没接上云端模型，也可以查已有资料和周边地点。';
 return (ai.verified?providerShort()+'已接上。':providerShort()+'已配置。')+'直接提问就行，有依据时会标出来源。';
}
function chatStatusBanner(){
 if(isStudent()||(me().role==='team'&&!ai.configIssue))return '';
 if(me().role==='team')return '<div class="banner">'+esc(ai.configIssue)+'</div>';
 return '<div class="banner">'+icon('shield')+chatBanner()+'</div>';
}
function chatAside(a,docs){
 if(isStudent())return '';
 const pack=teamPack();
 const list=docs.length?docs.map(d=>'<div class="resource"><button class="btn text" data-action="view-doc" data-id="'+d.id+'">'+esc(d.title)+'</button><small>'+esc(d.source)+' · '+(d.chunkCount||1)+' 个片段</small><small>入库于 '+d.date+'</small></div>').join(''):empty('暂无已审核资料。');
 const notice=pack?'团队资料在本机。缺了就贡献一份，审核通过后才会被引用。':'知识库和检索保存在本机。正常问题均可由云端模型回答；通用知识与建议不代表学校规定。具体校园事实缺少资料时，会明确说明无法确认。';
 return '<aside class="stack chat-aside"><section class="panel"><div class="aside-title">'+icon('book')+' 已审核知识库</div>'+list+'</section><section class="panel"><div class="aside-title">回答规则</div><p class="small muted">'+esc(a.rules)+'</p><div class="inline-notice">'+notice+'</div><button class="btn" data-action="nav" data-page="upload">'+icon('plus')+(pack?esc(pack.contribute):'贡献资料')+'</button></section></aside>';
}
function chat(){
 const id=route().id,prefill=chatPrefill;chatPrefill='';
 const a=state.agents.find(a=>a.id===id&&a.status==='published');
 if(!a)return heading('','助手暂不可用','回到找助手，选一个已经上线的。');
 const docs=state.docs.filter(d=>d.agent===id&&d.status==='approved'),messages=state.chats[currentProfile+':'+id]||[];
 const suggestions=id==='life'?['通达附近有什么吃的？','学校附近哪里有快递点？','通达两公里内哪里洗衣？','通达周边周末去哪玩？','图书馆几点开放？']:id==='study'?['课程复习怎么安排？']:id==='affairs'?['学生证怎么补办？','需要准备哪些材料？']:['有哪些相关资料？'];
 const modeLabel={local:'本地引导',ai_general:'一般建议 · 不是学校规定',ai:'已附来源，请核对',retrieval:'资料摘录',format_fallback:'按已有资料整理',no_evidence:'资料不足'};
 const askPlaceholder=id==='study'?'输入具体问题，例如：课程复习怎么安排？':id==='life'?'输入具体问题，例如：图书馆几点开放？':'输入具体问题，例如：学生证补办需要哪些材料？';
 return heading('',esc(a.name),'直接问就行。有资料时会标出来源。')+
 chatStatusBanner()+
 (id==='life'?cityDiscovery():'')+'<div class="chat-layout'+(isStudent()?' solo':'')+'"><section class="chat-box"><div class="chat-head"><div class="agent-icon '+a.color+'">'+icon(a.icon)+'</div><div><h2>'+esc(a.name)+'</h2>'+(isStudent()?'':'<small>'+docs.length+' 份已审核资料</small>')+'</div><select id="chat-agent" aria-label="切换聊天助手">'+state.agents.filter(x=>x.status==='published').map(x=>'<option value="'+x.id+'" '+(x.id===id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>'+
 '<div class="messages" id="messages" role="log" aria-label="对话记录"><div class="message"><span class="mini-avatar">集</span><div class="bubble">你好！可以问知识问题、制定学习计划，或咨询校园事务。有已审核资料时会附来源；通用回答不代表学校正式规定。请核对引用来源及原文日期；每条问题独立处理。</div></div>'+
 messages.map(m=>'<div class="message '+(m.role==='user'?'user':'')+'"><span class="mini-avatar">'+(m.role==='user'?'我':'集')+'</span><div class="bubble'+(m.role==='user'?'':' rich')+'">'+(m.role==='user'?'':'<small>'+esc(modeLabel[m.mode]||'历史回答')+'</small>')+(m.role==='user'?esc(m.text):formatBubble(m.text))+(isStudent()?(m.sources||[]).filter(s=>s.sourceType==='campus_board'):(m.sources||[])).map(sourceMarkup).join('')+'</div></div>').join('')+
 (pendingChat?.aid===id?'<div class="message user"><div class="bubble">'+esc(pendingChat.question)+'</div></div><div class="message"><div class="bubble" role="status">'+(ai.ready?'正在查找并组织回答…':'正在查找已有资料…')+'</div></div>':'')+'</div>'+
 '<div class="suggestions">'+suggestions.map(s=>'<button data-action="suggest" data-value="'+s+'">'+s+'</button>').join('')+'</div><div class="composer">'+(chatError?'<div class="reason" role="alert">'+esc(chatError)+'（没有生成成功回答，可重试）</div>':'')+
 '<form id="chat-form"><textarea name="question" aria-label="输入问题" placeholder="'+askPlaceholder+'" rows="1" required maxlength="500">'+esc(prefill)+'</textarea><button class="btn primary" type="submit">发送 '+icon('arrow')+'</button></form><p>'+(me().role==='admin'?'Enter 发送，Shift + Enter 换行。':'')+'今日云端调用 '+(ai.usedToday||0)+' / '+(ai.dailyLimit||50)+' 次（本机限制）。</p></div></section>'+
 chatAside(a,docs)+'</div>';
}
function admin(){if(me().role!=='admin')return guard('admin');const docs=state.docs.filter(d=>d.status==='pending');const agents=state.agents.filter(a=>a.status==='pending');const published=[...state.docs.filter(d=>d.status==='approved'||d.status==='offline').map(d=>({kind:'doc',data:d})),...state.agents.filter(a=>a.status==='published'||a.status==='offline').map(a=>({kind:'agent',data:a}))];return `${heading('','审核管理','查看提交内容与来源，决定哪些知识可以进入校园助手。')}<div class="stats"><div class="stat"><span>待审核资料</span><strong>${docs.length}</strong></div><div class="stat"><span>待上线 Agent</span><strong>${agents.length}</strong></div><div class="stat"><span>本次审核记录</span><strong>${state.audit.length}</strong></div></div><div class="two-col"><section class="panel"><div class="review-tabs" role="group" aria-label="审核类型"><button data-action="review-tab" data-value="docs" class="${reviewTab==='docs'?'active':''}">资料 <span class="count">${docs.length}</span></button><button data-action="review-tab" data-value="agents" class="${reviewTab==='agents'?'active':''}">Agent <span class="count">${agents.length}</span></button><button data-action="review-tab" data-value="published" class="${reviewTab==='published'?'active':''}">已发布</button></div>${reviewTab==='docs'?(docs.length?docs.map(d=>`<article class="review-card"><div class="review-card-head"><h3>${esc(d.title)}</h3>${badge(d.status)}</div><p>提交人：${profiles[d.owner]?.name||'演示用户'} · ${d.date}</p><p>目标助手：${esc(state.agents.find(a=>a.id===d.agent)?.name||'已不可用')}</p><p>来源：${esc(d.source)}</p><div class="actions"><button class="btn small" data-action="view-doc" data-id="${d.id}">查看内容并审核 ${icon('arrow')}</button></div></article>`).join(''):empty('资料已处理完，暂无待审核内容。')):reviewTab==='agents'?(agents.length?agents.map(a=>`<article class="review-card"><div class="review-card-head"><h3>${esc(a.name)}</h3>${badge(a.status)}</div><p>${teamName(a.team)} · ${a.category}</p><p>${esc(a.description)}</p><div class="actions"><button class="btn small" data-action="review-agent" data-id="${a.id}">查看配置并审核 ${icon('arrow')}</button></div></article>`).join(''):empty('暂无待审核的 Agent。')):published.map(({kind,data:d})=>`<div class="record"><div><p>${esc(d.title||d.name)}</p><small>${kind==='doc'?'资料':'Agent'} · ${statusLabel[d.status]}</small></div>${d.status==='offline'?`<button class="btn small" data-action="online" data-kind="${kind}" data-id="${d.id}">重新上架</button>`:`<button class="btn danger small" data-action="offline" data-kind="${kind}" data-id="${d.id}">下架</button>`}</div>`).join('')}</section><aside class="stack"><section class="panel"><h2>审核要点</h2><ul class="info-list"><li>内容是否适合目标助手？</li><li>来源是否清楚，是否有分享权限？</li><li>是否包含个人信息或过期内容？</li><li>驳回时说明原因，便于提交人修改。</li></ul><div class="inline-notice">这里演示的是人工审核流程，不代表已经通过真实安全审查。</div></section><section class="panel"><h2>最近操作</h2>${state.audit.length?state.audit.slice().reverse().slice(0,8).map(a=>`<div class="audit-line"><strong>${esc(a.action)}</strong> · ${esc(a.title)}<br>${esc(a.time)}</div>`).join(''):'<p class="small muted" style="margin-top:15px">操作完成后会记录在这里。</p>'}</section></aside></div>`}
async function loadBoard(){try{const data=await api('board');boardListings=data.listings||[];if('account' in data)account=data.account}catch(e){toast(e.message)}}
function openOfferModal(offers){
 const list=Array.isArray(offers)?offers.filter(o=>o&&o.listingId):[];
 if(!list.length)return;
 const one=list.length===1;
 const cards=list.map(o=>'<article class="offer-card"><p><span class="tag blue">'+esc(o.type||'互助')+'</span> '+(roleTag(o.role)?'<span class="tag">'+esc(roleTag(o.role))+'</span> ':'')+esc(listingHeadline(o))+'</p><small class="muted">'+esc(o.ownerName||'登记同学')+(listingWhen(o)?' · '+esc(listingWhen(o)):'')+'</small>'+(one?'':'<div class="modal-actions"><button class="btn primary" type="button" data-action="board-accept" data-id="'+esc(o.listingId)+'">同意开聊</button></div>')+'</article>').join('');
 const lead=one
  ?'<p>找到同学「'+esc(list[0].ownerName||'登记同学')+'」登记的「'+esc(listingHeadline(list[0]))+'」。同意后打开一对一对话；考虑一下就留在当前结果，不会建聊。</p>'
  :'<p>找到 '+list.length+' 条意思和时间对得上的登记。选一位开聊，或先考虑一下（不会建聊）。</p>';
 const actions=one
  ?'<div class="modal-actions"><button class="btn primary" type="button" data-action="board-accept" data-id="'+esc(list[0].listingId)+'">同意开聊</button><button class="btn" type="button" data-action="board-decline">考虑一下</button></div>'
  :'<div class="modal-actions"><button class="btn" type="button" data-action="board-decline">考虑一下</button></div>';
 modal(one?'要和这位同学开聊吗？':'选一位同学开聊',lead+cards+actions);
}
async function askBoard(question){
 const q=String(question||'').trim();
 if(!q||boardAsking)return;
 boardQuestion=q;boardAsking=true;render();
 try{
  const data=await api('board/ask',{question:q});
  if('account' in data)account=data.account;
  boardAnswer={text:data.text||'',offers:Array.isArray(data.offers)?data.offers:[]};
  boardAsking=false;render();
  if(boardAnswer.offers.length)openOfferModal(boardAnswer.offers);
 }catch(err){boardAsking=false;render();toast(err.message)}
}

function openDmModal(data,listingId){
 dmListingId=listingId;
 const msgs=(data.messages||[]).map(m=>'<div class="message '+(account&&m.from===account.studentId?'user':'')+'"><div class="bubble">'+esc(m.text)+'<br><small>'+esc(String(m.time||'').replace('T',' ').slice(0,16))+'</small></div></div>').join('');
 modal('与 '+esc(data.peer?.displayName||'登记同学')+' 交流','<p class="small muted" style="margin-bottom:12px">关于：'+esc(listingHeadline(data.listing||{}))+' · '+esc(listingWhen(data.listing||{}))+' · 对方联系方式：'+esc(data.listing?.contact||'未填写')+'</p><div class="messages" style="min-height:180px;max-height:280px;border:1px solid var(--line);border-radius:10px;margin-bottom:12px">'+(msgs||'<div class="empty"><p>还没有消息，打个招呼吧。</p></div>')+'</div><form id="dm-form" data-id="'+esc(listingId)+'"><div class="field"><label for="dm-text">消息</label><textarea id="dm-text" name="text" required maxlength="500" rows="3" placeholder="礼貌说明来意"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">关闭</button><button class="btn primary" type="submit">发送</button></div></form>');
}
function render(){const r=route();if(isStudent()&&(r.page==='team'||r.page==='admin')){if(location.hash!=='#board')location.hash='#board';return}document.title=`${titles[r.page]} · 校集`;document.getElementById('app').innerHTML=shell(({gallery,board:boardPage,upload,team,chat,admin}[r.page])());if(r.page==='chat'){const el=document.getElementById('messages');if(el)el.scrollTop=el.scrollHeight}if(r.page==='board'&&boardNeedsRefresh&&!boardBusy){boardBusy=true;boardNeedsRefresh=false;loadBoard().then(()=>{boardBusy=false;if(route().page==='board'){document.getElementById('app').innerHTML=shell(boardPage());updateBusy()}}).catch(()=>{boardBusy=false;boardNeedsRefresh=true})}updateBusy()}
function modal(title,body){const d=document.getElementById('modal');d.innerHTML=`<div class="modal-inner"><div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="close" aria-label="关闭弹窗" data-action="close">${icon('close')}</button></div>${body}</div>`;d.setAttribute('aria-labelledby','dialog-title');if(!d.open)d.showModal()}
function closeModal(){document.getElementById('modal').close()}
function id(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2))}

function canReadDoc(d){if(!d)return false;if(me().role==='admin'||d.owner===currentProfile)return true;const a=state.agents.find(a=>a.id===d.agent);return a&&((me().role==='team'&&ours(a))||(d.status==='approved'&&a.status==='published'))}

function publicLinks(doc){
 const urls=[...new Set(((doc.sourceUrl||'')+'\n'+doc.source+'\n'+doc.content).match(/https?:\/\/[^\s<>"'（）｜，。；]+/g)||[])].filter(u=>{try{const v=new URL(u);return ['https:','http:'].includes(v.protocol)&&!v.username&&!v.password}catch{return false}}).slice(0,6);
 return urls.length?'<div class="source-links">'+urls.map((u,i)=>'<a class="btn small" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">查看原始来源'+(urls.length>1?' '+(i+1):'')+' ↗</a>').join('')+'</div>':'';
}
function cityMapUrl(keyword){return 'https://uri.amap.com/search?'+new URLSearchParams({keyword:'南京邮电大学通达学院附近 '+(keyword.trim()||'美食'),city:'扬州',view:'list',src:'campus-agent',callnative:'0'})}

function viewDoc(id){const d=state.docs.find(d=>d.id===id);if(!canReadDoc(d))return toast('资料已不可用，或当前身份无法查看。');modal('资料详情',`<h3>${esc(d.title)}</h3><p class="small muted" style="margin:8px 0">${esc(d.source)} · ${d.date}</p><p style="margin-bottom:15px">${badge(d.status)}</p>${sourceDetails(d)}${publicLinks(d)}<div class="document-body">${esc(d.content)}</div><p class="small muted" style="margin-top:12px">附件：${esc(d.filename||'未选择文件')}（仅保留文件名与上述文字）</p>${me().role==='admin'&&d.status==='pending'?`<div class="modal-actions"><button class="btn danger" data-action="reject" data-kind="doc" data-id="${d.id}">驳回</button><button class="btn primary" data-action="approve" data-kind="doc" data-id="${d.id}">${icon('check')}通过并入库</button></div>`:''}`)}
function agentForm(agentId){if(me().role!=='team')return toast('请先切换为团队成员。');const a=agentId?state.agents.find(a=>a.id===agentId&&ours(a)):null;if(agentId&&(!a||a.status==='pending'))return toast('当前无法编辑该助手。');modal(a?'编辑 Agent':'创建 Agent',`<form id="agent-form" data-id="${a?.id||''}"><div class="field"><label for="agent-name">助手名称 *</label><input id="agent-name" name="name" required maxlength="35" value="${esc(a?.name||'')}" placeholder="例如：新生入学助手"></div><div class="field"><label for="agent-category">所属分类 *</label><select id="agent-category" name="category">${['校园生活','学习资料','学校事务'].map(c=>`<option ${a?.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label for="agent-desc">助手介绍 *</label><textarea id="agent-desc" name="description" maxlength="180" required rows="2" placeholder="这个助手能帮助同学解决什么问题？">${esc(a?.description||'')}</textarea></div><div class="field"><label for="agent-rules">回答规则 *</label><textarea id="agent-rules" name="rules" required maxlength="1500" rows="3">${esc(a?.rules||'仅根据已审核资料回答，标注来源；缺少依据时明确说明，不编造内容。')}</textarea></div><div class="inline-notice">${a?.status==='published'?'已上线助手修改后会回到草稿状态，需要重新审核上线。':'保存为草稿后，在团队工作台提交审核。'}每个助手关联独立的资料列表，上线后可通过资料贡献入口添加。</div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存草稿</button></div></form>`)}
function reviewAgent(id){if(me().role!=='admin')return;const a=state.agents.find(a=>a.id===id&&a.status==='pending');if(!a)return;modal('审核 Agent',`<h3>${esc(a.name)}</h3><p class="small muted" style="margin:8px 0 18px">${teamName(a.team)} · ${a.category}</p><div class="aside-title">助手介绍</div><div class="document-body">${esc(a.description)}</div><div class="aside-title" style="margin-top:20px">回答规则</div><div class="document-body">${esc(a.rules)}</div><div class="modal-actions"><button class="btn danger" data-action="reject" data-kind="agent" data-id="${a.id}">驳回</button><button class="btn primary" data-action="approve" data-kind="agent" data-id="${a.id}">通过并上线</button></div>`)}
function approve(kind,id){perform({action:'review',kind,id,decision:'approve'},kind==='doc'?'资料已审核入库，可用于本地检索。':'Agent 已上线。')}
function rejectForm(kind,id){if(me().role!=='admin')return;modal('填写驳回原因',`<form id="reject-form" data-kind="${kind}" data-id="${id}"><div class="field"><label for="reject-reason">审核意见 *</label><textarea id="reject-reason" name="reason" required maxlength="300" placeholder="说明需要修改的内容，例如：请补充资料来源。"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn danger" type="submit">确认驳回</button></div></form>`)}
function editDoc(id){const d=state.docs.find(d=>d.id===id&&d.owner===currentProfile&&d.status==='rejected');if(!d)return;modal('修改资料并重新提交',`<form id="edit-doc-form" data-id="${d.id}"><div class="reason">审核意见：${esc(d.reason)}</div><div class="field" style="margin-top:16px"><label for="edit-title">资料标题 *</label><input id="edit-title" name="title" required maxlength="80" value="${esc(d.title)}"></div><div class="field"><label for="edit-source">资料来源 *</label><input id="edit-source" name="source" required maxlength="150" value="${esc(d.source)}"></div>${sourceFields(d,'edit-meta')}<div class="field"><label for="edit-content">资料内容 *</label><textarea id="edit-content" name="content" required maxlength="20000">${esc(d.content)}</textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">重新提交审核</button></div></form>`)}
async function sendChat(question){
 const q=question.trim();if(!q||q.length>500||busy)return;
 if(route().id==='life'&&placesUi.useForAnswer&&Date.parse(placesUi.result?.expiresAt||'')<=Date.now()){placesUi.useForAnswer=false;placesUi.result=null;placesUi.error='地图结果已过期，已取消引用。请重新查询地点后提问。';render();document.querySelector('#chat-form textarea').value=q;return toast(placesUi.error)}
 if(ai.configIssue){chatError=ai.configIssue;render();return toast('请先修正模型 ID。')}
 const aid=route().id,profile=currentProfile;busy=true;chatError='';pendingChat={aid,question:q};render();
 try{const data=await api('chat',{agentId:aid,question:q,cloudConsent:true,...(aid==='life'&&placesUi.useForAnswer&&placesUi.result?.contextToken?{placesContext:placesUi.result.contextToken}:{})});if(currentProfile===profile)applyResult(data)}
 catch(e){chatError=e.message;try{const latest=await api('config');if(currentProfile===profile)applyResult(latest)}catch{}toast(e.message)}finally{busy=false;pendingChat=null;render();const input=document.querySelector('#chat-form textarea');if(input&&route().id===aid){if(chatError)input.value=q;input.focus()}}
}
function configDialog(keepDraft){
 if(me().role!=='admin')return modal('配置云端模型', '<p>请先切换为平台管理员，在本机填写 API Key 和模型 ID。</p><p class="inline-notice">没有账号也能先体验本地资料检索。聊天应用账号不能直接代替各平台的 API Key。</p><button class="btn primary" data-action="config-admin">切换管理员并配置</button>');
 if(!keepDraft){draftProvider=AI_PROVIDERS[ai.provider]?ai.provider:'qwen';draftConfig={model:ai.model||'',dailyLimit:String(ai.dailyLimit||50),enabled:ai.enabled===true}}
 const p=providerMeta(draftProvider);
 const chips=Object.values(AI_PROVIDERS).map(x=>`<button type="button" class="chip ${draftProvider===x.id?'active':''}" data-action="config-provider" data-value="${x.id}">${x.short}${ai.keys?.[x.id]?' <small>已存 Key</small>':''}</button>`).join('');
 const savedKeep=draftConfig.enabled&&ai.keys?.[p.id]===true;
 const consentCopy='我确认启用后，问题、助手规则及相关资料片段将发送至'+esc(p.vendor)+'；已检查免费额度与计费设置。';
 const consentField=savedKeep
  ?'<p class="small muted" id="saved-key-note">已保存密钥，继续使用无需重填</p><label class="check hidden" id="config-consent"><input name="consent" type="checkbox">'+consentCopy+'</label>'
  :'<label class="check" id="config-consent"><input name="consent" type="checkbox">'+consentCopy+'</label>';
 modal('接入'+p.name,`<form id="config-form"><input type="hidden" name="provider" value="${p.id}"><p class="small muted">密钥仅交给本机后台保存，不返回到网页。每家服务商单独保存自己的密钥，留空保留当前所选那家的密钥。</p><div class="field"><label>选择模型服务</label><div class="chips" role="group" aria-label="模型服务">${chips}</div></div><div class="inline-notice">${esc(p.notice)}</div><div class="field"><label for="model-id">模型 ID</label><input id="model-id" name="model" maxlength="150" value="${esc(draftConfig.model)}" placeholder="${esc(p.placeholder)}"><small>${esc(p.hint)}</small></div><div class="field"><label for="api-key">${esc(p.short)} API Key</label><input id="api-key" name="apiKey" type="password" autocomplete="new-password" maxlength="1000" placeholder="${ai.keys?.[p.id]?'已保存'+esc(p.short)+'密钥，留空保留':'仅在这里输入，不要发到聊天里'}"></div><div class="field"><label for="daily-limit">本机每日最多调用次数</label><input id="daily-limit" name="dailyLimit" type="number" min="1" max="500" value="${esc(draftConfig.dailyLimit||'50')}" required></div><label class="check"><input name="enabled" type="checkbox" ${draftConfig.enabled?'checked':''}>启用云端 AI（不勾选时只使用本地检索）</label>${consentField}<label class="check"><input name="clearKey" type="checkbox">清除已保存的${esc(p.short)}密钥</label><p class="small"><a href="${esc(p.console)}" target="_blank" rel="noopener noreferrer">${esc(p.consoleLabel)} ↗</a> · <a href="${esc(p.docs)}" target="_blank" rel="noopener noreferrer">${esc(p.docsLabel)} ↗</a></p><p class="small muted" style="margin-top:10px">仅保存配置，不自动发送测试请求。启用后，可在校园办事助手中提问验证。</p><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存配置</button></div><p id="config-error" class="reason hidden" role="alert"></p></form>`);
}
document.addEventListener('change',async e=>{
 if(e.target.id==='profile')return switchProfile(e.target.value);
 if(e.target.id==='chat-agent'){chatError='';go('chat',e.target.value);return}
 if(e.target.id==='doc-file'){
  const input=e.target,file=input.files[0];if(!file)return;const ext=file.name.split('.').pop().toLowerCase();
  if(file.size>2*1024*1024||!['txt','md','pdf','docx'].includes(ext)){input.value='';return toast('请选择 2 MB 以内的 TXT、MD、PDF 或 DOCX 文件。')}
  const form=input.closest('form');
  if(['txt','md'].includes(ext)){try{const content=await file.text();if(!input.isConnected||input.files[0]!==file)return;if(content.length>20000){input.value='';return toast('文字超过 20,000 字，请截取后提交。')}form.elements.content.value=content;document.getElementById('file-note').textContent='已读取文字，请检查后提交。本机只保存正文和文件名。'}catch{input.value='';toast('文件读取失败，请粘贴文字。')}}
  else document.getElementById('file-note').textContent='已选择 '+file.name+'，请在下方填写正文或摘要；本版不解析此格式。';
  if(input.isConnected&&!form.elements.title.value)form.elements.title.value=file.name.replace(/\.[^.]+$/,'').slice(0,80);
 }
});
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset;
 if(a.action==='close'||a.action==='board-decline')return closeModal();
 if(a.action==='nav')return go(a.page);
 if(a.action==='auth-open'){boardPublishOpen=true;return go('board')}
 if(a.action==='chat'){chatPrefill='';chatError='';return go('chat',a.id)}
 if(a.action==='prefill-chat'){chatPrefill=a.value||'';chatError='';return go('chat',a.id)}
 if(a.action==='category'){category=a.value;return render()}
 if(busy)return toast('请求处理中，请稍等。');
 if(a.action==='switch')return switchProfile(a.value);
 if(a.action==='configure')return configDialog(false);
if(a.action==='config-provider'){const form=document.getElementById('config-form');if(form){draftConfig={model:ai.models?.[a.value]||'',dailyLimit:form.elements.dailyLimit?.value||'50',enabled:!!form.elements.enabled?.checked}}draftProvider=a.value;return configDialog(true)}
 if(a.action==='places-config')return placesConfigDialog();
 if(a.action==='places-admin'){await switchProfile('admin');return placesConfigDialog()}
 if(a.action==='places-centers')return searchPlaces(true);
 if(a.action==='config-admin'){await switchProfile('admin');return configDialog()}
 if(a.action==='team-tab'){teamTab=a.value;return render()}
 if(a.action==='review-tab'){reviewTab=a.value;return render()}
 if(a.action==='new-agent')return agentForm();
 if(a.action==='edit-agent')return agentForm(a.id);
 if(a.action==='submit-agent')return perform({action:'submitAgent',id:a.id},'已提交审核。');
 if(a.action==='view-doc')return viewDoc(a.id);
 if(a.action==='edit-doc')return editDoc(a.id);
 if(a.action==='review-agent')return reviewAgent(a.id);
 if(a.action==='approve')return approve(a.kind,a.id);
 if(a.action==='reject')return rejectForm(a.kind,a.id);
 if(a.action==='suggest')return sendChat(a.value);
 if(a.action==='board-suggest')return askBoard(a.value);
 if(a.action==='board-reoffer'){if(boardAnswer?.offers?.length)openOfferModal(boardAnswer.offers);return}
 if(a.action==='board-offer'){openOfferModal([{listingId:a.id,title:a.title,display:a.title,ownerName:a.owner,type:a.type,windowText:a.expires}]);return}
 if(a.action==='board-accept'){
  if(!account){closeModal();boardPublishOpen=true;if(route().page!=='board')go('board');else render();return toast('请先用学号登录，再和对方开聊。')}
  try{const data=await api('board/open',{listingId:a.id});openDmModal(data.thread,a.id)}catch(err){toast(err.message)}
  return;
 }
 if(a.action==='auth-logout'){try{applyResult(await api('auth/logout',{}));toast('已退出学号账号');boardNeedsRefresh=true;render()}catch(e){toast(e.message)}return}
 if(a.action==='board-takedown'){try{applyResult(await api('board/takedown',{id:a.id}));toast('已下架');boardNeedsRefresh=true;render()}catch(e){toast(e.message)}return}
 if(a.action==='offline')return modal('确认下架',`<p>下架后不再检索该内容，相关本地聊天记录会清除。此前已经发送到云端的内容无法通过本机下架撤回。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn danger" data-action="confirm-offline" data-kind="${a.kind}" data-id="${a.id}">确认下架</button></div>`);
 if(a.action==='confirm-offline')return perform({action:'offline',kind:a.kind,id:a.id},'已下架。');
 if(a.action==='online')return modal('确认重新上架',`<p>重新上架后，资料会重新参与检索，助手会重新出现在广场。已经清除的本地聊天记录不会自动恢复。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn primary" data-action="confirm-online" data-kind="${a.kind}" data-id="${a.id}">确认重新上架</button></div>`);
 if(a.action==='confirm-online')return perform({action:'online',kind:a.kind,id:a.id},'已重新上架。');
 if(a.action==='reset'){
  if(me().role!=='admin')return toast('请切换管理员后重置本机演示数据。');
  return modal('重置演示数据','<p>会恢复初始虚构资料并清除本机新增内容。API 配置与今日调用计数保留。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn danger" data-action="confirm-reset">确认重置</button></div>');
 }
 if(a.action==='confirm-reset'){await perform({action:'reset'},'已恢复初始资料。');go('gallery')}
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['upload-form','agent-form','reject-form','edit-doc-form','chat-form','config-form','places-form','places-config-form','auth-form','board-form','board-ask-form','dm-form'].includes(f.id))return;e.preventDefault();if(busy&&!['auth-form','board-form','board-ask-form','dm-form'].includes(f.id))return;
 const fd=new FormData(f),get=n=>String(fd.get(n)||'').trim();
 if(f.id==='chat-form')return sendChat(get('question'));
 if(f.id==='board-ask-form')return askBoard(get('question'));
 if(f.id==='auth-form'){
  const mode=e.submitter?.dataset?.auth||'login';
  try{applyResult(await api('auth/'+mode,{studentId:get('studentId'),password:get('password'),displayName:get('displayName')}));toast(mode==='register'?'注册成功，已登录':'登录成功');boardNeedsRefresh=true;render()}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='board-form'){
  const longTerm=fd.has('longTerm');
  if(account&&!/^\d{8}$/.test(account.studentId||''))return toast('学号应为 8 位数字。');
  if(!longTerm&&(!get('windowStart')||!get('windowEnd')))return toast('请设定生效时段，或勾选长期。');
  try{applyResult(await api('board/create',{type:get('type'),description:get('description'),contact:get('contact'),longTerm,windowStart:get('windowStart'),windowEnd:longTerm?'':get('windowEnd')}));toast(longTerm?'已登记，长期有效，直到你下架':'已登记，只会在设定的时段内被匹配');boardNeedsRefresh=true;render()}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='dm-form'){
  try{const data=await api('board/dm',{listingId:f.dataset.id,text:get('text')});applyResult(data);openDmModal({listing:data.thread?.listing||data.listing,peer:data.thread?.peer||data.peer,messages:(data.thread?.messages||data.messages||[])},f.dataset.id);toast('已发送')}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='places-form')return searchPlaces();
 if(f.id==='places-config-form')return savePlacesForm(f);
 if(f.id==='config-form'){
  const b=f.querySelector('button[type=submit]');b.disabled=true;
  try{applyResult(await api('config',{provider:get('provider')||draftProvider,model:get('model'),apiKey:get('apiKey'),dailyLimit:Number(get('dailyLimit')),enabled:fd.has('enabled'),consent:fd.has('consent'),clearKey:fd.has('clearKey')}));chatError='';f.elements.apiKey.value='';closeModal();render();toast(ai.ready?providerShort()+'已配置，可以直接提问。':'配置已保存，目前仅使用本地检索。')}
  catch(error){const notice=document.getElementById('config-error');notice.textContent=error.message;notice.classList.remove('hidden');b.disabled=false}return;
 }
 if(f.id==='upload-form')return perform({action:'upload',title:get('title'),agent:get('agent'),source:get('source'),sourceUrl:get('sourceUrl'),publishedAt:get('publishedAt'),collectedAt:get('collectedAt'),sourceKind:get('sourceKind'),content:get('content'),filename:f.querySelector('input[type=file]').files[0]?.name||'',cloudAllowed:fd.has('consent')},'已提交到本机后台，等待审核。');
 if(f.id==='agent-form')return perform({action:'saveAgent',id:f.dataset.id||undefined,name:get('name'),description:get('description'),rules:get('rules'),category:get('category')},'已保存草稿，请提交审核。');
 if(f.id==='reject-form')return perform({action:'review',kind:f.dataset.kind,id:f.dataset.id,decision:'reject',reason:get('reason')},'已驳回并记录原因。');
 if(f.id==='edit-doc-form')return perform({action:'editDoc',id:f.dataset.id,title:get('title'),source:get('source'),sourceUrl:get('sourceUrl'),publishedAt:get('publishedAt'),collectedAt:get('collectedAt'),sourceKind:get('sourceKind'),content:get('content')},'已修改并重新提交。');
});
document.addEventListener('keydown',e=>{if((e.target.matches('#chat-form textarea')||e.target.matches('#board-ask-form textarea'))&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.form.requestSubmit()}});
function searchInput(e){
 if(e.target.id!=='search'||e.isComposing)return;const pos=e.target.selectionStart;query=e.target.value;render();const el=document.getElementById('search');el.focus();el.setSelectionRange(pos,pos)
}
document.addEventListener('input',e=>{
 if(e.target.id==='city-keyword')document.getElementById('city-map-link').href=cityMapUrl(e.target.value);
 if(e.target.matches?.('#board-ask-form textarea'))boardQuestion=e.target.value;
 if(e.target.id==='api-key'){
  const box=document.getElementById('config-consent'),note=document.getElementById('saved-key-note');
  if(!box||!note)return;
  const typed=String(e.target.value||'').trim();
  const input=box.querySelector('input');
  if(typed){box.classList.remove('hidden');note.classList.add('hidden');if(input)input.checked=false}
  else{box.classList.add('hidden');note.classList.remove('hidden');if(input)input.checked=false}
 }
});
document.addEventListener('input',searchInput);document.addEventListener('compositionend',searchInput);
document.addEventListener('toggle',e=>{if(e.target.id==='board-publish')boardPublishOpen=e.target.open},true);
document.addEventListener('change',e=>{
 if(e.target.id!=='board-long')return;
 const on=e.target.checked;
 const range=document.getElementById('board-range');
 if(range)range.classList.toggle('is-long',on);
 const start=document.getElementById('board-start'),end=document.getElementById('board-end');
 if(start)start.required=!on;
 if(end)end.required=!on;
});
window.addEventListener('hashchange',()=>{if(route().page==='board')boardNeedsRefresh=true;render();window.scrollTo(0,0)});
boot();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'list_campus_agents',title:'查看已上线校园助手',description:'只读列出当前本地平台已上线的助手与已审核资料数。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('不接受参数');return state.agents.filter(a=>a.status==='published').map(a=>({id:a.id,name:a.name,documents:state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length}))}},{signal:lifecycle.signal})).catch(()=>{})}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}

