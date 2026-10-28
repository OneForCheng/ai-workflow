---
name: flow
description: >-
  Document-driven closed-loop workflow (Plan / Go / optional Review / Compound):
  feature specs → append-only plans → code → mutate designs/standards to final
  state while confirmed features stay frozen; optional lightweight review and
  system-evolution compounding. Use when the user invokes /flow or wants
  document-centric delivery with docs/ as the AI context and constraint system.
disable-model-invocation: true
---

# 文档驱动闭环工作流（Plan / Go / Review / Compound）

用 `docs/` 五目录充当 AI 的上下文与约束系统：**过程方案追加（只增不改），事实方案变更（只留最终态）**；Go 之后可选轻量 Review，再按需 Compound（系统进化），一轮结束后回到起点。

## 使用边界

| 命令 | 职责 |
|------|------|
| `/hld` | 上游：高阶方案评审，不改代码 |
| `/spike` | 上游：只读代码分析与方案对比 |
| **`/flow`** | **文档驱动闭环**：Plan → Go → Review? → Compound → 需求回溯 |
| `/rdd` `/do` | 轻量实现流：不维护 `docs/` 体系 |

需要长期维护的文档体系时用本工作流；只想快速改一处代码用 `/do`；需要方案对比与可选独立审查但不维护 docs 用 `/rdd`。

## 文档体系（宪法）

| 目录 | 性质 | 写规则 | 命名 |
|------|------|--------|------|
| `docs/features` | 事实·需求 | 新需求**追加**（新 ID）；已确认的正文**冻结**，仅 `status`/关联可变更 | `FEAT-001-order-refund.md` |
| `docs/plans` | 过程 | **追加**（一轮一文件，冻结不回改） | `PLAN-20260114-order-refund.md` |
| `docs/designs` | 事实·镜像 | **变更**（只留最终态） | `db/order.md`、`api/order-api.md` |
| `docs/standards` | 事实·约束 | **变更**（只留最终态） | `api.md`、`database.md` |
| `docs/others` | 记录 | 默认**追加** | `adr/ADR-001-*.md`、`releases/v1.2.0.md` |

每个目录含一个 `README.md` 索引。**定位文档 = 读索引 → 按 `scope` 打开命中的 1–2 篇**。

## 闭环与门禁

```
起点 Features(读) → [追加]Plans → 代码 + 必要测试 → [变更]Designs/Standards/Features
                         → Review?(可选) → Compound(有洞察才写) → G2 需求回溯
                                                                                                                  │
                                                              ┌──────── 下一轮从更新后的事实出发 ─────────────┘
```

> Feature 默认**只增不改**：已确认的 Feature 正文是冻结事实，本轮需求变化一律落到新 Feature；只有在能指出旧需求本身有问题时，才允许改旧 Feature 正文（见全局硬规则 2.1）。

> Plan 段内部再分两阶段：**P1 需求确认**（止于 G0）→ **P2 方案设计**（止于 G1）。

| 门禁 | 时机 | 通过条件 |
|------|------|----------|
| **G0** | Plan·P1 结束 | 需求理解已确认（若主张旧 Feature 有问题，须在此点明具体问题）；零待确认项且来源结构完整时可直接进 P2。此前禁止写 `docs/` 与改代码 |
| **G1** | Plan·P2 结束 | 用户回复「确认方案，开始实现」；此前禁止任何代码改动 |
| **G1.5** | Review（若启用） | checklist 已输出；P1 须先修复或征得用户接受后再进 Compound。最终策略为 `skip` 时本门禁直接通过 |
| **G2** | Compound 结束 | 质量检查已通过 + 索引同步 + Compound 已处理（或声明无洞察）+ **需求回溯表已输出**（无论改动简繁，一律对照验收/需求确认符合性） |

## 复杂改动判定（Review 询问）

满足**任一**即视为复杂改动（Go 结束后用于是否升级 Review）：

- 多模块 / 跨层
- 涉及数据模型或持久化
- 涉及权限 / 安全 / 资金类
- 方案阶段有多方案抉择，或实现相对方案有重要偏差
- **本轮改动文件数 > 5**

## front-matter（必填字段）

```yaml
---
id: FEAT-001                 # 全局唯一
title: 订单退款
doc_type: feature            # standard | feature | plan | design | other
status: active
scope: [order, payment]      # 模块标签，用于按需检索
updated: 2026-01-14
---
```

- 公共必填：`id` `title` `doc_type` `status`
- 类型专属：`feature`/`design`/`standard`/`other` 另需 `updated`；`plan` 用 `created` 取代 `updated`，另需 `feature`；`design` 另需 `domain`
- `status` 取值：feature `draft|active|done|deprecated`；plan `draft|active|done|abandoned`；design/standard `draft|current|deprecated`；other（ADR）`proposed|accepted|superseded|rejected`
- ID 规则：`FEAT-<3位序号>`、`PLAN-<YYYYMMDD>-<slug>`（ID 即文件名）、`DES-<domain>-<subject>`、`STD-<topic>`、`ADR-<3位序号>`

## 读集契约（省 token 的硬约束）

| 模式 | 允许读 | 禁止 |
|------|--------|------|
| Plan·P1 需求确认 | `AGENTS.md`、当前 Feature（或 `features/README.md`）、`designs/README.md` 索引、必要代码入口 | 读 `designs`/`standards` 正文；读历史 Plan 正文；读无关 Feature/Design |
| Plan·P2 方案设计 | P1 已读内容 + `designs/README.md`/`standards/README.md` 命中的 0–3 篇正文、`plans/README.md` | 读历史 Plan 正文；读无关 Feature/Design |
| Go | 当前 Plan、Plan 声明的改动文件、待回填的 Design/Standard/Feature | 重新通读全量 `docs/` |
| Review | 当前 Plan、本轮改动文件清单（或 git diff 范围）、已回填的 §6 文件（仅当 checklist 需要核对契约时） | 重扫 `docs/`；读历史 Plan；启动多 agent |
| Compound | 当前 Plan（含偏差段）、Review 结论（若有）、本轮已改动的事实文档路径列表 | 为「找灵感」全量扫描 `docs/` 或代码库 |

**反模式（任何模式都禁止）**：全量扫描或 grep `docs/`；把变更历史、日期注释写进 designs/standards；为一次性决定新增 standard；在已确认的 Feature 上就地追加/改写需求（应新建 Feature）；回改已冻结的 Plan 正文（偏差 / Review / Compound 只追加到文末）。

## 阶段 0：状态判定（`/flow` 无参数）

1. 无 `docs/` 或五目录/索引不全 → 进入 **init**，加载 `reference/init.md`
2. `docs/plans/README.md` 中存在 `status: draft|active` 的 Plan → 询问是否续做 → 进入 **Go**（续做后仍走 Review → Compound → G2）
3. 其余 → 索取需求（描述 / Feature ID / 文件 / 工单） → 进入 **Plan·P1**

## Plan 模式（两阶段：需求确认 → 方案设计，零代码改动）

**加载 `reference/plan.md`。** 要点：

- **P1 需求确认（零写入，止于 G0）**：只读需求侧最小集 → 输出「需求理解 / 影响范围 / 待确认项」→ 有疑点则**停止**等待确认；零待确认项且来源结构完整时直接进入 P2
- **P2 方案设计（止于 G1）**：补读 designs/standards 命中文件 + `plans/README.md` 查重 → 现状与 Gap → 多方案时先给对比、选定后再落档 → **默认新建 Feature** → 新建 Plan（含 **Review 策略**，默认 `skip`）并追加索引 → 输出摘要后**停止**

## Go 模式（实现 + 回填事实）

**加载 `reference/go.md`。** 顺序固定：

1. 按 Plan 实现代码；**测试按项目规范与必要性决定，不强制 TDD**
2. 执行项目质量命令，失败即修复重跑
3. 回填 designs → standards（仅通用约定）→ features → others（按需）
4. 同步索引；Plan 文末追加 `## 执行结果与偏差`（含 `工程摩擦（候选 Compound）` 与本轮改动文件列表）
5. 自检；可选 `node .agents/skills/flow/scripts/flow-check.mjs`
6. **不输出 G2** → 进入 Review

## Review 模式（可选·轻量）

**加载 `reference/review.md`。**

- Plan 声明 `review: skip`（**默认**）且**非**复杂改动 → 直接进入 Compound
- Plan 声明 `checklist`，或判定为复杂改动后用户同意加强审查 → 固定 ≤4 条视角单轮输出；P1 须处理后再进 Compound
- 复杂改动且 Plan 仍为 `skip` 时：**主动询问**是否改为 checklist（详见 `reference/review.md`）

## Compound 模式（系统进化）

**加载 `reference/compound.md`。**

- **先扫** Go §8 `工程摩擦（候选 Compound）` / `验证` / `遗留`：有记账则不得判「无洞察」
- 无洞察 → 一行声明后输出 **G2** 需求回溯
- 有洞察 → 按落点优先级落档或**仅对话**给出 skill 草稿（不自动安装）；每轮默认最多改动 1–2 处系统产物 → **G2**

> **G2 需求回溯一律执行**：无论改动多简单，都必须对照 Plan/Feature 验收标准输出回溯表，确认改动符合已确认需求。

## 全局硬规则

1. **G0 之前不写 `docs/`、G1 之前不改代码**；不确定处主动提问
2. **追加 / 变更不可混用**：Plans 只增不改，Designs/Standards 只留最终态
   1. **Feature 冻结**：用户已确认无问题的 Feature，**不得在原有基础上更新**，一律新建 `FEAT-<新序号>`；旧 Feature 仅可改 `status`（→ `done`）与关联字段。例外：能指出旧需求本身有问题时，可在本轮 Plan 显式声明该问题点，经 G0 确认后修改其正文
3. **事实归属唯一**：表结构→`designs/db`，接口→`designs/api`，通用约定→`standards`，决策理由→`others/adr`
4. **代码与测试是最终事实**：与 Designs 不一致时，以代码为准并立即回填 Designs
5. **最小变更**：只改 Plan 声明的范围；扩大范围先征得同意并追加到偏差段
6. **Review 默认可选、Compound 禁止空转**：无洞察时不得为凑流程改 `docs/` 或 `AGENTS.md`；**但** Go 已记账的工程摩擦 / 验证绕过 **必须**进入 Compound（至少 Plan「流程改进」，常建议 AGENTS 补丁）——只写流程改进不算空转，也不得写成「无系统级沉淀」
7. **Skill 草稿不落库**：可安装 skill 草稿只出现在对话中，由用户决定是否写入项目或全局 skill 目录
8. **需求回溯不可跳过**：G2 必须输出对照验收/需求的回溯表
9. 语言与用户一致；本工作流产出的 docs 是正式产物，但不额外生成总结/报告类文件（回溯表在对话输出即可）
