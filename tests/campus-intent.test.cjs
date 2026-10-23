const {test}=require('node:test'),assert=require('node:assert/strict');
const {campusPlaceIntent}=require('../lib/campus-intent.cjs');
test('colloquial campus places route to narrow categories and explicit supported distances',()=>{
 for(const [q,keyword,radius] of [['通达附近有什么吃的？','餐厅',3000],['学校旁边哪里喝咖啡？','咖啡',3000],['通达周边周末去哪玩？','游玩',3000],['学校附近五公里哪里看展','博物馆',5000],['学校1公里附近公园','公园',1000],['不喝咖啡，通达附近有什么吃的','餐厅',3000]])assert.deepEqual(campusPlaceIntent(q),{keyword,radius});
});
test('rules, explicit exclusions, distant destinations and unsupported radii do not silently become place searches',()=>{
 for(const q of ['食堂晚上几点关门','体育课几学分','咖啡怎么做','不要查地图，学校附近有哪些课程','学校附近10公里吃饭','去瘦西湖附近喝咖啡','通达附近不想喝咖啡'])assert.equal(campusPlaceIntent(q),null,q);
});
test('nearby daily services route to place categories while internal-campus questions retain document retrieval',()=>{
 for(const [q,keyword] of [['通达附近哪里买生活用品','超市'],['学校旁边哪里打印','打印店'],['学校附近有哪些快递点','快递']])assert.deepEqual(campusPlaceIntent(q),{keyword,radius:3000});
 for(const q of ['校内快递在哪里拿','宿舍附近哪里洗衣服','通达校内有哪些便利店'])assert.equal(campusPlaceIntent(q),null);
});
test('common aliases and Chinese distances stay within the local scope',()=>{
 for(const [q,keyword,radius] of [['通达附近哪里有文印店','打印店',3000],['学校附近快递站在哪','快递',3000],['通达两公里内哪里洗衣','洗衣店',2000],['通达附近四公里有什么吃的','餐厅',4000]])assert.deepEqual(campusPlaceIntent(q),{keyword,radius});
});
