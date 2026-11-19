# Go 模式

前置：用户已回复「**确认方案，开始实现**」（G1 通过）。

本阶段只做：**实现 → 质量检查 → 回填事实 → 索引与偏差**。完成后**不输出 G2**，转入 `reference/review.md`（再至 Compound）。

## 步骤

### 0. 基线（实现前）

- 读门契约 `docs/standards/quality-gates.md`；未定义时用 `AGENTS.md` 的质量命令
- 跑一次 `fast` 门禁，把「通过 / 已知失败清单」写入 Plan §8「基线」
- 工作区不干净时先确认改动范围，避免把既有改动算进本轮
- 无 `fast` 档只能跑 `full` 时，记录耗时，作为「缺局部验证入口」的摩擦候选

### 1. 实现代码

- 只改 Plan §3 声明的文件；需扩大范围时先说明并征得同意，事后再追加到 Plan 偏差段
- 遵循项目既有编码规范与目录约定（以 `AGENTS.md` / 现有代码为准）
- **测试按项目规范与必要性决定，不强制 TDD**：
  - 项目已有测试约定，或改动涉及可测试的核心逻辑/边界条件 → 编写或更新测试
  - 纯文档、配置、一次性脚本等 → 不强行补测试
- 遇到未预见的技术限制或需求歧义 → 暂停并确认

### 2. 质量检查（基线 → 归因 → 修复或记账）

优先读 `docs/standards/quality-gates.md`：本轮迭代跑 `fast`，收尾跑 `full`；无契约时按 `AGENTS.md` 命令。顺序：类型检查 → format → lint → test。

1. **对比基线**（§0 已记录）：先判断失败是否由本轮引入
2. **归因**（三类不得混为一谈）：

   | 归因 | 判定依据 | 动作 |
   |------|----------|------|
   | 本轮引入 | 基线通过、现失败；或失败点与改动文件相关 | 修复，最多 3 次；仍失败则暂停确认 |
   | 既有 / 无关 | 基线与现态同样失败 | 记「工程摩擦」+ waiver，继续 |
   | 门禁本身错 | 基线就红、口径误伤（如单文件触发全仓覆盖率）、命令不可用 | waiver + 机检建议，交 Compound |

3. **waiver 显式化**：跳过任一门禁必须写 `门禁 | 原因 | 复检时点`；无 waiver 的跳过视为未验证
4. **禁止**为通过而关 coverage、删测试、放宽阈值；确需调整先征得用户同意

**工程摩擦须记账（供 Compound）**：质量命令出现下列任一情况时，**不得只在对话里绕过**——须在 §8 `工程摩擦（候选 Compound）` 写清现象、绕过方式与期望改进（即使本轮业务代码已验收通过）：

- 命令失败但与本轮改动无关（假失败 / 全局门槛误伤，如单文件测试撞全仓覆盖率）
- 为继续验收而降级命令（关 coverage、跳过某步、改用非官方脚本）
- `AGENTS.md` / 脚本缺少「局部验证」入口，导致只能跑全量或只能手写 vitest 参数
- 同一摩擦在本轮被踩第二次

> 记账 ≠ 本轮必须修工具链；是否落机检建议 / AGENTS / standard / 流程改进由 Compound 判定。

### 3. 回填事实（顺序固定）

#### 3.1 `docs/designs`（变更 → 最终态）

- 只改 Plan §6 声明的文件；文件不存在则按骨架新建
- 只写「**现在是什么**」：表结构、字段、约束、接口契约、模块关系
- **禁止**：变更历史、日期注释、「本次新增」、设计理由（理由 → `others/adr`；亦可留到 Compound 若属系统级决策）

#### 3.2 `docs/standards`（变更 → 仅当产生通用约定）

三条同时满足才写，否则不写（也可推迟到 Compound 再判一次，避免 Go 与 Compound 双写同一条）：

1. 与具体需求无关，未来其他模块也会遵守
2. 可被明确判定违反（MUST / MUST NOT 可验证）
3. 不是已有 standard 的重复

**与 Compound 共用口径**（细则见 `reference/compound.md` 洞察判定 / 落点优先级 0–1）：拿不准时可本阶段不写，留给 Compound；写前考虑 counterfactual 与可恢复性；**能用已有质量命令机检拦住的教训，优先记工程摩擦 / 留待 Compound 出机检建议，不要写成 prose standard**。

一次性决定 → 写 ADR（`others/adr`），不进 standards。

#### 3.3 `docs/features`（新增为主 + 旧 Feature 状态迁移）

**新增 Feature（本轮需求落点）**：

- `status` → `done`（部分完成则保持 `active` 并说明）
- 勾选验收标准，补「验收结果」
- 补全关联 Plans / Designs / 前置 Feature
- **冻结**：完成时执行 `node .agents/skills/flow/scripts/flow-check.mjs docs --freeze FEAT-00x`，把返回的 `frozen: <hash>` 写入 front-matter；此后正文不得再改（`status` / 关联 / 验收结果除外）
- 部分完成（仍 `active`）不写 `frozen`，待全部 AC 完成后再冻结

**旧 Feature（仅 status 与关联可动，正文冻结）**：

- `status` → `done`；「关联」追加一行 `后继 Feature：FEAT-00x`
- **禁止**改其目标、范围、业务规则、验收标准——需求变化已落到新 Feature
- 例外：Plan 已显式声明旧需求有问题且经 G0 确认 → 才可修改其正文，并在 Plan 偏差段说明

**quick 复用 Feature（`tier: quick`）**：

- 唯一允许的动作：在 `## 关联` 追加一行 `修补：PLAN-…`
- 不改 `status`、不勾选 AC、不改正文；需要改需求 → 回 standard 并新建 Feature

#### 3.4 `docs/others`（追加，按需）

仅在存在值得归档的决策（ADR）或发布记录时**新建文件**，不改写已有记录。  
（系统进化类洞察优先放到 Compound，避免 Go 阶段抢写。）

### 4. 同步索引

每个被新增/改动文档所在的目录，更新其 `README.md` 对应行的 `status` / `updated` / `文件`。

### 5. 追加 Plan 偏差段

在 Plan 文件**末尾追加**（不回改上文；模板见文末「Plan §8 模板」）。

### 6. 自检（Go 出口，非 G2）

- [ ] 索引与文件一致（无孤儿条目、无未登记文件）
- [ ] Plan §6 的回填项全部完成
- [ ] `node .agents/skills/flow/scripts/flow-check.mjs docs --trace` 通过（AC 全覆盖）
- [ ] 本轮新增/变更的 design 的 `anchors` 命中真实文件；`--map` 无本轮新增模块「未覆盖」
- [ ] 已确认的旧 Feature 正文未被改写（只有 `status` 与关联行变化）
- [ ] **Plan `status` → `done`**（未完成 / 多轮进行中则保持 `active`，并在 §8 写清遗留；§8 已写却仍是 `draft`/`active` 会被 `flow-check` 报 WARN，`--strict` 下为 error）
- [ ] 完成态 Feature 已写 `frozen`，且哈希匹配
- [ ] `designs` / `standards` 中无历史、日期注释、理由残留
- [ ] 未读历史 Plan 正文，未全量扫描 `docs/`
- [ ] 可选：`node .agents/skills/flow/scripts/flow-check.mjs docs`

### 7. 移交 Review

自检通过后：

1. 对话简短确认：「Go 完成，进入 Review」；先按 `review.md` 判定**高风险路径**（命中即强制 checklist），未命中再看 Review 计数（≤ 3 询问，> 3 强制）
2. **加载 `reference/review.md`** 并执行
3. **禁止**在此输出完整 G2 回溯表（G2 在 Compound 结束时输出，且**一律含需求回溯**）

## Plan §8 模板（Go 结束时追加）

写入 Plan 文末，不回改 §1–§7：

```markdown
## 8. 执行结果与偏差
- 完成：T1–T4
- 变更总结：<en one-liner>（type: feat）
- 偏差：<与方案的差异及原因；无则写「无」>
- 遗留：<未完成项 / 后续建议>
- 基线：<命令与结果 / 已知失败清单>
- 门禁：<fast/full 命令与结果>
- waiver：无 / <门禁 | 原因 | 复检时点>
- 工程摩擦（候选 Compound）：无 / <现象 → 绕过 → 期望改进；可多条>
- 本轮改动文件：
  - `path/a`
  - `docs/plans/PLAN-….md`
  - `docs/features/README.md`
- Review 计数：1（已排除 docs/**；口径见 review.md）
```

> **本轮改动文件**列全量路径；**Review 计数**排除 `docs/`（含索引）后供询问门禁使用。二者与 **工程摩擦** 一并供 Review / Compound 读集，避免后续阶段扫库或「对话里提过、Plan 里消失」。
>
> **变更总结**在实现完成后写，供 G2 直接复用（省一次总结）。Review 若有 P1 修复改动文件，G2 须按 `reference/summary.md` 重新生成，不得沿用旧候选。
>
> `变更总结` 只写 `<en one-liner>` 与 `type`；**MUST NOT** 写 `[用户名] #卡号 type: …` 完整 message——该行只由 `flow-commit.mjs` 生成。

## Design 骨架


```markdown
---
id: DES-db-order
title: 订单库表设计
doc_type: design
status: current
domain: db
scope: [order]
updated: 2026-01-14
---

# 订单库表设计（当前事实）

## 表：orders
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|

## 索引
| 名称 | 字段 | 类型 | 用途 |
|------|------|------|------|

## 关系
| 本表 | 关联 | 关系 |
|------|------|------|
```

`domain` 取 `db | api | arch | module | integration`，决定子目录（`designs/db/order.md`）。

## Standard 骨架

```markdown
---
id: STD-database
title: 建表规范
doc_type: standard
status: current
scope: [db]
updated: 2026-01-14
---

# 建表规范

## 适用范围

## 规则
- MUST ...
- SHOULD ...
- MUST NOT ...

## 反例 / 例外
```

## ADR 骨架（追加）

```markdown
---
id: ADR-001
title: 退款采用异步补偿而非分布式事务
doc_type: other
status: accepted
scope: [order, payment]
updated: 2026-01-14
---

# ADR-001 退款采用异步补偿而非分布式事务

## 背景
## 决策
## 备选方案与被否理由
## 影响
```
