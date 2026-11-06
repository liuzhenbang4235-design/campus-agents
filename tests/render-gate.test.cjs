'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createApp}=require('../lib/backend.cjs');
const {resolveListenHost,startServer}=require('../server.cjs');

function basic(user,password){return 'Basic '+Buffer.from(user+':'+password,'utf8').toString('base64')}
function tempAppOpts(extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-render-test-'));
 return {dir,opts:{dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'board.json'),...extra}};
}
function raw(port,{method='GET',route='/api/health',headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method,path:route,headers},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);req.end();
 });
}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r))}

test('listen host stays on loopback unless HOST or RENDER=true says otherwise',()=>{
 assert.equal(resolveListenHost({}),'127.0.0.1');
 assert.equal(resolveListenHost({HOST:'  '}),'127.0.0.1');
 assert.equal(resolveListenHost({PORT:'10000'}),'127.0.0.1');
 assert.equal(resolveListenHost({RENDER:'false',PORT:'10000'}),'127.0.0.1');
 assert.equal(resolveListenHost({RENDER:'TRUE'}),'127.0.0.1');
 assert.equal(resolveListenHost({RENDER:'true'}),'0.0.0.0');
 assert.equal(resolveListenHost({HOST:'0.0.0.0'}),'0.0.0.0');
 assert.equal(resolveListenHost({HOST:'127.0.0.1',RENDER:'true'}),'127.0.0.1');
});

test('startServer binds the resolved host and does not open the interface for PORT alone',async t=>{
 const local=tempAppOpts();
 const opened=tempAppOpts();
 t.after(()=>{fs.rmSync(local.dir,{recursive:true,force:true});fs.rmSync(opened.dir,{recursive:true,force:true})});
 const loop=await startServer({...local.opts,port:0,env:{PORT:'10000'}});
 const wide=await startServer({...opened.opts,port:0,env:{HOST:'0.0.0.0',RENDER:'true'},accessUser:'campus',accessPassword:'gate-secret'});
 t.after(async()=>{await close(loop.server);await close(wide.server)});
 assert.equal(loop.host,'127.0.0.1');
 assert.equal(loop.server.address().address,'127.0.0.1');
 assert.equal(wide.host,'0.0.0.0');
 assert.equal(wide.server.address().address,'0.0.0.0');
 const health=await raw(wide.port);
 const denied=await raw(wide.port,{route:'/'});
 const allowed=await raw(wide.port,{route:'/',headers:{authorization:basic('campus','gate-secret')}});
 assert.equal(health.status,200);
 assert.equal(JSON.parse(health.body).app,'campus-agent');
 assert.equal(denied.status,401);
 assert.equal(allowed.status,200);
});

test('shared password gate allows the right Basic credential and leaves GET /api/health open',async t=>{
 const {dir,opts}=tempAppOpts({accessUser:'campus',accessPassword:'p:ass word'});
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const port=app.server.address().port;
 t.after(async()=>{await close(app.server);fs.rmSync(dir,{recursive:true,force:true})});
 const health=await raw(port);
 const healthQuery=await raw(port,{route:'/api/health?ready=1'});
 const healthPost=await raw(port,{method:'POST',route:'/api/health'});
 const missing=await raw(port,{route:'/api/state'});
 const wrong=await raw(port,{route:'/api/state',headers:{authorization:basic('campus','nope')}});
 const shortPass=await raw(port,{route:'/api/state',headers:{authorization:basic('campus','x')}});
 const wrongUser=await raw(port,{route:'/api/state',headers:{authorization:basic('other','p:ass word')}});
 const ok=await raw(port,{route:'/api/state',headers:{authorization:basic('campus','p:ass word')}});
 const page=await raw(port,{route:'/',headers:{authorization:basic('campus','p:ass word')}});
 assert.equal(health.status,200);
 assert.equal(health.headers['www-authenticate'],undefined);
 assert.equal(healthQuery.status,200);
 assert.equal(healthPost.status,401);
 assert.equal(missing.status,401);
 assert.match(missing.headers['www-authenticate'],/Basic realm="Campus Agent"/);
 assert.equal(JSON.parse(missing.body).error,'需要访问密码。');
 assert.equal(wrong.status,401);
 assert.equal(shortPass.status,401);
 assert.equal(wrongUser.status,401);
 assert.equal(ok.status,200);
 assert.equal(page.status,200);
 assert.match(page.body,/<!doctype html>|<html/i);
});

test('one access credential leaves the gate off',async t=>{
 const warnings=[];
 const original=console.warn;
 console.warn=(...args)=>warnings.push(args.join(' '));
 t.after(()=>{console.warn=original});
 const {dir,opts}=tempAppOpts({accessUser:'campus',accessPassword:''});
 const app=createApp(opts);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await close(app.server);fs.rmSync(dir,{recursive:true,force:true})});
 const open=await raw(app.server.address().port,{route:'/'});
 assert.equal(open.status,200);
 assert.match(warnings.join('\n'),/ACCESS_USER and ACCESS_PASSWORD/);
});

test('RENDER_EXTERNAL_URL is accepted for health checks without CAMPUS_ORIGINS',async t=>{
 const {dir,opts}=tempAppOpts({platformOrigin:'https://campus-agents.onrender.com'});
 const blocked=createApp({...opts,configFile:path.join(dir,'config-blocked.json'),platformOrigin:''});
 const app=createApp(opts);
 await new Promise(r=>blocked.server.listen(0,'127.0.0.1',r));
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await close(blocked.server);await close(app.server);fs.rmSync(dir,{recursive:true,force:true})});
 const headers={host:'campus-agents.onrender.com'};
 const denied=await raw(blocked.server.address().port,{headers});
 const allowed=await raw(app.server.address().port,{headers});
 assert.equal(denied.status,403);
 assert.equal(allowed.status,200);
 const state=await raw(app.server.address().port,{route:'/api/state',headers});
 assert.equal(state.status,200);
 assert.match([].concat(state.headers['set-cookie']||[]).join('\n'),/Secure/);
});
