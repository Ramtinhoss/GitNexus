# Graph-Only Runtime Closure NA2 Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align graph-only runtime closure implementation with design semantics and make the NA2 `WeaponPowerUp` seeded case close deterministically (`verified_full`) without query-time rule/token matching.

**Architecture:** Keep analyze-time synthetic edge production unchanged, and fix query-time graph-only verifier in three layers: candidate extraction, closure segment evaluation, and evidence completeness gating. Replace heuristic segment checks with graph-continuity checks over anchored neighborhoods, while preserving precision guardrails against ubiquitous/global edges.

**Tech Stack:** TypeScript, GitNexus MCP local backend, Vitest unit/integration tests, CLI verification against `neonspark-core`.

Referenced skills: `@gitnexus-debugging` `@systematic-debugging` `@executing-plans`

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added `runtime-graph-only-na2-regression.test.ts`; `npx vitest run gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts` fails stably with `status=failed` vs expected `verified_full` (2 consecutive runs).
Task 2 | completed | Added `runtime-chain-graph-candidates.bridge.test.ts` (initially failing), then implemented incoming `CALLS -> class/method` extraction; `npx vitest run gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts` now passes.
Task 3 | completed | Added semantic evaluator unit tests and rewrote anchor/bind/bridge rules to use anchored-neighborhood + seed evidence + explicit bridge transitions; `npx vitest run gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts -t "anchor|bind"` passes.
Task 4 | completed | Added continuity regression in `runtime-chain-verify-graph-only.test.ts` and switched runtime segment to graph continuity traversal (bridge+runtime path), plus hop typing refinement in verifier; `npx vitest run ... -t "continuity|does not require retrieval"` passes.
Task 5 | completed | Added conservative verifier-evidence gate tests and implemented `computeVerifierMinimumEvidenceSatisfied` + strict runtime-claim gating in query/context paths; `npx vitest run local-backend-runtime-claim-evidence-gate.test.ts local-backend-next-hops.test.ts` passes.
Task 6 | completed | Tuned ubiquitous-edge fixtures to enforce precision downgrade only on non-anchor-intersection/global chains while preserving NA2 full closure; `npx vitest run runtime-graph-only-na2-regression.test.ts runtime-graph-only-precision-matrix.test.ts runtime-chain-verify-graph-only.test.ts` passes.
Task 7 | completed | Human gate approved (`通过`); NA2 live verification rerun artifact recorded at `docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.{json,md}` with `status=verified_full`, `evidence_level=verified_chain`, zero gaps, required bridge snippets present.
Task 8 | completed | Human gate approved (`通过`); source-of-truth/handoff/skills synced to graph-only query-time semantics and setup-contract tests pass (`setup-skills` + `skill-contracts-phase5`).

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Candidate extraction must include incoming bridge edges to anchor methods/classes | critical | Task 2, Task 6 | `npx vitest run gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts` | `runtime_claim.hops[].snippet` includes `HoldPickup -> PickItUp` and `EquipWithEvent -> Equip` | bridge edges exist in graph but absent from runtime_claim hops
DC-02 Anchor segment must be grounded by anchored neighborhood participation, not strict class-name equality | critical | Task 3, Task 6 | `npx vitest run gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts -t "anchor"` | `runtime_claim.gaps[].reason` excludes `anchor segment missing` for NA2 | anchor gap remains when method-level anchored hops exist
DC-03 Bind segment must accept deterministic seed/mapped binding evidence from resource bindings | critical | Task 3, Task 5, Task 6 | `npx vitest run gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts -t "bind" gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts` | `runtime_claim.gaps[].reason` excludes `bind segment missing` for seeded NA2 case | bind gap remains despite seed/mapped evidence in payload
DC-04 Runtime segment must be continuity-based, not keyword-based | critical | Task 4, Task 6 | `npx vitest run gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "continuity"` | `runtime_claim.status`, `runtime_claim.evidence_level` | runtime remains failed when path is continuous but no runtime keyword appears
DC-05 Verifier evidence completeness gate must be conservative under truncation/filter exhaustion | critical | Task 5, Task 6 | `npx vitest run gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts` | `evidence_meta.verifier_minimum_evidence_satisfied` and `runtime_claim.reason` | verifier_minimum set true from partial rows; closure false-positives appear
DC-06 Query-time closure must not depend on retrieval/verification rule matching | critical | Task 4, Task 6 | `npx vitest run gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "does not require retrieval"` | `runtime_claim.rule_id=graph-only.runtime-closure.v1` and no rule-load path in verifier source | runtime claim path requires rule/token matching to close
DC-07 Precision guard must block `verified_full` on ubiquitous/global-edge-only chains without anchor intersection | critical | Task 6 | `npx vitest run gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts` | `runtime_claim.status=verified_partial|failed` and explicit precision gap reason | ubiquitous edges produce `verified_full`
DC-08 NA2 acceptance case must close after fixes | critical | Task 7 | `node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --unity-hydration parity --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" --runtime-chain-verify on-demand "1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip"` | `docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.json:runtime_claim` | rerun report still shows `failed/none` with missing anchor/bind/bridge/runtime

## Design-vs-Implementation Semantic Gap Baseline

Gap ID | Design Semantics (Expected) | Current Implementation (Observed) | Impact on NA2 | Fix Tasks
--- | --- | --- | --- | ---
G-01 | Candidate extraction covers anchored neighborhood including incoming bridge edges | `extractRuntimeGraphCandidates` only collects outgoing `CALLS` from class/method anchors | bridge edges exist in graph but do not enter closure candidates | Task 2
G-02 | Anchor segment is neighborhood-grounded, not strict symbol string equality | `evaluateAnchorSegment` requires `sourceName/targetName === symbolName` | method-level anchored chains still fail anchor segment | Task 3
G-03 | Bind segment accepts deterministic seed→mapped evidence path | `evaluateBindSegment` requires mapped-target and binding set intersection; seed/mapped evidence split is rejected | bind segment fails even with valid seeded query context | Task 3
G-04 | Runtime segment is continuity/chain-based | `evaluateRuntimeSegment` uses runtime keyword regex (`runtime/start/update/...`) | real domain method chain has no keyword and is marked missing | Task 4
G-05 | Verifier minimum evidence gating is conservative under truncation/filter exhaustion | query path computes `verifier_minimum_evidence_satisfied` with optimistic `some(...)`; context path uses different gate field | runtime claim can be under- or over-constrained depending on path | Task 5
G-06 | `verified_full` requires anti-ubiquitous precision guard plus anchored continuity evidence | current precision penalty is token-intersection based and can misclassify valid bridge chains | NA2 may stay failed while noisy chains risk false-full | Task 6

## Authenticity Assertions

- Assert no placeholder report/fixture paths in NA2 regression tests and rerun artifacts.
- Assert graph-only runtime closure evidence uses live graph hops (real file paths + method snippets), not synthetic test placeholders.
- Assert `verified_full` requires non-empty continuity chain evidence that includes at least one bridge-or-runtime transition.
- Assert negative matrix blocks `verified_full` when only ubiquitous/global edges are present without anchor intersection.
- Assert query-time verifier path never loads retrieval/verification rule catalog for closure decisions.

### Task 1: Lock NA2 Regression as a Failing Integration Test

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts`
- Modify: `gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`

**Step 1: Write the failing test**

```ts
it('closes NA2 weapon powerup seeded chain without query-time rule matching', async () => {
  // fixture mirrors NA2 report query and bridge edges
  // expected: verified_full, no anchor/bind/bridge/runtime missing gaps
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts`  
Expected: FAIL with current `runtime_claim.status=failed` and missing segment gaps.

**Step 3: Write minimal implementation**

Implement only deterministic fixture scaffolding and assertions needed for NA2 failure capture (no production logic changes in this task).

**Step 4: Run test to verify failure signal is stable**

Run: `npx vitest run gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts`  
Expected: FAIL consistently with same segment-gap signature.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts
git commit -m "test(runtime): lock NA2 graph-only regression baseline"
```

### Task 2: Expand Candidate Extraction to Include Incoming Bridge Edges

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-graph-candidates.ts`

**Step 1: Write the failing test**

```ts
it('collects incoming CALLS edges targeting anchored class methods', async () => {
  // includes HoldPickup->PickItUp and EquipWithEvent->Equip
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts`  
Expected: FAIL because extractor currently keeps only outgoing neighborhoods.

**Step 3: Write minimal implementation**

Add bounded incoming-edge extraction branch for:
- `CALLS -> class`
- `CALLS -> class methods` via `HAS_METHOD` expansion

Keep dedupe and max-edge bounds intact.

**Step 4: Run test to verify it passes**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts`  
Expected: PASS with bridge snippets present.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-graph-candidates.ts gitnexus/test/unit/runtime-chain-graph-candidates.bridge.test.ts
git commit -m "feat(runtime): include incoming bridge edges in graph-only candidate extraction"
```

### Task 3: Rewrite Anchor/Bind/Bridge Segment Semantics to Match Design

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts`

**Step 1: Write the failing test**

```ts
it('treats anchored method-neighborhood evidence as anchor satisfied', () => {});
it('accepts deterministic seed/mapped binding evidence for bind segment', () => {});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts -t "anchor|bind"`  
Expected: FAIL because current evaluator requires strict class-name equality and strict mapped∩binding check.

**Step 3: Write minimal implementation**

Update segment rules:
- Anchor: satisfied when candidate path participates in the anchored symbol neighborhood (class or method IDs/names).
- Bind: satisfied when either seed path is directly bound, or mapped targets are deterministically resolved from seed evidence.
- Bridge: satisfied by explicit bridge transitions (synthetic/static) instead of “candidates.length > 0”.

**Step 4: Run test to verify it passes**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts -t "anchor|bind"`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts gitnexus/test/unit/runtime-chain-closure-evaluator.semantic.test.ts
git commit -m "feat(runtime): align anchor/bind/bridge segment semantics with graph-only design"
```

### Task 4: Replace Runtime Keyword Heuristic with Chain Continuity Evaluation

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`

**Step 1: Write the failing test**

```ts
it('marks runtime segment satisfied via continuous bridge-to-runtime path without runtime keywords', async () => {});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "continuity"`  
Expected: FAIL because current runtime segment is keyword regex based.

**Step 3: Write minimal implementation**

Implement continuity check over candidate graph (bounded BFS/DFS):
- require connected path from anchored node through bridge transition to runtime neighborhood
- remove keyword-only runtime acceptance as primary decision path

**Step 4: Run test to verify it passes**

Run: `npx vitest run gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts -t "continuity|does not require retrieval"`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts
git commit -m "feat(runtime): switch runtime segment to continuity-based graph closure"
```

### Task 5: Fix Evidence Completeness Gate and Conservative Verifier Semantics

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`
- Modify: `gitnexus/test/unit/local-backend-next-hops.test.ts`

**Step 1: Write the failing test**

```ts
it('does not mark verifier_minimum_evidence_satisfied=true when evidence rows are truncated or filter_exhausted', async () => {});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts -t "verifier_minimum"`  
Expected: FAIL because current aggregator is optimistic (`some(...)`).

**Step 3: Write minimal implementation**

Make verifier gate conservative:
- compute `verifier_minimum_evidence_satisfied` with all-row semantics and truncation/filter-aware downgrade
- preserve existing policy-adjusted output contract

**Step 4: Run test to verify it passes**

Run: `npx vitest run gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts
git commit -m "fix(mcp): enforce conservative verifier evidence completeness gating"
```

### Task 6: Reconcile Precision Guard with NA2 Closure and Negative Matrix

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts`
- Modify: `gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`
- Modify: `gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts`

**Step 1: Write the failing test**

```ts
it('keeps NA2 closure verified_full while still downgrading ubiquitous-edge-only chains', async () => {});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts`  
Expected: FAIL because one side regresses (either NA2 not full, or precision guard too weak).

**Step 3: Write minimal implementation**

Tune precision penalty:
- keep downgrade when no anchor intersection and only ubiquitous/global evidence
- do not penalize deterministic bridge-bearing chains with anchored continuity

**Step 4: Run test to verify it passes**

Run: `npx vitest run gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-closure-evaluator.ts gitnexus/test/integration/runtime-graph-only-na2-regression.test.ts gitnexus/test/integration/runtime-graph-only-precision-matrix.test.ts gitnexus/test/unit/runtime-chain-verify-graph-only.test.ts
git commit -m "fix(runtime): close NA2 bridge chain while preserving precision-first guard"
```

### Task 7: NA2 Live Verification Rerun and Report Artifact

**User Verification: required**

Human Verification Checklist:
- Run NA2 seeded query command with parity hydration and on-demand runtime verify.
- Confirm `runtime_claim.status` is `verified_full`.
- Confirm `runtime_claim.gaps` does not include missing `anchor/bind/bridge/runtime`.
- Confirm bridge snippets include `HoldPickup -> PickItUp` and `EquipWithEvent -> Equip`.
- Confirm query-time rule dependency remains removed (`rule_id=graph-only.runtime-closure.v1`).

Acceptance Criteria:
- Command exits `0` and returns JSON output.
- `runtime_claim.status=verified_full` and `runtime_claim.evidence_level=verified_chain`.
- Segment-missing gap reasons are absent.
- Both bridge snippets appear in `runtime_claim.hops[].snippet`.
- `rule_id` is graph-only synthetic ID, not verification-rule ID.

Failure Signals:
- `status=failed|verified_partial` for the NA2 case.
- Any of the four segment-missing reasons appears.
- Bridge snippets missing from hops.
- Rule-bound runtime claim identity reappears.

User Decision Prompt:
- `请仅回复：通过 或 不通过`

**Files:**
- Create: `docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.md`
- Create: `docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.json`

**Step 1: Write failing acceptance shell script/test**

```bash
# script exits non-zero if runtime_claim.status != verified_full
```

**Step 2: Run verification to capture current failure (before fix completion)**

Run: `node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --unity-hydration parity --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" --runtime-chain-verify on-demand "1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip"`  
Expected: FAIL before prior tasks complete, PASS after Task 1-6.

**Step 3: Write minimal implementation**

Generate rerun report markdown/json from actual command output and cypher bridge-evidence checks.

**Step 4: Run verification to verify it passes**

Run:
- `node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --unity-hydration parity --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" --runtime-chain-verify on-demand "1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip"`
- `gitnexus cypher --repo neonspark-core "MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b) WHERE r.reason CONTAINS 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2' RETURN a.name,b.name LIMIT 10"`

Expected: Runtime claim closes and bridge evidence remains present.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.md docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.json
git commit -m "test(runtime): rerun NA2 graph-only verification and record closure evidence"
```

### Task 8: Contract/Docs Sync for Setup-Installed Skill Surface

**User Verification: required**

Human Verification Checklist:
- Confirm source-of-truth doc reflects graph-only closure semantics and segment logic.
- Confirm trigger-token handoff doc is updated to historical/archived role for query-time.
- Confirm skill source docs under `gitnexus/skills/` are synchronized with updated query-time semantics.
- Confirm setup/install contract tests still pass.

Acceptance Criteria:
- `docs/unity-runtime-process-source-of-truth.md` semantics match implementation.
- `docs/plans/2026-04-07-trigger-tokens-family-handoff.md` no longer states query-time verifier depends on trigger matching.
- Relevant `gitnexus/skills/*.md` files mention graph-only query-time closure where needed.
- Integration tests for setup/contracts pass.

Failure Signals:
- Docs still describe query-time verifier as rule/token matching.
- Installed-skill source and runtime semantics diverge.
- Setup/contract tests fail.

User Decision Prompt:
- `请仅回复：通过 或 不通过`

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/plans/2026-04-07-trigger-tokens-family-handoff.md`
- Modify: `gitnexus/skills/gitnexus-debugging.md`
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Test: `gitnexus/test/integration/setup-skills.test.ts`
- Test: `gitnexus/test/integration/skill-contracts-phase5.test.ts`

**Step 1: Write failing doc/contract assertions**

```ts
it('skill docs describe query-time runtime closure as graph-only', () => {});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run gitnexus/test/integration/setup-skills.test.ts gitnexus/test/integration/skill-contracts-phase5.test.ts`  
Expected: FAIL if docs/contracts are stale.

**Step 3: Write minimal implementation**

Update docs and skill source files only for changed semantics (no unrelated rewrites).

**Step 4: Run tests to verify pass**

Run: `npx vitest run gitnexus/test/integration/setup-skills.test.ts gitnexus/test/integration/skill-contracts-phase5.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/plans/2026-04-07-trigger-tokens-family-handoff.md gitnexus/skills/gitnexus-debugging.md gitnexus/skills/gitnexus-exploring.md gitnexus/skills/gitnexus-guide.md gitnexus/test/integration/setup-skills.test.ts gitnexus/test/integration/skill-contracts-phase5.test.ts
git commit -m "docs(skills): sync graph-only runtime closure semantics across contracts"
```

## Plan Audit Verdict
audit_scope: `docs/plans/2026-04-07-graph-only-runtime-retrieval-design.md` sections 4.2/6 + NA2 verification report parity + query-time graph-only verifier path
finding_summary: P0=0, P1=0, P2=2
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- NA2 rerun artifacts use fixed concrete file paths and seeded query path: pass
- traceability evidence fields bind to concrete runtime_claim fields (status/gaps/hops): pass
authenticity_checks:
- negative matrix blocks ubiquitous-edge false positives: pass
- no query-time rule/token dependency required by closure tasks: pass
- semantic closure uses continuity and bridge evidence, not structure-only field presence: pass
approval_decision: pass
