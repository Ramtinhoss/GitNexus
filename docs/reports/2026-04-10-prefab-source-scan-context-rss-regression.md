# Prefab Source Scan-Context RSS Regression (2026-04-10)

## Scope

Single variable: `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1` (OFF) vs unset (ON).

Fixed case only:
- target repo: `/Volumes/Shuttle/unity-projects/neonharness`
- same CLI build: `/Users/nantasmac/projects/agentic/GitNexus/.worktrees/prefab-source-scan-context-refactor-2026-04-10/gitnexus/dist/cli/index.js`
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
| Nodes | 104,926 | 106,428 |
| Edges | 457,998 | 519,212 |
| Analyzer summary time | 115.1s | 117.4s |
| `/usr/bin/time -l` real | 115.91s | 117.86s |
| max resident set size (bytes) | 7,134,871,552 | 7,155,499,008 |
| peak memory footprint (bytes) | 9,443,168,768 | 9,433,040,888 |

## Delta

- Delta (`max resident set size`):
  - bytes: `+20,627,456`
  - GiB: `+0.0192 GiB`
  - percent: `+0.2891%` (ON vs OFF)
- Delta (`peak memory footprint`):
  - bytes: `-10,127,880`
  - GiB: `-0.0094 GiB`
  - percent: `-0.1073%` (ON vs OFF)

## Audit Notes

- Both logs include `max resident set size` and `peak memory footprint`.
- Command parity was checked by comparing normalized `CMD:` lines (removing `GITNEXUS_HOME` and OFF-only toggle token).
- Result scope is this fixed neonharness case only; no global generalization beyond this case.
