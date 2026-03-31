# Unity Resources Hydration Runtime Contract Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `query/context` 中 `unity_resources` / `unity_hydration_mode` 参数在运行时未生效的问题，恢复并稳定 Unity hydration 契约。

**Architecture:** 采用 `@gitnexus-refactoring` 顺序（interfaces → implementations → callers → tests）：先补齐可失败的契约测试，再把历史已验证的 hydration 运行时（commit `3547243`）抽离为独立模块并适配当前 Ladybug runtime，最后回接 `LocalBackend.query/context` 与 benchmark gate。`context(on)` 继续返回顶层 `resourceBindings/serializedFields/unityDiagnostics/hydrationMeta`；`query(on)` 在 `process_symbols/definitions` 的符号级别附带同构证据，避免破坏现有顶层结构。

**Tech Stack:** TypeScript, Node.js `node:test`, GitNexus Local MCP backend, Unity resolver/scan-context pipeline, LadybugDB adapter.

---

## Status Ledger

Task | Status | Facts
--- | --- | ---
Task 1: 锁定失败契约测试（先红） | completed | Added failing tests in `unity-runtime-hydration.test.ts` + `retrieval-runner.test.ts`; `npm --prefix gitnexus run build` failed as expected with `TS2307` (missing `./unity-runtime-hydration.js`); committed as `2f391f8`.
Task 2: 抽取并恢复 Unity Hydration Runtime 实现 | completed | Added `unity-runtime-hydration.ts` with compact/parity orchestration + DI runtime hooks; updated merge/meta tests to import the module; `build + local-backend.unity-merge/unity-runtime-hydration tests` passed (9/9); committed as `b08a7bb`.
Task 3: 回接 `context` 运行时契约 | completed | Wired `context` params (`unity_resources` / `unity_hydration_mode`) + runtime hydration attach path while preserving `context(off)` default structure; required `build + local tests` passed; committed as `e9d7e24`.
Task 4: 回接 `query` 运行时契约 + Benchmark Gate | completed | Wired symbol-level `query(on)` hydration payload attach path and added runner gate for missing query evidence; `build + retrieval-runner.test` passed and `npm --prefix gitnexus run test:u3:gates` passed (48/48); committed as `f991a11`.
Task 5: 实仓回归验证与调查文档闭环 | completed | Real-repo checks rerun on `neonspark` (`context` compact/parity now include `hydrationMeta`; `query(on)` carries Unity fields at symbol level in `definitions` for sampled query); final suite `build + node --test dist/mcp/local/*.test.js dist/benchmark/u2-e2e/*.test.js` passed (62/62); follow-up runtime fix committed as `0f526ae`; docs/report committed as `a680a4e`.

## Refactoring Scope Snapshot

- `gitnexus impact --uid Method:...:query --direction upstream`：`impactedCount=14`, `risk=CRITICAL`。
- `gitnexus impact --uid Method:...:context --direction upstream`：`impactedCount=20`, `risk=CRITICAL`。
- 受影响调用面覆盖 `CLI / MCP / benchmark / server`，所以必须先锁定契约测试，再做运行时回接。

### Task 1: 锁定失败契约测试（先红）

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`
- Test: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`
- Test: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: 写失败测试 - compact 不完整时必须给出 retry 信号**

```ts
test('hydrateUnityForSymbol(compact) marks needsParityRetry when lightweight bindings remain', async () => {
  const out = await hydrateUnityForSymbol({
    mode: 'compact',
    basePayload: {
      resourceBindings: [{ resourcePath: 'Assets/A.prefab', resourceType: 'prefab', bindingKind: 'direct', componentObjectId: 'summary', lightweight: true, evidence: { line: 0, lineText: '' }, serializedFields: { scalarFields: [], referenceFields: [] }, resolvedReferences: [] }],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    },
    // 其他依赖用 stub
  });

  assert.equal(out.hydrationMeta?.effectiveMode, 'compact');
  assert.equal(out.hydrationMeta?.needsParityRetry, true);
});
```

**Step 2: 写失败测试 - parity 必须完成或显式 fallback**

```ts
test('hydrateUnityForSymbol(parity) sets isComplete=true on parity success', async () => {
  const out = await hydrateUnityForSymbol({ mode: 'parity', /* stub parity success */ });
  assert.equal(out.hydrationMeta?.effectiveMode, 'parity');
  assert.equal(out.hydrationMeta?.isComplete, true);
});
```

**Step 3: 在 U2 runner 测试中加入 query(on) 证据门禁**

```ts
assert.ok(
  out.assertions.failures.some((f) => f.includes('query(on) must include unity serialized/resource evidence')),
);
```

**Step 4: 运行测试并确认失败**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-runtime-hydration.test.js gitnexus/dist/benchmark/u2-e2e/retrieval-runner.test.js`
Expected: FAIL（`hydrateUnityForSymbol` 未实现，query(on) 新断言未满足）。

**Step 5: 提交失败测试**

```bash
git add gitnexus/src/mcp/local/unity-runtime-hydration.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "test(unity): add failing runtime hydration contract guards"
```

### Task 2: 抽取并恢复 Unity Hydration Runtime 实现

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/unity-runtime-hydration.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.unity-merge.test.ts`
- Modify: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`
- Test: `gitnexus/src/mcp/local/local-backend.unity-merge.test.ts`
- Test: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`

**Step 1: 从 `3547243` 迁移 runtime orchestration 到独立模块（适配 Ladybug）**

```ts
// unity-runtime-hydration.ts
export async function hydrateUnityForSymbol(input: HydrateUnityInput): Promise<UnityContextPayload> {
  if (input.mode === 'compact') return runCompactHydration(input);
  return runParityHydrationWithFallback(input);
}
```

**Step 2: 保留并复用已有能力（禁止重写同类逻辑）**

```ts
// 复用现有模块
readUnityOverlayBindings(...)
hydrateLazyBindings(...)
readUnityParityCache(...)
upsertUnityParityCache(...)
loadUnityParitySeed(...)
resolveUnityBindings(...)
attachUnityHydrationMeta(...)
```

**Step 3: 添加最小依赖注入接口，隔离 DB 与文件系统副作用**

```ts
export interface HydrationDeps {
  executeQuery: (query: string, params?: Record<string, unknown>) => Promise<any[]>;
  repoPath: string;
  storagePath: string;
  indexedCommit: string;
}
```

**Step 4: 运行测试并确认通过**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/local-backend.unity-merge.test.js gitnexus/dist/mcp/local/unity-runtime-hydration.test.js`
Expected: PASS。

**Step 5: 提交实现**

```bash
git add gitnexus/src/mcp/local/unity-runtime-hydration.ts gitnexus/src/mcp/local/local-backend.unity-merge.test.ts gitnexus/src/mcp/local/unity-runtime-hydration.test.ts
git commit -m "refactor(unity): extract and restore runtime hydration orchestration"
```

### Task 3: 回接 `context` 运行时契约

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/src/mcp/local/unity-runtime-hydration.test.ts`

**Step 1: 扩展 context 参数并解析 mode**

```ts
private async context(repo: RepoHandle, params: {
  name?: string;
  uid?: string;
  file_path?: string;
  include_content?: boolean;
  unity_resources?: string;
  unity_hydration_mode?: string;
}): Promise<any> {
  const unityResourcesMode = parseUnityResourcesMode(params.unity_resources);
  const unityHydrationMode = parseUnityHydrationMode(params.unity_hydration_mode);
}
```

**Step 2: 在 `unity_resources !== off` 且符号可解析时附加 hydration payload**

```ts
if (unityResourcesMode !== 'off' && symNodeId && symKind === 'Class') {
  const base = await loadUnityContext(repo.id, symNodeId, (q) => executeQuery(repo.id, q));
  const hydrated = await hydrateUnityForSymbol({ mode: unityHydrationMode, basePayload: base, ...deps });
  Object.assign(result, hydrated);
}
```

**Step 3: 保持 `context(off)` 返回结构不变**

```ts
// 仅在 unityResourcesMode !== 'off' 时注入字段，默认路径完全兼容旧返回
```

**Step 4: 运行测试**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/unity-runtime-hydration.test.js gitnexus/dist/mcp/local/local-backend.unity-merge.test.js`
Expected: PASS。

**Step 5: 提交 context 回接**

```bash
git add gitnexus/src/mcp/local/local-backend.ts
git commit -m "feat(unity): wire runtime hydration contract into context tool"
```

### Task 4: 回接 `query` 运行时契约 + Benchmark Gate

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`
- Test: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: 在 query 的符号级结果注入 Unity 证据（不破坏顶层结构）**

```ts
const symbolEntry = {
  id: sym.nodeId,
  name: sym.name,
  ...,
  ...(unityResourcesMode !== 'off' && sym.nodeId && sym.type === 'Class'
    ? await hydrateUnityForSymbol({ mode: unityHydrationMode, basePayload: await loadUnityContext(...) , ...deps })
    : {}),
};
```

**Step 2: 在 runner 中新增 query(on) 断言**

```ts
if (!hasUnityEvidenceFromQueryOn) {
  failures.push(`${scenario.symbol}: query(on) must include unity serialized/resource evidence`);
}
```

**Step 3: 运行测试并确认通过**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/u2-e2e/retrieval-runner.test.js`
Expected: PASS。

**Step 4: 运行 U3 gate 回归（防止跨流程退化）**

Run: `npm --prefix gitnexus run test:u3:gates`
Expected: PASS。

**Step 5: 提交 query + benchmark 修复**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "feat(unity): restore query hydration wiring and enforce benchmark contract gate"
```

### Task 5: 实仓回归验证与调查文档闭环

**User Verification: required**

**Files:**
- Modify: `docs/2026-03-31-unity-resources-hydration-risk-investigation.md`
- Create: `docs/reports/2026-03-31-unity-resources-hydration-runtime-fix-verification.md`

**Step 1: 在 neonspark 上重跑 context/query 对比**

Run:
```bash
gitnexus context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration compact | jq '{status, hydrationMeta, rb:(.resourceBindings|length)}'
gitnexus context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration parity | jq '{status, hydrationMeta, rb:(.resourceBindings|length)}'
gitnexus query -r neonspark --unity-resources on --unity-hydration compact 'AssetRef' | jq '.process_symbols[] | select(.resourceBindings!=null) | {id, rb:(.resourceBindings|length), scalar:(.serializedFields.scalarFields|length)}' | head
```
Expected:
- compact: `hydrationMeta` 存在，且在不完整时 `needsParityRetry=true`。
- parity: `hydrationMeta.effectiveMode=parity` 且 `isComplete=true`。
- query(on): 至少一条符号具备 Unity 证据字段。

**Step 2: 写验证报告**

```md
# Unity Runtime Hydration Fix Verification (2026-03-31)
- context(off/on/parity) key diff
- query(off/on) symbol-level evidence diff
- benchmark gate result
- remaining risk
```

**Step 3: 更新调查文档状态为 closed/fixed**

```md
## Current Risk Statement
Confidence: high.
Status: fixed in runtime wiring (commit <sha>) with contract tests + benchmark gate.
```

**Step 4: 运行最终验证命令集**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/*.test.js gitnexus/dist/benchmark/u2-e2e/*.test.js`
Expected: PASS。

**Step 5: 提交文档与验证结果**

```bash
git add docs/2026-03-31-unity-resources-hydration-risk-investigation.md docs/reports/2026-03-31-unity-resources-hydration-runtime-fix-verification.md
git commit -m "docs(unity): close hydration runtime risk investigation with verification evidence"
```

---

## Final Verification Checklist

- `context --unity-resources on` 返回 `resourceBindings/serializedFields/unityDiagnostics/hydrationMeta`。
- `hydrationMeta` 满足 compact/parity 契约：compact 可 `needsParityRetry=true`，parity 必须 `isComplete=true`（或带 fallback 诊断）。
- `query --unity-resources on` 的符号级结果含 Unity 证据字段。
- `npm --prefix gitnexus run test:u3:gates` 通过。
- `@superpowers:verification-before-completion` 要求的最终命令输出已留痕到报告。
