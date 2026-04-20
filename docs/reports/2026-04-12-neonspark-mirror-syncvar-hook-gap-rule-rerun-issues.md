# 2026-04-12 NeonSpark `mirror_syncvar_hook` Gap-Lab -> Rule-Lab Rerun Issues

## Scope

- Repo under test: `/Volumes/Shuttle/projects/neonspark`
- Run ID: `gaplab-20260411-104710`
- Slice ID: `event_delegate_gap.mirror_syncvar_hook`
- Workflow: `gap-lab` single-slice rerun -> `rule-lab analyze/review-pack/curate/promote` -> forced `gitnexus analyze -f`
- Goal: rerun the full `event_delegate_gap.mirror_syncvar_hook` loop from a clean pre-C1 state and verify that promoted rules materialize synthetic `CALLS` edges.

## Executive Summary

This rerun exposed five independent problems:

1. The run could not be safely resumed without manual artifact reset because stale `gap-lab` and `rule-lab` outputs still claimed the slice had already advanced to C4.
2. The prior loop had incorrectly treated two `SyncVar(hook=...)` examples as validation exemplars instead of search seeds, which collapsed accepted candidates to zero.
3. Aggregate proposal generation produced an overlong `rule_id`, causing `rule-lab promote` to fail with `ENAMETOOLONG`.
4. CLI/operator guidance drift exists: `gitnexus analyze --repo-path ...` is invalid on the installed 1.5.0 CLI, which accepts `gitnexus analyze [path]`.
5. After a successful `promote`, the rule still failed C5 verification: no synthetic `CALLS` edges were materialized for accepted anchor pairs, even after forced reindex. The promoted/compiled rule metadata was rewritten into a degraded form that does not match the successful `mirror_synclist_callback` rule pattern.

The slice was therefore left in `blocked` state at C5 rather than being marked verified/done.

## Detailed Issues

### 1. Stale run artifacts made rerun unsafe by default

#### Observed state

- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/progress.json` still pointed to:
  - `checkpoint_phase = phase_c4_promoted`
  - `current_slice_id = event_delegate_gap.mirror_syncvar_hook`
- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook.candidates.jsonl` still existed from the previous run.
- `/.gitnexus/rules/lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook/` still contained:
  - `candidates.jsonl`
  - `curation-input.json`
  - `curated.json`
  - `dsl-draft.json`
  - `dsl-drafts.json`
  - `review-cards.md`
  - `slice.json`

#### Impact

Without reset, the run would appear to have already passed through C1-C4, which invalidates the contract for a true rerun from pre-C1.

#### Required manual repair

The rerun required an explicit rewind to `phase_b_ready_for_c1`, deletion of the stale slice candidates, and cleanup of all downstream `rule-lab` outputs for this slice.

### 2. Seed vs exemplar semantics were previously wrong

#### Incorrect prior behavior

The earlier loop used these two paths as effective exemplars:

- `Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs:26`
- `Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.EnterRoom.cs:28`

Those examples are only valid as `search_seeds` for `SyncVar(hook=...)` discovery, not as `validation_exemplars` that restrict which accepted candidates survive classification.

#### Failure mode

Under the exemplar-only interpretation, the previous classification result became:

- `accepted_candidate_ids = []`
- `promotion_backlog_count = 73`
- blocked reason: `No accepted candidates remain after graph-missing verification of the provided validation exemplars.`

#### Corrected behavior in this rerun

After restoring the correct semantics, the slice returned to the expected candidate distribution:

- raw matches: `117`
- user-code matches: `76`
- accepted: `29`
- promotion backlog: `46`
- reject buckets:
  - `third_party_scope_excluded = 38`
  - `handler_symbol_unresolved = 4`

### 3. Interrupted `gap-lab run` left a zero-byte candidates file

#### Observed state

An aborted `gitnexus gap-lab run` left:

- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook.candidates.jsonl`
- size: `0 bytes`

#### Impact

This is a misleading partial artifact. It looks like C1 output exists, but contains no usable rows and does not reflect a completed slice execution.

#### Required operator handling

The empty file had to be deleted before rerunning the slice.

### 4. Aggregate proposal `rule_id` generation can exceed filesystem limits

#### Observed failure

The first `rule-lab promote` attempt failed with:

```text
Error: ENAMETOOLONG: name too long, open '.../.gitnexus/rules/approved/<very-long-rule-id>.yaml'
```

The generated aggregate `rule_id` concatenated all accepted anchor pairs into one enormous slug.

#### Impact

- `promote` fails before writing the approved YAML.
- The failure is independent of rule semantics; it is a filesystem/path-generation bug.

#### Temporary workaround used during this run

The proposal had to be renamed to a short stable ID:

- `unity.event.mirror-syncvar-hook.v1`

Only after shortening the `rule_id` did `promote` succeed.

### 5. CLI documentation/operator contract drift for `analyze`

#### Observed behavior

The installed GitNexus 1.5.0 CLI rejected:

```bash
gitnexus analyze --repo-path /Volumes/Shuttle/projects/neonspark
```

with:

```text
error: unknown option '--repo-path'
```

#### Actual accepted syntax

```bash
gitnexus analyze /Volumes/Shuttle/projects/neonspark
gitnexus analyze -f /Volumes/Shuttle/projects/neonspark
```

#### Impact

Any workflow, skill, or runbook that tells operators to use `gitnexus analyze --repo-path ...` will fail on this CLI build.

### 6. `promote`/compiled rule output is semantically degraded for this aggregate rule

#### Expected shape

The successful reference rule
`approved/unity.event.netplayer-initpowerup-synclist-callback.v1.yaml`
contains:

- rich `match.trigger_tokens`
- `symbol_kind: [Method]`
- path-based `module_scope`
- complete `resource_bindings` entries with:
  - `source_class_pattern`
  - `source_method`
  - `target_class_pattern`
  - `target_method`

#### Actual promoted output for `unity.event.mirror-syncvar-hook.v1`

The approved YAML was rewritten to:

- `trigger_tokens: [event_delegate]`
- `symbol_kind: [method]`
- `module_scope: [event_delegate_gap.mirror_syncvar_hook]`

And the YAML-visible `resource_bindings` block collapsed to repeated entries of only:

```yaml
- kind: method_triggers_method
```

with no source/target fields shown in the file.

#### Important nuance

The compiled JSON bundles still preserved full `resource_bindings`, but they also preserved the degraded `match` metadata:

- `compiled/analyze_rules.v2.json`
- `compiled/retrieval_rules.v2.json`
- `compiled/verification_rules.v2.json`

all carried:

- `trigger_tokens = ["event_delegate"]`
- `symbol_kind = ["method"]`
- `module_scope = ["event_delegate_gap.mirror_syncvar_hook"]`

instead of the stronger path/symbol shape used by the known-good synclist rule.

### 7. C5 verification failed: no synthetic edges materialized after forced analyze

#### Verification attempts

After successful `promote`, the workflow ran:

```bash
gitnexus analyze -f /Volumes/Shuttle/projects/neonspark
```

multiple times.

#### Validation queries that still returned no rows

Representative checks:

- `DestructableDoor.SyncParentBindingData -> DestructableDoor.OnParentKeyChanged`
- `GiftChest.SetSourceNetId -> GiftChest.OnSourceNetIdChanged`
- any edge with reason containing `unity.event.mirror-syncvar-hook.v1`

All returned `[]`.

#### Why this matters

This means the rule materialized only as a file/bundle artifact, not as runtime-usable graph edges. Under the workflow contract, that is a hard C5 failure:

- rule materialized: `pass`
- analyze completed: `pass`
- retrieval closure: `fail`

#### Final run state

The slice remained:

- status: `blocked`
- checkpoint: `phase_c5_blocked_no_materialization`

with failure persisted back into:

- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/progress.json`
- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/slice-plan.json`
- `/.gitnexus/gap-lab/runs/gaplab-20260411-104710/decisions.jsonl`

## Evidence Snapshot

### Gap-Lab rerun outcome

- `rowsWritten = 117`
- accepted candidates: `29`
- backlog candidates: `46`
- rejected: `42`

### Rule-Lab outcome

- `analyze`: passed
- `review-pack`: passed
- `curate`: passed
- `promote`: first failed with `ENAMETOOLONG`, then passed after shortening `rule_id`

### Post-promote analyze outcome

- `gitnexus analyze -f /Volumes/Shuttle/projects/neonspark`: passed
- graph verification for representative accepted bindings: failed

## Root-Cause Hypotheses

1. Aggregate-rule promotion is deriving low-fidelity `match` metadata from slice-level defaults instead of preserving proposal-level match refinements.
2. Aggregate-rule approved YAML serialization is lossy for `method_triggers_method` bindings, at least in the human-readable YAML output path.
3. The analyzer/materializer likely depends on the degraded `match` metadata and therefore never applies the otherwise-correct bindings.
4. The workflow currently lacks a guard that compares promoted aggregate rules against a known-good rule shape before C5.

## Recommended Fixes

1. Fix `rule-lab promote` so aggregate proposals preserve proposal-authored `match` fields instead of falling back to:
   - `trigger_tokens = [event_delegate]`
   - `symbol_kind = [method]`
   - `module_scope = [slice_id]`
2. Add a regression test for aggregate `method_triggers_method` rules that asserts:
   - short/stable rule IDs
   - no filesystem path overflow
   - promoted YAML retains full `match` fidelity
   - forced analyze materializes at least one known synthetic edge
3. Add a promote-time lint for aggregate `rule_id` length before filesystem write.
4. Update skill/runbook guidance so `SyncVar(hook=...)` clue refs are described as `search_seeds`, not implicit exemplars.
5. Update CLI docs/skills to use the actual 1.5.0 syntax:
   - `gitnexus analyze [path]`
   - not `gitnexus analyze --repo-path [path]`

## Suggested Follow-Up Work Items

1. Reproduce the aggregate-rule degradation in a focused unit/integration test under the GitNexus repo.
2. Trace the `promote` pipeline that transforms proposal `match` into approved/compiled rule metadata.
3. Compare the serialization path of:
   - `unity.event.netplayer-initpowerup-synclist-callback.v1`
   - `unity.event.mirror-syncvar-hook.v1`
4. Add a C5 regression test that uses one accepted `mirror_syncvar_hook` binding pair and requires a concrete synthetic `CALLS` edge after `analyze -f`.
