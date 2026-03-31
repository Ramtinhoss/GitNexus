# Partial Class Unity Enrich Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 partial class 场景下 Unity enrich 关系缺失与 E2E 检索歧义，确保 `PlayerActor`/`NetPlayer` 在 full U2 E2E 中稳定产出资源绑定。

**Architecture:** 采用“benchmark 消歧 + enrich canonical script 映射”双层修复。检索层对 ambiguous 结果自动二次消歧；索引层为重复 symbol 选择 canonical script，并仅对 canonical class 节点写入 `UNITY_COMPONENT_INSTANCE`，避免 partial 节点重复写边。

**Tech Stack:** TypeScript (Node ESM), GitNexus LocalBackend tools (`query/context`), Unity enrich pipeline (`scan-context`, `unity-resource-processor`), Node test runner (`node:test`), JSON/Markdown reports。

---

### Task 1: 修复 PlayerActor 场景配置与 deep-dive context 入参

**Files:**
- Modify: `benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: 写失败测试（配置契约）**

```ts
test('PlayerActor scenario uses context file hint and valid context deep-dive input', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  const player = config.symbolScenarios.find((s) => s.symbol === 'PlayerActor');
  assert.equal(player?.contextFileHint, 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs');
  assert.equal(player?.deepDivePlan[0]?.tool, 'context');
  assert.equal(player?.deepDivePlan[0]?.input?.name, 'PlayerActor');
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/config.test.js dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: FAIL（`contextFileHint` 缺失或 `input.name` 不存在）。

**Step 3: 最小实现**

- 更新 `PlayerActor` 场景：
  - 增加 `contextFileHint`
  - deep-dive `context` 输入从 `query` 改为 `name`

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/config.test.js dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "test(benchmark): fix PlayerActor scenario context contract"
```

### Task 2: retrieval-runner 增加 ambiguous 自动消歧

**Files:**
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: 写失败测试**

```ts
test('runSymbolScenario retries context with file hint when response is ambiguous', async () => {
  // first context returns ambiguous, second with file_path returns found+resourceBindings
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: FAIL（未触发二次调用或 assertions 仍失败）。

**Step 3: 最小实现**

- 新增 `runContextWithDisambiguation`：
  - 首次调用：`context({ name, unity_resources })`
  - 若 `status==='ambiguous'`：优先使用 `contextFileHint` 重试（`file_path`）
  - 无 hint 时从候选选 `kind=Class && basename===<symbol>.cs`，再用 `uid` 重试
- 断言逻辑保持不变，仅保证拿到正确 context payload。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/benchmark/u2-e2e/retrieval-runner.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "feat(benchmark): add context disambiguation fallback for symbol scenarios"
```

### Task 3: scan-context 增加 partial class canonical 映射

**Files:**
- Modify: `gitnexus/src/core/unity/scan-context.ts`
- Modify: `gitnexus/src/core/unity/scan-context.test.ts`

**Step 1: 写失败测试**

```ts
test('buildUnityScanContext selects canonical script for duplicated symbol declarations', async () => {
  // declarations: PlayerActor.cs + PlayerActor.Visual.cs
  // expect canonical -> PlayerActor.cs
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/scan-context.test.js`  
Expected: FAIL（当前 duplicate symbol 不会进入映射）。

**Step 3: 最小实现**

- `UnityScanContext` 增加：
  - `symbolToScriptPaths: Map<string, string[]>`
  - `symbolToCanonicalScriptPath: Map<string, string>`
- 选择策略：
  - 优先 `<symbol>.cs`
  - 其次非 `*.Generated.cs` 与非 `*.<suffix>.cs`
  - 其次按资源命中数
  - 最后按路径字典序
- 保留旧字段 `symbolToScriptPath` 作为 canonical 兼容映射。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/core/unity/scan-context.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts
git commit -m "feat(unity): add canonical script mapping for duplicated symbols"
```

### Task 4: unity-resource-processor 仅对 canonical class 节点写入绑定

**Files:**
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- Modify: `gitnexus/src/core/ingestion/unity-resource-processor.test.ts`

**Step 1: 写失败测试**

```ts
test('processUnityResources writes UNITY_COMPONENT_INSTANCE only for canonical class node', async () => {
  // duplicated symbol class nodes, one canonical file path
  // expect relationships only from canonical node
});
```

**Step 2: 运行测试确认失败**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: FAIL（当前行为会全部跳过或重复写入）。

**Step 3: 最小实现**

- 预过滤改为：
  - 若 symbol 无 canonical 映射 -> skip + diagnostics
  - 若当前 classNode.filePath != canonical -> skip（不写边）
- 诊断新增 canonical 统计：`selected/skip-non-canonical/missing-canonical`。

**Step 4: 回归测试**

Run: `cd gitnexus && npm run build && node --test dist/core/ingestion/unity-resource-processor.test.js`  
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts
git commit -m "fix(unity): bind partial-class resources only on canonical class nodes"
```

### Task 5: 端到端回归验证 PlayerActor / NetPlayer

**Files:**
- Modify: `docs/reports/<RUN_ID>/`（运行产物）
- Modify: `/Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`

**Step 1: 执行 full E2E**

Run:

```bash
cd gitnexus
npm run benchmark:u2:e2e
```

Expected: 命令成功，输出新 `RUN_ID`。

**Step 2: 校验 PlayerActor/NetPlayer 结果**

Run:

```bash
cat ../docs/reports/<RUN_ID>/retrieval-summary.json
rg -n 'PlayerActor|NetPlayer' ../docs/reports/<RUN_ID>/retrieval-steps.jsonl
```

Expected:
- `PlayerActor` 不再因 `context(on)` 空绑定失败。
- `retrieval-steps` 中 `context` 结果不再停留 ambiguous 终态。

**Step 3: 运行关键测试集**

Run:

```bash
cd /Users/nantasmac/projects/agentic/GitNexus
npm --prefix gitnexus run build
node --test \
  gitnexus/dist/benchmark/u2-e2e/*.test.js \
  gitnexus/dist/core/unity/scan-context.test.js \
  gitnexus/dist/core/ingestion/unity-resource-processor.test.js \
  gitnexus/dist/cli/benchmark-u2-e2e.test.js
```

Expected: PASS。

**Step 4: 更新进度文档**

记录：
- 根因修复策略与变更点
- 新 run 的 PlayerActor/NetPlayer 验证结果
- diagnostics 变化（`missing scanContext script mapping` 对比）

**Step 5: Commit**

```bash
git add gitnexus/src/core/unity/scan-context.ts gitnexus/src/core/unity/scan-context.test.ts \
  gitnexus/src/core/ingestion/unity-resource-processor.ts gitnexus/src/core/ingestion/unity-resource-processor.test.ts \
  gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts \
  benchmarks/u2-e2e/neonspark-u2-symbol-scenarios.json docs/reports \
  /Users/nantasmac/projects/obsidian-mind/20_项目/GitNexus\ 开发/Project_GitNexus_Progress.md

git commit -m "fix(unity): support partial-class canonical mapping and stabilize u2 e2e disambiguation"
```

---

## Execution Notes

1. 若 full E2E 任一 gate 失败，先用 `@systematic-debugging` 做根因复查，再继续。
2. 若 `PlayerActor` 修复后 `NetPlayer` 暴露同类问题，按同一 canonical 规则扩展，不单点打补丁。
3. 完成前执行 `@verification-before-completion`，基于最新命令输出再宣告完成。
