# Prefab Source Streaming Consumption Memory Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变 Unity 资源绑定主线职责边界与图谱契约的前提下，将 prefab-source 从“全量数组交付 + 二次全量消费”改为“scan-context 流式交付 + Phase 5.5 增量消费”，降低 ON 模式下构建 RSS 峰值。

**Architecture:** 保持 `scan-context` 作为 carrier、`processUnityResources` 作为统一消费点不变；仅重构数据交付形态为流式迭代（或回调）并在消费端执行按信号类型的确定性过滤与分区去重。新增可审计计数器，保证 `rows_parsed = filtered + deduped + emitted`，避免“看起来通过”的假合规。

**Tech Stack:** TypeScript, Node.js stream/readline, Node test runner (`node --test`), Vitest (`npm --prefix gitnexus test`), GitNexus ingestion pipeline

---

## Execution Preconditions

1. 读取 `.codex/preflight_cache.json`，确认 `worktree-exempt=false` 时在隔离 worktree 执行。
2. 读取 `UNITY_RESOURCE_BINDING.md` 第三节主线定义，确保职责边界不偏移。
3. 使用当前设计文档作为唯一需求源：`docs/plans/2026-04-10-prefab-source-streaming-consumption-memory-optimization-design.md`。

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added stream contract tests and carrier-boundary test; `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js` passed.
Task 2 | completed | `streamPrefabSourceRefs` supports incremental yield, hooks, optional bounded queue; `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js` passed.
Task 3 | completed | Processor now `for await` consumes stream and emits accounting counters; `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js` passed.
Task 4 | completed | Added anti-fake tests for cross-signal, filtered counters, per-file isolation; `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/ingestion/unity-resource-processor.test.js` passed.
Task 5 | completed | Updated doc-contract assertions + docs wording to streaming carrier-consumer contract; `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js` passed.
Task 6 | completed | Generated OFF/ON logs and report; parity+toggled evidence+raw RSS fields+recomputed deltas all pass closure checks.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 carrier/consumer boundary stays intact (`scan-context` 不写图, `processUnityResources` 统一写图) | critical | Task 1, Task 3, Task 5 | `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js dist/core/unity/doc-contract.test.js` | `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::scan-context producer is consumed by processUnityResources only` | `scan-context directly writes relationships or processor bypasses producer`
DC-02 same source file can emit two independent signal rows (script-guid + prefab-source), no key collision | critical | Task 1, Task 2, Task 4 | `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js` | `gitnexus/src/core/unity/prefab-source-scan.test.ts::same source emits separate signal rows` | `rows merged into one polymorphic row or dedupe cross-signal drops valid row`
DC-03 prefab-source delivery is streaming/incremental (no required full-array accumulation before consume) | critical | Task 2, Task 3 | `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/unity/prefab-source-scan.test.ts::does not open second file before first row yield`; `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::consumer handles chunked rows` | `producer pre-collects all files before first row`
DC-04 deterministic filtering + de-dup + accounting invariant (`parsed = filtered + deduped + emitted`) | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::prefab-source counters satisfy accounting invariant` | `counter mismatch or invalid row emitted`
DC-05 ON/OFF A/B report remains auditable with command parity, raw RSS extraction, and recomputed Delta closure | critical | Task 6 | `bash -lc 'off_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log | sed -E "s/GITNEXUS_HOME=[^ ]+ //; s/GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 //") && on_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log | sed -E "s/GITNEXUS_HOME=[^ ]+ //") && test "$off_cmd" = "$on_cmd" && rg -n "prefab-source: skipped" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log && rg -n "prefab-source: emitted=" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log && rg -n "maximum resident set size|peak memory footprint" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log && node -e "const fs=require('fs');const off=fs.readFileSync('docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log','utf8');const on=fs.readFileSync('docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log','utf8');const rpt=fs.readFileSync('docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md','utf8');const num=(s)=>Number(String(s).replace(/,/g,''));const must=(txt,re,msg)=>{const m=txt.match(re);if(!m) throw new Error(msg);return m[1];};const offR=num(must(off,/^\\s*([0-9,]+)\\s+maximum resident set size$/m,'missing off rss'));const onR=num(must(on,/^\\s*([0-9,]+)\\s+maximum resident set size$/m,'missing on rss'));const offP=num(must(off,/^\\s*([0-9,]+)\\s+peak memory footprint$/m,'missing off peak'));const onP=num(must(on,/^\\s*([0-9,]+)\\s+peak memory footprint$/m,'missing on peak'));const dR=onR-offR;const dP=onP-offP;const repDR=num(must(rpt,/Delta \\(`max resident set size`\\):[\\s\\S]*?bytes:\\s*`([+\\-]?[0-9,]+)`/,'missing report rss delta'));const repDP=num(must(rpt,/Delta \\(`peak memory footprint`\\):[\\s\\S]*?bytes:\\s*`([+\\-]?[0-9,]+)`/,'missing report peak delta'));if(dR!==repDR) throw new Error('rss delta mismatch');if(dP!==repDP) throw new Error('peak delta mismatch');if(/__PLACEHOLDER__|TBD|N\\/A/i.test(rpt)) throw new Error('report contains placeholder');" && rg -n "Single variable|Evidence|off.log:[0-9]+|on.log:[0-9]+" docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md'` | `docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md::recomputed Delta bytes match logs` | `raw RSS lines missing or recomputed Delta mismatch or placeholder values present`

## Authenticity Assertions

1. `scan-context producer`（critical）
- `assert no placeholder path`: producer 输出的 `targetResourcePath` 不允许为 `__PLACEHOLDER__`。
- `assert separate signal rows`: 同一 source 文件同时命中 `m_Script` 和 `m_SourcePrefab` 时，必须产出两类 row，不允许“合并 row”。

2. `processUnityResources consumer`（critical）
- `assert live mode has tool evidence`: diagnostics 必须包含 `prefab-source: emitted=<n>` 且 `<n>` 与 `rows_emitted` 一致。
- `assert zero-guid filtered`: `00000000000000000000000000000000` 不能进入 `UNITY_ASSET_GUID_REF`。
- `assert accounting closure`: `rows_parsed = rows_filtered_zero_guid + rows_filtered_placeholder + rows_filtered_unresolved + rows_deduped + rows_emitted`。
- `assert emitted parity`: diagnostics 中 `prefab-source: emitted=<n>` 必须与 `prefab_source.rows_emitted=<n>` 完全相等。

3. `report evidence`（critical）
- `assert freeze requires non-empty confirmed_chain.steps`（adapted）: 报告必须包含非空证据链（命令、toggle 行、RSS 原始字段、Delta），不能只有结论性文字。

### Task 1: Add Contract Tests for Mainline Boundary and Dual-Signal Separation

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/unity/prefab-source-scan.test.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing tests**

```ts
// prefab-source-scan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { streamPrefabSourceRefs } from './prefab-source-scan.js';

test('same source can yield prefab-source rows while script-guid flow remains independent', async () => {
  const rows: any[] = [];
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: ['Assets/Scene/MainUIManager.unity'],
    assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
  })) {
    rows.push(row);
  }
  assert.ok(rows.length > 0);
  assert.equal(rows.every((r) => r.fieldName === 'm_SourcePrefab'), true);
});

// scan-context.test.ts
test('buildUnityScanContext keeps script-guid hits while exposing prefab-source producer', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.ok(context.guidToResourceHits.size > 0);
  assert.equal(typeof (context as any).streamPrefabSourceRefs, 'function');
});

// unity-resource-processor.test.ts
test('scan-context does not write graph edges directly; processor remains sole writer', async () => {
  const graph = createKnowledgeGraph();
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.equal([...graph.iterRelationships()].length, 0);
  await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => context as any,
  } as any);
  assert.ok([...graph.iterRelationships()].some((rel) => rel.type === 'UNITY_ASSET_GUID_REF'));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL because stream API contract does not exist yet.

**Step 3: Write minimal implementation hooks**

```ts
// scan-context.ts (shape only)
export interface UnityScanContext {
  // ...existing fields
  streamPrefabSourceRefs: () => AsyncIterable<UnityPrefabSourceRef>;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS for boundary + dual-signal contract checks.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/prefab-source-scan.test.ts gitnexus/src/core/unity/scan-context.test.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "test(unity): add streaming carrier boundary and dual-signal contracts"
```

### Task 2: Refactor Prefab Source Scanner to Streaming Producer

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/prefab-source-scan.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/prefab-source-scan.test.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write failing tests for incremental yield behavior**

```ts
test('streamPrefabSourceRefs does not open second file before first row is yielded', async () => {
  const probe: string[] = [];
  const iter = streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
    assetGuidToPath,
    hooks: {
      onFileOpen: (filePath) => probe.push(`open:${filePath}`),
      onYield: () => probe.push('yield'),
    },
  });
  const first = await iter[Symbol.asyncIterator]().next();
  assert.equal(first.done, false);
  assert.equal(first.value.fieldName, 'm_SourcePrefab');
  assert.equal(probe.includes('open:Assets/Prefabs/BattleMode.prefab'), false);
});

test('producer rows are immutable snapshots (consumer mutation does not backflow)', async () => {
  for await (const row of streamPrefabSourceRefs({ repoRoot: fixtureRoot, resourceFiles: scopedFiles, assetGuidToPath })) {
    const copy = { ...row };
    copy.targetResourcePath = '__PLACEHOLDER__';
  }
  // rerun and ensure producer output unaffected
  const again: any[] = [];
  for await (const row of streamPrefabSourceRefs({ repoRoot: fixtureRoot, resourceFiles: scopedFiles, assetGuidToPath })) again.push(row);
  assert.equal(again.some((r) => r.targetResourcePath === '__PLACEHOLDER__'), false);
});

test('bounded queue backpressure never exceeds configured depth when decoupled mode is enabled', async () => {
  const depthSamples: number[] = [];
  for await (const _row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
    queue: { enabled: true, maxDepth: 64 },
    hooks: { onQueueDepth: (d) => depthSamples.push(d) },
  })) {
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.equal(depthSamples.every((d) => d <= 64), true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js`
Expected: FAIL because scanner currently returns materialized array.

**Step 3: Write minimal implementation**

```ts
// prefab-source-scan.ts
export async function* streamPrefabSourceRefs(args: { ... }): AsyncGenerator<PrefabSourceScanRow> {
  // per-resource stream parse
  // yield normalized row immediately
}

// scan-context.ts
const streamPrefabSourceRefsFn = () => streamPrefabSourceRefs({
  repoRoot: input.repoRoot,
  resourceFiles: normalizedResourceFiles,
  assetGuidToPath,
});

return {
  ...,
  streamPrefabSourceRefs: streamPrefabSourceRefsFn,
  // keep prefabSourceRefs optional only for seed fallback path if needed
};
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/unity/scan-context.test.js`
Expected: PASS and anti-fake streaming check proves first row can appear before second file open.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/prefab-source-scan.ts gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/prefab-source-scan.test.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "refactor(unity): stream prefab-source rows from scan-context carrier"
```

### Task 3: Refactor Unified Consumer to Incremental Consumption + Partitioned Dedupe

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write failing tests for incremental consume and accounting counters**

```ts
test('processUnityResources consumes prefab-source stream incrementally and emits edges', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    ...baseContext,
    streamPrefabSourceRefs: async function* () {
      yield validRowA;
      yield validRowB;
    },
  } as any;

  const result = await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => fakeScanContext,
    resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
  });

  assert.ok(result.diagnostics.some((line) => line.includes('prefab-source: emitted=2')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_emitted=2')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_parsed=')));
});

test('prefab-source accounting invariant closes', async () => {
  const result = await runWithMixedRows();
  assert.equal(result.prefabSourceStats.rowsParsed,
    result.prefabSourceStats.rowsFilteredZeroGuid +
    result.prefabSourceStats.rowsFilteredPlaceholder +
    result.prefabSourceStats.rowsFilteredUnresolved +
    result.prefabSourceStats.rowsDeduped +
    result.prefabSourceStats.rowsEmitted);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL because processor does not yet consume stream + stats contract.

**Step 3: Write minimal implementation**

```ts
// unity-resource-processor.ts
async function emitPrefabSourceGuidRefsFromScanContext(graph: KnowledgeGraph, scanContext: UnityScanContext) {
  const stats = initPrefabSourceStats();
  const dedupeBySource = new Map<string, Set<string>>();

  for await (const row of scanContext.streamPrefabSourceRefs()) {
    stats.rowsParsed += 1;
    // filter -> dedupe -> addRelationship
    // maintain per-source dedupe set
  }

  diagnostics.push(`prefab_source.rows_emitted=${stats.rowsEmitted}`);
  diagnostics.push(`prefab_source.rows_parsed=${stats.rowsParsed}`);
  return stats;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS with emitted counters and accounting closure.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "refactor(unity): consume prefab-source carrier stream incrementally with accounting"
```

### Task 4: Add Anti-Fake Negative Tests for Collision, Dedupe, and Filter Integrity

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/prefab-source-scan.test.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write failing negative tests**

```ts
test('no cross-signal dedupe collision when same source has script-guid and prefab-source refs', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.ok(context.guidToResourceHits.size > 0);
  const emitted = await collectEmittedPrefabRows(context);
  assert.ok(emitted.length > 0);
});

test('drops placeholder/unresolved/zero-guid rows and reports filtered counters', async () => {
  const result = await runWithInvalidRows();
  assert.ok(result.prefabSourceStats.rowsFilteredZeroGuid > 0);
  assert.ok(result.prefabSourceStats.rowsFilteredPlaceholder > 0);
  assert.ok(result.prefabSourceStats.rowsFilteredUnresolved > 0);
  assert.equal(hasInvalidGuidRef(result.graph), false);
});

test('per-file scan failure is isolated and does not abort subsequent file emission', async () => {
  const result = await runWithOneBrokenAndOneValidResource();
  assert.ok(result.prefabSourceStats.rowsEmitted > 0);
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.file_errors=1')));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL before final guard/counter logic is complete.

**Step 3: Write minimal implementation**

```ts
if (!target || target === '__PLACEHOLDER__') { stats.rowsFilteredPlaceholder += 1; continue; }
if (!guid || guid === ZERO_GUID) { stats.rowsFilteredZeroGuid += 1; continue; }
if (!resolvedTarget) { stats.rowsFilteredUnresolved += 1; continue; }
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/prefab-source-scan.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS with no invalid rows emitted.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/prefab-source-scan.test.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "test(unity): enforce anti-fake guards and no cross-signal dedupe collision"
```

### Task 5: Update Doc Contract and Source-of-Truth Wording for Streaming Delivery

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/doc-contract.test.ts`
- Modify: `UNITY_RESOURCE_BINDING.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/plans/2026-04-10-prefab-source-streaming-consumption-memory-optimization-design.md`

**Step 1: Write failing semantic contract test updates**

```ts
assert.match(bindingDoc, /scan-context.*carrier/i);
assert.match(bindingDoc, /streaming delivery|incremental consumption/i);
assert.match(ssot, /scan-context.*does not write graph/i);
assert.match(processorCode, /streamPrefabSourceRefs\(\)/);
assert.doesNotMatch(scanContextCode, /addRelationship\(/);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL until docs and contract assertions are aligned.

**Step 3: Write minimal implementation**

```md
- `UNITY_RESOURCE_BINDING.md`: 明确“streaming delivery from carrier to consumer”
- SSOT: 明确 scan-context 不写图、processor 统一写图
- design doc: As-Built 与 proposed streaming strategy 对齐
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS with code-doc semantic alignment.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/doc-contract.test.ts UNITY_RESOURCE_BINDING.md docs/unity-runtime-process-source-of-truth.md docs/plans/2026-04-10-prefab-source-streaming-consumption-memory-optimization-design.md
git commit -m "docs(unity): align streaming carrier-consumer contract and semantic tests"
```

### Task 6: Produce ON/OFF RSS Regression Evidence for Streaming Design

**User Verification: required**

**Human Verification Checklist:**
- ON/OFF 命令除 toggle 外完全一致（scope-manifest/csproj/flags/NODE_OPTIONS/CLI 路径一致）。
- OFF 日志有 `prefab-source: skipped`，ON 日志有 `prefab-source: emitted=`。
- 两组日志都有 `maximum resident set size` 与 `peak memory footprint`。
- 报告含 Nodes/Edges/Time/RSS 对照和 Delta（bytes + GiB + %）。
- 报告明确是固定 case 结论，不外推全局。

**Acceptance Criteria:**
- 每个 checklist 条目至少有一条可点击证据路径/日志行。
- 命令 parity 校验脚本返回 0。
- RSS 原始字段可复算 Delta。
- 报告中的 Delta 数值与日志一致。
- 报告有 `Single variable` 文本与 scope 限定行。

**Failure Signals:**
- 缺少任一 toggle 证据行。
- ON/OFF `CMD:` 归一化后不一致。
- 缺少任一 RSS 原始字段。
- Delta 无法从日志复算。
- 报告缺 scope 限定说明。

**User Decision Prompt:**
- `请仅回复“通过”或“不通过”：是否确认 streaming 方案 A/B 报告满足“开关有效、单变量可复现、指标可审计”？`

**Files:**
- Create: `docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md`
- Create: `docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log`
- Create: `docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log`

**Step 1: Write failing report-field check**

```bash
rg -n "prefab-source: skipped|prefab-source: emitted=|max resident set size|peak memory footprint|Delta|Single variable" docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md
```

**Step 2: Run test to verify it fails**

Run: `rg -n "prefab-source: skipped|prefab-source: emitted=|max resident set size|peak memory footprint|Delta|Single variable" docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md`
Expected: FAIL before report and evidence are generated.

**Step 3: Write minimal implementation (A/B execution + report)**

```bash
# OFF
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-prefab-stream-off NODE_OPTIONS=--max-old-space-size=12288 GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj

# ON
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-prefab-stream-on NODE_OPTIONS=--max-old-space-size=12288 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj

# report evidence section must include deterministic line links:
# - off.log:<line>
# - on.log:<line>
```

**Step 4: Run verification check to confirm pass**

Run: `bash -lc 'off_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log | sed -E "s/GITNEXUS_HOME=[^ ]+ //; s/GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 //") && on_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log | sed -E "s/GITNEXUS_HOME=[^ ]+ //") && test "$off_cmd" = "$on_cmd" && rg -n "prefab-source: skipped" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log && rg -n "prefab-source: emitted=" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log && rg -n "maximum resident set size|peak memory footprint" docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log && node -e "const fs=require(\\\"fs\\\");const off=fs.readFileSync(\\\"docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log\\\",\\\"utf8\\\");const on=fs.readFileSync(\\\"docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log\\\",\\\"utf8\\\");const rpt=fs.readFileSync(\\\"docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md\\\",\\\"utf8\\\");const num=(s)=>Number(String(s).replace(/,/g,\\\"\\\"));const must=(txt,re,msg)=>{const m=txt.match(re);if(!m) throw new Error(msg);return m[1];};const offR=num(must(off,/^\\\\s*([0-9,]+)\\\\s+maximum resident set size$/m,\\\"missing off rss\\\"));const onR=num(must(on,/^\\\\s*([0-9,]+)\\\\s+maximum resident set size$/m,\\\"missing on rss\\\"));const offP=num(must(off,/^\\\\s*([0-9,]+)\\\\s+peak memory footprint$/m,\\\"missing off peak\\\"));const onP=num(must(on,/^\\\\s*([0-9,]+)\\\\s+peak memory footprint$/m,\\\"missing on peak\\\"));const dR=onR-offR;const dP=onP-offP;const repDR=num(must(rpt,/Delta \\\\(`max resident set size`\\\\):[\\\\s\\\\S]*?bytes:\\\\s*`([+\\\\-]?[0-9,]+)`/,\\\"missing report rss delta\\\"));const repDP=num(must(rpt,/Delta \\\\(`peak memory footprint`\\\\):[\\\\s\\\\S]*?bytes:\\\\s*`([+\\\\-]?[0-9,]+)`/,\\\"missing report peak delta\\\"));if(dR!==repDR) throw new Error(\\\"rss delta mismatch\\\");if(dP!==repDP) throw new Error(\\\"peak delta mismatch\\\");if(/__PLACEHOLDER__|TBD|N\\\\/A/i.test(rpt)) throw new Error(\\\"report contains placeholder\\\");" && rg -n "Single variable|Evidence|off.log:[0-9]+|on.log:[0-9]+" docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md'`
Expected: PASS with raw-log recomputation closure and no placeholder leakage.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-10-prefab-source-streaming-memory-rss-regression.md docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/off.log docs/reports/evidence/2026-04-10-prefab-source-streaming-memory-rss/on.log
git commit -m "report(unity): add streaming prefab-source A/B RSS evidence"
```

## Plan Audit Verdict
audit_scope: docs/plans/2026-04-10-prefab-source-streaming-consumption-memory-optimization-design.md sections 1-16; UNITY_RESOURCE_BINDING.md section 3; docs/unity-runtime-process-source-of-truth.md section 2.1.1; this implementation plan
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- Embedded self-attestation block (`Plan Audit Verdict`) can become stale after future edits unless re-audited each revision. status: accepted
anti_placeholder_checks:
- `__PLACEHOLDER__` appears only as explicit negative-test sentinel and guard condition.
- Task 4 + Task 6 include placeholder leakage rejection (`__PLACEHOLDER__|TBD|N/A`).
authenticity_checks:
- DC-01..DC-05 all map to executable verifications, artifact evidence, and failure signals.
- ON/OFF evidence enforces command parity, toggle proof, raw RSS extraction, and recomputed Delta closure.
- semantic closure covered by boundary contract + accounting invariant + anti-fake negatives.
approval_decision: pass
