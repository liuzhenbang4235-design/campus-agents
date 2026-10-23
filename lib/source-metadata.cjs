'use strict';
function sourceMetadata(input,previous={}){
 const out={};const fail=message=>{const e=new Error(message);e.status=400;throw e};
 for(const key of ['sourceUrl','publishedAt','collectedAt','sourceKind']){
  let value=Object.hasOwn(input,key)?input[key]:previous[key];if(value===undefined)continue;
  if(typeof value!=='string')fail('来源信息格式不正确');value=value.trim();
  if(key==='sourceUrl'&&value){let url;try{url=new URL(value)}catch{fail('原文链接格式不正确')}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||value.length>2000)fail('原文链接需为不含账号密码的 HTTP 或 HTTPS 地址');value=url.href;}
  if(['publishedAt','collectedAt'].includes(key)&&value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('来源日期需为有效的年月日');}
  if(key==='sourceKind'&&value&&!['official','experience','merchant','unknown'].includes(value))fail('来源类型无效');
  out[key]=value;
 }
 if(out.publishedAt&&out.collectedAt&&out.publishedAt>out.collectedAt)fail('采集日期不能早于发布时间');return out;
}
module.exports={sourceMetadata};
