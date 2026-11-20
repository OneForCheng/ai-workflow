---
id: FEAT-003
title: quick 档：小改动的最小闭环
doc_type: feature
status: done
scope: [workflow, quick, review]
owner: BA
source: 对话
updated: 2026-11-20
frozen: 73a0c8e803b7
---

# FEAT-003 quick 档：小改动的最小闭环

## 目标

让 `/flow` 覆盖「10–20 分钟就能改完」的小改动：复用既有 Feature、合并 G0/G1、压缩文档量，仍保留 Plan、Review 与需求回溯，避免小任务全部滑向 `/do` 而丢失文档记录。

## 范围

- In Scope：
  - `/flow quick <需求>` 显式入口；阶段 0 输出「重量判定 + 理由」，用户可改档
  - 复用现有 Feature（`plan.feature` 指向已有），不新建 Feature；无归属时才建最小 Feature
  - G0 + G1 合并为一次确认；确认前不改代码
  - quick 不降低 Review 默认：执行 checklist；仅用户明确不需要才 skip；命中高风险仍强制
  - 越界（超过判定阈值（≤5 文件）/ 契约 / 权限 / 迁移 / 新依赖）立即停止并升 standard
  - checker 支持 `tier: quick`：矩阵可省略、不因未覆盖全部 AC 报错
  - 复用 Feature 的三条护栏：不改正文、只允许追加关联行、需改 AC/范围/业务规则即升 standard
  - 复用定位只允许「用户点名 / features 索引按 scope 命中 1 篇 / 上个 Plan 关联」，最多看 2 篇
  - 与 `/do` 的边界写进 route 与 SKILL
- Out of Scope：
  - 不改变 standard 与 run 档的行为
  - 不让 quick 承载重构、跨模块或契约变更
  - 不引入新的脚本或依赖

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| `/flow quick <需求>` | 判定 ≤3 文件、单模块、无契约/权限/迁移/依赖变更 | 进入 quick，输出一次确认 |
| 判定不通过 | 建议改 standard 或 run | 停，不降档 |
| 复用 Feature | `plan.feature` 指向已有 Feature，正文不动 | 不新建 Feature |
| 无归属 | 建最小 Feature（目标 + AC 各一条） | 新建 `FEAT-<n>` |
| 实施越界 | 立即停，升 standard 并补 Feature/Plan 段 | 已改内容保留，说明范围变化 |
| Review | quick 与 standard 一致：默认 checklist；仅明确不需要才 skip；高风险强制 | 按 checklist 执行 |
| 复用 Feature | 不改正文；Go 仅允许追加「关联」行；`frozen` 哈希不含关联，故安全 | Feature 正文不变 |
| 需要改 AC / 范围 / 业务规则 | 不属于 quick | 升 standard，新建 Feature |
| 定位复用 Feature | 用户点名 / 索引按 scope 命中 1 篇 / 上个 Plan 关联；最多 2 篇 | 命中即停 |

## 验收标准

- [x] AC-1：`/flow quick` 可显式进入；阶段 0 输出重量判定与理由，用户可改档
- [x] AC-2：quick 复用现有 Feature，不新建（无归属时建最小 Feature）
- [x] AC-3：G0 与 G1 合并为一次确认；确认前不改代码
- [x] AC-4：quick 不改变 Review 默认：执行 checklist；仅用户明确不需要才 skip；命中高风险路径强制
- [x] AC-5：实施越界（超过判定阈值（≤5 文件）/ 契约 / 权限 / 迁移 / 新依赖）即停止并升 standard
- [x] AC-6：`--trace` 识别 `tier: quick`，矩阵可省略且不报「AC 未覆盖」；standard 行为不变
- [x] AC-7：quick 全过程 3 轮内完成，文档 ≤2 个文件（Plan + 索引）
- [x] AC-8：与 `/do` 的边界写进 `route.md` 与 `SKILL.md`
- [x] AC-9：复用 Feature 不改正文；Go 仅允许追加关联行；需要改 AC/范围/业务规则时不属于 quick，必须升 standard 并新建 Feature
- [x] AC-10：复用定位只走「用户点名 / features 索引按 scope / 上个 Plan 关联」三条路径，最多查看 2 篇，禁止全库 grep

## 验收结果

- AC-1：`/flow quick` 入口与阶段 0 判定落地（SKILL + quick.md），判定含理由与改档
- AC-2：quick 复用 Feature、无归属建最小 Feature 的规则写入 quick.md
- AC-3：G0/G1 合并为一次确认；确认前禁止改代码
- AC-4：quick 默认 checklist（review.md 明确 tier 不改变判定），高风险强制
- AC-5：越界升档规则写入 quick.md §6
- AC-6：checker 校验 `tier`，quick 可省矩阵、`covers: []` 仅 quick 合法；`trace-quick` / `plan-cover-empty` 样本通过
- AC-7：3 轮流程与一页 Plan 模板写入 quick.md / plan.md
- AC-8：`/do` 与 quick 的边界写入 route.md、SKILL.md、quick.md
- AC-9：复用 Feature 的 Go 动作收敛为「只追加关联」；`frozen` 哈希不含关联，追加后校验仍通过
- AC-10：复用定位三路径 + 最多 2 篇 + 禁止 grep 写入 quick.md 与读集表

## 关联

- 前置 Feature：FEAT-002（run / 证据体系）
- Plans：PLAN-20261116-flow-quick-tier
- Designs：DES-arch-flow-contracts（Go 回填 tier 分档）
