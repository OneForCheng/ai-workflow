---
id: PLAN-20261116-flow-run-protocol
title: 无人值守执行协议（P1）实现方案
doc_type: plan
status: done
feature: FEAT-002
approved: 2026-11-16
scope: [workflow, run, state, gates]
created: 2026-11-16
covers: [AC-8, AC-9]
---

# PLAN-20261116-flow-run-protocol 无人值守执行协议（P1）实现方案

## 1. 需求理解

来源：FEAT-002 的 AC-8 / AC-9（上一轮 G1 确认）+ 前序讨论。

把「G1 后人工推进」扩为「G1 后无人值守执行」：一次 run 在授权信封内跑完当前 Plan 的全部任务，遇歧义按决策策略处理并记录，失败任务 park 而不阻塞队列，断点可续跑，结束时产出晨报交回人审。**不限于夜间**——后台、排队、定时都是同一协议的不同触发姿势。

不在本轮：P2 的 `/retro`；跨 Plan 排队；自动 Review / Compound；调度器实现（协议优先，运行时交给宿主）。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| 执行模式 | G0/G1 后由人逐步推进 | 授权信封内无人值守跑完 Plan | 新增 |
| 决策 | 遇歧义停下来问 | 决策策略 + 等待窗口 + 记录可推翻 | 新增 |
| 失败处理 | 失败即停或人工判断 | park 分类、不阻塞、依赖传播 | 新增 |
| 续跑 | 依赖对话上下文 | `state.json` + 账本 + 幂等任务 | 新增 |
| 运行状态 | 无 | `.flow/` 三层定位与分层跟踪 | 新增 |
| 多轮 Feature | 每个 Plan 必须列全 Feature AC | Plan `covers` 只声明本轮负责的 AC | 增补 |
| 状态校验 | 无 | `flow-check --state` 校验 `.flow/` | 新增 |

## 3. 方案

### 思路

1. **run 是流程子模式**，不是新 skill：强依赖 Plan / G1 / 门禁 / 账本，另起 skill 会把闭环复制第四份
2. **协议优先**：本轮只交付 Markdown 协议 + `--state` 校验；调度器、后台 job 由宿主适配
3. **诚实降级**：宿主不支持续跑时，等待窗口退化为 0（立即按默认决策并标 `auto`），不假装能等
4. **状态离开对话**：任务完成与否只认账本与 commit，不认叙述
5. **判断留给人**：run 不做 Review / Compound，只把证据和待决项放进晨报

### 改动清单

- 新增：`.agents/skills/flow/reference/run.md` — run 协议（定位 / pre-flight / 信封 / 窗口 / 任务循环 / park / 账本 / 晨报 / 红线）
- 修改：`.agents/skills/flow/SKILL.md` — 使用边界与状态判定接入 `run`；正文不膨胀
- 修改：`.agents/skills/flow/reference/plan.md` — 新增 `approved` / `covers`；G1 通过后写 `approved`；P2.7 摘要含授权建议
- 修改：`.agents/skills/flow/reference/init.md` — `.flow/` 从「预留」改为「首次 run 创建」，补 `.gitignore` 模板
- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — 新增 `--state`；`--trace` 支持 `covers`
- 修改：`.agents/skills/flow/scripts/fixtures/` — 新增 3 个样本（state-ok / state-invalid / trace-covers）
- 修改：`AGENTS.md`、`README.md` — 目录树与命令补 `run.md` / `--state`
- 新增：`docs/designs/arch/run-protocol.md`（Go 回填）+ 索引
- 修改：`docs/features/FEAT-002-flow-evolution.md`（Go 勾选 AC-8 / AC-9，补验收结果）

### 关键设计决策

- **D1：run 作为 `/flow run` 子模式** — 理由：与 Plan/G1/门禁/账本强耦合，独立 skill 会造成第四份闭环。被否方案：新增 `/run` skill。
- **D2：只定协议，不写 runner** — 理由：仓库约束只允许一个零依赖脚本；调度属宿主能力。被否方案：`flow-run.mjs` 调度器。
- **D3：队列 = 当前 Plan 的任务** — 理由：跨 Plan 排队需要队列语义与优先级，超出本轮；先验证单 Plan 的可靠性。被否方案：本轮做全局 backlog。
- **D4：等待窗口在无续跑宿主上退化为 0** — 理由：对话会话无法真正阻塞等待；伪装等待只会造成假自主。被否方案：睡眠轮询。
- **D5：park 不阻塞 + 依赖传播** — 理由：一个任务卡死不应拖垮整夜；依赖它的任务标 `blocked-by` 跳过。
- **D6：`.flow/` 默认与 `docs/` 同级（工作区根）** — 定位优先级：`--flow-root` > `FLOW_ROOT` > `docs/` 同级 > 向上查找 > git root > cwd。分层：结论层（`state.json`、`retro/`）可入 git；证据层（`runs/`、`signals.jsonl`）默认本地；`tracked: false` 时校验器给出 WARN。
- **D7：Plan 增 `covers`** — 理由：FEAT-002 是多轮 Feature，`--trace` 若要求每个 Plan 列全 11 条 AC 会产生噪音行。缺省仍按「覆盖全部 AC」保持兼容。
- **D8：run 不做 Review / Compound，退出时交回 `/flow`** — 理由：二者是判断类动作，无人值守自审容易自我确认；Compound 还涉及改 skill/AGENTS，必须用户同意。run 结束时 `state.next: review`，`/flow` 无参数读到后直接进入 Review。
- **D9：依赖安装按声明放行** — 理由：方案里已确认的 npm / maven 等依赖属实现必要动作。规则：Plan §3 已声明的依赖可安装（A3）；未声明的依赖、迁移、密钥、发布仍属 A4，一律 park。

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-8 | T1、T3、T5、T7 | 临时 `.flow/` dry-run + `--state` 通过；协议走查 | 待 |
| AC-9 | T2、T5、T6 | 定位优先级逐条走查；`--state` 对 `tracked:false` 告警 | 待 |

### 4.2 Task 卡片

- **T1** 动作：编写 run 协议
  - 落点：`reference/run.md`
  - DoD：状态机、信封 A0–A4、W、任务循环、park 分类、账本 schema、晨报模板、退出交回（`state.next: review`）、依赖声明规则、红线齐全
  - 验证：逐节走查一次，能与 go.md 的门禁段互相引用而不重复
  - 依赖：无｜预算：中｜风险：低

- **T2** 动作：`.flow/` 定位与分层
  - 落点：`run.md` §定位；`init.md` 运行状态段；`AGENTS.md`
  - DoD：`--flow-root` > `FLOW_ROOT` > 向上查找 > git root > cwd；repo / workspace 两种模式；`tracked` 判定；`.flow/.gitignore` 模板
  - 验证：在「仓库根」「子目录」「多仓父目录」三种 cwd 下按规则推导
  - 依赖：T1｜预算：小｜风险：低

- **T3** 动作：SKILL.md 接入
  - 落点：`flow/SKILL.md`
  - DoD：使用边界与状态判定含 `run`；`status=running` 先问续跑/放弃；`status=done` 且 `next=review` 时直接进入 Review；正文行数不超 165
  - 验证：走查 `/flow` 无参数时的状态分支
  - 依赖：T1｜预算：小｜风险：低

- **T4** 动作：Plan 增 `approved` / `covers`
  - 落点：`reference/plan.md`（front-matter、骨架、P2.7）
  - DoD：G1 后写 `approved: <date>`；`covers` 声明本轮 AC；骨架同步
  - 验证：用本 Plan 自检 front-matter 与 `--trace` 一致
  - 依赖：无｜预算：小｜风险：低

- **T5** 动作：`--state` 校验
  - 落点：`flow-check.mjs`
  - DoD：校验 `state.json` 必填字段与枚举（含 `next`）、running 时账本存在、账本含任务表、`signals.jsonl` 每行合法 JSON、`tracked:false` 告警
  - 验证：`node flow-check.mjs docs --state`；坏样本报错
  - 依赖：T1｜预算：中｜风险：中

- **T6** 动作：`--trace` 支持 `covers`
  - 落点：`flow-check.mjs`
  - DoD：有 `covers` 时只要求覆盖该集合；无则退回「覆盖全部 AC」；引用未知 AC 仍报错
  - 验证：`trace-covers` 样本 exit 0；本 Plan 通过
  - 依赖：T4｜预算：小｜风险：低

- **T7** 动作：文档回填与全量自测
  - 落点：`docs/designs/arch/run-protocol.md`、FEAT-002、索引、`README.md`
  - DoD：design 写当前事实；AC-8/9 勾选；索引同步；`--fixtures` 全绿
  - 验证：`docs --trace --map --state`；`--fixtures`；`npx skills add . -l`
  - 依赖：T1–T6｜预算：小｜风险：低

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 消费方 | `/flow` 状态判定、`/auto` 路由（flow 已含 run，无需改 route）；`flow-check --state` |
| 2 | 配置与环境变量 | `--flow-root`、`FLOW_ROOT`；其余无 |
| 3 | 数据迁移与兼容 | 旧 Plan 无 `approved`/`covers`：run 拒跑并提示；`--trace` 退回全 AC 校验 |
| 4 | 接口契约与版本 | `state.json` 带 `schema: 1`；账本字段新增属破坏性变更，需升 schema |
| 5 | 权限 / 安全 | 红线：不 push/merge、不改未声明依赖与迁移/密钥；已声明依赖可装；A4 一律 park |
| 6 | 错误 / 幂等 / 续跑 | 任务级幂等：done 需 commit + 门禁通过；重跑跳过 done |
| 7 | 可观测性 | `signals.jsonl` 事件流 + 晨报；`--state` 可校验 |
| 8 | 测试与回填 | 3 个新 fixture；design 回填；FEAT-002 验收结果 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-8 异步 run：信封 / 窗口 / 账本续跑 / park / 晨报 | T1、T3、T5、T7 | 待实现 |
| AC-9 `.flow/` 定位与分层 | T2、T5、T6 | 待实现 |

## 6. 影响的事实文档（Go 回填清单）

- designs：新增 `docs/designs/arch/run-protocol.md`（状态机、信封、账本、定位、分层、红线）
- standards：无
- features：`FEAT-002` 勾选 AC-8 / AC-9，补「验收结果」；不新建 Feature
- others：无

## 7. Review 策略

review: checklist
<!-- 预计非 docs 改动 > 3 个文件，强制 checklist -->

## 8. 执行结果与偏差

- 完成：T1–T7
- 偏差：
  - G1 前按用户反馈补两条约束：`.flow/` 默认与 `docs/` 同级（D6、AC-9 文案同步）；**已声明依赖可安装**，以 Plan §3 改动清单为准（新增 D9）
  - `state.json` 增加 `next` 字段（`none|review|compound|plan`），用于 run 结束交回 `/flow` 进入 Review
  - `--state` 不新增参数，固定校验 `docs/` 父目录下的 `.flow/`，与「同级」约定一致
  - `--trace` 的 `covers` 缺省行为保持「覆盖全部 AC」，旧 Plan 不受影响
- 遗留：
  - P2 retro（AC-10、AC-11）未实现
  - run 协议尚无真实宿主/项目的端到端验证，目前只有状态校验与 dry-run
  - 跨 Plan 排队未做
- 基线：改动前 `flow-check docs` PASS；`--fixtures` 8/8；`npx skills add . -l` 6 skills
- 门禁：`docs --trace --map` PASS（8 篇文档，覆盖 1/1）；`--state` PASS（1 WARN：本仓库无 `.flow/`）；`--fixtures` 11/11；`npx skills add . -l` 6 skills
- waiver：无
- 工程摩擦（候选 Compound）：
  1. 协议类能力无法端到端验证：仓库无 runner、无业务项目，只能靠 mock `.flow/` 与走查；建议下一轮在真实目标项目做一次 A0 dry-run
  2. 本仓库自身不使用 run，`--state` 必然输出「未初始化 .flow/」WARN，作为通用命令示例略噪音
  3. `--state` 只校验 `currentRun` 指向的最新账本，历史 run 不回溯
- 本轮改动文件：
  - `.agents/skills/flow/reference/run.md`
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/reference/plan.md`
  - `.agents/skills/flow/reference/init.md`
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/fixtures/{state-ok,state-invalid,trace-covers}/**`
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/arch/run-protocol.md`
  - `docs/designs/README.md`
  - `docs/features/FEAT-002-flow-evolution.md`
  - `docs/plans/PLAN-20261116-flow-run-protocol.md`
- Review 计数：8（排除 `docs/**`；7 个文件 + fixtures 3 个样本按 1 个资产单元计）

## Review 结果

- 策略：checklist
- P1：无
- P2：
  - 协议无执行器，等待窗口在真实宿主上的行为只能依赖宿主实现
  - `--state` 只查最新账本；历史 run 与 park 必填字段未机检

## Compound

- 洞察：有（协议验证缺口 + 状态校验范围 + 历史事实文档不入库）
- 落点：
  - 机检建议：已建议（待用户同意）— 账本中 `parked` 行必须含原因列；`--state` 支持校验全部账本
  - standards：无
  - adr：无
  - AGENTS：无新增
  - skill 草稿：无
  - 流程改进：① 在真实目标项目做一次 A0 dry-run，再谈 P2；② `docs/` 是否随仓库入库单独决策（当前 `.gitignore` 忽略）

## dry-run 协议追加（用户确认后）

- `reference/run.md` 新增 §11：`--dry-run` 只读排演，`mode: dry`，允许 Plan 无 `approved`
- 语义：零写入、不建分支、不 commit；逐任务输出落点/依赖/歧义/预估，状态 `analyzed` 或 `dry-parked`
- 时机：推荐 G1 前（Plan 仍 draft），发现缺口直接回 P2；`plan.md` P2.7 已加提示
- `flow-check --state` 接受 `state.mode` 与账本 `mode` 的 `run|dry`
- 新增 `state-dry` 样本（当前 12/12）
- 设计文档 `DES-arch-run-protocol` 同步 `mode` 字段
