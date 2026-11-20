---
id: PLAN-20261116-flow-verifiability
title: 可判定性基建（P0）实现方案
doc_type: plan
status: done
feature: FEAT-002
scope: [workflow, docs, quality-gates, review]
created: 2026-11-16
---

# PLAN-20261116-flow-verifiability 可判定性基建（P0）实现方案

## 1. 需求理解

来源：FEAT-002 / 对话 / `idea/简单聊聊一些新的 AI 编程实践.pdf`。

本轮只做 **P0 可判定性基建**：给现有 `/flow` 补上「结论可被验证」的能力——文档与代码有锚点、Tasking 有矩阵、质量门失败可归因、Review 按风险触发、checker 自身有回归样本、门禁有契约模板。P1 无人值守执行与 P2 跨轮 retro 只固化契约（已写入 FEAT-002 的 AC-8…AC-11），**本轮不实现**。

硬约束：纯 Markdown 提示词 + 唯一的零依赖 Node 脚本；不引入运行时依赖；所有约定以项目根相对路径表述，可在任意工作目录或仓库运行；retro 与 skill 改动只出建议，须用户确认。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| 代码锚点 | 仅 `scope` 自由标签，文档与代码无连线 | `anchors` 字段 + 覆盖视图 | 增补 |
| 任务拆分 | Plan §4 自由 checklist，无粒度标准与完成判据 | AC↔Task↔验证矩阵 + Task 卡片 + 遗漏清单 | 替换 |
| 质量门 | 「失败即修复重跑」，假失败与真缺陷同构 | 基线 + 归因表 + waiver | 替换 |
| Review 触发 | 按改动文件数 ≤3 询问 skip | 高风险路径强制 checklist，文件数降为次要 | 替换 |
| 门契约 | AGENTS.md 一句话「质量命令」 | fast/full 双档模板 + 结构校验 | 增补 |
| checker 自测 | 无回归样本，改脚本无法验证 | `--fixtures` + 6 个坏样本 | 增补 |

## 3. 方案

### 思路

只加两类东西：**能被脚本判定的**，和**指向别处的指针**。其余一律不加——这是「轻量」在本轮的定义：轻在上下文，重在证据。

- 地图、队列、覆盖、追踪全部做成 checker 的**视图子命令**，不落生成文档：零漂移、零存储、用完即弃
- 失败归因必须基于**基线**：没有基线就分不清「我弄红的」与「本来就红」
- 风险触发优先于数量触发：文件数不是风险的代理变量
- `.flow/` 运行层与 `docs/` 事实层分离；P0 只固化契约，不落地目录（P1 才需要）

### 改动清单

- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — 新增 `anchors` 校验与 `--map` / `--trace` / `--gates` / `--fixtures` 子命令；保持零依赖、单文件
- 新增：`.agents/skills/flow/scripts/fixtures/**` — 6 个坏样本目录（各自含最小 `docs/` 树与 `expect` 期望）
- 修改：`.agents/skills/flow/reference/plan.md` — §4 三件套（矩阵 / 卡片 / 遗漏清单）；Plan 与 Feature 骨架同步
- 修改：`.agents/skills/flow/reference/go.md` — 质量检查改为基线 + 归因表 + waiver；自检补 anchors / 矩阵
- 修改：`.agents/skills/flow/reference/review.md` — 风险触发清单与计数口径（文件数降为次要）
- 修改：`.agents/skills/flow/reference/init.md` — `anchors` 约定、质量门契约模板、`.flow/` 一句预留
- 修改：`.agents/skills/flow/SKILL.md` — 门禁与 Review 判定引用新口径，正文行数不增加
- 修改：`AGENTS.md` — 补 `anchors` / 门契约 / 校验命令一句，结构树补 `scripts/fixtures/`
- 修改：`README.md` — 结构树补 `scripts/fixtures/`
- 新增：`docs/designs/arch/flow-contracts.md`（Go 阶段回填）— anchors、Tasking、归因、门契约、`.flow/` 定位的当前事实
- 新增：`docs/features/FEAT-002-flow-evolution.md`、`docs/plans/PLAN-20261116-flow-verifiability.md` 与索引（P2 已完成）

### 关键设计决策

- **D1：`anchors` 放 front-matter，不做索引列** — 理由：索引列会与 front-matter 重复维护；checker 直读 front-matter 即可。被否方案：在 `README.md` 加 anchors 列（双写、索引膨胀）。
- **D2：地图/队列/覆盖/追踪做成 checker 子命令，不生成文档** — 理由：生成文档必漂移且占 token；视图按需打印。被否方案：`repo-map.md` 定时生成。
- **D3：失败归因必须基于基线** — 理由：Go 开始先跑一次门禁并记账本，才能判定「本轮引入」。被否方案：只靠 diff 相关性猜测。
- **D4：Review 风险触发优先，文件数降为次要** — 理由：3 个文件可以改支付，30 个文件可以是文档。被否方案：维持纯计数。
- **D5：门契约 fast/full 双档** — 理由：Go 跑 fast、收尾与 CI 跑 full，直接消解「单文件测试撞全仓覆盖率」。被否方案：每项目自定脚本。
- **D6：fixtures 复用同一脚本的 `--fixtures`，不新增 runner** — 理由：守住「唯一零依赖脚本」约束；fixtures 只是数据。
- **D7：`.flow/` 与 `docs/` 分离，P0 只定契约** — 理由：运行状态不是事实文档，不应受索引登记与 Feature 冻结约束。定位优先级：`--flow-root` > `FLOW_ROOT` > 向上查找 > git root > cwd；workspace 模式记录任务所属 repo；父级无 git 时 `tracked: false`（不假装可追溯）。内部分层：**结论层**（`state.json`、retro 记录）可跟踪，**证据层**（`runs/`、`signals.jsonl`）默认本地；证据缺失时 retro 标注置信度降级。
- **D8：P1/P2 只固化 AC，不进本轮实现** — 理由：先可判定、后可续跑；没有矩阵和归因的夜跑只会放大返工。

## 4. Tasking

### 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T1、T6 | `node flow-check.mjs docs --map` 输出覆盖视图；无效 anchors 报错 | 待 |
| AC-2 | T3、T2 | `node flow-check.mjs docs --trace` 对缺失 AC 覆盖报错 | 待 |
| AC-3 | T4 | 人为制造假失败，§8 出现归因与 waiver | 待 |
| AC-4 | T5 | 构造命中「支付」路径的 2 文件改动，Review 不再询问 skip | 待 |
| AC-5 | T6 | init 模板含 fast/full 契约；`--gates` 能报契约缺字段 | 待 |
| AC-6 | T7 | `node flow-check.mjs docs --fixtures` 6/6 按预期失败 | 待 |
| AC-7 | T1、T2、T7 | 在临时目录复制 fixture 后运行，无绝对路径依赖 | 待 |
| AC-8、AC-9、AC-10、AC-11 | — | P1 / P2，后续轮次 | 后续 |

### Task 卡片

- **T1** 动作：在 checker 中实现 anchors 校验与 `--map`
  - 落点：`flow-check.mjs`（`parseFrontMatter` 后新增锚点解析；新增子命令分发）
  - DoD：无效/绝对/未命中锚点报 ERROR；`--map` 输出「目录 / 覆盖文档数 / 未覆盖」三列
  - 验证：`node flow-check.mjs docs --map` 退出码 0；构造坏锚点后退出码 1
  - 依赖：无｜预算：中｜风险：中

- **T2** 动作：实现 `--trace` 与 `--gates` 结构校验
  - 落点：`flow-check.mjs`（解析 Plan §4 矩阵与 Feature AC；解析 `quality-gates` 契约）
  - DoD：矩阵缺 AC、AC 无 Task、Task 无验证均报 ERROR；`deferred/后续` 行豁免；门契约缺 `fast|full|layer|on_fail` 报 ERROR
  - 验证：`--trace` 对 fixture 中缺矩阵的 Plan 报错；`--gates` 对残缺契约报错
  - 依赖：T1｜预算：中｜风险：中

- **T3** 动作：升级 `plan.md` 的 Tasking 与骨架
  - 落点：`.agents/skills/flow/reference/plan.md` §4、Plan 骨架、Feature 骨架
  - DoD：三件套（矩阵 / 卡片 / 遗漏清单）有模板与粒度规则；`--trace` 规则与模板一致
  - 验证：用新模板重写本 Plan §4 自检通过
  - 依赖：T2｜预算：小｜风险：低

- **T4** 动作：重写 Go 的质量检查段
  - 落点：`.agents/skills/flow/reference/go.md` 步骤 2 与 §8 字段
  - DoD：归因表（本轮 / 既有 / 门禁本身）、基线记录、waiver 字段齐全；与 `compound.md` 的工程摩擦信号不冲突
  - 验证：模拟假失败走查一遍，§8 字段可填满
  - 依赖：T2｜预算：小｜风险：低

- **T5** 动作：Review 改为风险优先
  - 落点：`.agents/skills/flow/reference/review.md` 策略判定与读集
  - DoD：高风险路径命中即强制 checklist；文件数仅用于「是否询问」的次要信号；同步 `flow/SKILL.md`
  - 验证：走查支付类 2 文件改动与文档类 30 文件改动两种情形
  - 依赖：无｜预算：小｜风险：低

- **T6** 动作：init 模板补 anchors 与门契约
  - 落点：`.agents/skills/flow/reference/init.md`
  - DoD：AGENTS 宪法含 anchors 一句与门契约指针；`docs/standards/quality-gates.md` 模板含 fast/full/layer/on_fail；`.flow/` 仅一句预留
  - 验证：按模板初始化一个临时项目，`--gates` 通过
  - 依赖：T2｜预算：小｜风险：低

- **T7** 动作：实现 `--fixtures` 与 6 个坏样本
  - 落点：`.agents/skills/flow/scripts/fixtures/`（缺 front-matter / 冻结 Feature 被改 / 索引漂移 / plan.feature 悬空 / anchors 失效 / designs 残留变更历史）
  - DoD：每个 fixture 含 `docs/` 与 `expect`；`--fixtures` 串行执行、汇总通过率；无绝对路径
  - 验证：`node flow-check.mjs docs --fixtures` 输出 6/6
  - 依赖：T1、T2｜预算：中｜风险：中

- **T8** 动作：同步 SKILL / AGENTS / README 并全量自测
  - 落点：`.agents/skills/flow/SKILL.md`、`AGENTS.md`、`README.md`
  - DoD：无新增门禁语义；文档行数不膨胀；结构树与实际文件一致
  - 验证：`node flow-check.mjs docs` 通过；`npx skills add . -l` 仍发现 6 个 skill
  - 依赖：T3–T7｜预算：小｜风险：低

### 遗漏清单（8 项，逐项确认）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方/消费方 | 无（纯提示词与脚本） |
| 2 | 配置与环境变量 | `docsDir` 参数、`FLOW_ROOT` 预留；无新环境变量 |
| 3 | 数据迁移与兼容 | 旧 docs 无 anchors → 视为通过（不强制）；旧 Plan 无矩阵 → `--trace` 跳过并 WARN |
| 4 | 接口契约与版本 | 子命令为新增，不改既有调用方式；退出码语义不变 |
| 5 | 权限与多租户 | 不适用 |
| 6 | 错误与幂等 | 子命令只读；重复执行结果一致 |
| 7 | 可观测性 | `--fixtures` 汇总行；ERROR 带文件路径与行号 |
| 8 | 测试与文档回填 | fixtures 即回归测试；Go 回填 `DES-arch-flow-contracts` |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 anchors + 覆盖视图 | T1、T6 | 待实现 |
| AC-2 矩阵与 `--trace` | T3、T2 | 待实现 |
| AC-3 归因/基线/waiver | T4 | 待实现 |
| AC-4 Review 风险优先 | T5 | 待实现 |
| AC-5 门契约模板 | T6 | 待实现 |
| AC-6 fixtures 自测 | T7 | 待实现 |
| AC-7 路径可移植 | T1、T2、T7 | 待实现 |

## 6. 影响的事实文档（Go 回填清单）

- designs：新增 `docs/designs/arch/flow-contracts.md`（anchors 契约、Tasking 三件套、失败归因、门契约、`.flow/` 定位）
- standards：无（门契约模板属 init 产物，落地在目标项目；本轮只改模板）
- features：`FEAT-002` 勾选 AC-1…AC-7，补关联
- others：无

## 7. Review 策略

review: checklist
<!-- 预计改动 > 3 个非 docs 文件，按计数口径强制 checklist，不询问 -->

## 8. 执行结果与偏差

- 完成：T1–T8（T9 即本段与事实文档回填）
- 偏差：
  - 新增 `frozen` 机制与 `--freeze` 子命令（原 Plan 未列；为支撑「冻结 Feature 被改」样本，同时把「确认后正文冻结」从 prose 变成机检）
  - 覆盖矩阵的后续行由 `AC-8…AC-11` 改为逐个 ID（`--trace` 只识别 `AC-<n>`，区间写法解析不到中间值）
  - Review 前自查发现高风险路径清单在 plan / SKILL / AGENTS / design 四处重复，已收敛为「review.md 单点定义 + 各处指针」
- 遗留：
  - P1 无人值守执行（AC-8、AC-9）与 P2 retro（AC-10、AC-11）未实现
  - 本仓库为纯 Markdown 库，`--gates` 只有模板、无真实契约文件；门禁即 flow-check 与 skills 发现
- 基线：改动前 `flow-check docs` PASS；`npx skills add . -l` 发现 6 个 skill
- 门禁：`flow-check docs --trace --map` PASS（6 篇文档，覆盖 1/1 目录）；`--fixtures` 6/6；`npx skills add . -l` 6 skills
- waiver：无
- 工程摩擦（候选 Compound）：
  1. `npx skills` 因 `~/.npm` 缓存 root-owned 报 EPERM → 绕过：`--cache /tmp/npm-cache`；期望：安装说明补缓存参数，或修复缓存属主
  2. 覆盖矩阵写区间 `AC-8…AC-11` 时 `--trace` 解析不到中间 ID → 绕过：逐个 ID；期望：`--trace` 支持区间展开，或在模板中禁止区间写法
  3. 仓库没有任何自动化测试，改 checker 只能依赖 fixtures；fixtures 自身无 lint / 类型检查
- 本轮改动文件：
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/fixtures/**`（6 个样本目录）
  - `.agents/skills/flow/reference/plan.md`
  - `.agents/skills/flow/reference/go.md`
  - `.agents/skills/flow/reference/review.md`
  - `.agents/skills/flow/reference/init.md`
  - `.agents/skills/flow/SKILL.md`
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/arch/flow-contracts.md`
  - `docs/designs/arch/skill-routing.md`
  - `docs/designs/README.md`
  - `docs/features/FEAT-002-flow-evolution.md`
  - `docs/plans/PLAN-20261116-flow-verifiability.md`
- Review 计数：9（排除 `docs/**`；flow-check、plan、go、review、init、SKILL、AGENTS、README 共 8 个文件，fixtures 6 个样本按 1 个资产单元计）

## Review 结果

- 策略：checklist
- P1：无
- P2：
  - `--trace` 只校验 `draft|active` 的 Plan，已 `done` 的历史矩阵不再回溯（有意取舍，避免噪音）
  - 表格解析按 `|` 切分，单元格内含未转义 `|` 时会误切（本仓库文档未使用，属边界）
  - fixtures 只能靠运行验证，无静态检查（受「单一零依赖脚本」约束）

## Compound

- 洞察：有（3 条工程摩擦 + 2 条流程改进；非「无系统级沉淀」）
- 落点：
  - 机检建议：已建议（待用户同意）— `--trace` 支持区间写法 `AC-a…AC-b`，或支持转义 `\|` 后再切分
  - standards：无
  - adr：无
  - AGENTS：已建议补丁（待用户确认）— `npx skills` 在 `~/.npm` 缓存 root-owned 时的绕过说明（`--cache /tmp/npm-cache`）
  - skill 草稿：无
  - 流程改进：① 覆盖矩阵单元格只写 ID 与命令，禁止区间/自然语言；② Go 自检增加「同一规则是否在多处重复定义」；③ 改 checker 后必跑 `--fixtures`（已写入 AGENTS.md）

## Compound 落地（用户确认后追加）

- `--trace` 支持区间写法：`AC-1…AC-3` / `...` / `..` / `~` / `-` / `至`，由 checker 展开；超过 99 的区间只取端点，避免异常输入
- 表格解析支持单元格内转义 `\|`，不再误切
- 「矩阵禁止区间写法」的流程改进作废，由机检替代
- `--fixtures` 支持 `flags: trace|gates|map`，新增 `trace-range` 与 `trace-verify-missing` 两个样本（当前 8/8）
- `AGENTS.md` 补 `npx skills` 缓存 EPERM 的绕过说明（`--cache /tmp/npm-cache`）
