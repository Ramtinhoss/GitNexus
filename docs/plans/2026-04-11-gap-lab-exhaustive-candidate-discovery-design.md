# Gap-Lab Exhaustive Candidate Discovery Design

Date: 2026-04-11  
Repo: GitNexus  
Status: Approved (brainstorming)

## 1. Problem

Current `gitnexus-unity-rule-gen` C1/C2 flow is clue-driven and can stop at a
partial set of candidates. For generic user clues (for example
`[SyncVar(hook=nameof(...))]`), this leads to missed files/symbols before C3.

Observed gap:

1. Rule generation consumes C1/C2 outputs and does not re-run exhaustive source discovery.
2. There is no mandatory candidate-universe coverage gate before C3.
3. Users cannot see why some matches were excluded.

## 2. Goal

When users provide generic subtype patterns, the workflow must:

1. discover exhaustive lexical matches in repository scope,
2. classify every match with explicit disposition,
3. block C3 unless user-code matches are fully processed,
4. keep artifact set compact and readable.

## 3. Non-Goals

1. Do not redesign Rule Lab command semantics (`analyze/review-pack/curate/promote` remain).
2. Do not guarantee semantic perfection from lexical signals alone.
3. Do not force third-party/vendor code into final rule generation.

## 4. Chosen Strategy

Chosen approach: **Lexical Exhaustive + Scope Classification + Symbol/Graph Verification**.

Pipeline:

1. `C1a` Universe Scan (repo-wide textual pattern search by subtype).
2. `C1b` Scope Classification (`user_code`, `third_party`, `unknown`) with reason codes.
3. `C1c` Anchor Resolve for `user_code` matches (source/target symbol extraction).
4. `C1d` Missing Verification (graph proof that expected edge is absent).
5. `C2` Candidate classification + confidence policy.
6. Coverage Gate before C3.

## 5. Scope and Tooling

### 5.1 Discovery scope

1. Start from repository-wide `*.cs` scan for subtype pattern universe.
2. Classify and narrow after scan; do not pre-restrict by user-given file hints.

### 5.2 Tools

1. Text discovery: `rg`.
2. Symbol/graph verification: GitNexus `context`/`cypher`.
3. Rule pipeline: existing `rule-lab` commands.

### 5.3 Practical performance (neonspark sample)

1. `[SyncVar(hook=nameof(...))]` repo-wide scan: sub-second.
2. `.Callback +=` repo-wide scan: sub-second.
3. Main cost is per-candidate symbol and graph verification, not lexical scan.

## 6. Coverage and Quality Policy

## 6.1 Candidate state model

Each match transitions through one of:

1. `raw_match`
2. `classified`
3. `resolved`
4. `accepted`
5. `rejected`
6. `deferred`

## 6.2 Required reason codes

1. `not_user_code`
2. `handler_unresolved`
3. `edge_already_exists`
4. `parse_ambiguous`
5. `pattern_mismatch`
6. `manual_reject`

## 6.3 Gate before C3

C3 entry requires:

1. `coverage_user = processed_user_matches / user_raw_matches = 100%`
2. All `rejected/deferred` items carry explicit reason codes.
3. `gap-lab` and `rules/lab` artifacts are in parity for `run_id/slice_id`.

If any gate fails, slice becomes `blocked` with concrete failure reasons.

## 7. Artifact Simplification (Balanced Slim)

To avoid file explosion, keep same-stage artifacts merged.

Per-slice:

1. `slices/<slice_id>.json`
2. `slices/<slice_id>.candidates.jsonl`

Global run:

1. `inventory.jsonl` (accepted-only pool)
2. `decisions.jsonl` (human + auto decisions)

Not added as separate files:

1. `universe.jsonl`
2. `scope-classification.jsonl`
3. `coverage.json`

Their information is embedded into `slice.json` and `slice.candidates.jsonl`.

## 8. Data Flow

1. User gives subtype pattern clue.
2. C1a scans all candidate text matches.
3. C1b classifies each match and records reason/evidence.
4. C1c resolves symbols for user-code matches.
5. C1d validates missing edges in graph.
6. C2 decides accepted/rejected/deferred with confidence policy.
7. Coverage gate validates completeness.
8. C2.5 asks aggregation mode when duplicate subtype candidates exist.
9. C3/C4 generate and promote rules via Rule Lab.
10. C5 validates rule materialization + analyze + retrieval/process evidence.

## 9. Accuracy, Coverage, Efficiency Expectations

1. Coverage: user-code lexical matches are fully accounted for (100% processed).
2. Precision: controlled by symbol resolution + missing-edge checks + C2 review.
3. Efficiency: lexical scan cost stays low; verification cost scales with candidate count.

## 10. Failure Handling

1. Invalid pattern expression: fail fast with actionable message.
2. Resolver ambiguity: mark `deferred`, require human confirmation.
3. Coverage shortfall: block C3 and emit unresolved list.
4. Parity mismatch (`gap-lab` vs `rules/lab`): block until reconciled.

## 11. Acceptance Criteria

1. Generic subtype clues produce exhaustive user-code candidate accounting before C3.
2. No silent drop of lexical matches.
3. Every excluded match has a machine-readable reason.
4. Users can trace from clue -> raw match -> decision -> rule.
5. Artifact count remains compact (balanced slim model).
