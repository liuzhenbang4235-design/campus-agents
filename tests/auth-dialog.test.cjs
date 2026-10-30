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
  FormData:class FormData{
   constructor(form){this.form=form}
   get(name){return this.form.values?.[name]??null}
   has(name){return !!this.form.has?.[name]}
  },
  fetch:async(url,init)=>{
   calls.push({url:String(url),body:init?.body?JSON.parse(init.body):null});
   const body=calls.at(-1).body||{};
   if(String(url).endsWith('/api/auth/login')||String(url).endsWith('/api/auth/register')){
    return {ok:true,json:async()=>({account:{studentId:body.studentId,displayName:body.displayName||''}})};
   }
   return {ok:false,json:async()=>({error:'未模拟'})};
  }
 };
 context.globalThis=context;
 vm.createContext(context);
 const src=appSource.replace('\nboot();\n','\n/* boot skipped */\n')+`
globalThis.__snap=()=>({hash:location.hash,publishOpen:boardPublishOpen,account,app:document.getElementById('app').innerHTML,modal:document.getElementById('modal').innerHTML,modalOpen:document.getElementById('modal').open,toast:document.getElementById('toast').textContent});
globalThis.__loggedOutBoard=()=>{const prev=account;account=null;const html=boardPage();account=prev;return html};
`;
 new vm.Script(src,{filename:'dist/app.js'}).runInContext(context);
 return {context,listeners,els,calls,location};
}

function actionTarget(action){
 const el={dataset:{action},closest(sel){return sel==='[data-action]'?el:null}};
 return el;
}

function authSubmit(mode,values,modal){
 const form={
  id:modal?'dialog-auth-form':'auth-form',
  dataset:{authForm:'1'},
  values,
  closest(sel){return sel==='dialog'?modal:null}
 };
 return {target:form,preventDefault(){},submitter:{dataset:{auth:mode}}};
}

test('top-bar auth-open is a dialog and does not route to the board',()=>{
 assert.match(appSource,/function authFormHtml\(/);
 assert.match(appSource,/function openAuthDialog\(\)\{modal\('学号登录',authFormHtml\('dialog-auth'/);
 assert.match(appSource,/:\(authFormHtml\(\)\)/);
 assert.match(appSource,/if\(a\.action==='auth-open'\)\{if\(!account\)openAuthDialog\(\);return\}/);
 assert.doesNotMatch(appSource,/action==='auth-open'\)\{[^}]*go\('board'\)/);
 assert.doesNotMatch(appSource,/action==='auth-open'\)\{[^}]*boardPublishOpen/);
 assert.match(appSource,/if\(a\.action==='board-accept'\)\{\s*if\(!account\)\{closeModal\(\);boardPublishOpen=true;if\(route\(\)\.page!=='board'\)go\('board'\);else render\(\);return toast\('请先用学号登录，再和对方开聊。'\)\}/);
 assert.match(appSource,/api\('auth\/'\+mode/);
});

test('auth-open shows the shared login form on the current page, including away from the board',async()=>{
 for(const hash of ['#gallery','#chat/affairs','#upload','#board']){
  const {context,listeners}=loadApp(hash);
  await listeners.click[0]({target:actionTarget('auth-open')});
  const snap=context.__snap();
  assert.equal(snap.hash,hash,hash);
  assert.equal(snap.publishOpen,false,hash);
  assert.equal(snap.modalOpen,true,hash);
  assert.match(snap.modal,/学号登录/);
  assert.match(snap.modal,/id="dialog-auth-form"/);
  assert.match(snap.modal,/data-auth-form="1"/);
  assert.match(snap.modal,/id="dialog-auth-id"/);
  assert.match(snap.modal,/name="studentId"/);
  assert.match(snap.modal,/pattern="\\d\{8\}"/);
  assert.match(snap.modal,/name="password"/);
  assert.match(snap.modal,/name="displayName"/);
  assert.match(snap.modal,/data-auth="login"/);
  assert.match(snap.modal,/data-auth="register"/);
  assert.match(snap.modal,/8 位数字学号/);
  assert.match(snap.modal,/autofocus/);
  assert.doesNotMatch(snap.modal,/id="auth-form"/);
 }
});

test('logged-out board publish panel still uses the same auth form',()=>{
 const {context}=loadApp('#board');
 const html=context.__loggedOutBoard();
 assert.match(html,/id="auth-form"/);
 assert.match(html,/data-auth-form="1"/);
 assert.match(html,/id="auth-id"/);
 assert.match(html,/name="studentId"/);
 assert.match(html,/name="displayName"/);
 assert.match(html,/data-auth="login"/);
 assert.match(html,/data-auth="register"/);
 assert.match(html,/8 位数字学号/);
 assert.doesNotMatch(html,/id="dialog-auth-form"/);
 assert.doesNotMatch(html,/autofocus/);
});

test('dialog login and register stay on the current page and refresh the account chip',async()=>{
 const login=loadApp('#gallery');
 const loginModal=login.context.document.getElementById('modal');
 loginModal.open=true;
 await login.listeners.submit[0](authSubmit('login',{studentId:'20261001',password:'secret1',displayName:''},loginModal));
 let snap=login.context.__snap();
 assert.equal(login.calls[0].url,'/api/auth/login');
 assert.deepEqual(login.calls[0].body,{studentId:'20261001',password:'secret1',displayName:''});
 assert.equal(snap.hash,'#gallery');
 assert.equal(snap.modalOpen,false);
 assert.equal(snap.account.studentId,'20261001');
 assert.match(snap.app,/学号 20261001/);
 assert.match(snap.app,/data-action="auth-logout"/);
 assert.match(snap.app,/\/ 找助手/);
 assert.doesNotMatch(snap.app,/data-action="auth-open"/);
 assert.equal(snap.toast,'登录成功');

 const registered=loadApp('#upload');
 const registerModal=registered.context.document.getElementById('modal');
 registerModal.open=true;
 await registered.listeners.submit[0](authSubmit('register',{studentId:'20261002',password:'secret1',displayName:'小陈'},registerModal));
 snap=registered.context.__snap();
 assert.equal(registered.calls[0].url,'/api/auth/register');
 assert.equal(registered.calls[0].body.displayName,'小陈');
 assert.equal(snap.hash,'#upload');
 assert.equal(snap.modalOpen,false);
 assert.match(snap.app,/学号 20261002/);
 assert.match(snap.app,/\/ 资料贡献/);
 assert.equal(snap.toast,'注册成功，已登录');
});

test('inline board auth submit still logs in without requiring the dialog',async()=>{
 const {context,listeners,calls}=loadApp('#gallery');
 await listeners.submit[0](authSubmit('login',{studentId:'20261003',password:'secret1',displayName:''},null));
 const snap=context.__snap();
 assert.equal(calls[0].url,'/api/auth/login');
 assert.equal(snap.hash,'#gallery');
 assert.equal(snap.account.studentId,'20261003');
 assert.match(snap.app,/学号 20261003/);
});

test('failed dialog login keeps the dialog and the current page',async()=>{
 const {context,listeners}=loadApp('#chat/affairs');
 const modal=context.document.getElementById('modal');
 modal.open=true;
 modal.innerHTML='<form id="dialog-auth-form"></form>';
 const original=context.fetch;
 context.fetch=async()=>({ok:false,json:async()=>({error:'学号或密码不正确。'})});
 await listeners.submit[0](authSubmit('login',{studentId:'20261001',password:'nope',displayName:''},modal));
 const snap=context.__snap();
 assert.equal(snap.hash,'#chat/affairs');
 assert.equal(snap.modalOpen,true);
 assert.match(snap.modal,/dialog-auth-form/);
 assert.equal(snap.account,null);
 assert.equal(snap.toast,'学号或密码不正确。');
 context.fetch=original;
});

test('opening a chat while logged out still sends the student to the board',async()=>{
 const {context,listeners}=loadApp('#chat/affairs');
 await listeners.click[0]({target:actionTarget('board-accept')});
 const snap=context.__snap();
 assert.equal(snap.hash,'#board');
 assert.equal(snap.publishOpen,true);
 assert.equal(snap.toast,'请先用学号登录，再和对方开聊。');
});
