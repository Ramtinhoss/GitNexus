# Agent-Safe Query/Context Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the agent-safe Unity `query/context` benchmark and slim default return shaping without changing semantic outcomes for the WeaponPowerUp and Reload benchmark cases.

**Architecture:** Keep the existing refactor-oriented `benchmark-agent-context` suite intact and add a dedicated sibling benchmark suite for this design, because the current runner only supports fixed `tool_plan` + generic coverage checks and cannot express semantic tuples, retry state machines, or token deltas. Implement slim/default shaping as a response-profile layer on top of the existing `LocalBackend` full result assembly, so `query/context` can default to slim while benchmark/regression callers opt into `response_profile=full` when they still need legacy payloads.

**Tech Stack:** TypeScript, Node.js CLI, LocalBackend MCP surface, `node:test`/Vitest, existing `u2-e2e` token metrics helper.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 WeaponPowerUp semantic tuple must remain identical after optimization | critical | Task 1, Task 2, Task 3, Task 8 | `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:cases.weapon_powerup.semantic_tuple` | `resource_anchor`, `symbol_anchor`, `proof_edges`, or `closure_status` differs from canonical tuple |
DC-02 Reload semantic tuple must remain identical after optimization | critical | Task 1, Task 2, Task 3, Task 8 | `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:cases.reload.semantic_tuple` | `resource_anchor`, `symbol_anchor`, `proof_edge`, or `closure_status` differs from canonical tuple |
DC-03 Workflow replay must follow the deterministic retry state machine and emit call/token retry metrics | critical | Task 1, Task 2, Task 3 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay.weapon_powerup.retry_breakdown` | missing `query_retry_count/context_retry_count/cypher_retry_count`, or replay performs unbounded retries |
DC-04 Same-script control track must keep tool plan fixed and measure payload/token deltas | critical | Task 1, Task 2, Task 3 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:same_script` | control track omits `tool_plan`, omits token totals, or changes fixed call count without explicit fixture change |
DC-05 Default `query` must return the slim contract, omit forbidden heavy fields, and expose upgrade hints | critical | Task 4, Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts --reporter=dot` | `gitnexus/test/unit/__snapshots__/local-backend-agent-safe-query.query.json` | default `query` still exposes `processes/process_symbols/definitions/resourceBindings/serializedFields/next_hops` or lacks `upgrade_hints` |
DC-06 Default `context` must return the slim contract, omit heavy Unity payloads, and keep verification guidance | critical | Task 4, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts --reporter=dot` | `gitnexus/test/unit/__snapshots__/local-backend-agent-safe-context.context.json` | default `context` still exposes full `resourceBindings/serializedFields` or loses `verification_hint`/`upgrade_hints` |
DC-07 Full payload must remain explicitly reachable and legacy benchmark suites must stay green via `response_profile=full` | critical | Task 4, Task 7 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-context/runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts gitnexus/src/cli/benchmark-agent-context.test.ts --reporter=dot` | `gitnexus/src/benchmark/agent-context/runner.ts:buildToolInput`, `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts` | legacy suites fail because `query/context` default slim removed required fields and no explicit full-profile escape hatch exists |
DC-08 Tooling/docs/skills must reflect the new contract and upgrade path | high | Task 7 | `npm --prefix gitnexus exec vitest run gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts && rg -n "response_profile|upgrade_hints|runtime_preview|process_hints|resource_hints" gitnexus/src/mcp/tools.ts gitnexus/skills/gitnexus-exploring.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/gitnexus-exploring/SKILL.md AGENTS.md` | `gitnexus/src/mcp/tools.ts`, `gitnexus/skills/gitnexus-exploring.md`, `gitnexus/skills/gitnexus-guide.md` | public tool docs still describe `next_hops`/heavy defaults and never mention `response_profile=full` |

## Authenticity Assertions

- `assert no placeholder path`: reject any benchmark case or emitted report that contains `<resource>`, `<symbol>`, `TODO`, `TBD`, or `placeholder` in `resource_anchor`, `symbol_anchor`, `proof_edges`, or report commands.
- `assert live mode has tool evidence`: each workflow replay and same-script case must persist executed `steps[]` with `tool`, `input`, `durationMs`, and `totalTokensEst`; do not accept summary-only aggregates.
- `assert freeze requires non-empty structural proof`: `semantic_tuple_pass=true` is invalid unless the corresponding `proof_edges` or `proof_edge` list is non-empty and individually marked proven.
- `assert slim mode is truly slim`: default `query/context` snapshots must fail if forbidden heavy keys appear, even when their values are empty arrays.
- `assert full mode is explicit`: benchmark/regression callers that still need legacy payloads must set `response_profile=full`; do not silently return full payloads from default mode.

## Fact Check Baseline

These implementation facts were verified from current source before writing this plan:

- `LocalBackend.query()` still assembles and returns `processes`, `process_symbols`, `definitions`, `next_hops`, and aggregated `serializedFields` directly in the default path (`gitnexus/src/mcp/local/local-backend.ts:1317-1910`).
- `LocalBackend.context()` still returns full categorized refs plus full Unity payloads and `next_hops` in the default path (`gitnexus/src/mcp/local/local-backend.ts:2242-2695`).
- `pickVerifierSymbolAnchor()` currently selects the first query-name match or first symbol/definition; it does not prefer seeded/process-linked anchors (`gitnexus/src/mcp/local/local-backend.ts:380-397`).
- `buildNextHops()` exists today, but the design’s `upgrade_hints[]`/`resource_hints[]`/`decision`/`runtime_preview` fields do not (`gitnexus/src/mcp/local/local-backend.ts:399-489`).
- `buildUnityEvidenceView()` trims bindings/reference fields but still aggregates and returns `serializedFields` even in summary mode (`gitnexus/src/mcp/local/unity-evidence-view.ts:51-136`).
- The existing `benchmark-agent-context` runner only supports fixed `tool_plan`, generic checks, coverage, and average tool-call metrics; it has no semantic tuple model, no retry state machine, and no token accounting (`gitnexus/src/benchmark/agent-context/types.ts:1-45`, `gitnexus/src/benchmark/agent-context/runner.ts:14-179`).
- The existing token estimator already matches the design contract: `estimateTokens(text) = ceil(chars / 4)` (`gitnexus/src/benchmark/u2-e2e/metrics.ts:25-27`).
- The existing `u2-e2e` retrieval runner already records per-step input/output token estimates, so that utility should be reused rather than reimplemented (`gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts:71-89`).

### Task 1: Freeze Benchmark Schema And Canonical Cases

**Files:**
- Create: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/io.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/io.test.ts`
- Create: `benchmarks/agent-safe-query-context/neonspark-v1/cases.json`
- Create: `benchmarks/agent-safe-query-context/neonspark-v1/thresholds.json`
- Create: `benchmarks/agent-safe-query-context/neonspark-v1/README.md`

**Step 1: Write the failing dataset/shape tests**

```ts
test('loads canonical benchmark cases without placeholders', async () => {
  const suite = await loadAgentSafeQueryContextSuite('benchmarks/agent-safe-query-context/neonspark-v1');
  expect(suite.cases.weapon_powerup.semantic_tuple.resource_anchor)
    .toBe('Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset');
  expect(suite.cases.reload.semantic_tuple.proof_edge)
    .toBe('ReloadBase.GetValue -> ReloadBase.CheckReload');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts --reporter=dot`

Expected: FAIL because the suite loader/files do not exist yet.

**Step 3: Write the minimal implementation**

```ts
export interface AgentSafeBenchmarkSuite {
  thresholds: { workflowReplay: { maxSteps: number }; tokenReduction: { weapon_powerup: number; reload: number } };
  cases: {
    weapon_powerup: BenchmarkCase;
    reload: BenchmarkCase;
  };
}
```

```json
{
  "weapon_powerup": {
    "semantic_tuple": {
      "resource_anchor": "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset",
      "symbol_anchor": "WeaponPowerUp",
      "proof_edges": [
        "HoldPickup -> WeaponPowerUp.PickItUp",
        "EquipWithEvent -> WeaponPowerUp.Equip"
      ],
      "closure_status": "not_verified_full"
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/benchmark/agent-safe-query-context/io.ts gitnexus/src/benchmark/agent-safe-query-context/io.test.ts benchmarks/agent-safe-query-context/neonspark-v1/cases.json benchmarks/agent-safe-query-context/neonspark-v1/thresholds.json benchmarks/agent-safe-query-context/neonspark-v1/README.md
git commit -m "test: freeze agent-safe benchmark schema and cases"
```

### Task 2: Implement Workflow Replay And Semantic Tuple Evaluation

**Files:**
- Create: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts`
- Modify: `gitnexus/src/benchmark/agent-context/tool-runner.ts`

**Step 1: Write the failing runner tests**

```ts
test('workflow replay narrows query only when retry triggers fire', async () => {
  const result = await runWorkflowReplay(fakeSuite.cases.weapon_powerup, fakeRunner);
  expect(result.tool_calls_to_completion).toBe(4);
  expect(result.retry_breakdown.query_retry_count).toBe(1);
  expect(result.semantic_tuple_pass).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts --reporter=dot`

Expected: FAIL because replay/evaluator modules do not exist yet.

**Step 3: Write the minimal implementation**

```ts
const transitions = {
  query: ['requery', 'context', 'fail'],
  context: ['context', 'cypher', 'fail'],
  cypher: ['cypher', 'stop', 'fail'],
} as const;
```

```ts
function semanticTuplePass(actual: SemanticTuple, expected: SemanticTuple) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
```

Use the existing `createAgentContextToolRunner()` as the concrete tool executor so the new suite does not reimplement backend wiring.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.ts gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts gitnexus/src/benchmark/agent-context/tool-runner.ts
git commit -m "feat: add workflow replay and semantic tuple evaluation"
```

### Task 3: Add Same-Script Control Track, Reports, And CLI Entry Point

**Files:**
- Create: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Create: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Create: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/benchmark/report.ts`

**Step 1: Write the failing report/CLI tests**

```ts
test('benchmark report includes cases, same_script, workflow_replay, token_summary, and call_summary', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, { repo: 'neonspark-core' });
  expect(report).toHaveProperty('cases.weapon_powerup.semantic_tuple_pass', true);
  expect(report).toHaveProperty('same_script.tool_plan');
  expect(report).toHaveProperty('workflow_replay.reload.steps');
  expect(report).toHaveProperty('token_summary');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL because the new report writer and CLI command do not exist yet.

**Step 3: Write the minimal implementation**

```ts
program
  .command('benchmark-agent-safe-query-context <dataset>')
  .description('Run the agent-safe Unity query/context benchmark')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only');
```

```ts
return {
  cases,
  same_script,
  workflow_replay,
  semantic_equivalence,
  token_summary,
  call_summary,
};
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts gitnexus/src/cli/index.ts gitnexus/src/benchmark/report.ts
git commit -m "feat: add agent-safe benchmark cli and reports"
```

### Task 4: Add `response_profile` Plumbing And Full-Mode Escape Hatch

**Files:**
- Create: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Create: `gitnexus/test/unit/local-backend-response-profile.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts:1317-1910`
- Modify: `gitnexus/src/mcp/local/local-backend.ts:2242-2695`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/cli/tool.ts`
- Modify: `gitnexus/src/cli/index.ts`

**Step 1: Write the failing response-profile tests**

```ts
test('query/context default to slim but honor response_profile=full', async () => {
  const slim = await backend.callTool('query', { query: 'WeaponPowerUp', repo: 'fixture' });
  const full = await backend.callTool('query', { query: 'WeaponPowerUp', repo: 'fixture', response_profile: 'full' });
  expect(slim.process_symbols).toBeUndefined();
  expect(full.process_symbols?.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-response-profile.test.ts --reporter=dot`

Expected: FAIL because `response_profile` is not a recognized parameter and both paths still return the same full shape.

**Step 3: Write the minimal implementation**

```ts
type ResponseProfile = 'slim' | 'full';
const responseProfile = params.response_profile === 'full' ? 'full' : 'slim';
if (responseProfile === 'full') return fullResult;
return buildSlimQueryResult(fullResult);
```

Wire the same option through MCP schema and direct CLI flags so benchmarks/regressions can explicitly request full mode.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-response-profile.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/test/unit/local-backend-response-profile.test.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/tools.ts gitnexus/src/cli/tool.ts gitnexus/src/cli/index.ts
git commit -m "feat: add response profile support for query and context"
```

### Task 5: Implement Default Slim `query` Shaping And Safer Upgrade Routing

**Files:**
- Create: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts:380-489`
- Modify: `gitnexus/src/mcp/local/local-backend.ts:1749-1910`

**Step 1: Write the failing slim-query tests**

```ts
test('default query emits candidates/process_hints/resource_hints/decision/upgrade_hints/runtime_preview only', async () => {
  const out = await backend.callTool('query', { query: 'weapon powerup equip chain', repo: 'fixture' });
  expect(out).toHaveProperty('candidates');
  expect(out).toHaveProperty('process_hints');
  expect(out).toHaveProperty('upgrade_hints');
  expect(out.processes).toBeUndefined();
  expect(out.next_hops).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts --reporter=dot`

Expected: FAIL because default query still returns `processes/process_symbols/definitions/next_hops`.

**Step 3: Write the minimal implementation**

```ts
function buildSlimQueryResult(full: FullQueryResult): SlimQueryResult {
  return {
    summary: full.processes?.[0]?.summary || full.definitions?.[0]?.name || 'no_match',
    candidates: buildPrimaryCandidates(full),
    process_hints: buildProcessHints(full.processes),
    resource_hints: buildResourceHints(full),
    decision: buildDecision(full),
    fallback_candidates: shouldExposeFallback(full) ? buildFallbackCandidates(full) : undefined,
    upgrade_hints: buildUpgradeHints(full),
    runtime_preview: buildRuntimePreview(full.runtime_claim),
  };
}
```

Also replace `pickVerifierSymbolAnchor()` selection so seeded or process-linked candidates outrank naive query-token matches.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "feat: add slim query response shaping"
```

### Task 6: Implement Default Slim `context` Shaping And Unity Evidence Suppression

**Files:**
- Create: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts:2488-2695`
- Modify: `gitnexus/src/mcp/local/unity-evidence-view.ts`
- Modify: `gitnexus/src/mcp/local/unity-evidence-view.test.ts`

**Step 1: Write the failing slim-context/evidence tests**

```ts
test('default context emits slim refs/processes/resource hints and suppresses serializedFields', async () => {
  const out = await backend.callTool('context', { name: 'ReloadBase', repo: 'fixture', unity_resources: 'on' });
  expect(out).toHaveProperty('symbol');
  expect(out).toHaveProperty('incoming');
  expect(out).toHaveProperty('outgoing');
  expect(out).toHaveProperty('resource_hints');
  expect(out.serializedFields).toBeUndefined();
  expect(out.resourceBindings).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts --reporter=dot`

Expected: FAIL because default context still exposes full Unity payloads and `buildUnityEvidenceView()` still aggregates `serializedFields`.

**Step 3: Write the minimal implementation**

```ts
function buildSlimContextResult(full: FullContextResult): SlimContextResult {
  return {
    symbol: full.symbol,
    incoming: trimRelationBuckets(full.incoming),
    outgoing: trimRelationBuckets(full.outgoing),
    processes: buildSlimContextProcesses(full.processes),
    resource_hints: buildResourceHints(full),
    verification_hint: full.processes?.find((row) => row.verification_hint)?.verification_hint,
    upgrade_hints: buildUpgradeHints(full),
  };
}
```

```ts
return {
  resourceBindings: filtered,
  serializedFields: mode === 'full' ? aggregateSerializedFields(filtered) : undefined,
  evidence_meta,
  filter_diagnostics: diagnostics,
};
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-evidence-view.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts
git commit -m "feat: add slim context response shaping"
```

### Task 7: Keep Legacy Suites Green And Sync Public Contracts

**Files:**
- Modify: `gitnexus/src/benchmark/agent-context/runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-context.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`
- Modify: `AGENTS.md`
- Modify: `docs/2026-03-03-agent-context-benchmark-usage.md`

**Step 1: Write the failing compatibility/docs tests**

```ts
test('benchmark runners inject response_profile=full when legacy checks need full query/context payloads', async () => {
  const outputs = await executeToolPlan([{ tool: 'query', input: { query: 'Target' } }], fakeRunner, 'sample');
  expect(fakeRunner.calls[0].response_profile).toBe('full');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-context/runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts gitnexus/src/cli/benchmark-agent-context.test.ts --reporter=dot`

Expected: FAIL because legacy benchmark code does not request full mode explicitly and docs do not mention `response_profile`.

**Step 3: Write the minimal implementation**

```ts
if ((step.tool === 'query' || step.tool === 'context') && !('response_profile' in input)) {
  input.response_profile = 'full';
}
```

Update public docs/skills to describe:
- default slim `query/context`
- explicit `response_profile=full`
- `upgrade_hints[]`, `process_hints[]`, `resource_hints[]`, `runtime_preview`

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-context/runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts gitnexus/src/cli/benchmark-agent-context.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/cli/benchmark-agent-context.ts gitnexus/src/mcp/tools.ts gitnexus/skills/gitnexus-exploring.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/gitnexus-exploring/SKILL.md AGENTS.md docs/2026-03-03-agent-context-benchmark-usage.md
git commit -m "docs: sync slim query context contract and legacy benchmark compatibility"
```

### Task 8: Run Local Regression And Live Neonspark Benchmark

**User Verification: required**

**Human Verification Checklist**
- `benchmark-report.json` contains `cases.weapon_powerup.semantic_tuple_pass=true` and `cases.reload.semantic_tuple_pass=true`.
- `workflow_replay` reports non-increasing tool calls relative to the stored baseline for both cases.
- `token_summary` shows a material reduction and does not report a negative savings delta for either case.
- Slim default output still provides actionable `upgrade_hints[]` for both cases.
- Explicit `response_profile=full` calls still expose full payloads needed by legacy benchmark suites.

**Acceptance Criteria**
- WeaponPowerUp tuple exactly matches the canonical tuple in `cases.json`.
- Reload tuple exactly matches the canonical tuple in `cases.json`.
- `call_summary` shows `after <= before` for both cases.
- `token_summary` shows savings within the expected design band.
- A manual `query/context` spot-check with `response_profile=full` returns the old heavy structures.

**Failure Signals**
- Any `semantic_tuple_pass=false`.
- `workflow_replay` exceeds the configured max-step budget or increases tool calls.
- `token_summary` is missing or reports no reduction.
- `upgrade_hints[]` missing `param_delta` or `next_command`.
- `response_profile=full` still returns slim payloads.

**User Decision Prompt**
- `请只回复：通过` or `不通过`

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Test: `gitnexus/test/unit/local-backend-response-profile.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing end-to-end/live verification test or script assertions**

```ts
test('live benchmark report refuses placeholder evidence and requires semantic tuple pass', async () => {
  const report = JSON.parse(await fs.readFile('.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json', 'utf8'));
  expect(report.cases.weapon_powerup.semantic_tuple_pass).toBe(true);
  expect(JSON.stringify(report)).not.toMatch(/TODO|TBD|placeholder/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/test/unit/local-backend-response-profile.test.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: FAIL until all local regressions and report invariants are satisfied.

**Step 3: Write minimal implementation and execute verification**

Run local regression:

```bash
npm --prefix gitnexus exec vitest run \
  gitnexus/src/benchmark/agent-safe-query-context/io.test.ts \
  gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts \
  gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts \
  gitnexus/src/benchmark/agent-safe-query-context/report.test.ts \
  gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts \
  gitnexus/test/unit/local-backend-response-profile.test.ts \
  gitnexus/test/unit/local-backend-agent-safe-query.test.ts \
  gitnexus/test/unit/local-backend-agent-safe-context.test.ts \
  gitnexus/src/benchmark/agent-context/runner.test.ts \
  gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts \
  --reporter=dot
```

Run live benchmark against the already-indexed repo:

```bash
node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context \
  benchmarks/agent-safe-query-context/neonspark-v1 \
  --repo neonspark-core \
  --skip-analyze \
  --report-dir .gitnexus/benchmark-agent-safe-query-context
```

Spot-check full mode:

```bash
node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --response-profile full "weapon powerup equip chain"
node gitnexus/dist/cli/index.js context -r neonspark-core --unity-resources on --response-profile full ReloadBase
```

**Step 4: Run test to verify it passes**

Run: `jq '.cases.weapon_powerup.semantic_tuple_pass and .cases.reload.semantic_tuple_pass' .gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`

Expected: `true`

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts
git commit -m "test: verify live agent-safe query context benchmark"
```

## Plan Audit Verdict
audit_scope: design sections 3-14; local-backend query/context shaping; unity evidence trimming; benchmark suite/CLI/report compatibility
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- Independent subagent audit required by `writing-plans` could not be performed in this session because delegation was not explicitly authorized; local source-backed audit performed instead. status: accepted
anti_placeholder_checks:
- benchmark case artifacts require concrete `resource_anchor`/`symbol_anchor` strings and reject `TODO|TBD|placeholder`: included
- live report verification rejects placeholder command/evidence text before accepting `semantic_tuple_pass=true`: included
authenticity_checks:
- default slim snapshots explicitly fail if forbidden heavy keys reappear: included
- legacy suites must set or inherit `response_profile=full`; no silent full-mode fallback in default user path: included
approval_decision: pass
