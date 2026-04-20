# Graph-Only Unity Runtime Retrieval Design

Date: 2026-04-07  
Status: Draft accepted in discussion

## 1. Problem Reframing

The target changed from:
- case-driven rule verification ("user-provided runtime clue can be closed")

to:
- static-gap closure verification ("runtime gaps missed by static analysis can be closed deterministically")

Therefore, retrieval should no longer depend on retrieval/verification rule matching.

## 2. Locked Decisions

1. Primary retrieval entry is seeded/symbol-based, not natural language.
2. Quality bar is precision-first (`verified_full` false positives must be minimized).
3. Retrieval verifier input should be structured anchors only:
   - `symbolName`
   - `resourceSeedPath`
   - `mappedSeedTargets`
   - `resourceBindings`
4. `queryText` is removed as verifier matching signal.
5. Final direction is graph-only retrieval verification.
6. Migration target is one-shot cutover, but only after a PoC gate.
7. Metadata policy is split:
   - online retrieval: no rule dependency
   - offline governance: provenance retained in standalone evaluation artifacts (not query-time dependency)

## 3. Scope and Non-Goals

### In Scope

- Remove retrieval-time dependency on `retrieval_rules` and `verification_rules`.
- Keep rules as analyze-time gap-patch definitions only.
- Make closure decisions from graph evidence chain instead of rule match identity.
- Keep strong explainability via evidence anchors and deterministic failure reasons.

### Out of Scope

- End-user natural-language runtime closure at retrieval stage.
- Runtime data-flow execution proof (dynamic execution truth).
- Immediate redesign of all external output contracts in one step.

## 4. Architecture

### 4.1 Analyze Layer (Rule-Build Time Only)

- Rule families remain build-time constructs for synthetic edge injection.
- Analyze writes synthetic edges that represent static-gap patch closure opportunities.
- Retrieval will not load or match rule files.

### 4.2 Online Retrieval Layer (Graph-Only)

#### Input Contract

- Required primary anchors come from agent-produced structured inputs.
- `queryText` is not used for verifier matching.

#### Candidate Graph Extraction

- Build bounded neighborhood from anchors:
  - resource/file nodes
  - guid mapping edges
  - component/script binding edges
  - synthetic + static call edges

#### Closure Model

Evaluate closure by four evidence segments:
1. `Anchor` (seed/symbol grounded)
2. `Bind` (resource-to-code binding evidence)
3. `Bridge` (gap-bridging synthetic/static transition)
4. `Runtime` (continuous call chain reaching target neighborhood)

#### Decision Policy (Precision-First)

- `verified_full`: only if all 4 segments are satisfied with deterministic anchors.
- `verified_segment` / `clue`: partial evidence only.
- No `verified_full` when anchor intersection is missing.

#### Ranking and Noise Handling

Use graph-evidence ranking only:
- anchor coverage
- continuity
- evidence strength
- conflict penalty for global/ubiquitous edges

No token-trigger ranking in retrieval verifier.

### 4.3 Offline Governance Layer (Standalone Provenance Artifacts)

- Keep provenance outside online retrieval dependency path.
- Use standalone artifacts for:
  - regression tracking
  - conflict attribution
  - patch family drift detection

This preserves operational diagnosability without coupling runtime retrieval to rule metadata.

## 5. Output Semantics

- Shift from "rule matched and verified" to "gap closure evidence satisfied".
- Runtime output should prioritize:
  - closure status
  - evidence level
  - hop anchors
  - actionable gaps
- Rule identity fields can be reduced or removed from online surface as compatibility plan permits.

## 6. PoC Design (Mandatory Before Cutover)

### 6.1 Benchmark Set

Build seeded/symbol benchmark buckets by gap type:
- lifecycle
- resource field load
- event response
- scene load
- method bridge

### 6.2 Comparison Method

Run same benchmark on:
- current pipeline
- graph-only retrieval verifier

Compare:
1. `verified_full` false-positive rate (primary)
2. status consistency (`verified_full/segment/clue/failed`)
3. evidence anchor overlap and explainability quality

### 6.3 Cutover Gate

Cutover allowed only when:
1. `verified_full` false positives are not worse than baseline
2. no P0 regression in critical seeded/symbol chains
3. all failures are attributable to explicit gap categories

## 7. Migration Plan Shape

1. Implement graph-only verifier in shadow mode.
2. Produce PoC report against frozen benchmark set.
3. If gate passes, one-shot switch to graph-only retrieval verifier.
4. Keep offline provenance artifact workflow for post-cutover governance.

## 8. Tradeoff Summary

- Full metadata removal everywhere is possible but harms long-term regression diagnosability.
- Selected design keeps retrieval pure and decoupled while preserving offline quality governance.
- This is the best fit for large-repo atomic gap-patch strategy: broad coverage, lower maintenance overhead, and stable retrieval behavior.
