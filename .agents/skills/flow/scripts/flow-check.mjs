#!/usr/bin/env node
/**
 * flow-check.mjs — /flow 文档体系一致性校验（零依赖，Node >= 18）
 *
 * 用法:
 *   node flow-check.mjs [docsDir]                 结构校验，默认 docs
 *   node flow-check.mjs [docsDir] --map           结构校验 + 目录覆盖视图
 *   node flow-check.mjs [docsDir] --trace         结构校验 + Plan AC↔Task 矩阵校验
 *   node flow-check.mjs [docsDir] --gates         结构校验 + 质量门契约校验
 *   node flow-check.mjs [docsDir] --freeze <id>   打印 Feature 需求块哈希（只读）
 *   node flow-check.mjs --fixtures                运行自测样本（scripts/fixtures）
 *
 * 退出码: 0 = 通过（可含 warning）；1 = 存在 error / fixture 失败
 *
 * 检查项:
 *   1. 五目录与索引文件是否齐全
 *   2. front-matter 是否存在、必填字段是否齐全、doc_type 是否与目录一致
 *   3. ID 全局唯一 + 符合命名规则 + 文件命名符合规则
 *   4. status 取值是否合法；plan.feature 是否指向已存在的 feature
 *   5. 索引 README 与实际文件是否双向一致
 *   6. designs/standards 是否残留变更历史（违反「只留最终态」）
 *   7. 非文档体系文件（无 front-matter 且不符合命名、未登记索引）仅 WARN 跳过
 *   8. anchors（design/standard）：项目根相对路径或 glob，须命中真实文件；可出覆盖视图
 *   9. frozen（feature）：需求块哈希，防止已确认 Feature 正文被就地改写
 */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 遍历时跳过的重目录 */
const HEAVY = new Set([
  'node_modules', '.git', '.idea', '.vscode', 'dist', 'build', 'coverage',
  '.next', '.nuxt', 'target', 'vendor', '.DS_Store', '.venv', '__pycache__',
]);

/** --map 计入的源码扩展名 */
const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte',
  '.py', '.go', '.java', '.kt', '.rs', '.rb', '.php', '.cs', '.c', '.cc', '.cpp',
  '.h', '.hpp', '.swift', '.sql', '.sh', '.gradle',
]);

/** Feature 需求块（冻结哈希覆盖的章节） */
const FROZEN_SECTION_RE = [
  /^##\s*目标/,
  /^##\s*范围/,
  /^##\s*业务规则/,
  /^##\s*验收标准/,
];

const toPosix = (p) => p.split(sep).join('/');

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

/** 递归列出文件；跳过重目录与符号链接（避免环） */
function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (HEAVY.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkAll(abs, out);
    else out.push(abs);
  }
  return out;
}

/** glob → RegExp：** 跨目录、* 段内、? 单字符 */
function globToRegExp(pattern) {
  let p = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        i++;
        if (p[i + 1] === '/') {
          i++;
          re += '(?:[^/]+/)*';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('/._-'.includes(c)) re += c;
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** 需求块：仅 目标 / 范围 / 业务规则 / 验收标准 四节 */
function requirementBlock(body) {
  const out = [];
  let keep = false;
  for (const line of body.split('\n')) {
    if (/^##\s+/.test(line)) keep = FROZEN_SECTION_RE.some((re) => re.test(line));
    if (keep) out.push(line.replace(/\s+$/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const hashRequirementBlock = (body) =>
  createHash('sha256').update(requirementBlock(body)).digest('hex').slice(0, 12);

/** Markdown 表格 → 行 × 单元格 */
function parseTables(body) {
  const tables = [];
  let cur = [];
  for (const line of body.split('\n')) {
    if (/^\s*\|/.test(line)) cur.push(line);
    else if (cur.length) {
      tables.push(cur);
      cur = [];
    }
  }
  if (cur.length) tables.push(cur);
  return tables.map((rows) =>
    rows.map((r) =>
      r
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .replace(/\\\|/g, '\u0000')
        .split('|')
        .map((c) => c.replace(/\u0000/g, '|').trim()),
    ),
  );
}

/** 找 AC↔Task 矩阵（表头含 AC 与 Task） */
function findMatrix(body) {
  for (const t of parseTables(body)) {
    if (!t.length) continue;
    const head = t[0].map((c) => c.toLowerCase());
    if (!head.includes('ac') || !head.includes('task')) continue;
    return t
      .slice(1)
      .filter((r) => r.length >= 3 && !r.every((c) => /^[-:\s]*$/.test(c)));
  }
  return null;
}

const err = (res, m) => res.errors.push(m);
const warn = (res, m) => res.warnings.push(m);
const shown = (res, rDocs) => `${res.docsDir}/${rDocs}`;

function checkDocs(docsDir, opts = {}) {
  const res = {
    docsDir,
    root: resolve(docsDir, '..'),
    docs: [],
    errors: [],
    warnings: [],
    relFiles: [],
    anchorDirs: new Map(),
  };

  if (!existsSync(docsDir)) {
    err(res, `未找到 ${docsDir}/ —— 请先执行 /flow init 建立文档体系`);
    return res;
  }
  for (const dir of Object.keys(DIRS)) {
    if (!existsSync(join(docsDir, dir))) err(res, `缺少目录：${docsDir}/${dir}`);
    else if (!existsSync(join(docsDir, dir, 'README.md'))) warn(res, `缺少索引：${docsDir}/${dir}/README.md`);
  }

  const indexAbs = join(docsDir, 'README.md');
  const files = walkAll(docsDir).filter((f) => f !== indexAbs && !f.endsWith(`${sep}README.md`));

  const indexByDir = new Map();
  for (const dir of Object.keys(DIRS)) {
    indexByDir.set(dir, parseIndex(join(docsDir, dir, 'README.md')));
  }

  const idMap = new Map();
  const pathId = new Map();
  const featureIds = new Set();
  const perDir = new Map();

  for (const abs of files) {
    const parts = relative(docsDir, abs).split(sep);
    const rDocs = parts.join(sep);
    const dir = parts[0];
    if (!DIRS[dir]) {
      warn(res, `不在五目录内，已跳过：${shown(res, rDocs)}`);
      continue;
    }
    const base = parts[parts.length - 1];
    const type = DIRS[dir];
    const { data, body } = parseFrontMatter(readFileSync(abs, 'utf8'));

    if (!data) {
      const { paths } = indexByDir.get(dir);
      const linked = paths.some((p) => p.endsWith(base));
      if (!FILE_RE[dir].test(base) && !linked) {
        warn(res, `未纳入文档体系（无 front-matter 且未匹配命名/索引），已跳过：${shown(res, rDocs)}`);
        continue;
      }
      err(res, `缺少 front-matter：${shown(res, rDocs)}`);
      continue;
    }
    for (const k of [...COMMON_REQUIRED, ...EXTRA_REQUIRED[type]]) {
      if (data[k] === undefined || data[k] === '') err(res, `缺少字段 ${k}：${shown(res, rDocs)}`);
    }
    if (data.doc_type && data.doc_type !== type) {
      err(res, `doc_type=${data.doc_type} 与目录 ${dir}/ 不符（应为 ${type}）：${shown(res, rDocs)}`);
    }
    if (data.status && !STATUSES[type].includes(data.status)) {
      err(res, `status=${data.status} 非法（${type} 允许 ${STATUSES[type].join('/')}）：${shown(res, rDocs)}`);
    }
    if (data.id) {
      if (!ID_RE[type].test(data.id)) err(res, `ID 格式不符：${data.id}（${shown(res, rDocs)}）`);
      if (idMap.has(data.id)) err(res, `ID 重复：${data.id}（${shown(res, idMap.get(data.id))} 与 ${shown(res, rDocs)}）`);
      else {
        idMap.set(data.id, rDocs);
        pathId.set(rDocs, data.id);
      }
      if (type === 'feature') featureIds.add(data.id);
      if (ID_EQ_FILENAME.includes(type) && data.id !== base.replace(/\.md$/, '')) {
        err(res, `ID 必须等于文件名：${shown(res, rDocs)}（id=${data.id}）`);
      }
    }
    if (!FILE_RE[dir].test(base)) err(res, `文件命名不合规：${shown(res, rDocs)}`);
    if (type === 'design') {
      if (data.domain && data.domain !== parts[1]) {
        err(res, `design 的 domain=${data.domain} 与所在子目录 ${parts[1] || '(根)'} 不符：${shown(res, rDocs)}`);
      }
      if (parts.length < 3) err(res, `design 必须放在 designs/<domain>/ 子目录下：${shown(res, rDocs)}`);
    }
    if ((type === 'design' || type === 'standard') && body) {
      for (const line of body.split('\n')) {
        if (HISTORY_HEADING.test(line)) {
          warn(res, `疑似变更历史（designs/standards 只留最终态）：${shown(res, rDocs)} → ${line.trim().slice(0, 40)}`);
          break;
        }
        if (/\b20\d{2}[-/年]\d{1,2}/.test(line) && HISTORY_LINE.test(line)) {
          warn(res, `疑似变更记录：${shown(res, rDocs)} → ${line.trim().slice(0, 40)}`);
          break;
        }
      }
    }
    if (type === 'feature' && data.frozen) {
      const want = String(data.frozen).replace(/^sha256:/, '').trim();
      const got = hashRequirementBlock(body);
      if (want !== got) {
        err(
          res,
          `已冻结 Feature 的需求块被修改（frozen=${want}，当前=${got}）：${shown(res, rDocs)}；确需变更请重跑 --freeze 并在 Plan 声明`,
        );
      }
    }

    res.docs.push({ abs, rDocs, dir, base, type, data, body });
    if (!perDir.has(dir)) perDir.set(dir, new Set());
    perDir.get(dir).add(rDocs);
  }

  // plan.feature 引用完整性
  for (const d of res.docs) {
    if (d.type !== 'plan') continue;
    if (d.data?.feature && !featureIds.has(d.data.feature)) {
      err(res, `plan 引用了不存在的 feature：${d.data.feature}（${shown(res, d.rDocs)}）`);
    }
  }

  // 索引 ↔ 文件双向一致性
  for (const dir of Object.keys(DIRS)) {
    const { ids, paths } = indexByDir.get(dir);
    for (const rDocs of perDir.get(dir) || []) {
      const id = pathId.get(rDocs);
      const base = rDocs.split(sep).pop();
      if (id && !ids.includes(id)) err(res, `未登记到索引：${shown(res, rDocs)} → ${docsDir}/${dir}/README.md`);
      if (!paths.some((p) => p.endsWith(base))) warn(res, `索引缺少文件链接：${shown(res, rDocs)}`);
    }
    for (const i of ids) {
      if (!idMap.has(i)) err(res, `索引条目指向不存在的文档：${i} → ${docsDir}/${dir}/README.md`);
      else if (!idMap.get(i).startsWith(`${dir}${sep}`)) {
        err(res, `索引条目 ${i} 指向了其他目录的文档（${shown(res, idMap.get(i))}）`);
      }
    }
  }

  // 单个字符串也视作一个锚点（宽容写法）
  const anchorsOf = (d) => {
    const raw = d.data?.anchors;
    if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
    return [];
  };

  // anchors 校验与覆盖视图（需要文件清单时才遍历项目）
  const needFiles = opts.map || res.docs.some((d) => anchorsOf(d).length);
  if (needFiles) {
    res.relFiles = walkAll(res.root).map((abs) => ({ abs, rel: toPosix(relative(res.root, abs)) }));
    for (const d of res.docs) {
      const anchors = anchorsOf(d);
      if (!anchors.length) continue;
      if (d.type !== 'design' && d.type !== 'standard') {
        warn(res, `anchors 仅对 design/standard 生效，已忽略：${shown(res, d.rDocs)}`);
        continue;
      }
      for (const raw of anchors) {
        let pattern = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
        if (isAbsolute(pattern) || /^[A-Za-z]:[\\/]/.test(pattern)) {
          err(res, `anchor 必须为项目根相对路径：${pattern}（${shown(res, d.rDocs)}）`);
          continue;
        }
        if (pattern.split('/').includes('..')) {
          err(res, `anchor 不得越出项目根：${pattern}（${shown(res, d.rDocs)}）`);
          continue;
        }
        const absPattern = join(res.root, pattern);
        try {
          if (existsSync(absPattern) && lstatSync(absPattern).isDirectory()) {
            pattern = `${pattern.replace(/\/+$/, '')}/**`;
          }
        } catch {
          /* ignore */
        }
        const re = globToRegExp(pattern);
        const matches = res.relFiles.filter((f) => re.test(f.rel));
        if (!matches.length) {
          err(res, `anchor 未命中任何文件：${pattern}（${shown(res, d.rDocs)}）`);
          continue;
        }
        for (const m of matches) {
          const dirRel = m.rel.includes('/') ? m.rel.slice(0, m.rel.lastIndexOf('/')) : '.';
          if (!res.anchorDirs.has(dirRel)) res.anchorDirs.set(dirRel, new Set());
          res.anchorDirs.get(dirRel).add(d.data.id || d.base);
        }
      }
    }
  }

  return res;
}

/** 展开 AC 区间：AC-1…AC-3 / AC-1...AC-3 / AC-1~AC-3 / AC-1-AC-3 / AC-1至AC-3 */
function expandAcIds(cell) {
  const ids = new Set();
  const rangeRe = /AC-(\d+)\s*(?:…|\.{2,}|~|[-–—至])\s*AC-(\d+)/g;
  let m;
  while ((m = rangeRe.exec(cell))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo > 99) {
      ids.add(`AC-${a}`);
      ids.add(`AC-${b}`);
      continue;
    }
    for (let i = lo; i <= hi; i++) ids.add(`AC-${i}`);
  }
  for (const single of cell.match(/AC-\d+/g) || []) ids.add(single);
  return [...ids];
}

function checkTrace(res) {
  const featureById = new Map(res.docs.filter((d) => d.type === 'feature').map((d) => [d.data.id, d]));
  for (const plan of res.docs.filter((d) => d.type === 'plan')) {
    if (!['draft', 'active'].includes(plan.data.status)) continue;
    const feat = featureById.get(plan.data.feature);
    if (!feat) continue;
    const acs = [...new Set(feat.body.match(/\bAC-\d+\b/g) || [])];
    const covers = Array.isArray(plan.data.covers) ? plan.data.covers.map(String) : null;
    const targets = covers || acs;
    if (covers) {
      for (const ac of covers) {
        if (!acs.includes(ac)) err(res, `covers 引用了 Feature 中不存在的 AC：${ac}（${shown(res, plan.rDocs)}）`);
      }
    }
    const matrix = findMatrix(plan.body);
    if (!matrix) {
      warn(res, `缺少 AC↔Task 矩阵（--trace 跳过）：${shown(res, plan.rDocs)}`);
      continue;
    }
    const rows = new Map();
    for (const r of matrix) {
      const ids = expandAcIds(r[0] || '');
      const status = r.length > 3 ? r[r.length - 1] : '';
      for (const id of ids) rows.set(id, { task: r[1] || '', verify: r[2] || '', status });
    }
    for (const ac of targets) {
      if (!rows.has(ac)) err(res, `AC 未出现在 Plan 覆盖矩阵：${ac}（${shown(res, plan.rDocs)}）`);
    }
    for (const [ac, row] of rows) {
      if (!acs.includes(ac)) {
        err(res, `覆盖矩阵引用了 Feature 中不存在的 AC：${ac}（${shown(res, plan.rDocs)}）`);
        continue;
      }
      if (covers && !targets.includes(ac)) continue;
      if (/^(后续|deferred|later)$/i.test(row.status.trim())) continue;
      if (!row.task || /^[-—无]+$/.test(row.task.trim())) {
        err(res, `AC 未分配 Task：${ac}（${shown(res, plan.rDocs)}）`);
      }
      if (!row.verify || /^[-—无]+$/.test(row.verify.trim())) {
        err(res, `AC 缺少验证方式：${ac}（${shown(res, plan.rDocs)}）`);
      }
    }
  }
}

/** 质量门契约：```yaml 列表，字段 id/layer/fast/full/on_fail */
function parseGates(body) {
  const m = body.match(/```ya?ml\n([\s\S]*?)```/);
  if (!m) return null;
  const gates = [];
  let cur = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const li = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (li && li[1] === 'id') {
      cur = { id: li[2].trim() };
      gates.push(cur);
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv && cur) cur[kv[1]] = kv[2].trim();
  }
  return gates;
}

function checkGates(res) {
  const p = join(res.docsDir, 'standards', 'quality-gates.md');
  if (!existsSync(p)) {
    warn(res, `未定义质量门契约（可选）：${res.docsDir}/standards/quality-gates.md`);
    return;
  }
  const gates = parseGates(readFileSync(p, 'utf8'));
  if (!gates || !gates.length) {
    err(res, `质量门契约缺少 gates 列表：${res.docsDir}/standards/quality-gates.md`);
    return;
  }
  const seen = new Set();
  for (const g of gates) {
    const id = g.id || '(缺 id)';
    if (!g.id) err(res, '质量门条目缺少 id');
    else if (seen.has(g.id)) err(res, `质量门 id 重复：${g.id}`);
    seen.add(g.id);
    if (!['term', 'req', 'code', 'arch', 'func', 'doc'].includes(g.layer)) {
      err(res, `质量门 ${id} 的 layer 非法：${g.layer || '缺失'}（允许 term/req/code/arch/func/doc）`);
    }
    if (!g.full) err(res, `质量门 ${id} 缺少 full 命令`);
    if (g.on_fail && !['fix', 'park'].includes(g.on_fail)) {
      err(res, `质量门 ${id} 的 on_fail 非法：${g.on_fail}（允许 fix/park）`);
    }
  }
}

const FLOW_STATUS = ['idle', 'running', 'paused', 'done'];
const FLOW_NEXT = ['none', 'review', 'compound', 'plan'];

function hasTaskTable(body) {
  return parseTables(body).some((t) => {
    if (!t.length) return false;
    const head = t[0].map((c) => c.toLowerCase());
    return head.includes('任务') && head.includes('状态');
  });
}

/** 校验 <root>/.flow：state.json、当前账本、signals.jsonl */
function checkState(res) {
  const dir = join(res.root, '.flow');
  if (!existsSync(dir)) {
    warn(res, `未初始化 .flow/（run 模式可选）：${dir}`);
    return;
  }
  const statePath = join(dir, 'state.json');
  if (!existsSync(statePath)) {
    err(res, `缺少 ${dir}/state.json`);
    return;
  }
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (e) {
    err(res, `state.json 不是合法 JSON：${e.message}`);
    return;
  }
  if (typeof state.schema !== 'number') err(res, 'state.schema 必须是数字');
  if (!FLOW_STATUS.includes(state.status)) err(res, `state.status 非法：${state.status}`);
  if (!FLOW_NEXT.includes(state.next)) err(res, `state.next 非法：${state.next}`);
  if (state.mode !== undefined && !['run', 'dry'].includes(state.mode)) {
    err(res, `state.mode 非法：${state.mode}（允许 run/dry）`);
  }
  if (!state.root || !['repo', 'workspace'].includes(state.root.mode)) {
    err(res, `state.root.mode 非法：${state.root && state.root.mode}`);
  }
  if (typeof state.root?.tracked !== 'boolean') err(res, 'state.root.tracked 必须是 boolean');
  else if (!state.root.tracked) warn(res, '证据层未纳入 git（tracked=false）：换机器或 CI 将丢失历史');
  if (!state.updated) err(res, 'state.updated 缺失');
  if (state.status === 'running') {
    if (!state.currentRun) err(res, 'state.status=running 时 currentRun 必填');
    else if (!existsSync(join(dir, 'runs', `${state.currentRun}.md`))) {
      err(res, `缺少账本：.flow/runs/${state.currentRun}.md`);
    }
  }
  if (state.currentRun) {
    const runPath = join(dir, 'runs', `${state.currentRun}.md`);
    if (existsSync(runPath)) {
      const { data, body } = parseFrontMatter(readFileSync(runPath, 'utf8'));
      if (!data) err(res, `账本缺少 front-matter：.flow/runs/${state.currentRun}.md`);
      else {
        if (data.mode !== undefined && !['run', 'dry'].includes(String(data.mode))) {
          err(res, `账本 mode 非法：${data.mode}（允许 run/dry）`);
        }
        if (!data.run) err(res, '账本缺少 run');
        if (!data.plan) err(res, '账本缺少 plan');
        else {
          const planIds = new Set(res.docs.filter((d) => d.type === 'plan').map((d) => d.data.id));
          if (!planIds.has(String(data.plan))) err(res, `账本引用了不存在的 Plan：${data.plan}`);
        }
        if (!hasTaskTable(body)) err(res, '账本缺少任务表（表头需含「任务」「状态」）');
      }
    }
  }
  const sig = join(dir, 'signals.jsonl');
  if (existsSync(sig)) {
    readFileSync(sig, 'utf8').split('\n').forEach((line, i) => {
      const l = line.trim();
      if (!l) return;
      try {
        const ev = JSON.parse(l);
        if (!ev.ts || !ev.event) err(res, `signals.jsonl 第 ${i + 1} 行缺少 ts/event`);
      } catch {
        err(res, `signals.jsonl 第 ${i + 1} 行不是合法 JSON`);
      }
    });
  }
}

function buildMap(res) {
  const dirs = new Map();
  for (const f of res.relFiles) {
    const dot = f.rel.lastIndexOf('.');
    if (dot < 0) continue;
    if (!CODE_EXT.has(f.rel.slice(dot).toLowerCase())) continue;
    if (f.rel.startsWith('docs/') || f.rel.startsWith('.flow/')) continue;
    const dirRel = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '.';
    dirs.set(dirRel, (dirs.get(dirRel) || 0) + 1);
  }
  const rows = [...dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
  const covered = rows.filter(([d]) => res.anchorDirs.has(d));
  const lines = ['', '## 目录覆盖（--map）', '', '| 目录 | 代码文件 | 覆盖文档 |', '|------|---------|----------|'];
  for (const [d, n] of rows.slice(0, 60)) {
    const set = res.anchorDirs.get(d);
    lines.push(`| ${d} | ${n} | ${set ? [...set].sort().join(', ') : '— 未覆盖'} |`);
  }
  if (rows.length > 60) lines.push(`| … | | 其余 ${rows.length - 60} 个目录省略 |`);
  lines.push('', `覆盖：${covered.length}/${rows.length} 个目录`);
  return lines;
}

function render(res, opts = {}) {
  const lines = [`flow-check: ${res.docsDir} — ${res.docs.length} 篇文档`];
  for (const w of res.warnings) lines.push(`WARN  ${w}`);
  for (const e of res.errors) lines.push(`ERROR ${e}`);
  if (opts.map) lines.push(...buildMap(res));
  lines.push(
    res.errors.length
      ? `FAIL  ${res.errors.length} error(s), ${res.warnings.length} warning(s)`
      : `PASS  ${res.warnings.length} warning(s)`,
  );
  return lines.join('\n');
}

function handleFreeze(res, id) {
  const feat = res.docs.find((d) => d.type === 'feature' && (d.data.id === id || d.base.startsWith(id)));
  if (!feat) {
    console.log(`ERROR 未找到 Feature：${id}`);
    process.exitCode = 1;
    return;
  }
  const hash = hashRequirementBlock(feat.body);
  const current = String(feat.data.frozen || '').replace(/^sha256:/, '');
  console.log(`Feature ${feat.data.id} 需求块哈希：${hash}`);
  console.log(`front-matter 可写：frozen: ${hash}`);
  if (current && current !== hash) {
    console.log(`注意：当前 frozen=${current} 与现值不一致，说明需求块在上次冻结后被修改。`);
  }
}

function runFixtures() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, 'fixtures');
  if (!existsSync(dir)) {
    console.log(`ERROR 未找到 fixtures：${dir}`);
    process.exitCode = 1;
    return;
  }
  const names = readdirSync(dir)
    .filter((n) => {
      try {
        return lstatSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
  let pass = 0;
  for (const name of names) {
    const fdir = join(dir, name);
    const expectPath = join(fdir, 'expect');
    const expect = existsSync(expectPath) ? readFileSync(expectPath, 'utf8') : '';
    const wantExit = Number((expect.match(/exit:\s*(\d+)/) || [])[1] ?? 0);
    const flagLine = (expect.match(/^flags:\s*(.+)$/m) || [])[1] || '';
    const flags = new Set(flagLine.split(/[,\s]+/).filter(Boolean));
    const wanted = expect
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !/^exit:/.test(l) && !/^flags:/.test(l));
    const res = checkDocs(join(fdir, 'docs'), { map: flags.has('map') });
    if (flags.has('trace')) checkTrace(res);
    if (flags.has('gates')) checkGates(res);
    if (flags.has('state')) checkState(res);
    const text = render(res, {});
    const code = res.errors.length ? 1 : 0;
    const missing = wanted.filter((w) => !text.includes(w));
    const ok = code === wantExit && missing.length === 0;
    console.log(`${ok ? 'ok  ' : 'FAIL'} fixture ${name} — exit ${code}${missing.length ? `，缺少：${missing.join(' / ')}` : ''}`);
    if (ok) pass++;
  }
  console.log(`flow-check fixtures: ${pass}/${names.length} passed`);
  if (pass !== names.length) process.exitCode = 1;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const freezeIdx = argv.indexOf('--freeze');
  const freezeId = freezeIdx >= 0 ? argv[freezeIdx + 1] : null;
  const positional = argv.filter(
    (a, i) => !a.startsWith('--') && !(freezeIdx >= 0 && i === freezeIdx + 1),
  );
  const docsDir = positional[0] || 'docs';

  if (flags.has('--fixtures')) {
    runFixtures();
    return;
  }

  const res = checkDocs(docsDir, { map: flags.has('--map') });
  if (flags.has('--trace')) checkTrace(res);
  if (flags.has('--gates')) checkGates(res);
  if (flags.has('--state')) checkState(res);
  if (freezeId) handleFreeze(res, freezeId);

  console.log(render(res, { map: flags.has('--map') }));
  if (res.errors.length) process.exitCode = 1;
}

main();
