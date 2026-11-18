'use strict';
// 从 imports/ 恢复知识库到 data/store.json（P0-4）
// 用法：
//   node tools/restore-knowledge.cjs            仅演练，输出统计与差异
//   node tools/restore-knowledge.cjs --apply    先备份再写入 store.json
//
// 恢复口径：
// 1. 收集 imports/*.json 中带 title/agent/content 的文档（batch 与 replacements）；
// 2. 排除虚构示例（title 含「虚构示例」）；
// 3. 应用 campus-focus-update.json 的 offline/reject 清单；
// 4. 同标题去重，保留 importedAt 最新的版本；
// 5. 目标口径（2026-09-23 末批 approvedByAgent）：life 37 / study 78 / affairs 94。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const home = path.resolve(__dirname, '..');
const importsDir = path.join(home, 'imports');
const dataFile = path.join(home, 'data', 'store.json');
const apply = process.argv.includes('--apply');

// ---------- 1. 收集 ----------
// 少数批次（如 nytdc-2026-09-23-batch2.json）只带 title/source/content，无 agent 字段。
// 这些条目均来自教务处 jwc.nytdc.edu.cn 的表格入口，按办事助手（affairs）归档。
function inferAgent(d, file) {
  if (d.agent) return d.agent;
  const hay = [d.source, d.url, file].filter(Boolean).join(' ');
  // nytdc-* 系列为教务处/学工处/财务处的办事指南与表格入口，统一归办事助手
  if (/nytdc/i.test(file)) return 'affairs';
  if (/(jwc|xgc|cwc)\.nytdc\.edu\.cn/.test(hay)) return 'affairs';
  return '';
}
const collected = [];
const perFile = [];
const skippedNoAgent = [];
for (const name of fs.readdirSync(importsDir).filter(f => f.endsWith('.json')).sort()) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(importsDir, name), 'utf8')); } catch { continue; }
  const groups = [];
  if (Array.isArray(j && j.docs)) groups.push({ arr: j.docs, importedAt: j.importedAt || '' });
  else if (Array.isArray(j)) groups.push({ arr: j, importedAt: '' });
  else if (Array.isArray(j && j.items)) groups.push({ arr: j.items, importedAt: j.checkedAt || j.importedAt || '' });
  for (const g of groups) {
    let n = 0;
    for (const d of g.arr) {
      if (d && typeof d === 'object' && d.title && d.content) {
        const agent = inferAgent(d, name);
        if (!agent) { skippedNoAgent.push(`[${name}] ${String(d.title).trim()}`); continue; }
        collected.push({ doc: { ...d, agent }, file: name, importedAt: g.importedAt });
        n++;
      }
    }
    if (n) perFile.push({ file: name, count: n });
  }
}

// ---------- 2. 排除虚构示例 ----------
const withoutDemo = collected.filter(x => !String(x.doc.title).includes('虚构示例'));

// ---------- 3. 应用下架/驳回清单 ----------
const focusFile = path.join(importsDir, 'campus-focus-update.json');
const focus = JSON.parse(fs.readFileSync(focusFile, 'utf8'));
const removed = new Map();
for (const c of focus.changes || []) {
  if (c.action === 'offline' || c.action === 'reject') removed.set(String(c.title).trim(), c.action);
}
const kept = withoutDemo.filter(x => !removed.has(String(x.doc.title).trim()));

// ---------- 3b. 移除 superseded 旧版（任意 *-replacement(s).json 的 superseded[].oldTitle） ----------
// 旧版已被新版替代，若标题不同则不会在去重阶段被合并，需显式剔除，避免检索引用过期政策。
const supersededTitles = new Set();
for (const name of fs.readdirSync(importsDir).filter(f => f.includes('replacement'))) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(importsDir, name), 'utf8')); } catch { continue; }
  if (!Array.isArray(j && j.superseded)) continue;
  for (const s of j.superseded) {
    const oldT = String(s.oldTitle || '').trim();
    const newT = String(s.title || '').trim();
    if (oldT && oldT !== newT) supersededTitles.add(oldT);
  }
}
const afterSupersede = kept.filter(x => !supersededTitles.has(String(x.doc.title).trim()));

// ---------- 4. 同标题去重，保留最新 ----------
const byTitle = new Map();
const duplicates = [];
for (const x of afterSupersede) {
  const key = String(x.doc.title).trim();
  const prev = byTitle.get(key);
  if (!prev) { byTitle.set(key, x); continue; }
  duplicates.push({ title: key, keep: x.importedAt, drop: prev.importedAt });
  if (String(x.importedAt) >= String(prev.importedAt)) byTitle.set(key, x);
}

// ---------- 5. 统计 ----------
const finalDocs = [...byTitle.values()];
const byAgent = {};
for (const x of finalDocs) byAgent[x.doc.agent] = (byAgent[x.doc.agent] || 0) + 1;
const target = { life: 37, study: 78, affairs: 94 };

console.log('=== 收集 ===');
console.log('文件数:', perFile.length, '｜原始条目:', collected.length, '｜排除虚构示例后:', withoutDemo.length, '｜应用下架清单后:', kept.length, '｜移除 superseded 旧版:', supersededTitles.size, '→', afterSupersede.length);
if (skippedNoAgent.length) console.log('无 agent 且无法推断（已跳过）:', skippedNoAgent.length, '条 →', skippedNoAgent.join(' ; '));
console.log('=== 去重 ===');
console.log('同标题重复:', duplicates.length, '｜最终独立文档:', finalDocs.length);
console.log('=== 按助手 ===');
for (const a of ['life', 'study', 'affairs']) {
  const got = byAgent[a] || 0;
  const want = target[a];
  console.log(`${a.padEnd(8)} 恢复 ${String(got).padStart(3)} / 目标 ${String(want).padStart(3)}  ${got === want ? '一致' : (got < want ? `缺 ${want - got}` : `多 ${got - want}`)}`);
}
const other = Object.keys(byAgent).filter(a => !target[a]);
if (other.length) console.log('其他 agent:', other.map(a => `${a}:${byAgent[a]}`).join(' '));

if (!apply) {
  console.log('\n[dry-run] 未写入。确认无误后加 --apply 执行。');
  process.exit(0);
}

// ---------- 6. 写入 ----------
const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backup = dataFile + '.bak-' + stamp + '-restore-before-apply';
fs.copyFileSync(dataFile, backup);
console.log('\n已备份:', path.basename(backup));

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const docs = finalDocs.map(x => {
  const v = x.doc.verification || {};
  return {
    id: crypto.randomUUID(),
    title: String(x.doc.title).trim(),
    agent: x.doc.agent,
    source: x.doc.source || v.sourceUrl || '',
    content: x.doc.content,
    status: 'approved',
    owner: 'admin',
    date: v.checkedAt || today,
    filename: String(x.doc.title).trim().slice(0, 40) + '.md',
    cloudAllowed: true,
  };
});
store.docs = docs;
// 历史聊天记录引用的是旧文档 id（数据丢失期间的测试对话，含乱码），恢复后会产生悬空引用，一并清空。
store.chats = {};
store.audit = [];
store.version = store.version || 2;
fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
console.log('写入完成：docs =', docs.length, '条｜chats 已清空（旧记录引用已失效）');
