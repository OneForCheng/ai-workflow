---
id: PLAN-20261117-retro-signals
title: 跨轮 retro 与信号闭环实现方案
doc_type: plan
status: done
feature: FEAT-004
approved: 2026-11-17
scope: [workflow, retro, signals, state]
created: 2026-11-17
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8]
---

# PLAN-20261117-retro-signals 跨轮 retro 与信号闭环实现方案

## 1. 需求理解

来源：FEAT-004 / 真跑反馈。

两件事一起做：

1. **修 dry-run 的状态污染**：真跑发现 dry-run 若写 `status=done + next=review`，下次 `/flow` 会误判进入 Review，执行者只能靠「不创建 `.flow/`」绕过，导致账本与信号丢失。
2. **补跨轮 retro**：`/retro` 从 `.flow` 与 `docs/` 聚合信号，结算上一轮实验，产出 ≤3 条可验证实验与上游建议。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| dry-run 状态 | 写 status/next，污染运行状态（真跑已踩） | 只写 `lastDryRun` + 账本 | 修复 |
| 跨轮记忆 | Compound 只处理本轮 | `/retro` 聚合跨轮信号 | 新增 |
| 信号聚合 | 需要人读 Plan | `flow-check --signals` 输出摘要 | 新增 |
| 触发 | 无 | 轮次 / 阈值 / 手动 | 新增 |
| 实验 | 无 | 记录 + 下轮结算 | 新增 |
| 上游改进 | Compound 只给对话建议 | 可复制 upstream 块 | 增补 |

## 3. 方案

### 思路

- **先修信号源，再做分析**：dry-run 污染不修，retro 读到的是错的状态
- **docs 是兜底信号源**：真实项目多数只跑 standard / quick，没有 `.flow`；retro 必须能只用 Plan 的 §8 / Review / Compound 工作
- **retro 只读聚合，不读历史原文**：`--signals` 把 N 个 Plan 压成 ≤40 行，避免越 retro 越贵
- **实验必须可结算**：每条实验带指标、窗口、回滚；否则就是年终总结

### 改动清单

- 修改：`.agents/skills/flow/reference/run.md` — dry-run 不写运行状态；`lastDryRun` 语义
- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — `--signals` / `--brief`；`--state` 校验 `lastDryRun`；others ID 放宽
- 新增：`.agents/skills/retro/SKILL.md` + `route.md` — 独立 retro skill
- 新增：`.agents/skills/flow/reference/retro.md` — retro 协议（信号 / 结算 / 实验 / upstream）
- 修改：`.agents/skills/flow/reference/init.md` — AGENTS 模板补 retro 节奏与 `others/retro`
- 修改：`.agents/skills/flow/SKILL.md` — G2 收尾提示 due（可选）
- 修改：`.agents/skills/flow/scripts/fixtures/` — 更新 `state-dry`，新增 `signals-ok` / `signals-empty`
- 修改：`AGENTS.md`、`README.md` — 新 skill 与命令
- 新增：`docs/designs/arch/retro-signals.md`（Go 回填）；更新 `run-protocol.md`
- 修改：`docs/features/FEAT-004-retro-signals.md`（Go 勾选）

### 关键设计决策

- **D1：dry-run 不写运行状态** — 只写 `runs/RUN-DRY-*.md`、signals 与 `state.lastDryRun`；不改 `status` / `next` / `currentRun`。理由：dry-run 不属于 run 生命周期，`/flow` 不应因它分支。被否方案：给 `next` 加 `g1` 值（状态机更复杂）。
- **D2：双信号源** — 有 `.flow` 用账本与事件流；无 `.flow` 从 `docs/plans` 的 §7/§8/Review/Compound 与 `features` 聚合，报告首行标注「降级」。
- **D3：`--signals` 只读聚合** — 输出 ≤40 行；不读历史 Plan 正文，只读结构化字段与表格行。
- **D4：触发不依赖调度器** — `--brief` 输出 `due: yes|no`；`/retro` 自己判断，`/flow` G2 可选提示，人工或 CI 调用均可。
- **D5：实验落 `docs/others/retro/`** — append + 索引；下次 retro 从该目录读取未结实验。`.flow/retro/` 可选，不作为唯一来源。
- **D6：upstream 只出块** — 沿用 Compound 规则：不直接改 `.agents/skills/**`，不自动安装。
- **D7：retro 对事不对人** — 只改进流程与工件，不做个人/团队评价；避免变成绩效工具。
- **D8：无数据不硬编** — 信号不足时输出「数据不足」并停止，禁止为凑流程编实验。

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T2 | `npx skills add . -l` 出现 retro；正文 ≤120 行 | 待 |
| AC-2 | T3 | 有/无 `.flow` 两种仓各跑一次，输出含/不含「降级」 | 待 |
| AC-3 | T3 | `--signals` 输出 ≤40 行且字段齐全 | 待 |
| AC-4 | T3、T4 | `--brief` 输出 due 与理由；G2 提示 | 待 |
| AC-5 | T1、T5 | 生成 RETRO 记录并登记；下次读回未结实验 | 待 |
| AC-6 | T1、T2 | 建议块可复制，skill 文件未被改 | 待 |
| AC-7 | T0 | dry-run 后 state 的 status/next/currentRun 不变 | 待 |
| AC-8 | T0、T3 | `--state` 对 lastDryRun 账本缺失/坏 plan 报错 | 待 |

### 4.2 Task 卡片

- **T0** 动作：修 dry-run 状态污染
  - 落点：`run.md` §11、`flow-check.mjs` `checkState`、`fixtures/state-dry`
  - DoD：dry-run 只写 `lastDryRun` + 账本；`--state` 校验 `lastDryRun`（存在、plan 引用、任务表、`mode: dry`）；`status/next/currentRun` 不变
  - 验证：更新后的 `state-dry` 退出 0；删账本后退出 1；模拟 `/flow` 判定不进入 Review
  - 依赖：无｜预算：小｜风险：低

- **T1** 动作：retro 协议
  - 落点：`reference/retro.md`
  - DoD：五步（定位 / 聚合 / 结算 / 产出 / 交回）、实验字段、upstream 块、降级规则、禁改 skill
  - 验证：用本仓库历史走查一遍
  - 依赖：T0｜预算：中｜风险：低

- **T2** 动作：独立 skill
  - 落点：`.agents/skills/retro/SKILL.md` + `route.md`
  - DoD：front-matter 合规；≤120 行；`/auto` 可发现；路由卡片与 flow 分界清楚
  - 验证：`npx skills add . -l` 7 skills
  - 依赖：T1｜预算：小｜风险：低

- **T3** 动作：信号聚合与触发
  - 落点：`flow-check.mjs` `--signals` / `--brief`
  - DoD：tier / Review / 摩擦 / waiver / park / decision / 未结实验计数；`due` 规则；输出 ≤40 行；无 `.flow` 降级
  - 验证：`signals-ok`、`signals-empty` 样本
  - 依赖：T1｜预算：中｜风险：中

- **T4** 动作：触发接线
  - 落点：`SKILL.md` G2 收尾、`init.md` 宪法模板、`AGENTS.md`
  - DoD：G2 可选跑 `--brief`，due 时提示 `/retro`；模板写明节奏与记录目录
  - 验证：走查 G2 分支
  - 依赖：T3｜预算：小｜风险：低

- **T5** 动作：记录与实验模板
  - 落点：`retro.md` 内模板 + `docs/others/retro/` 约定
  - DoD：RETRO front-matter、实验表、upstream 块、索引行格式齐全
  - 验证：生成一份示例并 `flow-check` 通过
  - 依赖：T1｜预算：小｜风险：低

- **T6** 动作：文档回填
  - 落点：`designs/arch/retro-signals.md`、`run-protocol.md`、FEAT-004、索引、README
  - DoD：状态语义与 retro 契约写清；索引同步
  - 验证：`docs --trace --map --state`
  - 依赖：T0–T5｜预算：小｜风险：低

- **T7** 动作：自测与本仓库首次 retro
  - 落点：无新增文件
  - DoD：`--fixtures` 全绿；对 FEAT-002/003 三个 Plan 跑一次 `--signals` + retro（产出实验）
  - 验证：`--fixtures` 15+；`--signals` 输出合理；RETRO 记录可结算
  - 依赖：T0–T6｜预算：中｜风险：中

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 消费方 | `/auto`（新 route）、`/flow` G2、`flow-check --state`、`--signals` |
| 2 | 配置与环境变量 | 无新增；`FLOW_ROOT` 沿用 |
| 3 | 数据迁移与兼容 | 旧 `state.json` 无 `lastDryRun` → 兼容；旧 dry 账本保留 |
| 4 | 接口契约与版本 | `state.json` 去掉 `mode`（仅在账本保留）；`schema: 1` 不变 |
| 5 | 权限 / 安全 | retro 只读聚合；不改 skill；不写密钥 |
| 6 | 错误 / 幂等 / 续跑 | 重复 retro 追加新文件，不覆盖旧记录 |
| 7 | 可观测性 | `--signals` 摘要可复现；实验有指标与窗口 |
| 8 | 测试与回填 | `signals-ok` / `signals-empty` / `state-dry`；design 与 Feature 回填 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 独立 skill | T2 | 待实现 |
| AC-2 双信号源 | T3 | 待实现 |
| AC-3 信号摘要 | T3 | 待实现 |
| AC-4 三种触发 | T3、T4 | 待实现 |
| AC-5 实验闭环 | T1、T5 | 待实现 |
| AC-6 upstream 只出块 | T1、T2 | 待实现 |
| AC-7 dry-run 不改状态 | T0 | 待实现 |
| AC-8 `--state` 校验 lastDryRun | T0、T3 | 待实现 |

## 6. 影响的事实文档（Go 回填清单）

- designs：更新 `docs/designs/arch/run-protocol.md`（dry-run 状态语义）；新增 `docs/designs/arch/retro-signals.md`
- standards：无
- features：`FEAT-004` 勾选 AC-1…AC-8，补验收结果；`FEAT-002` 不改（dry-run 行为修正属实现层）
- others：无（RETRO 记录由实际 retro 产生）

## 7. Review 策略

review: checklist
<!-- 新增 skill + checker + 多份文档，非 docs 改动 > 3，强制 checklist -->

## 8. 执行结果与偏差

- 完成：T0–T7
- 偏差：
  - retro 协议放在 `retro/reference.md` 而非 `flow/reference/retro.md`（skill 自包含，避免跨 skill 路径依赖）
  - `state.mode` 移除，改为 `state.lastDryRun`；账本保留 `mode: dry`
  - 信号指标改为「自上次 retro 的窗口」统计，否则 due 永远不会重置
  - parked 改为从账本任务表统计，signals 只用于 `decision_auto`
- 遗留：
  - git 提交级信号未做
  - 实验结算要等下一次 retro 才验证
  - psh 的 dry-run 尚未在修正后复跑
- 基线：改动前 `flow-check docs` PASS；`--fixtures` 14/14；`npx skills add . -l` 6 skills
- 门禁：`docs --trace --map --state` PASS（1 WARN：本仓库无 `.flow`）；`--fixtures` 16/16；`npx skills add . -l` 7 skills；`--signals` / `--brief` 正常；首次 retro 记录已生成
- waiver：无
- 工程摩擦（候选 Compound）：
  1. 信号解析依赖 Plan 文本格式（`review:` 行、`- 工程摩擦` 行），格式一变就漏计
  2. 首次 retro 需要放宽 others 的 ID 正则（2–4 → 2–8 字母）
  3. `state.mode` 属设计冗余，已移除
- 本轮改动文件：
  - `.agents/skills/flow/reference/run.md`
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/retro/SKILL.md`
  - `.agents/skills/retro/route.md`
  - `.agents/skills/retro/reference.md`
  - `.agents/skills/flow/reference/init.md`
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/scripts/fixtures/{signals-ok,signals-empty}/**`
  - `.agents/skills/flow/scripts/fixtures/state-dry/.flow/state.json`
  - `AGENTS.md`
  - `README.md`
  - `docs/designs/arch/run-protocol.md`
  - `docs/designs/arch/retro-signals.md`
  - `docs/features/FEAT-004-retro-signals.md`
  - `docs/plans/PLAN-20261117-retro-signals.md`
  - `docs/others/retro/RETRO-20261117.md`
- Review 计数：10（排除 `docs/**`；9 个文件 + fixtures 3 个样本按 1 个资产单元计）

## Review 结果

- 策略：checklist
- P1：无
- P2：
  - 信号聚合依赖 Plan 文本格式，格式漂移会漏计
  - 实验结算逻辑要等下一次 retro 才能验证
  - psh 的 dry-run 修正后尚未复跑

## Compound

- 洞察：有（文本格式耦合 + 实验验证滞后）
- 落点：
  - 机检建议：已建议（待用户同意）— `--signals --json` 供 CI 消费；对 Plan 格式变体加样本
  - standards：无
  - adr：无
  - AGENTS：无新增
  - skill 草稿：无
  - 流程改进：在 myschneider 复跑一次 dry-run，确认 `lastDryRun` 账本生成且 `/flow` 不误入 Review；下次 retro 结算 EXP-1 / EXP-2

## 计数与 G2 修正（追加）

- RETRO front-matter 增 `plans_total`：轮次 = 当前 Plan 总数 − 快照；缺失时按日期兜底（兼容旧记录）
- 修复同日新 Plan 不计轮次：实测「RETRO 当天再建 1 个 Plan」由 0 修正为 1
- `flow-check --signals` 输出改用快照差；窗口内统计仍按日期（近似）
- G2 从「可跑」改为「必跑 `--brief`」：`due: yes` 只提示「可运行 /retro」，不自动加载、不阻塞收尾
- 新增 `signals-snapshot` 样本（17/17）

## 实验结算口径修正（追加）

- 上一轮对话声称「未结实验只读最新 RETRO + 新增 signals-settled」，实际未落地；本轮补齐并验证
- `flow-check --signals`：`open` 只统计最新一份 RETRO 的实验表，旧记录的 `open` 不再计数
- 新增 `signals-settled` 样本：旧 RETRO 有 1 条 `open`，新 RETRO 结算为「兑现」→ `未结实验：0`
- `--fixtures` 18/18

## upstream 采纳（追加，来自 ss 项目 retro）

- **#1 采纳**：`--signals` 增加「摩擦明细（前 5）」——Plan id + 字段后首行摘要（≤60 字符）；不影响 `due` 与 `--brief`；`signals-ok` 覆盖该输出
- **#2 采纳（仅文案）**：quick 确认屏新增 `- 歧义：无 ｜ <词> 按 <解释> 理解`；`clarify` 字段暂不加，先观察 3 轮再定
- **#3 不采纳**：Review 输出格式不影响 Plan 行数，指标错配；4 行表格收益小，且压缩会削弱「风险须附文件/符号」的证据纪律
