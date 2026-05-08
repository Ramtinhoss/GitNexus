# Writeback

## 回写摘要

本次 change 修复了 GitNexus CLI `clean` 命令误删 `sync-manifest.txt` 的问题，并重构了 `gitnexus-cli` SKILL.md 的 analyze 工作流指导。

- **Change 目标**：修复 clean 误删配置导致的 rebuild 超时；消除 analyze 指导中的路径混淆；增加重建异常恢复指导
- **Change 结果**：代码已修改（`clean.ts`），文档已更新（`SKILL.md`），编译与测试通过，neonspark 现场验证成功

## Capability / Spec 增量摘要

### New Capabilities
- `clean-preserve-config`：`gitnexus clean` 保留 `sync-manifest.txt`，仅删除索引数据

### Modified Capabilities
- `cli-analyze-workflow-guidance`：SKILL.md analyze 章节拆分为 Path A（sync-manifest 托管）和 Path B（手动 CLI flag）两条互斥路径
- `cli-rebuild-recovery-guidance`：SKILL.md 增加重建异常恢复指导（损坏特征识别 + clean→rebuild 流程）

### Spec 文件变更
- `specs/clean-preserve-config/spec.md` — 新增
- `specs/cli-analyze-workflow-guidance/spec.md` — 新增
- `specs/cli-rebuild-recovery-guidance/spec.md` — 新增

## 验证结论与证据入口

- 验证报告：`verification.md`
- 编译验证：`npx tsc --noEmit` 无错误
- 单元测试：`npm run test -- --run` → 81 files, 1699 tests passed
- 现场验证：neonspark 仓库手动清理损坏索引后，`gitnexus analyze --force` 成功完成（7773 files, 102660 nodes, 517059 edges）

## 回写目标与执行结果

| 回写目标 | 字段映射 | 执行结果 | 说明 |
|---------|---------|---------|------|
| `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` | analyze 章节重构 + clean 章节更新 + Rebuild recovery 新增 + Troubleshooting 更新 | ✅ 已直接修改 | 文件已在任务 2.2.x / 2.3.x 中完成修改 |
| `AGENTS.md` | 无字段映射需求 | ⏭️ 跳过 | 本次不涉及 AGENTS.md 核心规则变更，仅 skill 文件内容更新 |

## 回写前置条件

- [x] verification.md 已完成
- [x] 编译与测试通过
- [x] 现场验证成功
- [x] SKILL.md 已直接修改（无需额外同步操作）

## 不回写的内容

- `gitnexus/src/cli/clean.ts` 代码变更 — 代码文件不是页面回写目标，变更已通过 git commit 进入版本管理
- `specs/` 中的 spec 文件 — 这些是本 change 的规范真源，不是对外回写内容
- `design.md` / `tasks.md` / `verification.md` — 内部 change 管理文件，不对外回写
