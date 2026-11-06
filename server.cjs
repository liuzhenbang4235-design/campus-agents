'use strict';
const {createApp}=require('./lib/backend.cjs');

// Local preview stays on loopback. HOST, when set, wins — including HOST=127.0.0.1
// on Render. PORT alone does not open the interface (systemd and local preview
// already set PORT). Render always sets RENDER=true, so an unset HOST there
// still binds 0.0.0.0. The Blueprint sets HOST explicitly.
function resolveListenHost(env=process.env){
 const host=String(env.HOST??'').trim();
 if(host)return host;
 if(String(env.RENDER??'').trim()==='true')return '0.0.0.0';
 return '127.0.0.1';
}
function startServer(options={}){
 const {server}=createApp(options);
 const port=options.port!=null?Number(options.port):Number(process.env.PORT||4173);
 const host=options.host!=null?options.host:resolveListenHost(options.env||process.env);
 return new Promise((resolve,reject)=>{
  const onError=error=>{server.off('listening',onListening);reject(error)};
  const onListening=()=>{server.off('error',onError);resolve({server,host,port:server.address().port})};
  server.once('error',onError);
  server.once('listening',onListening);
  server.listen(port,host);
 });
}
function main(){
 let pending;
 try{pending=startServer()}
 catch(e){console.error(e.message);process.exit(1)}
 pending.then(({server,host,port})=>{
  const loopback=host==='127.0.0.1'||host==='localhost'||host==='::1';
  const url='http://'+(loopback?host:'127.0.0.1')+':'+port;
  console.log(loopback?'Campus Agent v2 ready: '+url:'Campus Agent v2 listening on '+host+':'+port);
  if(!loopback&&!(process.env.ACCESS_USER&&process.env.ACCESS_PASSWORD))console.warn('Listening on a non-loopback address without ACCESS_USER and ACCESS_PASSWORD. The demo admin switch is reachable by anyone who can open the port.');
  if(process.argv.includes('--open')&&loopback){
   const opener_cmd={win32:'explorer.exe',darwin:'open'}[process.platform]||'xdg-open';
   const opener=require('node:child_process').spawn(opener_cmd,[url],{windowsHide:true,stdio:'ignore',detached:process.platform!=='win32'});
   opener.on('error',()=>console.log('Open the local URL above in your browser.'));
   opener.unref();
  }
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'The local preview port is in use. Stop the old preview first.':'Cannot start local preview.');process.exit(1)});
 }).catch(e=>{console.error(e.code==='EADDRINUSE'?'The local preview port is in use. Stop the old preview first.':'Cannot start local preview.');process.exit(1)});
}
if(require.main===module)main();
module.exports={resolveListenHost,startServer};
