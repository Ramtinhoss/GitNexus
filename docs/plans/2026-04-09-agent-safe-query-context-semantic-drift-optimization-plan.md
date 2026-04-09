# Agent-Safe Query/Context Semantic Drift Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不回退“去 trigger 依赖”设计前提下，降低 `query/context` 首跳语义漂移，提升无 trigger phrasing 下的锚点命中率与收敛效率。

**Architecture:** 保持当前 slim 契约与 graph-only runtime closure 语义不变，优先修正“首跳排序 + follow-up 路由 + 歧义消解”三条链路。先做最小侵入的 P0 改动，再通过 benchmark 与真实仓回归验证。

**Tech Stack:** TypeScript, LocalBackend MCP (`query/context`), benchmark-agent-safe-query-context, Node test/Vitest。

---

## 1. 验证结果（本轮复验）

### 1.1 benchmark 证据

来源：`.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`

- `workflow_replay_slim.weapon_powerup.steps[0]`：
  - `primary_candidate=HybridWeaponPowerUp`
  - `recommended_follow_up=...1_weapon_melee_lightsaber.asset`
  - 与目标 orb 锚点不一致（首跳漂移）
- `workflow_replay_slim.reload.steps[0]`：
  - `primary_candidate=Reload`
  - `recommended_follow_up=.../测试_标记.asset`
  - 与目标 `Gungraph_use/1_weapon_orb_key.asset` 不一致
- `workflow_replay_slim.reload.steps[1]`（已带 seed）：
  - `primary_candidate=Divide`
  - `recommended_follow_up=.../Elements/Poison.asset`
  - 仍出现 seed 被旁路资源“抢优先级”

结论：语义 tuple 最终可通过，但首跳和次跳存在结构性漂移。

### 1.2 no-trigger phrasing 真实仓复验（neonspark-core）

使用 `query --response-profile slim --unity-resources on --scope-preset unity-gameplay --runtime-chain-verify on-demand`：

- `orb pickup equip bridge in player flow`
  - `primary=Equip`
  - follow-up 指向 `0_pickup_lucky_coin.asset`
- `player picks up a gun buff then equip lifecycle`
  - `primary=DualColdWeaponPowerUp`
  - follow-up 指向 `1_weapon_melee_axe_back.asset`
- `ammo value computation then reload validation flow`
  - `primary=Reload`
  - follow-up 指向 `测试_标记.asset`
- `where is reload check decided from stat getter`
  - `primary=InitializeWeaponStats`
  - follow-up 仍指向 `测试_标记.asset`

结论：去 trigger 依赖后，链路可收敛，但首跳稳定性弱；语义漂移是真实存在的，不是 benchmark 假象。

### 1.3 seed 加入后的现象

- weapon seed 场景：`primary` 可落在 `Equip/EquipWithEvent`，但 follow-up 常优先跳转到图/prefab，seed 本身优先级不足。
- reload seed 场景：仍可能出现 `primary=Divide` 且 follow-up 优先 `Poison.asset`。

结论：当前 seed 只能“提供候选”，还不足以“主导首跳路由”。

---

## 2. 根因定位（代码级）

### 2.1 检索与排序层

- BM25 在当前仓基本主导（`embeddings=0`），语义检索不参与实质纠偏：
  - `semanticSearch()` 首先检查 `CodeEmbedding` 为空即返回 `[]`
  - 位置：`gitnexus/src/mcp/local/local-backend.ts:2037-2042`
- 过程/符号排序对 `resource_heuristic + low confidence` 缺乏强惩罚，容易把噪声实体抬到前列。

### 2.2 锚点与 follow-up 路由层

- verifier anchor 选择“有 resourceBindings 就优先”，会把低置信 heuristic 符号作为锚点：
  - `pickVerifierSymbolAnchor()`
  - 位置：`gitnexus/src/mcp/local/local-backend.ts:385-405`
- next-hop 资源优先级当前为：
  - `mappedIntersectBindings -> mappedRemainder -> seedPath -> bindingPaths`
  - 导致显式 seed 不是第一优先
  - 位置：`gitnexus/src/mcp/local/local-backend.ts:445-450`
- slim 的 `recommended_follow_up` 直接取第一个 non-full hint，放大上述排序误差：
  - `chooseRecommendedFollowUp()`
  - 位置：`gitnexus/src/mcp/local/agent-safe-response.ts:211-220`

### 2.3 歧义消解层

- `suggested_context_targets` 仅返回 name，不带 `uid/filePath`，导致 `context(name=...)` 容易命中歧义候选（尤其 `Reload`、`Equip` 这类高频名）：
  - 位置：`gitnexus/src/mcp/local/agent-safe-response.ts:247-271`

---

## 3. 优化方向

### P0（本轮必须）

1. **seed 优先级前置（路由级）**
   - 调整 `buildNextHops()` 资源候选优先级为：
   - `seedPath -> mappedIntersectBindings -> mappedRemainder -> bindingPaths`
   - 目标：显式 seed 始终先于派生资源参与 `recommended_follow_up`。

2. **anchor 选择加入置信门控（锚点级）**
   - 调整 `pickVerifierSymbolAnchor()`：
   - 优先 `direct_step/method_projected` 且 `confidence != low` 的符号；仅在无更优候选时回退到 resource-anchored heuristic。

3. **slim context 引导去歧义（交互级）**
   - `suggested_context_targets` 增补结构：`{ name, uid, filePath, why }`。
   - `upgrade_hints` 优先生成 `context(uid=...)` 建议，减少同名符号绕路。

### P1（建议本次同步）

4. **benchmark 新增漂移敏感指标**
   - `anchor_top1_pass`
   - `recommended_follow_up_hit`
   - `ambiguity_detour_count`
   - 目标：避免“最终 tuple 通过”掩盖首跳漂移。

5. **resource hint 去重与降噪**
   - 对重复/同义资源 hint 去重；
   - 对与 seed 语义距离大的 hint 施加降权。

### P2（后续）

6. **语义召回能力建设**
   - 在 `neonspark-core` 启用 embeddings 后，复测 RRF 效果；
   - 这是中期收益项，不阻塞 P0/P1。

---

## 4. 预期执行（下一 session）

### Task 1: Seed-first 路由修正

- Files:
  - `gitnexus/src/mcp/local/local-backend.ts`
  - `gitnexus/test/unit/local-backend-next-hops.test.ts`
- 验收：
  - seed 场景下 `decision.recommended_follow_up` 首选 seed 或 seed 映射主链资源。

### Task 2: Verifier anchor 置信门控

- Files:
  - `gitnexus/src/mcp/local/local-backend.ts`
  - `gitnexus/test/unit/local-backend-next-hops.test.ts`
- 验收：
  - 非 seed/no-trigger 查询不再优先 low-confidence heuristic 符号作为锚点。

### Task 3: Context 去歧义提示升级

- Files:
  - `gitnexus/src/mcp/local/agent-safe-response.ts`
  - `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
  - `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
  - `gitnexus/src/mcp/tools.ts`（如需同步契约描述）
- 验收：
  - `suggested_context_targets` 提供可直接执行的唯一化目标（含 uid/filePath）。

### Task 4: Benchmark 指标补强

- Files:
  - `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
  - `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
  - 对应测试文件
- 验收：
  - 报告新增漂移指标，且可清晰区分“tuple 通过但首跳漂移”。

### Task 5: 端到端回归

- Commands:
```bash
npm --prefix gitnexus run build
npm --prefix gitnexus test
node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context
```

- 人工抽查（no-trigger 查询）：
```bash
node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --scope-preset unity-gameplay --runtime-chain-verify on-demand --response-profile slim "orb pickup equip bridge in player flow"
node gitnexus/dist/cli/index.js query --repo neonspark-core --unity-resources on --scope-preset unity-gameplay --runtime-chain-verify on-demand --response-profile slim "ammo value computation then reload validation flow"
```

- 预期：
  - `recommended_follow_up` 与 case seed 同域或直接命中 canonical 资源；
  - `anchor_top1_pass`、`recommended_follow_up_hit` 显著改善；
  - semantic tuple 仍保持通过。

---

## 5. 风险与边界

- 不在本轮做“全量检索重写”与“runtime verifier 语义改造”。
- 若 `neonspark-core` 继续无 embeddings，首跳语义稳定性仍有上限；本轮以“路由纠偏 + 歧义收敛”为主收益。
