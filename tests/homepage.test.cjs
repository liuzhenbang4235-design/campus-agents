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
 const listenerOptions={};
 const shell=node('shell shell-home');
 const stage=node('poster-stage entry-stage');
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
 const veil=node('poster-veil place-bottom align-center');
 const hit=node('poster-hit',{tag:'button',dataset:{action:'enter-platform'}});
 const prompt=node('entry-prompt',{text:'请点击任意键进入平台'});
 frame.appendChild(photo);frame.appendChild(veil);frame.appendChild(hit);frame.appendChild(prompt);
 stage.appendChild(frame);
 shell.appendChild(stage);
 const byId={app:node('app'),'poster-frame':frame,toast:node('toast'),modal:{open:false,innerHTML:'',classList:classList(),setAttribute(){},close(){this.open=false}}};
 const clock=fakeClock();
 const document={
  hidden:false,
  visibilityState:'visible',
  addEventListener(type,fn,options){(listeners[type]||=[]).push(fn);(listenerOptions[type]||=[]).push(options===undefined?null:options)},
  getElementById(id){return byId[id]||null},
  querySelector(sel){
   if(sel==='.shell')return shell;
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
   addEventListener(type,fn,options){(listeners[type]||=[]).push(fn);(listenerOptions[type]||=[]).push(options===undefined?null:options)},
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
globalThis.__state=()=>({index:posterIndex,page:route().page,home:shell(entrySplash()),catalog:posterCatalog});
globalThis.__at=index=>{posterIndex=index;return entrySplash()};
`,context);
 return {context,listeners,listenerOptions,clock,stage,frame,photo,hit,prompt};
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

test('an empty visit opens the poster entry splash and sections stay routable',()=>{
 assert.match(appSource,/if\(!location\.hash\|\|location\.hash==='#'\)history\.replaceState\(null,'','#home'\)/);
 assert.doesNotMatch(appSource,/history\.replaceState\(null,'','#'\+homePage\(\)\)/);
 const {context}=loadApp({hash:''});
 assert.equal(context.__state().page,'board');
 context.location.hash='#home';
 assert.equal(context.__state().page,'home');
 const home=context.__state().home;
 assert.match(home,/请点击任意键进入平台/);
 assert.match(home,/data-action="enter-platform"/);
 assert.match(context.__at(1),/02\.jpg/);
 assert.doesNotMatch(context.__at(0),/你的难题不必独自面对|poster-title|poster-line/);
});

test('entry splash is a full-bleed frame with only the enter prompt and no dashboard chrome',()=>{
 const {context}=loadApp({hash:'#home'});
 assert.equal(context.__state().page,'home');
 const home=context.__state().home;
 assert.match(home,/class="poster-stage entry-stage"/);
 assert.match(home,/请点击任意键进入平台/);
 assert.match(home,/data-action="enter-platform"/);
 assert.doesNotMatch(home,/menu-square|site-menu|sidebar|nav-link|topbar|home-menu|poster-arrow|poster-dot|poster-count|poster-copy|poster-title|poster-line|poster-credit/);
 assert.match(home,/src="\/homepage-posters\/01\.jpg"/);
 assert.match(home,/class="poster-photo"[^>]*draggable="false"/);
 const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
 assert.match(css,/\.poster-photo\{[^}]*object-fit:cover/);
 assert.doesNotMatch(css,/\.poster-photo\{[^}]*object-fit:contain/);
 assert.match(css,/\.poster-photo\{[^}]*pointer-events:none/);
 assert.match(css,/\.poster-photo\{[^}]*-webkit-user-drag:none/);
 assert.doesNotMatch(css,/\.poster-(?:photo|stage|frame)\{[^}]*(?:scale\(|zoom\s*:)/);
 assert.match(css,/\.entry-prompt\{[^}]*position:absolute/);
 assert.match(css,/\.entry-prompt\{[^}]*pointer-events:none/);
 assert.match(css,/\.entry-prompt\{[^}]*z-index:4/);
 assert.match(css,/\.shell-plain \.content\{[^}]*place-items:center/);
 assert.match(css,/prefers-reduced-motion:reduce\)\{[\s\S]*?\.entry-prompt\{animation:none\}/);
 const pageHtml=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
 assert.match(pageHtml,/width=device-width,initial-scale=1/);
 assert.doesNotMatch(pageHtml,/user-scalable|maximum-scale/);
 assert.match(appSource,/const POSTER_AUTOPLAY_MS=5000/);
 assert.doesNotMatch(appSource,/home-menu|posterClickOpensMenu|poster-go/);
});

test('clicking or pressing a key on the entry splash goes to login',()=>{
 const {context,listeners,stage,hit}=loadApp({hash:'#home'});
 const click=target=>listeners.click[0]({target});
 click(hit);
 assert.equal(context.location.hash,'#login');

 context.location.hash='#home';
 let prevented=false;
 listeners.keydown[0]({key:'Enter',target:stage,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){prevented=true}});
 assert.equal(context.location.hash,'#login');
 assert.equal(prevented,true);

 context.location.hash='#home';
 prevented=false;
 listeners.keydown[0]({key:'ArrowRight',target:stage,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){prevented=true}});
 assert.equal(context.location.hash,'#login');
 assert.equal(prevented,true);

 context.location.hash='#home';
 let tabPrevented=false;
 listeners.keydown[0]({key:'Tab',target:stage,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){tabPrevented=true}});
 assert.equal(context.location.hash,'#home');
 assert.equal(tabPrevented,false);

 let ctrlPrevented=false;
 listeners.keydown[0]({key:'a',target:stage,ctrlKey:true,metaKey:false,altKey:false,preventDefault(){ctrlPrevented=true}});
 assert.equal(context.location.hash,'#home');
 assert.equal(ctrlPrevented,false);
});

test('entry splash autoplay advances every five seconds and pauses without stacking timers',async()=>{
 const files=['01.jpg','02.jpg','03.jpg','04.jpg','05.jpg','06.jpg'];
 const loaded=loadApp({hash:'#home',manifest:{posters:files.map((file,i)=>({file,title:'第'+(i+1)+'张',line:'短句'+(i+1)}))}});
 const {context,listeners,clock}=loaded;
 await vm.runInContext('ensurePosters()',context);
 vm.runInContext('paintPoster();syncPosterAutoplay(false)',context);
 assert.equal(context.__state().index,0);
 assert.equal(clock.count(5000),1);
 await clock.fire(5000);
 assert.equal(context.__state().index,1);
 assert.equal(clock.count(5000),1);
 await clock.fire(5000);
 await clock.fire(5000);
 await clock.fire(5000);
 await clock.fire(5000);
 assert.equal(context.__state().index,5);
 assert.equal(clock.count(5000),1);
 await clock.fire(5000);
 assert.equal(context.__state().index,0);
 assert.equal(clock.count(5000),1);

 context.document.hidden=true;
 context.document.visibilityState='hidden';
 listeners.visibilitychange[0]();
 assert.equal(clock.count(5000),0);
 await clock.fire(5000);
 assert.equal(context.__state().index,0);

 context.document.hidden=false;
 context.document.visibilityState='visible';
 listeners.visibilitychange[0]();
 listeners.visibilitychange[0]();
 assert.equal(clock.count(5000),1);

 vm.runInContext('boardNeedsRefresh=false',context);
 context.location.hash='#board';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'board');
 assert.equal(clock.count(5000),0);
 await clock.fire(5000);
 assert.equal(context.__state().index,0);

 context.location.hash='#home';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'home');
 assert.equal(clock.count(5000),1);
 await clock.fire(5000);
 assert.equal(context.__state().index,1);
 assert.equal(clock.count(5000),1);
});

test('a local manifest feeds poster layout and cannot point outside the poster directory',async()=>{
 const loaded=loadApp({hash:'#home',manifest:{posters:[
  {file:'01.jpg',title:'甲',line:'一',credit:'林间',align:'right',place:'top',measure:'narrow',focus:'left'},
  {file:'../store.json',title:'',line:'',credit:''},
  {file:'https://example.com/secret.jpg',credit:'不该出现'}
 ]}});
 const after=await vm.runInContext('ensurePosters()',loaded.context);
 assert.equal(after.length,3);
 assert.equal(after[0].credit,'林间');
 assert.equal(after[0].title,'甲');
 assert.equal(after[0].image,'/homepage-posters/01.jpg');
 assert.deepEqual([after[0].align,after[0].place,after[0].measure,after[0].focus],['right','top','narrow','left']);
 assert.equal(after[1].image,'');
 assert.equal(after[2].image,'');
 assert.equal(after[2].credit,'不该出现');
 const html=loaded.context.__at(0);
 assert.match(html,/focus-left/);
 assert.doesNotMatch(html,/poster-credit/);
 assert.doesNotMatch(html,/poster-dot|poster-count/);
 const blank=loadApp({hash:'#home'});
 const fallback=await vm.runInContext('ensurePosters()',blank.context);
 assert.equal(fallback[0].credit,'');
 assert.equal(fallback[1].image,'/homepage-posters/02.jpg');
 assert.equal(vm.runInContext('posterSlot(0,1,2)',blank.context),1);
 assert.equal(vm.runInContext('posterSlot(1,1,2)',blank.context),0);
 assert.equal(vm.runInContext('posterSlot(0,-1,2)',blank.context),1);
});

test('a manifest may list six posters and the entry carousel still loops',async()=>{
 const files=['01.jpg','02.jpg','03.jpg','04.jpg','05.jpg','06.jpg'];
 const loaded=loadApp({hash:'#home',manifest:{posters:files.map((file,i)=>({file,title:'第'+(i+1)+'张',line:'短句',credit:i===3?'署名':''}))}});
 const after=await vm.runInContext('ensurePosters()',loaded.context);
 assert.equal(after.length,6);
 assert.deepEqual(after.map(item=>item.image),files.map(file=>'/homepage-posters/'+file));
 assert.equal(after[3].credit,'署名');
 assert.equal(vm.runInContext('posterSlot(5,1,6)',loaded.context),0);
 const html=loaded.context.__at(5);
 assert.match(html,/06\.jpg/);
 assert.match(html,/请点击任意键进入平台/);
 assert.doesNotMatch(html,/06 \/ 06|poster-dot/);
});

test('poster layout fields stay in the catalog and invalid values fall back',async()=>{
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
 let symlinkOk=true;
 try{fs.symlinkSync(path.join(dataDir,'store-secret.txt'),path.join(posterDir,'leak.json'))}catch(e){symlinkOk=false;t.diagnostic('symlink unavailable: '+e.code)}
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
 assert.equal(parent.status,404);
 assert.equal(script.status,404);
 assert.doesNotMatch(missing.body.toString('utf8'),/do-not-serve/);
 assert.doesNotMatch(parent.body.toString('utf8'),/do-not-serve/);
 if(symlinkOk){
  assert.equal(leak.status,404);
  assert.doesNotMatch(leak.body.toString('utf8'),/do-not-serve/);
 }
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

test('poster pinch is limited to the entry poster and leaves scroll, business pages, and keyboard zoom alone',async()=>{
 const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
 const pageHtml=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
 assert.match(css,/\.poster-stage\{[^}]*touch-action:pan-x pan-y/);
 assert.match(css,/\.poster-stage \*\{touch-action:pan-x pan-y\}/);
 assert.doesNotMatch(css,/\.poster-stage\{[^}]*touch-action:\s*none/);
 assert.doesNotMatch(css,/user-scalable|maximum-scale/);
 assert.match(pageHtml,/name="viewport" content="width=device-width,initial-scale=1"/);
 assert.doesNotMatch(pageHtml,/user-scalable|maximum-scale|minimum-scale/);
 assert.doesNotMatch(appSource,/user-scalable|maximum-scale/);
 const loaded=loadApp({hash:'#home'});
 const {context,listeners,listenerOptions,clock,stage,hit,prompt}=loaded;
 const pinchOpts=type=>listenerOptions[type]&&listenerOptions[type][0];
 for(const type of ['wheel','touchmove','gesturestart','gesturechange']){
  assert.equal(listeners[type].length,1);
  assert.equal(pinchOpts(type).passive,false);
  assert.equal(pinchOpts(type).capture,true);
 }
 const content=node('content',{id:'main-content'});
 const send=(type,target,extra={})=>{
  let prevented=false;
  const event={target,ctrlKey:false,metaKey:false,cancelable:true,touches:[],preventDefault(){prevented=true},...extra};
  for(const fn of listeners[type]||[])fn(event);
  return prevented;
 };
 vm.runInContext('syncPosterAutoplay(false)',context);
 assert.equal(clock.count(5000),1);
 assert.equal(send('wheel',stage,{ctrlKey:true,deltaY:-120}),true);
 assert.equal(send('wheel',hit,{ctrlKey:true}),true);
 assert.equal(send('wheel',prompt,{ctrlKey:true}),true);
 assert.equal(send('wheel',stage,{ctrlKey:false,deltaY:40}),false);
 assert.equal(send('wheel',stage,{metaKey:true,ctrlKey:false,deltaY:-40}),false);
 assert.equal(send('wheel',stage,{ctrlKey:true,cancelable:false,deltaY:-40}),false);
 assert.equal(send('wheel',content,{ctrlKey:true,deltaY:-80}),false);
 assert.equal(send('touchmove',stage,{touches:[{},{}]}),true);
 assert.equal(send('touchmove',hit,{touches:[{},{}]}),true);
 assert.equal(send('touchmove',prompt,{touches:[{},{}]}),true);
 assert.equal(send('touchmove',stage,{touches:[{}]}),false);
 assert.equal(send('touchmove',content,{touches:[{},{}]}),false);
 assert.equal(send('touchmove',stage,{touches:[{},{}],cancelable:false}),false);
 assert.equal(send('gesturestart',stage,{}),true);
 assert.equal(send('gesturechange',hit,{}),true);
 assert.equal(send('gesturestart',content,{}),false);
 for(const key of ['+','-','=','_','0']){
  let prevented=false;
  for(const fn of listeners.keydown)fn({key,ctrlKey:true,metaKey:true,target:stage,preventDefault(){prevented=true}});
  assert.equal(prevented,false,key);
 }
 let prevented=false;
 listeners.keydown[0]({key:'ArrowRight',target:stage,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){prevented=true}});
 assert.equal(context.location.hash,'#login');
 assert.equal(prevented,true);
 assert.equal(clock.count(5000),0);

 vm.runInContext('boardNeedsRefresh=false',context);
 context.location.hash='#board';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'board');
 assert.equal(clock.count(5000),0);
 assert.equal(send('wheel',stage,{ctrlKey:true,deltaY:-120}),false);
 assert.equal(send('wheel',content,{ctrlKey:false,deltaY:120}),false);
 assert.equal(send('touchmove',content,{touches:[{},{}]}),false);
 assert.equal(send('gesturestart',stage,{}),false);
 context.location.hash='#home';
 await listeners.hashchange[0]();
 assert.equal(context.__state().page,'home');
 assert.equal(send('wheel',stage,{ctrlKey:true,deltaY:-50}),true);
 assert.equal(send('wheel',stage,{ctrlKey:false,deltaY:50}),false);
 assert.equal(clock.count(5000),1);
});

test('operators are told to keep licensed posters out of git',()=>{
 const ignore=fs.readFileSync(path.join(__dirname,'../.gitignore'),'utf8');
 assert.match(ignore,/data\/homepage-posters\//);
 assert.match(appSource,/data\/homepage-posters\//);
 assert.match(appSource,/Do not commit contest photographs/);
});
