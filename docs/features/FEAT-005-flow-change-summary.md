---
id: FEAT-005
title: /flow 收尾变更总结与提交助手
doc_type: feature
status: done
scope: [workflow, skills, commit, scripts]
owner: BA
source: 对话
updated: 2026-11-19
frozen: 19dd012f64e5
---

# FEAT-005 /flow 收尾变更总结与提交助手

## 目标

在 `/flow` 每轮闭环收尾（G2 之后）基于**实际改动**生成一句英文 commit 候选，并询问用户是否提交；用户明确确认后，由零依赖脚本按项目 commit 规范执行提交。standard / quick 交互确认；run 保留逐任务自动 commit，但 message 统一规范，并在晨报输出整轮候选。

## 范围

- In Scope：
  - `/flow` standard、`/flow quick`、`/flow run` 三种模式收尾输出变更总结
  - `scripts/flow-commit.mjs`：用户名 / 卡号推断、message 组装与校验、`--dry-run`、`git add -A` 提交、`--self-test`
  - run 任务循环的自动 commit 改用 `flow-commit.mjs` 生成规范 message
  - skill 文档（`SKILL.md` / `reference/*`）与 `README.md`、`AGENTS.md`、designs 契约同步
- Out of Scope：
  - 不实现 push / merge / PR / 发布
  - 不改变 `type` 白名单与 message 格式（以 `docs/others/git-commit.md` 为准）
  - 不改 Husky 钩子；不引入依赖；不做 squash / rebase 整理
  - 不改变 run 的授权信封与逐任务提交节奏

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| 本轮实际改动 | 由 `git status --short` / `git diff --stat` 读取，不采信 Plan 声明 | 英文单行摘要（动词开头） |
| 用户确认提交 | 仅用户明确表示 commit（可带「卡号：PP-123」「用户名：xxx」） | 调用 `flow-commit.mjs` |
| 未确认 / 拒绝 | 只输出候选，不改工作区 | 工作区保持原样 |
| 卡号缺失 | 按 `git-commit.md`：当前用户最近 10 条提交中取第一个 `#PP-123` / `#1234`；仍无则 `N/A` | `[用户名] #卡号 type: 摘要` |
| 工作区无改动 | 提示无可提交内容，不执行 commit | 退出码 2 |
| run 任务门禁通过 | 信封已授权逐任务提交；用同一脚本生成规范 message | `[用户名] #卡号 type: …` + 账本 sha |
| run 收尾 | 晨报输出整轮候选，不追问、不额外提交 | 候选 message |

## 验收标准

- [x] AC-1：`/flow`（standard / quick）在 G2 输出后，基于本轮实际改动生成英文单行 commit 候选并询问是否提交；未确认前不执行 commit。
- [x] AC-2：`/flow run` 的逐任务 commit 保留，message 改为 `[用户名] #卡号 type: …`；晨报输出整轮英文候选，且不因收尾步骤追加提交。
- [x] AC-3：`flow-commit.mjs` 实现 user.name / 卡号推断 / `N/A` 兜底 / type 白名单 / 空工作区提示 / `--dry-run` / `git add -A` 提交，并以退出码区分参数错误、无改动与 git 失败。
- [x] AC-4：`flow-commit.mjs --self-test` 通过；`flow-check docs`、`--trace`、`--fixtures` 通过；README / AGENTS / designs 契约同步。

## 验收结果

- AC-1：`reference/summary.md` 定义 G2 后输出与确认门；SKILL / compound / quick 已接入，未确认不提交
- AC-2：`run.md` §5 改用 `flow-commit` 生成规范 message；晨报新增整轮候选，收尾不追加提交
- AC-3：`flow-commit.mjs` 实现推断 / 校验 / dry-run / `git add -A` 提交；`--self-test` 6 项通过，退出码 0/1/2/3
- AC-4：README / AGENTS / designs 已同步；`flow-check docs`、`--trace`、`--fixtures`（18/18）通过

## 关联

- 前置 Feature：FEAT-002（工作流演进）
- Plans：PLAN-20261119-flow-change-summary
- Designs：DES-arch-flow-contracts
- 后继 Feature：FEAT-006（多仓支持与署名校验）
