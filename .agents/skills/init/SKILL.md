---
name: init
description: >-
  Generate cross-tool project context rules (AGENTS.md, docs/standards/*.md, or
  optional Cursor / Claude / Codex / OpenCode rule files) from the current repo.
  Use when the user invokes /init or asks to bootstrap project AI rules.
disable-model-invocation: true
---

# 任务：为当前项目生成跨工具规则文档

分析**当前工作区根目录**下的代码与配置，生成面向 AI 的项目上下文规则，帮助各 Agent 工具快速理解项目。

## 目标产物

| 产物 | 职责 |
|------|------|
| `product` | 项目是什么、核心模块、外部集成 |
| `structure` | 目录结构、文件放置、命名约定 |
| `tech` | 技术栈、代码规范、常用命令 |
| `AGENTS.md` | 跨工具入口：一句话定位 + 目录 + 命令 + 按需加载指引 |

三分内容逻辑同源；按所选工具写入对应路径与格式。

## 项目基本信息（请替换或从代码推断）

- **项目名称** / **项目类型** / **一句话定位**
- **主要用户/角色**、**关联项目**、**特殊架构**（如有）
- 代码中可推断则以代码为准；推断不出时再问用户。

---

## 总体要求

1. **基于事实**：路径、命令、版本、模块名必须来自实际代码（构建配置、README、目录扫描），不要编造。
2. **面向 AI**：强调「改什么代码时需要知道什么」，少写背景介绍。
3. **简洁**：每个分册 **40–150 行**，章节少时可更短；用表格和清单，避免长段落与空章节。
4. **职责分离**：product 不写规范；structure 不写命令；tech 不写业务模块。
5. **中文撰写**，技术名词保留英文。
6. 三分内容 **互不重复**；默认按需加载，不 always-on。
7. **章节按需选取**：下方各分册章节为**参考清单**，非强制全写。扫描项目后只纳入**对 AI 开发有实际价值**的内容；项目不具备的维度直接省略。

---

## 步骤 0：确认目标工具

先询问用户要生成哪些目标（可多选），默认至少包含 **通用 `AGENTS.md`**：

| 选项 | 输出位置 |
|------|----------|
| **通用（推荐，默认）** | 仓库根目录 `AGENTS.md` |
| **文档体系（配合 `/flow`）** | `docs/standards/{product,structure,tech}.md`（并登记 `docs/standards/README.md` 索引） |
| **Cursor** | `.cursor/rules/{product,structure,tech}.mdc` |
| **Claude Code** | 根目录 `CLAUDE.md`（摘要 + 指向 AGENTS.md / 三分要点），可选 `.claude/` 补充 |
| **Codex / 通用 Agents** | 依赖 `AGENTS.md`；若项目已有 `.agents/` 约定则按现有结构补充 |
| **OpenCode** | `AGENTS.md`；若存在 `.opencode/` 项目约定则按约定补充简短入口 |

未指定时：只生成 `AGENTS.md`，并在对话中说明可再补工具专用文件。

选择「文档体系」时：
1. **先反向检查已有规则文件**（见下方「`docs/standards/`（配合 `/flow` 文档体系）」小节）：存在同一主题的正文时先与用户确认归属，再决定是否写入。
2. 建议**同时生成根 `AGENTS.md` 作为入口**（多数工具不会自动加载 `docs/`），由用户确认是否一并生成。

---

## `product` — 业务上下文

**建议章节（按需选取）：**

| 章节 | 何时纳入 |
|------|----------|
| **产品概述** | 几乎总是需要：1–3 句说明项目是什么、服务谁、在系统中的位置 |
| **核心业务模块** | 有明确业务/domain 划分时；表格 `\| 模块 \| 路径/包名 \| 说明 \|` |
| **用户角色与权限** | 存在 RBAC/鉴权时；附权限代码路径 |
| **外部集成** | 有 MQ、存储、第三方 API、子服务等时；附配置/客户端路径 |
| **AI 开发提示** | 有非显而易见的坑点时；2–4 条即可 |

> 纯工具库、脚手架、无业务域的小项目：概述 + 模块（或等价说明）通常足够。

---

## `structure` — 结构约定

**建议章节（按需选取）：**

| 章节 | 何时纳入 |
|------|----------|
| **架构模式** | 有清晰分层或架构约束时（分层/DDD/FSD 等） |
| **目录职责** | 顶层目录较多或职责易混淆时 |
| **文件放置规则** | 有固定放置约定时；表格 `\| 文件类型 \| 位置 \| 命名规范 \|` |
| **命名规范** | 命名风格不直观或多种风格并存时 |
| **测试位置** | 项目有测试时 |
| **新增文件检查清单** | 结构复杂、易放错位置时 |

> 结构简单、约定单一的小项目：目录职责 + 命名规范（或合并为一节）即可。

---

## `tech` — 技术栈与命令

**建议章节（按需选取）：**

| 章节 | 何时纳入 |
|------|----------|
| **核心框架** | 几乎总是需要：语言版本、主框架及锁定版本 |
| **关键依赖** | 依赖较多或非显而易见时 |
| **代码规范** | 有 linter/formatter 或团队约定时 |
| **测试** | 项目有测试或 CI 覆盖率要求时 |
| **常用命令** | 几乎总是需要：从 scripts/Makefile/README 提取 |
| **环境配置** | 有多环境/profile/`.env` 时 |

> CLI 工具、单文件脚本：核心框架 + 常用命令通常足够。

---

## 工具格式适配

### Cursor（`.mdc`）

```yaml
---
description: 【项目名】产品概述、业务模块与外部集成
globs: 【项目根目录名】/**,src/**
alwaysApply: false
---
```

`structure` / `tech` 同理，description 与 globs 按分册调整。三个文件写入 `.cursor/rules/`。

### `AGENTS.md`（通用）

必须包含：

- 一句话介绍 + 技术栈摘要
- 核心目录（5–8 行）
- 常用命令（4–6 条）
- 按需加载表：`product` → 业务/权限/集成；`structure` → 新增文件/命名；`tech` → 规范/命令/依赖
- 若已生成工具专用文件或 `docs/standards/*.md`，列出其路径
- 可将 product/structure/tech 的精华压缩进 `AGENTS.md`；详细分册仍写入所选位置（工具专用目录或 `docs/standards/`）

### `docs/standards/`（配合 `/flow` 文档体系）

适用于已采用（或准备采用）`/flow` 的项目：三分内容作为**事实·约束**长期维护，按需加载，并遵守 `/flow` 的「变更」写规则。

| 分册 | 文件 | id |
|------|------|-----|
| `product` | `docs/standards/product.md` | `STD-product` |
| `structure` | `docs/standards/structure.md` | `STD-structure` |
| `tech` | `docs/standards/tech.md` | `STD-tech` |

每份文件必须带 front-matter：

```yaml
---
id: STD-product
title: 产品上下文
doc_type: standard
status: current
scope: [<模块标签，取自实际业务模块>]
updated: <YYYY-MM-DD>
---
```

**反向检查（必做）：避免双重事实源**

写入 `docs/standards/*.md` 前，先扫描项目中已有的规则载体，判断 product/structure/tech 的内容是否已存在于别处：

| 载体 | 路径 |
|------|------|
| Cursor 项目规则 | `.cursor/rules/**/*.mdc`（同目录下的 `.md` 会被 Cursor 忽略，但仍需检查其内容） |
| 其他项目规则 | `.cursorrules`（legacy）、`.windsurfrules`、`.github/copilot-instructions.md` 等 |
| 通用 Agent 指令 | 根目录与各子目录的 `AGENTS.md`、`CLAUDE.md` |
| 其他工具目录 | `.opencode/`、`.claude/`、`.codex/` 等已有约定 |

判定与处理：

- **内容重叠**（同一主题的正文已存在于规则文件）→ 停下来，输出对照表，由用户决定正文归属：

  | 主题 | 现有载体 | 计划写入 |
  |------|----------|----------|

  1. **`docs/standards/` 为唯一正文**：原规则文件只保留触发条件 + 一行指针（Cursor `.mdc` 可用 `@docs/standards/<x>.md`，规则命中时才内联；`AGENTS.md` 写普通链接即可，链接不会自动加载）
  2. **原规则文件为唯一正文**：本次跳过对应分册，仅在入口/索引中留指针

- **不重叠**（现有规则文件管的是别的内容）→ 正常新增，不动它
- **不确定** → 问用户，不擅自改删

为什么必须检查：Cursor 按**完整文件路径**识别规则，不做按名去重——同名不同目录的两条规则只要条件命中就都生效；且官方**未定义 `AGENTS.md` 与 `.cursor/rules` 的优先级**，两处内容重叠时模型会同时收到两份指令，既浪费 token 又可能互相矛盾（见 [Cursor 规则文档](https://cursor.com/docs/rules.md)）。

**硬约束**：同一主题的正文只允许存在一处；本 skill 不删除、不改写用户已有的规则文件，任何合并或迁移都须逐项确认。

约束：

- **索引**：在 `docs/standards/README.md` 追加或更新这三行，不改动其他条目；索引不存在时提示「先执行 `/flow init`」，获用户同意后才连同索引一并建立
- **只留最终态**：不写变更历史、日期注释、「本次新增」
- **不重复**：详细内容只放一处；若同时生成 `AGENTS.md`，由 `AGENTS.md` 的按需加载表指向这三份文件，不复制正文
- 该 skill 已安装时可自检：`node .agents/skills/flow/scripts/flow-check.mjs`

### Claude Code（`CLAUDE.md`）

- 短摘要 + 指向 `AGENTS.md`
- 不重复粘贴大段内容；关键禁忌与命令可各列 3–5 条

### Codex / OpenCode

- 以 `AGENTS.md` 为主
- 仅在项目已有工具专用目录约定时补充最短入口文件，避免无依据地新建深层结构

---

## 输出步骤

1. **确认目标工具**（步骤 0）。
2. **扫描项目**：构建配置、入口、`src/` 主目录、测试目录、CI 配置。
3. **输出分析摘要**（5 行内）：技术栈、架构、主要模块，并说明**各分册将纳入哪些章节、省略哪些**及原因。
4. **反向检查已有规则文件**（选择 `docs/standards/` 时必做）：扫描 `.cursor/rules/**`、`.cursorrules`、`AGENTS.md`、`CLAUDE.md`、其他工具目录，列出与 product/structure/tech 重叠的主题并确认正文归属；无重叠则显式声明「已检查，无双重事实源」后继续。
5. **写入文件**：
   - 始终（或默认）：`AGENTS.md`
   - 按选择：`docs/standards/{product,structure,tech}.md` + 索引 / Cursor `.mdc` / `CLAUDE.md` / 其他约定入口
6. **自检**：路径/命令可验证、三分内容无重复、Cursor globs 匹配实际路径；选择 `docs/standards/` 时额外检查 front-matter 必填字段与索引条目一一对应，且同一主题正文未在规则文件与 `docs/standards/` 中并存。

**只新增/更新**规则文件与 `AGENTS.md`（及用户确认的 `docs/standards/`、工具入口），不修改业务源代码。
