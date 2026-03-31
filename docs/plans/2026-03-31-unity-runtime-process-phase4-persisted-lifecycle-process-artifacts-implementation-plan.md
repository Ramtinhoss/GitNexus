# Unity Runtime Process Phase 4: Persisted Lifecycle Process Artifacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist Unity lifecycle/runtime chains as first-class `Process` artifacts with subtype and evidence metadata, so runtime chains are durable and distinguishable from classic static-call processes.

**Architecture:** Reuse the existing `Process` node plus `STEP_IN_PROCESS` relation model instead of introducing a parallel graph shape. Extend process detection to classify Unity lifecycle-derived traces, preserve per-process aggregate evidence and per-step edge evidence, persist those fields in LadybugDB, then surface them through `context/query/process-detail` without breaking existing consumers that only read the old fields.

**Tech Stack:** TypeScript, GitNexus ingestion pipeline, LadybugDB `CodeRelation`, MCP local backend/resources, Vitest, `node:test`, CLI `context/query/cypher`.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | red check failed as expected (`AssertionError: expected undefined to be 'unity_lifecycle'`); green check passed (`npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "classifies persisted unity lifecycle process subtype"`: 14 passed, 0 failed)
Task 2 | completed | red check failed as expected (`processSubtype` absent when persist flag on); green checks passed (`npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts`: 2 passed, 0 failed; focused `-t "persists lifecycle process evidence attributes"` also passed)
Task 3 | completed | red checks failed as expected (`process_subtype` missing in query/context output; `queryProcessDetail` missing subtype/evidence); green checks passed (`npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "returns lifecycle process metadata without breaking legacy fields"` and `npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -- -t "query process detail includes persisted lifecycle evidence"`)
Task 4 | completed | acceptance pack executed with fresh `neonspark-core` analyze; persisted lifecycle process count verified (`cnt=8`), runtime-root step evidence verified, report artifacts written, sanity check passed (`persistedLifecycleProcessCount=8`, `confirmed_chain_steps=5`, `backwardCompat.regressionDetected=false`); committed docs artifacts after user verification gate approval

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: persisted lifecycle processes must be distinguishable from classic call-graph processes via explicit subtype metadata | critical | Task 1, Task 2 | `npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "classifies persisted unity lifecycle process subtype"` | `gitnexus/test/unit/process-processor.test.ts:unityLifecycleSubtype` | `unity runtime-root trace persists as generic static process with no subtype marker`
DC-02: process persistence must preserve source reason path and aggregate confidence for lifecycle-derived chains | critical | Task 1, Task 2 | `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "persists lifecycle process evidence attributes"` | `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts:persistedProcessEvidence` | `persisted Process node or STEP_IN_PROCESS rows lose synthetic-edge reason/confidence provenance`
DC-03: `context/query/process detail` must expose subtype/confidence/evidence attributes while remaining backward compatible | critical | Task 3 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"` | `gitnexus/test/integration/local-backend-calltool.test.ts:lifecycleMetadataCompatibility` | `legacy fields disappear, or new lifecycle metadata is absent from query/context/process detail`
DC-04: Phase 4 must make persisted lifecycle artifacts discoverable through repo process listings and process detail resources | critical | Task 3, Task 4 | `node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH (p:Process) WHERE p.processSubtype = 'unity_lifecycle' RETURN count(p) AS cnt" && GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "GunGraph RegisterEvents StartRoutineWithEvents"` | `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json:persistedLifecycleProcessCount` | `persisted lifecycle processes cannot be enumerated or remain invisible to process-facing endpoints`
DC-05: feature flag rollback must preserve current Phase 3 behavior when persisted lifecycle artifacts are disabled | critical | Task 2, Task 4 | `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "does not persist lifecycle subtype when flag is off" && GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=off node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"` | `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts:flagOffNoPersist` | `flag-off mode writes lifecycle subtype metadata or changes query/context shape beyond Phase 3 baseline`

## Authenticity Assertions

- `assert no placeholder path`: process subtype/evidence fixtures and report artifacts must reject `TODO`, `TBD`, and `/placeholder/` in persisted process metadata, evidence paths, and report anchors.
- `assert live mode has tool evidence`: Phase 4 report must record exact `analyze`, `cypher`, `context`, and `query` commands plus repo alias, indexed commit, and observed persisted lifecycle process counts.
- `assert freeze requires non-empty confirmed_chain.steps`: Phase 4 report is invalid unless the persisted lifecycle process section still includes a non-empty stitched `confirmed_chain.steps` chain for the neonspark reload case.
- `assert backward compatibility preserves legacy fields`: all new endpoint assertions must also prove existing `processes[].id/summary/step_count/process_type` or `context.processes[].id/name/step_index/step_count` remain present.

## Skill Hooks

- `@gitnexus-exploring` to inspect current process persistence, process detail resources, and query/context process projection behavior.
- `@gitnexus-cli` to run `analyze`, `cypher`, `context`, and `query` verification against `neonspark-core`.
- `@superpowers:verification-before-completion` before claiming the Phase 4 implementation is complete.

### Task 1: Model Persisted Lifecycle Process Metadata

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/process-processor.ts`
- Modify: `gitnexus/test/unit/process-processor.test.ts`

**Step 1: Write the failing unit tests**

Add focused unit tests that build a runtime-root trace containing synthetic lifecycle/runtime-loader edges and assert the resulting `ProcessNode` / `ProcessStep` metadata includes:
- `processSubtype: 'unity_lifecycle'` for runtime-root-derived traces;
- `processSubtype: 'static_calls'` for normal traces;
- aggregate process confidence and evidence summary fields;
- per-step source evidence derived from the underlying `CALLS` edge reason/confidence;
- no placeholder evidence paths or empty fake reason lists.

Example assertion shape:

```ts
expect(runtimeProc.processSubtype).toBe('unity_lifecycle');
expect(runtimeProc.runtimeChainConfidence).toBe('medium');
expect(runtimeProc.sourceReasons).toContain('unity-runtime-loader-synthetic');
expect(runtimeSteps.some((s) => s.reason === 'unity-runtime-loader-synthetic')).toBe(true);
expect(runtimeSteps.every((s) => !/TODO|TBD|placeholder/i.test(`${s.nodeId} ${s.reason}`))).toBe(true);
```

**Step 2: Run the test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "classifies persisted unity lifecycle process subtype"`

Expected: FAIL because `ProcessNode` / `ProcessStep` do not currently persist subtype, confidence, or source-evidence metadata.

**Step 3: Write the minimal implementation**

Extend `process-processor.ts` only enough to support the tests:
- add `processSubtype` to `ProcessNode`;
- add aggregate evidence fields such as `runtimeChainConfidence`, `sourceReasons`, `sourceConfidences`, or an equivalent compact representation;
- add per-step evidence fields to `ProcessStep` by resolving the `CALLS` edge between consecutive nodes in each trace;
- classify runtime-root-derived traces as `unity_lifecycle`, everything else as `static_calls`;
- keep existing IDs, labels, and step ordering unchanged.

Prefer deriving lifecycle confidence from already-known trace evidence:
- `high` only for all-static direct call chains;
- `medium` for traces involving `unity-lifecycle-synthetic` / `unity-runtime-loader-synthetic`.

**Step 4: Run the test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "classifies persisted unity lifecycle process subtype"`

Expected: PASS, with existing process tests still green.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/process-processor.ts gitnexus/test/unit/process-processor.test.ts
git commit -m "feat(phase4): model persisted lifecycle process metadata"
```

### Task 2: Persist Lifecycle Metadata Through Ingestion Behind a Flag

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Modify: `gitnexus/src/core/ingestion/unity-lifecycle-config.ts`
- Create: `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts`

**Step 1: Write the failing integration tests**

Create an integration suite that runs the pipeline on a mini Unity fixture and asserts:
- with `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=off`, runtime-root traces may still exist as Phase 3 behavior, but persisted `Process` metadata stays in legacy shape with no lifecycle subtype/evidence fields;
- with `...=on`, `Process` nodes and `STEP_IN_PROCESS` relations include subtype and evidence attributes;
- flag-off mode stays backward compatible with Phase 3 process counts;
- synthetic lifecycle persistence does not appear on a non-Unity fixture.

Example assertions:

```ts
expect(flagOff.processNodes.some((p) => p.processSubtype === 'unity_lifecycle')).toBe(false);
expect(flagOn.processNodes.some((p) => p.processSubtype === 'unity_lifecycle')).toBe(true);
expect(flagOn.stepRows.some((r) => r.reason === 'unity-runtime-loader-synthetic')).toBe(true);
expect(nonUnity.processNodes.some((p) => p.processSubtype === 'unity_lifecycle')).toBe(false);
```

**Step 2: Run the tests to verify they fail**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts`

Expected: FAIL because the pipeline currently persists only `label`, `heuristicLabel`, `processType`, `stepCount`, `entryPointId`, and `terminalId`, and `STEP_IN_PROCESS` stores only `step`.

**Step 3: Write the minimal implementation**

Extend ingestion persistence behind a new flag:
- add `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST` handling in `unity-lifecycle-config.ts` or a nearby config helper;
- in `pipeline.ts`, persist new `Process` node properties such as `processSubtype`, `runtimeChainConfidence`, and compact evidence fields when the flag is on;
- persist per-step evidence fields onto `STEP_IN_PROCESS` only when the flag is on;
- leave current node/relation shape untouched when the flag is off;
- do not create new node/edge types.

Keep the implementation minimal:
- no new parallel persistence tables;
- no schema fork;
- only additive properties on existing `Process` nodes and `STEP_IN_PROCESS` relations.

**Step 4: Run the tests to verify they pass**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts`

Expected: PASS, including the negative assertion that flag-off mode does not write lifecycle subtype metadata.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/pipeline.ts gitnexus/src/core/ingestion/unity-lifecycle-config.ts gitnexus/test/integration/unity-lifecycle-process-persist.test.ts
git commit -m "feat(phase4): persist lifecycle process metadata behind flag"
```

### Task 3: Expose Lifecycle Process Metadata Through MCP and Process Detail

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/resources.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/test/integration/local-backend.test.ts`

**Step 1: Write the failing endpoint tests**

Add endpoint-level tests that assert:
- `context()` returns lifecycle process metadata on direct-step rows when persisted metadata exists;
- `query()` returns `processes[]` / `process_symbols[]` with subtype and confidence without removing existing fields;
- `queryProcessDetail()` and resource-backed process detail include subtype and per-step evidence attributes;
- old consumers that only inspect `summary`, `step_count`, or `process_type` still pass unchanged.

Example assertions:

```ts
expect(result.processes.some((p) => p.process_subtype === 'unity_lifecycle')).toBe(true);
expect(result.processes.every((p) => typeof p.step_count === 'number')).toBe(true);
expect(processDetail.process.processSubtype).toBe('unity_lifecycle');
expect(processDetail.steps.some((s) => s.reason === 'unity-runtime-loader-synthetic')).toBe(true);
```

**Step 2: Run the tests to verify they fail**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"`

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -t "query process detail includes persisted lifecycle evidence"`

Expected: FAIL because backend queries and response mappers do not yet select or project the new process/step properties.

**Step 3: Write the minimal implementation**

Update the MCP/local backend surface so it selects and returns additive lifecycle metadata:
- include `processSubtype` / `runtimeChainConfidence` in process lookups;
- update `mergeProcessEvidence` if needed so direct-step lifecycle rows preserve persisted confidence instead of flattening everything to `high`;
- extend process detail queries to return per-step `reason` / `confidence` / any compact evidence path fields;
- update `resources.ts` and `tools.ts` docs/help text so process detail and process listings mention lifecycle subtype availability.

Do not rename or remove existing response fields.

**Step 4: Run the tests to verify they pass**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"`

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -t "query process detail includes persisted lifecycle evidence"`

Expected: PASS, with legacy field assertions still green.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/resources.ts gitnexus/src/mcp/tools.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/test/integration/local-backend.test.ts
git commit -m "feat(phase4): expose persisted lifecycle process metadata"
```

### Task 4: Run Phase 4 Acceptance Pack and Write Report

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json`
- Create: `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-report.md`

**Step 1: Run the acceptance commands**

Use the locally built CLI and a fresh `neonspark-core` analyze with both flags on:

```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on \
GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --force --no-reuse-options --repo-alias neonspark-core

node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH (p:Process) WHERE p.processSubtype = 'unity_lifecycle' RETURN count(p) AS cnt"
node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH (n)-[r:CodeRelation {type:'STEP_IN_PROCESS'}]->(p:Process {id:'proc_0_unity_runtime_root'}) RETURN n.id AS node_id, r.step AS step, r.reason AS reason, r.confidence AS confidence ORDER BY step"

GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js context -r neonspark-core --file "Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs" --unity-resources on --unity-hydration parity ReloadBase

GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "GunGraph RegisterEvents StartRoutineWithEvents"

GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=off \
node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
```

Expected:
- persisted lifecycle process count is non-zero;
- at least one runtime-root process detail row exposes per-step reason/confidence;
- `ReloadBase` / runtime query results expose lifecycle subtype/confidence;
- flag-off query remains backward compatible with current Phase 3 behavior.

**Step 2: Write the report artifacts**

Create `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json` with:
- executed commands;
- repo alias, indexed commit, and flag states;
- persisted lifecycle process counts;
- one or more sampled process detail payloads showing subtype and per-step evidence;
- backward-compatibility comparison (`flag on` vs `flag off`);
- `confirmed_chain.steps` copied or restitched from the neonspark reload case.

Create `docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-report.md` with:
- one short table for `Phase 3 query-time only` vs `Phase 4 persisted`;
- explicit note that the graph shape is still `Process` + `STEP_IN_PROCESS`, not a parallel Unity-only artifact type;
- final verdict for discoverability, durability, and compatibility.

**Step 3: Run the report sanity check**

Run:

```bash
jq '{persistedLifecycleProcessCount, confirmed_chain_steps: (.confirmed_chain.steps | length), backwardCompat}' docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json
```

Expected:
- `persistedLifecycleProcessCount > 0`
- `confirmed_chain_steps > 0`
- `backwardCompat.regressionDetected == false`

**Step 4: Commit**

```bash
git add docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-summary.json docs/reports/2026-03-31-phase4-unity-lifecycle-process-persist-report.md
git commit -m "docs(phase4): record persisted lifecycle process acceptance"
```

## Plan Audit Verdict
audit_scope: [design doc Phase 4 section, milestone matrix, feature flag section, neonspark reload acceptance linkage]
finding_summary: P0=0, P1=0, P2=2
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` embedded in Task 1, Task 2, and Task 4; result: pass
authenticity_checks:
- `assert live mode has tool evidence` required in Task 4 report; result: pass
- `assert freeze requires non-empty confirmed_chain.steps` required in Task 4 sanity check; result: pass
- `assert backward compatibility preserves legacy fields` covered in Task 3 endpoint tests and Task 4 flag-off comparison; result: pass
approval_decision: pass
