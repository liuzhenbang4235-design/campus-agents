const {createApp}=require('./lib/backend.cjs');
try {
  const {server}=createApp();
  const port=Number(process.env.PORT||4173);
  server.listen(port,'127.0.0.1',()=>{
    const url='http://127.0.0.1:'+port;
    console.log('Campus Agent v2 ready: '+url);
    const opener_cmd={win32:'explorer.exe',darwin:'open'}[process.platform]||'xdg-open';
    if(process.argv.includes('--open')){
      const opener=require('node:child_process').spawn(opener_cmd,[url],{windowsHide:true,stdio:'ignore',detached:process.platform!=='win32'});
      opener.on('error',()=>console.log('Open the local URL above in your browser.'));
    }
  });
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'The local preview port is in use. Stop the old preview first.':'Cannot start local preview.');process.exit(1)});
} catch(e) {console.error(e.message);process.exit(1)}
