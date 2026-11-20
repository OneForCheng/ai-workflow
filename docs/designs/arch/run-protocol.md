---
id: DES-arch-run-protocol
title: 无人值守执行协议
doc_type: design
status: current
domain: arch
scope: [workflow, run, state]
anchors: [.agents/skills/flow/reference/run.md]
updated: 2026-11-19
---

# 无人值守执行协议

## 状态机

```
idle → pre-flight → running → done | paused
                     ↑           │
                     └─ resume ──┘
```

`state.json`：`status` ∈ `idle | running | paused | done`；`next` ∈ `none | review | compound | plan`；`lastDryRun` 可选。只有在 Plan 有 `approved` 时才能进入 `running`。

**dry-run 不属于 run 生命周期**：允许 draft、零写入，只写 `runs/RUN-DRY-*.md` 与 `state.lastDryRun`，不改 `status` / `next` / `currentRun`；账本内 `mode: dry`。

## 授权信封

| 级别 | 允许 |
|------|------|
| A0 | 只读 |
| A1 | Plan §3 声明文件（默认） |
| A2 | A1 + 同目录新增测试/文件 |
| A3 | A2 + 配置/CI + **Plan 已声明**的依赖 |
| A4 | 未声明依赖、迁移、密钥、发布、权限 —— 一律拒绝 |

依赖以 Plan §3 改动清单为准；未声明即 A4，park 不追认。

## 决策与等待窗口

- 策略优先级：最小改动 > 复用既有模式 > 可逆优先 > 不确定则 park
- `window`：`0` 立即决策并标 `auto`；`N` 等待 N 分钟；`∞` 遇决策即 park
- 无续跑宿主时 `N` 退化为 `0`，晨报首行标注，不假装等待

## 账本

- `runs/RUN-*.md`：front-matter（`run` / `plan` / `status` / `approved` / `auth` / `window` / `budget` / `branch`）+ 任务表（`任务 | 状态 | 门禁 | 证据`）+ 决策表 + park 明细
- `signals.jsonl`：`{ts, run, event, task?, detail?}`，事件含 `run_start / task_done / task_parked / gate_fail / decision_auto / scope_violation / run_end`
- `state.json` 原子写；账本只追加；续跑跳过 `done` / `parked`

## park

原因：`missing-info` / `gate-fail` / `scope` / `permission` / `conflict` / `envelope`。每条必须带复现命令、已尝试、原因、建议、影响文件；不阻塞无关任务，依赖方标 `blocked-by`。

## `.flow/` 定位与分层

优先级：`--flow-root` > `FLOW_ROOT` > `docs/` 同级 > 向上查找 > `git root` > `cwd`。

- `repo`：状态在单仓内；`workspace`：状态在工作区根，账本按任务记 `repo`
- `workspace` 的成员仓由 `.flow/repos.json` 声明；缺失时 `flow-commit` 在工作区根深度 1 探测
- 结论层（`state.json`、`retro/`）可入 git；`repos.json` 属结论层；证据层（`runs/`、`signals.jsonl`）默认本地
- 不在 git 内时 `tracked: false`，晨报标注历史不入库

## 退出与交回

| 结束 | `status` | `next` |
|------|----------|--------|
| 完成 | `done` | `review` |
| 预算/停止条件 | `paused` | `review` |
| 用户中断 | `paused` | `none` |

run 不做 Review / Compound；`/flow` 读到 `next: review` 后进入 G1.5。

## 红线

不 push/merge、不改未声明依赖与迁移密钥、不改 Plan/Feature 正文、不关 coverage 不删测试、不写密钥、不无限重试、不越权、不自动 Review/Compound。
