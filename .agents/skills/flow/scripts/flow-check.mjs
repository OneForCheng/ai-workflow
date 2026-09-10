#!/usr/bin/env node
/**
 * flow-check.mjs — /flow 文档体系一致性校验（零依赖，Node >= 18）
 *
 * 用法: node flow-check.mjs [docsDir]     默认 docs
 * 退出码: 0 = 通过（可含 warning）；1 = 存在 error
 *
 * 检查项:
 *   1. 五目录与索引文件是否齐全
 *   2. front-matter 是否存在、必填字段是否齐全、doc_type 是否与目录一致
 *   3. ID 全局唯一 + 符合命名规则 + 文件命名符合规则
 *   4. status 取值是否合法；plan.feature 是否指向已存在的 feature
 *   5. 索引 README 与实际文件是否双向一致
 *   6. designs/standards 是否残留变更历史（违反「只留最终态」）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DOCS = process.argv[2] || 'docs';
const errors = [];
const warnings = [];

/** 目录 → doc_type */
const DIRS = {
  features: 'feature',
  plans: 'plan',
  designs: 'design',
  standards: 'standard',
  others: 'other',
};

/** 公共必填字段 + 各类型专属必填字段（plan 用 created 取代 updated） */
const COMMON_REQUIRED = ['id', 'title', 'doc_type', 'status'];
const EXTRA_REQUIRED = {
  feature: ['updated'],
  plan: ['feature', 'created'],
  design: ['domain', 'updated'],
  standard: ['updated'],
  other: ['updated'],
};

const STATUSES = {
  feature: ['draft', 'active', 'done', 'deprecated'],
  plan: ['draft', 'active', 'done', 'abandoned'],
  design: ['draft', 'current', 'deprecated'],
  standard: ['draft', 'current', 'deprecated'],
  other: ['proposed', 'accepted', 'superseded', 'rejected'],
};

const ID_RE = {
  feature: /^FEAT-\d{3,}$/,
  plan: /^PLAN-\d{8}-[a-z0-9-]+(-\d+)?$/,
  design: /^DES-[a-z0-9-]+$/,
  standard: /^STD-[a-z0-9-]+$/,
  other: /^[A-Z]{2,4}-[A-Za-z0-9.-]+$/,
};

const FILE_RE = {
  features: /^FEAT-\d{3,}-[a-z0-9-]+\.md$/,
  plans: /^PLAN-\d{8}-[a-z0-9-]+(-\d+)?\.md$/,
  designs: /^[a-z0-9-]+\.md$/,
  standards: /^[a-z0-9-]+\.md$/,
  others: /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/,
};

/** ID 必须等于文件名的类型 */
const ID_EQ_FILENAME = ['plan'];

const HISTORY_HEADING = /(变更历史|更新记录|修订记录|changelog|change\s*log)/i;
const HISTORY_LINE = /(新增|移除|变更|修改|调整|迁移)/;

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const shown = (rDocs) => `${DOCS}/${rDocs}`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith('.md')) out.push(abs);
  }
  return out;
}

/** 解析 YAML 子集 front-matter：标量、内联数组、短横线数组 */
function parseFrontMatter(text) {
  if (!text.startsWith('---')) return { data: null, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { data: null, body: text };
  const body = text.slice(end + 4);
  const data = {};
  let key = null;
  for (const raw of text.slice(3, end).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '') data[key] = [];
      else if (v.startsWith('[') && v.endsWith(']')) {
        data[key] = v
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else data[key] = v.replace(/^['"]|['"]$/g, '');
    } else {
      const li = line.match(/^\s*-\s+(.*)$/);
      if (li && key && Array.isArray(data[key])) {
        data[key].push(li[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return { data, body };
}

/** 从索引 README 的表格行中提取第一列 ID 与链接路径 */
function parseIndex(abs) {
  const ids = [];
  const paths = [];
  if (!existsSync(abs)) return { ids, paths };
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const first = cells[0].replace(/[`*]/g, '');
    if (!first || /^[-:\s]+$/.test(first) || /^id$/i.test(first)) continue;
    ids.push(first);
    const link = line.match(/\]\(([^)]+)\)/);
    if (link) paths.push(link[1].replace(/^\.?\//, ''));
  }
  return { ids, paths };
}

function report(files = 0) {
  console.log(`flow-check: ${DOCS} — ${files} 篇文档`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(
    errors.length
      ? `FAIL  ${errors.length} error(s), ${warnings.length} warning(s)`
      : `PASS  ${warnings.length} warning(s)`,
  );
}

function main() {
  if (!existsSync(DOCS)) {
    err(`未找到 ${DOCS}/ —— 请先执行 /flow init 建立文档体系`);
    report();
    return;
  }
  for (const dir of Object.keys(DIRS)) {
    if (!existsSync(join(DOCS, dir))) err(`缺少目录：${DOCS}/${dir}`);
    else if (!existsSync(join(DOCS, dir, 'README.md'))) warn(`缺少索引：${DOCS}/${dir}/README.md`);
  }

  const indexAbs = join(DOCS, 'README.md');
  const files = walk(DOCS).filter((f) => f !== indexAbs && !f.endsWith(`${sep}README.md`));

  const idMap = new Map(); // id -> docs 内相对路径
  const pathId = new Map(); // docs 内相对路径 -> id
  const featureIds = new Set();
  const perDir = new Map(); // dir -> Set(docs 内相对路径)

  for (const abs of files) {
    const parts = relative(DOCS, abs).split(sep);
    const rDocs = parts.join(sep);
    const dir = parts[0];
    if (!DIRS[dir]) {
      warn(`不在五目录内，已跳过：${shown(rDocs)}`);
      continue;
    }
    const base = parts[parts.length - 1];
    const type = DIRS[dir];
    const { data, body } = parseFrontMatter(readFileSync(abs, 'utf8'));

    if (!data) {
      err(`缺少 front-matter：${shown(rDocs)}`);
      continue;
    }
    for (const k of [...COMMON_REQUIRED, ...EXTRA_REQUIRED[type]]) {
      if (data[k] === undefined || data[k] === '') err(`缺少字段 ${k}：${shown(rDocs)}`);
    }
    if (data.doc_type && data.doc_type !== type) {
      err(`doc_type=${data.doc_type} 与目录 ${dir}/ 不符（应为 ${type}）：${shown(rDocs)}`);
    }
    if (data.status && !STATUSES[type].includes(data.status)) {
      err(`status=${data.status} 非法（${type} 允许 ${STATUSES[type].join('/')}）：${shown(rDocs)}`);
    }
    if (data.id) {
      if (!ID_RE[type].test(data.id)) err(`ID 格式不符：${data.id}（${shown(rDocs)}）`);
      if (idMap.has(data.id)) err(`ID 重复：${data.id}（${shown(idMap.get(data.id))} 与 ${shown(rDocs)}）`);
      else {
        idMap.set(data.id, rDocs);
        pathId.set(rDocs, data.id);
      }
      if (type === 'feature') featureIds.add(data.id);
      if (ID_EQ_FILENAME.includes(type) && data.id !== base.replace(/\.md$/, '')) {
        err(`ID 必须等于文件名：${shown(rDocs)}（id=${data.id}）`);
      }
    }
    if (!FILE_RE[dir].test(base)) err(`文件命名不合规：${shown(rDocs)}`);
    if (type === 'design') {
      if (data.domain && data.domain !== parts[1]) {
        err(`design 的 domain=${data.domain} 与所在子目录 ${parts[1] || '(根)'} 不符：${shown(rDocs)}`);
      }
      if (parts.length < 3) err(`design 必须放在 designs/<domain>/ 子目录下：${shown(rDocs)}`);
    }
    if ((type === 'design' || type === 'standard') && body) {
      for (const line of body.split('\n')) {
        if (HISTORY_HEADING.test(line)) {
          warn(`疑似变更历史（designs/standards 只留最终态）：${shown(rDocs)} → ${line.trim().slice(0, 40)}`);
          break;
        }
        if (/\b20\d{2}[-/年]\d{1,2}/.test(line) && HISTORY_LINE.test(line)) {
          warn(`疑似变更记录：${shown(rDocs)} → ${line.trim().slice(0, 40)}`);
          break;
        }
      }
    }

    if (!perDir.has(dir)) perDir.set(dir, new Set());
    perDir.get(dir).add(rDocs);
  }

  // plan.feature 引用完整性
  for (const abs of files) {
    const parts = relative(DOCS, abs).split(sep);
    if (parts[0] !== 'plans') continue;
    const { data } = parseFrontMatter(readFileSync(abs, 'utf8'));
    if (data?.feature && !featureIds.has(data.feature)) {
      err(`plan 引用了不存在的 feature：${data.feature}（${shown(parts.join(sep))}）`);
    }
  }

  // 索引 ↔ 文件双向一致性
  for (const dir of Object.keys(DIRS)) {
    const { ids, paths } = parseIndex(join(DOCS, dir, 'README.md'));
    for (const rDocs of perDir.get(dir) || []) {
      const id = pathId.get(rDocs);
      const base = rDocs.split(sep).pop();
      if (id && !ids.includes(id)) err(`未登记到索引：${shown(rDocs)} → ${DOCS}/${dir}/README.md`);
      if (!paths.some((p) => p.endsWith(base))) warn(`索引缺少文件链接：${shown(rDocs)}`);
    }
    for (const i of ids) {
      if (!idMap.has(i)) err(`索引条目指向不存在的文档：${i} → ${DOCS}/${dir}/README.md`);
      else if (!idMap.get(i).startsWith(`${dir}${sep}`)) {
        err(`索引条目 ${i} 指向了其他目录的文档（${shown(idMap.get(i))}）`);
      }
    }
  }

  report(files.length);
}

main();
process.exit(errors.length ? 1 : 0);
