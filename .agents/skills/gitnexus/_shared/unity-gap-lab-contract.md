# Unity Rule Authoring Contract (Post-Rollback)

## Scope

This contract defines the stable authoring expectations for
`gitnexus-unity-rule-gen` after gap-lab rollback.

`gap-lab` naming is retained in this filename for compatibility only.

## Workflow Position

1. `gap-lab` is deprecated as the primary product workflow.
2. Default authoring path is reduced `rule-lab` for sparse irregular gaps.
3. Query-time runtime closure remains graph-only.

## Input Schema

Each authoring item must be an exact source/target pair (or explicit pair set):

- `source_class`
- `source_method`
- `target_class`
- `target_method`
- `expected_missing_hop` (short text)

If multiple anchors match, user must select the intended anchor explicitly.
Auto-guessing ambiguous anchors is forbidden.

## Mandatory Guards

1. Duplicate-prevention:
   - Block proposals already covered by `.gitnexus/rules/approved/*.yaml`.
2. Fail-closed binding resolution:
   - Unresolved bindings block progress.
   - `UnknownClass` / `UnknownMethod` placeholders are forbidden.
3. Non-empty evidence before promote:
   - `confirmed_chain.steps` (or equivalent) must be non-empty.

## Artifact Expectations

Primary artifacts are under `.gitnexus/rules/lab/runs/<run_id>/...`.

`gap-lab/runs/**` may exist as legacy migration state, but is not required for
new reduced-rule-lab loops and must not be treated as a required parity gate.

## Event/Delegate Boundary

Event/delegate system-wide coverage is analyzer-native scope:

- capture `assignment_expression` (`+=`, `-=`)
- index delegate/action field symbols
- capture generic event-type metadata (`Raise<T>` / `Listen<T>`)

Rule authoring is only for sparse, explicitly scoped residual gaps.

## Verification Contract

1. Promote only after mandatory guards pass.
2. Verify using analyze + `query/context` retrieval evidence.
3. Under `hydration_policy=strict` with `fallbackToCompact=true`, parity rerun
   is required before final closure conclusion.
