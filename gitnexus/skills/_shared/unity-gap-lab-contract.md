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

## Control Policy

- Focus lock is mandatory before discovery when `gap_type/gap_subtype` are missing.
- Each loop executes one slice only; no implicit run-all-slices behavior.
- Discovery is semantic-first; graph is used for missing-edge verification and
  closure verification, not as the sole discovery source.
- Before C1, readiness must be persisted as machine-checkable state
  (`phase_b_clues_confirmed` decision + `current_slice_id` pointer + `in_progress` status).
- Updating `progress.json.next_command` text alone is not a valid phase transition.
- `gap-lab` and `rules/lab` artifacts for the same `run_id/slice_id` must be kept in parity before C1/C3.

## User-Facing Handoff Contract

After Phase B focus lock, the agent must return a handoff block to the user
that includes:

- focus summary (gap_type/gap_subtype + active scope constraints);
- immediate next step in Phase C;
- explicit request for user clues needed to keep candidate quality high;
- quality gate warning when clues are missing.

A "focus lock completed" message without focus + next-step + clue request
is contract-incomplete.

Default user handoff should avoid internal state dumps (`checkpoint_phase`,
`current_slice_id`) and resumable shell commands unless the user explicitly
asks for debug/recovery details.
