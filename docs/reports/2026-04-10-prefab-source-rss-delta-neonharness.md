# 2026-04-10 Prefab Source Pass RSS Delta Report (neonharness)

## Summary

- Goal: measure RSS delta caused by `prefab-source` pass under a fixed `scope-manifest`.
- Result: enabling `prefab-source` increased peak RSS by `+4,255,481,856` bytes (`+3.96 GiB`, `+89.87%`) in this fixed test case.
- Status: reproduced with latest source-built CLI and explicit ON/OFF toggle.

## Fixed Test Case

- Case ID: `RSS-AB-PREFAB-SOURCE-NEONHARNESS-20260410`
- Target repo: `/Volumes/Shuttle/unity-projects/neonharness`
- Scope manifest: `/Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt`
- CLI binary: `/Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js` (built from source)
- Source revision: `4ef4d08ab59c754a21614d30c38c1991cf905a23`
- Node / npm: `v25.5.0` / `11.8.0`
- OS: `Darwin 25.3.0 arm64`

Control variables fixed between OFF/ON runs:

- same repo path
- same scope manifest
- same `NODE_OPTIONS=--max-old-space-size=12288`
- same flags: `--force --no-reuse-options --scope-manifest ... --sync-manifest-policy keep --csharp-define-csproj ...`
- isolated index home per run (`GITNEXUS_HOME=/tmp/gitnexus-neonharness-ab-off|on`)

Single variable:

- OFF: `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1`
- ON: env var not set

Manifest snapshot (fixed for this case):

```txt
Assets
Packages
@extensions=.cs,.meta
@repoAlias=neonspark-core
```

## Commands

OFF:

```bash
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-neonharness-ab-off NODE_OPTIONS=--max-old-space-size=12288 GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj
```

ON:

```bash
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-neonharness-ab-on NODE_OPTIONS=--max-old-space-size=12288 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj
```

## Results

| Variant | Exit | Prefab source line | Nodes | Edges | Real time (s) | Max RSS (bytes) |
|---|---:|---|---:|---:|---:|---:|
| OFF | 0 | `prefab-source: skipped (env GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1)` | 104,976 | 460,684 | 92.87 | 4,735,205,376 |
| ON | 0 | `prefab-source: emitted=56445` | 106,417 | 517,335 | 108.97 | 8,990,687,232 |

Delta (`ON - OFF`):

- RSS: `+4,255,481,856` bytes (`+3.96 GiB`, `+89.87%`)
- Time: `+16.10s`
- Nodes: `+1,441`
- Edges: `+56,651`

## Evidence

- OFF log: [neonharness-prefab-off-rerun.log](evidence/2026-04-10-neonharness-prefab-source-rss/neonharness-prefab-off-rerun.log)
- ON log: [neonharness-prefab-on-rerun.log](evidence/2026-04-10-neonharness-prefab-source-rss/neonharness-prefab-on-rerun.log)
- Toggle implementation: [unity-resource-processor.ts](../../gitnexus/src/core/ingestion/unity-resource-processor.ts)
- Toggle test: [unity-resource-processor.test.ts](../../gitnexus/src/core/ingestion/unity-resource-processor.test.ts)

## Interpretation

For this fixed scope-manifest and runtime configuration, `prefab-source` pass is a high-impact memory contributor. The run that emitted `56,445` prefab-source refs also showed a near-`4 GiB` RSS increase.

This report does not claim global behavior across all repositories/scopes; it documents one controlled reproducible case and its measured delta.
