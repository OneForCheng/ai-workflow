# 收尾：变更总结与提交

前置：G2 各段已输出（standard / quick 收尾）；run 在晨报阶段。

目标：把本轮**实际改动**压缩成一句英文 commit 候选，并在用户确认后按 `flow-commit.mjs` 的 `[用户名] #卡号 type: 摘要` 格式提交。

## 1. 适用范围

| 模式 | 时机 | 是否询问提交 | 是否执行非 dry-run 脚本 |
|------|------|--------------|--------------------------|
| standard | G2 各段之后 | 是 | 用户确认后 |
| quick | 一行 G2 回溯之后 | 是 | 用户确认后 |
| run | 晨报「变更总结」 | 否（无人值守） | 否；任务提交已在 run §5 完成 |

## 2. 生成摘要（Agent 负责语义）

1. 读**实际改动**：`git status --short`；需要时 `git diff --stat`
   - run 用 `git log <base>..HEAD --oneline` + `git diff <base>...HEAD --stat`
2. 写一句英文、动词开头、概括行为变化，不逐列文件名
3. 按主导变化选 `type`：

| type | 何时 |
|------|------|
| `feat` | 新增或改变可感知能力（skill 行为、脚本、命令） |
| `fix` | 修复错误行为 |
| `refactor` | 不改变外部行为的重构 |
| `test` | 只改测试 |
| `chore` | 依赖、配置、工程维护 |
| `style` | 纯格式 |
| `docs` | 只改文档 / 注释 |
| `mock` | 临时 mock 数据 |

> 混合改动取**主导变化**；文档与脚本同时存在时通常取 `feat`。

4. **不得编造**：只写 diff 能支撑的内容；无实际改动时写「本轮无实际改动」，不生成候选。

### message 格式与推断

`[用户名] #卡号 type: 摘要`

| 字段 | 规则 |
|------|------|
| 用户名 | `git config user.name`；`--user` 覆盖 |
| 卡号 | `--card` 覆盖；否则当前用户最近 10 条提交中第一个 `#PP-123` / `#1234`；仍无则 `N/A` |
| type | 见上表 |
| 摘要 | 英文、动词开头、单行 |

实际组装与校验由 `scripts/flow-commit.mjs` 负责。目标项目若有不同的 commit 规范，需先调整脚本或改用手工提交，不要假设本格式自动兼容。

## 3. 预览 message

优先用 dry-run 让脚本推断用户名与卡号，避免手工算错：

```bash
node .agents/skills/flow/scripts/flow-commit.mjs \
  --dry-run --type <type> --summary "<en one-liner>"
```

用户已指定时追加 `--card PP-123` / `--user "xxx"`。脚本输出中的 `message:` 行即候选。

## 4. 输出模板（G2 最后一段）

```markdown
## 变更总结（commit 候选）
- 摘要：<en one-liner>
- message：`[用户名] #卡号 type: <en one-liner>`
- 范围：<n> 个文件（其中 docs <m> 个）
- 提交：需要我执行 commit 吗？回复「commit」即可；可带「卡号：PP-123」「用户名：xxx」
```

无实际改动时写「本轮无实际改动，无需提交」，并跳过询问。

## 5. 用户确认后

1. 解析回复：
   - 只说 `commit` → 全部自动推断
   - `commit 卡号：PP-123` → `--card PP-123`
   - `commit 用户名：xxx 卡号：PP-123` → `--user xxx --card PP-123`
2. 执行（去掉 `--dry-run`）：

   ```bash
   node .agents/skills/flow/scripts/flow-commit.mjs \
     --type <type> --summary "<en one-liner>" [--user …] [--card …]
   ```

3. 成功：回报 commit sha 与最终 message。失败：原样回报退出码与 stderr，**不盲目重试**。
4. 用户拒绝或未回复：回报「未提交，工作区保持原样」，流程结束。

## 6. run 的差异

- run 的逐任务 commit 在任务循环中已执行（见 `run.md` §5），使用同一脚本与 message 格式。
- 晨报「变更总结」给整轮候选，**不再调用非 dry-run 脚本**。
- 若 run 结束仍有未提交改动（park / 中断），候选只覆盖这些改动，并注明「部分改动未提交」。

## 7. 硬规则

- 总结必须来自实际 diff；禁止照抄 Plan 或对话里的计划
- 未确认前不提交（run 的任务提交仅由授权信封放行，不属此列）
- 不 push / merge / 改历史
- 提交失败不得删除、重置或 stash 本轮改动
- 执行前用 dry-run 展示文件数；发现无关改动混入时先停下确认
