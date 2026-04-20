# Custom Module Definition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不破坏现有 analyze/query/impact/processes/clusters 行为的前提下，实现 `.gitnexus/modules.json` 自定义模块定义（`auto|mixed`，默认 `mixed`）并满足匹配规则独立文档的冲突决策与可解释性要求。

**Architecture:** 保持“图谱层统一模块映射”不变：先跑现有 Leiden 自动社区，再在 ingestion 管线引入 `ModuleConfigLoader + ModuleAssignmentEngine` 产出最终 `Community` 与 `MEMBER_OF`，后续 MCP/CLI 继续读取同一图谱。`mixed` 下配置强覆盖、未命中回退 `auto`，并通过 diagnostics 输出缺配置回退、非法配置失败、空模块 warning。

**Tech Stack:** TypeScript (Node 18+), 现有 ingestion pipeline (`runPipelineFromRepo`), Kuzu schema/CSV loader, LocalBackend + MCP resources, Node test runner (`node --test`).

---

### Task 1: 新增模块配置契约与加载器（`ModuleConfigLoader`）

**Files:**
- Create: `gitnexus/src/core/ingestion/modules/types.ts`
- Create: `gitnexus/src/core/ingestion/modules/config-loader.ts`
- Create: `gitnexus/src/core/ingestion/modules/config-loader.test.ts`

**Step 1: Write the failing test**

```ts
test('mixed + missing modules.json returns fallback diagnostic (no throw)', async () => {
  const result = await loadModuleConfig({ repoPath: tmpRepo, defaultMode: 'mixed' });
  assert.equal(result.mode, 'mixed');
  assert.equal(result.usedFallbackAuto, true);
});

test('mixed + invalid config throws with location', async () => {
  await assert.rejects(
    loadModuleConfig({ repoPath: repoWithInvalidConfig, defaultMode: 'mixed' }),
    /rules\\[1\\]\\.id.+duplicate/i,
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/config-loader.test.js`  
Expected: `FAIL`（`loadModuleConfig` 尚不存在）。

**Step 3: Write minimal implementation**

```ts
export async function loadModuleConfig(input: LoadModuleConfigInput): Promise<ModuleConfigLoadResult> {
  // 读取 .gitnexus/modules.json
  // 缺失 => mixed 下 usedFallbackAuto=true；auto 下忽略
  // 非法 => mixed 抛错（含路径/字段定位）
  // mode 缺省 => mixed
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/config-loader.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/modules/types.ts gitnexus/src/core/ingestion/modules/config-loader.ts gitnexus/src/core/ingestion/modules/config-loader.test.ts
git commit -m "feat: add module config loader with mixed mode fallback/validation"
```

### Task 2: 实现规则匹配器（`field/op/all/any`）与 specificity 打分

**Files:**
- Create: `gitnexus/src/core/ingestion/modules/rule-matcher.ts`
- Create: `gitnexus/src/core/ingestion/modules/rule-matcher.test.ts`

**Step 1: Write the failing test**

```ts
test('supports eq/contains/regex/in on symbol fields', () => {
  assert.equal(matchRule(symbol, ruleContains), true);
  assert.equal(matchRule(symbol, ruleRegex), true);
});

test('all + any must both pass when both provided', () => {
  assert.equal(matchRule(symbol, ruleAllAny), true);
  assert.equal(matchRule(symbol, ruleAllAnyFail), false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/rule-matcher.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
export function matchRule(symbol: MatchableSymbol, rule: ModuleRule): boolean {
  // field: symbol.name | symbol.kind | symbol.fqn | file.path
  // op: eq | contains | regex | in
  // all/any 组合：all 先过，再判 any，两者都满足才命中
}

export function specificityScore(cond: Condition): number {
  // eq=4, in=3, regex=2, contains=1
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/rule-matcher.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/modules/rule-matcher.ts gitnexus/src/core/ingestion/modules/rule-matcher.test.ts
git commit -m "feat: add module rule matcher and specificity scoring"
```

### Task 3: 实现最终归属引擎（`ModuleAssignmentEngine`）

**Files:**
- Create: `gitnexus/src/core/ingestion/modules/assignment-engine.ts`
- Create: `gitnexus/src/core/ingestion/modules/assignment-engine.test.ts`

**Step 1: Write the failing test**

```ts
test('mixed mode applies config override and auto fallback with single membership', () => {
  const out = assignModules(input);
  assert.equal(out.membershipsBySymbol.get('Class:MinionFactory')?.moduleName, 'Factory');
  assert.equal(out.membershipsBySymbol.get('Class:Minion')?.assignmentSource, 'auto-fallback');
});

test('conflict resolution order: priority > specificity > rule-order > module-name', () => {
  const out = assignModules(conflictInput);
  assert.equal(out.membershipsBySymbol.get('Class:X')?.resolvedBy, 'specificity');
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/assignment-engine.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
export function assignModules(input: AssignmentInput): AssignmentOutput {
  // auto: 直接透传自动 communities/memberships
  // mixed: config-rule 优先，未命中回退 auto
  // 输出 finalModules/finalMemberships + explainability:
  // assignmentSource, matchedRuleId, resolvedBy
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/modules/assignment-engine.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/modules/assignment-engine.ts gitnexus/src/core/ingestion/modules/assignment-engine.test.ts
git commit -m "feat: add deterministic module assignment engine"
```

### Task 4: 接入 ingestion pipeline，写入最终 `Community/MEMBER_OF`

**Files:**
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Modify: `gitnexus/src/types/pipeline.ts`
- Create: `gitnexus/src/cli/analyze-custom-modules-regression.test.ts`

**Step 1: Write the failing test**

```ts
test('pipeline mixed mode writes config module + auto fallback memberships', async () => {
  const result = await runPipelineFromRepo(tmpRepoWithModulesJson, () => {}, { includeExtensions: ['.cs'] });
  const communities = [...result.graph.iterNodes()].filter((n) => n.label === 'Community');
  assert.ok(communities.some((c) => c.properties.heuristicLabel === 'Factory'));
});

test('pipeline mixed + invalid modules.json fails fast', async () => {
  await assert.rejects(runPipelineFromRepo(tmpRepoWithInvalidModules, () => {}), /modules\\.json/i);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-custom-modules-regression.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
// pipeline.ts 中 community detection 后新增：
const moduleConfig = await loadModuleConfig({ repoPath, defaultMode: 'mixed' });
const moduleOutput = assignModules({
  mode: moduleConfig.mode,
  autoCommunities: communityResult.communities,
  autoMemberships: communityResult.memberships,
  graph,
  config: moduleConfig.config,
});
// 后续 graph.addNode/addRelationship 与 processProcesses 一律使用 moduleOutput.final*
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-custom-modules-regression.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/pipeline.ts gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze-custom-modules-regression.test.ts
git commit -m "feat: wire custom module assignment into ingestion pipeline"
```

### Task 5: 扩展 analyze diagnostics（缺配置回退/空模块 warning/统计）

**Files:**
- Modify: `gitnexus/src/core/ingestion/modules/types.ts`
- Modify: `gitnexus/src/types/pipeline.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Create: `gitnexus/src/cli/analyze-modules-diagnostics.test.ts`

**Step 1: Write the failing test**

```ts
test('prints one-time fallback warning for mixed + missing modules.json', () => {
  const lines = formatModuleDiagnostics({ usedFallbackAuto: true, emptyModules: [] });
  assert.ok(lines.some((l) => /fallback to auto/i.test(l)));
});

test('prints warning for empty modules', () => {
  const lines = formatModuleDiagnostics({ usedFallbackAuto: false, emptyModules: ['Battle'] });
  assert.ok(lines.some((l) => /empty module/i.test(l)));
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-modules-diagnostics.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
// analyze.ts summary 阶段：
if (pipelineResult.moduleDiagnostics?.usedFallbackAuto) console.warn(...);
for (const name of pipelineResult.moduleDiagnostics?.emptyModules ?? []) console.warn(...);
console.log(`  Modules: mode=${mode}, configured=${configuredCount}, final=${finalCount}`);
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-modules-diagnostics.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/modules/types.ts gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze.ts gitnexus/src/cli/analyze-modules-diagnostics.test.ts
git commit -m "feat: add analyze diagnostics for custom module assignment"
```

### Task 6: 调整 clusters 聚合逻辑，确保空配置模块仅在 clusters 可见

**Files:**
- Create: `gitnexus/src/mcp/local/cluster-aggregation.ts`
- Create: `gitnexus/src/mcp/local/cluster-aggregation.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/resources.ts`

**Step 1: Write the failing test**

```ts
test('keeps auto tiny clusters filtered but includes empty configured modules', () => {
  const out = aggregateClusters(raw, { minSymbolCount: 5, includeEmptyConfigured: true });
  assert.ok(out.some((c) => c.heuristicLabel === 'Battle' && c.symbolCount === 0));
  assert.ok(!out.some((c) => c.heuristicLabel === 'AutoTiny' && c.symbolCount === 1));
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/cluster-aggregation.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
export function aggregateClusters(raw: RawCluster[]): AggregatedCluster[] {
  // 保持现有 >=5 过滤
  // 但对“配置模块且 symbolCount=0”强制保留
  // (建议通过 community id 前缀 comm_cfg_ 或 source 字段识别)
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/cluster-aggregation.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/cluster-aggregation.ts gitnexus/src/mcp/local/cluster-aggregation.test.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/resources.ts
git commit -m "feat: surface empty configured modules in clusters resource"
```

### Task 7: 一致性回归（query/impact/clusters/processes）

**Files:**
- Modify: `gitnexus/src/cli/analyze-custom-modules-regression.test.ts`

**Step 1: Write the failing test**

```ts
test('module assignment is consistent across cluster/process/query inputs', async () => {
  // 跑 analyze fixture 后：
  // 1) 读 Community/MEMBER_OF
  // 2) 验证 Process.communities 来自同一最终 membership
  // 3) 验证 cluster 结果包含空配置模块，但 query/impact 不出现虚假 symbol
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-custom-modules-regression.test.js`  
Expected: `FAIL`。

**Step 3: Write minimal implementation**

```ts
// 在测试中使用 runPipelineFromRepo + LocalBackend 查询同一临时索引
// 断言：
// - 同一 symbol 只有 1 条 MEMBER_OF
// - processes.communities 与 MEMBER_OF 可对齐
// - 空模块仅出现在 clusters
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-custom-modules-regression.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze-custom-modules-regression.test.ts
git commit -m "test: add custom module consistency regression coverage"
```

### Task 8: 文档与示例收口（实现说明 + 配置样例）

**Files:**
- Modify: `gitnexus/README.md`
- Create: `gitnexus/.gitnexus/modules.example.json` (or `gitnexus/docs/modules.example.json`)
- Modify: `docs/plans/2026-03-04-custom-module-definition-design.md`（仅追加“实现计划链接”）

**Step 1: Write the failing test**

```ts
test('README mentions modules.json mode semantics and failure behavior', async () => {
  const readme = await fs.readFile('README.md', 'utf-8');
  assert.match(readme, /\\.gitnexus\\/modules\\.json/);
  assert.match(readme, /mixed.*fallback.*auto/i);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-modules-diagnostics.test.js`  
Expected: `FAIL`（文档断言尚未满足或未添加断言）。

**Step 3: Write minimal implementation**

```md
### Custom Modules (MVP)
- Config path: .gitnexus/modules.json
- mode: auto | mixed (default mixed)
- mixed + missing config: fallback auto (warn once)
- mixed + invalid config: analyze fails
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-modules-diagnostics.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/README.md gitnexus/.gitnexus/modules.example.json docs/plans/2026-03-04-custom-module-definition-design.md
git commit -m "docs: add custom module configuration guide and examples"
```

## Final Verification Checklist (@superpowers/verification-before-completion)

1. `cd gitnexus && npm run build`
2. `cd gitnexus && node --test dist/core/ingestion/modules/config-loader.test.js`
3. `cd gitnexus && node --test dist/core/ingestion/modules/rule-matcher.test.js`
4. `cd gitnexus && node --test dist/core/ingestion/modules/assignment-engine.test.js`
5. `cd gitnexus && node --test dist/cli/analyze-custom-modules-regression.test.js`
6. `cd gitnexus && node --test dist/cli/analyze-modules-diagnostics.test.js`
7. `cd gitnexus && node --test dist/mcp/local/cluster-aggregation.test.js`
8. `cd gitnexus && node --test dist/cli/*.test.js dist/benchmark/*.test.js`

## Notes for Executor

1. 严格以 `docs/plans/2026-03-04-custom-module-matching-rules-design.md` 作为匹配语义权威来源，若实现中发现歧义，先补文档再写代码。  
2. 若选择 `community id` 前缀区分配置模块（如 `comm_cfg_*`），请在 `assignment-engine` 与 `cluster-aggregation` 同时固化该约定，并加测试防回归。  
3. 每个 Task 完成后先执行对应最小测试再提交，避免跨 Task 混改。  
