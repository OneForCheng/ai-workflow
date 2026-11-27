---
id: FEAT-007
title: retro 输出完整性与 G2 门禁增强
doc_type: feature
status: done
scope: [workflow, retro, signals, quality-gates]
owner: BA
source: retro upstream 建议（2026-11-27）
updated: 2026-11-27
frozen: d60413740874
---

# FEAT-007 retro 输出完整性与 G2 门禁增强

## 目标

让 retro 不必为看全摩擦正文回读 Plan §8：`--signals --detail` 输出完整条目；把已有机检「`flow-check docs --strict`」纳入 G2 必跑项，历史遗留违规允许显式 waiver；让摩擦「落点」成为可判定字段（窗口内无落点计数），继续坚持「不做硬门禁」的边界。

## 范围

- In Scope：
  - `flow-check.mjs`：`--detail` 输出完整摩擦正文；默认 `--signals` 仍最多 5 条、每条 80 字；`--signals` 输出窗口内「无落点」摩擦条数
  - `summary.md`：新增「G2 前校验（必跑）」`docs --strict`，非 0 的修复 / 用户 waiver 路径
  - `SKILL.md`：G2 通过条件补「`--strict` 0 ERROR 或用户 waiver」
  - `go.md`：§8 摩擦模板 `落点` 必填（`<文件 / 脚本>` 或 `流程改进`）
  - fixtures、`flow-contracts` / `retro-signals` 同步
- Out of Scope：
  - 不把「无落点」升级为 `--strict` error 或 G2 硬门禁（用户已确认）
  - 不新增 plans/README「遗留段」契约
  - 不改变 `friction` 总数、主题词表、waiver 与 Review 判定
  - 不改变默认 `--signals` 的 5 条上限

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| `--signals` | 默认最多 5 条摩擦明细，每条截断 80 字 | `摩擦明细（最近 N 条）` |
| `--signals --detail` | 每条摩擦**完整**输出，不截断 | `摩擦明细（全部 N 条）` |
| `docs --strict` 非 0 | G2 前修复；历史遗留且不在本轮范围的，经用户确认写 Plan §8 `waiver` | 记录后可继续 |
| 摩擦条目 | `落点：<文件 / 脚本>` 或 `落点：流程改进`（必填） | 有落点 / 无落点 |
| 无落点统计 | 仅窗口内 Plan、每条摩擦判定；不阻断 | `- 无落点摩擦：N 条` |

## 验收标准

- [x] AC-1：`--signals --detail` 输出每条摩擦完整正文（不截断）；默认 `--signals` 仍最多 5 条且每条 80 字；长条目 fixture 锁定两者差异。
- [x] AC-2：`summary.md` 明确 G2 前必跑 `flow-check docs --strict`；非 0 需修复或经用户确认写入 Plan §8 `waiver`；`SKILL.md` 的 G2 条件同步。
- [x] AC-3：`go.md` 摩擦模板 `落点` 为必填（文件 / 脚本 或 `流程改进`）；`--signals` 输出窗口内「无落点」摩擦条数；fixture 覆盖有 / 无落点，且不做 `--strict` 硬门禁。

## 验收结果

- AC-1：`--signals --detail` 输出完整条目（`signals-detail` 长条目断言尾部出现）；默认仍 5 条 / 80 字
- AC-2：`summary.md` §0 与 `SKILL.md` G2 条件已要求 `docs --strict`；失败路径复用 §8 waiver
- AC-3：`go.md` 落点必填（文件/脚本 或 `流程改进`）；`--signals` 输出窗口内无落点条数（`signals-no-landing` 断言 1 条）

## 关联

- Plans：PLAN-20261127-flow-output-gate
- Designs：DES-arch-flow-contracts、DES-arch-retro-signals
