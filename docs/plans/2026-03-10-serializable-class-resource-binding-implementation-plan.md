# Serializable Class Unity Resource Binding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `AssetRef` 这类序列化自定义类在 `context/query --unity_resources on` 下直接返回资源绑定，并将该能力推广为所有 serializable class 的通用机制。

**Architecture:** 在现有“脚本 guid -> 组件实例”链路外新增“字段声明类型 -> 资源字段路径”的补充链路。索引阶段构建 C# 序列化类型索引（宿主类字段名到声明类型），enrich 阶段把命中的 serializable class 写入独立关系，检索阶段合并读取两类关系返回统一 `resourceBindings`。首个验收样例使用 `AssetRef`，但实现不允许写 `AssetRef` 特判。

**Tech Stack:** TypeScript (Node ESM), GitNexus Unity enrich pipeline (`scan-context`, `unity-resource-processor`), MCP local backend (`unity-enrichment`), Node test runner (`node:test`), U2 E2E benchmark。

---

### Task 1: 新增 C# 序列化类型索引能力（通用，不含业务特判）

**Files:**
- Create: `gitnexus/src/core/unity/serialized-type-index.ts`
- Create: `gitnexus/src/core/unity/serialized-type-index.test.ts`

**Step 1: 写失败测试（解析 serializable class + 宿主字段类型）**

```ts
test('buildSerializableTypeIndex extracts serializable symbols and host field declared types', async () => {
  const index = buildSerializableTypeIndexFromSources([
    {
      filePath: 'Assets/Scripts/AssetRef.cs',
      content: `
        [System.Serializable]
        public class AssetRef { public string guid; }
      `,
    },
    {
      filePath: 'Assets/Scripts/InventoryConfig.cs',
      content: `
        using UnityEngine;
        using System.Collections.Generic;
        public class InventoryConfig : ScriptableObject {
          public AssetRef icon;
          [SerializeField] private List<AssetRef> drops;
          [SerializeField] private int ignored;
        }
      `,
    },
  ]);

  assert.equal(index.serializableSymbols.has('AssetRef'), true);
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('icon'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('drops'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.has('ignored'), false);
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/serialized-type-index.test.js`  
Expected: FAIL（模块/函数不存在）。

**Step 3: 最小实现**

```ts
export interface SerializableTypeIndex {
  serializableSymbols: Set<string>;
  hostFieldTypeHints: Map<string, Map<string, string>>;
}

export function buildSerializableTypeIndexFromSources(
  sources: Array<{ filePath: string; content: string }>,
): SerializableTypeIndex {
  // 1) 识别 [Serializable] class/struct 名称
  // 2) 识别宿主 class 的字段声明（含 List<T>/T[]）
  // 3) 仅保留声明类型属于 serializableSymbols 的字段
}
```

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/serialized-type-index.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/serialized-type-index.ts gitnexus/src/core/unity/serialized-type-index.test.ts
git commit -m "feat(unity): add serializable type index for host field hints"
```

### Task 2: 将序列化类型索引接入 scan-context

**Files:**
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`
- Modify: `gitnexus/src/core/unity/resolver.ts`（仅类型兼容导入/透传）

**Step 1: 写失败测试（scan-context 暴露 serializable 索引）**

```ts
test('buildUnityScanContext exposes serializable symbol index and host field type hints', async () => {
  const context = await buildUnityScanContext({ repoRoot: tempRoot });
  assert.equal(context.serializableSymbols.has('AssetRef'), true);
  assert.equal(context.hostFieldTypeHints.get('InventoryConfig')?.get('icon'), 'AssetRef');
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/scan-context.test.js`  
Expected: FAIL（`UnityScanContext` 无相关字段）。

**Step 3: 最小实现**

- `UnityScanContext` 新增：
  - `serializableSymbols: Set<string>`
  - `hostFieldTypeHints: Map<string, Map<string, string>>`
- `buildUnityScanContext` 在解析脚本后调用 `buildSerializableTypeIndexFromSources`，写入上述字段。
- 保持现有 canonical / guid / resource 行为不变。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/scan-context.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts gitnexus/src/core/unity/resolver.ts
git commit -m "feat(unity): expose serializable type hints in scan context"
```

### Task 3: enrich 写入 serializable class 到资源实例的关系

**Files:**
- Modify: `gitnexus/src/core/graph/types.ts`
- Modify: `gitnexus/src/core/kuzu/schema.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: 写失败测试（AssetRef 关系写入）**

```ts
test('processUnityResources writes UNITY_SERIALIZED_TYPE_IN for serializable class field matches', async () => {
  // graph 里存在 HostClass + AssetRef class
  // fake scanContext.hostFieldTypeHints: HostClass.assetRef -> AssetRef
  // fake resolveBindings 返回 serializedFields.referenceFields 含 assetRef
  // expect: AssetRef -(UNITY_SERIALIZED_TYPE_IN)-> componentNode
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: FAIL（新关系类型不存在/未写入）。

**Step 3: 最小实现**

- 新增关系类型：`UNITY_SERIALIZED_TYPE_IN`。
- 在 `processUnityResources` 写入组件节点后，基于：
  - 当前宿主 symbol（如 `InventoryConfig`）
  - `scanContext.hostFieldTypeHints.get(hostSymbol)`
  - binding 的 `serializedFields` 字段名
  找出命中的 serializable type symbol。
- 为每个命中写边：
  - `sourceId = serializable class canonical node`
  - `targetId = componentNode.id`
  - `type = UNITY_SERIALIZED_TYPE_IN`
  - `reason = JSON.stringify({ hostSymbol, fieldName, declaredType, sourceLayer })`
- diagnostics 增加计数：`serialized-type: edges=<n>, symbols=<m>, misses=<k>`。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/core/graph/types.ts gitnexus/src/core/kuzu/schema.ts gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "feat(unity): link serializable class symbols to resource component instances"
```

### Task 4: context/query 合并读取 serializable-class 绑定

**Files:**
- Modify: `gitnexus/src/mcp/local/unity-enrichment.ts`
- Modify: `gitnexus/src/mcp/local/unity-enrichment.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`（如需补充字段注释/返回契约）

**Step 1: 写失败测试（通过新关系拿到绑定）**

```ts
test('loadUnityContext returns resourceBindings for UNITY_SERIALIZED_TYPE_IN relations', async () => {
  const out = await loadUnityContext('repo-id', 'Class:...:AssetRef', async () => [
    {
      relationType: 'UNITY_SERIALIZED_TYPE_IN',
      relationReason: '{"hostSymbol":"InventoryConfig","fieldName":"icon","declaredType":"AssetRef"}',
      resourcePath: 'Assets/Config/Inventory.asset',
      payload: JSON.stringify({ resourceType: 'asset', serializedFields: { scalarFields: [], referenceFields: [] } }),
    },
  ] as any);
  assert.equal(out.resourceBindings.length, 1);
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/unity-enrichment.test.js`  
Expected: FAIL（查询仅匹配 `UNITY_COMPONENT_INSTANCE`）。

**Step 3: 最小实现**

- `loadUnityContext` 查询改为 `r.type IN ['UNITY_COMPONENT_INSTANCE', 'UNITY_SERIALIZED_TYPE_IN']`。
- `projectUnityBindings` 兼容读取 `relationType/relationReason`。
- 保持 `resourceBindings/serializedFields/unityDiagnostics` 现有返回结构向后兼容。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/mcp/local/unity-enrichment.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-enrichment.test.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "feat(mcp): surface serializable class resource bindings in unity context"
```

### Task 5: 将 AssetRef 从“容忍空绑定”升级为“必须可绑定”并完成 E2E 验收

**Files:**
- Modify: `benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`
- Modify: `docs/reports/<RUN_ID>/`（运行产物）
- Modify: `/Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus.md`
- Modify: `/Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`

**Step 1: 写失败测试（AssetRef 必须有 context 绑定）**

```ts
test('AssetRef requires context(on) resourceBindings after serializable-class coverage', async () => {
  const out = await runSymbolScenario(mockRunner, assetRefScenario);
  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => f.includes('context(on) must include resourceBindings')));
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: FAIL（当前断言允许空绑定）。

**Step 3: 最小实现**

- 更新 `AssetRef` 场景目标文案（不再允许空绑定）。
- 更新 `assertScenario`：`AssetRef` 需要 `context(on).resourceBindings.length > 0`，deep-dive 作为补充证据。

**Step 4: 执行 E2E 与关键回归**

Run:

```bash
cd gitnexus
npm run benchmark:u2:e2e
```

然后校验：

```bash
cat ../docs/reports/<RUN_ID>/retrieval-summary.json
node -e "const fs=require('fs');const rows=fs.readFileSync('../docs/reports/<RUN_ID>/retrieval-steps.jsonl','utf8').trim().split(/\n+/).map(l=>JSON.parse(l));const r=rows.find(x=>x.symbol==='AssetRef'&&x.stepId==='context-on');console.log((r?.output?.resourceBindings||[]).length);"
```

Expected:
- `AssetRef` 为 `PASS` 且 `context-on` 绑定数 `> 0`。

再跑关键测试集：

```bash
cd /Users/nantasmac/projects/agentic/GitNexus
npm --prefix gitnexus run build
node --test \
  gitnexus/dist/core/unity/*.test.js \
  gitnexus/dist/core/ingestion/unity-resource-processor.test.js \
  gitnexus/dist/mcp/local/unity-enrichment.test.js \
  gitnexus/dist/benchmark/u2-e2e/*.test.js \
  gitnexus/dist/cli/benchmark-u2-e2e.test.js
```

Expected: PASS。

**Step 5: 文档回填 + Commit**

- 在 `Project_GitNexus.md` 回填“U3（Serializable Class 资源绑定）能力状态与验收口径”。
- 在 `Project_GitNexus_Progress.md` 回填 run 结果（含 `AssetRef` 绑定证据）。

```bash
git add benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json \
  gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts \
  gitnexus/src/core/unity/serialized-type-index.ts gitnexus/src/core/unity/serialized-type-index.test.ts \
  gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts \
  gitnexus/src/core/graph/types.ts gitnexus/src/core/kuzu/schema.ts \
  gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts \
  gitnexus/src/mcp/local/unity-enrichment.ts gitnexus/src/mcp/local/unity-enrichment.test.ts gitnexus/src/mcp/local/local-backend.ts \
  docs/reports /Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus\ 开发/Project_GitNexus.md \
  /Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus\ 开发/Project_GitNexus_Progress.md

git commit -m "feat(unity): support generic serializable-class resource bindings with AssetRef e2e coverage"
```

---

## Execution Notes

1. 若任一 gate 失败，先按 `@systematic-debugging` 复查根因，再继续后续 task。  
2. 完成前必须执行 `@verification-before-completion`，基于真实命令输出宣告通过。  
3. 执行本计划时使用 `@executing-plans`，并在隔离 worktree 内实施，避免污染当前脏工作区。
