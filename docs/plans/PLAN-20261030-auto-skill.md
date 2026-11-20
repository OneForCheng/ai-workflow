---
id: PLAN-20261030-auto-skill
title: auto 统一入口 skill 实现方案
doc_type: plan
status: done
feature: FEAT-001
scope: [skills, auto, routing]
created: 2026-10-30
---

# PLAN-20261030-auto-skill auto 统一入口 skill 实现方案

## 1. 需求理解

来源：FEAT-001 / 对话。提供 `/auto` 轻量路由器：场景意图识别 → 完全移交目标 skill；空输入时等待并展示菜单；现有 skill 仅补路由卡片以支持发现与未来扩展。

## 2. 现状与 Gap

| 能力项 | 现状 | 目标 | 改动类型 |
|--------|------|------|----------|
| 统一入口 | 用户须显式 `/do` `/rdd` 等 | `/auto` 意图路由后移交 | 新增 |
| 可发现路由信号 | 仅 README 场景表 + 各 skill 分散「边界」 | 每 skill 统一「路由卡片」 | 最小增补 |
| 未来新 skill | auto 若写死名单会过期 | 扫描 `.agents/skills/*/SKILL.md`（排除 `auto`） | 约定 |
| 文档入口 | README / AGENTS 无 `/auto` | 一览与结构树同步 | 变更 |

## 3. 方案

### 思路

采用 **「固定消歧阶梯 + 可发现路由卡片」**（轻量、无脚本）：

1. **`auto/SKILL.md`**：阶段 0 等待输入（类 rdd）+ 动态菜单；有输入则按阶梯/卡片匹配 → 唯一则移交，歧义则追问 → **Read 目标 SKILL.md 并声明此后只遵循该 skill**。
2. **各现有 skill**：文首原则区后增加同构 `## 路由卡片`（触发意图 / 不适用 / 与相近 skill 分界）；不改主流程。
3. **发现规则**：枚举 sibling 目录的 `SKILL.md`；读 front-matter 的 `name` + `## 路由卡片`（无卡片则仅用 `description`，匹配权重更低）。
4. **消歧阶梯**（内置于 auto，作默认优先级，卡片可加强但不可与硬规则矛盾）：
   - 只要 docs 事实闭环 / `/flow` 子命令 → `flow`
   - 只要评审向 HLD、明确不写码 → `hld`
   - 只要生成项目 AI 规则 / AGENTS 引导 → `init`（注意与 `flow init` 区分：后者仍属 `flow`）
   - 小改、意图清晰、要快速实现 → `do`
   - 要方案对比 / 完整交付 / 可选独立 Review → `rdd`
   - 仍歧义 → 列出 Top 候选请用户选

### 改动清单

- 新增：`.agents/skills/auto/SKILL.md` — 路由、菜单、移交硬规则（尽量短）
- 修改：`.agents/skills/{do,rdd,hld,init,flow}/SKILL.md` — 各增 `## 路由卡片`
- 修改：`README.md` — 场景表与一览加入 `/auto`
- 修改：`AGENTS.md` — 结构树与约定提及 `auto`

### 关键设计决策

- D1：意图识别用「阶梯 + 卡片」而非单独 catalog 文件 — 理由：auto 保持轻量；未来 skill 自带卡片即可被发现，免每轮改 auto 名单
- D2：移交 = Read 目标 `SKILL.md` 后完全跟随；auto 不双开编排 — 理由：闭环与门禁仍由目标 skill 负责
- D3：`disable-model-invocation: true` — 理由：与仓库其他 skill 一致，仅显式 `/auto` 触发
- D4：不新增 `auto/reference.md`（除非正文将超长）— 理由：用户要求足够轻量

## 4. Tasking

- [ ] T1 编写 `auto/SKILL.md`（等待输入、菜单、阶梯、发现、移交）
- [ ] T2 为 `do`/`rdd`/`hld`/`init`/`flow` 追加统一「路由卡片」
- [ ] T3 更新 `README.md`、`AGENTS.md`
- [ ] T4 `npx skills add . -l` 确认可发现 `auto`；可选 `flow-check`

## 5. 验收对照

| 验收标准 | 对应实现 | 状态 |
|----------|----------|------|
| AC-1 auto 可发现且轻量 | T1 | 待实现 |
| AC-2 空输入菜单+等待 | T1 阶段 0 | 待实现 |
| AC-3 路由并完全移交 | T1 移交段 + 阶梯 | 待实现 |
| AC-4 五 skill 路由卡片 + 可发现 | T2 | 待实现 |
| AC-5 README/AGENTS 同步 | T3 | 待实现 |

## 6. 影响的事实文档（Go 回填清单）

- designs：新增 `docs/designs/arch/skill-routing.md`（路由卡片约定 + auto 移交契约；domain=arch）
- standards：无（不做一次性通用规范文件；约定落在 design + 各 skill 卡片）
- features：本轮新建 `FEAT-001`；Go 结束将 status→`done` 并回填关联
- others：无

## 7. Review 策略

review: skip
<!-- 改动文件预计 >5，Go 结束后按复杂改动判定可询问是否升级 checklist -->

## 8. 执行结果与偏差

- 完成：T1–T4
- 偏差：Review P1 后改为各 skill `route.md`（不再把路由卡片写进 `SKILL.md`）；`auto` 菜单/匹配只读 `route.md`，移交后再读目标 `SKILL.md`
- 遗留：init 模板与 flow-check 链接格式对齐（见工程摩擦 / Compound）
- 验证：`npx skills add . -l` → Found 6 skills（含 auto）；`node .agents/skills/flow/scripts/flow-check.mjs docs` → PASS
- 工程摩擦（候选 Compound）：`flow-check` 要求索引「文件」列为 markdown 链接 `](path)`，而 `reference/init.md` 模板写的是纯路径文本，导致初检 WARN「索引缺少文件链接」→ 本轮索引改为链接以通过；期望 init 模板与 checker 对齐
- 本轮改动文件：
  - `.agents/skills/auto/SKILL.md`
  - `.agents/skills/auto/route.md`
  - `.agents/skills/do/SKILL.md`
  - `.agents/skills/do/route.md`
  - `.agents/skills/rdd/SKILL.md`
  - `.agents/skills/rdd/route.md`
  - `.agents/skills/hld/SKILL.md`
  - `.agents/skills/hld/route.md`
  - `.agents/skills/init/SKILL.md`
  - `.agents/skills/init/route.md`
  - `.agents/skills/flow/SKILL.md`
  - `.agents/skills/flow/route.md`
  - `README.md`
  - `AGENTS.md`
  - `docs/features/FEAT-001-auto-skill.md`
  - `docs/features/README.md`
  - `docs/plans/PLAN-20261030-auto-skill.md`
  - `docs/plans/README.md`
  - `docs/designs/arch/skill-routing.md`
  - `docs/designs/README.md`

## Review 结果

- 策略：checklist
- P1：已修复 — 路由卡片迁至各 skill `route.md`；`auto` 禁止为匹配加载完整 `SKILL.md`
- P2：init 模板与 flow-check 链接格式对齐（转入 Compound）

## Compound

- 洞察：有（工程摩擦 + Review P1）— ① 索引「文件」列须 markdown 链接，init 模板曾写纯路径；② 路由卡片不宜嵌在完整 SKILL.md
- 落点：
  - standards：无
  - adr：无
  - AGENTS：已写入 `route.md` 约定（Go/P1 阶段）
  - skill 草稿：无
  - 流程改进：已修正 `flow/reference/init.md` 索引文件列说明，与 `flow-check` 对齐；路由改为各 skill `route.md`
