# Phase1 Unity Runtime Process Schema Hygiene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Unity `UNITY_RESOURCE_SUMMARY` relations durable in LadybugDB and make analyze fallback counters truthful (`attempted/succeeded/failed`) so Phase2+ can rely on stable resource evidence.

**Architecture:** Phase1 is split into two hard contracts: relation-schema durability and fallback-counter correctness. We first lock failing tests for `Class -> File` persistence and fallback stat accounting, then implement the smallest schema + loader + CLI summary wiring to pass. Verification uses the mini Unity fixture for deterministic DB checks and one sampled real Unity repo run for warning-surface sanity.

**Tech Stack:** TypeScript, Node.js `node:test`, GitNexus CLI (`analyze`, `cypher`), LadybugDB adapter, Unity mini fixture (`src/core/unity/__fixtures__/mini-unity`).

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added red contracts in `schema.test.ts`, `unity-resource-processor.test.ts`, and `analyze-summary.test.ts`; `npm --prefix gitnexus run build && node --test ...` failed as expected with missing `resolveFallbackStats` export.
Task 2 | completed | Added `FROM Class TO File` and audited fallback relation pairs; focused tests passed; mini-fixture analyze smoke produced no `Class->File ... missing rel pair` output.
Task 3 | completed | Added red tests for fallback replay helper and warning-derived stats; targeted build failed as expected with missing `fallback-relationship-replay` module.
Task 4 | completed | Implemented fallback replay stats helper and adapter wiring; analyze CLI now resolves fallback stats from runtime outcomes; focused tests and `npm --prefix gitnexus run test:u3:gates` passed.
Task 5 | completed | Corrected fixture alias drift (`unity-mini-phase0` -> in-repo mini fixture), verified cypher `cnt=6` (`>0`), sampled real repo warning-surface check clean, and updated Phase1 report + phased design execution record.

## Skill Hooks

- `@gitnexus-cli` for `analyze/status/cypher` verification loops.
- `@gitnexus-exploring` for tracing warning origins if new fallback pairs appear.
- `@superpowers:verification-before-completion` before claiming Phase1 done.

### Task 1: Lock Phase1 Failing Contracts (Red)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/lbug/schema.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Modify: `gitnexus/src/cli/analyze-summary.test.ts`
- Test: `gitnexus/src/core/lbug/schema.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/cli/analyze-summary.test.ts`

**Step 1: Add schema guard for Unity summary relation pair**

```ts
// schema.test.ts
const requiredPairs = [
  // existing audited pairs...
  'FROM Class TO File',
];
```

**Step 2: Add DB persistence contract for `UNITY_RESOURCE_SUMMARY`**

```ts
// unity-resource-processor.test.ts
const rows = await executeQuery(
  `MATCH (c:Class)-[r:CodeRelation {type:'UNITY_RESOURCE_SUMMARY'}]->(f:File)
   RETURN count(r) AS cnt`,
);
assert.ok((rows?.[0]?.cnt ?? 0) > 0, 'UNITY_RESOURCE_SUMMARY must persist in LadybugDB');
```

**Step 3: Add fallback summary contract that prefers real runtime stats**

```ts
// analyze-summary.test.ts
assert.deepEqual(
  resolveFallbackStats(
    ['Class->File (12 edges): missing rel pair in schema'],
    { attempted: 12, succeeded: 3, failed: 9 },
  ),
  { attempted: 12, succeeded: 3, failed: 9 },
);
```

**Step 4: Run tests to confirm red state**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/lbug/schema.test.js gitnexus/dist/core/ingestion/unity-resource-processor.test.js gitnexus/dist/cli/analyze-summary.test.js`
Expected: FAIL (missing `Class -> File` pair and missing `resolveFallbackStats` implementation).

**Step 5: Commit failing tests**

```bash
git add gitnexus/src/core/lbug/schema.test.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts gitnexus/src/cli/analyze-summary.test.ts
git commit -m "test(unity-phase1): lock schema persistence and fallback stats contracts"
```

### Task 2: Implement Schema Hygiene for Unity Summary Persistence

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/lbug/schema.ts`
- Modify: `gitnexus/src/core/lbug/schema.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/core/lbug/schema.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Add missing relation pair(s) with `Class -> File` as mandatory**

```ts
// schema.ts inside RELATION_SCHEMA
FROM Class TO Method,
FROM Class TO Function,
FROM Class TO File,
FROM Class TO Class,
```

**Step 2: Keep audited pair list in test synchronized with schema**

```ts
for (const pair of requiredPairs) {
  assert.match(RELATION_SCHEMA, new RegExp(escapeForRegex(pair)));
}
```

**Step 3: Re-run focused tests and verify persistence contract turns green**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/lbug/schema.test.js gitnexus/dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS.

**Step 4: Smoke check fallback warning surface for Unity summary pair**

Run: `node gitnexus/dist/cli/index.js analyze /tmp/unity-mini-phase0 --repo-alias unity-mini-phase0 --force --extensions .cs | rg "Fallback edges|Class->File|UNITY_RESOURCE_SUMMARY"`
Expected: no `Class->File ... missing rel pair` in analyze output.

**Step 5: Commit schema hygiene implementation**

```bash
git add gitnexus/src/core/lbug/schema.ts gitnexus/src/core/lbug/schema.test.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "fix(unity-phase1): persist UNITY_RESOURCE_SUMMARY via Class-to-File relation pair"
```

### Task 3: Lock Fallback Counter Truthfulness Contracts (Red)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/lbug/fallback-relationship-replay.test.ts`
- Modify: `gitnexus/src/cli/analyze-summary.test.ts`
- Test: `gitnexus/src/core/lbug/fallback-relationship-replay.test.ts`
- Test: `gitnexus/src/cli/analyze-summary.test.ts`

**Step 1: Add replay counter test for mixed success/failure inserts**

```ts
// fallback-relationship-replay.test.ts
assert.deepEqual(stats, {
  attempted: 3,
  succeeded: 2,
  failed: 1,
});
```

**Step 2: Add warning-only fallback test for stats derivation**

```ts
assert.deepEqual(
  resolveFallbackStats(['Class->File (7 edges): missing rel pair in schema'], undefined),
  { attempted: 7, succeeded: 0, failed: 7 },
);
```

**Step 3: Run targeted tests to confirm red state**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/lbug/fallback-relationship-replay.test.js gitnexus/dist/cli/analyze-summary.test.js`
Expected: FAIL (new replay helper and stats resolver not implemented).

**Step 4: Commit failing counter-contract tests**

```bash
git add gitnexus/src/core/lbug/fallback-relationship-replay.test.ts gitnexus/src/cli/analyze-summary.test.ts
git commit -m "test(unity-phase1): lock fallback insert counter contracts"
```

### Task 4: Implement Fallback Replay Stats + Analyze Summary Wiring

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/lbug/fallback-relationship-replay.ts`
- Modify: `gitnexus/src/core/lbug/lbug-adapter.ts`
- Modify: `gitnexus/src/cli/analyze-summary.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/core/lbug/fallback-relationship-replay.test.ts`
- Modify: `gitnexus/src/cli/analyze-summary.test.ts`
- Test: `gitnexus/src/core/lbug/fallback-relationship-replay.test.ts`
- Test: `gitnexus/src/cli/analyze-summary.test.ts`

**Step 1: Implement replay helper returning precise counters**

```ts
export interface FallbackInsertStats {
  attempted: number;
  succeeded: number;
  failed: number;
}

export async function replayFallbackRelationships(...): Promise<FallbackInsertStats> {
  // attempted increments per valid fallback edge
  // succeeded/failed reflect per-edge insert result
}
```

**Step 2: Wire adapter to return fallback stats from real insert outcomes**

```ts
const fallbackInsertStats = await fallbackRelationshipInserts(...);
return { success: true, insertedRels, skippedRels, warnings, fallbackInsertStats };
```

**Step 3: Add summary resolver and consume it in analyze CLI output**

```ts
// analyze-summary.ts
export function resolveFallbackStats(
  warnings: string[] | undefined,
  stats: FallbackInsertStats | undefined,
): FallbackInsertStats { ... }

// analyze.ts
const fallbackStats = resolveFallbackStats(lbugWarnings, lbugResult.fallbackInsertStats);
```

**Step 4: Run focused tests, then regression gate**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/lbug/fallback-relationship-replay.test.js gitnexus/dist/cli/analyze-summary.test.js`
Expected: PASS.

Run: `npm --prefix gitnexus run test:u3:gates`
Expected: PASS.

**Step 5: Commit fallback stats implementation**

```bash
git add gitnexus/src/core/lbug/fallback-relationship-replay.ts gitnexus/src/core/lbug/lbug-adapter.ts gitnexus/src/cli/analyze-summary.ts gitnexus/src/cli/analyze.ts gitnexus/src/core/lbug/fallback-relationship-replay.test.ts gitnexus/src/cli/analyze-summary.test.ts
git commit -m "fix(analyze): report truthful fallback insert attempted/succeeded/failed stats"
```

### Task 5: Phase1 Verification Pack + Docs Closure

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-03-31-phase1-unity-runtime-process-schema-hygiene-report.md`
- Modify: `docs/2026-03-31-unity-runtime-process-phased-design.md`

**Step 1: Verify mini fixture persisted summary edges via Cypher**

Run: `node gitnexus/dist/cli/index.js cypher "MATCH (c:Class)-[r:CodeRelation {type:'UNITY_RESOURCE_SUMMARY'}]->(f:File) RETURN count(r) AS cnt" -r unity-mini-phase0`
Expected: `cnt > 0`.

**Step 2: Verify sampled real Unity repo warning surface**

Run: `node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonnew --repo-alias neonnew-core --extensions .cs --scope-prefix Assets/NEON/Code --force | rg "Fallback edges|Class->File"`
Expected: no `Class->File ... missing rel pair` warning; fallback counters, if present, are non-optimistic (`failed` may be non-zero).

**Step 3: Record facts and deltas in report**

```md
# Phase1 Schema Hygiene Verification Report
- fixture cypher count
- analyze fallback summary line before/after
- test:u3:gates result
- residual risk and next-phase dependency
```

**Step 4: Update Phase1 section in phased design doc with execution record**

```md
#### Phase 1 Execution Record (2026-03-31)
- relation pairs added
- fallback stats reporting fix
- verification artifacts and gate results
```

**Step 5: Commit docs and verification artifacts**

```bash
git add docs/reports/2026-03-31-phase1-unity-runtime-process-schema-hygiene-report.md docs/2026-03-31-unity-runtime-process-phased-design.md
git commit -m "docs(unity-phase1): record schema hygiene verification and execution evidence"
```

---

## Final Verification Checklist

- `MATCH (c:Class)-[r:CodeRelation {type:'UNITY_RESOURCE_SUMMARY'}]->(f:File) RETURN count(r)` returns `> 0` on `unity-mini-phase0`.
- Analyze output fallback summary no longer hardcodes `succeeded=attempted, failed=0`.
- `npm --prefix gitnexus run test:u3:gates` is green after Phase1 changes.
- Phase1 execution evidence is captured in report + phased design doc.

---

## Design Traceability Matrix

| Requirement | Implemented By | Verification |
| --- | --- | --- |
| Persist `UNITY_RESOURCE_SUMMARY` edges as durable `Class -> File` relations | Task 1 (red test), Task 2 (schema + persistence implementation) | `schema.test.ts`, `unity-resource-processor.test.ts`, mini fixture analyze smoke |
| Fallback counters must report truthful `attempted/succeeded/failed` | Task 1 (summary contract), Task 3 (red counter contracts), Task 4 (replay helper + CLI wiring) | `fallback-relationship-replay.test.ts`, `analyze-summary.test.ts`, `test:u3:gates` |
| Phase1 evidence must be recorded for Phase2 handoff | Task 5 (verification pack + design doc update) | report markdown artifact + phased design execution record |

## Plan Audit Verdict

- scope_coherence: pass
- verification_coverage: pass
- execution_granularity: pass
- dependency_ordering: pass
- risk_visibility: pass
- approval_decision: pass
