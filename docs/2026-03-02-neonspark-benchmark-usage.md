# NeonSpark / NeonAbyss2 Benchmark Usage (Unified)

Run from repo root: `/Users/nantasmac/projects/agentic/GitNexus`.

## 0) Repo Path Clarification

- `NeonAbyss2` and `NeonSpark` refer to the same physical Unity repository path in this workflow:
  - `/Volumes/Shuttle/unity-projects/neonspark`
- Benchmark datasets are separate calibration contracts over that same source repo:
  - v1 baseline dataset: `benchmarks/unity-baseline/neonspark-v1`
  - v2 expanded calibration dataset: `benchmarks/unity-baseline/neonspark-v2`

## 1) v1 Baseline Calibration Flow

### Analyze with v1 scope manifest

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /Volumes/Shuttle/unity-projects/neonspark \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

### Extract candidates (v1)

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl
```

### Materialize selected symbols (v1)

```bash
cd gitnexus
# Curate symbol_uids in ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.jsonl
```

### Run v1 benchmarks

```bash
cd gitnexus
npm run benchmark:neonspark:quick
npm run benchmark:neonspark:full
```

### Archive v1 quick artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v1-quick-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v1-quick-summary.md
```

### Archive v1 full artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v1-full-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v1-full-summary.md
```

## 2) v2 Expanded Calibration Flow

Use this when validating the larger symbol/relation/task set and robust thresholds.

### Analyze with v2 scope manifest

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /Volumes/Shuttle/unity-projects/neonspark \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt
```

### Extract candidates (v2)

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl
```

### Materialize selected symbols (v2)

```bash
cd gitnexus
# Curate symbol_uids in ../benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.jsonl
```

### Run v2 benchmarks

```bash
cd gitnexus
npm run benchmark:neonspark:v2:quick
npm run benchmark:neonspark:v2:full
```

### Archive v2 quick artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-quick-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-quick-summary.md
```

### Archive v2 full artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-full-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-full-summary.md
```
