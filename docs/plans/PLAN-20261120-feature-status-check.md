---
id: PLAN-20261120-feature-status-check
title: Feature 状态漂移校验与存量收尾
doc_type: plan
status: done
feature: FEAT-002
tier: quick
covers: []
scope: [workflow, docs, quality-gates]
created: 2026-11-20
approved: 2026-11-20
---

# PLAN-20261120-feature-status-check

## 1. 需求

Feature 存在与 Plan 同类的状态漂移：全部 AC 已勾但 `status: active`、`status: done` 但缺 `frozen`。新增 checker 校验并修正 FEAT-001 / FEAT-002 / FEAT-003 / FEAT-004。

## 2. 改动

- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — 新增 `checkFeatureStatusDrift`；`--strict` 升级为 error
- 新增：`scripts/fixtures/feature-status-stale`、`feature-status-strict`、`feature-done-no-frozen`
- 修改：`AGENTS.md`、`docs/designs/arch/flow-contracts.md` — `--strict` / Feature 漂移契约
- 修正存量：FEAT-003 / FEAT-004 → `done` + frozen；FEAT-002 AC-10/11 标注由 FEAT-004 交付 → `done` + frozen；FEAT-001 补 frozen
- 新增：本 Plan；`FEAT-002` 的 `## 关联` 追加 `修补：…`

## 3. 验证

- `node .agents/skills/flow/scripts/flow-check.mjs docs --strict` → PASS
- `node .agents/skills/flow/scripts/flow-check.mjs --fixtures` → 29/29
- `node .agents/skills/flow/scripts/flow-check.mjs docs --trace` → PASS

## 4. 回填

- designs：`arch/flow-contracts.md`（Feature 漂移规则）
- features：FEAT-001~004 status / frozen / 关联
- standards：无

## 5. 风险

- 仅告警「全部 AC 已勾但 status 非 done」「done 缺 frozen」「done 有未勾 AC」；`active` 且仍有未勾 AC 的 Feature 不告警（如长期多轮 Feature）

## 8. 执行结果与偏差

- 完成：全部
- 变更总结：warn when a feature has all ACs checked but status stays active, or done lacks frozen（type: fix）
- 偏差：无
- 遗留：无
- 基线：`docs --strict` 对 FEAT-001 / FEAT-003 / FEAT-004 报 3 条 WARN；FEAT-002 无 WARN 但 AC 文案已过期
- 门禁：`docs --strict` PASS 0 warning；`--fixtures` 29/29；`--trace` PASS
- waiver：无
- 工程摩擦（候选 Compound）：Feature 状态与 Plan 状态是两套漂移，之前只补了 Plan 侧；后续新增门禁时优先同时覆盖两个对象
- 本轮改动文件：
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/fixtures/feature-status-stale/**`
  - `.agents/skills/flow/scripts/fixtures/feature-status-strict/**`
  - `.agents/skills/flow/scripts/fixtures/feature-done-no-frozen/**`
  - `AGENTS.md`
  - `docs/designs/arch/flow-contracts.md`（gitignored）
  - `docs/features/FEAT-001-auto-skill.md`
  - `docs/features/FEAT-002-flow-evolution.md`
  - `docs/features/FEAT-003-quick-tier.md`
  - `docs/features/FEAT-004-retro-signals.md`
  - `docs/features/README.md`
  - `docs/plans/PLAN-20261120-feature-status-check.md`
  - `docs/plans/README.md`
- Review 计数：6（排除 `docs/**`；3 个 fixture 样本各按 1 个资产单元计）

## Review 结果

- 策略：checklist（非 docs 改动 6 个资产单元 > 3，强制）
- P1：无
- P2：Feature 漂移只覆盖 `验收标准` 内的 AC 勾选；表格形式的 AC 不在本轮范围

## Compound

- 洞察：有（工程）：Plan / Feature 状态漂移需在同一门禁中成对覆盖
- 落点：已在本轮 checker 落地；无需新增 standard / ADR
- 流程改进：新增状态类门禁时同时检查 Plan 与 Feature
