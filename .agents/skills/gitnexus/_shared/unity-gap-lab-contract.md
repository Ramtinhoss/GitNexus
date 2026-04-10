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
