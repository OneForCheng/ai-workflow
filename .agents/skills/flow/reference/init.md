# init 模式：接入文档体系（flow）

目标：在目标项目建立 `docs/` 五目录 + 索引 + 根 `AGENTS.md` 宪法，并指向 **`/flow`** 闭环。
**只新增，不覆盖、不移动、不改写已有文件。幂等：已存在则跳过，仅补缺失项。**

## 步骤

1. **扫描项目**（只读）：README、构建配置、目录结构、已有 `docs/` 与 `AGENTS.md`、质量命令（typecheck / format / lint / test）
2. **输出摘要**（5 行内）：技术栈、文档现状、将创建的文件清单；等待用户确认
3. **创建目录与索引**：`docs/{features,plans,designs,standards,others}/README.md`（模板见下）
4. **写入根 `AGENTS.md`**：按下方宪法模板，项目信息按实填写，**≤ 90 行**（含 Review/Compound 一句说明）
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

`文件` 列写相对 `docs/` 的路径（如 `plans/PLAN-20260114-order-refund.md`）。

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
| `docs/others` | 记录 | 默认追加 | ADR / Release / 测试用例 |

## 三条写规则

- **追加**：新建文件，不回改历史 → `plans`、`others`
- **变更**：就地更新为最终态，不保留历史与理由 → `designs`、`standards`
- **Feature 冻结**：已确认无问题的 Feature **不得就地更新**，新需求一律新建 `FEAT-<新序号>`；旧 Feature 仅可迁移 `status` 与关联。例外：能指出旧需求有问题且在本轮 Plan 显式声明

## 闭环（flow）

`Features → Plans(追加) → 代码 → Designs/Standards/Features(回填) → Review?(可选) → Compound(系统进化) → 需求回溯 → 下一轮`

- Review 默认 `skip`；复杂改动时询问是否改为 checklist；亦可在 Plan 中预先声明
- 无论简繁，结束前必须做需求回溯（对照验收确认改动符合需求）
- Compound：有洞察才写；skill 草稿只出在对话，不自动安装

## 读写契约（省 token 的硬约束）

- 定位文档：先读该目录 `README.md` 索引，按 `scope` 只打开命中的 1–2 篇
- **禁止**：全量扫描或 grep `docs/`；读取已归档 `plans/` 正文；在 `designs`/`standards` 写变更历史或日期注释
- Review / Compound：只读当前 Plan、本轮改动文件清单与 §6 已回填文件，禁止为找灵感扫库
- 每篇文档必须有 front-matter：`id / title / doc_type / status / scope / updated`（plan 用 `created` + `feature`）

## 事实归属

| 事实 | 去处 |
|------|------|
| 表结构、字段、索引 | `docs/designs/db/*.md` |
| API 契约 | `docs/designs/api/*.md` |
| 模块边界、依赖 | `docs/designs/arch/*.md` |
| 通用约定（命名/建表/安全） | `docs/standards/*.md` |
| 决策理由、被否方案 | `docs/others/adr/*.md`（追加） |

## 命令

- `/flow` 自动判定状态；`/flow init` 初始化文档体系
- 文档校验：`node .agents/skills/flow/scripts/flow-check.mjs`
- 质量命令：`<typecheck / format / lint / test 实际命令>`

## 按需加载

- 文档驱动闭环：`.agents/skills/flow/SKILL.md`
- 高阶方案评审：`/hld`；轻量实现：`/do` / `/rdd`；项目上下文：`/init`
```

## 注意

- 宪法中的路径、命令必须来自实际项目，不得编造
- 项目不具备的维度（如无 DB）直接省略对应行，不留空章节
- 若项目已有 `AGENTS.md`：只**追加/建议**，不整体重写；改动前取得用户同意
