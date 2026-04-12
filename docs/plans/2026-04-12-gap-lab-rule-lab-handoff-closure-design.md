# Gap-Lab to Rule-Lab Handoff Closure Design

Date: 2026-04-12
Repo: GitNexus
Status: Proposed

## 1. Problem

The 2026-04-10 and 2026-04-11 gap-lab iterations fixed the front half of the
workflow:

1. slice focus is subtype-driven rather than business-chain-driven;
2. exhaustive lexical discovery and candidate-derived coverage are enforced;
3. default `full_user_code` scope no longer allows exemplar/module-driven
   rejection reasons;
4. valid non-promoted user-code matches can be preserved as
   `promotion_backlog`.

However, the full user requirement is still not closed.

The missing closure is the handoff from `gap-lab` exhaustive candidate truth to
the downstream `rule-lab analyze -> review-pack -> curate -> promote` chain.

In the current implementation:

1. `gap-lab` records the exhaustive candidate universe and accepted/backlog
   decisions;
2. but `rule-lab analyze` still generates a generic two-row topology candidate
   set from `rules/lab/.../slice.json`;
3. `review-pack` reviews those generic rows rather than the accepted gap
   anchors;
4. multi-candidate slices rely on curation payloads to restore missing anchor
   specificity;
5. users cannot see a machine-auditable reduction from
   `full candidate universe -> accepted subset -> rule proposals`.

This creates the exact neonspark confusion we observed:

1. `gap-lab` can correctly account for `76` user-code matches;
2. `73` of them can be valid backlog;
3. but the visible `rules/lab/.../candidates.jsonl` still only contains `2`
   generic proposal rows with no explicit lineage to the exhaustive universe.

## 2. Design Intent From Prior Iterations

The previous designs already establish these boundaries:

1. `gap-lab` owns slice-driven exhaustive discovery and candidate accounting.
2. `slice.candidates.jsonl` is the semantic truth source for coverage.
3. `promotion_backlog` is an eligible state, not a rejection bucket.
4. `rule-lab` command semantics remain `discover -> analyze -> review-pack ->
   curate -> promote -> regress`.

What is still missing is an explicit contract for how accepted gap candidates
become downstream rule proposals without losing the rest of the candidate
universe.

## 3. Goals

### G-01 Close the handoff

Make `rule-lab analyze` consume accepted `gap-lab` candidate truth instead of
manufacturing placeholder `primary/fallback` candidates.

### G-02 Preserve auditable reduction

Allow a slice to legitimately reduce from `N` discovered user-code matches to
`M` accepted anchors and finally to `K` rule proposals, but require that this
reduction be explicit and machine-readable.

### G-03 Keep backlog visible

Do not duplicate the full exhaustive universe into rule proposal files, but do
persist backlog and reject summaries in the downstream artifact set so users can
see what was accepted, what stayed eligible, and what was rejected.

### G-04 Make aggregation decisions executable

If C2.5 records `per_anchor_rules` or `aggregate_single_rule`, downstream rule
generation must actually follow that decision.

### G-05 Make multi-candidate slices first-class

Remove remaining single-candidate assumptions from `curate` and adjacent
artifacts so slices with multiple accepted candidates flow naturally end-to-end.

## 4. Non-Goals

This design does not:

1. duplicate all `gap-lab` candidate rows into final rule proposal artifacts;
2. redesign query-time runtime closure (still graph-only);
3. move exhaustive discovery logic into `rule-lab`;
4. change the public `rule-lab` command surface;
5. require every backlog candidate to be promoted in the same loop.

## 5. Current Implementation Gaps

### 5.1 Generic `rule-lab analyze` output

`gitnexus/src/rule-lab/analyze.ts` currently:

1. reads only `rules/lab/.../slice.json`;
2. derives `required_hops` from the generic slice shape;
3. emits exactly two topology candidates: `primary` and `fallback`.

It does not read:

1. `gap-lab ... slice.candidates.jsonl`;
2. `selected_candidates`;
3. `classification_buckets`;
4. `coverage_gate`;
5. `rule_aggregation_mode` decisions.

### 5.2 Review cards are detached from accepted anchors

`gitnexus/src/rule-lab/review-pack.ts` only reads
`rules/lab/.../candidates.jsonl`, so review cards inherit the placeholder
topology candidates rather than real accepted anchor pairs.

### 5.3 Multi-candidate curation still has a single-draft remnant

`gitnexus/src/rule-lab/curate.ts` allows multiple curated items, but only writes
the first one to `dsl-draft.json`.

### 5.4 Accepted-to-curation handoff is not a formal stage

There is no implemented contract that automatically turns accepted gap
candidates plus aggregation choice into a normalized curation input.

The current flow can succeed only if curation artifacts are manually or
implicitly patched to recover the anchor-specific semantics.

## 6. Chosen Model

## 6.1 Two distinct candidate layers

This design keeps two candidate layers and makes the boundary explicit:

1. `gap-lab candidates`
   - exhaustive discovery truth;
   - includes accepted, backlog, and rejected dispositions;
   - coverage truth source.
2. `rule-lab proposal candidates`
   - downstream rule-authoring proposals only;
   - derived from accepted gap candidates plus aggregation choice;
   - never silently substitute for the exhaustive candidate universe.

The system must stop pretending these two layers are the same thing.

## 6.2 Proposal cardinality rule

For each slice:

1. let `A` be the accepted gap candidates;
2. let `G` be the grouping implied by `aggregation_mode`;
3. `rule-lab analyze` emits one proposal candidate per group in `G`.

Examples:

1. `per_anchor_rules` with two accepted anchors -> two proposal candidates;
2. `aggregate_single_rule` with three merge-compatible anchors -> one proposal
   candidate with three source references.

This means a final proposal file having `2` rows can be correct, but only if
the artifact also records exactly which accepted anchors produced those `2`
proposals and what happened to the rest of the universe.

## 6.3 Mandatory lineage contract

Every rule proposal candidate must include lineage metadata back to `gap-lab`.

Minimum fields:

```json
{
  "id": "proposal-...",
  "proposal_kind": "per_anchor_rule",
  "source_gap_candidate_ids": ["ffa5ad257aa7"],
  "source_slice_id": "event_delegate_gap.mirror_syncvar_hook",
  "aggregation_mode": "per_anchor_rules",
  "binding_kind": "method_triggers_method",
  "draft_rule_id": "unity.event....v1"
}
```

If the proposal is aggregated, `source_gap_candidate_ids` contains all accepted
members in that group.

## 6.4 Mandatory slice-level handoff summary

`rules/lab/.../slice.json` must carry a derived handoff summary copied from
`gap-lab` truth.

Proposed shape:

```json
{
  "source_gap_handoff": {
    "run_id": "gaplab-...",
    "slice_id": "event_delegate_gap.mirror_syncvar_hook",
    "discovery_scope_mode": "full_user_code",
    "user_raw_matches": 76,
    "processed_user_matches": 76,
    "accepted_candidate_ids": ["ffa5ad257aa7", "157ddbce6e30"],
    "promotion_backlog_count": 73,
    "reject_buckets": {
      "third_party_excluded": 41,
      "unresolvable_handler_symbol": 1
    },
    "aggregation_mode": "per_anchor_rules"
  }
}
```

This summary is the required machine-readable explanation for why proposal
cardinality may be much smaller than the exhaustive candidate universe.

## 6.5 Auto-generated curation input

`rule-lab analyze` must auto-generate `curation-input.json` from proposal
candidates and their handoff lineage.

That generated file becomes the canonical editable handoff into `curate`.

Properties:

1. one curated item per proposal candidate;
2. anchor-specific `resource_bindings` derived from the accepted gap anchors;
3. non-empty `confirmed_chain.steps` copied from slice-local evidence;
4. no manual reconstruction of accepted anchors should be required.

## 6.6 Multi-draft contract

For multi-candidate slices:

1. `curated.json` remains the canonical curated payload;
2. `dsl-drafts.json` is added as the canonical multi-draft artifact;
3. legacy `dsl-draft.json` may be written only when the slice has exactly one
   curated item, or as a compatibility alias pointing to the first draft with
   an explicit warning field.

The system must stop encoding multi-candidate slices through a single-draft
side artifact.

## 7. Stage Semantics

## 7.1 Gap-lab C2 / C2.5

Unchanged ownership:

1. candidate acceptance and backlog decisions remain owned by `gap-lab`;
2. aggregation choice remains decided at C2.5;
3. coverage gate remains owned by `gap-lab`.

New requirement:

1. accepted candidate ids and aggregation decision become mandatory inputs to
   downstream `rule-lab analyze`.

## 7.2 Rule-lab Analyze

New responsibilities:

1. read `source_gap_handoff` from `gap-lab`;
2. load accepted candidate rows from `gap-lab slice.candidates.jsonl`;
3. validate `processed_user_matches == user_raw_matches` before proposal build;
4. build one proposal candidate per aggregation group;
5. persist proposal candidates with lineage fields;
6. write `source_gap_handoff` into `rules/lab slice.json`;
7. generate `curation-input.json` from proposals.

Removed behavior:

1. no generic `primary/fallback` placeholder pair when accepted anchors are
   available.

## 7.3 Review-Pack

New responsibilities:

1. render cards from proposal candidates rather than placeholder topology rows;
2. include source gap candidate ids and draft rule ids;
3. include slice-level handoff summary:
   - user raw count
   - accepted count
   - backlog count
   - reject bucket summary
   - aggregation mode
4. make proposal reduction explicit in the review artifact.

## 7.4 Curate

New responsibilities:

1. preserve all curated items into `curated.json`;
2. emit `dsl-drafts.json` for all curated items;
3. reject any implicit first-item truncation for multi-candidate slices.

## 7.5 Promote

Promotion remains per curated item, but the design requires:

1. all curated items produce compiled rules;
2. proposal lineage remains traceable back to accepted gap candidates;
3. the promoted output is consistent with the proposal count implied by
   aggregation mode.

## 8. Artifact Contract

## 8.1 Gap-lab artifacts

No ownership change:

1. `.gitnexus/gap-lab/runs/<run_id>/slices/<slice_id>.json`
2. `.gitnexus/gap-lab/runs/<run_id>/slices/<slice_id>.candidates.jsonl`
3. `.gitnexus/gap-lab/runs/<run_id>/inventory.jsonl`
4. `.gitnexus/gap-lab/runs/<run_id>/decisions.jsonl`

## 8.2 Rule-lab artifacts

Retained files:

1. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/slice.json`
2. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/candidates.jsonl`
3. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/review-cards.md`
4. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/curation-input.json`
5. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/curated.json`

New or corrected semantics:

1. `candidates.jsonl` = proposal candidates with lineage, not placeholder
   topology pair;
2. `slice.json` = proposal summary plus `source_gap_handoff`;
3. `curation-input.json` = auto-generated from proposal candidates;
4. `dsl-drafts.json` = multi-candidate curated draft set.

## 9. Migration and Real-Run Repair Policy

Legacy runs may still have:

1. corrected `gap-lab` candidate truth;
2. but stale `rules/lab` proposal artifacts built from the old generic analyze
   path.

Repair policy:

1. keep the repaired `gap-lab` candidate truth;
2. rerun `rule-lab analyze` after the new handoff implementation lands;
3. regenerate `review-pack` and `curation-input.json`;
4. require that the resulting `rules/lab` artifact set explicitly shows the
   `universe -> accepted -> proposal` reduction.

## 10. Acceptance Criteria

### AC-01 Handoff closure

For a multi-accepted slice, `rule-lab analyze` consumes accepted `gap-lab`
candidates and emits lineage-bearing proposal candidates.

### AC-02 Auditable reduction

`rules/lab slice.json` shows the exact candidate reduction:

1. user raw matches;
2. processed matches;
3. accepted candidate ids;
4. backlog count;
5. reject buckets;
6. aggregation mode.

### AC-03 Proposal-level review

`review-pack` shows proposal candidates and lineage rather than placeholder
generic topology pairs.

### AC-04 Multi-candidate integrity

`curate` and `promote` do not silently drop the second or later curated item.

### AC-05 Real-repo proof

On neonspark `event_delegate_gap.mirror_syncvar_hook`, the final artifact set
must make it explicit that:

1. `76` user-code matches were processed;
2. `2` accepted anchors became rule proposals;
3. `73` valid matches remained backlog;
4. the reduction is visible in downstream `rules/lab` artifacts without manual
   hidden reconstruction.

## 11. Design Clauses

### DC-01

`gap-lab slice.candidates.jsonl` remains the exhaustive truth source; downstream
artifacts may derive from it but must not replace it.

### DC-02

`rule-lab analyze` must consume accepted gap candidates and aggregation mode,
not synthesize generic placeholder candidates when accepted anchors exist.

### DC-03

The reduction from exhaustive universe to rule proposals must be machine-audited
in `rules/lab slice.json` and review artifacts.

### DC-04

`review-pack` must present proposal candidates with source lineage rather than
detached topology placeholders.

### DC-05

Multi-candidate curation artifacts must preserve all curated items and must not
collapse to a first-draft-only side file.

### DC-06

Real-run neonspark verification must prove the final artifact set, not only the
`gap-lab` truth file, satisfies the closed-loop contract.
