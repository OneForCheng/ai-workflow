---
id: PLAN-20261119-flow-change-summary
title: /flow 收尾变更总结与提交助手实现方案
doc_type: plan
status: done
feature: FEAT-005
tier: standard
covers: [AC-1, AC-2, AC-3, AC-4]
scope: [workflow, skills, commit, scripts]
created: 2026-11-19
---

# PLAN-20261119-flow-change-summary /flow 收尾变更总结与提交助手实现方案

## 1. 需求理解

来源：FEAT-005（对话确认）。`/flow` 每轮收尾在 G2 之后增加「变更总结」：基于实际 diff 生成一句英文 commit 候选，并询问用户是否提交；只有用户确认后才调用 `scripts/flow-commit.mjs`，按 `docs/others/git-commit.md` 的 `[用户名] #卡号 type: 摘要` 提交。standard / quick 交互确认；run 保留逐任务自动 commit，message 改为同一规范，晨报输出整轮候选但不追加提交。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| standard 收尾 | Compound 后输出 G2，无变更总结 | G2 末尾输出英文候选 + 询问提交 | 修改 `SKILL.md`、`compound.md` |
| quick 收尾 | G2 一行回溯后结束 | 同样追加候选 + 询问 | 修改 `quick.md` |
| run 任务 commit | `flow(<run>): T3 <动作>`，不查用户 / 卡号 | 复用 `flow-commit.mjs` 生成 `[user] #card type: …` | 修改 `run.md` |
| run 收尾 | 晨报只有「交付：commit …」 | 追加整轮英文候选，不额外提交 | 修改 `run.md` |
| 提交脚本 | 无 | 零依赖 `flow-commit.mjs`，含推断 / 校验 / dry-run / 自测 | 新增 |
| 契约与索引 | designs 无提交契约 | 在 DES-arch-flow-contracts 增补；同步 README / AGENTS | 修改 |

## 3. 方案

### 思路

把「总结」与「提交」拆成两层：

1. **Agent 负责语义**：读本轮实际 diff，写英文单行动词短语，选 `type`；这一步不交给脚本自动生成。
2. **脚本负责机械与安全**：校验 `type` / 用户名 / 卡号，组装 message，检查工作区，`--dry-run` 预览，确认后 `git add -A` 并 commit。

三种模式共用一个 reference（`summary.md`），避免在 `SKILL.md`、`compound.md`、`quick.md`、`run.md` 重复规则。

### 改动清单

- 新增：`.agents/skills/flow/reference/summary.md` — 收尾总结与提交的共用流程、输出模板、模式差异、失败处理
- 新增：`.agents/skills/flow/scripts/flow-commit.mjs` — 提交助手（零依赖 Node ESM）
- 修改：`.agents/skills/flow/SKILL.md` — 闭环图、G2 门禁、收尾章节引用 summary
- 修改：`.agents/skills/flow/reference/compound.md` — G2 模板追加「变更总结」段并指向 summary
- 修改：`.agents/skills/flow/reference/quick.md` — 收尾步骤追加总结与询问
- 修改：`.agents/skills/flow/reference/run.md` — 任务 commit 走 `flow-commit`，晨报加整轮候选，说明信封授权与交互确认边界
- 修改：`README.md` — skill 说明、目录树
- 修改：`AGENTS.md` — 目录树、命令、脚本约束
- 修改：`docs/designs/arch/flow-contracts.md` — 收尾总结与提交契约
- 修改：`docs/designs/README.md` — 索引 updated
- 新增：`docs/features/FEAT-005-flow-change-summary.md`、`docs/plans/PLAN-20261119-flow-change-summary.md`
- 修改：`docs/features/README.md`、`docs/plans/README.md` — 索引

### 关键设计决策

- **D1：共用 `reference/summary.md`** — 三种模式规则一致，只在触发时机与「是否询问」上不同；单点维护，避免四处漂移。
- **D2：摘要由 Agent 生成，脚本只组装** — 脚本无法可靠理解 diff 语义；Agent 产出英文动词短语，脚本负责格式与 git 安全。
- **D3：`flow-commit` 统一服务交互收尾与 run 任务提交** — 同一套卡号推断与 message 规则；run 的自动提交由授权信封放行，不属于「未确认提交」。
- **D4：默认 `git add -A`** — 与 `docs/others/git-commit.md` 一致；`--dry-run` 先展示文件数，run 的 pre-flight 已要求工作区干净或专用分支。
- **D5：`--self-test` 内嵌临时仓库测试** — 不新增测试依赖，也不在真实仓库产生提交；覆盖卡号推断、`N/A` 兜底、dry-run、空工作区与真实提交。

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T1 | `grep -rn "变更总结" .agents/skills/flow` 命中 SKILL / compound / quick / summary | 待 |
| AC-2 | T2 | `grep -n "flow-commit" .agents/skills/flow/reference/run.md`；人工走查晨报模板 | 待 |
| AC-3 | T3 | `node .agents/skills/flow/scripts/flow-commit.mjs --self-test` | 待 |
| AC-4 | T4、T5 | `node .agents/skills/flow/scripts/flow-check.mjs docs` && `--trace` && `--fixtures` | 待 |

### 4.2 Task 卡片

- T1 | 动作：新增 `summary.md`，在 `SKILL.md` / `compound.md` / `quick.md` 接入收尾总结 | 落点：`.agents/skills/flow/reference/summary.md`、`SKILL.md`、`reference/compound.md`、`reference/quick.md` | DoD：standard / quick 收尾模板含英文候选 + 提交询问，且未确认不提交 | 验证：`grep -rn "变更总结" .agents/skills/flow` | 依赖：无 | 预算：~8k | 风险：低 | AC：AC-1
- T2 | 动作：`run.md` 任务 commit 改走 `flow-commit`，晨报追加整轮候选并声明不额外提交 | 落点：`.agents/skills/flow/reference/run.md` | DoD：§5 任务循环与 §8 晨报均引用脚本；边界说明交互确认 vs 信封授权 | 验证：`grep -n "flow-commit" .agents/skills/flow/reference/run.md` | 依赖：T1 | 预算：~6k | 风险：低 | AC：AC-2
- T3 | 动作：实现 `flow-commit.mjs`（参数解析、推断、dry-run、提交、self-test） | 落点：`.agents/skills/flow/scripts/flow-commit.mjs` | DoD：`--self-test` 全过；无改动退出 2；参数错退出 1；git 失败退出 3 | 验证：`node .agents/skills/flow/scripts/flow-commit.mjs --self-test` | 依赖：无 | 预算：~14k | 风险：中（git 交互与配置隔离） | AC：AC-3
- T4 | 动作：同步 README / AGENTS / designs 契约与索引 | 落点：`README.md`、`AGENTS.md`、`docs/designs/arch/flow-contracts.md`、`docs/designs/README.md` | DoD：结构树含 summary / flow-commit；契约表描述时机、message、脚本、禁止项 | 验证：`node .agents/skills/flow/scripts/flow-check.mjs docs` | 依赖：T1、T3 | 预算：~6k | 风险：低 | AC：AC-4
- T5 | 动作：完成 Feature 勾选与冻结、Plan §8、索引，跑全量校验 | 落点：`docs/features/FEAT-005-flow-change-summary.md`、`docs/plans/PLAN-20261119-flow-change-summary.md`、两份 README | DoD：`docs` / `--trace` / `--fixtures` 全过；frozen 哈希匹配 | 验证：`node .agents/skills/flow/scripts/flow-check.mjs docs --trace` && `--fixtures` | 依赖：T1–T4 | 预算：~5k | 风险：低 | AC：AC-4

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 消费方 / 上下游 | `SKILL.md`、`compound.md`、`quick.md`、`run.md` 四处接入；README / AGENTS 目录树同步 |
| 2 | 配置与环境变量 | 无新增配置；脚本依赖 `git` 与 Node >= 18；不读 `.env` |
| 3 | 数据迁移与兼容 | 无迁移；已安装 skill 更新后脚本随目录安装；旧提交历史不受影响 |
| 4 | 接口契约与版本 | message 格式以 `docs/others/git-commit.md` 为准；type 白名单固定；不新增 CLI 子命令层 |
| 5 | 权限 / 多租户 / 安全 | 仅本地 commit，不 push；不打印密钥；交互路径必须用户确认，run 路径仅信封授权 |
| 6 | 错误路径 / 幂等 / 重试 | 无改动退出 2 且不 add；git 失败退出 3 不重试；重复执行 dry-run 无副作用 |
| 7 | 可观测性（日志 / 指标 / 告警） | 输出 `message` / `files` / `commit sha`；run 账本记录 sha；失败输出 stderr |
| 8 | 测试与事实文档回填 | `--self-test` 覆盖推断与提交；回填 designs 契约、README、AGENTS、Feature / Plan 索引 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 | `summary.md` + SKILL / compound / quick 收尾段 | 待 |
| AC-2 | `run.md` 任务循环与晨报 | 待 |
| AC-3 | `flow-commit.mjs` + `--self-test` | 待 |
| AC-4 | README / AGENTS / designs 同步 + checker / trace / fixtures | 待 |

## 6. 影响的事实文档（Go 回填清单）

- designs：`arch/flow-contracts.md`（新增收尾总结与提交契约）；`designs/README.md` 索引 updated
- standards：无（提交格式已在 `docs/others/git-commit.md`，不新增重复 standard）
- features：新增 `FEAT-005`；`FEAT-002` 仅 `## 关联` 追加后继 Feature（不改正文）
- others：无（决策留在本 Plan）
- 其他：`README.md`、`AGENTS.md` 结构树与命令

## 7. Review 策略

review: checklist

<!-- 仅记录意图：本轮改动非 docs 文件 > 3，按 review.md 计数规则强制 checklist。 -->

## 8. 执行结果与偏差

- 完成：T1–T5
- 偏差：
  - 既有 `docs/others/git-commit.md` 缺 front-matter 且未登记索引，`flow-check` 基线失败；已补元数据与索引行（正文未动）
  - 仓库 `.gitignore` 忽略 `docs/`，Feature / Plan / designs 不进入 git 提交；本次实际可提交文件为 8 个非 docs 文件
  - 按 G0 确认，run 的逐任务 commit 保留，message 改走 `flow-commit`
- 遗留：无
- 基线：`flow-check docs` 初始 FAIL（5 error：`git-commit.md` 缺 id / title / doc_type / status / updated，索引缺链接）；修复后 PASS
- 门禁：
  - `node .agents/skills/flow/scripts/flow-commit.mjs --self-test` → 6 passed
  - `node .agents/skills/flow/scripts/flow-check.mjs docs` → PASS
  - `node .agents/skills/flow/scripts/flow-check.mjs docs --trace` → PASS（Plan 仍为 draft 时执行）
  - `node .agents/skills/flow/scripts/flow-check.mjs --fixtures` → 18/18 passed
  - `node .agents/skills/flow/scripts/flow-commit.mjs --dry-run --type feat --summary "add flow change summary and commit helper"` → `[HuangCheng] #N/A feat: …`，files 8
- waiver：无
- 工程摩擦（候选 Compound）：
  - `docs/` 被 `.gitignore` 忽略，但 Feature / Plan / designs 都在其中；收尾提交无法包含这些「正式产物」，与流程定位冲突 → 期望在 `AGENTS.md` 明确 docs 是否随仓库版本化
  - `flow-check` 基线存在缺 front-matter 的文档长期未被发现 → 期望把 checker 纳入提交前或 CI 的固定质量命令
- 本轮改动文件：
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/reference/compound.md`
  - `.agents/skills/flow/reference/quick.md`
  - `.agents/skills/flow/reference/run.md`
  - `.agents/skills/flow/reference/summary.md`
  - `.agents/skills/flow/scripts/flow-commit.mjs`
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/README.md`（gitignored）
  - `docs/designs/arch/flow-contracts.md`（gitignored）
  - `docs/features/README.md`（gitignored）
  - `docs/features/FEAT-002-flow-evolution.md`（gitignored）
  - `docs/features/FEAT-005-flow-change-summary.md`（gitignored）
  - `docs/plans/README.md`（gitignored）
  - `docs/plans/PLAN-20261119-flow-change-summary.md`（gitignored）
  - `docs/others/README.md`（gitignored）
  - `docs/others/git-commit.md`（gitignored）
- Review 计数：8（已排除 `docs/**`；口径见 review.md）

## Review 结果
- 策略：checklist
- P1：无
- P2：`run` 的 `git add -A` 可能把 park 任务残留带入下一次提交 → 已在 `run.md` park 协议补规则
- P2：交互收尾仍严格 `add -A`（G0 已确认）；依赖 dry-run 文件数 + 用户确认，暂不加路径过滤

## Compound
- 洞察：有（流程 / 工程）：`docs/` 被 `.gitignore` 忽略，事实文档无法随提交入库；`flow-check` 基线存在缺 front-matter 的文档
- 落点：
  - 机检建议：把 `flow-check docs`（及 `--trace`）纳入提交前或 CI（待用户同意写入）
  - standards：无
  - adr：无
  - AGENTS：建议补丁（待用户确认）——明确 `docs/` 是否随仓库版本化，并写明提交前跑 checker
  - skill 草稿：无（本轮新增的 summary / flow-commit 已落在 flow skill 内）
  - 流程改进：交互提交依赖 dry-run 预览与用户确认；run 的 park 残留已补规则

## 后续优化（2026-11-19）
- Go §8 增加 `变更总结` 缓存；G2 / quick 收尾优先复用，Review P1 或文件集不一致时重新生成
- skill 内部引用统一指向 `reference/summary.md`，移除对 `docs/others/git-commit.md` 的依赖
- run 晨报的整轮候选改由账本任务表 + Plan 任务卡汇总，不重读整轮 diff
