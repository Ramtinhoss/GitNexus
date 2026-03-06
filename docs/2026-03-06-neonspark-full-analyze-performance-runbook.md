# NeonSpark Full Analyze Performance Runbook

Date: 2026-03-06  
Owner: GitNexus

## 1) Purpose

Standardize full-repo `analyze --force` performance verification for:

- `/Volumes/Shuttle/projects/neonspark`
- Unity enrich optimization regression checks
- Before/after comparison across commits

This runbook defines fixed command parameters, environment capture, log format, and comparison criteria.

## 2) Preconditions

Run from GitNexus repo root:

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus
```

Build current CLI first:

```bash
npm --prefix gitnexus run build
```

Target repo path must exist:

```bash
test -d /Volumes/Shuttle/projects/neonspark
```

## 3) Fixed Analyze Command

Use local dist CLI to avoid npm/package drift:

```bash
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark \
  --force \
  --repo-alias neonspark-unity-full-<YYYYMMDD-HHMM>
```

Required invariants:

1. Keep `--force`
2. Do not set `--scope-*`
3. Do not set `--extensions`
4. Use unique alias per run

## 4) Environment Capture

Collect hardware/runtime metadata in the same report:

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
uname -a
sw_vers
sysctl -n machdep.cpu.brand_string
sysctl -n hw.memsize
node -v
npm -v
git -C /Volumes/Shuttle/projects/agentic/GitNexus rev-parse HEAD
git -C /Volumes/Shuttle/projects/agentic/GitNexus rev-parse --abbrev-ref HEAD
```

## 5) Execution + Logging Template

Recommended one-shot command:

```bash
RUN_TAG="$(date -u +%Y%m%d-%H%M%S)"
LOG="docs/reports/${RUN_TAG}-neonspark-full-analyze.log"
META="docs/reports/${RUN_TAG}-neonspark-full-analyze.meta.txt"

{
  echo "timestamp_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "repo=/Volumes/Shuttle/projects/neonspark"
  echo "gitnexus_repo=/Volumes/Shuttle/projects/agentic/GitNexus"
  echo "git_head=$(git -C /Volumes/Shuttle/projects/agentic/GitNexus rev-parse HEAD)"
  echo "git_branch=$(git -C /Volumes/Shuttle/projects/agentic/GitNexus rev-parse --abbrev-ref HEAD)"
  echo "node=$(node -v)"
  echo "npm=$(npm -v)"
  echo "cpu=$(sysctl -n machdep.cpu.brand_string)"
  echo "mem_bytes=$(sysctl -n hw.memsize)"
  echo "os=$(sw_vers | tr '\n' ';')"
} > "$META"

/usr/bin/time -p \
  node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark \
  --force \
  --repo-alias "neonspark-unity-full-${RUN_TAG}" \
  > "$LOG" 2>&1
```

## 6) Required Summary Fields

Each run report must include:

1. Exit code
2. Start/end UTC timestamp
3. `real/user/sys` from `/usr/bin/time -p`
4. `Repository indexed successfully (Xs)`
5. `Scoped Files`
6. `nodes | edges | clusters | flows`
7. `KuzuDB Xs | FTS Ys`
8. `Skipped N large files`
9. `Unity Diagnostics` lines (if present)
10. fallback note (if present): `Note: ... inserted via fallback`

## 7) Comparison Criteria

Compare new run against baseline with these rules:

1. **Pass/Fail gate**: exit code must be `0`
2. **Primary metric**: `real` wall time
3. **Secondary metrics**:
   - `Repository indexed successfully (Xs)`
   - Kuzu/FTS split
   - nodes/edges cardinality drift
4. **Regression threshold** (default):
   - warning: wall time regression > `+15%`
   - fail: wall time regression > `+25%`
5. **Correctness guardrail**:
   - nodes/edges drift > `±5%` requires investigation before accepting perf gain

## 8) Current Baseline (2026-03-06)

Reference run:

- command alias: `neonspark-unity-full-20260306`
- start/end UTC: `2026-03-06T13:30:56Z` → `2026-03-06T13:58:26Z`
- duration: `1650s` (`27m30s`)
- analyzer summary time: `1648.3s`
- stats: `Scoped Files: 136657`, `300,549 nodes`, `538,034 edges`, `7338 clusters`, `300 flows`
- phase split: `KuzuDB 66.7s`, `FTS 18.9s`
- note: `205 edges across 6 types inserted via fallback`

## 9) Report Snippet Template

Use this block in progress/report docs:

```md
### Full Analyze Perf Run - <RUN_TAG>

- Commit: `<HEAD>`
- Exit code: `<0|non-zero>`
- Wall time: `<real>s` (`<mm:ss>`)
- Summary time: `<Repository indexed successfully (Xs)>`
- Stats: `<Scoped Files>`, `<nodes>`, `<edges>`, `<clusters>`, `<flows>`
- Phase split: `KuzuDB <x>s | FTS <y>s`
- Large-file skip: `<N>`
- Unity diagnostics: `<present/absent + first line>`
- Fallback note: `<present/absent + value>`
- Comparison vs baseline (2026-03-06): `<+/- %>`
```
