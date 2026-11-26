---
id: DES-arch-retro-signals
title: 跨轮 retro 与信号契约
doc_type: design
status: current
domain: arch
scope: [workflow, retro, signals]
anchors: [.agents/skills/retro/**]
updated: 2026-11-19
---

# 跨轮 retro 与信号契约

## 定位

`retro` 是**元层**：对象是工作流本身，不是项目事实。它只读聚合信号，产出实验与上游建议，不改 `docs/` 事实、不改 skill。

与 Compound 的分工：Compound 单轮、面向项目、可落 docs；retro 跨轮、面向工作流、只出建议。

## 信号源

| 源 | 内容 | 前提 |
|----|------|------|
| `.flow/runs` | 任务状态、park、门禁、决策 | 项目跑过 run |
| `.flow/signals.jsonl` | 事件计数（`task_parked`、`decision_auto`） | 同上 |
| `docs/plans` | `tier`、`created`、`review`、§8 摩擦/waiver、Review P1/P2 | 始终可用 |
| `docs/features` | AC 完成度、frozen | 始终可用 |
| `docs/others/retro` | 上次 RETRO 日期、未结实验 | 跑过 retro |

无 `.flow` 时自动降级为 docs 聚合，报告首行标注「降级」。

## 聚合输出（`--signals`）

- 轮次：Plan 总数、`tier` 分布、距上次 retro 的 Plan 数（优先用 RETRO 的 `plans_total` 快照差，缺失时按日期兜底）
- Review：checklist / skip 数，P1 / P2 数
- 工程摩擦与 waiver 的 Plan 数；摩擦主题计数（`env` / `ui` / `gate` / `build` / `test` / `lint` / `db` / `ci` / `tooling` / `docs` / `other`，先剥离反引号、同 Plan 去重）与 `friction_repeat`（窗口内出现在 ≥2 个 Plan 的 topic 数）；摩擦明细默认最近 5 条，`--detail` 输出全部条目（每条 80 字）
- 运行：parked、`decision_auto`（仅 `.flow`）
- 未结实验数（来自 `docs/others/retro` 的「状态」列）
- 触发结论 `due: yes|no` 与理由

`--brief` 输出一行机器可读摘要（含 `friction_repeat`），供 G2 / CI 判断。

## 触发

| 方式 | 规则 |
|------|------|
| 手动 | `/retro` |
| 轮次 | 上次 RETRO 之后 ≥5 个 Plan |
| 信号 | P1 ≥3 / 摩擦 ≥3 / park ≥3 |

时间调度不内置；需要时由宿主定时调用。

## 实验

- ≤3 条；每条含假设、指标、窗口（≤5 轮）、回滚条件
- 状态：`open` / `兑现` / `无效` / `证据不足`；未结实验只取最新 RETRO，旧记录不回改
- 结算只看指标，不看叙述；无数据写「证据不足」，不续期

## 记录与上游

- 记录：`docs/others/retro/RETRO-<YYYYMMDD>.md`（append）+ 索引
- 上游建议：可复制块（skill 路径 / 假设 / diff 要点 / 指标），**不直接改 skill**
- `.flow/retro/` 可选，不作为唯一来源

## 约束

- 不读历史 Plan 正文与会话记录；成本上限为一次 `--signals` + 上次 RETRO
- 不评价个人或团队，只改流程与工件
- 无数据时拒绝产出实验
