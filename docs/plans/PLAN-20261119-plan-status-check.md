---
id: PLAN-20261119-plan-status-check
title: Plan §8/status 漂移校验与 Go 收尾清单补强
doc_type: plan
status: done
feature: FEAT-002
tier: quick
covers: []
scope: [workflow, docs, quality-gates]
created: 2026-11-19
approved: 2026-11-19
---

# PLAN-20261119-plan-status-check

## 1. 需求

`flow-check` 新增一致性校验：Plan 已写非空 §8 但 `status` 仍是 `draft`/`active` → WARN（`--strict` 升级为 ERROR）；同时在 flow 的 Go 收尾清单补「Plan status → done」，让状态漂移可被机检发现且收尾不再漏改。

## 2. 改动

- 修改：`.agents/skills/flow/scripts/flow-check.mjs` — 新增 §8 段落检测与 `checkPlanStatusDrift`；`--strict` 透传；fixture runner 支持 `flags: strict`
- 新增：`scripts/fixtures/plan-status-stale`（draft+§8 → WARN、done+§8 负例）、`scripts/fixtures/plan-status-strict`（strict → ERROR）
- 修改：`scripts/fixtures/README.md` — `flags` 列表补 `strict`
- 修改：`reference/go.md` §6 自检清单 — 新增「Plan `status` → `done`」
- 修改：`reference/quick.md` §5 收尾 — 同步 status → done
- 修改：`AGENTS.md` — 命令清单补 `docs --strict`
- 修改：`docs/designs/arch/flow-contracts.md` — checker 子命令表 + Plan 漂移规则
- 修正存量：4 个 draft Plan（flow-quick-tier / run-protocol / verifiability / retro-signals）→ `done` + 索引同步
- 新增：本 Plan；`FEAT-002` 的 `## 关联` 追加 `修补：…`

## 3. 验证

- `node .agents/skills/flow/scripts/flow-check.mjs --fixtures` → 23/23
- `node .agents/skills/flow/scripts/flow-check.mjs docs --trace` → PASS，0 warning
- `node .agents/skills/flow/scripts/flow-check.mjs docs --strict` → exit 0
- `npx skills add . -l --cache /tmp/npm-cache` → 7 skills

## 4. 回填

- designs：`docs/designs/arch/flow-contracts.md`（checker 契约）
- features：`FEAT-002` 仅 `## 关联` 追加（quick 复用，不改正文）
- standards：无（无新通用约定）

## 5. 风险

- §8 判定 = 标题匹配（兼容无编号）+ 去 HTML 注释 / 标题 / 表格分隔行后仍有正文；空模板与仅注释不误报
- WARN 默认不阻断，`--strict` 才变 exit 1；确需保持 `active` 的 Plan 可在 §8 注明遗留
- 存量 4 个 Plan 的语义确已完成（§8 + Review + Compound 齐全），仅漏改 status；按用户确认同轮修正

## 8. 执行结果与偏差

- 完成：全部
- 变更总结：warn when a plan has non-empty §8 but status stays draft/active; add --strict（type: feat）
- 偏差：无（存量 Plan 状态修正为确认后的追加动作，已记入 §2）
- 遗留：无
- 基线：`docs --trace` PASS 但报 4 条存量 WARN；`--fixtures` 21/23（新样本尚未通过）
- 门禁：`--fixtures` 23/23；`docs --trace` PASS 0 warning；`docs --strict` exit 0；`npx skills add . -l --cache /tmp/npm-cache` 7 skills
- waiver：无
- 工程摩擦（候选 Compound）：fixtures 的 `expect` 无法断言带路径的错误消息——`runFixtures` 向 `checkDocs` 传绝对 `docsDir`，样本只能匹配消息前缀；期望 `expect` 支持路径占位或渲染相对路径
- 本轮改动文件：
  - `.agents/skills/flow/scripts/flow-check.mjs`
  - `.agents/skills/flow/scripts/fixtures/README.md`
  - `.agents/skills/flow/scripts/fixtures/plan-status-stale/**`
  - `.agents/skills/flow/scripts/fixtures/plan-status-strict/**`
  - `.agents/skills/flow/reference/go.md`
  - `.agents/skills/flow/reference/quick.md`
  - `AGENTS.md`
  - `docs/designs/arch/flow-contracts.md`
  - `docs/features/FEAT-002-flow-evolution.md`
  - `docs/features/README.md`
  - `docs/plans/PLAN-20261119-plan-status-check.md`
  - `docs/plans/PLAN-20261116-flow-quick-tier.md`
  - `docs/plans/PLAN-20261116-flow-run-protocol.md`
  - `docs/plans/PLAN-20261116-flow-verifiability.md`
  - `docs/plans/PLAN-20261117-retro-signals.md`
  - `docs/plans/README.md`
- Review 计数：7（排除 `docs/**`；两个 fixtures 样本各按 1 个资产单元计）

## Review 结果

- 策略：checklist（非 `docs/` 改动 7 个资产单元 > 3，强制）
- P1：无
- 视角与结论：
  - 正确性：§8 取**最后一个**标题（Go 追加在文末，前文可能引用模板）；去 HTML 注释 / 标题 / 表格分隔行后判非空，空模板负例（`PLAN-20260103-empty-demo`）不误报
  - 契约一致性：`--strict` 同时出现在脚本 header、`AGENTS.md`、`flow-contracts.md`、fixtures `README.md`；`flags: strict` 可复现
  - 流程：`go.md` §6 与 `quick.md` §5 都补「Plan status → done」；WARN 默认不阻断，`--strict` 才 exit 1
  - 回归：`--fixtures` 23/23；`docs --trace --map` PASS 0 warning；`docs --strict` exit 0；`npx skills add . -l` 7 skills
- P2：
  - §8 标题只匹配「执行结果」前缀；若写成 `## 结果` 会漏报（模板已统一，暂不扩）
  - fixtures 的 `expect` 无法断言带路径的消息（见 §8 工程摩擦）

## Compound

- 洞察：有（来自 §8 工程摩擦）
- 资格门：反事实=样本本可用相对路径断言；可恢复=改 fixture 渲染即可；负例=仅影响新样本 → 值得记
- 落点：
  - Plan「流程改进」（本节）：fixtures 增补样本时避免在 `expect` 写路径
  - 机检建议（仅对话，未写仓库）：`runFixtures` 传相对 `fdir`，或 `expect` 支持 `{docsDir}` 占位
- 系统文件：未改 standard / AGENTS（等待用户同意后再落）

## 后续（G2 后采纳 Compound 建议）

- 触发：用户「采纳 Compound 建议」——落点=对话内机检建议
- 改动：
  - `flow-check.mjs` `runFixtures`：`expect` 片段支持 `{docsDir}` 占位（替换为样本 docs 目录绝对路径），可断言含路径的完整消息
  - `plan-status-stale` / `plan-status-strict` 的 `expect` 改为断言完整消息（含路径），同时覆盖占位替换
  - `fixtures/README.md` 与 `flow-contracts.md` 的 `--fixtures` 契约同步
- 验证：`--fixtures` 23/23；`docs --strict --trace` PASS 0 warning
- 变更总结（追加）：support {docsDir} placeholder in fixture expects（type: test）
- 说明：未新增 standard / 未改 AGENTS（无新通用约定）
