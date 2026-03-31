# Unity Runtime Process Integration - Phased Design

Date: 2026-03-31
Owner: GitNexus
Status: Draft (phased execution plan)

## 1. Problem Statement

Current GitNexus `process` output is based on entry-point heuristics + `CALLS` traversal, and in Unity repos this often yields empty or misleading process signals for runtime questions.

Target outcome:

- For arbitrary Unity runtime symbols, `context/query` should return runtime-relevant chain clues in `processes`, instead of frequently empty process results.
- The solution should integrate into existing GitNexus architecture (`process` + `STEP_IN_PROCESS`) rather than creating a disconnected parallel system.
- End-to-end runtime chain recovery may be stitched from multiple retrieval hops (process + resource evidence), with stitching guided by skill workflow rather than new CLI hop-orchestration fields.

## 2. Ground Truth from Current System

1. `process` generation is currently `CALLS`-only BFS/heuristic.
2. Unity resource extraction runs after process detection in analyze pipeline.
3. `context/query` process membership is currently read only from `STEP_IN_PROCESS`.
4. Unity runtime hydration enriches symbol payload, but does not project runtime chains into process membership.
5. `UNITY_RESOURCE_SUMMARY` currently uses `Class -> File` relation shape, but schema does not include `Class -> File` relation pair, causing ingestion fallback warnings and weak persistence reliability.

Implication:

- “Only add more Unity payload fields” cannot solve empty process.
- “Only add more `CALLS` edges” can help, but without process projection and schema hygiene it will be unstable or low-recall.

## 3. Design Principles

1. Reuse existing process model first: prefer integrating runtime signals through `CALLS` + `STEP_IN_PROCESS`.
2. Add Unity-specific semantics as layered confidence, not binary truth.
3. Every phase must have measurable verification gates before moving forward.
4. Keep rollback simple: each phase should be feature-flagged.
5. Keep CLI contract focused: multi-hop stitching guidance should be implemented in skill workflow/prompts, not as mandatory new CLI orchestration fields.

## 4. Phased Plan

### Phase 0 - Baseline & Safety Gates

Goal:

- Freeze baseline behavior and metrics before changing graph semantics.

Implementation:

1. Add a Unity runtime-process baseline report script/command bundle (read-only):
   - process coverage for lifecycle methods (`Awake/Start/Update/...`)
   - `% symbols with non-empty context.processes` for sampled Unity symbols
   - query-level `process_symbols` non-empty ratio for Unity-focused queries
2. Add a fixed benchmark query set (neonspark + neonnew-core + mini fixture).

Verification:

1. Produce baseline report artifacts under `docs/reports/`.
2. Ensure reproducibility over 3 runs (variance threshold pre-defined).

Exit criteria:

- Baseline metrics available and stable; regression comparison target fixed.

Rollback:

- N/A (read-only).

#### Phase 0 Execution Record (2026-03-31)

Status:

- Completed.

Index state used:

1. `neonspark`: up-to-date at commit `9d105b2`
2. `neonnew-core`: re-analyzed to current commit `79f051a`
3. `unity-mini-phase0`: indexed as alias `unity-mini-phase0` (fixture repo at `/tmp/unity-mini-phase0`)

Artifacts:

1. `docs/reports/2026-03-31-phase0-unity-runtime-process-queryset.json`
2. `docs/reports/2026-03-31-phase0-unity-runtime-process-run1.json`
3. `docs/reports/2026-03-31-phase0-unity-runtime-process-run2.json`
4. `docs/reports/2026-03-31-phase0-unity-runtime-process-run3.json`
5. `docs/reports/2026-03-31-phase0-unity-runtime-process-summary.json`
6. `docs/reports/2026-03-31-phase0-unity-runtime-process-report.md`

Baseline metrics snapshot (3 runs):

1. `neonspark`
   - symbol non-empty `context.processes` ratio: `0.0%`
   - query non-empty `process_symbols` ratio: `12.5%`
   - lifecycle coverage (`Awake/Start/Update/FixedUpdate/OnEnable/OnDisable`): all `0.0%`
2. `neonnew-core`
   - symbol non-empty `context.processes` ratio: `0.0%`
   - query non-empty `process_symbols` ratio: `12.5%`
   - lifecycle coverage (`Awake/Start/Update/FixedUpdate/OnEnable/OnDisable`): all `0.0%`
3. `unity-mini-phase0`
   - symbol non-empty `context.processes` ratio: `0.0%`
   - query non-empty `process_symbols` ratio: `0.0%`

Reproducibility result:

1. Gate threshold: ratio spread <= `5.0pp` across 3 runs
2. Observed: all tracked ratios spread `0.0pp` (pass)

---

### Phase 1 - Schema Hygiene for Unity Summary Persistence

Goal:

- Make Unity summary relations durable in LadybugDB so later phases can rely on indexed resource evidence.

Implementation:

1. Update relation schema pairs to support required Unity relation routes (at minimum `Class -> File` for `UNITY_RESOURCE_SUMMARY`; include any other observed Unity relation pairs).
2. Add/adjust schema tests and ingestion tests to assert non-zero persisted `UNITY_RESOURCE_SUMMARY` when fixture has known bindings.
3. Fix analyze summary reporting for fallback insert stats (`succeeded/failed` should reflect real outcomes, not optimistic defaults).

Verification:

1. Re-analyze mini Unity fixture; Cypher returns `COUNT(UNITY_RESOURCE_SUMMARY) > 0`.
2. Re-analyze sample real Unity repo scope; fallback warning count for Unity summary pair drops to expected level.
3. Existing `test:u3:gates` stays green.

Exit criteria:

- Unity summary edges are reliably persisted and queryable.

Rollback:

- Feature flag to disable Unity summary relation writes if unexpected DB impact appears.

#### Phase 1 Execution Record (2026-03-31)

Status:

- Completed.

Implemented:

1. Added schema hygiene relation routes for Unity summary persistence, including `Class -> File`, plus audited fallback relation pairs surfaced by schema tests.
2. Added fallback replay counter path so LadybugDB fallback inserts return truthful `attempted/succeeded/failed`.
3. Wired analyze summary reporting to prefer runtime fallback counters and only derive conservative fallback counters from warnings when runtime stats are unavailable.

Verification artifacts:

1. `docs/reports/2026-03-31-phase1-unity-runtime-process-schema-hygiene-report.md`

Verification snapshot:

1. Sampled real Unity repo analyze (`neonnew-core`, scoped) showed no `Class->File ... missing rel pair` warning lines.
2. `npm --prefix gitnexus run test:u3:gates` passed.
3. Mini fixture cypher gate (`unity-mini-phase0`) returned `cnt=6` for `UNITY_RESOURCE_SUMMARY` (`cnt > 0` target met).

---

### Phase 2 - Query-Time Runtime Process Projection (No New Persisted Process Yet)

Goal:

- Immediately reduce empty-process misguidance in agent-facing tools without waiting for full re-architecture.

Implementation:

1. In `context` for class symbols:
   - extend process lookup from class node only to class methods (`HAS_METHOD -> STEP_IN_PROCESS`) and merge/dedupe.
2. In `query`:
   - for class hits, allow process attribution via class methods when direct class process rows are empty.
3. Add response metadata:
   - `processes[].evidence_mode`: `direct_step` or `method_projected`
   - confidence tag (`high/medium`) based on projection path.

Verification:

1. For baseline symbol set, `context.processes` empty ratio decreases.
2. For Unity query set, `process_symbols` non-empty ratio improves versus Phase 0.
3. Non-Unity repos show no material regression in top-k process ranking.

Exit criteria:

- Observable process recall gain in Unity scenarios, with acceptable precision.

Rollback:

- Toggle off method-projected process attribution and return to direct-step only.

---

### Phase 3 - Lifecycle + Runtime Loader Modeling via Synthetic CALLS

Goal:

- Integrate MonoBehaviour/ScriptableObject lifecycle semantics and deterministic runtime loader paths into existing `process=CALLS` pipeline.

Implementation:

1. Add Unity lifecycle detector during ingestion:
   - identify classes extending `MonoBehaviour` / `ScriptableObject`
   - detect lifecycle callbacks (`Awake`, `OnEnable`, `Start`, `Update`, etc.)
2. Inject bounded synthetic runtime entry nodes and `CALLS` edges:
   - runtime-root -> lifecycle callback methods
   - optional bounded event edges for known deterministic Unity patterns
3. Add bounded synthetic `CALLS` bridges for deterministic runtime loader paths visible in code:
   - pickup/equip path anchors (e.g. `PickItUp -> EquipWithEvent -> Equip`)
   - graph runtime anchors (e.g. `CurGunGraph` assignment, `RegisterEvents`, `StartRoutineWithEvents`)
   - node runtime anchors (e.g. `GetValue`/reload-related method path for reload node families)
4. Mark synthetic edges with explicit reason tags (e.g. `unity-lifecycle-synthetic`, `unity-runtime-loader-synthetic`) and calibrated confidence tier (<1.0).
5. Guard fan-out:
   - cap per-class and global synthetic edges
   - apply scope presets for Unity gameplay preference where applicable.

Verification:

1. Process detection includes lifecycle-anchored traces in Unity fixture/repo.
2. Process explosion control: process count and runtime remain within defined budget.
3. Precision audit: sampled chains match manual YAML/.meta truth at target threshold.
4. Case gate: for the neonspark `Reload` case, non-empty process clues must be available for at least one hop in each segment:
   - loader segment (`PickItUp/Equip` side)
   - graph runtime segment (`RegisterEvents/StartRoutineWithEvents` side)
   - reload segment (`Reload/GetValue/CheckReload` side)

Exit criteria:

- Lifecycle-aware processes appear consistently without blowing up noise/latency.

Rollback:

- Disable synthetic lifecycle edge injection via flag; keep Phase 2 projection benefits.

---

### Phase 4 - Persisted Unity Lifecycle Process Artifacts

Goal:

- Promote runtime lifecycle chains to first-class persisted process artifacts.

Implementation:

1. Add process subtype metadata:
   - `processSubtype`: `static_calls` | `unity_lifecycle`
2. During process generation, preserve source reason path and confidence aggregate for each process.
3. Ensure resources endpoint and process detail endpoint can expose subtype and confidence.

Verification:

1. `gitnexus://repo/{name}/processes` includes lifecycle subtype entries.
2. `process/{name}` detail shows runtime chain evidence attributes.
3. Existing consumers remain backward compatible.

Exit criteria:

- Unity lifecycle process is durable, discoverable, and distinguishable from generic call-graph process.

Rollback:

- Persist only classic process and keep lifecycle chain query-time only.

---

### Phase 5 - Confidence Model and Agent-Safe UX Contract

Goal:

- Prevent over-claiming runtime truth while improving agent decision quality.

Implementation:

1. Add confidence derivation for process membership and chain steps:
   - high: direct `STEP_IN_PROCESS` from static chain
   - medium: lifecycle synthetic + method projection
   - low: heuristic expansions with partial resource evidence
2. Add explicit guidance fields in `context/query`:
   - `runtime_chain_confidence`
   - `verification_hint` (when YAML/.meta manual verification is recommended)
3. Update docs/skill prompts so agents interpret empty/non-empty process correctly with confidence awareness.
4. Define skill-level multi-hop stitching workflow (no new CLI orchestration fields required):
   - hop selection order: `process clues -> resourceBindings -> asset/meta mapping -> next symbol process`
   - stitching stop condition and evidence requirements
   - output format for stitched chain with per-hop evidence anchors

Verification:

1. Agent-eval tasks involving runtime chain show lower false-negative and false-confidence rates.
2. Benchmark gate includes confidence calibration checks.

Exit criteria:

- Agent behavior shifts from “empty process => no runtime clue” to calibrated interpretation.

Rollback:

- Hide confidence fields behind flag while preserving underlying chain computation.

## 5. Milestone-Based Validation Matrix

For each phase after Phase 0, run:

1. Unit/integration tests for touched modules.
2. `npm --prefix gitnexus run test:u3:gates`.
3. Fixture verification:
   - mini Unity fixture known-symbol checks.
4. Real repo verification:
   - neonspark + neonnew-core sampled symbol/query set.
5. Regression check:
   - non-Unity repo process precision/latency sanity.
6. Case-based acceptance pack:
   - `docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md`

## 6. Suggested Feature Flags

1. `GITNEXUS_UNITY_PROCESS_METHOD_PROJECTION=on|off` (Phase 2)
2. `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on|off` (Phase 3)
3. `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on|off` (Phase 4)
4. `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on|off` (Phase 5)

## 7. Recommended Execution Order

1. Phase 0 + Phase 1 first (data foundation).
2. Phase 2 for quick user-visible improvement and risk control.
3. Phase 3 and 4 for long-term architecture convergence.
4. Phase 5 to harden agent behavior and production trust.

## 8. Expected Outcome

After Phase 5:

1. Unity runtime symbols no longer frequently return misleading empty process clues.
2. Runtime lifecycle chains are integrated into GitNexus core process system.
3. Agent-facing outputs carry confidence and verification hints, reducing investigation drift.
4. For complex Unity runtime questions, agents can stitch full chain evidence through multiple GitNexus calls using skill workflow.

## 9. Case-Based Acceptance (Neonspark Reload)

Reference fact-check:

- `docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md`

Target full chain (stitched, not required to be single process):

1. `PowerUp asset (1_weapon_orb_key.asset)`
2. `WeaponPowerUp.gungraph` reference
3. `Graph asset (1_weapon_orb_key.asset under Graphs)`
4. `Reload node in graph (script guid bd387...)`
5. `PickItUp -> EquipWithEvent -> WeaponPowerUp.Equip`
6. `CurGunGraph assignment`
7. `GunGraphMB.RegisterGraphEvents -> GunGraph.RegisterEvents`
8. `Gun.GunAttackRoutine -> GunGraph.StartRoutineWithEvents -> GunOutput RPM pull`
9. `ReloadBase.GetValue/CheckReload/ReloadRoutine`

Split use cases and acceptance criteria:

### UC-1: Symbol retrieval baseline (Reload)

Input:

- `query/context` on `Reload` with Unity resources enabled.

Accept:

1. `processes` may still be partial, but not all runtime investigation clues are empty.
2. `resourceBindings` returns non-zero and includes graph assets containing Reload node.

### UC-2: Resource-to-asset hop

Input:

- Take one `Reload.resourceBindings` graph asset; resolve graph GUID and find referencing PowerUp asset via `gungraph`.

Accept:

1. At least one concrete `PowerUp asset -> gungraph` mapping is recovered.
2. Mapping is evidence-backed by serialized asset lines (`.asset`/`.meta`).

### UC-3: Loader process segment

Input:

- Query/context around `WeaponPowerUp` / `FirearmsPowerUp` / pickup flow symbols.

Accept:

1. Process clues include at least one actionable loader segment symbol (`PickItUp`, `EquipWithEvent`, `Equip`, or equivalent).
2. Evidence lines confirm `CurGunGraph` assignment occurs in runtime equip path.

### UC-4: Runtime execution segment

Input:

- Query/context around `GunGraphMB`, `GunGraph`, `GunOutput`, `ReloadBase/Reload`.

Accept:

1. Process clues include at least one actionable runtime segment symbol (`RegisterEvents`, `StartRoutineWithEvents`, `GetValue/CheckReload`, or equivalent).
2. Evidence lines confirm RPM/output path reaches reload logic.

### UC-5: Agent stitched-chain output (skill workflow)

Input:

- Start only from symbol `Reload` and perform multi-hop retrieval with GitNexus tools.

Accept:

1. Agent can produce a stitched chain covering UC-2 + UC-3 + UC-4.
2. Every hop includes concrete evidence anchor (`symbol/file/line` or `asset/meta` line).
3. If one hop lacks direct `process`, agent must continue via resource evidence and subsequent symbol queries, not conclude “no runtime chain”.
