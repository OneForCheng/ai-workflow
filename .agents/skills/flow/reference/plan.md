# Plan 模式

目标：把需求固化为可执行的**过程方案**，并声明 Go 阶段要回填的事实文档。**零代码改动。**

## 前置

- 已读 `AGENTS.md`（宪法）
- 需求已明确（对话描述 / Feature ID / 需求文件 / 工单）

## 步骤

### 1. 最小读取（严格按读集契约）

1. 读目标 Feature 文件（无则按骨架创建，追加）
2. 读 `docs/designs/README.md` 与 `docs/standards/README.md`，按 `scope` 与相关性各选 0–3 篇精读
3. 读 `docs/plans/README.md` 查重：该 Feature 是否已有 `draft|active` 的 Plan
4. 读取必要的代码（入口模块、相关文件）；不做全库扫描，不读历史 Plan 正文

### 2. 现状与 Gap 分析

| 能力项 | 现状（Designs / 代码） | 目标 | 改动类型 |
|--------|------------------------|------|----------|

区分**已知事实**与**推断/假设**；假设显式标注。

### 3. 写 Plan 文件（追加）

路径：`docs/plans/PLAN-<YYYYMMDD>-<slug>.md`；同名已存在则加 `-2`、`-3`。骨架见下。

### 4. 更新索引

在 `docs/plans/README.md` 追加一行。

### 5. 多方案时

最多 3 个方案，用对比表（思路 / 优点 / 局限 / 复杂度）呈现并给出推荐。
用户选定后写入同一 Plan 文件；**未选方案不落档**。

### 6. 输出摘要并停止（G1）

输出：需求理解 / 改动清单 / Tasking / 待确认项，然后：

> 请确认方案。如无误，请回复：**确认方案，开始实现**

**G1 通过前禁止**：修改任何代码、创建业务文件、安装依赖、执行迁移等改变项目状态的命令。

## Plan 文件骨架

```markdown
---
id: PLAN-20260114-order-refund
title: 订单退款实现方案
doc_type: plan
status: draft
feature: FEAT-001
scope: [order, payment]
created: 2026-01-14
---

# PLAN-20260114-order-refund 订单退款实现方案

## 1. 需求理解
[一段话；来源：FEAT-001 / 工单 / 链接]

## 2. 现状与 Gap
| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|

## 3. 方案
### 思路
### 改动清单
- 修改：`path/to/file` — 说明
- 新增：`path/to/file` — 用途
### 关键设计决策
- D1：<决策> — 理由：<...>

## 4. Tasking
- [ ] T1 ...
- [ ] T2 ...

## 5. 验收对照
| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|

## 6. 影响的事实文档（Go 回填清单）
- designs：`db/order.md`、`api/order-api.md`
- standards：无 / `api.md`
- features：`FEAT-001`
- others：无 / `adr/ADR-001-*.md`

## 7. 执行结果与偏差（Go 结束时追加，不回改上文）
```

> §6 是省 token 的关键：Go 阶段据此**精确定位**要回填的文件，无需扫描 `docs/`。

## Feature 文件骨架（首次创建时使用）

```markdown
---
id: FEAT-001
title: 订单退款
doc_type: feature
status: draft
scope: [order, payment]
owner: BA
source: <Jira / 链接 / 对话，可选>
updated: 2026-01-14
---

# FEAT-001 订单退款

## 目标

## 范围
- In Scope：
- Out of Scope：

## 业务规则 / 字段映射
| 输入 | 规则 | 输出 |
|------|------|------|

## 验收标准
- [ ] AC-1 ...

## 关联
- Plans：PLAN-20260114-order-refund
- Designs：DES-db-order、DES-api-order
```
