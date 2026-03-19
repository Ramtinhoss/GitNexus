# GitNexus Analyze Memory Reduction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce full-repo `analyze` peak memory in three controlled tiers while measuring build speed and Unity query behavior after each tier.

**Architecture:** Start with Tier 1 runtime-peak reductions that do not change query contracts, then move to Tier 2 Unity graph slimming, and only then attempt Tier 3 summary-only analyze persistence with query-time hydration. Every tier produces an evidence report with `analyze` wall time, RSS, graph size, and cold/warm Unity query results before proceeding.

**Tech Stack:** TypeScript, Node.js, KuzuDB CSV/COPY pipeline, existing GitNexus benchmark/reporting infrastructure, Unity lazy hydration path.

---

Skill refs for execution: `@superpowers/test-driven-development`, `@superpowers/verification-before-completion`.

**Execution Notes:**
- GitNexus status on `2026-03-14`: index is stale (`Indexed commit: d2e651c`, `Current commit: 95faf8d`). If any execution step needs GitNexus retrieval context, first ask the user whether to rebuild with `npx -y /npx -y /gitnexus analyze`; do not auto-rebuild.
- Do not advance from Tier 1 to Tier 2 or Tier 2 to Tier 3 until the tier report is saved, the Unity query gates remain green, and the measurement deltas are explicitly compared against the previous tier.

### Task 1: Add Analyze Memory Sampler

**Files:**
- Create: `gitnexus/src/benchmark/analyze-memory-sampler.ts`
- Create: `gitnexus/src/benchmark/analyze-memory-sampler.test.ts`
- Modify: `gitnexus/package.json`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzeMemoryReport } from './analyze-memory-sampler.js';

test('buildAnalyzeMemoryReport summarizes analyze and query measurements', () => {
  const report = buildAnalyzeMemoryReport({
    analyze: { realSec: 10, maxRssBytes: 1024, phases: { pipelineSec: 3, kuzuSec: 5, ftsSec: 1 } },
    queryCold: { realSec: 2, maxRssBytes: 512, resourceBindings: 4, unityDiagnostics: [] },
    queryWarm: { realSec: 1, maxRssBytes: 256, resourceBindings: 4, unityDiagnostics: [] },
  });
  assert.equal(report.summary.analyzeRealSec, 10);
  assert.equal(report.summary.coldResourceBindings, 4);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/benchmark/analyze-memory-sampler.test.js`  
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
export function buildAnalyzeMemoryReport(input: any) {
  return {
    capturedAt: new Date().toISOString(),
    summary: {
      analyzeRealSec: input.analyze.realSec,
      analyzeMaxRssBytes: input.analyze.maxRssBytes,
      coldResourceBindings: input.queryCold.resourceBindings,
      warmResourceBindings: input.queryWarm.resourceBindings,
    },
    input,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/analyze-memory-sampler.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/analyze-memory-sampler.ts gitnexus/src/benchmark/analyze-memory-sampler.test.ts gitnexus/package.json
git commit -m "test(benchmark): add analyze memory sampler scaffold"
```

### Task 2: Extract Post-Kuzu Runtime Summary And Release Graph Reference

**Files:**
- Create: `gitnexus/src/cli/analyze-runtime-summary.ts`
- Create: `gitnexus/src/cli/analyze-runtime-summary.test.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/types/pipeline.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { toPipelineRuntimeSummary } from './analyze-runtime-summary.js';

test('toPipelineRuntimeSummary drops graph reference and preserves reporting fields', () => {
  const out = toPipelineRuntimeSummary({
    totalFileCount: 12,
    communityResult: { stats: { totalCommunities: 3 } },
    processResult: { stats: { totalProcesses: 2 } },
    unityResult: { diagnostics: ['scanContext: scripts=1'] },
  } as any);

  assert.equal('graph' in out, false);
  assert.equal(out.totalFileCount, 12);
  assert.equal(out.communityResult?.stats.totalCommunities, 3);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/cli/analyze-runtime-summary.test.js`  
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
export function toPipelineRuntimeSummary(input: any) {
  return {
    totalFileCount: input.totalFileCount,
    communityResult: input.communityResult,
    processResult: input.processResult,
    unityResult: input.unityResult,
    scopeDiagnostics: input.scopeDiagnostics,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-runtime-summary.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze-runtime-summary.ts gitnexus/src/cli/analyze-runtime-summary.test.ts gitnexus/src/cli/analyze.ts gitnexus/src/types/pipeline.ts
git commit -m "refactor(analyze): release graph after kuzu load"
```

### Task 3: Stream Relationship Pair Buckets Instead Of Holding `relsByPair`

**Files:**
- Create: `gitnexus/src/core/kuzu/relationship-pair-buckets.ts`
- Create: `gitnexus/src/core/kuzu/relationship-pair-buckets.test.ts`
- Modify: `gitnexus/src/core/kuzu/kuzu-adapter.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketRelationshipLines } from './relationship-pair-buckets.js';

test('bucketRelationshipLines groups CSV lines by from/to pair without retaining all lines in one array', async () => {
  const out = await bucketRelationshipLines([
    '"Class:a","File:x","UNITY_RESOURCE_SUMMARY",1,"",0',
    '"Class:a","CodeElement:b","UNITY_COMPONENT_INSTANCE",1,"",0',
  ], (nodeId) => nodeId.split(':')[0] as any);

  assert.deepEqual([...out.keys()].sort(), ['Class|CodeElement', 'Class|File']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/core/kuzu/relationship-pair-buckets.test.js`  
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
export async function bucketRelationshipLines(lines: string[], getNodeLabel: (id: string) => string) {
  const buckets = new Map<string, string[]>();
  for (const line of lines) {
    const match = line.match(/"([^"]*)","([^"]*)"/);
    if (!match) continue;
    const key = `${getNodeLabel(match[1])}|${getNodeLabel(match[2])}`;
    const rows = buckets.get(key) || [];
    rows.push(line);
    buckets.set(key, rows);
  }
  return buckets;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/kuzu/relationship-pair-buckets.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/kuzu/relationship-pair-buckets.ts gitnexus/src/core/kuzu/relationship-pair-buckets.test.ts gitnexus/src/core/kuzu/kuzu-adapter.ts
git commit -m "perf(kuzu): stream relationship pair buckets"
```

### Task 4: Bound CSV Source Content Cache By Bytes

**Files:**
- Modify: `gitnexus/src/core/kuzu/csv-generator.ts`
- Create: `gitnexus/src/core/kuzu/csv-generator.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileContentCache } from './csv-generator.js';

test('FileContentCache evicts oldest entries when byte budget is exceeded', async () => {
  const cache = new FileContentCache('/tmp/repo', 10);
  (cache as any).setForTest('a.cs', '123456');
  (cache as any).setForTest('b.cs', '123456');
  assert.equal((cache as any).hasForTest('a.cs'), false);
  assert.equal((cache as any).hasForTest('b.cs'), true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/core/kuzu/csv-generator.test.js`  
Expected: FAIL with exported symbol or helper not found

**Step 3: Write minimal implementation**

```ts
class FileContentCache {
  private currentBytes = 0;
  constructor(private repoPath: string, private maxBytes: number = 128 * 1024 * 1024) {}
  // test-only helpers can be guarded but must verify byte-budget eviction.
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/kuzu/csv-generator.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/kuzu/csv-generator.ts gitnexus/src/core/kuzu/csv-generator.test.ts
git commit -m "perf(kuzu): bound csv content cache by bytes"
```

### Task 5: Stream Serializable Type Index Build

**Files:**
- Modify: `gitnexus/src/core/unity/serialized-type-index.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/serialized-type-index.test.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

```ts
test('buildSerializableTypeIndexFromFiles does not require preloaded source array', async () => {
  const out = await buildSerializableTypeIndexFromFiles([
    { filePath: 'Assets/A.cs', read: async () => '[Serializable] class AssetRef {}' },
    { filePath: 'Assets/B.cs', read: async () => 'class Host { AssetRef icon; }' },
  ] as any);
  assert.equal(out.serializableSymbols.has('AssetRef'), true);
  assert.equal(out.hostFieldTypeHints.get('Host')?.get('icon'), 'AssetRef');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/core/unity/serialized-type-index.test.js gitnexus/dist/core/unity/scan-context.test.js`  
Expected: FAIL with function not found

**Step 3: Write minimal implementation**

```ts
export async function buildSerializableTypeIndexFromFiles(files: Array<{ filePath: string; read: () => Promise<string> }>) {
  const serializableSymbols = new Set<string>();
  // pass 1: serializable declarations
  // pass 2: host field hints
  return { serializableSymbols, hostFieldTypeHints: new Map() };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/serialized-type-index.test.js gitnexus/dist/core/unity/scan-context.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/serialized-type-index.ts gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/serialized-type-index.test.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "perf(unity): stream serializable type index build"
```

### Task 6: Tier 1 Verification And Report

**Files:**
- Create: `docs/reports/2026-03-14-analyze-memory-tier1-summary.json`

**Step 1: Capture Tier 1 measurements**

Run:

- `/usr/bin/time -l node gitnexus/dist/cli/index.js analyze --repo-alias neonnew-core`
- `/usr/bin/time -l node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto`
- Re-run the same context command once more

Expected: all commands complete and emit `real` + `maximum resident set size`

**Step 2: Run targeted test set**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/kuzu/*.test.js gitnexus/dist/core/unity/*.test.js gitnexus/dist/cli/analyze-runtime-summary.test.js gitnexus/dist/benchmark/analyze-memory-sampler.test.js`
Expected: PASS

**Step 3: Write report**

```json
{
  "tier": 1,
  "focus": ["graph lifetime", "pair bucket streaming", "scanContext script streaming"],
  "measurements": {}
}
```

**Step 4: Verify report saved**

Run: `test -f docs/reports/2026-03-14-analyze-memory-tier1-summary.json && echo ok`
Expected: `ok`

**Step 5: Commit**

```bash
git add docs/reports/2026-03-14-analyze-memory-tier1-summary.json
git commit -m "docs(report): capture tier1 analyze memory measurements"
```

### Task 7: Remove `UNITY_COMPONENT_IN` And Stop Creating Unity Resource File Nodes

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing test**

```ts
test('processUnityResources does not emit UNITY_COMPONENT_IN or synthetic resource File nodes', async () => {
  const result = await processUnityResources(graph, { repoPath: fixtureRoot });
  const unityFileRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_COMPONENT_IN');
  const syntheticResourceFiles = [...graph.iterNodes()].filter((node) => node.label === 'File' && /\\.(prefab|unity|asset)$/.test(String(node.properties.filePath)));
  assert.equal(result.bindingCount > 0, true);
  assert.equal(unityFileRelations.length, 0);
  assert.equal(syntheticResourceFiles.length, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL because legacy `UNITY_COMPONENT_IN` / `File` node behavior is still present

**Step 3: Write minimal implementation**

```ts
// Keep UNITY_COMPONENT_INSTANCE and UNITY_SERIALIZED_TYPE_IN only.
// Resource path is preserved on component filePath; do not create synthetic File nodes.
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "perf(unity): remove redundant resource graph edges"
```

### Task 8: Skip Unity Component Content And Compact Stored Payload

**Files:**
- Modify: `gitnexus/src/core/kuzu/csv-generator.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/kuzu/csv-generator.test.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.test.ts`

**Step 1: Write the failing test**

```ts
test('Unity component CodeElement rows store compact description and empty content', async () => {
  const row = await toCodeElementCsvRow({
    id: 'CodeElement:Assets/A.prefab:114',
    label: 'CodeElement',
    properties: {
      name: 'DoorObj@114',
      filePath: 'Assets/A.prefab',
      startLine: 12,
      endLine: 12,
      description: JSON.stringify({ bindingKind: 'direct', componentObjectId: '114', serializedFields: { scalarFields: [], referenceFields: [] } }),
    },
  } as any);
  assert.match(row, /,\"\"\,\"\\{/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/core/kuzu/csv-generator.test.js gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: FAIL because Unity component rows still include generated content or payload projection mismatch

**Step 3: Write minimal implementation**

```ts
// Detect Unity component CodeElement rows by resource filePath and skip content extraction.
// Keep description compact but projectUnityBindings output unchanged.
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/kuzu/csv-generator.test.js gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/kuzu/csv-generator.ts gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/kuzu/csv-generator.test.ts gitnexus/src/mcp/local/unity-enrichment.test.ts
git commit -m "perf(unity): compact stored binding payloads"
```

### Task 9: Tier 2 Verification And Report

**Files:**
- Create: `docs/reports/2026-03-14-analyze-memory-tier2-summary.json`

**Step 1: Capture Tier 2 measurements**

Run:

- `/usr/bin/time -l node gitnexus/dist/cli/index.js analyze --repo-alias neonnew-core`
- `/usr/bin/time -l node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto`
- Re-run the same context command once more

Expected: commands complete with updated `nodes/edges` and Unity query outputs

**Step 2: Run Tier 2 test set**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/kuzu/*.test.js gitnexus/dist/core/ingestion/unity-resource-processor.test.js gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: PASS

**Step 3: Write report**

```json
{
  "tier": 2,
  "focus": ["unity edge removal", "component payload slimming"],
  "measurements": {}
}
```

**Step 4: Verify report saved**

Run: `test -f docs/reports/2026-03-14-analyze-memory-tier2-summary.json && echo ok`
Expected: `ok`

**Step 5: Commit**

```bash
git add docs/reports/2026-03-14-analyze-memory-tier2-summary.json
git commit -m "docs(report): capture tier2 analyze memory measurements"
```

### Task 10: Add Unity Resource Summary Persistence And Dual-Read Query Support

**Files:**
- Modify: `gitnexus/src/core/graph/types.ts`
- Modify: `gitnexus/src/core/kuzu/schema.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.test.ts`

**Step 1: Write the failing test**

```ts
test('loadUnityContext can project UNITY_RESOURCE_SUMMARY rows before hydration', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/DoorObj.cs:DoorObj', async () => [
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
  ] as any);
  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.resourcePath, 'Assets/Doors/Door.prefab');
  assert.equal(out.resourceBindings[0]?.lightweight, true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: FAIL because `UNITY_RESOURCE_SUMMARY` is not yet projected

**Step 3: Write minimal implementation**

```ts
// Add UNITY_RESOURCE_SUMMARY to RelationshipType/REL_TYPES.
// Teach loadUnityContext/projectUnityBindings to accept File-targeted summary rows
// and project them into lightweight resourceBindings.
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/graph/types.ts gitnexus/src/core/kuzu/schema.ts gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-enrichment.test.ts
git commit -m "feat(unity): add resource summary persistence model"
```

### Task 11: Switch Analyze To Summary-Only Unity Persistence And Hydrate Full Results At Query Time

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.ts`
- Modify: `gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.test.ts`

**Step 1: Write the failing test**

```ts
test('summary-only Unity analyze persistence still returns full bindings after lazy hydration', async () => {
  const out = await hydrateLazyBindings({
    pendingPaths: ['Assets/Doors/Door.prefab'],
    config: { maxPendingPathsPerRequest: 10, batchSize: 5, maxHydrationMs: 5000 },
    resolveBatch: async () => new Map([
      ['Assets/Doors/Door.prefab', [{
        resourcePath: 'Assets/Doors/Door.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '114',
        serializedFields: { scalarFields: [{ name: 'Shows', value: '1', sourceLayer: 'prefab' }], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 12, lineText: 'm_Script: ...' },
      } as any]],
    ]),
  });
  assert.equal(out.resolvedByPath.get('Assets/Doors/Door.prefab')?.[0]?.serializedFields.scalarFields[0]?.name, 'Shows');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-enrichment.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: FAIL because analyze still expects component-node persistence or query path does not rehydrate summary-only rows

**Step 3: Write minimal implementation**

```ts
// Stop writing component CodeElement nodes during analyze.
// Persist only summary relations.
// local-backend must treat all summary rows as lightweight and rehydrate through overlay/hydrator.
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-enrichment.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts gitnexus/src/mcp/local/unity-enrichment.test.ts
git commit -m "feat(unity): move full binding recovery to query-time hydration"
```

### Task 12: Tier 3 Verification And Final Report

**Files:**
- Create: `docs/reports/2026-03-14-analyze-memory-tier3-summary.json`
- Modify: `docs/2026-03-10-u3-unity-resource-binding-release-runbook.md`

**Step 1: Capture Tier 3 measurements**

Run:

- `/usr/bin/time -l node gitnexus/dist/cli/index.js analyze --repo-alias neonnew-core`
- `/usr/bin/time -l node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto`
- Re-run the same context command once more
- `/usr/bin/time -l node gitnexus/dist/cli/index.js context AssetRef --repo neonnew-core --unity-resources on`

Expected: analyze + cold/warm Unity query outputs are available for comparison

**Step 2: Run final targeted suite**

Run: `npm --prefix gitnexus run build && npm --prefix gitnexus run test:unity && node --test gitnexus/dist/mcp/local/unity-enrichment.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js gitnexus/dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS

**Step 3: Update runbook with Tier 3 query-time expectations**

```md
- Tier 3 summary-only analyze persistence reduces build memory and DB size.
- Cold Unity queries may hydrate from source files; warm queries rely on overlay hit rate.
```

**Step 4: Write final report**

```json
{
  "tier": 3,
  "focus": ["summary-only analyze persistence", "query-time full hydration"],
  "measurements": {},
  "decision": {
    "keep": true,
    "notes": []
  }
}
```

**Step 5: Commit**

```bash
git add docs/reports/2026-03-14-analyze-memory-tier3-summary.json docs/2026-03-10-u3-unity-resource-binding-release-runbook.md
git commit -m "docs(report): capture tier3 analyze memory measurements"
```

### Task 13: Sync Rollout Results Back To Project Docs

**Files:**
- Create: `docs/reports/2026-03-14-analyze-memory-rollout-summary.md`
- Modify: `/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/GitNexus 全量索引内存优化专项设计.md`
- Modify: `/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus.md`

**Step 1: Write the rollout summary draft**

```md
# Analyze Memory Reduction Rollout Summary

- Baseline: analyze `141.47s`, RSS `6.38GB`
- Tier 1: runtime peak reduction only
- Tier 2: Unity graph slimming
- Tier 3: summary-only persistence + query-time hydration
- Final decision: keep / stop after tier N / roll back tier N
```

**Step 2: Update the Obsidian subproject doc with measured deltas**

```md
## 实施进展

1. Tier 1：记录 analyze RSS、time、query cold/warm 结果
2. Tier 2：记录 nodes/edges 与数据库体量变化
3. Tier 3：记录 cold/warm query tradeoff 与最终是否保留
```

**Step 3: Update the main project doc**

```md
- 全量索引内存优化专项：实施计划已执行完毕，结果见专项子文档与源码仓 `docs/reports/2026-03-14-analyze-memory-rollout-summary.md`
```

**Step 4: Verify all doc links and report references exist**

Run: `rg -n "analyze-memory-(tier1|tier2|tier3|rollout-summary)|内存优化专项" docs/reports "/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/GitNexus 全量索引内存优化专项设计.md" "/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus.md"`  
Expected: matching lines for all three tier reports, the rollout summary, and the subproject link

**Step 5: Commit repo-side rollout docs**

```bash
git add docs/reports/2026-03-14-analyze-memory-rollout-summary.md
git commit -m "docs(report): summarize analyze memory rollout"
```
