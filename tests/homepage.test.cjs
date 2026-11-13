'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {createApp}=require('../lib/backend.cjs');

const appSource=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');

function classList(initial=''){
 const names=new Set(String(initial).split(/\s+/).filter(Boolean));
 return {
  contains:name=>names.has(name),
  add(...xs){for(const name of xs)names.add(name)},
  remove(...xs){for(const name of xs)names.delete(name)},
  toggle(name,on){const next=on===undefined?!names.has(name):!!on;if(next)names.add(name);else names.delete(name);return next}
 };
}
function matches(node,sel){
 if(sel==='[data-action]')return !!(node.dataset&&node.dataset.action);
 if(sel==='.menu-square')return node.classList.contains('menu-square');
 if(sel==='.poster-stage')return node.classList.contains('poster-stage');
 if(sel==='#site-menu')return node.id==='site-menu';
 if(sel==='a'||sel==='a[href]')return node.tag==='a';
 if(sel==='a[href^="#"]')return node.tag==='a'&&String(node.href||'').startsWith('#');
 if(sel.startsWith('.'))return node.classList.contains(sel.slice(1));
 return false;
}
function node(className,extra={}){
 const el={
  tag:extra.tag||'div',
  id:extra.id||'',
  href:extra.href||'',
  className,
  classList:classList(className),
  dataset:extra.dataset||{},
  parent:null,
  textContent:extra.text||'',
  attributes:{},
  children:[],
  setAttribute(key,value){this.attributes[key]=String(value)},
  getAttribute(key){return Object.hasOwn(this.attributes,key)?this.attributes[key]:null},
  removeAttribute(key){delete this.attributes[key]},
  focus(){this.focused=true},
  appendChild(child){child.parent=this;this.children.push(child);return child},
  remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null},
  closest(sel){let cur=this;while(cur){if(matches(cur,sel))return cur;cur=cur.parent}return null},
  querySelector(sel){return walk(this,sel)},
  querySelectorAll(sel){const found=[];collect(this,sel,found);return found}
 };
 return el;
}
function walk(root,sel){
 if(matches(root,sel))return root;
 for(const child of root.children||[]){const found=walk(child,sel);if(found)return found}
 return null;
}
function collect(root,sel,found){
 if(matches(root,sel))found.push(root);
 for(const child of root.children||[])collect(child,sel,found);
}

function loadApp({hash='#home',manifest}={}){
 const listeners={};
 const shell=node('shell shell-home');
 const button=node('menu-square',{tag:'button',dataset:{action:'menu'}});
 const menu=node('sidebar',{id:'site-menu'});
 const close=node('menu-close',{tag:'button',dataset:{action:'menu-close'}});
 const brand=node('brand',{tag:'a',href:'#home'});
 const stage=node('poster-stage');
 const frame=node('poster-frame tone-dawn',{id:'poster-frame'});
 const photo={
  classList:classList('poster-photo'),
  className:'poster-photo',
  parent:frame,
  dataset:{},
  attributes:{},
  children:[],
  complete:false,
  naturalWidth:0,
  setAttribute(key,value){this.attributes[key]=String(value)},
  getAttribute(key){return Object.hasOwn(this.attributes,key)?this.attributes[key]:null},
  removeAttribute(key){delete this.attributes[key]},
  closest(sel){return frame.closest(sel)},
  set src(value){this.attributes.src=value;this.complete=true;this.naturalWidth=0;if(this.onerror)this.onerror()}
 };
 photo.classList.contains=name=>name==='poster-photo'||frame.classList.contains(name);
 const title=node('poster-title');
 const line=node('poster-line');
 const count=node('poster-count',{text:'01 / 02'});
 const dots=[0,1].map(index=>node('poster-dot'+(index===0?' is-current':''),{tag:'button',dataset:{action:'poster-go',index:String(index)}}));
 const copy=node('poster-copy');
 const hit=node('poster-hit',{tag:'button',dataset:{action:'home-menu'}});
 const prev=node('poster-arrow prev',{tag:'button',dataset:{action:'poster-prev'}});
 const next=node('poster-arrow next',{tag:'button',dataset:{action:'poster-next'}});
 copy.appendChild(title);copy.appendChild(line);
 frame.appendChild(photo);frame.appendChild(copy);frame.appendChild(hit);
 const dotWrap=node('poster-dots');
 for(const dot of dots)dotWrap.appendChild(dot);
 stage.appendChild(frame);stage.appendChild(prev);stage.appendChild(next);stage.appendChild(dotWrap);stage.appendChild(count);
 menu.appendChild(close);menu.appendChild(brand);
 shell.appendChild(button);shell.appendChild(menu);shell.appendChild(stage);
 const byId={app:node('app'),'site-menu':menu,'poster-frame':frame,toast:node('toast'),modal:{open:false,innerHTML:'',classList:classList(),setAttribute(){},close(){this.open=false}}};
 const clock=fakeClock();
 const document={
  hidden:false,
  visibilityState:'visible',
  addEventListener(type,fn){(listeners[type]||=[]).push(fn)},
  getElementById(id){return byId[id]||null},
  querySelector(sel){
   if(sel==='.shell')return shell;
   if(sel==='.menu-square')return button;
   if(sel==='.poster-stage')return stage;
   return shell.querySelector(sel);
  },
  querySelectorAll(sel){return shell.querySelectorAll(sel)}
 };
 const location={hash,origin:'http://127.0.0.1:4173',pathname:'/'};
 const context={
  document,location,console,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,URL,URLSearchParams,AbortController,Promise,
  requestAnimationFrame(fn){fn()},
  navigator:{platform:'Linux',userAgent:'node'},
  history:{replaceState(){}},
  window:{
   addEventListener(type,fn){(listeners[type]||=[]).push(fn)},
   scrollTo(){},
   matchMedia(){return {matches:true}},
   getSelection(){return {isCollapsed:true,toString(){return ''}}}
  },
  fetch:async url=>{
   if(manifest&&String(url).includes('/homepage-posters/manifest.json'))return {ok:true,json:async()=>manifest};
   return {ok:false,json:async()=>({})};
  }
 };
 context.globalThis=context;
 context.window.matchMedia=()=>({matches:true});
 vm.createContext(context);
 vm.runInContext(appSource+`
globalThis.__state=()=>({menu:menuOpen,index:posterIndex,page:route().page,home:shell(homePoster()),catalog:posterCatalog});
globalThis.__at=index=>{posterIndex=index;return homePoster()};
`,context);
 return {context,listeners,clock,button,stage,menu,brand,frame,title,line,count,dots,photo,hit,prev,next};
}
function fakeClock(){
 const pending=new Map();
 let seq=1;
 return {
  setTimeout(fn,ms){const id=seq++;pending.set(id,{fn,ms:Number(ms)||0});return id},
  clearTimeout(id){pending.delete(id)},
  count(ms){let n=0;for(const item of pending.values())if(ms===undefined||item.ms===ms)n++;return n},
  async fire(ms){
   const hits=[...pending.entries()].filter(([,item])=>item.ms===ms);
   for(const [id,item] of hits){pending.delete(id);await item.fn()}
   return hits.length;
  }
 };
}

function raw(port,route,method='GET'){
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method,path:route},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });
  req.on('error',reject);req.end();
 });
}

test('an empty visit opens the poster homepage and sections stay routable',()=>{
 assert.match(appSource,/if\(!location\.hash\|\|location\.hash==='#'\)history\.replaceState\(null,'','#home'\)/);
 assert.doesNotMatch(appSource,/history\.replaceState\(null,'','#'\+homePage\(\)\)/);
 const {context}=loadApp({hash:''});
 assert.equal(context.__state().page,'board');
 context.location.hash='#home';
 assert.equal(context.__state().page,'home');
 const home=context.__state().home;
 assert.match(home,/class="menu-square"/);
 assert.match(home,/你的难题不必独自面对/);
 assert.match(home,/在校园里，让一次举手之劳，成为彼此的光。/);
 assert.match(appSource,/身边有人，就不算独自/);
 assert.match(context.__at(1),/身边有人，就不算独自/);
 assert.match(context.__at(0),/你的难题不必独自面对/);
});

test('poster homepage is a click-through frame and the menu starts closed',()=>{
 const {context}=loadApp({hash:'#home'});
 assert.equal(context.__state().page,'home');
 const home=context.__state().home;
 assert.match(home,/class="menu-square"/);
 assert.match(home,/aria-expanded="false"/);
 assert.match(home,/aria-hidden="true"/);
 assert.doesNotMatch(home,/点击画面，切换下一张/);
 assert.doesNotMatch(home,/校集|home-mark/);
 assert.match(home,/aria-label="回到首页"/);
 assert.match(home,/brand-mark/);
 assert.match(home,/01 \/ 02/);
 assert.match(home,/class="poster-hit" data-action="home-menu"/);
 assert.match(home,/aria-controls="site-menu" aria-label="打开菜单"/);
 assert.match(home,/aria-label="上一张"/);
 assert.match(home,/aria-label="下一张"/);
 assert.match(appSource,/const POSTER_AUTOPLAY_MS=6000/);
 assert.match(home,/互助通达/);
 assert.match(home,/与助手对话/);
 assert.match(home,/找助手/);
 assert.match(home,/资料贡献/);
 assert.match(home,/同学互助/);
 assert.match(home,/问同学，或问校园助手。/);
 assert.match(home,/href="#home"/);
 assert.match(home,/src="\/homepage-posters\/01\.jpg"/);
 assert.doesNotMatch(home,/class="topbar"/);
 assert.doesNotMatch(home,/poster-credit/);
 assert.doesNotMatch(home,/sidebar is-open|menu-open/);
 const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
 assert.match(css,/\.poster-photo\{[^}]*object-fit:cover/);
 assert.doesNotMatch(css,/\.poster-photo\{[^}]*object-fit:contain/);
 assert.match(css,/\.menu-square\{[^}]*width:56px;height:56px/);
 assert.match(css,/\.shell>\.sidebar\{[^}]*height:100dvh/);
 assert.match(css,/\.shell>\.sidebar\{[^}]*border-radius:0/);
 assert.match(css,/\.shell>\.sidebar\{[^}]*transform:translateX\(-100%\)/);
 assert.match(css,/\.shell>\.sidebar\.is-open\{[^}]*transform:translateX\(0\)/);
 assert.doesNotMatch(css,/\.shell>\.sidebar\.is-open\{[^}]*translateX\(16px\)/);
 assert.match(css,/prefers-reduced-motion:reduce\)\{[\s\S]*?\.shell>\.sidebar\{transition:none\}/);
});

test('the menu square toggles without advancing the poster, and the poster loops',async()=>{
 const {context,listeners,button,stage,menu,hit,prev,title}=loadApp({hash:'#home'});
 const click=target=>listeners.click[0]({target});
 assert.equal(context.__state().index,0);
 await click(button);
 assert.equal(context.__state().menu,true);
 assert.equal(context.__state().index,0);
 await click(stage.querySelector('.poster-dot'));
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 await click(hit);
 assert.equal(context.__state().menu,true);
 assert.equal(context.__state().index,0);
 await click(hit);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 await click(button);
 assert.equal(context.__state().menu,true);
 assert.equal(context.__state().index,0);
 await click(button);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 await click(prev);
 assert.equal(context.__state().index,1);
 assert.equal(context.__state().menu,false);
 await click(prev);
 assert.equal(context.__state().index,0);
 await click(title);
 assert.equal(context.__state().menu,true);
 assert.equal(context.__state().index,0);
 await click(menu.querySelector('.menu-close'));
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
});

test('homepage autoplay keeps each title with its photo and pauses without stacking timers',async()=>{
 const files=['01.jpg','02.jpg','03.jpg','04.jpg','05.jpg','06.jpg'];
 const loaded=loadApp({hash:'#home',manifest:{posters:files.map((file,i)=>({file,title:'第'+(i+1)+'张',line:'短句'+(i+1)}))}});
 const {context,listeners,clock,button,stage,menu,brand,title,hit,next}=loaded;
 const click=target=>listeners.click[0]({target});
 await vm.runInContext('ensurePosters()',context);
 vm.runInContext('paintPoster();syncPosterAutoplay(false)',context);
 assert.equal(title.textContent,'第1张');
 assert.equal(clock.count(6000),1);
 await clock.fire(6000);
 assert.equal(context.__state().index,1);
 assert.equal(title.textContent,'第2张');
 assert.equal(clock.count(6000),1);
 await clock.fire(6000);
 await clock.fire(6000);
 await clock.fire(6000);
 await clock.fire(6000);
 assert.equal(context.__state().index,5);
 assert.equal(title.textContent,'第6张');
 assert.equal(clock.count(6000),1);
 await clock.fire(6000);
 assert.equal(context.__state().index,0);
 assert.equal(title.textContent,'第1张');
 assert.equal(clock.count(6000),1);

 await click(button);
 assert.equal(context.__state().menu,true);
 assert.equal(context.__state().index,0);
 assert.equal(clock.count(6000),0);
 await clock.fire(6000);
 assert.equal(context.__state().index,0);
 await listeners.keydown[0]({key:'ArrowRight',target:stage});
 assert.equal(context.__state().index,0);
 await listeners.keydown[0]({key:'Escape',target:stage});
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 assert.equal(clock.count(6000),1);

 await click(hit);
 assert.equal(context.__state().menu,true);
 await click(stage);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 await click(next);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,1);
 assert.equal(title.textContent,'第2张');
 assert.equal(clock.count(6000),1);
 await click(stage.querySelectorAll('.poster-dot')[0]);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);

 context.document.hidden=true;
 context.document.visibilityState='hidden';
 listeners.visibilitychange[0]();
 assert.equal(clock.count(6000),0);
 await clock.fire(6000);
 assert.equal(context.__state().index,0);
 listeners.visibilitychange[0]();
 assert.equal(clock.count(6000),0);
 context.document.hidden=false;
 context.document.visibilityState='visible';
 listeners.visibilitychange[0]();
 listeners.visibilitychange[0]();
 assert.equal(clock.count(6000),1);

 context.window.getSelection=()=>({isCollapsed:false,toString(){return '第1张'}});
 await click(title);
 assert.equal(context.__state().menu,false);
 context.window.getSelection=()=>({isCollapsed:true,toString(){return ''}});
 const link=node('poster-link',{tag:'a',href:'#gallery'});
 stage.appendChild(link);
 await click(link);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);

 await click(button);
 await click(brand);
 assert.equal(context.__state().menu,false);
 assert.equal(context.__state().index,0);
 const nav=node('nav-link',{tag:'a',href:'#board'});
 menu.appendChild(nav);
 await click(button);
 await click(nav);
 assert.equal(context.__state().menu,false);
 context.location.hash='#board';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'board');
 assert.equal(clock.count(6000),0);
 await clock.fire(6000);
 assert.equal(context.__state().index,0);
 context.location.hash='#home';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'home');
 assert.equal(clock.count(6000),1);
 await clock.fire(6000);
 assert.equal(context.__state().index,1);
 assert.equal(title.textContent,'第2张');
 assert.equal(clock.count(6000),1);
 await click(button);
 await click(button);
 await click(button);
 await click(button);
 assert.equal(context.__state().menu,false);
 assert.equal(clock.count(6000),1);
});

test('a local manifest can add a photographer credit and cannot point outside the poster directory',async()=>{
 const loaded=loadApp({hash:'#home',manifest:{posters:[
  {file:'01.jpg',credit:'林间'},
  {file:'../store.json',title:'',line:'',credit:''},
  {file:'https://example.com/secret.jpg',credit:'不该出现'}
 ]}});
 const after=await vm.runInContext('ensurePosters()',loaded.context);
 assert.equal(after.length,3);
 assert.equal(after[0].credit,'林间');
 assert.equal(after[0].title,'你的难题不必独自面对');
 assert.equal(after[0].image,'/homepage-posters/01.jpg');
 assert.equal(after[1].image,'');
 assert.equal(after[2].image,'');
 assert.equal(after[2].credit,'不该出现');
 const html=loaded.context.__at(0);
 assert.match(html,/林间/);
 assert.match(html,/poster-credit/);
 const blank=loadApp({hash:'#home'});
 const fallback=await vm.runInContext('ensurePosters()',blank.context);
 assert.equal(fallback[0].credit,'');
 assert.equal(fallback[1].image,'/homepage-posters/02.jpg');
 assert.equal(vm.runInContext('posterSlot(0,1,2)',blank.context),1);
 assert.equal(vm.runInContext('posterSlot(1,1,2)',blank.context),0);
 assert.equal(vm.runInContext('posterSlot(0,-1,2)',blank.context),1);
});

test('a manifest may list six posters and the carousel still loops',async()=>{
 const files=['01.jpg','02.jpg','03.jpg','04.jpg','05.jpg','06.jpg'];
 const loaded=loadApp({hash:'#home',manifest:{posters:files.map((file,i)=>({file,title:'第'+(i+1)+'张',line:'短句',credit:i===3?'署名':''}))}});
 const after=await vm.runInContext('ensurePosters()',loaded.context);
 assert.equal(after.length,6);
 assert.deepEqual(after.map(item=>item.image),files.map(file=>'/homepage-posters/'+file));
 assert.equal(after[3].credit,'署名');
 assert.equal(vm.runInContext('posterSlot(5,1,6)',loaded.context),0);
 const html=loaded.context.__at(5);
 assert.match(html,/06 \/ 06/);
 assert.equal((html.match(/class="poster-dot(?: |")/g)||[]).length,6);
});

test('poster layout fields override the rotation and invalid values fall back',async()=>{
 const loaded=loadApp({hash:'#home',manifest:{posters:[
  {file:'01.jpg',title:'甲',line:'一',align:'right',place:'top',measure:'narrow',focus:'left'},
  {file:'02.jpg',title:'乙',line:'二',align:'diagonal',place:'',focus:'nope'},
  {file:'03.jpg',title:'丙',line:'三'}
 ]}});
 const after=await vm.runInContext('ensurePosters()',loaded.context);
 assert.deepEqual([after[0].align,after[0].place,after[0].measure,after[0].focus],['right','top','narrow','left']);
 assert.equal(after[1].align,'right');
 assert.equal(after[1].place,'bottom');
 assert.equal(after[1].focus,'right');
 assert.equal(after[2].align,'left');
 assert.equal(after[2].focus,'left');
 const html=loaded.context.__at(0);
 assert.match(html,/align-right/);
 assert.match(html,/place-top/);
 assert.match(html,/measure-narrow/);
 assert.match(html,/focus-left/);
 const card=vm.runInContext(`listingCard({id:'a1',type:'代取快递',description:'南门代取',display:'代取快递',ownerName:'甲',windowText:'今天 14:00–16:00',status:'active',role:'offer'},'public')`,loaded.context);
 assert.match(card,/board-card-title/);
 assert.match(card,/board-when/);
 assert.match(card,/今天 14:00–16:00/);
 assert.match(card,/南门代取/);
 assert.match(card,/我来帮忙/);
 const mine=vm.runInContext(`listingCard({id:'a1',type:'陪诊',description:'已生效的陪诊登记',display:'陪诊',windowText:'长期',status:'active'},'mine')`,loaded.context);
 assert.match(mine,/已生效/);
 assert.match(mine,/data-action="board-takedown"/);
 assert.match(mine,/下架/);
});

test('gitignored poster files are served locally and missing files do not break the app',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-posters-'));
 const dataDir=path.join(dir,'data');
 const posterDir=path.join(dataDir,'homepage-posters');
 fs.mkdirSync(posterDir,{recursive:true});
 fs.writeFileSync(path.join(dataDir,'store-secret.txt'),'do-not-serve');
 fs.writeFileSync(path.join(posterDir,'01.jpg'),Buffer.from([0xff,0xd8,0xff,0xd9]));
 fs.writeFileSync(path.join(posterDir,'manifest.json'),JSON.stringify({posters:[{file:'01.jpg',credit:'林间'}]}));
 fs.symlinkSync(path.join(dataDir,'store-secret.txt'),path.join(posterDir,'leak.json'));
 const app=createApp({dataDir,configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'board.json')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const port=app.server.address().port;
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 const image=await raw(port,'/homepage-posters/01.jpg');
 const manifest=await raw(port,'/homepage-posters/manifest.json');
 const missing=await raw(port,'/homepage-posters/02.jpg');
 const leak=await raw(port,'/homepage-posters/leak.json');
 const parent=await raw(port,'/homepage-posters/..%2Fstore-secret.txt');
 const script=await raw(port,'/homepage-posters/01.html');
 const page=await raw(port,'/');
 const posted=await raw(port,'/homepage-posters/01.jpg','POST');
 assert.equal(image.status,200);
 assert.match(image.headers['content-type'],/^image\/jpeg/);
 assert.equal(image.headers['cache-control'],'no-store');
 assert.deepEqual([...image.body],[0xff,0xd8,0xff,0xd9]);
 assert.equal(manifest.status,200);
 assert.match(manifest.headers['content-type'],/^application\/json/);
 assert.match(manifest.body.toString('utf8'),/林间/);
 assert.equal(missing.status,404);
 assert.equal(leak.status,404);
 assert.equal(parent.status,404);
 assert.equal(script.status,404);
 assert.doesNotMatch(missing.body.toString('utf8'),/do-not-serve/);
 assert.doesNotMatch(leak.body.toString('utf8'),/do-not-serve/);
 assert.doesNotMatch(parent.body.toString('utf8'),/do-not-serve/);
 assert.equal(page.status,200);
 assert.match(page.body.toString('utf8'),/校集/);
 assert.equal(posted.status,405);
 const emptyDir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-posters-empty-'));
 const empty=createApp({dataDir:path.join(emptyDir,'data'),configFile:path.join(emptyDir,'config.json'),boardFile:path.join(emptyDir,'board.json')});
 await new Promise(r=>empty.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{empty.server.closeAllConnections();await new Promise(r=>empty.server.close(r));fs.rmSync(emptyDir,{recursive:true,force:true})});
 const absent=await raw(empty.server.address().port,'/homepage-posters/01.jpg');
 const stillUp=await raw(empty.server.address().port,'/app.js');
 assert.equal(absent.status,404);
 assert.equal(stillUp.status,200);
});

test('operators are told to keep licensed posters out of git',()=>{
 const ignore=fs.readFileSync(path.join(__dirname,'../.gitignore'),'utf8');
 assert.match(ignore,/data\/homepage-posters\//);
 assert.match(appSource,/data\/homepage-posters\//);
 assert.match(appSource,/Do not commit contest photographs/);
});
