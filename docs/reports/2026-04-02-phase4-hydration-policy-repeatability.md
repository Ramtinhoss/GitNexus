# Phase 4 Hydration Policy Repeatability

- Generated: 2026-04-02T02:11:00.123Z
- Repo: `GitNexus`
- Warmup env: `GITNEXUS_UNITY_PARITY_WARMUP=off`

## Repeatability

- `repeatability.fast`: `consistent=true`, `runCount=3`, `mismatchCount=0`
- `repeatability.balanced`: `consistent=true`, `runCount=3`, `mismatchCount=0`
- `repeatability.strict`: `consistent=true`, `runCount=3`, `mismatchCount=0`

## Contract Checks

- `missing_evidence_contract.requiresArray`: `true`
- `missing_evidence_contract.populatedWhenIncomplete`: `true`
- `contractCompatibility.needsParityRetryRetained`: `true`

## Policy Mapping

- `fast`: `compact`
- `balanced`: `compact` + `parity_on_missing_evidence`
- `strict`: `parity`, fallback downgrade to `verified_partial/verified_segment`
