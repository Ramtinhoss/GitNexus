# Proposal

## 问题定义

GitNexus CLI 在 neonspark 仓库重建索引时出现 10+ 分钟无响应的故障。根因排查揭示三类系统性问题：

1. **clean 命令误删配置**：`gitnexus clean` 直接 `rm -rf .gitnexus/`，连带删除 `sync-manifest.txt`。clean 后 rebuild 因缺失 scope 配置变成全仓库扫描，analyze 耗时远超预期（从 ~27min 增至无上限）。

2. **analyze 指导混乱**：gitnexus-cli SKILL.md 将 sync-manifest 托管路径和手动 CLI flag 路径混在同一表格中，未明确互斥关系。Agent 频繁混用 `--scope-prefix` / `--extensions` 与 auto-load 的 sync-manifest，触发 drift guard（默认 `ask` 策略）在非 TTY 环境下直接报错。

3. **重建异常缺乏恢复指导**：SKILL.md 未说明 analyze 崩溃/挂起后的恢复流程。实际故障中，LadybugDB WAL 未恢复 + CSV 残留（relations.csv 缺失）导致再次 analyze 卡在初始化阶段，用户无明确排查路径。

## 范围边界

**In Scope：**
- `gitnexus/src/cli/clean.ts` — 改为遍历删除索引文件，保留 `sync-manifest.txt`
- `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` — 重构 analyze 章节为 Path A/B 互斥路径，简化 flag 表格
- `SKILL.md` — 新增 Rebuild recovery 章节，列明常见损坏特征和恢复命令
- `SKILL.md` Troubleshooting — 补充 analyze hang/crash 的应对条目

**Out of Scope：**
- 修改 sync-manifest auto-load 逻辑（`resolveScopeManifestForAnalyze`）— 行为正确，无需改动
- 修改 LadybugDB WAL 恢复机制 — 属于底层存储问题，不在本次 CLI 层修复范围内
- 修改 tree-sitter 预处理超时逻辑 — worker pool 已有 30s sub-batch timeout

## Capabilities

### New Capabilities
- `clean-preserve-config`: gitnexus clean 保留 sync-manifest.txt 等配置文件，仅删除索引数据

### Modified Capabilities
- `cli-analyze-workflow-guidance`: 重构 gitnexus-cli SKILL.md analyze 章节，明确 sync-manifest 托管路径与手动 CLI flag 路径的互斥关系
- `cli-rebuild-recovery-guidance`: 在 gitnexus-cli SKILL.md 中增加重建异常恢复指导（损坏特征识别 + clean → rebuild 流程）

## Capabilities 待确认项

- [x] 能力清单已与用户确认（本次 change 源于已完成的现场排查和代码修改，capabilities 边界明确）

## Impact

| 受影响组件 | 影响类型 | 说明 |
|-----------|---------|------|
| `gitnexus/src/cli/clean.ts` | 行为变更 | 不再 `rm -rf` 整个 `.gitnexus/`，改为选择性删除 |
| `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` | 文档重写 | analyze 章节结构重构，增加 recovery 章节 |
| Agent 工作流 | 体验改善 | clean 后 rebuild 不再丢失 scope 配置；analyze 指导更清晰 |
| 向后兼容 | 保持 | clean 命令接口不变（`--force`, `--all`），仅内部实现变更 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - `spec_standard_ref`: `openspec/schemas/orbitos-change-v1/schema.yaml`
  - `project_page_ref`: `repo://agentic/GitNexus/AGENTS.md`, `repo://agentic/GitNexus/.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
  - `writeback_targets`: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
