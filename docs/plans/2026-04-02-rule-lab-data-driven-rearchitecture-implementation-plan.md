# Rule Lab Data-Driven Rearchitecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Rule Lab and runtime claim verification so promoted DSL rules are the single source of truth for runtime chain validation, with no project-specific hardcoded fallback.

**Architecture:** This plan replaces placeholder Rule Lab artifacts with a topology-oriented DSL pipeline (`discover -> analyze -> review-pack -> curate -> promote -> regress`) and compiles curated drafts into linted runtime rules. Runtime verification is refactored to a unified DSL executor that consumes only matched promoted rules, standardizes failure classification, and surfaces verifiable hop/gap evidence. Acceptance gates are upgraded from structure checks to semantic authenticity checks (probe pass-rate + static anti-hardcode + DSL lint).

**Tech Stack:** TypeScript, Node.js fs/path APIs, JSON Schema, Vitest/node:test, GitNexus MCP tooling (`impact/query/context/detect_changes`), CLI + LocalBackend integration, `.gitnexus/rules/**` repo-local artifacts.

**Execution Skills:** `@gitnexus-refactoring`, `@superpowers:executing-plans`

**Preflight Assumption:** `using-superpowers` preflight is already satisfied for this session; execute on current checkout (non-worktree flow).

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added `RuleDslDraft`/DSL v2 interfaces and new schema files; `vitest paths.test.ts` failed with missing schema (ENOENT) then passed after implementation.
Task 2 | completed | Added v2 DSL shape rejection test and loader checks for v2 required sections (`match/topology/closure/claims`); `runtime-claim-rule-registry.test.ts` now passes.
Task 3 | completed | `discover` now persists `slice-plan.json`; `analyze` now emits multi-candidate topology JSONL with `stats.coverage_rate/conflict_rate` and `counter_examples`.
Task 4 | completed | `review-pack` cards now include `decision_inputs` (`required_hops/failure_map/guarantees/non_guarantees`); updated test passes.
Task 5 | completed | `curate` now validates `match/topology/closure/claims`, enforces non-empty `closure.failure_map`, and writes `dsl-draft.json`; curate tests pass.
Task 6 | completed | `promote` now compiles DSL drafts, emits DSL+legacy YAML sections, and lints unknown placeholders in scope fields; promote tests pass.
Task 7 | completed | `verifyRuntimeChainOnDemand` is now rule-only (no unmatched reload fallback); verifier tests pass and legacy hardcoded reload constants/branches were removed.
Task 8 | completed | Local backend now enforces explicit runtime-claim reason semantics (including `gate_disabled`) and backfills missing-evidence gaps; integration tests pass.
Task 9 | completed | Regress now enforces `probe_pass_rate >= 0.85` and persists `probe_results` with replay commands; regress tests pass.
Task 10 | completed | Phase5 acceptance gate now enforces semantic authenticity checks (`static_hardcode_detected`, `dsl_lint_failed`, `probe_pass_rate_below_threshold`) and tests pass.
Task 11 | completed | Docs synced to current DSL-driven runtime contracts (`dsl-draft.json`, no legacy reload fallback, semantic Phase5 gate tri-check).
Task 12 | completed | Rebuilt index via `gitnexus analyze`; regenerated `2026-04-02-phase5-rule-lab-acceptance.{json,md}` with semantic authenticity fields; targeted matrix/acceptance checks pass, while repository-wide `vitest run` still has unrelated pre-existing failures.
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Remove reload hardcoded constants/branches; verifier must be rule-only | critical | Task 7, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts -- -t "no legacy reload fallback|runtime_claim contract" && rg -n "RESOURCE_ASSET_PATH|GRAPH_ASSET_PATH|RELOAD_GUID|shouldVerifyReloadChain|verifyReloadRuntimeChain" gitnexus/src/mcp/local/runtime-chain-verify.ts` | `query/context runtime_claim.reason`, `runtime_chain.hops[*].anchor` | source still contains `RESOURCE_ASSET_PATH`/`RELOAD_GUID` or unmatched query returns reload-specific chain
DC-02 Rule DSL must include match/topology/closure/claims and be schema-validated | critical | Task 1, Task 2, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts gitnexus/src/rule-lab/promote.test.ts` | `.gitnexus/rules/approved/*.yaml:match/topology/closure/claims` | promoted rule missing any DSL section or loader accepts invalid DSL
DC-03 Analyze must emit multi-candidate topology extraction with evidence + counterexample + coverage/conflict stats | critical | Task 3 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/analyze.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/candidates.jsonl[*].topology` | only single placeholder candidate or missing topology predicates
DC-04 Curate must output structured `dsl-draft.json` with required_hops + failure mapping + claims | critical | Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/dsl-draft.json` | accepts empty `confirmed_chain.steps` or missing failure map
DC-05 Promote must compile/lint DSL and block `unknown` placeholders | critical | Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/promote.test.ts` | `.gitnexus/rules/catalog.json`, `.gitnexus/rules/approved/*.yaml` | `resource_types`/`host_base_type` still `unknown` or lint errors ignored
DC-06 Regress must run probe-based evaluation and emit replayable evidence | critical | Task 9 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts` | `.gitnexus/rules/reports/<run_id>-regress.json:probe_results[*]` | precision/coverage passed without probe rows or replay commands
DC-07 Phase5 gate must enforce semantic authenticity (dsl lint + probe threshold + anti-hardcode scan) | critical | Task 10, Task 12 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts && node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('docs/reports/2026-04-02-phase5-rule-lab-acceptance.json','utf8'));if(!r.authenticity_checks?.static_no_hardcoded_reload?.pass||!r.authenticity_checks?.dsl_lint_pass||Number(r.metrics?.probe_pass_rate)<0.85){process.exit(1);}console.log('phase5 semantic authenticity checks passed');"` | `docs/reports/2026-04-02-phase5-rule-lab-acceptance.json:authenticity_checks.static_no_hardcoded_reload.pass`, `authenticity_checks.dsl_lint_pass`, `metrics.probe_pass_rate` | gate passes when anti-hardcode fails, `dsl_lint_pass=false`, or `probe_pass_rate<0.85`
DC-08 Runtime failure reasons must remain explicit and complete (`rule_not_matched`, `rule_matched_but_evidence_missing`, `rule_matched_but_verification_failed`, `gate_disabled`) | critical | Task 7, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts -- -t "failure classifications"` | `runtime_claim.reason` | any branch returns implicit fallback or missing reason
DC-09 Discover/review-pack artifacts must support decision traceability | major | Task 3, Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts gitnexus/src/rule-lab/review-pack.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/slice-plan.json`, `review-cards.md` | decision cards cannot map back to topology candidates
DC-10 Runtime output must reject placeholder hop anchors/snippets in verified claims | major | Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts -- -t "placeholder anchor rejection"` | `runtime_claim.hops[*].anchor`, `runtime_claim.hops[*].snippet` | verified claim contains `TODO|TBD|placeholder|<...>` in anchors/snippets

## Authenticity Assertions

- Verifier module (`runtime-chain-verify.ts`): `assert no placeholder path` by failing if runtime output anchor contains `placeholder|TODO|<...>`.
- Verifier module (`runtime-chain-verify.ts`): `assert live mode has tool evidence` by failing if `runtime_chain_verify=on-demand` returns success with empty hops.
- Curation module (`curate.ts`): `assert freeze requires non-empty confirmed_chain.steps` before any promote path.
- Promote/compiler module (`promote.ts`): `assert no placeholder path` by rejecting `unknown`, `TBD`, or templated literals in DSL scope/topology fields.
- Acceptance gate module (`phase5-rule-lab-acceptance-runner.ts`): `assert live mode has tool evidence` by requiring probe output rows, replay commands, and `authenticity_checks.dsl_lint_pass=true`.

## Refactor Dependency Snapshot (from `@gitnexus-refactoring`)

- `verifyRuntimeClaimOnDemand` upstream risk: **CRITICAL**, direct callers include `local-backend.ts` query/context paths and integration tests.
- `promoteCuratedRules` upstream risk: **MEDIUM**, affects CLI, phase5 acceptance runner, LocalBackend `ruleLabPromote`, and runtime verifier tests.
- Refactor order to enforce: **interfaces/schemas -> implementations -> callers -> tests -> docs/contracts**.

### Task 1: Define DSL v2 Types and Schemas (Interface First)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/types.ts`
- Create: `gitnexus/src/rule-lab/schema/rule-dsl.schema.json`
- Create: `gitnexus/src/rule-lab/schema/dsl-draft.schema.json`
- Modify: `gitnexus/src/rule-lab/paths.test.ts`

**Step 1: Write the failing test**

```ts
it('exposes DSL v2 topology and closure types', () => {
  const sample: RuleDslDraft = {
    id: 'demo.reload.v2',
    match: { trigger_tokens: ['reload'] },
    topology: [{ hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } }],
    closure: { required_hops: ['resource'], failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' } },
    claims: { guarantees: ['g1'], non_guarantees: ['ng1'], next_action: 'gitnexus query "Reload"' },
  };
  expect(sample.topology[0].edge.kind).toBe('binds_script');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/paths.test.ts`
Expected: FAIL (`RuleDslDraft`/DSL schema fields do not exist).

**Step 3: Write minimal implementation**

```ts
export interface RuleDslDraft {
  id: string;
  version: string;
  match: { trigger_tokens: string[]; symbol_kind?: string[]; module_scope?: string[] };
  topology: Array<{ hop: string; from: Record<string, unknown>; to: Record<string, unknown>; edge: { kind: string }; constraints?: Record<string, unknown> }>;
  closure: { required_hops: string[]; failure_map: Record<string, string> };
  claims: { guarantees: string[]; non_guarantees: string[]; next_action: string };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/paths.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/schema/rule-dsl.schema.json gitnexus/src/rule-lab/schema/dsl-draft.schema.json gitnexus/src/rule-lab/paths.test.ts
git commit -m "refactor(rule-lab): define dsl v2 types and schemas"
```

### Task 2: Refactor Rule Registry Loader to Parse DSL v2

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`

**Step 1: Write the failing test**

```ts
test('rejects rule yaml when topology/closure/claims are missing', async () => {
  await expect(loadRuleRegistry(repoPath, rulesRoot)).rejects.toThrow(/topology|closure|claims/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
Expected: FAIL (loader still accepts legacy minimal yaml).

**Step 3: Write minimal implementation**

```ts
function parseRuleYaml(raw: string, filePath: string): RuntimeClaimRule {
  const parsed = parseDslYamlToObject(raw, filePath);
  assertDslShape(parsed, filePath); // validates match/topology/closure/claims + no unknown placeholders
  return toRuntimeClaimRule(parsed, filePath);
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts
git commit -m "refactor(runtime-claim): load and validate dsl v2 rules"
```

### Task 3: Upgrade Discover + Analyze to Topology Candidate Space

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/discover.ts`
- Modify: `gitnexus/src/rule-lab/discover.test.ts`
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json`

**Step 1: Write the failing test**

```ts
it('analyze emits multiple topology candidates with coverage/conflict stats', async () => {
  const out = await analyzeRuleLabSlice({ repoPath, runId, sliceId });
  expect(out.candidates.length).toBeGreaterThan(1);
  expect(out.candidates[0]).toHaveProperty('topology');
  expect(out.candidates[0]).toHaveProperty('stats.coverage_rate');
  expect(out.candidates[0]).toHaveProperty('counter_examples');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts gitnexus/src/rule-lab/analyze.test.ts`
Expected: FAIL (discover/analyze still emit minimal placeholder model).

**Step 3: Write minimal implementation**

```ts
const candidates = extractTopologyCandidates(slice, graphEvidence).map((candidate) => ({
  ...candidate,
  stats: {
    coverage_rate: candidate.covered / Math.max(candidate.total, 1),
    conflict_rate: candidate.conflicts / Math.max(candidate.total, 1),
  },
}));
await writeJsonl(paths.candidatesPath, candidates);
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts gitnexus/src/rule-lab/analyze.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/discover.ts gitnexus/src/rule-lab/discover.test.ts gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json
git commit -m "feat(rule-lab): emit topology candidate space in discover/analyze"
```

### Task 4: Refactor Review-Pack to Decision Cards per Topology Candidate

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/review-pack.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`

**Step 1: Write the failing test**

```ts
it('review cards include topology decision fields', async () => {
  const out = await buildReviewPack({ repoPath, runId, sliceId, maxTokens: 6000 });
  expect(out.cards[0]).toHaveProperty('decision_inputs.required_hops');
  expect(out.cards[0]).toHaveProperty('decision_inputs.failure_map');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/review-pack.test.ts`
Expected: FAIL (cards only contain candidate ids).

**Step 3: Write minimal implementation**

```ts
cards.push({
  card_id,
  title,
  candidate_ids,
  decision_inputs: {
    required_hops,
    failure_map,
    guarantees,
    non_guarantees,
  },
});
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/review-pack.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/review-pack.ts gitnexus/src/rule-lab/review-pack.test.ts
git commit -m "refactor(rule-lab): add topology decision payload to review-pack cards"
```

### Task 5: Curate Stage Outputs `dsl-draft.json` with Semantic Validation

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/curate.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`
- Modify: `gitnexus/src/rule-lab/schema/curation-input.schema.json`

**Step 1: Write the failing test**

```ts
it('writes dsl-draft.json and rejects missing failure mapping', async () => {
  await expect(curateRuleLabSlice({ repoPath, runId, sliceId, inputPath })).rejects.toThrow(/failure_map/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts`
Expected: FAIL (curate currently validates only confirmed_chain + guarantees fields).

**Step 3: Write minimal implementation**

```ts
const draft = {
  id: item.rule_id,
  version: '2.0.0',
  match: item.match,
  topology: item.topology,
  closure: item.closure,
  claims: item.claims,
};
assertDslDraft(draft);
await fs.writeFile(paths.dslDraftPath, JSON.stringify(draft, null, 2));
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/curate.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/schema/curation-input.schema.json
git commit -m "feat(rule-lab): produce validated dsl draft artifacts in curate"
```

### Task 6: Promote Stage Compiles + Lints DSL and Blocks `unknown`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/promote.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`

**Step 1: Write the failing test**

```ts
it('rejects promote when resource_types or host_base_type are unknown', async () => {
  await expect(promoteCuratedRules({ repoPath, runId, sliceId })).rejects.toThrow(/unknown/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/promote.test.ts`
Expected: FAIL (promote still writes `unknown` placeholders).

**Step 3: Write minimal implementation**

```ts
function lintCompiledRule(rule: RuntimeClaimRule): void {
  if (rule.resource_types.some((v) => v === 'unknown') || rule.host_base_type.some((v) => v === 'unknown')) {
    throw new Error('promote lint failed: unknown scope placeholder is forbidden');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/promote.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/src/rule-lab/types.ts
git commit -m "refactor(rule-lab): compile and lint promoted dsl rules"
```

### Task 7: Rebuild Runtime Verifier as Unified DSL Executor

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`

**Step 1: Write the failing test**

```ts
it('does not run reload fallback when no rule is matched', async () => {
  const out = await verifyRuntimeClaimOnDemand({ repoPath, queryText: 'Reload', executeParameterized: async () => [], resourceBindings: [], rulesRoot });
  expect(out.reason).toBe('rule_not_matched');
  expect(out.hops).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
Expected: FAIL (legacy reload token fallback path still exists).

**Step 3: Write minimal implementation**

```ts
export async function verifyRuntimeChainOnDemand(input: VerifyRuntimeChainInput): Promise<RuntimeChainResult | undefined> {
  if (!input.rule) return undefined; // remove legacy token fallback
  return executeDslTopology({ rule: input.rule, evidence: input });
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts
git commit -m "refactor(runtime-verify): remove reload hardcoded fallback and execute unified dsl topology"
```

### Task 8: Wire Runtime Claim Semantics in Local Backend Callers

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim.test.ts`

**Step 1: Write the failing test**

```ts
it('runtime_claim reports explicit reasons/gaps and covers gate_disabled branch', async () => {
  const out = await backend.callTool('query', { query: 'Reload', unity_resources: 'on', runtime_chain_verify: 'on-demand' });
  expect(['rule_not_matched','rule_matched_but_evidence_missing','rule_matched_but_verification_failed','gate_disabled']).toContain(out.runtime_claim.reason);
  if (out.runtime_claim.reason === 'rule_matched_but_evidence_missing') expect(out.runtime_claim.gaps.length).toBeGreaterThan(0);
  process.env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY = 'off';
  const disabled = await backend.callTool('query', { query: 'Reload', unity_resources: 'on', runtime_chain_verify: 'on-demand' });
  expect(disabled.runtime_claim.reason).toBe('gate_disabled');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-claim.test.ts`
Expected: FAIL (reason/gap contract not fully enforced in caller integration).

**Step 3: Write minimal implementation**

```ts
if (runtimeClaim.reason === 'rule_matched_but_evidence_missing' && runtimeClaim.gaps.length === 0) {
  runtimeClaim.gaps = [{ segment: 'runtime', reason: 'missing verifier evidence', next_command: runtimeClaim.next_action }];
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-claim.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-claim.test.ts
git commit -m "refactor(local-backend): enforce explicit runtime claim failure semantics"
```

### Task 9: Regress Stage Auto-Probe Evaluation and Replayable Report

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/regress.ts`
- Modify: `gitnexus/src/rule-lab/regress.test.ts`
- Modify: `gitnexus/src/rule-lab/schema/regress-report.schema.json`

**Step 1: Write the failing test**

```ts
it('fails regress when probe pass-rate is below threshold even if metrics are injected high', async () => {
  const out = await runRuleLabRegress({ precision: 0.95, coverage: 0.95, probes: [{ id: 'p1', pass: false, replay_command: 'gitnexus query ...' }] });
  expect(out.pass).toBe(false);
  expect(out.failures).toContain('probe_pass_rate_below_threshold');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts`
Expected: FAIL (regress currently only checks numeric precision/coverage inputs).

**Step 3: Write minimal implementation**

```ts
const probePassRate = passedProbes / Math.max(totalProbes, 1);
if (probePassRate < 0.85) failures.push('probe_pass_rate_below_threshold');
output.probe_results = probes;
output.metrics.probe_pass_rate = probePassRate;
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/regress.ts gitnexus/src/rule-lab/regress.test.ts gitnexus/src/rule-lab/schema/regress-report.schema.json
git commit -m "feat(rule-lab): add probe-based regress gating and replay evidence"
```

### Task 10: Upgrade Phase5 Gate to Semantic Authenticity Checks

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts`
- Modify: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing test**

```ts
test('phase5 gate fails when anti-hardcode scan or dsl lint fails', async () => {
  const gate = await runPhase5RuleLabGate({ reportPath: fixtureReportPathWithHardcodedLeak });
  assert.equal(gate.pass, false);
  assert.ok(['static_hardcode_detected', 'dsl_lint_failed'].includes(String(gate.reason)));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: FAIL (current gate checks only stage count and numeric metrics).

**Step 3: Write minimal implementation**

```ts
if (!report.authenticity_checks?.static_no_hardcoded_reload?.pass) {
  return { pass: false, reason: 'static_hardcode_detected' };
}
if (!report.authenticity_checks?.dsl_lint_pass) {
  return { pass: false, reason: 'dsl_lint_failed' };
}
if ((report.metrics?.probe_pass_rate ?? 0) < 0.85) {
  return { pass: false, reason: 'probe_pass_rate_below_threshold' };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "feat(phase5): enforce semantic authenticity gate for rule-lab"
```

### Task 11: Documentation + Config Contract Sync for New DSL/Artifacts

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/gitnexus-config-files.md`
- Modify: `docs/reports/2026-04-02-rule-lab-data-driven-fact-check.md`

**Step 1: Write the failing test**

```ts
it('docs mention dsl-draft artifact and anti-hardcode phase5 gate', async () => {
  const truth = await fs.readFile('docs/unity-runtime-process-source-of-truth.md', 'utf-8');
  expect(truth).toMatch(/dsl-draft\.json/i);
  expect(truth).toMatch(/static anti-hardcode|no hardcoded/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: FAIL (docs still describe placeholder/as-built boundaries).

**Step 3: Write minimal implementation**

```md
- add Rule Lab DSL v2 artifact path: `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/dsl-draft.json`
- update verifier boundary: no legacy reload hardcoded fallback
- update phase5 gate contract: dsl lint + probe threshold + static anti-hardcode
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/gitnexus-config-files.md docs/reports/2026-04-02-rule-lab-data-driven-fact-check.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(rule-lab): sync dsl-driven runtime verification contracts"
```

### Task 12: Full Verification Sweep + Blast-Radius Check

**User Verification: not-required**

**Files:**
- Modify: `docs/reports/2026-04-02-phase5-rule-lab-acceptance.md`
- Modify: `docs/reports/2026-04-02-phase5-rule-lab-acceptance.json`

**Step 1: Write the failing test**

```ts
test('final acceptance includes semantic gate evidence fields', async () => {
  const report = JSON.parse(await fs.readFile('docs/reports/2026-04-02-phase5-rule-lab-acceptance.json', 'utf-8'));
  expect(report.authenticity_checks.static_no_hardcoded_reload.pass).toBe(true);
  expect(report.authenticity_checks.dsl_lint_pass).toBe(true);
  expect(report.metrics.probe_pass_rate).toBeGreaterThanOrEqual(0.85);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts`
Expected: FAIL until new acceptance artifact format is generated.

**Step 3: Write minimal implementation**

```bash
npm --prefix gitnexus run build
node gitnexus/dist/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.js --repo-path . --out-json docs/reports/2026-04-02-phase5-rule-lab-acceptance.json --out-md docs/reports/2026-04-02-phase5-rule-lab-acceptance.md
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts && npm --prefix gitnexus exec vitest run`
Expected: PASS with updated acceptance artifacts.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-02-phase5-rule-lab-acceptance.json docs/reports/2026-04-02-phase5-rule-lab-acceptance.md
git commit -m "test(rule-lab): regenerate phase5 acceptance artifacts for dsl-driven gate"
```

## Final Verification Checklist

1. Run `gitnexus detect_changes` (or MCP `detect_changes`) and confirm impacted processes are expected (`rule-lab`, `local backend`, `phase5 acceptance`).
2. Re-run `Design Traceability Matrix` verification commands; every critical clause must produce evidence artifacts.
3. Run `rg -n "RESOURCE_ASSET_PATH|GRAPH_ASSET_PATH|RELOAD_GUID|shouldVerifyReloadChain|verifyReloadRuntimeChain" gitnexus/src/mcp/local/runtime-chain-verify.ts` and expect no project-specific hardcoded branch/constants.
4. Confirm promoted rules in `.gitnexus/rules/approved/*.yaml` pass DSL lint and contain non-placeholder scope/topology.
5. Confirm `runtime_claim.reason` coverage includes all four failure classifications via tests.

## Plan Audit Verdict

audit_scope: design sections 1-7 + fact-check claims 1-5 + unity source-of-truth Rule Lab/runtime claim contract
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- prior P1 (`DC-01` verification command lacked static scan) fixed by adding `rg` anti-hardcode scan in matrix command
- prior P1 (fact-check absolute path root mismatch) fixed by rewriting links to `/Volumes/Shuttle/projects/agentic/GitNexus/...`
- prior P1 (`DC-07` semantic gate command lacked explicit tri-check) fixed by adding acceptance artifact assertion for anti-hardcode + dsl lint + probe threshold
- prior P1 (Task 12 accepted numeric probe field without threshold semantics) fixed by asserting `probe_pass_rate >= 0.85`
- prior P1 (fact-check role ambiguity as post-fix evidence) fixed by marking baseline-only role and acceptance report authority
anti_placeholder_checks:
- rule-lab promote path requires reject on `unknown|TODO|TBD|<...>`: pass
- curate path requires non-empty `confirmed_chain.steps` before draft compile: pass
authenticity_checks:
- phase5 gate mapped to static anti-hardcode + probe pass-rate + `dsl_lint_pass`: pass
- runtime verifier mapped to rule-only execution (no legacy reload fallback): pass
approval_decision: pass
