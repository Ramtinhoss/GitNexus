# Unity Runtime Process Contract

Use this contract when analysis touches Unity runtime process semantics (runtime chain, lifecycle/loader stitching, or confidence-based closure).

## Trigger Conditions

Load this contract when any of the following is true:

- Query/debug/impact/refactor task requires Unity runtime process closure.
- Result contains Unity process evidence with `confidence` interpretation.
- Result has empty `processes` but Unity resource evidence is present.
- User asks for runtime-chain verification quality or closure certainty.

## Required Workflow

1. Run `query/context` with `unity_resources: "on"` and `unity_hydration_mode: "compact"` first.
2. If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"` before conclusions.
   - `hydration_policy` precedence is authoritative:
     - `fast` forces `compact`
     - `strict` forces `parity`
     - `balanced` uses requested `unity_hydration_mode` and may escalate to parity on missing evidence
   - Always inspect `hydrationMeta.requestedMode/effectiveMode/reason` when explaining behavior.
3. Do not conclude "no runtime chain" from empty `processes` alone.
4. If Unity evidence exists, continue stitching:
   - `processes`
   - `resourceBindings`
   - asset/meta mapping anchors
   - runtime candidate symbols
5. Treat low-confidence rows as unresolved unless `verification_hint` includes:
   - `action`
   - `target`
   - `next_command`
6. Semantic closure requires hop anchors/evidence anchors for each stitched step.

## Optional Strong Verification

For Reload-focused confirmation, request on-demand verification:

- pass `runtime_chain_verify: "on-demand"` in MCP tools, or
- use CLI `--runtime-chain-verify on-demand`.

When on-demand verification is used, report `runtime_chain.status`, `evidence_level`, `hops`, and `gaps` before final risk/closure statements.

## Rule Registry Boundary Contract

1. Runtime claim rule loading must stay inside target repo `rulesRoot` and must not use ancestor fallback.
2. Missing catalog/rule files should be treated as diagnosable configuration gaps and surfaced as `rule_not_matched` at claim level.
3. `next_action` strings must be quote-safe and shell-parseable.
