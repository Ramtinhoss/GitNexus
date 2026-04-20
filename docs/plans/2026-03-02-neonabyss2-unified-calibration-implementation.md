# NeonAbyss2 Unified Calibration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep `neonspark-v1` as immutable baseline, then build and validate an expanded 40-60 symbol calibration dataset on the same NeonAbyss2/NeonSpark repository with 3 consecutive full benchmark passes and MCP explainability evidence.

**Architecture:** Reuse existing `benchmark-unity` pipeline and scope-manifest workflow. First remove tooling blockers (hard-coded 20-symbol materialization and non-runnable candidate/materialize commands), then create `neonspark-v2` dataset, run scoped analyze + benchmark loops on `/Volumes/Shuttle/unity-projects/neonspark`, and archive reports plus explainability samples.

**Tech Stack:** TypeScript (Node 20+, ESM), GitNexus CLI (`analyze/query/context/impact/benchmark-unity`), Node built-in test runner (`node:test`), JSON/JSONL benchmark datasets.

---

## Preconditions

1. Worktree: use a dedicated worktree branch (do not run this plan in a mixed branch).
2. Repo root: `/Users/nantasmac/projects/agentic/GitNexus`.
3. Target repo path: `/Volumes/Shuttle/unity-projects/neonspark` (same physical repo for NeonAbyss2/NeonSpark).
4. Keep `benchmarks/unity-baseline/neonspark-v1/` unchanged except critical bugfixes; all expansion work goes to `neonspark-v2`.
5. Required process skills during execution: `@test-driven-development`, `@verification-before-completion`.

### Task 1: Remove 20-Symbol Hard Limit From Materializer (Range Support)

**Files:**
- Modify: `gitnexus/src/benchmark/neonspark-materialize.ts`
- Modify: `gitnexus/src/benchmark/neonspark-materialize.test.ts`

**Step 1: Write the failing test**

Add to `gitnexus/src/benchmark/neonspark-materialize.test.ts`:

```ts
test('buildSymbolRows supports configurable selection range', () => {
  const candidates = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(40)].map((_, i) => (i % 2 === 0 ? 'u1' : 'u2'));

  const rows = buildSymbolRows(candidates as any[], ids, { minSelected: 40, maxSelected: 60 });
  assert.equal(rows.length, 40);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-materialize.test.js`
Expected: FAIL because `buildSymbolRows` does not accept options yet.

**Step 3: Write minimal implementation**

Update `gitnexus/src/benchmark/neonspark-materialize.ts`:

```ts
export interface BuildSymbolRowsOptions {
  minSelected?: number;
  maxSelected?: number;
}

function assertSelectedCount(count: number, options: BuildSymbolRowsOptions) {
  const min = options.minSelected ?? 20;
  const max = options.maxSelected ?? min;
  if (count < min || count > max) {
    throw new Error(`selected symbol count must be within [${min}, ${max}], got ${count}`);
  }
}

export function buildSymbolRows(candidates: any[], selectedUids: string[], options: BuildSymbolRowsOptions = {}) {
  assertSelectedCount(selectedUids.length, options);
  const byUid = new Map(candidates.map((c) => [String(c.symbol_uid), c]));
  return selectedUids.map((uid) => {
    const row = byUid.get(uid);
    if (!row) throw new Error(`selected uid not found in candidates: ${uid}`);
    return {
      symbol_uid: String(row.symbol_uid),
      file_path: String(row.file_path),
      symbol_name: String(row.symbol_name),
      symbol_type: String(row.symbol_type),
      start_line: Number(row.start_line || 0),
      end_line: Number(row.end_line || 0),
    };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-materialize.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/neonspark-materialize.ts gitnexus/src/benchmark/neonspark-materialize.test.ts
git commit -m "feat: support ranged symbol selection for neonspark materialization"
```

### Task 2: Make Candidate/Materialize Commands Runnable From CLI

**Files:**
- Modify: `gitnexus/src/benchmark/neonspark-candidates.ts`
- Modify: `gitnexus/src/benchmark/neonspark-candidates.test.ts`
- Modify: `gitnexus/src/benchmark/neonspark-materialize.ts`
- Modify: `gitnexus/src/benchmark/neonspark-materialize.test.ts`

**Step 1: Write the failing tests**

Add parse tests:

```ts
// neonspark-candidates.test.ts
import { parseCandidatesCliArgs } from './neonspark-candidates.js';

test('parseCandidatesCliArgs parses repo and output path', () => {
  assert.deepEqual(parseCandidatesCliArgs(['neonspark-v1-subset', '/tmp/candidates.jsonl']), {
    repoName: 'neonspark-v1-subset',
    outFile: '/tmp/candidates.jsonl',
  });
});

// neonspark-materialize.test.ts
import { parseMaterializeCliArgs } from './neonspark-materialize.js';

test('parseMaterializeCliArgs parses files and range flags', () => {
  assert.deepEqual(
    parseMaterializeCliArgs([
      '/tmp/candidates.jsonl',
      '/tmp/selected.txt',
      '/tmp/symbols.jsonl',
      '--min-selected',
      '40',
      '--max-selected',
      '60',
    ]),
    {
      candidatesFile: '/tmp/candidates.jsonl',
      selectedFile: '/tmp/selected.txt',
      outFile: '/tmp/symbols.jsonl',
      minSelected: 40,
      maxSelected: 60,
    },
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-candidates.test.js dist/benchmark/neonspark-materialize.test.js`
Expected: FAIL because parse helpers do not exist.

**Step 3: Write minimal implementation**

1. In `neonspark-candidates.ts`, add:
   - `parseCandidatesCliArgs(argv: string[])`
   - `mainCandidatesCli(argv: string[])`
   - ESM entrypoint guard (`import.meta.url` + `pathToFileURL`) that runs `mainCandidatesCli(process.argv.slice(2))`.
2. In `neonspark-materialize.ts`, add:
   - `parseMaterializeCliArgs(argv: string[])`
   - `mainMaterializeCli(argv: string[])` reading JSONL candidates + selected UID txt and writing `symbols.jsonl`
   - `--min-selected` and `--max-selected` option support.

**Step 4: Run tests to verify they pass**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-candidates.test.js dist/benchmark/neonspark-materialize.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/neonspark-candidates.ts gitnexus/src/benchmark/neonspark-candidates.test.ts gitnexus/src/benchmark/neonspark-materialize.ts gitnexus/src/benchmark/neonspark-materialize.test.ts
git commit -m "feat: add runnable neonspark candidate and materialize CLIs"
```

### Task 3: Create `neonspark-v2` Dataset Skeleton and Command Wiring

**Files:**
- Create: `benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt`
- Create: `benchmarks/unity-baseline/neonspark-v2/thresholds.json`
- Create: `benchmarks/unity-baseline/neonspark-v2/relations.jsonl`
- Create: `benchmarks/unity-baseline/neonspark-v2/tasks.jsonl`
- Create: `benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt`
- Create: `benchmarks/unity-baseline/neonspark-v2/symbols.jsonl`
- Create: `benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl`
- Modify: `gitnexus/src/benchmark/io.test.ts`
- Modify: `gitnexus/package.json`
- Modify: `gitnexus/src/cli/benchmark-unity.test.ts`

**Step 1: Write failing tests**

1. Add in `gitnexus/src/benchmark/io.test.ts`:

```ts
test('loadBenchmarkDataset parses neonspark-v2 dataset', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/neonspark-v2');
  const ds = await loadBenchmarkDataset(root);
  assert.ok(ds.symbols.length > 0);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});
```

2. Add in `gitnexus/src/cli/benchmark-unity.test.ts`:

```ts
assert.ok(scripts['benchmark:neonspark:v2:full']);
assert.ok(scripts['benchmark:neonspark:v2:quick']);
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js dist/cli/benchmark-unity.test.js`
Expected: FAIL because `neonspark-v2` files and scripts do not exist.

**Step 3: Write minimal implementation**

1. Initialize `neonspark-v2` by copying from v1:

```bash
mkdir -p benchmarks/unity-baseline/neonspark-v2
cp benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/thresholds.json benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/relations.jsonl benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/tasks.jsonl benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/symbols.jsonl benchmarks/unity-baseline/neonspark-v2/
cp benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl benchmarks/unity-baseline/neonspark-v2/
```

2. Add scripts in `gitnexus/package.json`:

```json
"benchmark:neonspark:v2:full": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/neonspark-v2 --profile full --target-path /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt",
"benchmark:neonspark:v2:quick": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/neonspark-v2 --profile quick --target-path /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt"
```

**Step 4: Run tests to verify they pass**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js dist/cli/benchmark-unity.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v2 gitnexus/src/benchmark/io.test.ts gitnexus/package.json gitnexus/src/cli/benchmark-unity.test.ts
git commit -m "feat: add neonspark v2 dataset scaffold and benchmark scripts"
```

### Task 4: Expand `neonspark-v2` Dataset to 40-60 Symbols and Strengthen Tasks

**Files:**
- Modify: `benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt`
- Modify: `benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl`
- Modify: `benchmarks/unity-baseline/neonspark-v2/symbols.jsonl`
- Modify: `benchmarks/unity-baseline/neonspark-v2/tasks.jsonl`
- Modify: `benchmarks/unity-baseline/neonspark-v2/relations.jsonl`
- Modify: `gitnexus/src/benchmark/io.test.ts`

**Step 1: Write failing dataset guard test**

Add to `gitnexus/src/benchmark/io.test.ts`:

```ts
test('neonspark-v2 dataset is expanded and balanced', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/neonspark-v2');
  const ds = await loadBenchmarkDataset(root);

  assert.ok(ds.symbols.length >= 40 && ds.symbols.length <= 60);
  assert.ok(ds.tasks.length >= 24);

  const tools = new Set(ds.tasks.map((t) => t.tool));
  assert.equal(tools.has('query'), true);
  assert.equal(tools.has('context'), true);
  assert.equal(tools.has('impact'), true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`
Expected: FAIL because v2 still has 20 symbols.

**Step 3: Build expanded dataset (implementation)**

Run:

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl
```

Then curate `benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt` to 50 UIDs with explicit mix:
1. 25 business-domain symbols (`Assets/NEON/Code/...`)
2. 15 package/runtime symbols (`Packages/com.veewo...`)
3. 10 ambiguity-prone symbols (same-name across paths)

Materialize:

```bash
node dist/benchmark/neonspark-materialize.js ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl ../benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt ../benchmarks/unity-baseline/neonspark-v2/symbols.jsonl --min-selected 40 --max-selected 60
```

Update `tasks.jsonl` and `relations.jsonl`:
1. Add/adjust tasks to cover new ambiguous symbols with `uid` or `target_uid` pinning.
2. Ensure at least 24 tasks total, with minimum 8 per tool family (`query/context/impact`).
3. Keep `must_not_hit_uids` for known confusion pairs.

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`
Expected: PASS with expanded counts.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v2 gitnexus/src/benchmark/io.test.ts
git commit -m "bench: expand neonspark v2 dataset to 40-60 symbols with ambiguity coverage"
```

### Task 5: Calibrate and Achieve 3 Consecutive Full PASS Runs

**Files:**
- Modify: `benchmarks/unity-baseline/neonspark-v2/tasks.jsonl`
- Modify: `benchmarks/unity-baseline/neonspark-v2/thresholds.json`
- Create: `docs/reports/2026-03-02-neonspark-v2-run1-report.json`
- Create: `docs/reports/2026-03-02-neonspark-v2-run1-summary.md`
- Create: `docs/reports/2026-03-02-neonspark-v2-run2-report.json`
- Create: `docs/reports/2026-03-02-neonspark-v2-run2-summary.md`
- Create: `docs/reports/2026-03-02-neonspark-v2-run3-report.json`
- Create: `docs/reports/2026-03-02-neonspark-v2-run3-summary.md`

**Step 1: Run first full benchmark and archive artifacts**

Run:

```bash
cd gitnexus
npm run benchmark:neonspark:v2:full
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-run1-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-run1-summary.md
```

Expected: report files exist (PASS/FAIL both acceptable for run1 calibration).

**Step 2: Apply minimal calibration if run1 fails**

1. Fix `tasks.jsonl` ambiguous misses by adding `uid`/`target_uid` constraints.
2. Only adjust `thresholds.json` when failure class is stable noise (not data defect).
3. Do not lower thresholds below v1-calibrated floor unless documented with evidence.

**Step 3: Run full benchmark run2 and run3; archive each run**

Run:

```bash
cd gitnexus
npm run benchmark:neonspark:v2:full
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-run2-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-run2-summary.md

npm run benchmark:neonspark:v2:full
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-run3-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-run3-summary.md
```

Expected: run2/run3 both PASS; if not PASS, iterate Step 2 and rerun until 3 consecutive PASS is reached.

**Step 4: Verify consecutive pass evidence**

Check each archived report has:
1. `"pass": true`
2. `queryPrecision >= thresholds.query.precisionMin`
3. `contextImpactF1 >= thresholds.contextImpact.f1Min`
4. `smokePassRate == 1.0`

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v2/tasks.jsonl benchmarks/unity-baseline/neonspark-v2/thresholds.json docs/reports/2026-03-02-neonspark-v2-run1-report.json docs/reports/2026-03-02-neonspark-v2-run1-summary.md docs/reports/2026-03-02-neonspark-v2-run2-report.json docs/reports/2026-03-02-neonspark-v2-run2-summary.md docs/reports/2026-03-02-neonspark-v2-run3-report.json docs/reports/2026-03-02-neonspark-v2-run3-summary.md
git commit -m "bench: calibrate neonspark v2 and reach three consecutive full passes"
```

### Task 6: MCP Explainability Sampling and Phase Gate Evidence

**Files:**
- Create: `docs/reports/2026-03-02-neonspark-v2-explainability.md`
- Modify: `docs/2026-03-02-neonspark-benchmark-usage.md`

**Step 1: Execute explainability sampling**

Run sample commands (at least 5 per tool family):

```bash
cd gitnexus
node dist/cli/index.js query "NetPlayer" --repo neonspark-v1-subset --limit 3
node dist/cli/index.js context --uid "Class:Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.cs:NetPlayer" --repo neonspark-v1-subset
node dist/cli/index.js impact "NetPlayer" --uid "Class:Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.cs:NetPlayer" --direction downstream --depth 2 --repo neonspark-v1-subset
```

Expected: outputs are reproducible, and each sample can be explained by symbol UID + file path + relation chain.

**Step 2: Record explainability report**

Create `docs/reports/2026-03-02-neonspark-v2-explainability.md` with:
1. 15 sample records (`5 query + 5 context + 5 impact`)
2. For each sample: input, top hits, expected vs actual, explainability verdict (`clear`/`ambiguous`)
3. Aggregated failure classes and follow-up actions.

**Step 3: Update runbook for unified repo naming**

Update `docs/2026-03-02-neonspark-benchmark-usage.md`:
1. Clarify NeonAbyss2/NeonSpark are the same physical repo path.
2. Document `neonspark-v1` (baseline) vs `neonspark-v2` (expanded calibration) usage.
3. Keep command examples for both datasets.

**Step 4: Final verification before completion**

Run:

```bash
cd gitnexus
npm run build
npm run test:benchmark
npm run benchmark:neonspark:v2:quick
node dist/cli/index.js status
node dist/cli/index.js list
```

Expected:
1. Build and benchmark tests pass.
2. Quick benchmark passes on v2.
3. Index status is fresh after final analyze/benchmark run.
4. Repo listing includes `neonspark-v1-subset`.

**Step 5: Commit**

```bash
git add docs/reports/2026-03-02-neonspark-v2-explainability.md docs/2026-03-02-neonspark-benchmark-usage.md
git commit -m "docs: add neonspark v2 explainability evidence and unified runbook"
```

## Definition of Done (Execution Exit Criteria)

1. `neonspark-v1` baseline dataset preserved unchanged for historical comparison.
2. `neonspark-v2` dataset has 40-60 symbols and balanced `query/context/impact` tasks.
3. Full benchmark achieves 3 consecutive PASS runs with archived JSON + markdown reports.
4. Explainability report exists with reproducible query/context/impact samples.
5. Runbook reflects same-repo reality (NeonAbyss2 == NeonSpark path) and v1/v2 workflow split.
