# Proposal

## 问题定义

经过对 4 个近期已归档 spec 的代码验证，发现以下系统性偏差：

1. **真源文档行号漂移**：`docs/unity-runtime-process-source-of-truth.md` 中引用的代码行号（pipeline.ts、local-backend.ts、process-evidence.ts、unity-config.ts 等）因持续迭代已全面偏移，且 `schema.ts` 路径已变更。此外 `unity-config.ts` 新增了 3 个配置项（`paritySeedCacheIdleMs`、`paritySeedCacheMaxEntries`、`parityCacheMaxEntries`）未记录。

2. **Rule-Lab skill 残留**：`remove-rule-lab` spec 归档后，以下 skill 和 contract 文件仍引用已移除的 `rule-lab` CLI 命令和模块：
   - `gitnexus-unity-rule-gen/SKILL.md`：核心流程依赖 5 个已删除的 CLI 子命令
   - `gitnexus-unity-e2e-verify/SKILL.md`：Phase 1 规则创建依赖 `rule-lab compile`
   - `_shared/unity-rule-authoring-contract.md`：核心流程 `rule-lab compile` 已不可用
   - `gitnexus-guide/SKILL.md`：skill 表格引用 `gitnexus-unity-rule-gen`

3. **配置文档过时**：`docs/gitnexus-config-files.md` 仍描述已移除的 `sync-manifest.txt` 机制、rule-lab 相关状态文件（catalog.json、approved/*.yaml、compiled/*.v2.json、lab/runs/**、reports/*.md），且缺少 `csharpDefineCsproj` 持久化字段的说明。

4. **clean 命令未实现 spec**：`clean-preserve-config` spec（2026-05-08）描述 `clean` 应保留配置文件，但 `clean.ts` 仍为 `fs.rm(storagePath, { recursive: true })`。因 sync-manifest 已移除，保留范围调整为 `meta.json`（含持久化 analyzeOptions）。

## 范围边界

**In scope:**

- `docs/unity-runtime-process-source-of-truth.md`：行号校准 + 3 个新配置项补充 + schema.ts 路径修正
- `docs/gitnexus-config-files.md`：移除 rule-lab/sync-manifest 全部条目，补充 csharpDefineCsproj
- 删除 `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- 删除 `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md`
- 删除 `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
- `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`：移除 rule-gen 引用行
- `AGENTS.md`：移除 rule-lab skill 条目、移除 MCP rule_lab_* 工具引用
- `gitnexus/src/cli/clean.ts`：改为选择性删除，保留 `meta.json`

**Out of scope:**

- 不修改 pipeline / MCP query/context / runtime-chain-verify 等核心逻辑
- 不新增功能或能力
- 不修改真源文档的架构语义（Phase 顺序、合约字段含义不变，仅校准行号和参数表）
- 不重建索引或执行运行时验证

## Capabilities

### New Capabilities

（本次为文档校准 + 代码微调，无新增能力）

### Modified Capabilities

- `truth-source-line-calibration`: 校准 `docs/unity-runtime-process-source-of-truth.md` 中全部代码行号引用、schema.ts 路径、unity-config 新参数
- `config-docs-cleanup`: 清理 `docs/gitnexus-config-files.md` 中已退役的 rule-lab/sync-manifest 条目，补充 csharpDefineCsproj 字段
- `rule-lab-skill-retirement`: 删除 3 个完全依赖已移除 rule-lab 功能的 skill 文件和 1 个 shared contract
- `clean-preserve-meta`: `gitnexus clean --force` 改为选择性删除 `.gitnexus/` 内容，保留 `meta.json`

## Capabilities 待确认项

- [x] 能力清单已与用户确认

## Impact

| 受影响文件 | 影响类型 | 说明 |
|-----------|---------|------|
| `docs/unity-runtime-process-source-of-truth.md` | 文档修正 | 行号校准 + 参数补充，语义不变 |
| `docs/gitnexus-config-files.md` | 文档清理 | 移除 ~40 行过时内容，新增 ~5 行 |
| 3 个 skill + 1 个 contract | 文件删除 | Rule-lab 功能已移除，skill 不可用 |
| `gitnexus-guide/SKILL.md` | 1 行移除 | skill 表格清理 |
| `AGENTS.md` | 条目移除 | skill 表格 + tool 引用清理 |
| `gitnexus/src/cli/clean.ts` | 行为变更 | 从整目录删除改为保留 meta.json |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 真理源文档：`docs/unity-runtime-process-source-of-truth.md`
  - 配置文档：`docs/gitnexus-config-files.md`
  - Agent 指引：`AGENTS.md`
  - Skill 文件：`.agents/skills/gitnexus/` 下 4 个文件
  - CLI 源码：`gitnexus/src/cli/clean.ts`
