---
id: PROPOSAL-flow-skill
title: flow skill 改进建议：flow-commit 的多仓支持与署名口径
doc_type: other
status: accepted
scope: [workflow, commit, workspace, validation]
updated: 2026-11-19
inclusion: manual
---

# flow skill 改进建议：flow-commit 的多仓支持与署名口径

- 日期：2026-11-19
- 对象：`ai-workflow` 仓库（`~/.agents/skills/flow` 为其符号链接）
- 性质：**建议稿，未执行任何修改**；行号按 2026-11-19 的 `flow` 版本标注
- 来源：psh 工作区（`psh/` 根非 git 仓，前后端为两个独立仓，`docs/` 无载体）执行 `/flow quick` 收尾时暴露的两个问题

## 结论摘要

| # | 问题 | 根因 | 建议改动量 |
|---|------|------|-----------|
| 1 | 工作区根常不在 git 仓内；一工作区多仓时 `flow-commit.mjs --dry-run` 报错或只覆盖一仓，其余遗留 | `flow-commit.mjs` 全程单仓假设；`.flow/state.json` 已有的 `root.mode/tracked` 未被消费 | 数据层 `.flow/repos.json` + 脚本三态解析 + 逐仓提交语义 + 文档/自测 |
| 2 | Plan 的「变更总结」被手填 `[用户名] #卡号`，用户名常猜错（本轮把 `HuangCheng` 写成 `chuang`） | 文档只说「建议」用脚本推断，无 MUST 约束；无校验入口；脚本不可用时 agent 用 `owner`/邮箱前缀旁证 | 文档硬约束 + `--check-message` + 可选 `flow-check` warning + self-test |

---

# 问题一：工作区根不在 git 仓内 / 一工作区多仓

## 1.1 现状与证据

| 位置 | 现状 | 后果 |
|---|---|---|
| `scripts/flow-commit.mjs:113` `resolveRoot()` | 只对 `--cwd`/cwd 做 `git rev-parse --show-toplevel`，失败即 `CliError('不在 git 仓库内')` exit 1 | 在本工作区根（`psh/`）跑 dry-run 直接报错，拿不到任何候选 |
| `scripts/flow-commit.mjs:165` `runCommit()` | 全程单仓：一次 `git status --short`、一次 `git add -A`、一次 `git commit` | 前后端两仓要么只提交一个、另一个静默遗留；要么人肉跑两遍 |
| `reference/summary.md:25`（§2 条件 3）、`:58` §3、`:69` §4、`:81` §5 | 都按「一个 `git status --short` + 一条 message」写 | Agent 在 workspace 场景无口径可循，容易只覆盖一仓 |
| `.flow/state.json` | **已有** `root.mode: repo\|workspace`、`root.tracked: bool`（`flow-check.mjs:600` 校验） | 元数据存在，但 `flow-commit.mjs` 完全没读，等于白记 |
| 本工作区实例 | `psh/.flow/state.json` = `{root:{mode:"workspace",tracked:false}}`；`prm-psh-frontend`、`prm-psh-backend` 是两个独立仓；`docs/` 无载体 | 「文档无处提交、代码分两仓」三件事混在收尾一步 |

## 1.2 建议 A：数据层——新增 `.flow/repos.json`（由 `/flow init` 写入）

```json
{
  "schema": 1,
  "root": { "mode": "workspace", "tracked": false, "path": "." },
  "repos": [
    { "name": "backend",  "path": "prm-psh-backend" },
    { "name": "frontend", "path": "prm-psh-frontend" }
  ],
  "unmanaged": ["docs"]
}
```

- `name` 供 `--repo backend` 引用；`path` 必须等于 `git rev-parse --show-toplevel` 的绝对值。
- `flow-check --state`（`scripts/flow-check.mjs:600` `checkState`）增加校验：`repos[].path` 存在、是仓根、`name` 不重复；`mode=workspace` 但缺 `repos` → warn。
- 探测规则（`init` 时）：在 `root.path` 下深度 1 找含 `.git` 的子目录（跳过 `node_modules`、`target`、`.m2repo`），命中即登记；找不到则 `mode: repo`（维持现状）。
- `mode: repo` 的仓没有 `repos` 字段，脚本走单仓旧路径——**完全向后兼容**。

## 1.3 建议 B：脚本层——`flow-commit.mjs` 支持三态解析

解析优先级：`--repo` > cwd 所在仓 > `.flow/repos.json` > 深度 1 探测 > `unmanaged`。

```bash
node flow-commit.mjs --dry-run --type feat --summary "..."                 # 现状：单仓
node flow-commit.mjs --dry-run --type feat --summary "..." --repo backend
node flow-commit.mjs --dry-run --type feat --summary "..." --all-repos     # 全部成员仓
```

dry-run 输出（人读）：

```
flow-commit: workspace . (mode workspace, 2 repos)
flow-commit: repo backend  prm-psh-backend  files 3  user HuangCheng  card PRM-14938
flow-commit: repo frontend prm-psh-frontend files 2  user HuangCheng  card PRM-14938
flow-commit: unmanaged docs/ (no git carrier) — skipped
flow-commit: message [HuangCheng] #PRM-14938 feat: <en one-liner>
flow-commit: dry-run — nothing committed
```

`--json` 结构扩展（老字段 `root/user/card/message/files` 保留为「主仓/首个仓」视图，避免破坏消费方）：

```json
{
  "workspace": ".",
  "repos": [
    { "name": "backend", "path": "prm-psh-backend", "user": "HuangCheng",
      "card": "PRM-14938", "files": 3, "message": "...", "status": "dirty" }
  ],
  "unmanaged": ["docs"],
  "code": 0
}
```

新增退出码（同步写进 `--help` 与 `reference/summary.md`）：

| code | 含义 |
|---|---|
| 4 | 找不到任何 git 载体（workspace 下无仓）→ 明确「本轮无需提交」，**不再报错** |
| 5 | 多仓有改动但未加 `--all-repos` / `--repo`（拒绝批量误提交） |

署名与卡号：

- `--user` / `--card` 为全局覆盖；
- 各仓推断不一致 → `WARN card 冲突：backend=PRM-14938 frontend=PRM-14939，请用 --card 指定` 并 exit 1（宁停不错）；
- 每仓 `user` 各自读该仓 `git config user.name`（多仓可能由不同人维护）。

## 1.4 建议 C：提交语义（安全优先）

1. 非 dry-run 且解析到 **>1 个脏仓** 时，必须 `--all-repos` 或逐个 `--repo`，否则 exit 5。
2. 逐仓 `git add -A`（仓库边界天然隔离，不会跨仓）→ `git commit` → 记录 SHA；任一仓失败立即停止，打印「已提交：backend@abc123 / 未处理：frontend（仍有改动）」并 exit 3——**禁止静默遗留**。
3. clean 仓跳过、不计失败；`unmanaged` 路径只提示（`docs/` 无载体属于这种情况）。
4. 不新增 push / merge（红线不变）。

## 1.5 建议 D：文档改动

| 文件 | 改法 |
|---|---|
| `reference/summary.md` | 新增 §「多仓与无载体工作区」：解析优先级表、按仓输出模板、询问话术（「2 个仓有改动，全部提交 / 只提交 backend？」）、exit 4/5 说明；§2 条件 3 的 `git status --short` 改成「逐仓 status」 |
| `reference/run.md:163` | 晨报「变更总结」按仓列 message，`unmanaged` 单列一句 |
| `reference/init.md:159-161` | 初始化时写 `.flow/repos.json`，明确深度 1 探测规则与 `unmanaged` |
| `SKILL.md`（收尾段） | 加一句：多仓工作先解析成员仓，再逐仓出候选 |
| `scripts/flow-check.mjs:600` | `checkState` 校验成员仓（见建议 A） |

## 1.6 建议 E：自测（扩展 `scripts/flow-commit.mjs:275` `selfTest()`）

1. 临时工作区（根非仓）+ 两个子仓（一脏一净）→ dry-run exit 0，输出两行 repo，净仓 `files 0`。
2. 同上不加 `--all-repos` 的真实提交 → exit 5，两仓均未提交。
3. `--all-repos` → 两仓各一条 message，SHA 均打印。
4. 第二仓提交失败（如 hook 返回 1）→ 第一仓已提交、第二仓未动，exit 3 且输出剩余仓。
5. 回归：cwd 在单仓内、有 `.flow` 但不含 `repos` → 与今天行为一致。
6. `.flow/repos.json` 指向非仓根 → exit 1 且信息可诊断。

## 1.7 边界 case（建议写入文档与测试）

- 子仓是 worktree / submodule（`.git` 是文件而非目录）→ 用 `rev-parse --show-toplevel` 判定，不只看目录名。
- 两个仓目录同名不同路径 → `name` 必须唯一，`init` 冲突时要求手填。
- 根目录**本身**也是仓、且子目录另有仓（嵌套）→ 按 `.flow/repos.json` 显式清单，不递归猜测。
- `docs/` 需版本化 → 两种做法由用户决定：并进某个成员仓，或单开 docs 仓并登记进 `repos`。

---

# 问题二：`[用户名] #卡号` 被手填

## 2.1 现状与证据

| 位置 | 现状 | 后果 |
|---|---|---|
| `scripts/flow-commit.mjs:123` `resolveUser()` | 正确：`git config user.name`，`--user` 覆盖 | 脚本本身没错 |
| `reference/go.md:129` §8 模板 | 只要求 `变更总结：<en one-liner>（type: feat）` | 没禁止写完整 message |
| `reference/summary.md:58` §3 | 建议「用 dry-run 推断用户名与卡号」 | 是**建议**不是 MUST；脚本不可用时无兜底话术 |
| 任何位置 | 无校验入口 | 手拼的 message 无处验；本轮凭 `owner: chuang` / 邮箱前缀猜出 `[chuang]`，与 `git config user.name=HuangCheng` 不符 |

## 2.2 建议 1：文档硬约束（成本最低）

- `reference/go.md` §8 增加：
  > `变更总结` 只写 `<en one-liner>` 与 `type`；**MUST NOT** 写 `[用户名] #卡号 type: …` 完整 message——该行由 `flow-commit.mjs` 生成。
- `reference/summary.md` §2 / §4 增加：
  > 用户名与卡号 **MUST** 取自 `flow-commit.mjs --dry-run` 的输出；脚本不可用（非 git 仓 / 无仓）时写 `<由脚本推断>` 占位并说明原因，禁止用 `user.email`、`docs` 的 `owner`、目录名等旁证推断。

## 2.3 建议 2：脚本守卫 `--check-message`

```bash
node flow-commit.mjs --check-message "[chuang] #N/A docs: x"
# flow-commit: error: 用户名不匹配：给定 chuang，git config user.name = HuangCheng
# flow-commit: hint: 正确候选 [HuangCheng] #N/A docs: x
# exit 1
```

校验项：

1. 格式 `^\[[^\]]+\] #\S+ (feat|fix|refactor|test|chore|style|docs|mock): .+`
2. 用户名等于 `git config user.name`（或 `--user` 覆盖值）
3. 卡号等于显式 `--card` 或推断值

用途：Agent 已有候选时先校验，而不是自己拼。

## 2.4 建议 3：门禁可选（防复发）

`flow-check docs --trace` 增加 warning：Plan 正文出现 `[<name>] #<card> <type>: …` 且 `<name>` 与成员仓 `user.name` 不一致 →

```
WARN  变更总结疑似手填用户名（期望 HuangCheng）：docs/plans/PLAN-….md → [chuang] #N/A docs: …
```

workspace 模式下取 `.flow/repos.json` 首个仓的 `user.name`；无仓则跳过（不误报）。

## 2.5 建议 4：self-test 补断言

1. 临时仓 `user.name=HuangCheng`、`user.email=chuang@…` → message 必须是 `[HuangCheng]`（防「拿邮箱前缀当用户名」）。
2. `--check-message` 对错误用户名 / 错误卡号 / 非法 type 分别 exit 1，对正确候选 exit 0。
3. `--user` 显式覆盖时，`--check-message` 以覆盖值为准。

---

# 落地顺序与兼容性

| 顺序 | 内容 | 风险 | 兼容性 |
|---|---|---|---|
| 1 | 文档硬约束（问题二 建议 1） | 极低 | 纯文档 |
| 2 | `--check-message` + self-test（建议 2/4） | 低 | 纯新增 flag |
| 3 | `.flow/repos.json` + `flow-check` 校验 + `init` 写入（问题一 A/D 部分） | 中 | `mode: repo` 不受影响 |
| 4 | `flow-commit` 三态解析 + 逐仓提交 + exit 4/5（问题一 B/C） | 中 | 默认识别路径不变；新码值与 `repos[]` 需同步文档与 `--json` 消费方 |
| 5 | `flow-check` 手填用户名 warning（问题二 建议 3） | 低 | 仅新增 warning |

# 验收清单

- [ ] `node scripts/flow-commit.mjs --self-test` 全绿（含新增多仓与署名断言）
- [ ] `node scripts/flow-check.mjs --fixtures` 全绿（新增 `design-identifier-ok` 等不受影响）
- [ ] 在 psh 布局（根非仓、两子仓、`docs/` 无载体）上 dry-run：输出 2 个 repo + 1 个 unmanaged，exit 0，不报错
- [ ] 同布局非 dry-run 且未加 `--all-repos` → exit 5，两仓均未提交
- [ ] 同布局 `--all-repos` → 两仓各一条 commit，SHA 均打印
- [ ] `--check-message "[chuang] #N/A docs: x"` → exit 1 并给出正确候选
- [ ] 单仓工作区回归：行为与现状一致

# 附：本工作区的现成样本（可直接当集成用例）

- `psh/.flow/state.json` = `{root:{mode:"workspace",tracked:false}}`（已如实记录 workspace 语义）
- 成员仓：`prm-psh-frontend`、`prm-psh-backend`（各自独立 `.git`，最近提交带 `#PRM-14938`）
- 无载体路径：`docs/`（`psh/` 根不是 git 仓库）
- 已发生的手填错误实例：`docs/plans/PLAN-20261119-psh-git-hooks.md` §9 写成 `[chuang]`，§11 已追加更正为 `[HuangCheng]`

## 落地状态（2026-11-19）

- 问题一（多仓 / 无载体）：已落地 `.flow/repos.json` 惰性解析、深度 1 探测、`--repo` / `--all-repos`、逐仓提交、exit 4/5、`--json` `repos[]`、`flow-check --state` 成员仓校验
- 问题二（署名）：已落地 `go.md` / `summary.md` 硬约束、`--check-message`、`flow-check --trace` 手填 WARN、self-test 断言
- 验证：`flow-commit --self-test`、`flow-check --fixtures`、`flow-check docs --trace` 见本轮 Plan §8
