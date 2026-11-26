---
id: DES-arch-flow-contracts
title: 流程契约（证据与判定）
doc_type: design
status: current
domain: arch
scope: [workflow, docs, quality-gates, review]
anchors: [.agents/skills/flow/**]
updated: 2026-11-20
---

# 流程契约（证据与判定）

## 定位

`/flow` 的证据层：把「结论必须可被验证」落成可机检的契约。事实文档（Features / Designs / Standards）描述**是什么**；本契约描述**如何证明**。

| 契约 | 载体 | 机检入口 |
|------|------|----------|
| 文档锚点 | design/standard 的 `anchors` | `--map` |
| 任务拆分 | Plan §4 三件套 | `--trace` |
| 质量门 | `docs/standards/quality-gates.md` | `--gates` |
| Feature 冻结 | feature 的 `frozen` | 结构校验 |
| Review 触发 | 高风险路径表 | 人工 + 计数 |

## 文档锚点（anchors）

- 只对 `design` / `standard` 生效；值为**项目根相对**路径或 glob
- `*` 段内、`**` 跨目录、`?` 单字符；指向目录时等价于 `目录/**`
- 每个锚点必须至少命中 1 个真实文件，否则报 ERROR；绝对路径与 `..` 越界同样报错
- `--map` 按目录汇总「代码文件数 / 覆盖文档 / 未覆盖」，用于发现没有任何 design 覆盖的模块

## Tasking 三件套

| 件 | 作用 | 规则 |
|----|------|------|
| 覆盖矩阵 | 证明没漏 | 每条 AC 一行；每行有 Task 与验证方式；支持 `AC-1…AC-3` 区间写法，由 checker 展开；未实现的 AC 状态写「后续」并豁免 |
| Task 卡片 | 证明可执行 | 动作 / 落点 / DoD / 验证 / 依赖 / 预算 / 风险 / AC |
| 遗漏清单 | 证明想过边界 | 8 项固定：调用方、配置、迁移、契约、权限、错误路径、可观测性、测试与回填 |

粒度「一坐原则」：一个 Task 在一个上下文窗口内完成、只用一个验证命令、改动 ≤3–5 个文件。

## 重量分档（tier）

| tier | 适用 | Plan 要求 | Review |
|------|------|-----------|--------|
| `standard`（默认） | 常规需求 | 覆盖矩阵 + `covers` 声明本轮 AC | 风险/计数判定 |
| `quick` | 修补、文案、样式、小优化（语义优先，≤5 文件辅助） | 必要章节的 Plan（§1–§5 + §8）；矩阵可省、`covers` 可空 | 与 standard 相同 |

- quick 复用现有 Feature：不改正文；Go 仅允许 `## 关联` 追加一行；改 AC/范围/业务规则则升 standard
- 复用定位只走「用户点名 / `features/README` 按 scope / 上个 Plan 关联」，最多 2 篇
- `tier` 只影响 Plan 形状，**不影响 Review 判定**；`frozen` 哈希不含关联，追加安全

## 质量门契约与失败归因

契约文件 `docs/standards/quality-gates.md`，`gates` 列表字段：`id` / `layer`（term·req·code·arch·func·doc）/ `fast` / `full` / `on_fail`（fix·park）。

- Go 迭代跑 `fast`，收尾与 CI 跑 `full`；`fast: none` 表示缺局部入口
- 归因三分：**本轮引入**（修，最多 3 次）/ **既有无关**（waiver 后继续）/ **门禁本身错**（改门禁 + 机检建议）
- waiver 必须写「门禁 | 原因 | 复检时点」；无 waiver 的跳过视为未验证

## Feature 冻结

- 全部 AC 完成时，由 Go 执行 `--freeze FEAT-00x`，把返回的 `frozen: <hash>` 写入 front-matter
- 哈希覆盖 `目标 / 范围 / 业务规则 / 验收标准` 四节；`status`、`关联`、`验收结果` 不计入，允许后续变更
- 部分完成（`active`）不冻结；哈希不匹配即报错，确需变更须重跑 `--freeze` 并在 Plan 声明

## Review 触发

先风险、后数量：

| 情形 | 行为 |
|------|------|
| 命中高风险路径（清单见 `.agents/skills/flow/reference/review.md`） | 强制 checklist，不询问 |
| 未命中且非 docs 改动 > 3 个文件 | 强制 checklist |
| 未命中且 ≤ 3 个文件 | 询问；仅明确不需要才 skip |

## 收尾总结与提交契约

| 项 | 契约 |
|----|------|
| 时机 | G2 最后一段（standard / quick）；run 在晨报 |
| 摘要来源 | 优先 Plan §8 `变更总结`（Go 事后事实）；缺失 / Review 有 P1 修复 / 文件集不一致时按实际 diff 生成；禁止照抄 P2 方案 |
| message | `[用户名] #卡号 type: 摘要`；type 白名单与卡号推断见 flow skill 的 `reference/summary.md` / `scripts/flow-commit.mjs` |
| 署名 | 用户名 / 卡号 MUST 来自 `flow-commit --dry-run` / `--check-message`；脚本不可用写 `<由脚本推断>`；禁止 `owner` / 邮箱前缀旁证 |
| 仓解析 | `--repo` > cwd 所在仓 > `.flow/repos.json` > 深度 1 探测 > exit 4（无载体） |
| 多仓提交 | 非 dry-run 且 >1 脏仓必须 `--all-repos` / `--repo`，否则 exit 5；逐仓 add + commit；失败即停，exit 3 |
| 脚本 | `scripts/flow-commit.mjs`：`--dry-run` / `--repo` / `--all-repos` / `--check-message`；`--self-test` 自测；exit 0/1/2/3/4/5 |
| run 差异 | 逐任务 commit 由授权信封放行，使用同一脚本与 message 格式；晨报只给整轮候选，不追加提交 |
| 禁止 | 未确认提交（run 信封除外）；多仓静默批量提交；push / merge / 改历史；提交失败后重置改动 |

## checker 子命令

| 子命令 | 作用 | 是否影响退出码 |
|--------|------|----------------|
| 无参数 | 结构校验（五目录、front-matter、ID、索引双向、冻结哈希、Plan §8/status 与 Feature AC/status/frozen 漂移 WARN） | 是 |
| `--map` | 目录覆盖视图 | 否（仅展示） |
| `--strict` | 把可判定的 WARN 升级为 error（Plan §8/status 漂移、Feature AC/status/frozen 漂移） | 是 |
| `--trace` | Plan 覆盖矩阵校验 + 手填用户名 WARN | 是 |
| `--gates` | 质量门契约结构校验 | 是 |
| `--state` | `.flow/` 状态、账本、成员仓清单校验 | 是 |
| `--signals` | 跨轮信号摘要（轮次 / tier / Review / 摩擦明细 + 摩擦主题与 `friction_repeat`；`--detail` 时输出全部摩擦明细） | 否（仅展示） |
| `--detail` | 配合 `--signals` 输出全部摩擦明细（隐含 `--signals`；每条 80 字） | 否（仅展示） |
| `--brief` | 一行 due 判定（含 `friction_repeat`） | 否（仅展示） |
| `--freeze <ID>` | 打印 Feature 需求块哈希（只读） | 否 |
| `--fixtures` | 运行全部自测样本（`expect` 可声明 `flags: trace/gates/map/state/signals/detail/brief/strict`；消息片段支持 `{docsDir}` 占位） | 是（全过才 0） |

- **组合输出**：`--signals --brief` 同时输出信号摘要与 brief 行（顺序 signals → brief）；`--signals --detail` 输出全部摩擦明细（每条 80 字），默认最多 5 条（实际条数见标题；每条 80 字）；`--detail` 隐含 `--signals`；单用 `--brief` 仅一行
- **Plan 漂移**：Plan 的 `## 8. 执行结果与偏差`（兼容无编号写法）去 HTML 注释、标题与表格分隔行后仍有正文，而 `status` 仍为 `draft`/`active` → WARN；`--strict` 升级为 error。确需保持 `active`（未完成 / 多轮）时应在 §8 注明遗留
- **Feature 漂移**：全部 AC 已勾但 `status` 仍为 `draft`/`active`、`status=done` 但有未勾 AC、或 `status=done` 缺 `frozen` → WARN；`--strict` 升级为 error
- **摩擦主题**：先剥离反引号代码段，再按固定词表（`env` / `ui` / `gate` / `build` / `test` / `lint` / `db` / `ci` / `tooling` / `docs`，`other` 兜底）归类「现象」部分（首个 `｜`/`|` 之前）；`flyway` 归 `db`、`nvm` 与权限类（含 CI 权限）归 `env`；`friction_repeat` = 窗口内出现在 ≥2 个 Plan 的 topic 数（同 Plan 去重）。`friction` 总数仍按字段值是否非「无」判定（与既有口径一致；字段值为「无」时忽略其下列表项），waiver 与 Review 判定不变
- 所有子命令只读，不修改文件。
