# retro reference（记录与结算细则）

## 记录位置

`docs/others/retro/RETRO-<YYYYMMDD>.md`，append，不覆盖旧记录；索引登记在 `docs/others/README.md`。
`.flow/retro/` 可选，不作为唯一来源。

## 记录模板

````markdown
---
id: RETRO-001
title: 第 1 次工作流 retro
doc_type: other
status: accepted
scope: [workflow, retro]
plans_total: 5        # retro 当时的 Plan 总数，用于下次计算轮次（快照差）
updated: 2026-11-17
---

# RETRO-001 第 1 次工作流 retro

## 信号摘要

<粘贴 --signals 输出；注明“降级”与否>

## 上轮实验结算

| 实验 | 假设 | 指标 | 窗口 | 状态 | 结论 |
|------|------|------|------|------|------|
| EXP-1 | … | … | 3 轮 | 兑现 / 无效 / 证据不足 | … |

## 本轮实验

| ID | 假设 | 指标 | 窗口 | 回滚条件 | 状态 |
|----|------|------|------|----------|------|
| EXP-2 | … | … | 3 轮 | … | open |

## 上游建议（复制回 ai-workflow 仓库）

```markdown
### Upstream 建议
- skill: flow/reference/go.md
- 假设：…
- diff 要点：…
- 指标：…
```
````

## 结算规则

- `兑现`：指标达到预设值，且无同名反向证据
- `无效`：指标未达到，或出现反向证据
- `证据不足`：窗口内没有可用数据（不续期，不猜测）

## 指标选择

| 信号 | 可用指标 |
|------|----------|
| Review 质量 | P1 命中数 / P2 数 |
| 拆分质量 | 返工 Plan 数 / park 数 |
| 门禁质量 | 摩擦记账数 / waiver 数 |
| 自动化 | park 率 / decision_auto 数 |
| 文档成本 | Plan 行数中位数 / 每轮文档数 |

## 降级

- 无 `.flow`：只用 docs 聚合，报告首行标「降级」
- 无历史 RETRO：轮次从第一个 Plan 起算
- 无 Plan：直接输出「数据不足」，不生成记录

## 成本上限

- 只读 `--signals` 聚合 + 上次 RETRO 记录；不读历史 Plan 正文
- 对话输出 ≤3 条实验 + ≤3 条上游建议
