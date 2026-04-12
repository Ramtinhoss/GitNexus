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

8. Verify downstream rule-lab handoff artifacts (not only gap-lab truth).

Command:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js \
  rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js \
  rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
rg -n '"source_gap_handoff"|"accepted_candidate_ids"|"promotion_backlog_count"' \
  "$REPO_PATH/.gitnexus/rules/lab/runs/$RUN_ID/slices/$SLICE_ID/slice.json"
rg -n 'accepted_count|backlog_count|source_gap_candidate_ids' \
  "$REPO_PATH/.gitnexus/rules/lab/runs/$RUN_ID/slices/$SLICE_ID/review-cards.md"
```

Expected signal:
- downstream `rules/lab` slice summary contains `source_gap_handoff`;
- review pack explicitly shows `accepted_count`, `backlog_count`, and proposal lineage ids.

9. Enforce semantic proposal checks on downstream artifacts.

Command:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const base = '/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook';
const candidates = fs.readFileSync(path.join(base, 'candidates.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
if (candidates.length !== 2) throw new Error(`expected 2 proposal candidates, got ${candidates.length}`);
if (candidates.some((row) => !Array.isArray(row.source_gap_candidate_ids) || row.source_gap_candidate_ids.length === 0)) {
  throw new Error('proposal lineage missing source_gap_candidate_ids');
}
if (candidates.some((row) => /candidate-a|candidate-b|\.primary$|\.fallback$/.test(String(row.title || '')) || /\.primary$|\.fallback$/.test(String(row.rule_hint || '')))) {
  throw new Error('generic fallback proposals still present');
}
const curation = JSON.parse(fs.readFileSync(path.join(base, 'curation-input.json'), 'utf8'));
if (!Array.isArray(curation.curated) || curation.curated.length !== 2) {
  throw new Error('expected 2 curated proposal entries');
}
if (curation.curated.some((item) => !Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0)) {
  throw new Error('confirmed_chain.steps missing for curated proposal');
}
NODE
```

Expected signal:
- downstream artifact set proves `76 -> 2 accepted proposals + 73 backlog` with explicit proposal lineage and non-empty closure evidence.
