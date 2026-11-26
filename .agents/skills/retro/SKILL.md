---
name: retro
description: >-
  Cross-round retrospective for the flow workflow: aggregate signals from .flow and
  docs, settle prior experiments, and produce at most three testable experiments plus
  upstream suggestions. Use when the user invokes /retro or asks how the workflow itself
  is performing across rounds.
disable-model-invocation: true
---

# 跨轮 retro（工作流自省）

**对象是工作流本身，不是项目事实。** 不改 `docs/` 事实文档、不改 skill、不评价个人。

## 与 Compound 的分工

| | Compound | `/retro` |
|---|---|---|
| 频率 | 每轮 | 每 5 轮或按信号 |
| 对象 | 项目 docs / AGENTS / 门禁 | 工作流、模板、检查项 |
| 输入 | 当前 Plan §8 | 跨轮聚合信号 |
| 产物 | 落点建议 | ≤3 条实验 + upstream 块 |

## 前置

- 定位仓库根：`docs/` 同级优先，其次 git root，最后 cwd
- 读 `AGENTS.md`（若有）与 `docs/*/README.md` 索引；**不读历史 Plan 正文**
- 聚合命令：`node .agents/skills/flow/scripts/flow-check.mjs docs --signals`（需要全部摩擦明细时加 `--detail`；无 `.flow` 会自动降级并标注）

## 五步

1. **定位**：仓库根、`docs/`、`.flow/`、上一次 `docs/others/retro/` 记录
2. **聚合**：跑 `--signals`（`--detail` 拿全量摩擦明细），得到轮次 / tier / Review / 摩擦 / waiver / park / decision / 未结实验
3. **结算**：逐条判定上一轮实验——`兑现` / `无效` / `证据不足`（无数据就写证据不足，不猜）
4. **产出**：≤3 条新实验，每条含假设、指标、窗口（≤5 轮）、回滚条件
5. **落档 + 交回**：写 `docs/others/retro/RETRO-<YYYYMMDD>.md` + 索引；对话输出 upstream 块

## 触发

| 方式 | 规则 |
|------|------|
| 手动 | `/retro` |
| 轮次 | 上次 RETRO 之后 ≥5 个 Plan |
| 信号 | P1 ≥3 / 工程摩擦 ≥3 / park ≥3 |
| 时间 | 不内置调度；需要时由宿主定时调用 `/retro` |

`flow-check --brief` 输出一行 `due: yes|no` 与计数，供 G2 或 CI 判断。

## 实验规则

- **可判定**：指标必须能由 `--signals`、门禁退出码或命令输出算出
- **一条实验一个指标**；不写「提升质量」这类不可测目标
- **窗口 ≤5 轮**；到期未结算的写「证据不足」，不续期
- **无数据不编**：`--signals` 显示 0 轮 / 0 摩擦时，直接说数据不足

## 记录格式

见 `reference.md`；front-matter `id: RETRO-001`、`doc_type: other`、`status: accepted`。

## 上游建议

- 只以可复制块输出（skill 路径 + 假设 + diff 要点 + 指标）
- **不直接修改** `.agents/skills/**`，不自动安装、不自动提交
- 建议落地仍走工作流仓库自己的 `/flow`

## 禁止

- 改项目事实文档（designs / standards / features）
- 改 skill 或 AGENTS
- 读会话记录、逐条复述历史 Plan
- 用「本轮顺利」凑洞察
- 为凑数生成实验
