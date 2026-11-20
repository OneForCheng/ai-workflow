---
id: FEAT-002
title: 工作流演进：可判定 · 可续跑 · 可 retro
doc_type: feature
status: done
scope: [workflow, skills, docs, quality-gates, loop, retro]
owner: BA
source: 对话 + idea/简单聊聊一些新的 AI 编程实践.pdf
updated: 2026-11-20
frozen: f095afc3dc6d
---

# FEAT-002 工作流演进：可判定 · 可续跑 · 可 retro

## 目标

在不引入运行时依赖、不增加常驻上下文的前提下，把现有 `/flow` 从「单轮人工闭环」推进为「可判定、可续跑、可自改」的工作流：拆分有矩阵可验、质量门可归因、无人值守可续跑、跨轮改进有信号与实验。分三期落地，每期独立可验收。

## 范围

- In Scope（三期）：
  - **P0 可判定性基建（本轮）**：文档/代码锚点（anchors）；Plan 的 AC↔Task↔验证矩阵、Task 卡片与遗漏清单；质量门失败归因、基线与 waiver；Review 风险触发；门契约模板（fast/full 双档）；checker 自测 fixtures
  - **P1 无人值守执行**：授权信封（A0–A3，A4 禁止）、决策等待窗口 W、run 账本与 park 协议、pre-flight、晨报/小时报、`.flow/` 定位契约
  - **P2 跨轮 retro**：`/retro` skill（轮次/信号/手动三种触发）、聚合信号、≤3 条实验与结算、upstream 建议块
- Out of Scope：
  - 不引入向量库 / 图数据库 / 外部代码图谱 MCP 作为默认依赖（可作为可选适配层，另立需求）
  - 不新增第六个 `docs/` 子目录；运行状态放 `.flow/`，与事实文档分离
  - 不默认开启多 agent 并行；不内置调度器（时间触发由宿主适配）
  - 不改变 G0 / G1 的语义：确认前不写 docs、不改代码

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| design / standard 声明 `anchors` | 项目根相对路径或 glob，须至少命中 1 个真实路径 | `flow-check --map` 覆盖视图；无效锚点报错 |
| Plan 声明 Tasking | 每条 AC 至少 1 个 Task；每个 Task 有 DoD 与验证方式 | `flow-check --trace` 校验 |
| 质量命令失败 | 先与基线对比，归因为「本轮引入 / 既有无关 / 门禁本身」 | 修复 / waiver 记账 / 机检建议 |
| Review 命中高风险路径 | 鉴权、支付、迁移、公开 API、配置密钥等 | 强制 checklist，文件数仅作次要信号 |
| run 模式（P1） | 授权 A0–A3；W=0/N/∞；预算与停止条件必填 | 账本 + 晨报；A4 一律拒绝 |
| `.flow/` 定位（P1） | `--flow-root` > `FLOW_ROOT` > 向上查找 > git root > cwd | 状态落盘；父级无 git 时记 `tracked: false` |
| retro 触发（P2） | 轮次计数 ≥5、信号阈值、手动 | ≤3 条实验，写 `.flow/retro/`，不直接改 skill |

## 验收标准

- [x] AC-1：design / standard 可声明 `anchors`；`flow-check` 校验其命中真实路径，并以 `--map` 输出「目录 ↔ 覆盖文档 ↔ 未覆盖模块」视图
- [x] AC-2：Plan §4 采用 AC↔Task↔验证矩阵 + Task 卡片 + 8 项遗漏清单；`flow-check --trace` 能校验各 AC 覆盖情况
- [x] AC-3：Go 质量检查含失败归因表、基线记录与 waiver 字段，并写入 Plan §8
- [x] AC-4：Review 在命中高风险路径时强制 checklist；文件数降为次要信号且不单独决定 skip
- [x] AC-5：`/flow init` 产出质量门契约模板（fast/full 双档、layer、on_fail），AGENTS.md 只留指针
- [x] AC-6：`flow-check --fixtures` 自测 6 个坏样本，全部按预期失败且报告可定位
- [x] AC-7：全部约定以项目根相对路径表述，`docsDir` 可参数化，可在任意工作目录/仓库运行
- [x] AC-8（P1）：异步 run 支持授权信封、决策等待窗口、账本续跑、park 不阻塞队列、晨报输出
- [x] AC-9（P1）：`.flow/` 按「显式参数 > 环境变量 > `docs/` 同级 > 向上查找 > git root > cwd」定位，默认与 `docs/` 同级（工作区根）；workspace 模式记录任务所属 repo；不在 git 内时标记未跟踪；内部分层为「结论层（`state.json`、retro 记录）可跟踪 / 证据层（`runs/`、`signals.jsonl`）默认本地」，证据缺失时 retro 须显式标注并降级结论
- [x] AC-10（P2）：`/retro` 支持轮次计数、信号阈值、手动三种触发；只读聚合信号，产出 ≤3 条可结算实验
- [x] AC-11（P2）：retro 对 skill 的改动只输出建议 diff，须用户明确确认后才可合入

## 验收结果

- AC-1：`anchors` 与 `--map` 已实现；本仓库 1/1 代码目录被覆盖，坏锚点报 ERROR
- AC-2：Plan §4 三件套落地；`--trace` 对缺失 AC、无 Task、无验证均报错
- AC-3：go.md 增加基线、三分归因表与 waiver 字段
- AC-4：review.md 改为风险优先，文件数仅决定是否询问
- AC-5：init.md 含质量门契约模板；`--gates` 可校验缺字段/非法层
- AC-6：`--fixtures` 通过；初始 6 个坏样本，后续补 2 个 trace 样本（当前 8/8）
- AC-7：全部路径为项目根相对；checker 接受任意 `docsDir`，fixtures 在临时路径下可运行
- AC-8：run 协议落地（`reference/run.md`），含 pre-flight、A0–A4 信封、W 三种取值、任务循环、park、账本与晨报；补充 `--dry-run` 只读排演（G1 前验证任务可执行性）；`--state` 可校验
- 补充：`/flow run` 在 `SKILL.md` 阶段 0 显式分发（step 0b），不再依赖模型从使用边界表推断
- AC-9：`.flow/` 定位（含 `docs/` 同级）与 repo/workspace/tracked 分层落地；`state-ok` / `state-invalid` 样本通过
- AC-10、AC-11：由 FEAT-004 交付（`/retro` skill、信号聚合、实验与 upstream 建议；`RETRO-20261117` 已结算）

## 关联

- 前置 Feature：无（在 FEAT-001 路由体系之上演进）
- Plans：PLAN-20261116-flow-verifiability（P0）、PLAN-20261116-flow-run-protocol（P1）
- Designs：DES-arch-flow-contracts
- 后继 Feature：FEAT-004（P2 retro）、FEAT-005（收尾变更总结与提交助手）
- 修补：PLAN-20261119-plan-status-check（checker：Plan §8/status 漂移 WARN + Go 清单补 status→done）
- 修补：PLAN-20261120-feature-status-check（checker：Feature AC/status/frozen 漂移 WARN + 存量收尾）
