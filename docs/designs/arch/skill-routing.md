---
id: DES-arch-skill-routing
title: Skill 路由与移交契约
doc_type: design
status: current
domain: arch
scope: [skills, auto, routing]
anchors: [.agents/skills/**]
updated: 2026-11-16
---

# Skill 路由与移交契约（当前事实）

## 角色

| 组件 | 职责 |
|------|------|
| `auto` | 澄清意图、展示菜单、匹配目标 skill、完全移交 |
| 目标 skill（`do`/`rdd`/`hld`/`flow`/`init`/…） | 承接业务闭环与门禁；不负责统一入口 |
| `route.md` | 各 skill 旁路的轻量路由卡片；供 `auto` 发现与匹配 |

## 路由卡片文件

路径：`.agents/skills/<name>/route.md`（与 `SKILL.md` 同目录）。

| 字段 | 含义 |
|------|------|
| 触发意图 | 何种用户目标应命中本 skill |
| 不适用 | 应交给其他 skill 的信号 |
| 与相近 skill 分界 | 与易混淆 skill 的边界 |

`auto` 菜单与匹配阶段**只读**各 `route.md`，不读完整 `SKILL.md`。无 `route.md` 时匹配权重更低。

## 发现

- 扫描 `.agents/skills/*/route.md`
- 排除目录名 `auto`
- 目录名即 skill 名；菜单命令为 `/<name>`

## 消歧阶梯（默认优先级，写在 `auto`）

1. `flow` — `docs/` 事实闭环或 `/flow`（含 `flow init`）
2. `hld` — 评审向、不写码
3. `init` — 生成项目 AI 规则（非 `flow init`）
4. `do` — 小改、清晰、快速实现
5. `rdd` — 方案对比 / 完整交付 / 可选独立 Review
6. 其他 — 按各 `route.md` 语义

显式点名 skill 时跳过消歧，直接移交。

## 移交契约

1. 声明已路由到 `/<name>`
2. **此时才** Read 目标 `SKILL.md`（及该 skill 要求的 reference）
3. 以用户原始需求 + 澄清结论作为输入，从目标 skill 规定起点执行
4. 此后不再套用 `auto` 阶段，除非用户再次 `/auto`
