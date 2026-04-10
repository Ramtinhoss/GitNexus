# Unity Scene-Prefab Resource Edge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analyze-time Unity resource edges so `PrefabInstance.m_SourcePrefab` produces graph-visible `UNITY_ASSET_GUID_REF` links (`scene -> prefab` and `prefab -> prefab`) that close resource reachability for runtime retrieval.

**Architecture:** Extend Unity scan context to expose scoped resource-file inventory, then add a resource-level prefab-source extraction pass inside `processUnityResources` that parses `PrefabInstance` blocks, resolves `m_SourcePrefab` GUIDs through `assetGuidToPath`, and emits deduplicated `UNITY_ASSET_GUID_REF` edges. Keep existing symbol-driven component/script enrichment unchanged and add regression coverage that proves both behaviors coexist. Validate with targeted unit tests first, then fixture-backed integration checks, then live Cypher verification.

**Tech Stack:** TypeScript, Node test runner (`node:test` via built `dist`), GitNexus analyze/Cypher tooling, Unity fixture YAML files.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added `resourceFiles` contract tests + scaffold; targeted run fails as expected (`2` failing tests on missing population behavior).
Task 2 | completed | Implemented normalized/deduped `resourceFiles` population in live+seed scan-context; targeted `resourceFiles` pattern now passes (`11` tests, `0` failures).
Task 3 | completed | Added `PrefabInstance.m_SourcePrefab` red tests; targeted run reports expected failures (`scene prefab source`, `nested source dedupe`, `without class binding resolve`).
Task 4 | completed | Added resource-level prefab-source extraction and deduped `UNITY_ASSET_GUID_REF` emission; targeted prefab-source suite now passes (`18` tests, `0` failures).
Task 5 | completed | Added fixture-backed scene->prefab regression plus `BattleMode.prefab.meta`/scene fixture update; targeted fixture+legacy edge checks pass (`19` tests, `0` failures).
Task 6 | completed | Synced source-of-truth + design docs and passed targeted/full sweeps (`scan-context` + `unity-resource-processor` full test files all green).
Task 7 | completed | Live analyze/cypher validation accepted (`通过`): local CLI force-analyze emitted `prefab-source: 56445`; BattleMode chain `BattleMode.unity -> Systems/BattleMode.prefab -> Class(BattleMode)` confirmed; `Controls.unity` rows attributed to in-scope `Packages` sample data.
Task 8 | completed | Fixed post-acceptance retrieval exposure defect: `query/context` now return graph-backed `resource_chains` for seed `File -[UNITY_ASSET_GUID_REF]-> File -[UNITY_GRAPH_NODE_SCRIPT_REF]-> Symbol`; targeted/full LocalBackend response-contract tests pass.

## Post-Acceptance Defect: Context Exposure Gap

**Observed problem:** Task 7 proved ingestion is working: live Cypher returns `Assets/NEON/Scene/BattleModeScenes/BattleMode.unity -[UNITY_ASSET_GUID_REF]-> Assets/NEON/Prefab/Systems/BattleMode.prefab -[UNITY_GRAPH_NODE_SCRIPT_REF]-> Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs`. However, the MCP `query` / `context` payloads do not surface that relation chain as structured evidence. Slim responses compress it into resource follow-up hints, and full responses leave the agent without a first-class `scene -> prefab -> symbol` hop chain.

**Root cause:** The implementation stopped at analyze-time edge creation. Retrieval-time seed mapping already reads direct `UNITY_ASSET_GUID_REF` targets into `mappedSeedTargets`, but it does not load or return the second-hop `UNITY_GRAPH_NODE_SCRIPT_REF` relationship. As a result, process/runtime verification can still report missing evidence even though the graph contains the resource bridge needed for agent-side inference.

**Resolution plan:** Add retrieval-time `resource_chains` evidence for Unity seed paths. When `resource_path_prefix` or query text resolves to a Unity resource, load graph-backed chains of the form `sourceResource -[UNITY_ASSET_GUID_REF]-> intermediateResource -[UNITY_GRAPH_NODE_SCRIPT_REF]-> targetSymbol`, rank exact symbol matches first, and expose them in both full and slim `query/context` responses. This is a response-contract fix, not an ingestion or Process synthesis change.

**Acceptance check:** A `context` call for `BattleMode` with `resource_path_prefix=Assets/NEON/Scene/BattleModeScenes/BattleMode.unity` must return a structured `resource_chains` entry containing:

- `sourceResourcePath = Assets/NEON/Scene/BattleModeScenes/BattleMode.unity`
- `intermediateResourcePath = Assets/NEON/Prefab/Systems/BattleMode.prefab`
- `targetSymbol.name = BattleMode`
- `targetSymbol.filePath = Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs`

Agents may then cite the returned graph chain directly instead of doing manual scene/prefab text retrieval.

**Scoped live verification:** Re-ran neonspark analysis with the default sync manifest explicitly passed (`--scope-manifest /Volumes/Shuttle/unity-projects/neonspark/.gitnexus/sync-manifest.txt`, `--sync-manifest-policy keep`, `--csharp-define-csproj /Volumes/Shuttle/unity-projects/neonspark/Assembly-CSharp.csproj`). The run completed with `Scope Rules: 2`, `Scoped Files: 8044`, and `prefab-source: emitted=56445`. Subsequent `context BattleMode` and `query BattleMode` calls returned exactly one `resource_chains` entry for `BattleMode.unity -> BattleMode.prefab -> BattleMode.cs`, including slim `closure.resource_chains`.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 `scene -> prefab` edge emission from `PrefabInstance.m_SourcePrefab` | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "scene prefab source emits"` | `UNITY_ASSET_GUID_REF.reason.fieldName`, `UNITY_ASSET_GUID_REF.reason.sourceLayer`, `UNITY_ASSET_GUID_REF.targetId` | Missing edge, `fieldName != m_SourcePrefab`, or `sourceLayer != scene`
DC-02 `prefab -> prefab` edge emission with resource-level dedupe | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab nested source dedupes"` | `guidRefs.length`, `guidRefs[0].reason.guid` | `guidRefs.length !== 1` for duplicate source-prefab records
DC-03 unresolved/built-in prefab GUIDs never create synthetic refs | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "skips unresolved prefab source guid"` | `guidRefs.length` | Any emitted `UNITY_ASSET_GUID_REF` for unresolved or all-zero GUID
DC-04 resource-level extraction is independent of class symbol resolve path | critical | Task 3, Task 4 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "without class binding resolve"` | test spy count: `resolveBindingsCallCount`, relation count: `guidRefs.length` | `resolveBindingsCallCount > 0` required for edge emission, or `guidRefs.length === 0`
DC-05 scan context exposes resource inventory needed by extraction pass | critical | Task 1, Task 2 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles"` | `UnityScanContext.resourceFiles[]` | `resourceFiles` empty/missing for scoped scene/prefab inputs
DC-06 existing script/component enrichment remains intact after new pass | critical | Task 5, Task 6 | `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "asset-guid and graph-node reference edges"` | `UNITY_GRAPH_NODE_SCRIPT_REF count`, `UNITY_ASSET_GUID_REF.reason.fieldName` | Regression in existing script-ref edges or only new prefab edges survive
DC-07 live repo closure evidence confirms scene->prefab->component chain | critical | Task 7 | `gitnexus analyze --repo neonspark-core && gitnexus cypher --repo neonspark-core "MATCH (s:File)-[r1:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->(p:File)-[r2:CodeRelation {type:'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(c:Class) WHERE s.filePath ENDS WITH '.unity' AND p.filePath ENDS WITH '.prefab' RETURN s.filePath, p.filePath, c.name LIMIT 20"` | Cypher row fields: `s.filePath`, `p.filePath`, `c.name` | Zero rows for expected scene-prefab-component chain after analyze

## Authenticity Assertions

Critical module: `gitnexus/src/core/ingestion/unity-resource-processor.ts`

- `assert no placeholder path`: emitted `targetResourcePath` must be resolved `Assets/.../*.prefab`, never empty or placeholder values.
- Negative assertion: unresolved/all-zero `m_SourcePrefab.guid` must not emit any `UNITY_ASSET_GUID_REF`.
- Negative assertion: duplicate `PrefabInstance` entries pointing to same source/target/guid must collapse to one persisted edge.

Critical module: `gitnexus/src/core/unity/scan-context.ts`

- `assert live mode has tool evidence`: run real `gitnexus analyze` + `gitnexus cypher` (Task 7) and require concrete rows, not only mocked test success.
- Negative assertion: scoped runs must still populate `resourceFiles` for `.unity`/`.prefab` inputs.

Critical release gate

- `assert freeze requires non-empty confirmed_chain.steps`: do not mark rollout complete unless Task 7 produces non-empty scene->prefab->component chain rows from live Cypher evidence.

### Task 1: Add Failing Scan-Context Contract Tests for `resourceFiles`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write the failing test**

```ts
test('buildUnityScanContext exposes resourceFiles for scene/prefab scan pass', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
  });

  assert.ok(context.resourceFiles.includes('Assets/Scene/MainUIManager.unity'));
  assert.ok(context.resourceFiles.includes('Assets/Prefabs/BattleMode.prefab'));
});

test('buildUnityScanContextFromSeed rebuilds resourceFiles from guidToResourcePaths', () => {
  const context = buildUnityScanContextFromSeed({
    seed: {
      version: 1,
      symbolToScriptPath: {},
      scriptPathToGuid: {},
      guidToResourcePaths: {
        '11111111111111111111111111111111': ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
      },
    },
  });

  assert.deepEqual(context.resourceFiles.sort(), [
    'Assets/Prefabs/BattleMode.prefab',
    'Assets/Scene/MainUIManager.unity',
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles"`
Expected: FAIL because `UnityScanContext.resourceFiles` is undefined.

**Step 3: Write minimal implementation scaffold (red-safe)**

```ts
export interface UnityScanContext {
  // ...
  resourceFiles: string[];
}
```

**Step 4: Run test to verify it still fails for behavior**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles"`
Expected: FAIL until population logic is implemented.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.test.ts gitnexus/src/core/unity/scan-context.ts
git commit -m "test(unity): add failing resourceFiles scan-context contract checks"
```

### Task 2: Implement `resourceFiles` Population in Scan Context

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: Write/extend failing assertion for de-dup and normalization**

```ts
assert.equal(context.resourceFiles.includes('Assets\\Scene\\MainUIManager.unity' as any), false);
assert.equal(new Set(context.resourceFiles).size, context.resourceFiles.length);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles"`
Expected: FAIL on missing normalization/de-dup behavior.

**Step 3: Write minimal implementation**

```ts
const resourceFiles = await resolveResourceFiles(input.repoRoot, input.scopedPaths);
const normalizedResourceFiles = [...new Set(resourceFiles.map((p) => normalizeSlashes(p)))].sort((a, b) => a.localeCompare(b));

return {
  // ...
  resourceFiles: normalizedResourceFiles,
};
```

And in `buildUnityScanContextFromSeed`:

```ts
const resourceFiles = [...new Set(
  Object.values(seed.guidToResourcePaths || {}).flat().map((p) => normalizeSlashes(String(p || '').trim())).filter(Boolean),
)].sort((a, b) => a.localeCompare(b));
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "feat(unity): expose normalized resourceFiles in scan context"
```

### Task 3: Add Failing Processor Tests for Prefab Source Edges

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write the failing tests**

```ts
test('scene prefab source emits UNITY_ASSET_GUID_REF', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
    resourceFiles: ['Assets/Scene/MainUIManager.unity'],
    resourceDocCache: new Map([
      ['Assets/Scene/MainUIManager.unity', [{ objectType: 'PrefabInstance', objectId: '3000', stripped: false, fields: {
        m_SourcePrefab: '{fileID: 100100000, guid: 99999999999999999999999999999999, type: 3}',
      }, rawBody: '' }]],
    ]),
  };

  await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => fakeScanContext as any,
    resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] } as any),
  });

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(guidRefs.length, 1);
  const reason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
  assert.equal(reason.fieldName, 'm_SourcePrefab');
  assert.equal(reason.sourceLayer, 'scene');
});

test('prefab nested source dedupes duplicate PrefabInstance rows', async () => {
  // source prefab has two PrefabInstance blocks with same guid => one emitted edge
});

test('skips unresolved prefab source guid and built-in guid', async () => {
  // unresolved guid + 000...0 guid => zero emitted edges
});

test('extracts prefab source refs without class binding resolve', async () => {
  // no class nodes + resolve spy count remains 0 + prefab edge still emitted
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab source|nested source|unresolved prefab source|without class binding resolve"`
Expected: FAIL because resource-level extraction path is not implemented.

**Step 3: Add minimal assertion scaffolding**

```ts
const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
assert.equal(guidRefs.length, 1);
const reason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
assert.equal(reason.fieldName, 'm_SourcePrefab');
```

**Step 4: Run tests to verify they remain red**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab source|nested source|unresolved prefab source|without class binding resolve"`
Expected: FAIL until implementation lands.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "test(unity): add failing prefab m_SourcePrefab edge extraction cases"
```

### Task 4: Implement Resource-Level Prefab Source Extraction Pass

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Run failing tests from Task 3**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab source|nested source|unresolved prefab source|without class binding resolve"`
Expected: FAIL.

**Step 2: Write minimal implementation**

```ts
function collectPrefabSourceRefs(/* graph, scanContext, repoPath */) {
  // iterate scanContext.resourceFiles filtered to .unity/.prefab
  // parse blocks from scanContext.resourceDocCache or read+parse
  // for each PrefabInstance block, parse m_SourcePrefab {fileID, guid}
  // resolve guid via scanContext.assetGuidToPath
  // emit deduped UNITY_ASSET_GUID_REF with fieldName='m_SourcePrefab'
}
```

Wire into `processUnityResources` after scanContext creation and before returning.

**Step 3: Ensure reason payload and dedupe key semantics**

```ts
const dedupeKey = `${sourcePath}|${targetPath}|m_SourcePrefab|${guidLower}`;
reason = {
  resourcePath: sourcePath,
  targetResourcePath: targetPath,
  guid: guidLower,
  fileId,
  fieldName: 'm_SourcePrefab',
  sourceLayer: sourcePath.endsWith('.unity') ? 'scene' : 'prefab',
};
```

**Step 4: Run tests to verify they pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab source|nested source|unresolved prefab source|without class binding resolve"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "feat(unity): emit deduped prefab source resource edges during processUnityResources"
```

### Task 5: Add Fixture-Backed Regression for Real Scene->Prefab Chain

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Scene/MainUIManager.unity`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Prefabs/BattleMode.prefab.meta`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Write failing fixture-backed test**

```ts
test('fixture run emits scene->prefab UNITY_ASSET_GUID_REF and keeps script ref edges', async () => {
  // run processUnityResources(graph, { repoPath: fixtureRoot })
  // assert at least one UNITY_ASSET_GUID_REF from MainUIManager.unity to BattleMode.prefab via m_SourcePrefab
  // assert UNITY_GRAPH_NODE_SCRIPT_REF still exists
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "fixture run emits scene->prefab"`
Expected: FAIL before fixture YAML/meta are updated.

**Step 3: Write minimal fixture + assertion implementation**

Update scene fixture `PrefabInstance` block to include:

```yaml
m_SourcePrefab: {fileID: 100100000, guid: 99999999999999999999999999999999, type: 3}
```

Create prefab meta:

```yaml
fileFormatVersion: 2
guid: 99999999999999999999999999999999
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "fixture run emits scene->prefab|asset-guid and graph-node reference edges"`
Expected: PASS with both new and legacy edges present.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Scene/MainUIManager.unity gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Prefabs/BattleMode.prefab.meta gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "test(unity): add fixture-backed scene->prefab resource edge regression"
```

### Task 6: Contract/Docs Sync + Targeted Verification Sweep

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/plans/2026-04-10-unity-scene-prefab-resource-edge-design.md`
- Test: `gitnexus/src/core/unity/scan-context.test.ts`
- Test: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: Add failing doc-sync checklist assertion in plan execution notes**

```md
- verify source-of-truth docs explicitly mention `PrefabInstance.m_SourcePrefab` resource-level `UNITY_ASSET_GUID_REF` emission.
```

**Step 2: Run targeted verification commands (pre-doc update)**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js --test-name-pattern "resourceFiles" && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js --test-name-pattern "prefab source|fixture run emits scene->prefab|asset-guid and graph-node reference edges"`
Expected: PASS code tests, docs not yet synced.

**Step 3: Update docs minimally**

```md
Phase 5.5 now includes `PrefabInstance.m_SourcePrefab` extraction and emits `UNITY_ASSET_GUID_REF` for `scene->prefab` and `prefab->prefab` (resource-level dedup).
```

**Step 4: Re-run full targeted sweep**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/scan-context.test.js && node --test gitnexus/dist/core/ingestion/unity-resource-processor.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/plans/2026-04-10-unity-scene-prefab-resource-edge-design.md gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Scene/MainUIManager.unity gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Prefabs/BattleMode.prefab.meta
git commit -m "feat(unity): add scene/prefab prefab-source resource edges and sync contracts"
```

### Task 7: Live Repo Validation (Neonspark) and Acceptance Gate

**User Verification: required**

**Human Verification Checklist:**
- Re-run `gitnexus analyze` on `neonspark-core` using existing manifest/options.
- Run the Cypher chain query for `scene(.unity) -> prefab(.prefab) -> class`.
- Confirm at least one returned row includes expected BattleMode-style artifacts (scene and prefab paths + class name).
- Confirm no obvious false positives where `targetResourcePath` is empty/non-`Assets`/non-prefab.

**Acceptance Criteria:**
- Analyze command completes without failure.
- Cypher query returns `row_count > 0`.
- At least one row shows a plausible gameplay chain (scene path, prefab path, class name).
- Returned `targetResourcePath` values are valid asset paths.

**Failure Signals:**
- Analyze fails or exits non-zero.
- Cypher returns zero rows.
- Rows contain placeholder/invalid target paths.
- Only legacy edges appear and no scene->prefab bridge is visible.

**User Decision Prompt:**
- `请仅回复：通过 或 不通过`

**Files:**
- Modify: `.gitnexus/lbug` (re-indexed graph artifact in target repo)
- Modify: `.gitnexus/meta.json` (updated indexedAt/lastCommit in target repo)
- Test: live `gitnexus cypher` output for chain evidence

**Step 1: Prepare live validation query script**

```bash
QUERY="MATCH (s:File)-[r1:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->(p:File)-[r2:CodeRelation {type:'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(c:Class)
WHERE s.filePath ENDS WITH '.unity' AND p.filePath ENDS WITH '.prefab'
RETURN s.filePath, p.filePath, c.name LIMIT 20"
```

**Step 2: Run analyze on neonspark repo**

Run: `gitnexus analyze --repo neonspark-core`
Expected: PASS.

**Step 3: Run Cypher closure query**

Run: `gitnexus cypher --repo neonspark-core "$QUERY"`
Expected: non-empty rows.

**Step 4: Capture evidence summary for ledger**

Run: `gitnexus cypher --repo neonspark-core "$QUERY" | head -40`
Expected: visible `scene`, `prefab`, `class` rows.

**Step 5: Commit (if repository policy requires evidence commit)**

```bash
git add docs/reports/2026-04-10-unity-scene-prefab-resource-edge-validation.md
git commit -m "docs: record neonspark scene->prefab->component validation evidence"
```

## Execution Notes

1. Follow `@superpowers:test-driven-development` within each task: keep strict red -> green -> commit cadence.
2. Use `@superpowers:verification-before-completion` before claiming closure.
3. Use `@gitnexus-cli` for live analyze/cypher operations in Task 7.
4. Keep implementation DRY/YAGNI: no new edge type, no query-time heuristic fallback.

## Plan Audit Verdict
audit_scope: `docs/plans/2026-04-10-unity-scene-prefab-resource-edge-design.md` against this plan's design clauses (DC-01..DC-07), writing-plans rubric, and Unity runtime source-of-truth constraints
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` mapped to Task 3/4/7 with explicit failure signals; result=pass
- unresolved/all-zero GUID negative tests mapped to Task 3/4; result=pass
authenticity_checks:
- `assert live mode has tool evidence` mapped to Task 7 analyze+cypher; result=pass
- `assert freeze requires non-empty confirmed_chain.steps` mapped to Task 7 acceptance gate requiring non-empty chain rows; result=pass
approval_decision: pass
