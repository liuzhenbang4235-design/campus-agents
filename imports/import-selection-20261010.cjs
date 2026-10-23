const fs=require('node:fs');
const {createApp}=require('../lib/backend.cjs');
const url='https://jwc.nytdc.edu.cn/2026/0831/c308a51092/page.htm';
const records=[
 ['通达学院：2026秋季补改选时间与教务系统入口（已截止）','2026—2027学年第一学期，2023—2025级补改选时间为2026年9月1日8:00至9月7日16:00。截至2026年10月10日已结束，不能据此声称仍可报名。教务系统入口：http://jwxt.nytdc.edu.cn/jwglxt，也可从学院官网进入。选课问题先查培养计划、选课指南，仍无法解决可咨询辅导员。'],
 ['通达学院：2026秋季重修上课与课表查询','本学期单开重修班从第6周开始上课，第5周起到教务处官网或个人选课系统查安排。跟班重修、补修须向所选班级任课教师登记并随班学习。集中实践重修需核实所选班级、开课周次，可查官网或教务系统通知，也可向学院教学秘书咨询。本条不代表重修报名仍开放。'],
 ['通达学院：2026秋季线下加退课与已选课程确认','本学期通知要求选课截止前在教务系统“网上选课—学生选课—已选课程”确认。非特殊情况的线下加退课应在第四周周末前办理，填写一般事务申请表交二级学院（部）教学秘书；第五周起各学院无权限自行处理。已过期限的特殊问题需另行咨询学校，本资料不能承诺获批。']
];
(async()=>{
 const {server}=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let cookie='';const base='http://127.0.0.1:'+server.address().port;
 async function api(route,body){const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-campus-client':'1',cookie},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();if(!r.ok)throw Error(j.error);return j;}
 try {await api('session',{profile:'admin'});const report=[];
 for(const [title,text] of records){let {state}=await api('state');if(state.docs.some(d=>d.title===title)){report.push({title,skipped:true});continue;}
 const result=await api('action',{action:'upload',agent:'affairs',title,source:'通达学院教务处公开通知 · 2026-08-31',sourceUrl:url,publishedAt:'2026-08-31',collectedAt:'2026-10-10',sourceKind:'official',cloudAllowed:true,filename:'官网摘要',content:text+'\n适用范围：2026—2027学年第一学期通知，不能套用于其他学期；办理时核对后续通知。\n原文：'+url});
 const d=result.state.docs.find(d=>d.title===title);await api('action',{action:'review',kind:'doc',id:d.id,decision:'approve'});report.push({id:d.id,title,status:'approved'});}
 const final=await api('state');fs.writeFileSync(__dirname+'/selection-20261010-report.json',JSON.stringify({sourceUrl:url,collectedAt:'2026-10-10',records:report,approvedTotal:final.state.docs.filter(d=>d.status==='approved').length},null,2));console.log(JSON.stringify(report));
 }finally{server.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
