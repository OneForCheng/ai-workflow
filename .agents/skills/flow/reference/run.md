# run 模式（无人值守执行）

前置：Plan 已通过 **G1**（front-matter 有 `approved`）；`.flow/` 可定位；门禁基线可跑。

run 不等于「夜间跑」：它指**在授权信封内、不逐步等确认地执行整份 Plan**。后台 job、排队、定时任务只是触发姿势的不同。

## 边界

| 做 | 不做 |
|----|------|
| 按 Plan §4 顺序执行任务 | 不做 Review / Compound（交回 `/flow`） |
| 在信封内改代码、跑门禁、逐任务 commit（规范 message） | 不 push / merge / 改发布配置 |
| 遇歧义按策略决策并记录 | 不做跨 Plan 排队 |
| 失败任务 park、不阻塞后续 | 不改 Feature / Plan 正文 |
| 写账本、信号、晨报 | 不安装**未声明**的依赖 |

## 1. 定位 `.flow/`

优先级：

1. `--flow-root <path>`
2. 环境变量 `FLOW_ROOT`
3. **`docs/` 同级**（`dirname(docsDir)/.flow`，默认）
4. 从 cwd 向上查找 `.flow/`
5. `git rev-parse --show-toplevel` 下创建
6. `cwd/.flow`

- **默认与 `docs/` 同级**（工作区根），不放在 `docs/` 里面
- `repo` 模式：`.flow/` 位于单个 git 仓库内
- `workspace` 模式：`.flow/` 位于工作区根、其下含多个仓库；账本每个任务记录 `repo`
- `tracked`：`.flow/` 在 git worktree 内且未被忽略 → `true`；父级不在 git 内 → `false`，晨报首行标注「历史不入库」

分层：

```
.flow/
  state.json       结论层，可入库
  retro/           结论层，可入库（P2）
  runs/            证据层，默认本地
  signals.jsonl    证据层，默认本地
  .gitignore       runs/ 与 signals.jsonl
```

解析结果写入 `state.root`；下次进入若解析结果不一致，**提示**而不是静默改写。

## 2. pre-flight（任一失败即不启动）

| # | 检查 | 失败动作 |
|---|------|----------|
| 1 | Plan `status` ∈ draft/active 且 `approved` 非空 | 停，提示先完成 G1 |
| 2 | `covers` 非空，或矩阵覆盖 Feature 全部 AC | 停，回 P2 补矩阵 |
| 3 | 工作区干净，或已在专用分支 | 停，避免混入既有改动 |
| 4 | 门禁基线已跑并记录（见 `reference/go.md` §0） | 先跑基线再启动 |
| 5 | 信封已填：`auth` / `window` / `budget` / `stop` | 停，向用户索取 |
| 6 | `.flow/` 可写 | 停 |
| 7 | 无未处理的 CRITICAL park | 停，先清理 |

通过后：建分支 `flow/run-<YYYYMMDD-HHmm>`（用户指定则用之）→ 建 `runs/RUN-<...>.md` 与 `state.json`（`status: running`）→ 写 `run_start` 信号。

## 3. 授权信封

| 级别 | 允许 | 默认 |
|------|------|------|
| A0 | 只读分析，不改文件 | |
| A1 | 只改 Plan §3 声明的文件 | ✅ |
| A2 | A1 + 同目录新增测试/文件 | |
| A3 | A2 + 配置/CI + **Plan 已声明**的依赖安装 | |
| A4 | 未声明的依赖、迁移、密钥、发布、权限 | 一律拒绝 |

- 依赖以 **Plan §3 改动清单**为准；未声明即 A4 → park，不追认
- 越界即停：写 `scope_violation` 信号后 park，不继续
- 每次改动前后核对文件集；格式化/import 产生的附带改动同样计入

## 4. 决策等待窗口（W）

| W | 行为 |
|---|------|
| `0` | 立即按策略决策，标 `auto` |
| `N` | 写决策请求并等待 N 分钟；超时按默认执行，标 `auto` |
| `∞` | 遇决策点即 park |

策略优先级：**最小改动 > 复用既有模式 > 可逆优先 > 不确定则 park**。

决策记录（账本「决策」表）：

| # | 任务 | 问题 | 选项 | 选择 | 依据 | 可否决 |
|---|------|------|------|------|------|--------|

> 宿主没有续跑能力（普通对话）时，`W>0` 退化为 `0`，并在晨报首行注明「无续跑宿主，等待窗口未生效」。不假装等待。

## 5. 任务循环

按依赖顺序取任务（无依赖按矩阵顺序）：

1. **上下文包**：Task 卡 + 对应 AC + 相关 design 片段 + anchors；不继承上一任务的对话
2. 在信封内实现
3. 跑 `fast` 门禁；失败按 `reference/go.md` §2 归因；本轮引入最多修 2 次
4. 门禁通过 → commit：`node .agents/skills/flow/scripts/flow-commit.mjs --type <type> --summary "<T3 英文动作>"`
   - message 形如 `[用户名] #卡号 type: …`；`type` 按任务主导性质取（默认 `feat`）
   - 脚本负责用户名 / 卡号推断与 `git add -A`；失败按退出码处理，不盲目重试
   - 退出码 2（无改动）：账本 commit 记 `-`，任务照常 `done`；1 / 3：按失败处理并记录证据
5. 账本追加：状态 / 门禁 / commit / 耗时
6. 写 signal：`task_done` / `task_parked` / `gate_fail` / `scope_violation`
7. 检查预算与停止条件

> **信封授权 vs 用户确认**：这里的逐任务 commit 由授权信封（A1–A3）放行，不属于收尾「用户确认后提交」；但 message 仍须符合 `reference/summary.md` 与 `flow-commit.mjs` 的格式。收尾只出整轮候选，不再追加提交。

停止条件（任一满足即停并出晨报）：预算耗尽、连续失败 ≥ K、park 比例超阈值、连续 2 个任务无 commit、触发 A4 或红线。

## 6. park 协议

| 原因 | 含义 |
|------|------|
| `missing-info` | 缺需求 / 接口字段 |
| `gate-fail` | 修复次数用尽仍失败 |
| `scope` | 需要改 Plan 外文件 |
| `permission` | 需要 A4 |
| `conflict` | 与既有代码或分支冲突 |
| `envelope` | 需要超出当前授权 |

每条必填：**复现命令 / 已尝试 / 失败原因 / 建议下一步 / 影响文件**。

- 不阻塞无关任务；依赖它的任务标 `blocked-by: Tn` 并跳过
- park 时记录该任务的未提交改动；后续任务 commit 前先还原或 stash，禁止让 `git add -A` 把失败任务的残留带入下一次提交
- 晨报按「需人决策」排序，放在最上面

## 7. 账本与状态

`state.json`：

```json
{
  "schema": 1,
  "root": { "path": ".", "mode": "repo", "tracked": true },
  "status": "running",
  "next": "none",
  "currentRun": "RUN-20261116-1530",
  "updated": "2026-11-16T15:30:00+08:00"
}
```

- `status`：`idle | running | paused | done`
- `next`：`none | review | compound | plan`
- `lastDryRun`：最近一次 dry-run 的账本 id（可选；不影响状态分支）

run 账本 front-matter：`run` / `plan` / `status` / `approved` / `auth` / `window` / `budget` / `branch`。
正文：任务表（`任务 | 状态 | 门禁 | 证据`）、决策表、park 明细、预算使用。

`signals.jsonl` 一行一事件：`{ts, run, event, task?, detail?}`；`event` ∈ `run_start | task_done | task_parked | gate_fail | decision_auto | scope_violation | run_end`。

- `state.json` 原子写（临时文件 + rename）；账本只追加
- **续跑**：读 state → 当前账本 → 跳过 `done` / `parked` → 从第一个可执行任务继续；上下文从 Plan 重建，不从对话继承
- 校验：`node .agents/skills/flow/scripts/flow-check.mjs docs --state`

## 8. 晨报

```markdown
## RUN-YYYYMMDD-HHmm 晨报
- 结果：完成 x / 停放 y / 跳过 z；用时 …；预算 …
- 需你决策：auto 决策 n 条（可否决）…
- 风险：超出声明的 diff / waiver / 依赖变更 …
- 交付：分支 …，commit …
- 变更总结：<英文 one-liner>；建议 message：`[用户名] #卡号 type: …`（由账本任务表汇总，不自动追加提交）
- 下一步：/flow（进入 Review）｜修复 <park> 后 /flow run --resume
```

## 9. 红线（任何情况都不做）

1. push / force-push / 合并主分支 / 删除分支
2. 安装**未声明**的依赖；改迁移、密钥、发布与权限
3. 改 Plan 正文、Feature 正文、已冻结文档
4. 关 coverage、删测试、放宽门禁阈值
5. 把密钥、token、PII 写进账本或日志
6. 连续失败仍无限重试
7. 超出授权级别继续执行
8. 无人值守时执行 Review / Compound
9. 修改 `.flow/` 之外的状态文件（缓存、锁文件除外）

## 10. 退出与交回

| 结束方式 | `status` | `next` | 动作 |
|----------|----------|--------|------|
| 全部完成 | `done` | `review` | 晨报 + 提示 `/flow` |
| 预算 / 停止条件 | `paused` | `review` | 晨报 + 建议 `--resume` |
| 用户中断 | `paused` | `none` | 晨报 |
| CRITICAL | `paused` | `review` | 晨报置顶 |

run 结束**不输出 G2**；Review → Compound → G2 由 `/flow` 继续（见 `reference/review.md`）。晨报的「变更总结」只出整轮候选，最终提交由用户确认后执行。

## 11. `--dry-run`（只读排演）

用途：在**零写入**前提下验证 Plan 是否可执行。最佳时机是 **G1 之前**（Plan 仍是 draft），这样发现的任务缺口能直接回 P2 修，不触发「Plan 已冻结」。

- 语义：`mode: dry`；允许 `approved` 为空
- **不写运行状态**：不改 `state.status` / `next` / `currentRun`；只写 `state.lastDryRun` 与 `runs/RUN-DRY-*.md`。dry-run 不属于 run 生命周期，`/flow` 不应因它分支
- pre-flight 放宽第 1、3 项：Plan 可为 `draft`；工作区可脏（提示即可，不阻断）
- 不建分支、不改代码、不 commit、不跑会写盘的命令；只读检查（类型检查 / 静态分析）可跑
- 每任务产出：
  - **落点核对**：Plan 声明的文件 / 符号是否存在
  - **依赖核对**：前置任务是否可满足
  - **歧义清单**：缺什么信息会卡住（对应 park 原因 `missing-info`）
  - **预估**：改动文件数、验证命令、token / 时长量级
  - **状态**：`analyzed` / `dry-parked`
- 产出：可行性报告（对话）+ 账本 + 晨报；账本 front-matter 写 `mode: dry`
- 账本 `next: plan`（有缺口回 P2；无缺口可进 G1）；该字段只供人读，不驱动 `/flow`
- 结束后 `state.lastDryRun = RUN-…`，`status` / `next` 保持原值

不验证：真实改动、门禁失败归因、commit、续跑。dry-run 通过 ≠ 实现可行，只代表「任务描述足以开工」。
