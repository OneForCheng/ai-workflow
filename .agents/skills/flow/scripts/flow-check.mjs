#!/usr/bin/env node
/**
 * flow-check.mjs — /flow 文档体系一致性校验（零依赖，Node >= 18）
 *
 * 用法:
 *   node flow-check.mjs [docsDir]                 结构校验，默认 docs
 *   node flow-check.mjs [docsDir] --map           结构校验 + 目录覆盖视图
 *   node flow-check.mjs [docsDir] --trace         结构校验 + Plan AC↔Task 矩阵校验
 *   node flow-check.mjs [docsDir] --gates         结构校验 + 质量门契约校验
 *   node flow-check.mjs [docsDir] --strict        结构校验 + 把可判定的 WARN 升级为 error
 *   node flow-check.mjs [docsDir] --freeze <id>   打印 Feature 需求块哈希（只读）
 *   node flow-check.mjs --fixtures                运行自测样本（scripts/fixtures）
 *
 * 退出码: 0 = 通过（可含 warning）；1 = 存在 error（含 --strict 升级）/ fixture 失败
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
 *  10. Plan 已有非空 §8 但 status 仍为 draft/active → WARN（--strict 升级为 ERROR）
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  other: /^[A-Z]{2,8}-[A-Za-z0-9.-]+$/,
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

const HEADING_LINE = /^#{1,6}\s/;
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

/** Plan §8（执行结果与偏差）标题；兼容「## 8. 」前缀、无编号与省略「与偏差」的写法 */
const DEVIATION_HEADING_RE = /^##\s*(?:\d+[.、]\s*)?执行结果/;

/** 取 Plan §8 段落正文；无该标题返回 null。取最后一个标题（Go 追加在文末，前文可能引用模板） */
function deviationSection(body) {
  const lines = body.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (DEVIATION_HEADING_RE.test(lines[i])) start = i;
  }
  if (start < 0) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** 去 HTML 注释、标题行与表格分隔行后，是否仍有正文 */
function hasSectionContent(section) {
  return section
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l && !l.startsWith('#') && !/^\|[\s:|-]+\|$/.test(l));
}

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
    if (type === 'plan' && data.tier !== undefined && !['standard', 'quick'].includes(data.tier)) {
      err(res, `tier=${data.tier} 非法（允许 standard/quick）：${shown(res, rDocs)}`);
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
        if (HEADING_LINE.test(line) && HISTORY_HEADING.test(line)) {
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

  // Plan §8 已写 / status 漂移（draft·active → 期望 done）
  checkPlanStatusDrift(res, opts);

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

/** 读取某目录的 git user.name；非仓或失败返回空串 */
function gitUserName(dir) {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function gitRepoRoot(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** 期望 user：优先 .flow/repos.json 首个仓，否则 docs 同级项目根 */
function expectedUserForDocs(res) {
  const reposPath = join(res.root, '.flow', 'repos.json');
  if (existsSync(reposPath)) {
    try {
      const data = JSON.parse(readFileSync(reposPath, 'utf8'));
      const rel = data?.repos?.[0]?.path;
      if (typeof rel === 'string' && rel) return gitUserName(resolve(res.root, rel));
    } catch {
      return '';
    }
    return '';
  }
  return gitUserName(res.root);
}

const HANDWRITTEN_PLACEHOLDERS = new Set(['user', 'username', 'name', 'owner', 'bot', '用户名']);

/** 对 draft/active Plan 中手填的用户名做 WARN（无 git user 时跳过） */
function checkHandwrittenMessages(res) {
  const expected = expectedUserForDocs(res);
  if (!expected) return;
  const re =
    /\[([A-Za-z][A-Za-z0-9 .&_-]{0,40})\]\s+#([^\s]+)\s+(feat|fix|refactor|test|chore|style|docs|mock):/g;
  for (const plan of res.docs.filter(
    (d) => d.type === 'plan' && ['draft', 'active'].includes(d.data.status),
  )) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(plan.body))) {
      const name = match[1].trim();
      if (HANDWRITTEN_PLACEHOLDERS.has(name.toLowerCase())) continue;
      if (name !== expected) {
        warn(
          res,
          `变更总结疑似手填用户名（期望 ${expected}）：${shown(res, plan.rDocs)} → ${match[0]}`,
        );
        break;
      }
    }
  }
}

/** Plan 已有非空 §8 但 status 仍是 draft/active → WARN（--strict 升级为 ERROR） */
function checkPlanStatusDrift(res, opts = {}) {
  const stale = res.docs.filter(
    (d) => d.type === 'plan' && ['draft', 'active'].includes(d.data.status),
  );
  for (const plan of stale) {
    const section = deviationSection(plan.body);
    if (section === null || !hasSectionContent(section)) continue;
    const msg =
      `Plan status 仍为 ${plan.data.status}，但 §8 已有内容（Go 似已收尾）：` +
      `${shown(res, plan.rDocs)}；请改为 done（未完成则保持 active 并在 §8 注明遗留）`;
    if (opts.strict) err(res, `${msg}（--strict）`);
    else warn(res, msg);
  }
}

function checkTrace(res) {
  const featureById = new Map(res.docs.filter((d) => d.type === 'feature').map((d) => [d.data.id, d]));
  for (const plan of res.docs.filter((d) => d.type === 'plan')) {
    if (!['draft', 'active'].includes(plan.data.status)) continue;
    const feat = featureById.get(plan.data.feature);
    if (!feat) continue;
    const acs = [...new Set(feat.body.match(/\bAC-\d+\b/g) || [])];
    const isQuick = plan.data.tier === 'quick';
    const covers = Array.isArray(plan.data.covers) ? plan.data.covers.map(String) : null;
    if (covers && covers.length === 0 && !isQuick) {
      err(res, `covers 不能为空数组（无 AC 覆盖请省略该字段）：${shown(res, plan.rDocs)}`);
    }
    const targets = isQuick ? covers || [] : covers || acs;
    if (covers) {
      for (const ac of covers) {
        if (!acs.includes(ac)) err(res, `covers 引用了 Feature 中不存在的 AC：${ac}（${shown(res, plan.rDocs)}）`);
      }
    }
    const matrix = findMatrix(plan.body);
    if (!matrix) {
      if (!isQuick) warn(res, `缺少 AC↔Task 矩阵（--trace 跳过）：${shown(res, plan.rDocs)}`);
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
  checkHandwrittenMessages(res);
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
function validateLedger(res, dir, runId, expectMode) {
  const runPath = join(dir, 'runs', `${runId}.md`);
  if (!existsSync(runPath)) {
    err(res, `缺少账本：.flow/runs/${runId}.md`);
    return;
  }
  const { data, body } = parseFrontMatter(readFileSync(runPath, 'utf8'));
  if (!data) {
    err(res, `账本缺少 front-matter：.flow/runs/${runId}.md`);
    return;
  }
  if (data.mode !== undefined && !['run', 'dry'].includes(String(data.mode))) {
    err(res, `账本 mode 非法：${data.mode}（允许 run/dry）`);
  }
  if (expectMode && String(data.mode || '') !== expectMode) {
    err(res, `账本 mode 应为 ${expectMode}：.flow/runs/${runId}.md`);
  }
  if (!data.run) err(res, '账本缺少 run');
  if (!data.plan) err(res, '账本缺少 plan');
  else {
    const planIds = new Set(res.docs.filter((d) => d.type === 'plan').map((d) => d.data.id));
    if (!planIds.has(String(data.plan))) err(res, `账本引用了不存在的 Plan：${data.plan}`);
  }
  if (!hasTaskTable(body)) err(res, '账本缺少任务表（表头需含「任务」「状态」）');
}

/** 校验 .flow/repos.json（可选）；workspace 模式缺清单给 WARN */
function validateReposFile(res, flowDir, state) {
  const reposPath = join(flowDir, 'repos.json');
  if (!existsSync(reposPath)) {
    if (state?.root?.mode === 'workspace') {
      warn(res, `workspace 模式缺少 .flow/repos.json：${flowDir}`);
    }
    return;
  }
  if (state?.root?.mode !== 'workspace') {
    warn(res, '.flow/repos.json 存在但 state.root.mode 不是 workspace');
  }
  let data;
  try {
    data = JSON.parse(readFileSync(reposPath, 'utf8'));
  } catch (e) {
    err(res, `.flow/repos.json 不是合法 JSON：${e.message}`);
    return;
  }
  if (data.schema !== 1) err(res, '.flow/repos.json 的 schema 必须为 1');
  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    err(res, '.flow/repos.json 的 repos 必须是非空数组');
    return;
  }
  const root = resolve(flowDir, '..');
  const names = new Set();
  for (const item of data.repos) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      err(res, 'repos[].name 必须是非空字符串');
      continue;
    }
    const name = item.name.trim();
    if (names.has(name)) err(res, `repos.json 中 name 重复：${name}`);
    names.add(name);
    if (typeof item.path !== 'string' || !item.path.trim()) {
      err(res, `repos.json 中 ${name} 缺少 path`);
      continue;
    }
    const abs = resolve(root, item.path);
    if (!existsSync(abs)) {
      err(res, `成员仓不存在：${item.path}`);
      continue;
    }
    const actual = gitRepoRoot(abs);
    if (!actual) {
      err(res, `成员仓不是 git 仓：${item.path}`);
      continue;
    }
    if (realpathSync(actual) !== realpathSync(abs)) {
      err(res, `成员仓 path 必须指向仓根：${item.path}`);
    }
  }
  if (data.unmanaged !== undefined && !Array.isArray(data.unmanaged)) {
    err(res, 'repos.json 的 unmanaged 必须是数组');
  }
}

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
  if (!state.root || !['repo', 'workspace'].includes(state.root.mode)) {
    err(res, `state.root.mode 非法：${state.root && state.root.mode}`);
  }
  if (typeof state.root?.tracked !== 'boolean') err(res, 'state.root.tracked 必须是 boolean');
  else if (!state.root.tracked) warn(res, '证据层未纳入 git（tracked=false）：换机器或 CI 将丢失历史');
  if (!state.updated) err(res, 'state.updated 缺失');
  validateReposFile(res, dir, state);
  if (state.status === 'running') {
    if (!state.currentRun) err(res, 'state.status=running 时 currentRun 必填');
    else validateLedger(res, dir, state.currentRun, 'run');
  } else if (state.currentRun) {
    validateLedger(res, dir, state.currentRun, null);
  }
  if (state.lastDryRun) validateLedger(res, dir, state.lastDryRun, 'dry');
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

function sectionOf(body, title) {
  const idx = body.indexOf(`## ${title}`);
  if (idx < 0) return '';
  const rest = body.slice(idx + title.length + 3);
  const next = rest.indexOf('\n## ');
  return next < 0 ? rest : rest.slice(0, next);
}

function fieldAfter(body, prefix) {
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.trim().startsWith(`- ${prefix}`));
  if (i < 0) return '';
  const first = lines[i].trim().slice(prefix.length + 3).replace(/^[：:]\s*/, '').trim();
  const vals = first ? [first] : [];
  for (let j = i + 1; j < lines.length; j++) {
    const raw = lines[j];
    const t = raw.trim();
    if (!t) continue;
    if (/^- /.test(raw)) break; // 下一个顶层字段
    vals.push(t);
  }
  return vals.join(' ');
}

/** 「无」判定：只认独立值（`无` / `无 / …` / `无（…）`），避免「无法…」被误判 */
const NONE_VALUE_RE = /^无(?=$|[\s/（(、,，.。;；])/;

const isNoneValue = (v) => NONE_VALUE_RE.test(String(v).trim());

/** 摩擦主题词表：首命中生效，other 兜底（顺序即优先级；英文加词边界，避免 latest→test） */
const FRICTION_TOPIC_RULES = [
  ['build', /构建|编译|\bbuild\b|\btsc\b|\bwebpack\b|\bvite\b|安装依赖|依赖安装/i],
  ['test', /测试|\btest\b|\bcoverage\b|覆盖率|\bvitest\b|\bjest\b|\bpytest\b/i],
  ['lint', /\blint\b|\beslint\b|\bprettier\b|格式化|\bformat\b|类型检查/i],
  ['db', /\bmigration\b|\bschema\b|\bsql\b|\bprisma\b|\balembic\b|表结构|迁移|数据库/i],
  ['ci', /\bci\b|\bdeploy\b|\bpipeline\b|流水线|\bgithub actions\b/i],
  ['tooling', /脚本|\bscript\b|\bfixtures?\b|\bchecker\b|命令不可用|命令行|\bnode_modules\b|\bnpm\b|\bpnpm\b/i],
  ['docs', /docs\/|\bdocs\b|文档|索引|\breadme\b|\.gitignore|忽略(?:文档|目录|入库)/i],
];

/** 只对「现象」部分归类：`｜`/`|` 之后是修复命令/复检时点，不参与主题判定 */
const topicOfFriction = (entry) => {
  const phenomenon = entry.split(/[｜|]/)[0].trim();
  for (const [topic, re] of FRICTION_TOPIC_RULES) if (re.test(phenomenon)) return topic;
  return 'other';
};

/** 读取「工程摩擦」字段下的全部条目（兼容 1. / - / 续行）；第一条用于明细展示 */
function frictionEntries(body) {
  const prefix = '- 工程摩擦（候选 Compound）';
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.trim().startsWith(prefix));
  if (i < 0) return [];
  const inline = lines[i].trim().slice(prefix.length).replace(/^[：:]\s*/, '').trim();
  if (inline && !isNoneValue(inline)) return [inline];
  const entries = [];
  for (let j = i + 1; j < lines.length; j++) {
    const raw = lines[j];
    const t = raw.trim();
    if (!t) continue;
    if (/^#{1,6}\s/.test(t)) break; // 下一节标题
    const sub = t.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (sub && !/^(?:修复命令|复检时点)[：:]/.test(sub[1])) {
      if (/^- /.test(raw)) break; // 下一个顶层字段
      if (isNoneValue(t)) continue;
      entries.push(t);
      continue;
    }
    if (sub && entries.length) {
      // 拆分书写的子字段：并回上一条，不单独计为摩擦
      entries[entries.length - 1] += ` ｜ ${sub[1].trim()}`;
      continue;
    }
    if (entries.length) entries[entries.length - 1] += ` ${t}`;
  }
  return entries;
}

function reviewCounts(body) {
  const sec = sectionOf(body, 'Review 结果');
  let p1 = 0;
  let p2 = 0;
  for (const line of sec.split('\n')) {
    const m = line.match(/^- (P[12])：\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    if (v && !isNoneValue(v)) {
      if (m[1] === 'P1') p1++;
      else p2++;
    }
  }
  return { p1, p2 };
}

function signalsOf(res) {
  const plans = res.docs.filter((d) => d.type === 'plan');
  const tiers = { standard: 0, quick: 0 };
  for (const p of plans) tiers[p.data.tier === 'quick' ? 'quick' : 'standard']++;

  const retros = res.docs
    .filter((d) => d.type === 'other' && /(^|\/)retro\//.test(d.rDocs))
    .sort((a, b) => a.base.localeCompare(b.base));
  const dateOf = (d) => {
    const m = d.base.match(/(\d{8})/);
    return m ? m[1] : String(d.data.updated || '').replace(/-/g, '');
  };
  const lastRetro = retros.length ? retros[retros.length - 1] : null;
  const lastRetroDate = lastRetro ? dateOf(lastRetro) : '';
  const rawSnapshot = lastRetro && lastRetro.data ? lastRetro.data.plans_total : undefined;
  const snapshot =
    rawSnapshot !== undefined && rawSnapshot !== '' && !Array.isArray(rawSnapshot) && Number.isFinite(Number(rawSnapshot))
      ? Number(rawSnapshot)
      : null;
  const windowPlans = plans.filter((p) => {
    const c = String(p.data.created || '').replace(/-/g, '');
    return !lastRetroDate || c > lastRetroDate;
  });
  const rounds = snapshot !== null ? Math.max(0, plans.length - snapshot) : windowPlans.length;

  let p1 = 0;
  let p2 = 0;
  let friction = 0;
  let waiver = 0;
  let checklist = 0;
  let skip = 0;
  const frictionDetails = [];
  const topicCounts = new Map();
  for (const p of windowPlans) {
    const strat = (p.body.match(/^review:\s*(\w+)/m) || [])[1] || 'checklist';
    if (strat === 'skip') skip++;
    else checklist++;
    const rc = reviewCounts(p.body);
    p1 += rc.p1;
    p2 += rc.p2;
    const fr = fieldAfter(p.body, '工程摩擦（候选 Compound）');
    const entries = frictionEntries(p.body);
    const entryTexts = entries.length ? entries : fr && !isNoneValue(fr) ? [fr] : [];
    if (entryTexts.length) friction++;
    if (entryTexts.length) frictionDetails.push(`${p.data.id || p.base}: ${entryTexts[0].slice(0, 60)}`);
    for (const topic of new Set(entryTexts.map(topicOfFriction))) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    const wv = fieldAfter(p.body, 'waiver');
    if (wv && !isNoneValue(wv)) waiver++;
  }
  const frictionTopics = [...topicCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const frictionRepeat = frictionTopics.filter(([, n]) => n >= 2).length;

  let open = 0;
  const latestRetro = retros.length ? retros[retros.length - 1] : null;
  if (latestRetro) {
    for (const t of parseTables(latestRetro.body)) {
      if (!t.length) continue;
      const head = t[0].map((c) => c.toLowerCase());
      const si = head.findIndex((c) => c.includes('状态'));
      const ii = head.findIndex((c) => c.includes('实验') || c === 'id');
      if (si < 0 || ii < 0) continue;
      for (const row of t.slice(1)) {
        if (row[si] && /open|观察|待观察|running/i.test(row[si])) open++;
      }
    }
  }

  let runs = 0;
  let parked = 0;
  let decisions = 0;
  const flowDir = join(res.root, '.flow');
  const hasFlow = existsSync(join(flowDir, 'state.json'));
  if (hasFlow) {
    const runsDir = join(flowDir, 'runs');
    if (existsSync(runsDir)) {
      const runFiles = readdirSync(runsDir).filter((f) => f.endsWith('.md'));
      runs = runFiles.length;
      for (const f of runFiles) {
        const body = readFileSync(join(runsDir, f), 'utf8');
        for (const t of parseTables(body)) {
          if (!t.length) continue;
          const head = t[0].map((c) => c.toLowerCase());
          const si = head.findIndex((c) => c.includes('状态'));
          if (si < 0 || !head.some((c) => c.includes('任务'))) continue;
          for (const row of t.slice(1)) {
            if (row[si] && /park/i.test(row[si])) parked++;
          }
        }
      }
    }
    const sigPath = join(flowDir, 'signals.jsonl');
    if (existsSync(sigPath)) {
      for (const line of readFileSync(sigPath, 'utf8').split('\n')) {
        const l = line.trim();
        if (!l) continue;
        try {
          const ev = JSON.parse(l);
          if (ev.event === 'task_parked') parked++;
          if (ev.event === 'decision_auto') decisions++;
        } catch {
          /* --state 会报错 */
        }
      }
    }
  }

  const reasons = [];
  if (rounds >= 5) reasons.push('轮次≥5');
  if (p1 >= 3) reasons.push('P1≥3');
  if (friction >= 3) reasons.push('摩擦≥3');
  if (parked >= 3) reasons.push('park≥3');
  return {
    plans: plans.length, tiers, rounds, p1, p2, friction, waiver, checklist, skip,
    open, runs, parked, decisions, hasFlow, lastRetroDate, frictionDetails: frictionDetails.slice(0, 5),
    frictionTopics, frictionRepeat,
    due: reasons.length > 0, reasons,
  };
}

function renderSignals(sig) {
  const source = sig.hasFlow ? `docs + .flow（${sig.runs} 个账本）` : 'docs（降级：无 .flow）';
  return [
    '## 信号摘要（--signals）',
    `- 数据源：${source}`,
    `- 轮次：共 ${sig.plans} 个 Plan（standard ${sig.tiers.standard} / quick ${sig.tiers.quick}），自上次 retro ${sig.rounds}${sig.lastRetroDate ? `（上次 ${sig.lastRetroDate}）` : ''}`,
    `- Review（窗口内）：checklist ${sig.checklist} / skip ${sig.skip}；P1 ${sig.p1} / P2 ${sig.p2}`,
    `- 工程摩擦（窗口内）：${sig.friction} 个 Plan 有记账；waiver：${sig.waiver}`,
    ...(sig.frictionDetails.length ? ['- 摩擦明细（前 5）：', ...sig.frictionDetails.map((d) => `  - ${d}`)] : []),
    `- 摩擦主题：${sig.frictionTopics.length ? sig.frictionTopics.map(([t, n]) => `${t} ${n}`).join(' / ') : '无'}（friction_repeat=${sig.frictionRepeat}）`,
    `- 运行：parked ${sig.parked} / decision_auto ${sig.decisions}`,
    `- 未结实验：${sig.open}`,
    `- 触发：due: ${sig.due ? 'yes' : 'no'}${sig.due ? `（${sig.reasons.join('、')}）` : ''}`,
    '- 规则：轮次≥5 或 P1≥3 或 摩擦≥3 或 park≥3',
  ].join('\n');
}

function renderBrief(sig) {
  return `due: ${sig.due ? 'yes' : 'no'} | rounds=${sig.rounds} | p1=${sig.p1} | friction=${sig.friction} | friction_repeat=${sig.frictionRepeat} | parks=${sig.parked} | source=${sig.hasFlow ? 'flow+docs' : 'docs'}`;
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
    const res = checkDocs(join(fdir, 'docs'), {
      map: flags.has('map'),
      strict: flags.has('strict'),
    });
    if (flags.has('trace')) checkTrace(res);
    if (flags.has('gates')) checkGates(res);
    if (flags.has('state')) checkState(res);
    let text = render(res, {});
    const wantSignals = flags.has('signals') || flags.has('brief');
    const sig = wantSignals ? signalsOf(res) : null;
    if (sig && flags.has('signals')) text += '\n' + renderSignals(sig);
    if (sig && flags.has('brief')) text += '\n' + renderBrief(sig);
    const code = res.errors.length ? 1 : 0;
    const docsShown = toPosix(res.docsDir);
    const missing = wanted.filter((w) => !text.includes(w.replace(/\{docsDir\}/g, docsShown)));
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

  const res = checkDocs(docsDir, { map: flags.has('--map'), strict: flags.has('--strict') });
  if (flags.has('--trace')) checkTrace(res);
  if (flags.has('--gates')) checkGates(res);
  if (flags.has('--state')) checkState(res);
  const sig = flags.has('--signals') || flags.has('--brief') ? signalsOf(res) : null;
  if (freezeId) handleFreeze(res, freezeId);

  console.log(render(res, { map: flags.has('--map') }));
  if (sig) console.log(flags.has('--brief') ? renderBrief(sig) : renderSignals(sig));
  if (res.errors.length) process.exitCode = 1;
}

main();
