---
id: PLAN-20261127-flow-output-gate
title: retro 输出完整性与 G2 门禁增强实现方案
doc_type: plan
status: done
feature: FEAT-007
tier: standard
covers: [AC-1, AC-2, AC-3]
scope: [workflow, retro, signals, quality-gates]
created: 2026-11-27
---

# PLAN-20261127-flow-output-gate

## 1. 需求理解

来源 retro upstream 建议（2026-11-27），用户确认：A/B 全采纳，C 采用「落点必填 + 无落点计数、不做硬门禁」。目标是减少 retro 回读 Plan §8、把 `--strict` 纳入 G2、让摩擦落点可判定。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| detail 正文 | `detailAll.push(entry.slice(0,80))`，`--detail` 也截断 | 默认 80，`--detail` 完整 | 修改 |
| G2 校验 | `--strict` 可校验，但未进 G2 必跑 | G2 前必跑，失败可 waiver | 修改流程文档 |
| 摩擦落点 | 可选，无统计 | 必填示例（含 `流程改进`），窗口内无落点计数 | 修改模板 + 脚本 |

## 3. 方案

### 思路

- A：明细收集改为 `{ planId, entry }` 对象；默认渲染 `entry.slice(0,80)`，`--detail` 渲染完整 `entry`；默认 5 条上限不变
- B：`summary.md` 新增「G2 前校验（必跑）」；`SKILL.md` G2 条件补充；失败处理复用 Plan §8 `waiver`
- C：`go.md` 模板把 `落点` 改为必填示例；`flow-check --signals` 统计窗口内无 `落点` 的摩擦条数并输出

### 改动清单

- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — 明细对象化 / detail 全文 / 无落点计数
- 修改：`.agents/skills/flow/reference/summary.md` — G2 前 `docs --strict` 与 waiver 路径
- 修改：`.agents/skills/flow/SKILL.md` — G2 条件
- 修改：`.agents/skills/flow/reference/go.md` — 落点必填示例与说明
- 修改：`.agents/skills/flow/scripts/fixtures/signals-detail/**` — 长条目断言尾部出现
- 新增：`.agents/skills/flow/scripts/fixtures/signals-no-landing/**` — 有 / 无落点计数
- 修改：`docs/designs/arch/flow-contracts.md`、`retro-signals.md`（本地 docs）
- 新增：本 Plan；新增 `FEAT-007` 及索引

### 关键设计决策

- D1：明细在 `signalsOf` 中保存 `{ planId, entry }`，默认/详细两种渲染各自截断，避免再次出现「先截 80 再拼前缀」的二次截断
- D2：无落点计数按窗口内每个 Plan 的每条摩擦判断 `落点[：:]`，不改变 `friction` 总数、主题与 `friction_repeat`
- D3：G2 strict 失败复用 §8 `waiver`：`flow-check --strict | 原因=历史遗留 | 复检时点=…`，不新增字段
- D4：`落点` 允许 `流程改进` 表示无代码落点；模板必填，但 checker 不将其升级为 error
- D5：`--detail` 完整输出只影响展示，不改变 `--brief` 与默认 `--signals` 的条数/截断

## 4. Tasking

### 4.1 覆盖矩阵

| AC | Task | 验证 | 状态 |
|----|------|------|------|
| AC-1 | T1 | `flow-check --fixtures`；长条目 `--signals --detail` 尾部出现 | 待 |
| AC-2 | T2 | `flow-check docs --strict`；文档用例核对 | 待 |
| AC-3 | T3 | `flow-check --fixtures`；`--signals` 无落点计数 | 待 |

### 4.2 Task 卡片

- T1 | 动作：明细对象化，默认 80 / detail 全文 | 落点：`flow-check.mjs` `signalsOf`/`renderSignals` | DoD：默认与 detail 输出差异正确 | 验证：fixtures + 手跑 | 依赖：无 | 预算：小 | 风险：渲染签名变化 | AC：AC-1
- T2 | 动作：G2 前必跑 `--strict`，失败修复或 waiver | 落点：`summary.md`、`SKILL.md` | DoD：两处口径一致 | 验证：文档核对 + `--strict` | 依赖：无 | 预算：小 | 风险：历史遗留报错 | AC：AC-2
- T3 | 动作：落点必填示例 + 无落点计数 | 落点：`go.md`、`flow-check.mjs` `signalsOf` | DoD：计数只统计窗口内、不阻断 | 验证：fixtures + `--signals` | 依赖：T1（同函数） | 预算：小 | 风险：旧 Plan 无落点 | AC：AC-3
- T4 | 动作：回填 designs / Feature / 索引，跑 `--trace`/`--map`/`--fixtures` | 落点：`docs/**` | DoD：全部校验通过 | 验证：见 §5 | 依赖：T1–T3 | 预算：小 | 风险：无 | AC：AC-1/2/3

### 4.3 遗漏清单

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 调用方 / 配置：是否有其他代码消费 `frictionDetails` 字符串数组 | 仅 `renderSignals`，改为对象后同步 |
| 2 | 迁移 / 契约：是否影响 `--brief` | 不影响 |
| 3 | 权限 / 错误路径：`--detail` 单独使用 | 隐含 `--signals`，保持既有行为 |
| 4 | 可观测性：无落点计数是否只在窗口内 | 是，复用 `windowPlans` |
| 5 | 测试与回填：fixtures / designs / Feature / 索引 | T1–T4 覆盖 |
| 6 | 兼容：默认 5 条 / 80 字是否保持 | 保持 |
| 7 | 文档：`--detail` 是否写成「全部」且不截断 | 同步 contracts / retro-signals |
| 8 | 门禁：是否误加 `--strict` 硬错误 | 不加；仅统计 |

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 detail 全文 | T1 | 待验证 |
| AC-2 G2 strict | T2 | 待验证 |
| AC-3 落点必填 + 无落点计数 | T3 | 待验证 |

## 6. 影响的事实文档（Go 回填清单）

- designs：`arch/flow-contracts.md`、`arch/retro-signals.md`
- standards：无
- features：新增 `FEAT-007`；旧 Feature 无
- others：无

## 7. Review 策略

review: checklist
<!-- 非 docs 改动 > 3（脚本 + 4 个 skill 文档 + fixtures），强制 checklist -->

## 8. 执行结果与偏差

- 完成：T1–T4
- 变更总结：output full friction details and gate G2 on strict checks; require landing（type: feat）
- 偏差：无（落点允许 `流程改进`，未加硬门禁）
- 遗留：无
- 基线：改动前 `--fixtures` 33/33、`docs --strict` 0 warning
- 门禁：`--fixtures` 34/34；`docs --strict --trace` PASS 0 warning；`--map` 覆盖 1/1；`npx skills add . -l` 7 skills
- waiver：无
- 工程摩擦（候选 Compound）：无
- 本轮改动文件：
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/reference/go.md`
  - `.agents/skills/flow/reference/summary.md`
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/scripts/fixtures/signals-detail/expect`
  - `.agents/skills/flow/scripts/fixtures/signals-no-landing/**`
  - `docs/designs/arch/flow-contracts.md`
  - `docs/designs/arch/retro-signals.md`
  - `docs/features/FEAT-007-flow-output-gate.md`
  - `docs/features/README.md`
  - `docs/plans/PLAN-20261127-flow-output-gate.md`
  - `docs/plans/README.md`
- Review 计数：6（排除 `docs/**`；fixtures 样本按 1 个资产单元计）

