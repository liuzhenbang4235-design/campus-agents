const {test}=require('node:test'),assert=require('node:assert/strict');const {containsPoint,campusHint}=require('../lib/campus-area.cjs');const {dataset,searchLocal}=require('../lib/local-places.cjs');const {distance}=require('../lib/places.cjs');
test('closed polygon containment includes boundaries but does not invent an affiliation for invalid or ambiguous areas',()=>{
 const ring=[{lng:0,lat:0},{lng:2,lat:0},{lng:2,lat:2},{lng:0,lat:2},{lng:0,lat:0}];assert(containsPoint({lng:1,lat:1},ring));assert(containsPoint({lng:0,lat:1},ring));assert(!containsPoint({lng:3,lat:1},ring));assert(!containsPoint({lng:1,lat:1},ring.slice(0,-1)));const area={ring,name:'测试校园',sourceUrl:'https://example.com'};assert.equal(campusHint({lng:1,lat:1},[area]).name,'测试校园');assert.equal(campusHint({lng:1,lat:1},[area,area]),null);
});
test('nearby place results distinguish Tongda canteens from neighboring university services',()=>{
 const center=dataset.places.find(p=>p.name==='南京邮电大学通达学院').location;
 for(const [keyword,name,campus] of [['餐厅','第一食堂','南京邮电大学通达学院'],['餐厅','润园','扬州大学扬子津校区'],['超市','教育超市','扬州大学扬子津校区'],['打印店','扬子津汇文文印','扬州大学扬子津校区']]){
 const p=searchLocal(dataset,{keyword,center,radius:3000},distance).find(p=>p.name===name);assert(p);assert.equal(p.campusHint.name,campus);assert.match(p.campusHint.sourceUrl,/openstreetmap.org\/way\//);
 }
});
