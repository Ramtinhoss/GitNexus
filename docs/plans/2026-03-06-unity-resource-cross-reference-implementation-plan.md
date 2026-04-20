# Unity Resource Cross-Reference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Unity `CS <-> prefab/scene` cross-reference retrieval with a Phase 0 validation command and a Phase 1 graph-native `query/context` integration (default off).

**Architecture:** Build a shared Unity resolver core (`meta index + resource scan + YAML object graph + override merge`) and reuse it in both phases. Phase 0 exposes a standalone CLI command for fast validation. Phase 1 persists resolved bindings into the existing graph model (using existing node tables + new relation types) and enriches `query/context` behind `unityResources` mode.

**Tech Stack:** TypeScript (Node 20+, ESM), existing GitNexus CLI/MCP stack, KuzuDB `CodeRelation`, Node built-in test runner (`node:test`).

---

### Task 1: Add Shared Unity Mode Option Contract (`off|on|auto`)

**Files:**
- Create: `gitnexus/src/core/unity/options.ts`
- Test: `gitnexus/src/core/unity/options.test.ts`
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/tool.ts`
- Modify: `gitnexus/src/mcp/tools.ts`

**Step 1: Write the failing test**

```ts
// gitnexus/src/core/unity/options.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnityResourcesMode } from './options.js';

test('parseUnityResourcesMode defaults to off', () => {
  assert.equal(parseUnityResourcesMode(undefined), 'off');
});

test('parseUnityResourcesMode validates mode', () => {
  assert.equal(parseUnityResourcesMode('on'), 'on');
  assert.throws(() => parseUnityResourcesMode('bad'), /unity resources mode/i);
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/options.test.js`  
Expected: FAIL with module not found.

**Step 3: Write minimal implementation**

```ts
// gitnexus/src/core/unity/options.ts
export type UnityResourcesMode = 'off' | 'on' | 'auto';

export function parseUnityResourcesMode(raw?: string): UnityResourcesMode {
  if (!raw) return 'off';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'on' || normalized === 'auto') {
    return normalized;
  }
  throw new Error('Invalid unity resources mode. Use off|on|auto.');
}
```

**Step 4: Wire CLI/MCP option surfaces**

```ts
// cli/index.ts (query/context)
.option('--unity-resources <mode>', 'Unity resource retrieval mode: off|on|auto', 'off')

// cli/tool.ts (pass-through)
unity_resources: options?.unityResources,

// mcp/tools.ts (query/context schema)
unity_resources: {
  type: 'string',
  enum: ['off', 'on', 'auto'],
  description: 'Unity resource retrieval mode (default: off)',
  default: 'off',
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/options.test.js dist/cli/*.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/options.ts gitnexus/src/core/unity/options.test.ts gitnexus/src/cli/index.ts gitnexus/src/cli/tool.ts gitnexus/src/mcp/tools.ts
git commit -m "feat: add unity resources mode contract for query/context"
```

### Task 2: Implement Script GUID Index + Resource GUID Hit Scanner

**Files:**
- Create: `gitnexus/src/core/unity/meta-index.ts`
- Create: `gitnexus/src/core/unity/resource-hit-scanner.ts`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Scripts/Global.cs.meta`
- Create: `gitnexus/src/core/unity/__fixtures__/mini-unity/Assets/Scene/Global.unity`
- Test: `gitnexus/src/core/unity/meta-index.test.ts`
- Test: `gitnexus/src/core/unity/resource-hit-scanner.test.ts`

**Step 1: Write failing tests for GUID index and hit scan**

```ts
// meta-index.test.ts
const index = await buildMetaIndex(fixtureRoot);
assert.equal(index.get('a6d481d58c0b4f646b7106ceaf633d6e')?.endsWith('Global.cs'), true);

// resource-hit-scanner.test.ts
const hits = await findGuidHits(fixtureRoot, 'a6d481d58c0b4f646b7106ceaf633d6e');
assert.equal(hits.length, 1);
assert.equal(hits[0].resourceType, 'scene');
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/meta-index.test.js dist/core/unity/resource-hit-scanner.test.js`  
Expected: FAIL with missing modules.

**Step 3: Implement scanners (minimal, deterministic)**

```ts
// meta-index.ts
export async function buildMetaIndex(repoRoot: string): Promise<Map<string, string>> {
  // glob **/*.cs.meta, read "guid:", map guid -> .cs relative path
}

// resource-hit-scanner.ts
export async function findGuidHits(repoRoot: string, guid: string) {
  // glob **/*.prefab + **/*.unity, grep-like line scan, return path/line/resourceType
}
```

**Step 4: Ensure scanner bypasses tree-sitter size/ignore filters**

```ts
// use glob directly in unity scanner, not ingestion shouldIgnorePath/MAX_FILE_SIZE gate
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/meta-index.test.js dist/core/unity/resource-hit-scanner.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/meta-index.ts gitnexus/src/core/unity/resource-hit-scanner.ts gitnexus/src/core/unity/__fixtures__/mini-unity gitnexus/src/core/unity/meta-index.test.ts gitnexus/src/core/unity/resource-hit-scanner.test.ts
git commit -m "feat: add unity guid index and resource hit scanner"
```

### Task 3: Implement YAML Object Graph + Override Merge Core

**Files:**
- Create: `gitnexus/src/core/unity/yaml-object-graph.ts`
- Create: `gitnexus/src/core/unity/override-merger.ts`
- Test: `gitnexus/src/core/unity/yaml-object-graph.test.ts`
- Test: `gitnexus/src/core/unity/override-merger.test.ts`

**Step 1: Write failing parser/merge tests (including stripped + PrefabInstance)**

```ts
// override-merger.test.ts
const merged = mergeOverrideChain(baseComponent, variantComponent, nestedComponent, sceneOverride);
assert.equal(merged.scalarFields.needPause.value, '1');
assert.equal(merged.referenceFields.mainUIDocument.fileId, '11400000');
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/yaml-object-graph.test.js dist/core/unity/override-merger.test.js`  
Expected: FAIL.

**Step 3: Implement parser for component blocks**

```ts
// yaml-object-graph.ts
export interface UnityObjectBlock { objectId: string; objectType: 'MonoBehaviour' | 'PrefabInstance' | 'GameObject'; fields: Record<string, string>; }
export function parseUnityYamlObjects(text: string): UnityObjectBlock[] { /* parse --- !u!xxx &id blocks */ }
```

**Step 4: Implement merge order (base -> variant -> nested -> scene)**

```ts
// override-merger.ts
export function mergeOverrideChain(layers: UnityObjectLayer[]): MergedUnityComponent {
  // last-write-wins by chain order; preserve sourceLayer metadata
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/yaml-object-graph.test.js dist/core/unity/override-merger.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/yaml-object-graph.ts gitnexus/src/core/unity/override-merger.ts gitnexus/src/core/unity/yaml-object-graph.test.ts gitnexus/src/core/unity/override-merger.test.ts
git commit -m "feat: add unity yaml object graph and override merger"
```

### Task 4: Implement End-to-End Resolver (`symbol -> bindings + fields`)

**Files:**
- Create: `gitnexus/src/core/unity/resolver.ts`
- Create: `gitnexus/src/core/unity/resolver.test.ts`

**Step 1: Write failing resolver tests with 4 required samples**

```ts
// resolver.test.ts
const result = await resolveUnityBindings({ repoRoot: fixtureOrRepoRoot, symbol: 'MainUIManager' });
assert.ok(result.resourceBindings.length >= 1);
assert.ok(result.serializedFields.scalarFields.length + result.serializedFields.referenceFields.length > 0);
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/resolver.test.js`  
Expected: FAIL.

**Step 3: Implement resolver composition**

```ts
// resolver.ts
export async function resolveUnityBindings(input: ResolveInput): Promise<ResolveOutput> {
  // 1) resolve symbol -> script file
  // 2) read script .meta guid
  // 3) scan prefab/unity hits
  // 4) parse component blocks and merge overrides
  // 5) normalize scalar/reference fields + evidence
}
```

**Step 4: Add aggregation helper for acceptance rule**

```ts
export function hasCoverage(resultSet: ResolveOutput[]): { hasScalar: boolean; hasReference: boolean } {
  // used by integration acceptance tests (4 samples aggregate)
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/*.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/unity/resolver.ts gitnexus/src/core/unity/resolver.test.ts
git commit -m "feat: add unity symbol binding resolver"
```

### Task 5: Add Phase 0 CLI Command `unity-bindings`

**Files:**
- Create: `gitnexus/src/cli/unity-bindings.ts`
- Create: `gitnexus/src/cli/unity-bindings.test.ts`
- Modify: `gitnexus/src/cli/index.ts`

**Step 1: Write failing command test (summary output + --json)**

```ts
// unity-bindings.test.ts
test('prints human readable summary by default', async () => {
  const lines: string[] = [];
  await unityBindingsCommand('MainUIManager', { targetPath: fixtureRoot }, { writeLine: (l) => lines.push(l) });
  assert.match(lines.join('\n'), /resource bindings/i);
});

test('prints JSON when --json is enabled', async () => {
  // assert valid JSON parse and required keys
});
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/cli/unity-bindings.test.js`  
Expected: FAIL.

**Step 3: Implement command with dependency injection for tests**

```ts
// unity-bindings.ts
export async function unityBindingsCommand(symbol: string, options: { targetPath?: string; json?: boolean }, deps?: { resolver?: typeof resolveUnityBindings; writeLine?: (s: string) => void; }) {
  // default targetPath: process.cwd()
}
```

**Step 4: Register command in CLI**

```ts
// cli/index.ts
program
  .command('unity-bindings <symbol>')
  .description('Experimental: inspect Unity resource bindings for a C# symbol')
  .option('--target-path <path>', 'Unity project root (default: cwd)')
  .option('--json', 'Output JSON')
  .action(unityBindingsCommand);
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/cli/unity-bindings.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/cli/unity-bindings.ts gitnexus/src/cli/unity-bindings.test.ts gitnexus/src/cli/index.ts
git commit -m "feat: add experimental unity-bindings CLI command"
```

### Task 6: Persist Unity Bindings Into Graph During Analyze (Phase 1)

**Files:**
- Create: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Create: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`
- Modify: `gitnexus/src/core/graph/types.ts`
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Modify: `gitnexus/src/types/pipeline.ts`

**Step 1: Write failing processor test for graph artifacts**

```ts
// unity-resource-processor.test.ts
await processUnityResources(graph, { repoPath: fixtureRoot });
const rels = [...graph.iterRelationships()].filter(r => r.type === 'UNITY_COMPONENT_IN');
assert.ok(rels.length > 0);
```

**Step 2: Run test to verify it fails**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: FAIL.

**Step 3: Implement processor (reusing resolver core)**

```ts
// unity-resource-processor.ts
// For each resolved script binding:
// - ensure resource File node exists
// - create CodeElement node for component instance (description carries normalized field payload)
// - add relations:
//   Class -> File (UNITY_COMPONENT_IN)
//   Class -> CodeElement (UNITY_COMPONENT_INSTANCE)
```

**Step 4: Hook into pipeline enrich stage**

```ts
// pipeline.ts
onProgress({ phase: 'enriching', percent: 99, message: 'Extracting Unity resource bindings...' });
const unityResult = await processUnityResources(graph, { repoPath });
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js dist/cli/analyze-multi-scope-regression.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts gitnexus/src/core/graph/types.ts gitnexus/src/core/ingestion/pipeline.ts gitnexus/src/types/pipeline.ts
git commit -m "feat: persist unity resource bindings during analyze"
```

### Task 7: Enrich `query/context` with Graph-Native Unity Data (Default Off)

**Files:**
- Create: `gitnexus/src/mcp/local/unity-enrichment.ts`
- Create: `gitnexus/src/mcp/local/unity-enrichment.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`

**Step 1: Write failing enrichment tests**

```ts
// unity-enrichment.test.ts
const out = projectUnityBindings(rowsFromCypher);
assert.equal(out.resourceBindings[0].bindingKind, 'nested');
assert.ok(out.serializedFields.scalarFields.length >= 1);
```

**Step 2: Run tests to verify they fail**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/unity-enrichment.test.js`  
Expected: FAIL.

**Step 3: Implement Cypher projection helper**

```ts
// unity-enrichment.ts
export async function loadUnityContext(repoId: string, symbolId: string, execute: ExecuteQuery): Promise<UnityContextPayload> {
  // query UNITY_COMPONENT_IN + UNITY_COMPONENT_INSTANCE payload nodes
}
```

**Step 4: Wire mode gate in LocalBackend**

```ts
// local-backend.ts (query/context params)
unity_resources?: 'off' | 'on' | 'auto';

if (parseUnityResourcesMode(params.unity_resources) !== 'off') {
  result.unity = await loadUnityContext(repo.id, symId, (q) => executeQuery(repo.id, q));
}
```

**Step 5: Run tests and commit**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/unity-enrichment.test.js`  
Expected: PASS.

```bash
git add gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-enrichment.test.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "feat: add unity enrichment for query and context"
```

### Task 8: Documentation + Acceptance Verification

**Files:**
- Modify: `README.md`
- Create: `docs/reports/2026-03-06-unity-resource-cross-reference-acceptance.md`

**Step 1: Write failing docs snapshot test (optional if preferred by repo policy)**

```ts
// add/extend an existing CLI docs test to assert command/flag mention
assert.match(readme, /unity-bindings/);
assert.match(readme, /unity-resources/);
```

**Step 2: Update docs**

```md
- `gitnexus unity-bindings <symbol> --target-path <path> [--json]`
- `query/context` support `unity_resources: off|on|auto` (default off)
```

**Step 3: Run full targeted verification suite**

Run:
1. `cd gitnexus && npm run build`
2. `cd gitnexus && node --test dist/core/unity/*.test.js`
3. `cd gitnexus && node --test dist/core/ingestion/unity-resource-processor.test.js`
4. `cd gitnexus && node --test dist/cli/unity-bindings.test.js`
5. `cd gitnexus && node --test dist/mcp/local/unity-enrichment.test.js`

Expected: all PASS.

**Step 4: Run manual acceptance on real repo samples**

Run:
1. `cd /Volumes/Shuttle/unity-projects/neonspark && npx -y /npx -y /gitnexus analyze`
2. `gitnexus unity-bindings Global --target-path /Volumes/Shuttle/unity-projects/neonspark`
3. `gitnexus unity-bindings BattleMode --target-path /Volumes/Shuttle/unity-projects/neonspark`
4. `gitnexus unity-bindings PlayerActor --target-path /Volumes/Shuttle/unity-projects/neonspark`
5. `gitnexus unity-bindings MainUIManager --target-path /Volumes/Shuttle/unity-projects/neonspark`
6. `gitnexus context MainUIManager --unity-resources on`
7. `gitnexus query "MainUIManager" --unity-resources on`

Acceptance rule: 4 样本聚合后必须覆盖值字段 + 对象引用字段。

**Step 5: Commit**

```bash
git add README.md docs/reports/2026-03-06-unity-resource-cross-reference-acceptance.md
git commit -m "docs: add unity resource cross-reference usage and acceptance report"
```

## Final Verification Gate (Before PR/Merge)

Run:
1. `cd gitnexus && npm run build`
2. `cd gitnexus && node --test dist/core/unity/*.test.js dist/core/ingestion/unity-resource-processor.test.js dist/cli/unity-bindings.test.js dist/mcp/local/unity-enrichment.test.js`

Expected: PASS. If any fail, stop and fix before merge.
