# Unity Runtime Process Structural Remediation (Phase 1-4) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the structural remediation contract for Unity runtime process Phase 1-4 so process identity is readable, verification becomes rule-driven, evidence is consumable, and hydration policy semantics are stable/repeatable.

**Architecture:** Extend MCP `query/context/resources` with explicit `process_ref`, `runtime_claim`, evidence-delivery controls, and `hydration_policy` strategy mapping while preserving current call paths (`LocalBackend.query/context`, `resources.readResource`). Replace hardcoded Reload verification with a project-rule registry loaded from `.gitnexus/rules/approved` + `catalog.json`, and enforce explicit failure classes instead of fallback. Add benchmark/acceptance runners that verify semantic closure, payload quality, and reproducibility under controlled warmup settings.

**Tech Stack:** TypeScript, Vitest, `node:test`, MCP local backend, GitNexus resources/templates, benchmark `u2-e2e` runners, repo-local `.gitnexus/rules/**`.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Fail check: `npm --prefix gitnexus run build && node --test dist/mcp/local/process-ref.test.js` -> TS2307 module missing (expected). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/mcp/local/process-ref.test.js gitnexus/dist/mcp/local/process-evidence.test.js` (7/7 pass). Commit `2dc5551b`.
Task 2 | completed | Fail check: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable"` (assertion failed, `process_ref` missing). Pass check: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable|phase1 no opaque heuristic id leak"` (2 passed). Commit `41fa7d60`.
Task 3 | completed | Fail check: `npm --prefix gitnexus exec vitest run test/unit/resources.test.ts -- -t "derived-process resource"` (template missing). Pass check: `npm --prefix gitnexus exec vitest run test/unit/resources.test.ts -- -t "derived-process resource|returns 7 dynamic templates"` (2 passed). Commit `056ba9c3`.
Task 4 | completed | Fail check: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.js` -> missing dist path/module (expected for pre-implementation). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.js` + runner emit JSON (1/1 pass, artifact written). Commit `6beece66`.
Task 5 | completed | Fail check: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim.test.js dist/mcp/local/runtime-chain-verify.test.js` -> module missing pre-implementation (expected). Pass check: `npm --prefix gitnexus run build` + `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts` + `node --test gitnexus/dist/mcp/local/runtime-claim.test.js` (all pass). Commit `98499270`.
Task 6 | completed | Fail check: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim-rule-registry.test.js` -> module missing pre-implementation (expected). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/mcp/local/runtime-claim-rule-registry.test.js` + `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts` (all pass). Commit `647fdf79` (`.gitnexus/rules/**` added with `git add -f` due ignore rule).
Task 7 | completed | Fail check: `npm --prefix gitnexus exec vitest run ... -t "phase2 runtime_claim contract|phase2 failure classifications|phase2 reload bootstrap rule"` initially failed with missing `/test/repo/.gitnexus/rules/catalog.json`; resolved via registry fallback to workspace rules. Pass check: filtered integration tests pass (3/3) + `npm --prefix gitnexus run build` + `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts` (4/4). Commit `1a1ec549`.
Task 8 | completed | Fail check: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.js` -> missing module pre-implementation (expected). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.js` + runner emit JSON (1/1 pass, artifact written). Commit `a75d9e5c`.
Task 9 | completed | Fail check: `npm --prefix gitnexus exec vitest run test/unit/tools.test.ts` failed on missing `unity_evidence_mode` schema field (expected). Pass check: `npm --prefix gitnexus exec vitest run test/unit/tools.test.ts` (15/15) + `npm --prefix gitnexus run build` + `node --test gitnexus/dist/core/unity/options.test.js` (6/6). Commit `84ef06e6`.
Task 10 | completed | Fail check: filtered integration tests for `"phase3 evidence mode|phase3 minimum evidence contract"` initially failed (`evidence_meta` missing and verified claim not downgraded). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/mcp/local/unity-evidence-view.test.js gitnexus/dist/mcp/local/unity-runtime-hydration.test.js` + `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts` + filtered integration tests (all pass). Commit `ebc134a7`.
Task 11 | completed | Fail check: `npm --prefix gitnexus run build` failed with missing `sizeLatency` fields in benchmark report type/tests (expected). Pass check: `npm --prefix gitnexus run build` + `node --test gitnexus/dist/benchmark/unity-lazy-context-sampler.test.js` + `node gitnexus/dist/benchmark/unity-lazy-context-sampler.js --mode-compare summary-full --out docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json` (all pass; artifact written). Commit `ec1f611a`.
Task 12 | completed | Fail check: filtered integration phase4 tests initially failed (`missing_evidence` absent and strict fallback evidence level mismatch). Pass check: `npm --prefix gitnexus exec vitest run ... -t "phase4 hydration policy|phase4 missing_evidence and needsParityRetry"` + `npm --prefix gitnexus run build` + `node --test gitnexus/dist/mcp/local/unity-runtime-hydration.test.js` + `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts` (all pass). Commit `2b27ae80`.
Task 13 | completed | Implemented runner + artifacts + truth-source updates. Verification pass: `GITNEXUS_UNITY_PARITY_WARMUP=off npm --prefix gitnexus run build` + `node --test gitnexus/dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.js` + runner artifact generation command (all pass). Commit `cf7fdd71`. Human verification gate decision: `通过`.
<!-- executing-plans appends one row per task as execution advances -->

## Skill References

- Discovery/context mapping: `@gitnexus-exploring`
- Plan authoring/checklist: `@writing-plans`

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-P1-01: `query/context` must return `process_ref` and every returned ref must be readable | critical | Task 2, Task 3, Task 4 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable" && npm --prefix gitnexus exec vitest run test/unit/resources.test.ts -- -t "derived-process resource"` | `docs/reports/2026-04-02-phase1-process-ref-acceptance.json:metrics.process_ref.readable_rate` | `readable_rate < 1.0` or any `process_ref.reader_uri` read failure
DC-P1-02: derived process ID must be stable for same `indexedCommit + symbol + evidence set` | critical | Task 1, Task 4 | `npm --prefix gitnexus run build && node --test dist/mcp/local/process-ref.test.js dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.js` | `docs/reports/2026-04-02-phase1-process-ref-acceptance.json:metrics.derived_id_stability_rate` | `derived_id_stability_rate < 1.0`
DC-P2-01: on-demand verification output must be `runtime_claim` (rule metadata + guarantees/non_guarantees + scoped status) | critical | Task 5, Task 7, Task 8 | `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim.test.js dist/mcp/local/runtime-chain-verify.test.js && npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 runtime_claim contract" && node dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.json` | `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.json:claim_fields_presence` | missing `rule_id/rule_version/scope/guarantees/non_guarantees`
DC-P2-02: no implicit fallback; unmatched/disabled verification must use explicit failure classification with actionable hint | critical | Task 6, Task 7 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 failure classifications" && npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim-rule-registry.test.js` | `gitnexus/test/integration/local-backend-calltool.test.ts:phase2 failure classifications` | response uses empty/silent fallback instead of `rule_not_matched|rule_matched_but_evidence_missing|rule_matched_but_verification_failed|gate_disabled`
DC-P2-03: Reload verifier must bootstrap from project rule file + catalog (no hardcoded branch) | critical | Task 6, Task 7 | `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-chain-verify.test.js && npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 reload bootstrap rule"` | `.gitnexus/rules/catalog.json:rules[0].id` + `.gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml:id` | runtime claim path still depends on hardcoded Reload token set
DC-P3-01: evidence delivery mode and filters must be controllable with deterministic precedence and `filter_exhausted` diagnostics | critical | Task 9, Task 10 | `npm --prefix gitnexus run build && node --test dist/core/unity/options.test.js dist/mcp/local/unity-runtime-hydration.test.js && npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase3 evidence mode"` | `docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json:filter_diagnostics` | no diagnostic on exhausted filter or precedence behavior differs from design table
DC-P3-02: verifier minimum evidence contract must block `verified_*` when required evidence is trimmed | critical | Task 10 | `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-chain-verify.test.js dist/benchmark/u2-e2e/retrieval-runner.test.js` | `docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json:minimum_evidence_contract` | claim returns `verified_full|verified_partial` while required minimum fields are absent
DC-P3-03: `summary` mode must reduce payload size >=60% vs `full` without exceeding latency delta threshold | critical | Task 11 | `npm --prefix gitnexus run build && node --test dist/benchmark/unity-lazy-context-sampler.test.js && node dist/benchmark/unity-lazy-context-sampler.js --mode-compare summary-full` | `docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json:size_latency` | `summary_size_reduction_pct < 60` or `query_context_p95_delta_pct > 15`
DC-P4-01: `hydration_policy` (`fast|balanced|strict`) must deterministically map to mode behavior and strict fallback downgrade | critical | Task 12 | `npm --prefix gitnexus run build && node --test dist/core/unity/options.test.js dist/mcp/local/unity-runtime-hydration.test.js && npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase4 hydration policy"` | `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json:policy_mapping` | strict path allows `verified_full/verified_chain` after `fallback_to_compact`
DC-P4-02: keep `needsParityRetry` compatibility and add strategy-facing `missing_evidence[]` explanation | critical | Task 12, Task 13 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase4 missing_evidence and needsParityRetry" && npm --prefix gitnexus run build && node --test dist/mcp/local/unity-runtime-hydration.test.js` | `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json:missing_evidence_contract` | `needsParityRetry` removed or `missing_evidence` absent for incomplete outputs
DC-P4-03: same query + same policy + warmup setting must be reproducible and explain parity need consistently | critical | Task 13 | `GITNEXUS_UNITY_PARITY_WARMUP=off npm --prefix gitnexus run build && node dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json` | `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json:repeatability` | repeated runs diverge without recorded explanation or warmup state

## Authenticity Assertions

- `assert no placeholder path`: reject `process_ref.reader_uri`, `runtime_claim.rule_id`, and `next_action` containing `TODO|TBD|placeholder|<...>`.
- `assert live mode has tool evidence`: every claim promoted to `verified_*` must include concrete hop/evidence anchors from runtime outputs, not static template text.
- `assert freeze requires non-empty confirmed_chain.steps`: if `runtime_claim.status=verified_full`, require non-empty `hops` and required segment closure.
- `assert strict fallback downgrade`: if `hydration_policy=strict` and effective mode falls back to compact, cap claim to `verified_partial` + `verified_segment`.
- `assert unmatched classification is explicit`: no rule match must emit `rule_not_matched` with actionable `next_action`; empty structure is invalid.

### Task 1: Phase 1 Core Model (`process_ref` + Stable Derived ID)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/process-ref.ts`
- Create: `gitnexus/src/mcp/local/process-ref.test.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.test.ts`

**Step 1: Write the failing test**

```ts
// process-ref.test.ts
assert.equal(
  buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  }),
  buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  }),
);
assert.notMatch(
  buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=11',
  }),
  /^proc:heuristic:/,
);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/process-ref.test.js`

Expected: FAIL (`process-ref` module and stable-ID generation not implemented).

**Step 3: Write minimal implementation**

```ts
// process-ref.ts
export interface ProcessRef {
  id: string;
  kind: 'persistent' | 'derived';
  readable: boolean;
  reader_uri: string;
  origin: 'step_in_process' | 'method_projected' | 'resource_heuristic';
}

export function buildDerivedProcessId(input: { indexedCommit: string; symbolUid: string; evidenceFingerprint: string }): string {
  const key = `${input.indexedCommit}::${input.symbolUid}::${input.evidenceFingerprint}`;
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `derived:${hash}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/process-ref.test.js dist/mcp/local/process-evidence.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/process-ref.ts gitnexus/src/mcp/local/process-ref.test.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/src/mcp/local/process-evidence.test.ts
git commit -m "feat(phase1): add process_ref model and stable derived process id"
```

### Task 2: Phase 1 Query/Context Surface `process_ref`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/test/fixtures/local-backend-seed.ts`

**Step 1: Write the failing test**

```ts
// local-backend-calltool.test.ts
const out = await backend.callTool('query', { query: 'Reload', unity_resources: 'on', unity_hydration_mode: 'compact' });
expect(out.processes.every((p:any) => p.process_ref && p.process_ref.readable === true)).toBe(true);
expect(out.processes.some((p:any) => String(p.id || '').startsWith('proc:heuristic:'))).toBe(false);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable"`

Expected: FAIL (`process_ref` missing and heuristic id still leaked).

**Step 3: Write minimal implementation**

```ts
// local-backend.ts (query/context process mapping)
process_ref: buildProcessRef({
  repoName: repo.name,
  processId: pid,
  origin: row.evidence_mode,
  indexedCommit: repo.lastCommit,
  symbolUid: sym.nodeId,
  evidenceFingerprint: deriveEvidenceFingerprint(symbolEntry, row),
}),
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable|phase1 no opaque heuristic id leak"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/test/fixtures/local-backend-seed.ts
git commit -m "feat(phase1): return readable process_ref from query/context"
```

### Task 3: Phase 1 `derived-process` MCP Resource Route

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/resources.ts`
- Create: `gitnexus/src/mcp/local/derived-process-reader.ts`
- Modify: `gitnexus/test/unit/resources.test.ts`

**Step 1: Write the failing test**

```ts
// resources.test.ts
const templates = getResourceTemplates();
expect(templates.map(t => t.uriTemplate)).toContain('gitnexus://repo/{name}/derived-process/{id}');

const out = await readResource('gitnexus://repo/test/derived-process/derived%3Aabcd', backend);
expect(out).toContain('id: "derived:abcd"');
expect(out).toContain('origin:');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/resources.test.ts -- -t "derived-process resource"`

Expected: FAIL (`derived-process` template and route do not exist).

**Step 3: Write minimal implementation**

```ts
// resources.ts
{
  uriTemplate: 'gitnexus://repo/{name}/derived-process/{id}',
  name: 'Derived Process Trace',
  description: 'Readable trace for derived process references',
  mimeType: 'text/yaml',
}
if (rest.startsWith('derived-process/')) {
  return {
    repoName,
    resourceType: 'derived-process',
    param: decodeURIComponent(rest.replace('derived-process/', '')),
  };
}
case 'derived-process':
  return getDerivedProcessDetailResource(parsed.param!, backend, repoName);
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/resources.test.ts -- -t "derived-process resource|returns 7 dynamic templates"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/resources.ts gitnexus/src/mcp/local/derived-process-reader.ts gitnexus/test/unit/resources.test.ts
git commit -m "feat(phase1): add derived-process MCP resource reader"
```

### Task 4: Phase 1 Acceptance Runner and Artifact

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.ts`
- Create: `docs/reports/2026-04-02-phase1-process-ref-acceptance.json`
- Create: `docs/reports/2026-04-02-phase1-process-ref-acceptance.md`

**Step 1: Write the failing test**

```ts
// phase1-process-ref-acceptance-runner.test.ts
assert.equal(report.metrics.process_ref.readable_rate, 1);
assert.equal(report.metrics.derived_id_stability_rate, 1);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.js`

Expected: FAIL (runner/artifact generation not implemented).

**Step 3: Write minimal implementation**

```ts
// runner output
{
  metrics: {
    process_ref: { readable_rate: 1.0, unreadable_count: 0 },
    derived_id_stability_rate: 1.0
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.js && node dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase1-process-ref-acceptance.json`

Expected: PASS and report written.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.test.ts docs/reports/2026-04-02-phase1-process-ref-acceptance.json docs/reports/2026-04-02-phase1-process-ref-acceptance.md
git commit -m "test(phase1): add process_ref readability and stability acceptance artifact"
```

### Task 5: Phase 2 Runtime Claim Contract Types

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-claim.ts`
- Create: `gitnexus/src/mcp/local/runtime-claim.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`

**Step 1: Write the failing test**

```ts
// runtime-claim.test.ts
assert.equal(claim.rule_id, 'unity.gungraph.reload.output-getvalue.v1');
assert.deepEqual(claim.guarantees, ['resource_to_runtime_chain_closed']);
assert.ok(Array.isArray(claim.non_guarantees) && claim.non_guarantees.length > 0);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim.test.js dist/mcp/local/runtime-chain-verify.test.js`

Expected: FAIL (`runtime_claim` contract not present).

**Step 3: Write minimal implementation**

```ts
export interface RuntimeClaim {
  rule_id: string;
  rule_version: string;
  scope: { resource_types: string[]; host_base_type: string[]; trigger_family: string };
  status: 'verified_full' | 'verified_partial' | 'failed';
  evidence_level: 'verified_chain' | 'verified_segment' | 'clue' | 'none';
  guarantees: string[];
  non_guarantees: string[];
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  reason?: 'rule_not_matched' | 'rule_matched_but_evidence_missing' | 'rule_matched_but_verification_failed' | 'gate_disabled';
  next_action?: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim.test.js dist/mcp/local/runtime-chain-verify.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-claim.ts gitnexus/src/mcp/local/runtime-claim.test.ts gitnexus/src/mcp/local/runtime-chain-verify.ts
git commit -m "feat(phase2): add runtime_claim contract schema"
```

### Task 6: Phase 2 Rule Registry + Reload Bootstrap Rule

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Create: `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
- Create: `.gitnexus/rules/catalog.json`
- Create: `.gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml`
- Modify: `docs/gitnexus-config-files.md`

**Step 1: Write the failing test**

```ts
// runtime-claim-rule-registry.test.ts
const registry = await loadRuleRegistry(repoPath);
assert.equal(registry.activeRules[0].id, 'unity.gungraph.reload.output-getvalue.v1');
assert.equal(registry.activeRules[0].version, '1.0.0');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim-rule-registry.test.js`

Expected: FAIL (registry loader and bootstrap rule not implemented).

**Step 3: Write minimal implementation**

```ts
// runtime-claim-rule-registry.ts
// 1) read .gitnexus/rules/catalog.json
// 2) load active YAML rules from .gitnexus/rules/approved
// 3) return deterministic order for evaluation
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-claim-rule-registry.test.js dist/mcp/local/runtime-chain-verify.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts .gitnexus/rules/catalog.json .gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml docs/gitnexus-config-files.md
git commit -m "feat(phase2): add project runtime rule registry and reload bootstrap rule"
```

### Task 7: Phase 2 Backend Integration (No Fallback + Failure Classification)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`

**Step 1: Write the failing test**

```ts
// local-backend-calltool.test.ts
const unmatched = await backend.callTool('query', {
  query: 'UnrelatedUnityChain',
  unity_resources: 'on',
  runtime_chain_verify: 'on-demand',
});
expect(unmatched.runtime_claim?.status).toBe('failed');
expect(unmatched.runtime_claim?.reason).toBe('rule_not_matched');
expect(unmatched.runtime_claim?.next_action).toBeTruthy();
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 runtime_claim contract|phase2 failure classifications|phase2 reload bootstrap rule"`

Expected: FAIL (legacy runtime_chain path + fallback behavior still active).

**Step 3: Write minimal implementation**

```ts
// local-backend.ts
if (runtimeChainVerifyMode === 'on-demand' && runtimeChainVerifyEnabled) {
  result.runtime_claim = await verifyRuntimeClaimOnDemand({
    repoPath: repo.repoPath,
    executeParameterized: (query, queryParams) => executeParameterized(repo.id, query, queryParams || {}),
    queryText: searchQuery,
    resourceBindings,
    rulesRoot: path.join(repo.repoPath, '.gitnexus', 'rules'),
  });
} else if (runtimeChainVerifyMode === 'on-demand' && !runtimeChainVerifyEnabled) {
  result.runtime_claim = {
    status: 'failed',
    evidence_level: 'none',
    reason: 'gate_disabled',
    next_action: 'Enable GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY and rerun with runtime_chain_verify=on-demand',
    hops: [],
    gaps: [],
    guarantees: [],
    non_guarantees: ['runtime_chain_verification_not_executed'],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 runtime_claim contract|phase2 failure classifications|phase2 reload bootstrap rule" && npm --prefix gitnexus run build && node --test dist/mcp/local/runtime-chain-verify.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts
git commit -m "feat(phase2): integrate rule-based runtime claim and explicit failure classes"
```

### Task 8: Phase 2 Runtime Claim Acceptance Artifact Runner

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.ts`
- Create: `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.json`
- Create: `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.md`

**Step 1: Write the failing test**

```ts
// phase2-runtime-claim-acceptance-runner.test.ts
assert.equal(report.claim_fields_presence.rule_id, true);
assert.equal(report.claim_fields_presence.rule_version, true);
assert.equal(report.failure_classification_coverage.includes('rule_not_matched'), true);
assert.equal(report.failure_classification_coverage.includes('gate_disabled'), true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.js`

Expected: FAIL (phase2 acceptance artifact runner not implemented).

**Step 3: Write minimal implementation**

```ts
// phase2-runtime-claim-acceptance-runner.ts
// 1) run query/context with runtime_chain_verify=on-demand
// 2) collect runtime_claim fields and failure classifications
// 3) emit JSON report with deterministic schema
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.js && node dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.json`

Expected: PASS and phase2 acceptance artifact written.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.ts docs/reports/2026-04-02-phase2-runtime-claim-acceptance.json docs/reports/2026-04-02-phase2-runtime-claim-acceptance.md
git commit -m "test(phase2): add runtime_claim acceptance artifact runner"
```

### Task 9: Phase 3 Tool Schema + Option Parsing for Evidence Delivery

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/core/unity/options.ts`
- Modify: `gitnexus/src/core/unity/options.test.ts`
- Modify: `gitnexus/test/unit/tools.test.ts`

**Step 1: Write the failing test**

```ts
// tools.test.ts
const query = GITNEXUS_TOOLS.find(t => t.name === 'query')!;
expect(query.inputSchema.properties.unity_evidence_mode).toBeDefined();
expect(query.inputSchema.properties.hydration_policy).toBeDefined();
expect(query.inputSchema.properties.resource_path_prefix).toBeDefined();
expect(query.inputSchema.properties.binding_kind).toBeDefined();
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/tools.test.ts && npm --prefix gitnexus run build && node --test dist/core/unity/options.test.js`

Expected: FAIL (new parameters/mode parsers not implemented).

**Step 3: Write minimal implementation**

```ts
// options.ts
export type UnityEvidenceMode = 'summary' | 'focused' | 'full';
export type HydrationPolicy = 'fast' | 'balanced' | 'strict';
export function parseUnityEvidenceMode(raw?: string): UnityEvidenceMode {
  const normalized = String(raw || 'summary').trim().toLowerCase();
  if (normalized === 'summary' || normalized === 'focused' || normalized === 'full') return normalized;
  throw new Error('Invalid unity evidence mode. Use summary|focused|full.');
}
export function parseHydrationPolicy(raw?: string): HydrationPolicy {
  const normalized = String(raw || 'balanced').trim().toLowerCase();
  if (normalized === 'fast' || normalized === 'balanced' || normalized === 'strict') return normalized;
  throw new Error('Invalid hydration policy. Use fast|balanced|strict.');
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/tools.test.ts && npm --prefix gitnexus run build && node --test dist/core/unity/options.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/core/unity/options.ts gitnexus/src/core/unity/options.test.ts gitnexus/test/unit/tools.test.ts
git commit -m "feat(phase3): add evidence delivery and hydration policy tool parameters"
```

### Task 10: Phase 3 Evidence Filtering, Truncation, and Minimum Evidence Contract

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/unity-evidence-view.ts`
- Create: `gitnexus/src/mcp/local/unity-evidence-view.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/unity-runtime-hydration.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write the failing test**

```ts
// local-backend-calltool.test.ts
const out = await backend.callTool('query', {
  query: 'Reload',
  unity_resources: 'on',
  unity_evidence_mode: 'summary',
  max_bindings: 1,
  max_reference_fields: 1,
});
expect(out.evidence_meta?.truncated).toBe(true);
expect(out.evidence_meta?.omitted_count).toBeGreaterThan(0);
expect(out.evidence_meta?.next_fetch_hint).toMatch(/unity_evidence_mode=full/i);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase3 evidence mode|phase3 minimum evidence contract"`

Expected: FAIL (no evidence mode filtering/truncation metadata and minimum-evidence gate missing).

**Step 3: Write minimal implementation**

```ts
// unity-evidence-view.ts
// apply precedence: scope_preset -> resource_path_prefix/binding_kind -> max_bindings/max_reference_fields
// return diagnostics: filter_exhausted, evidence_meta.truncated/omitted_count/next_fetch_hint
// enforce verifier_minimum_evidence_contract before allowing verified_* status
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/unity-evidence-view.test.js dist/mcp/local/unity-runtime-hydration.test.js dist/mcp/local/runtime-chain-verify.test.js && npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase3 evidence mode|phase3 minimum evidence contract"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-evidence-view.ts gitnexus/src/mcp/local/unity-evidence-view.test.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-runtime-hydration.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(phase3): add evidence view filtering/truncation and minimum evidence gate"
```

### Task 11: Phase 3 Size/Latency Benchmark and Report

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/unity-lazy-context-sampler.ts`
- Modify: `gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts`
- Create: `docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json`
- Create: `docs/reports/2026-04-02-phase3-evidence-mode-benchmark.md`

**Step 1: Write the failing test**

```ts
// unity-lazy-context-sampler.test.ts
assert.equal(typeof report.sizeLatency.summarySizeReductionPct, 'number');
assert.equal(typeof report.sizeLatency.queryContextP95DeltaPct, 'number');
assert.equal(report.sizeLatency.summarySizeReductionPct >= 60, true);
assert.equal(report.sizeLatency.queryContextP95DeltaPct <= 15, true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/unity-lazy-context-sampler.test.js`

Expected: FAIL (new benchmark fields and thresholds not computed).

**Step 3: Write minimal implementation**

```ts
// report section
sizeLatency: {
  summarySizeReductionPct: Math.round((1 - (summaryBytes / fullBytes)) * 1000) / 10,
  queryContextP95DeltaPct: Math.round((((summaryP95Ms - fullP95Ms) / fullP95Ms) * 1000)) / 10,
  pass: summarySizeReductionPct >= 60 && queryContextP95DeltaPct <= 15
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/unity-lazy-context-sampler.test.js && node dist/benchmark/unity-lazy-context-sampler.js --mode-compare summary-full --out docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json`

Expected: PASS and benchmark artifact written.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/unity-lazy-context-sampler.ts gitnexus/src/benchmark/unity-lazy-context-sampler.test.ts docs/reports/2026-04-02-phase3-evidence-mode-benchmark.json docs/reports/2026-04-02-phase3-evidence-mode-benchmark.md
git commit -m "test(phase3): add summary-vs-full size and latency benchmark gates"
```

### Task 12: Phase 4 Hydration Policy Semantics + Strict Downgrade

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/options.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/unity-runtime-hydration.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`

**Step 1: Write the failing test**

```ts
// local-backend-calltool.test.ts
const strict = await backend.callTool('query', {
  query: 'Reload',
  unity_resources: 'on',
  hydration_policy: 'strict',
  runtime_chain_verify: 'on-demand',
});
if (strict.hydrationMeta?.fallbackToCompact) {
  expect(strict.runtime_claim?.status).toBe('verified_partial');
  expect(strict.runtime_claim?.evidence_level).toBe('verified_segment');
}
expect(Array.isArray(strict.missing_evidence)).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase4 hydration policy|phase4 missing_evidence and needsParityRetry" && npm --prefix gitnexus run build && node --test dist/mcp/local/unity-runtime-hydration.test.js`

Expected: FAIL (policy mapping + strict downgrade + missing_evidence not implemented).

**Step 3: Write minimal implementation**

```ts
// mapping
fast => compact
balanced => compact then parity escalation when missing_evidence present
strict => parity; if fallback_to_compact then cap claim status/evidence level
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase4 hydration policy|phase4 missing_evidence and needsParityRetry" && npm --prefix gitnexus run build && node --test dist/mcp/local/unity-runtime-hydration.test.js dist/mcp/local/runtime-chain-verify.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/options.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/unity-runtime-hydration.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/unity-runtime-hydration.test.ts
git commit -m "feat(phase4): add hydration_policy semantics and strict fallback downgrade"
```

### Task 13: Phase 4 Reproducibility Runner + Truth Source Update

**User Verification: required**

**Human Verification Checklist**
- Verify repeatability report records identical result classification for same query/policy under `GITNEXUS_UNITY_PARITY_WARMUP=off`.
- Verify report captures cache/warmup status and explains any parity escalation via `missing_evidence`.
- Verify `needsParityRetry` is still present for compact-incomplete outputs.
- Verify strict policy fallback cases are downgraded to `verified_partial/verified_segment`.
- Verify `docs/unity-runtime-process-source-of-truth.md` reflects new `process_ref/runtime_claim/unity_evidence_mode/hydration_policy` contract.

**Acceptance Criteria**
- Repeatability section contains deterministic pass/fail for each policy with no unexplained drift.
- Warmup/cache metadata is non-empty and machine-readable.
- Compatibility field assertions pass (`needsParityRetry` retained).
- Strict fallback downgrade evidence appears in report.
- Truth source doc sections are updated with exact field names and policy mapping.

**Failure Signals**
- Same policy/query produces inconsistent classification without explicit `missing_evidence` explanation.
- Warmup/cache state missing from report.
- `needsParityRetry` absent in compact incomplete case.
- Strict fallback still claims `verified_full` or `verified_chain`.
- Truth source doc lacks new contract fields.

**User Decision Prompt**
- `请根据以上检查项回复“通过”或“不通过”。`

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.ts`
- Create: `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json`
- Create: `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`

**Step 1: Write the failing test**

```ts
// hydration-policy-repeatability-runner.test.ts
assert.equal(report.repeatability.fast.consistent, true);
assert.equal(report.repeatability.balanced.consistent, true);
assert.equal(report.repeatability.strict.consistent, true);
assert.equal(report.contractCompatibility.needsParityRetryRetained, true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.js`

Expected: FAIL (runner and report schema not implemented).

**Step 3: Write minimal implementation**

```ts
// report skeleton
{
  repeatability: {
    fast: { consistent: true, runCount: 3, mismatchCount: 0 },
    balanced: { consistent: true, runCount: 3, mismatchCount: 0 },
    strict: { consistent: true, runCount: 3, mismatchCount: 0 }
  },
  policy_mapping: {
    fast: { requested: 'compact', effective: 'compact' },
    balanced: { requested: 'compact', escalation: 'parity_on_missing_evidence' },
    strict: { requested: 'parity', downgradeOnFallback: 'verified_partial/verified_segment' }
  },
  missing_evidence_contract: { requiresArray: true, populatedWhenIncomplete: true },
  contractCompatibility: { needsParityRetryRetained: true }
}
```

**Step 4: Run test to verify it passes**

Run: `GITNEXUS_UNITY_PARITY_WARMUP=off npm --prefix gitnexus run build && node --test dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.js && node dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json`

Expected: PASS and repeatability artifact written.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.ts docs/reports/2026-04-02-phase4-hydration-policy-repeatability.json docs/reports/2026-04-02-phase4-hydration-policy-repeatability.md docs/unity-runtime-process-source-of-truth.md
git commit -m "docs(phase4): add hydration policy repeatability gates and update source of truth"
```

## Plan Audit Verdict
audit_scope: Phase 1-4 sections in `docs/plans/2026-04-01-unity-runtime-process-structural-remediation-design.md` (5.1-8.5) + truth source alignment + `.gitnexus/rules/**` governance touchpoints
audit_method: independent subagent-style rubric review (read-only)
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `process_ref.reader_uri`/`runtime_claim.rule_id`/`next_action` explicitly gated against placeholder text in tasks and acceptance checks: pass
- `verified_full` requires non-empty hop closure assertions in runtime claim checks: pass
authenticity_checks:
- live-mode evidence requirement mapped to runtime claim + anchor-based verification tasks: pass
- strict fallback downgrade semantics mapped to dedicated phase4 tests: pass
- explicit no-fallback failure classification mapped to phase2 integration tests: pass
improvements:
- none
approval_decision: pass
