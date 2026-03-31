# Phase 4 Persisted Lifecycle Process Report

## Summary

`neonspark-core` was re-analyzed with both lifecycle flags enabled, and persisted lifecycle process artifacts are now discoverable via `Process.processSubtype` and `STEP_IN_PROCESS` step evidence (`reason`/`confidence`).

## Phase Comparison

| Dimension | Phase 3 (query-time only) | Phase 4 (persisted) |
| --- | --- | --- |
| Lifecycle process identity | Inferred at response time | Stored on `Process` (`processSubtype`, `runtimeChainConfidence`) |
| Step evidence | Derived/flattened at query time | Stored on `STEP_IN_PROCESS` (`reason`, `confidence`) |
| Cypher discoverability | No durable lifecycle subtype filter | `MATCH (p:Process) WHERE p.processSubtype = 'unity_lifecycle'` |
| Legacy compatibility | `summary/process_type/step_count` | Preserved (no legacy field removals) |

## Graph Shape

Phase 4 keeps the same graph model: `Process` nodes + `STEP_IN_PROCESS` relations.  
No parallel Unity-only node/edge type was introduced.

## Verdict

- Discoverability: **pass** (`unity_lifecycle` persisted count > 0, sampled count: 8).
- Durability: **pass** (runtime-root chain stores step-level reason/confidence in graph).
- Compatibility: **pass** (legacy query fields remain present; `backwardCompat.regressionDetected=false`).
