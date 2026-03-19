# Analyze Memory Reduction Rollout Summary

## Baseline and Tier Results

- Baseline (from plan/subproject doc): analyze `141.47s`, RSS `6.38GB`.
- Tier 1 (runtime peak reduction): analyze `246.06s`, RSS `5.96GB`; DoorObj cold/warm `1.72s/1.72s`, RSS `0.87GB/0.87GB`.
- Tier 2 (Unity graph slimming): analyze `125.61s`, RSS `6.55GB`; DoorObj cold/warm `2.44s/2.42s`, RSS `0.98GB/0.94GB`.
- Tier 3 (summary-only + query-time hydration): analyze `117.19s`, RSS `5.78GB`; DoorObj cold/warm `0.94s/0.93s`, RSS `0.55GB/0.54GB`; AssetRef (uid) `0.60s`, RSS `0.55GB`.

## Decision

- Final decision: keep Tier 3 summary-only persistence.
- Reason 1: Tier 3 improves analyze wall time and peak RSS versus Tier 2 (`-8.42s`, `-777MB`).
- Reason 2: Default query contract updated to `compact` with explicit completeness metadata (`hydrationMeta`), so callers can deterministically decide whether to retry in `parity`.
- Reason 3: Parity path now supports analyze-time seed fast path + parity cache, reducing repeat parity latency.

## Default Compact + Parity Retry Contract

- Default mode is `compact`; response must include `hydrationMeta`.
- `hydrationMeta.needsParityRetry=true` means result is incomplete and should be retried in `parity`.
- `hydrationMeta.needsParityRetry=false` is allowed in compact mode when result is already complete (`isComplete=true`).
- Explicit `parity` mode must return `hydrationMeta.isComplete=true` or fail closed to compact with fallback diagnostics.

## Latest Hydration Gate Snapshot (2026-03-15)

- Report: `gitnexus/docs/reports/2026-03-15-unity-hydration-gates.json`
- DoorObj default compact:
  - `effectiveMode=compact`
  - `isComplete=true`
  - `needsParityRetry=false`
- DoorObj explicit parity (two calls, same symbol):
  - call#1 `elapsedMs=9294`
  - call#2 `elapsedMs=19`
  - both `isComplete=true`

## Evidence Links

- `docs/reports/2026-03-14-analyze-memory-tier1-summary.json`
- `docs/reports/2026-03-14-analyze-memory-tier2-summary.json`
- `docs/reports/2026-03-14-analyze-memory-tier3-summary.json`
- `docs/reports/2026-03-14-analyze-memory-tier3-equivalence-check.json`
- `gitnexus/docs/reports/2026-03-15-unity-hydration-gates.json`
