# Analyze Memory Reduction Rollout Summary

## Baseline and Tier Results

- Baseline (from plan/subproject doc): analyze `141.47s`, RSS `6.38GB`.
- Tier 1 (runtime peak reduction): analyze `246.06s`, RSS `5.96GB`; DoorObj cold/warm `1.72s/1.72s`, RSS `0.87GB/0.87GB`.
- Tier 2 (Unity graph slimming): analyze `125.61s`, RSS `6.55GB`; DoorObj cold/warm `2.44s/2.42s`, RSS `0.98GB/0.94GB`.
- Tier 3 (summary-only + query-time hydration): analyze `117.19s`, RSS `5.78GB`; DoorObj cold/warm `0.94s/0.93s`, RSS `0.55GB/0.54GB`; AssetRef (uid) `0.60s`, RSS `0.55GB`.

## Decision

- Final decision: keep Tier 3 summary-only persistence.
- Reason 1: Tier 3 improves analyze wall time and peak RSS versus Tier 2 (`-8.42s`, `-777MB`).
- Reason 2: Unity query gates remain green (DoorObj found with non-empty bindings, zero diagnostics; AssetRef class resolved by uid with non-empty bindings).
- Reason 3: Query-time hydration path is covered by targeted tests (`unity-enrichment`, `unity-lazy-hydrator`, `unity-resource-processor`) and final suite pass.

## Evidence Links

- `docs/reports/2026-03-14-analyze-memory-tier1-summary.json`
- `docs/reports/2026-03-14-analyze-memory-tier2-summary.json`
- `docs/reports/2026-03-14-analyze-memory-tier3-summary.json`
