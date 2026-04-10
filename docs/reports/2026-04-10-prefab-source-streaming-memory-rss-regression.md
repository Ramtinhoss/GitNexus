# Prefab Source Streaming Memory RSS Regression (A/B)

Date: 2026-04-10
Target repo: `/Volumes/Shuttle/unity-projects/neonharness`

## Single variable

Only one variable changes between OFF and ON runs:

- OFF sets `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1`
- ON removes that toggle

All other command inputs are kept the same: CLI binary path, `--scope-manifest`, `--sync-manifest-policy`, `--csharp-define-csproj`, `NODE_OPTIONS`, and `--force --no-reuse-options`.

## Evidence

- Command lines:
- OFF `CMD:`: `off.log:1`
- ON `CMD:`: `on.log:1`
- Toggle proof:
- OFF has `prefab-source: skipped`: `off.log:18`
- ON has `prefab-source: emitted=56445`: `on.log:18`
- Raw memory fields:
- OFF `maximum resident set size`: `off.log:32`
- ON `maximum resident set size`: `on.log:32`
- OFF `peak memory footprint`: `off.log:48`
- ON `peak memory footprint`: `on.log:48`
- Run completion and graph size:
- OFF indexed time/nodes/edges: `off.log:8`, `off.log:25`
- ON indexed time/nodes/edges: `on.log:8`, `on.log:25`

## OFF vs ON

| Metric | OFF | ON | Delta (ON-OFF) |
|---|---:|---:|---:|
| Indexed time (CLI) | 87.0 s | 121.7 s | +34.7 s |
| Real time (`time -l`) | 87.51 s | 122.19 s | +34.68 s |
| Nodes | 104,983 | 106,404 | +1,421 |
| Edges | 462,192 | 519,117 | +56,925 |
| max resident set size | 6,988,038,144 | 6,629,556,224 | -358,481,920 |
| peak memory footprint | 8,651,439,480 | 9,268,100,832 | +616,661,352 |

## Delta (`max resident set size`):

- bytes: `-358,481,920`
- GiB: `-0.334`
- percent: `-5.13%`

## Delta (`peak memory footprint`):

- bytes: `+616,661,352`
- GiB: `+0.574`
- percent: `+7.13%`

## Conclusion (fixed-case only)

For this fixed neonharness case, enabling prefab-source after streaming refactor shows mixed memory signals:

- `max resident set size` decreases (`-5.13%`)
- `peak memory footprint` increases (`+7.13%`)

This report is case-scoped evidence only and does not extrapolate to all repos/scopes.
