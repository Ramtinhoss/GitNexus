# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 capability `clean-preserve-config` 的实现范围：修改 `gitnexus/src/cli/clean.ts`，不改变 CLI 接口
- [x] 1.2 确认 capability `cli-analyze-workflow-guidance` 的实现范围：重写 `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` analyze 章节
- [x] 1.3 确认 capability `cli-rebuild-recovery-guidance` 的实现范围：在 SKILL.md 中新增 Rebuild recovery 和 Troubleshooting 条目
- [x] 1.4 确认前置条件：代码已可编译，`npm run test -- --run` 基线通过

## 2. 核心实现任务

### 2.1 clean-preserve-config

- [x] 2.1.1 在 `clean.ts` 中引入 `PRESERVE_FILES` Set，初始包含 `sync-manifest.txt`
- [x] 2.1.2 实现 `cleanStoragePath()` 函数：遍历 `.gitnexus/` 下所有条目，跳过 `PRESERVE_FILES`，逐个 `fs.rm(..., { recursive: true })`
- [x] 2.1.3 替换 `cleanCommand` 中 `fs.rm(storagePath, { recursive: true })` 为 `cleanStoragePath(storagePath)`
- [x] 2.1.4 `--all` 模式同步应用 `cleanStoragePath()` 到每个仓库
- [x] 2.1.5 更新 `cleanCommand` 输出文案："Deleted" → "Cleaned"，更准确地反映选择性删除语义
- [x] 2.1.6 验证：`npx tsc --noEmit` 无编译错误
- [x] 2.1.7 验证：`npm run test -- --run` 全部通过（81 files, 1699 tests passed）

### 2.2 cli-analyze-workflow-guidance

- [x] 2.2.1 将 SKILL.md analyze 章节 flag 表格精简为仅 `--force`, `--embeddings`, `--skills`
- [x] 2.2.2 创建 "Path A: sync-manifest managed" 小节：说明 auto-load 条件、示例命令、manifest 语法、drift guard
- [x] 2.2.3 创建 "Path B: manual CLI flags" 小节：说明使用场景、示例命令、专用 flag 表格
- [x] 2.2.4 添加显式 "Do not mix Path A and Path B" 警告
- [x] 2.2.5 将 `--csharp-define-csproj` 移至补充说明小节，不再出现在主 flag 表格
- [x] 2.2.6 移除原 SKILL.md 中 "Unity projects: Add `--extensions`..." 等分散备注，统一纳入 Path A/B

### 2.3 cli-rebuild-recovery-guidance

- [x] 2.3.1 在 SKILL.md analyze 章节末尾新增 "Rebuild recovery" 小节
- [x] 2.3.2 列出三个损坏特征：csv 无 relations.csv / lbug.wal 存在但 lbug 极小 / 卡在 Loading into LadybugDB
- [x] 2.3.3 给出恢复命令序列：`clean --force` → `analyze --force`
- [x] 2.3.4 在 Troubleshooting 章节新增条目："`analyze --force` hangs or crashes: ..."

## 3. 收敛与验证准备

- [x] 3.1 编译验证：`npx tsc --noEmit` 无错误
- [x] 3.2 单元测试验证：`npm run test -- --run` 通过（81 files, 1699 tests, 1 skipped）
- [x] 3.3 neonspark 现场验证：手动清理损坏索引后，`analyze --force` 成功完成（7773 files, 102660 nodes, 517059 edges）
- [x] 3.4 确认 writeback 目标：`.agents/skills/gitnexus/gitnexus-cli/SKILL.md`（已直接修改，无需额外回写）

## 4. 验证与回写收敛

- [x] 4.1 生成 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 生成 writeback.md（目标、字段映射、前置条件）
- [x] 4.3 AGENTS.md 同步更新判断：无需更新（AGENTS.md 仅引用 skill 文件路径，不涉及具体工作流内容）
