---
id: FEAT-001
title: auto 统一入口 skill
doc_type: feature
status: done
scope: [skills, auto, routing]
owner: BA
source: 对话
updated: 2026-11-20
frozen: 4cd0b5b558b7
---

# FEAT-001 auto 统一入口 skill

## 目标

新增轻量 **`auto` skill**：用户通过 `/auto …` 描述意图，由 skill 识别场景并**完全移交**到本仓库已安装的目标工作流 skill；无需显式指定 `/do`、`/rdd` 等。支持当前全部 skill，并兼容未来新增（靠各 skill 的路由卡片被发现）。

## 范围

- In Scope：
  - 新增 `.agents/skills/auto/SKILL.md`（足够轻量：路由 + 移交，不实现业务闭环）
  - 空输入 / 意图不清：类似 `/rdd` 第一步等待输入，并列出可选工作流菜单
  - 场景意图识别 + 歧义时追问；选定后 **Read 目标 `SKILL.md` 并严格跟随**，auto 不再编排
  - 现有 skill **最小改动**：各补统一「路由卡片」供 auto 发现与消歧
  - 同步 `README.md` / 本仓库 `AGENTS.md` 的 skill 一览与结构树
- Out of Scope：
  - 不改各 skill 主流程门禁与阶段逻辑（除路由卡片）
  - 不引入脚本/依赖；不做模型自动 invocation（保持 `disable-model-invocation: true`）
  - auto 不承接实现、不写业务 docs、不代替目标 skill 的确认门禁

## 业务规则 / 字段映射

| 输入 | 规则 | 输出 |
|------|------|------|
| `/auto` 无正文 / 寒暄 | 提示澄清 + 列出可选工作流菜单；等待 | 停留在 auto，不移交 |
| 意图唯一命中某 skill | 声明命中 skill → Read 其 `SKILL.md` → 完全移交 | 按目标 skill 闭环 |
| 多 skill 均可 | 列出候选与差异，请用户选定后再移交 | 选定前不移交 |
| 显式点名 skill（如「用 flow」） | 直接移交对应 skill | 跳过消歧 |
| 新安装且带路由卡片的 skill | auto 扫描 sibling skills 发现 | 可进入菜单与匹配 |

## 验收标准

- [x] AC-1：存在可安装的 `auto` skill（`npx skills add . -l` 可发现），正文轻量且仅负责路由与移交
- [x] AC-2：无输入或意图不清时，提示澄清并展示可选工作流菜单，不擅自进入某工作流
- [x] AC-3：意图明确时可路由到 `do` / `rdd` / `hld` / `flow` / `init`；移交后按目标 skill 执行，auto 不再插手
- [x] AC-4：现有 5 个 skill 均含统一「路由卡片」；auto 通过扫描发现（含未来新增）
- [x] AC-5：`README.md` 与 `AGENTS.md` 已收录 `/auto` 与结构更新

## 验收结果

全部 AC 已实现；`npx skills add . -l` 发现 6 个 skill（含 `auto`）。

## 关联

- 前置 Feature：无
- Plans：PLAN-20261030-auto-skill
- Designs：DES-arch-skill-routing
