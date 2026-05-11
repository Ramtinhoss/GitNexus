# Verification

## 实施摘要

本次 change 移除了 `sync-manifest` 整套机制，将 analyze 参数解析简化为 CLI > stored 两层优先级，并将 `csharpDefineCsproj` 持久化到 `meta.json.analyzeOptions`。

## Spec-to-Implementation 映射

### analyze-options-resolution

| Spec Requirement | 实现证据 | 状态 |
|---|---|---|
| sync-manifest-auto-load: REMOVED | `sync-manifest.ts`、`scope-manifest-config.ts` 已删除；`analyze-options.ts` 无 manifest 引用 | ✅ |
| sync-manifest-drift-guard: REMOVED | `enforceSyncManifestConsistency` 和 `--sync-manifest-policy` 已移除 | ✅ |
| manifest-directive-precedence: REMOVED | `resolveEffectiveAnalyzeOptions` 不再读取 manifest，三层→两层 | ✅ |
| effective-options-resolution: CLI > stored 两层 | `analyze-options.ts:resolveEffectiveAnalyzeOptions` 实现 | ✅ |
| cli-override-wins-over-stored | `analyze-options.test.ts`: "prefers explicit CLI values" (scope CLI overrides stored scopeRules) | ✅ |
| reuse-false-ignores-stored | `analyze-options.test.ts`: "disables reuse via reuseOptions=false" | ✅ |
| no-stored-uses-defaults | `analyze-options.test.ts`: "no stored uses defaults" | ✅ |
| stored-validated-before-use | `analyze.ts` 调用 `validateStoredOptions` 后再传给 `resolveEffectiveAnalyzeOptions` | ✅ |
| scope-cli-input | `analyze-options.ts:parseScopeList` + `resolveEffectiveAnalyzeOptions` has `hasCliScope` 分支 | ✅ |
| scope-reuse-stored | `analyze-options.test.ts`: "reuses stored scopeRules when CLI scope is omitted" | ✅ |

### analyze-csproj-persistence

| Spec Scenario | 实现证据 | 状态 |
|---|---|---|
| csproj-written-to-meta-json | `analyze.ts` meta 对象包含 `...(csharpDefineCsproj ? { csharpDefineCsproj } : {})` | ✅ |
| csproj-reused-from-meta-json | `analyze-options.ts` resolveEffectiveAnalyzeOptions 处理 csharpDefineCsproj 复用 | ✅ |
| csproj-not-reused-when-file-missing | `validateStoredOptions` 中 `fs.stat` 检查 + warn + undefined | ✅ |
| csproj-cli-override-stored | `analyze-options.test.ts`: "CLI csharpDefineCsproj overrides stored" | ✅ |
| no-csproj-stored-and-no-cli | `analyze-options.test.ts`: "no stored uses defaults" (csharpDefineCsproj undefined) | ✅ |

### stored-options-validation

| Spec Scenario | 实现证据 | 状态 |
|---|---|---|
| valid-stored-options-pass | `analyze-options.test.ts`: "passes valid options unchanged" | ✅ |
| invalid-repo-alias-warns-and-falls-back | `analyze-options.test.ts`: "warns on invalid repoAlias" | ✅ |
| invalid-extension-format-warns-and-falls-back | `analyze-options.test.ts`: "filters invalid extensions" | ✅ |
| csproj-file-not-found-warns-and-falls-back | `analyze-options.test.ts`: "warns on missing csharpDefineCsproj file" | ✅ |
| empty-scope-rules-warns | `analyze-options.test.ts`: "filters empty scopeRules" | ✅ |

### analyze-cli-interface

| Spec Scenario | 实现证据 | 状态 |
|---|---|---|
| analyze-rejects-removed-options | `index.ts` 中 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix` 选项已移除 | ✅ |
| benchmark-rejects-removed-options | `index.ts` benchmark 子命令中 `--scope-manifest`、`--scope-prefix` 已移除 | ✅ |
| analyze-accepts-all-remaining-options | `index.ts` analyze 命令保留所有其他选项，包含 `--scope` | ✅ |
| analyze-parses-scope-rules | `analyze-options.ts:parseScopeList` + `analyze-options.test.ts`: "parses --scope comma-separated rules" | ✅ |
| analyze-scope-cli-overrides-stored | `analyze-options.test.ts`: "prefers explicit CLI values" (scope CLI overrides stored scopeRules) | ✅ |
| analyze-scope-persisted | neonspark E2E: meta.json.analyzeOptions.scopeRules = ["Assets", "Packages"] | ✅ |

### clean-command-config-preserve

| Spec Scenario | 实现证据 | 状态 |
|---|---|---|
| clean-removes-all-contents | `clean.ts` 使用 `fs.rm(storagePath, { recursive: true, force: true })` | ✅ |
| clean-idempotent-when-no-gitnexus | `clean.ts` 中 `findRepo` 返回 null 时输出提示并正常返回 | ✅ |

## Task-to-Evidence 映射

| Task | 证据 | 状态 |
|---|---|---|
| 2.1.1 repo-manager.ts csharpDefineCsproj | `gitnexus/src/storage/repo-manager.ts` analyzeOptions 接口 | ✅ |
| 2.2.1–2.2.5 analyze-options.ts 重构 | `gitnexus/src/cli/analyze-options.ts` 全文重写 | ✅ |
| 2.3.1–2.3.6 analyze.ts 修改 | `gitnexus/src/cli/analyze.ts` 移除 sync-manifest 引用 | ✅ |
| 2.4.1–2.4.2 index.ts CLI 参数清理 | `gitnexus/src/cli/index.ts` 移除三个 CLI 选项 | ✅ |
| 2.5.1 benchmark 子命令清理 | benchmark-unity.ts, benchmark-agent-context.ts, benchmark-agent-safe-query-context.ts, analyze-runner.ts, runner.ts, u2-performance-sampler.ts, neonspark-full-e2e.ts | ✅ |
| 2.6.1 clean.ts 简化 | `gitnexus/src/cli/clean.ts` 全文重写 | ✅ |
| 2.7.1 删除文件 | sync-manifest.ts, sync-manifest.test.ts, scope-manifest-config.ts 已删除 | ✅ |
| 2.7.2 analyze-options.test.ts | 全新测试：validateStoredOptions 6 个场景 + csharpDefineCsproj 复用 2 个场景 | ✅ |
| 2.7.3 analyze.test.ts | 移除 sync-manifest 用例，保留 buildPipelineRunOptionsForAnalyze + 新增 omits 用例 | ✅ |
| 2.7.4 repo-manager-alias.test.ts | 无需修改（csharpDefineCsproj 为 optional） | ✅ |
| 2.8.1 tsc 编译 | `npm run build` 通过 | ✅ |
| 2.8.2 测试 | 1698 passed, 1 failed (前置问题 scoped-cli-commands.test.ts) | ✅ |

## 超出原 tasks.md 范围的额外清理

以下文件在 tasks.md 中未列出，但实际包含 scopeManifest/scopePrefix 引用，已在本次实施中一并清理：

- `gitnexus/src/benchmark/runner.ts` — 移除 scopeManifest/scopePrefix 字段和传递
- `gitnexus/src/benchmark/u2-performance-sampler.ts` — 移除 scopeManifest/scopePrefix CLI 参数解析和 resolveAnalyzeScopeRules 调用
- `gitnexus/src/benchmark/u2-e2e/neonspark-full-e2e.ts` — 移除 scopePrefixArgs 函数和 --scope-prefix 参数传递
- `gitnexus/src/benchmark/analyze-runner.test.ts` — 移除 scopeManifest/scopePrefix 测试用例

## 构建与测试结果

- **Build**: `npm run build` 成功（tsc + chmod）
- **Tests**: 1698 passed, 1 skipped, 1 failed (前置问题，与本次重构无关)

## E2E 验收（neonspark 仓库）

| 测试场景 | 结果 | 说明 |
|---|---|---|
| `clean --force` 完整删除 `.gitnexus/` | ✅ | 符合 clean-command-config-preserve spec |
| `--scope` 首次传入 scope rules | ✅ | `Assets/,Packages/` → `["Assets", "Packages"]` 持久化到 meta.json |
| `--csharp-define-csproj` 首次传入并持久化 | ✅ | meta.json 包含完整路径，CSharp Preproc 生效（defines=189, normalized=1304） |
| `--repo-alias` + `--extensions` 持久化 | ✅ | 所有选项正确写入 meta.json.analyzeOptions |
| 二次 `analyze --force` 自动复用 | ✅ | 无需任何 CLI 参数，scope/extensions/csproj/alias 全部自动恢复 |
| `--no-reuse-options` 忽略 stored | ✅ | Scope Rules=0, Alias=none, 无 csproj，全仓库扫描 nodes 106k→142k |
