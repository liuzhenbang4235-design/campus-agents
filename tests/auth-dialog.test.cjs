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
  window:{addEventListener(){},scrollTo(){}},
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
globalThis.__snap=()=>({hash:location.hash,publishOpen:boardPublishOpen,account,app:document.getElementById('app').innerHTML,modal:document.getElementById('modal').innerHTML,modalOpen:document.getElementById('modal').open,toast:document.getElementById('toast').textContent,next:sessionStorage.getItem('campus-auth-next')});
globalThis.__loggedOutBoard=()=>{const prev=account;account=null;const html=boardPage();account=prev;return html};
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
  assert.equal(snap.publishOpen,false);
  assert.equal(vm.runInContext('safeAuthReturn("https://evil.example/phish")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("//evil.example")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("#login")',context),'');
  assert.equal(vm.runInContext('safeAuthReturn("#board")',context),'#board');
  assert.equal(vm.runInContext('safeAuthReturn("#chat/affairs")',context),'#chat/affairs');
 });
});

test('the login page matches the approved account form and not the preview chrome',()=>{
 const {context}=loadApp('#login');
 const html=vm.runInContext('__login()',context);
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

test('logged-out board points at login instead of embedding the account form',()=>{
 const {context}=loadApp('#board');
 const html=context.__loggedOutBoard();
 assert.match(html,/登录后登记互助/);
 assert.match(html,/data-action="auth-open">去登录</);
 assert.match(html,/提问不用登录/);
 assert.doesNotMatch(html,/id="auth-form"/);
 assert.doesNotMatch(html,/name="studentId"/);
 assert.doesNotMatch(html,/8 位数字学号/);
});

test('login returns to the internal page that asked, and drops an external next',async()=>{
 const login=loadApp('#gallery');
 await login.listeners.click[0]({target:actionTarget('auth-open')});
 vm.runInContext('render()',login.context);
 await login.listeners.submit[0](authSubmit('login',{username:'Lin',password:'secret1',displayName:''},{remember:true}));
 const snap=login.context.__snap();
 assert.equal(login.calls[0].url,'/api/auth/login');
 assert.equal(login.calls[0].body.username,'Lin');
 assert.equal(login.calls[0].body.remember,true);
 assert.equal(snap.hash,'#gallery');
 assert.equal(snap.account.displayName,'同学1000');
 assert.match(snap.app,/同学1000/);
 assert.match(snap.app,/data-action="auth-logout"/);
 assert.equal(snap.toast,'登录成功');

 const direct=loadApp('#login');
 direct.context.sessionStorage.setItem('campus-auth-next','https://evil.example');
 await direct.listeners.submit[0](authSubmit('register',{username:'lin',password:'secret1',displayName:'小林'},{remember:false}));
 const again=direct.context.__snap();
 assert.equal(direct.calls[0].body.remember,false);
 assert.equal(direct.calls[0].body.displayName,'小林');
 assert.equal(again.hash,'#board');
 assert.equal(again.toast,'注册成功，已登录');
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
 assert.equal(snap.publishOpen,false);
 assert.equal(snap.toast,'请先登录，再和对方开聊。');
});
