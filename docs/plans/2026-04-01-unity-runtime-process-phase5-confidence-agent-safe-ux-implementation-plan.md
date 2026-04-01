# Unity Runtime Process Phase 5: Confidence Model and Agent-Safe UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add calibrated runtime confidence + verification guidance so agents do not over-claim Unity runtime truth when process evidence is partial.

**Architecture:** Reuse current `Process` + `STEP_IN_PROCESS` model and Phase 4 persisted metadata, then layer a query-time confidence policy on top of `context/query` outputs. Keep compatibility by making new guidance additive and gated by `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS`. Extend skill/docs workflow and benchmark assertions so confidence semantics are enforced end-to-end.

**Tech Stack:** TypeScript, MCP local backend (`query/context`), Unity hydration metadata, benchmark `u2-e2e` runner, Vitest + `node:test`, GitNexus skill docs.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added `process-confidence` primitives + heuristic hint support; `npm --prefix gitnexus run build` and `node --test gitnexus/dist/mcp/local/process-evidence.test.js gitnexus/dist/mcp/local/process-confidence.test.js` PASS; commit `1675eb6`
Task 2 | completed | Added env-gated confidence fields + hints in `query/context`; `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase5 confidence fields and verification hints|phase5 flag-off preserves legacy response shape"` and `npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -- -t "query process detail includes persisted lifecycle evidence"` PASS; commit `e6a33fd`
Task 3 | completed | Added heuristic `resource_heuristic` low-confidence fallback for Unity partial evidence; `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase5 emits low confidence heuristic runtime clues"` + `-t "query keeps direct evidence as high confidence when available"` + `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts` PASS; commit `158859c`
Task 4 | completed | Added `skill-contracts-phase5` semantic tests and updated shared + skill docs for empty-process continuation, low-confidence hints, and hop-anchor closure; `npm --prefix gitnexus exec vitest run test/integration/skill-contracts-phase5.test.ts` PASS; commit `4072074`
Task 5 | completed | Added calibration assertions + live evidence validator + Phase 5 artifacts (`docs/reports/2026-04-01-phase5-live-evidence.jsonl`, `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json`, `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-report.md`); `npm --prefix gitnexus run test:u3:gates` PASS; `node --test gitnexus/dist/benchmark/u2-e2e/retrieval-runner.test.js gitnexus/dist/benchmark/u2-e2e/live-evidence-validator.test.js` PASS; `node gitnexus/dist/benchmark/u2-e2e/live-evidence-validator.js --input docs/reports/2026-04-01-phase5-live-evidence.jsonl` PASS; full `benchmark:u2:e2e` wrapper remained environment-unstable (SIGABRT/strict gates), so acceptance evidence is sourced from successful live query/context runs against indexed alias `neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542`

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: process membership and chain-step confidence must support `high/medium/low` with deterministic derivation rules | critical | Task 1, Task 3 | `npm --prefix gitnexus run build && node --test dist/mcp/local/process-evidence.test.js dist/mcp/local/process-confidence.test.js` | `gitnexus/src/mcp/local/process-confidence.test.ts:derivationMatrix` | `direct/static rows downgraded incorrectly or heuristic rows never reach low`
DC-02: `context/query` must expose additive `runtime_chain_confidence` + `verification_hint` when confidence fields flag is enabled | critical | Task 2, Task 3 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 confidence fields and verification hints"` | `gitnexus/test/integration/local-backend-calltool.test.ts:phase5ConfidenceHints` | `flag-on responses missing verification_hint or missing runtime confidence`
DC-03: rollback safety — disabling `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` must hide new Phase 5 guidance without breaking legacy fields | critical | Task 2 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 flag-off preserves legacy response shape"` | `gitnexus/test/integration/local-backend-calltool.test.ts:phase5FlagOffCompatibility` | `flag-off still emits verification_hint or removes existing fields`
DC-04: skill/docs workflow must encode confidence-aware multi-hop stitching order and enforce “empty process must continue via resource evidence” behavior | critical | Task 4 | `npm --prefix gitnexus exec vitest run test/integration/skill-contracts-phase5.test.ts` | `gitnexus/test/integration/skill-contracts-phase5.test.ts:emptyProcessFallbackContract` | `workflow contract allows terminating on empty process without resource hop`
DC-05: benchmark gate must prove reduced false-negative and false-confidence rates versus frozen baseline with provenance | critical | Task 5 | `npm --prefix gitnexus run test:u3:gates && npm --prefix gitnexus exec vitest run src/benchmark/u2-e2e/retrieval-runner.test.ts -t "phase5 confidence calibration"` | `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json:confidenceCalibration` | `falseNegativeRateDeltaPct >= 0 or falseConfidenceRateDeltaPct >= 0 or baseline provenance missing`
DC-06: Neonspark Reload acceptance must be semantically closed across resource->loader->runtime segments with per-hop anchors | critical | Task 5 | `node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity \"WeaponPowerUp gungraph 1_weapon_orb_key\" && node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity \"PickItUp EquipWithEvent WeaponPowerUp Equip\" && node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity \"Reload NEON.Game.Graph.Nodes.Reloads\"` | `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json:reloadAcceptance` | `any required segment missing or hop anchor missing`

## Authenticity Assertions

- `assert no placeholder path`: reject `TODO|TBD|placeholder` in `verification_hint`, confidence reasons, and report evidence anchors.
- `assert live mode has tool evidence`: Phase 5 report must include exact `context/query` commands (flag on/off), repo alias, and observed confidence/hint payloads.
- `assert freeze requires non-empty confirmed_chain.steps`: acceptance summary must include non-empty stitched runtime chain steps from reload case.
- `assert low confidence requires manual verification hint`: any `low` confidence row must include actionable hint (`asset/meta`, `parity retry`, or equivalent).
- `assert calibration is delta-based`: false-negative and false-confidence must improve versus pinned baseline artifacts, not just be non-zero checks.

## Response Field Canonical Schema (Phase 5)

- `confidence`: `high | medium | low` (evidence-tier confidence for a returned row)
- `runtime_chain_confidence`: `high | medium | low` (chain-level confidence shown to agents)
- `verification_hint`: required when confidence is `low`, and must include:
  - `action`
  - `target`
  - `next_command`

### Task 1: Confidence Policy Primitives (`high/medium/low`)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/process-confidence.ts`
- Create: `gitnexus/src/mcp/local/process-confidence.test.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.test.ts`

**Step 1: Write failing tests for derivation matrix**

```ts
// process-confidence.test.ts
assert.equal(deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'static_calls' }), 'high');
assert.equal(deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'unity_lifecycle' }), 'medium');
assert.equal(deriveConfidence({ evidenceMode: 'method_projected' }), 'medium');
assert.equal(deriveConfidence({ evidenceMode: 'resource_heuristic', hasPartialUnityEvidence: true }), 'low');
assert.equal(buildVerificationHint({ confidence: 'low', needsParityRetry: true })?.includes('parity'), true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run src/mcp/local/process-confidence.test.ts src/mcp/local/process-evidence.test.ts`

Expected: FAIL (`resource_heuristic` / `low` / `verification hint` not implemented).

**Step 3: Write minimal implementation**

```ts
// process-confidence.ts
export type ProcessConfidence = 'high' | 'medium' | 'low';
export type ProcessEvidenceMode = 'direct_step' | 'method_projected' | 'resource_heuristic';

export function deriveConfidence(input: DeriveConfidenceInput): ProcessConfidence {
  if (input.evidenceMode === 'resource_heuristic') return 'low';
  if (input.evidenceMode === 'method_projected') return 'medium';
  if (input.processSubtype === 'unity_lifecycle') return 'medium';
  return 'high';
}
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix gitnexus run build && node --test dist/mcp/local/process-evidence.test.js dist/mcp/local/process-confidence.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/process-confidence.ts gitnexus/src/mcp/local/process-confidence.test.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/src/mcp/local/process-evidence.test.ts
git commit -m "feat(phase5): add runtime confidence derivation primitives"
```

### Task 2: Feature-Flagged Confidence Fields + Verification Hint in `context/query`

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/unity-process-confidence-config.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write failing integration tests (flag on/off)**

```ts
// local-backend-calltool.test.ts
process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
const on = await backend.callTool('context', { name: 'AuthService' });
expect(on.processes.every((p:any) => ['high','medium','low'].includes(p.confidence))).toBe(true);
expect(on.processes.some((p:any) => p.verification_hint !== undefined)).toBe(true);
const low = on.processes.find((p:any) => p.confidence === 'low');
if (low) {
  expect(low.verification_hint).toHaveProperty('action');
  expect(low.verification_hint).toHaveProperty('target');
  expect(low.verification_hint).toHaveProperty('next_command');
}

process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'off';
const off = await backend.callTool('context', { name: 'AuthService' });
expect(off.processes.every((p:any) => p.verification_hint === undefined)).toBe(true);
expect(off.processes.every((p:any) => typeof p.step_count === 'number')).toBe(true);
```

**Step 2: Run tests to verify fail**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 confidence fields and verification hints|phase5 flag-off preserves legacy response shape"`

Expected: FAIL (flag/config + `verification_hint` mapping absent).

**Step 3: Write minimal implementation**

```ts
// unity-process-confidence-config.ts
export function resolveUnityProcessConfidenceFieldsEnabled(env: NodeJS.ProcessEnv): boolean {
  return ['1','true','on','yes'].includes(String(env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS || '').trim().toLowerCase());
}
```

- In `local-backend.ts`, load flag once per request path and conditionally attach:
  - `processes[].runtime_chain_confidence` (existing value, now normalized through derivation helper)
  - `processes[].verification_hint` (only when flag on)
  - `process_symbols[].verification_hint` (only when flag on)
- Keep legacy fields unchanged (`id/summary/process_type/step_count`).

**Step 4: Run tests to verify pass**

Run:
- `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 confidence fields and verification hints|phase5 flag-off preserves legacy response shape"`
- `npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -t "query process detail includes persisted lifecycle evidence"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-process-confidence-config.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/tools.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(phase5): gate confidence guidance fields behind env flag"
```

### Task 3: Low-Confidence Heuristic Runtime Clues from Unity Resource Evidence

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/test/fixtures/local-backend-seed.ts`

**Step 1: Write failing tests for heuristic low-confidence path**

```ts
// local-backend-calltool.test.ts
process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
const result = await backend.callTool('query', {
  query: 'Reload',
  unity_resources: 'on',
  unity_hydration_mode: 'compact',
});
expect(result.processes.some((p:any) => p.confidence === 'low')).toBe(true);
expect(result.processes.some((p:any) => p.evidence_mode === 'resource_heuristic')).toBe(true);
expect(result.processes.some((p:any) => /asset|meta|parity/i.test(String(p.verification_hint || '')))).toBe(true);
```

**Step 2: Run tests to verify fail**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 emits low confidence heuristic runtime clues"`

Expected: FAIL (`resource_heuristic` not emitted).

**Step 3: Write minimal implementation**

- In `local-backend.ts`, when all are true:
  1. `unity_resources !== 'off'`
  2. no direct/projected `STEP_IN_PROCESS` rows found for candidate
  3. Unity payload indicates partial runtime evidence (`resourceBindings.length > 0` and/or `hydrationMeta.needsParityRetry === true`)
- Emit additive process clue row:
  - `evidence_mode: 'resource_heuristic'`
  - `confidence: 'low'`
  - `runtime_chain_confidence: 'low'`
  - `verification_hint: 'manual asset/meta verification required; rerun parity if needed'`
- Ensure direct/process-backed rows still take precedence over heuristic rows.

**Step 4: Run tests to verify pass**

Run:
- `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "phase5 emits low confidence heuristic runtime clues"`
- `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "query keeps direct evidence as high confidence when available"`
- `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/test/fixtures/local-backend-seed.ts
git commit -m "feat(phase5): emit low-confidence runtime clues for partial unity evidence"
```

### Task 4: Confidence-Aware Tool and Skill Workflow Contracts

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `.agents/skills/gitnexus/_shared/workflow-contract.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-resource-binding-contract.md`

**Step 1: Write failing behavior-contract tests**

Create `gitnexus/test/integration/skill-contracts-phase5.test.ts` that validates semantics (not phrase-only grep):
- empty process + unity resource evidence must route to `resourceBindings -> asset/meta mapping` continuation;
- low confidence requires actionable `verification_hint` with `action`, `target`, `next_command`;
- stop condition requires concrete evidence anchors before concluding chain closure.

**Step 2: Run check to verify fail**

Run: `npm --prefix gitnexus exec vitest run test/integration/skill-contracts-phase5.test.ts`

Expected: FAIL (contract test fixtures do not satisfy semantics before doc/contract updates).

**Step 3: Write minimal doc updates**

- Update `tools.ts` query/context descriptions:
  - include `confidence: high|medium|low`
  - include `verification_hint` contract and when to escalate to parity/manual asset-meta checks.
- Update skill docs checklist/workflow:
  - explicitly forbid concluding “no runtime chain” from empty process alone.
  - define stitch order and stop condition.

**Step 4: Re-run behavior-contract checks**

Run: `npm --prefix gitnexus exec vitest run test/integration/skill-contracts-phase5.test.ts`

Expected: PASS (semantics verified, not just phrase presence).

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts .agents/skills/gitnexus/gitnexus-exploring/SKILL.md .agents/skills/gitnexus/gitnexus-debugging/SKILL.md .agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md .agents/skills/gitnexus/_shared/workflow-contract.md .agents/skills/gitnexus/_shared/unity-resource-binding-contract.md gitnexus/test/integration/skill-contracts-phase5.test.ts
git commit -m "docs(phase5): add confidence-aware runtime stitching contract"
```

### Task 5: Benchmark Calibration Gates + Phase 5 Acceptance Report

**User Verification: required**

**Files:**
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/live-evidence-validator.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/live-evidence-validator.test.ts`
- Create: `docs/reports/2026-04-01-phase5-live-evidence.jsonl`
- Create: `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json`
- Create: `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-report.md`

**Step 1: Write failing benchmark tests for calibration assertions**

Add tests that fail when:
- `confidence === 'low'` but `verification_hint` missing;
- empty process clues with Unity resource evidence produce no confidence-guided fallback;
- direct static chains are not `high`.
- summary lacks delta metrics against pinned Phase 4 baseline.
- summary baseline provenance fields are missing (`artifactPath/gitCommit/sha256`).
- `phase5-live-evidence.jsonl` misses required authenticity schema fields.

**Step 2: Run tests to verify fail**

Run: `npm --prefix gitnexus exec vitest run src/benchmark/u2-e2e/retrieval-runner.test.ts -t "phase5 confidence calibration"`

Expected: FAIL before runner assertions are updated.

**Step 3: Implement calibration assertions and report collection**

- Extend `assertScenario()` in `retrieval-runner.ts` to validate:
  - low-confidence rows require `verification_hint`;
  - partial-evidence cases require parity/manual verification hint;
  - false-confidence guard for direct/static rows.
- Include confidence/hint counters and delta metrics in emitted summary JSON:
  - `falseNegativeRateBaselinePct`, `falseNegativeRateCurrentPct`, `falseNegativeRateDeltaPct`
  - `falseConfidenceRateBaselinePct`, `falseConfidenceRateCurrentPct`, `falseConfidenceRateDeltaPct`
- Pin baseline from existing Phase 4 artifacts and fail if missing:
  - `baseline.artifactPath` (expected `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json`)
  - `baseline.gitCommit`
  - `baseline.sha256`
- Add live evidence validator that fails when jsonl row misses:
  - `timestamp`, `command`, `flags`, `request_excerpt`, `response_excerpt`, `segment`, `hop_anchor`

**Step 4: Run acceptance pack and write report artifacts**

Run (long-running):

```bash
npm --prefix gitnexus run test:u3:gates
npm --prefix gitnexus exec vitest run src/benchmark/u2-e2e/retrieval-runner.test.ts
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on npm --prefix gitnexus run benchmark:u2:e2e
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "WeaponPowerUp gungraph 1_weapon_orb_key"
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "PickItUp EquipWithEvent WeaponPowerUp Equip"
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js context -r neonspark-core --file "Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs" --unity-resources on --unity-hydration parity ReloadBase
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=off node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
npm --prefix gitnexus exec vitest run src/benchmark/u2-e2e/live-evidence-validator.test.ts
node gitnexus/dist/benchmark/u2-e2e/live-evidence-validator.js --input docs/reports/2026-04-01-phase5-live-evidence.jsonl
```

Then create:
- `docs/reports/2026-04-01-phase5-live-evidence.jsonl` (raw request/response excerpts with timestamps)
- `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json`
- `docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-report.md`

Required summary fields:
- `lowConfidenceHintCoverage`
- `falseConfidenceFailures`
- `falseNegativeFallbackCoverage`
- `falseNegativeRateBaselinePct`
- `falseNegativeRateCurrentPct`
- `falseNegativeRateDeltaPct`
- `falseConfidenceRateBaselinePct`
- `falseConfidenceRateCurrentPct`
- `falseConfidenceRateDeltaPct`
- `baseline.artifactPath`
- `baseline.gitCommit`
- `baseline.sha256`
- `confirmed_chain.steps`
- `reloadAcceptance.resourceToAssetSegmentPass`
- `reloadAcceptance.loaderSegmentPass`
- `reloadAcceptance.runtimeSegmentPass`
- `reloadAcceptance.hopAnchorCoveragePct`
- `backwardCompat.regressionDetected`

**Step 5: Report sanity check + commit**

Run:

```bash
jq '{lowConfidenceHintCoverage, falseConfidenceFailures, falseNegativeFallbackCoverage, confirmed_chain_steps: (.confirmed_chain.steps | length), backwardCompat}' docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json
node gitnexus/dist/benchmark/u2-e2e/live-evidence-validator.js --input docs/reports/2026-04-01-phase5-live-evidence.jsonl
```

Expected:
- `lowConfidenceHintCoverage > 0`
- `falseConfidenceFailures == 0`
- `falseNegativeFallbackCoverage > 0`
- `falseNegativeRateDeltaPct < 0`
- `falseConfidenceRateDeltaPct < 0`
- `confirmed_chain_steps > 0`
- `reloadAcceptance.resourceToAssetSegmentPass == true`
- `reloadAcceptance.loaderSegmentPass == true`
- `reloadAcceptance.runtimeSegmentPass == true`
- `reloadAcceptance.hopAnchorCoveragePct == 100`
- `backwardCompat.regressionDetected == false`
- `live-evidence-validator` exits 0 with full authenticity schema.

Commit:

```bash
git add gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts gitnexus/src/benchmark/u2-e2e/live-evidence-validator.ts gitnexus/src/benchmark/u2-e2e/live-evidence-validator.test.ts docs/reports/2026-04-01-phase5-live-evidence.jsonl docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-summary.json docs/reports/2026-04-01-phase5-unity-confidence-agent-safe-ux-report.md
git commit -m "feat(phase5): enforce runtime confidence calibration gates"
```

## Plan Audit Verdict
audit_scope: [docs/2026-03-31-unity-runtime-process-phased-design.md Phase 5 section, feature flags section, milestone validation matrix, neonspark reload acceptance linkage]
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` added to Task 1 and Task 5 report sanity checks; result: pass
- `assert freeze requires non-empty confirmed_chain.steps` added to Task 5 summary gate; result: pass
authenticity_checks:
- `assert live mode has tool evidence` enforced by Task 5 live evidence jsonl + schema checks; result: pass
- `assert low confidence requires manual verification hint` enforced by retrieval runner calibration tests; result: pass
approval_decision: pass
