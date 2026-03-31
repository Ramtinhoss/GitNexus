# Agent Refactor Context Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new scenario-based benchmark suite that evaluates coding-agent refactor context coverage and collection efficiency (including `cypher`), while preserving current `benchmark-unity` behavior as the stable baseline gate.

**Architecture:** Implement a parallel benchmark pipeline under `gitnexus/src/benchmark/agent-context/` with its own dataset contract (`thresholds.json` + `scenarios.jsonl`), runner, scoring, and reports. Expose it through a dedicated CLI command and npm scripts. Keep existing `benchmark-unity` code path untouched except for shared plumbing that is explicitly backward-compatible.

**Tech Stack:** TypeScript (Node 18+), existing GitNexus LocalBackend tools (`query/context/impact/cypher`), Node test runner, existing report writer.

---

### Task 1: Add Agent-Context Dataset Schema and Loader

**Files:**
- Create: `gitnexus/src/benchmark/agent-context/types.ts`
- Create: `gitnexus/src/benchmark/agent-context/io.ts`
- Create: `gitnexus/src/benchmark/agent-context/io.test.ts`
- Create: `gitnexus/src/benchmark/agent-context/__fixtures__/valid/thresholds.json`
- Create: `gitnexus/src/benchmark/agent-context/__fixtures__/valid/scenarios.jsonl`
- Create: `gitnexus/src/benchmark/agent-context/__fixtures__/invalid/missing-checks/scenarios.jsonl`

**Step 1: Write the failing test**

```ts
test('loadAgentContextDataset validates required scenario fields', async () => {
  await expect(loadAgentContextDataset(invalidRoot)).rejects.toThrow(/missing required field/i);
});

test('loadAgentContextDataset loads valid thresholds and scenarios', async () => {
  const ds = await loadAgentContextDataset(validRoot);
  expect(ds.scenarios.length).toBe(1);
  expect(ds.thresholds.coverage.minPerScenario).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/io.test.js`  
Expected: `FAIL` because loader/types do not exist yet.

**Step 3: Write minimal implementation**

```ts
export interface AgentContextScenario { /* scenario_id, target_uid, tool_plan, checks */ }
export async function loadAgentContextDataset(root: string): Promise<AgentContextDataset> {
  // read thresholds.json + scenarios.jsonl, validate required keys, return parsed object
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/io.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/types.ts gitnexus/src/benchmark/agent-context/io.ts gitnexus/src/benchmark/agent-context/io.test.ts gitnexus/src/benchmark/agent-context/__fixtures__/valid/thresholds.json gitnexus/src/benchmark/agent-context/__fixtures__/valid/scenarios.jsonl gitnexus/src/benchmark/agent-context/__fixtures__/invalid/missing-checks/scenarios.jsonl
git commit -m "feat: add agent-context dataset schema and loader"
```

### Task 2: Add Tool Runner That Supports Cypher

**Files:**
- Create: `gitnexus/src/benchmark/agent-context/tool-runner.ts`
- Create: `gitnexus/src/benchmark/agent-context/tool-runner.test.ts`

**Step 1: Write the failing test**

```ts
test('agent-context tool runner exposes query/context/impact/cypher', async () => {
  const runner = await createAgentContextToolRunner();
  expect(typeof runner.cypher).toBe('function');
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/tool-runner.test.js`  
Expected: `FAIL`.

**Step 3: Write minimal implementation**

```ts
return {
  query: (params) => backend.callTool('query', params),
  context: (params) => backend.callTool('context', params),
  impact: (params) => backend.callTool('impact', params),
  cypher: (params) => backend.callTool('cypher', params),
};
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/tool-runner.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/tool-runner.ts gitnexus/src/benchmark/agent-context/tool-runner.test.ts
git commit -m "feat: add agent-context tool runner with cypher support"
```

### Task 3: Implement Check Evaluators (T/U/D/B/I/E)

**Files:**
- Create: `gitnexus/src/benchmark/agent-context/evaluators.ts`
- Create: `gitnexus/src/benchmark/agent-context/evaluators.test.ts`

**Step 1: Write the failing test**

```ts
test('evaluates mandatory target disambiguation check T', () => {
  const result = evaluateCheckT(stepOutputs, expectedUid);
  expect(result.pass).toBe(true);
});

test('evaluates efficiency check E by tool call budget', () => {
  const result = evaluateCheckE(3, 4);
  expect(result.pass).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/evaluators.test.js`  
Expected: `FAIL`.

**Step 3: Write minimal implementation**

```ts
export function evaluateScenarioChecks(/* outputs, checks */) {
  // resolve T/U/D/B/I/E checks and return per-check verdicts
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/evaluators.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/evaluators.ts gitnexus/src/benchmark/agent-context/evaluators.test.ts
git commit -m "feat: add agent-context check evaluators"
```

### Task 4: Implement Scenario Runner and Aggregate Scoring

**Files:**
- Create: `gitnexus/src/benchmark/agent-context/runner.ts`
- Create: `gitnexus/src/benchmark/agent-context/runner.test.ts`

**Step 1: Write the failing test**

```ts
test('runner computes per-scenario coverage and suite averages', async () => {
  const result = await runAgentContextBenchmark(dataset, options);
  expect(result.metrics.avgCoverage).toBeGreaterThan(0);
  expect(result.scenarios[0].checks.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/runner.test.js`  
Expected: `FAIL`.

**Step 3: Write minimal implementation**

```ts
for (const scenario of ds.scenarios) {
  const stepOutputs = await executeToolPlan(scenario.tool_plan, runner);
  const checks = evaluateScenarioChecks(stepOutputs, scenario.checks);
  // compute coverage and calls
}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/runner.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/runner.ts gitnexus/src/benchmark/agent-context/runner.test.ts
git commit -m "feat: add agent-context benchmark runner and scoring"
```

### Task 5: Add Report Serialization and Markdown Summary

**Files:**
- Create: `gitnexus/src/benchmark/agent-context/report.ts`
- Create: `gitnexus/src/benchmark/agent-context/report.test.ts`
- Modify: `gitnexus/src/benchmark/report.ts` (only if shared helper reuse is needed)

**Step 1: Write the failing test**

```ts
test('writes benchmark-report.json and benchmark-summary.md with scenario breakdown', async () => {
  await writeAgentContextReports(outDir, result);
  // assert files exist and summary contains scenario id + coverage
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/report.test.js`  
Expected: `FAIL`.

**Step 3: Write minimal implementation**

```ts
await writeReports(reportDir, jsonPayload, markdownSummary);
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/report.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context/report.ts gitnexus/src/benchmark/agent-context/report.test.ts gitnexus/src/benchmark/report.ts
git commit -m "feat: add agent-context report generation"
```

### Task 6: Add CLI Command `benchmark-agent-context`

**Files:**
- Create: `gitnexus/src/cli/benchmark-agent-context.ts`
- Modify: `gitnexus/src/cli/index.ts`
- Create: `gitnexus/src/cli/benchmark-agent-context.test.ts`

**Step 1: Write the failing test**

```ts
test('benchmark-agent-context resolves profile and runs runner', async () => {
  // verify quick/full profile mapping and report path output
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-agent-context.test.js`  
Expected: `FAIL`.

**Step 3: Write minimal implementation**

```ts
program
  .command('benchmark-agent-context <dataset>')
  .option('-p, --profile <profile>', 'quick or full', 'quick')
  .action(benchmarkAgentContextCommand);
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/cli/benchmark-agent-context.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/benchmark-agent-context.ts gitnexus/src/cli/index.ts gitnexus/src/cli/benchmark-agent-context.test.ts
git commit -m "feat: add benchmark-agent-context CLI command"
```

### Task 7: Add V1 Scenario Dataset (3 Scenarios)

**Files:**
- Create: `benchmarks/agent-context/neonspark-refactor-v1/thresholds.json`
- Create: `benchmarks/agent-context/neonspark-refactor-v1/scenarios.jsonl`
- Create: `benchmarks/agent-context/neonspark-refactor-v1/README.md`

**Step 1: Write the failing test**

```ts
test('v1 scenario dataset loads exactly 3 scenarios', async () => {
  const ds = await loadAgentContextDataset(v1Root);
  expect(ds.scenarios).toHaveLength(3);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/io.test.js`  
Expected: `FAIL` until dataset exists and validates.

**Step 3: Write minimal implementation**

```json
{"scenario_id":"minionsmanager-refactor-context","target_uid":"Class:...:MinionsManager","tool_plan":[...],"checks":[...]}
{"scenario_id":"mainuimanager-refactor-context","target_uid":"Class:...:MainUIManager","tool_plan":[...],"checks":[...]}
{"scenario_id":"mirrornetmgr-refactor-context","target_uid":"Class:...:MirrorNetMgr","tool_plan":[...],"checks":[...]}
```

**Step 4: Run test to verify it passes**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/agent-context/io.test.js`  
Expected: `PASS`.

**Step 5: Commit**

```bash
git add benchmarks/agent-context/neonspark-refactor-v1/thresholds.json benchmarks/agent-context/neonspark-refactor-v1/scenarios.jsonl benchmarks/agent-context/neonspark-refactor-v1/README.md
git commit -m "data: add neonspark refactor context v1 scenarios"
```

### Task 8: Add Scripts, Docs, and Nightly Integration (Non-Gating)

**Files:**
- Modify: `gitnexus/package.json`
- Modify: `README.md`
- Create: `docs/2026-03-03-agent-context-benchmark-usage.md`
- Modify: `.github/workflows/unity-benchmark-nightly.yml`

**Step 1: Write the failing test / check**

```bash
cd gitnexus
npm run benchmark:agent-context:quick
```

Expected: command missing before script wiring.

**Step 2: Run check to verify it fails**

Run: `cd gitnexus && npm run benchmark:agent-context:quick`  
Expected: `Missing script`.

**Step 3: Write minimal implementation**

```json
"benchmark:agent-context:quick": "npm run build && node dist/cli/index.js benchmark-agent-context ../benchmarks/agent-context/neonspark-refactor-v1 --profile quick --target-path /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt",
"benchmark:agent-context:full": "npm run build && node dist/cli/index.js benchmark-agent-context ../benchmarks/agent-context/neonspark-refactor-v1 --profile full --target-path /Volumes/Shuttle/unity-projects/neonspark --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt"
```

**Step 4: Run check to verify it passes**

Run:
- `cd gitnexus && npm run benchmark:agent-context:quick`
- `cd gitnexus && npm run benchmark:agent-context:full`

Expected: both complete with report output path and pass/fail verdicts.

**Step 5: Commit**

```bash
git add gitnexus/package.json README.md docs/2026-03-03-agent-context-benchmark-usage.md .github/workflows/unity-benchmark-nightly.yml
git commit -m "docs(ci): wire agent-context benchmark scripts and nightly run"
```

### Task 9: Full Verification and Baseline Protection Check

**Files:**
- Modify: `docs/reports/` artifacts as needed (if committed policy requires)
- Modify: `docs/reports/2026-03-03-agent-context-*.md` (new run summary)

**Step 1: Write verification checklist (failing until complete)**

```md
- [ ] Existing baseline benchmark unchanged and passing
- [ ] Agent-context quick/full executable
- [ ] Scenario report includes per-check verdicts
```

**Step 2: Run verification commands**

Run:
- `cd gitnexus && npm run test:benchmark`
- `cd gitnexus && npm run benchmark:neonspark:v2:quick`
- `cd gitnexus && npm run benchmark:agent-context:quick`
- `cd gitnexus && npm run benchmark:agent-context:full`

Expected:
- existing baseline remains `PASS`
- new suite produces reports with scenario coverage + efficiency metrics.

**Step 3: Fix minimal regressions if any**

```ts
// only adjust agent-context runner/dataset thresholds if baseline checks fail
```

**Step 4: Re-run verification until all checks pass**

Run same command set above.  
Expected: all pass conditions met.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-context gitnexus/src/cli/benchmark-agent-context.ts gitnexus/src/cli/index.ts gitnexus/package.json benchmarks/agent-context/neonspark-refactor-v1 docs/2026-03-03-agent-context-benchmark-usage.md .github/workflows/unity-benchmark-nightly.yml docs/reports
git commit -m "feat: add agent refactor context benchmark v1"
```

## Notes for Implementation Session

1. Do not alter existing `benchmark-unity` metric semantics.
2. Keep new suite output in separate report directory and schema.
3. Use strict UID checks for required/forbidden logic where possible.
4. Keep scenario configs small and reviewable; avoid overfitting query text.
5. Prefer deterministic thresholds and explicit failure messages.
