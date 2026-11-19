#!/usr/bin/env node
/**
 * flow-commit.mjs — /flow 收尾提交助手（零依赖，Node >= 18）
 *
 * 用法:
 *   node flow-commit.mjs --type feat --summary "add flow change summary"
 *   node flow-commit.mjs --dry-run --type docs --summary "update flow docs"
 *   node flow-commit.mjs --repo backend --type feat --summary "..." --all-repos
 *   node flow-commit.mjs --check-message "[user] #N/A docs: ..."
 *   node flow-commit.mjs --self-test
 *
 * 退出码: 0 成功 / 1 参数或校验失败 / 2 无可提交改动 /
 *         3 git 操作失败 / 4 无 git 载体 / 5 多仓脏且未显式选择
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = ['feat', 'fix', 'refactor', 'test', 'chore', 'style', 'docs', 'mock'];
const CARD_RE = /^(?:[A-Za-z]+-\d+|\d+)$/;
const CARD_SEARCH_RE = /#([A-Za-z]+-\d+|\d+)/;
const MESSAGE_RE = /^\[([^\]]+)\]\s+#([^\s]+)\s+([a-z]+):\s+(.+)$/;
const FULL_MESSAGE_PREFIX_RE =
  /^\[[^\]]+\]\s+#\S+\s+(?:feat|fix|refactor|test|chore|style|docs|mock):\s*/i;
const IGNORED_DIRS = new Set(['node_modules', 'target', '.m2repo', '.git', '.flow', '.idea', '.vscode']);

const EXIT = { ok: 0, usage: 1, nothing: 2, git: 3, noRepo: 4, ambiguous: 5 };

class CliError extends Error {
  constructor(message, code = EXIT.usage) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

function stderrOf(err) {
  const raw = err?.stderr ?? err?.stdout ?? err?.message ?? '';
  return Buffer.isBuffer(raw) ? raw.toString('utf8').trim() : String(raw).trim();
}

function git(args, cwd, env = process.env) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();
}

function gitOk(args, cwd, env) {
  try {
    return { ok: true, out: git(args, cwd, env) };
  } catch (err) {
    return { ok: false, err: stderrOf(err) };
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function parseArgs(argv) {
  const opts = { dryRun: false, json: false, selfTest: false, help: false, allRepos: false };
  const valueKeys = new Set(['type', 'summary', 'card', 'user', 'cwd', 'repo', 'check-message']);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--self-test') {
      opts.selfTest = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--all-repos') {
      opts.allRepos = true;
      continue;
    }

    const eq = arg.match(/^--([a-z-]+)=(.*)$/);
    if (eq && valueKeys.has(eq[1])) {
      if (eq[1] === 'check-message') opts.checkMessage = eq[2];
      else opts[eq[1]] = eq[2];
      continue;
    }
    const key = arg.match(/^--([a-z-]+)$/);
    if (key && valueKeys.has(key[1])) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`缺少参数值：${arg}`, EXIT.usage);
      }
      if (key[1] === 'check-message') opts.checkMessage = value;
      else opts[key[1]] = value;
      i += 1;
      continue;
    }
    throw new CliError(`未知参数：${arg}（用 --help 查看用法）`, EXIT.usage);
  }

  if (opts.repo && opts.allRepos) {
    throw new CliError('--repo 不能与 --all-repos 同用', EXIT.usage);
  }
  if (opts.checkMessage !== undefined && opts.allRepos) {
    throw new CliError('--check-message 不能与 --all-repos 同用', EXIT.usage);
  }
  return opts;
}

function normalizeType(raw) {
  const type = String(raw ?? '').trim().toLowerCase();
  if (!TYPES.includes(type)) {
    throw new CliError(`--type 必须是 ${TYPES.join(' | ')} 之一`, EXIT.usage);
  }
  return type;
}

function normalizeSummary(raw) {
  let summary = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  summary = summary.replace(FULL_MESSAGE_PREFIX_RE, '');
  summary = summary.replace(/^`+|`+$/g, '').trim();
  if (!summary) throw new CliError('--summary 不能为空', EXIT.usage);
  return summary;
}

function normalizeCard(raw) {
  const card = String(raw).trim().replace(/^#/, '');
  if (card.toUpperCase() === 'N/A') return 'N/A';
  if (!CARD_RE.test(card)) {
    throw new CliError(`--card 需为 PP-123 或 1234 形式：${raw}`, EXIT.usage);
  }
  return card;
}

function resolveUser(root, override, env) {
  if (override && String(override).trim()) return String(override).trim();
  const res = gitOk(['config', 'user.name'], root, env);
  if (!res.ok || !res.out) {
    throw new CliError('无法读取 git config user.name，请用 --user 指定', EXIT.usage);
  }
  return res.out.trim();
}

function inferCard(root, user, env) {
  const res = gitOk(['log', `--author=${user}`, '-10', '--pretty=format:%s'], root, env);
  if (!res.ok) return 'N/A';
  for (const line of res.out.split('\n')) {
    const match = line.match(CARD_SEARCH_RE);
    if (match) return match[1];
  }
  return 'N/A';
}

function resolveCard(root, user, override, env) {
  if (override !== undefined && String(override).trim()) return normalizeCard(override);
  return inferCard(root, user, env);
}

function buildMessage(user, card, type, summary) {
  return `[${user}] #${card} ${type}: ${summary}`;
}

function tryRepoRoot(dir, env) {
  if (!isDir(dir)) return null;
  const res = gitOk(['rev-parse', '--show-toplevel'], dir, env);
  return res.ok ? realPath(res.out) : null;
}

function findFlowWorkspace(start) {
  let dir = realPath(start);
  while (true) {
    const flowDir = join(dir, '.flow');
    if (existsSync(flowDir)) {
      const reposPath = join(flowDir, 'repos.json');
      return { root: dir, reposPath: existsSync(reposPath) ? reposPath : null };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseReposFile(root, reposPath, env) {
  let data;
  try {
    data = JSON.parse(readFileSync(reposPath, 'utf8'));
  } catch (err) {
    throw new CliError(`.flow/repos.json 不是合法 JSON：${err.message}`, EXIT.usage);
  }
  if (data.schema !== 1) {
    throw new CliError('.flow/repos.json 的 schema 必须为 1', EXIT.usage);
  }
  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    throw new CliError('.flow/repos.json 的 repos 必须是非空数组', EXIT.usage);
  }
  const names = new Set();
  const repos = data.repos.map((item) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      throw new CliError('repos[].name 必须是非空字符串', EXIT.usage);
    }
    const name = item.name.trim();
    if (names.has(name)) throw new CliError(`repos.json 中 name 重复：${name}`, EXIT.usage);
    names.add(name);
    if (typeof item.path !== 'string' || !item.path.trim()) {
      throw new CliError(`repos.json 中 ${name} 缺少 path`, EXIT.usage);
    }
    const abs = resolve(root, item.path);
    const actual = tryRepoRoot(abs, env);
    if (!actual || actual !== realPath(abs)) {
      throw new CliError(`成员仓路径不是 git 仓根：${item.path}`, EXIT.usage);
    }
    const rel = relative(realPath(root), actual);
    if (rel.startsWith('..')) {
      throw new CliError(`成员仓必须位于工作区内：${item.path}`, EXIT.usage);
    }
    return { name, root: actual, path: rel || '.' };
  });
  const unmanaged = Array.isArray(data.unmanaged) ? data.unmanaged.map(String) : [];
  return { repos, unmanaged };
}

function detectRepos(root, env) {
  let names = [];
  try {
    names = readdirSync(root).sort();
  } catch {
    return [];
  }
  const repos = [];
  for (const name of names) {
    if (IGNORED_DIRS.has(name)) continue;
    const dir = join(root, name);
    if (!isDir(dir)) continue;
    const actual = tryRepoRoot(dir, env);
    if (actual && actual === realPath(dir)) {
      repos.push({ name, root: actual, path: name });
    }
  }
  return repos;
}

function resolveContext(opts, env) {
  const start = resolve(opts.cwd || process.cwd());
  if (!existsSync(start)) throw new CliError(`目录不存在：${start}`, EXIT.usage);

  if (opts.repo) {
    const ws = findFlowWorkspace(start);
    if (!ws || !ws.reposPath) {
      throw new CliError('--repo 需要可用的 .flow/repos.json', EXIT.usage);
    }
    const { repos, unmanaged } = parseReposFile(ws.root, ws.reposPath, env);
    const chosen = repos.find((r) => r.name === opts.repo);
    if (!chosen) throw new CliError(`repos.json 中找不到仓：${opts.repo}`, EXIT.usage);
    return { mode: 'workspace', workspaceRoot: ws.root, repos: [chosen], unmanaged };
  }

  // 工作区根显式清单优先于「根本身也是仓」的嵌套场景
  const localRepos = join(start, '.flow', 'repos.json');
  if (existsSync(localRepos)) {
    const { repos, unmanaged } = parseReposFile(start, localRepos, env);
    return { mode: 'workspace', workspaceRoot: start, repos, unmanaged };
  }

  // --all-repos 即使在成员仓内运行，也优先解析上层工作区清单
  if (opts.allRepos) {
    const ws = findFlowWorkspace(start);
    if (ws?.reposPath) {
      const { repos, unmanaged } = parseReposFile(ws.root, ws.reposPath, env);
      return { mode: 'workspace', workspaceRoot: ws.root, repos, unmanaged };
    }
    const detectRoot = ws?.root || start;
    const detected = detectRepos(detectRoot, env);
    if (detected.length > 0) {
      return { mode: 'workspace', workspaceRoot: detectRoot, repos: detected, unmanaged: [] };
    }
  }

  const cwdRepo = tryRepoRoot(start, env);
  if (cwdRepo) {
    return {
      mode: 'repo',
      workspaceRoot: cwdRepo,
      repos: [{ name: basename(cwdRepo), root: cwdRepo, path: '.' }],
      unmanaged: [],
    };
  }

  const ws = findFlowWorkspace(start);
  if (ws?.reposPath) {
    const { repos, unmanaged } = parseReposFile(ws.root, ws.reposPath, env);
    return { mode: 'workspace', workspaceRoot: ws.root, repos, unmanaged };
  }

  const detectRoot = ws?.root || start;
  const detected = detectRepos(detectRoot, env);
  if (detected.length > 0) {
    return { mode: 'workspace', workspaceRoot: detectRoot, repos: detected, unmanaged: [] };
  }

  return { mode: 'none', workspaceRoot: detectRoot, repos: [], unmanaged: [] };
}

function collectRepo(repo, opts, env) {
  const status = gitOk(['status', '--porcelain', '-uall'], repo.root, env);
  if (!status.ok) throw new CliError(`git status 失败（${repo.name}）：${status.err}`, EXIT.git);
  const files = status.out ? status.out.split('\n').filter(Boolean) : [];
  let user = '';
  let card = '';
  if (files.length > 0) {
    user = resolveUser(repo.root, opts.user, env);
    card = resolveCard(repo.root, user, opts.card, env);
  } else {
    try {
      user = resolveUser(repo.root, opts.user, env);
      card = resolveCard(repo.root, user, opts.card, env);
    } catch {
      user = '';
      card = '';
    }
  }
  return {
    name: repo.name,
    path: repo.path,
    root: repo.root,
    user,
    card,
    files,
    status: files.length > 0 ? 'dirty' : 'clean',
    message: files.length > 0 ? buildMessage(user, card, opts.type, opts.summary) : '',
    commit: null,
    error: '',
  };
}

function runCommit(opts = {}) {
  const env = opts.env || process.env;
  const type = normalizeType(opts.type);
  const summary = normalizeSummary(opts.summary);
  const ctx = resolveContext(opts, env);
  const baseDir = resolve(opts.cwd || process.cwd());

  if (ctx.mode === 'none') {
    return {
      code: EXIT.noRepo,
      mode: 'none',
      workspace: relative(baseDir, ctx.workspaceRoot) || '.',
      repos: [],
      unmanaged: [],
      root: null,
      user: null,
      card: null,
      type,
      summary,
      message: null,
      files: [],
      dryRun: Boolean(opts.dryRun),
      commit: null,
      error: '没有找到任何 git 载体',
    };
  }

  const repos = ctx.repos.map((repo) => collectRepo(repo, { ...opts, type, summary }, env));
  const dirty = repos.filter((r) => r.files.length > 0);

  if (!opts.card && new Set(dirty.map((r) => r.card).filter(Boolean)).size > 1) {
    const detail = dirty.map((r) => `${r.name}=${r.card}`).join(' ');
    throw new CliError(`卡号冲突：${detail}，请用 --card 指定`, EXIT.usage);
  }

  const base = {
    code: EXIT.ok,
    mode: ctx.mode,
    workspace: relative(baseDir, ctx.workspaceRoot) || '.',
    repos,
    unmanaged: ctx.unmanaged,
    root: (dirty[0] || repos[0])?.root || null,
    user: (dirty[0] || repos[0])?.user || null,
    card: (dirty[0] || repos[0])?.card || null,
    type,
    summary,
    message: (dirty[0] || repos[0])?.message || null,
    files: (dirty[0] || repos[0])?.files || [],
    dryRun: Boolean(opts.dryRun),
    commit: null,
    error: '',
  };

  const primaryView = () => {
    const primary = dirty[0] || repos[0];
    return {
      root: primary?.root || null,
      user: primary?.user || null,
      card: primary?.card || null,
      message: primary?.message || null,
      files: primary?.files || [],
      commit: primary?.commit || null,
    };
  };

  if (dirty.length === 0) return { ...base, ...primaryView(), code: EXIT.nothing };

  if (ctx.mode === 'workspace' && !opts.allRepos && !opts.repo && dirty.length > 1 && !opts.dryRun) {
    return {
      ...base,
      ...primaryView(),
      code: EXIT.ambiguous,
      error: `${dirty.length} 个仓有改动；请用 --all-repos 或 --repo <name> 指定`,
    };
  }

  if (!opts.dryRun) {
    for (let i = 0; i < dirty.length; i += 1) {
      const repo = dirty[i];
      try {
        git(['add', '-A'], repo.root, env);
        git(['commit', '-m', repo.message], repo.root, env);
        repo.commit = git(['rev-parse', '--short', 'HEAD'], repo.root, env);
        repo.status = 'committed';
      } catch (err) {
        repo.status = 'failed';
        repo.error = stderrOf(err);
        const rest = dirty.slice(i).map((r) => r.name);
        return {
          ...base,
          ...primaryView(),
          code: EXIT.git,
          error: `${repo.name} 提交失败：${repo.error}`,
          unprocessed: rest,
          committed: dirty.slice(0, i).map((r) => `${r.name}@${r.commit}`),
        };
      }
    }
  }

  return { ...base, ...primaryView(), code: EXIT.ok };
}

function runCheckMessage(opts = {}) {
  const env = opts.env || process.env;
  const raw = String(opts.checkMessage ?? '').trim();
  if (!raw) return { code: EXIT.usage, error: '--check-message 不能为空' };

  const ctx = resolveContext(opts, env);
  if (ctx.mode === 'none' || ctx.repos.length === 0) {
    return { code: EXIT.usage, error: '找不到 git 仓，无法校验；请进入成员仓或用 --repo 指定' };
  }
  const repo = ctx.repos[0];
  let expectedUser;
  let expectedCard;
  try {
    expectedUser = resolveUser(repo.root, opts.user, env);
    expectedCard = resolveCard(repo.root, expectedUser, opts.card, env);
  } catch (err) {
    return { code: err.code || EXIT.usage, error: err.message };
  }

  const match = raw.match(MESSAGE_RE);
  if (!match) {
    return {
      code: EXIT.usage,
      error: 'message 格式不符：[用户名] #卡号 type: 摘要',
      hint: `[${expectedUser}] #${expectedCard} <${TYPES.join('|')}>: <en one-liner>`,
    };
  }
  const [, user, cardRaw, type, summary] = match;
  const card = cardRaw.replace(/^#/, '');
  if (!TYPES.includes(type)) {
    return {
      code: EXIT.usage,
      error: `type 非法：${type}`,
      hint: `[${expectedUser}] #${expectedCard} <${TYPES.join('|')}>: ${summary}`,
    };
  }
  if (user !== expectedUser) {
    return {
      code: EXIT.usage,
      error: `用户名不匹配：给定 ${user}，期望 ${expectedUser}`,
      hint: buildMessage(expectedUser, expectedCard, type, summary),
    };
  }
  if (card !== expectedCard) {
    return {
      code: EXIT.usage,
      error: `卡号不匹配：给定 ${card}，期望 ${expectedCard}`,
      hint: buildMessage(expectedUser, expectedCard, type, summary),
    };
  }
  return {
    code: EXIT.ok,
    ok: true,
    message: raw,
    user,
    card,
    type,
    summary,
    expectedUser,
    expectedCard,
  };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.code === EXIT.noRepo) {
    console.log('flow-commit: no git carrier — nothing to commit');
    return;
  }
  if (result.code === EXIT.nothing) {
    console.log('flow-commit: nothing to commit');
    return;
  }

  if (result.mode === 'repo') {
    console.log(`flow-commit: user ${result.user} card ${result.card}`);
    console.log(`flow-commit: files ${result.files.length}`);
    console.log(`flow-commit: message ${result.message}`);
    if (result.dryRun) console.log('flow-commit: dry-run — nothing committed');
    else if (result.code === EXIT.git) console.error(`flow-commit: error: ${result.error}`);
    else console.log(`flow-commit: commit ${result.commit}`);
    if (result.code === EXIT.git && result.unprocessed?.length) {
      console.error(`flow-commit: unprocessed: ${result.unprocessed.join(', ')}`);
    }
    return;
  }

  console.log(
    `flow-commit: workspace ${result.workspace} (mode ${result.mode}, ${result.repos.length} repos)`,
  );
  for (const repo of result.repos) {
    const state = repo.commit ? `${repo.status} ${repo.commit}` : repo.status;
    console.log(
      `flow-commit: repo ${repo.name} ${repo.path} files ${repo.files.length} user ${
        repo.user || '-'
      } card ${repo.card || '-'} ${state}`,
    );
  }
  if (result.unmanaged.length) {
    console.log(`flow-commit: unmanaged ${result.unmanaged.join(', ')} (no git carrier) — skipped`);
  }
  if (result.message) console.log(`flow-commit: message ${result.message}`);
  if (result.dryRun) console.log('flow-commit: dry-run — nothing committed');
  if (result.code === EXIT.ambiguous || result.code === EXIT.git) {
    console.error(`flow-commit: error: ${result.error}`);
    if (result.committed?.length) console.error(`flow-commit: committed: ${result.committed.join(', ')}`);
    if (result.unprocessed?.length) console.error(`flow-commit: unprocessed: ${result.unprocessed.join(', ')}`);
  }
}

function printHelp() {
  console.log(`flow-commit.mjs — /flow 收尾提交助手（零依赖）

用法:
  node flow-commit.mjs --type <type> --summary "<en one-liner>" [options]
  node flow-commit.mjs --dry-run --type <type> --summary "<en one-liner>"
  node flow-commit.mjs --check-message "<message>"
  node flow-commit.mjs --self-test

选项:
  --type <${TYPES.join('|')}>  必填
  --summary <text>      英文一句话，动词开头；必填
  --card <PP-123|1234>  缺省按当前用户最近 10 条提交推断，仍无则 N/A
  --user <name>         缺省 git config user.name
  --cwd <path>          git 操作目录，默认当前目录
  --repo <name>         只处理 .flow/repos.json 中的指定成员仓
  --all-repos           处理全部成员仓（>1 脏仓时必须显式指定）
  --dry-run             只预览，不 add / commit
  --check-message <msg> 只校验 message 格式 / 用户名 / 卡号 / type
  --json                输出机器可读 JSON
  --self-test           在临时仓库自测
  -h, --help            帮助

退出码: 0 成功 / 1 参数或校验失败 / 2 无可提交改动 /
        3 git 操作失败 / 4 无 git 载体 / 5 多仓脏且未显式选择`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeEnv() {
  return { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
}

function initRepoAt(dir, userName = 'Test User', email = 'test@example.com') {
  const env = makeEnv();
  mkdirSync(dir, { recursive: true });
  git(['init', '-q'], dir, env);
  git(['config', 'user.name', userName], dir, env);
  git(['config', 'user.email', email], dir, env);
  git(['config', 'commit.gpgsign', 'false'], dir, env);
  return env;
}

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-commit-test-'));
  const env = initRepoAt(dir);
  return { dir, env };
}

function seedCommit(dir, env, subject, file = 'seed.txt', content = 'seed') {
  writeFileSync(join(dir, file), content);
  git(['add', '-A'], dir, env);
  git(['commit', '-q', '-m', subject], dir, env);
}

function makeWorkspace(names = ['backend', 'frontend']) {
  const root = mkdtempSync(join(tmpdir(), 'flow-commit-ws-'));
  const env = makeEnv();
  const repos = names.map((name) => {
    const dir = join(root, name);
    initRepoAt(dir);
    return { name, dir };
  });
  return { root, env, repos };
}

function writeReposJson(root, repos, unmanaged = []) {
  const flowDir = join(root, '.flow');
  mkdirSync(flowDir, { recursive: true });
  writeFileSync(
    join(flowDir, 'repos.json'),
    JSON.stringify(
      {
        schema: 1,
        root: { mode: 'workspace', tracked: false, path: '.' },
        repos: repos.map((r) => ({ name: r.name, path: r.name })),
        unmanaged,
      },
      null,
      2,
    ),
  );
}

function makeDirty(dir, file = 'work.txt') {
  writeFileSync(join(dir, file), 'work');
}

function failHook(dir) {
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
}

function headOf(dir, env) {
  return git(['rev-parse', '--short', 'HEAD'], dir, env);
}

function isDirty(dir, env) {
  return git(['status', '--short'], dir, env) !== '';
}

function selfTest() {
  const dirs = [];
  const passed = [];
  try {
    // 1. 单仓回归 + 卡号推断 + dry-run + 真提交
    let { dir, env } = makeTempRepo();
    dirs.push(dir);
    seedCommit(dir, env, '[Test User] #PP-456 feat: seed');
    let result = runCommit({ cwd: dir, type: 'feat', summary: 'clean worktree', env });
    assert(result.code === EXIT.nothing, '干净工作区应返回 2');
    makeDirty(dir, 'a.txt');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'deep.txt'), 'deep');
    result = runCommit({ cwd: dir, type: 'feat', summary: 'add flow summary', env, dryRun: true });
    assert(
      result.message === '[Test User] #PP-456 feat: add flow summary',
      `卡号推断或 message 组装错误：${result.message}`,
    );
    assert(result.files.length === 2, `未跟踪目录内的文件应逐个计数：${result.files.length}`);
    assert(result.commit === null && isDirty(dir, env), 'dry-run 不应提交或暂存');
    passed.push('single repo dry-run');

    result = runCommit({ cwd: dir, type: 'feat', summary: 'add flow summary', env });
    assert(result.code === EXIT.ok && result.commit, '真实提交应成功');
    assert(!isDirty(dir, env), '提交后工作区应干净');
    passed.push('single repo commit');

    // 2. --check-message
    const ok = runCheckMessage({
      cwd: dir,
      checkMessage: '[Test User] #PP-456 docs: update docs',
      env,
    });
    assert(ok.code === EXIT.ok, `正确 message 应通过：${ok.error || ''}`);
    const badUser = runCheckMessage({
      cwd: dir,
      checkMessage: '[chuang] #PP-456 docs: update docs',
      env,
    });
    assert(
      badUser.code === EXIT.usage && badUser.hint?.includes('[Test User]'),
      '错误用户名应 exit 1 并给出正确 hint',
    );
    const badCard = runCheckMessage({
      cwd: dir,
      checkMessage: '[Test User] #N/A docs: update docs',
      env,
    });
    assert(badCard.code === EXIT.usage, '错误卡号应 exit 1');
    const badType = runCheckMessage({
      cwd: dir,
      checkMessage: '[Test User] #PP-456 wip: update docs',
      env,
    });
    assert(badType.code === EXIT.usage, '非法 type 应 exit 1');
    const override = runCheckMessage({
      cwd: dir,
      checkMessage: '[Release Bot] #1234 docs: update docs',
      user: 'Release Bot',
      card: '#1234',
      env,
    });
    assert(override.code === EXIT.ok, '显式 user/card 覆盖应通过');
    passed.push('check-message');

    // 3. N/A 兜底
    ({ dir, env } = makeTempRepo());
    dirs.push(dir);
    seedCommit(dir, env, '[Test User] #N/A docs: seed');
    makeDirty(dir, 'b.txt');
    result = runCommit({ cwd: dir, type: 'fix', summary: 'fix fallback', env, dryRun: true });
    assert(
      result.message === '[Test User] #N/A fix: fix fallback',
      `N/A 兜底错误：${result.message}`,
    );
    passed.push('N/A fallback');

    // 4. workspace + repos.json：dry-run / exit 5 / --repo / --all-repos
    let ws = makeWorkspace();
    dirs.push(ws.root);
    for (const repo of ws.repos) {
      seedCommit(repo.dir, ws.env, '[Test User] #PRM-1 feat: seed');
      makeDirty(repo.dir);
    }
    writeReposJson(ws.root, ws.repos, ['docs']);
    result = runCommit({ cwd: ws.root, type: 'feat', summary: 'multi repo', env: ws.env, dryRun: true });
    assert(result.code === EXIT.ok && result.repos.length === 2, 'workspace dry-run 应列出 2 个仓');
    assert(result.repos.every((r) => r.files.length === 1), 'workspace dry-run 应显示每个仓的改动');
    assert(result.unmanaged.includes('docs'), 'unmanaged 应出现在结果中');
    result = runCommit({
      cwd: ws.repos[0].dir,
      type: 'feat',
      summary: 'multi repo',
      allRepos: true,
      env: ws.env,
      dryRun: true,
    });
    assert(
      result.mode === 'workspace' && result.repos.length === 2,
      '在成员仓内 --all-repos 应解析上层 workspace',
    );
    passed.push('workspace dry-run');

    result = runCommit({ cwd: ws.root, type: 'feat', summary: 'multi repo', env: ws.env });
    assert(result.code === EXIT.ambiguous, '多脏仓未显式选择应返回 5');
    assert(ws.repos.every((r) => isDirty(r.dir, ws.env)), 'exit 5 不应产生任何提交');
    passed.push('workspace exit 5');

    result = runCommit({
      cwd: ws.root,
      type: 'feat',
      summary: 'multi repo',
      repo: 'backend',
      env: ws.env,
    });
    assert(result.code === EXIT.ok, '--repo 应只提交指定仓');
    assert(!isDirty(ws.repos[0].dir, ws.env), 'backend 应已提交');
    assert(isDirty(ws.repos[1].dir, ws.env), 'frontend 应仍未提交');
    passed.push('workspace --repo');

    result = runCommit({
      cwd: ws.root,
      type: 'feat',
      summary: 'multi repo',
      allRepos: true,
      env: ws.env,
    });
    assert(result.code === EXIT.ok, '--all-repos 应提交剩余仓');
    assert(ws.repos.every((r) => !isDirty(r.dir, ws.env)), '全部仓应已提交');
    passed.push('workspace --all-repos');

    result = runCommit({ cwd: ws.root, type: 'feat', summary: 'multi repo', env: ws.env });
    assert(result.code === EXIT.nothing, '全部干净应返回 2');
    passed.push('workspace clean');

    // 5. 无 repos.json 的深度 1 探测
    ws = makeWorkspace(['alpha', 'beta']);
    dirs.push(ws.root);
    for (const repo of ws.repos) seedCommit(repo.dir, ws.env, '[Test User] #PP-9 feat: seed');
    makeDirty(ws.repos[0].dir);
    result = runCommit({ cwd: ws.root, type: 'feat', summary: 'detect repos', env: ws.env, dryRun: true });
    assert(result.code === EXIT.ok && result.repos.length === 2, '深度 1 探测应找到 2 个仓');
    passed.push('depth-1 detection');

    // 6. 无载体
    const empty = mkdtempSync(join(tmpdir(), 'flow-commit-empty-'));
    dirs.push(empty);
    result = runCommit({ cwd: empty, type: 'feat', summary: 'no carrier', env: makeEnv() });
    assert(result.code === EXIT.noRepo, '无载体应返回 4');
    passed.push('no carrier');

    // 7. 第二仓失败：已提交 / 未处理
    ws = makeWorkspace(['backend', 'frontend']);
    dirs.push(ws.root);
    for (const repo of ws.repos) {
      seedCommit(repo.dir, ws.env, '[Test User] #PP-1 feat: seed');
      makeDirty(repo.dir);
    }
    failHook(ws.repos[1].dir);
    result = runCommit({
      cwd: ws.root,
      type: 'feat',
      summary: 'multi repo failure',
      allRepos: true,
      env: ws.env,
    });
    assert(result.code === EXIT.git, '第二仓失败应返回 3');
    assert(!isDirty(ws.repos[0].dir, ws.env), '第一仓应已提交');
    assert(isDirty(ws.repos[1].dir, ws.env), '失败仓应保留改动');
    assert(result.unprocessed?.includes('frontend'), '应报告未处理仓');
    passed.push('repo failure');

    // 8. 卡号冲突
    ws = makeWorkspace(['backend', 'frontend']);
    dirs.push(ws.root);
    seedCommit(ws.repos[0].dir, ws.env, '[Test User] #PP-1 feat: seed');
    seedCommit(ws.repos[1].dir, ws.env, '[Test User] #PP-2 feat: seed');
    for (const repo of ws.repos) makeDirty(repo.dir);
    let conflict = false;
    try {
      runCommit({ cwd: ws.root, type: 'feat', summary: 'conflict', env: ws.env, dryRun: true });
    } catch (err) {
      conflict = err instanceof CliError && err.code === EXIT.usage;
    }
    assert(conflict, '卡号冲突应返回 1');
    passed.push('card conflict');

    // 9. repos.json 路径非法
    ws = makeWorkspace(['backend']);
    dirs.push(ws.root);
    seedCommit(ws.repos[0].dir, ws.env, '[Test User] #PP-1 feat: seed');
    writeReposJson(ws.root, [{ name: 'bad', path: 'not-a-repo' }]);
    let invalid = false;
    try {
      runCommit({ cwd: ws.root, type: 'feat', summary: 'bad repos', env: ws.env, dryRun: true });
    } catch (err) {
      invalid = err instanceof CliError && err.code === EXIT.usage;
    }
    assert(invalid, 'repos.json 指向非仓根应返回 1');
    passed.push('invalid repos.json');

    console.log(`flow-commit: self-test ${passed.length} passed`);
    return passed;
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`flow-commit: error: ${err.message}`);
    return err instanceof CliError ? err.code : EXIT.usage;
  }

  if (opts.help) {
    printHelp();
    return EXIT.ok;
  }
  if (opts.selfTest) {
    try {
      selfTest();
      return EXIT.ok;
    } catch (err) {
      console.error(`flow-commit: self-test failed: ${err.message}`);
      return EXIT.usage;
    }
  }
  if (opts.checkMessage !== undefined) {
    const result = runCheckMessage(opts);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.code === EXIT.ok) {
      console.log(`flow-commit: message ok ${result.message}`);
    } else {
      console.error(`flow-commit: error: ${result.error}`);
      if (result.hint) console.error(`flow-commit: hint: ${result.hint}`);
    }
    return result.code;
  }

  try {
    const result = runCommit(opts);
    printResult(result, opts.json);
    return result.code;
  } catch (err) {
    console.error(`flow-commit: error: ${err.message}`);
    return err instanceof CliError ? err.code : EXIT.git;
  }
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
