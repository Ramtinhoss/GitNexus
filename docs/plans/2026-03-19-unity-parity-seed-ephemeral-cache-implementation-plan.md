# Unity Parity Seed Ephemeral Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate duplicate `unity-parity-seed.json` disk reads under concurrent parity hydration while ensuring cached seed data is released from memory when idle.

**Architecture:** Implement a short-lived in-memory cache plus singleflight deduplication inside `unity-parity-seed-loader`, keyed by `storagePath + indexedCommit + seed mtimeMs` to avoid stale data reuse after re-analyze. Keep parity orchestration unchanged and only pass `indexedCommit` from `LocalBackend` to the loader. Use small bounded cache (1-2 entries) with idle TTL and `timer.unref()` so memory is released without active parity workload.

**Tech Stack:** TypeScript, Node.js (`fs/promises`, `node:test`), GitNexus MCP local backend, existing Unity parity hydration pipeline.

---

## Preconditions (must do first)

- Relevant skills to invoke during execution:
  - `@superpowers:using-superpowers`
  - `@superpowers:using-git-worktrees` (unless preflight says `worktree-exempt=true`)
  - `@superpowers:verification-before-completion`
- This plan targets the **v1.3.11 parity codepath**. Mainline `v1.4.6` has diverged; do not patch the wrong branch.

### Task 0: Create Isolated Hotfix Workspace

**Files:**
- Modify: none (workspace setup only)

**Step 1: Create worktree from `v1.3.11` tag**

Run:
```bash
git fetch --tags
git worktree add .worktrees/v1.3.11-seed-cache -b fix/v1.3.11-seed-ephemeral-cache 72b6c43
```
Expected: new checkout at `.worktrees/v1.3.11-seed-cache`.

**Step 2: Verify target files exist in this workspace**

Run:
```bash
rg -n "loadUnityParitySeed|computeParityPayload|buildUnityScanContextFromSeed" \
  gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-parity-seed-loader.ts
```
Expected: non-empty matches in both files.

**Step 3: Commit nothing; checkpoint branch state**

Run:
```bash
git status --short
```
Expected: clean working tree.

---

### Task 1: Add Failing Tests for Concurrent Dedup + Idle Release

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts`
- Test: `gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts`

**Step 1: Write failing test - concurrent requests should read disk once**

Add test:
```ts
test('loadUnityParitySeed deduplicates concurrent reads for same cache key', async () => {
  // Arrange valid seed file in tmp storagePath.
  // Monkey-patch fs.readFile to count calls and add small delay.
  // Act with Promise.all([loadUnityParitySeed(...), ...]) 10 times.
  // Assert readFile called exactly once and all results non-null.
});
```

**Step 2: Write failing test - cache expires after idle TTL**

Add test:
```ts
test('loadUnityParitySeed evicts cache entry after idle ttl', async () => {
  // Set env idle TTL to tiny value (e.g. 15ms).
  // First call warms cache; second immediate call should not hit readFile.
  // Wait > ttl; third call should hit readFile again.
});
```

**Step 3: Write failing test - mtime change invalidates cache key**

Add test:
```ts
test('loadUnityParitySeed cache key changes when seed mtime changes', async () => {
  // First call loads version A.
  // Rewrite same file content/shape to version B and bump mtime.
  // Next call should re-read and return updated mapping.
});
```

**Step 4: Run targeted test file and confirm failures**

Run:
```bash
cd gitnexus
npm run build
node --test dist/mcp/local/unity-parity-seed-loader.test.js
```
Expected: FAIL on new assertions (read count / eviction / invalidation not satisfied yet).

**Step 5: Commit failing tests**

```bash
git add gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts
git commit -m "test: add failing tests for unity parity seed singleflight and idle cache"
```

---

### Task 2: Implement Minimal Ephemeral Cache in Seed Loader

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-parity-seed-loader.ts`
- Test: `gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts`

**Step 1: Add singleflight map keyed by resolved seed cache key**

Implement shape:
```ts
const inFlightLoads = new Map<string, Promise<UnityParitySeed | null>>();
```
Behavior:
- For same key, return existing promise.
- Always clear map entry in `.finally()`.

**Step 2: Add bounded idle cache with timer-based eviction**

Implement shape:
```ts
interface SeedCacheEntry {
  value: UnityParitySeed | null;
  lastAccessMs: number;
  timer?: NodeJS.Timeout;
}
const seedCache = new Map<string, SeedCacheEntry>();
```
Rules:
- Default idle TTL: `30000ms`.
- Default max entries: `2`.
- Read env overrides:
  - `GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS`
  - `GITNEXUS_UNITY_PARITY_SEED_CACHE_MAX_ENTRIES`
- On hit: refresh idle timer.
- On insert: prune oldest if over limit.
- `timer.unref()` when available.

**Step 3: Build explicit cache key including staleness guard**

Key parts:
```ts
${storagePath}::${indexedCommit || 'no-commit'}::${seedMtimeMs}
```
Implementation detail:
- `stat(seedPath)` to get `mtimeMs`.
- If file missing (`ENOENT`), return `null` and do not throw.

**Step 4: Keep parser validation fail-closed behavior unchanged**

Preserve:
- Invalid schema -> `null`
- JSON parse error -> `null`
- Non-ENOENT IO errors -> throw

**Step 5: Add test-only reset helper (minimal API)**

Add export:
```ts
export function __resetUnityParitySeedLoaderCacheForTest(): void {
  // clear inFlight + cache + timers
}
```
Use only in tests to avoid state bleed.

**Step 6: Run tests and make sure they pass**

Run:
```bash
cd gitnexus
npm run build
node --test dist/mcp/local/unity-parity-seed-loader.test.js
```
Expected: PASS.

**Step 7: Commit implementation**

```bash
git add gitnexus/src/mcp/local/unity-parity-seed-loader.ts gitnexus/src/mcp/local/unity-parity-seed-loader.test.ts
git commit -m "feat: add singleflight and idle-bounded cache for unity parity seed loader"
```

---

### Task 3: Wire `indexedCommit` from Parity Caller (Minimal Surface)

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/src/mcp/local/local-backend.unity-merge.test.ts` (only if signature adaptation needs explicit compile/runtime coverage)

**Step 1: Update loader call in parity path**

Change:
```ts
const paritySeed = await loadUnityParitySeed(repo.storagePath);
```
To:
```ts
const paritySeed = await loadUnityParitySeed(repo.storagePath, { indexedCommit: repo.lastCommit });
```

**Step 2: Keep behavior unchanged when seed missing/invalid**

No logic changes around fallback:
- still fall back to `buildUnityScanContext(...)` when seeded path unavailable or yields empty bindings.

**Step 3: Run focused tests for parity path safety**

Run:
```bash
cd gitnexus
npm run build
node --test dist/mcp/local/local-backend.unity-merge.test.js dist/mcp/local/unity-parity-seed-loader.test.js
```
Expected: PASS.

**Step 4: Commit caller wiring**

```bash
git add gitnexus/src/mcp/local/local-backend.ts
git commit -m "refactor: pass indexed commit to unity parity seed loader cache key"
```

---

### Task 4: End-to-End Verification and Release-Readiness Check

**Files:**
- Modify: none unless failures found
- Test: existing suites only

**Step 1: Run required Unity-related gate tests**

Run:
```bash
cd gitnexus
npm run test:u3:gates
```
Expected: PASS.

**Step 2: Spot-check no regression in parity cache behavior**

Run:
```bash
node --test dist/mcp/local/unity-parity-cache.test.js dist/mcp/local/unity-lazy-overlay.test.js
```
Expected: PASS.

**Step 3: Optional micro-benchmark sanity check (local)**

Run:
```bash
node -e "console.log('manual check: run representative context/query parity calls and compare wall-clock before/after')"
```
Expected: Documented note in PR (no strict threshold gate).

**Step 4: Final commit only if follow-up fixes were required**

```bash
git add -A
git commit -m "fix: address parity seed cache verification follow-ups"
```

---

## Implementation Notes (keep it engineered-enough)

- DRY: keep cache concerns encapsulated in loader; do not duplicate cache logic in backend.
- YAGNI: no cross-process shared cache, no new service/module.
- Explicit over clever: use direct key composition + small helper functions.
- Memory safety: short TTL + bounded entries + timer cleanup/reset.

## Risk Checklist

- Concurrent parity for different symbols same repo should coalesce to one seed read.
- New cache must not mask updated seed after re-analyze.
- Cache/timer state must not leak across tests.
- Fail-closed parse behavior must remain identical.

## PR Checklist

- [ ] Includes failing tests commit first, then implementation commits.
- [ ] Confirms branch target is `fix/v1.3.11-seed-ephemeral-cache` (not mainline divergence).
- [ ] Includes test evidence in PR description (command + PASS snippet).
- [ ] Mentions env knobs and defaults in PR notes:
  - `GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS` (default 30000)
  - `GITNEXUS_UNITY_PARITY_SEED_CACHE_MAX_ENTRIES` (default 2)
