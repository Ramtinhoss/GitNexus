# Unity `method_triggers_scene_load` Binding Kind Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `method_triggers_scene_load` binding kind to the rule DSL so that rules can express "method X calls SceneManager.LoadScene('SceneName'), which triggers lifecycle callbacks on components in that scene."

**Architecture:** New binding processor in `unity-runtime-binding-rules.ts` that resolves a string scene name to `.unity` File nodes in the graph, then follows `UNITY_COMPONENT_INSTANCE` edges to find mounted components and injects synthetic CALLS edges — no file I/O, pure graph traversal. Three files change: the type definition, the YAML parser, and the binding processor. The neonspark rule YAML is updated to use the new kind.

**Tech Stack:** TypeScript, vitest (unit tests in `gitnexus/test/unit/`), existing graph types from `gitnexus/src/core/graph/types.ts`.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | tsc --noEmit clean, committed 59b0f3e2
Task 2 | completed | 4/4 vitest pass, scene_name parsed correctly, committed b12e7d73
Task 3 | completed | 4/4 vitest pass (incl 3 negative), 62/63 unit suite pass, committed ca7af8d4
Task 4 | completed | npm run build clean, tsc --noEmit clean
Task 5 | completed | 23 scene-load edges + 1 lifecycle-override, runtime_claim.status=verified_full, evidence_level=verified_chain, 20 hops all high confidence

---

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: new binding kind registered in type system | critical | Task 1 | `cd gitnexus && npx tsc --noEmit` | TypeScript compile passes | TS error on `kind` union
DC-02: YAML parser reads `scene_name` field | critical | Task 2 | `cd gitnexus && npx vitest run test/unit/runtime-claim-rule-registry.test.ts` | parsed `binding.scene_name === 'Global'` | field is `undefined`
DC-03: processor injects synthetic CALLS edges | critical | Task 3, Task 4 | `cd gitnexus && npx vitest run test/unit/unity-runtime-binding-rules.test.ts` | `reason STARTS WITH 'unity-rule-scene-load:'` | edge count === 0
DC-04: neonspark rule produces edges after re-analyze | critical | Task 5 | Cypher: `MATCH ()-[r:CALLS]->() WHERE r.reason STARTS WITH 'unity-rule-scene-load:' RETURN count(r)` | count > 0 | count === 0

---

## Authenticity Assertions

- DC-03 negative test: graph with no `.unity` File node → edge count must be 0 (no phantom edges)
- DC-03 negative test: `scene_name` mismatch (rule says "Foo", graph has "Global.unity") → edge count must be 0
- DC-04: verify via Cypher against live neonspark index, not just compile output

---

### Task 1: Extend `UnityResourceBinding` type

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/types.ts:90-97`

**Step 1: Add new kind and field to the interface**

In `types.ts`, change `UnityResourceBinding`:

```typescript
export interface UnityResourceBinding {
  kind: 'asset_ref_loads_components' | 'method_triggers_field_load' | 'method_triggers_scene_load';
  ref_field_pattern?: string;
  target_entry_points?: string[];
  host_class_pattern?: string;
  field_name?: string;
  loader_methods?: string[];
  scene_name?: string;   // used by method_triggers_scene_load
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 3: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus
git add gitnexus/src/rule-lab/types.ts
git commit -m "feat(unity-rules): add method_triggers_scene_load kind to UnityResourceBinding"
```

---

### Task 2: Parse `scene_name` in YAML parser

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:232-237`
- Modify: `gitnexus/test/unit/runtime-claim-rule-registry.test.ts` (add new `describe` block)

**Step 1: Write the failing test**

Add to the end of `gitnexus/test/unit/runtime-claim-rule-registry.test.ts`:

```typescript
describe('parseRuleYaml – method_triggers_scene_load', () => {
  const SCENE_LOAD_YAML = `
id: test.scene-load
version: 2.0.0
family: analyze_rules
trigger_family: test_family
resource_types:
  - scene
host_base_type:
  - MonoBehaviour

match:
  trigger_tokens:
    - Global

topology:
  - hop: resource
    from:
      entity: resource
    to:
      entity: guid
    edge:
      kind: references

closure:
  required_hops:
    - resource
  failure_map:
    missing_evidence: rule_matched_but_evidence_missing

claims:
  guarantees:
    - test_guarantee
  non_guarantees:
    - no_runtime_proof
  next_action: gitnexus query "Global"

resource_bindings:
  - kind: method_triggers_scene_load
    host_class_pattern: "^Global$"
    loader_methods:
      - InitGlobal
    scene_name: "Global"
    target_entry_points:
      - Awake
      - Start
      - OnEnable
`.trim();

  it('parses scene_name field', () => {
    const rule = parseRuleYaml(SCENE_LOAD_YAML, '/fake/path/test.yaml');
    expect(rule.resource_bindings).toBeDefined();
    expect(rule.resource_bindings!.length).toBe(1);
    const binding = rule.resource_bindings![0];
    expect(binding.kind).toBe('method_triggers_scene_load');
    expect(binding.scene_name).toBe('Global');
    expect(binding.loader_methods).toEqual(['InitGlobal']);
    expect(binding.target_entry_points).toEqual(['Awake', 'Start', 'OnEnable']);
    expect(binding.host_class_pattern).toBe('^Global$');
  });

  it('scene_name is undefined when not present', () => {
    const yaml = SCENE_LOAD_YAML.replace(/    scene_name: "Global"\n/, '');
    const rule = parseRuleYaml(yaml, '/fake/path/test.yaml');
    expect(rule.resource_bindings![0].scene_name).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit/runtime-claim-rule-registry.test.ts 2>&1 | tail -20`
Expected: FAIL — `binding.scene_name` is `undefined`

**Step 3: Add `scene_name` parsing in `parseRuleYaml`**

In `runtime-claim-rule-registry.ts`, after line 236 (`binding.loader_methods = list('loader_methods');`), add:

```typescript
binding.scene_name = scalar('scene_name');
```

**Step 4: Run test to verify it passes**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit/runtime-claim-rule-registry.test.ts 2>&1 | tail -10`
Expected: all tests pass

**Step 5: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus
git add gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/test/unit/runtime-claim-rule-registry.test.ts
git commit -m "feat(unity-rules): parse scene_name field in resource_bindings YAML"
```

---

### Task 3: Implement `processMethodTriggersSceneLoad` processor

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
- Create: `gitnexus/test/unit/unity-runtime-binding-rules.test.ts`

**Step 1: Write the failing tests**

Create `gitnexus/test/unit/unity-runtime-binding-rules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateId } from '../../src/lib/utils.js';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { applyUnityRuntimeBindingRules } from '../../src/core/ingestion/unity-runtime-binding-rules.js';
import type { RuntimeClaimRule } from '../../src/mcp/local/runtime-claim-rule-registry.js';

function makeRule(overrides: Partial<RuntimeClaimRule> = {}): RuntimeClaimRule {
  return {
    id: 'test.scene-load',
    version: '2.0.0',
    trigger_family: 'test',
    resource_types: ['scene'],
    host_base_type: ['MonoBehaviour'],
    required_hops: [],
    guarantees: [],
    non_guarantees: [],
    family: 'analyze_rules',
    file_path: '/fake/test.yaml',
    ...overrides,
  };
}

function buildSceneGraph() {
  const graph = createKnowledgeGraph();

  const sceneFileId = generateId('File', 'Assets/NEON/Scene/Global.unity');
  graph.addNode({
    id: sceneFileId,
    label: 'File',
    properties: { name: 'Global.unity', filePath: 'Assets/NEON/Scene/Global.unity' },
  });

  const globalClassId = generateId('Class', 'Assets/NEON/Code/Framework/Global.cs:Global');
  graph.addNode({
    id: globalClassId,
    label: 'Class',
    properties: { name: 'Global', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });

  const initGlobalId = generateId('Method', 'Assets/NEON/Code/Framework/Global.cs:Global.InitGlobal');
  graph.addNode({
    id: initGlobalId,
    label: 'Method',
    properties: { name: 'InitGlobal', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${globalClassId}->${initGlobalId}`),
    type: 'HAS_METHOD', sourceId: globalClassId, targetId: initGlobalId, confidence: 1, reason: '',
  });

  const svcClassId = generateId('Class', 'Assets/NEON/Code/Framework/ServiceManager.cs:ServiceManager');
  graph.addNode({
    id: svcClassId,
    label: 'Class',
    properties: { name: 'ServiceManager', filePath: 'Assets/NEON/Code/Framework/ServiceManager.cs' },
  });

  const svcAwakeId = generateId('Method', 'Assets/NEON/Code/Framework/ServiceManager.cs:ServiceManager.Awake');
  graph.addNode({
    id: svcAwakeId,
    label: 'Method',
    properties: { name: 'Awake', filePath: 'Assets/NEON/Code/Framework/ServiceManager.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${svcClassId}->${svcAwakeId}`),
    type: 'HAS_METHOD', sourceId: svcClassId, targetId: svcAwakeId, confidence: 1, reason: '',
  });

  graph.addRelationship({
    id: generateId('UNITY_COMPONENT_INSTANCE', `${svcClassId}->${sceneFileId}`),
    type: 'UNITY_COMPONENT_INSTANCE', sourceId: svcClassId, targetId: sceneFileId, confidence: 1, reason: '',
  });

  return { graph, initGlobalId, svcAwakeId };
}

describe('method_triggers_scene_load binding processor', () => {
  it('injects CALLS edge from loader to scene component lifecycle', () => {
    const { graph, initGlobalId, svcAwakeId } = buildSceneGraph();

    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake', 'Start', 'OnEnable'],
      }],
    });

    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(1);
    expect(result.ruleResults[0].edgesInjected).toBe(1);

    const edges = [...graph.iterRelationships()].filter(
      r => r.type === 'CALLS' && r.reason.startsWith('unity-rule-scene-load:'),
    );
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(initGlobalId);
    expect(edges[0].targetId).toBe(svcAwakeId);
  });

  it('no edges when scene_name does not match any File node', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'NonExistentScene',
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('no edges when no .unity File node exists in graph', () => {
    const graph = createKnowledgeGraph();
    const classId = generateId('Class', 'Foo.cs:Global');
    graph.addNode({ id: classId, label: 'Class', properties: { name: 'Global', filePath: 'Foo.cs' } });
    const methodId = generateId('Method', 'Foo.cs:Global.InitGlobal');
    graph.addNode({ id: methodId, label: 'Method', properties: { name: 'InitGlobal', filePath: 'Foo.cs' } });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${classId}->${methodId}`),
      type: 'HAS_METHOD', sourceId: classId, targetId: methodId, confidence: 1, reason: '',
    });
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('no edges when scene_name is missing from binding', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit/unity-runtime-binding-rules.test.ts 2>&1 | tail -20`
Expected: FAIL — `method_triggers_scene_load` not handled, positive test gets `edgesInjected === 0`

**Step 3: Implement the processor**

In `unity-runtime-binding-rules.ts`:

3a. In `applyUnityRuntimeBindingRules`, after the existing pre-build indexes block (after line 65), add a scene file index:

```typescript
  // Pre-build scene file index: lowercase scene name → fileId[]
  const sceneFilesByName = new Map<string, string[]>();
  for (const node of graph.iterNodes()) {
    if (node.label !== 'File') continue;
    const filePath = String(node.properties.filePath ?? '');
    if (!filePath.endsWith('.unity')) continue;
    const fileName = (filePath.split('/').pop() ?? '').replace(/\.unity$/, '').toLowerCase();
    const list = sceneFilesByName.get(fileName) ?? [];
    list.push(node.id);
    sceneFilesByName.set(fileName, list);
  }
```

3b. Pass `sceneFilesByName` to `processBinding` — update the call at line 71:

```typescript
      ruleEdges += processBinding(binding, rule.id, assetGuidRefs, componentInstances, methodsByClassId, classNodes, sceneFilesByName, addSyntheticEdge);
```

3c. Update `processBinding` signature and add the new branch:

```typescript
function processBinding(
  binding: UnityResourceBinding,
  ruleId: string,
  assetGuidRefs: GraphRelationship[],
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  classNodes: GraphNode[],
  sceneFilesByName: Map<string, string[]>,
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  if (binding.kind === 'asset_ref_loads_components') {
    return processAssetRefLoadsComponents(binding, ruleId, assetGuidRefs, componentInstances, methodsByClassId, addEdge);
  }
  if (binding.kind === 'method_triggers_field_load') {
    return processMethodTriggersFieldLoad(binding, ruleId, assetGuidRefs, componentInstances, methodsByClassId, classNodes, addEdge);
  }
  if (binding.kind === 'method_triggers_scene_load') {
    return processMethodTriggersSceneLoad(binding, ruleId, componentInstances, methodsByClassId, classNodes, sceneFilesByName, addEdge);
  }
  return 0;
}
```

3d. Add the new processor function (after `processMethodTriggersFieldLoad`):

```typescript
function processMethodTriggersSceneLoad(
  binding: UnityResourceBinding,
  ruleId: string,
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  classNodes: GraphNode[],
  sceneFilesByName: Map<string, string[]>,
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  const classPattern = binding.host_class_pattern ? new RegExp(binding.host_class_pattern) : null;
  const loaderMethodNames = new Set(binding.loader_methods ?? []);
  const sceneName = binding.scene_name;
  const defaultEntryPoints = ['OnEnable', 'Awake', 'Start'];
  const entryPoints = (binding.target_entry_points ?? []).length > 0
    ? binding.target_entry_points!
    : defaultEntryPoints;

  if (!classPattern || loaderMethodNames.size === 0 || !sceneName) return 0;

  const sceneFileIds = sceneFilesByName.get(sceneName.toLowerCase()) ?? [];
  if (sceneFileIds.length === 0) return 0;

  let count = 0;
  for (const cls of classNodes) {
    if (!classPattern.test(cls.properties.name)) continue;
    const methods = methodsByClassId.get(cls.id) ?? [];
    const loaders = methods.filter(m => loaderMethodNames.has(m.properties.name));
    if (loaders.length === 0) continue;

    for (const sceneFileId of sceneFileIds) {
      const targetMethods = findMethodsOnResource(sceneFileId, componentInstances, methodsByClassId, entryPoints);
      for (const loader of loaders) {
        for (const target of targetMethods) {
          if (addEdge(loader.id, target.id, `unity-rule-scene-load:${ruleId}`)) count++;
        }
      }
    }
  }
  return count;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit/unity-runtime-binding-rules.test.ts 2>&1 | tail -15`
Expected: all 4 tests pass

**Step 5: Run full unit test suite to check for regressions**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit 2>&1 | tail -15`
Expected: all pass

**Step 6: TypeScript compile check**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

**Step 7: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus
git add gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts gitnexus/src/core/ingestion/unity-runtime-binding-rules.test.ts
git commit -m "feat(unity-rules): implement method_triggers_scene_load binding processor"
```

---

### Task 4: Build CLI and verify compile output

**User Verification: not-required**

**Files:**
- No code changes — build verification only

**Step 1: Build the CLI**

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npm run build 2>&1 | tail -20`
Expected: build succeeds, no errors

**Step 2: Verify compiled bundle picks up new kind**

The compile step reads `parseRuleYaml` which now handles `scene_name`. Confirm by checking the type is accepted end-to-end:

Run: `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx tsc --noEmit 2>&1`
Expected: clean

---

### Task 5: Update neonspark rule and re-analyze

**User Verification: required**

**Files:**
- Modify: `/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/approved/unity.battlemode-editor-global-init.v2.yaml`

**Step 1: Replace the non-working `method_triggers_field_load` for Global with the new kind**

In the rule YAML, replace the second `resource_bindings` entry (the one with `host_class_pattern: "^Global$"`) with:

```yaml
  - kind: method_triggers_scene_load
    host_class_pattern: "^Global$"
    loader_methods:
      - InitGlobal
    scene_name: "Global"
    target_entry_points:
      - Awake
      - Start
      - OnEnable
```

The first entry (`BattleMode` side) can remain as `method_triggers_field_load` or be evaluated separately.

**Step 2: Recompile the rule**

Run: `cd /Volumes/Shuttle/projects/neonspark && gitnexus rule-lab compile --repo-path "$(pwd)"`
Expected: `Compiled 1 analyze_rules rules → .gitnexus/rules/compiled/analyze_rules.v2.json`

**Step 3: Re-analyze the repo**

Run: `cd /Volumes/Shuttle/projects/neonspark && gitnexus analyze "$(pwd)" --force --no-reuse-options --repo-alias neonspark-core --extensions ".cs,.meta"`
Expected: analyze completes, ~110k nodes / ~479k edges

**Step 4: Verify synthetic edges exist**

Run Cypher via MCP:
```cypher
MATCH ()-[r:CALLS]->()
WHERE r.reason STARTS WITH 'unity-rule-scene-load:'
RETURN r.reason, count(r) AS cnt
```
Expected: at least 1 row with `cnt > 0`

**Step 5: Verify runtime chain**

Run MCP `query` with `runtime_chain_verify=on-demand`:
```
query: "BattleMode InitGlobal Global"
runtime_chain_verify: on-demand
```
Expected: `runtime_claim.status = 'verified_full'` (not `rule_matched_but_verification_failed`)

Human Verification Checklist:
1. Cypher query returns at least 1 `unity-rule-scene-load:*` edge
2. `runtime_claim.status` is `verified_full`
3. `runtime_claim.evidence_source` is `analyze_time`
4. `runtime_claim.hops` is non-empty
5. No regression: existing `unity-rule-lifecycle-override:*` edges still present

Acceptance Criteria:
1. Cypher count > 0
2. `status === 'verified_full'`
3. `evidence_source === 'analyze_time'`
4. `hops.length > 0`
5. `MATCH ()-[r:CALLS]->() WHERE r.reason STARTS WITH 'unity-rule-lifecycle-override:' RETURN count(r)` still > 0

Failure Signals:
1. Cypher returns 0 rows → processor not firing or scene name mismatch
2. `status === 'rule_matched_but_verification_failed'` → edges injected but verifier can't find them (check rule id match)
3. `evidence_source` missing → verifier not reaching graph query path
4. `hops` empty → verifier matched rule but found no graph evidence
5. Lifecycle override count drops to 0 → regression in existing processor

User Decision Prompt: 验证结果是否通过？请回复 `通过` 或 `不通过`。

**Step 6: Commit rule update**

```bash
cd /Volumes/Shuttle/projects/neonspark
git add .gitnexus/rules/approved/unity.battlemode-editor-global-init.v2.yaml .gitnexus/rules/compiled/analyze_rules.v2.json
git commit -m "feat(rules): use method_triggers_scene_load for Global.InitGlobal scene load chain"
```

---

## Plan Audit Verdict
audit_scope: DC-01 through DC-04, Tasks 1-5
finding_summary: P0=1, P1=2, P2=0
critical_mismatches:
- P0: test runner commands used `node --test src/**/*.ts` against raw TypeScript — fixed: all test commands now use `npx vitest run test/unit/...` and test files placed in `gitnexus/test/unit/` with vitest syntax
major_risks:
- P1: `processBinding` signature change adds `sceneFilesByName` as 7th arg, shifting `addEdge` to 8th — internally consistent but easy to mis-apply; implementer must read full diff carefully. status: accepted
- P1: Task ordering dependency (Task 1 must complete before Task 2/3 reference `scene_name` field) — no explicit guard, but sequential ordering is documented. status: accepted
anti_placeholder_checks:
- Task 2 test asserts `binding.scene_name === 'Global'` (real value, not placeholder): PASS
- Task 2 negative test strips `scene_name` line and asserts `undefined` (genuine absence check): PASS
- Task 3 negative test uses mismatched scene name `NonExistentScene`: PASS
- Task 3 negative test uses graph with no File nodes at all: PASS
- Task 3 negative test omits `scene_name` entirely from binding: PASS
- DC-04 Cypher checks `r.reason STARTS WITH 'unity-rule-scene-load:'` matching exact emitted string: PASS
authenticity_checks:
- DC-04 verification is live Cypher against indexed neonspark graph: PASS
- DC-04 Task 5 Step 5 uses `runtime_chain_verify=on-demand` for real runtime chain check: PASS
- Task 2 `scalar('scene_name')` uses closure-scoped helper inside the binding parse loop (correct): PASS
- Import paths in Task 3 test use `../../src/...` from `test/unit/` (correct for vitest): PASS
approval_decision: pass
