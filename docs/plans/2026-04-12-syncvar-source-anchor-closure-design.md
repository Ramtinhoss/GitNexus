# SyncVar Source-Anchor Closure Design

Date: 2026-04-12
Repo: GitNexus
Status: Proposed

## 1. Problem

The `gitnexus-unity-rule-gen` workflow can now do exhaustive lexical discovery
for `event_delegate_gap.mirror_syncvar_hook`, but it still does not close the
actual acceptance requirement for most user-code hits.

The user requirement is now explicit:

1. keep `method_triggers_method` as the final binding kind;
2. do not special-case or auto-promote `user_clues`;
3. for each `SyncVar(hook = nameof(handler))` candidate, statically determine
   whether the workflow can resolve:
   - the `SyncVar` field;
   - a user-code method that writes that field; and
   - the hook handler method;
4. if those anchors are resolvable, promote the candidate to `accepted`;
5. if those anchors are not resolvable, keep the candidate in
   `promotion_backlog` with a precise reason.

The neonspark slice proves the current gap:

1. exhaustive discovery found `76` user-code matches and `41` third-party
   matches;
2. only `2` candidates were accepted;
3. `73` candidates remained in `promotion_backlog`;
4. every backlog row used the same reason code:
   `missing_runtime_source_anchor`.

This means discovery is no longer the main blocker. The missing closure is the
source-anchor recovery step between lexical match resolution and accepted
classification.

## 2. Confirmed Requirement Boundary

This design intentionally excludes one previously suspected direction:

1. no new binding kind is required for `mirror_syncvar_hook`;
2. no graph schema or new code-graph edge type is required;
3. `user_clues` must remain workflow metadata and audit evidence, not an
   accepted-candidate override.

The target behavior is narrower and more concrete:

`SyncVar field write method -> hook handler` must be recoverable during the
existing `gap-lab` static analysis pipeline so the candidate can flow into the
existing `method_triggers_method` binding path.

## 3. Current State

### 3.1 What already works

`gap-lab` now covers the front half of the workflow correctly:

1. `exhaustive-scanner.ts` performs repo-wide lexical discovery for
   `mirror_syncvar_hook`;
2. scope classification correctly separates user-code from third-party hits;
3. coverage is candidate-derived rather than inferred from examples;
4. `promotion_backlog` exists as a distinct eligible state.

### 3.2 What is still missing

The current checked-in implementation stops too early:

1. `candidate-resolver.ts` extracts only the handler token from
   `hook = nameof(handler)`;
2. it does not recover the `SyncVar` field symbol;
3. it does not search for field writes;
4. it does not map field writes back to enclosing methods;
5. it therefore cannot synthesize a `source_anchor` for most
   `mirror_syncvar_hook` candidates.

`missing-edge-verifier.ts` only verifies whether a missing edge exists for a
resolved candidate. It does not participate in source-anchor recovery.

### 3.3 Why two neonspark cases were accepted

The accepted neonspark rows:

1. `MirrorBattleMgr.CreateNetPlayer -> NetPlayer.ChangeRoomGrid`
2. `NetPlayer.GameOverInDead -> NetPlayer.OnDeadChange`

already have complete `source_anchor` and `target_anchor` pairs in the slice
artifact, so they can be expressed as `method_triggers_method`.

The problem is not that the model cannot represent these cases. The problem is
that the checked-in generic workflow does not contain the logic that can recover
those anchors for the rest of the slice.

## 4. Goals

### G-01 Recover source anchors during `gap-lab`

Extend `mirror_syncvar_hook` candidate analysis so accepted promotion depends on
actual static recovery of `field write method -> handler`.

### G-02 Preserve the existing binding model

Keep downstream rule generation on `method_triggers_method` with no new binding
kind.

### G-03 Produce auditable candidate outcomes

Make candidate status and reason codes explain exactly why a user-code hit was
accepted, backlogged, or rejected.

### G-04 Keep user clues out of promotion logic

A candidate must be accepted because anchors are statically resolvable, not
because it appears in `user_clues`.

### G-05 Preserve downstream visibility

`rule-lab` artifacts must continue to show how many candidates were accepted,
backlogged, and rejected by concrete reason code after source-anchor recovery is
implemented.

## 5. Non-Goals

This design does not:

1. add a new `UnityResourceBinding` kind;
2. make `user_clues` a search-scope override or promotion override;
3. infer runtime-only writes that have no user-code write site;
4. solve every indirect assignment pattern in the first iteration;
5. redesign query-time runtime closure.

## 6. Design Alternatives

### Option A: New SyncVar-specific binding kind

Represent `SyncVar -> handler` directly as a new binding type.

Pros:

1. avoids source-method recovery;
2. matches Mirror terminology more directly.

Cons:

1. does not satisfy the confirmed requirement;
2. increases binding/model surface area;
3. does not help existing `method_triggers_method` curation flow.

Rejected.

### Option B: Promote only manually confirmed exemplar cases

Keep exhaustive discovery, but only promote cases already confirmed by user
examples or hand-curated anchors.

Pros:

1. low implementation effort;
2. reproduces the current two accepted cases.

Cons:

1. not generalizable;
2. creates hidden workflow favoritism around examples;
3. does not close the actual automation gap.

Rejected.

### Option C: Add static source-anchor recovery inside `gap-lab`

Recover the field symbol, scan for field writes, map writes to enclosing
methods, and accept only candidates with complete `source_anchor` and
`target_anchor`.

Pros:

1. directly satisfies the confirmed requirement;
2. keeps the existing `method_triggers_method` binding path;
3. improves accepted coverage without changing external rule semantics;
4. keeps clue handling neutral.

Cons:

1. requires a new static-analysis stage for `mirror_syncvar_hook`;
2. needs ambiguity handling for multiple write methods;
3. needs tighter handoff/review summaries to make outcomes inspectable.

Chosen.

## 7. Chosen Design

## 7.1 Candidate lifecycle change

For `mirror_syncvar_hook`, the candidate pipeline becomes:

1. lexical discovery;
2. scope classification;
3. handler resolution;
4. field and host resolution;
5. field-write source-anchor recovery;
6. missing-edge verification;
7. classification into `accepted`, `promotion_backlog`, or rejected buckets.

The new closure point is step 5.

## 7.2 Mirror SyncVar candidate shape

The `mirror_syncvar_hook` resolver must retain more than just `handlerSymbol`.

Required resolved metadata:

1. `host_class_name`
2. `field_name`
3. `handler_symbol`
4. `handler_anchor`
5. `decl_anchor`
6. zero or more `source_anchor_candidates`

This metadata remains internal to `gap-lab` candidate analysis. The downstream
binding contract does not change.

## 7.3 Static source-anchor recovery

For each resolved `mirror_syncvar_hook` hit:

1. locate the declaring type and the `SyncVar` field;
2. identify the hook handler symbol from `nameof(handler)`;
3. search the host type and its partial-class siblings for writes to that
   field;
4. map each write occurrence back to its enclosing method;
5. normalize each enclosing method into a candidate `source_anchor`.

The first implementation only needs to cover direct user-code write patterns:

1. `field = expr`
2. `this.field = expr`
3. `instance.field = expr` when `instance` is statically known to be the host
   type or a host-type variable

Out of scope for the first iteration:

1. reflection;
2. generated code;
3. writes hidden behind arbitrary helper chains;
4. writes that can only be inferred from runtime behavior.

## 7.4 Accepted gate

`mirror_syncvar_hook` should use an explicit anchor-completeness gate.

Accept the candidate when all of the following are true:

1. scope is `user_code`;
2. handler symbol is resolvable;
3. exactly one stable source method is recovered;
4. both source and target anchors map to concrete method symbols;
5. missing-edge verification still confirms the edge is absent.

Classify as `promotion_backlog` when the candidate is valid but not promotable:

1. `missing_runtime_source_anchor`
2. `ambiguous_source_anchor`
3. `unresolved_host_type`
4. `unresolved_field_symbol`

Reject when the candidate is invalid for promotion:

1. `third_party_scope_excluded`
2. `unresolvable_handler_symbol`
3. `edge_already_present`

This keeps `promotion_backlog` separate from hard rejection.

## 7.5 No user-clue branching

`user_clues` remain:

1. readiness evidence;
2. operator context;
3. audit metadata in slice artifacts.

They must not:

1. upgrade backlog to accepted;
2. bypass ambiguity checks;
3. narrow discovery scope;
4. short-circuit source-anchor recovery.

This removes the risk of hidden example favoritism and makes the accepted gate
purely semantic.

## 7.6 Downstream handoff requirements

Once source-anchor recovery is implemented, downstream artifacts must expose the
result cleanly.

Required handoff behavior:

1. `gap-handoff.ts` must preserve reject counts by actual `reason_code`, not
   collapse them by status only;
2. `promotion_backlog_count` must continue to come from candidate truth rather
   than generic slice summaries when candidate rows are available;
3. `rules/lab/.../review-cards.md` must show the post-recovery reduction:
   - user raw matches
   - accepted count
   - backlog count
   - reject buckets by reason

This does not change which candidates are promoted. It makes the outcome
auditable after the new recovery stage lands.

## 8. File-Level Changes

### 8.1 `gitnexus/src/gap-lab/candidate-resolver.ts`

Extend `mirror_syncvar_hook` handling to:

1. parse the `SyncVar` field declaration context;
2. retain host type + field metadata;
3. resolve handler method anchor;
4. emit richer resolved candidates for the next stage.

### 8.2 New `gitnexus/src/gap-lab/syncvar-source-anchor-recovery.ts`

Add a dedicated recovery module that:

1. enumerates candidate field writes;
2. maps writes to enclosing methods;
3. returns zero, one, or many source-anchor candidates with reason metadata.

Keeping this logic in a dedicated module avoids overloading the lexical
resolver.

### 8.3 `gitnexus/src/gap-lab/*` orchestration

Wire the new recovery stage into the `mirror_syncvar_hook` candidate pipeline
before classification/acceptance.

### 8.4 Candidate row schema in `gap-lab`

Ensure candidate rows can persist:

1. `reason_code`
2. `source_anchor`
3. `target_anchor`
4. optional `source_anchor_candidates`
5. optional recovery diagnostics for ambiguous or unresolved cases

The exhaustive candidate file remains the semantic truth source.

### 8.5 `gitnexus/src/rule-lab/gap-handoff.ts`

Fix candidate summarization so reject buckets are keyed by concrete
`reason_code`, not only by lifecycle status.

### 8.6 `gitnexus/src/rule-lab/review-pack.ts`

Keep using the accepted-handoff model, but make sure rendered review cards
surface the preserved reason buckets and backlog counts.

## 9. Static Analysis Contract

## 9.1 Input assumptions

The first implementation assumes:

1. the field declaration is in user C# code;
2. the handler is written as `hook = nameof(MethodName)`;
3. the enclosing type can be resolved from the declaration file and partial
   siblings;
4. direct field writes are detectable from syntax.

## 9.2 Deterministic recovery rules

To avoid speculative promotion, the recovery stage must be deterministic:

1. no source method recovered -> backlog
2. one source method recovered -> accepted candidate path can continue
3. more than one distinct source method recovered -> backlog with
   `ambiguous_source_anchor`

This is stricter than “some write exists,” but it prevents low-confidence
promotion into a single `method_triggers_method` rule.

## 9.3 Cross-file partial class support

`SyncVar` fields and hook methods may be declared in one partial file while the
write method exists in another.

The recovery stage must search:

1. the declaring file;
2. sibling files for the same partial class;
3. user-code files that reference a host-type instance and directly assign the
   field.

The accepted neonspark examples show both shapes:

1. same-host method write;
2. external writer method assigning through a typed host instance.

## 10. Verification Strategy

### V-01 Unit coverage for recovery

Add unit tests that prove:

1. direct assignment on the host class resolves one source method;
2. assignment through `this.field` resolves one source method;
3. assignment through a typed host instance resolves one source method;
4. no write site yields `missing_runtime_source_anchor`;
5. multiple write methods yield `ambiguous_source_anchor`.

### V-02 Integration coverage on neonspark slice

Re-run `event_delegate_gap.mirror_syncvar_hook` and verify:

1. the two known accepted cases remain accepted;
2. accepted promotion is driven by recovered anchors, not clue membership;
3. backlog rows now separate missing vs ambiguous recovery outcomes if both
   occur;
4. review cards preserve exact reject buckets and backlog count.

### V-03 Negative assertions

The verification must explicitly reject fake closure:

1. accepted candidates without `source_anchor.symbol` are invalid;
2. accepted candidates without `target_anchor.symbol` are invalid;
3. candidates appearing in `user_clues` but lacking source recovery must remain
   backlog or rejected;
4. review cards that collapse all rejects into `{ "rejected": N }` are invalid.

## 11. Risks and Mitigations

### Risk R-01: Too many candidates remain ambiguous

If a field is written from many methods, accepted coverage may improve only
partially.

Mitigation:

1. preserve `ambiguous_source_anchor` as a first-class backlog reason;
2. inspect frequency after neonspark re-run before broadening heuristics.

### Risk R-02: Overly loose instance-write matching

`instance.field = expr` can over-match if instance typing is weak.

Mitigation:

1. require static host-type evidence before accepting instance writes;
2. backlog uncertain matches rather than accepting them.

### Risk R-03: Handoff summaries obscure recovery gains

If reject/backlog reasons stay collapsed downstream, users will not see whether
source-anchor recovery actually helped.

Mitigation:

1. fix reason-bucket preservation in `gap-handoff.ts`;
2. treat review-card reason fidelity as part of the closure criteria.

## 12. Success Criteria

This design is complete when all of the following are true:

1. `mirror_syncvar_hook` candidates are accepted only through resolved
   `source_anchor -> target_anchor` method pairs;
2. `method_triggers_method` remains the only downstream binding needed for this
   slice;
3. `user_clues` do not affect promotion outcomes;
4. backlog rows distinguish unresolved recovery from hard rejection;
5. downstream review artifacts show an auditable reduction from discovered hits
   to accepted rules.

## 13. Recommended Follow-On

After this design is accepted:

1. write an implementation plan focused on the new recovery stage and the
   handoff summary fix;
2. implement the recovery logic first;
3. rerun the neonspark slice before any broader workflow refactor.
