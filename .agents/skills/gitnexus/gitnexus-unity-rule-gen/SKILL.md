---
name: gitnexus-unity-rule-gen
description: "Interactive gap-lab workflow for generating Unity analyze_rules from missing synthetic-edge patterns. Slice-driven, resumable, one-slice-per-loop. Use when: 'create unity rules', 'generate analyze rules', 'fill runtime gap', 'unity rule gen'."
---

# Unity Gap-Lab Slice-Driven Rule Generation

This skill migrates Unity rule generation from chain-clue-first input to
**gap-lab slice-driven** execution.

Core model:

1. Build run + slices once.
2. Focus-lock one `gap_type/gap_subtype` slice.
3. Execute a single-slice full loop.
4. Persist resumable state and stop.

Read first:

- `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- `docs/unity-runtime-process-source-of-truth.md`

## Preconditions

1. Confirm repository path and GitNexus index health.
2. Confirm `rule-lab` commands are available.
3. Confirm the run is for Unity runtime synthetic-edge authoring (offline authoring layer).
4. Confirm query-time closure remains graph-only; this workflow does not alter that boundary.

## Gap Taxonomy Contract

Every candidate must include all required fields:

- `gap_type`
- `gap_subtype`
- `pattern_id`
- `detector_version`

Example:

```json
{
  "gap_type": "event_delegate_gap",
  "gap_subtype": "mirror_synclist_callback",
  "pattern_id": "event_delegate.mirror_synclist_callback.v1",
  "detector_version": "1.0.0"
}
```

## Persistence Layout Contract

Persist all run artifacts under:

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

Placeholders are for schema explanation only. In executable steps, placeholder values are invalid; always use concrete run ids and slice ids.

## Confidence and Confirmation Policy

Use deterministic thresholds during classification:

1. `confidence >= 0.8`: auto-classify and continue.
2. `0.5 <= confidence < 0.8`: lightweight confirmation batch with the user.
3. `confidence < 0.5`: mandatory user confirmation before rule generation.

## Binding Mapping Policy

Map by existing binding kinds first:

- `scene_deserialize_gap` -> `asset_ref_loads_components`, `method_triggers_scene_load`
- `event_delegate_gap` -> `method_triggers_method`
- `scene_load_gap` -> `method_triggers_scene_load`
- `conditional_branch_gap` -> `method_triggers_method` (bridge)
- `startup_bootstrap_gap` -> `method_triggers_method` (bridge)

If a gap cannot be expressed safely with current kinds, mark it as `needs new binding kind` and do not force an incorrect mapping.

## Phase A Run Init (once per run)

1. Create run skeleton under `.gitnexus/gap-lab/runs/<run_id>/`.
2. Initialize `manifest.json` with:
   - `patterns_version`
   - `pattern_snapshot_hash`
   - run metadata
3. Initialize `slice-plan.json` with all slices and `pending` status.
4. Initialize `progress.json` with checkpoint `phase_a_initialized`.
5. Initialize empty `inventory.jsonl` and `decisions.jsonl`.
6. Record each slice stub at `slices/<slice_id>.json`.

Suggested commands:

```bash
gitnexus rule-lab discover --repo-path "$REPO_PATH"
```

If this run already exists, do not reinitialize; load existing artifacts and continue.

## Phase B Focus Lock (every loop)

Focus lock is mandatory.

If missing `gap_type`/`gap_subtype`, ask the user and lock one slice before discovery starts.

Question template:

1. Which `gap_type` should this loop focus on?
2. Which `gap_subtype` should this loop focus on?
3. Optional scope hints (`scene/module/path prefix`)?

Write lock result to:

- `slice-plan.json` focus history
- `progress.json.current_slice_id`

### Phase B User Handoff (mandatory)

After focus lock, always return a user-facing handoff before moving on:

1. `Focus summary`: focused `gap_type/gap_subtype` and concrete scope constraints now in effect.
2. `Next step`: what the agent will do in Phase C for this slice.
3. `Required user clues`: ask for 1-3 concrete clues/examples that anchor this slice (symbol/file/path, expected missing hop, observed runtime symptom).
4. `Quality gate`: without user clues, do not claim high-quality gap pattern output; ask user to provide clues or explicitly accept an exploratory low-confidence pass.

If the loop pauses right after Phase B, do not stop at "focus lock completed". The response must include focus + next-step + requested clues.
Do not expose `checkpoint_phase`, `current_slice_id`, or resumable shell commands in normal handoff unless the user explicitly asks for debug state.

No implicit "run all slices" behavior. Single-slice only.

### Phase B.5 Execution Readiness Gate (mandatory before C1)

Before entering C1, persist a machine-checkable "ready for execution" state.

1. Require either:
   - non-empty user clues (symbol/file/path + missing hop or runtime symptom), or
   - explicit user consent for exploratory low-confidence pass.
2. Append a readiness decision into `decisions.jsonl` with:
   - `decision_type: "phase_b_clues_confirmed"`
   - `slice_id`, `gap_type`, `gap_subtype`
   - `clue_refs` (or `exploratory_pass: true`)
3. Move focused slice to execution pointer:
   - `slice-plan.json.current_slice_id = <focused slice>`
   - `slice-plan.slices[].status: pending -> in_progress`
   - `progress.json.current_slice_id = <focused slice>`
   - `progress.json.checkpoint_phase = "phase_b_ready_for_c1"`
4. If readiness conditions are not met, set slice `blocked` with explicit reason and stop.

`next_command` text updates alone are never considered progress.

## Phase C Single-Slice Full Loop

Single-slice loop only. Do not process other slices in this phase.

### C0 Run Artifact Parity Check (mandatory before C1/C3)

Keep `gap-lab` and `rule-lab` run artifacts in sync for the same `run_id/slice_id`.

1. Validate existence of:
   - `.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json`
   - `.gitnexus/rules/lab/runs/$RUN_ID/slices/$SLICE_ID/slice.json`
2. If `rules/lab` slice artifact is missing, create/refresh it from focused slice metadata before analyze.
3. If parity cannot be established, mark slice `blocked` and stop with explicit mismatch reason.

Do not claim C1/C3 started when parity check fails.

### C1 Discovery (exhaustive semantic-first)

Discovery policy is exhaustive semantic-first + graph-missing verification:

1. **C1a repo-wide lexical universe**: scan the full repo scope for subtype pattern matches.
2. **C1b scope classification**: classify each raw match as `user_code|third_party|unknown` with explicit reason.
3. **C1c symbol resolution**: resolve candidate source/target symbols from lexical matches.
4. **C1d missing-edge verification**: verify expected synthetic edge/path is absent before inventory acceptance.

Do not rely on user clue files as exclusive search scope.
Do not use graph-only missing edges as sole discovery source.

C1 persistence uses a **balanced-slim** artifact model:

1. Persist per-candidate lifecycle rows in `slices/$SLICE_ID.candidates.jsonl` (`slice.candidates.jsonl`).
2. Keep run-level `inventory.jsonl` and `decisions.jsonl`.
3. Keep slice summary in `slices/$SLICE_ID.json`.
4. Keep no standalone universe/scope/coverage artifacts.

### C2 Candidate classification and confirmation

1. Apply confidence thresholds.
2. Append decisions to `decisions.jsonl`.
3. Mark rejected or deferred candidates with explicit `reason_code`.

### C2.6 Coverage gate (mandatory before C3)

Before C3, enforce a hard coverage gate for user-code matches:

1. Require `processed_user_matches == user_raw_matches`.
2. If coverage check fails, set slice status `blocked`, write `coverage_incomplete`, and stop.
3. C3 remains blocked on coverage_incomplete until unresolved user-code matches are resolved or explicitly waived.

### C2.5 Aggregation mode confirmation (mandatory when subtype duplicates)

After C2 and before C3, decide rule granularity for this slice.

1. Trigger condition: if current slice has `>=2` accepted candidates with the same `gap_subtype`, ask user once:
   - `per_anchor_rules`: produce one rule per source/target anchor pair.
   - `aggregate_single_rule`: merge homogeneous anchor pairs into one `rule_id`.
2. Homogeneous merge requirement: same `gap_type`, same `gap_subtype`, same suggested binding kind, and compatible binding fields.
3. If candidates are not safely mergeable, force `per_anchor_rules` and record the forcing reason.
4. Persist aggregation decision to `decisions.jsonl` with:
   - `decision_type: "rule_aggregation_mode"`
   - `gap_type`, `gap_subtype`, `aggregation_mode`
   - `candidate_ids`
   - `reason` (required when force-split is applied)

### C3 Rule generation (single slice)

Generate rule payload for selected candidates in this slice only.

Rule generation contract:

1. `aggregation_mode=per_anchor_rules`: each anchor pair maps to a distinct `rule_id` and promoted YAML file.
2. `aggregation_mode=aggregate_single_rule`: selected homogeneous anchor pairs map to one `rule_id` with merged bindings/evidence.

Suggested command:

```bash
gitnexus rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

### C4 Compile/analyze and verify

Execute compile + analyze + verification in sequence:

```bash
gitnexus rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
gitnexus rule-lab curate --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --input-path "$CURATION_JSON_PATH"
gitnexus rule-lab promote --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

Then reindex target repo with intended analyze scope/options.

### C5 Verification gates

Capture command + signal evidence for each gate:

1. Rule materialized (compiled/promoted artifact exists).
2. Analyze completed for this run.
3. Retrieval/process verification for targeted runtime chain.

Without non-empty closure evidence, do not move to `verified`/`done`.

## Phase D Persist and Stop Point

1. Update slice status in `slice-plan.json`:
   - `in_progress -> blocked|rule_generated|indexed|verified|done`
2. Update `progress.json.checkpoint_phase`.
3. Persist resumable next command hint in `progress.json.next_command`.
4. Stop after current slice and hand control back to user.

Resume guidance must continue from saved state, not restart Phase A.

## State Model

Allowed statuses:

`pending | in_progress | blocked | rule_generated | indexed | verified | done`

Transition guard:

- `verified/done` requires non-empty closure evidence array (for example
  `confirmed_chain.steps` or equivalent).

## Live Evidence Requirements

For each live run section, record:

1. `Command:` executable command.
2. `Output summary:` concrete observed output.
3. `Expected signal:` deterministic pass/fail signal to check.
4. `Decision:` PASS or FAIL.

Template-only text is invalid evidence.

## Completion Checklist (per loop)

1. Focus locked to one slice.
2. Single-slice loop completed.
3. `progress.json` checkpoint updated.
4. Resumable command produced.
5. Status transition obeys evidence gate.

## Notes

- This workflow is for offline rule authoring/orchestration.
- Query-time runtime closure remains graph-only.
- Under strict hydration fallback (`fallbackToCompact=true`), rerun parity before final closure claim.
