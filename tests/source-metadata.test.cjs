const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceMetadata}=require('../lib/source-metadata.cjs');
const {retrieve}=require('../lib/retrieval.cjs');
test('source metadata rejects executable URLs, credentials and impossible or reversed dates',()=>{
 for(const x of [{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://name:secret@example.com'},{publishedAt:'2026-02-30'},{publishedAt:'2026-09-25',collectedAt:'2026-09-24'},{sourceKind:'verified-by-admin'},{collectedAt:123}])assert.throws(()=>sourceMetadata(x),e=>e.status===400);
 assert.equal(sourceMetadata({}, {sourceUrl:'https://example.com/video/123'}).sourceUrl,'https://example.com/video/123');
 assert.equal(sourceMetadata({sourceUrl:''},{sourceUrl:'https://example.com'}).sourceUrl,'');
});
test('approved excerpts retain original publication and collection provenance separately from entry date',()=>{
 const d={id:'source-test',title:'通达周边测试餐馆',agent:'life',source:'商家公开帖子',content:'通达周边测试餐馆的活动摘要，仅历史宣传，现价未知。',status:'approved',cloudAllowed:true,date:'2026-09-24',...sourceMetadata({sourceUrl:'https://www.douyin.com/video/123',publishedAt:'2026-09-02',collectedAt:'2026-09-24',sourceKind:'merchant'})};
 const [r]=retrieve([d],'life','测试餐馆活动');assert(r);for(const k of ['sourceUrl','publishedAt','collectedAt','sourceKind','date'])assert.equal(r[k],d[k]);
 assert.equal(retrieve([{...d,status:'pending'}],'life','测试餐馆活动').length,0);
});
