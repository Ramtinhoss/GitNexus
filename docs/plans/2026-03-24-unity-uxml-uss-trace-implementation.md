# Unity UXML/USS Evidence Trace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `unity_ui_trace` with strict unique-result evidence chains (`path + line` per hop) for Unity UI references in `Assets/NEON/VeewoUI/**`, without changing LadybugDB schema in V1.

**Architecture:** V1 is query-time only: build lightweight UI scanners/parsers and compose evidence chains at request time, then expose through MCP/CLI. Reuse existing graph/index only for repo bootstrap and symbol context where helpful, but do not persist new UXML/USS relations into `CodeRelation`. Treat schema migration and persistent UI graph modeling as a separate V2 plan.

**Tech Stack:** TypeScript, existing Unity scan context utilities, LocalBackend MCP dispatch, CLI direct tool path, Node test runner + Vitest.

---

## Non-Goals (V1 Hard Constraints)

- No LadybugDB schema migration.
- No new node labels for `Uxml/Uss` in graph storage.
- No new persisted `CodeRelation` types for UI trace.
- No dynamic-string inference for selector/class bindings (static-only).

---

### Task 1: Lock V1 Storage Strategy With Guard Tests

**Files:**
- Create: `gitnexus/src/core/unity/ui-trace-storage-guard.test.ts`
- Modify: `docs/plans/2026-03-24-unity-uxml-uss-trace-implementation.md`

**Step 1: Write failing test that documents V1 no-schema policy**

```ts
test('v1 ui trace does not require schema migration', () => {
  // assert existing schema/table declarations unchanged for V1 path
});
```

**Step 2: Run test to verify it fails (guard not implemented yet)**

Run: `node --test gitnexus/dist/core/unity/ui-trace-storage-guard.test.js`
Expected: FAIL.

**Step 3: Implement guard expectations against current schema constants**

```ts
// Validate REL_TYPES/NodeLabel assumptions for V1 query-time only mode
```

**Step 4: Re-run test to verify pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/ui-trace-storage-guard.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/ui-trace-storage-guard.test.ts
git commit -m "test(unity): add v1 no-schema-migration storage guard"
```

### Task 2: Add Deterministic Unity UI Fixture For Query-Time Evidence Chains

**Files:**
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/README.md`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/UI/Screens/EliteBossScreenNew.uxml`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/UI/Screens/DressUpScreenNew.uxml`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/UI/Components/TooltipBox.uxml`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/UI/Styles/EliteBossScreenNew.uss`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/UI/Styles/DressUpScreenNew.uss`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/Prefabs/EliteBossScreen.prefab`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/Config/DressUpScreenConfig.asset`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets/Scripts/EliteBossScreenController.cs`
- Create: matching `.meta` files for UXML/USS/CS

**Step 1: Add fixture contract notes**

```md
- EliteBossScreenNew resolves TooltipBox via template chain
- DressUpScreenNew exposes template_refs
- Prefab + ScriptableObject both contain VisualTreeAsset refs
```

**Step 2: Add minimal files with fixed GUID relationships**

**Step 3: Verify GUID consistency quickly**

Run: `rg -n "guid:" gitnexus/src/core/unity/__fixtures__/mini-unity-ui/Assets`
Expected: all referenced GUIDs map to concrete `.meta` files.

**Step 4: Commit**

```bash
git add gitnexus/src/core/unity/__fixtures__/mini-unity-ui
git commit -m "test(unity): add mini-unity-ui fixture for query-time evidence tracing"
```

### Task 3: Add UXML/USS Meta Index Scanner To Unity Scan Context

**Files:**
- Create: `gitnexus/src/core/unity/ui-meta-index.ts`
- Create: `gitnexus/src/core/unity/ui-meta-index.test.ts`
- Modify: `gitnexus/src/core/unity/scan-context.ts`

**Step 1: Write failing tests for `*.uxml.meta/*.uss.meta` GUID-to-path index**

```ts
expect(index.uxmlGuidToPath.get('<guid>')).toBe('Assets/UI/Screens/EliteBossScreenNew.uxml');
expect(index.ussGuidToPath.get('<guid>')).toBe('Assets/UI/Styles/EliteBossScreenNew.uss');
```

**Step 2: Run tests and verify failure**

Run: `node --test gitnexus/dist/core/unity/ui-meta-index.test.js`
Expected: FAIL.

**Step 3: Implement minimal scanner + hook into `buildUnityScanContext`**

```ts
export interface UnityUiMetaIndex {
  uxmlGuidToPath: Map<string, string>;
  ussGuidToPath: Map<string, string>;
}
```

**Step 4: Re-run tests**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/ui-meta-index.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/ui-meta-index.* gitnexus/src/core/unity/scan-context.ts
git commit -m "feat(unity): add uxml/uss meta guid index to scan context"
```

### Task 4: Implement Prefab/Asset VisualTreeAsset Reference Scanner (Path+Line)

**Files:**
- Create: `gitnexus/src/core/unity/ui-asset-ref-scanner.ts`
- Create: `gitnexus/src/core/unity/ui-asset-ref-scanner.test.ts`

**Step 1: Write failing tests for both source types**

```ts
expect(refs).toContainEqual(expect.objectContaining({ sourceType: 'prefab', line: expect.any(Number) }));
expect(refs).toContainEqual(expect.objectContaining({ sourceType: 'asset', line: expect.any(Number) }));
```

**Step 2: Run test and verify fail**

Run: `node --test gitnexus/dist/core/unity/ui-asset-ref-scanner.test.js`
Expected: FAIL.

**Step 3: Implement scanner returning structured evidence hops**

```ts
export interface UiAssetRefEvidence {
  sourcePath: string;
  line: number;
  fieldName: string;
  guid: string;
  snippet: string;
}
```

**Step 4: Re-run tests**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/ui-asset-ref-scanner.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/ui-asset-ref-scanner.*
git commit -m "feat(unity): scan prefab/asset visualtreeasset refs with line evidence"
```

### Task 5: Implement UXML Template/Style Parser (Path+Line)

**Files:**
- Create: `gitnexus/src/core/unity/uxml-ref-parser.ts`
- Create: `gitnexus/src/core/unity/uxml-ref-parser.test.ts`

**Step 1: Write failing tests for template/style extraction with line evidence**

```ts
expect(out.templates[0]).toEqual(expect.objectContaining({ guid: expect.any(String), line: expect.any(Number) }));
expect(out.styles[0]).toEqual(expect.objectContaining({ guid: expect.any(String), line: expect.any(Number) }));
```

**Step 2: Run tests and verify fail**

Run: `node --test gitnexus/dist/core/unity/uxml-ref-parser.test.js`
Expected: FAIL.

**Step 3: Implement minimal parser**

```ts
export interface UxmlRefEvidence { guid: string; line: number; snippet: string; }
```

**Step 4: Re-run tests**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/uxml-ref-parser.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/uxml-ref-parser.*
git commit -m "feat(unity): parse uxml template/style refs with path+line evidence"
```

### Task 6: Implement USS Selector + C# Static Selector Binding Extraction

**Files:**
- Create: `gitnexus/src/core/unity/uss-selector-parser.ts`
- Create: `gitnexus/src/core/unity/uss-selector-parser.test.ts`
- Create: `gitnexus/src/core/unity/csharp-selector-binding.ts`
- Create: `gitnexus/src/core/unity/csharp-selector-binding.test.ts`

**Step 1: Write failing tests for USS selector extraction**

```ts
expect(selectors).toContainEqual(expect.objectContaining({ selector: '.tooltip-box', line: expect.any(Number) }));
```

**Step 2: Write failing tests for strict static-only C# extraction**

```ts
expect(bindings).toContainEqual(expect.objectContaining({ className: 'tooltip-box' }));
expect(bindings.some((b) => b.isDynamic)).toBe(false);
```

**Step 3: Implement parsers with dynamic rejection**

```ts
// Accept only string literal AddToClassList("...") / Q(... className: "...")
```

**Step 4: Re-run tests**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/uss-selector-parser.test.js gitnexus/dist/core/unity/csharp-selector-binding.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/uss-selector-parser.* gitnexus/src/core/unity/csharp-selector-binding.*
git commit -m "feat(unity): add static selector binding extraction for csharp and uss"
```

### Task 7: Implement Query-Time `unity_ui_trace` Engine (No DB Writes)

**Files:**
- Create: `gitnexus/src/core/unity/ui-trace.ts`
- Create: `gitnexus/src/core/unity/ui-trace.test.ts`

**Step 1: Write failing tests for goals**

```ts
expect(out.goal).toBe('asset_refs');
expect(out.results[0].evidence_chain.every((hop) => hop.path && hop.line > 0)).toBe(true);
```

**Step 2: Write failing tests for unique-result gate and ambiguity diagnostics**

```ts
expect(out.results).toEqual([]);
expect(out.diagnostics[0].candidates[0]).toEqual(expect.objectContaining({ path: expect.any(String), line: expect.any(Number) }));
```

**Step 3: Implement resolver for `asset_refs | template_refs | selector_bindings`**

```ts
export type UnityUiTraceGoal = 'asset_refs' | 'template_refs' | 'selector_bindings';
```

**Step 4: Enforce primary key consistency (C# class name vs UXML filename)**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/core/unity/ui-trace.test.js`
Expected: PASS.

**Step 5: Add explicit test ensuring no graph mutations occur**

```ts
expect(mockGraphAddRelationship).not.toHaveBeenCalled();
```

**Step 6: Commit**

```bash
git add gitnexus/src/core/unity/ui-trace.*
git commit -m "feat(unity): add query-time unity_ui_trace engine with unique-result policy"
```

### Task 8: Integrate MCP + CLI Surfaces Without Storage Coupling

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/tool.ts`
- Create: `gitnexus/test/integration/local-backend-unity-ui-trace.test.ts`
- Create: `gitnexus/src/cli/unity-ui-trace.test.ts`

**Step 1: Add failing MCP integration test**

```ts
expect(result.goal).toBe('template_refs');
expect(result.results[0].evidence_chain[0]).toEqual(expect.objectContaining({ path: expect.any(String), line: expect.any(Number) }));
```

**Step 2: Register MCP tool and backend handler**

```ts
name: 'unity_ui_trace'
```

**Step 3: Add direct CLI command `gitnexus unity-ui-trace`**

```ts
.command('unity-ui-trace')
```

**Step 4: Run integration + CLI tests**

Run: `npm --prefix gitnexus run build && npx vitest run gitnexus/test/integration/local-backend-unity-ui-trace.test.ts`
Expected: PASS.

Run: `node --test gitnexus/dist/cli/unity-ui-trace.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/cli/index.ts gitnexus/src/cli/tool.ts gitnexus/test/integration/local-backend-unity-ui-trace.test.ts gitnexus/src/cli/unity-ui-trace.test.ts
git commit -m "feat(unity): expose unity_ui_trace in mcp and cli"
```

### Task 9: Acceptance Gates For Confirmed Scenarios + Docs

**Files:**
- Create: `gitnexus/src/core/unity/ui-trace.acceptance.test.ts`
- Create: `docs/2026-03-24-unity-ui-trace-runbook.md`
- Modify: `README.md`

**Step 1: Add failing acceptance tests for confirmed questions**

```ts
// Q1: EliteBossScreenNew TooltipBox layout file
// Q2: DressUpScreenNew template refs
```

**Step 2: Ensure C# target and UXML target produce identical resolved answer**

```ts
expect(outByClass.results).toEqual(outByUxml.results);
```

**Step 3: Run full gate bundle**

Run: `npm --prefix gitnexus run build`
Expected: PASS.

Run: `node --test gitnexus/dist/core/unity/*.test.js gitnexus/dist/cli/unity-ui-trace.test.js`
Expected: PASS.

Run: `npx vitest run gitnexus/test/integration/local-backend-unity-ui-trace.test.ts`
Expected: PASS.

**Step 4: Write runbook and README entries (explicitly mention V1 query-time, no schema migration)**

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/ui-trace.acceptance.test.ts docs/2026-03-24-unity-ui-trace-runbook.md README.md
git commit -m "docs(unity): add v1 query-time unity_ui_trace runbook and acceptance coverage"
```

---

## V2 Follow-up (Out of Scope For This Plan)

- Schema-backed UXML/USS node modeling.
- Persisted `CodeRelation` UI trace edges.
- CSV loader/table migration for new UI node/edge families.
- Backfill/migration strategy across existing indexes.

- Task 1 implementation note: storage guard test validates V1 query-time mode does not require new NodeLabel or REL_TYPES entries.
