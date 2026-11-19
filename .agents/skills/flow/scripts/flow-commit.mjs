#!/usr/bin/env node
/**
 * flow-commit.mjs — /flow 收尾提交助手（零依赖，Node >= 18）
 *
 * 用法:
 *   node flow-commit.mjs --type feat --summary "add flow change summary" [options]
 *   node flow-commit.mjs --dry-run --type docs --summary "update flow docs"
 *   node flow-commit.mjs --self-test
 *
 * 选项:
 *   --type <feat|fix|refactor|test|chore|style|docs|mock>  必填
 *   --summary <text>   英文一句话，动词开头；必填
 *   --card <PP-123|1234>  可选；缺省按最近提交推断，仍无则 N/A
 *   --user <name>      可选；缺省 git config user.name
 *   --cwd <path>       git 操作目录，默认当前目录
 *   --dry-run          只预览 message 与文件数，不 add / commit
 *   --json             输出机器可读 JSON
 *   --self-test        在临时仓库验证推断与提交逻辑
 *   -h, --help         帮助
 *
 * 退出码: 0 成功 / 1 参数或校验失败 / 2 无可提交改动 / 3 git 操作失败
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = ['feat', 'fix', 'refactor', 'test', 'chore', 'style', 'docs', 'mock'];
const CARD_RE = /^(?:[A-Za-z]+-\d+|\d+)$/;
const CARD_SEARCH_RE = /#([A-Za-z]+-\d+|\d+)/;
const FULL_MESSAGE_PREFIX_RE =
  /^\[[^\]]+\]\s+#\S+\s+(?:feat|fix|refactor|test|chore|style|docs|mock):\s*/i;

const EXIT = { ok: 0, usage: 1, nothing: 2, git: 3 };

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

function parseArgs(argv) {
  const opts = { dryRun: false, json: false, selfTest: false, help: false };
  const valueKeys = new Set(['type', 'summary', 'card', 'user', 'cwd']);

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

    const eq = arg.match(/^--([a-z-]+)=(.*)$/);
    if (eq && valueKeys.has(eq[1])) {
      opts[eq[1]] = eq[2];
      continue;
    }
    const key = arg.match(/^--([a-z-]+)$/);
    if (key && valueKeys.has(key[1])) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`缺少参数值：${arg}`, EXIT.usage);
      }
      opts[key[1]] = value;
      i += 1;
      continue;
    }
    throw new CliError(`未知参数：${arg}（用 --help 查看用法）`, EXIT.usage);
  }

  return opts;
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

function resolveRoot(cwd) {
  const abs = resolve(cwd || process.cwd());
  if (!existsSync(abs)) throw new CliError(`目录不存在：${abs}`, EXIT.usage);
  try {
    return git(['rev-parse', '--show-toplevel'], abs);
  } catch (err) {
    throw new CliError(`不在 git 仓库内：${stderrOf(err) || abs}`, EXIT.usage);
  }
}

function resolveUser(root, override, env) {
  if (override && String(override).trim()) return String(override).trim();
  try {
    const user = git(['config', 'user.name'], root, env).trim();
    if (!user) throw new CliError('git config user.name 为空，请用 --user 指定', EXIT.usage);
    return user;
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError('无法读取 git config user.name，请用 --user 指定', EXIT.usage);
  }
}

function inferCard(root, user, env) {
  let log = '';
  try {
    log = git(['log', `--author=${user}`, '-10', '--pretty=format:%s'], root, env);
  } catch {
    return 'N/A';
  }
  for (const line of log.split('\n')) {
    const match = line.match(CARD_SEARCH_RE);
    if (match) return match[1];
  }
  return 'N/A';
}

function resolveCard(root, user, override, env) {
  if (override !== undefined && String(override).trim()) {
    const card = String(override).trim().replace(/^#/, '');
    if (card.toUpperCase() === 'N/A') return 'N/A';
    if (!CARD_RE.test(card)) {
      throw new CliError(`--card 需为 PP-123 或 1234 形式：${override}`, EXIT.usage);
    }
    return card;
  }
  return inferCard(root, user, env);
}

function buildMessage(user, card, type, summary) {
  return `[${user}] #${card} ${type}: ${summary}`;
}

function runCommit(opts = {}) {
  const env = opts.env || process.env;
  const root = resolveRoot(opts.cwd);
  const type = String(opts.type ?? '').trim().toLowerCase();
  if (!TYPES.includes(type)) {
    throw new CliError(`--type 必须是 ${TYPES.join(' | ')} 之一`, EXIT.usage);
  }
  const summary = normalizeSummary(opts.summary);
  const user = resolveUser(root, opts.user, env);
  const card = resolveCard(root, user, opts.card, env);
  const message = buildMessage(user, card, type, summary);

  let status = '';
  try {
    status = git(['status', '--short'], root, env);
  } catch (err) {
    throw new CliError(`git status 失败：${stderrOf(err)}`, EXIT.git);
  }
  const files = status ? status.split('\n').filter(Boolean) : [];

  const base = {
    root,
    user,
    card,
    type,
    summary,
    message,
    files,
    dryRun: Boolean(opts.dryRun),
    commit: null,
  };

  if (files.length === 0) {
    return { ...base, code: EXIT.nothing, reason: 'nothing-to-commit' };
  }

  if (!opts.dryRun) {
    try {
      git(['add', '-A'], root, env);
      git(['commit', '-m', message], root, env);
      base.commit = git(['rev-parse', '--short', 'HEAD'], root, env);
    } catch (err) {
      throw new CliError(`git 提交失败：${stderrOf(err)}`, EXIT.git);
    }
  }

  return { ...base, code: EXIT.ok };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.code === EXIT.nothing) {
    console.log('flow-commit: nothing to commit');
    return;
  }
  console.log(`flow-commit: user ${result.user} card ${result.card}`);
  console.log(`flow-commit: files ${result.files.length}`);
  console.log(`flow-commit: message ${result.message}`);
  if (result.dryRun) {
    console.log('flow-commit: dry-run — nothing committed');
  } else {
    console.log(`flow-commit: commit ${result.commit}`);
  }
}

function printHelp() {
  console.log(`flow-commit.mjs — /flow 收尾提交助手（零依赖）

用法:
  node flow-commit.mjs --type <type> --summary "<en one-liner>" [options]
  node flow-commit.mjs --dry-run --type <type> --summary "<en one-liner>"
  node flow-commit.mjs --self-test

选项:
  --type <${TYPES.join('|')}>  必填
  --summary <text>      英文一句话，动词开头；必填
  --card <PP-123|1234>  缺省按当前用户最近 10 条提交推断，仍无则 N/A
  --user <name>         缺省 git config user.name
  --cwd <path>          git 操作目录，默认当前目录
  --dry-run             只预览，不 add / commit
  --json                输出机器可读 JSON
  --self-test           在临时仓库自测
  -h, --help            帮助

退出码: 0 成功 / 1 参数或校验失败 / 2 无可提交改动 / 3 git 操作失败`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-commit-test-'));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull };
  git(['init', '-q'], dir, env);
  git(['config', 'user.name', 'Test User'], dir, env);
  git(['config', 'user.email', 'test@example.com'], dir, env);
  git(['config', 'commit.gpgsign', 'false'], dir, env);
  return { dir, env };
}

function seedCommit(dir, env, subject, file, content) {
  writeFileSync(join(dir, file), content);
  git(['add', '-A'], dir, env);
  git(['commit', '-q', '-m', subject], dir, env);
}

function selfTest() {
  const dirs = [];
  const passed = [];
  try {
    let { dir, env } = makeTempRepo();
    dirs.push(dir);
    seedCommit(dir, env, '[Test User] #PP-456 feat: seed', 'seed.txt', 'seed');

    let result = runCommit({ cwd: dir, type: 'feat', summary: 'clean worktree', env });
    assert(result.code === EXIT.nothing, '干净工作区应返回 2');
    passed.push('nothing-to-commit');

    writeFileSync(join(dir, 'a.txt'), 'a');
    result = runCommit({
      cwd: dir,
      type: 'feat',
      summary: 'add flow summary',
      env,
      dryRun: true,
    });
    assert(
      result.message === '[Test User] #PP-456 feat: add flow summary',
      `卡号推断或 message 组装错误：${result.message}`,
    );
    assert(result.commit === null, 'dry-run 不应产生 commit');
    assert(git(['status', '--short'], dir, env).includes('a.txt'), 'dry-run 不应暂存改动');
    passed.push('card inference + dry-run');

    result = runCommit({ cwd: dir, type: 'feat', summary: 'add flow summary', env });
    assert(result.code === EXIT.ok && result.commit, '真实提交应成功');
    assert(
      git(['log', '-1', '--pretty=format:%s'], dir, env) ===
        '[Test User] #PP-456 feat: add flow summary',
      'HEAD message 不符合预期',
    );
    assert(git(['status', '--short'], dir, env) === '', '提交后工作区应干净');
    passed.push('real commit');

    ({ dir, env } = makeTempRepo());
    dirs.push(dir);
    seedCommit(dir, env, '[Test User] #N/A docs: seed', 'seed.txt', 'seed');
    writeFileSync(join(dir, 'b.txt'), 'b');
    result = runCommit({
      cwd: dir,
      type: 'fix',
      summary: 'fix flow summary fallback',
      env,
      dryRun: true,
    });
    assert(
      result.message === '[Test User] #N/A fix: fix flow summary fallback',
      `N/A 兜底错误：${result.message}`,
    );
    passed.push('N/A fallback');

    result = runCommit({
      cwd: dir,
      type: 'docs',
      summary: 'update docs',
      user: 'Release Bot',
      card: '#1234',
      env,
      dryRun: true,
    });
    assert(
      result.message === '[Release Bot] #1234 docs: update docs',
      `显式用户名 / 卡号错误：${result.message}`,
    );
    passed.push('explicit user/card');

    let rejected = false;
    try {
      runCommit({ cwd: dir, type: 'wip', summary: 'invalid type', env, dryRun: true });
    } catch (err) {
      rejected = err instanceof CliError && err.code === EXIT.usage;
    }
    assert(rejected, '非法 type 应返回 1');
    passed.push('type validation');

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
