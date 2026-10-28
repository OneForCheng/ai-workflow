# ai-workflow

跨工具可安装的 **Agent Skills** 工作流库（符合 [Agent Skills](https://agentskills.io) 开放标准）。

适用于 Cursor、OpenCode、Codex、Claude Code 等支持 Skills 的 Agent 工具。

## 按场景选用

| 场景 | 用 | 说明 |
|------|-----|------|
| 小改、意图清晰 | `/do` | 分析 → 确认 → 实现 → 回溯 |
| 完整交付（含方案对比） | `/rdd` | 分析 → 方案 → 实现 → 需求回溯；复杂改动会询问是否独立 Code Review；也可只做到方案确认 |
| 高阶方案评审、不写码 | `/hld` | 产出可归档的评审文档 |
| 要长期 docs 事实闭环 | `/flow` | Plan → Go → Review? → Compound → 需求回溯 |
| 新项目 AI 上下文 | `/init` | 生成 `AGENTS.md` / standards 等 |

## Skills 一览

| 命令 | 说明 |
|------|------|
| `/do` | 简化版：分析 → 确认 → 实现 → 回溯 |
| `/rdd` | 需求驱动：分析 → 方案 → 实现 → 验证；复杂改动可选独立 Code Review |
| `/hld` | 高阶方案设计（评审文档，不写代码） |
| `/init` | 为当前项目生成跨工具规则（`AGENTS.md` 等） |
| `/flow` | 文档驱动闭环：Features → Plans → 代码 → Designs/Standards → 可选 Review/Compound → 需求回溯 |

源码目录：`.agents/skills/<name>/SKILL.md`

## 安装

依赖 [vercel-labs/skills](https://github.com/vercel-labs/skills)（`npx skills`）。

### 全局安装（推荐默认）

```bash
npx skills add OneForCheng/ai-workflow -g -y
```

### 仅当前项目

```bash
npx skills add OneForCheng/ai-workflow -y
```

默认安装到开放标准路径（项目内 `.agents/skills/`，或全局对应目录）。多数工具可直接从此路径加载。

### 额外安装到特定工具目录

```bash
npx skills add OneForCheng/ai-workflow -g -a cursor codex opencode -y
```

### 只安装某一个 Skill

```bash
npx skills add OneForCheng/ai-workflow -g -s rdd -y
```

### 本地路径（开发自测）

```bash
npx skills add /path/to/ai-workflow -g -y
```

先列出可发现的 skill（不安装）：

```bash
npx skills add OneForCheng/ai-workflow -l
```

## 更新

本仓库有新版本后，在已安装环境中执行：

```bash
# 更新全部全局 skill
npx skills update -g

# 仅更新项目级
npx skills update -p

# 更新指定 skill
npx skills update rdd -g
```

建议安装时使用默认的 symlink 方式，便于后续 `update`。若曾使用 `--copy`，update 会重新拉取并覆盖副本。

## 使用

安装后，在支持 Skills 的工具中通过短命令调用，例如：

- Cursor / Codex / OpenCode：`/rdd`、`/do`、`/hld`、`/flow`、`/init` …
- 或在对话中明确要求使用某个 skill（名称与目录一致）

各 skill 默认 `disable-model-invocation: true`，需**显式调用**才会加载完整说明。

> 说明：`/init` 是独立 skill（生成项目上下文）；`/flow init` 是 `/flow` 的文档体系初始化模式，二者不同。

## 仓库结构

```
.agents/skills/
  do/SKILL.md
  rdd/SKILL.md
  hld/SKILL.md
  hld/reference.md
  init/SKILL.md
  flow/
    SKILL.md
    reference/init.md
    reference/plan.md
    reference/go.md
    reference/review.md
    reference/compound.md
    scripts/flow-check.mjs
```

## License

按仓库声明使用；贡献与 Issue 欢迎提交到 [OneForCheng/ai-workflow](https://github.com/OneForCheng/ai-workflow)。
