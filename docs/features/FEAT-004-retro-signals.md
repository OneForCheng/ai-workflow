---
id: FEAT-004
title: 跨轮 retro 与信号闭环（含 dry-run 状态修正）
doc_type: feature
status: active
scope: [workflow, retro, signals, state]
owner: BA
source: 对话 + 真跑反馈（myschneider quick / psh dry-run）
updated: 2026-11-17
---

# FEAT-004 跨轮 retro 与信号闭环（含 dry-run 状态修正）

## 目标

让工作流能跨轮自我改进：`/retro` 从 `.flow/` 与 `docs/` 聚合信号，结算上一轮实验，产出 ≤3 条可验证实验与上游建议；同时修正 dry-run 污染运行状态的问题，使信号源可信。

## 范围

- In Scope：
  - **dry-run 状态修正**：只写 `lastDryRun` 与账本，不改 `status` / `next` / `currentRun`，避免 `/flow` 误判进入 Review
  - `/retro` 独立 skill（`SKILL.md` + `route.md`），可被 `/auto` 发现
  - 双信号源：`.flow/runs|signals` 优先；无 `.flow` 时从 `docs/plans` / `features` / `others/retro` 聚合并标注降级
  - `flow-check --signals [--brief]`：轮次、tier 分布、Review P1/P2、工程摩擦、waiver、park、`decision_auto`、未结实验
  - 触发：上次 RETRO 之后的 Plan 数 ≥5、信号阈值、手动；不依赖调度器
  - 实验：≤3 条，含假设 / 指标 / 窗口 / 回滚；写 `docs/others/retro/RETRO-*.md` 并索引，下次 retro 结算
  - 上游建议块：仅对话与记录，不直接改 skill、不自动安装
- Out of Scope：
  - 定时调度器、跨项目聚合
  - git 提交级信号（作为后续可选增强）
  - 自动应用上游建议（必须人工确认）

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| `.flow/` 存在 | 读 state / 最新账本 / signals | 精确事件计数 |
| 无 `.flow/` | 从 plans §8、Review、Compound、features 聚合 | 近似计数 + 「降级」标注 |
| 距上次 RETRO 的 Plan 数 ≥5 | 触发 due | `/retro` 提示 |
| P1 ≥3 / 摩擦 ≥3 / park ≥3 | 触发 due | 同上 |
| dry-run | 只写 `lastDryRun` + 账本 | 不改运行状态 |
| retro 产出 | ≤3 条实验 + ≤3 条上游建议 | 不直接改 skill |

## 验收标准

- [x] AC-1：`/retro` 为独立 skill（含 `route.md`，可被 `/auto` 发现），正文 ≤120 行，细节放 `reference/retro.md`
- [x] AC-2：双信号源成立——有 `.flow/` 用精确事件，无 `.flow/` 从 `docs/` 聚合且报告标注「降级」
- [x] AC-3：`flow-check --signals` 输出 ≤40 行摘要，含轮次 / tier 分布 / Review P1、P2 / 摩擦 / waiver / park / `decision_auto` / 未结实验
- [x] AC-4：触发支持「轮次计数 / 信号阈值 / 手动」，`--brief` 输出 `due: yes|no` 与理由
- [x] AC-5：retro 产出 ≤3 条实验（假设 / 指标 / 窗口 / 回滚），写入 `docs/others/retro/` 并登记索引，下次 retro 能结算
- [x] AC-6：上游建议只以可复制块输出，不直接修改 `.agents/skills/**`
- [x] AC-7：dry-run 只写 `lastDryRun` + 账本，`status` / `next` / `currentRun` 不变；`/flow` 不会因 dry-run 进入 Review
- [x] AC-8：`--state` 能校验 `lastDryRun` 账本（存在性 / plan 引用 / 任务表 / `mode: dry`），坏样本报错

## 验收结果

- AC-1：`retro` skill 72 行 + route；`npx skills add . -l` 发现 7 个 skill
- AC-2：有/无 `.flow` 两种仓各跑一次；无 `.flow` 时报告标注「降级」
- AC-3：`--signals` 输出 10 行摘要，字段齐全；parked 从账本统计
- AC-4：`--brief` 输出 `due: yes|no` 与计数；G2 必检并提示；轮次用 `plans_total` 快照差（同日多轮可计）
- AC-5：生成 `docs/others/retro/RETRO-20261117.md` 并登记；`--signals` 读回 2 条未结实验；未结实验只认最新 RETRO（`signals-settled` 覆盖）
- AC-6：retro 只输出 upstream 块，未改 `.agents/skills/**`
- AC-7：dry-run 只写 `lastDryRun` + 账本；`state-dry` 样本通过，`status/next/currentRun` 不变
- AC-8：`--state` 校验 `lastDryRun`；删账本后报错

## 关联

- 前置 Feature：FEAT-002（run / 证据体系）、FEAT-003（quick 档）
- Plans：PLAN-20261117-retro-signals
- Designs：DES-arch-run-protocol（状态语义更新）、DES-arch-retro-signals（新增）
