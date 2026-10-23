'use strict';
// Chinese bigrams + word tokens, with BM25 ranking. No document text is sent
// to an embedding provider. Only the top local matches reach the chat model.
const STOP = new Set(['什么','怎么','如何','哪些','多少','可以','需要','一下','请问','帮我','告诉','我们','这个','那个','有没有','是否','哪里','在哪','哪看','里看','校园','学校','资料','示例','虚构','指南']);
const PROGRAM_ALIASES = new Map([
  ['网新','网络与新媒体'], ['数媒','数字媒体技术'],
  ['计科','计算机科学与技术'], ['软工','软件工程'], ['ai','人工智能']
]);
function programIntent(docs, agentId, question) {
  const byDoc = new Map(), labels = new Map();
  if (agentId !== 'study') return {byDoc, aliases:[], coverage:new Set()};
  // The approved study titles define which programs actually have evidence.
  for (const doc of docs) {
    const match = doc.title.match(/[：:]\s*(.+?)学什么(?:[（(].*)?$/);
    if (!match) continue;
    const name = match[1].replace(/\s/g,'');
    byDoc.set(doc.id,name); labels.set(name.toLowerCase(),{name,alias:false});
  }
  for (const [alias,name] of PROGRAM_ALIASES) {
    if (labels.has(name.toLowerCase())) labels.set(alias,{name,alias:true});
  }
  if (!labels.size) return {byDoc,aliases:[],coverage:new Set()};
  const escaped = [...labels.keys()].sort((a,b)=>b.length-a.length)
    .map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const text = String(question).toLowerCase(), names = new Set(), aliases = new Set();
  // Longest names win at each position: 自动化 inside 电气工程及其自动化
  // is not a second mention. A later standalone 自动化 still counts.
  for (const match of text.matchAll(new RegExp(escaped.join('|'),'g'))) {
    const label = labels.get(match[0]);
    if (label.alias) {
      const before=text.slice(0,match.index), after=text.slice(match.index+match[0].length);
      // Bound short names by punctuation or ordinary ways of naming a major;
      // do not turn 校园网新增功能 or OpenAI into program questions.
      const left=/(?:^|[\s，,。？！?!、：:；;（）()“”"'/]|想学|想问|了解|选择|对比|比较|我学|选|转|读|学|考|和|与|跟|还是|或者|的)$/;
      const right=/^(?:$|[\s，,。？！?!、：:；;（）()“”"'/]|专业|方向|学生|同学|班|系|学|有|是|会|都|和|与|跟|比|还是|或者|怎么样|怎么|到底|一般|平时|要|需要|能|可以|主要|的)/;
      if (!left.test(before)||!right.test(after)) continue;
      aliases.add(label.name);
    }
    names.add(label.name);
  }
  const comparison=/对比|比较|区别|差别|差异|差.{0,6}(?:哪|什么)|不一样|不同|一回事|还是|分别|是不是都|\bvs\b/i.test(text);
  return {byDoc,aliases:[...aliases],coverage:comparison&&names.size>1?names:new Set()};
}
function searchText(text) {
  // Keep the original excerpt for citations, but do not rank source URLs and
  // repeated collection caveats as if they were answers to the question.
  return String(text).split('\n').filter(line=>!/^\s*(原文|来源网址|核对日期|采集日期|范围|适用范围|时效)[：:]/.test(line))
    .join('\n').replace(/https?:\/\/\S+/g,' ');
}
function expand(question, agentId) {
  let extra='';
  if(/饭卡|一卡通|校园卡/.test(question))extra+=' 校园卡 一卡通 挂失 补办';
  else if(/卡.{0,4}(丢|掉|找不到)|丢.{0,4}卡/.test(question))extra+=' 校园卡 学生证 挂失 补办';
  if(/考不了|没法考试|不能考试|赶不上考试/.test(question))extra+=' 缓考 申请';
  if(/成绩.{0,5}(不对|错|有问题)/.test(question))extra+=' 成绩 复查';
  if(/没钱|交不起|家里困难|经济困难/.test(question))extra+=' 家庭经济困难 资助 助学 绿色通道';
  if(/停电|灯坏|水管|漏水|门锁坏|坏了/.test(question))extra+=' 报修 维修';
  if(/借书|还书|续借/.test(question))extra+=' 图书馆 借阅';
  if(agentId==='life') {
    if(!/下雨|雨天|室内/.test(question)&&/好玩|去哪玩|出去玩|出去逛|逛逛|散心|溜达|走走|散步/.test(question))extra+=' 公园 游览 景区 散步';
    if(/吃点什么|好吃|下馆子|聚个餐|吃顿饭/.test(question))extra+=' 餐饮 淮扬菜 美食 聚餐';
    if(/早饭|早餐|早茶/.test(question))extra+=' 早茶 茶社';
    if(/咖啡|下午茶|甜点/.test(question))extra+=' 咖啡 甜品';
    if(/下雨|雨天|室内/.test(question))extra+=' 博物馆 展览';
  }
  return [...new Set(tokens(extra))];
}
function tokens(text) {
  const result = [];
  for (const run of String(text).toLowerCase().match(/[\u3400-\u9fff]+|[a-z0-9]+/g) || []) {
    if (/^[a-z0-9]+$/.test(run)) { result.push(run); continue; }
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) {
      const term = run.slice(i, i + 2);
      if (!STOP.has(term)) result.push(term);
    }
  }
  return result;
}
function chunks(doc) {
  const text = doc.content.replace(/\r\n/g, '\n').trim();
  const out = [];
  const boundaries = [...text.matchAll(/[。！？\n]/g)].map(m => m.index + 1);
  for (let start = 0; start < text.length;) {
    const maximum = Math.min(start + 720, text.length);
    // Preserve complete sentences and directory rows whenever they fit.
    const end = maximum === text.length ? maximum : boundaries.findLast(n => n > start && n <= maximum) || maximum;
    const excerpt = text.slice(start, end);
    const terms = tokens(doc.title + ' ' + doc.title + ' ' + searchText(excerpt));
    out.push({docId:doc.id, title:doc.title, source:doc.source, date:doc.date, sourceUrl:doc.sourceUrl, publishedAt:doc.publishedAt, collectedAt:doc.collectedAt, sourceKind:doc.sourceKind,
      excerpt, chunk:out.length + 1, terms});
    if (end === text.length) break;
    const overlap = boundaries.find(n => n > start && n >= end - 100 && n < end);
    // A sentence longer than the cap still needs a bounded, overlapping slice.
    start = overlap || (end === maximum ? Math.max(start + 1, end - 100) : end);
  }
  return out;
}
function retrieve(docs, agentId, question, limit = 4) {
  const eligible = docs.filter(d => d.agent === agentId && d.status === 'approved' && d.cloudAllowed === true);
  const intent=programIntent(eligible,agentId,question), corpus=eligible.flatMap(chunks);
  const original = [...new Set(tokens(question+' '+intent.aliases.join(' ')))], expansion=expand(question,agentId);
  const query = [...new Set([...original,...expansion])];
  if (!corpus.length || !query.length) return [];
  const average = corpus.reduce((n, c) => n + c.terms.length, 0) / corpus.length || 1;
  const frequencies = new Map(query.map(t => [t, corpus.filter(c => c.terms.includes(t)).length]));
  const ranked = corpus.map(c => {
    let score = 0, matched = 0, expanded = 0;
    const titleTerms = new Set(tokens(c.title));
    let titleAnchor = false;
    for (const term of query) {
      const tf = c.terms.filter(t => t === term).length;
      if (!tf) continue;
      if(original.includes(term))matched++;else expanded++;
      const df = frequencies.get(term);
      const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
      score += (original.includes(term)?1:0.65) * idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * c.terms.length / average));
      // A rare place or form name can identify a verbose colloquial question.
      if (original.includes(term) && titleTerms.has(term) && df <= Math.max(2, corpus.length * 0.03)) {
        titleAnchor = true;
        score += idf;
      }
    }
    return {...c, score, matched, expanded, titleAnchor};
  }).filter(c => c.score > 0 && (intent.coverage.has(intent.byDoc.get(c.docId)) || c.titleAnchor || c.matched / Math.max(original.length,1) >= 0.12 || c.expanded >= 2))
    .sort((a,b) => b.score - a.score);
  // A long document must not crowd out every other relevant source.
  const seen=new Set(), unique=[], rest=[];
  for(const c of ranked){if(seen.has(c.docId))rest.push(c);else{seen.add(c.docId);unique.push(c)}}
  // Compare each explicitly named program using its best relevant fragment,
  // then fill the remaining slots with normal BM25 results. General catalogs
  // mentioning many majors cannot consume all the comparison's source slots.
  const covered=new Set(), selected=new Set(), coverage=[];
  for(const c of unique){
    const program=intent.byDoc.get(c.docId);
    if(intent.coverage.has(program)&&!covered.has(program)){
      coverage.push(c);covered.add(program);selected.add(c.docId);
    }
  }
  return [...coverage,...unique.filter(c=>!selected.has(c.docId)),...rest].slice(0,limit)
    .map(({terms, score, matched, expanded, titleAnchor, ...c}, i) => ({...c, citation:i + 1}));
}
module.exports = {tokens, chunks, retrieve};
