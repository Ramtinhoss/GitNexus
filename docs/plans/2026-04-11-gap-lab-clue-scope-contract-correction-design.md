# Gap-Lab Clue and Scope Contract Correction Design

Date: 2026-04-11  
Repo: GitNexus  
Status: Approved (brainstorming follow-up)

## 1. Problem

Real-repo execution in neonspark exposed a contract drift in the
`gitnexus-unity-rule-gen` gap-lab workflow:

1. generic subtype search seeds such as `[SyncVar(hook=` were correctly used to
   trigger repo-wide lexical discovery;
2. but later workflow steps treated example clues and inferred module focus as
   acceptance gates;
3. this caused valid repo-wide matches to be downgraded into
   `out_of_focus_scope` or `deferred_non_clue_module` even when they matched the
   active subtype and belonged to user code.

This behavior contradicts the intended exhaustive candidate accounting model for
generic subtype-driven slices.

## 2. Validated Findings

### 2.1 Current design intent already rejects clue-exclusive discovery

The existing slice-driven and exhaustive-discovery designs already state that:

1. focus lock is about `gap_type/gap_subtype`, not a single business chain;
2. user clues are optional examples;
3. discovery must start from repo-wide lexical universe and only narrow after
   classification.

### 2.2 The actual contract still leaves room for exemplar-driven filtering

The current skill and shared contract still contain ambiguous language:

1. Phase B asks for optional `scope hints (scene/module/path prefix)`;
2. Phase B handoff says clues should "anchor this slice";
3. the shared contract speaks about "active scope constraints" without
   separating explicit user overrides from inferred example locality.

These wordings allow an implementation or agent workflow to reinterpret
examples as eligibility constraints.

### 2.3 Tooling gates are too weak to catch this drift

Current `gap-lab` / `rule-lab` gates validate:

1. parity between `gap-lab` and `rules/lab` artifacts;
2. coverage counts recorded in `slice.json`.

They do not validate:

1. whether counts were derived from the full candidate universe;
2. whether exclusion reason codes are allowed under the active scope mode;
3. whether repo-wide user-code matches were excluded only for permitted reasons.

## 3. Root Cause

The root cause is a contract-modeling error, not a scanner failure.

Four distinct concepts are currently conflated:

1. `slice_focus`: which subtype family is being processed
2. `discovery_scope`: what portion of the repo is allowed to participate
3. `search_seed`: what lexical/semantic shape should be searched exhaustively
4. `validation_exemplar`: a sample proving what the shape looks like in real code

When these concepts are not separated, an example file or community can
accidentally become a filtering boundary.

## 4. Goals

1. Preserve exhaustive subtype-driven discovery for user-code matches.
2. Make example clues helpful for validation, not eligibility.
3. Make scope narrowing explicit, opt-in, and machine-auditable.
4. Prevent silent candidate loss before C3.
5. Repair the neonspark workflow so previously excluded valid matches can be
   reevaluated under the corrected contract.

## 5. Non-Goals

1. Do not remove single-slice focus lock by `gap_type/gap_subtype`.
2. Do not force all accepted candidates to be promoted in one loop.
3. Do not redesign Rule Lab command semantics.
4. Do not add new binding kinds in this correction unless later slices prove
   current kinds are insufficient.

## 6. Corrected Model

### 6.1 `slice_focus`

Definition:

1. exactly one `gap_type/gap_subtype` pair;
2. controls which detector pattern library entry is active;
3. never implies a file, module, community, or exemplar chain.

### 6.2 `discovery_scope`

Definition:

1. explicit scope policy for discovery and candidate eligibility;
2. defaults to `full_user_code`;
3. may narrow only when the user explicitly requests path/module restriction.

Allowed modes:

1. `full_user_code`
2. `path_prefix_override`
3. `module_override`
4. `exploratory_low_confidence` (quality downgrade only; not an eligibility gate)

Rule:

1. inferred community/module locality from examples must never populate
   `discovery_scope`.

### 6.3 `search_seed`

Definition:

1. lexical or semantic pattern used to generate the exhaustive candidate
   universe;
2. examples: `[SyncVar(hook=`, `.Callback +=`, `UnityEvent.AddListener(`;
3. may be user-provided or selected from the built-in subtype detector catalog.

Rule:

1. `search_seed` is for finding candidates, not for choosing which modules are
   allowed to survive C2.

### 6.4 `validation_exemplar`

Definition:

1. a sample file/symbol/path showing how the active subtype appears in practice;
2. used to confirm detector shape, naming, and post-rule verification strategy;
3. not used to exclude candidates from other modules.

Rule:

1. exemplars can improve confidence, but must never be required for exhaustive
   coverage.

## 7. Contract Corrections

### 7.1 Phase B contract

Replace the old mixed clue model with two explicit inputs:

1. `search_seeds[]`
2. `validation_exemplars[]`

And one optional override:

1. `explicit_discovery_scope_override`

Phase B handoff must state:

1. focused `gap_type/gap_subtype`;
2. whether discovery scope is the default `full_user_code` or an explicit user
   override;
3. which inputs are treated as seeds versus exemplars.

### 7.2 C1 contract

C1 must produce a complete candidate universe for the active subtype within the
active `discovery_scope`.

For `full_user_code`, valid first-pass disposition classes are:

1. `user_code`
2. `third_party`
3. `unknown`

Not allowed as C1 scope dispositions under default scope:

1. `out_of_focus_scope`
2. `non_clue_module`
3. `community_mismatch`
4. `not_example_chain`

### 7.3 C2 contract

C2 may reject or defer only for allowed semantic reasons, such as:

1. `not_user_code`
2. `handler_unresolved`
3. `edge_already_exists`
4. `parse_ambiguous`
5. `manual_reject`
6. explicit scope override mismatch when the user actually narrowed scope

Valid user-code candidates that match the subtype but are not promoted this loop
must not be encoded as rejection. They should be persisted as backlog-capable
eligible rows, for example:

1. `eligible`
2. `accepted`
3. `promotion_backlog`

### 7.4 C2.6 / C3 contract

Coverage gate semantics change from "counts match" to "counts match and all
non-promoted user-code rows use allowed dispositions".

Under default `full_user_code`, the gate must fail if any user-code row is
classified with module/example-derived exclusion reasons.

### 7.5 Artifact contract

`slice.json` remains the summary artifact, but candidate truth comes from
`slice.candidates.jsonl`.

Derived summary counts in `slice.json` must be recomputed from candidate rows,
not treated as authoritative source data.

## 8. Tooling Changes

### 8.1 Candidate audit gate

Add a pre-C3 audit that:

1. loads `slice.candidates.jsonl`;
2. recomputes `user_raw_matches`, `processed_user_matches`, and disposition
   buckets;
3. rejects disallowed reason codes for the active `discovery_scope`;
4. compares derived counts against `slice.json`;
5. blocks C3 if drift or invalid exclusions are found.

### 8.2 Reason-code whitelist by scope mode

Introduce an explicit whitelist matrix:

1. `full_user_code`: no inferred module/community exclusion codes
2. `path_prefix_override`: path mismatch codes allowed
3. `module_override`: module mismatch codes allowed
4. `exploratory_low_confidence`: quality warnings allowed, but coverage still
   accounts for all user-code candidates in active scope

### 8.3 Summary/backlog separation

Promotion choice must be represented separately from eligibility.

This prevents the workflow from using rejection buckets to emulate "not this
round".

## 9. Test Strategy

Add negative tests that fail when:

1. an exemplar from `Assets/NEON/Code/NetworkCode` causes valid `Assets/NEON/Code/Game`
   matches to be excluded under default scope;
2. a slice with generic pattern seeds but no exemplar cannot complete exhaustive
   discovery;
3. `slice.json` coverage counts pass while `slice.candidates.jsonl` contains
   disallowed exclusion reasons;
4. default-scope runs emit `deferred_non_clue_module`-style dispositions.

## 10. neonspark Run Repair Notes

1. Existing neonspark gap-lab artifacts may still use legacy candidate row
   fields such as `scope`, `lifecycle_stage`, and `reason_code`.
2. Repair verification for this correction must therefore inspect the live
   artifact field names directly instead of assuming the newer camelCase test
   fixture shape.
3. When validating this checkout against the real neonspark run, use the
   checkout-local built CLI (`node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js`)
   so the command exercises the code changed in this repo, not the globally
   installed `gitnexus` binary.

## 10. neonspark Run Repair Policy

The existing neonspark `mirror_syncvar_hook` slice results that used
`out_of_focus_scope` and `deferred_non_clue_module` cannot be treated as final.

Repair steps:

1. preserve the old artifact set for auditability;
2. rerun C1/C2 under corrected contract;
3. reclassify previously excluded user-code rows into allowed states;
4. only then decide promotion granularity via C2.5.

## 11. Acceptance Criteria

1. Generic subtype seeds produce exhaustive user-code accounting without
   exemplar-driven exclusions.
2. Example clues are persisted as exemplars or seeds, never hidden scope gates.
3. Tooling blocks invalid exclusion reason codes before C3.
4. `slice.json` summary counts match candidate-derived truth.
5. neonspark slices previously filtered by exemplar/module drift can be
   rerun and produce auditable corrected output.
