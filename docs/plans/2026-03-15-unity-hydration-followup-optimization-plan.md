# Unity Hydration Follow-up Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep default retrieval fast (`compact`) while making completeness judgment reliable, parity retry cheaper, and long-term stability measurable with enforceable gates.

**Architecture:** Continue with Tier3 summary-only analyze persistence, and strengthen the query-time hydration system in five areas: completeness semantics, parity cache governance, warmup concurrency control, benchmark observability, and regression gate enforcement. For parity first-hit cost, add analyze-time parity seed artifacts and consume them in parity hydration to avoid rebuilding expensive scan context from scratch.

**Tech Stack:** TypeScript, Node.js, GitNexus MCP LocalBackend, Unity scan-context/resolver pipeline, existing benchmark + node:test harness.

---

Skill refs for execution: `@superpowers/test-driven-development`, `@superpowers/verification-before-completion`.

Execution note: run this plan in an isolated worktree; keep commits task-scoped.

### Task 1: Refine Compact Completeness Classification

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.unity-merge.test.ts`

**Step 1: Write the failing test**

Add two tests in `local-backend.unity-merge.test.ts`:

```ts
test('compact result with no expandable bindings is complete', () => {
  // payload has no lightweight/summary row
  const out = attachUnityHydrationMeta(payload as any, {
    requestedMode: 'compact',
    effectiveMode: 'compact',
    elapsedMs: 5,
    fallbackToCompact: false,
    hasExpandableBindings: false,
  } as any);
  assert.equal(out.hydrationMeta?.isComplete, true);
  assert.equal(out.hydrationMeta?.needsParityRetry, false);
});

test('compact result with expandable bindings requests parity retry', () => {
  const out = attachUnityHydrationMeta(payloadWithSummary as any, {
    requestedMode: 'compact',
    effectiveMode: 'compact',
    elapsedMs: 5,
    fallbackToCompact: false,
    hasExpandableBindings: true,
  } as any);
  assert.equal(out.hydrationMeta?.isComplete, false);
  assert.equal(out.hydrationMeta?.needsParityRetry, true);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/local-backend.unity-merge.test.js
```

Expected: FAIL because `attachUnityHydrationMeta` does not yet accept/use `hasExpandableBindings`.

**Step 3: Write minimal implementation**

In `local-backend.ts`:
1. Extend `attachUnityHydrationMeta(...)` input with `hasExpandableBindings: boolean`.
2. Use `hasExpandableBindings` instead of only `effectiveMode === 'compact'` to add `mode_compact` reason.
3. In compact path, compute:
   - `hasExpandableBindings = input.payload.resourceBindings.some(binding => binding.lightweight || binding.componentObjectId === 'summary')`
4. Pass this flag to `attachUnityHydrationMeta`.

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/local-backend.unity-merge.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto 2>/tmp/hydration-gate-compact.json
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/hydration-gate-compact.json','utf8'));if(!j.hydrationMeta||typeof j.hydrationMeta.needsParityRetry!=='boolean')process.exit(1);console.log(j.hydrationMeta)"
```

Expected: command exits 0 and prints hydration meta.

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/local-backend.unity-merge.test.ts
git commit -m "feat(unity): refine compact completeness classification"
```

---

### Task 2: Add Parity Cache Governance (Max Entries + Eviction)

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-parity-cache.ts`
- Modify: `gitnexus/src/mcp/local/unity-parity-cache.test.ts`

**Step 1: Write the failing test**

Add test:

```ts
test('unity parity cache evicts oldest entries when max entries exceeded', async () => {
  await upsertUnityParityCache(storagePath, 'abc123', 'Class:A', payloadA as any, { maxEntries: 1 });
  await upsertUnityParityCache(storagePath, 'abc123', 'Class:B', payloadB as any, { maxEntries: 1 });
  const a = await readUnityParityCache(storagePath, 'abc123', 'Class:A');
  const b = await readUnityParityCache(storagePath, 'abc123', 'Class:B');
  assert.equal(a, null);
  assert.ok(b);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-cache.test.js
```

Expected: FAIL (new options/eviction not implemented).

**Step 3: Write minimal implementation**

In `unity-parity-cache.ts`:
1. Add cache options:
   - `maxEntries` (default from env `GITNEXUS_UNITY_PARITY_CACHE_MAX_ENTRIES`, fallback `500`).
2. Persist `updatedAt`.
3. After upsert, prune oldest entries in the shard document until `entries <= maxEntries`.

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-cache.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-cache.test.js gitnexus/dist/mcp/local/local-backend.unity-merge.test.js
```

Expected: PASS, no regression in hydration meta behavior.

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/unity-parity-cache.ts gitnexus/src/mcp/local/unity-parity-cache.test.ts
git commit -m "perf(unity): add parity cache eviction governance"
```

---

### Task 3: Add Warmup Queue + Concurrency Limit

**Files:**
- Create: `gitnexus/src/mcp/local/unity-parity-warmup-queue.ts`
- Create: `gitnexus/src/mcp/local/unity-parity-warmup-queue.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`

**Step 1: Write the failing test**

Create `unity-parity-warmup-queue.test.ts`:

```ts
test('runWarmupTask respects max parallel limit', async () => {
  let running = 0;
  let maxSeen = 0;
  const queue = createParityWarmupQueue({ maxParallel: 2 });
  await Promise.all(Array.from({ length: 6 }).map(() => queue.run(async () => {
    running += 1;
    maxSeen = Math.max(maxSeen, running);
    await new Promise(r => setTimeout(r, 20));
    running -= 1;
  })));
  assert.equal(maxSeen <= 2, true);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-warmup-queue.test.js
```

Expected: FAIL (`module not found`).

**Step 3: Write minimal implementation**

1. Implement queue module with semaphore-like `run()` and `maxParallel`.
2. In `local-backend.ts`, wrap `scheduleParityWarmup` execution with queue:
   - `maxParallel` from env `GITNEXUS_UNITY_PARITY_WARMUP_MAX_PARALLEL` (default `2`).
3. Keep current behavior:
   - warmup enabled only in long-running server mode (`GITNEXUS_UNITY_PARITY_WARMUP=1`).
   - CLI remains non-blocking and unaffected.

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-warmup-queue.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-warmup-queue.test.js gitnexus/dist/mcp/local/local-backend.unity-merge.test.js gitnexus/dist/mcp/local/unity-parity-cache.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/unity-parity-warmup-queue.ts gitnexus/src/mcp/local/unity-parity-warmup-queue.test.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "perf(unity): bound parity warmup concurrency"
```

---

### Task 4: Add Analyze-Time Parity Seed Artifact

**Files:**
- Create: `gitnexus/src/core/ingestion/unity-parity-seed.ts`
- Create: `gitnexus/src/core/ingestion/unity-parity-seed.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/types/pipeline.ts`
- Modify: `gitnexus/src/cli/analyze.ts`

**Step 1: Write the failing test**

Create `unity-parity-seed.test.ts`:

```ts
test('buildUnityParitySeed extracts canonical script/guid/resource indexes', () => {
  const seed = buildUnityParitySeed(mockScanContext as any);
  assert.ok(seed.symbolToScriptPath['DoorObj']);
  assert.ok(seed.scriptPathToGuid[seed.symbolToScriptPath['DoorObj']]);
  assert.ok(Array.isArray(seed.guidToResourcePaths[seed.scriptPathToGuid[seed.symbolToScriptPath['DoorObj']] ]));
});
```

Add processor/analyze integration assertion in existing tests to verify seed file persisted under storage path.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-parity-seed.test.js
```

Expected: FAIL (`module not found`).

**Step 3: Write minimal implementation**

1. Add parity seed type + builder in `unity-parity-seed.ts`.
2. In `unity-resource-processor.ts`, emit seed from scan context into `UnityResourceProcessingResult`.
3. In `pipeline.ts`/`types/pipeline.ts`, carry seed through runtime summary.
4. In `analyze.ts`, persist seed to `${storagePath}/unity-parity-seed.json`.

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-parity-seed.test.js gitnexus/dist/core/ingestion/unity-resource-processor.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js
```

Then run one scoped analyze and verify seed exists:

```bash
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonnew --repo-alias neonnew-core
test -f /Volumes/Shuttle/projects/neonnew/.gitnexus/unity-parity-seed.json
```

Expected: seed file exists.

**Step 6: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-parity-seed.ts gitnexus/src/core/ingestion/unity-parity-seed.test.ts gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze.ts
git commit -m "feat(unity): persist analyze-time parity seed artifact"
```

---

### Task 5: Consume Parity Seed in LocalBackend Parity Hydration

**Files:**
- Create: `gitnexus/src/mcp/local/unity-parity-seed-loader.ts`
- Create: `gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

Create loader test:

```ts
test('loadUnityParitySeed returns null on missing file and parsed object on valid file', async () => {
  const seed = await loadUnityParitySeed(storagePath);
  assert.equal(seed, null);
  await fs.writeFile(path.join(storagePath, 'unity-parity-seed.json'), JSON.stringify(validSeed), 'utf8');
  const loaded = await loadUnityParitySeed(storagePath);
  assert.equal(loaded?.version, 1);
});
```

Add parity hydration behavior test (mock scan context builder) to assert seed path preferred.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-seed-loader.test.js
```

Expected: FAIL (`module not found`).

**Step 3: Write minimal implementation**

1. Implement seed loader.
2. Add `buildUnityScanContextFromSeed(...)` fast-path in `scan-context.ts`:
   - reconstruct symbol/guid/resource maps from seed
   - keep compatible shape for resolver.
3. In `local-backend.ts` parity path:
   - try seed fast-path first
   - fallback to existing full `buildUnityScanContext` path.

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-parity-seed-loader.test.js gitnexus/dist/core/unity/scan-context.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run parity two-call check:

```bash
node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto --unity-hydration parity 2>/tmp/parity-seed-1.json
node gitnexus/dist/cli/index.js context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources auto --unity-hydration parity 2>/tmp/parity-seed-2.json
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('/tmp/parity-seed-1.json','utf8'));const b=JSON.parse(fs.readFileSync('/tmp/parity-seed-2.json','utf8'));if(a.hydrationMeta?.isComplete!==true||b.hydrationMeta?.isComplete!==true)process.exit(1);console.log('ok')"
```

Expected: both responses complete; second remains fast due cache.

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/unity-parity-seed-loader.ts gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "perf(unity): hydrate parity using analyze-time seed fast path"
```

---

### Task 6: Add Hydration Meta Benchmark + CI Gate

**Files:**
- Modify: `gitnexus/src/benchmark/unity-lazy-context-sampler.ts`
- Modify: `gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts`
- Modify: `gitnexus/src/benchmark/u2-performance-sampler.ts`
- Modify: `gitnexus/src/benchmark/u2-performance-sampler.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`
- Modify: `gitnexus/package.json`

**Step 1: Write the failing tests**

1. In `unity-lazy-context-sampler.test.ts`, assert sampler report includes hydration meta summary:

```ts
assert.equal(typeof report.hydrationMetaSummary.compactNeedsRetryRate, 'number');
assert.equal(typeof report.hydrationMetaSummary.parityCompleteRate, 'number');
```

2. In `retrieval-runner.test.ts`, add gate:

```ts
assert.ok(out.assertions.failures.some((f) => f.includes('hydrationMeta.needsParityRetry')));
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/unity-lazy-context-sampler.test.js gitnexus/dist/benchmark/u2-e2e/retrieval-runner.test.js
```

Expected: FAIL (missing new fields/assertions).

**Step 3: Write minimal implementation**

1. Extend sampler report schema with hydration meta stats.
2. Add new optional sampler arg `--unity-hydration <mode>`.
3. In retrieval-runner assertions, require hydration contract for `context(on)`:
   - default compact case: `needsParityRetry===true`
   - parity case: `isComplete===true`
4. Add npm script gate in `package.json`:

```json
"benchmark:unity:hydration-gates": "npm run build && node dist/benchmark/unity-lazy-context-sampler.js ... && node dist/benchmark/u2-performance-sampler.js ..."
```

**Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/unity-lazy-context-sampler.test.js gitnexus/dist/benchmark/u2-performance-sampler.test.js gitnexus/dist/benchmark/u2-e2e/retrieval-runner.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
npm --prefix gitnexus run test:u3:gates
npm --prefix gitnexus run benchmark:unity:hydration-gates -- --target-path /Volumes/Shuttle/projects/neonnew --repo neonnew-core --symbol DoorObj --file Assets/NEON/Code/Game/Doors/DoorObj.cs --report docs/reports/2026-03-15-unity-hydration-gates.json
```

Expected: both pass; report file produced with hydration-meta metrics.

**Step 6: Commit**

```bash
git add gitnexus/src/benchmark/unity-lazy-context-sampler.ts gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts gitnexus/src/benchmark/u2-performance-sampler.ts gitnexus/src/benchmark/u2-performance-sampler.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts gitnexus/package.json
git commit -m "test(benchmark): add hydration meta regression gates"
```

---

### Task 7: Update Project Docs + Rollout Report Gate

**Files:**
- Modify: `docs/reports/2026-03-14-analyze-memory-rollout-summary.md`
- Modify: `docs/reports/2026-03-14-analyze-memory-tier3-equivalence-check.json`
- Modify: `/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/GitNexus 全量索引内存优化专项设计.md`

**Step 1: Write failing doc-check test**

Create one lightweight assertion script in `gitnexus/src/benchmark/io.test.ts` (or add new test file) to ensure required keys exist in latest hydration report:

```ts
assert.ok(report.hydrationMetaSummary);
assert.ok(typeof report.hydrationMetaSummary.compactNeedsRetryRate === 'number');
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/io.test.js
```

Expected: FAIL until report/doc schema is updated.

**Step 3: Update docs and report templates**

1. Ensure rollout summary has explicit “default compact + parity retry contract” section.
2. Ensure equivalence report includes:
   - compact completeness signal
   - parity completeness signal
   - first/second parity latency.

**Step 4: Run test to verify pass**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/io.test.js
```

Expected: PASS.

**Step 5: Run verification gate**

Run:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/*.test.js gitnexus/dist/benchmark/*.test.js gitnexus/dist/benchmark/u2-e2e/*.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add docs/reports/2026-03-14-analyze-memory-rollout-summary.md docs/reports/2026-03-14-analyze-memory-tier3-equivalence-check.json "/Users/nantas-agent/Projects/obsidian-mind/20_项目/GitNexus 开发/GitNexus 全量索引内存优化专项设计.md"
git commit -m "docs(unity): sync hydration optimization rollout and gate contracts"
```

---

## Final Verification Checklist (Before Merge)

1. `npm --prefix gitnexus run build`
2. `node --test gitnexus/dist/mcp/local/*.test.js`
3. `node --test gitnexus/dist/core/unity/*.test.js`
4. `node --test gitnexus/dist/benchmark/*.test.js gitnexus/dist/benchmark/u2-e2e/*.test.js`
5. `npm --prefix gitnexus run test:u3:gates`
6. Real-repo manual check:
   - default compact response includes `needsParityRetry=true`
   - parity response includes `isComplete=true`
   - parity second call latency significantly below first call latency.

If any item fails, do not claim completion.
