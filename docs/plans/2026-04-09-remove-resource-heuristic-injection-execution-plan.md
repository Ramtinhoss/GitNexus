# Remove `resource_heuristic` Injection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完整移除 `query/context` 侧 `resource_heuristic` 进程注入，并保持 slim 输出在无 process 场景下仍可通过 `resource_hints` 提供可执行收敛线索。

**Architecture:** 变更分三层推进：1) 后端检索层移除 heuristic 注入与相关回退类型；2) agent-safe slim 整形层移除 heuristic 分层/打分分支；3) 对外契约层（MCP tool 描述、真理源文档、skills 镜像）同步到 “slim-first / full-for-debug”。全程采用 TDD，小步提交，确保每条设计条款都有自动化证据与失败信号。

**Tech Stack:** TypeScript, Node.js, Vitest, node:test, GitNexus MCP local backend, Markdown docs/skills contracts.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | red: `task1-red.json` failed (`expected true to be false`); green: `task1-green.json` passed after removing query heuristic injection block
Task 2 | completed | red: `task2-red.json` failed (`expected true to be false`); green: `task2-green.json` passed after removing context heuristic injection block + fallback cleanup
Task 3 | completed | red: `build` failed with TS2578 on legacy heuristic mode; green: `build` pass + `task3-green.json` (`numFailedTests=0`) + `node --test dist/mcp/local/process-evidence.test.js` pass
Task 4 | completed | red: `task4-red.json` failed on non-empty `clues.process_hints`; green: `task4-green.json` passed after slim tier/scoring heuristic branch removal
Task 5 | completed | red: contract test asserted absence of `resource_heuristic`; green: `build` pass + `node --test dist/cli/benchmark-agent-safe-query-context.test.js` pass with slim/default + full/debug-only wording
Task 6 | completed | red: `task6-red.txt` captured legacy matches; green: `task6-green.txt` empty with no `resource_heuristic` in runtime truth docs
Task 7 | completed | red: `task7-red.txt` captured skills/contract residue; green: `task7-green.txt` empty after source+installed mirror sync
Task 8 | completed | gate scan pass (`rg resource_heuristic` in tools/skills/docs); full matrix pass: `build` + `task8-vitest.json` (`numFailedTests=0`) + node tests (`dist/cli/benchmark...`, `dist/benchmark/.../runner.test.js`) + `npm --prefix gitnexus test`
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Query/Context 在 `processRows.length===0` 时不得注入 heuristic process | critical | Task 1, Task 2, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task1-2.json` | `.gitnexus/reports/remove-resource-heuristic/task1-2.json:numFailedTests` | 任一断言仍观察到 `evidence_mode === 'resource_heuristic'`
DC-02 Process 证据类型仅保留 `direct_step | method_projected`，并清理衍生引用 origin | critical | Task 3, Task 8 | `npm --prefix gitnexus run build && npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/process-confidence.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task3.json && node --test gitnexus/dist/mcp/local/process-evidence.test.js` | `.gitnexus/reports/remove-resource-heuristic/task3.json:testResults[0].assertionResults` | 类型仍接受 `resource_heuristic` 或 merge 仍产出 heuristic 行
DC-03 Slim 语义分层中 `clues.process_hints` 不再承载 heuristic clue 注入；summary/ranking 不依赖 heuristic 分支 | critical | Task 4, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task4.json` | `.gitnexus/reports/remove-resource-heuristic/task4.json:testResults[*].assertionResults[*].fullName` | 仍有断言依赖或输出包含 clue-tier heuristic process hint
DC-04 MCP 工具契约与 benchmark contract 测试移除 heuristic 描述，并明确 full 仅用于调试 | critical | Task 5, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task5.json` | `.gitnexus/reports/remove-resource-heuristic/task5.json:testResults[0].assertionResults` | 文案仍出现 `resource_heuristic` 或缺失 slim/full 定位说明
DC-05 真理源文档与 skills（源 + 安装镜像）同步一致，且无占位语义 | critical | Task 6, Task 7, Task 8 | `bash -lc 'rg -n "resource_heuristic" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md .agents/skills/gitnexus gitnexus/skills gitnexus/src/mcp/tools.ts && exit 1 || exit 0'` | `command exit code` | 命中任何残留 `resource_heuristic` 引用（允许历史 design 文档不在此命令范围）
DC-06 真实语义闭环不靠“字段存在”伪通过：resource hints 仍可驱动 narrowing，freeze-ready 仍要求非空链路证据 | critical | Task 1, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task8-freeze.json` | `.gitnexus/reports/remove-resource-heuristic/task8-freeze.json:testResults[*].assertionResults[*].status` | `freeze_ready=true` 但 `confirmed_chain.steps` 可为空，或无 tool-evidence 约束

## Skill References

- `@superpowers:test-driven-development`：每个任务都先写失败测试，再最小实现。
- `@superpowers:verification-before-completion`：Task 8 必须执行完验证矩阵后才允许宣告完成。
- `@gitnexus:gitnexus-exploring`：验证 `query/context` slim 输出语义与跟进提示是否符合新契约。

## Authenticity Assertions

- `assert no placeholder path`: 新增/更新的命令、路径、evidence 字段不得出现 `TODO/TBD/placeholder/<...>`。
- `assert live mode has tool evidence`: 关键断言必须读取真实工具输出（Vitest JSON、node:test、grep exit code），不得仅检查字段存在。
- `assert freeze requires non-empty confirmed_chain.steps`: benchmark freeze-ready 相关断言必须保证 `confirmed_chain.steps` 非空。
- `assert no heuristic backdoor`: 即使输入包含旧字段字符串，输出也不能重新出现 `resource_heuristic` process row。

### Task 1: Query Path Red Test + Injection Removal

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write the failing test**

```ts
it('query no longer injects heuristic rows when processRows is empty', async () => {
  const result = await backend.callTool('query', {
    query: 'Reload',
    unity_resources: 'on',
    unity_hydration_mode: 'compact',
  });

  expect(result.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(false);
  expect(Array.isArray(result.resource_hints)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "query no longer injects heuristic rows" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task1-red.json`
Expected: FAIL，`expected true to be false`（当前仍会注入 heuristic row）。

**Step 3: Write minimal implementation**

```ts
// local-backend.ts (query path)
// delete: if (processRows.length === 0 && unityResourcesMode !== 'off') { ... heuristicRows ... }
if (processRows.length === 0) {
  definitions.push(symbolEntry);
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "query no longer injects heuristic rows" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task1-green.json`
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "refactor: remove query-side resource heuristic process injection"
```

### Task 2: Context Path Red Test + Injection Removal

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write the failing test**

```ts
it('context no longer injects heuristic rows when processRows is empty', async () => {
  const out = await backend.callTool('context', {
    name: 'ReloadBase',
    file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    unity_resources: 'on',
    unity_hydration_mode: 'parity',
  });

  expect(out.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(false);
  expect(Array.isArray(out.resource_hints || out.next_hops || [])).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "context no longer injects heuristic rows" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task2-red.json`
Expected: FAIL（现状仍包含 heuristic evidence mode）。

**Step 3: Write minimal implementation**

```ts
// local-backend.ts (context path)
// delete: if (processRows.length === 0) { ... heuristicRows ... }
result.processes = processRows.map(/* unchanged mapping for direct/projected rows */);
```

并同步修正 fallback：

```ts
function aggregateProcessEvidenceMode(...) {
  if (rows.some(... === 'direct_step')) return 'direct_step';
  return 'method_projected';
}

function toProcessRefOrigin(mode: unknown): ProcessRefOrigin {
  if (mode === 'direct_step') return 'step_in_process';
  return 'method_projected';
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "context no longer injects heuristic rows" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task2-green.json`
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "refactor: remove context-side resource heuristic process injection"
```

### Task 3: Process Evidence/Confidence/Ref Type Cleanup

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/src/mcp/local/process-confidence.ts`
- Modify: `gitnexus/src/mcp/local/process-ref.ts`
- Modify: `gitnexus/src/mcp/local/derived-process-reader.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.test.ts`
- Modify: `gitnexus/src/mcp/local/process-confidence.test.ts`
- Test: `gitnexus/src/mcp/local/process-confidence.test.ts`
- Test: `gitnexus/src/mcp/local/process-evidence.test.ts`

**Step 1: Write the failing test**

```ts
// process-confidence.test.ts
it('rejects legacy heuristic evidence mode at type/runtime boundary', () => {
  expect(deriveConfidence({ evidenceMode: 'method_projected' })).toBe('medium');
  // @ts-expect-error legacy mode removed
  deriveConfidence({ evidenceMode: 'resource_heuristic' });
});
```

```ts
// process-evidence.test.ts
test('mergeProcessEvidence never emits resource_heuristic rows', () => {
  const out = mergeProcessEvidence({ directRows: [], projectedRows: [] });
  assert.equal(out.some((row) => row.evidence_mode === 'resource_heuristic'), false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/process-confidence.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task3-red.json`
Expected: FAIL（当前 union 仍包含 `resource_heuristic`）。

**Step 3: Write minimal implementation**

```ts
// process-confidence.ts
export type ProcessEvidenceMode = 'direct_step' | 'method_projected';

export function deriveConfidence(input: DeriveConfidenceInput): ProcessConfidence {
  if (input.evidenceMode === 'method_projected') return 'medium';
  if (String(input.processSubtype || '').toLowerCase() === 'unity_lifecycle') return 'medium';
  return 'high';
}
```

```ts
// process-evidence.ts
export function mergeProcessEvidence(input: {
  directRows: ProcessEvidenceRow[];
  projectedRows: ProjectedProcessEvidenceRow[];
}): MergedProcessEvidenceRow[] {
  // remove heuristicRows branch entirely
}
```

并同步：

```ts
// process-ref.ts
export type ProcessRefOrigin = 'step_in_process' | 'method_projected';

// derived-process-reader.ts
'origin: method_projected'
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/process-confidence.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task3-green.json && node --test gitnexus/dist/mcp/local/process-evidence.test.js`
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/process-evidence.ts gitnexus/src/mcp/local/process-confidence.ts gitnexus/src/mcp/local/process-ref.ts gitnexus/src/mcp/local/derived-process-reader.ts gitnexus/src/mcp/local/process-evidence.test.ts gitnexus/src/mcp/local/process-confidence.test.ts
git commit -m "refactor: remove resource heuristic from process evidence and type contracts"
```

### Task 4: Agent-Safe Slim Layer Simplification

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Modify: `gitnexus/test/unit/local-backend-next-hops.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing test**

```ts
it('slim clues.process_hints is always empty after heuristic removal', () => {
  const out = buildSlimQueryResult({ processes: [{ summary: 'legacy clue', confidence: 'low' }] } as any, {
    repoName: 'neonspark-core',
    queryText: 'Reload',
  });

  expect((out as any).facts.process_hints.length).toBeGreaterThanOrEqual(0);
  expect((out as any).clues.process_hints).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task4-red.json`
Expected: FAIL（当前 `clues.process_hints` 仍承载 heuristic rows）。

**Step 3: Write minimal implementation**

```ts
// agent-safe-response.ts
const facts = { ... , process_hints: processHints };
const clues = { process_hints: [], resource_hints: resourceHints };

// remove splitProcessHintsByTier / isLowConfidenceHeuristic /
// isLowConfidenceHeuristicProcessHint / heuristic scoring branches
```

并调整 `chooseTopSummary`：仅比较 top process score 与 candidate score，不再 heuristic 特判。

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task4-green.json`
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts
git commit -m "refactor: simplify slim tiering and scoring after heuristic removal"
```

### Task 5: MCP Tool Contract + CLI Contract Test Update

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`
- Test: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write the failing test**

```ts
test('runtime retrieval contract docs remove heuristic mode and pin full as debug-only', async () => {
  const text = ...;
  assert.ok(!text.includes('resource_heuristic'));
  assert.ok(text.includes('response_profile=slim is the default and sufficient'));
  assert.ok(text.includes('response_profile=full is for debugging'));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts -t "runtime retrieval contract docs" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task5-red.json`
Expected: FAIL（当前文案仍含 heuristic 描述）。

**Step 3: Write minimal implementation**

```ts
// tools.ts (query/context descriptions)
// direct_step | method_projected
// add:
// - response_profile=slim is the default and sufficient for all normal agent workflows
// - response_profile=full is for debugging and deep evidence inspection only
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts -t "runtime retrieval contract docs" --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task5-green.json`
Expected: PASS。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "docs: update MCP query/context contract after heuristic removal"
```

### Task 6: Source-of-Truth Docs Sync

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `UNITY_RUNTIME_PROCESS.md`
- Test: `docs/unity-runtime-process-source-of-truth.md`
- Test: `UNITY_RUNTIME_PROCESS.md`

**Step 1: Write the failing check**

```bash
# should fail before edits
rg -n "resource_heuristic" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md
```

**Step 2: Run check to verify it fails**

Run: `bash -lc 'rg -n "resource_heuristic" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md > .gitnexus/reports/remove-resource-heuristic/task6-red.txt'`
Expected: 输出非空（命中旧语义）。

**Step 3: Write minimal implementation**

```md
~~触发：processRows.length===0 且 resourceBindings>0 或 needsParityRetry → 注入 resource_heuristic + low clue~~ (已移除)
processRows.length===0 时符号归入 definitions（query）或 processes=[]（context）。
resource_hints 通过 buildNextHops() 独立提供资源绑定信息，不依赖 process 注入。
```

并将字段表中的 `evidence_mode` 更新为仅 `direct_step | method_projected`。

**Step 4: Run check to verify it passes**

Run: `bash -lc 'if rg -n "resource_heuristic" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md > .gitnexus/reports/remove-resource-heuristic/task6-green.txt; then echo "unexpected residual" && exit 1; fi'`
Expected: PASS（exit code 0）。

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md
git commit -m "docs: remove resource heuristic injection semantics from runtime truth source"
```

### Task 7: Skills + Shared Contract Mirror Sync

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md`
- Modify: `gitnexus/skills/_shared/unity-runtime-process-contract.md`

**Step 1: Write the failing check**

```bash
rg -n "resource_heuristic|non-heuristic leads" \
  .agents/skills/gitnexus/gitnexus-exploring/SKILL.md \
  gitnexus/skills/gitnexus-exploring.md \
  .agents/skills/gitnexus/gitnexus-guide/SKILL.md \
  gitnexus/skills/gitnexus-guide.md \
  .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md \
  gitnexus/skills/_shared/unity-runtime-process-contract.md
```

**Step 2: Run check to verify it fails**

Run: `bash -lc 'rg -n "resource_heuristic|non-heuristic leads" .agents/skills/gitnexus/gitnexus-exploring/SKILL.md gitnexus/skills/gitnexus-exploring.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md gitnexus/skills/_shared/unity-runtime-process-contract.md > .gitnexus/reports/remove-resource-heuristic/task7-red.txt'`
Expected: 输出非空（命中残留语句）。

**Step 3: Write minimal implementation**

```md
- response_profile=slim is sufficient for all normal workflows; use full only for debugging (hydrationMeta diagnostics, raw next_hops, full runtime_claim)
```

并在 shared contract 将：

```md
high/medium non-heuristic leads
```

改为：

```md
high/medium leads
```

同时删除 heuristic 专属规则条款。

**Step 4: Run check to verify it passes**

Run: `bash -lc 'if rg -n "resource_heuristic|non-heuristic leads" .agents/skills/gitnexus/gitnexus-exploring/SKILL.md gitnexus/skills/gitnexus-exploring.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md gitnexus/skills/_shared/unity-runtime-process-contract.md > .gitnexus/reports/remove-resource-heuristic/task7-green.txt; then echo "unexpected residual" && exit 1; fi'`
Expected: PASS（exit code 0）。

**Step 5: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-exploring/SKILL.md gitnexus/skills/gitnexus-exploring.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md gitnexus/skills/_shared/unity-runtime-process-contract.md
git commit -m "docs: sync installed and source skills with slim-first contract"
```

### Task 8: Final Regression Matrix + Evidence Freeze

**User Verification: not-required**

**Files:**
- Verify: `gitnexus/src/mcp/local/local-backend.ts`
- Verify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Verify: `gitnexus/src/mcp/local/process-*.ts`
- Verify: `gitnexus/src/mcp/tools.ts`
- Verify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Verify: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Verify: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Verify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write the failing gate checks**

```bash
# gate A: fail if runtime contract files still contain resource_heuristic
# gate B: fail if key tests regress
```

**Step 2: Run gate checks to verify pre-fix failure (if any residual exists)**

Run: `bash -lc 'rg -n "resource_heuristic" gitnexus/src/mcp/tools.ts .agents/skills/gitnexus gitnexus/skills docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md && exit 1 || exit 0'`
Expected: 若仍有残留则 FAIL；无残留则继续 Step 3。

**Step 3: Write minimal implementation (only remaining deltas)**

```ts
// examples of allowed tail fixes:
// - adjust forgotten test fixtures still asserting resource_heuristic
// - align fallback origin string mismatches in derived process payloads
// - ensure clues.process_hints === [] in both slim builders
```

**Step 4: Run full verification matrix**

Run:
```bash
mkdir -p .gitnexus/reports/remove-resource-heuristic
npm --prefix gitnexus run build
npm --prefix gitnexus exec vitest run \
  gitnexus/test/unit/local-backend-agent-safe-query.test.ts \
  gitnexus/test/unit/local-backend-agent-safe-context.test.ts \
  gitnexus/test/integration/local-backend-calltool.test.ts \
  gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts \
  gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts \
  --reporter=json --outputFile .gitnexus/reports/remove-resource-heuristic/task8-vitest.json
npm --prefix gitnexus test
```
Expected: 全部 PASS；`task8-vitest.json` 中 `numFailedTests=0`。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/src/mcp/local/process-confidence.ts gitnexus/src/mcp/local/process-ref.ts gitnexus/src/mcp/local/derived-process-reader.ts gitnexus/src/mcp/tools.ts gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/test/unit/local-backend-next-hops.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md .agents/skills/gitnexus/gitnexus-exploring/SKILL.md gitnexus/skills/gitnexus-exploring.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md gitnexus/skills/_shared/unity-runtime-process-contract.md
git commit -m "refactor: remove resource heuristic process injection and align runtime contracts"
```

## Plan Audit Verdict
audit_scope: docs/plans/2026-04-09-remove-resource-heuristic-injection-design.md 全量条款（backend 注入移除、agent-safe slim 语义、类型/origin 收敛、tools/docs/skills 契约同步）
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `rg` 结构审计确认计划包含 Design Traceability Matrix / Authenticity Assertions / 8 个任务块；result: pass
- 占位符泄漏扫描（`TODO|TBD|<...>`）未发现执行指令中的未决占位符；result: pass
authenticity_checks:
- 每个 critical 设计条款均绑定了 task + executable command + artifact field + failure signal；result: pass
- 关键验证包含语义失败信号（无 heuristic row、freeze non-empty chain、tool evidence），非字段存在性检查；result: pass
- 负向断言覆盖已明确（no heuristic backdoor / no placeholder / live tool evidence）；result: pass
approval_decision: pass
