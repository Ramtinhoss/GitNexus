# Unity Lazy Expand Performance Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Unity lazy expansion safe for real projects by preventing first-query memory spikes and unbounded latency, while preserving fast warm-cache queries.

**Architecture:** Keep analyze lightweight and move heavy parsing to query-time hydration, but strictly bound hydration work by chunking, budget, and in-flight dedupe. Replace monolithic overlay JSON with sharded/atomic storage so repeated queries are fast and concurrent-safe. Add a dedicated performance sampler + thresholds so regressions are detectable before release.

**Tech Stack:** TypeScript (Node.js), KuzuDB query path, local JSON overlay persistence, Node test runner, existing GitNexus benchmark infrastructure.

---

## Baseline and Acceptance

- Baseline (2026-03-14, `neonnew-core`):
  - `analyze`: `143.83s`, max RSS `6.32GB`
  - `context DoorObj` cold: `15.33s`, max RSS `3.70GB`
  - `context DoorObj` warm: `0.51s`, max RSS `0.64GB`
- Target after hardening:
  - cold lazy hydration does not parse all pending resources in one burst
  - first-query max RSS decreases materially (target `<2.0GB` for heavy symbol case)
  - warm query remains fast (target `<1.0s` in same case)
  - no overlay corruption or lost updates under concurrent queries

Skill refs for execution: `@superpowers/test-driven-development`, `@superpowers/verification-before-completion`.

### Task 1: Introduce Lazy Hydration Limits Config

**Files:**
- Create: `gitnexus/src/mcp/local/unity-lazy-config.ts`
- Test: `gitnexus/src/mcp/local/unity-lazy-config.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUnityLazyConfig } from './unity-lazy-config.js';

test('resolveUnityLazyConfig provides safe defaults', () => {
  const cfg = resolveUnityLazyConfig({});
  assert.equal(cfg.maxPendingPathsPerRequest, 120);
  assert.equal(cfg.batchSize, 30);
  assert.equal(cfg.maxHydrationMs, 5000);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-lazy-config.test.js`
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```ts
export interface UnityLazyConfig {
  maxPendingPathsPerRequest: number;
  batchSize: number;
  maxHydrationMs: number;
}

export function resolveUnityLazyConfig(env: NodeJS.ProcessEnv): UnityLazyConfig {
  return {
    maxPendingPathsPerRequest: Number(env.GITNEXUS_UNITY_LAZY_MAX_PATHS || 120),
    batchSize: Number(env.GITNEXUS_UNITY_LAZY_BATCH_SIZE || 30),
    maxHydrationMs: Number(env.GITNEXUS_UNITY_LAZY_MAX_MS || 5000),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-lazy-config.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-lazy-config.ts gitnexus/src/mcp/local/unity-lazy-config.test.ts
git commit -m "feat(unity): add lazy hydration config limits"
```

### Task 2: Extract Hydrator and Enforce Chunked/Budgeted Expansion

**Files:**
- Create: `gitnexus/src/mcp/local/unity-lazy-hydrator.ts`
- Test: `gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`

**Step 1: Write the failing test**

```ts
test('hydrateLazyBindings processes pending paths in bounded chunks', async () => {
  const calls: string[][] = [];
  await hydrateLazyBindings({
    pendingPaths: ['a','b','c','d','e'],
    config: { maxPendingPathsPerRequest: 4, batchSize: 2, maxHydrationMs: 5000 },
    resolveBatch: async (paths) => { calls.push(paths); return new Map(); },
  });
  assert.deepEqual(calls, [['a','b'], ['c','d']]);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: FAIL with module/function not found

**Step 3: Write minimal implementation**

```ts
for (const chunk of chunked(pending.slice(0, cfg.maxPendingPathsPerRequest), cfg.batchSize)) {
  if (Date.now() - startedAt > cfg.maxHydrationMs) break;
  const resolved = await deps.resolveBatch(chunk);
  mergeIntoResult(resolvedByPath, resolved);
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-lazy-hydrator.ts gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "refactor(unity): chunk and budget lazy hydration"
```

### Task 3: Add In-Flight Dedupe Lock (Per Symbol + Resource)

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-lazy-hydrator.ts`
- Test: `gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts`

**Step 1: Write the failing test**

```ts
test('parallel requests dedupe same hydration work', async () => {
  let resolveCalls = 0;
  await Promise.all([
    hydrateLazyBindings(sharedInput),
    hydrateLazyBindings(sharedInput),
  ]);
  assert.equal(resolveCalls, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: FAIL with `resolveCalls` > 1

**Step 3: Write minimal implementation**

```ts
const inFlight = new Map<string, Promise<ResolvedUnityBinding[]>>();
if (inFlight.has(key)) return inFlight.get(key)!;
const p = doResolve().finally(() => inFlight.delete(key));
inFlight.set(key, p);
return p;
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-lazy-hydrator.ts gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts
git commit -m "feat(unity): dedupe in-flight lazy hydration"
```

### Task 4: Shard Overlay Storage and Make Writes Atomic

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-lazy-overlay.ts`
- Test: `gitnexus/src/mcp/local/unity-lazy-overlay.test.ts`

**Step 1: Write the failing test**

```ts
test('overlay persists entries in shard files and supports atomic replace', async () => {
  await upsertUnityOverlayBindings(storage, commit, uid, map);
  const shards = await fs.readdir(path.join(storage, 'unity-lazy-overlay'));
  assert.ok(shards.length > 0);
  assert.ok(shards.every((name) => name.endsWith('.json')));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-lazy-overlay.test.js`
Expected: FAIL because legacy single-file storage is used

**Step 3: Write minimal implementation**

```ts
const shardPath = path.join(storagePath, 'unity-lazy-overlay', `${shardKey}.json`);
await fs.writeFile(`${shardPath}.tmp`, JSON.stringify(doc), 'utf-8');
await fs.rename(`${shardPath}.tmp`, shardPath);
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-lazy-overlay.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-lazy-overlay.ts gitnexus/src/mcp/local/unity-lazy-overlay.test.ts
git commit -m "perf(unity): shard and atomically update lazy overlay"
```

### Task 5: Integrate Config + Hydrator + Overlay Into Context Path

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.ts`
- Test: `gitnexus/src/mcp/local/unity-enrichment.test.ts`
- Test: `gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts`

**Step 1: Write the failing test**

```ts
test('context lazy hydration returns partial results when budget exceeded and reports diagnostics', async () => {
  const out = await hydrateLazyBindings({ config: { maxHydrationMs: 1, ... }, ... });
  assert.match(out.diagnostics.join('\n'), /budget exceeded/i);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/mcp/local/unity-enrichment.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: FAIL (no budget diagnostic / no partial handling)

**Step 3: Write minimal implementation**

```ts
if (timedOut) {
  diagnostics.push(`lazy-expand budget exceeded after ${elapsedMs}ms`);
}
return { resourceBindings: mergedBindings, unityDiagnostics: diagnostics, ... };
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-enrichment.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-enrichment.test.ts gitnexus/src/mcp/local/unity-lazy-hydrator.test.ts
git commit -m "feat(unity): enforce lazy hydration budgets in context path"
```

### Task 6: Add Performance Sampler and Threshold Gate for Lazy Context

**Files:**
- Create: `gitnexus/src/benchmark/unity-lazy-context-sampler.ts`
- Create: `gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts`
- Modify: `gitnexus/package.json`
- Create: `benchmarks/unity-baseline/neonspark-v2/unity-lazy-context-thresholds.json`

**Step 1: Write the failing test**

```ts
test('sampler emits cold/warm latency and rss metrics with threshold verdict', async () => {
  const report = await runUnityLazyContextSampler(fakeRunner, cfg);
  assert.ok(report.metrics.coldMs > 0);
  assert.ok(typeof report.thresholdVerdict.pass === 'boolean');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test gitnexus/dist/benchmark/unity-lazy-context-sampler.test.js`
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
export interface UnityLazyContextMetrics {
  coldMs: number;
  warmMs: number;
  coldMaxRssBytes: number;
  warmMaxRssBytes: number;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/unity-lazy-context-sampler.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/unity-lazy-context-sampler.ts gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts gitnexus/package.json benchmarks/unity-baseline/neonspark-v2/unity-lazy-context-thresholds.json
git commit -m "test(benchmark): add unity lazy context performance gate"
```

### Task 7: End-to-End Verification and Runbook Update

**Files:**
- Modify: `docs/2026-03-10-u3-unity-resource-binding-release-runbook.md`
- Create: `docs/reports/2026-03-14-unity-lazy-performance-hardening-summary.json`

**Step 1: Capture real-repo measurements (cold/warm/analyze)**

Run:
- `/usr/bin/time -l node gitnexus/dist/cli/index.js analyze --repo-alias neonnew-core`
- `/usr/bin/time -l node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto`
- Re-run the same context command once more

Expected: commands complete; metrics include `real` and `maximum resident set size`

**Step 2: Validate thresholds**

Run: `npm --prefix gitnexus run benchmark:u2:sample -- --target-path /Volumes/Shuttle/projects/neonnew`
Run: `node gitnexus/dist/benchmark/unity-lazy-context-sampler.js --target-path /Volumes/Shuttle/projects/neonnew --repo neonnew-core --symbol DoorObj --file Assets/NEON/Code/Game/Doors/DoorObj.cs --thresholds benchmarks/unity-baseline/neonspark-v2/unity-lazy-context-thresholds.json`
Expected: threshold verdict `pass=true`

**Step 3: Update runbook with operational knobs**

```md
- GITNEXUS_UNITY_LAZY_MAX_PATHS
- GITNEXUS_UNITY_LAZY_BATCH_SIZE
- GITNEXUS_UNITY_LAZY_MAX_MS
- lazy diagnostics interpretation
```

**Step 4: Run full targeted test set**

Run:
`npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-lazy-overlay.test.js gitnexus/dist/mcp/local/unity-lazy-hydrator.test.js gitnexus/dist/core/unity/resolver.test.js gitnexus/dist/mcp/local/unity-enrichment.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/2026-03-10-u3-unity-resource-binding-release-runbook.md docs/reports/2026-03-14-unity-lazy-performance-hardening-summary.json
git commit -m "docs(unity): add lazy expansion performance runbook and verification report"
```

## Notes

- Keep changes DRY and YAGNI: no new DB schema for this phase; keep overlay as local file storage with shard safety.
- Preserve backward compatibility with existing lightweight payloads (`line-*` + empty serialized fields).
- Prefer small commits per task to isolate regressions and make rollback easy.
