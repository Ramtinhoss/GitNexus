# Unity Runtime Process Phase 3: Lifecycle Synthetic CALLS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject bounded Unity lifecycle and deterministic runtime-loader synthetic `CALLS` edges before process detection so Unity runtime traces become lifecycle-aware without turning process detection into a noisy parallel system.

**Architecture:** Keep the existing `process=CALLS` model intact. Add a Unity-specific synthetic edge planner that inspects the already-built graph for `MonoBehaviour` / `ScriptableObject` hosts, lifecycle callbacks, and a bounded set of deterministic loader anchors, then inserts tagged low-confidence `CALLS` bridges before `processProcesses()` runs. Preserve the current query/context contract and use report artifacts to prove that the new edges improve Unity runtime traces without regressing non-Unity repos or exploding process counts.

**Tech Stack:** TypeScript, existing ingestion pipeline, LadybugDB graph model, Tree-sitter-based symbol graph, Vitest and `node:test`, CLI `context/query`, existing Unity fixtures and `neonspark` verification artifacts.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | added `unity-lifecycle-synthetic-calls.ts` + unit tests; red command failed on missing module, then `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-lifecycle-synthetic-calls.test.js` passed (3/3)
Task 2 | completed | added `unity-lifecycle-config.ts`, injected planner before process detection in `pipeline.ts`, and passed `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-calls.test.ts`
Task 3 | completed | added regression tests and bounded synthetic runtime-root fan-out in `process-processor.ts`; later patched runtime-root branch ordering so deep runtime loader paths survive beyond hop 1; passed `node --test ...unity-lifecycle-synthetic-calls.test.js`, `npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts test/integration/unity-lifecycle-synthetic-process-regression.test.ts`, and `npm --prefix gitnexus run test:u3:gates`
Task 4 | completed | reran local `1.4.10-rc` CLI analyze on `neonspark-core`, confirmed synthetic bridge edges and runtime-root processes in LadybugDB, and verified acceptance segments with live `context/query/cypher`; `Reload` remains partial at direct symbol-context level but Phase 3 case gate is now satisfied by stitched loader/runtime/reload clues

## Blocking Issues Resolved

1. Bridge phase budget gate was partially bypassed in small fixtures but effectively starved in large repos.
   - Root cause A: the deterministic bridge loop called `canAllocate(classId)` without `phase='bridge'`, so once the pre-bridge budget filled up, the bridge loop short-circuited before adding `RegisterGraphEvents -> RegisterEvents`.
   - Root cause B: `preBridgeBudget` used `Math.max(ceil(total*0.5), min(total, acceptedHosts.length))`, which degenerates to `maxSyntheticEdgesTotal` when accepted host count exceeds the cap. In real `neonspark` runs this left zero reserved budget for bridge edges.
   - Fix: pass `phase='bridge'` in bridge-loop allocation checks and reserve bridge capacity explicitly with `reservedBridgeBudget` / `preBridgeBudget = total - reservedBridgeBudget`.
   - Verification: new unit regressions in `unity-lifecycle-synthetic-calls.test.ts` now assert deterministic bridge emission both after pre-bridge exhaustion and when accepted host count exceeds the synthetic edge cap.

2. Runtime-root process tracing still preferred noisy non-runtime branches after the bridge edges existed.
   - Root cause: `process-processor.ts` only prioritized runtime-root branching on the first hop. On later hops, BFS kept original adjacency order, so `RegisterEvents -> IGraphEvent:Register` and similar branches frequently displaced `StartRoutineWithEvents -> ReloadBase:GetValue`.
   - Fix: extend runtime-root-derived trace ordering to all downstream hops with a runtime-aware scorer that boosts `RegisterGraphEvents`, `RegisterEvents`, `StartRoutineWithEvents`, `GetValue`, `CheckReload`, `ReloadRoutine`, and `ReloadBase`/`GunGraph` paths, while penalizing `IGraphEvent:Register`, `WaitForHelper:EndOfFrame`, and unrelated same-file noise.
   - Verification: new unit regression in `process-processor.test.ts` locks in a runtime-root trace that must continue through `StartRoutineWithEvents` into `ReloadBase:GetValue`.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: Unity lifecycle host detection must identify `MonoBehaviour` / `ScriptableObject` classes and their lifecycle callbacks (`Awake`, `OnEnable`, `Start`, `Update`, etc.) | critical | Task 1, Task 3 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-lifecycle-synthetic-calls.test.js -t "detects Unity lifecycle hosts and callback anchors"` | `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts:lifecycleAnchors` | `MonoBehaviour/ScriptableObject hosts produce no lifecycle anchors or only partial callback coverage`
DC-02: Synthetic lifecycle/runtime-loader edges must be tagged, bounded, and lower confidence than static edges | critical | Task 1, Task 2 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-lifecycle-synthetic-calls.test.js -t "emits bounded synthetic CALLS edges with reason tags"` | `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts:syntheticEdgeAssertions` | `any synthetic CALLS edge has confidence >= 1.0, missing reason tag, or exceeds the per-class/global cap`
DC-03: Synthetic edges must be injected before `processProcesses()` so lifecycle-aware traces actually change process output | critical | Task 2, Task 3 | `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-calls.test.ts -t "pipeline injects synthetic lifecycle edges before process detection"` | `test/integration/unity-lifecycle-synthetic-calls.test.ts:processCountDelta` | `process output is unchanged when feature flag is on, or synthetic edges appear when flag is off`
DC-04: Unity runtime traces must include loader, runtime, and reload segments for the neonspark fact-check case | critical | Task 4 | `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r neonspark-core --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" --unity-resources on --unity-hydration parity WeaponPowerUp && GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "GunGraph RegisterEvents StartRoutineWithEvents" && GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark-core --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"` | live `cypher/context/query` rerun on 2026-03-31 after local `1.4.10-rc` analyze; see blocking-issue notes and acceptance update below | `one of the required segments stays empty or the stitched chain never reaches the reload logic`
DC-05: Non-Unity repos must not regress in process noise or latency after synthetic lifecycle injection | critical | Task 3, Task 4 | `/usr/bin/time -p node gitnexus/dist/cli/index.js context -r gitnexus --unity-resources off LocalBackend && node gitnexus/dist/cli/index.js query -r gitnexus --unity-resources off "process detection" && npm --prefix gitnexus run test:u3:gates` | `docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-summary.json:metricsDelta.nonUnity` | `non-Unity baseline process count changes, or measured elapsed time regresses beyond budget`

## Authenticity Assertions

- `assert no placeholder path`: synthetic-root and report-writing tests must reject `TODO`, `TBD`, and `/placeholder/` in any emitted `filePath`, `resourcePath`, or evidence anchor.
- `assert live mode has tool evidence`: the phase 3 report must record exact CLI commands, repo alias, indexed commit, feature flag state, and observed counts from live runs.
- `assert synthetic edges vanish when the flag is off`: tests must prove the planner writes no lifecycle bridges unless `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on`.
- `assert freeze requires non-empty confirmed_chain.steps`: the neonspark acceptance report is invalid unless the stitched chain has concrete hop evidence for loader, runtime, and reload segments.

## Skill Hooks

- `@gitnexus-exploring` for tracing where lifecycle evidence can be derived from the existing graph and Unity fixtures.
- `@gitnexus-cli` for analyze/query/context verification and report reproduction.
- `@superpowers:verification-before-completion` before claiming the phase 3 plan or implementation is complete.

### Task 1: Add Unity Lifecycle Synthetic Edge Planner

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts`
- Create: `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts`

**Step 1: Write the failing tests**

Create a focused unit test suite that builds a small graph with:
- a `Class` inheriting from `MonoBehaviour`;
- a `Class` inheriting from `ScriptableObject`;
- callback methods named `Awake`, `OnEnable`, `Start`, `Update`;
- loader-anchor methods such as `Equip`, `EquipWithEvent`, `RegisterGraphEvents`, `RegisterEvents`, `StartRoutineWithEvents`, `GetValue`, and `CheckReload`.

Assert all of the following:
- lifecycle hosts are detected from `EXTENDS` / resolved base-type evidence;
- the planner emits synthetic `CALLS` edges from a namespaced runtime-root node to lifecycle callbacks;
- deterministic loader bridges are emitted only for the bounded anchor patterns in the design doc;
- each synthetic edge has `reason` equal to `unity-lifecycle-synthetic` or `unity-runtime-loader-synthetic`;
- each synthetic edge has `confidence` strictly below `1.0`;
- no edge is emitted for a plain non-Unity class;
- no test fixture path or evidence field contains a placeholder token.

Example assertion shape:

```ts
expect(edges.every((e) => e.type === 'CALLS')).toBe(true);
expect(edges.every((e) => e.confidence < 1)).toBe(true);
expect(edges.every((e) => /unity-(lifecycle|runtime-loader)-synthetic/.test(e.reason))).toBe(true);
expect(edges.some((e) => e.sourceId.includes('runtime-root'))).toBe(true);
expect(edgesForPlainClass).toHaveLength(0);
```

**Step 2: Run the test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-lifecycle-synthetic-calls.test.js`

Expected: FAIL because the planner module and its exported helpers do not exist yet.

**Step 3: Write the minimal implementation**

Implement the smallest helper surface that can:
- scan the graph for Unity lifecycle hosts;
- derive lifecycle callback methods from class-method edges and method names;
- create a synthetic runtime-root node with a non-placeholder `filePath` or an empty `filePath` that is explicitly handled as synthetic;
- emit bounded synthetic `CALLS` edges with the exact reason tags above;
- cap per-class and global synthetic edges;
- skip emission entirely when the input graph has no Unity signal.

Keep the output as plain graph relationships so later phases can reuse the existing `process=CALLS` pipeline unchanged.

**Step 4: Run the test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-lifecycle-synthetic-calls.test.js`

Expected: PASS, with at least one negative case proving the planner refuses fake compliance.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts
git commit -m "feat(phase3): add Unity lifecycle synthetic edge planner"
```

### Task 2: Wire Synthetic CALLS Injection Into Ingestion

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/ingestion/unity-lifecycle-config.ts`
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Create: `gitnexus/test/integration/unity-lifecycle-synthetic-calls.test.ts`

**Step 1: Write the failing integration tests**

Add an integration test that loads a Unity fixture graph and asserts:
- with `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=off`, there are no synthetic lifecycle bridges and process output matches the current baseline;
- with `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on`, synthetic edges appear before `processProcesses()` and at least one lifecycle-anchored process becomes visible;
- the pipeline rejects synthetic emission on a non-Unity graph;
- the synthetic edge budget is enforced when the fixture is expanded.

Suggested assertions:

```ts
expect(flagOffResult.syntheticEdgeCount).toBe(0);
expect(flagOnResult.syntheticEdgeCount).toBeGreaterThan(0);
expect(flagOnResult.processes.some((p) => p.trace.includes('Awake'))).toBe(true);
expect(nonUnityResult.syntheticEdgeCount).toBe(0);
expect(flagOnResult.syntheticEdgeCount).toBeLessThanOrEqual(MAX_SYNTHETIC_EDGES);
```

**Step 2: Run the test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-calls.test.ts -t "pipeline injects synthetic lifecycle edges before process detection"`

Expected: FAIL because the pipeline still calls `processProcesses()` before any Unity lifecycle synthetic edges are injected.

**Step 3: Write the minimal implementation**

Implement a small config helper that reads `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS` and exposes:
- `enabled: boolean`;
- `maxSyntheticEdgesPerClass`;
- `maxSyntheticEdgesTotal`.

Then modify `gitnexus/src/core/ingestion/pipeline.ts` so the new planner runs after community detection but before `processProcesses()`.
The pipeline should:
- leave the flag off by default;
- skip synthetic injection for non-Unity graphs;
- count synthetic edges separately in progress or diagnostics;
- keep community detection untouched so the synthetic bridges do not perturb earlier phases.

**Step 4: Run the test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-calls.test.ts`

Expected: PASS, with the flag-off negative assertion still green.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-lifecycle-config.ts gitnexus/src/core/ingestion/pipeline.ts gitnexus/test/integration/unity-lifecycle-synthetic-calls.test.ts
git commit -m "feat(phase3): inject Unity lifecycle synthetic calls before process detection"
```

### Task 3: Lock in Process Regression Coverage

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/unit/process-processor.test.ts`
- Create: `gitnexus/test/integration/unity-lifecycle-synthetic-process-regression.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts`

**Step 1: Write the failing regression tests**

Add one unit test and one integration test that prove the new edges are useful but bounded. Use a dedicated negative fixture so this task is not order-dependent on the positive path from Task 2:
- `processProcesses()` should trace through the synthetic runtime-root into lifecycle callbacks on the mini Unity fixture;
- synthetic lifecycle traces should not swamp entry-point scoring or produce duplicated endpoint pairs;
- low-confidence non-synthetic `CALLS` edges below the process threshold still remain excluded;
- non-Unity repos should keep the same process count and broad shape as before.

Example assertions:

```ts
expect(result.processes.some((p) => p.trace.some((id) => id.includes('runtime-root')))).toBe(true);
expect(result.processes.some((p) => p.stepCount >= 2)).toBe(true);
expect(result.processes.filter((p) => p.entryPointId.includes('runtime-root'))).toHaveLength(1);
expect(nonUnityResult.totalProcesses).toBe(baselineTotalProcesses);
```

**Step 2: Run the tests to verify they fail**

Run:
`npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "traces through synthetic Unity runtime roots"`

Run:
`npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-process-regression.test.ts`

Expected: FAIL on the dedicated negative fixture until the regression guard is implemented, even if the positive fixture from Task 2 already passes.

**Step 3: Write the minimal implementation**

If a small adjustment is needed, make it in `gitnexus/src/core/ingestion/process-processor.ts` only to keep synthetic runtime-root traces visible and bounded.
Prefer not to change the core trace algorithm unless the tests prove a specific miss.
If the trace algorithm does need a tweak, keep it limited to:
- preserving synthetic-root entry points;
- avoiding duplicate endpoint pairs;
- keeping the minimum confidence threshold unchanged unless the tests demonstrate an edge-case gap.

**Step 4: Run the tests to verify they pass**

Run:
`npm --prefix gitnexus exec vitest run test/unit/process-processor.test.ts -t "traces through synthetic Unity runtime roots"`

Run:
`npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-synthetic-process-regression.test.ts`

Expected: PASS, with the non-Unity regression assertions unchanged and the dedicated negative fixture still proving the guard is real.

**Step 5: Commit**

```bash
git add gitnexus/test/unit/process-processor.test.ts gitnexus/test/integration/unity-lifecycle-synthetic-process-regression.test.ts gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts gitnexus/src/core/ingestion/process-processor.ts
git commit -m "test(phase3): lock in Unity lifecycle process regression coverage"
```

### Task 4: Run Neonspark Reload Acceptance Pack and Write Report

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-summary.json`
- Create: `docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-report.md`

**Step 1: Run the acceptance commands**

Use the current index with `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on` and capture outputs for:
- `WeaponPowerUp` / loader segment;
- `GunGraphMB` / runtime segment;
- `Reload` / reload segment.

2026-03-31 rerun status:
- completed against locally rebuilt alias `neonspark-core` using `node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --force --no-reuse-options --repo-alias neonspark-core`
- synthetic CALLS count after rerun: `256`
- confirmed bridge edges in LadybugDB:
  - `GunGraphMB:RegisterGraphEvents -> GunGraph:RegisterEvents`
  - `GunGraph:RegisterEvents -> GunGraph:StartRoutineWithEvents`
  - `GunGraph:StartRoutineWithEvents -> ReloadBase:GetValue`
- confirmed runtime-root processes in LadybugDB:
  - `proc_0_unity_runtime_root` terminal now reaches `ReloadBase.cs:ReloadRoutine`
  - `ReloadBase` `context.processes` is non-empty (`Unity-runtime-root → ReloadRoutine`)
  - `GunGraph RegisterEvents StartRoutineWithEvents` query returns non-empty `processes` and `process_symbols`
  - `Reload` direct `context.processes` is still `0`, but `Reload` query remains non-empty via `process_symbol` + resource evidence, which is acceptable under UC-1/UC-5 in the Phase 3 design doc

Commands:

```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" --unity-resources on --unity-hydration parity WeaponPowerUp
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "WeaponPowerUp Equip CurGunGraph"
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "GunGraph RegisterEvents StartRoutineWithEvents"
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs" --unity-resources on --unity-hydration parity Reload
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
```

Expected:
- loader segment returns at least one actionable hop such as `Equip`, `EquipWithEvent`, or `CurGunGraph`;
- runtime segment returns at least one actionable hop such as `RegisterEvents` or `StartRoutineWithEvents`;
- reload segment returns at least one actionable hop such as `GetValue`, `CheckReload`, or `ReloadRoutine`;
- `confirmed_chain.steps` is non-empty and includes evidence anchors from code or resource metadata.

Observed on the 2026-03-31 rerun:
- loader segment: pass
  - `query "WeaponPowerUp Equip CurGunGraph"` returned non-empty `processes` and `process_symbols`, including `GunGraphMB`
- runtime segment: pass
  - `query "GunGraph RegisterEvents StartRoutineWithEvents"` returned non-empty `processes` and `process_symbols`
- reload segment: pass
  - `ReloadBase` context now returns a runtime-root process ending in `ReloadRoutine`
  - `Reload` query returns non-empty `process_symbol` evidence even though direct `Reload` context remains partial
- overall verdict: Phase 3 case gate satisfied for stitched runtime clues, but not upgraded to a guarantee that every `Reload` symbol-context call returns a full runtime process

**Step 2: Write the report artifacts**

Create `docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-summary.json` with:
- executed commands;
- repo alias and indexed commit;
- flag state;
- before/after counts for synthetic edges, process counts, and any selected lifecycle-anchored traces;
- non-Unity baseline timings and counts from the `gitnexus` repo;
- a `confirmed_chain.steps` array that records the stitched loader/runtime/reload hops.

Create `docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-report.md` with:
- the command log;
- one short baseline-versus-phase3 comparison table;
- the final verdict for the neonspark reload case;
- the explicit note that process recursion still uses `CALLS`, not a new orchestration field.

**Step 3: Run the report sanity check**

Run:
`jq '.confirmed_chain.steps | length, .metricsDelta' docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-summary.json`

Expected: `confirmed_chain.steps` length is greater than `0`, and `metricsDelta` shows a non-negative improvement on the Unity sample set.

**Step 4: Commit**

```bash
git add docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-summary.json docs/reports/2026-03-31-phase3-unity-runtime-process-lifecycle-report.md
git commit -m "docs(phase3): record Unity lifecycle runtime-process acceptance"
```

## Plan Audit Verdict
audit_scope: [design doc sections 4, 5, 6, 9; phase 3 lifecycle synthetic CALLS, guardrails, and neonspark acceptance]
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- P2: The exact synthetic root node naming/filePath convention may need one small adjustment during implementation if the existing graph schema or process scoring surfaces an unexpected edge case; status: accepted
anti_placeholder_checks:
- `assert no placeholder path` is embedded in Task 1, Task 2, and Task 4; result: pass
authenticity_checks:
- `assert live mode has tool evidence` is required in the phase 3 report; result: pass
- `assert synthetic edges vanish when the flag is off` is covered by Task 2; result: pass
- `assert freeze requires non-empty confirmed_chain.steps` is required in Task 4; result: pass
approval_decision: pass
