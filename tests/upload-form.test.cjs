const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function loadApp(){
 const listeners={};
 const els={};
 function ensure(id){
  if(!els[id])els[id]={id,textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},close(){},showModal(){},open:false,scrollTop:0,disabled:false,focus(){},style:{}};
  return els[id];
 }
 const document={
  addEventListener(type,fn){(listeners[type]||=[]).push(fn)},
  getElementById(id){return ensure(id)},
  querySelector(){return null},
  querySelectorAll(){return []}
 };
 const context={document,window:{addEventListener(){},scrollTo(){}},location:{hash:'#upload',origin:'http://127.0.0.1:4173'},history:{replaceState(){}},navigator:{platform:'Linux',userAgent:'node'},console,setTimeout,clearTimeout,URL,AbortController,Promise,fetch:async()=>{throw new Error('offline')}};
 context.globalThis=context;
 vm.createContext(context);
 const src=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').replace('\nboot();\n','\n/* boot skipped */\n')+`
globalThis.__campusUpload={
 html(){return upload()},
 setProfile(id){currentProfile=id},
 setState(next){state=next},
 plain(){return sourceFields({sourceUrl:'https://example.com/a',publishedAt:'2026-10-01',collectedAt:'2026-10-02',sourceKind:'official'},'edit-meta')},
 edit(id){editDoc(id)},
 modal(){return document.getElementById('modal').innerHTML},
 admin(){return admin()}
};`;
 new vm.Script(src,{filename:'dist/app.js'}).runInContext(context);
 return {api:context.__campusUpload,listeners,els};
}

const agents=[
 {id:'life',name:'校园生活助手',status:'published',team:'t1'},
 {id:'study',name:'学习助手',status:'published',team:'t2'},
 {id:'affairs',name:'校园办事助手',status:'published',team:'t1'}
];
const docs=[
 {id:'s1',title:'学生待审',owner:'student',status:'pending',agent:'life',date:'2026-10-01'},
 {id:'s2',title:'学生已通过',owner:'student',status:'approved',agent:'life',date:'2026-10-02'},
 {id:'s3',title:'学生被驳回',owner:'student',status:'rejected',agent:'affairs',date:'2026-10-03',reason:'来源不够具体'},
 {id:'o1',title:'别人的资料不应出现',owner:'team2',status:'approved',agent:'study',date:'2026-10-04'},
 {id:'o2',title:'共创组的资料',owner:'team',status:'pending',agent:'life',date:'2026-10-05',reason:'不应显示给别人'}
];

function studio(){
 const app=loadApp();
 app.api.setState({version:2,agents,docs,audit:[],chats:{},account:null});
 return app;
}

test('contribute form shows only the short fields and keeps optional provenance collapsed',()=>{
 const {api}=studio();
 api.setProfile('student');
 const html=api.html();
 const cut=html.indexOf('<details class="optional-meta">');
 assert.ok(cut>0);
 const head=html.slice(0,cut),tail=html.slice(cut),after=html.split('</details>')[1];
 for(const label of ['>标题 <','>助手 <','>来源 <','>正文 <'])assert.ok(head.includes(label),label);
 for(const label of ['原文链接','发布时间','采集日','内容性质']){
  assert.equal(head.includes(label),false,label+' should be inside the optional section');
  assert.ok(tail.includes(label),label);
 }
 assert.match(html,/<details class="optional-meta">/);
 assert.doesNotMatch(html,/<details class="optional-meta"[^>]*open/);
 assert.match(tail,/name="sourceUrl"/);
 assert.match(tail,/name="publishedAt"/);
 assert.match(tail,/name="collectedAt"/);
 assert.match(tail,/name="sourceKind"/);
 assert.doesNotMatch(tail,/name="sourceUrl"[^>]*disabled/);
 assert.match(after,/name="consent" required/);
 assert.match(after,/提交审核/);
 assert.match(head,/只有 TXT \/ MD 会自动填入正文/);
 assert.match(head,/PDF、Word 不会解析。请把摘要粘贴到正文/);
 assert.match(head,/PDF \/ Word 不会被解析，请自行粘贴摘要/);
 assert.match(html,/不会自动读取网页/);
 assert.doesNotMatch(html,/解析 PDF|可读取 PDF|PDF \/ DOCX 请另填/);
 assert.match(html,/提交一份有用的知识，由管理员审核后加入对应助手/);
 assert.match(html,/例如：图书馆借阅指南（示例）/);
});

test('my submissions list only the current demo identity, with review status and resubmit',()=>{
 const {api}=studio();
 api.setProfile('student');
 const html=api.html();
 for(const title of ['学生待审','学生已通过','学生被驳回'])assert.match(html,new RegExp(title));
 assert.doesNotMatch(html,/别人的资料不应出现|共创组的资料/);
 assert.match(html,/>待审</);
 assert.match(html,/>通过</);
 assert.match(html,/>驳回</);
 assert.match(html,/驳回原因：来源不够具体/);
 assert.equal((html.match(/修改并重新提交/g)||[]).length,1);
 assert.match(html,/data-action="edit-doc" data-id="s3"/);
 assert.match(html,/我的提交 <span class="count">3<\/span>/);
 assert.doesNotMatch(html,/不应显示给别人/);

 api.setProfile('team');
 const cocreate=api.html();
 assert.match(cocreate,/交给生活或办事助手。管理员审核通过后，同学才能问到。/);
 assert.match(cocreate,/例如：学生证补办材料（示例）/);
 assert.match(cocreate,/优先交给本组的生活 · 办事助手。/);
 assert.match(cocreate,/共创组的资料/);
 assert.doesNotMatch(cocreate,/学生待审|别人的资料不应出现/);
 assert.match(cocreate,/我的提交 <span class="count">1<\/span>/);

 api.setProfile('team2');
 const study=api.html();
 assert.match(study,/交给学习助手。管理员审核通过后，同学才能问到。/);
 assert.match(study,/例如：课程复习方法（示例）/);
 assert.match(study,/优先交给本组的学习助手。/);
 assert.match(study,/别人的资料不应出现/);
 assert.doesNotMatch(study,/学生待审|共创组的资料/);
 assert.match(study,/>通过</);
 assert.doesNotMatch(study,/修改并重新提交/);
});

test('rejected resubmit keeps the editable source fields, and admin review is unchanged',()=>{
 const {api}=studio();
 api.setProfile('student');
 const plain=api.plain();
 assert.doesNotMatch(plain,/补充信息（可选）/);
 assert.match(plain,/原文链接/);
 assert.match(plain,/value="https:\/\/example.com\/a"/);
 assert.match(plain,/value="official"/);
 api.edit('s3');
 const modal=api.modal();
 assert.match(modal,/修改资料并重新提交/);
 assert.match(modal,/重新提交审核/);
 assert.match(modal,/审核意见：来源不够具体/);
 assert.match(modal,/name="sourceUrl"/);
 assert.doesNotMatch(modal,/补充信息（可选）/);
 api.edit('s1');
 assert.equal(api.modal(),modal);
 api.setProfile('admin');
 const admin=api.admin();
 assert.match(admin,/审核管理/);
 assert.match(admin,/待审核资料/);
 assert.match(admin,/学生待审/);
 assert.match(admin,/共创组的资料/);
 assert.doesNotMatch(admin,/补充信息（可选）/);
});

test('TXT and MD fill the body; PDF and Word only ask for a pasted summary',async()=>{
 const {listeners,els}=loadApp();
 const form={elements:{content:{value:''},title:{value:''}}};
 const note=()=>els['file-note'];
 async function choose(file){
  const input={id:'doc-file',files:[file],value:'',isConnected:true,closest(){return form}};
  for(const fn of listeners.change)await fn({target:input});
 }
 await choose({name:'notes.md',size:24,async text(){return '从 markdown 读入的正文'}});
 assert.equal(form.elements.content.value,'从 markdown 读入的正文');
 assert.equal(form.elements.title.value,'notes');
 assert.match(note().textContent,/已读取文字/);
 form.elements.title.value='已有标题';
 await choose({name:'plain.txt',size:8,async text(){return '纯文本正文'}});
 assert.equal(form.elements.content.value,'纯文本正文');
 assert.equal(form.elements.title.value,'已有标题');
 form.elements.content.value='手写摘要';
 await choose({name:'guide.pdf',size:40,async text(){throw new Error('should not read pdf')}});
 assert.equal(form.elements.content.value,'手写摘要');
 assert.match(note().textContent,/guide\.pdf/);
 assert.match(note().textContent,/不会解析/);
 assert.match(note().textContent,/粘贴到正文/);
 await choose({name:'brief.docx',size:40,async text(){throw new Error('should not read word')}});
 assert.equal(form.elements.content.value,'手写摘要');
 assert.match(note().textContent,/brief\.docx/);
 assert.match(note().textContent,/不会解析/);
});
