'use strict';
const icons={grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',chat:'<path d="M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5Z"/><path d="M7 10h10M7 14h6"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',book:'<path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z"/>',home:'<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',brief:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18m-9-2v4"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',file:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m4 12 5 5L20 6"/>',lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',spark:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',board:'<path d="M8 4h8v4H8zM5 8h14v12H5z"/><path d="M9 12h6M9 16h4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.9 2.2c-.8.5-1.4 1.1-1.4 2.3"/><path d="M12 17h.01"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',chev:'<path d="m15 6-6 6 6 6"/>'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.spark}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BOARD_TYPE_OPTIONS=['快递','闲置书','二手物品','陪诊','代办','摄影','其他'];
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
  return '<button class="source-btn" data-action="board-offer" data-id="'+esc(s.listingId)+'" data-title="'+esc(s.display||s.rawTitle||s.title||'同学登记')+'" data-owner="'+esc(s.ownerName||'')+'" data-type="'+esc(s.type||'')+'" data-expires="'+esc(s.windowText||s.expiresAt||'')+'" data-image="'+esc(listingImageUrl(s))+'">['+s.citation+'] '+esc(s.title||'同学登记')+' · 是否开聊</button>';
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
const AI_PROVIDER_SHORT={qwen:'千问',deepseek:'DeepSeek',doubao:'豆包'};
const providerShort=()=>AI_PROVIDER_SHORT[ai.provider]||'千问';
function aiStatusNote(){const s=providerShort();return ai.configIssue?'模型 ID 需修正':ai.verified?s+'已连接':ai.ready?s+'已配置':'模型未配置（.env）'}

let state={version:2,agents:[],docs:[],audit:[],users:[],chats:{},account:null,boardReports:[]},demoIdentities=true,selfRegister=true;
let account=null,boardListings=[],boardMine=[],boardInbox=[],boardReviewMode=false,boardBusy=false,boardNeedsRefresh=true,dmListingId=null,boardDateFilter='all',boardDateCustom='';
let ai={ready:false,hasKey:false,model:'',dailyLimit:50,usedToday:0},busy=false,pendingChat=null,chatErrors={},chatDrafts={};
async function api(path,body){
 const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Campus-Client':'1'}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json()}catch{throw new Error('当前运行的仍是旧版预览，请关闭旧预览并重新启动。')}
 if(!response.ok)throw new Error(data.error||'请求失败，请重试。');return data;
}
function applyResult(data){if(data.state)state=data.state;if(data.ai)ai=data.ai;if(typeof data.demoIdentities==='boolean')demoIdentities=data.demoIdentities;else if(data.ai&&typeof data.ai.demoIdentities==='boolean')demoIdentities=data.ai.demoIdentities;if(typeof data.selfRegister==='boolean')selfRegister=data.selfRegister;if(data.profile)currentProfile=data.profile;if('account' in data)account=data.account;else if(data.state&&'account' in data.state)account=data.state.account;if('inbox' in data)boardInbox=Array.isArray(data.inbox)?data.inbox:[];if('mine' in data)boardMine=Array.isArray(data.mine)?data.mine:[];if('reviewMode' in data)boardReviewMode=data.reviewMode===true;else if(data.state&&'boardReviewMode' in data.state)boardReviewMode=data.state.boardReviewMode===true}
async function perform(body,message){if(busy)return;busy=true;try{const data=await api('action',body);applyResult(data);closeModal();render();toast(message)}catch(e){const notice=document.getElementById('review-reason-error');if(notice){notice.textContent=e.message;notice.classList.remove('hidden')}toast(e.message)}finally{busy=false;updateBusy()}}
function updateBusy(){document.querySelectorAll('#profile,#chat-form button,#chat-form textarea,.suggestions button,#places-form input,#places-form select,#places-form button').forEach(el=>el.disabled=busy||(el.closest('#places-form')&&el.tagName==='BUTTON'&&!(placesUi.provider==='local'?ai.places?.localReady:ai.places?.ready)))}
async function switchProfile(value){if(!demoIdentities){toast('当前为公开访问，不能切换演示身份。');return}if(busy)return;try{chatErrors={};chatDrafts={};applyResult(await api('session',{profile:value}));resetPlaces();closeModal();render();toast('已切换至'+me().label)}catch(e){toast(e.message);render()}}
async function boot(){try{const params=new URLSearchParams(location.search),wanted=params.get('profile'),page=params.get('page');applyResult(await api('state'));if(demoIdentities&&wanted&&Object.hasOwn(profiles,wanted))applyResult(await api('session',{profile:wanted}));if(wanted||page){if(page&&['home','gallery','board','help','mine','chat','upload','team','admin'].includes(page))history.replaceState(null,'',location.pathname+'#'+page);else history.replaceState(null,'',location.pathname+(location.hash||''))}if(!location.hash||location.hash==='#')history.replaceState(null,'','#home');menuOpen=defaultMenuOpen();startBoardPolling();render()}catch(e){document.getElementById('app').innerHTML='<main class="panel lock-page"><h1>请启动第二步本地服务</h1><p>'+(/Mac/i.test(navigator.platform||navigator.userAgent)?'在终端进入项目文件夹运行 <code>node server.cjs</code>，或双击“打开原型.command”':'双击项目文件夹内的“打开原型.cmd”')+'，再访问 '+esc(location.origin)+'。</p><p>'+esc(e.message)+'</p></main>'}}

let currentProfile='student',category='全部',query='',reviewTab='docs',teamTab='agents';
const me=()=>profiles[currentProfile];
const accountRole=()=>account&&['super_admin','reviewer','user'].includes(account.role)?account.role:'user';
const isSuperAdminUI=()=>me().role==='admin'||accountRole()==='super_admin';
const isReviewerUI=()=>isSuperAdminUI()||accountRole()==='reviewer';
const isStudent=()=>me().role==='student'&&!isReviewerUI();
const homePage=()=>isStudent()?'board':'gallery';
const teamProfile={name:'校集团队',lens:'校园助手',blurb:'生活、办事和学习都在这个工作台。打开已上线助手，或从「贡献资料」提交。',home:'校集团队一个入口，负责生活、办事和学习。',heroEye:'校集团队',heroTitle:'生活、办事和学习，在同一工作台',heroBody:'已上线的助手可以直接打开。草稿集中在这里提交审核。',emptyAgents:'还没有助手。创建一个，覆盖校园生活、办事或学习。',emptyDocs:'暂时没有关联资料。贡献一份，审核通过后会出现在助手里。',emptySearch:'没有找到相关助手。草稿在团队工作台，也可以换个分类。',guideEye:'一个入口',guideTitle:'生活、办事和学习',guide:'同一支校集团队维护这三类助手。下面可以直接打开、处理草稿，或贡献资料。',uploadSub:'交给生活、办事和学习助手。管理员审核通过后，同学才能问到。',uploadPh:'例如：学生证补办材料，或课程复习方法（示例）',contribute:'贡献资料',contributeHint:'生活、办事和学习助手都可以提交。',prompts:[{id:'life',q:'图书馆几点开放？'},{id:'affairs',q:'校园一卡通丢了怎么办？'},{id:'study',q:'课程复习怎么安排？'}]};
const ours=a=>a&&(a.team==='t1'||a.team==='t2');
const teamPack=()=>me().role==='team'?teamProfile:null;
const teamName=id=>id?'校集团队':'';
const productCrumb=()=>me().role==='team'?teamProfile.name:'校集';
const statusLabel={draft:'草稿',pending:'待审核',published:'已上线',approved:'已入库',rejected:'已驳回',offline:'已下架'};
const badge=s=>`<span class="tag ${['published','approved'].includes(s)?'green':s==='pending'?'amber':s==='rejected'?'red':''}">${statusLabel[s]||s}</span>`;
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3500)}
function route(){const parts=location.hash.slice(1).split('/');if(parts[0]==='collect'){history.replaceState(null,'','#upload');parts[0]='upload'}return {page:['home','gallery','board','help','mine','chat','upload','team','admin','login'].includes(parts[0])?parts[0]:homePage(),id:parts[1]||'affairs',source:parts[2]==='gallery'?'gallery':''}}
function go(page,id,source){const hash='#'+page+(id?'/'+id:'')+(source?'/'+source:'');if(location.hash===hash)render();else location.hash=hash}
const titles={home:'校集',gallery:'找助手',board:'互助通达',help:'求助通达',mine:'我的求助',chat:'校园助手',upload:'资料贡献',team:'团队工作台',admin:'审核管理',login:'登录'};
function pageTitle(r){
 if(r.page==='chat'){const a=state.agents.find(a=>a.id===r.id&&a.status==='published');return a?a.name:'校园助手'}
 return titles[r.page]||'校集';
}
function profileSelect(){if(!demoIdentities)return '';return `<select id="profile" aria-label="切换演示身份">${Object.entries(profiles).map(([k,p])=>`<option value="${k}" ${currentProfile===k?'selected':''}>${p.label}</option>`).join('')}</select>`}
function accountControls(){return account?`<span class="tag blue">${esc(account.displayName||'同学')}</span><button class="btn text small" data-action="auth-logout">退出</button>`:`<button class="btn small" type="button" data-action="auth-open">登录</button>`}
function navLinks(page,id,source){
 const items=[['board','board','互助通达',false],['help','help','求助通达',false],['mine','file','我的求助',false],['chat','chat','校园助手',false],['gallery','grid','助手团',true],['upload','upload','资料贡献',true]];
 if(!isStudent())items.push(['team','team','团队工作台',false]);
 if(isReviewerUI())items.push(['admin','shield','审核管理',false]);
 return items.map(([p,i,l,quiet])=>{
  const extra=isStudent()&&quiet?' quiet'+(p==='gallery'?' nav-section':''):'';
  const active=(p===page&&(p!=='chat'||(id==='affairs'&&source!=='gallery')))||(p==='gallery'&&page==='chat'&&(id!=='affairs'||source==='gallery'));
  const href=p==='chat'?'#chat/affairs':'#'+p;
  return `<a class="nav-link${active?' active':''}${extra}" href="${href}" ${active?'aria-current="page"':''}>${icon(i)}${l}</a>`;
 }).join('');
}
function sidebarFoot(){
 if(me().role==='admin')return `<div class="sidebar-bottom"><button data-action="reset">重置演示数据</button></div>`;
 if(isStudent())return `<div class="sidebar-bottom"><p class="sidebar-note">问同学，或问校园助手。</p></div>`;
 return '';
}
function identityBar(){
 const avatar=`<span class="avatar" aria-hidden="true">${esc(me().name[0])}</span>`;
 if(isStudent()){
  const demo=demoIdentities?`<details class="more-menu"><summary>更多</summary><div class="more-panel"><p class="more-label">演示身份</p>${profileSelect()}</div></details>`:'';
  return `<div class="identity student-identity">${accountControls()}${demo}${avatar}</div>`;
 }
 if(!demoIdentities)return `<div class="identity">${accountControls()}${avatar}</div>`;
 return `<div class="identity">${accountControls()}<label for="profile">演示身份</label>${profileSelect()}${avatar}</div>`;
}
let menuOpen=false,enteringPlatform=false;
const NAV_DOCKED_QUERY='(min-width:1280px)';
function navDocked(){
 try{return !window.matchMedia||window.matchMedia(NAV_DOCKED_QUERY).matches}catch{return true}
}
function defaultMenuOpen(){return !!account&&navDocked()}
function setMenu(open){
 const was=menuOpen;
 menuOpen=!!open;
 const shellEl=document.querySelector?.('.shell');
 const aside=document.getElementById('site-menu');
 const btn=document.querySelector?.('.menu-square');
 if(shellEl)shellEl.classList.toggle('menu-open',menuOpen);
 if(aside){aside.classList.toggle('is-open',menuOpen);aside.setAttribute('aria-hidden',menuOpen?'false':'true')}
 if(btn){btn.setAttribute('aria-expanded',menuOpen?'true':'false');btn.setAttribute('aria-label',menuOpen?'收起菜单':'打开菜单')}
 if(!menuOpen&&was&&btn?.focus)btn.focus();
 syncPosterAutoplay(false);
}
function menuButton(){
 return `<button type="button" class="menu-square" data-action="menu" aria-expanded="${menuOpen?'true':'false'}" aria-controls="site-menu" aria-label="${menuOpen?'收起菜单':'打开菜单'}">${icon(menuOpen?'chev':'menu')}</button>`;
}
// Homepage photographs are not shipped with the app. Operators place licensed
// images in data/homepage-posters/ (gitignored). A manifest may list any count.
// Optional fields, omitted values keep the quiet per-photo default:
//   align:   left | right | center          (default rotates by photo)
//   place:   bottom | middle | top          (default bottom; narrow screens pin middle/top down)
//   measure: narrow | regular | wide        (default regular)
//   focus:   center | left | right | top | bottom
// Example, do not replace an existing manifest's text, order, or credits:
// { "posters": [
//   { "file": "01.jpg", "title": "…", "line": "…", "credit": "", "align": "left", "place": "bottom", "measure": "regular", "focus": "center" },
//   { "file": "02.jpg", "title": "…", "line": "…", "credit": "", "align": "right", "place": "bottom", "measure": "narrow", "focus": "right" },
//   { "file": "03.jpg", "title": "…", "line": "…", "credit": "", "align": "left", "place": "bottom", "measure": "wide", "focus": "left" },
//   { "file": "04.jpg", "title": "…", "line": "…", "credit": "", "align": "center", "place": "bottom", "measure": "narrow", "focus": "center" },
//   { "file": "05.jpg", "title": "…", "line": "…", "credit": "", "align": "left", "place": "middle", "measure": "regular", "focus": "center" },
//   { "file": "06.jpg", "title": "…", "line": "…", "credit": "", "align": "right", "place": "bottom", "measure": "regular", "focus": "right" }
// ] }
// Leave credit blank when the photographer is unknown. Missing files use the
// gradient frames below. Do not commit contest photographs.
const POSTER_LAYOUTS=[
 {align:'left',place:'bottom',measure:'regular',focus:'center'},
 {align:'right',place:'bottom',measure:'regular',focus:'right'},
 {align:'left',place:'bottom',measure:'wide',focus:'left'},
 {align:'center',place:'bottom',measure:'narrow',focus:'center'},
 {align:'left',place:'middle',measure:'regular',focus:'center'},
 {align:'right',place:'bottom',measure:'regular',focus:'right'}
];
const POSTER_ALIGN=new Set(['left','right','center']);
const POSTER_PLACE=new Set(['top','middle','bottom']);
const POSTER_MEASURE=new Set(['narrow','regular','wide']);
const POSTER_FOCUS=new Set(['center','left','right','top','bottom']);
function posterLayout(item,index){
 const base=POSTER_LAYOUTS[index%POSTER_LAYOUTS.length];
 const pick=(key,allowed)=>allowed.has(item?.[key])?item[key]:base[key];
 return {align:pick('align',POSTER_ALIGN),place:pick('place',POSTER_PLACE),measure:pick('measure',POSTER_MEASURE),focus:pick('focus',POSTER_FOCUS)};
}
const POSTER_FALLBACK=[
 {file:'01.jpg',title:'你的难题不必独自面对',line:'在校园里，让一次举手之劳，成为彼此的光。',tone:'dawn'},
 {file:'02.jpg',title:'身边有人，就不算独自',line:'一道身影，一次停留，都是校园里给彼此的光。',tone:'river'}
];
let posterCatalog=null,posterIndex=0,posterToken=0,posterAutoplayTimer=0;
const POSTER_AUTOPLAY_MS=5000;
function posterFileUrl(file){
 const name=String(file||'').trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(name)||name.includes('..')||!/\.(jpe?g|png|webp|gif)$/i.test(name))return '';
 return '/homepage-posters/'+name;
}
function normalizePoster(item,index){
 const base=POSTER_FALLBACK[index]||{file:'',title:'在校园里，善意会相遇',line:'一次举手之劳，就是给彼此的光。',tone:index%2?'river':'dawn'};
 const title=String(item?.title??'').trim().slice(0,80)||base.title;
 const line=String(item?.line??'').trim().slice(0,160)||base.line;
 const credit=String(item?.credit??'').trim().slice(0,120);
 const tone=item?.tone==='river'||item?.tone==='dawn'?item.tone:base.tone;
 return {title,line,credit,image:posterFileUrl(item?.file||base.file),tone:tone==='river'?'river':'dawn',...posterLayout(item,index)};
}
function activePosters(){return posterCatalog?.length?posterCatalog:POSTER_FALLBACK.map(normalizePoster)}
function posterSlot(index,delta,length){if(!length)return 0;return ((index+delta)%length+length)%length}
async function ensurePosters(){
 if(posterCatalog)return posterCatalog;
 let items=POSTER_FALLBACK;
 try{
  const res=await fetch('/homepage-posters/manifest.json',{cache:'no-store'});
  if(res.ok){
   const data=await res.json();
   if(data&&Array.isArray(data.posters)&&data.posters.length)items=data.posters;
  }
 }catch{}
 posterCatalog=items.map(normalizePoster).filter(item=>item.title);
 if(!posterCatalog.length)posterCatalog=POSTER_FALLBACK.map(normalizePoster);
 if(posterIndex>=posterCatalog.length)posterIndex=0;
 if(typeof Image!=='undefined')for(const item of posterCatalog)if(item.image){const preload=new Image();preload.src=item.image}
 return posterCatalog;
}
function pad2(n){return String(n).padStart(2,'0')}
function motionReduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch{return false}}
function watchPosterImage(img,frame,src){
 const miss=()=>{frame.classList.add('is-fallback');frame.classList.remove('is-ready')};
 const hit=()=>{frame.classList.remove('is-fallback');frame.classList.add('is-ready')};
 img.onload=()=>{if(img.getAttribute('src')===src)hit()};
 img.onerror=()=>{if(!src||img.getAttribute('src')===src)miss()};
 if(!src){img.removeAttribute('src');miss();return}
 if(img.getAttribute('src')!==src)img.src=src;
 else if(img.complete){if(img.naturalWidth>0)hit();else miss()}
}
function paintPoster(){
 const stage=document.querySelector?.('.poster-stage');
 if(!stage)return;
 const list=activePosters();
 if(!list.length)return;
 if(posterIndex>=list.length)posterIndex=0;
 const item=list[posterIndex];
 const frame=stage.querySelector('.poster-frame');
 if(!frame)return;
 const fading=frame.classList.contains('is-fading');
 frame.className='poster-frame tone-'+item.tone+' focus-'+item.focus+(fading?' is-fading':'');
 const copy=stage.querySelector('.poster-copy');
 if(copy)copy.className='poster-copy align-'+item.align+' place-'+item.place+' measure-'+item.measure;
 const veil=stage.querySelector('.poster-veil');
 if(veil)veil.className='poster-veil place-'+item.place+' align-'+item.align;
 const title=stage.querySelector('.poster-title');
 const line=stage.querySelector('.poster-line');
 if(title)title.textContent=item.title;
 if(line)line.textContent=item.line;
 let credit=stage.querySelector('.poster-credit');
 if(item.credit){
  if(!credit){credit=document.createElement('p');credit.className='poster-credit';stage.querySelector('.poster-copy')?.appendChild(credit)}
  credit.textContent=item.credit;
 }else if(credit)credit.remove();
 const count=stage.querySelector('.poster-count');
 if(count)count.textContent=pad2(posterIndex+1)+' / '+pad2(list.length);
 stage.querySelectorAll('.poster-dot').forEach((dot,i)=>{
  const on=i===posterIndex;
  dot.classList.toggle('is-current',on);
  if(on)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');
 });
 const img=stage.querySelector('.poster-photo');
 if(img)watchPosterImage(img,frame,item.image);
}
function posterAutoplayHeld(){
 if(route().page!=='home')return true;
 if(document.hidden||document.visibilityState==='hidden')return true;
 return activePosters().length<2;
}
function stopPosterAutoplay(){
 if(!posterAutoplayTimer)return;
 clearTimeout(posterAutoplayTimer);
 posterAutoplayTimer=0;
}
function syncPosterAutoplay(restart){
 if(route().page!=='home'){posterToken++;stopPosterAutoplay();return}
 if(posterAutoplayHeld()){stopPosterAutoplay();return}
 if(posterAutoplayTimer&&!restart)return;
 stopPosterAutoplay();
 posterAutoplayTimer=setTimeout(()=>{
  posterAutoplayTimer=0;
  if(posterAutoplayHeld())return;
  shiftPoster(1);
 },POSTER_AUTOPLAY_MS);
}
function shiftPoster(delta){
 const list=activePosters();
 if(!list.length)return;
 posterIndex=posterSlot(posterIndex,delta,list.length);
 const frame=document.getElementById('poster-frame');
 if(!frame||motionReduced()){paintPoster();syncPosterAutoplay(true);return}
 const token=++posterToken;
 frame.classList.add('is-fading');
 setTimeout(()=>{
  if(token!==posterToken)return;
  paintPoster();
  const next=document.getElementById('poster-frame');
  if(!next)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>next.classList.remove('is-fading')));
 },220);
 syncPosterAutoplay(true);
}
function entrySplash(){
 const list=activePosters();
 const item=list[posterIndex]||list[0];
 return `<section class="poster-stage entry-stage" aria-roledescription="轮播" aria-label="平台入口"><div class="poster-frame tone-${item.tone} focus-${item.focus}" id="poster-frame"><img class="poster-photo" alt="" draggable="false" ${item.image?`src="${esc(item.image)}"`:''}><div class="poster-veil place-bottom align-center" aria-hidden="true"></div><button type="button" class="poster-hit" data-action="enter-platform" aria-label="进入平台"></button><p class="entry-prompt">请点击任意键进入平台</p></div></section>`;
}
function shell(content){
 const r=route();
 const entry=r.page==='home';
 const plain=r.page==='login';
 const chrome=!entry&&!plain;
 const aside=chrome?`<aside class="sidebar${menuOpen?' is-open':''}" id="site-menu" aria-hidden="${menuOpen?'false':'true'}" aria-label="菜单"><div class="menu-head"><a class="brand" href="#home" aria-label="回到首页"><span class="brand-mark" aria-hidden="true">集</span><small>同学互助</small></a></div><div class="nav-title">${isStudent()?'常用':'导航'}</div><nav class="nav" aria-label="主导航">${navLinks(r.page,r.id,r.source)}</nav>${sidebarFoot()}</aside>`:'';
 const top=chrome?`<header class="topbar"><div class="breadcrumb">${productCrumb()} <span>/ ${esc(pageTitle(r))}</span></div>${identityBar()}</header>`:'';
 return `<div class="shell${entry?' shell-home':''}${plain?' shell-plain':''}${chrome&&menuOpen?' menu-open':''}">${chrome?menuButton():''}${aside}<div class="main">${top}<main class="content" id="main-content">${content}</main></div></div>`;
}
function heading(eye,title,sub,action=''){return `<div class="page-heading"><div>${eye?`<div class="eyebrow">${eye}</div>`:''}<h1>${title}</h1><p>${sub}</p></div>${action}</div>`}
function galleryHero(){const pack=teamPack();if(!pack)return `<section class="hero"><div class="hero-main"><div class="eyebrow">本周推荐 · 学校事务</div><h2>办事前，先问问校园办事助手</h2><p>准备哪些材料、下一步怎么做？<br>从有来源的资料中，找到清楚的答案。</p><button class="btn" data-action="chat" data-id="affairs" data-source="gallery">开始对话 ${icon('arrow')}</button></div><div class="hero-aside"><div><span class="hero-number">01</span><div>校集团队<small>每个助手都有维护团队</small></div></div><div><span class="hero-number">02</span><div>审核入库<small>资料通过审核后才可使用</small></div></div><div><span class="hero-number">03</span><div>来源可查<small>让每份回答有据可循</small></div></div></section>`;return `<section class="hero"><div class="hero-main"><div class="eyebrow">${esc(pack.heroEye)}</div><h2>${esc(pack.heroTitle)}</h2><p>${esc(pack.heroBody)}</p><button class="btn" data-action="nav" data-page="team">进入团队工作台 ${icon('arrow')}</button></div><div class="hero-aside"><div><span class="hero-number">01</span><div>生活 · 办事 · 学习<small>${esc(pack.name)}统一维护</small></div></div><div><span class="hero-number">02</span><div>审核入库<small>资料通过审核后才可使用</small></div></div><div><span class="hero-number">03</span><div>来源可查<small>让每份回答有据可循</small></div></div></section>`}
function gallery(){const pack=teamPack();const items=state.agents.filter(a=>a.status==='published'&&(category==='全部'||a.category===category)&&(!query||[a.name,a.description,teamName(a.team)].some(v=>v.includes(query))));return `${heading('','你的校园问题，从这里开始',pack?`${esc(pack.home)} 也可以先挑一个已上线助手。`:'挑一个校园助手，直接问就行。',`<button class="btn" data-action="nav" data-page="upload">${icon('plus')}${pack?esc(pack.contribute):'贡献一份资料'}</button>`)}${galleryHero()}<div class="toolbar"><div class="chips" role="group" aria-label="助手分类">${['全部','校园生活','学习资料','学校事务'].map(c=>`<button class="chip ${category===c?'active':''}" data-action="category" data-value="${c}">${c==='全部'?'全部助手':c}</button>`).join('')}</div><label class="search">${icon('search')}<input id="search" aria-label="搜索助手或团队" placeholder="搜索助手或团队" value="${esc(query)}"></label></div><div class="section-heading"><h2>发现校园助手</h2><span>${items.length} 个已上线助手</span></div><div class="cards">${items.map(a=>`<article class="agent-card"><div class="card-top"><div class="agent-icon ${a.color}">${icon(a.icon)}</div><span class="tag green">已审核上线</span></div><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p><div><span class="tag">${a.category}</span></div><div class="team-line">${icon('team')}${teamName(a.team)}</div><div class="card-foot"><small>${state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length} 份已审核资料</small><button class="btn text small" data-action="chat" data-id="${a.id}" data-source="gallery">开始对话 ${icon('arrow')}</button></div></article>`).join('')}</div>${!items.length?`<div class="empty"><p>${pack?esc(pack.emptySearch):'没有找到相关助手，试试其他分类或关键词。'}</p></div>`:''}<div class="bottom-note"><span>${icon('shield')} 回答会标出来源</span><span>${isStudent()?'公开资料会注明出处':'公开资料与演示资料均有标注 · '+aiStatusNote()}</span></div>`}
function shanghaiParts(ms){
 try{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {year:parts.year,month:parts.month,day:parts.day,hour:parts.hour,minute:parts.minute};
 }catch(e){
  const d=new Date(ms+8*3600000),p=n=>String(n).padStart(2,'0');
  return {year:String(d.getUTCFullYear()),month:p(d.getUTCMonth()+1),day:p(d.getUTCDate()),hour:p(d.getUTCHours()),minute:p(d.getUTCMinutes())};
 }
}
function clockInputValue(ms){const p=shanghaiParts(ms);return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute}
function dateKeyPlus(key,days){
 const [y,m,d]=String(key||'').split('-').map(Number);
 const dt=new Date(Date.UTC(y,m-1,d)+days*86400000),p=n=>String(n).padStart(2,'0');
 return dt.getUTCFullYear()+'-'+p(dt.getUTCMonth()+1)+'-'+p(dt.getUTCDate());
}
function listingImageUrl(value){
 const url=String(value&&typeof value==='object'?value.image:value||'');
 return /^\/api\/board\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|gif|webp)$/.test(url)?url:'';
}
function listingThumb(value){
 const url=listingImageUrl(value);
 if(!url)return '';
 return '<a class="listing-shot" href="'+esc(url)+'" target="_blank" rel="noopener"><img class="listing-thumb" src="'+esc(url)+'" alt="登记图片"></a>';
}
function setBoardDay(value){
 const hidden=document.getElementById('board-window-day');
 if(hidden)hidden.value=value;
 document.querySelectorAll('[data-action="board-day"]').forEach(btn=>btn.classList.toggle('active',btn.dataset.value===value));
 const date=document.getElementById('board-date');
 if(date)date.value=(value==='today'||value==='tomorrow')?'':value;
 if(value!=='today'){setBoardHoursActive(null);updateBoardHoursNote('自定义时段')}
}
function setBoardMode(mode){
 const long=mode==='long';
 const span=document.getElementById('board-span');
 if(span)span.classList.toggle('hidden',long);
 ['board-start-time','board-end-time'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el)return;
  el.required=!long;
  el.disabled=long;
 });
}
function setBoardHoursActive(hours){
 document.querySelectorAll('[data-action="board-hours"]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.value)===hours));
}
function updateBoardHoursNote(text){
 const note=document.getElementById('board-hours-note');
 if(note)note.textContent=text;
}
function applyBoardHours(n){
 const hours=+n;
 if(![2,4,8,24].includes(hours))return;
 setBoardMode('span');
 const radio=document.querySelector('#board-form input[name="windowMode"][value="span"]');
 if(radio)radio.checked=true;
 const start=Date.now(),end=start+hours*3600000;
 const s=shanghaiParts(start),e=shanghaiParts(end);
 const startEl=document.getElementById('board-start-time'),endEl=document.getElementById('board-end-time');
 if(startEl)startEl.value=s.hour+':'+s.minute;
 if(endEl)endEl.value=e.hour+':'+e.minute;
 setBoardDay('today');
 setBoardHoursActive(hours);
 if(startEl&&endEl)updateBoardHoursNote('已设为 '+hours+' 小时：'+startEl.value+'—'+endEl.value+(hours===24?'（次日）':''));
}
function boardDateKeyOf(ms){
 const p=shanghaiParts(ms);
 return p.year+'-'+p.month+'-'+p.day;
}
function boardDateKey(l){
 const ms=Date.parse(l&&l.createdAt||'');
 return Number.isFinite(ms)?boardDateKeyOf(ms):'';
}
function boardTodayKey(){return boardDateKeyOf(Date.now())}
function boardDateLabel(key){
 const today=boardTodayKey();
 if(key===today)return '今天';
 if(key===dateKeyPlus(today,-1))return '昨天';
 const parts=String(key||'').split('-');
 if(parts.length!==3)return '日期未知';
 const y=parts[0],m=Number(parts[1]),d=Number(parts[2]);
 return (y===today.slice(0,4)?'':y+'年')+m+'月'+d+'日';
}
function boardCreatedLabel(l){
 const ms=Date.parse(l&&l.createdAt||'');
 if(!Number.isFinite(ms))return '';
 const p=shanghaiParts(ms);
 return p.month+'-'+p.day+' '+p.hour+':'+p.minute;
}
function boardFilteredListings(list){
 const rows=Array.isArray(list)?list:[];
 if(boardDateFilter==='today'){const today=boardTodayKey();return rows.filter(l=>boardDateKey(l)===today)}
 if(boardDateFilter==='week'){const cutoff=dateKeyPlus(boardTodayKey(),-6);return rows.filter(l=>{const key=boardDateKey(l);return key&&key>=cutoff})}
 if(boardDateFilter==='custom'&&boardDateCustom)return rows.filter(l=>boardDateKey(l)===boardDateCustom);
 return rows;
}
function boardDateGroups(list){
 const keys=[],map=new Map();
 for(const l of list){
  const key=boardDateKey(l)||'unknown';
  if(!map.has(key)){map.set(key,[]);keys.push(key)}
  map.get(key).push(l);
 }
 keys.sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a));
 return keys.map(key=>({
  key,label:key==='unknown'?'日期未知':boardDateLabel(key),
  rows:map.get(key).slice().sort((a,b)=>(a.resolution==='solved'?1:0)-(b.resolution==='solved'?1:0))
 }));
}
function boardDateFilterBar(){
 const chips=[['all','全部日期'],['today','今天'],['week','近 7 天']];
 return '<div class="board-date-bar" role="group" aria-label="按发布日期筛选">'+
  chips.map(([value,label])=>'<button type="button" class="chip '+(boardDateFilter===value?'active':'')+'" data-action="board-date-filter" data-value="'+value+'">'+label+'</button>').join('')+
  '<label class="board-date-pick" for="board-date-filter">选择日期<input id="board-date-filter" type="date" value="'+esc(boardDateCustom)+'"></label>'+
  (boardDateFilter==='custom'&&boardDateCustom?'<button type="button" class="chip" data-action="board-date-filter" data-value="all">清除</button>':'')+
  '</div>';
}
function boardHelpState(l){
 const st=l.status||'active';
 if(st==='pending')return {label:'待审核',tone:'amber',icon:''};
 if(st==='rejected')return {label:'已驳回',tone:'red',icon:''};
 if(st==='taken_down')return {label:'已下架',tone:'',icon:''};
 if(l.resolution==='solved')return {label:'已解决',tone:'green',icon:'check'};
 const count=Number(l.helpCount)||0;
 if(count>0)return {label:'目前有 '+count+' 人帮助',tone:'green',icon:'team'};
 return {label:'待帮助',tone:'amber',icon:''};
}
function boardHelpBadge(l){
 const s=boardHelpState(l);
 return '<span class="tag '+s.tone+' board-help-state">'+(s.icon?icon(s.icon):'')+esc(s.label)+'</span>';
}
function boardDetailButton(l,context='board'){
 return '<button class="btn small" type="button" data-action="board-detail" data-id="'+esc(l.id)+'" data-context="'+esc(context)+'">查看详情</button>';
}
function boardHelperList(l){
 const rows=Array.isArray(l.helpers)?l.helpers:[];
 if(!rows.length)return '';
 return '<div class="board-helpers"><p class="board-helpers-title">来帮忙的同学 <span class="count">'+rows.length+'</span></p>'+rows.map(h=>'<div class="board-helper"><div class="board-helper-head"><strong>'+esc(h.displayName||'同学')+'</strong><span class="board-when">'+esc(String(h.createdAt||'').replace('T',' ').slice(0,16))+'</span></div><p>'+esc(h.message||'')+'</p>'+(h.contact?'<p class="small muted">联系方式：'+esc(h.contact)+'</p>':'')+'</div>').join('')+'</div>';
}
function listingCard(l,mode){
 const when=esc(listingWhen(l));
 const type=esc(l.type||'互助');
 const headline=esc(listingHeadline(l));
 const text=esc(listingDescription(l));
 if(mode==='mine'){
  const st=l.status||'active';
  const tag=st==='active'?boardHelpBadge(l):st==='pending'?'<span class="tag amber">待审核</span>':st==='rejected'?'<span class="tag red">已驳回</span>':'<span class="tag">已下架</span>';
  const actions=[boardDetailButton(l,'mine'),'<button class="btn danger small" type="button" data-action="board-delete" data-id="'+esc(l.id)+'">删除</button>'];
  if(st!=='taken_down')actions.push('<button class="btn danger small" type="button" data-action="board-takedown" data-id="'+esc(l.id)+'">'+(st==='active'?'下架':'撤回')+'</button>');
  const reason=l.reason?'<p class="reason">审核意见：'+esc(l.reason)+'</p>':'';
  return '<article class="record board-card"><div class="board-card-copy"><div class="board-card-kicker">'+tag+'<span class="tag blue">'+type+'</span><span class="board-when">'+when+'</span></div><h3 class="board-card-title">'+headline+'</h3>'+(text?'<p class="board-card-text">'+text+'</p>':'')+reason+'<div class="board-card-actions">'+actions.join('')+'</div></div></article>';
 }
 const role=roleTag(l.role);
 return '<article class="record board-card">'+listingThumb(l)+'<div class="board-card-copy"><div class="board-card-kicker"><span class="tag blue">'+type+'</span>'+(role?'<span class="tag">'+esc(role)+'</span>':'')+boardHelpBadge(l)+'<span class="board-when">'+when+'</span></div><h3 class="board-card-title">'+headline+'</h3>'+(text?'<p class="board-card-text">'+text+'</p>':'')+'<p class="board-card-who">'+esc(l.ownerName||'同学')+'</p><div class="board-card-foot"><span class="board-created">'+(boardCreatedLabel(l)?'发布于 '+esc(boardCreatedLabel(l)):'')+'</span>'+boardDetailButton(l,'board')+'</div></div></article>';
}
function listingHeadline(l){return l.display||[l.type,l.title].filter(Boolean).join(' · ')||l.type||'同学登记'}
function listingDescription(l){
 const text=String(l&&l.description||'').trim();
 return text&&!listingHeadline(l).includes(text)?text:'';
}
function listingWhen(l){return l.windowText||(l.longTerm?'长期':(l.expiresAt?'有效至 '+String(l.expiresAt).slice(0,16).replace('T',' '):''))}
function roleTag(role){return role==='offer'?'我来帮忙':role==='need'?'我需要':''}
let authMode='login',authForgot=false,authShowPassword=false;
function safeAuthReturn(value){
 const hash=String(value||'');
 if(!/^#(gallery|board|help|mine|chat|upload|team|admin)(\/[A-Za-z0-9_-]{1,40})?$/.test(hash))return '';
 return hash;
}
function rememberAuthReturn(){
 try{
  const next=safeAuthReturn(location.hash);
  if(next)sessionStorage.setItem('campus-auth-next',next);
 }catch{}
}
function takeAuthReturn(){
 try{
  const next=safeAuthReturn(sessionStorage.getItem('campus-auth-next')||'');
  sessionStorage.removeItem('campus-auth-next');
  return next;
 }catch{return ''}
}
function goLogin(){
 rememberAuthReturn();
 if(route().page==='login')return render();
 go('login');
}
function enterPlatform(){
 if(enteringPlatform||route().page!=='home')return;
 enteringPlatform=true;
 stopPosterAutoplay();
 if(account){menuOpen=defaultMenuOpen();go(homePage())}else go('login');
 enteringPlatform=false;
}
function authNote(){
 return '<div class="auth-note"><span class="auth-note-mark" aria-hidden="true">i</span><div><strong>用账号登录，用昵称认识彼此</strong><p>昵称可以修改，不影响登录账号</p></div></div>';
}
function loginPage(){
 if(account){
  if(account.mustChangePwd)return '<div class="auth-page"><section class="auth-card"><p class="auth-kicker">首次登录</p><h1>请修改初始密码</h1><p class="hint">管理员发放的初始密码只能使用一次。修改后才能继续使用平台。</p><form id="pwd-form"><div class="field"><label for="pwd-old">原密码</label><input id="pwd-old" name="oldPassword" type="password" required maxlength="72" autocomplete="current-password"></div><div class="field"><label for="pwd-new">新密码</label><input id="pwd-new" name="newPassword" type="password" required minlength="8" maxlength="72" autocomplete="new-password" placeholder="至少 8 位，不能是常见弱口令"></div><div class="modal-actions"><button class="btn primary auth-submit" type="submit">保存新密码</button><button class="btn" type="button" data-action="auth-logout">退出登录</button></div></form></section></div>';
  return '<div class="auth-page"><section class="auth-card"><p class="auth-kicker">账号</p><h1>已登录</h1><p class="hint">当前昵称是别人看到的名字。登录账号不会因此改变。</p><form id="nick-form"><div class="field"><label for="nick-name">昵称</label><input id="nick-name" name="displayName" maxlength="20" value="'+esc(account.displayName||'')+'" placeholder="例如：小陈"></div><button class="btn primary auth-submit" type="submit">保存昵称</button></form>'+authNote()+'</section></div>';
 }
 const register=authMode==='register'&&selfRegister;
 const type=authShowPassword?'text':'password';
 const nick=register?'<div class="field"><label for="auth-name">昵称（可选）</label><input id="auth-name" name="displayName" maxlength="20" placeholder="不填也会有一个不暴露账号的昵称" autocomplete="nickname"></div>':'';
 const forgot=authForgot?'<p class="small" role="status">暂时不能自助找回密码。这里没有短信或邮箱验证，也不会只凭登录账号重置密码。</p>':'';
 const tabs=selfRegister?'<div class="auth-tabs" role="tablist"><button type="button" class="auth-tab'+(register?'':' is-current')+'" data-action="auth-tab" data-value="login" role="tab" aria-selected="'+(register?'false':'true')+'">登录</button><button type="button" class="auth-tab'+(register?' is-current':'')+'" data-action="auth-tab" data-value="register" role="tab" aria-selected="'+(register?'true':'false')+'">注册</button></div>':'';
 const foot=selfRegister?(register?'已有账号？ <button type="button" class="btn text small" data-action="auth-tab" data-value="login">去登录</button>':'还没有账号？ <button type="button" class="btn text small" data-action="auth-tab" data-value="register">去注册</button>'):'账号由管理员发放；忘记密码请联系管理员。';
 return '<div class="auth-page"><section class="auth-card"><p class="auth-kicker">'+(register?'注册':'登录')+'</p><h1>'+(register?'创建账号':'欢迎回来')+'</h1>'+tabs+'<form id="auth-page-form" data-mode="'+(register?'register':'login')+'"><div class="field"><label for="auth-user">登录账号</label><input id="auth-user" name="username" required minlength="3" maxlength="20" autocomplete="username" placeholder="'+(register?'字母、数字或下划线':'请输入登录账号')+'" autofocus></div>'+nick+'<div class="field auth-pass"><label for="auth-pass">密码</label><div class="auth-pass-line"><input id="auth-pass" name="password" type="'+type+'" required minlength="6" maxlength="72" autocomplete="'+(register?'new-password':'current-password')+'" placeholder="请输入密码"><button type="button" class="auth-peek" data-action="auth-peek">'+(authShowPassword?'隐藏':'显示')+'</button></div></div><div class="auth-row"><label class="check auth-keep"><input name="remember" type="checkbox" checked><span>保持登录<small>公共电脑请取消勾选</small></span></label>'+(register?'':'<button type="button" class="btn text small" data-action="auth-forgot">忘记密码？</button>')+'</div>'+forgot+'<button class="btn primary auth-submit" type="submit">'+(register?'注册':'登录')+'</button></form>'+authNote()+'<p class="auth-foot">'+foot+'</p></section></div>';
}
function helpRegisterSection(logged){
 const nowParts=shanghaiParts(Date.now()),laterParts=shanghaiParts(Date.now()+2*3600000);
 const startClock=nowParts.hour+':'+nowParts.minute,endClock=laterParts.hour+':'+laterParts.minute;
 if(!logged)return '<section class="panel board-register" id="board-register"><h2>发布求助</h2><p class="board-quiet">登录后登记求助。提问和浏览不用登录。</p><p><button class="btn primary" type="button" data-action="auth-open">去登录</button></p></section>';
 return '<section class="panel board-register" id="board-register"><h2>发布求助</h2>'+
  '<p class="muted small" style="margin:12px 0">当前昵称：'+esc(account.displayName||'同学')+'</p>'+
  '<form id="board-form"><div class="field"><label for="board-type">类型 <span class="required">*</span></label><select id="board-type" name="type" required><option value="" disabled selected>请选择类型</option>'+BOARD_TYPE_OPTIONS.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('')+'</select></div>'+
  '<fieldset class="alarm-window"><legend>'+icon('clock')+' 生效时段</legend>'+
  '<div class="window-mode" role="radiogroup" aria-label="生效时段"><label class="window-choice"><input type="radio" name="windowMode" value="long"><span>长期有效</span></label><label class="window-choice"><input type="radio" name="windowMode" value="span" checked><span>指定时段</span></label></div>'+
  '<div id="board-span"><div class="window-days" role="group" aria-label="哪一天"><button type="button" class="chip active" data-action="board-day" data-value="today">今天</button><button type="button" class="chip" data-action="board-day" data-value="tomorrow">明天</button><label class="chip window-pick" for="board-date">选一天</label></div>'+
  '<input id="board-date" name="windowDate" type="date" aria-label="选一天"><input type="hidden" id="board-window-day" name="windowDay" value="today">'+
  '<div class="form-grid window-clocks"><div class="field"><label for="board-start-time">开始</label><input id="board-start-time" name="windowStartTime" type="time" required value="'+esc(startClock)+'"></div><div class="field"><label for="board-end-time">结束</label><input id="board-end-time" name="windowEndTime" type="time" required value="'+esc(endClock)+'"></div></div>'+
  '<p class="small muted alarm-note">时间为北京时间。结束不晚于开始时，算到第二天。超过 90 天请改选长期有效。</p>'+
  '<div class="window-hours"><span class="small muted">从现在起</span>'+[2,4,8,24].map(h=>'<button type="button" class="'+(h===2?'active':'')+'" data-action="board-hours" data-value="'+h+'">'+h+' 小时</button>').join('')+'</div>'+
  '<p id="board-hours-note" class="small muted" aria-live="polite">当前时段：'+startClock+'—'+endClock+'（2 小时）</p></div></fieldset>'+
  '<div class="field"><label for="board-desc">说明 <span class="required">*</span></label><textarea id="board-desc" name="description" required maxlength="800" rows="4" placeholder="表明你的需求"></textarea></div><div class="field"><label for="board-contact">联系方式（自愿公开，可选）</label><input id="board-contact" name="contact" maxlength="80" placeholder="例如 QQ / 微信 / 手机号"></div><div class="field"><label for="board-image">放图片（可选）</label><input id="board-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><img id="board-image-preview" class="listing-thumb hidden" alt="图片预览"><small id="board-image-note">最多 1 张，JPEG / PNG / WebP / GIF，4 MB 以内。不要上传证件、人脸特写等敏感个人信息。</small></div><button class="btn primary" type="submit">'+icon('plus')+'提交登记</button></form>'+
  '</section>';
}
function helpInboxSection(){
 if(!account||!Array.isArray(boardInbox)||!boardInbox.length)return '';
 return '<section class="panel board-inbox"><h2>别人发来的消息 <span class="count">'+boardUnreadTotal()+' 条未读</span></h2><p class="hint">同学通过「同意开聊」发来的私聊，只有你和对方能看到。<button class="btn text small" type="button" data-action="board-refresh">刷新</button></p>'+boardInbox.map(t=>'<article class="record board-thread"><div class="board-card-copy"><div class="board-card-kicker"><span class="tag blue">'+esc(t.listing?.type||'互助')+'</span> '+esc(t.listing?.display||'同学登记')+(t.unread>0?' <span class="tag amber">'+t.unread+' 条未读</span>':'')+'<span class="board-when">'+esc(String(t.last?.time||'').replace('T',' ').slice(0,16))+'</span></div><p class="board-card-text">'+esc(t.peer?.displayName||'同学')+' · '+esc(t.last?.text||'')+'</p></div><button class="btn small" type="button" data-action="board-thread" data-thread="'+esc(t.threadId)+'">打开对话</button></article>').join('')+'</section>';
}
function boardPage(){
 return '<div class="board-page">'+heading('','互助通达','同学们发布的求助信息。点开一条，了解情况后和同学一起解决。',`<a class="btn primary" href="#help">${icon('plus')}发布求助</a>`)+boardListSection()+'</div>';
}
function helpPage(){
 const logged=!!account;
 return '<div class="board-page help-page">'+heading('','求助通达','把你的问题写下来，同学看到后会来帮你。',`<a class="btn" href="#board">${icon('board')}看看同学们的求助</a>`)+helpRegisterSection(logged)+helpInboxSection()+'</div>';
}
function myRequestsPage(){
 const logged=!!account;
 const mine=Array.isArray(boardMine)?boardMine:[];
 if(!logged)return '<div class="board-page my-page">'+heading('','我的求助','登录后查看你发布过的求助和解决情况。')+'<section class="panel"><p class="board-quiet">还没有登录。登录后才能查看自己的求助。</p><p><button class="btn primary" type="button" data-action="auth-open">去登录</button></p></section></div>';
 const body=mine.length?mine.map(l=>listingCard(l,'mine')).join(''):'<p class="board-quiet">你还没有发布过求助。<a href="#help">去「求助通达」发布一条</a>。</p>';
 return '<div class="board-page my-page">'+heading('','我的求助','看看你发布过的求助，以及现在有没有同学来帮忙。',`<a class="btn primary" href="#help">${icon('plus')}发布求助</a>`)+'<section class="panel board-list" id="my-list"><h2>我发布的求助'+(mine.length?' <span class="count">'+mine.length+'</span>':'')+'</h2>'+body+'</section></div>';
}
function boardFindListing(listingId){
 const id=String(listingId||'');
 return (Array.isArray(boardMine)?boardMine:[]).find(l=>l.id===id)||(Array.isArray(boardListings)?boardListings:[]).find(l=>l.id===id)||null;
}
function boardDetailModal(listingId,context='board'){
 const l=boardFindListing(listingId);
 if(!l)return toast('求助已不可用。');
 const fromMine=context==='mine';
 const owner=l.mine===true||(Array.isArray(boardMine)&&boardMine.some(x=>x.id===l.id));
 const status=l.status||'active';
 const contact=l.contact?'<p class="small muted">联系方式：'+esc(l.contact)+'</p>':'<p class="small muted">发布者没有公开联系方式，可以在帮助信息里留下你的联系方式。</p>';
 const description=listingDescription(l);
 const helperBlock=owner&&fromMine?'<div class="board-detail-helpers"><h3>帮助情况</h3>'+(Array.isArray(l.helpers)&&l.helpers.length?boardHelperList(l):'<p class="small muted">还没有同学提交帮助。</p>')+'</div>':'';
 const solvedNote=l.resolution==='solved'?'<p class="small muted">这条求助已标记为已解决，不能再提交帮助。</p>':'';
 const actions=[];
 if(!account)actions.push('<button class="btn primary" type="button" data-action="board-help-login" data-id="'+esc(l.id)+'">登录后帮助</button>');
 else if(owner&&fromMine){
  if(status==='active'&&l.resolution!=='solved')actions.push('<button class="btn primary" type="button" data-action="board-resolve" data-id="'+esc(l.id)+'">标记已解决</button>');
 }else if(status==='active'&&l.resolution!=='solved'){
  actions.push('<button class="btn primary" type="button" data-action="board-help" data-id="'+esc(l.id)+'">'+(l.helpedByMe?'修改帮助信息':'帮助该同学')+'</button>');
 }
 actions.push('<button class="btn" type="button" data-action="close">关闭</button>');
 modal('求助详情','<div class="board-detail">'+listingThumb(l)+'<div class="board-card-kicker">'+boardHelpBadge(l)+'<span class="tag blue">'+esc(l.type||'求助')+'</span><span class="board-when">'+esc(listingWhen(l))+'</span></div><h3 class="board-detail-title">'+esc(listingHeadline(l))+'</h3><p class="board-detail-owner">发布者：'+esc(l.ownerName||'同学')+'</p>'+(description?'<p class="board-detail-text">'+esc(description)+'</p>':'')+contact+solvedNote+helperBlock+'<div class="modal-actions">'+actions.join('')+'</div></div>');
}
function boardHelpModal(listingId){
 const l=boardFindListing(listingId);
 if(!l)return toast('求助已不可用。');
 if(!account)return boardDetailModal(listingId,'board');
 const my=l.myHelp&&typeof l.myHelp==='object'?l.myHelp:{};
 const self=l.mine===true;
 modal('帮助该同学','<form id="board-help-form" data-id="'+esc(l.id)+'">'+listingThumb(l)+'<p class="small muted" style="margin:8px 0 14px">关于：'+esc(listingHeadline(l))+' · '+esc(listingWhen(l))+'</p>'+(self?'<p class="small muted">这是你自己的求助，提交后会记录为一条帮助信息。</p>':'')+'<div class="field"><label for="board-help-message">帮助说明 <span class="required">*</span></label><textarea id="board-help-message" name="message" required minlength="2" maxlength="300" rows="4" placeholder="例如：我下午三点后可以帮你从南门取快递。">'+esc(my.message||'')+'</textarea><small>对方会在「我的求助」里看到这段说明；再次提交会保留最后一次内容。</small></div><div class="field"><label for="board-help-contact">联系方式（可选）</label><input id="board-help-contact" name="contact" maxlength="80" value="'+esc(my.contact||'')+'" placeholder="例如 微信 / QQ / 手机号"></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">'+(my.message?'修改帮助信息':'提交帮助')+'</button></div></form>');
}
function boardDeleteModal(listingId){
 const l=boardFindListing(listingId);
 if(!l)return toast('求助已不可用。');
 modal('删除这条求助？','<p>删除后不可恢复</p><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn danger" type="button" data-action="confirm-board-delete" data-id="'+esc(l.id)+'">确认删除</button></div>');
}
function boardResolveModal(listingId){
 modal('标记为已解决？','<p>标记后，这条求助会在互助通达显示为已解决，不能再提交帮助；帮助记录仍保留在「我的求助」。</p><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="button" data-action="confirm-board-resolve" data-id="'+esc(listingId)+'">确认已解决</button></div>');
}
function boardListSection(){
 const list=Array.isArray(boardListings)?boardListings:[];
 const filtered=boardFilteredListings(list);
 const groups=boardDateGroups(filtered);
 const body=groups.length?groups.map(g=>'<div class="board-date-group"><div class="board-date-title"><span>'+esc(g.label)+'</span><span class="count">'+g.rows.length+' 条</span></div>'+g.rows.map(l=>listingCard(l,'public')).join('')+'</div>').join(''):(list.length?'<p class="board-quiet">当前筛选没有正在生效的求助。<button type="button" class="btn text small" data-action="board-date-filter" data-value="all">查看全部日期</button></p>':'<p class="board-quiet">眼下没有正在生效的互助。想求助？<a href="#help">去「求助通达」发布一条</a>。</p>');
 return '<section class="panel board-list" id="board-list"><h2>正在生效'+(filtered.length?' <span class="count">'+filtered.length+'</span>':'')+'</h2>'+boardDateFilterBar()+body+'</section>';
}
function empty(text){return `<div class="empty">${icon('file')}<p>${text}</p></div>`}
function guard(kind){const admin=kind==='admin';const button=demoIdentities?(admin?'<button class="btn primary" data-action="switch" data-value="admin">切换为管理员</button>':'<button class="btn primary" data-action="switch" data-value="team">切换为校集团队成员</button>'):'<p class="small muted">公开访问不提供演示身份。</p>';const note=demoIdentities?'此处为演示身份切换，不是真实登录认证。':'公开访问不能切换演示身份。';if(admin)return `<div class="panel lock-page"><div class="agent-icon">${icon('lock')}</div><h1>管理员审核空间</h1><p>审核管理仅对管理员演示身份开放。<br>${note}</p>${button}</div>`;return `<div class="panel lock-page"><div class="agent-icon">${icon('lock')}</div><h1>团队创作空间</h1><p>请切换为校集团队成员，统一管理生活、办事和学习助手。<br>${note}</p>${button}</div>`}
function sourceFields(d={},prefix='source-meta',opts={}){const fields=`<div class="field"><label for="${prefix}-url">原文链接</label><input id="${prefix}-url" name="sourceUrl" type="url" maxlength="2000" value="${esc(d.sourceUrl||'')}" placeholder="粘贴抖音、小红书或官网原文链接"><small>仅保存链接，不会自动读取网页。内容摘要仍需填写并审核。</small></div><div class="form-grid"><div class="field"><label for="${prefix}-published">发布时间</label><input id="${prefix}-published" name="publishedAt" type="date" value="${esc(d.publishedAt||'')}"><small>不知道可留空，不要用今天代替。</small></div><div class="field"><label for="${prefix}-collected">采集日</label><input id="${prefix}-collected" name="collectedAt" type="date" value="${esc(d.collectedAt||'')}"></div></div><div class="field"><label for="${prefix}-kind">内容性质</label><select id="${prefix}-kind" name="sourceKind">${Object.entries({unknown:'未确认',official:'官方通知',experience:'个人体验',merchant:'商家宣传'}).map(([k,v])=>`<option value="${k}" ${(d.sourceKind||'unknown')===k?'selected':''}>${v}</option>`).join('')}</select></div>`;if(!opts.collapsed)return fields;return `<details class="optional-meta"><summary>补充信息（可选）</summary><p class="small muted optional-meta-note">原文链接、发布时间、采集日和内容性质都可以留空。填写后会随资料一起提交。</p>${fields}</details>`}
function contributeStatus(d){const map={pending:['amber','待审'],approved:['green','通过'],rejected:['red','驳回']};const hit=map[d.status];return hit?`<span class="tag ${hit[0]}">${hit[1]}</span>`:badge(d.status)}
function sourceDetails(d){return '<p class="small muted">原文发布：'+esc(d.publishedAt||'未填写')+' · 采集：'+esc(d.collectedAt||'未填写')+' · 入库/提交：'+esc(d.date)+'</p><p class="small muted">内容性质：'+esc(({official:'官方通知（提交者标注）',experience:'个人体验',merchant:'商家宣传',unknown:'未确认'})[d.sourceKind]||'未确认')+'</p>'}
function upload(){
 const mine=state.docs.filter(d=>d.owner===currentProfile).slice().reverse();
 const agents=state.agents.filter(a=>a.status==='published');
 const pack=teamPack();
 const rows=mine.length?mine.map(d=>{
  const agentName=esc(state.agents.find(a=>a.id===d.agent)?.name||'助手');
  const reason=d.status==='rejected'&&d.reason?`<div class="reason">驳回原因：${esc(d.reason)}</div>`:'';
  const resubmit=d.status==='rejected'?`<button class="btn text small" data-action="edit-doc" data-id="${d.id}">修改并重新提交</button>`:'';
  return `<div class="record"><div><p>${esc(d.title)}</p><small>${esc(d.date)} · ${agentName}</small>${reason}<button class="btn text small" data-action="view-doc" data-id="${d.id}">查看内容</button>${resubmit}</div>${contributeStatus(d)}</div>`;
 }).join(''):empty('还没有提交过资料。');
 return `${heading('','让你的资料，帮助更多同学',pack?pack.uploadSub:'提交一份有用的知识，由管理员审核后加入对应助手。')}<div class="two-col"><section class="panel"><h2>提交资料</h2><p class="muted small" style="margin:7px 0 23px">仅使用公开或虚构内容，不要提交真实个人信息。</p><form id="upload-form"><div class="field"><label for="doc-title">标题 <span class="required">*</span></label><input id="doc-title" name="title" required maxlength="80" placeholder="${pack?esc(pack.uploadPh):'例如：图书馆借阅指南（示例）'}"></div><div class="form-grid"><div class="field"><label for="doc-agent">助手 <span class="required">*</span></label><select id="doc-agent" name="agent" required>${agents.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>${pack?`<small>${esc(pack.contributeHint)}</small>`:''}</div><div class="field"><label for="doc-source">来源 <span class="required">*</span></label><input id="doc-source" name="source" required maxlength="150" placeholder="例如：学校公开通知 / 虚构示例"></div></div><div class="field"><label for="doc-content">正文 <span class="required">*</span></label><div class="dropzone">${icon('upload')}<strong>只有 TXT / MD 会自动填入正文</strong><small>PDF、Word 不会解析。请把摘要粘贴到正文。最大 2 MB。</small><input id="doc-file" type="file" accept=".txt,.md,.pdf,.docx" aria-label="选择文件。只有 TXT 和 MD 会自动填入正文"></div><small id="file-note">只会保存文件名和文字，不保存原文件。</small><textarea id="doc-content" name="content" required maxlength="20000" rows="6" placeholder="填写需要审核的文字。选择 TXT / MD 后会自动填入；PDF / Word 请把摘要粘贴到这里。"></textarea><small>PDF / Word 不会被解析，请自行粘贴摘要。</small></div>${sourceFields({},'source-meta',{collapsed:true})}<label class="check"><input type="checkbox" name="consent" required><span>我确认资料可公开分享，不含敏感信息；审核后允许把相关片段发送至云端 AI。</span></label><button class="btn primary" type="submit">${icon('upload')}提交审核</button></form></section><aside class="stack"><section class="panel"><h2>资料如何成为知识？</h2><ol class="steps"><li><span class="step-no">1</span><div><strong>提交资料</strong><p>选择助手，补充内容与来源。</p></div></li><li><span class="step-no">2</span><div><strong>管理员审核</strong><p>检查内容、来源与分享范围。</p></div></li><li><span class="step-no">3</span><div><strong>通过后入库</strong><p>在本地建立检索片段，供助手查找与引用。</p></div></li></ol></section><section class="panel"><h2>我的提交 <span class="count">${mine.length}</span></h2>${rows}</section></aside></div>`;
}
function teamQuick(pack,agents){
 const domainOrder=['life','affairs','study'];
 const domainLabel={life:'生活',affairs:'办事',study:'学习'};
 const published=agents.filter(a=>a.status==='published').slice().sort((a,b)=>{
  const ia=domainOrder.indexOf(a.id),ib=domainOrder.indexOf(b.id);
  return (ia<0?domainOrder.length:ia)-(ib<0?domainOrder.length:ib);
 });
 const pending=agents.filter(a=>a.status!=='published');
 const open=published.map(a=>{
  const domain=domainLabel[a.id];
  return `<button class="btn small" data-action="chat" data-id="${a.id}">${domain?esc(domain)+' · ':''}打开${esc(a.name)}</button>`;
 }).join('');
 const drafts=pending.length?`<button class="btn small" data-action="team-tab" data-value="agents">待处理草稿 ${pending.length}</button>`:'';
 const prompts=(pack.prompts||[]).filter(p=>published.some(a=>a.id===p.id)).map(p=>`<button class="btn small" data-action="prefill-chat" data-id="${esc(p.id)}" data-value="${esc(p.q)}">${esc(p.q)}</button>`).join('');
 return `<section class="team-guide"><h2>${esc(pack.guideTitle)}</h2><p class="hint">${esc(pack.guide)}</p><div class="actions team-quick">${open}${drafts}${prompts}<button class="btn primary small" data-action="nav" data-page="upload">${icon('plus')}${esc(pack.contribute)}</button></div><p class="small muted contribute-note">${esc(pack.contributeHint)}</p></section>`;
}
function team(){
 if(me().role!=='team'&&me().role!=='admin')return guard('team');
 const pack=teamPack()||teamProfile;
 const agents=state.agents.filter(ours);
 const docs=state.docs.filter(d=>agents.some(a=>a.id===d.agent));
 return `${heading(pack.guideEye,pack.name,pack.blurb,`<button class="btn primary" data-action="new-agent">${icon('plus')}创建 Agent</button>`)}${me().role==='admin'?'<div class="banner">'+icon('shield')+'当前是平台管理员身份，可直接维护团队助手；提交后仍在「审核管理」通过上线。</div>':''}<div class="stats"><div class="stat"><span>${esc(pack.lens)}助手</span><strong>${agents.length}</strong></div><div class="stat"><span>已上线</span><strong>${agents.filter(a=>a.status==='published').length}</strong></div><div class="stat"><span>已审核资料</span><strong>${docs.filter(d=>d.status==='approved').length}</strong></div></div>${teamQuick(pack,agents)}<section class="panel"><div class="review-tabs" role="group" aria-label="团队内容"><button class="${teamTab==='agents'?'active':''}" data-action="team-tab" data-value="agents">团队 Agent</button><button class="${teamTab==='docs'?'active':''}" data-action="team-tab" data-value="docs">关联资料</button></div>${teamTab==='agents'?(agents.length?agents.map(a=>`<article class="workspace-record"><div class="agent-icon ${a.color}">${icon(a.icon)}</div><div class="info"><h3>${esc(a.name)} ${badge(a.status)}</h3><p>${esc(a.description)}</p><small class="muted">${a.category} · ${state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length} 份已审核资料</small>${a.reason?`<div class="reason">审核意见：${esc(a.reason)}</div>`:''}</div><div class="actions">${a.status==='published'?`<button class="btn small" data-action="chat" data-id="${a.id}">打开助手</button>`:''}${a.status!=='pending'?`<button class="btn small" data-action="edit-agent" data-id="${a.id}">编辑</button>`:'<span class="muted small">等待管理员审核</span>'}${['draft','rejected','offline'].includes(a.status)?`<button class="btn primary small" data-action="submit-agent" data-id="${a.id}">提交审核</button>`:''}</div></article>`).join(''):empty(pack.emptyAgents)):(docs.length?'<div class="resource-list">'+docs.map(d=>`<div class="record"><div><p>${esc(d.title)}</p><small>${esc(state.agents.find(a=>a.id===d.agent)?.name)} · ${esc(d.source)}</small><button class="btn text small" data-action="view-doc" data-id="${d.id}">查看资料</button></div>${badge(d.status)}</div>`).join(''):empty(pack.emptyDocs))}</section>`;
}
function chatBanner(){
 if(ai.configIssue)return esc(ai.configIssue);
 if(!ai.ready)return '还没接上云端模型，也可以查已有资料和周边地点。请在 .env 配置 CAMPUS_AI_* 后重启服务。';
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
 const notice=pack?'团队资料在本机。缺了就贡献一份，审核通过后才会被引用。':'知识库和检索保存在本机。正常问题均可由云端模型回答。具体校园事实缺少资料时，会明确说明无法确认。';
 return '<aside class="stack chat-aside"><section class="panel"><div class="aside-title">'+icon('book')+' 已审核知识库</div>'+list+'</section><section class="panel"><div class="aside-title">回答规则</div><p class="small muted">'+esc(a.rules)+'</p><div class="inline-notice">'+notice+'</div><button class="btn" data-action="nav" data-page="upload">'+icon('plus')+(pack?esc(pack.contribute):'贡献资料')+'</button></section></aside>';
}
function chat(){
 const r=route(),id=r.id,source=r.source==='gallery'?'gallery':'',scopeKey=id+(source?':'+source:''),prefill=chatDrafts[scopeKey]||'';
 const a=state.agents.find(a=>a.id===id&&a.status==='published');
 if(!a)return heading('','助手暂不可用','回到找助手，选一个已经上线的。');
 const docs=state.docs.filter(d=>d.agent===id&&d.status==='approved'),messages=state.chats[currentProfile+':'+scopeKey]||[];
 const suggestions=id==='life'?['通达附近有什么吃的？','学校附近哪里有快递点？','通达周边周末去哪玩？','图书馆几点开放？']:id==='study'?['课程复习怎么安排？']:id==='affairs'?['校园一卡通丢了怎么办？','成绩单去哪里打印？']:['有哪些相关资料？'];
 const modeLabel={local:'本地引导',ai_general:'一般建议',ai:'已附来源，请核对',retrieval:'资料摘录',format_fallback:'按已有资料整理',no_evidence:'资料不足'};
 const askPlaceholder=id==='study'?'输入具体问题，例如：课程复习怎么安排？':id==='life'?'输入具体问题，例如：图书馆几点开放？':'输入具体问题，例如：校园一卡通丢了怎么办？';
 return ((id==='affairs'&&route().source!=='gallery')?'':`<a class="btn text small chat-back" href="#gallery" aria-label="返回找助手">${icon('chev')}返回找助手</a>`)+
 heading('',esc(a.name),'直接问就行。有资料时会标出来源。')+
 chatStatusBanner()+
 '<div class="chat-layout'+(isStudent()?' solo':'')+'"><section class="chat-box"><div class="chat-head"><div class="agent-icon '+a.color+'">'+icon(a.icon)+'</div><div><h2>'+esc(a.name)+'</h2>'+(isStudent()?'':'<small>'+docs.length+' 份已审核资料</small>')+'</div></div>'+
 '<div class="messages" id="messages" role="log" aria-label="对话记录"><div class="message"><span class="mini-avatar">集</span><div class="bubble">你好！可以问知识问题、制定学习计划，或咨询校园事务。有已审核资料时会附来源。请核对引用来源及原文日期；每条问题独立处理。</div></div>'+
 messages.map(m=>'<div class="message '+(m.role==='user'?'user':'')+'"><span class="mini-avatar">'+(m.role==='user'?'我':'集')+'</span><div class="bubble'+(m.role==='user'?'':' rich')+'">'+(m.role==='user'?'':'<small>'+esc(modeLabel[m.mode]||'历史回答')+'</small>')+(m.role==='user'?esc(m.text):formatBubble(m.text))+(isStudent()?(m.sources||[]).filter(s=>s.sourceType==='campus_board'):(m.sources||[])).map(sourceMarkup).join('')+'</div></div>').join('')+
 (pendingChat?.aid===id&&(pendingChat.scope||'')===source?'<div class="message user"><div class="bubble">'+esc(pendingChat.question)+'</div></div><div class="message"><div class="bubble" role="status">'+(ai.ready?'正在查找并组织回答…':'正在查找已有资料…')+'</div></div>':'')+'</div>'+
 '<div class="suggestions">'+suggestions.map(s=>'<button data-action="suggest" data-value="'+s+'">'+s+'</button>').join('')+'</div><div class="composer">'+(chatErrors[scopeKey]?'<div class="reason" role="alert">'+esc(chatErrors[scopeKey])+'（没有生成成功回答，可重试）</div>':'')+
 '<form id="chat-form"><textarea name="question" aria-label="输入问题" placeholder="'+askPlaceholder+'" rows="1" required maxlength="500">'+esc(prefill)+'</textarea><button class="btn primary" type="submit">发送 '+icon('arrow')+'</button></form>'+(me().role==='admin'?'<p>Enter 发送，Shift + Enter 换行。</p>':'')+'</div></section>'+
 chatAside(a,docs)+'</div>';
}
function adminUsersPanel(){
 const users=Array.isArray(state.users)?state.users:[];
 const roleLabel={super_admin:'超级管理员',reviewer:'审核员',user:'使用者'};
 const userStatus={0:'待激活',1:'正常',2:'禁用'};
 const rows=users.map(u=>'<article class="record"><div><p><strong>'+esc(u.displayName||'同学')+'</strong> · '+esc(u.username||u.studentId)+' <span class="tag blue">'+esc(roleLabel[u.role]||u.role)+'</span> <span class="tag '+(u.status===1?'green':u.status===2?'red':'amber')+'">'+esc(userStatus[u.status]||u.status)+'</span></p><small>'+(u.mustChangePwd?'等待首次改密':'密码已设置')+' · 创建于 '+esc(String(u.createdAt||'').slice(0,10))+'</small></div><div class="actions">'+(u.status===2?'<button class="btn small" data-action="admin-user-status" data-id="'+esc(u.studentId)+'" data-status="1">启用</button>':'<button class="btn danger small" data-action="admin-user-status" data-id="'+esc(u.studentId)+'" data-status="2">禁用</button>')+'<button class="btn small" data-action="admin-user-reset" data-id="'+esc(u.studentId)+'">重置密码</button><select data-action="admin-user-role" data-id="'+esc(u.studentId)+'" aria-label="修改角色">'+['user','reviewer','super_admin'].map(r=>'<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+roleLabel[r]+'</option>').join('')+'</select></div></article>').join('');
 return '<section class="panel" id="admin-users"><h2>账号管理 <span class="count">'+users.length+'</span></h2><p class="small muted">管理员发放账号。初始密码只显示一次，首次登录必须改密；禁用后旧会话立即失效。</p><form id="admin-user-form"><div class="form-grid"><div class="field"><label for="admin-user-name">登录账号</label><input id="admin-user-name" name="username" minlength="3" maxlength="20" placeholder="3—20 位字母/数字/_.-"></div><div class="field"><label for="admin-user-sid">学号（可选）</label><input id="admin-user-sid" name="studentId" pattern="\\d{8}" maxlength="8" placeholder="8 位数字"></div><div class="field"><label for="admin-user-nick">昵称</label><input id="admin-user-nick" name="displayName" maxlength="20" placeholder="不填自动生成"></div><div class="field"><label for="admin-user-role">角色</label><select id="admin-user-role" name="role"><option value="user">使用者</option><option value="reviewer">审核员</option><option value="super_admin">超级管理员</option></select></div><div class="field"><label for="admin-user-pass">初始密码</label><input id="admin-user-pass" name="password" type="text" minlength="8" maxlength="72" placeholder="留空自动生成"></div></div><button class="btn primary" type="submit">创建账号</button></form><div id="admin-user-result" class="small muted"></div><div class="stack" style="margin-top:14px">'+(rows||'<p class="small muted">还没有账号。</p>')+'</div><details class="admin-import-fold"><summary>CSV 批量导入</summary><p class="small muted fold-note">每行：登录账号,昵称,初始密码,角色（user/reviewer/super_admin）。密码留空会自动生成。</p><textarea id="admin-import-csv" rows="4" placeholder="zhangsan,张三,,user"></textarea><div class="actions"><button class="btn small" type="button" data-action="admin-import">导入账号</button></div></details></section>';
}
function admin(){if(!isReviewerUI())return guard('admin');const docs=state.docs.filter(d=>d.status==='pending');const agents=state.agents.filter(a=>a.status==='pending');const queue=reviewTab==='agents'?'agents':'docs';const reports=state.boardReports||[];const pendingListings=state.boardPendingListings||[];const pendingListingBody=pendingListings.length?pendingListings.map(l=>'<article class="review-card"><div class="review-card-head"><h3>'+esc(l.type)+'</h3><span class="tag amber">待审核</span></div>'+listingThumb(l)+'<p>'+esc(l.description)+'</p><p class="small muted">发布者：'+esc(l.ownerName||'—')+' · '+esc(l.windowText||'')+' · 联系方式：'+esc(l.contact||'—')+'</p><div class="actions"><button class="btn primary small" data-action="board-approve-listing" data-id="'+esc(l.id)+'">通过上线</button><button class="btn danger small" data-action="board-reject-listing" data-id="'+esc(l.id)+'">驳回</button></div></article>').join(''):'<p class="small muted">暂无待审核的互助登记。</p>';const reportBody=reports.length?reports.map(r=>'<article class="review-card"><div class="review-card-head"><h3>'+esc(r.listing?.display||'登记已不存在')+'</h3><span class="tag amber">待处理</span></div><p>举报原因：'+esc(r.reason)+'</p><p class="small muted">登记说明：'+esc(r.listing?.description||'（已不存在）')+'</p><p class="small muted">发布者：'+esc(r.listing?.ownerName||'—')+' · 举报人：'+esc(r.reporter?.displayName||'同学')+' · '+esc(String(r.createdAt||'').replace('T',' ').slice(0,16))+'</p><div class="actions"><button class="btn danger small" data-action="board-report-resolve" data-id="'+esc(r.id)+'" data-decision="take_down">下架登记</button><button class="btn small" data-action="board-report-resolve" data-id="'+esc(r.id)+'" data-decision="dismiss">忽略举报</button></div></article>').join(''):'<p class="small muted">暂无待处理举报。</p>';const pendingPanel=(boardReviewMode||pendingListings.length)?'<section class="panel"><h2>互助登记审核 <span class="count">'+pendingListings.length+'</span></h2>'+pendingListingBody+'</section>':'';const activeListings=state.boardActiveListings||[];const activeListingBody=activeListings.length?activeListings.map(l=>'<article class="review-card"><div class="review-card-head"><h3>'+esc(l.display||l.type||'互助登记')+'</h3>'+(l.resolution==='solved'?'<span class="tag green">已解决</span>':'<span class="tag green">已生效</span>')+'</div>'+listingThumb(l)+(listingDescription(l)?'<p>'+esc(listingDescription(l))+'</p>':'')+'<p class="small muted">发布者：'+esc(l.ownerName||'—')+' · '+esc(l.type||'')+' · '+esc(l.windowText||'')+' · 联系方式：'+esc(l.contact||'—')+'</p><div class="actions"><button class="btn danger small" data-action="board-admin-takedown" data-id="'+esc(l.id)+'">主动下架</button></div></article>').join(''):'<p class="small muted">暂无已生效的互助登记。</p>';const activePanel='<section class="panel"><h2>已生效与已解决互助登记 <span class="count">'+activeListings.length+'</span></h2><p class="small muted fold-note">没有待处理举报时也可以主动下架。确认后不再出现在有效列表和匹配里；已解决登记排在后面。</p>'+activeListingBody+'</section>';const published=[...state.docs.filter(d=>d.status==='approved'||d.status==='offline').map(d=>({kind:'doc',data:d})),...state.agents.filter(a=>a.status==='published'||a.status==='offline').map(a=>({kind:'agent',data:a}))];const pendingBody=queue==='docs'?(docs.length?docs.map(d=>`<article class="review-card"><div class="review-card-head"><h3>${esc(d.title)}</h3>${badge(d.status)}</div><p>提交人：${profiles[d.owner]?.name||'演示用户'} · ${d.date}</p><p>目标助手：${esc(state.agents.find(a=>a.id===d.agent)?.name||'已不可用')}</p><p>来源：${esc(d.source)}</p><div class="actions"><button class="btn small" data-action="view-doc" data-id="${d.id}">查看内容并审核 ${icon('arrow')}</button></div></article>`).join(''):empty('资料已处理完，暂无待审核内容。')):(agents.length?agents.map(a=>`<article class="review-card"><div class="review-card-head"><h3>${esc(a.name)}</h3>${badge(a.status)}</div><p>${teamName(a.team)} · ${a.category}</p><p>${esc(a.description)}</p><div class="actions"><button class="btn small" data-action="review-agent" data-id="${a.id}">查看配置并审核 ${icon('arrow')}</button></div></article>`).join(''):empty('暂无待审核的 Agent。'));const publishedBody=published.length?published.map(({kind,data:d})=>`<div class="record"><div><p>${esc(d.title||d.name)}</p><small>${kind==='doc'?'资料':'Agent'} · ${statusLabel[d.status]}</small></div>${d.status==='offline'?`<button class="btn small" data-action="online" data-kind="${kind}" data-id="${d.id}">重新上架</button>`:`<button class="btn danger small" data-action="offline" data-kind="${kind}" data-id="${d.id}">下架</button>`}</div>`).join(''):'<p class="small muted fold-note">暂无已发布或已下架内容。</p>';const auditBody=state.audit.length?state.audit.slice().reverse().slice(0,8).map(a=>`<div class="audit-line"><strong>${esc(a.action)}</strong> · ${esc(a.title)}${a.reason?`<br>原因：${esc(a.reason)}`:''}<br>${esc(a.time)}</div>`).join(''):'<p class="small muted" style="margin-top:15px">操作完成后会记录在这里。</p>';return `${heading('','审核管理','先处理待审资料和 Agent。已发布内容默认收起，下架前会再确认。')}${isSuperAdminUI()?adminUsersPanel():''}<div class="stats"><div class="stat"><span>待审核资料</span><strong>${docs.length}</strong></div><div class="stat"><span>待上线 Agent</span><strong>${agents.length}</strong></div><div class="stat"><span>本次审核记录</span><strong>${state.audit.length}</strong></div></div><div class="two-col"><section class="panel"><div class="review-tabs" role="group" aria-label="待审队列"><button data-action="review-tab" data-value="docs" class="${queue==='docs'?'active':''}">待审资料 <span class="count">${docs.length}</span></button><button data-action="review-tab" data-value="agents" class="${queue==='agents'?'active':''}">待审 Agent <span class="count">${agents.length}</span></button></div>${pendingBody}<details class="published-fold"><summary>查看已发布（${published.length}）</summary><p class="small muted fold-note">已入库资料和已上线 Agent 收在这里。下架会先确认，确认后不再参与检索。</p>${publishedBody}</details></section><aside class="stack"><section class="panel"><h2>审核要点</h2><ul class="info-list"><li>内容是否适合目标助手？</li><li>来源是否清楚，是否有分享权限？</li><li>是否包含个人信息或过期内容？</li><li>通过和驳回都要填写原因，原因会写入审核记录。</li></ul><div class="inline-notice">这里演示的是人工审核流程，不代表已经通过真实安全审查。</div></section>${pendingPanel}${activePanel}<section class="panel"><h2>互助举报 <span class="count">${reports.length}</span></h2>${reportBody}</section><section class="panel"><h2>最近操作</h2>${auditBody}</section></aside></div>`}
async function loadBoard(){try{const data=await api('board');boardListings=data.listings||[];boardMine=Array.isArray(data.mine)?data.mine:[];boardInbox=Array.isArray(data.inbox)?data.inbox:[];if('reviewMode' in data)boardReviewMode=data.reviewMode===true;if('account' in data)account=data.account}catch(e){toast(e.message)}}
function boardUnreadTotal(){return (Array.isArray(boardInbox)?boardInbox:[]).reduce((n,t)=>n+(Number(t.unread)||0),0)}
async function refreshBoardQuietly(){
 if(!account||!['board','help','mine'].includes(route().page)||busy)return;
 if(document.getElementById('modal')?.open)return;
 const active=document.activeElement;
 if(active&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName))return;
 if([...document.querySelectorAll('#app textarea,#app input')].some(el=>{
  if(el.type==='hidden'||el.type==='file')return false;
  const value=String(el.value||'').trim();
  if(!value)return false;
  return el.tagName==='TEXTAREA'||value!==String(el.defaultValue||'').trim();
 }))return;
 const before=JSON.stringify({listings:boardListings,inbox:boardInbox});
 try{
  const data=await api('board');boardListings=data.listings||[];boardInbox=Array.isArray(data.inbox)?data.inbox:[];if('account' in data)account=data.account;
  if(JSON.stringify({listings:boardListings,inbox:boardInbox})===before)return;
  if(boardUnreadTotal()>0)toast('求助通达有 '+boardUnreadTotal()+' 条未读消息');
  render();
 }catch{}
}
let boardPoll=null;
function startBoardPolling(){
 if(boardPoll!==null)return;
 boardPoll=setInterval(refreshBoardQuietly,45000);
 window.addEventListener('focus',refreshBoardQuietly);
}
function openOfferModal(offers){
 const list=Array.isArray(offers)?offers.filter(o=>o&&o.listingId):[];
 if(!list.length)return;
 const one=list.length===1;
 const cards=list.map(o=>'<article class="offer-card">'+listingThumb(o)+'<p><span class="tag blue">'+esc(o.type||'互助')+'</span> '+(roleTag(o.role)?'<span class="tag">'+esc(roleTag(o.role))+'</span> ':'')+esc(listingHeadline(o))+'</p><small class="muted">'+esc(o.ownerName||'登记同学')+(listingWhen(o)?' · '+esc(listingWhen(o)):'')+'</small>'+(one?'':'<div class="modal-actions"><button class="btn primary" type="button" data-action="board-accept" data-id="'+esc(o.listingId)+'">同意开聊</button><button class="btn small" type="button" data-action="board-report" data-id="'+esc(o.listingId)+'">举报</button></div>')+'</article>').join('');
 const lead=one
  ?'<p>找到同学「'+esc(list[0].ownerName||'登记同学')+'」登记的「'+esc(listingHeadline(list[0]))+'」。同意后打开一对一对话；考虑一下就留在当前结果，不会建聊。</p>'
  :'<p>找到 '+list.length+' 条意思和时间对得上的登记。选一位开聊，或先考虑一下（不会建聊）。</p>';
 const actions=one
  ?'<div class="modal-actions"><button class="btn primary" type="button" data-action="board-accept" data-id="'+esc(list[0].listingId)+'">同意开聊</button><button class="btn small" type="button" data-action="board-report" data-id="'+esc(list[0].listingId)+'">举报</button><button class="btn" type="button" data-action="board-decline">考虑一下</button></div>'
  :'<div class="modal-actions"><button class="btn" type="button" data-action="board-decline">考虑一下</button></div>';
 modal(one?'要和这位同学开聊吗？':'选一位同学开聊',lead+cards+actions);
}
function openDmModal(data,listingId,threadId){
 dmListingId=listingId;
 const msgs=(data.messages||[]).map(m=>'<div class="message '+(m.mine===true||(account&&m.from===account.studentId)?'user':'')+'"><div class="bubble">'+esc(m.text)+'<br><small>'+esc(String(m.time||'').replace('T',' ').slice(0,16))+'</small></div></div>').join('');
 modal('与 '+esc(data.peer?.displayName||'登记同学')+' 交流',listingThumb(data.listing)+'<p class="small muted" style="margin-bottom:12px">关于：'+esc(listingHeadline(data.listing||{}))+' · '+esc(listingWhen(data.listing||{}))+(data.listing?.contact?' · 对方联系方式：'+esc(data.listing.contact):'')+'</p><div class="messages" style="min-height:180px;max-height:280px;border:1px solid var(--line);border-radius:10px;margin-bottom:12px">'+(msgs||'<div class="empty"><p>还没有消息，打个招呼吧。</p></div>')+'</div><form id="dm-form" data-id="'+esc(listingId||'')+'"'+(threadId?' data-thread="'+esc(threadId)+'"':'')+'><div class="field"><label for="dm-text">消息</label><textarea id="dm-text" name="text" required maxlength="500" rows="3" placeholder="礼貌说明来意"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">关闭</button><button class="btn primary" type="submit">发送</button></div></form>');
}
function reportModal(listingId){
 modal('举报这条登记','<form id="board-report-form" data-id="'+esc(listingId)+'"><p class="small muted">举报会交给管理员处理；同一条登记只能举报一次，滥用举报会受限。</p><div class="field"><label for="report-reason">举报原因 *</label><textarea id="report-reason" name="reason" required minlength="2" maxlength="300" rows="3" placeholder="例如：联系方式是广告，或内容与描述不符"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn danger" type="submit">提交举报</button></div></form>');
}
function boardReviewModal(listingId){
 modal('驳回这条登记','<form id="board-review-form" data-id="'+esc(listingId)+'"><p class="small muted">驳回原因会显示给发布者，请写清楚需要修改的地方。</p><div class="field"><label for="board-review-reason">驳回原因 *</label><textarea id="board-review-reason" name="reason" required minlength="2" maxlength="300" rows="3"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn danger" type="submit">确认驳回</button></div></form>');
}
function render(){
 const r=route();
 if(account?.mustChangePwd&&r.page!=='login'){location.hash='#login';return}
 if(isStudent()&&(r.page==='team'||r.page==='admin')){if(location.hash!=='#board')location.hash='#board';return}
 document.title=r.page==='home'?'校集':`${pageTitle(r)} · 校集`;
 const pages={home:entrySplash,gallery,board:boardPage,help:helpPage,mine:myRequestsPage,upload,team,chat,admin,login:loginPage};
 document.getElementById('app').innerHTML=shell(pages[r.page]());
 if(r.page==='home'){ensurePosters().then(()=>{if(route().page!=='home')return;paintPoster();syncPosterAutoplay(false)}).catch(()=>{})}
 if(r.page==='chat'){const el=document.getElementById('messages');if(el)el.scrollTop=el.scrollHeight}
 if(['board','help','mine'].includes(r.page)&&boardNeedsRefresh&&!boardBusy){
  boardBusy=true;boardNeedsRefresh=false;
  loadBoard().then(()=>{
   boardBusy=false;
   const pageNow=route().page;
   if(['board','help','mine'].includes(pageNow)){
    document.getElementById('app').innerHTML=shell(pages[pageNow]());
    updateBusy()
   }
  }).catch(()=>{boardBusy=false;boardNeedsRefresh=true})
 }
 updateBusy();syncPosterAutoplay(false)
}
function adminResetPasswordModal(id){modal('重置密码','<form id="admin-reset-form" data-id="'+esc(id)+'"><p class="small muted">留空会自动生成一次性初始密码。重置后旧会话立即失效，下次登录必须改密。</p><div class="field"><label for="admin-reset-pass">新初始密码</label><input id="admin-reset-pass" name="password" type="text" minlength="8" maxlength="72" placeholder="留空自动生成"></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn danger" type="submit">确认重置</button></div></form>');}
function modal(title,body){const d=document.getElementById('modal');d.innerHTML=`<div class="modal-inner"><div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="close" aria-label="关闭弹窗" data-action="close">${icon('close')}</button></div>${body}</div>`;d.setAttribute('aria-labelledby','dialog-title');if(!d.open)d.showModal()}
function openAuthDialog(){goLogin()}
function closeModal(){document.getElementById('modal').close()}
function id(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2))}

function canReadDoc(d){if(!d)return false;if(me().role==='admin'||d.owner===currentProfile)return true;const a=state.agents.find(a=>a.id===d.agent);return a&&((me().role==='team'&&ours(a))||(d.status==='approved'&&a.status==='published'))}

function publicLinks(doc){
 const urls=[...new Set(((doc.sourceUrl||'')+'\n'+doc.source+'\n'+doc.content).match(/https?:\/\/[^\s<>"'（）｜，。；]+/g)||[])].filter(u=>{try{const v=new URL(u);return ['https:','http:'].includes(v.protocol)&&!v.username&&!v.password}catch{return false}}).slice(0,6);
 return urls.length?'<div class="source-links">'+urls.map((u,i)=>'<a class="btn small" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">查看原始来源'+(urls.length>1?' '+(i+1):'')+' ↗</a>').join('')+'</div>':'';
}
function cityMapUrl(keyword){return 'https://uri.amap.com/search?'+new URLSearchParams({keyword:'南京邮电大学通达学院附近 '+(keyword.trim()||'美食'),city:'扬州',view:'list',src:'campus-agent',callnative:'0'})}

function viewDoc(id){const d=state.docs.find(d=>d.id===id);if(!canReadDoc(d))return toast('资料已不可用，或当前身份无法查看。');modal('资料详情',`<h3>${esc(d.title)}</h3><p class="small muted" style="margin:8px 0">${esc(d.source)} · ${d.date}</p><p style="margin-bottom:15px">${badge(d.status)}</p>${sourceDetails(d)}${publicLinks(d)}<div class="document-body">${esc(d.content)}</div><p class="small muted" style="margin-top:12px">附件：${esc(d.filename||'未选择文件')}（仅保留文件名与上述文字）</p>${me().role==='admin'&&d.status==='pending'?`<div class="modal-actions"><button class="btn danger" data-action="reject" data-kind="doc" data-id="${d.id}">驳回</button><button class="btn primary" data-action="approve" data-kind="doc" data-id="${d.id}">${icon('check')}通过并入库</button></div>`:''}`)}
function agentForm(agentId){if(me().role!=='team'&&me().role!=='admin')return toast('请先切换为团队成员或管理员。');const a=agentId?state.agents.find(a=>a.id===agentId&&ours(a)):null;if(agentId&&(!a||a.status==='pending'))return toast('当前无法编辑该助手。');modal(a?'编辑 Agent':'创建 Agent',`<form id="agent-form" data-id="${a?.id||''}"><div class="field"><label for="agent-name">助手名称 *</label><input id="agent-name" name="name" required maxlength="35" value="${esc(a?.name||'')}" placeholder="例如：新生入学助手"></div><div class="field"><label for="agent-category">所属分类 *</label><select id="agent-category" name="category">${['校园生活','学习资料','学校事务'].map(c=>`<option ${a?.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label for="agent-desc">助手介绍 *</label><textarea id="agent-desc" name="description" maxlength="180" required rows="2" placeholder="这个助手能帮助同学解决什么问题？">${esc(a?.description||'')}</textarea></div><div class="field"><label for="agent-rules">回答规则 *</label><textarea id="agent-rules" name="rules" required maxlength="1500" rows="3">${esc(a?.rules||'仅根据已审核资料回答，标注来源；缺少依据时明确说明，不编造内容。')}</textarea></div><div class="inline-notice">${a?.status==='published'?'已上线助手修改后会回到草稿状态，需要重新审核上线。':'保存为草稿后，在团队工作台提交审核。'}每个助手关联独立的资料列表，上线后可通过资料贡献入口添加。</div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">保存草稿</button></div></form>`)}
function reviewAgent(id){if(me().role!=='admin')return;const a=state.agents.find(a=>a.id===id&&a.status==='pending');if(!a)return;modal('审核 Agent',`<h3>${esc(a.name)}</h3><p class="small muted" style="margin:8px 0 18px">${teamName(a.team)} · ${a.category}</p><div class="aside-title">助手介绍</div><div class="document-body">${esc(a.description)}</div><div class="aside-title" style="margin-top:20px">回答规则</div><div class="document-body">${esc(a.rules)}</div><div class="modal-actions"><button class="btn danger" data-action="reject" data-kind="agent" data-id="${a.id}">驳回</button><button class="btn primary" data-action="approve" data-kind="agent" data-id="${a.id}">通过并上线</button></div>`)}
function reviewReasonForm(kind,id,decision){if(me().role!=='admin')return;if(!['doc','agent'].includes(kind)||!['approve','reject'].includes(decision))return;const approve=decision==='approve';const label=approve?'通过原因':'驳回原因';const placeholder=approve?'说明通过依据，例如：来源清楚，内容适合该助手。':'说明需要修改的内容，例如：请补充资料来源。';modal(approve?'填写通过原因':'填写驳回原因',`<form id="review-form" data-kind="${esc(kind)}" data-id="${esc(id)}" data-decision="${decision}"><div class="field"><label for="review-reason">${label} *</label><textarea id="review-reason" name="reason" required maxlength="300" placeholder="${placeholder}"></textarea><small>原因会写入审核记录。去掉空白后不能为空。</small><p id="review-reason-error" class="reason hidden" role="alert"></p></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn ${approve?'primary':'danger'}" type="submit">${approve?'确认通过':'确认驳回'}</button></div></form>`)}
function editDoc(id){const d=state.docs.find(d=>d.id===id&&d.owner===currentProfile&&d.status==='rejected');if(!d)return;modal('修改资料并重新提交',`<form id="edit-doc-form" data-id="${d.id}"><div class="reason">审核意见：${esc(d.reason)}</div><div class="field" style="margin-top:16px"><label for="edit-title">资料标题 *</label><input id="edit-title" name="title" required maxlength="80" value="${esc(d.title)}"></div><div class="field"><label for="edit-source">资料来源 *</label><input id="edit-source" name="source" required maxlength="150" value="${esc(d.source)}"></div>${sourceFields(d,'edit-meta')}<div class="field"><label for="edit-content">资料内容 *</label><textarea id="edit-content" name="content" required maxlength="20000">${esc(d.content)}</textarea></div><div class="modal-actions"><button class="btn" type="button" data-action="close">取消</button><button class="btn primary" type="submit">重新提交审核</button></div></form>`)}
async function sendChat(question){
 const q=question.trim();if(!q||q.length>500||busy)return;
 const r=route(),aid=r.id,source=r.source==='gallery'?'gallery':'',scopeKey=aid+(source?':'+source:'');
 if(aid==='life'&&placesUi.useForAnswer&&Date.parse(placesUi.result?.expiresAt||'')<=Date.now()){placesUi.useForAnswer=false;placesUi.result=null;placesUi.error='地图结果已过期，已取消引用。请重新查询地点后提问。';chatDrafts[scopeKey]=q;render();return toast(placesUi.error)}
 if(ai.configIssue){chatErrors[scopeKey]=ai.configIssue;chatDrafts[scopeKey]=q;render();return toast('请检查项目根目录 .env 中的 CAMPUS_AI_MODEL。')}
 const profile=currentProfile;busy=true;delete chatErrors[scopeKey];delete chatDrafts[scopeKey];pendingChat={aid,scope:source,question:q};render();
 try{const data=await api('chat',{agentId:aid,question:q,cloudConsent:true,...(source?{scope:source}:{}),...(aid==='life'&&placesUi.useForAnswer&&placesUi.result?.contextToken?{placesContext:placesUi.result.contextToken}:{})});if(currentProfile===profile)applyResult(data)}
 catch(e){chatErrors[scopeKey]=e.message;chatDrafts[scopeKey]=q;try{const latest=await api('config');if(currentProfile===profile)applyResult(latest)}catch{}toast(e.message)}finally{busy=false;pendingChat=null;render();const input=document.querySelector('#chat-form textarea');if(input&&route().id===aid){if(chatErrors[scopeKey])input.value=q;input.focus()}}
}
document.addEventListener('change',async e=>{
 if(e.target.id==='profile')return switchProfile(e.target.value);
 if(e.target.id==='board-image'){
  const input=e.target,file=input.files&&input.files[0],note=document.getElementById('board-image-note'),preview=document.getElementById('board-image-preview');
  const clearPreview=()=>{if(preview){preview.removeAttribute('src');preview.classList.add('hidden')}};
  if(!file){clearPreview();if(note)note.textContent='最多 1 张，JPEG / PNG / WebP / GIF，4 MB 以内。不要上传证件、人脸特写等敏感个人信息。';return}
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>4*1024*1024){input.value='';clearPreview();return toast('图片请使用 JPEG、PNG、WebP 或 GIF，且小于 4 MB。')}
  if(note)note.textContent='已选择 1 张。不要上传证件或人脸特写。';
  if(preview&&typeof FileReader!=='undefined'){const reader=new FileReader();reader.onload=()=>{if(input.isConnected&&typeof reader.result==='string'){preview.src=reader.result;preview.classList.remove('hidden')}};reader.readAsDataURL(file)}
  return;
 }
 if(e.target.id==='doc-file'){
  const input=e.target,file=input.files[0];if(!file)return;const ext=file.name.split('.').pop().toLowerCase();
  if(file.size>2*1024*1024||!['txt','md','pdf','docx'].includes(ext)){input.value='';return toast('请选择 2 MB 以内的 TXT、MD、PDF 或 DOCX 文件。')}
  const form=input.closest('form');
  if(['txt','md'].includes(ext)){try{const content=await file.text();if(!input.isConnected||input.files[0]!==file)return;if(content.length>20000){input.value='';return toast('文字超过 20,000 字，请截取后提交。')}form.elements.content.value=content;document.getElementById('file-note').textContent='已读取文字，请检查后提交。本机只保存正文和文件名。'}catch{input.value='';toast('文件读取失败，请粘贴文字。')}}
  else document.getElementById('file-note').textContent='已选择 '+file.name+'。PDF / Word 不会解析，请把摘要粘贴到正文。';
  if(input.isConnected&&!form.elements.title.value)form.elements.title.value=file.name.replace(/\.[^.]+$/,'').slice(0,80);
 }
});
// Trackpad pinch is a ctrl+wheel on Chrome and Firefox, and a gesture event on
// Safari. Cancel that default only while the event target is the poster itself.
// The drawer, the menu button, business pages, and Ctrl/Cmd +/- are untouched.
// This does not change the viewport meta and cannot stop an OS zoom gesture.
function posterPinchTarget(target){
 if(route().page!=='home')return false;
 const node=target&&target.nodeType===3?target.parentElement:target;
 return !!node?.closest?.('.poster-stage');
}
function blockPosterPinch(e){
 if(!posterPinchTarget(e.target))return;
 if(e.cancelable===false)return;
 e.preventDefault();
}
document.addEventListener('wheel',e=>{
 if(!e.ctrlKey)return;
 blockPosterPinch(e);
},{passive:false,capture:true});
document.addEventListener('touchmove',e=>{
 if(!e.touches||e.touches.length<2)return;
 blockPosterPinch(e);
},{passive:false,capture:true});
document.addEventListener('gesturestart',blockPosterPinch,{passive:false,capture:true});
document.addEventListener('gesturechange',blockPosterPinch,{passive:false,capture:true});
document.addEventListener('click',async e=>{
 const menuBtn=e.target.closest?.('.menu-square');
 const inMenu=e.target.closest?.('#site-menu');
 const overlayNav=!navDocked();
 if(menuOpen&&overlayNav&&!menuBtn&&!inMenu){setMenu(false);if(e.target.closest?.('.poster-stage'))return}
 if(inMenu&&e.target.closest?.('a[href^="#"]')){if(overlayNav)setMenu(false);return}
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset;
 if(a.action==='menu'){setMenu(!menuOpen);return}
 if(a.action==='enter-platform')return enterPlatform();
 if(a.action==='close'||a.action==='board-decline')return closeModal();
 if(a.action==='nav')return go(a.page);
 if(a.action==='auth-open'){if(!account)goLogin();return}
 if(a.action==='auth-tab'){authMode=a.value==='register'?'register':'login';authForgot=false;return render()}
 if(a.action==='auth-peek'){authShowPassword=!authShowPassword;return render()}
 if(a.action==='auth-forgot'){authForgot=true;return render()}
 if(a.action==='chat'){const source=a.source==='gallery'?'gallery':'',key=a.id+(source?':'+source:'');delete chatErrors[key];return go('chat',a.id,source)}
 if(a.action==='prefill-chat'){const id=a.id;chatDrafts[id]=a.value||'';delete chatErrors[id];return go('chat',id)}
 if(a.action==='category'){category=a.value;return render()}
 if(a.action==='board-date-filter'){const value=['all','today','week'].includes(a.value)?a.value:'all';boardDateFilter=value;if(value!=='custom')boardDateCustom='';return render()}
 if(a.action==='board-detail')return boardDetailModal(a.id,a.context==='mine'?'mine':'board');
 if(a.action==='board-help')return boardHelpModal(a.id);
 if(a.action==='board-help-login'){closeModal();goLogin();return toast('请先登录，再提交帮助。')}
 if(a.action==='board-resolve')return boardResolveModal(a.id);
 if(a.action==='board-delete')return boardDeleteModal(a.id);
 if(busy)return toast('请求处理中，请稍等。');
 if(a.action==='admin-user-status'){try{const r=await api('admin/users/status',{studentId:a.id,status:Number(a.status)});applyResult(r);render();toast(Number(a.status)===1?'账号已启用':'账号已禁用')}catch(err){toast(err.message)}return}
 if(a.action==='admin-user-reset'){adminResetPasswordModal(a.id);return}
 if(a.action==='admin-import'){
  const box=document.getElementById('admin-import-csv');
  try{const r=await api('admin/users/import',{csv:box?box.value:''});applyResult(r);render();toast('已导入 '+r.created+' 个账号'+(r.errors?.length?'，'+r.errors.length+' 条失败':''));if(r.errors?.length)modal('部分账号导入失败','<ul class="info-list">'+r.errors.slice(0,8).map(x=>'<li>'+esc(x.line)+'：'+esc(x.error)+'</li>').join('')+'</ul><div class="modal-actions"><button class="btn primary" data-action="close">知道了</button></div>')}catch(err){toast(err.message)}
  return;
 }
 if(a.action==='switch'){if(!demoIdentities)return toast('当前为公开访问，不能切换演示身份。');return switchProfile(a.value)}
 if(a.action==='places-config')return placesConfigDialog();
 if(a.action==='places-admin'){if(!demoIdentities)return toast('当前为公开访问，不能切换演示身份。');await switchProfile('admin');return placesConfigDialog()}
 if(a.action==='places-centers')return searchPlaces(true);
 if(a.action==='team-tab'){teamTab=a.value;return render()}
 if(a.action==='review-tab'){reviewTab=a.value;return render()}
 if(a.action==='new-agent')return agentForm();
 if(a.action==='edit-agent')return agentForm(a.id);
 if(a.action==='submit-agent')return perform({action:'submitAgent',id:a.id},'已提交审核。');
 if(a.action==='view-doc')return viewDoc(a.id);
 if(a.action==='edit-doc')return editDoc(a.id);
 if(a.action==='review-agent')return reviewAgent(a.id);
 if(a.action==='approve')return reviewReasonForm(a.kind,a.id,'approve');
 if(a.action==='reject')return reviewReasonForm(a.kind,a.id,'reject');
 if(a.action==='suggest')return sendChat(a.value);
 if(a.action==='board-day'){setBoardDay(a.value==='tomorrow'?'tomorrow':'today');return}
 if(a.action==='board-hours'){applyBoardHours(a.value);return}
 if(a.action==='board-offer'){openOfferModal([{listingId:a.id,title:a.title,display:a.title,ownerName:a.owner,type:a.type,windowText:a.expires,image:a.image}]);return}
 if(a.action==='board-thread'){try{const data=await api('board/thread?threadId='+encodeURIComponent(a.thread));applyResult(data);openDmModal(data.thread,null,a.thread)}catch(err){toast(err.message)}return}
 if(a.action==='board-refresh'){loadBoard().then(()=>{if(route().page==='board')render()});return}
 if(a.action==='board-report'){reportModal(a.id);return}
 if(a.action==='confirm-board-resolve'){
  try{applyResult(await api('board/resolve',{id:a.id}));await loadBoard();closeModal();render();toast('已标记为已解决')}catch(err){toast(err.message)}
  return;
 }
 if(a.action==='board-approve-listing'){try{const data=await api('board/review-listing',{id:a.id,decision:'approve'});applyResult(data);render();toast('已通过，登记现在生效')}catch(err){toast(err.message)}return}
 if(a.action==='board-reject-listing'){boardReviewModal(a.id);return}
 if(a.action==='board-report-resolve'){try{const data=await api('board/report-resolve',{id:a.id,decision:a.decision});applyResult(data);closeModal();render();toast(a.decision==='take_down'?'已下架该登记':'已忽略举报')}catch(err){toast(err.message)}return}
 if(a.action==='board-accept'){
  if(!account){closeModal();goLogin();return toast('请先登录，再和对方开聊。')}
  try{const data=await api('board/open',{listingId:a.id});openDmModal(data.thread,a.id)}catch(err){toast(err.message)}
  return;
 }
 if(a.action==='auth-logout'){try{applyResult(await api('auth/logout',{}));toast('已退出学号账号');menuOpen=false;boardNeedsRefresh=true;render()}catch(e){toast(e.message)}return}
 if(a.action==='board-admin-takedown'){if(!isSuperAdminUI())return toast('该操作需要管理员权限。');return modal('确认下架互助登记',`<p>下架后，这条已生效登记不再出现在有效列表和匹配结果里。没有举报也可以下架。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn danger" data-action="confirm-board-admin-takedown" data-id="${esc(a.id)}">确认下架</button></div>`)}
 if(a.action==='confirm-board-admin-takedown'){if(!isSuperAdminUI())return toast('该操作需要管理员权限。');try{applyResult(await api('board/takedown',{id:a.id,asAdmin:true}));closeModal();toast('已下架');boardNeedsRefresh=true;render()}catch(e){toast(e.message)}return}
 if(a.action==='board-takedown'){try{applyResult(await api('board/takedown',{id:a.id}));toast('已下架');boardNeedsRefresh=true;render()}catch(e){toast(e.message)}return}
 if(a.action==='confirm-board-delete'){
  try{await api('board/delete',{id:a.id});await loadBoard();closeModal();render();toast('已删除')}catch(err){toast(err.message)}
  return;
 }
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
document.addEventListener('change',async e=>{
 const sel=e.target.closest?.('[data-action="admin-user-role"]');
 if(!sel)return;
 try{const r=await api('admin/users/role',{studentId:sel.dataset.id,role:sel.value});applyResult(r);render();toast('角色已更新')}catch(err){toast(err.message);render()}
});
document.addEventListener('submit',async e=>{
 const f=e.target;const authForm=f?.dataset?.authForm==='1'||f.id==='auth-form'||f.id==='auth-page-form'||f.id==='nick-form'||['pwd-form','admin-user-form','admin-reset-form'].includes(f.id);if(!authForm&&!['upload-form','agent-form','review-form','edit-doc-form','chat-form','places-form','places-config-form','auth-form','auth-page-form','nick-form','board-form','board-help-form','dm-form','board-report-form','board-review-form'].includes(f.id))return;e.preventDefault();if(busy&&!authForm&&!['auth-form','auth-page-form','nick-form','board-form','dm-form'].includes(f.id))return;
 const fd=new FormData(f),get=n=>String(fd.get(n)||'').trim();
 if(f.id==='chat-form')return sendChat(get('question'));
 if(f.id==='pwd-form'){
  try{applyResult(await api('auth/change-password',{oldPassword:get('oldPassword'),newPassword:get('newPassword')}));toast('密码已修改');menuOpen=defaultMenuOpen();location.hash='#'+homePage();render()}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='admin-user-form'){
  try{
   const r=await api('admin/users',{username:get('username'),studentId:get('studentId'),displayName:get('displayName'),password:get('password'),role:get('role')});
   applyResult(r);render();
   modal('账号已创建','<p>登录账号：'+esc(r.created?.username||r.created?.studentId||'')+'</p><p>初始密码：<code>'+esc(r.created?.initialPassword||'')+'</code></p><p class="small muted">只显示一次，请线下发给同学；首次登录必须改密。</p><div class="modal-actions"><button class="btn primary" data-action="close">知道了</button></div>');
  }catch(err){toast(err.message)}
  return;
 }
 if(f.id==='admin-reset-form'){
  try{
   const r=await api('admin/users/reset-password',{studentId:f.dataset.id,password:get('password')});
   applyResult(r);closeModal();render();
   modal('密码已重置','<p>初始密码：<code>'+esc(r.initialPassword||'')+'</code></p><p class="small muted">只显示一次，请线下发给同学；下次登录必须改密。</p><div class="modal-actions"><button class="btn primary" data-action="close">知道了</button></div>');
  }catch(err){toast(err.message)}
  return;
 }
 if(f.id==='auth-page-form'){
   const mode=f.dataset.mode==='register'?'register':'login';
   try{
    applyResult(await api('auth/'+mode,{username:get('username'),password:get('password'),displayName:get('displayName'),remember:fd.has('remember')}));
    menuOpen=defaultMenuOpen();
    const next=takeAuthReturn();
    toast(mode==='register'?'注册成功，已登录':'登录成功');
    boardNeedsRefresh=true;
    if(next)location.hash=next;else location.hash='#'+homePage();
    render();
   }catch(err){toast(err.message)}
   return;
  }
  if(f.id==='nick-form'){
   try{applyResult(await api('auth/nickname',{displayName:get('displayName')}));toast('昵称已保存');render()}catch(err){toast(err.message)}
   return;
  }
  if(authForm){
   const mode=e.submitter?.dataset?.auth||'login';
   try{applyResult(await api('auth/'+mode,{studentId:get('studentId'),password:get('password'),displayName:get('displayName')}));if(f.closest?.('dialog')&&document.getElementById('modal')?.open)closeModal();toast(mode==='register'?'注册成功，已登录':'登录成功');boardNeedsRefresh=true;render()}catch(err){toast(err.message)}
   return;
  }
 if(f.id==='board-help-form'){
  const button=f.querySelector('button[type=submit]');
  if(button)button.disabled=true;
  try{
   await api('board/help',{listingId:f.dataset.id,message:get('message'),contact:get('contact')});
   await loadBoard();
   closeModal();render();toast('已提交帮助，对方会看到你的信息。');
  }catch(err){toast(err.message)}
  finally{if(button&&button.isConnected)button.disabled=false}
  return;
 }
 if(f.id==='board-form'){
  const longTerm=get('windowMode')==='long';
  if(!account)return toast('请先登录后再登记。');
  if(!longTerm){
   const day=get('windowDay')||'today';
   if(day!=='today'&&day!=='tomorrow'&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return toast('请选择今天、明天或某一天。');
   if(!get('windowStartTime')||!get('windowEndTime'))return toast('请设定开始和结束时刻，或改选长期有效。');
   if(/^\d{4}-\d{2}-\d{2}$/.test(day)){
    const today=shanghaiParts(Date.now());
    if(day>dateKeyPlus(today.year+'-'+today.month+'-'+today.day,90))return toast('时段最长 90 天；更久请改选长期有效。');
   }
  }
  const button=f.querySelector('button[type=submit]');
  if(button)button.disabled=true;
  try{
   let image='';
   const file=f.querySelector('#board-image')?.files?.[0];
   if(file){
    const ok=['image/jpeg','image/png','image/webp','image/gif'].includes(file.type);
    if(!ok||file.size>4*1024*1024)throw new Error('图片请使用 JPEG、PNG、WebP 或 GIF，且小于 4 MB。');
    const up=await fetch('/api/board/image',{method:'POST',headers:{'Content-Type':file.type,'X-Campus-Client':'1'},body:file});
    let uploaded={};try{uploaded=await up.json()}catch{uploaded={}}
    if(!up.ok)throw new Error(uploaded.error||'图片上传失败。');
    image=listingImageUrl(uploaded.image&&uploaded.image.url);
    if(!image)throw new Error('图片上传失败。');
   }
   const payload={type:get('type'),description:get('description'),contact:get('contact'),longTerm,windowMode:longTerm?'long':'span'};
   if(image)payload.image=image;
   if(!longTerm){payload.windowDay=get('windowDay')||'today';payload.windowStartTime=get('windowStartTime');payload.windowEndTime=get('windowEndTime')}
   applyResult(await api('board/create',payload));
   toast(boardReviewMode?'已提交，等待管理员审核通过后才会生效':(longTerm?'已登记，长期有效，直到你下架':'已登记，只会在设定的时段内被匹配'));
   boardNeedsRefresh=true;render();
  }catch(err){toast(err.message)}
  finally{if(button&&button.isConnected)button.disabled=false}
  return;
 }
 if(f.id==='dm-form'){
  const threadId=f.dataset.thread||'';
  try{
   const data=threadId?await api('board/reply',{threadId,text:get('text')}):await api('board/dm',{listingId:f.dataset.id,text:get('text')});
   applyResult(data);
   if(threadId){await loadBoard();render()}
   openDmModal({listing:data.thread?.listing||data.listing,peer:data.thread?.peer||data.peer,messages:(data.thread?.messages||data.messages||[])},threadId?'':f.dataset.id,threadId||null);
   toast('已发送');
  }catch(err){toast(err.message)}
  return;
 }
 if(f.id==='board-report-form'){
  try{await api('board/report',{listingId:f.dataset.id,reason:get('reason')});closeModal();toast('已提交举报，管理员会处理。')}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='board-review-form'){
  try{applyResult(await api('board/review-listing',{id:f.dataset.id,decision:'reject',reason:get('reason')}));closeModal();render();toast('已驳回，原因已记录')}catch(err){toast(err.message)}
  return;
 }
 if(f.id==='places-form')return searchPlaces();
 if(f.id==='places-config-form')return savePlacesForm(f);
 if(f.id==='upload-form')return perform({action:'upload',title:get('title'),agent:get('agent'),source:get('source'),sourceUrl:get('sourceUrl'),publishedAt:get('publishedAt'),collectedAt:get('collectedAt'),sourceKind:get('sourceKind'),content:get('content'),filename:f.querySelector('input[type=file]').files[0]?.name||'',cloudAllowed:fd.has('consent')},'已提交到本机后台，等待审核。');
 if(f.id==='agent-form')return perform({action:'saveAgent',id:f.dataset.id||undefined,name:get('name'),description:get('description'),rules:get('rules'),category:get('category')},'已保存草稿，请提交审核。');
 if(f.id==='review-form'){const reason=get('reason');const notice=document.getElementById('review-reason-error');if(!reason){if(notice){notice.textContent='请填写审核原因。';notice.classList.remove('hidden')}return toast('请填写审核原因。')}const decision=f.dataset.decision==='approve'?'approve':'reject';const kind=f.dataset.kind;return perform({action:'review',kind,id:f.dataset.id,decision,reason},decision==='reject'?'已驳回并记录原因。':kind==='doc'?'资料已审核入库，并记下通过原因。':'Agent 已上线，并记下通过原因。');}
 if(f.id==='edit-doc-form')return perform({action:'editDoc',id:f.dataset.id,title:get('title'),source:get('source'),sourceUrl:get('sourceUrl'),publishedAt:get('publishedAt'),collectedAt:get('collectedAt'),sourceKind:get('sourceKind'),content:get('content')},'已修改并重新提交。');
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&menuOpen){setMenu(false);return}
 if(e.target.matches?.('#chat-form textarea')&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.form.requestSubmit()}
 if(route().page!=='home')return;
 if(document.getElementById('modal')?.open)return;
 if(e.target.closest?.('input,textarea,select'))return;
 if(e.key==='Tab'||e.key==='Shift'||e.key==='Control'||e.key==='Alt'||e.key==='Meta')return;
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(/^F\d{1,2}$/.test(e.key))return;
 e.preventDefault();
 enterPlatform();
});
function searchInput(e){
 if(e.target.id!=='search'||e.isComposing)return;const pos=e.target.selectionStart;query=e.target.value;render();const el=document.getElementById('search');el.focus();el.setSelectionRange(pos,pos)
}
document.addEventListener('input',e=>{
 if(e.target.matches?.('#chat-form textarea')){chatDrafts[route().id]=e.target.value;return}
 if(e.target.id==='city-keyword')document.getElementById('city-map-link').href=cityMapUrl(e.target.value);
});
document.addEventListener('input',searchInput);document.addEventListener('compositionend',searchInput);
document.addEventListener('change',e=>{
 if(e.target.name==='windowMode')return setBoardMode(e.target.value);
 if(e.target.id!=='board-date')return;
 const value=String(e.target.value||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))setBoardDay(value);
 else setBoardDay('today');
});
document.addEventListener('change',e=>{
 if(e.target.id!=='board-date-filter')return;
 const value=String(e.target.value||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){boardDateFilter='custom';boardDateCustom=value}
 else{boardDateFilter='all';boardDateCustom=''}
 render();
});
document.addEventListener('change',e=>{
 if(e.target.id!=='board-start-time'&&e.target.id!=='board-end-time')return;
 setBoardHoursActive(null);
 const start=document.getElementById('board-start-time'),end=document.getElementById('board-end-time');
 updateBoardHoursNote(start&&end?'自定义时段：'+start.value+'—'+end.value:'自定义时段');
});
document.addEventListener('visibilitychange',()=>syncPosterAutoplay(false));
window.addEventListener('hashchange',()=>{const page=route().page;if(page==='home'||page==='login')menuOpen=false;if(page==='board'||page==='help'||page==='mine')boardNeedsRefresh=true;render();window.scrollTo(0,0)});
boot();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'list_campus_agents',title:'查看已上线校园助手',description:'只读列出当前本地平台已上线的助手与已审核资料数。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('不接受参数');return state.agents.filter(a=>a.status==='published').map(a=>({id:a.id,name:a.name,documents:state.docs.filter(d=>d.agent===a.id&&d.status==='approved').length}))}},{signal:lifecycle.signal})).catch(()=>{})}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}

