'use strict';
// Conservative place intent: campus rules and unrelated questions remain document searches.
function campusPlaceIntent(question){
 const text=String(question).replace(/\s+/g,'');
 if(!/(通达|学校|校门|校园|附近|周边|旁边)/.test(text))return null;
 if(/校内|宿舍/.test(text))return null;
 if(/(不要|不用|别|不需要)(查|搜|查询|搜索)(地图|地点|附近)/.test(text))return null;
 if(/(北京|上海|南京市|瘦西湖|东关街|皮市街|扬州全市)/.test(text))return null;
 if(!/(附近|周边|旁边|哪里|哪儿|去哪|推荐|有什么|有啥|找)/.test(text))return null;
 const positive=text.replace(/(?:不想|不要|不喝|不吃|不去|别推荐)[^，。！？,;；]*(?=[，。！？,;；]|$)/g,'');
 const categories=[[/超市|便利店|买东西|生活用品/,'超市'],[/快递|驿站|邮局/,'快递'],[/打印|复印|文印/,'打印店'],[/理发|剪头发/,'理发店'],[/洗衣|干洗|洗衣房/,'洗衣店'],[/咖啡|奶茶|茶饮/,'咖啡'],[/电影|影院/,'电影院'],[/博物馆|看展|展览/,'博物馆'],[/商场|购物|逛街/,'商场'],[/公园|散步/,'公园'],[/健身|运动|体育馆/,'运动'],[/餐厅|餐馆|饭店|吃饭|吃的|美食|小吃|吃点/,'餐厅'],[/去哪玩|好玩|玩乐|玩什么/,'游玩']];
 const keyword=categories.find(([re])=>re.test(positive))?.[1];if(!keyword)return null;
 const match=text.match(/([0-9]+(?:\.[0-9]+)?|一|两|二|三|四|五)公[里]/);let radius=3000;
 if(match){const km=({'一':1,'两':2,'二':2,'三':3,'四':4,'五':5})[match[1]]??Number(match[1]);if(![1,2,3,4,5].includes(km))return null;radius=km*1000;}
 return {keyword,radius};
}
module.exports={campusPlaceIntent};
