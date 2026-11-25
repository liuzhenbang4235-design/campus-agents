'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../lib/backend.cjs');
const {loadDotEnv}=require('../server.cjs');

// Unique probe names so these tests never collide with real CAMPUS_AI_* values
// and can always clean process.env afterwards.
const PROBE_SET='CAMPUS_ENV_FILE_TEST_SET';
const PROBE_KEEP='CAMPUS_ENV_FILE_TEST_KEEP';

function tempEnv(content){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'campus-env-file-'));
 if(content!==undefined)fs.writeFileSync(path.join(dir,'.env'),content);
 return {dir,file:path.join(dir,'.env')};
}
async function withApp(t,fn){
 const {dir}=tempEnv();
 const app=createApp({dataDir:path.join(dir,'data'),configFile:path.join(dir,'config.json'),boardFile:path.join(dir,'board.json')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});
 return fn('http://127.0.0.1:'+app.server.address().port);
}

test('loadDotEnv fills unset keys and never overrides real environment variables',t=>{
 const {file}=tempEnv(PROBE_SET+'=from-file\n'+PROBE_KEEP+'=from-file\n');
 const kept=process.env[PROBE_KEEP];
 process.env[PROBE_KEEP]='from-shell';
 t.after(()=>{
  if(kept===undefined)delete process.env[PROBE_KEEP];else process.env[PROBE_KEEP]=kept;
  delete process.env[PROBE_SET];
 });
 assert.equal(loadDotEnv(file),true);
 assert.equal(process.env[PROBE_SET],'from-file');
 assert.equal(process.env[PROBE_KEEP],'from-shell');
});

test('a missing .env file is not an error',()=>{
 assert.equal(loadDotEnv(path.join(os.tmpdir(),'campus-agent-missing-'+Date.now()+'.env')),false);
});

test('malformed lines do not crash the loader and valid keys still load',t=>{
 const {file}=tempEnv(PROBE_SET+'=kept\nbroken line without equals\nBAD KEY=1\n');
 t.after(()=>{delete process.env[PROBE_SET]});
 assert.equal(loadDotEnv(file),true);
 assert.equal(process.env[PROBE_SET],'kept');
});

test('the static file whitelist never serves .env over HTTP',async t=>{
 const seen=await withApp(t,async base=>{
  const res=await fetch(base+'/.env');
  return {status:res.status,body:await res.text()};
 });
 assert.equal(seen.status,404);
 assert.doesNotMatch(seen.body,/CAMPUS_/);
});
