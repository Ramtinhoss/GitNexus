# Neonspark Full-Build U2 E2E Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fail-fast, report-driven end-to-end validation flow that runs full neonspark indexing and verifies all U2 capabilities with timing/token evidence.

**Architecture:** Add a dedicated benchmark runner under `gitnexus/src/benchmark/u2-e2e/` that executes staged gates: preflight, pipeline/analyze timing capture, estimate comparison, and symbol retrieval validation. The runner is intentionally non-self-healing: each gate hard-fails on errors and writes checkpoint artifacts so humans can intervene and resume. Retrieval verification is scenario-config driven and records per-tool-call duration plus token estimates (`chars/4`) for all outputs.

**Tech Stack:** TypeScript (Node ESM), GitNexus CLI + LocalBackend tools (`query/context/impact/cypher`), Node test runner (`node:test`), JSON/JSONL/Markdown report outputs.

---

### Task 1: Define E2E config and symbol scenario contracts

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/config.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/config.test.ts`
- Create: `benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json`
- Create: `benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadE2EConfig } from './config.js';

test('loadE2EConfig reads estimate range and 5 symbol scenarios', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  assert.equal(config.estimateRangeSec.lower, 322.6);
  assert.equal(config.estimateRangeSec.upper, 540.1);
  assert.equal(config.symbolScenarios.length, 5);
  assert.deepEqual(
    config.symbolScenarios.map((s) => s.symbol),
    ['MainUIManager', 'CoinPowerUp', 'GlobalDataAssets', 'AssetRef', 'PlayerActor'],
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/config.test.js`  
Expected: FAIL (missing module/file).

**Step 3: Write minimal implementation**

```ts
export interface E2EConfig {
  runIdPrefix: string;
  targetPath: string;
  repoAliasPrefix: string;
  scope: { scriptPrefixes: string[]; resourcePrefixes: string[] };
  estimateRangeSec: { lower: number; upper: number };
  symbolScenarios: SymbolScenario[];
}

export interface SymbolScenario {
  symbol: string;
  kind: 'component' | 'scriptableobject' | 'serializable-class' | 'partial-component';
  objectives: string[];
  contextFileHint?: string;
  deepDivePlan: Array<{ tool: 'query' | 'context' | 'impact' | 'cypher'; input: Record<string, unknown> }>;
}
```

**Step 4: Author concrete scenario JSON**

```json
{
  "symbol": "MainUIManager",
  "kind": "component",
  "objectives": [
    "验证组件 resourceBindings 与 resolvedReferences 的可消费结构",
    "验证 context off/on 行为差异"
  ],
  "deepDivePlan": [
    { "tool": "query", "input": { "query": "MainUIManager", "goal": "Find UI resource targets" } },
    { "tool": "impact", "input": { "target": "MainUIManager", "direction": "upstream" } }
  ]
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/config.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/config.ts gitnexus/src/benchmark/u2-e2e/config.test.ts benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json
git commit -m "feat(benchmark): add neonspark u2 e2e config and symbol scenarios"
```

### Task 2: Add token/timing metric utilities

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/metrics.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/metrics.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, summarizeDurations } from './metrics.js';

test('estimateTokens uses chars-per-token heuristic', () => {
  assert.equal(estimateTokens('1234'), 1);
  assert.equal(estimateTokens('12345'), 2);
});

test('summarizeDurations computes median/min/max', () => {
  const out = summarizeDurations([50, 100, 150]);
  assert.equal(out.medianMs, 100);
  assert.equal(out.minMs, 50);
  assert.equal(out.maxMs, 150);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/metrics.test.js`  
Expected: FAIL (module missing).

**Step 3: Write minimal implementation**

```ts
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

export function summarizeDurations(values: number[]) {
  // returns min/max/mean/median/spread
}
```

**Step 4: Add per-step metric type**

```ts
export interface StepMetric {
  stepId: string;
  tool: string;
  durationMs: number;
  inputChars: number;
  outputChars: number;
  inputTokensEst: number;
  outputTokensEst: number;
  totalTokensEst: number;
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/metrics.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/metrics.ts gitnexus/src/benchmark/u2-e2e/metrics.test.ts
git commit -m "feat(benchmark): add u2 e2e timing and token metric utilities"
```

### Task 3: Implement analyze log parser and estimate comparator

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/analyze-parser.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/analyze-parser.test.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/__fixtures__/analyze.log`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeSummary, compareEstimate } from './analyze-parser.js';

test('parseAnalyzeSummary extracts totalSec and kuzu/fts sec', async () => {
  const summary = await parseAnalyzeSummary('__fixtures__/analyze.log');
  assert.equal(summary.totalSec, 114.8);
  assert.equal(summary.kuzuSec, 73.5);
  assert.equal(summary.ftsSec, 19.6);
});

test('compareEstimate marks in-range status', () => {
  const verdict = compareEstimate(500, { lower: 322.6, upper: 540.1 });
  assert.equal(verdict.status, 'in-range');
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/analyze-parser.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
export interface AnalyzeSummary { totalSec: number; kuzuSec: number; ftsSec: number; nodes?: number; edges?: number; }
export function compareEstimate(actualSec: number, range: { lower: number; upper: number }) {
  // returns inRange + delta + status
}
```

**Step 4: Parse `/usr/bin/time -p` and CLI summary lines**

```ts
// parse either:
// "Repository indexed successfully (114.8s)"
// "KuzuDB 73.5s | FTS 19.6s"
// "real 530.73"
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/analyze-parser.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/analyze-parser.ts gitnexus/src/benchmark/u2-e2e/analyze-parser.test.ts gitnexus/src/benchmark/u2-e2e/__fixtures__/analyze.log
git commit -m "feat(benchmark): add analyze log parser and estimate comparison"
```

### Task 4: Build retrieval executor for context + purpose-driven deep dive

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSymbolScenario } from './retrieval-runner.js';

test('runSymbolScenario executes context off/on + deepDive and records metrics', async () => {
  const out = await runSymbolScenario(mockToolRunner, {
    symbol: 'MainUIManager',
    objectives: ['verify context'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });
  assert.equal(out.steps.length, 3); // context off, context on, query
  assert.ok(out.steps.every((s) => s.durationMs >= 0));
  assert.ok(out.steps.every((s) => s.totalTokensEst >= 0));
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
export async function runSymbolScenario(runner: ToolRunner, scenario: SymbolScenario, repo: string) {
  // fixed prefix:
  // 1) context(off)
  // 2) context(on)
  // then scenario.deepDivePlan
  // every call records duration + token estimates
}
```

**Step 4: Add symbol-level assertions**

```ts
// MainUIManager / PlayerActor: require resourceBindings in context(on)
// CoinPowerUp / GlobalDataAssets: require asset-type binding or resolved references evidence
// AssetRef: allow empty resourceBindings but require non-empty usage/dependency evidence from deep dive
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "feat(benchmark): add u2 e2e symbol retrieval runner"
```

### Task 5: Implement fail-fast staged orchestrator (no auto-recovery)

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/neonspark-full-e2e.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/neonspark-full-e2e.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { runE2E } from './neonspark-full-e2e.js';

test('runE2E stops on first gate failure and writes checkpoint', async () => {
  const out = await runE2E(failingDeps);
  assert.equal(out.status, 'failed');
  assert.equal(out.failedGate, 'build');
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/neonspark-full-e2e.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// gates:
// preflight -> build -> pipeline-profile -> analyze -> estimate-compare -> retrieval -> final-report
// if any gate fails:
//   write checkpoint.json + exitCode=1
// no retries/no fallback mutation/no auto adjustment
```

**Step 4: Wire exact commands**

```ts
// npm --prefix gitnexus run build
// npm --prefix gitnexus run benchmark:u2:sample -- --target-path ... --runs 1 ...
// /usr/bin/time -p node dist/cli/index.js analyze ... --scope-prefix Assets --scope-prefix Packages --extensions .cs
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/neonspark-full-e2e.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/neonspark-full-e2e.ts gitnexus/src/benchmark/u2-e2e/neonspark-full-e2e.test.ts
git commit -m "feat(benchmark): add fail-fast neonspark u2 e2e orchestrator"
```

### Task 6: Write report emitters (JSON/JSONL/Markdown)

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/report.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/report.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalVerdictMarkdown } from './report.js';

test('buildFinalVerdictMarkdown includes estimate comparison and symbol outcomes', () => {
  const md = buildFinalVerdictMarkdown(sampleResult);
  assert.match(md, /Estimate Comparison/);
  assert.match(md, /MainUIManager/);
  assert.match(md, /CoinPowerUp/);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/report.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// write files:
// preflight.json, scope-counts.json, pipeline-profile.json, analyze-summary.json
// estimate-comparison.json/md
// retrieval-steps.jsonl, retrieval-summary.json/md
// final-verdict.md
```

**Step 4: Include mandatory sections in markdown**

```md
## Build Timings
## Estimate Comparison
## U2 Capability Checks by Symbol
## Token Consumption Summary
## Failures and Manual Actions
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/report.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e/report.ts gitnexus/src/benchmark/u2-e2e/report.test.ts
git commit -m "feat(benchmark): add u2 e2e report writers"
```

### Task 7: Expose CLI entry and npm script

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/package.json`
- Create: `gitnexus/src/cli/benchmark-u2-e2e.ts`
- Create: `gitnexus/src/cli/benchmark-u2-e2e.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveU2E2EArgs } from './benchmark-u2-e2e.js';

test('benchmark-u2-e2e resolves config and report directory', () => {
  const out = resolveU2E2EArgs(['--config', 'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json']);
  assert.match(out.configPath, /neonspark-full-u2-e2e\\.config\\.json$/);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-u2-e2e.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
program
  .command('benchmark-u2-e2e')
  .option('--config <path>')
  .option('--report-dir <path>')
  .action(benchmarkU2E2ECommand);
```

**Step 4: Add package script**

```json
"benchmark:u2:e2e": "npm run build && node dist/cli/index.js benchmark-u2-e2e --config ../benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json"
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-u2-e2e.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/cli/index.ts gitnexus/src/cli/benchmark-u2-e2e.ts gitnexus/src/cli/benchmark-u2-e2e.test.ts gitnexus/package.json
git commit -m "feat(cli): add benchmark-u2-e2e command for neonspark u2 validation"
```

### Task 8: Execute full neonspark run and archive evidence

**Files:**
- Create: `docs/reports/<RUN_ID>/` (runtime output directory)
- Modify: `docs/reports/README.md` (append new report index entry if present)
- Modify: `/Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`

**Step 1: Run full benchmark command**

Run:

```bash
cd gitnexus
npm run benchmark:u2:e2e
```

Expected: command completes with all mandatory artifacts written under `docs/reports/<RUN_ID>/`.

**Step 2: Verify generated artifacts**

Run:

```bash
test -f ../docs/reports/<RUN_ID>/analyze-summary.json
test -f ../docs/reports/<RUN_ID>/estimate-comparison.json
test -f ../docs/reports/<RUN_ID>/retrieval-summary.json
test -f ../docs/reports/<RUN_ID>/final-verdict.md
```

Expected: all checks pass.

**Step 3: Validate quality gates**

Run:

```bash
cat ../docs/reports/<RUN_ID>/estimate-comparison.json
cat ../docs/reports/<RUN_ID>/retrieval-summary.json
```

Expected:
- estimate comparison has `status` + `inRange` fields.
- five symbols each have `context(off/on)` and deep-dive records with `durationMs` + `totalTokensEst`.

**Step 4: Update progress doc with measured outcome**

Record:
- actual end-to-end build time
- estimate comparison result
- per-symbol retrieval verification outcome
- token/duration summary

**Step 5: Verification + commit**

Run:

```bash
cd /Users/nantasmac/projects/agentic/GitNexus
npm --prefix gitnexus run build
node --test gitnexus/dist/benchmark/u2-e2e/*.test.js gitnexus/dist/cli/benchmark-u2-e2e.test.js
```

Expected: PASS.

```bash
git add gitnexus/src/benchmark/u2-e2e gitnexus/src/cli/benchmark-u2-e2e.ts gitnexus/src/cli/benchmark-u2-e2e.test.ts gitnexus/src/cli/index.ts gitnexus/package.json docs/reports /Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus_Progress.md
git commit -m "test(benchmark): run neonspark full-build u2 e2e validation with estimate comparison and retrieval metrics"
```

---

## Execution Notes

1. This plan is intentionally **fail-fast and non-self-healing**. If any gate fails, stop and apply `@systematic-debugging` before re-running from the failed gate.
2. Before claiming completion, run `@verification-before-completion` with fresh command evidence.
3. Preferred execution mode: dedicated worktree + `@executing-plans` task-by-task.
