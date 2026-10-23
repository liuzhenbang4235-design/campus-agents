'use strict';
const emptyPlaces=()=>({provider:'local',keyword:'咖啡',scope:'nearby',radius:3000,centerQuery:'南京邮电大学通达学院',centerToken:'',centers:[],result:null,error:'',consent:false,useForAnswer:false});
let placesUi=emptyPlaces();
function resetPlaces(){placesUi=emptyPlaces()}
function sourceMarkup(s){
 if(s.sourceType==='map'){
  let url;try{url=new URL(s.sourceUrl);if(url.protocol!=='https:'||!((url.hostname==='uri.amap.com'&&url.pathname==='/search')||(url.hostname==='www.openstreetmap.org'&&/^\/(node|way|relation)\/\d+$/.test(url.pathname)))||url.username||url.password)return ''}catch{return ''}
  return '<a class="source-btn" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">['+s.citation+'] '+esc(s.title)+' · '+(url.hostname==='www.openstreetmap.org'?'OpenStreetMap快照':'高德查询结果')+' ↗</a>';
 }
 return '<button class="source-btn" data-action="view-doc" data-id="'+esc(s.docId)+'">['+s.citation+'] '+esc(s.title)+' · 查看来源</button>';
}
function cityDiscovery(){
 const p=ai.places||{},u=placesUi,r=u.result,isLocal=u.provider==='local',disabled=!(isLocal?p.localReady:p.ready)||busy?'disabled':'';
 return `<section class="city-discovery"><div class="places-heading"><div><h2>通达周边吃喝玩乐</h2><p class="small muted">以南京邮电大学通达学院为中心，默认查附近3公里，可扩大到5公里。</p></div><button class="btn small" data-action="places-config">高德地图配置</button></div>
 ${isLocal?`<p class="inline-notice">本地已收录 ${p.localCount||0} 个公开地点，无需地图密钥。采集于 ${esc(new Date(p.localUpdatedAt).toLocaleDateString('zh-CN'))}，仅覆盖通达学院周边5公里内的部分地点；不是实时营业信息。</p>`:!p.ready?'<p class="inline-notice">高德查询需要管理员配置 Web 服务 Key；也可切换到无需密钥的本地点位库。</p>':''}
 <form id="places-form"><div class="field"><label for="places-provider">地点来源</label><select id="places-provider"><option value="local" ${isLocal?'selected':''}>本地点位库 · 无需密钥</option><option value="amap" ${!isLocal?'selected':''}>高德地图 · 需配置</option></select></div><div class="places-fields"><div class="field"><label for="city-keyword">想找什么</label><input id="city-keyword" name="keyword" maxlength="80" required value="${esc(u.keyword)}" placeholder="餐厅、咖啡、超市、快递、打印店"></div><div class="field"><label for="places-scope">查询范围</label><select id="places-scope"><option value="nearby" ${u.scope==='nearby'?'selected':''}>通达学院附近</option></select></div></div>
 ${u.scope==='nearby'?`<div class="places-fields"><div class="field"><label for="places-center-query">查询中心：南京邮电大学通达学院</label><input id="places-center-query" readonly maxlength="80" value="${esc(u.centerQuery)}"><button class="btn small" type="button" data-action="places-centers" ${disabled}>查找地标</button></div><div class="field"><label for="places-center">选择查询中心</label><select id="places-center"><option value="">请核对名称和地址后选择</option>${u.centers.map(c=>`<option value="${esc(c.token)}" ${u.centerToken===c.token?'selected':''}>${esc(c.name)} · ${esc(c.address||c.district)}</option>`).join('')}</select><label for="places-radius">附近范围</label><select id="places-radius">${[1000,3000,5000].map(v=>`<option value="${v}" ${u.radius===v?'selected':''}>${v/1000} 公里</option>`).join('')}</select></div></div>`:''}
 ${isLocal?'<p class="small muted">搜索在本机完成，不向地图服务发送关键词。地点代表坐标不等于出入口；是否可进入请向场所确认。</p>':`<label class="check"><input id="places-consent" type="checkbox" ${u.consent?'checked':''}>允许将上述关键词及选定的公开地标发送给高德；不填写个人住址等敏感信息。</label>`}
 <div class="actions"><button class="btn primary small" type="submit" ${disabled}>查询地点</button><a id="city-map-link" class="btn small" href="${esc(cityMapUrl(u.keyword))}" target="_blank" rel="noopener noreferrer">打开外部地图 ↗</a>${isLocal?'<small class="muted">本地搜索不消耗地图接口次数</small>':`<small class="muted">今日高德请求 ${p.usedToday||0} / ${p.dailyLimit||50}</small>`}</div></form>
 ${u.error?`<p class="reason" role="alert">${esc(u.error)}</p>`:''}
 ${r?`<div class="places-results"><p class="small"><strong>“${esc(r.keyword)}” · ${r.scope==='nearby'?esc(r.centerName)+'附近 '+r.radius/1000+' 公里':r.provider==='local'?'已收录扬州地点':'扬州全市'}</strong><br>查询于 ${esc(new Date(r.checkedAt).toLocaleString('zh-CN'))} · 来源：${r.provider==='local'?'OpenStreetMap本地快照':'高德地图'}</p>${r.provider==='local'?`<p class="small muted">采集于 ${esc(new Date(r.dataUpdatedAt).toLocaleString('zh-CN'))}。${esc(r.scopeNotice)}。<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a></p>`:''}<p class="small muted">${r.places.length?'以下最多展示10个匹配地点，不保证全量最近；直线距离不等于步行路程。营业、价格及预约需向商家确认。':'本次未找到匹配地点，不代表附近没有；可换关键词、扩大范围或打开外部地图。'}</p><div class="places-cards">${r.places.map(place=>`<article class="place-card"><h3>${esc(place.name)}</h3>${place.campusHint?`<p class="inline-notice">地图区域：${esc(place.campusHint.name)}。按公开地图推测；能否进入或使用服务需确认。</p>`:''}<p>${esc(place.district)} ${esc(place.address||'地址未提供')}</p><p class="small muted">${place.distanceMeters===null?'未查询与出发点的距离':'距选定地点直线约 '+(place.distanceMeters/1000).toFixed(2)+' 公里'}</p>${place.telephone?`<p class="small">公开商家电话：${esc(place.telephone)}</p>`:''}<a class="btn text small" href="${esc(place.mapUrl)}" target="_blank" rel="noopener noreferrer">查看原地图 ↗</a></article>`).join('')}</div>${r.contextToken?`<label class="check"><input id="places-use" type="checkbox" ${u.useForAnswer?'checked':''}>下次向生活助手提问时，参考本次 ${r.places.length} 个地点。发送给云端模型的内容包括名称、公开地址、电话与距离；本次结果 10 分钟内有效。</label>`:''}</div>`:''}</section>`;
}
function placesConfigDialog(){
 if(me().role!=='admin')return modal('配置地图查询','<p>请切换为管理员，在本机填写高德 Web 服务 Key。</p><p class="inline-notice">地图 Key 与云端模型 Key 不同。不必把密钥发到聊天里。</p><button class="btn primary" data-action="places-admin">切换管理员并配置</button>');
 const p=ai.places||{};
 modal('接入高德地点查询',`<form id="places-config-form"><p class="small muted">密钥仅由本机后台保存，不返回网页。留空保留已有 Key。</p><div class="field"><label for="places-key">高德 Web 服务 Key</label><input id="places-key" name="apiKey" type="password" autocomplete="new-password" maxlength="200" placeholder="${p.hasKey?'已保存，留空保留':'在此粘贴，勿发送到聊天里'}"></div><div class="field"><label for="places-limit">每日地图请求上限</label><input id="places-limit" name="dailyLimit" type="number" min="1" max="200" required value="${p.dailyLimit||50}"><small>查找地标和查周边各消耗一次请求；与云端模型次数分开计算。</small></div><label class="check"><input type="checkbox" name="enabled" ${p.enabled?'checked':''}>启用应用内地图查询</label><label class="check"><input type="checkbox" name="consent">我确认搜索词和选定的公开地标会发送给高德，已核对高德账户的权限、额度和计费设置。</label><label class="check"><input type="checkbox" name="clearKey">清除已保存的地图 Key</label><p class="small"><a href="https://lbs.amap.com/api/webservice/guide/create-project/get-key" target="_blank" rel="noopener noreferrer">官方申请说明 ↗</a> · <a href="https://console.amap.com/" target="_blank" rel="noopener noreferrer">高德控制台 ↗</a></p><p class="inline-notice">服务平台选择“Web 服务”。本机次数上限不等于费用上限；保存时不自动测试或开通付费服务。</p><p class="reason hidden" id="places-config-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button class="btn primary" type="submit">保存地图配置</button></div></form>`);
}
async function searchPlaces(centers=false){
 if(busy)return;if(placesUi.provider==='amap'&&!placesUi.consent){placesUi.error='请先勾选向高德发送查询信息的确认。';return render()}
 const u=placesUi,body={provider:u.provider,keyword:centers?u.centerQuery:u.keyword,scope:u.scope,radius:u.radius,centerToken:u.centerToken,consent:u.consent};
 // The fixed public campus center is resolved on demand; no personal location is used.
 busy=true;u.error='';u.useForAnswer=false;if(centers){u.centers=[];u.centerToken=''}else u.result=null;render();
 try{if(!centers&&!u.centerToken){const found=await api('places/centers',{provider:u.provider,keyword:'南京邮电大学通达学院',consent:u.consent});u.centers=found.centers;const campus=found.centers.find(c=>c.name==='南京邮电大学通达学院');if(!campus)throw Error('未找到准确的通达学院地标，请稍后重试。');u.centerToken=campus.token;body.centerToken=campus.token;}const data=await api('places/'+(centers?'centers':'search'),body);applyResult(data);if(centers){u.centers=data.centers;u.error=data.centers.length?'':'没有找到地标，请换个名称。'}else u.result=data}
 catch(e){u.error=e.message;try{applyResult(await api('config'))}catch{}}
 finally{busy=false;render()}
}
async function savePlacesForm(f){
 const data=new FormData(f),button=f.querySelector('button[type=submit]');button.disabled=true;
 try{applyResult(await api('places/config',{apiKey:String(data.get('apiKey')||''),dailyLimit:Number(data.get('dailyLimit')),enabled:data.has('enabled'),consent:data.has('consent'),clearKey:data.has('clearKey')}));f.elements.apiKey.value='';resetPlaces();closeModal();render();toast('地图配置已保存；尚未进行真实查询验证。')}
 catch(e){const notice=document.getElementById('places-config-error');notice.textContent=e.message;notice.classList.remove('hidden');button.disabled=false}
}
document.addEventListener('input',e=>{
 if(e.target.id==='city-keyword'){placesUi.keyword=e.target.value;placesUi.useForAnswer=false;document.getElementById('city-map-link').href=cityMapUrl(e.target.value);const use=document.getElementById('places-use');if(use)use.checked=false}
 if(e.target.id==='places-center-query'){placesUi.centerQuery=e.target.value;placesUi.centerToken='';placesUi.useForAnswer=false;const center=document.getElementById('places-center');if(center)center.value='';const use=document.getElementById('places-use');if(use)use.checked=false}
});
document.addEventListener('change',e=>{
 const id=e.target.id;if(id==='places-provider'){placesUi={...emptyPlaces(),provider:e.target.value};return render()}if(id==='places-consent')placesUi.consent=e.target.checked;
 if(id==='places-use')placesUi.useForAnswer=e.target.checked;
 if(['places-scope','places-center','places-radius'].includes(id)){
  if(id==='places-scope')placesUi.scope=e.target.value;
  if(id==='places-center')placesUi.centerToken=e.target.value;
  if(id==='places-radius')placesUi.radius=Number(e.target.value);
  placesUi.result=null;placesUi.useForAnswer=false;placesUi.error='';render();
 }
});
