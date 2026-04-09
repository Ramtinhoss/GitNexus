# Agent-Safe Query/Context Semantic Drift Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不回退“线上检索去 trigger 依赖”前提下，降低 `query/context` 首跳语义漂移，提升无 trigger phrasing 下的锚点命中率与收敛稳定性。

**Architecture:** 保持当前 slim 契约与 graph-only runtime closure 语义不变，仅优化三层：1) next-hop 资源优先级，2) verifier anchor 选择策略，3) slim 去歧义提示。同步补充 benchmark 漂移指标，确保“tuple 通过”不再掩盖首跳漂移。

**Tech Stack:** TypeScript, Node.js, LocalBackend MCP (`query/context`), benchmark-agent-safe-query-context, Vitest/Node test。

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 Seed-first next-hop routing | completed | red/green verified in `local-backend-next-hops.test.ts`; explicit `seedPath` now wins first resource hop
Task 2 Verifier anchor confidence gate | completed | red/green verified in `local-backend-next-hops.test.ts`; `direct_step/method_projected` with non-low confidence outrank heuristic anchors
Task 3 Slim disambiguation payload | completed | red/green verified in `local-backend-agent-safe-query.test.ts` and `local-backend-agent-safe-context.test.ts`; `suggested_context_targets` now include `name/uid/filePath/why`
Task 4 Drift metrics in benchmark | completed | red/green verified via `npm --prefix gitnexus run build` + `node --test gitnexus/dist/benchmark/agent-safe-query-context/*.test.js gitnexus/dist/cli/benchmark-agent-safe-query-context.test.js`
Task 5 E2E regression + docs sync | completed | top1 rerank layer added in `agent-safe-response.ts`; benchmark acceptance now `pass=true` with `post_narrowing_anchor_pass=true` and `post_narrowing_follow_up_hit=true` for both cases; `npm --prefix gitnexus test` passed (1676 passed, 1 skipped); skill/docs sync complete

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 显式 seed 不能被派生资源抢占首跳路由 | critical | Task 1, Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.reload.steps[1].output.decision.recommended_follow_up` | `recommended_follow_up` 首选非 seed 且与 case seed 异域
DC-02 verifier 锚点不能优先 low-confidence heuristic 符号 | critical | Task 2, Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.steps[0].output.decision.primary_candidate` | 首选锚点持续落在低置信 heuristic 候选，导致 follow-up 漂移
DC-03 slim 输出必须提供可去歧义的 context 目标 | critical | Task 3, Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot` | `workflow_replay_slim.*.steps[*].output.suggested_context_targets` | `suggested_context_targets` 只有 name，无法避免同名歧义
DC-04 benchmark 必须显式暴露漂移，不得仅靠 tuple pass | critical | Task 4, Task 5 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.(anchor_top1_pass,recommended_follow_up_hit,ambiguity_detour_count)` | 报告缺失漂移指标，或只能看 semantic tuple pass
DC-05 无 trigger phrasing 的 query/context 工作流仍需保持可收敛 | critical | Task 5 | `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.semantic_tuple_pass` | 任一 case `semantic_tuple_pass=false`

## Design Intent (No Prior Design Doc)

本任务没有独立设计文档，以下“设计意图”作为本计划真理源：

1. 不改 runtime verifier 语义，不恢复 trigger 匹配依赖。  
2. 优化目标是“首跳和次跳收敛质量”，不是“重写检索引擎”。  
3. 成功标准是：semantic tuple 持续通过，同时首跳漂移指标改善。  
4. 允许 case 仍需 narrowing，但 narrowing 应优先走 seed 同域路径。  

## Authenticity Assertions

- `assert no placeholder path`: 所有 case/resource/symbol 不能出现 `TODO|TBD|placeholder|<...>`。
- `assert live mode has tool evidence`: `subagent_live` 结论必须可由 telemetry tool rows 回放佐证。
- `assert freeze requires non-empty confirmed_chain.steps`: benchmark 报告里每个 case 的 `steps` 必须非空且 tool 顺序可解释。
- `assert semantic closure is not structure-only`: 不接受仅凭字段存在判断通过，必须含 proof edge/cypher 证据。
- `assert drift metrics are semantic`: 漂移指标必须基于 `top1/follow-up/ambiguity`，不能只统计字段长度或调用次数。

## Baseline Evidence (已确认)

1. `workflow_replay_slim.weapon_powerup.steps[0]` 首选为 `HybridWeaponPowerUp`，偏离 orb 目标锚点。  
2. `workflow_replay_slim.reload.steps[1]`（已带 seed）出现 `primary=Divide` 且 follow-up 到 `Poison.asset`。  
3. 无 trigger phrasing 真实查询中，首跳常落到 `Equip/Reload/InitializeWeaponStats` 等高频符号。  
4. semantic tuple 最终可通过，但存在可重复复现的首跳漂移。  

---

### Task 1: Seed-first Next-Hop Routing

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/unit/local-backend-next-hops.test.ts`

**Step 1: Write the failing test**

在 `local-backend-next-hops.test.ts` 新增断言：当 `seedPath`、`mappedSeedTargets`、`resourceBindings` 同时存在时，首个 `resource` hop 必须优先 seed（或 seed 映射主链资源），不能被派生噪声资源抢占。

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot
```
Expected: FAIL（当前实现资源优先级为 `mapped*` 在前，seed 不一定首位）。

**Step 3: Write minimal implementation**

在 `buildNextHops()` 中调整 `candidateResources` 组装顺序为：

1. `seedPath`
2. `mappedIntersectBindings`
3. `mappedRemainder`
4. `bindingPaths`

并保持现有去重逻辑不变。

**Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot
```
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/local-backend-next-hops.test.ts
git commit -m "fix: prioritize explicit seed in slim next-hop routing"
```

### Task 2: Verifier Anchor Confidence Gate

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/test/unit/local-backend-next-hops.test.ts`

**Step 1: Write the failing test**

为 `pickVerifierSymbolAnchor()` 增加测试样例：当存在 `direct_step/method_projected` 且 `confidence` 为 `high/medium` 的候选时，不得优先 `resource_heuristic + low` 候选。

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot
```
Expected: FAIL（当前逻辑先看 `resourceBindings`，会偏向 heuristic 类符号）。

**Step 3: Write minimal implementation**

在 `pickVerifierSymbolAnchor()` 中引入候选排序优先级：

1. `process_evidence_mode` (`direct_step` > `method_projected` > `resource_heuristic`)
2. `process_confidence` (`high` > `medium` > `low`)
3. 仅在上述不存在时回退到 `resourceBindings` 或 query text 匹配。

**Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-next-hops.test.ts --reporter=dot
```
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/local-backend-next-hops.test.ts
git commit -m "fix: gate verifier anchor selection by evidence mode and confidence"
```

### Task 3: Slim Disambiguation Payload Upgrade

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing test**

新增断言：

1. `suggested_context_targets` 包含 `name+uid+filePath`（对象结构）  
2. 至少一个 upgrade hint/next command 可直接用 `uid` 进入 `context`，避免同名歧义。

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot
```
Expected: FAIL（当前仅返回字符串 name）。

**Step 3: Write minimal implementation**

更新 `buildSuggestedContextTargets()` 输出对象数组，并在 `buildUpgradeHints()` 增加 uid 优先的 context 建议（有 uid 时优先 `uid`）。

**Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot
```
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/tools.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts
git commit -m "feat: add uid-based disambiguation hints to slim query/context payloads"
```

### Task 4: Drift-Sensitive Benchmark Metrics

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Test: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`

**Step 1: Write the failing test**

新增报告断言字段：

1. `anchor_top1_pass`
2. `recommended_follow_up_hit`
3. `ambiguity_detour_count`

并要求其在 `workflow_replay_slim` 下按 case 输出。

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot
```
Expected: FAIL（当前报告未包含上述漂移指标）。

**Step 3: Write minimal implementation**

在 replay 执行后计算并落盘：

1. top1 是否等于 canonical symbol anchor（或其规范化等价）
2. follow-up 是否命中 canonical resource anchor（或同域主链）
3. context 歧义分支次数（`status=ambiguous` 计数）

**Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot
```
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts
git commit -m "feat: add semantic-drift metrics to workflow replay report"
```

### Task 5: End-to-End Regression And Acceptance Recheck

**User Verification: required**

**Human Verification Checklist**
- benchmark 报告包含 `workflow_replay_slim.*.anchor_top1_pass/recommended_follow_up_hit/ambiguity_detour_count`。
- `workflow_replay_slim.weapon_powerup` 的 follow-up 不再首选非 orb 同域噪声资源。
- `workflow_replay_slim.reload` 的 follow-up 不再首选 `Poison.asset`。
- 无 trigger phrasing 复验时，首跳候选与 follow-up 更接近目标 case 语义。
- `semantic_tuple_pass` 仍保持两个 case 全通过。

**Acceptance Criteria**
- 三个漂移指标在报告 JSON 中可查询且非空。
- weapon case 的 `recommended_follow_up_hit=true` 或 follow-up 指向 orb 同域主链资源。
- reload case 的 `recommended_follow_up_hit=true` 或 follow-up 指向 gungraph 同域主链资源。
- 两条 no-trigger 复验命令输出中，`decision.primary_candidate` 与 `decision.recommended_follow_up` 不再落到已知噪声默认（如 lucky_coin/Poison）。
- `workflow_replay_slim.weapon_powerup.semantic_tuple_pass=true` 且 `workflow_replay_slim.reload.semantic_tuple_pass=true`。

**Failure Signals**
- 任一 case 缺失漂移指标。
- follow-up 仍稳定指向 `0_pickup_lucky_coin.asset` 或 `Assets/NEON/DataAssets/Elements/Poison.asset`。
- no-trigger 复验首跳仍频繁偏向无关高频符号且无法通过提示快速收敛。
- semantic tuple 任一 case 失败。

**User Decision Prompt**
请仅回复：`通过` 或 `不通过`

**Files:**
- Verify: `gitnexus/src/mcp/local/local-backend.ts`
- Verify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Verify: `gitnexus/src/benchmark/agent-safe-query-context/*.ts`
- Artifact: `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`

**Step 1: Write the failing test**

补充/更新 benchmark 报告测试，要求存在并校验漂移指标字段与语义一致性。

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts --reporter=dot
```
Expected: FAIL（在实现前缺字段或值不符合语义）。

**Step 3: Write minimal implementation**

实现剩余修正并同步工具契约文案（`tools.ts`），保持 slim/full 升级路径兼容。

**Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix gitnexus run build
npm --prefix gitnexus test
node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context
node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --scope-preset unity-gameplay --runtime-chain-verify on-demand --response-profile slim "orb pickup equip bridge in player flow"
node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --scope-preset unity-gameplay --runtime-chain-verify on-demand --response-profile slim "ammo value computation then reload validation flow"
```
Expected: PASS，且报告与复验输出满足本任务 Acceptance Criteria。

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/src/mcp/tools.ts gitnexus/src/benchmark/agent-safe-query-context/*.ts gitnexus/src/benchmark/agent-safe-query-context/*.test.ts .gitnexus/benchmark-agent-safe-query-context/benchmark-report.json .gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md
git commit -m "fix: reduce semantic drift in slim query/context workflow and benchmark visibility"
```

## Plan Audit Verdict
audit_scope: no-design-doc 意图约束、query/context slim 路由、benchmark 漂移可观测性、真实仓 no-trigger 回归验收
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- embeddings 在 `neonspark-core` 仍为 0，语义召回上限仍受 BM25 主导约束；status: accepted
anti_placeholder_checks:
- 所有任务文件路径均为真实路径，未出现 `TODO/TBD/placeholder/<...>`：pass
- 验收 evidence 字段均指向可生成 JSON 字段，不是结构空检查：pass
authenticity_checks:
- 关键条款均绑定了“命令 + 证据字段 + 失败信号”：pass
- 关键条款验证包含语义命中（top1/follow-up/ambiguity/tuple），非仅字段存在：pass
- live/no-trigger 回归命令被纳入 Task 5 强制验证：pass
approval_decision: pass
