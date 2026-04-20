# Unity Gap Lab Slice-Driven Rule Generation Design

Date: 2026-04-10
Repo: GitNexus
Status: Draft

## 1. Problem Statement

Current `gitnexus-unity-rule-gen` workflow assumes the user can provide a near-complete runtime chain clue set in one session, then generate one or more rules in batch.

This does not fit real usage:

1. Unity runtime gaps are discovered incrementally.
2. A full-project gap inventory is too large for one session.
3. Rule production should be gap-driven ("fill one synthetic-edge gap"), not scenario-chain-driven ("describe full business chain first").
4. Execution must be resumable across sessions with persistent progress under `.gitnexus/`.

## 2. Goals

### G-01 Slice-first execution

Define project-level slices once, then execute one focused slice per loop.

### G-02 Gap-first rule generation

Rules are produced from detected missing synthetic-edge patterns, not from complete user-provided chains.

### G-03 Session-resumable workflow

All planning, evidence, and state transitions are persisted under `.gitnexus/gap-lab/`.

### G-04 Stable taxonomy with extensibility

Use stable top-level categories with extensible subtypes and versioned pattern catalog.

### G-05 Deterministic control policy

If user did not specify a target category/subtype, agent must ask and lock focus before discovery.

## 3. Non-Goals

This design does not:

1. require finishing all slices in one run;
2. attempt perfect automatic classification without user checkpoints;
3. change query-time verifier architecture (still graph-only closure);
4. require introducing new binding kinds in this phase (new kinds may be proposed as follow-up).

## 4. As-Built Constraints

1. Analyze-time synthetic edges are injected by `analyze_rules`.
2. Query-time runtime closure is graph-only and seed/anchor-driven.
3. Rule lifecycle ownership is already on `rule-lab-*` commands for `.gitnexus/rules/**`.
4. Existing supported `resource_bindings.kind` are:
   1. `asset_ref_loads_components`
   2. `method_triggers_field_load`
   3. `method_triggers_scene_load`
   4. `method_triggers_method`

## 5. Gap Taxonomy (Two-level)

Each candidate must carry both `gap_type` and `gap_subtype`.

```json
{
  "gap_type": "event_delegate_gap",
  "gap_subtype": "mirror_synclist_callback",
  "pattern_id": "event_delegate.mirror_synclist_callback.v1",
  "detector_version": "1.0.0"
}
```

### 5.1 Top-level `gap_type`

1. `scene_deserialize_gap`
2. `event_delegate_gap`
3. `scene_load_gap`
4. `conditional_branch_gap`
5. `startup_bootstrap_gap`

### 5.2 Initial `gap_subtype` set

1. `scene_deserialize_gap`
   1. `scene_root_lifecycle`
   2. `prefab_nested_lifecycle`
2. `event_delegate_gap`
   1. `csharp_event_delegate`
   2. `unity_event`
   3. `mirror_syncvar_hook`
   4. `mirror_synclist_callback`
3. `scene_load_gap`
   1. `scene_manager_string`
   2. `scene_loader_wrapper`
4. `conditional_branch_gap`
   1. `state_guard_branch`
   2. `feature_flag_branch`
5. `startup_bootstrap_gap`
   1. `attribute_static_init`
   2. `reflection_bootstrap`

Notes:

1. `Global.InitGlobal` (attribute-triggered static startup call) is classified as `startup_bootstrap_gap/attribute_static_init`.
2. Mirror callback and SyncList callback are classified under `event_delegate_gap`, subtype `mirror_syncvar_hook` or `mirror_synclist_callback`.

## 6. Pattern Catalog and Repo Override

## 6.1 Pattern definition stage

Pattern definitions are created before per-slice discovery, not during graph verification.

Two layers:

1. Built-in catalog (shipped with skill/tooling).
2. Repo override (project-specific additions/tuning).

## 6.2 Storage

```text
.gitnexus/gap-lab/patterns/
  catalog.v1.json
  overrides/
    <gap_type>.<gap_subtype>.yaml
```

## 6.3 Runtime loading policy

1. Build full slice skeleton first.
2. During a focused loop, load only patterns relevant to current slice.
3. Do not require all categories/subtypes to be overridden before starting execution.

## 7. Slice-driven Workflow (State Machine)

## 7.1 High-level phases

1. `Phase A` Run init (once): create full slice structure only.
2. `Phase B` Focus lock (every loop): pick exactly one slice.
3. `Phase C` Single-slice full execution: discover -> verify gap -> generate rule -> compile/analyze -> verify.
4. `Phase D` Persist state and stop point.

## 7.2 Mandatory focus rule

If user did not specify target `gap_type` or `gap_subtype`, agent must ask for focus before discovery starts.

No implicit "run all slices" behavior.

## 7.3 Slice status model

`pending | in_progress | blocked | rule_generated | indexed | verified | done`

## 8. Gap Discovery and Validation Pipeline

## 8.1 Core principle

Gap discovery is semantic-first, graph-validation-second.

1. Semantic pattern detection proposes "expected edge/path should exist."
2. Graph verification confirms that edge/path is currently missing.
3. Candidate becomes an inventory gap only after missing-edge confirmation.

## 8.2 Why graph is not discovery-first

A gap exists because specific linkage is absent in current graph. Therefore graph alone cannot be the primary discovery source for that missing linkage.

Graph is used for:

1. anchor normalization;
2. missing-edge confirmation;
3. post-rule effectiveness verification.

## 8.3 Candidate record contract

```json
{
  "gap_id": "gap-000123",
  "slice_id": "event_delegate.mirror_synclist_callback",
  "gap_type": "event_delegate_gap",
  "gap_subtype": "mirror_synclist_callback",
  "pattern_id": "event_delegate.mirror_synclist_callback.v1",
  "detector_version": "1.0.0",
  "source_anchor": {"symbol": "A", "file": "Assets/..."},
  "target_anchor": {"symbol": "B", "file": "Assets/..."},
  "expected_edge_kind": "CALLS",
  "suggested_binding": "method_triggers_method",
  "graph_verification": {"missing": true, "evidence": []},
  "confidence": 0.86,
  "status": "candidate"
}
```

## 9. User Input and Confirmation Policy

## 9.1 Required minimal input

1. Focus scope: target `gap_type`/`gap_subtype` (or choose from agent-provided options).
2. Optional project hint: scene/module/path prefix.
3. Optional known symptom examples (1-3).

No requirement for full runtime chain clues.

## 9.2 Classification/confirmation policy

1. `confidence >= 0.8`: auto-classify, continue.
2. `0.5 <= confidence < 0.8`: lightweight user confirmation batch.
3. `confidence < 0.5` or conflicting subtype: must confirm with user.

## 10. Persistence Layout Under `.gitnexus`

```text
.gitnexus/gap-lab/runs/<run_id>/
  manifest.json
  slice-plan.json
  progress.json
  inventory.jsonl
  decisions.jsonl
  slices/
    <slice_id>.json
```

## 10.1 File responsibilities

1. `manifest.json`
   1. run metadata
   2. `patterns_version`
   3. `pattern_snapshot_hash`
2. `slice-plan.json`
   1. all slices and statuses
   2. priority
   3. focus history
3. `progress.json`
   1. current slice
   2. checkpoint phase
   3. resumable command hints
4. `inventory.jsonl`
   1. append-only gap candidates
5. `decisions.jsonl`
   1. user confirmation or rejection logs
6. `slices/<slice_id>.json`
   1. slice-local evidence, selected gaps, generated rules, verification result

## 11. Pattern Extension Without Breaking Existing Slices

Use append-only evolution:

1. never mutate historical `pattern_id` semantics;
2. add new subtype with new `pattern_id` version;
3. freeze `patterns_version` and `pattern_snapshot_hash` per run;
4. keep old run reproducible;
5. add new slices in new run or explicit replan step.

Backward compatibility:

1. old records without subtype are normalized to `gap_subtype: "generic"`;
2. old slices remain valid and are not reclassified automatically.

## 12. Mapping Gaps to Existing Binding Kinds

Default mapping strategy:

1. `scene_deserialize_gap`
   1. `asset_ref_loads_components`
   2. `method_triggers_scene_load`
2. `event_delegate_gap`
   1. `method_triggers_method`
3. `scene_load_gap`
   1. `method_triggers_scene_load`
4. `conditional_branch_gap`
   1. `method_triggers_method` as temporary bridge
   2. if insufficient, mark as "needs new binding kind"
5. `startup_bootstrap_gap`
   1. initial fallback `method_triggers_method` (runtime root/entry bridge)
   2. may require future dedicated binding kind

## 13. Acceptance Criteria

1. Skill can initialize a run and generate full slice skeleton without collecting all pattern details.
2. User can select one slice and complete end-to-end loop in one session.
3. Rule output and index rebuild can be verified before slice status transitions to `verified/done`.
4. Run can be resumed in later session from `.gitnexus/gap-lab/runs/<run_id>/progress.json`.
5. New subtype additions do not invalidate completed slices from previous runs.

## 14. Migration Plan for `gitnexus-unity-rule-gen` Skill

1. Replace chain-clue-first intro with gap-lab slice-first intro.
2. Add Phase A/B/C/D state machine and focus-lock rule.
3. Add taxonomy contract (`gap_type/gap_subtype/pattern_id/detector_version`).
4. Add persistence contract for `.gitnexus/gap-lab/**`.
5. Replace manual rule write path with rule-lab lifecycle-driven path.
6. Update installed copy under `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` in the same change set.

## 15. Open Questions

1. Whether `startup_bootstrap_gap` should receive a dedicated binding kind in this iteration or remain `method_triggers_method`-based bridge.
2. Whether Mirror-specific subtypes should be split further by API surface (`SyncVar`, `SyncList`, custom `NetworkBehaviour` callbacks).
3. Whether slice priority should be user-defined only or include automatic risk scoring.
