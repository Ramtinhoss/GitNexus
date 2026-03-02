# NeonSpark v1 First Full Benchmark Report

Date: 2026-03-02
Run type: first full real-repo run for P0-T2

## 1) Source Repository Snapshot

- Source repo path: `/Volumes/Shuttle/unity-projects/neonspark`
- Source commit: `700411a1885f9f8b977906c354296d50d0cf3279`
- Source commit date: `2026-03-02T14:08:43+08:00`

## 2) Scoped Fixture Size

- Index mode: analyze real git root with scope manifest + repo alias (`neonspark-v1-subset`)
- Scope rules: `3`
- Scoped `.cs` files indexed: `4704`
- Analyze stats: `48,535` nodes, `109,639` edges

## 3) Dataset Counts

- Symbols: `20`
- Relations: `24`
- Tasks: `18`

## 4) Gate Result and Failure Classes

- Gate result: `FAIL` (first-run failure is acceptable for P0-T2)
- Gate failures: `query.precision`, `query.recall`, `contextImpact.f1`, `smoke.passRate`
- Metric snapshot:
  - query precision: `0.000`
  - query recall: `0.000`
  - context/impact F1: `0.000`
  - smoke pass rate: `0.333`
  - performance regression: `0.00%`
- Top failure classes:
  - `tool-error` (12)
  - `missing-required-hit` (6)
  - `insufficient-result-count` (6)

## 5) Next Threshold-Calibration Actions

1. Rebuild `symbols.jsonl` from current index candidates instead of placeholder symbol rows.
2. Re-generate `tasks.jsonl` queries/targets from confirmed resolvable symbol names and UIDs.
3. Keep thresholds unchanged for now; run one calibrated full benchmark after dataset correction.
4. After calibrated run, classify residual failures by `query/context/impact` and adjust thresholds only with evidence.
