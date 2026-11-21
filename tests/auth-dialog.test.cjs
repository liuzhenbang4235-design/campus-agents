'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const appSource=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');

function loadApp(hash='#gallery'){
 const listeners={};
 const els={};
 const store=new Map();
 function ensure(id){
  if(!els[id])els[id]={id,textContent:'',innerHTML:'',value:'',open:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},showModal(){this.open=true},close(){this.open=false},focus(){},style:{}};
  return els[id];
 }
 const calls=[];
 const location={hash,origin:'http://127.0.0.1:4173',pathname:'/'};
 const document={
  addEventListener(type,fn){(listeners[type]||=[]).push(fn)},
  getElementById(id){return ensure(id)},
  querySelector(){return null},
  querySelectorAll(){return []}
 };
 const context={
  document,
  window:{addEventListener(type,fn){(listeners[type]||=[]).push(fn)},scrollTo(){}},
  location,
  history:{replaceState(){}},
  navigator:{platform:'Linux',userAgent:'node'},
  console,setTimeout,clearTimeout,URL,URLSearchParams,AbortController,Promise,
  sessionStorage:{
   getItem(key){return store.has(key)?store.get(key):null},
   setItem(key,value){store.set(key,String(value))},
   removeItem(key){store.delete(key)}
  },
  FormData:class FormData{
   constructor(form){this.form=form}
   get(name){return this.form.values?.[name]??null}
   has(name){return !!this.form.has?.[name]}
  },
  fetch:async(url,init)=>{
   calls.push({url:String(url),body:init?.body?JSON.parse(init.body):null});
   const body=calls.at(-1).body||{};
   if(String(url).endsWith('/api/auth/login')||String(url).endsWith('/api/auth/register')){
    return {ok:true,json:async()=>({account:{studentId:'u'+body.username,username:String(body.username||'').toLowerCase(),displayName:body.displayName||'同学1000'}})};
   }
   return {ok:false,json:async()=>({error:'未模拟'})};
  }
 };
 context.globalThis=context;
 vm.createContext(context);
 const src=appSource.replace('\nboot();\n','\n/* boot skipped */\n')+`
globalThis.__snap=()=>({hash:location.hash,account,app:document.getElementById('app').innerHTML,modal:document.getElementById('modal').innerHTML,modalOpen:document.getElementById('modal').open,toast:document.getElementById('toast').textContent,next:sessionStorage.getItem('campus-auth-next')});
globalThis.__loggedOutHelp=()=>{const prev=account;account=null;const html=helpPage();account=prev;return html};
globalThis.__login=()=>{location.hash='#login';return loginPage()};
`;
 new vm.Script(src,{filename:'dist/app.js'}).runInContext(context);
 return {context,listeners,els,calls,location};
}

function actionTarget(action,extra={}){
 const el={dataset:{action,...extra},closest(sel){return sel==='[data-action]'?el:null}};
 return el;
}

function authSubmit(mode,values,has){
 const form={
  id:'auth-page-form',
  dataset:{mode},
  values,
  has,
  closest(){return null}
 };
 return {target:form,preventDefault(){}};
}

test('top-bar login opens the login route and remembers only an internal return',()=>{
 assert.match(appSource,/function goLogin\(/);
 assert.match(appSource,/function safeAuthReturn\(/);
 assert.doesNotMatch(appSource,/action==='auth-open'\)\{[^}]*go\('board'\)/);
 assert.match(appSource,/if\(a\.action==='board-accept'\)\{\s*if\(!account\)\{closeModal\(\);goLogin\(\);return toast\('请先登录，再和对方开聊。'\)\}/);
 const {context,listeners}=loadApp('#gallery');
 assert.equal(context.eval?undefined:context.__snap,context.__snap);
 return listeners.click[0]({target:actionTarget('auth-open')}).then(()=>{
  const snap=context.__snap();
  assert.equal(snap.hash,'#login');
  assert.equal(snap.next,'#gallery');
  assert.equal(snap.modalOpen,false);
  assert.equal(vm.runInContext('safeAuthReturn("https://evil.example/phish")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("//evil.example")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("#login")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("#home")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("#board")',context),'#board');
  assert.equal(vm.runInContext('safeAuthReturn("#help")',context),'#help');
  assert.equal(vm.runInContext('safeAuthReturn("#mine")',context),'#mine');
  assert.equal(vm.runInContext('safeAuthReturn("#chat/affairs")',context),'#chat/affairs');
 });
});

test('the login page matches the approved account form and not the preview chrome',()=>{
 const {context}=loadApp('#login');
 const html=vm.runInContext('__login()',context);
 vm.runInContext('render()',context);
 const rendered=context.__snap().app;
 assert.match(rendered,/class="shell shell-plain"/);
 assert.doesNotMatch(rendered,/menu-square|site-menu|sidebar|topbar/);
 assert.match(html,/欢迎回来/);
 assert.match(html,/登录账号/);
 assert.match(html,/name="username"/);
 assert.match(html,/name="password"/);
 assert.match(html,/name="remember" type="checkbox" checked/);
 assert.match(html,/保持登录/);
 assert.match(html,/公共电脑请取消勾选/);
 assert.match(html,/忘记密码？/);
 assert.match(html,/用账号登录，用昵称认识彼此/);
 assert.match(html,/昵称可以修改，不影响登录账号/);
 assert.match(html,/还没有账号？/);
 assert.doesNotMatch(html,/设计预览/);
 assert.doesNotMatch(html,/name="studentId"/);
 assert.doesNotMatch(html,/8 位数字学号/);
 assert.doesNotMatch(html,/手机号|邮箱/);
 vm.runInContext('authMode="register";authForgot=false',context);
 const registered=vm.runInContext('loginPage()',context);
 assert.match(registered,/创建账号/);
 assert.match(registered,/name="displayName"/);
 assert.match(registered,/昵称（可选）/);
 assert.match(registered,/已有账号？/);
});

test('logged-out help points at login instead of embedding the account form',()=>{
 const {context}=loadApp('#help');
 const html=context.__loggedOutHelp();
 assert.match(html,/发布求助/);
 assert.match(html,/登录后登记求助/);
 assert.match(html,/data-action="auth-open">去登录</);
 assert.match(html,/提问和浏览不用登录/);
 assert.doesNotMatch(html,/id="board-form"/);
 assert.doesNotMatch(html,/id="auth-form"/);
 assert.doesNotMatch(html,/name="studentId"/);
 assert.doesNotMatch(html,/8 位数字学号/);
});

test('login returns to the internal page that asked, and drops an external next',async()=>{
 const login=loadApp('#gallery');
 await login.listeners.click[0]({target:actionTarget('auth-open')});
 vm.runInContext('render()',login.context);
 await login.listeners.submit[0](authSubmit('login',{username:'Lin',password:'secret12',displayName:''},{remember:true}));
 const snap=login.context.__snap();
 assert.equal(login.calls[0].url,'/api/auth/login');
 assert.equal(login.calls[0].body.username,'Lin');
 assert.equal(login.calls[0].body.remember,true);
 assert.equal(snap.hash,'#gallery');
 assert.equal(snap.account.displayName,'同学1000');
 assert.match(snap.app,/同学1000/);
 assert.match(snap.app,/data-action="auth-logout"/);
 assert.match(snap.app,/class="shell menu-open"/);
 assert.match(snap.app,/class="sidebar is-open"/);
 assert.match(snap.app,/aria-expanded="true"/);
 assert.match(snap.app,/aria-label="收起菜单"/);
 assert.doesNotMatch(snap.app,/menu-close/);
 assert.equal(snap.toast,'登录成功');

 const direct=loadApp('#login');
 direct.context.sessionStorage.setItem('campus-auth-next','https://evil.example');
 await direct.listeners.submit[0](authSubmit('register',{username:'lin',password:'secret12',displayName:'小林'},{remember:false}));
 const again=direct.context.__snap();
 assert.equal(direct.calls[0].body.remember,false);
 assert.equal(direct.calls[0].body.displayName,'小林');
 assert.equal(again.hash,'#board');
 assert.equal(again.toast,'注册成功，已登录');
});

test('login from the help page returns to help',async()=>{
 const help=loadApp('#help');
 await help.listeners.click[0]({target:actionTarget('auth-open')});
 assert.equal(help.context.__snap().hash,'#login');
 assert.equal(help.context.__snap().next,'#help');
 await help.listeners.submit[0](authSubmit('login',{username:'Lin',password:'secret12',displayName:''},{remember:true}));
 const snap=help.context.__snap();
 assert.equal(snap.hash,'#help');
 assert.match(snap.app,/id="board-form"/);
 assert.match(snap.app,/求助通达/);
});

test('login from my requests returns to mine',async()=>{
 const mine=loadApp('#mine');
 await mine.listeners.click[0]({target:actionTarget('auth-open')});
 assert.equal(mine.context.__snap().hash,'#login');
 assert.equal(mine.context.__snap().next,'#mine');
 await mine.listeners.submit[0](authSubmit('login',{username:'Lin',password:'secret12',displayName:''},{remember:true}));
 const snap=mine.context.__snap();
 assert.equal(snap.hash,'#mine');
 assert.match(snap.app,/我的求助/);
 assert.match(snap.app,/我发布的求助/);
});

test('the dashboard docks open after login and the top-left button toggles it',async ()=>{
 const {context,listeners}=loadApp('#login');
 await listeners.submit[0](authSubmit('login',{username:'Lin',password:'secret12',displayName:''},{remember:true}));
 assert.equal(vm.runInContext('menuOpen',context),true);
 await listeners.click[0]({target:actionTarget('menu')});
 assert.equal(vm.runInContext('menuOpen',context),false);
 await listeners.click[0]({target:actionTarget('menu')});
 assert.equal(vm.runInContext('menuOpen',context),true);
});

test('internal navigation keeps the dashboard open while entry and login close it',async ()=>{
 const {context,listeners}=loadApp('#gallery');
 vm.runInContext('account={studentId:"u1",displayName:"同学"};menuOpen=true',context);
 context.location.hash='#chat';
 await listeners.hashchange[0]();
 assert.equal(vm.runInContext('route().page',context),'chat');
 assert.equal(vm.runInContext('menuOpen',context),true);
 context.location.hash='#login';
 await listeners.hashchange[0]();
 assert.equal(vm.runInContext('menuOpen',context),false);
});

test('docked dashboard reserves width instead of covering the content',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
 assert.match(css,/\.shell\{[^}]*--nav-w:clamp\(232px,18vw,264px\)/);
 assert.match(css,/\.menu-square\{[^}]*width:42px;height:42px/);
 assert.match(css,/\.menu-square \.icon\{width:20px;height:20px/);
 assert.match(css,/\.shell>\.sidebar\{[^}]*padding:16px 18px 20px 68px/);
 assert.match(css,/\.shell>\.sidebar \.nav-link\{[^}]*padding:9px 11px/);
 assert.match(css,/\.shell\.menu-open>\.main\{margin-left:var\(--nav-w\)\}/);
 assert.match(css,/\.shell>\.main\{[^}]*transition:margin-left \.34s/);
 assert.match(css,/@media\(min-width:1280px\)/);
 assert.match(css,/\.shell\.menu-open \.topbar\{padding-left:40px\}/);
 assert.doesNotMatch(css,/menu-close/);
 assert.doesNotMatch(appSource,/menu-close/);
});

test('forgot password explains that reset is unavailable and does not call the server',async()=>{
 const {context,listeners,calls}=loadApp('#login');
 vm.runInContext('render()',context);
 await listeners.click[0]({target:actionTarget('auth-forgot')});
 const snap=context.__snap();
 assert.match(snap.app,/暂时不能自助找回密码/);
 assert.match(snap.app,/不会只凭登录账号重置密码/);
 assert.equal(calls.length,0);
});

test('opening a chat request while logged out goes to login and can return',async()=>{
 const {context,listeners}=loadApp('#chat/affairs');
 await listeners.click[0]({target:actionTarget('board-accept')});
 const snap=context.__snap();
 assert.equal(snap.hash,'#login');
 assert.equal(snap.next,'#chat/affairs');
 assert.equal(snap.toast,'请先登录，再和对方开聊。');
});
