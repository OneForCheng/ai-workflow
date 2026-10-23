# Go 模式

前置：用户已回复「**确认方案，开始实现**」（G1 通过）。

本阶段只做：**实现 → 质量检查 → 回填事实 → 索引与偏差**。完成后**不输出 G2**，转入 `reference/review.md`（再至 Compound）。

## 步骤

### 1. 实现代码

- 只改 Plan §3 声明的文件；需扩大范围时先说明并征得同意，事后再追加到 Plan 偏差段
- 遵循项目既有编码规范与目录约定（以 `AGENTS.md` / 现有代码为准）
- **测试按项目规范与必要性决定，不强制 TDD**：
  - 项目已有测试约定，或改动涉及可测试的核心逻辑/边界条件 → 编写或更新测试
  - 纯文档、配置、一次性脚本等 → 不强行补测试
- 遇到未预见的技术限制或需求歧义 → 暂停并确认

### 2. 质量检查

按项目实际配置执行（命令来自 `AGENTS.md` / 构建配置）：类型检查 → format → lint → test。
失败即修复重跑，不跳过、不静默忽略。

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

一次性决定 → 写 ADR（`others/adr`），不进 standards。

#### 3.3 `docs/features`（新增为主 + 旧 Feature 状态迁移）

**新增 Feature（本轮需求落点）**：

- `status` → `done`（部分完成则保持 `active` 并说明）
- 勾选验收标准，补「验收结果」
- 补全关联 Plans / Designs / 前置 Feature

**旧 Feature（仅 status 与关联可动，正文冻结）**：

- `status` → `done`；「关联」追加一行 `后继 Feature：FEAT-00x`
- **禁止**改其目标、范围、业务规则、验收标准——需求变化已落到新 Feature
- 例外：Plan 已显式声明旧需求有问题且经 G0 确认 → 才可修改其正文，并在 Plan 偏差段说明

#### 3.4 `docs/others`（追加，按需）

仅在存在值得归档的决策（ADR）或发布记录时**新建文件**，不改写已有记录。  
（系统进化类洞察优先放到 Compound，避免 Go 阶段抢写。）

### 4. 同步索引

每个被新增/改动文档所在的目录，更新其 `README.md` 对应行的 `status` / `updated` / `文件`。

### 5. 追加 Plan 偏差段

在 Plan 文件**末尾追加**（不回改上文；对应骨架 §8）：

```markdown
## 8. 执行结果与偏差
- 完成：T1–T4
- 偏差：<与方案的差异及原因；无则写「无」>
- 遗留：<未完成项 / 后续建议>
- 验证：<执行的命令与结果>
- 本轮改动文件：
  - `path/a`
  - `path/b`
```

> **本轮改动文件**列表供 Review / Compound 读集使用，避免后续阶段扫库。

### 6. 自检（Go 出口，非 G2）

- [ ] 索引与文件一致（无孤儿条目、无未登记文件）
- [ ] Plan §6 的回填项全部完成
- [ ] 已确认的旧 Feature 正文未被改写（只有 `status` 与关联行变化）
- [ ] `designs` / `standards` 中无历史、日期注释、理由残留
- [ ] 未读历史 Plan 正文，未全量扫描 `docs/`
- [ ] 可选：`node .agents/skills/flow-plus/scripts/flow-check.mjs`

### 7. 移交 Review

自检通过后：

1. 对话简短确认：「Go 完成，进入 Review（策略：skip|checklist）」
2. **加载 `reference/review.md`** 并执行
3. **禁止**在此输出完整 G2 回溯表（G2 在 Compound 结束时输出）

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
