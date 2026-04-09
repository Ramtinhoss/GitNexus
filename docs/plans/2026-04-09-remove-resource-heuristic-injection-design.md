# Remove resource_heuristic Injection — Design

**Date:** 2026-04-09  
**Status:** Pending approval  
**Scope:** Tool-side noise removal + slim-first workflow clarification

---

## Problem

`resource_heuristic` process injection is a temporary fallback that fires when `processRows.length === 0` and Unity resource bindings exist (or `needsParityRetry === true`). Investigation confirms:

1. The injected process row carries `confidence: 'low'` and `evidence_mode: 'resource_heuristic'` — always.
2. Its only actionable output is a `verification_hint` telling the agent to "inspect asset + .meta linkage" — not automatable.
3. The `resource_hints` field (the genuinely useful resource binding info) is derived independently from `buildNextHops()` → `buildResourceHints()` and is **not affected** by heuristic removal.
4. In strict-anchor mode (symbol uid + resource_path_prefix), heuristic rows still appear as clue-tier noise even when the retrieval is deterministic — this is the core R2 finding.
5. No test or benchmark has demonstrated that heuristic clues improve agent outcomes.

**Goal:** Remove heuristic injection entirely. Ensure slim output still delivers sufficient information. Clarify `full` mode as debug/deep-dive only.

---

## What stays (not affected by removal)

- `resource_hints[]` in slim output — derived from `buildNextHops()`, independent of heuristic rows
- `upgrade_hints[]` — includes `response_profile=full` hint for deep-dive
- `missing_proof_targets[]` from `resource_hints` (the `resource:` prefix entries) — still populated
- `runtime_preview` — independent
- `needsParityRetry` flag in `hydrationMeta` — still present in `full` mode for diagnostics

---

## Changes

### 1. `local-backend.ts` — Remove both heuristic injection blocks

**Query side (lines 1717–1748):** Remove the entire `if (processRows.length === 0 && unityResourcesMode !== 'off')` block that calls `mergeProcessEvidence` with `heuristicRows`.

**Context side (lines 2687–2716):** Remove the entire `if (processRows.length === 0)` block that calls `mergeProcessEvidence` with `heuristicRows`.

After removal, when `processRows.length === 0`, the symbol falls through to `definitions` (query side) or `result.processes = []` (context side) — which is the correct behavior.

The `toProcessRefOrigin` fallback at line 680 (`return 'resource_heuristic'`) becomes the fallback for unknown modes. Change to `return 'method_projected'` as a safe fallback (or keep as-is since it's only reached for unknown modes that won't occur in practice).

`aggregateProcessEvidenceMode` at line 196 falls back to `'resource_heuristic'` when no direct/projected rows exist. Change fallback to `'method_projected'` since this function is only called when rows exist.

### 2. `agent-safe-response.ts` — Remove heuristic-specific handling

**`splitProcessHintsByTier` (lines 186–201):** Remove entirely. Replace all call sites with a trivial split: all process hints go to `facts`, `clues.process_hints` becomes `[]`.

**`isLowConfidenceHeuristic` (lines 339–342):** Remove.

**`isLowConfidenceHeuristicProcessHint` (lines 391–395):** Remove.

**`scoreEvidenceMode` (line 348):** Remove the `resource_heuristic` branch (`return -12`). The fallback `return 0` handles unknown modes.

**`scoreProcessHint` (lines 405, 412):** Remove the `resource_heuristic` score branch (`score += 5`) and the combined penalty (`score -= 20`).

**`scoreCandidateRow` (line 303):** Remove `heuristicLowPenalty` variable and its subtraction.

**`chooseTopSummary` (lines 430–433, 435):** Remove the two `isLowConfidenceHeuristicProcessHint` guard branches. The function simplifies to: use top process summary if score ≥ candidate score, else use candidate name.

**`validateTierSemanticOrder` (line 244):** Remove the `&& evidenceMode !== 'resource_heuristic'` exclusion — it's no longer needed.

**`buildMissingProofTargets` (lines 616–621):** The loop over `processHints` that adds `symbol:${target}` from `verification_hint` remains — it's generic and will still work for any future process hint that carries a `verification_hint`. No change needed here.

**`buildSuggestedContextTargets` (lines 669–677):** Same — the loop over `processHints` for `verification_hint.target` is generic. No change needed.

**`buildSlimQueryResult` / `buildSlimContextResult`:** Update `clues.process_hints` to always be `[]` (or remove the field from `clues` entirely since it will always be empty). Keep `clues.resource_hints` as-is.

### 3. `process-evidence.ts` — Remove `HeuristicProcessEvidenceRow` and heuristic merge path

**`HeuristicProcessEvidenceRow` interface:** Remove.

**`mergeProcessEvidence` signature:** Remove `heuristicRows` parameter from the input type. Remove the heuristic processing block (lines ~70–95 that build `resource_heuristic` rows).

**Test file `process-evidence.test.ts`:** Remove the `'heuristic-only rows emit low confidence with verification hint'` test case.

### 4. `process-confidence.ts` — Simplify

**`ProcessEvidenceMode` type:** Remove `'resource_heuristic'` from the union. Becomes `'direct_step' | 'method_projected'`.

**`deriveConfidence`:** Remove the `resource_heuristic` branch (lines 23–24). The function now only handles `direct_step` and `method_projected`.

**`buildVerificationHint`:** This function is still useful for any future low-confidence process row. Keep it, but it will no longer be called from heuristic injection. If no other callers remain after cleanup, remove it too.

**Test file `process-confidence.test.ts`:** Remove the `'deriveConfidence returns low for resource heuristic rows'` and `'buildVerificationHint includes parity retry guidance'` test cases (or convert to documentation of removed behavior).

### 5. `process-ref.ts` — Clean up type

**`ProcessRefOrigin`:** Remove `'resource_heuristic'` from the union. Becomes `'step_in_process' | 'method_projected'`.

### 6. `derived-process-reader.ts` — Update hardcoded origin

Line 16: `'origin: resource_heuristic'` — change to `'origin: method_projected'` or remove the `origin` line since derived processes are no longer heuristic-sourced.

### 7. `tools.ts` — Update MCP tool descriptions

Remove or update the following lines in both `query` and `context` tool descriptions:
- `- processes[].evidence_mode: direct_step | method_projected | resource_heuristic` → remove `resource_heuristic`
- `- process_symbols[].process_evidence_mode: direct_step | method_projected | resource_heuristic` → remove `resource_heuristic`
- `- treat evidence_mode=resource_heuristic as clue-tier evidence (not closure proof)` → remove entirely

Add a note clarifying `full` mode positioning:
```
- response_profile=slim is the default and sufficient for all normal agent workflows
- response_profile=full is for debugging and deep evidence inspection only (larger payload, higher token cost)
```

### 8. `docs/unity-runtime-process-source-of-truth.md` — Update section 2.2

Section 2.2 item 3 currently reads:
> 触发：processRows.length===0 且 resourceBindings>0 或 needsParityRetry → 注入 resource_heuristic + low clue

Replace with:
> ~~触发：processRows.length===0 且 resourceBindings>0 或 needsParityRetry → 注入 resource_heuristic + low clue~~ (已移除)  
> processRows.length===0 时符号归入 definitions（query）或 processes=[]（context）。resource_hints 通过 buildNextHops() 独立提供资源绑定信息，不依赖 process 注入。

Update section 4.1 slim tier description to remove `clues.process_hints` or note it is always empty.

Add a section clarifying `full` mode:
> **response_profile=full** 仅用于调试和深度证据挖掘（hydrationMeta 诊断、next_hops 原始数据、runtime_claim 完整字段）。正常 agent 工作流只需 slim 模式。

### 9. `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` — Update guidance

Line 140: Remove `- Treat resource_heuristic as clue-tier evidence (clue), not closure proof.`

Add or update the `full` mode positioning note:
```
- response_profile=slim is sufficient for all normal workflows; use full only for debugging (hydrationMeta, raw next_hops, full runtime_claim)
```

---

## What does NOT change

- `runtime-chain-evidence.ts` — `heuristic_clue` mode in `deriveRuntimeChainEvidenceLevel` is a separate concept (runtime chain evidence level, not process evidence mode). Keep as-is.
- `buildNextHops()` — resource hints derivation is independent and unchanged
- `buildUpgradeHints()` — the `full` upgrade hint remains in slim output
- `hydrationMeta.needsParityRetry` — still present in full mode for diagnostics; agents can still rerun with `unity_hydration_mode=parity` when needed
- Benchmark tests — no heuristic-specific benchmark cases to remove

---

## Risk assessment

**Low risk.** The heuristic injection path only fires when `processRows.length === 0`. Removing it means those symbols go to `definitions` (query) or `processes=[]` (context) — which is the honest representation. `resource_hints` continues to surface resource binding info independently. No agent workflow depends on heuristic process rows for correct behavior.

**Slim output completeness after removal:**
- Resource binding info: `resource_hints[]` ✓ (independent)
- Follow-up guidance: `upgrade_hints[]` ✓ (includes `response_profile=full` hint)
- Missing proof targets: `missing_proof_targets[]` ✓ (from `resource_hints`)
- Parity retry signal: available via `full` mode `hydrationMeta.needsParityRetry` ✓

---

---

## Skill workflow files — required updates

以下文件均通过 setup 安装，agent 工作流中会直接读取，需同步清理 heuristic 引用并补充 slim-first / full-for-debug 定位。

### 10. `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`

- **Line 140:** 删除 `- Treat resource_heuristic as clue-tier evidence (clue), not closure proof.`
- **Line 48 checklist:** `If you need legacy heavy fields ... rerun with response_profile: "full"` — 补充说明 full 仅用于调试：`(debug/deep-dive only — higher token cost)`
- **Runtime-Chain Closure Guard 段落末尾** 补充：`- response_profile=slim is sufficient for all normal agent workflows; use full only for debugging (hydrationMeta, raw next_hops, full runtime_claim)`

### 11. `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` + `gitnexus/skills/gitnexus-guide.md`（两份同步）

- **Line 85:** 删除 `- Treat resource_heuristic as clue-tier (clue) evidence, not closure proof.`
- **Agent-safe upgrade path 段落** 末尾补充：`- response_profile=slim is the default and sufficient for all normal workflows; use full only for debugging (hydrationMeta diagnostics, raw next_hops, full runtime_claim)`

### 12. `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` + `gitnexus/skills/_shared/unity-runtime-process-contract.md`（两份同步）

- **Line 20:** `In strict-anchor mode, never let clues become the first-screen default when facts has high/medium non-heuristic leads.` — 移除 `non-heuristic` 限定词，改为：`In strict-anchor mode, never let clues become the first-screen default when facts has high/medium leads.`
- **Line 33:** 删除 `7. Treat resource_heuristic as clue-tier (clue) evidence and never as standalone closure proof.`（heuristic 已不存在，该条款失去意义）
- **Trigger Conditions 第3条** `Result has empty processes but Unity resource evidence is present.` — 补充说明：`In this case, resource_hints[] in slim output still surfaces resource binding info via buildNextHops(); no process injection occurs.`

### 13. `gitnexus/skills/gitnexus-exploring.md`（与 `.agents/` 版本同步）

与 `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` 相同的改动。

### 14. `UNITY_RUNTIME_PROCESS.md`

- **Line 196 表格行：** `evidence_mode` 字段说明中删除 `/ resource_heuristic（资源推断）`，改为仅 `direct_step / method_projected`

---

## File change summary

| File | Change type |
|------|-------------|
| `gitnexus/src/mcp/local/local-backend.ts` | Remove 2 heuristic injection blocks; fix 2 fallback returns |
| `gitnexus/src/mcp/local/agent-safe-response.ts` | Remove heuristic-specific functions, scoring branches, tier split |
| `gitnexus/src/mcp/local/process-evidence.ts` | Remove `HeuristicProcessEvidenceRow`, heuristic merge path |
| `gitnexus/src/mcp/local/process-confidence.ts` | Remove `resource_heuristic` from type + `deriveConfidence` |
| `gitnexus/src/mcp/local/process-ref.ts` | Remove `resource_heuristic` from `ProcessRefOrigin` union |
| `gitnexus/src/mcp/local/derived-process-reader.ts` | Update hardcoded origin string |
| `gitnexus/src/mcp/tools.ts` | Remove heuristic mentions; add slim-first / full-for-debug note |
| `gitnexus/src/mcp/local/process-evidence.test.ts` | Remove heuristic test case |
| `gitnexus/src/mcp/local/process-confidence.test.ts` | Remove heuristic test cases |
| `docs/unity-runtime-process-source-of-truth.md` | Update section 2.2 item 3; add full-mode positioning |
| `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` | Remove heuristic guidance; add slim-first / full-for-debug note |
| `gitnexus/skills/gitnexus-exploring.md` | Same as above (mirror copy) |
| `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` | Remove heuristic guidance; add slim-first / full-for-debug note |
| `gitnexus/skills/gitnexus-guide.md` | Same as above (mirror copy) |
| `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` | Remove heuristic rule; update trigger condition 3; fix non-heuristic wording |
| `gitnexus/skills/_shared/unity-runtime-process-contract.md` | Same as above (mirror copy) |
| `UNITY_RUNTIME_PROCESS.md` | Remove `resource_heuristic` from `evidence_mode` field table |
