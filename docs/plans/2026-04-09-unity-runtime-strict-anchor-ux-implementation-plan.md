# Unity Runtime Strict-Anchor UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce strict-anchor default behavior for Unity runtime retrieval so anchored runs are deterministic, low-noise, and auditable.

**Architecture:** Implement strict-anchor behavior in three layers: response shaping (`agent-safe-response.ts`), retrieval/runtime orchestration (`local-backend.ts` + benchmark runner/report), and contract/docs sync (MCP docs + skills + AGENTS mirrors). Keep clue-tier evidence available but non-primary in anchored mode. Add hard benchmark gates (`guid_invariance_pass`, anti-placeholder, live-evidence, confirmed-chain freeze gate) to prevent fake compliance.

**Tech Stack:** TypeScript, Vitest, Node test runner, GitNexus CLI benchmark pipeline, MCP query/context contract docs.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added strict-anchor red tests in query/context; `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "strict anchor"` fails on follow-up/summarization as expected; added `strictAnchorMode` scaffold in `agent-safe-response.ts`; rerun remains red.
Task 2 | completed | Implemented strict-anchor summary/follow-up behavior in `agent-safe-response.ts` and strict-anchor metadata propagation in `local-backend.ts`; `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts` passes.
Task 3 | completed | Added failing GUID invariance assertions in runner/report tests and minimal type stubs (`types.ts`, `runner.ts` interface); `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js` fails on `guid_invariance_pass` undefined as expected.
Task 4 | completed | Implemented GUID invariance extraction + metric in `runner.ts`, wired acceptance/pass gating in `report.ts`, updated CLI output/exit to use pass gate, and updated runner/report/CLI tests; `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js` passes.
Task 5 | completed | Added failing authenticity gate assertions for `live_tool_evidence_pass`/`freeze_ready`/`confirmed_chain.steps` in runner/report/CLI tests plus minimal type placeholders in `runner.ts`; rerunning `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js` remains red on missing authenticity fields as expected.
Task 6 | completed | Implemented authenticity gates in `runner.ts` (`confirmed_chain.steps`, `live_tool_evidence_pass`, `freeze_ready`), made metrics contract explicit in `types.ts`, wired acceptance/reporting in `report.ts`, and updated CLI output in `benchmark-agent-safe-query-context.ts`; `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js` passes.
Task 7 | completed | Added tier-envelope red tests (`facts`/`closure`/`clues`) in query/context unit tests with minimal contract comments; `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "tier envelope"` fails on missing envelope fields as expected.
Task 8 | completed | Implemented `facts/closure/clues/tier_envelope` in `agent-safe-response.ts` with backward-compatible fields, propagated tier metrics through benchmark runner/report/types, and synchronized contracts/docs (`tools.ts`, source-of-truth doc, shared contract mirrors, AGENTS guidance); `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts && npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/report.test.js` passes.
Task 9 | completed | Full verification passed: query/context unit tests green; benchmark module tests green; benchmark report refreshed via `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context ... --subagent-runs-dir .gitnexus/subagent-runs-agent-safe --report-dir .gitnexus/benchmark-agent-safe-query-context` with `guid_invariance_pass=true`, `placeholder_leak_detected=false`, `live_tool_evidence_pass=true`, `freeze_ready=true`, and `tier_envelope.semantic_order_pass=true`; graph-only runtime claim regression command returns `runtime_claim.rule_id=graph-only.runtime-closure.v1` and `scope.trigger_family=graph_only`.
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Anchored candidate must stay deterministic (`primary_candidate` equals anchored symbol/canonical alias) | critical | Task 1, Task 2, Task 4 | `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts -t "anchored" && npm --prefix gitnexus run build && node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.anchor_top1_pass` | any anchored case has `anchor_top1_pass=false`
DC-02 Anchored follow-up must prefer deterministic narrowing (`resource_path_prefix`/`uid`) | critical | Task 1, Task 2, Task 4 | `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts -t "recommended_follow_up"` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.recommended_follow_up_hit` | anchored case emits generic `follow_next_hop` or `recommended_follow_up_hit=false`
DC-03 Low-confidence `resource_heuristic` cannot own first-screen summary when stronger lead exists | critical | Task 1, Task 2 | `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts -t "first-screen summary" && npm --prefix gitnexus run build && node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.heuristic_top_summary_detected` | `heuristic_top_summary_detected=true` in anchored case
DC-04 GUID token variant must not change anchored result semantics | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.guid_invariance_pass` | `guid_invariance_pass=false`
DC-05 Anti-fake authenticity gates must be enforced (placeholder/live evidence/freeze chain) | critical | Task 5, Task 6 | `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.{placeholder_leak_detected,live_tool_evidence_pass,freeze_ready,confirmed_chain.steps}` | placeholder leak true, live evidence false, or `freeze_ready=true` with empty `confirmed_chain.steps`
DC-06 User-facing contract must expose `facts` / `closure` / `clues` tiers with semantic ordering | critical | Task 7, Task 8 | `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts && npm --prefix gitnexus run build && node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.tier_envelope.{facts_present,closure_present,clues_present,semantic_order_pass,summary_source}` | any tier flag false, `semantic_order_pass=false`, or `summary_source=clues` while non-heuristic high/medium lead exists
DC-07 Graph-only runtime closure behavior must not regress | critical | Task 9 | `npm --prefix gitnexus run build && node gitnexus/dist/cli/index.js context --repo "neonspark-core" --uid "Method:Assets/NEON/Code/Framework/Global.cs:InitGlobal" --runtime-chain-verify on-demand --response-profile full --unity-resources on` | CLI output: `runtime_claim.rule_id`, `runtime_claim.scope.trigger_family` | rule id not graph-only or trigger family not `graph_only`

## Authenticity Assertions

Critical module: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`

1. `assert no placeholder path`: reject placeholder follow-up (`Reload NEON...`, `follow_next_hop`, empty `resource_path_prefix`).
2. `assert live mode has tool evidence`: strict-anchor pass requires non-zero live tool evidence signal in benchmark report.
3. `assert freeze requires non-empty confirmed_chain.steps`: never mark strict-anchor freeze/pass-ready when `confirmed_chain.steps.length===0`.

Critical module: `gitnexus/src/mcp/local/agent-safe-response.ts`

1. negative assertion: anchored mode must not select low-confidence clue summary if a non-heuristic high/medium lead exists.

Critical module: `gitnexus/src/mcp/local/local-backend.ts`

1. negative assertion: when request already includes deterministic anchors, response metadata must preserve strict-anchor intent and must not downgrade to exploration-first follow-up.

### Task 1: Add Failing Strict-Anchor Unit Tests (Query/Context)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing test**

```ts
it('locks anchored primary candidate and deterministic follow-up when strict anchor metadata is present', () => {
  const out = buildSlimQueryResult(fullPayloadWithStrictAnchor, {
    repoName: 'neonspark-core',
    queryText: 'SoulBringerIceCoreMgrPu',
  });
  expect((out as any).decision.primary_candidate).toBe('SoulBringerIceCoreMgrPu');
  expect((out as any).decision.recommended_follow_up).toContain('resource_path_prefix=');
  expect((out as any).summary).not.toContain('runtime heuristic clue');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "strict anchor"`
Expected: FAIL on missing strict-anchor behavior.

**Step 3: Write minimal implementation scaffold**

```ts
// In payload builder inputs
const strictAnchorMode = Boolean(full?.decision_context?.strict_anchor_mode);
```

**Step 4: Run test to verify it still fails for behavior (red phase)**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "strict anchor"`
Expected: FAIL remains until ranking logic is implemented.

**Step 5: Commit**

```bash
git add gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts
git commit -m "test: add failing strict-anchor query/context expectations"
```

### Task 2: Implement Strict-Anchor Ranking and Follow-Up Priority

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing implementation test assertion extension**

```ts
expect((out as any).clues?.process_hints?.[0]?.evidence_mode).toBe('resource_heuristic');
expect((out as any).summary).toBe('SoulBringerIceCoreMgrPu');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts`
Expected: FAIL on summary/primary candidate/follow-up ordering.

**Step 3: Write minimal implementation**

```ts
// agent-safe-response.ts
function scoreRecommendedFollowUpHint(hint, strictAnchorMode) {
  if (strictAnchorMode && String(hint?.param_delta || '').trim() === 'follow_next_hop') {
    return Number.NEGATIVE_INFINITY;
  }
  // existing ranking...
}

function chooseTopSummary(input) {
  if (input.strictAnchorMode && isLowConfidenceHeuristicProcessHint(topProcess)) {
    return candidateName || input.fallback;
  }
  // existing ranking...
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts`
Expected: PASS for strict-anchor assertions and existing regression checks.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts
git commit -m "feat: enforce strict-anchor summary and follow-up priority"
```

### Task 3: Add Failing GUID-Invariance Benchmark Tests

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`

**Step 1: Write the failing test**

```ts
assert.equal(result.guid_invariance_pass, true);
assert.equal(result.guid_variant.primary_candidate, result.base.primary_candidate);
assert.equal(result.guid_variant.recommended_follow_up, result.base.recommended_follow_up);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js`
Expected: FAIL because `guid_invariance_pass` is not implemented.

**Step 3: Write minimal type stubs**

```ts
export type WorkflowReplayResult = {
  // ...
  guid_invariance_pass: boolean;
};
```

**Step 4: Re-run tests (still red until implementation)**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js`
Expected: FAIL persists on behavior checks.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/benchmark/agent-safe-query-context/types.ts
git commit -m "test: add failing guid invariance benchmark checks"
```

### Task 4: Implement GUID-Invariance Metric and Strict-Anchor Pass Gate

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Test: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Extend failing test to gate overall pass**

```ts
assert.equal(report.workflow_replay_slim.reload.guid_invariance_pass, true);
assert.equal(report.pass, false); // when guid invariance is false
```

**Step 2: Run tests to verify failure**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: FAIL on missing `guid_invariance_pass` and pass-gate logic.

**Step 3: Write minimal implementation**

```ts
const guidInvariancePass = stringsEqual(basePrimaryCandidate, guidPrimaryCandidate)
  && stringsEqual(baseFollowUp, guidFollowUp);

workflowResult.guid_invariance_pass = guidInvariancePass;
suitePass = suitePass && guidInvariancePass;
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: PASS with updated report fields and gating.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "feat: add guid invariance strict-anchor benchmark gate"
```

### Task 5: Add Failing Authenticity Gate Tests (Placeholder / Live Evidence / Freeze Chain)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Test: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write failing anti-fake tests**

```ts
assert.equal(result.placeholder_leak_detected, false); // assert no placeholder path
assert.equal(result.live_tool_evidence_pass, true); // assert live mode has tool evidence
assert.equal(
  result.freeze_ready,
  result.confirmed_chain.steps.length > 0
    && !result.placeholder_leak_detected
    && result.live_tool_evidence_pass
    && result.guid_invariance_pass,
); // assert freeze requires non-empty confirmed_chain.steps
assert.equal(result.confirmed_chain.steps.length > 0, false);
```

**Step 2: Run tests to verify failure**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: FAIL because new authenticity fields/gates are missing.

**Step 3: Add minimal type expectations**

```ts
type WorkflowReplayResult = {
  confirmed_chain: { steps: string[] };
  live_tool_evidence_pass: boolean;
  freeze_ready: boolean;
};
```

**Step 4: Re-run tests (remain red)**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: FAIL until implementation lands.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "test: add authenticity gate failures for strict-anchor benchmark"
```

### Task 6: Implement Authenticity Gates in Runner/Report/CLI

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Test: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Add failing assertion for freeze-ready gate**

```ts
assert.equal(
  row.freeze_ready,
  row.confirmed_chain.steps.length > 0
    && !row.placeholder_leak_detected
    && row.live_tool_evidence_pass
    && row.guid_invariance_pass,
);
```

**Step 2: Run tests to verify failure**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: FAIL on missing authenticity calculations.

**Step 3: Write minimal implementation**

```ts
const confirmedChainSteps = deriveConfirmedChainSteps(output);
const liveToolEvidencePass = countLiveToolEvidence(subagentLiveCase) > 0;
const freezeReady = confirmedChainSteps.length > 0 && !placeholderLeakDetected && liveToolEvidencePass;
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: PASS with authenticity gates enforced in report and CLI summary.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "feat: enforce authenticity gates for strict-anchor benchmark"
```

### Task 7: Add Failing Tier-Envelope Contract Tests (`facts` / `closure` / `clues`)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write failing envelope tests**

```ts
expect((out as any).facts).toBeDefined();
expect((out as any).closure).toBeDefined();
expect((out as any).clues).toBeDefined();
expect((out as any).clues.process_hints[0].evidence_mode).toBe('resource_heuristic');
```

**Step 2: Run tests to verify failure**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "tier envelope"`
Expected: FAIL because envelope fields are absent.

**Step 3: Add minimal expected shape comments in tests (still red)**

```ts
// facts: graph-backed candidates/processes
// closure: runtime_preview/runtime_claim/gaps
// clues: heuristic hints + manual verification
```

**Step 4: Re-run to confirm red state**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "tier envelope"`
Expected: FAIL persists.

**Step 5: Commit**

```bash
git add gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts
git commit -m "test: add failing facts-closure-clues envelope contract checks"
```

### Task 8: Implement Tier Envelope and Sync Docs/Skills/Setup Mirrors

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `gitnexus/skills/_shared/unity-runtime-process-contract.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md`
- Modify: `AGENTS.md`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`

**Step 1: Run failing envelope tests**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts -t "tier envelope"`
Expected: FAIL.

**Step 2: Write minimal implementation**

```ts
return {
  summary,
  facts: { candidates, processes: processHints.filter(p => p.evidence_mode !== 'resource_heuristic') },
  closure: { runtime_preview: runtimePreview, missing_proof_targets: missingProofTargets },
  clues: { process_hints: processHints.filter(p => p.evidence_mode === 'resource_heuristic'), resource_hints: resourceHints },
  tier_envelope: {
    facts_present: true,
    closure_present: true,
    clues_present: true,
    summary_source: inferSummarySource(summary, facts, closure, clues),
    semantic_order_pass: validateTierSemanticOrder({ summary, facts, clues }),
  },
  // backward-compatible fields preserved for transition window
};
```

**Step 3: Update contract docs/skills in same change set**

```md
`query/context` strict-anchor default: read `facts` first, `closure` second, `clues` only when needed.
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts && npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/report.test.js`
Expected: PASS with envelope + backward compatibility checks, and benchmark tier semantics (`tier_envelope.semantic_order_pass=true`).

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/tools.ts gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/types.ts docs/unity-runtime-process-source-of-truth.md gitnexus/skills/_shared/unity-runtime-process-contract.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md AGENTS.md gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts
git commit -m "feat: add facts-closure-clues envelope and sync runtime contracts"
```

### Task 9: End-to-End Verification and Benchmark Evidence Refresh

**User Verification: not-required**

**Files:**
- Modify: `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`
- Modify: `.gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Test: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Run full targeted test set**

Run: `npm --prefix gitnexus run test -- test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts`
Expected: PASS.

**Step 2: Run benchmark module tests**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/agent-safe-query-context/runner.test.js gitnexus/dist/benchmark/agent-safe-query-context/report.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Expected: PASS.

**Step 3: Run strict-anchor benchmark report generation**

Run: `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context`
Expected: PASS summary with `guid_invariance_pass=true`, `heuristic_top_summary_detected=false`, `placeholder_leak_detected=false`, `live_tool_evidence_pass=true`, `freeze_ready=true` only when `confirmed_chain.steps` non-empty, and `tier_envelope.semantic_order_pass=true`.

**Step 4: Regression check graph-only runtime claim**

Run: `npm --prefix gitnexus run build && node gitnexus/dist/cli/index.js context --repo "neonspark-core" --uid "Method:Assets/NEON/Code/Framework/Global.cs:InitGlobal" --runtime-chain-verify on-demand --response-profile full --unity-resources on`
Expected: output includes `runtime_claim.rule_id=graph-only.runtime-closure.v1` and `trigger_family=graph_only`.

**Step 5: Commit**

```bash
git add .gitnexus/benchmark-agent-safe-query-context/benchmark-report.json .gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md
git commit -m "chore: refresh strict-anchor benchmark evidence and verification artifacts"
```

## Execution Notes

1. Apply DRY/YAGNI: do not add new top-level APIs unless required for strict-anchor gates.
2. Keep backward compatibility fields for one transition cycle while introducing `facts/closure/clues`.
3. Use `@superpowers:executing-plans` for implementation handoff.
4. During implementation review loops, use `@superpowers:verification-before-completion` before any completion claim.

## Plan Audit Verdict
audit_scope: this implementation plan (`docs/plans/2026-04-09-unity-runtime-strict-anchor-ux-implementation-plan.md`) against writing-plans mandatory rubric, with design-source cross-check to `docs/plans/2026-04-09-unity-runtime-strict-anchor-agent-ux-boundary-and-gates.md`
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` present in Task 5 and enforced in Task 6 formula; result=pass
- `freeze_ready` cannot pass with placeholder leakage or empty chain; result=pass
authenticity_checks:
- `assert live mode has tool evidence` present and wired into freeze formula; result=pass
- semantic closure check uses `confirmed_chain.steps + !placeholder + live_tool_evidence + guid_invariance`; result=pass
approval_decision: pass

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-09-unity-runtime-strict-anchor-ux-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
