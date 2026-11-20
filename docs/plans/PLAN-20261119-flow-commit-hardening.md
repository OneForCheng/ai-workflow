---
id: PLAN-20261119-flow-commit-hardening
title: flow-commit 多仓支持与署名校验实现方案
doc_type: plan
status: done
feature: FEAT-006
tier: standard
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6]
scope: [workflow, commit, workspace, validation]
created: 2026-11-19
---

# PLAN-20261119-flow-commit-hardening flow-commit 多仓支持与署名校验实现方案

## 1. 需求理解

来源：FEAT-006（对话确认，提案两个问题合并）。`flow-commit` 当前假设单仓，且 Plan §8 可能手填 `[用户名] #卡号`。本轮同时解决：

1. **多仓 / 无载体**：工作区根可在 git 外，一工作区多仓；需 `.flow/repos.json`（惰性读取或深度 1 探测）、`--repo` / `--all-repos`、逐仓 dry-run 与提交、exit 4/5。
2. **署名**：用户名 / 卡号只能由脚本推断；`go.md` / `summary.md` 加硬约束，新增 `--check-message`，`flow-check --trace` 对手填不一致给 WARN。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| 仓解析 | `resolveRoot` 只认 cwd 所在仓，失败 exit 1 | `--repo` > cwd > repos.json > 深度 1 > exit 4 | 修改 `flow-commit` |
| 提交 | 单仓一次 `add -A` + commit | 逐仓；>1 脏仓须 `--all-repos`/`--repo` | 修改 `flow-commit` |
| 数据层 | `.flow/state.json` 有 `root.mode/tracked` 但无成员仓清单 | `.flow/repos.json`（惰性） | 新增/文档 |
| `--state` | 只校验 state / 账本 | 增成员仓存在性、名称唯一、仓根校验 | 修改 `flow-check` |
| 署名 | 文档只是「建议」用脚本，无校验入口 | 硬约束 + `--check-message` + WARN | 修改文档/脚本 |
| 测试 | self-test 6 项，全单仓 | 多仓 dry-run/提交/失败/冲突 + 署名断言 | 扩展 |

## 3. 方案

### 3.1 多仓解析

优先级固定：

1. `--repo <name>`：读 `.flow/repos.json`，按 name 取仓；缺清单或名字不存在 → exit 1
2. cwd 在 git 仓内：沿用单仓旧路径（无论是否有 repos.json）
3. 向上查找 `.flow/repos.json`：workspace 模式，使用 `repos[]`
4. 缺失清单：从工作区根（`.flow/` 同级或 cwd）深度 1 找含 `.git` 的子目录，跳过 `node_modules` / `target` / `.m2repo`
5. 仍无：exit 4（无载体，本轮无需提交）

- `--all-repos` 只影响选择范围；与 `--repo` 同用 → exit 1
- `unmanaged` 只列出并提示，不参与 add/commit
- `repos.json` schema 见提案；`path` 解析为工作区根相对路径

### 3.2 提交语义

- dry-run：列出所有成员仓（脏/净）、`unmanaged`；不写盘
- 非 dry-run：
  - 选中脏仓 > 1 且未加 `--all-repos` / `--repo` → exit 5，零提交
  - 逐仓 `git add -A` → commit → 记录 SHA；clean 仓跳过
  - 任一仓失败：立即停止，输出「已提交 / 未处理」，exit 3
- 用户名：每仓 `git config user.name`；`--user` 全局覆盖
- 卡号：`--card` 全局覆盖；否则逐仓推断；各仓推断不一致且无覆盖 → WARN + exit 1
- message：同一 summary / type；用户名 / 卡号按仓组装

### 3.3 署名校验

- `go.md` §8：`变更总结` 只写 `<en>（type）`；MUST NOT 完整 message
- `summary.md`：用户名 / 卡号 MUST 来自 `flow-commit --dry-run` 或 `--check-message`；脚本不可用写 `<由脚本推断>` 并说明
- `--check-message`：正则解析 → 校验 type / 用户名 / 卡号；失败 exit 1 + `hint: 正确候选 …`
- `flow-check --trace`：扫 draft/active Plan 的完整 message；与 git user 不一致 → WARN；无 git 用户跳过

### 3.4 改动清单

- 修改：`.agents/skills/flow/scripts/flow-commit.mjs` — 多仓解析 / 逐仓提交 / `--check-message` / `--json` / self-test / help
- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — `--state` 校验 repos.json；`--trace` 手填 WARN
- 修改：`.agents/skills/flow/reference/summary.md` — 多仓 §、署名 MUST、exit 4/5、询问话术
- 修改：`.agents/skills/flow/reference/run.md` — 晨报按仓
- 修改：`.agents/skills/flow/reference/init.md` — workspace 探测建议（不写 `.flow/`）
- 修改：`.agents/skills/flow/reference/go.md` — §8 MUST NOT 完整 message
- 修改：`.agents/skills/flow/SKILL.md` — 收尾多仓 / 署名
- 修改：`AGENTS.md`、`README.md` — 命令与说明
- 修改：`docs/designs/arch/flow-contracts.md`、`docs/designs/arch/run-protocol.md` — 契约
- 修改：`docs/others/FLOW-SKILL-PROPOSALS.md`、`docs/others/README.md` — front-matter / 索引 / 落地状态
- 新增/修改：`scripts/fixtures/state-workspace-*`、Feature / Plan / 索引

### 3.5 关键设计决策

- **D1：存量单仓零回归** — cwd 在仓内时优先旧路径，不读 repos.json；`--json` 旧字段保留。
- **D2：惰性探测** — 不要求 init 创建 `.flow/`；`init.md` 只给探测建议与 JSON 示例。
- **D3：多仓必须显式** — 非 dry-run >1 脏仓必须 `--all-repos` 或 `--repo`，避免批量误提交。
- **D4：逐仓失败不静默** — 任一仓失败即停，输出已提交 / 未处理，exit 3。
- **D5：卡号冲突宁停** — 各仓推断不一致且无 `--card` → exit 1。
- **D6：署名只认脚本** — `--check-message` 与 checker WARN 共用同一套期望值（user.name / 推断卡号）。
- **D7：checker 无 git 不误报** — 取不到 user 就跳过；有 repos.json 时取首个仓。
- **D8：提案问题一/二同轮落地** — 提案 status 改 accepted，并追加落地状态。

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T1 | `grep -n "MUST NOT\|MUST 取自" .agents/skills/flow/reference/go.md .agents/skills/flow/reference/summary.md` | 待 |
| AC-2 | T2 | `node .agents/skills/flow/scripts/flow-commit.mjs --self-test` 含 check-message 断言 | 待 |
| AC-3 | T3 | 临时 git 仓 + 手填 message → `flow-check docs --trace` WARN；无 git 仓无 WARN | 待 |
| AC-4 | T4 | `flow-check docs --state` 对 workspace fixtures 按预期通过/失败 | 待 |
| AC-5 | T5 | self-test 多仓 dry-run、exit 5、`--all-repos`、失败仓、无载体 exit 4 | 待 |
| AC-6 | T6 | `flow-check docs --trace` && `--fixtures` && `flow-commit --self-test` 全过 | 待 |

### 4.2 Task 卡片

- T1 | 动作：文档署名硬约束 | 落点：`reference/go.md`、`reference/summary.md`、`SKILL.md` | DoD：Plan 只写摘要 + type；用户名/卡号 MUST 取脚本；占位话术明确 | 验证：`grep -n "MUST NOT\|MUST 取自" …` | 依赖：无 | 预算：~5k | 风险：低 | AC：AC-1
- T2 | 动作：`--check-message` + self-test | 落点：`scripts/flow-commit.mjs` | DoD：格式/用户名/卡号/type 校验；失败 hint；覆盖错误与覆盖 | 验证：`flow-commit --self-test` | 依赖：T1 | 预算：~9k | 风险：中 | AC：AC-2
- T3 | 动作：`--trace` 手填用户名 WARN | 落点：`scripts/flow-check.mjs` | DoD：能取用户才告警；无 git 跳过；不阻断 | 验证：临时 git 仓 + `--fixtures` | 依赖：T1 | 预算：~6k | 风险：中 | AC：AC-3
- T4 | 动作：repos.json 解析 / `--state` 校验 / init 建议 / fixtures | 落点：`scripts/flow-check.mjs`、`reference/init.md`、`scripts/fixtures/state-workspace-*` | DoD：成员仓存在、名称唯一、仓根校验；workspace 缺清单 WARN；fixtures 通过 | 验证：`flow-check --fixtures` 与 `docs --state` | 依赖：无 | 预算：~10k | 风险：中 | AC：AC-4
- T5 | 动作：多仓解析 / 逐仓提交 / exit 4/5 / JSON / self-test | 落点：`scripts/flow-commit.mjs` | DoD：`--repo` / `--all-repos` / 惰性探测；>1 脏仓 exit 5；失败仓 exit 3；无载体 exit 4 | 验证：`flow-commit --self-test` | 依赖：T4 | 预算：~14k | 风险：高（git 边界） | AC：AC-5
- T6 | 动作：多仓文档 / 提案元数据 / 索引 / Feature 冻结 / 全量校验 | 落点：`summary.md`、`run.md`、`AGENTS.md`、`README.md`、designs、docs | DoD：summary 含多仓与 exit 4/5；run 按仓；提案 accepted；全绿 | 验证：`flow-check docs --trace` && `--fixtures` && self-test | 依赖：T1–T5 | 预算：~8k | 风险：低 | AC：AC-6

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 消费方 / 上下游 | summary / run / init / go / SKILL / checker / AGENTS |
| 2 | 配置与环境变量 | 读 `.flow/repos.json`、`git config user.name`；无新增 env |
| 3 | 数据迁移与兼容 | 无迁移；单仓旧路径不变；repos.json 可选 |
| 4 | 接口契约与版本 | `--json` 旧字段保留 + `repos[]`；exit 4/5 新增 |
| 5 | 权限 / 多租户 / 安全 | 仅本地 commit；不 push；不做未声明依赖 |
| 6 | 错误路径 / 幂等 / 重试 | 无载体 4；多仓未选 5；仓失败 3；卡冲突 1；dry-run 无副作用 |
| 7 | 可观测性（日志 / 指标 / 告警） | 逐仓行、已提交/未处理、WARN 带文件与期望 user |
| 8 | 测试与事实文档回填 | self-test 多仓 + fixtures workspace + 提案/Feature/Plan/索引 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 | T1 文档硬约束 | 待 |
| AC-2 | T2 `--check-message` | 待 |
| AC-3 | T3 checker WARN | 待 |
| AC-4 | T4 repos.json / state / fixtures | 待 |
| AC-5 | T5 多仓脚本 | 待 |
| AC-6 | T6 文档 / 索引 / 全量校验 | 待 |

## 6. 影响的事实文档（Go 回填清单）

- designs：`arch/flow-contracts.md`（多仓提交 + 署名契约）、`arch/run-protocol.md`（repos.json 定位）
- standards：无（不新增重复 standard）
- features：新增 `FEAT-006`；`FEAT-005` 仅 `## 关联` 追加后继
- others：提案补 front-matter / 索引 / 落地状态
- 其他：`README.md`、`AGENTS.md`、`summary.md`、`run.md`、`init.md`

## 7. Review 策略

review: checklist

<!-- 非 docs 改动 > 3，按 review.md 强制 checklist。 -->

## 8. 执行结果与偏差（Go 结束时追加，不回改上文）

## 8. 执行结果与偏差

- 完成：T1–T6
- 变更总结：add multi repo support and signature check（type: feat）
- 偏差：
  - G0 由「分两轮」改为「一轮全做」，原 `*-signature` 草稿重命名为 `*-hardening`（未冻结、未批准）
  - `.flow/repos.json` 采用惰性探测：`init.md` 只给建议与 JSON 示例，不创建 `.flow/`
  - `--check-message` 只对选中的单个仓校验；`--all-repos` 与它互斥
  - 仓库根 `.gitignore` 的 `docs/` 会忽略 fixture 测试数据；本轮新 fixture 的 docs 在提交时 force-add（既有 fixture 的同类问题记为摩擦）
  - 提案状态改为 accepted，并追加落地状态
- 遗留：全仓 `docs/` 忽略规则同时覆盖 fixture 测试数据；既有 fixtures 在干净 clone 可能缺 docs（本轮未改 `.gitignore`）
- 基线：`flow-check docs` 初始 1 error（提案缺 front-matter）；补元数据后 PASS
- 门禁：
  - `node .agents/skills/flow/scripts/flow-check.mjs docs` → PASS
  - `... --trace` → PASS（含手填用户名 WARN 逻辑）
  - `... --state` → PASS（本仓库无 `.flow/`，1 warning 属预期）
  - `... --fixtures` → 21/21 passed
  - `node .agents/skills/flow/scripts/flow-commit.mjs --self-test` → 14 passed
  - `npx --yes --cache /tmp/npm-cache skills add . -l` → flow 可被发现
  - 手工 workspace：dry-run 2 仓 / 未选 exit 5 / `--all-repos` 提交 / `--check-message` 正确拒绝 `[chuang]`
- waiver：无
- 工程摩擦（候选 Compound）：
  - `.gitignore` 的 `docs/` 同时忽略 `.agents/skills/flow/scripts/fixtures/**/docs/`，fixture 测试数据无法随仓库分发；建议改为 `/docs/` 或对 fixture docs 加 negation
  - `flow-check docs --state` 在无 `.flow/` 的仓库给 warning；属预期但容易误读
  - 多仓 dry-run 的 workspace 路径曾按 `process.cwd()` 显示为 `../../..`；已修为相对 `--cwd`/cwd
- 本轮改动文件：
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/reference/go.md`
  - `.agents/skills/flow/reference/init.md`
  - `.agents/skills/flow/reference/run.md`
  - `.agents/skills/flow/reference/summary.md`
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/flow-commit.mjs`
  - `.agents/skills/flow/scripts/fixtures/state-workspace-missing/**`（新）
  - `.agents/skills/flow/scripts/fixtures/state-repos-bad/**`（新）
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/arch/flow-contracts.md`（gitignored）
  - `docs/designs/arch/run-protocol.md`（gitignored）
  - `docs/designs/README.md`（gitignored）
  - `docs/features/FEAT-006-flow-commit-hardening.md`（gitignored）
  - `docs/features/FEAT-005-flow-change-summary.md`（gitignored）
  - `docs/features/README.md`（gitignored）
  - `docs/plans/PLAN-20261119-flow-commit-hardening.md`（gitignored）
  - `docs/plans/README.md`（gitignored）
  - `docs/others/FLOW-SKILL-PROPOSALS.md`（gitignored）
  - `docs/others/README.md`（gitignored）
- Review 计数：32（排除顶层 `docs/`；含 fixture 测试数据；口径见 review.md）

## Review 结果
- 策略：checklist
- P1：无
- P2：新 fixture 的 `docs/` 被根 `.gitignore` 忽略，提交时需 force-add；既有 fixtures 的同类问题记为遗留
- P2：`--check-message` 只校验选中的单个仓；多仓需 `--repo` 或逐仓校验
- P2：`flow-commit.mjs` 单文件较大，后续可拆分为 resolve / commit / check 模块（非本轮）

## Compound
- 洞察：有（工程）：根 `.gitignore` 的 `docs/` 同时忽略 `.agents/skills/flow/scripts/fixtures/**/docs/`，导致 fixture 测试数据无法随仓库分发；本轮只能对新 fixture force-add
- 落点：
  - 机检建议：在干净 clone / CI 跑 `flow-check --fixtures`，或增加 fixture docs 存在性检查（待用户同意写入）
  - standards：无
  - adr：无
  - AGENTS：建议补丁（待用户确认）——把根忽略规则改为 `/docs/`，或对 fixture docs 加 negation；避免测试数据被 `docs/` 泛匹配吞掉
  - skill 草稿：无
  - 流程改进：多仓提交先在工作区根解析；`--check-message` 多仓需逐仓；fixture 测试数据应显式跟踪

## 后续修正（2026-11-19）
- 采纳 Compound：`.gitignore` 的 `docs/` 改为 `/docs/`，仅忽略根目录文档；补交既有 fixture docs
- `flow-commit` 的 status 改用 `--porcelain -uall`，未跟踪目录按文件逐个计数（此前 27 vs 实际 32 的偏差）
