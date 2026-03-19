# 2026-03-03 Agent-Context V1 Stability Summary

## Goal

Validate whether V1 thresholds can be frozen after repeated full-profile runs.

## Threshold Contract

From `benchmarks/agent-context/neonspark-refactor-v1/thresholds.json`:

- per-scenario coverage >= `0.83`
- suite average coverage >= `0.90`
- suite average tool calls <= `4`
- mandatory target pass rate = `1.0`

## Full-Profile Sampling

Dataset: `benchmarks/agent-context/neonspark-refactor-v1`

| Run | Pass | Avg Coverage | Avg Tool Calls | Target Pass Rate |
| --- | --- | --- | --- | --- |
| run1 | YES | 0.9444 | 3.3333 | 1.0000 |
| run2 | YES | 0.9444 | 3.3333 | 1.0000 |
| run3 | YES | 0.9444 | 3.3333 | 1.0000 |

Scenario-level coverage (all 3 runs):

- `minionsmanager-refactor-context`: `1.000`
- `mainuimanager-refactor-context`: `1.000`
- `mirrornetmgr-refactor-context`: `0.833`

## Stability Assessment

- Full runs pass rate: `3/3`
- Average coverage standard deviation: `0.0000`
- Average calls standard deviation: `0.0000`
- Margin vs suite coverage threshold: `+0.0444`
- Margin vs suite calls threshold: `-0.6667`

## Decision

Recommend **freeze V1 thresholds as-is** (no threshold edits needed in this cycle).

## Artifacts

- `docs/reports/2026-03-03-agent-context-full-run1-report.json`
- `docs/reports/2026-03-03-agent-context-full-run2-report.json`
- `docs/reports/2026-03-03-agent-context-full-run3-report.json`
