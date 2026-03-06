# Unity Enrich Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate repeated full-repo scans in Unity enrich while preserving output completeness and existing query semantics.

**Architecture:** Refactor Unity enrich from per-class full scan to a two-stage flow: build one `UnityScanContext` per analyze run, then join class nodes against in-memory indexes. Keep pipeline topology unchanged, only add minimal input plumbing (`scopedPaths`) so enrich can align with analyze scope/extension filters.

**Tech Stack:** TypeScript (Node ESM), existing GitNexus ingestion pipeline, Node test runner (`node:test`), glob/fs-based Unity scanners.

---

### Task 1: Introduce `UnityScanContext` contract and builder

**Files:**
- Create: `gitnexus/src/core/unity/scan-context.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`
- Modify: `gitnexus/src/core/unity/meta-index.ts`
- Modify: `gitnexus/src/core/unity/resource-hit-scanner.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnityScanContext } from './scan-context.js';

test('buildUnityScanContext builds symbol/guid/hit indexes once from fixture', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.ok(context.symbolToScriptPath.has('MainUIManager'));
  assert.ok(context.scriptPathToGuid.size > 0);
  assert.ok(context.guidToResourceHits.size > 0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/scan-context.test.js`  
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

```ts
export interface UnityScanContext {
  symbolToScriptPath: Map<string, string>;
  scriptPathToGuid: Map<string, string>;
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>;
  resourceDocCache: Map<string, UnityObjectBlock[]>;
}

export async function buildUnityScanContext(input: BuildScanContextInput): Promise<UnityScanContext> {
  // single pass: collect cs/meta/resources and construct maps
}
```

**Step 4: Add optional scoped file inputs for scanners**

```ts
buildMetaIndex(repoRoot, { metaFiles?: string[] })
findGuidHits(repoRoot, guid, { resourceFiles?: string[] })
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/meta-index.test.js dist/core/unity/resource-hit-scanner.test.js dist/core/unity/scan-context.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts gitnexus/src/core/unity/meta-index.ts gitnexus/src/core/unity/resource-hit-scanner.ts
git commit -m "refactor: add unity scan context builder"
```

### Task 2: Refactor resolver to support prebuilt scan context

**Files:**
- Modify: `gitnexus/src/core/unity/resolver.ts`
- Test: `gitnexus/src/core/unity/resolver.test.ts`

**Step 1: Write the failing test**

```ts
test('resolveUnityBindings uses provided scan context without repo re-scan', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  assert.ok(result.resourceBindings.length > 0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/resolver.test.js`  
Expected: FAIL with `scanContext` type/parameter mismatch.

**Step 3: Write minimal implementation**

```ts
export interface ResolveInput {
  repoRoot: string;
  symbol: string;
  scanContext?: UnityScanContext;
}

// when scanContext exists, reuse maps; fallback to legacy path for compatibility
```

**Step 4: Add lazy per-resource YAML cache usage**

```ts
const cached = scanContext.resourceDocCache.get(hit.resourcePath);
if (!cached) {
  scanContext.resourceDocCache.set(hit.resourcePath, parseUnityYamlObjects(raw));
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/*.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/resolver.ts gitnexus/src/core/unity/resolver.test.ts
git commit -m "refactor: allow resolver to reuse unity scan context"
```

### Task 3: Refactor `processUnityResources` to two-stage execution

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing test**

```ts
test('processUnityResources builds scan context once and enriches all class nodes', async () => {
  const result = await processUnityResources(graph, { repoPath: fixtureRoot, scopedPaths: ['Assets/Scripts/MainUIManager.cs'] });
  assert.ok(result.processedSymbols > 0);
  assert.ok(result.bindingCount > 0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: FAIL with unknown `scopedPaths` option or missing behavior.

**Step 3: Write minimal implementation**

```ts
export async function processUnityResources(
  graph: KnowledgeGraph,
  options: { repoPath: string; scopedPaths?: string[] },
)
```

```ts
const scanContext = await buildUnityScanContext({ repoRoot: options.repoPath, scopedPaths: options.scopedPaths });
for (const classNode of classNodes) {
  await resolveUnityBindings({ repoRoot: options.repoPath, symbol, scanContext });
}
```

**Step 4: Add diagnostics counters in result payload**

```ts
unityDiagnostics.push(`scanContext: scripts=${...}, guids=${...}, resources=${...}`);
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js dist/core/unity/*.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "refactor: switch unity resource processor to two-stage enrich"
```

### Task 4: Wire scoped paths from pipeline into Unity enrich

**Files:**
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Modify: `gitnexus/src/types/pipeline.ts`
- Test: `gitnexus/src/cli/analyze-multi-scope-regression.test.ts`

**Step 1: Write the failing test**

```ts
test('pipeline forwards extension-filtered scoped paths to unity enrich', async () => {
  // spy/stub processUnityResources and assert scopedPaths received
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-multi-scope-regression.test.js`  
Expected: FAIL because scoped path forwarding is absent.

**Step 3: Write minimal implementation**

```ts
const allPaths = extensionFiltered.map(f => f.path);
...
const unityResult = await processUnityResources(graph, { repoPath, scopedPaths: allPaths });
```

**Step 4: Preserve backward compatibility for callers**

```ts
// keep processUnityResources options optional/default-safe
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/cli/analyze-multi-scope-regression.test.js dist/core/ingestion/unity-resource-processor.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/ingestion/pipeline.ts gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze-multi-scope-regression.test.ts
git commit -m "refactor: pass scoped paths into unity enrich stage"
```

### Task 5: Add cache-hit behavior tests to prevent regression

**Files:**
- Test: `gitnexus/src/core/unity/resolver.test.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

```ts
test('resource YAML parse is reused across symbols sharing same resource file', async () => {
  // inject parser/read spies and assert one parse per resourcePath
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/resolver.test.js dist/core/unity/scan-context.test.js`  
Expected: FAIL with call-count mismatch.

**Step 3: Implement minimal fix if needed**

```ts
// centralize cache lookup/set in resolver helper to avoid bypass paths
```

**Step 4: Re-run target tests**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/resolver.test.js dist/core/unity/scan-context.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/resolver.test.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "test: lock unity enrich cache reuse behavior"
```

### Task 6: End-to-end regression and docs sync

**Files:**
- Modify: `docs/reports/2026-03-06-unity-resource-cross-reference-acceptance.md`
- Modify: `docs/plans/2026-03-06-unity-enrich-performance-design.md`

**Step 1: Run full relevant suite**

Run:

```bash
cd gitnexus
npm run build
node --test \
  dist/core/unity/*.test.js \
  dist/core/ingestion/unity-resource-processor.test.js \
  dist/cli/unity-bindings.test.js \
  dist/mcp/local/unity-enrichment.test.js \
  dist/cli/analyze-multi-scope-regression.test.js
```

Expected: PASS with no Unity regression.

**Step 2: Capture before/after diagnostics sample**

```bash
# keep one scoped analyze sample for diagnostics comparison
gitnexus analyze --repo-alias neonspark-unity-acceptance --scope-prefix Assets/NEON/Code/VeewoUI/MainUIManager.cs --extensions .cs --force
```

Expected: enrich diagnostics now include scan-context stats.

**Step 3: Update docs with implementation status**

```md
- mark design items as implemented
- append regression evidence and known limitations
```

**Step 4: Final verify**

Run: `git status --short`  
Expected: only intended files changed.

**Step 5: Commit**

```bash
git add docs/reports/2026-03-06-unity-resource-cross-reference-acceptance.md docs/plans/2026-03-06-unity-enrich-performance-design.md
git commit -m "docs: record unity enrich optimization verification"
```
