# Graph-Only Runtime Retrieval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace retrieval-time rule matching with graph-only seeded/symbol runtime closure verification, while keeping rules build-time only.

**Architecture:** Keep analyze-time synthetic-edge production unchanged as gap-patch mechanism. Add a graph-only verifier path that consumes structured anchors (`symbolName/resourceSeedPath/mappedSeedTargets/resourceBindings`) and computes closure over Anchor/Bind/Bridge/Runtime segments. Keep provenance in standalone offline artifacts for regression governance, not for online retrieval ranking.

**Tech Stack:** TypeScript, GitNexus MCP local backend, ingestion pipeline, Vitest unit/integration tests, benchmark runners.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Graph-only retrieval verifier (no retrieval rule load) | critical | Task 2, Task 4 | `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts` | `runtime_claim.reason`, `runtime_chain.status` | verifier still depends on trigger token match
DC-02 Precision-first full-closure gate | critical | Task 3, Task 6 | `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "verified_full"` | `runtime_chain.evidence_level`, `runtime_claim.status` | `verified_full` emitted when segments are incomplete
DC-03 Seeded/symbol-only input contract | critical | Task 1, Task 4 | `pnpm vitest gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts` | query/context call args to verifier | verifier still uses `queryText` as primary match signal
DC-04 PoC parity gate before cutover | critical | Task 5, Task 7 | `node gitnexus/dist/cli/index.js benchmark runtime-poc --repo neonspark-core` | `docs/reports/runtime-poc/*.json` | missing baseline-vs-graph-only comparison or unexplained regressions
DC-05 Offline provenance-only governance | critical | Task 5, Task 8 | `pnpm vitest gitnexus/test/integration/runtime-provenance-artifact.test.ts` | `docs/reports/runtime-poc/provenance-index.json` | online retrieval depends on provenance artifact or artifact missing required fields

## Authenticity Assertions

- Assert no placeholder path in benchmark and report outputs.
- Assert graph-only live mode produces hop anchors from graph evidence (not synthetic mocked placeholders).
- Assert `verified_full` requires all four segments and fails negative tests with missing Anchor/Bind/Bridge/Runtime evidence.
- Assert rule-file removal for retrieval paths does not silently fallback to token matching.
- Assert offline provenance artifact is generated and consumed only by PoC/report tooling, not by query-time verifier.

### Task 1: Add Graph-Only Verifier Input Contract Tests

**Files:**
- Create: `gitnexus/test/unit/runtime-chain-verify-graph-only-input.test.ts`
- Modify: `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`

**Step 1: Write the failing test**

```ts
it('does not use queryText as primary verifier match signal', async () => {
  // queryText present but no structured anchors => should fail conservative gate
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only-input.test.ts`  
Expected: FAIL with current queryText/token-driven behavior.

**Step 3: Write minimal implementation**

Update verifier input normalization so structured anchors are required for closure evaluation.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only-input.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/test/unit/runtime-chain-verify-graph-only-input.test.ts gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts
git commit -m "test(runtime): lock structured-anchor verifier input contract"
```

### Task 2: Implement Graph-Only Candidate Extraction (No Retrieval Rule Load)

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-chain-graph-candidates.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Test: `gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`

**Step 1: Write the failing test**

```ts
it('selects candidates from graph anchors without loading retrieval/verification rules', async () => {
  // assert no rule-match gate required for candidate generation
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "selects candidates"`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Add bounded anchor-neighborhood candidate extraction from graph relations and synthetic edges.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "selects candidates"`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-graph-candidates.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts
git commit -m "feat(runtime): add graph-only candidate extraction for verifier"
```

### Task 3: Add Anchor/Bind/Bridge/Runtime Closure Evaluator

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Test: `gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`

**Step 1: Write the failing test**

```ts
it('returns verified_full only when all four closure segments are satisfied', async () => {
  // include negative cases for each missing segment
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "all four closure segments"`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement segment evaluator and precision-first gate for `verified_full`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "all four closure segments"`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts
git commit -m "feat(runtime): enforce four-segment closure gate for verified_full"
```

### Task 4: Integrate Graph-Only Verifier Path into Query/Context

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Test: `gitnexus/test/unit/local-backend-next-hops.test.ts`
- Test: `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`

**Step 1: Write the failing test**

```ts
it('calls verifier with structured anchors and no queryText match dependency', async () => {
  // assert graph-only path wiring
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Wire verifier invocation to structured-anchor contract and conservative noise handling.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/unit/local-backend-next-hops.test.ts gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts
git commit -m "feat(mcp): integrate graph-only runtime verifier path for query/context"
```

### Task 5: Build Standalone Offline Provenance Artifact Generator

**Files:**
- Create: `gitnexus/src/benchmark/runtime-poc/provenance-artifact.ts`
- Create: `gitnexus/test/integration/runtime-provenance-artifact.test.ts`
- Modify: `gitnexus/src/cli/benchmark.ts`

**Step 1: Write the failing test**

```ts
it('emits provenance artifact without online verifier dependency', async () => {
  // assert artifact fields and separation from query-time path
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/integration/runtime-provenance-artifact.test.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Generate standalone provenance report for PoC governance.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/integration/runtime-provenance-artifact.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/runtime-poc/provenance-artifact.ts gitnexus/test/integration/runtime-provenance-artifact.test.ts gitnexus/src/cli/benchmark.ts
git commit -m "feat(benchmark): add standalone runtime provenance artifact for offline governance"
```

### Task 6: Add Precision-First Negative Test Matrix

**Files:**
- Create: `gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`
- Modify: `gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`

**Step 1: Write the failing test**

```ts
it('never emits verified_full when anchor intersection is absent', async () => {
  // global ubiquitous edge should be downgraded
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Add conflict penalty and conservative downgrade logic.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts
git commit -m "test(runtime): add precision-first negative matrix for graph-only verifier"
```

### Task 7: Implement PoC Runner and Baseline Comparison Report

**User Verification: required**

Human Verification Checklist:
- Run PoC benchmark command for `neonspark-core`.
- Confirm report includes baseline-vs-graph-only comparison rows.
- Confirm `verified_full` false-positive metric exists.
- Confirm failures are bucketed by explicit gap category.

Acceptance Criteria:
- Command completes and writes report files under `docs/reports/runtime-poc/`.
- Comparison JSON has both baseline and graph-only fields.
- Metric `verified_full_false_positive_rate` is present and numeric.
- `failure_bucket` is never empty for failed cases.

Failure Signals:
- Missing report files or empty comparison rows.
- Metrics absent or placeholder values.
- Failures classified as unknown/none.

User Decision Prompt:
- `请仅回复：通过 或 不通过`

**Files:**
- Create: `gitnexus/src/benchmark/runtime-poc/runner.ts`
- Create: `docs/reports/runtime-poc/README.md`
- Modify: `gitnexus/src/cli/benchmark.ts`

**Step 1: Write the failing test**

```ts
it('produces baseline-vs-graph-only report with required metrics', async () => {
  // asserts comparison schema
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/integration/runtime-poc-runner.test.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement PoC runner and comparison report generation.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/integration/runtime-poc-runner.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/runtime-poc/runner.ts gitnexus/src/cli/benchmark.ts docs/reports/runtime-poc/README.md
git commit -m "feat(poc): add runtime baseline-vs-graph-only comparison runner"
```

### Task 8: Cutover Cleanup - Remove Retrieval Rule Dependency

**User Verification: required**

Human Verification Checklist:
- Confirm retrieval verifier no longer loads retrieval/verification rule bundles for matching.
- Confirm seeded/symbol benchmark gate passes.
- Confirm offline provenance artifact still produced.

Acceptance Criteria:
- Query/context runtime closure works with graph-only verifier path enabled.
- PoC gate is pass for critical buckets.
- Governance artifact generation remains available.

Failure Signals:
- Runtime path still calls token-trigger rule matching.
- Gate regression in critical buckets.
- Provenance artifact missing after run.

User Decision Prompt:
- `请仅回复：通过 或 不通过`

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/plans/2026-04-07-trigger-tokens-family-handoff.md`

**Step 1: Write the failing test**

```ts
it('does not require retrieval/verification family for runtime closure in query-time path', async () => {
  // graph-only closure should continue to work
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "does not require retrieval"`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Remove retrieval-time family dependency and update docs/contracts.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/src/mcp/local/local-backend.ts docs/unity-runtime-process-source-of-truth.md docs/plans/2026-04-07-trigger-tokens-family-handoff.md
git commit -m "refactor(runtime): cut over retrieval-time verifier to graph-only closure path"
```

## Plan Audit Verdict
audit_scope: DC-01..DC-05 and associated PoC + cutover path
finding_summary: P0=0, P1=0, P2=2
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- benchmark/report artifact paths explicitly defined: pass
- negative tests for missing closure segments defined: pass
authenticity_checks:
- live graph-evidence assertions included for `verified_full`: pass
- offline provenance kept out of online dependency path: pass
approval_decision: pass
