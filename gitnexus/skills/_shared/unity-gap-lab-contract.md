# Unity Gap-Lab Contract

## Scope

This contract defines the stable schema and persistence expectations for the
`gitnexus-unity-rule-gen` gap-lab slice-driven workflow.

## Taxonomy Schema

Each gap candidate record must include all required taxonomy fields:

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

## Slice Status Model

Allowed slice status values are fixed to:

`pending|in_progress|blocked|rule_generated|indexed|verified|done`

State changes to `verified` or `done` require non-empty closure evidence
(e.g. `confirmed_chain.steps` or equivalent non-empty closure evidence array).

## Persistence Schema

Every run must persist resumable artifacts under:

```
.gitnexus/gap-lab/runs/<run_id>/
  manifest.json
  slice-plan.json
  progress.json
  inventory.jsonl
  decisions.jsonl
  slices/
    <slice_id>.json
```

Responsibilities:

- `manifest.json`: run metadata + `patterns_version` + `pattern_snapshot_hash`
- `slice-plan.json`: slice statuses, priorities, and focus history
- `progress.json`: current slice + checkpoint phase + resumable next command hint
- `inventory.jsonl`: append-only gap candidates
- `decisions.jsonl`: user confirmation/rejection decisions
- `slices/<slice_id>.json`: slice-local evidence, generated rules, verification outcome
- `slices/<slice_id>.candidates.jsonl`: per-candidate lifecycle (`raw_match`, `resolved`, `rejected`, `deferred`, `accepted`) with `reason_code` on non-accepted rows

## Control Policy

Contract terms:

- `slice_focus`: selected `gap_type/gap_subtype` for the active loop.
- `discovery_scope`: repo search scope for C1; default is `full_user_code`.
- `search_seeds`: optional user hints that accelerate exhaustive discovery.
- `validation_exemplars`: optional example matches used to validate/refine candidate quality after discovery.
- `explicit_discovery_scope_override`: explicit user-selected narrowing mode; allowed values are `full_user_code`, `path_prefix_override`, and `module_override`.

- Focus lock is mandatory before discovery when `gap_type/gap_subtype` are missing.
- Each loop executes one slice only; no implicit run-all-slices behavior.
- Discovery is semantic-first; graph is used for missing-edge verification and
  closure verification, not as the sole discovery source.
- Discovery must be exhaustive before C3: C1a lexical universe -> C1b scope
  classification -> C1c symbol resolution -> C1d missing-edge verification.
- Discovery execution order is performance-first: run lexical prefilter before
  semantic parsing; avoid full-repo Python file walks as first action.
- C2 must emit fixed classification buckets (`third_party_excluded`,
  `unresolvable_handler_symbol`, `accepted`) to avoid hit-count ambiguity.
- User clues can provide `search_seeds` and `validation_exemplars`, but are not exclusive search scope and must not redefine `discovery_scope` by example locality alone.
- Inferred exemplar/module/community locality must not narrow scope; only `explicit_discovery_scope_override` may replace the default `full_user_code` discovery scope.
- Before C1, readiness must be persisted as machine-checkable state
  (`phase_b_clues_confirmed` decision + `current_slice_id` pointer + `in_progress` status).
- Updating `progress.json.next_command` text alone is not a valid phase transition.
- `gap-lab` and `rules/lab` artifacts for the same `run_id/slice_id` must be kept in parity before C1/C3.
- Coverage gate before C3 is mandatory and candidate-derived: `slice.candidates.jsonl` is the semantic source of truth, while `slice.json.coverage_gate` is derived state.
- Coverage gate requires `processed_user_matches == user_raw_matches`; summary/candidate drift or invalid default-scope exclusion reasons (`out_of_focus_scope`, `deferred_non_clue_module`) must block with `candidate_audit_drift`.
- Otherwise slice status is `blocked` with reason `coverage_incomplete`.
- Artifact model is balanced-slim: keep `slice.json`, `slice.candidates.jsonl`,
  `inventory.jsonl`, and `decisions.jsonl`; no standalone universe/scope/coverage artifacts.
- `promotion_backlog` is an eligible candidate state, not a rejection reason; backlog choice must stay separate from validity.
- For `method_triggers_method`, C3 pre-generation lint is mandatory:
  class patterns must not use `Class:...` symbol-id shape; method fields must be
  plain names (no regex-anchor form like `^...$`).
- Timeout handling: after performance-first narrowing, retry once with shard/narrow scope;
  if still timed out, persist explicit `blocked` reason and do not advance to C2/C3.

## User-Facing Handoff Contract

After Phase B focus lock, the agent must return a handoff block to the user
that includes:

- focus summary (gap_type/gap_subtype + active scope constraints);
- explicit mention of `slice_focus`, `discovery_scope`, optional `search_seeds`, and optional `validation_exemplars`;
- immediate next step in Phase C;
- explicit request for user clues needed to keep candidate quality high;
- quality gate warning when clues are missing.

A "focus lock completed" message without focus + next-step + clue request
is contract-incomplete.

Default user handoff should avoid internal state dumps (`checkpoint_phase`,
`current_slice_id`) and resumable shell commands unless the user explicitly
asks for debug/recovery details.
