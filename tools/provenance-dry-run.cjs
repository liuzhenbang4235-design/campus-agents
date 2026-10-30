#!/usr/bin/env node
'use strict';

/**
 * 来源字段迁移演练：sourceUrl / publishedAt / collectedAt / sourceKind。
 *
 * 默认只读：扫描 data/store.json 的每个文档，只根据 source 文本（标题不参与，
 * 文档自身的 date 入库日期也绝不参与）推断四个结构化字段，输出 JSON 报告。
 *
 * 用法：
 *   node tools/provenance-dry-run.cjs
 *   node tools/provenance-dry-run.cjs --report imports/other.json
 *   node tools/provenance-dry-run.cjs --apply --backup
 *
 * 安全规则：
 *   - 不带 --apply 时永远不写 data/store.json。
 *   - --apply 必须同时带 --backup；写入前先复制带时间戳的完整备份并核对 sha256。
 *   - 已有结构化值且与新解析值不同的字段算冲突，--apply 时一律跳过。
 *   - 只填充“原值为空”的字段，不覆盖、不清空任何已有值。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const STORE_FILE = path.join(ROOT, 'data', 'store.json');
const DEFAULT_REPORT = path.join(ROOT, 'imports', 'provenance-dry-run-2026-10-27.json');
const FIELDS = ['sourceUrl', 'publishedAt', 'collectedAt', 'sourceKind'];
/** Set by --assume-pipe-date; read by parseDate. */
let ASSUME_PIPE_DATE = false;

// 只匹配 http(s)；排除空白、引号、竖线、常见中英文标点，避免把整段文字吞进 URL。
const URL_RE = /https?:\/\/[^\s<>"'`｜|，,；;）)】]+/gi;
// 支持 2025-05-06、2025/05/06、2025年5月6日；不做 20250506 这类无分隔猜测。
// 日/月分支必须长的在前：否则 2023-03-30 会被截成 2023-03-3。
const DATE_RE = /(?:19|20)\d{2}\s*(?:-|\/|年)\s*(?:1[0-2]|0?[1-9])\s*(?:-|\/|月)\s*(?:3[01]|[12]\d|0?[1-9])\s*日?/g;

// 保守关键词：只认来源文本里明确出现的机构/宣传/体验词。
const KIND_RULES = [
  { kind: 'official', re: /官网|官方|公告|通知|教务处|学生工作处|招生网|招生办|招生就业处|财务处|教育厅|教育部|人民政府|政务服务|公开办事|下载专区|体育部/ },
  { kind: 'merchant', re: /抖音|小红书|探店|优惠|团购|促销|商家|广告|美团|大众点评/ },
  { kind: 'experience', re: /体验|亲测|经历|实测|学生分享|指北/ }
];
const NEGATED_OFFICIAL_RE = /非官方|非学校官方|未经官方|非官网/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
  const out = { apply: false, backup: false, assumePipeDate: false, report: DEFAULT_REPORT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--backup') out.backup = true;
    else if (arg === '--assume-pipe-date') out.assumePipeDate = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--report') {
      if (!argv[i + 1]) throw new Error('--report 需要一个文件路径');
      out.report = path.resolve(ROOT, argv[++i]);
    } else if (arg.startsWith('--report=')) {
      out.report = path.resolve(ROOT, arg.slice('--report='.length));
    } else {
      throw new Error('未知参数：' + arg);
    }
  }
  return out;
}

function usage() {
  return [
    '用法：node tools/provenance-dry-run.cjs [--report <file>] [--assume-pipe-date]',
    '      node tools/provenance-dry-run.cjs --apply --backup [--report <file>] [--assume-pipe-date]',
    '',
    '默认只读演练，报告默认写入 imports/provenance-dry-run-2026-10-27.json。',
    '--apply 必须先备份 data/store.json，只填充空字段，跳过冲突。',
    '--assume-pipe-date 额外把「来源｜日期｜原文链接」里的裸日期视为发布日期，',
    '   并在报告的 assumed 列表逐条列出；不加这个参数时裸日期一律留空。'
  ].join('\n');
}

function fieldValue(doc, field) {
  const value = doc[field];
  return typeof value === 'string' ? value.trim() : '';
}

function cleanUrlToken(raw) {
  // 句末标点不属于 URL；.html 之类的扩展名不受影响。
  return raw.replace(/[.,;:!?。、，；]+$/, '');
}

function parseUrl(source) {
  const found = [...source.matchAll(URL_RE)].map(match => cleanUrlToken(match[0]));
  const unique = [...new Set(found)];
  if (unique.length === 0) return { reason: 'no-url' };
  if (unique.length > 1) return { reason: 'multiple-urls', evidence: unique.slice(0, 3).join(' ') };
  const raw = unique[0];
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || raw.length > 2000) {
      return { reason: 'unsafe-url', evidence: raw };
    }
    return { value: url.href };
  } catch {
    return { reason: 'invalid-url', evidence: raw };
  }
}

function toIso(raw) {
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length < 3) return '';
  const [year, month, day] = nums.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

function snippet(text, match) {
  const start = Math.max(0, match.index - 20);
  return text.slice(start, match.index + match[0].length + 24).replace(/\s+/g, ' ').trim();
}

/**
 * 一条 source 最多只解析一个日期。标签必须能明确指向“发布”或“采集”，
 * 其余（裸日期、页面、目录、附件、更新、修订、制图、公告/通知相邻）一律留空并记录原因。
 */
function parseDate(source, todayIso) {
  const text = source.replace(URL_RE, ' ');
  const hits = [...text.matchAll(DATE_RE)];
  if (hits.length === 0) return { reason: 'no-date' };
  if (hits.length > 1) return { reason: 'multiple-dates', evidence: hits.map(hit => hit[0]).join(' / ') };

  const match = hits[0];
  const iso = toIso(match[0]);
  if (!iso) return { reason: 'invalid-date', evidence: match[0] };
  if (iso < '1990-01-01' || iso > todayIso) return { reason: 'date-out-of-range', evidence: iso };

  const before = text.slice(Math.max(0, match.index - 18), match.index).replace(/\s+/g, ' ').trimEnd();
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 18).replace(/\s+/g, ' ').trimStart();

  const publish = before.match(/(原文|发布于|发布日期|发布时间|发布日|发布)\s*[:：]?\s*$/);
  if (publish) return { field: 'publishedAt', value: iso, label: publish[1] };

  const collect = before.match(/(采集于|采集日期|采集时间|采集)\s*[:：]?\s*$/);
  if (collect) return { field: 'collectedAt', value: iso, label: collect[1] };

  const beforeLabel = before.match(/(页面|更新于|更新|修订|目录|附件|制图|制于|地图|版本|公告|通知)\s*[:：]?\s*$/);
  if (beforeLabel) {
    return { reason: 'ambiguous-date-label:' + beforeLabel[1], evidence: snippet(text, match) };
  }

  // 日期后面紧跟“通知/公告/附件/修订/更新”等，同样不当作发布日期。
  const afterLabel = after.match(/^(.{0,6}?)(公告|通知|附件|修订|更新|目录)/);
  if (afterLabel) {
    return { reason: 'ambiguous-date-label:' + afterLabel[2], evidence: snippet(text, match) };
  }

  // 「来源｜2026-07-28｜https://…」：日期两侧都是分隔符、紧跟原文链接，
  // 这是历史 source 文本里最常见的发布日期写法。默认仍留空，只有显式
  // --assume-pipe-date 才按发布日期处理，并在报告的 assumed 列表里单列。
  // 注意 text 已把 URL 换成空格，所以这里回到原始 source 检查右邻。
  if (ASSUME_PIPE_DATE) {
    const at = source.indexOf(match[0]);
    if (at >= 0) {
      const rawBefore = source.slice(Math.max(0, at - 12), at);
      const rawAfter = source.slice(at + match[0].length, at + match[0].length + 40);
      if (/[|｜]\s*$/.test(rawBefore) && /^[|｜]\s*https?:\/\//.test(rawAfter)) {
        return { field: 'publishedAt', value: iso, label: 'pipe-date', assumed: true };
      }
    }
  }

  return { reason: 'bare-date', evidence: snippet(text, match) };
}

function parseKind(source) {
  const evidence = [];
  for (const rule of KIND_RULES) {
    const hits = [...new Set(source.match(new RegExp(rule.re.source, 'g')) || [])];
    if (hits.length) evidence.push({ kind: rule.kind, hits });
  }
  const negated = NEGATED_OFFICIAL_RE.test(source);
  if (negated) {
    const official = evidence.find(item => item.kind === 'official');
    if (official) evidence.splice(evidence.indexOf(official), 1);
  }

  if (evidence.length === 0) {
    return { reason: negated ? 'negated-official' : 'no-kind-evidence', evidence: source.slice(0, 80) };
  }
  if (evidence.length > 1) {
    return {
      reason: 'conflicting-kind-evidence',
      evidence: evidence.map(item => item.kind + ':' + item.hits.join('/')).join('; ')
    };
  }
  return { value: evidence[0].kind, evidence: evidence[0].kind + ':' + evidence[0].hits.join('/') };
}

function analyzeDoc(doc, todayIso) {
  const source = String(doc.source || '');
  const proposals = {};
  const ambiguities = [];
  const assumed = [];

  const url = parseUrl(source);
  if (url.value) proposals.sourceUrl = url.value;
  else if (url.reason !== 'no-url') ambiguities.push({ field: 'sourceUrl', reason: url.reason, evidence: url.evidence || '' });

  const date = parseDate(source, todayIso);
  if (date.field) {
    proposals[date.field] = date.value;
    if (date.assumed) assumed.push({ field: date.field, value: date.value, label: date.label });
  } else if (date.reason !== 'no-date') {
    ambiguities.push({ field: 'publishedAt/collectedAt', reason: date.reason, evidence: date.evidence || '' });
  }

  const kind = parseKind(source);
  if (kind.value) proposals.sourceKind = kind.value;
  else if (kind.reason !== 'no-kind-evidence') {
    ambiguities.push({ field: 'sourceKind', reason: kind.reason, evidence: kind.evidence || '' });
  }

  // 日期顺序与 lib/source-metadata.cjs 保持一致：采集日期不得早于发布日期。
  const published = proposals.publishedAt || fieldValue(doc, 'publishedAt');
  const collected = proposals.collectedAt || fieldValue(doc, 'collectedAt');
  if (published && collected && published > collected) {
    if (proposals.publishedAt) delete proposals.publishedAt;
    if (proposals.collectedAt) delete proposals.collectedAt;
    ambiguities.push({
      field: 'publishedAt/collectedAt',
      reason: 'date-order-conflict',
      evidence: 'publishedAt ' + published + ' > collectedAt ' + collected
    });
  }

  return { doc, proposals, ambiguities, assumed };
}

function countBy(docs, key) {
  const out = {};
  for (const doc of docs) out[doc[key] || 'unknown'] = (out[doc[key] || 'unknown'] || 0) + 1;
  return out;
}

function percent(count, total) {
  return total ? Number(((count * 100) / total).toFixed(1)) : 0;
}

function coverage(docs, fillSets) {
  const out = { docs: docs.length, fields: {} };
  for (const field of FIELDS) {
    const count = docs.filter(doc => fieldValue(doc, field) || fillSets[field].has(doc.id)).length;
    out.fields[field] = { count, percent: percent(count, docs.length) };
  }
  return out;
}

function urlPathDate(url) {
  const match = url.match(/\/((?:19|20)\d{2})\/(\d{2})(\d{2})(?=\/|$)/) ||
    url.match(/\/((?:19|20)\d{2})\/(\d{1,2})\/(\d{1,2})(?=\/|$)/);
  if (!match) return '';
  const iso = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
  return toIso(iso) === iso ? iso : '';
}

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return [
    now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()),
    '-', pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())
  ].join('');
}

function makeBackup(expectedSha) {
  const base = 'store.json.bak-' + stamp();
  let file = path.join(ROOT, 'data', base);
  let index = 2;
  while (fs.existsSync(file)) file = path.join(ROOT, 'data', base + '-' + index++);
  fs.copyFileSync(STORE_FILE, file);
  const backupSha = sha256(fs.readFileSync(file));
  if (backupSha !== expectedSha) throw new Error('备份 sha256 与写入前不一致，已中止写入');
  return file;
}

function buildSample(results, conflicts, conflictKeys, limit) {
  const picked = [];
  const seen = new Set();
  const seenSources = new Set();
  const add = (result, why) => {
    if (!result || picked.length >= limit || seen.has(result.doc.id) || seenSources.has(result.doc.source)) return;
    seen.add(result.doc.id);
    seenSources.add(result.doc.source);
    picked.push({
      id: result.doc.id,
      title: result.doc.title,
      agent: result.doc.agent,
      status: result.doc.status,
      date: result.doc.date,
      why,
      source: result.doc.source,
      existing: Object.fromEntries(FIELDS.filter(field => fieldValue(result.doc, field))
        .map(field => [field, fieldValue(result.doc, field)])),
      proposed: result.proposals,
      wouldFill: Object.keys(result.proposals).filter(field => !fieldValue(result.doc, field) && !conflictKeys.has(result.doc.id + '|' + field)),
      ambiguities: result.ambiguities.map(item => item.reason),
      conflicts: conflicts.filter(item => item.docId === result.doc.id).map(item => item.field)
    });
  };

  // 覆盖每个 agent/status 组合，再补每类可回填字段、典型歧义、冲突和完全无法解析的样本。
  const groups = new Set();
  for (const result of results) {
    const group = result.doc.agent + '|' + result.doc.status;
    if (!groups.has(group)) {
      groups.add(group);
      add(result, 'agent-status');
    }
  }
  for (const field of FIELDS) {
    const result = results.find(item => !seen.has(item.doc.id) && Object.hasOwn(item.proposals, field) &&
      !fieldValue(item.doc, field) && !conflictKeys.has(item.doc.id + '|' + field));
    add(result, 'fill:' + field);
  }

  const reasons = new Set();
  for (const result of results) {
    for (const item of result.ambiguities) {
      if (reasons.size >= 4) break;
      if (!reasons.has(item.reason)) {
        reasons.add(item.reason);
        add(result, 'ambiguous:' + item.reason);
      }
    }
  }
  for (const conflict of conflicts.slice(0, 4)) {
    add(results.find(result => result.doc.id === conflict.docId), 'conflict');
  }
  for (const result of results.filter(item => Object.keys(item.proposals).length === 0 && !seen.has(item.doc.id)).slice(0, 2)) {
    add(result, 'no-proposal');
  }

  // 保证至少 12 条：按固定步长补足，最多 limit 条。
  const stride = Math.max(1, Math.ceil(results.length / 12));
  for (let index = 0; index < results.length && picked.length < 12; index += stride) {
    add(results[index], 'spread');
  }
  return picked.slice(0, limit);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.apply && !args.backup) throw new Error('--apply 必须同时带 --backup（先备份再写入）');
  if (!args.apply && args.backup) throw new Error('--backup 只能与 --apply 一起使用');
  ASSUME_PIPE_DATE = args.assumePipeDate === true;

  const raw = fs.readFileSync(STORE_FILE, 'utf8');
  const shaBefore = sha256(raw);
  const db = JSON.parse(raw);
  const docs = db.docs;
  const todayIso = new Date().toISOString().slice(0, 10);
  const results = docs.map(doc => analyzeDoc(doc, todayIso));

  const conflicts = [];
  const conflictKeys = new Set();
  const fills = Object.fromEntries(FIELDS.map(field => [field, 0]));
  const fillsApproved = Object.fromEntries(FIELDS.map(field => [field, 0]));
  const matching = Object.fromEntries(FIELDS.map(field => [field, 0]));
  const fillSets = Object.fromEntries(FIELDS.map(field => [field, new Set()]));

  for (const result of results) {
    for (const field of FIELDS) {
      if (!Object.hasOwn(result.proposals, field)) continue;
      const existing = fieldValue(result.doc, field);
      if (existing) {
        if (existing !== result.proposals[field]) {
          conflicts.push({
            docId: result.doc.id,
            title: result.doc.title,
            agent: result.doc.agent,
            status: result.doc.status,
            field,
            existing,
            proposed: result.proposals[field],
            source: result.doc.source
          });
          conflictKeys.add(result.doc.id + '|' + field);
        } else {
          matching[field] += 1;
        }
      } else {
        fills[field] += 1;
        if (result.doc.status === 'approved') fillsApproved[field] += 1;
        fillSets[field].add(result.doc.id);
      }
    }
  }

  const approvedDocs = docs.filter(doc => doc.status === 'approved');
  const beforeAll = coverage(docs, Object.fromEntries(FIELDS.map(field => [field, new Set()])));
  const beforeApproved = coverage(approvedDocs, Object.fromEntries(FIELDS.map(field => [field, new Set()])));
  const projectedAll = coverage(docs, fillSets);
  const projectedApproved = coverage(approvedDocs, fillSets);

  const agentRows = db.agents.map(agent => {
    const own = docs.filter(doc => doc.agent === agent.id);
    const ownApproved = own.filter(doc => doc.status === 'approved');
    const empty = Object.fromEntries(FIELDS.map(field => [field, new Set()]));
    return {
      id: agent.id,
      name: agent.name,
      agentStatus: agent.status,
      docCount: own.length,
      statusCounts: countBy(own, 'status'),
      before: { all: coverage(own, empty), approved: coverage(ownApproved, empty) },
      projected: { all: coverage(own, fillSets), approved: coverage(ownApproved, fillSets) }
    };
  });

  const ambiguityMap = new Map();
  for (const result of results) {
    for (const item of result.ambiguities) {
      if (!ambiguityMap.has(item.reason)) ambiguityMap.set(item.reason, []);
      ambiguityMap.get(item.reason).push({
        docId: result.doc.id,
        title: result.doc.title,
        agent: result.doc.agent,
        status: result.doc.status,
        evidence: item.evidence,
        source: result.doc.source
      });
    }
  }
  const ambiguities = [...ambiguityMap.entries()]
    .map(([reason, items]) => ({ reason, count: items.length, examples: items.slice(0, 3) }))
    .sort((a, b) => b.count - a.count);

  const noProposal = results.filter(result => Object.keys(result.proposals).length === 0);
  // Assumed values are listed one by one so a reviewer can audit every guessed date.
  const assumedDates = results.flatMap(result => result.assumed
    .filter(item => item.field === 'publishedAt' && !fieldValue(result.doc, 'publishedAt'))
    .map(item => ({
      docId: result.doc.id,
      title: result.doc.title,
      agent: result.doc.agent,
      status: result.doc.status,
      publishedAt: item.value,
      label: item.label,
      source: result.doc.source
    })));
  const notDerived = {
    counts: Object.fromEntries(FIELDS.map(field => [field, results.filter(result => !Object.hasOwn(result.proposals, field)).length])),
    docsWithNoProposal: {
      count: noProposal.length,
      examples: noProposal.slice(0, 6).map(result => ({
        docId: result.doc.id,
        title: result.doc.title,
        agent: result.doc.agent,
        status: result.doc.status,
        source: result.doc.source
      }))
    }
  };

  const urlDateMismatches = [];
  for (const result of results) {
    const url = result.proposals.sourceUrl || fieldValue(result.doc, 'sourceUrl');
    const published = result.proposals.publishedAt || fieldValue(result.doc, 'publishedAt');
    const pathDate = url ? urlPathDate(url) : '';
    if (pathDate && published && pathDate !== published) {
      urlDateMismatches.push({
        docId: result.doc.id,
        title: result.doc.title,
        publishedAt: published,
        urlPathDate: pathDate,
        source: result.doc.source
      });
    }
  }

  const totalFills = FIELDS.reduce((sum, field) => sum + fills[field], 0);
  const applied = { didWrite: false, backup: '', fieldsWritten: 0 };
  if (args.apply && totalFills > 0) {
    applied.backup = makeBackup(shaBefore).replace(ROOT + path.sep, '').split(path.sep).join('/');
    for (const result of results) {
      for (const field of FIELDS) {
        if (fillSets[field].has(result.doc.id)) result.doc[field] = result.proposals[field];
      }
    }
    const trailingNewline = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(STORE_FILE, JSON.stringify(db, null, 2) + trailingNewline);
    applied.didWrite = true;
    applied.fieldsWritten = totalFills;
  }

  const shaAfter = sha256(fs.readFileSync(STORE_FILE));
  const sample = buildSample(results, conflicts, conflictKeys, 16);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    script: 'tools/provenance-dry-run.cjs',
    rules: {
      usesOnly: '只解析 source 文本；title 与 doc.date（入库日期）均未参与字段推断。',
      sourceUrl: '仅 source 中的 http(s) URL；拒绝含账号密码、非 http(s)、超长 URL；多 URL 留空。',
      publishedAt: args.assumePipeDate
        ? '明确标签（原文 / 发布于 / 发布日期 / 发布时间 / 发布）+ --assume-pipe-date 下的「来源｜日期｜原文链接」裸日期；后者逐条列入 assumed。页面、目录、附件、修订、更新、制图、通知/公告相邻日期仍留空。'
        : '仅明确标签：原文 / 发布于 / 发布日期 / 发布时间 / 发布。裸日期、页面、目录、附件、修订、更新、制图、通知/公告相邻日期一律留空。',
      collectedAt: '仅明确标签：采集于 / 采集日期 / 采集时间 / 采集；不从 doc.date 推。',
      sourceKind: '仅关键词：official=官网/官方/公告/通知/教务处/学生工作处/招生网/财务处/教育厅/教育部/人民政府/政务服务/公开办事/下载专区/体育部；merchant=抖音/小红书/探店/优惠/团购/促销/商家/广告/美团/大众点评；experience=体验/亲测/经历/实测/学生分享/指北。无证据留空，不猜 unknown。',
      neverUses: '文档自身 date（入库日期）不参与 publishedAt/collectedAt。'
    },
    store: {
      path: 'data/store.json',
      bytes: Buffer.byteLength(raw),
      sha256Before: shaBefore,
      sha256After: shaAfter,
      identical: shaBefore === shaAfter,
      docs: docs.length
    },
    totals: {
      docs: docs.length,
      byStatus: countBy(docs, 'status'),
      byAgent: agentRows.map(row => ({ id: row.id, name: row.name, docCount: row.docCount }))
    },
    coverage: {
      note: 'count 为非空字符串数量。projected = 现有非空值 + 本次可安全回填的空字段（不含冲突）；apply 后即为实际值。',
      before: { all: beforeAll, approved: beforeApproved },
      projected: { all: projectedAll, approved: projectedApproved },
      byAgent: agentRows
    },
    fills: {
      all: { ...fills },
      approved: { ...fillsApproved },
      docsWithAnyFill: new Set([...FIELDS].flatMap(field => [...fillSets[field]])).size,
      alreadyMatching: { ...matching },
      conflicts: conflicts.length,
      conflictsNote: '0 表示没有已存在的结构化值与新解析值不同。解析器只填空字段，已有非空值一律保留；source 中没有可解析证据的已有值不参与比较，也不会被覆盖。',
      collectedAtNote: 'source 文本中没有“采集于/采集日期”标签，因此本次 collectedAt 无法安全回填；应由导入流程记录采集时间，不能拿 doc.date 冒充。',
      assumedPublishedAt: assumedDates.length,
      applied
    },
    assumed: {
      flag: '--assume-pipe-date',
      used: args.assumePipeDate === true,
      count: assumedDates.length,
      note: '这些发布日期来自「来源｜日期｜原文链接」的裸日期；没有显式“原文/发布”标签，需要人工确认后才能 apply。',
      docs: assumedDates
    },
    conflicts,
    ambiguities,
    notDerived,
    warnings: {
      urlPathDateMismatch: {
        count: urlDateMismatches.length,
        note: 'source 标注日期与 URL 路径中的日期不一致；路径日期只作人工核对线索，不用于回填。',
        examples: urlDateMismatches.slice(0, 8)
      }
    },
    sample
  };

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + '\n');

  const fmt = field => {
    const before = beforeAll.fields[field];
    const after = projectedAll.fields[field];
    return field + ' ' + before.count + '→' + after.count + '/' + docs.length +
      '（' + before.percent + '%→' + after.percent + '%）';
  };
  console.log('来源字段迁移演练：' + (args.apply ? 'apply（已写库）' : 'dry-run（只读，未改 data/store.json）'));
  console.log('docs=' + docs.length + ' ' + JSON.stringify(countBy(docs, 'status')));
  console.log('覆盖 before→projected：' + FIELDS.map(fmt).join(' | '));
  console.log('可回填：sourceUrl=' + fills.sourceUrl + ' publishedAt=' + fills.publishedAt +
    ' collectedAt=' + fills.collectedAt + ' sourceKind=' + fills.sourceKind +
    '；已匹配=' + FIELDS.map(field => matching[field]).join('/') +
    '；冲突=' + conflicts.length);
  console.log('歧义 top：' + ambiguities.slice(0, 6).map(item => item.reason + '=' + item.count).join('，'));
  if (args.assumePipeDate) console.log('按「来源｜日期｜原文链接」补的发布日期：' + assumedDates.length + ' 条（见报告 assumed）');
  console.log('完全无可解析字段：' + noProposal.length + ' 篇');
  console.log('sha256 before=' + shaBefore);
  console.log('sha256 after =' + shaAfter + '（' + (shaBefore === shaAfter ? '一致，数据未变' : '不一致') + '）');
  if (applied.didWrite) console.log('已写入，备份：' + applied.backup);
  console.log('报告：' + path.relative(ROOT, args.report).split(path.sep).join('/'));
}

try {
  main();
} catch (error) {
  console.error('provenance-dry-run 失败：' + error.message);
  process.exit(1);
}
