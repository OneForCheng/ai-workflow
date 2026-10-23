# AGENTS.md — ai-workflow

跨工具可安装的 **Agent Skills** 工作流库（符合 [Agent Skills](https://agentskills.io) 开放标准），适用于 Cursor、OpenCode、Codex、Claude Code 等支持 Skills 的工具。

本仓库是 skill 的**源码库**，不含业务代码；`/flow` 与 `/flow-plus` 工作流面向**目标项目**的 `docs/` 体系（约定兼容；后者为含 Review/Compound 的实验通道）。

## 目录结构

```
.agents/skills/
  rdd/SKILL.md               # 需求驱动：分析 → 方案 → 实现 → 验证
  do/SKILL.md                # 轻量实现：分析 → 确认 → 实现 → 回溯
  rdd-review/SKILL.md        # rdd + 独立 Code Review
  hld/SKILL.md + reference.md# 高阶方案评审文档
  spike/SKILL.md             # 只读代码分析与方案对比
  init-rules/SKILL.md        # 生成项目上下文规则（AGENTS.md 等）
  flow/
    SKILL.md                 # 文档驱动闭环工作流（Plan / Go）
    reference/
      init.md                # 接入文档体系（脚手架 + 宪法模板）
      plan.md                # Plan 模式（需求确认 → 方案设计）
      go.md                  # Go 模式（实现 + 回填事实文档）
    scripts/flow-check.mjs   # 可选的文档一致性校验
  flow-plus/
    SKILL.md                 # 实验：Plan / Go / Review? / Compound
    reference/
      init.md                # 独立 init（docs 约定与 flow 兼容）
      plan.md
      go.md
      review.md              # 可选轻量 checklist
      compound.md            # 系统进化（含对话内 skill 草稿）
    scripts/flow-check.mjs   # 独立副本（约定兼容 flow）
```

## Skill 编写约定

- **一个目录一个 skill**：`SKILL.md` 必需，其余资源同目录存放
- **front-matter 必填** `name`（与目录同名）、`description`（英文，说明「做什么 + 何时用」）、`disable-model-invocation: true`
- **正文用中文**，技术名词保留英文；与仓库现有 skill 风格保持一致
- **渐进加载**：`SKILL.md` 只放路由、硬规则与门禁；长模板/流程细节放 `reference/*.md`，在需要时显式加载
- **不写重复内容**：同一规则只在一处定义，其他位置引用
- **幂等与最小改动**：新增 skill 不修改其他 skill 的行为；改动前确认用户意图
- 新增/重命名 skill 后，同步更新 `README.md` 的 skill 一览表与结构树

## 常用命令

```bash
npx skills add . -l            # 列出可发现的 skill（不安装）
npx skills add . -g -y         # 本地安装到全局（开发自测）
npx skills update -g           # 更新已安装的全局 skill
node .agents/skills/flow/scripts/flow-check.mjs <docsDir>        # /flow 校验 docs/
node .agents/skills/flow-plus/scripts/flow-check.mjs <docsDir>   # /flow-plus 校验 docs/
```

## 约束

- 本仓库无构建步骤、无脚本依赖：skill 内容必须是纯 Markdown 提示词；唯一的可选脚本是零依赖 Node ESM
- 不提交 `node_modules`、`.DS_Store`、编辑器私有配置（见 `.gitignore`）
- 修改 skill 后需确认 `npx skills add . -l` 仍能正确发现，且 `reference/`、`scripts/` 随目录一并安装到目标项目
