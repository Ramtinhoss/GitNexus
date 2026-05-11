# Design

## Context

GitNexus CLI 的 `analyze` 命令当前通过三层优先级（CLI > sync-manifest directive > meta.json.analyzeOptions）解析参数，其中 sync-manifest 机制引入了 drift guard、TTY 交互策略、scope-manifest-config 解析等复杂度。实际使用中，Agent 在非 TTY 环境频繁触发 drift guard 报错，用户也反馈配置分散难以理解。

本次 change 移除 sync-manifest 整套机制，简化为 CLI > stored 两层，并将 `csharpDefineCsproj` 纳入持久化。

## Goals / Non-Goals

**Goals:**
- 将参数优先级简化为 CLI > stored（meta.json.analyzeOptions）
- 持久化 `csharpDefineCsproj` 到 meta.json
- 复用 stored options 前进行字段校验
- 移除 sync-manifest 文件和相关 CLI 参数
- 清理 clean 命令中对 sync-manifest.txt 的特殊保留逻辑

**Non-Goals:**
- 不修改 pipeline 内部逻辑（ingestion、embedding、community detection 等）
- 不修改 MCP server / query 层
- 不修改 analyze_rules / Unity rule-gen 逻辑
- 不重新设计 meta.json 的整体 schema（仅在 analyzeOptions 内新增字段）

## Decisions

### D1: 删除文件清单

| 文件 | 操作 | 理由 |
|------|------|------|
| `gitnexus/src/cli/sync-manifest.ts` | 删除 | sync-manifest 机制核心，无调用方后可安全删除 |
| `gitnexus/src/cli/sync-manifest.test.ts` | 删除 | 对应测试 |
| `gitnexus/src/cli/scope-manifest-config.ts` | 删除 | 仅被 sync-manifest.ts 和 analyze-options.ts 引用 |

注：`sync-manifest.ts`、`sync-manifest.test.ts`、`scope-manifest-config.ts` 已在方案确认阶段预先删除，实施时无需额外操作。

### D2: `analyze-options.ts` 重构

- 移除 `scopeManifest` / `scopePrefix` 相关参数（接口字段、函数参数、解析逻辑）
- 移除 `parseScopeManifestConfig` import
- `StoredAnalyzeOptions` 和 `EffectiveAnalyzeOptions` 新增 `csharpDefineCsproj?: string`
- `resolveEffectiveAnalyzeOptions` 简化为 CLI > stored 两层，对 `csharpDefineCsproj` 同样适用
- 新增 `parseScopeList(rawScope?: string)` 函数，解析逗号分隔的 scope rules
- `resolveEffectiveAnalyzeOptions` 中 `scopeRules` 通过 `--scope` CLI 参数输入，支持 CLI > stored 优先级
- 新增 `validateStoredOptions(stored, repoPath)` 异步函数

### D3: `validateStoredOptions` 设计

```ts
interface ValidatedStoredOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
  csharpDefineCsproj?: string;
}

async function validateStoredOptions(
  stored: StoredAnalyzeOptions | undefined,
  repoPath: string,
): Promise<ValidatedStoredOptions>
```

校验规则：
- `repoAlias`: 正则 `^[a-zA-Z0-9._-]{3,64}$`
- `includeExtensions`: 每项必须以 `.` 开头，过滤无效项
- `scopeRules`: 过滤空/纯空白项
- `csharpDefineCsproj`: `fs.stat` 检查文件存在性（不存在 → warn + 设为 undefined）
- 校验失败时 `console.warn` 输出具体原因
- `stored` 为 undefined 时返回全默认值

### D4: `analyze.ts` 修改

- `AnalyzeOptions` 接口移除 `scopeManifest`、`scopePrefix`、`syncManifestPolicy`，新增 `scope?: string`
- 移除 `enforceSyncManifestConsistency` / `resolveScopeManifestForAnalyze` 调用
- `--scope` 参数传递给 `resolveEffectiveAnalyzeOptions`
- `buildPipelineRunOptionsForAnalyze` 从 `effectiveOptions` 中取 `csharpDefineCsproj`
- meta.json 写入时包含 `csharpDefineCsproj`
- `hasCliOverrides` 检测逻辑移除 `scopeManifest` / `scopePrefix` 分支，新增 `scope` 和 `csharpDefineCsproj` 检测

### D5: CLI 参数清理 (`index.ts`)

- `analyze` 命令移除 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix`
- `analyze` 命令新增 `--scope <rules>` 选项（逗号分隔 scope path-prefix rules）
- `benchmark-unity`、`benchmark-agent-context`、`benchmark-agent-safe-query-context` 移除 `--scope-manifest`、`--scope-prefix`

### D6: `clean.ts` 简化

- 移除 `PRESERVE_FILES` Set 和逐条保留逻辑
- 恢复为 `fs.rm(storagePath, { recursive: true, force: true })`

### D7: `repo-manager.ts` 类型扩展

- `RepoMeta.analyzeOptions` 新增 `csharpDefineCsproj?: string`

### D8: 测试更新

- `analyze-options.test.ts`: 移除 manifest 相关用例（`resolveAnalyzeScopeRules` manifest 测试、manifest directive 测试、CLI > manifest > stored 优先级测试、unknown directive 测试、`parseScopeManifestConfig` 测试）；新增 `validateStoredOptions` 用例；新增 `csharpDefineCsproj` 复用用例
- `analyze.test.ts`: 移除 sync-manifest 相关用例；新增 `csharpDefineCsproj` 持久化用例
- `repo-manager-alias.test.ts`: 更新 `analyzeOptions` 对象以包含 `csharpDefineCsproj`

### D9: benchmark 子命令更新

- `benchmark-unity.ts`、`benchmark-agent-context.ts`、`benchmark-agent-safe-query-context.ts`：移除 options 接口中的 `scopeManifest` / `scopePrefix` 字段及传递逻辑

## Risks / Migration

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 已有 sync-manifest.txt 的仓库 analyze 行为变化 | 中 | 中 | 首次 analyze 时 CLI 参数会被持久化到 meta.json，后续自动复用；无需手动维护 manifest 文件 |
| benchmark 脚本使用 `--scope-manifest` / `--scope-prefix` | 低 | 低 | Breaking change 在 CHANGELOG 标注；benchmark 命令本身为内部工具 |
| `scope-manifest-config.ts` 的 `parseScopeManifestConfig` 被外部依赖 | 极低 | 低 | grep 确认仅被 sync-manifest.ts 和 analyze-options.ts 内部引用 |
| `clean` 不再保留 sync-manifest.txt，用户 clean 后丢失配置 | 低 | 低 | 配置已持久化在 meta.json 中，clean 删除 meta.json 是预期行为；用户 re-analyze 时重新指定即可 |
