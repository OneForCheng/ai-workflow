# init 模式：接入文档体系（flow）

目标：在目标项目建立 `docs/` 五目录 + 索引 + 根 `AGENTS.md` 宪法，并指向 **`/flow`** 闭环。
**只新增，不覆盖、不移动、不改写已有文件。幂等：已存在则跳过，仅补缺失项。**

## 步骤

1. **扫描项目**（只读）：README、构建配置、目录结构、已有 `docs/` 与 `AGENTS.md`、质量命令（typecheck / format / lint / test）
2. **输出摘要**（5 行内）：技术栈、文档现状、将创建的文件清单；等待用户确认
3. **创建目录与索引**：`docs/{features,plans,designs,standards,others}/README.md`（模板见下）
4. **写入根 `AGENTS.md`**：按下方宪法模板，项目信息按实填写，**≤ 90 行**（含 Review/Compound 一句说明）
4.5 **生成质量门契约（可选）**：按探测到的质量命令写 `docs/standards/quality-gates.md`（模板见下）；项目无任何检查命令则跳过，不编造
5. **存量迁移（如有）**：只输出「现有文档 → 建议目录」的对照表，由用户决定是否迁移；不自动移动
6. **自检**：`node .agents/skills/flow/scripts/flow-check.mjs`

## 索引模板（五个目录各一份，列按类型微调）

```markdown
# docs/features 索引

> 定位文档时先读本索引，再按 scope 打开命中的 1–2 篇；禁止全量扫描目录。

| ID | 标题 | scope | status | owner | updated | 文件 |
|----|------|-------|--------|-------|---------|------|
```

其余四份的表头：

| 目录 | 表头 |
|------|------|
| `plans` | `\| ID \| 标题 \| feature \| scope \| status \| created \| 文件 \|` |
| `designs` | `\| ID \| 主题 \| domain \| scope \| status \| updated \| 文件 \|` |
| `standards` | `\| ID \| 主题 \| scope \| status \| updated \| 文件 \|` |
| `others` | `\| ID \| 标题 \| 类型 \| scope \| status \| updated \| 文件 \|` |

`文件` 列须为 **markdown 链接**（`flow-check` 按 `](path)` 解析），路径相对该目录或相对 `docs/` 均可，例如 `[PLAN-20260114-order-refund.md](PLAN-20260114-order-refund.md)` 或 `[plans/PLAN-….md](plans/PLAN-….md)`。纯文本路径会被判定为「索引缺少文件链接」。

## 根 `AGENTS.md` 宪法模板

> 常驻上下文，必须精简。只放**规则**，流程细节留在 skill 的 `reference/` 中按需加载。

```markdown
# AGENTS.md — <项目名> AI 工作宪法

<一句话定位：项目是什么、技术栈>

## 文档即上下文（docs/）

| 目录 | 性质 | 写规则 | 用途 |
|------|------|--------|------|
| `docs/features` | 事实·需求 | 新需求**追加**（新 ID）；已确认的正文**冻结**，仅 status/关联可变更 | 开发起点 |
| `docs/plans` | 过程 | **追加**，一轮一文件，冻结不回改 | 方案与 Tasking |
| `docs/designs` | 事实·镜像 | **变更**，只留最终态 | Source of Truth |
| `docs/standards` | 事实·约束 | **变更**，只留最终态 | 架构/建表/API/命名/安全规范 |
| `docs/others` | 记录 | 默认追加 | ADR / Release / 测试用例 / `retro/` |

## 三条写规则

- **追加**：新建文件，不回改历史 → `plans`、`others`
- **变更**：就地更新为最终态，不保留历史与理由 → `designs`、`standards`
- **Feature 冻结**：已确认无问题的 Feature **不得就地更新**，新需求一律新建 `FEAT-<新序号>`；旧 Feature 仅可迁移 `status` 与关联。例外：能指出旧需求有问题且在本轮 Plan 显式声明

## 闭环（flow）

`Features → Plans(追加) → 代码 → Designs/Standards/Features(回填) → Review（默认 checklist） → Compound(系统进化) → 需求回溯 → 下一轮`

- 小改可用 `/flow quick`（复用 Feature、一次确认）；无人值守可用 `/flow run`（需 `approved`）
- 每 5 轮或信号触发时跑 `/retro`（记录在 `docs/others/retro/`，只出建议）
- Review 默认 `checklist`；高风险路径强制；未命中且计数 ≤ 3 时询问是否跳过（仅明确不需要才 skip）；> 3 强制
- 无论简繁，结束前必须做需求回溯（对照验收确认改动符合需求）
- Compound：有洞察才写（先资格门再五问）；机检建议 / skill 草稿只出在对话，写入或安装须用户同意

## 读写契约（省 token 的硬约束）

- 定位文档：先读该目录 `README.md` 索引，按 `scope` 只打开命中的 1–2 篇
- **禁止**：全量扫描或 grep `docs/`；读取已归档 `plans/` 正文；在 `designs`/`standards` 写变更历史或日期注释
- Review / Compound：只读当前 Plan、本轮改动文件清单与 §6 已回填文件，禁止为找灵感扫库
- 每篇文档必须有 front-matter：`id / title / doc_type / status / scope / updated`（plan 用 `created` + `feature`）
- design / standard 可用 `anchors` 声明代码落点（项目根相对路径或 glob，至少命中 1 个文件）；覆盖视图：`--map`
- Feature 完成时写 `frozen`（需求块哈希），防止正文被就地改写；`--freeze FEAT-00x` 可打印哈希

## 事实归属

| 事实 | 去处 |
|------|------|
| 表结构、字段、索引 | `docs/designs/db/*.md` |
| API 契约 | `docs/designs/api/*.md` |
| 模块边界、依赖 | `docs/designs/arch/*.md` |
| 通用约定（命名/建表/安全） | `docs/standards/*.md` |
| 决策理由、被否方案 | `docs/others/adr/*.md`（追加） |

## 质量门

- 契约：`docs/standards/quality-gates.md`（`fast` 用于迭代，`full` 用于收尾与 CI）
- 失败先归因：本轮引入 → 修；既有无关 → waiver；门禁本身错 → 改门禁
- 无契约时按项目既有质量命令执行，并在首次 Go 时补契约

## 命令

- `/flow` 自动判定状态；`/flow init` 初始化文档体系
- 文档校验：`node .agents/skills/flow/scripts/flow-check.mjs docs`
- 运行状态校验：`… docs --state`
- 信号摘要：`… docs --signals`；触发判断：`… docs --brief`
- 覆盖视图：`… --map`；AC 矩阵：`… --trace`；门契约：`… --gates`；自测：`--fixtures`
- 质量命令：`<typecheck / format / lint / test 实际命令>`

## 按需加载

- 文档驱动闭环：`.agents/skills/flow/SKILL.md`
- 高阶方案评审：`/hld`；轻量实现：`/do` / `/rdd`；项目上下文：`/init`
```

## 质量门契约模板（`docs/standards/quality-gates.md`）

````markdown
---
id: STD-quality-gates
title: 质量门契约
doc_type: standard
status: current
scope: [quality]
updated: <YYYY-MM-DD>
---

# 质量门契约

## 分层

| 层 | 含义 | 典型命令 |
|----|------|----------|
| term | 业务术语 | 术语表比对 / 人工 |
| req | 需求 | AC 可验证性检查 |
| code | 代码 | typecheck / lint / test |
| arch | 架构 | 分层与依赖规则（如 archunit） |
| func | 功能 | E2E / 浏览器验证 |
| doc | 文档 | flow-check |

## gates

```yaml
gates:
  - id: code-type
    layer: code
    fast: <局部类型检查命令>
    full: <全量类型检查命令>
    on_fail: fix
```
````

- `full` 必填；`fast` 可为 `none`（表示缺局部入口，会被记为工程摩擦候选）
- `on_fail`：`fix`（修复后继续）/ `park`（停放并继续队列）
- 项目不涉及的层直接删行，不留空层

## 运行状态（`.flow/`，首次 run 创建）

无人值守执行使用 `.flow/`，**默认与 `docs/` 同级**（工作区根）：

- 与 `docs/` 分离：`docs/` 回答「是什么」，`.flow/` 回答「做到哪」
- 定位优先级：`--flow-root` > `FLOW_ROOT` > `docs/` 同级 > 向上查找 > `git root` > cwd
- 结论层（`state.json`、`retro/`）可入 git；证据层（`runs/`、`signals.jsonl`）默认本地
- 父级不在 git 内时记 `tracked: false`，晨报与 retro 须标注证据不足

首次 `/flow run` 创建骨架，`.flow/.gitignore` 内容：

```
runs/
signals.jsonl
```

init 阶段只约定位置，**不创建** `.flow/`。

### 工作区多仓（可选）

若工作区根不在 git 仓内、且其下深度 1 有多个独立仓：

1. 探测：列出根下含 `.git`（目录或文件）的子目录，跳过 `node_modules` / `target` / `.m2repo`
2. **只打印**建议清单，不写入 `.flow/`；`flow-commit` 首次运行会惰性读取或按同一规则探测
3. 需要固定成员时，由用户创建 `.flow/repos.json`：

```json
{
  "schema": 1,
  "root": { "mode": "workspace", "tracked": false, "path": "." },
  "repos": [
    { "name": "backend", "path": "prm-psh-backend" },
    { "name": "frontend", "path": "prm-psh-frontend" }
  ],
  "unmanaged": ["docs"]
}
```

- `repos[].path` 必须是仓根（项目根相对路径）；`name` 唯一
- `unmanaged` 只提示、不参与提交（如无 git 载体的 `docs/`）
- 嵌套仓（根本身也是仓）以 `repos.json` 显式清单为准，不递归猜测

## 注意

- 宪法中的路径、命令必须来自实际项目，不得编造
- 项目不具备的维度（如无 DB）直接省略对应行，不留空章节
- 若项目已有 `AGENTS.md`：只**追加/建议**，不整体重写；改动前取得用户同意
- `anchors` 必须是项目根相对路径且命中真实文件，禁止绝对路径与 `..`
- `frozen` 只在 Feature 全部 AC 完成时写入；部分完成不冻结
