# Phase0 Unity Runtime-Process Baseline Report

Date: 2026-03-31
CLI: /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js
Runs: 3

## Scope

- Repositories: neonspark, neonnew-core, unity-mini-phase0
- Query set: 8 unity-focused queries
- Symbol sample size: neonspark=10, neonnew-core=10, unity-mini-phase0=3
- Lifecycle callbacks: Awake, Start, Update, FixedUpdate, OnEnable, OnDisable

## Reproducibility Gate

- Threshold: ratio spread <= 5.0 percentage points across 3 runs

## neonspark

- Symbol non-empty process ratio: 0.0%, 0.0%, 0.0% (spread 0.0pp, pass=true)
- Query process_symbols non-empty ratio: 12.5%, 12.5%, 12.5% (spread 0.0pp, pass=true)
- Lifecycle coverage (non-empty process ratio by callback):
  - Awake: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - Start: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - Update: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - FixedUpdate: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - OnEnable: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - OnDisable: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)

## neonnew-core

- Symbol non-empty process ratio: 0.0%, 0.0%, 0.0% (spread 0.0pp, pass=true)
- Query process_symbols non-empty ratio: 12.5%, 12.5%, 12.5% (spread 0.0pp, pass=true)
- Lifecycle coverage (non-empty process ratio by callback):
  - Awake: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - Start: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - Update: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - FixedUpdate: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - OnEnable: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)
  - OnDisable: 0.0%, 0.0%, 0.0% (sampled/run 3/3/3, spread 0.0pp, pass=true)

## unity-mini-phase0

- Symbol non-empty process ratio: 0.0%, 0.0%, 0.0% (spread 0.0pp, pass=true)
- Query process_symbols non-empty ratio: 0.0%, 0.0%, 0.0% (spread 0.0pp, pass=true)
- Lifecycle coverage (non-empty process ratio by callback):
  - Awake: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)
  - Start: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)
  - Update: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)
  - FixedUpdate: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)
  - OnEnable: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)
  - OnDisable: 0.0%, 0.0%, 0.0% (sampled/run 0/0/0, spread 0.0pp, pass=true)

## Overall

- Symbol non-empty process ratio: 0.0%, 0.0%, 0.0% (spread 0.0pp, pass=true)
- Query process_symbols non-empty ratio: 8.3%, 8.3%, 8.3% (spread 0.0pp, pass=true)

## Artifacts

- docs/reports/2026-03-31-phase0-unity-runtime-process-queryset.json
- docs/reports/2026-03-31-phase0-unity-runtime-process-run1.json
- docs/reports/2026-03-31-phase0-unity-runtime-process-run2.json
- docs/reports/2026-03-31-phase0-unity-runtime-process-run3.json
- docs/reports/2026-03-31-phase0-unity-runtime-process-summary.json
