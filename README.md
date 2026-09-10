# ai-workflow

跨工具可安装的 **Agent Skills** 工作流库（符合 [Agent Skills](https://agentskills.io) 开放标准）。

适用于 Cursor、OpenCode、Codex、Claude Code 等支持 Skills 的 Agent 工具。

## Skills 一览

| 命令 | 说明 |
|------|------|
| `/rdd` | 需求驱动：分析 → 方案 → 实现 → 验证 |
| `/do` | 简化版：分析 → 确认 → 实现 → 回溯 |
| `/rdd-review` | 在 `/rdd` 基础上增加独立 Code Review |
| `/hld` | 高阶方案设计（评审文档，不写代码） |
| `/spike` | 只读代码分析与方案 Spike |
| `/init-rules` | 为当前项目生成跨工具规则（`AGENTS.md` 等） |

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

- Cursor / Codex / OpenCode：`/rdd`、`/do`、`/hld` …
- 或在对话中明确要求使用某个 skill（名称与目录一致）

各 skill 默认 `disable-model-invocation: true`，需**显式调用**才会加载完整说明。

## 仓库结构

```
.agents/skills/
  rdd/SKILL.md
  do/SKILL.md
  rdd-review/SKILL.md
  hld/SKILL.md
  hld/reference.md
  spike/SKILL.md
  init-rules/SKILL.md
```

## License

按仓库声明使用；贡献与 Issue 欢迎提交到 [OneForCheng/ai-workflow](https://github.com/OneForCheng/ai-workflow)。
