# Review 模式（默认 checklist·轻量）

前置：Go 已完成实现、质量检查、事实回填、索引同步与 Plan 偏差段追加。

目标：用**固定短清单**做一轮可扫描的自检，拦住明显问题后再 Compound。不为「深度审查」堆上下文。

## 策略判定

按下列顺序判定：**先风险、后数量**。

1. **风险触发**：本轮改动命中下表任一路径/关键词 → 直接 checklist；不询问，不受 Review 计数与 Plan §7 `skip` 影响
2. **数量兜底**：未命中风险时，读 Plan §7（仅意图）+ 计算 Review 计数
3. **计数 > 3** → 直接 checklist（不问；忽略 §7 的 `skip`）
4. **计数 ≤ 3** → 停止并询问；仅用户**明确表示不需要 Review** 才 `skip`

### 高风险路径（任一命中即强制 checklist）

| 类别 | 命中信号（路径 / 关键词） |
|------|---------------------------|
| 鉴权与权限 | `auth` `acl` `permission` `rbac` `tenant` `session` `token` `登录` |
| 资金与交易 | `payment` `billing` `refund` `order` `invoice` `金额` `对账` |
| 数据与迁移 | `migration` `schema` `sql` `prisma` `alembic` `数据修复` |
| 对外契约 | `api/` `openapi` `proto` `public` `sdk` `兼容` |
| 配置与密钥 | `env` `secret` `config` `deploy` `ci` `workflow` |
| 并发与一致性 | `lock` `queue` `retry` `idempot` `transaction` `事务` `幂等` |

> 这是**默认集**：项目可在 `docs/standards/quality-gates.md` 或 `AGENTS.md` 追加信号，但不得删减默认项。

### Review 计数口径

- **计入**：本轮改动的代码 / 配置 / 非 `docs/` 产物等
- **不计入**：`docs/` 下任意文件（含 features/plans/designs/standards/others 正文与各目录 `README.md` 索引）
- rename / 删除：按变更后的路径是否落在 `docs/` 决定是否计入；仅格式化且路径在 `docs/` 内 → 不计入

### 判定表

| 情况 | 行为 |
|------|------|
| 命中高风险路径 | 强制 checklist（不问，忽略 §7 的 `skip`） |
| 未命中且计数 **> 3** | 强制 checklist（不问） |
| 未命中且计数 **≤ 3** | **停止并询问**（见下）；仅明确表示不需要才 `skip` |

> 文件数只决定「要不要问」，不决定「要不要审」——3 个文件也可能改到支付与鉴权。  
> Plan `tier` **不改变**本判定：`quick` 同样默认 checklist，仅用户明确不需要才 skip。

### 小改动时的询问（Review 计数 ≤ 3）

```
Go 已完成。本轮未命中高风险路径，且 Review 计数 ≤ 3（已排除 docs/ 与索引）。

是否跳过 Review？
- 回复「跳过 Review」/「不需要 Review」：直接进入 Compound（仍须在收尾做需求回溯）
- 其他回复或不明确：执行轻量四视角审查（checklist）
```

用户也可随时主动要求 checklist，不受计数限制。

**禁止**：把非明确拒绝当成 skip（如「随便」「继续」、无关回复）→ 一律 checklist；启动多 agent；通读全库；重新打开无关 Feature / 历史 Plan；把 Review 写成大段散文。

## 读集（硬约束）

**允许**：

1. 当前 Plan（§3 改动清单、§5 验收、§7/§8）
2. 本轮实际改动的文件路径列表（来自偏差段或已知编辑集；可用 `git diff` / `git status` **仅限本轮范围**）
3. 仅当某条 checklist 需要核对契约时，打开 Plan §6 中**已回填**的那 0–2 个 design/standard 文件

**禁止**：全量扫描或 grep `docs/`；读未在本轮改动的大文件全文「碰运气」。

## Checklist（固定 4 条，勿增删）

对每条给出：`通过` / `风险` / `不适用`，风险须附**具体文件或符号**与一句理由。

| # | 视角 | 问什么 |
|---|------|--------|
| R1 | 正确性 | 是否覆盖 Plan §5 验收；偏差是否已声明 |
| R2 | 边界与失败 | 空值、权限、幂等、错误路径是否遗漏明显坑 |
| R3 | 安全 | 注入、密钥/PII 落日志、越权；无则标不适用 |
| R4 | 可维护 | 是否超出 Plan 范围的无关重构；命名/分层是否与项目既有模式冲突 |

## 产出格式（对话，单轮）

```
## Review（checklist）

| ID | 结果 | 说明 |
|----|------|------|
| R1 | 通过 / 风险 / 不适用 | … |
| R2 | … | … |
| R3 | … | … |
| R4 | … | … |

### P1（须处理）
- [ ] …  或写「无」

### P2（可选）
- [ ] …  或写「无」
```

## G1.5 交互

- 存在 **P1** → **停止**：先修复代码（必要时回补 designs）并更新 Plan §8 偏差，或请用户明确「接受风险，继续 Compound」
- 无 P1 → 将下列摘要**追加**到 Plan 文末（不回改上文），然后加载 `reference/compound.md`：

```markdown
## Review 结果
- 策略：checklist
- P1：无 / <已修复或已接受的摘要>
- P2：无 / <留作后续>
```

`skip`（未命中高风险路径且用户明确不需要 Review）时追加：

```markdown
## Review 结果
- 策略：skip
- 说明：未命中高风险路径，Review 计数 ≤ 3，且用户明确不需要 Review
```
