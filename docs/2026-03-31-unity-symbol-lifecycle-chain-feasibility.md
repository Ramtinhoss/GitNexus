# Unity Symbol Lifecycle Chain Feasibility

Date: 2026-03-31
Owner: Codex
Status: Updated after hydration runtime wiring fix verification

## Goal

Assess whether GitNexus can output accurate runtime-effective Unity lifecycle invocation chains for arbitrary symbols via `process/context/query`.

## Baseline Reference

Manual verification workflow:

- `docs/2026-03-30-neonspark-manual-verification-workflow.md`

That workflow still requires YAML + `.meta` serialized-truth verification after GitNexus narrowing.

## Implementation Delta Since Initial Judgment

The previously identified runtime contract gap for `unity_resources` / `unity_hydration_mode` is now fixed and verified.

Related closure docs:

- `docs/2026-03-31-unity-resources-hydration-risk-investigation.md` (status: fixed)
- `docs/reports/2026-03-31-unity-resources-hydration-runtime-fix-verification.md`

Runtime wiring commits:

- `e9d7e24` (`context` runtime hydration wiring)
- `f991a11` (`query` runtime hydration wiring + benchmark gate)
- `0f526ae` (class UID hydration detection + query symbol-evidence gate robustness)

## Current Capability Snapshot (Actual Implementation)

### 1. `process` is call-graph heuristic, not Unity lifecycle model

`process` generation uses:

- entry-point heuristics
- `CALLS` graph BFS
- dedupe and labeling

Core file:

- `gitnexus/src/core/ingestion/process-processor.ts`

Implication:

- produced flows are useful code-relationship traces, but not guaranteed to match runtime Unity lifecycle entry and dispatch semantics.

### 2. `context/query` Unity hydration runtime contract is now effective

Verified behavior on real indexed Unity repo (`neonspark`):

- `context --unity-resources off` returns base shape only.
- `context --unity-resources on --unity-hydration compact` returns Unity payload fields:
  - `resourceBindings`
  - `serializedFields`
  - `unityDiagnostics`
  - `hydrationMeta`
- `context --unity-hydration parity` returns `hydrationMeta.effectiveMode=parity` and `isComplete=true` on sampled symbol.
- `query --unity-resources on` now attaches symbol-level Unity fields when available (observed in `definitions` for sampled `AssetRef` query on this index).

Core files:

- `gitnexus/src/mcp/local/local-backend.ts`
- `gitnexus/src/mcp/local/unity-runtime-hydration.ts`

Verification/gate coverage:

- `npm --prefix gitnexus run test:u3:gates` passed (`48/48`)
- `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/*.test.js gitnexus/dist/benchmark/u2-e2e/*.test.js` passed (`62/62`)

### 3. `process` resources still expose lightweight process trace info

Resources provide:

- process name/type/step count
- ordered step symbol + file

File:

- `gitnexus/src/mcp/resources.ts`

No Unity serialized lifecycle-chain explanation is attached to `process` output itself.

### 4. Unity ingestion still emphasizes summary relations + query-time hydration expansion

Unity resource ingestion persists summary-oriented relations (`UNITY_RESOURCE_SUMMARY`) and relies on query-time hydration orchestration to expand payload when requested.

Files:

- `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- `gitnexus/src/mcp/local/unity-runtime-hydration.ts`

## Feasibility Judgment

### Can existing output already satisfy the goal?

Not fully.

Current implementation can now provide runtime-effective Unity resource evidence in `context/query`, but still does not provide a first-class Unity lifecycle-semantic invocation chain model.

### Can GitNexus be extended toward this goal?

Yes, with targeted work.

Practical direction:

1. build lifecycle-aware entry/dispatch modeling (Awake/Start/Update/OnEnable, scene/prefab instantiation semantics, event-driven edges);
2. project lifecycle chain artifacts as first-class output (not only generic process traces);
3. combine static call graph + serialized resource truth + confidence scoring in final chain output;
4. keep query-time hydration contract gates to prevent runtime drift regressions.

## Main Constraints to Keep in Mind

1. Unity dynamic behaviors (reflection, SendMessage-style, inspector injection) will remain partial for purely static analysis.
2. "Arbitrary symbol, fully accurate lifecycle chain" should be treated as high-confidence/medium-confidence tiered output, not binary perfect output.
3. manual YAML/.meta verification remains the gold standard for contested chains until full parity is built.

## Current Validation Summary

- Hydration contract gap: closed and verified.
- Lifecycle-chain semantics gap: still open.
- Therefore, next phase should focus on lifecycle modeling and confidence-tier output design, not on hydration runtime rewiring.
