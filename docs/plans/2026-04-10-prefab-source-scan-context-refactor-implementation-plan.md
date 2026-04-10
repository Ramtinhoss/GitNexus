# Prefab Source Scan-Context Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 prefab-source 索引从 `processUnityResources` 独立重型 pass 重构为 scan-context 同次扫描产物，并在 Phase 5.5 统一消费，保证边契约不变同时降低 RSS 峰值。

**Architecture:** 保持两段式：scan-context 仅输出轻量 resource signals（`m_Script.guid` 与 `m_SourcePrefab`），`processUnityResources` 统一消费写图并做去重/诊断。组件深解析仍由 resolver 按命中范围执行，不把 scan-context 变成全语义解析器。

**Tech Stack:** TypeScript, Node.js stream/readline, Node test runner (`node --test`), GitNexus ingestion pipeline

---

## Execution Preconditions

1. 读取 `.codex/preflight_cache.json`。
2. 若 `worktree-exempt=false`，执行前先用 `@superpowers:using-git-worktrees` 创建隔离工作区。
3. 若 `worktree-exempt=true`，记录依据后可在当前 checkout 执行。

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 scan-context must emit prefab-source signals in same scan pass | critical | Task 1, Task 2 | `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js` | `gitnexus/src/core/unity/scan-context.test.ts::buildUnityScanContext collects prefabSourceRefs from scoped unity/prefab resources` | `prefabSourceRefs missing/empty`
DC-02 Phase 5.5 must consume `scanContext.prefabSourceRefs` in unified path | critical | Task 3 | `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::processUnityResources emits prefab-source edges from scanContext.prefabSourceRefs only` | `edges not emitted from scanContext records`
DC-03 graph contract must stay stable (`UNITY_ASSET_GUID_REF` + reason fields) | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::reason payload preserves m_SourcePrefab contract fields` | `missing reason.resourcePath/targetResourcePath/guid/fileId/fieldName/sourceLayer`
DC-04 anti-fake guards must reject placeholder/unresolved/zero-guid rows | critical | Task 4 | `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/ingestion/unity-resource-processor.test.ts::drops placeholder unresolved and zero-guid prefab-source rows` | `invalid rows emitted`
DC-05 docs must semantically align with code contract (carrier + unified consumption + As-Built/Direction split) | critical | Task 5 | `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js` | `gitnexus/src/core/unity/doc-contract.test.ts::scan-context carrier contract matches pipeline ordering and unified consumer usage` | `doc claims diverge from pipeline/processor behavior`
DC-06 RSS A/B proof must show effective toggle + reproducible delta | critical | Task 6 | `bash -lc 'off_cmd=$(rg \"^CMD:\" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log | sed -E \"s/GITNEXUS_HOME=[^ ]+ //; s/GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 //\") && on_cmd=$(rg \"^CMD:\" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log | sed -E \"s/GITNEXUS_HOME=[^ ]+ //\") && test \"$off_cmd\" = \"$on_cmd\" && rg -n \"prefab-source: skipped\" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log && rg -n \"prefab-source: emitted=\" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log && rg -n \"max resident set size|peak memory footprint|Delta|Single variable\" docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md'` | `off.log:on.log CMD parity + toggle lines + report Delta section` | `command parity broken or toggle evidence missing`

## Authenticity Assertions

1. `scan-context`（critical）
- `assert no placeholder path`: `prefabSourceRefs.targetResourcePath` 不为空且不为 `__PLACEHOLDER__`。
- `assert unresolved guid dropped`: `assetGuidToPath` 不可解析的 guid 不得写入 `prefabSourceRefs`。

2. `processUnityResources`（critical）
- `assert live mode has tool evidence`: diagnostics 出现 `prefab-source: emitted=<n>` 且 `<n>` 与新增边计数一致。
- `assert zero-guid filtered`: `00000000000000000000000000000000` 必须被过滤。

3. `report`（critical）
- `assert freeze requires non-empty confirmed_chain.steps`（adapted）：报告必须含命令、ON/OFF 开关证据、RSS 原始字段、delta 计算，不能仅有结论。

### Task 1: Add Failing Scan-Context Contract Tests

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

```ts
test('buildUnityScanContext collects prefabSourceRefs from scoped unity/prefab resources', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
  });

  assert.ok(Array.isArray((context as any).prefabSourceRefs));
  assert.ok((context as any).prefabSourceRefs.length > 0);
  const sample = (context as any).prefabSourceRefs[0];
  assert.equal(sample.fieldName, 'm_SourcePrefab');
  assert.equal(sample.sourceLayer === 'scene' || sample.sourceLayer === 'prefab', true);
});

test('buildUnityScanContextFromSeed reconstructs prefabSourceRefs', () => {
  const context = buildUnityScanContextFromSeed({
    seed: {
      version: 1,
      symbolToScriptPath: {},
      scriptPathToGuid: {},
      guidToResourcePaths: {},
      prefabSourceRefs: [{
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      }],
    } as any,
  });
  assert.equal((context as any).prefabSourceRefs.length, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js`
Expected: FAIL due to missing `prefabSourceRefs` contract.

**Step 3: Write minimal implementation**

```ts
export interface UnityPrefabSourceRef {
  sourceResourcePath: string;
  targetGuid: string;
  targetResourcePath?: string;
  fileId?: string;
  fieldName: 'm_SourcePrefab';
  sourceLayer: 'scene' | 'prefab';
}

export interface UnityScanContext {
  // existing fields...
  prefabSourceRefs: UnityPrefabSourceRef[];
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js`
Expected: PASS for new contract tests.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "test(unity): add prefabSourceRefs scan-context contract tests"
```

### Task 2: Implement Streamed Prefab-Source Recognizer in Scan-Context

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/unity/prefab-source-scan.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

```ts
test('scan-context prefabSourceRefs drop unresolved and zero-guid entries', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  for (const row of (context as any).prefabSourceRefs as any[]) {
    assert.notEqual(row.targetGuid, '00000000000000000000000000000000');
    assert.ok(String(row.targetResourcePath || '').length > 0);
  }
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js`
Expected: FAIL before recognizer filtering logic lands.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/core/unity/prefab-source-scan.ts
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

const SOURCE_PREFAB = /m_SourcePrefab\s*:\s*\{[^}]*fileID\s*:\s*([^,\s}]+)[^}]*guid\s*:\s*([0-9a-fA-F]{32})[^}]*\}/;

export async function collectPrefabSourceRefs(args: {
  repoRoot: string;
  resourceFiles: string[];
  assetGuidToPath: Map<string, string>;
}) {
  const rows: Array<{
    sourceResourcePath: string;
    targetGuid: string;
    targetResourcePath?: string;
    fileId?: string;
    fieldName: 'm_SourcePrefab';
    sourceLayer: 'scene' | 'prefab';
  }> = [];

  for (const resourcePath of args.resourceFiles) {
    if (!resourcePath.endsWith('.unity') && !resourcePath.endsWith('.prefab')) continue;

    const stream = createReadStream(path.join(args.repoRoot, resourcePath), { encoding: 'utf-8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });

    try {
      let inPrefabInstance = false;
      for await (const line of reader) {
        if (/^\s*PrefabInstance:\s*$/.test(line)) {
          inPrefabInstance = true;
          continue;
        }
        if (!inPrefabInstance) continue;
        const m = line.match(SOURCE_PREFAB);
        if (!m) continue;

        const guid = String(m[2] || '').toLowerCase();
        if (!guid || guid === '00000000000000000000000000000000') continue;

        const targetPath = args.assetGuidToPath.get(guid) || args.assetGuidToPath.get(guid.toLowerCase());
        if (!targetPath || !targetPath.endsWith('.prefab')) continue;

        rows.push({
          sourceResourcePath: resourcePath.replace(/\\/g, '/'),
          targetGuid: guid,
          targetResourcePath: targetPath.replace(/\\/g, '/'),
          fileId: String(m[1] || ''),
          fieldName: 'm_SourcePrefab',
          sourceLayer: resourcePath.endsWith('.unity') ? 'scene' : 'prefab',
        });
        inPrefabInstance = false;
      }
    } finally {
      reader.close();
      stream.destroy();
    }
  }

  return rows;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/scan-context.test.js`
Expected: PASS with filtered prefabSourceRefs.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/prefab-source-scan.ts gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "feat(unity): emit prefab-source signals during scan-context resource scan"
```

### Task 3: Refactor `processUnityResources` to Unified Consumption Path

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing test**

```ts
test('processUnityResources emits prefab-source edges from scanContext.prefabSourceRefs only', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map(),
    scriptPathToGuid: new Map(),
    guidToResourceHits: new Map(),
    resourceDocCache: new Map(),
    prefabSourceRefs: [{
      sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
      targetGuid: '99999999999999999999999999999999',
      targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
      fileId: '100100000',
      fieldName: 'm_SourcePrefab',
      sourceLayer: 'scene',
    }],
  } as any;

  const result = await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => fakeScanContext,
    resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
  });

  const refs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(refs.length, 1);
  assert.ok(result.diagnostics.some((line) => line.includes('prefab-source: emitted=1')));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL before unified scan-context consumption lands.

**Step 3: Write minimal implementation**

```ts
function emitPrefabSourceGuidRefsFromScanContext(graph: KnowledgeGraph, scanContext: UnityScanContext): number {
  const dedupe = new Set<string>();
  let emitted = 0;

  for (const row of scanContext.prefabSourceRefs || []) {
    const source = normalizePath(String(row.sourceResourcePath || '').trim());
    const target = normalizePath(String(row.targetResourcePath || '').trim());
    const guid = String(row.targetGuid || '').toLowerCase().trim();
    if (!source || !target || !guid) continue;

    const key = `${source}|${target}|m_SourcePrefab|${guid}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    const sourceId = ensureResourceFileNode(graph, source);
    const targetId = ensureResourceFileNode(graph, target);
    graph.addRelationship({
      id: generateId('UNITY_ASSET_GUID_REF', `${sourceId}->${targetId}:m_SourcePrefab:${guid}:${String(row.fileId || '')}`),
      type: 'UNITY_ASSET_GUID_REF',
      sourceId,
      targetId,
      confidence: 1.0,
      reason: JSON.stringify({
        resourcePath: source,
        targetResourcePath: target,
        guid,
        fileId: String(row.fileId || ''),
        fieldName: 'm_SourcePrefab',
        sourceLayer: row.sourceLayer === 'scene' ? 'scene' : 'prefab',
      }),
    });
    emitted += 1;
  }

  return emitted;
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS and diagnostics report emitted count from scan-context.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "refactor(unity): consume prefab-source scan-context records in Phase 5.5"
```

### Task 4: Add Concrete Negative Tests for Anti-Fake Guards

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing test**

```ts
test('drops placeholder unresolved and zero-guid prefab-source rows', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map(),
    scriptPathToGuid: new Map(),
    guidToResourceHits: new Map(),
    resourceDocCache: new Map(),
    prefabSourceRefs: [
      { sourceResourcePath: 'Assets/Scene/MainUIManager.unity', targetGuid: '00000000000000000000000000000000', targetResourcePath: 'Assets/Prefabs/BattleMode.prefab', fileId: '1', fieldName: 'm_SourcePrefab', sourceLayer: 'scene' },
      { sourceResourcePath: 'Assets/Scene/MainUIManager.unity', targetGuid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', targetResourcePath: '__PLACEHOLDER__', fileId: '2', fieldName: 'm_SourcePrefab', sourceLayer: 'scene' },
      { sourceResourcePath: 'Assets/Scene/MainUIManager.unity', targetGuid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', targetResourcePath: 'Assets/Prefabs/BattleMode.prefab', fileId: '3', fieldName: 'm_SourcePrefab', sourceLayer: 'scene' },
    ],
  } as any;

  await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => fakeScanContext,
    resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
  });

  const refs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(refs.length, 1);
  const reason = JSON.parse(String(refs[0].reason || '{}'));
  assert.equal(reason.targetResourcePath, 'Assets/Prefabs/BattleMode.prefab');
  assert.notEqual(reason.guid, '00000000000000000000000000000000');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL before invalid-row guards are complete.

**Step 3: Write minimal implementation**

```ts
if (!target || target === '__PLACEHOLDER__') continue;
if (!guid || guid === '00000000000000000000000000000000') continue;
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS with only valid row emitted.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "test(unity): enforce anti-fake guards for prefab-source rows"
```

### Task 5: Add Semantic Doc-Contract Test and Sync Docs

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/unity/doc-contract.test.ts`
- Modify: `UNITY_RESOURCE_BINDING.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/plans/2026-04-10-prefab-source-scan-context-refactor-design.md`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('scan-context carrier contract matches code and docs', async () => {
  const bindingDoc = await fs.readFile('UNITY_RESOURCE_BINDING.md', 'utf-8');
  const ssot = await fs.readFile('docs/unity-runtime-process-source-of-truth.md', 'utf-8');
  const design = await fs.readFile('docs/plans/2026-04-10-prefab-source-scan-context-refactor-design.md', 'utf-8');
  const scanContextCode = await fs.readFile('gitnexus/src/core/unity/scan-context.ts', 'utf-8');
  const processorCode = await fs.readFile('gitnexus/src/core/ingestion/unity-resource-processor.ts', 'utf-8');
  const pipelineCode = await fs.readFile('gitnexus/src/core/ingestion/pipeline.ts', 'utf-8');

  assert.match(bindingDoc, /scan-context.*承载器|resource signal carrier/i);
  assert.match(ssot, /As-Built[\s\S]*Design Direction/i);
  assert.match(ssot, /统一消费点契约/i);
  assert.match(design, /scan-context[\s\S]*统一消费/i);
  assert.match(scanContextCode, /prefabSourceRefs/);
  assert.match(processorCode, /scanContext\.prefabSourceRefs/);
  assert.match(processorCode, /emitPrefabSourceGuidRefsFromScanContext/);
  assert.doesNotMatch(processorCode, /emitPrefabSourceGuidRefs\(/);
  assert.ok(
    pipelineCode.indexOf('processUnityResources(') >= 0
      && pipelineCode.indexOf('applyUnityLifecycleSyntheticCalls(') >= 0
      && pipelineCode.indexOf('processUnityResources(') < pipelineCode.indexOf('applyUnityLifecycleSyntheticCalls('),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: FAIL until docs and code contract are aligned.

**Step 3: Write minimal implementation**

```md
- 更新 UNITY_RESOURCE_BINDING.md：明确 carrier + unified consumption
- 更新 SSOT 2.1.1：明确 As-Built 与 Design Direction
- 更新 design doc：字段命名和消费点与代码一致
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test dist/core/unity/doc-contract.test.js dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS with code-doc contract consistency.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/doc-contract.test.ts UNITY_RESOURCE_BINDING.md docs/unity-runtime-process-source-of-truth.md docs/plans/2026-04-10-prefab-source-scan-context-refactor-design.md
git commit -m "docs(unity): enforce semantic scan-context carrier contract with doc test"
```

### Task 6: Produce A/B RSS Report with Exact Commands and Toggle Proof

**User Verification: required**

**Human Verification Checklist:**
- ON/OFF 命令的 scope-manifest、csproj、flags、NODE_OPTIONS、CLI build 一致。
- OFF 日志明确包含 `prefab-source: skipped`，ON 日志包含 `prefab-source: emitted=`。
- 两组日志都出现 `max resident set size` 与 `peak memory footprint`。
- 报告写明 Nodes/Edges/Time/RSS 对照与 Delta。
- 报告写明固定 case 边界，不做全局泛化。

**Acceptance Criteria:**
- 每项 checklist 均有日志或报告行作为证据。
- toggle 生效由日志直接证明。
- Delta 使用 bytes + GiB + 百分比。
- 命令与日志路径可直接复现。
- 结论范围与实验范围一致。

**Failure Signals:**
- 缺少任一 toggle 证据行。
- 缺少 RSS 原始字段或 Delta 无法复算。
- ON/OFF 参数不一致。

**User Decision Prompt:**
- `请仅回复“通过”或“不通过”：是否确认该 A/B RSS 报告满足“开关有效、单变量可复现、指标可审计”？`

**Files:**
- Create: `docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md`
- Create: `docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log`
- Create: `docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log`

**Step 1: Write the failing test**

```bash
rg -n "prefab-source: skipped|prefab-source: emitted=|max resident set size|peak memory footprint|Delta|Single variable" docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md
```

**Step 2: Run test to verify it fails**

Run: `rg -n "prefab-source: skipped|prefab-source: emitted=|max resident set size|peak memory footprint|Delta|Single variable" docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md`
Expected: FAIL before report fields are populated.

**Step 3: Write minimal implementation**

```bash
echo \"CMD: env NODE_OPTIONS=--max-old-space-size=12288 GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj\" | tee docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-prefab-refactor-off NODE_OPTIONS=--max-old-space-size=12288 GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj 2>&1 | tee -a docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log

echo \"CMD: env NODE_OPTIONS=--max-old-space-size=12288 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj\" | tee docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log
/usr/bin/time -l env GITNEXUS_HOME=/tmp/gitnexus-prefab-refactor-on NODE_OPTIONS=--max-old-space-size=12288 node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze . --force --no-reuse-options --scope-manifest /Volumes/Shuttle/unity-projects/neonharness/.gitnexus/sync-manifest.txt --sync-manifest-policy keep --csharp-define-csproj /Volumes/Shuttle/unity-projects/neonharness/UxmlGenerator/UxmlGenerator/UxmlGenerator.csproj 2>&1 | tee -a docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log

bash -lc 'off_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log | sed -E "s/GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 //") && on_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log) && test "$off_cmd" = "$on_cmd" && rg -n "prefab-source: skipped" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log && rg -n "prefab-source: emitted=" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log'
```

**Step 4: Run test to verify it passes**

Run: `bash -lc 'off_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log | sed -E "s/GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 //") && on_cmd=$(rg "^CMD:" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log) && test "$off_cmd" = "$on_cmd" && rg -n "prefab-source: skipped" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log && rg -n "prefab-source: emitted=" docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log && rg -n "max resident set size|peak memory footprint|Delta|Single variable" docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md'`
Expected: PASS with toggle proof and complete delta evidence.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-10-prefab-source-scan-context-rss-regression.md docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/off.log docs/reports/evidence/2026-04-10-prefab-source-scan-context-rss/on.log
git commit -m "report(unity): add scan-context prefab-source A/B RSS regression evidence"
```

## Plan Audit Verdict

audit_scope: docs/plans/2026-04-10-prefab-source-scan-context-refactor-design.md sections 2-10; UNITY_RESOURCE_BINDING.md; docs/unity-runtime-process-source-of-truth.md; this implementation plan
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- Task 4 includes concrete negative assertions for placeholder/unresolved/zero-guid rows; invalid rows are required to be dropped.
authenticity_checks:
- DC-05 critical clause now maps to executable semantic contract test (`doc-contract.test.ts`) plus processor behavioral suite.
- DC-06 critical clause now includes mechanical ON/OFF command parity check and explicit toggle evidence checks.
approval_decision: pass
