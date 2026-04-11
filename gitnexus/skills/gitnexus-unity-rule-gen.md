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

## Phase C Single-Slice Full Loop

Single-slice loop only. Do not process other slices in this phase.

### C1 Discovery (semantic-first)

Discovery policy is semantic-first + graph-missing verification:

1. Semantic detection proposes expected linkage candidates.
2. Graph verification proves expected edge/path is currently missing.
3. Only then append candidate into `inventory.jsonl`.

Do not use graph-only missing edges as sole discovery source.

### C2 Candidate classification and confirmation

1. Apply confidence thresholds.
2. Append decisions to `decisions.jsonl`.
3. Mark rejected candidates with explicit reason.

### C3 Rule generation (single slice)

Generate rule payload for selected candidates in this slice only.

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
