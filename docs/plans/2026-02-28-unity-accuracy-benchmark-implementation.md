# Unity Accuracy Baseline + Regression Framework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reproducible Unity/C# accuracy baseline and hard-gated regression framework for GitNexus (`query`, `context`, `impact`, and indexing performance).

**Architecture:** Add a benchmark module in `gitnexus/src/benchmark` that loads human-labeled datasets, runs analyze + tool evaluations through `LocalBackend`, computes strict metrics, and emits machine/human reports. Expose this through a new CLI command (`benchmark-unity`) with `quick` and `full` profiles. Keep v1 minimal: deterministic dataset format, strict thresholds, and explicit failure classes.

**Tech Stack:** TypeScript (Node 20, ESM), existing GitNexus CLI + LocalBackend, Node built-in test runner (`node:test`), JSON/JSONL datasets, GitHub Actions.

---

## Preconditions

1. Create and switch to a dedicated worktree before implementation.
2. Run all commands from repository root: `/Users/nantasmac/projects/agentic/GitNexus`.
3. Use Node `>=20`.

### Task 1: Benchmark Dataset Schema + Loader

**Files:**
- Create: `benchmarks/unity-baseline/v1/thresholds.json`
- Create: `benchmarks/unity-baseline/v1/symbols.jsonl`
- Create: `benchmarks/unity-baseline/v1/relations.jsonl`
- Create: `benchmarks/unity-baseline/v1/tasks.jsonl`
- Create: `benchmarks/fixtures/unity-mini/Assets/Scripts/MinionsManager.cs`
- Create: `benchmarks/fixtures/unity-mini/Assets/Scripts/Minion.cs`
- Create: `benchmarks/fixtures/unity-mini/Assets/Scripts/MinionFactory.cs`
- Create: `gitnexus/src/benchmark/types.ts`
- Create: `gitnexus/src/benchmark/io.ts`
- Create: `gitnexus/src/benchmark/io.test.ts`
- Create: `gitnexus/src/benchmark/__fixtures__/bad-dataset/thresholds.json`
- Create: `gitnexus/src/benchmark/__fixtures__/bad-dataset/symbols.jsonl`
- Create: `gitnexus/src/benchmark/__fixtures__/bad-dataset/relations.jsonl`
- Create: `gitnexus/src/benchmark/__fixtures__/bad-dataset/tasks.jsonl`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/io.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadBenchmarkDataset } from './io.js';

test('loadBenchmarkDataset parses thresholds and jsonl rows', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(typeof ds.thresholds.query.precisionMin, 'number');
  assert.ok(ds.symbols.length > 0);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length > 0);
});

test('loadBenchmarkDataset rejects missing required fields', async () => {
  const badRoot = path.resolve('src/benchmark/__fixtures__/bad-dataset');
  await assert.rejects(() => loadBenchmarkDataset(badRoot), /missing required field/i);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`  
Expected: FAIL with module/function not found.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/types.ts
export interface Thresholds {
  query: { precisionMin: number; recallMin: number };
  contextImpact: { f1Min: number };
  smoke: { passRateMin: number };
  performance: { analyzeTimeRegressionMaxPct: number };
}

export interface SymbolCase {
  symbol_uid: string;
  file_path: string;
  symbol_name: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
}

export interface RelationCase {
  src_uid: string;
  edge_type: string;
  dst_uid: string;
  must_exist: boolean;
}

export interface TaskCase {
  tool: 'query' | 'context' | 'impact';
  input: Record<string, unknown>;
  must_hit_uids: string[];
  must_not_hit_uids: string[];
  min_result_count?: number;
}
```

```ts
// gitnexus/src/benchmark/io.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Thresholds, SymbolCase, RelationCase, TaskCase } from './types.js';

export async function loadBenchmarkDataset(root: string): Promise<{
  thresholds: Thresholds;
  symbols: SymbolCase[];
  relations: RelationCase[];
  tasks: TaskCase[];
}> {
  const thresholds = JSON.parse(await fs.readFile(path.join(root, 'thresholds.json'), 'utf-8')) as Thresholds;
  const symbols = await readJsonl<SymbolCase>(path.join(root, 'symbols.jsonl'), ['symbol_uid', 'file_path', 'symbol_name', 'symbol_type', 'start_line', 'end_line']);
  const relations = await readJsonl<RelationCase>(path.join(root, 'relations.jsonl'), ['src_uid', 'edge_type', 'dst_uid', 'must_exist']);
  const tasks = await readJsonl<TaskCase>(path.join(root, 'tasks.jsonl'), ['tool', 'input', 'must_hit_uids', 'must_not_hit_uids']);
  return { thresholds, symbols, relations, tasks };
}

async function readJsonl<T>(file: string, required: string[]): Promise<T[]> {
  const raw = await fs.readFile(file, 'utf-8');
  const rows = raw.split('\n').map(s => s.trim()).filter(Boolean).map(line => JSON.parse(line));
  for (const row of rows) {
    for (const key of required) {
      if (!(key in row)) throw new Error(`missing required field: ${key}`);
    }
  }
  return rows as T[];
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/io.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add benchmarks/unity-baseline/v1 gitnexus/src/benchmark/types.ts gitnexus/src/benchmark/io.ts gitnexus/src/benchmark/io.test.ts
git commit -m "test: add benchmark dataset schema loader with validation"
```

### Task 2: Metric Scoring + Hard Gate Evaluator

**Files:**
- Create: `gitnexus/src/benchmark/scoring.ts`
- Create: `gitnexus/src/benchmark/scoring.test.ts`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/scoring.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePR, computeF1, evaluateGates } from './scoring.js';

test('computePR returns precision and recall', () => {
  const pr = computePR(9, 10, 12);
  assert.equal(pr.precision.toFixed(2), '0.90');
  assert.equal(pr.recall.toFixed(2), '0.75');
});

test('evaluateGates fails when one hard threshold fails', () => {
  const result = evaluateGates(
    { queryPrecision: 0.9, queryRecall: 0.84, contextImpactF1: 0.82, smokePassRate: 1, perfRegressionPct: 10 },
    { query: { precisionMin: 0.9, recallMin: 0.85 }, contextImpact: { f1Min: 0.8 }, smoke: { passRateMin: 1 }, performance: { analyzeTimeRegressionMaxPct: 15 } }
  );
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('query.recall'));
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/scoring.test.js`  
Expected: FAIL with missing exports.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/scoring.ts
import { Thresholds } from './types.js';

export function computePR(truePositive: number, predicted: number, gold: number) {
  const precision = predicted === 0 ? 0 : truePositive / predicted;
  const recall = gold === 0 ? 0 : truePositive / gold;
  return { precision, recall };
}

export function computeF1(precision: number, recall: number) {
  return (precision + recall) === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function evaluateGates(
  metrics: { queryPrecision: number; queryRecall: number; contextImpactF1: number; smokePassRate: number; perfRegressionPct: number },
  thresholds: Thresholds,
) {
  const failures: string[] = [];
  if (metrics.queryPrecision < thresholds.query.precisionMin) failures.push('query.precision');
  if (metrics.queryRecall < thresholds.query.recallMin) failures.push('query.recall');
  if (metrics.contextImpactF1 < thresholds.contextImpact.f1Min) failures.push('contextImpact.f1');
  if (metrics.smokePassRate < thresholds.smoke.passRateMin) failures.push('smoke.passRate');
  if (metrics.perfRegressionPct > thresholds.performance.analyzeTimeRegressionMaxPct) failures.push('performance.analyzeTimeRegression');
  return { pass: failures.length === 0, failures };
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/scoring.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/scoring.ts gitnexus/src/benchmark/scoring.test.ts
git commit -m "test: add benchmark scoring and hard-gate evaluator"
```

### Task 3: Tool Execution Adapter + Analyze Performance Capture

**Files:**
- Create: `gitnexus/src/benchmark/analyze-runner.ts`
- Create: `gitnexus/src/benchmark/tool-runner.ts`
- Create: `gitnexus/src/benchmark/analyze-runner.test.ts`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/analyze-runner.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeSummary } from './analyze-runner.js';

test('parseAnalyzeSummary extracts nodes/edges/time', () => {
  const sample = `
Repository indexed successfully (42.3s)
51,172 nodes | 108,578 edges | 2,545 clusters | 300 flows
`;
  const parsed = parseAnalyzeSummary(sample);
  assert.equal(parsed.totalSeconds, 42.3);
  assert.equal(parsed.nodes, 51172);
  assert.equal(parsed.edges, 108578);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/analyze-runner.test.js`  
Expected: FAIL with missing implementation.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/analyze-runner.ts
import { spawn } from 'node:child_process';

export function parseAnalyzeSummary(output: string) {
  const timeMatch = output.match(/indexed successfully \(([\d.]+)s\)/i);
  const graphMatch = output.match(/([\d,]+)\s+nodes\s+\|\s+([\d,]+)\s+edges/i);
  return {
    totalSeconds: timeMatch ? Number(timeMatch[1]) : NaN,
    nodes: graphMatch ? Number(graphMatch[1].replace(/,/g, '')) : NaN,
    edges: graphMatch ? Number(graphMatch[2].replace(/,/g, '')) : NaN,
  };
}

export async function runAnalyze(repoPath: string, extensions: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const p = spawn('node', ['dist/cli/index.js', 'analyze', '--force', '--extensions', extensions, repoPath], { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('close', code => {
      if (code !== 0) return reject(new Error(`analyze failed: ${code}`));
      resolve({ stdout, stderr });
    });
  });
}
```

```ts
// gitnexus/src/benchmark/tool-runner.ts
import { LocalBackend } from '../mcp/local/local-backend.js';
import { closeKuzu } from '../mcp/core/kuzu-adapter.js';

export async function createToolRunner() {
  const backend = new LocalBackend();
  const ok = await backend.init();
  if (!ok) throw new Error('No indexed repositories found. Run analyze first.');
  return {
    query: (params: any) => backend.callTool('query', params),
    context: (params: any) => backend.callTool('context', params),
    impact: (params: any) => backend.callTool('impact', params),
    close: async () => { await closeKuzu(); },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/analyze-runner.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/analyze-runner.ts gitnexus/src/benchmark/tool-runner.ts gitnexus/src/benchmark/analyze-runner.test.ts
git commit -m "feat: add analyze execution and benchmark tool adapter"
```

### Task 4: Golden/Smoke Evaluators + Failure Triage

**Files:**
- Create: `gitnexus/src/benchmark/evaluators.ts`
- Create: `gitnexus/src/benchmark/evaluators.test.ts`
- Create: `gitnexus/src/benchmark/report.ts`

**Step 1: Write the failing test**

```ts
// gitnexus/src/benchmark/evaluators.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFailureTriage } from './evaluators.js';

test('buildFailureTriage groups repeated failure classes', () => {
  const triage = buildFailureTriage([
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'impact-downstream-zero' },
  ]);
  assert.equal(triage[0].kind, 'ambiguous-name-wrong-hit');
  assert.equal(triage[0].count, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/evaluators.test.js`  
Expected: FAIL with missing implementation.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/benchmark/evaluators.ts
export function buildFailureTriage(failures: Array<{ kind: string }>) {
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f.kind, (counts.get(f.kind) || 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
```

```ts
// gitnexus/src/benchmark/report.ts
import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeReports(reportDir: string, jsonReport: unknown, markdown: string) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'benchmark-report.json'), JSON.stringify(jsonReport, null, 2), 'utf-8');
  await fs.writeFile(path.join(reportDir, 'benchmark-summary.md'), markdown, 'utf-8');
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/evaluators.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/evaluators.ts gitnexus/src/benchmark/evaluators.test.ts gitnexus/src/benchmark/report.ts
git commit -m "feat: add benchmark evaluators and failure triage reporting"
```

### Task 5: Orchestrator + `benchmark-unity` CLI Command

**Files:**
- Create: `gitnexus/src/benchmark/runner.ts`
- Create: `gitnexus/src/cli/benchmark-unity.ts`
- Modify: `gitnexus/src/cli/index.ts`
- Create: `gitnexus/src/cli/benchmark-unity.test.ts`

**Step 1: Write the failing test**

```ts
// gitnexus/src/cli/benchmark-unity.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfileConfig } from './benchmark-unity.js';

test('quick profile uses reduced sample limits', () => {
  const c = resolveProfileConfig('quick');
  assert.equal(c.maxSymbols, 10);
  assert.equal(c.maxTasks, 5);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-unity.test.js`  
Expected: FAIL with missing command module/exports.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/cli/benchmark-unity.ts
import path from 'node:path';
import { loadBenchmarkDataset } from '../benchmark/io.js';
import { runBenchmark } from '../benchmark/runner.js';

export function resolveProfileConfig(profile: string) {
  if (profile === 'quick') return { maxSymbols: 10, maxTasks: 5 };
  return { maxSymbols: Number.MAX_SAFE_INTEGER, maxTasks: Number.MAX_SAFE_INTEGER };
}

export async function benchmarkUnityCommand(dataset: string, options: { profile?: string; repo?: string; targetPath?: string; reportDir?: string; extensions?: string; skipAnalyze?: boolean }) {
  const profile = options.profile || 'quick';
  const config = resolveProfileConfig(profile);
  const datasetRoot = path.resolve(dataset);
  const ds = await loadBenchmarkDataset(datasetRoot);
  const result = await runBenchmark(ds, {
    repo: options.repo,
    targetPath: options.targetPath,
    profile: config,
    reportDir: options.reportDir,
    extensions: options.extensions || '.cs',
    skipAnalyze: options.skipAnalyze ?? false
  });
  process.stderr.write(`${result.pass ? 'PASS' : 'FAIL'}\n`);
  if (!result.pass) process.exitCode = 1;
}
```

```ts
// gitnexus/src/cli/index.ts (add command)
import { benchmarkUnityCommand } from './benchmark-unity.js';

program
  .command('benchmark-unity <dataset>')
  .description('Run Unity accuracy baseline and hard-gated regression checks')
  .option('-p, --profile <profile>', 'quick or full', 'quick')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--target-path <path>', 'Path to analyze before evaluation (required unless --skip-analyze)')
  .option('--report-dir <path>', 'Output directory for benchmark-report.json and benchmark-summary.md', '.gitnexus/benchmark')
  .option('--extensions <list>', 'Analyze extension filter (default: .cs)', '.cs')
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(benchmarkUnityCommand);
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-unity.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/runner.ts gitnexus/src/cli/benchmark-unity.ts gitnexus/src/cli/index.ts gitnexus/src/cli/benchmark-unity.test.ts
git commit -m "feat: add benchmark-unity orchestration command"
```

### Task 6: Package Scripts + CI Quick/Full Wiring

**Files:**
- Modify: `gitnexus/package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/unity-benchmark-nightly.yml`

**Step 1: Write the failing test/check**

Add CI expectation: quick benchmark command runs in PR job (fixture dataset) and returns non-zero on threshold breach.

**Step 2: Run check to verify it fails (before scripts/workflow updates)**

Run: `cd gitnexus && npm run benchmark:quick`  
Expected: FAIL because script does not exist.

**Step 3: Write minimal implementation**

```json
// gitnexus/package.json (scripts section)
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/cli/index.ts",
    "prepare": "npm run build",
    "test:benchmark": "npm run build && node --test dist/benchmark dist/cli",
    "benchmark:quick": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/v1 --profile quick --target-path ../benchmarks/fixtures/unity-mini",
    "benchmark:full": "npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/v1 --profile full --target-path ../benchmarks/fixtures/unity-mini"
  }
}
```

```yaml
# .github/workflows/ci.yml (append benchmark job)
  benchmark_quick:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: gitnexus/package-lock.json
      - run: npm ci
        working-directory: gitnexus
      - run: npm run benchmark:quick
        working-directory: gitnexus
```

**Step 4: Run check to verify it passes**

Run: `cd gitnexus && npm run test:benchmark && npm run benchmark:quick`  
Expected: PASS locally with quick dataset.

**Step 5: Commit**

```bash
git add gitnexus/package.json .github/workflows/ci.yml .github/workflows/unity-benchmark-nightly.yml
git commit -m "ci: add unity benchmark quick gate and nightly full run"
```

### Task 7: User Docs + Failure Playbook

**Files:**
- Modify: `gitnexus/README.md`
- Create: `docs/2026-02-28-unity-benchmark-usage.md`

**Step 1: Write the failing check**

Define documentation acceptance checks:
- command examples for quick/full
- threshold table
- failure triage categories and next-action mapping

**Step 2: Run check to verify it fails**

Run: `rg -n "benchmark-unity|query precision|failure triage" gitnexus/README.md docs/2026-02-28-unity-benchmark-usage.md`  
Expected: FAIL/empty for missing docs.

**Step 3: Write minimal implementation**

```md
# Example snippets to add
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile quick
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile full
```

Include:
- strict thresholds (`0.90/0.85`, `F1>=0.80`, `smoke=100%`, `perf<=+15%`)
- report file paths
- triage mapping:
  - `ambiguous-name-wrong-hit` -> disambiguation ranking logic
  - `context-empty-refs` -> class/interface fallback
  - `impact-downstream-zero` -> minConfidence/seed rules

**Step 4: Run check to verify it passes**

Run: `rg -n "benchmark-unity|0.90|0.85|0.80|\\+15%|ambiguous-name-wrong-hit" gitnexus/README.md docs/2026-02-28-unity-benchmark-usage.md`  
Expected: PASS with matches.

**Step 5: Commit**

```bash
git add gitnexus/README.md docs/2026-02-28-unity-benchmark-usage.md
git commit -m "docs: add unity benchmark usage and failure playbook"
```

## Final Verification Checklist

Run in order:

```bash
cd gitnexus
npm ci
npm run test:benchmark
npm run benchmark:quick
npm run benchmark:full
```

Expected:

1. Tests pass.
2. Quick benchmark passes in < full runtime.
3. `benchmark-report.json` and `benchmark-summary.md` generated.
4. Non-zero exit code on any threshold regression.
