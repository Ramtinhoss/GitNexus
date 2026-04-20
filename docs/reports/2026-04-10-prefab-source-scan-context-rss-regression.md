# Prefab Source Scan-Context RSS Regression (2026-04-10)

## Scope

Single variable: `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1` (OFF) vs unset (ON).

Fixed case only:
- target repo: `/Volumes/Shuttle/unity-projects/neonharness`
- same CLI build: `/Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js`
- same flags: `--force --no-reuse-options --scope-manifest ... --sync-manifest-policy keep --csharp-define-csproj ...`
- same `NODE_OPTIONS=--max-old-space-size=12288`

## Evidence Paths

- OFF log: `docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log`
- ON log: `docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log`

## Toggle Evidence

- OFF contains `prefab-source: skipped (env GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1)`
- ON contains `prefab-source: emitted=56445`

## Metrics

| Metric | OFF | ON |
|---|---:|---:|
| Nodes | 104,929 | 106,419 |
| Edges | 458,499 | 519,104 |
| Analyzer summary time | 88.9s | 112.7s |
| `/usr/bin/time -l` real | 89.43s | 113.15s |
| max resident set size (bytes) | 6,785,171,456 | 7,347,503,104 |
| peak memory footprint (bytes) | 9,518,739,576 | 11,037,145,208 |

## Delta

- Delta (`max resident set size`):
  - bytes: `+562,331,648`
  - GiB: `+0.5237 GiB`
  - percent: `+8.2870%` (ON vs OFF)
- Delta (`peak memory footprint`):
  - bytes: `+1,518,405,632`
  - GiB: `+1.4141 GiB`
  - percent: `+15.9507%` (ON vs OFF)

## Audit Notes

- Both logs include `max resident set size` and `peak memory footprint`.
- Command parity was checked by comparing normalized `CMD:` lines (removing `GITNEXUS_HOME` and OFF-only toggle token).
- Result scope is this fixed neonharness case only; no global generalization beyond this case.
