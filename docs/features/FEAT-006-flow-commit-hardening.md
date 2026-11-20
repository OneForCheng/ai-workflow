---
id: FEAT-006
title: flow-commit 多仓支持与署名校验
doc_type: feature
status: done
scope: [workflow, commit, workspace, validation]
owner: BA
source: docs/others/FLOW-SKILL-PROPOSALS.md
updated: 2026-11-19
frozen: bfcd9e2043cb
---

# FEAT-006 flow-commit 多仓支持与署名校验

## 目标

让 `flow-commit` 同时覆盖「工作区根不在 git 仓内 / 一工作区多仓」与「`[用户名] #卡号` 被手填」两类问题：多仓按 `.flow/repos.json` 或深度 1 探测逐仓提交；署名只允许来自 `git config user.name` 与脚本推断，并提供 `--check-message` 与 `flow-check` warning 防复发。

## 范围

- In Scope：
  - `.flow/repos.json` 数据层：`repos[]` / `unmanaged`；`flow-commit` 惰性读取，缺失时深度 1 探测
  - `flow-commit` 三态解析：`--repo` > cwd 所在仓 > `.flow/repos.json` > 深度 1 探测 > 无载体
  - 逐仓 dry-run / 提交；`--all-repos`；exit 4（无载体）/ 5（多仓未显式选择）
  - `flow-check --state` 校验成员仓；`flow-check --trace` 手填用户名 WARN
  - `--check-message` 格式 / 用户名 / 卡号 / type 校验与 hint
  - `go.md` / `summary.md` 署名硬约束；`summary.md` / `run.md` / `init.md` / `SKILL.md` 多仓口径
  - 提案元数据 / 索引、Feature / Plan / designs 回填
- Out of Scope：
  - push / merge / 改历史
  - 改变 message 格式、type 白名单
  - `/flow init` 强制创建 `.flow/`；本轮采用惰性探测
  - 自动递归猜测嵌套仓；以 `.flow/repos.json` 显式清单为准

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| `--repo <name>` | 从 `.flow/repos.json` 取成员仓 | 只处理该仓 |
| cwd 在 git 仓内 | 优先单仓旧路径 | 与当前行为一致 |
| `.flow/repos.json` | `repos[].path` 须为仓根；`unmanaged` 只提示 | 逐仓候选 |
| 缺失 repos.json | 在工作区根深度 1 找含 `.git` 的子目录（跳过 `node_modules`/`target`/`.m2repo`） | 惰性 workspace |
| 无任何 git 载体 | 不再报「不在仓库」 | exit 4，提示无需提交 |
| 非 dry-run 且 >1 脏仓 | 未加 `--all-repos` / `--repo` 拒绝提交 | exit 5，零提交 |
| 逐仓提交 | 每仓 `git add -A` → commit → 记录 SHA；任一失败停止 | 已提交 / 未处理清单，exit 3 |
| 用户名 | 每仓 `git config user.name`；`--user` 全局覆盖 | `[用户名]` |
| 卡号 | `--card` 全局覆盖；否则逐仓推断；冲突且无覆盖 | WARN + exit 1 |
| `--check-message` | 校验格式 / 用户名 / 卡号 / type；不提交 | exit 0 / 1 + 正确候选 |
| Plan 手填 `[name] #card type:` | 与 git user 不一致时告警 | `flow-check --trace` WARN |

## 验收标准

- [x] AC-1：`go.md` 与 `summary.md` 落硬约束——`变更总结` 只写摘要 + type；用户名 / 卡号 MUST 来自脚本，脚本不可用时用占位并说明，禁止旁证推断。
- [x] AC-2：`flow-commit --check-message` 校验格式 / 用户名 / 卡号 / type，支持 `--user` / `--card`；失败 exit 1 并给出正确候选；self-test 覆盖错误用户名、错误卡号、非法 type 与覆盖。
- [x] AC-3：`flow-check --trace` 对 draft/active Plan 中手填用户名不一致给 WARN；无 git 用户时跳过；现有 fixtures 不回归。
- [x] AC-4：`.flow/repos.json` 成员仓可被 `flow-check --state` 校验；`mode=workspace` 缺清单给 WARN；`init.md` 只给探测建议、不强制创建 `.flow/`。
- [x] AC-5：`flow-commit` 支持 `--repo` / `--all-repos` / 惰性探测 / 逐仓 dry-run 与提交；无载体 exit 4，多仓未显式选择 exit 5；`--json` 保留旧字段并增加 `repos[]`。
- [x] AC-6：提案补 front-matter / 索引；`flow-check docs`、`--trace`、`--fixtures`、`flow-commit --self-test` 全过；summary / run / SKILL / AGENTS / contracts 同步。

## 验收结果

- AC-1：`go.md` §8 与 `summary.md` 已加 MUST / MUST NOT；脚本不可用时用 `<由脚本推断>` 占位
- AC-2：`--check-message` 已实现；self-test 覆盖错误用户名 / 卡号 / type / 覆盖，共 14 项通过
- AC-3：`flow-check --trace` 手填 WARN 已实现；临时 git 仓用例触发，无 git 时跳过
- AC-4：`flow-check --state` 校验 `repos.json`；`state-workspace-missing` / `state-repos-bad` fixtures 通过
- AC-5：`flow-commit` 支持 `--repo` / `--all-repos` / 惰性探测 / 逐仓提交 / exit 4/5 / `--json`；self-test 覆盖
- AC-6：提案补 front-matter / 索引；`flow-check docs`、`--trace`、`--fixtures`、self-test 全过

## 关联

- 前置 Feature：FEAT-005（收尾变更总结与提交助手）
- Plans：PLAN-20261119-flow-commit-hardening
- Designs：DES-arch-flow-contracts、DES-arch-run-protocol
