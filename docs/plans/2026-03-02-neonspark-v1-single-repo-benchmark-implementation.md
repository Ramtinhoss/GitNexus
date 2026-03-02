# NeonSpark v1 Single-Repo Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the NeonSpark real-repo benchmark pipeline (single fixture repo), generate the first full benchmark report, and archive reproducible artifacts for P0-T2.

**Architecture:** Add small benchmark utilities in `gitnexus/src/benchmark` for deterministic fixture sync, candidate extraction, and selected-symbol materialization. Keep evaluation flow on existing `benchmark-unity` command, with a new `neonspark-v1` dataset and explicit operational docs. Enforce single-repo indexing by analyzing only one fixed subset root.

**Tech Stack:** TypeScript (Node 20+, ESM), existing GitNexus CLI and benchmark module, Node built-in test runner (`node:test`), JSON/JSONL datasets.

---

## Preconditions

1. Work from repo root: `/Users/nantasmac/projects/agentic/GitNexus`.
2. Source repo path is fixed: `/Volumes/Shuttle/unity-projects/neonspark`.
3. Use `@test-driven-development` for each code task and `@verification-before-completion` before each success claim.

### Task 1: Deterministic Single-Repo Fixture Sync Utility

**Files:**
- Create: `gitnexus/src/benchmark/neonspark-sync.test.ts`
- Create: `gitnexus/src/benchmark/neonspark-sync.ts`
- Create: `benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/neonspark-sync.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, shouldIncludeRelativePath } from './neonspark-sync.js';

test('parseManifest strips comments and blank lines', () => {
  const roots = parseManifest(`
# main gameplay
Assets/NEON/Code

Packages/com.veewo.*
Packages/com.neonspark.*
`);
  assert.deepEqual(roots, ['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*']);
});

test('shouldIncludeRelativePath keeps only .cs under allowed roots', () => {
  const roots = ['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*'];
  assert.equal(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.cs', roots), true);
  assert.equal(shouldIncludeRelativePath('Packages/com.veewo.stat/Runtime/Stat.cs', roots), true);
  assert.equal(shouldIncludeRelativePath('Packages/com.unity.inputsystem/Runtime/X.cs', roots), false);
  assert.equal(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.prefab', roots), false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-sync.test.js`
Expected: FAIL with missing module or missing exports.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/neonspark-sync.ts
import fs from 'node:fs/promises';
import path from 'node:path';

export function parseManifest(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function wildcardPrefix(rule: string): string {
  return rule.endsWith('*') ? rule.slice(0, -1) : rule;
}

export function shouldIncludeRelativePath(relPath: string, roots: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized.endsWith('.cs')) return false;

  return roots.some((rule) => {
    const prefix = wildcardPrefix(rule.replace(/\\/g, '/'));
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

async function walk(dir: string, base: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', 'Library', 'Logs', 'Temp', 'Obj', 'UserSettings'].includes(e.name)) continue;
      await walk(full, base, out);
      continue;
    }
    const rel = path.relative(base, full).replace(/\\/g, '/');
    out.push(rel);
  }
}

export async function syncFixture(sourceRoot: string, fixtureRoot: string, manifestPath: string): Promise<number> {
  const manifest = await fs.readFile(manifestPath, 'utf-8');
  const roots = parseManifest(manifest);

  const allFiles: string[] = [];
  await walk(sourceRoot, sourceRoot, allFiles);

  const selected = allFiles.filter((rel) => shouldIncludeRelativePath(rel, roots));

  await fs.rm(fixtureRoot, { recursive: true, force: true });
  for (const rel of selected) {
    const src = path.join(sourceRoot, rel);
    const dst = path.join(fixtureRoot, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  return selected.length;
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-sync.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt gitnexus/src/benchmark/neonspark-sync.ts gitnexus/src/benchmark/neonspark-sync.test.ts
git commit -m "feat: add deterministic neonspark subset sync utility"
```

### Task 2: Candidate Symbol Extraction Utility

**Files:**
- Create: `gitnexus/src/benchmark/neonspark-candidates.test.ts`
- Create: `gitnexus/src/benchmark/neonspark-candidates.ts`
- Create: `benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/neonspark-candidates.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNeonsparkPaths, toCandidateRow } from './neonspark-candidates.js';

test('filterNeonsparkPaths keeps code and allowed package prefixes', () => {
  const rows = [
    { file_path: 'Assets/NEON/Code/Game/A.cs' },
    { file_path: 'Packages/com.veewo.stat/Runtime/Stat.cs' },
    { file_path: 'Packages/com.neonspark.inspector-navigator/Editor/NavigatorMenu.cs' },
    { file_path: 'Packages/com.unity.inputsystem/Runtime/InputAction.cs' },
  ];
  const filtered = filterNeonsparkPaths(rows as any[]);
  assert.equal(filtered.length, 3);
});

test('toCandidateRow normalizes required fields', () => {
  const row = toCandidateRow({
    symbol_uid: 'Method:Assets/NEON/Code/Game/A.cs:Tick',
    file_path: 'Assets/NEON/Code/Game/A.cs',
    symbol_name: 'Tick',
    symbol_type: 'Method',
    start_line: 11,
    end_line: 22,
  });
  assert.equal(row.symbol_name, 'Tick');
  assert.equal(row.start_line, 11);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-candidates.test.js`
Expected: FAIL with missing module or exports.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/neonspark-candidates.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { listRegisteredRepos } from '../storage/repo-manager.js';
import { closeKuzu, executeQuery, initKuzu } from '../mcp/core/kuzu-adapter.js';

const ALLOWED_PREFIXES = ['Assets/NEON/Code/', 'Packages/com.veewo.', 'Packages/com.neonspark.'];

export function filterNeonsparkPaths<T extends { file_path?: string }>(rows: T[]): T[] {
  return rows.filter((r) => {
    const p = (r.file_path || '').replace(/\\/g, '/');
    return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
  });
}

export function toCandidateRow(row: any) {
  return {
    symbol_uid: String(row.symbol_uid),
    file_path: String(row.file_path),
    symbol_name: String(row.symbol_name),
    symbol_type: String(row.symbol_type),
    start_line: Number(row.start_line || 0),
    end_line: Number(row.end_line || 0),
  };
}

export async function extractCandidates(repoName: string, outFile: string): Promise<number> {
  const repos = await listRegisteredRepos({ validate: true });
  const repo = repos.find((r) => r.name === repoName);
  if (!repo) throw new Error(`repo not indexed: ${repoName}`);

  await initKuzu(repoName, path.join(repo.storagePath, 'kuzu'));
  try {
    const rows = await executeQuery(repoName, `
      MATCH (s)
      WHERE (s:Class OR s:Interface OR s:Method OR s:Function)
      RETURN s.id AS symbol_uid,
             s.filePath AS file_path,
             s.name AS symbol_name,
             labels(s)[0] AS symbol_type,
             COALESCE(s.startLine, 0) AS start_line,
             COALESCE(s.endLine, 0) AS end_line
    `);

    const normalized = filterNeonsparkPaths(rows.map(toCandidateRow));
    const jsonl = normalized.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, jsonl, 'utf-8');
    return normalized.length;
  } finally {
    await closeKuzu(repoName);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-candidates.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/neonspark-candidates.ts gitnexus/src/benchmark/neonspark-candidates.test.ts
git commit -m "feat: add neonspark candidate extraction utility"
```

### Task 3: Selected Symbol Materializer (20-Symbol Gate)

**Files:**
- Create: `gitnexus/src/benchmark/neonspark-materialize.test.ts`
- Create: `gitnexus/src/benchmark/neonspark-materialize.ts`
- Create: `benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt`
- Create: `benchmarks/unity-baseline/neonspark-v1/symbols.jsonl`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/neonspark-materialize.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSymbolRows } from './neonspark-materialize.js';

test('buildSymbolRows enforces exactly 20 selected uids', () => {
  const candidates = [{ symbol_uid: 'a' }];
  assert.throws(() => buildSymbolRows(candidates as any[], ['a']), /exactly 20/i);
});

test('buildSymbolRows maps selected uids to candidate rows', () => {
  const c = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(20)].map((_, i) => i < 19 ? 'u1' : 'u2');
  const rows = buildSymbolRows(c as any[], ids);
  assert.equal(rows.length, 20);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/neonspark-materialize.test.js`
Expected: FAIL with missing module or exports.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/neonspark-materialize.ts
export function buildSymbolRows(candidates: any[], selectedUids: string[]) {
  if (selectedUids.length !== 20) {
    throw new Error(`selected symbol count must be exactly 20, got ${selectedUids.length}`);
  }

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
git add gitnexus/src/benchmark/neonspark-materialize.ts gitnexus/src/benchmark/neonspark-materialize.test.ts benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt
git commit -m "feat: add neonspark selected-symbol materializer"
```

### Task 4: Create `neonspark-v1` Dataset and Validate Loader Compatibility

**Files:**
- Create: `benchmarks/unity-baseline/neonspark-v1/thresholds.json`
- Create: `benchmarks/unity-baseline/neonspark-v1/relations.jsonl`
- Create: `benchmarks/unity-baseline/neonspark-v1/tasks.jsonl`
- Modify: `gitnexus/src/benchmark/io.test.ts`

**Step 1: Write the failing test**

Add to `gitnexus/src/benchmark/io.test.ts`:

```ts
test('loadBenchmarkDataset parses neonspark-v1 dataset', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/neonspark-v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(ds.symbols.length, 20);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`
Expected: FAIL because `neonspark-v1` dataset files are missing or incomplete.

**Step 3: Write minimal implementation**

1. Copy threshold template from `benchmarks/unity-baseline/v1/thresholds.json` into `neonspark-v1/thresholds.json`.
2. Create initial `relations.jsonl` and `tasks.jsonl` from the selected 20 symbols with minimal viable density:
   - `relations.jsonl`: 24-36 assertions.
   - `tasks.jsonl`: 18-24 tasks with `query/context/impact` coverage.
3. Generate `symbols.jsonl` from Task 3 output.

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`
Expected: PASS including the `neonspark-v1` test.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v1 gitnexus/src/benchmark/io.test.ts
git commit -m "test: add neonspark v1 benchmark dataset coverage"
```

### Task 5: Add Operational Commands for P0-T2 Execution

**Files:**
- Modify: `gitnexus/package.json`
- Create: `docs/2026-03-02-neonspark-benchmark-usage.md`

**Step 1: Write the failing test**

Create `gitnexus/src/cli/benchmark-unity.test.ts` case to assert new npm script targets are documented via package scripts snapshot:

```ts
// add assertion around package scripts by reading package.json in test
assert.ok(scripts['benchmark:neonspark:full']);
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-unity.test.js`
Expected: FAIL because script key does not exist.

**Step 3: Write minimal implementation**

Add scripts to `gitnexus/package.json`:

```json
"benchmark:neonspark:full": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/neonspark-v1 --profile full --target-path ../benchmarks/fixtures/neonspark-v1-subset",
"benchmark:neonspark:quick": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/neonspark-v1 --profile quick --target-path ../benchmarks/fixtures/neonspark-v1-subset"
```

Write runbook `docs/2026-03-02-neonspark-benchmark-usage.md` with end-to-end command sequence:
1. sync fixture
2. analyze fixture
3. extract candidates
4. materialize symbols
5. benchmark full
6. archive report

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-unity.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/package.json gitnexus/src/cli/benchmark-unity.test.ts docs/2026-03-02-neonspark-benchmark-usage.md
git commit -m "docs: add neonspark benchmark runbook and scripts"
```

### Task 6: Execute First Full Benchmark Run and Archive Artifacts

**Files:**
- Create: `docs/reports/2026-03-02-neonspark-v1-first-full-report.md`
- Create: `docs/reports/2026-03-02-neonspark-v1-benchmark-report.json`
- Create: `docs/reports/2026-03-02-neonspark-v1-benchmark-summary.md`

**Step 1: Run fixture sync and analyze**

Run:

```bash
cd gitnexus
npm run build
node dist/benchmark/neonspark-sync.js /Volumes/Shuttle/unity-projects/neonspark ../benchmarks/fixtures/neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
node dist/cli/index.js analyze --force --extensions .cs ../benchmarks/fixtures/neonspark-v1-subset
```

Expected: analyze succeeds and indexed repo list contains `neonspark-v1-subset`.

**Step 2: Generate candidate and selected-symbol outputs**

Run:

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl
# manual curation step updates symbols.selected.txt (14 business + 6 infra)
node dist/benchmark/neonspark-materialize.js ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt ../benchmarks/unity-baseline/neonspark-v1/symbols.jsonl
```

Expected: `symbols.jsonl` has exactly 20 lines.

**Step 3: Run full benchmark and archive outputs**

Run:

```bash
cd gitnexus
npm run benchmark:neonspark:full
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v1-benchmark-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v1-benchmark-summary.md
```

Expected: command completes; PASS/FAIL both acceptable for first real-repo report.

**Step 4: Write run summary**

Create `docs/reports/2026-03-02-neonspark-v1-first-full-report.md` including:
1. source repo commit id/date,
2. fixture file count,
3. dataset counts (symbols/relations/tasks),
4. gate result + failure classes,
5. next threshold-calibration actions.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/neonspark-v1 benchmarks/fixtures/neonspark-v1-subset docs/reports
git commit -m "bench: run first neonspark v1 full benchmark and archive report"
```

### Task 7: Verification Before Closing P0-T2

**Files:**
- Modify: `docs/2026-03-02-neonspark-benchmark-usage.md` (if any command drift)

**Step 1: Run verification checklist**

Run:

```bash
cd gitnexus
npm run build
npm run test:benchmark
npm run benchmark:neonspark:full
node dist/cli/index.js list
```

Expected:
1. Benchmark tests pass.
2. Full run produces report artifacts.
3. Indexed repo output includes `neonspark-v1-subset` as a single repo identity.

**Step 2: Document final checklist status**

Update report summary with explicit P0-T2 checklist outcomes:
1. full run executed,
2. reports archived,
3. reproducibility commands documented,
4. first-run failures (if any) categorized.

**Step 3: Commit**

```bash
git add docs/2026-03-02-neonspark-benchmark-usage.md docs/reports/2026-03-02-neonspark-v1-first-full-report.md
git commit -m "docs: finalize p0-t2 verification checklist for neonspark benchmark"
```

