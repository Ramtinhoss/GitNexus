# neonspark Run Repair Checklist

Date: 2026-04-11
Repo under repair: `/Volumes/Shuttle/projects/neonspark`
Run ID: `gaplab-20260411-104710`
Slice ID: `event_delegate_gap.mirror_syncvar_hook`
Validation CLI for this checkout: `node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js`

## Purpose

Repair a legacy gap-lab slice that still contains default-scope user-code
rejections such as `out_of_focus_scope`, preserve the original artifact set, and
verify that candidate-derived coverage plus closure evidence remain enforced.

## Checklist

1. Archive the original run before any repair action.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
RUN_DIR="$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID"
cp -R "$RUN_DIR" "$RUN_DIR.pre-contract-fix"
```

Expected signal:
- backup directory exists at `"$RUN_DIR.pre-contract-fix"`.

2. Confirm the baseline artifact still contains invalid default-scope user-code exclusions.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
rg -n '"scope": "user_code"|\"reason_code\": "(out_of_focus_scope|deferred_non_clue_module)"' \
  "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"
```

Expected signal:
- at least one `scope: "user_code"` row is paired with `reason_code: "out_of_focus_scope"` or `deferred_non_clue_module"`.

3. Inspect summary coverage fields before repair.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
rg -n '"user_raw_matches"|"processed_user_matches"|"status"|"reason"|"confirmed_chain"' \
  "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"
```

Expected signal:
- the slice summary shows current coverage values and still exposes closure evidence fields for later verification.

4. Re-run slice analysis with the checkout-local CLI after reclassification or artifact repair.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js \
  rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

Expected signal:
- before repair, this command may block on `candidate_audit_drift` and surface stale semantics;
- after repair, it completes without `candidate_audit_drift` or `coverage_incomplete`.

5. Confirm invalid default-scope reason codes are gone after repair.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
if rg -n '"reason_code": "(out_of_focus_scope|deferred_non_clue_module)"' \
  "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"; then
  exit 1
else
  exit 0
fi
```

Expected signal:
- no invalid default-scope reason codes remain in the repaired candidate artifact.

6. Verify candidate-derived coverage and backlog-style states directly from the candidate rows.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
rg -n '"scope": "user_code"|"lifecycle_stage": "rejected"|"lifecycle_stage": "promotion_backlog"|"reason_code":' \
  "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"
```

Expected signal:
- user-code candidates are accounted for with valid lifecycle states, and any backlog-style rows are distinct from rejection reasons.

7. Re-check the summary after repair and confirm closure evidence still gates completion.

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
rg -n '"processed_user_matches"|"user_raw_matches"|"coverage_incomplete"|"candidate_audit_drift"|"confirmed_chain"|"steps"' \
  "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"
```

Expected signal:
- summary counts align with the repaired candidate artifact;
- no stale `coverage_incomplete` / `candidate_audit_drift` remains for the repaired path;
- `confirmed_chain` and non-empty `steps` remain required before `verified` / `done`.
