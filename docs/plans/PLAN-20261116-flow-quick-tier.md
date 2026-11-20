---
id: PLAN-20261116-flow-quick-tier
title: quick 档实现方案
doc_type: plan
status: done
feature: FEAT-003
approved: 2026-11-16
scope: [workflow, quick, review]
created: 2026-11-16
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10]
---

# PLAN-20261116-flow-quick-tier quick 档实现方案

## 1. 需求理解

来源：FEAT-003 / 对话。

给 `/flow` 加一档「小改动最小闭环」：语义上属修补/文案/小优化（文件数 ≤5 作辅助判断）、单模块、无契约/权限/迁移/依赖变更时，复用既有 Feature、合并 G0+G1，Review 仍默认 checklist，3 轮内完成，只落 1 个 Plan + 1 条索引。目标是让小任务留在文档体系里，而不是全部滑向 `/do`。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| 入口 | 只有 `/flow` 与 `/flow run` | 增加 `/flow quick` | 新增 |
| 重量判定 | 无；Review 才按风险/计数分档 | 阶段 0 显式判定并可改档 | 新增 |
| 门禁 | G0、G1 分离 | quick 合并为一次确认 | 变体 |
| Feature | 每轮默认新建 | quick 复用现有 Feature | 变体 |
| Review | 按风险/计数询问 | quick 同样默认 checklist，不新增例外 | 不变 |
| 校验 | 标准 Plan 必须覆盖 AC | `tier: quick` 豁免矩阵与 AC 覆盖 | 增补 |

## 3. 方案

### 思路

quick 不是「少做一步」，而是**把固定成本压到与改动相称**：只压缩确认轮次、Feature 数量与 Review，不跳过确认本身、不跳过质量门、不跳需求回溯。所有压缩都以「用户显式选择 quick」为前提。

### 改动清单

- 新增：`.agents/skills/flow/reference/quick.md` — quick 协议（判定 / 一次确认 / 3 轮流程 / 升级 / 与 do 边界）
- 修改：`.agents/skills/flow/reference/plan.md` — `tier` 字段、quick 骨架、P2 与 quick 的关系
- 修改：`.agents/skills/flow/reference/review.md` — 说明 `tier` 不改变 Review 判定
- 修改：`.agents/skills/flow/SKILL.md` — 使用边界、阶段 0 入口
- 修改：`.agents/skills/flow/route.md` — 触发意图补 quick
- 修改：`.agents/skills/flow/reference/init.md` — 宪法模板一句 quick
- 修改：`.agents/skills/flow/reference/go.md` — 复用 Feature 时只允许追加关联行
- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — `tier` 校验、covers 空值规则、quick 矩阵豁免
- 修改：`.agents/skills/flow/scripts/fixtures/` — 新增 `trace-quick` / `plan-cover-empty`
- 修改：`AGENTS.md`、`README.md` — 命令与说明
- 修改：`docs/designs/arch/flow-contracts.md` — 增加重量分档契约
- 修改：`docs/features/FEAT-003-quick-tier.md`（Go 勾选）

### 关键设计决策

- **D1：显式入口** — `/flow quick` 才进 quick；`/flow` 遇到像小改的需求只「建议」，不自动降档。理由：档位决定证据强度，必须由用户知情选择。
- **D2：复用 Feature** — quick 不新建 Feature，`plan.feature` 指向已有；无归属才建最小 Feature（目标 + 一条 AC）。理由：小改多为既有能力的修补，不应污染需求列表。
- **D3：合并 G0/G1，不合并「确认」** — 一次输出「重量 / 复用 Feature / 改动 / 验证 / 风险 / Review 策略」，用户一次确认。理由：确认是安全边界，轮次不是。
- **D4：quick 不降低 Review 标准** — 默认 checklist，仅用户明确不需要才 skip，高风险强制。理由：checklist 固定 4 条单轮、成本很低，省的是 Feature 与 G0 轮次，不是审查；小改恰恰最容易「看着没问题」。被否方案：quick 默认 skip（会让小改成为审查盲区）。
- **D5：越界即升档** — >3 文件、触碰契约/权限/迁移/新依赖 → 停，转 standard 并补 Feature/Plan 段。理由：quick 的可靠性依赖范围可判定。
- **D6：checker 认 `tier`** — quick 允许省略矩阵、允许 `covers: []`；standard 的 `covers` 不得为空。理由：堵住「用空 covers 绕过校验」的漏洞。
- **D7：不新增脚本** — 仍是 Markdown 协议 + 现有 checker 的一个字段。
- **D8：复用 Feature 的冻结护栏** — 只写 Plan、不碰正文；Go 仅可追加关联行；改 AC/范围/业务规则 → 升 standard 新建 Feature。`frozen` 哈希只覆盖需求四节，关联追加安全。
- **D9：复用定位不破坏读集** — 用户点名 / `features/README` 按 scope 命中 1 篇 / 上个 Plan 关联；最多看 2 篇；不确定就问，禁止 grep 全库。

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T1、T4 | 走查 `/flow quick` 入口与判定输出 | 待 |
| AC-2 | T1、T6 | 走查复用 Feature 的 Plan 示例；`plan.feature` 指向已有 | 待 |
| AC-3 | T1 | 走查一次确认后不得先改代码 | 待 |
| AC-4 | T1、T3 | quick 走查仍输出 checklist；命中「支付」路径强制 | 待 |
| AC-5 | T1 | 走查越界升档流程 | 待 |
| AC-6 | T5 | `trace-quick` exit 0；`plan-cover-empty` exit 1 | 待 |
| AC-7 | T1 | 用本方案自身的 mini 示例推演轮次与文档数 | 待 |
| AC-8 | T4 | route.md / SKILL.md 含 quick 与 do 的边界 | 待 |
| AC-9 | T1、T2 | 复用 Feature 的 Go 动作只追加关联；`--freeze` 前后哈希不变 | 待 |
| AC-10 | T1 | 定位路径走查：点名 / 索引 / 上个 Plan，最多 2 篇 | 待 |

### 4.2 Task 卡片

- **T1** 动作：编写 quick 协议
  - 落点：`reference/quick.md`
  - DoD：语义优先判定（文件数辅助）、一次确认模板、Review 默认 checklist、3 轮流程、越界升档、复用 Feature 三条护栏、定位三路径、与 do 边界、禁止项齐全
  - 验证：逐节走查；能在 3 轮内跑通一个示例
  - 依赖：无｜预算：中｜风险：低

- **T2** 动作：Plan 增加 `tier`
  - 落点：`reference/plan.md`（front-matter、骨架、quick 变体）、`reference/go.md`（复用 Feature 的 Go 动作）
  - DoD：`tier: standard|quick`；quick 骨架含需求/改动/验证/回填/风险；Go 复用 Feature 只追加关联行；标准骨架不变
  - 验证：本 Plan 保持 standard 默认，quick 骨架自检
  - 依赖：无｜预算：小｜风险：低

- **T3** 动作：明确 tier 不影响 Review
  - 落点：`reference/review.md`
  - DoD：写明「Plan `tier` 不改变策略判定，quick 同样默认 checklist」；无一字允许自动 skip
  - 验证：quick 与 standard 的策略判定走查结果一致
  - 依赖：T2｜预算：小｜风险：低

- **T4** 动作：入口与边界
  - 落点：`SKILL.md`、`route.md`、`init.md` 宪法模板
  - DoD：`/flow quick` 进入使用边界；阶段 0 识别；`/do` 与 quick 边界一句话说清
  - 验证：`/auto` 菜单与 flow 阶段 0 走查
  - 依赖：T1｜预算：小｜风险：低

- **T5** 动作：checker 支持 tier
  - 落点：`flow-check.mjs`
  - DoD：`tier` 枚举校验；quick 可省矩阵、`covers: []` 合法；standard 的 `covers: []` 报错
  - 验证：`trace-quick` exit 0；`plan-cover-empty` exit 1
  - 依赖：T2｜预算：小｜风险：低

- **T6** 动作：文档回填
  - 落点：`flow-contracts.md`、`FEAT-003`、`AGENTS.md`、`README.md`
  - DoD：契约含 tier 分档；Feature 勾选；命令与说明同步
  - 验证：`flow-check docs --trace --map`
  - 依赖：T1–T5｜预算：小｜风险：低

- **T7** 动作：自测与 dry-run 推演
  - 落点：无需新增文件
  - DoD：`--fixtures` 全绿；用 quick 示例走一遍 3 轮流程；对已 `frozen` 的 Feature 追加关联后哈希不变
  - 验证：`--fixtures`、`docs --trace`、`npx skills add . -l`
  - 依赖：T1–T6｜预算：小｜风险：低

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 消费方 | `/auto` 路由（flow 已含）；SKILL 阶段 0；`/flow` 状态判定 |
| 2 | 配置与环境变量 | 无新增；`tier` 属 Plan front-matter |
| 3 | 数据迁移与兼容 | 旧 Plan 无 `tier` → 视同 standard，行为不变 |
| 4 | 接口契约与版本 | checker 新增字段校验，不改既有退出码语义 |
| 5 | 权限 / 安全 | quick 不降低高风险 Review；不放开红线 |
| 6 | 错误 / 幂等 | quick 越界必须停；重复执行同一 quick 不产生额外文档 |
| 7 | 可观测性 | `tier` 可用于后续 retro 统计占比与返工 |
| 8 | 测试与回填 | 2 个新样本；design 与 Feature 回填 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 显式 quick 入口与判定 | T1、T4 | 待实现 |
| AC-2 复用 Feature | T1、T6 | 待实现 |
| AC-3 合并 G0/G1 | T1 | 待实现 |
| AC-4 Review 默认不跳过 + 高风险强制 | T1、T3 | 待实现 |
| AC-5 越界升档 | T1 | 待实现 |
| AC-6 checker 支持 tier | T5 | 待实现 |
| AC-7 3 轮 / ≤2 文档 | T1 | 待实现 |
| AC-8 与 do 边界 | T4 | 待实现 |
| AC-9 复用不破坏冻结 | T1、T2 | 待实现 |
| AC-10 复用不破坏读集 | T1 | 待实现 |

## 6. 影响的事实文档（Go 回填清单）

- designs：`docs/designs/arch/flow-contracts.md` 增加「重量分档」小节
- standards：无
- features：`FEAT-003` 勾选 AC-1…AC-8，补验收结果
- others：无

## 7. Review 策略

review: checklist
<!-- 非 docs 改动 > 3，强制 checklist -->

## 8. 执行结果与偏差

- 完成：T1–T7
- 偏差：
  - 按用户意见把 D4 从「quick 默认 skip Review」改为「quick 与 standard 一致，默认 checklist」；AC-4 同步改写
  - 判定改为**语义优先、文件数 ≤5 辅助**（原 D5 为 ≤3 硬阈值）；AC-5 阈值同步
  - 新增 AC-9（复用 Feature 的冻结护栏）与 AC-10（复用定位不破坏读集），`covers` 扩到 10 条
  - T3 从「给 quick 开 Review 例外」改为「明确 `tier` 不改变 Review 判定」
  - `--trace` 对 `covers: []` 的处理收紧：standard 报错，quick 允许
- 遗留：
  - P2 retro（FEAT-002 AC-10 / AC-11）未实现
  - quick 与 dry-run 的组合未定义（quick 是否需要先 dry-run）
  - quick 尚未在真实项目验证
- 基线：改动前 `flow-check docs` PASS；`--fixtures` 12/12；`npx skills add . -l` 6 skills
- 门禁：`docs --trace --map` PASS（11 篇文档，覆盖 1/1）；`--fixtures` 14/14；`npx skills add . -l` 6 skills；`frozen` + 追加关联实测通过（哈希不变），改 `## 目标` 则报错
- waiver：无
- 工程摩擦（候选 Compound）：
  1. `tier` 由 Plan 自声明，standard 也能写成 quick 换取豁免；当前靠用户确认与语义判定兜底
  2. quick 的「3 轮内完成」未在真实任务上计时，只是流程设计目标
  3. quick 与 `/flow run` 的组合（无人值守跑 quick）未定义
- 本轮改动文件：
  - `.agents/skills/flow/reference/quick.md`
  - `.agents/skills/flow/reference/plan.md`
  - `.agents/skills/flow/reference/go.md`
  - `.agents/skills/flow/reference/review.md`
  - `.agents/skills/flow/reference/init.md`
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/route.md`
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/fixtures/{trace-quick,plan-cover-empty}/**`
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/arch/flow-contracts.md`
  - `docs/features/FEAT-003-quick-tier.md`
  - `docs/plans/PLAN-20261116-flow-quick-tier.md`
- Review 计数：11（排除 `docs/**`；10 个文件 + fixtures 2 个样本按 1 个资产单元计）

## Review 结果

- 策略：checklist
- P1：无
- P2：
  - `tier` 自声明可换取校验豁免，缺少反向约束（如 quick Plan 至少一条改动 + 一条验证）
  - quick 的 3 轮目标未在真实任务计时
  - quick 与 run 的组合未定义

## Compound

- 洞察：有（信任边界 + 未验证目标 + 组合缺口）
- 落点：
  - 机检建议：已建议（待用户同意）— quick Plan 至少含一条改动与一条验证；`tier` 与 `covers` 一致性交叉校验
  - standards：无
  - adr：无
  - AGENTS：无新增
  - skill 草稿：无
  - 流程改进：retro 时统计 quick 占比、返工率、Review P1 命中率，用来校准判定阈值与「3 轮」目标
