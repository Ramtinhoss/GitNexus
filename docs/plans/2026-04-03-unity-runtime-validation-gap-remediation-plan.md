# Unity Runtime Validation Gap Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore report-equivalent Unity reload validation on current source by fixing rule matching specificity, multi-anchor verifier execution, and query-side evidence gating so the current `dist` CLI can rebuild `neonspark`, promote rules, and return a stable, semantically correct reload chain.

**Architecture:** Keep Rule Lab as the rule authoring source, but split the fix into three layers: retrieval/rule matching, verifier topology execution, and evidence-contract alignment. The critical change is to stop treating `trigger_family` as the only runtime dispatch key and stop treating query-level evidence trimming as a hard verifier failure when the selected chain itself is complete.

**Tech Stack:** TypeScript, Node.js, GitNexus CLI/MCP, LadybugDB/Kuzu, Vitest, Unity resource hydration, Rule Lab compiled bundles.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Red baseline captured in isolated worktree and committed as e012471; failing cases cover token-only rule selection, evidence-gate downgrade, and multi-anchor topology gap
Task 2 | completed | Weighted rule matching and host-aware symbol ranking landed; broad-query specific rule regression passes on isolated worktree commit 9d2a21a
Task 3 | completed | Anchored multi-segment call-edge expansion landed; runtime-chain-verify-m2/equivalence targeted suite green
Task 4 | completed | Query evidence completeness split from verifier admissibility; rule/evidence/verifier combined regression suite green
Task 5 | completed | dist rebuilt; neonspark reindexed and reload rule re-promoted; live broad-query drift remediated by retrieval-side fallback tightening
Task 6 | completed | Live validation reports written; seeded query verified_full, broad query no longer points to unrelated resource hops, legacy acceptance artifact verify-only passes

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Query must not drift away from the user/resource intent | critical | Task 1, Task 2, Task 5, Task 6 | `node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"` | `docs/reports/<new-reload-report>.json:next_hops[0].target` | top next hop points to unrelated resource (`Monster/*`, `gun_tata`, etc.)
DC-02 Verifier must execute a real resource->code topology, not a single-symbol heuristic | critical | Task 1, Task 3, Task 6 | `npm exec -- vitest run test/unit/runtime-chain-verify-*.test.ts --reporter=dot` | `docs/reports/<new-reload-report>.json:runtime_chain.hops` | `code_loader` / `code_runtime` hops missing or sourced from wrong symbol neighborhood
DC-03 Seed->mapped resource equivalence must be accepted by verifier | critical | Task 1, Task 3, Task 4, Task 6 | `npm exec -- vitest run test/unit/runtime-chain-verify-equivalence.test.ts --reporter=dot` | `docs/reports/<new-reload-report>.json:runtime_chain.hops[0].note` | verifier reports direct-binding-only mismatch or chooses seed resource instead of mapped graph
DC-04 Query evidence trimming must not invalidate an otherwise closed verifier chain | critical | Task 1, Task 4, Task 6 | `npm exec -- vitest run test/unit/local-backend-runtime-claim-evidence-gate.test.ts --reporter=dot` | `docs/reports/<new-reload-report>.json:runtime_claim.status` | `minimum_evidence_contract_not_satisfied` present while required hops are complete
DC-05 Rule Lab curate/promote roundtrip must preserve curated DSL into approved yaml + compiled bundle | critical | Task 1, Task 5, Task 6 | `node gitnexus/dist/cli/index.js rule-lab promote --run-id <run_id> --slice-id <slice_id> --repo-path /Volumes/Shuttle/unity-projects/neonspark` | `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/approved/demo.neonspark.reload.v1.yaml` and `.../compiled/verification_rules.v2.json` | approved yaml / compiled bundle still show `unspecified_*` scope or placeholder topology after curate

## Authenticity Assertions

- assert no placeholder scope survives into promoted reload rule (`unspecified_resource`, `unspecified_host`, `unknown`, `TODO`, `TBD`)
- assert verifier success is backed by anchored hops, not only by `status=evaluated`
- assert broad reload query and resource-seeded reload query are both exercised; do not accept seeded-only local pass as replacement for broad-query regression
- assert query-side `minimum_evidence_satisfied=false` is not used to erase a fully closed verifier chain without a more specific conflict reason

### Task 1: Freeze Current Regression Contract

**Files:**
- Create: `gitnexus/test/integration/reload-v1-current-source-regression.test.ts`
- Create: `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`
- Modify: `gitnexus/test/unit/runtime-chain-verify-m2.test.ts`
- Modify: `gitnexus/test/unit/runtime-chain-verify-equivalence.test.ts`

**Step 1: Write the failing broad-query regression**

Add an integration test that loads the promoted reload rule and asserts the current broad query fails for the wrong reason today:
- broad query matches reload rule
- resource drifts away from the intended orb/gungraph path
- `runtime_claim` is forced to `failed/clue`

**Step 2: Write the failing seeded-query regression**

Add a unit/integration test covering the observed live behavior:
- seeded orb-key query returns `resource/guid_map/code_loader/code_runtime`
- query still fails only because `minimum_evidence_contract_not_satisfied`

**Step 3: Write the failing promote roundtrip regression**

Add a test that runs `curate -> promote` on a curated reload slice and asserts:
- approved yaml contains curated `host_base_type`, `match.resource_types`, and constrained topology
- compiled verification bundle preserves the same fields

**Step 4: Run tests to capture the red baseline**

Run:
```bash
npm exec -- vitest run \
  test/integration/reload-v1-current-source-regression.test.ts \
  test/unit/local-backend-runtime-claim-evidence-gate.test.ts \
  test/unit/runtime-chain-verify-m2.test.ts \
  test/unit/runtime-chain-verify-equivalence.test.ts \
  --reporter=dot
```
Expected: FAIL on resource drift, seeded-query evidence downgrade, and/or promote roundtrip mismatch.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/reload-v1-current-source-regression.test.ts gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts gitnexus/test/unit/runtime-chain-verify-m2.test.ts gitnexus/test/unit/runtime-chain-verify-equivalence.test.ts
git commit -m "test: lock unity reload validation regressions"
```

### Task 2: Tighten Runtime Rule Matching And Symbol Selection

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Test: `gitnexus/test/integration/reload-v1-current-source-regression.test.ts`
- Test: `gitnexus/test/unit/runtime-chain-verify-m2.test.ts`

**Step 1: Write the failing rule-match specificity test**

Add assertions that `matchesRuntimeClaimRule()` must consider more than `trigger_family` token when rule DSL includes:
- `match.host_base_type`
- `match.resource_types`
- `match.module_scope`

**Step 2: Run the test to verify it fails**

Run:
```bash
npm exec -- vitest run test/integration/reload-v1-current-source-regression.test.ts --reporter=dot
```
Expected: FAIL because current runtime matching still binds on `reload` token alone.

**Step 3: Implement weighted rule matching and symbol candidate narrowing**

Implement the minimal change set:
- score candidate rules using `match.trigger_tokens + host_base_type + module_scope + resource_types`
- prefer rules whose `host_base_type` or resource scope is corroborated by query/resource bindings
- rank `resolvePrimarySymbolCandidate()` so curated `host_base_type` outranks incidental query tokens such as `Reload`

**Step 4: Run tests to verify they pass**

Run:
```bash
npm exec -- vitest run \
  test/integration/reload-v1-current-source-regression.test.ts \
  test/unit/runtime-chain-verify-m2.test.ts \
  --reporter=dot
```
Expected: PASS for rule selection and primary symbol narrowing.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/test/integration/reload-v1-current-source-regression.test.ts gitnexus/test/unit/runtime-chain-verify-m2.test.ts
git commit -m "fix(verifier): tighten runtime rule selection and symbol ranking"
```

### Task 3: Upgrade Verifier To Anchored Chain Execution

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-chain-extractors.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Test: `gitnexus/test/unit/runtime-chain-verify-m2.test.ts`
- Test: `gitnexus/test/unit/runtime-chain-verify-equivalence.test.ts`

**Step 1: Write the failing multi-anchor chain test**

Add a test that requires one verifier run to bridge:
- resource/mapped graph evidence
- loader anchor (`WeaponPowerUp`/`GunGraphMB`)
- runtime anchor (`GunGraph.RegisterEvents -> StartRoutineWithEvents`)
- reload anchor (`ReloadBase.GetValue -> CheckReload`)

**Step 2: Run the test to verify it fails**

Run:
```bash
npm exec -- vitest run test/unit/runtime-chain-verify-m2.test.ts --reporter=dot
```
Expected: FAIL because current verifier only walks CALLS around one primary symbol.

**Step 3: Implement extractor-backed anchored chain execution**

Refactor `verifyRuleDrivenRuntimeChain()` so it can:
- start from selected resource or mapped resource
- resolve one or more anchor symbols from curated rule intent
- execute hop extractors per topology segment instead of scanning a single `callEdges` pool
- preserve connectedness between extracted segments

Keep the implementation YAGNI:
- first support reload/GunGraph chain with a generic extractor contract
- do not reintroduce case-name gating

**Step 4: Run tests to verify they pass**

Run:
```bash
npm exec -- vitest run \
  test/unit/runtime-chain-verify-m2.test.ts \
  test/unit/runtime-chain-verify-equivalence.test.ts \
  --reporter=dot
```
Expected: PASS with resource->loader->runtime closure and no false disconnected-chain success.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-extractors.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/test/unit/runtime-chain-verify-m2.test.ts gitnexus/test/unit/runtime-chain-verify-equivalence.test.ts
git commit -m "feat(verifier): execute anchored unity runtime chain extractors"
```

### Task 4: Align Query Evidence Gate With Verifier Semantics

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-evidence-view.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts`

**Step 1: Write the failing evidence-gate test**

Add a test that models the observed live state:
- verifier returns a full required-hop chain
- query result contains filtered/trimmed unrelated bindings
- current code still sets `minimum_evidence_satisfied=false` and rewrites claim to `failed/clue`

**Step 2: Run the test to verify it fails**

Run:
```bash
npm exec -- vitest run test/unit/local-backend-runtime-claim-evidence-gate.test.ts --reporter=dot
```
Expected: FAIL because query-level evidence completeness and verifier admissibility are currently the same boolean.

**Step 3: Split UX completeness from verifier admissibility**

Implement the minimal change:
- keep `evidence_meta.minimum_evidence_satisfied` for payload completeness UX if needed
- add a verifier-focused gate computed from the selected/filtered chain inputs
- only downgrade `runtime_claim` when verifier-specific evidence for the chosen chain is incomplete

**Step 4: Run tests to verify they pass**

Run:
```bash
npm exec -- vitest run test/unit/local-backend-runtime-claim-evidence-gate.test.ts --reporter=dot
```
Expected: PASS; closed runtime chain is no longer rewritten to failed solely due to unrelated filtered bindings.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-evidence-view.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts
git commit -m "fix(query): decouple verifier admissibility from evidence trimming"
```

### Task 5: Rebuild Neonspark And Re-Promote Reload Rule

**Files:**
- Modify: `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/lab/runs/60425d1c1b68/slices/slice-5e3dac304f/curation-input.orbkey-gungraph.json`
- Modify: `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/approved/demo.neonspark.reload.v1.yaml`
- Modify: `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/compiled/verification_rules.v2.json`

**Step 1: Rebuild current `dist` CLI**

Run:
```bash
npm run build
```
Expected: PASS and fresh `gitnexus/dist/**`.

**Step 2: Reindex `neonspark` with Unity runtime env**

Run:
```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on \
GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-core --force
```
Expected: PASS and `meta.json.repoId == neonspark-core`.

**Step 3: Curate and promote the reload slice from current source**

Run:
```bash
node gitnexus/dist/cli/index.js rule-lab curate --run-id 60425d1c1b68 --slice-id slice-5e3dac304f --repo-path /Volumes/Shuttle/unity-projects/neonspark --input-path /Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/lab/runs/60425d1c1b68/slices/slice-5e3dac304f/curation-input.orbkey-gungraph.json
node gitnexus/dist/cli/index.js rule-lab promote --run-id 60425d1c1b68 --slice-id slice-5e3dac304f --repo-path /Volumes/Shuttle/unity-projects/neonspark
```
Expected: PASS; approved yaml and compiled bundle preserve the curated `GunGraph` scope and constrained topology.

**Step 4: Validate promoted rule contents**

Run:
```bash
jq '.rules[] | select(.id=="demo.neonspark.reload.v1")' /Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/compiled/verification_rules.v2.json
sed -n '1,260p' /Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/approved/demo.neonspark.reload.v1.yaml
```
Expected: no `unspecified_*`, no placeholder topology, no stale draft fields.

**Step 5: Commit**

Do not commit the external `neonspark` repo. Commit only GitNexus source/tests/docs that were needed to make the roundtrip deterministic.

### Task 6: Run Live Acceptance And Write Back Evidence

**Files:**
- Create: `docs/reports/2026-04-03-neonspark-reload-validation-gap-remediation.md`
- Create: `docs/reports/2026-04-03-neonspark-reload-validation-gap-remediation.json`
- Modify: `docs/plans/2026-04-02-unity-runtime-retrieval-gap-analysis-and-redesign-direction.md`

**Step 1: Run the broad reload query**

Run:
```bash
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on \
node gitnexus/dist/cli/index.js query -r neonspark-core \
  --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand \
  "Reload NEON.Game.Graph.Nodes.Reloads"
```
Expected: top next hop and runtime chain no longer drift to unrelated resources.

**Step 2: Run the seeded orb-key verification query**

Run:
```bash
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on \
node gitnexus/dist/cli/index.js query -r neonspark-core \
  --unity-resources on --unity-hydration parity --unity-evidence full \
  --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" \
  --resource-seed-mode strict --runtime-chain-verify on-demand \
  "reload GunGraph Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset"
```
Expected: required hops closed and no `minimum_evidence_contract_not_satisfied`.

**Step 3: Re-run reload acceptance verification**

Run:
```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```
Expected: PASS if artifact semantics still align; if the new behavior intentionally supersedes the old artifact, produce a refreshed artifact and document the delta explicitly.

**Step 4: Write remediation report**

Record:
- broad query result
- seeded query result
- approved rule content hash/version
- acceptance parity status vs 2026-04-01 report
- any remaining deliberate gap

**Step 5: Commit**

```bash
git add docs/reports/2026-04-03-neonspark-reload-validation-gap-remediation.md docs/reports/2026-04-03-neonspark-reload-validation-gap-remediation.json docs/plans/2026-04-02-unity-runtime-retrieval-gap-analysis-and-redesign-direction.md
git commit -m "docs(reload): record neonspark validation remediation results"
```

## Plan Audit Verdict
audit_scope: redesign-direction Sections 1, 4, 5, 7, 9, 10 plus current-source findings from runtime-chain-verify/local-backend/promote
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- P1: the plan assumes reload remediation can be achieved by generalized anchored-chain execution plus verifier-gate split without introducing a reload-only bespoke extractor; status: accepted
anti_placeholder_checks:
- promoted rule must reject `unspecified_*`/`unknown` scope in approved yaml and compiled bundle: included
- live report must reject unrelated top next hop for broad reload query: included
authenticity_checks:
- verifier closure requires anchored hop evidence, not status-only fields: included
- query-side downgrade must be tested against a fully closed chain: included
approval_decision: pass
