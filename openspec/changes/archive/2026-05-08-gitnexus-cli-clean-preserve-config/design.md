# Design

## Context

本次 change 源于 neonspark 仓库现场故障：`gitnexus analyze --force` 在重建索引时 10+ 分钟无响应。根因排查发现：

1. 上一次 analyze 在 CSV streaming 阶段崩溃，留下残缺的 `.gitnexus/csv/`（无 `relations.csv`）和未恢复的 LadybugDB WAL。
2. 再次运行 analyze 时，LadybugDB 初始化卡在 WAL 恢复阶段。
3. 用户执行 `gitnexus clean` 试图恢复，但 clean 直接 `rm -rf .gitnexus/`，连带删除了 `sync-manifest.txt`。
4. clean 后 rebuild 失去了 scope 配置，变成全仓库扫描，耗时远超预期。

本次 change 修复 clean 命令的删除逻辑，并同步重构 gitnexus-cli SKILL.md 的 analyze 指导以避免类似混淆。

## Goals / Non-Goals

**Goals:**
- `clean` 命令删除索引数据时保留 `sync-manifest.txt`（spec: `clean-preserve-config`）
- SKILL.md analyze 章节拆分为 Path A（sync-manifest 托管）和 Path B（手动 CLI flag）两条互斥路径（spec: `cli-analyze-workflow-guidance`）
- SKILL.md 增加重建异常恢复指导，列明损坏特征和 `clean --force` → `analyze --force` 恢复流程（spec: `cli-rebuild-recovery-guidance`）

**Non-Goals:**
- 不修改 sync-manifest auto-load 逻辑（`resolveScopeManifestForAnalyze` 行为已正确）
- 不修改 LadybugDB WAL 恢复机制（属于底层存储问题，超出 CLI 层范围）
- 不新增 CLI flag 或改变现有 flag 语义
- 不修改 worker pool timeout 或 tree-sitter 超时逻辑

## Decisions

### Decision 1: Selective deletion instead of `rm -rf`

**Context**: `clean.ts` 原本使用 `fs.rm(storagePath, { recursive: true })` 删除整个 `.gitnexus/` 目录。`sync-manifest.txt` 作为配置文件被混放在同一目录下，因此被误删。

**Decision**: 改为 `cleanStoragePath()` 遍历 `.gitnexus/` 下所有条目，逐个 `fs.rm(..., { recursive: true })`，但跳过 `PRESERVE_FILES` 集合中的条目。

**Rationale**:
- 最小侵入：不改变 CLI 接口，不改变目录结构
- 可扩展：`PRESERVE_FILES` 是 Set，未来可添加其他配置文件（如 `.gitnexusignore`）
- `--all` 模式同样适用：对每个仓库的 storagePath 调用 `cleanStoragePath()`

**Trade-offs**:
- 失去原子性：原先 `rm -rf` 是一次原子操作；现在逐个删除，中断时可能留下部分文件。但 clean 操作本身是幂等的（可重新执行），且 `--force` 已跳过确认，中断风险极低。

### Decision 2: Path A / Path B structure in SKILL.md

**Context**: 原 SKILL.md 将所有 analyze flag 放在同一张表格，并在备注中分别提及 sync-manifest 和 Unity 手动 flag。Agent 频繁同时传 `--extensions` + auto-load manifest，触发 drift guard。

**Decision**: 将 analyze 章节重构为：
1. 精简的通用 flag 表格（仅 `--force`, `--embeddings`, `--skills`）
2. Path A: sync-manifest managed — 大标题、示例命令、manifest 语法说明、drift guard 说明
3. Path B: manual CLI flags — 大标题、示例命令、专用 flag 表格
4. 显式 "Do not mix Path A and Path B" 警告

**Rationale**:
- 互斥路径比可选 flag 更符合心智模型：要么托管配置（manifest），要么显式传参
- 将 `--csharp-define-csproj` 降级为补充说明，避免与核心 workflow 混淆

### Decision 3: Corruption signatures in recovery guidance

**Context**: 用户无法判断 analyze 是"正常慢"还是"卡死了"。

**Decision**: 在 SKILL.md 中列出三个可检查的损坏特征：
- `csv/` 存在但 `relations.csv` 缺失 → crash mid-streaming
- `lbug.wal` 存在但 `lbug` 仅几 KB → LadybugDB unrecovered
- 卡在 "Loading into LadybugDB..." 阶段 → 很可能 WAL 恢复死锁

**Rationale**: 给出具体、可操作的诊断标准，避免 agent 盲目等待。

## Risks / Migration

| Risk | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 用户依赖 clean 删除整个 `.gitnexus/` 的行为（包括 sync-manifest） | 低 | 中 | clean 行为变更在 release note 中明确标注；sync-manifest 可从 git history 恢复 |
| Agent 仍然混用 Path A 和 Path B（SKILL.md 重构后） | 中 | 低 | drift guard 仍在，混用会报错；重构后警告更醒目 |
| 未来新增配置文件未加入 `PRESERVE_FILES` | 中 | 低 | `PRESERVE_FILES` 集中定义，添加新文件只需修改一处 |
| 选择性删除遍历大量文件时性能下降 | 极低 | 低 | `.gitnexus/` 下文件数量有限（通常 < 100 个），遍历开销可忽略 |

**Migration**: 无外部迁移成本。CLI 接口不变，现有脚本无需修改。唯一行为差异是 clean 后 `sync-manifest.txt` 保留。
