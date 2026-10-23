'use strict';
const dataset=require('./places-osm.json');
const {areas}=require('./campus-areas.json');
const {campusHint}=require('./campus-area.cjs');
const labels={supermarket:'超市',convenience:'便利店',post_office:'快递邮政点',parcel_locker:'快递柜',copyshop:'打印复印店',laundry:'洗衣店',hairdresser:'理发店',pharmacy:'药店',restaurant:'餐厅',fast_food:'快餐',food_court:'美食广场',ice_cream:'冰淇淋',cafe:'咖啡茶饮',bar:'酒吧',pub:'酒馆',cinema:'电影院',theatre:'剧场',library:'图书馆',arts_centre:'艺术中心',university:'大学地标',park:'公园',garden:'园林',sports_centre:'体育中心',stadium:'体育场',fitness_centre:'健身场馆',water_park:'水上乐园',museum:'博物馆',gallery:'美术展馆',attraction:'景点',zoo:'动物园',aquarium:'水族馆',theme_park:'主题公园',mall:'商场',bakery:'面包店',tea:'茶叶店'};
const groups=[[/^(超市|便利店|买东西|生活用品)$/,['supermarket','convenience']], [/^(快递|快递点|快递站|寄快递|取快递|驿站|邮局)$/,['post_office','parcel_locker']], [/^(打印|复印|文印|文印店|打印店)$/,['copyshop']], [/^(洗衣|洗衣店|干洗|洗衣房)$/,['laundry']], [/^(理发|剪头发|理发店)$/,['hairdresser']], [/^(药店|药房|买药)$/,['pharmacy']],[/^(美食|吃饭|餐饮|餐厅|饭店|吃的)$/,['restaurant','fast_food','food_court','bakery','ice_cream']], [/^(咖啡|咖啡店|奶茶|茶饮|喝的)$/,['cafe']], [/^(电影|电影院)$/,['cinema']], [/^(公园|散步)$/,['park','garden']], [/^(健身|运动|体育|体育馆)$/,['sports_centre','stadium','fitness_centre']], [/^(景点|游玩|好玩|玩乐)$/,['park','garden','museum','gallery','attraction','zoo','aquarium','theme_park','cinema','theatre']], [/^(购物|商场|逛街)$/,['mall']], [/^(看展|展览|博物馆)$/,['museum','gallery','arts_centre']], [/^(书店|图书馆|看书)$/,['library']]];
const norm=s=>String(s).trim().replace(/\s+/g,'').toLowerCase();
function searchLocal(data,query,distance){
 const q=norm(query.keyword),kinds=groups.find(([re])=>re.test(q))?.[1];
 const rows=data.places.filter(p=>query.centers||!p.centerOnly).filter(p=>{
  const n=norm(p.name);return n.includes(q)||norm(labels[p.kind]||p.kind).includes(q)||kinds?.includes(p.kind)||(q==='早茶'&&/茶社|茶楼|早茶/.test(p.name));
 }).map(p=>({...p,category:labels[p.kind]||p.kind,campusHint:campusHint(p.location,areas),distanceMeters:query.center?distance(query.center,p.location):null})).filter(p=>!query.center||p.distanceMeters<=query.radius);
 rows.sort((a,b)=>query.center?a.distanceMeters-b.distanceMeters:(Number(norm(b.name)===q)-Number(norm(a.name)===q)||Number(b.centerOnly)-Number(a.centerOnly)||a.name.localeCompare(b.name,'zh-CN')));
 return rows.slice(0,10);
}
module.exports={dataset,searchLocal,labels};
