# Verification

## Spec-to-Implementation Coverage

### Capability: clean-preserve-config

| Requirement | Spec | Implementation | Evidence |
|------------|------|---------------|----------|
| selective-clean | `clean.ts` 遍历 `.gitnexus/` 下条目，跳过 `PRESERVE_FILES` | ✅ `cleanStoragePath()` 遍历 `fs.readdir` 结果，跳过 Set 中条目，逐个 `fs.rm(..., { recursive: true })` | `gitnexus/src/cli/clean.ts:24-36` |
| preserved-config-set | 显式 allow-list，初始包含 `sync-manifest.txt` | ✅ `const PRESERVE_FILES = new Set(['sync-manifest.txt'])` | `gitnexus/src/cli/clean.ts:16` |
| backward-compatible-cli | CLI 接口不变，无新 flag | ✅ `cleanCommand` 签名不变，`--force` 和 `--all` 语义不变 | `gitnexus/src/cli/clean.ts:38-89` |

**--all 模式覆盖**：`cleanStoragePath()` 同样应用于 `--all` 模式中的每个仓库（`gitnexus/src/cli/clean.ts:56`）。

### Capability: cli-analyze-workflow-guidance

| Requirement | Spec | Implementation | Evidence |
|------------|------|---------------|----------|
| analyze-mutually-exclusive-paths | Path A 和 Path B 作为互斥路径呈现 | ✅ analyze 章节分为 "Path A: sync-manifest managed" 和 "Path B: manual CLI flags" 两个独立小节 | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:71-118` |
| path-a-sync-manifest | Path A 为推荐路径，示例命令仅 `--force` | ✅ 示例：`$GN analyze --force`；明确说明不传 `--scope-prefix`/`--extensions` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:76` |
| path-b-manual-cli | Path B 用于无 manifest 场景，示例含显式 flag | ✅ 示例含 `--extensions`, `--scope-prefix`, `--repo-alias` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:100-118` |
| no-mixing | 显式警告禁止混用两条路径 | ✅ "Do not mix Path A and Path B." 段落，解释 drift guard 风险 | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:96` |
| simplified-flag-table | 主表格仅含跨路径通用 flag | ✅ 主表格仅 `--force`, `--embeddings`, `--skills` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:65-69` |
| csharp-preproc-as-supplement | `--csharp-define-csproj` 移至补充说明 | ✅ 位于 Path B 下方的 "C# preprocessing" 小节，非主表格 | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:116` |

### Capability: cli-rebuild-recovery-guidance

| Requirement | Spec | Implementation | Evidence |
|------------|------|---------------|----------|
| rebuild-recovery-section | analyze 章节含 "Rebuild recovery" 小节 | ✅ 独立小节 "Rebuild recovery — when analyze hangs or crashes" | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:120` |
| identify-corruption | 列出三个损坏特征 | ✅ csv 无 relations.csv / lbug.wal 存在但 lbug 极小 / 卡在 Loading into LadybugDB | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:133-135` |
| recovery-commands | 给出 `clean --force` → `analyze --force` 序列 | ✅ 明确两步命令，注明 clean 保留 sync-manifest | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:127-130` |
| troubleshooting-analyze-hang | Troubleshooting 含 analyze hang 条目 | ✅ 条目："`analyze --force` hangs or crashes: Run `$GN clean --force`..." | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:240` |
| clean-post-analyze-mandatory | clean 文档提醒必须 rebuild | ✅ clean 章节描述："Use this to recover from a corrupted index before re-indexing" | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:144` |

## Task-to-Evidence Coverage

| Task | Description | Evidence | Status |
|------|-------------|----------|--------|
| 2.1.1 | `PRESERVE_FILES` Set | `clean.ts:16` | ✅ |
| 2.1.2 | `cleanStoragePath()` 遍历删除 | `clean.ts:18-36` | ✅ |
| 2.1.3 | 替换 `fs.rm(storagePath)` | `clean.ts:56,84` | ✅ |
| 2.1.4 | `--all` 模式应用 | `clean.ts:56` | ✅ |
| 2.1.5 | "Deleted" → "Cleaned" | `clean.ts:58,87` | ✅ |
| 2.1.6 | 编译验证 | `npx tsc --noEmit` 无错误 | ✅ |
| 2.1.7 | 单元测试 | `npm run test -- --run`: 81 files, 1699 passed | ✅ |
| 2.2.1 | 精简 flag 表格 | `SKILL.md:65-69` | ✅ |
| 2.2.2 | Path A 小节 | `SKILL.md:71-94` | ✅ |
| 2.2.3 | Path B 小节 | `SKILL.md:98-118` | ✅ |
| 2.2.4 | no-mixing 警告 | `SKILL.md:96` | ✅ |
| 2.2.5 | csharp-preproc 补充说明 | `SKILL.md:116` | ✅ |
| 2.2.6 | 移除分散 Unity 备注 | 原 "Unity projects:" 备注已移除，统一纳入 Path A/B | ✅ |
| 2.3.1 | Rebuild recovery 小节 | `SKILL.md:120` | ✅ |
| 2.3.2 | 三个损坏特征 | `SKILL.md:133-135` | ✅ |
| 2.3.3 | 恢复命令序列 | `SKILL.md:127-130` | ✅ |
| 2.3.4 | Troubleshooting 条目 | `SKILL.md:240` | ✅ |
| 3.3 | neonspark 现场验证 | 手动清理后 `analyze --force` 成功：7773 files, 102660 nodes, 517059 edges | ✅ |

## 未覆盖项

- 无。所有 spec requirements 均有对应的 implementation 和 evidence。

## 验证结论

**All specs covered. All tasks verified. Change is ready for writeback closure.**
