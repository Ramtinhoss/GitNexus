# Handoff: `family` and `trigger_tokens` Semantics

Date: 2026-04-07
Status: Archived after graph-only cutover (2026-04-08)

> 2026-04-08 update:
> Query-time runtime closure no longer depends on `verification_rules` / `trigger_tokens` matching.
> `verification_rules` remains for offline governance/report workflows; `retrieval_rules` remains for next-hop hint selection.
> This document is historical context only; current implementation semantics are defined by `docs/unity-runtime-process-source-of-truth.md`.

## 1. Why This Exists

This handoff captures the high-value context from the current discussion so a later session can continue without re-deriving how `family` and `trigger_tokens` actually behave in the current codebase.

Scope:

- what `family` means
- where `trigger_tokens` is consumed
- whether `trigger_tokens` affects analyze-time edge injection
- whether `trigger_tokens` is still needed after analyze-time synthetic edge stability improved
- what a future refactor direction could look like

## 2. Current Fact Summary

### 2.1 `family` Means Execution Stage Ownership

`family` is not a business taxonomy field. It tells the system which stage consumes the rule.

Current effective families:

- `analyze_rules`
  - used during indexing to inject synthetic `CALLS` edges
- `verification_rules`
  - used for offline governance/report workflows (not query-time closure matching)
- `retrieval_rules`
  - used for retrieval-side `next_hops` / `next_action` hint selection

Key code:

- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:283)
- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:376)
- [local-backend.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:452)
- [compiled-bundles.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/compiled-bundles.ts:5)

### 2.2 `trigger_tokens` Does Not Drive Analyze-Time Injection

Important conclusion:

- `trigger_tokens` is parsed from YAML and preserved in rule objects
- but analyze-time rule injection does not read it

Analyze-time path:

- `pipeline.ts` calls `loadAnalyzeRules()`
- `loadAnalyzeRules()` returns rules
- `applyUnityRuntimeBindingRules()` injects edges based on `resource_bindings` and `lifecycle_overrides`

`applyUnityRuntimeBindingRules()` does not inspect `match.trigger_tokens`.

Key code:

- [pipeline.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/pipeline.ts:522)
- [unity-runtime-binding-rules.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:83)
- [unity-runtime-binding-rules.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:116)

Implication:

- a rule can inject correct synthetic edges even if `trigger_tokens` is poor
- `trigger_tokens` quality does not determine whether analyze-time graph stitching succeeds

### 2.3 Historical Note: `trigger_tokens` Previously Drove Rule Recall at Retrieval Time

Before graph-only cutover, verifier architecture was:

1. select a candidate rule from active rules
2. then query graph edges for that rule ID

The rule-selection stage uses `trigger_tokens` as the first gate.

In `scoreRuntimeClaimRule()`:

- haystack includes `queryText`, `resourceSeedPath`, `symbolName`, `symbolFilePath`, `mappedSeedTargets`, and `resourceBindings.resourcePath`
- at least one `trigger_token` must match or the rule gets `-Infinity`
- only then do `host_base_type`, `resource_types`, and `module_scope` contribute boost scores

Key code:

- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:159)

After a rule is selected, verifier checks graph edges by `ruleId`:

- `r.reason CONTAINS $ruleId`
- `r.reason STARTS WITH 'unity-rule-'`

Key code:

- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:84)
- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:237)

Current status (2026-04-08):

- query-time verifier uses graph-only closure from structured anchors
- `trigger_tokens` no longer gates query-time runtime claim closure

### 2.4 Historical Fallback if `trigger_tokens` Was Missing

If `match.trigger_tokens` is empty, verifier falls back to tokenizing `trigger_family`.

Key code:

- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:164)
- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:76)

Current status (2026-04-08):

- this text-match fallback is no longer on the query-time runtime claim path

### 2.5 Secondary Retrieval Use

`trigger_tokens` is also used by retrieval-side hint selection, not only runtime claim verification.

`pickRetrievalRuleHintFromBundle()` uses:

- `trigger_tokens`
- `host_base_type`
- `resource_types`

to rank retrieval rules for `next_hops` / `next_action`.

Key code:

- [local-backend.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:468)

### 2.6 Build/Promotion Semantics

`trigger_tokens` also participates in rule construction metadata:

- `promote.ts` derives `trigger_family` from `match.trigger_tokens[0]`
- `compile.ts` writes `trigger_tokens` into compiled bundles

Key code:

- [promote.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:106)
- [promote.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:147)
- [compile.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/compile.ts:43)

Implication:

- `trigger_tokens` is part of rule identity metadata in practice
- but still not an analyze-time matching input

## 3. Answer to the Design Question

### 3.1 Is `trigger_tokens` Designed to Reduce Retrieval Noise / Improve Ranking?

Yes, in the current code that is effectively its primary job.

More precisely:

- it reduces noise at the rule-selection layer
- it does not reduce noise by directly filtering graph edges
- it prevents verifier from trying every rule equally

### 3.2 After Analyze-Time Stability Is Fixed, Is `trigger_tokens` Still Needed?

Under the current architecture: yes.

Reason:

- analyze-time edge stability solves "are the right synthetic edges present in the graph"
- it does not solve "which rule should verifier try for this query"

Current verifier still performs:

- rule recall first
- graph verification second

So stable synthetic edges do not eliminate the need for a rule recall signal.

### 3.3 Could Symbol/Edge-Driven Selection Replace It?

Potentially yes, but that would require a verifier architecture change.

The design idea raised in discussion is valid:

- if agent already knows the target symbol and relevant resource seed
- and if graph already contains stable `unity-rule-*` edges
- then verifier could start from graph evidence around the symbol/resource and derive candidate `ruleId`s

That would change the flow from:

- current: `query -> rule recall by tokens -> graph verification by ruleId`

to:

- possible future: `query/symbol/seed -> graph candidate edges -> candidate ruleIds -> metadata ranking`

Under that future architecture, `trigger_tokens` could become:

- a weak ranking signal
- or even optional in some paths

But that is not how current code works.

## 4. Current Risks and Tradeoffs

### 4.1 Risks if `trigger_tokens` Stays Mandatory

- query phrasing drift can cause `rule_not_matched` even when graph edges exist
- users may misdiagnose retrieval mismatch as analyze failure
- rule authoring quality remains sensitive to human naming choices

### 4.2 Risks if `trigger_tokens` Is Removed Without Refactor

- verifier loses its primary first-stage rule gate
- fallback pressure moves to `trigger_family`
- multiple rules in the same symbol domain become harder to disambiguate
- current implementation will not automatically switch to a graph-first candidate strategy

## 5. Recommended Next Direction

If this area is revisited, the likely high-value redesign is:

1. Keep `family` unchanged.
2. Keep `trigger_tokens` for backward compatibility.
3. Add a graph-first candidate path in verifier:
   - use target symbol, seed path, mapped seed targets, and nearby `unity-rule-*` edges
   - derive candidate `ruleId`s from existing synthetic edges
   - then use `trigger_tokens` only as a secondary ranking signal
4. Preserve current token-based path as fallback for broad natural-language queries.

That would reduce dependency on text phrasing while still keeping rule metadata useful.

## 6. Useful One-Line Conclusion

Current as-built semantics:

- `family` decides which stage consumes a rule
- `trigger_tokens` mainly decides whether retrieval can choose that rule
- analyze-time synthetic edge injection does not depend on `trigger_tokens`
