---
name: auto
description: >-
  Lightweight intent router: clarify if needed, match the user's goal to an
  installed workflow skill, then fully hand off by reading that skill's SKILL.md.
  Use when the user invokes /auto or wants a single entry without naming a skill.
disable-model-invocation: true
---

# 统一入口（意图路由）

轻量路由器：识别意图 → **完全移交**目标 skill。不实现业务闭环，不代替目标 skill 的确认门禁。

## 硬规则

1. **移交前**可澄清与展示菜单；**移交后**只遵循目标 `SKILL.md`，不再以 auto 身份编排
2. 发现范围：`.agents/skills/*/route.md`，**排除** `auto` 自身；目录名即 skill `name`
3. **禁止**为菜单/匹配去 Read 各 skill 的完整 `SKILL.md`；仅读对应 `route.md`
4. 无 `route.md` 的 skill：可列入菜单但标注「无路由卡片」，匹配权重更低（必要时再读其 front-matter `description` 前几行）
5. 用户显式点名 skill → 直接移交，跳过消歧
6. `/flow init` 属 **flow**，不是 **init**

## 阶段 0：等待用户输入

### 触发

- `/auto` 无正文、仅寒暄、或意图无法判断

### 执行

1. 枚举 sibling 目录的 `route.md`（排除 `auto`），生成**可选工作流菜单**（命令 = `/<目录名>`，摘要取自该 `route.md` 的「触发意图」一行）
2. 提示用户描述任务，或直接回复菜单中的命令/名称
3. **停止等待**；收到有效意图后再进入阶段 1
4. 不改代码、不写 `docs/`、不加载任何目标 `SKILL.md`

### 菜单格式（示例）

```
请描述你想做的事，或选择工作流：
- /flow — …
- /rdd  — …
- /do   — …
- /hld  — …
- /init — …
（以及扫描到的其他带 route.md 的 skill）
```

## 阶段 1：意图匹配

对用户描述套用**消歧阶梯**（先命中先定；与 `route.md` 冲突时以阶梯硬规则为准，并向用户说明）：

| 优先级 | 命中条件 | 目标 |
|--------|----------|------|
| 1 | 要维护 `docs/` 事实闭环，或 `/flow` / `flow init` | `flow` |
| 2 | 只要高阶方案评审、明确不写代码 | `hld` |
| 3 | 生成项目 AI 规则 / 引导写 `AGENTS.md`（非 flow 文档体系 init） | `init` |
| 4 | 小改、意图清晰、快速确认后实现 | `do` |
| 5 | 要方案对比、完整交付、或可选独立 Code Review | `rdd` |
| 6 | 其他 / 新 skill | 按各 `route.md` 语义匹配 |

- **唯一命中** → 阶段 2
- **多候选或仍不清** → 用已读的 `route.md` 列出 Top 候选与差异，请用户选定；选定前不移交

## 阶段 2：完全移交

1. 一句话声明：`已路由到 /<name>，以下严格按该 skill 执行`
2. **此时才 Read** 目标 skill 的 `SKILL.md`（及其指明的 reference，按该 skill 自己的渐进加载规则）
3. 将用户原始需求（及本轮澄清结论）作为该 skill 的输入，从其规定的起始阶段执行
4. 此后禁止再套用 auto 的阶段或菜单，除非用户重新 `/auto`
