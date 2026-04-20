# NeonSpark Runtime Retrieval Tooling Report (Revalidation)

Date: 2026-04-09 16:56:43 CST  
GitNexus repo commit (working copy): `5a59622b`  
Target indexed repo: `neonspark-core`  
Target indexed commit: `8d95c371267c4e000291052410a0784a61025bf5`  
Revalidation scope: verify unresolved tool-side issues from:

1. `docs/reports/2026-04-09-neonspark-runtime-retrieval-tooling-report.md`
2. `Docs/plans/2026-04-09-gitnexus-runtime-rule-planning-reset-design.md` section 6

## Purpose

This report revalidates whether previously reported tooling-side issues are resolved, partially resolved, or still open.

Special focus requested for this revalidation:

1. do not use broad natural-language phrasing variance as the primary test for noise;
2. test deterministic anchors (`symbol` + `resource_path_prefix` + optional `guid` token) under `unity_resources=on`.

## Executive Summary

### Still fixed

1. Query-time `trigger_tokens` is not a hard gate for runtime-claim evaluation (`graph_only` remains active).

### Still open

1. Low-confidence `resource_heuristic` clues can still appear even with deterministic anchor inputs.
2. User-facing contract still mixes graph facts, closure state, and heuristic clues in one result layer.
3. Seed-first retrieval exists but is still secondary in default interaction flow.
4. A tooling-side gap from planning section 6.4 remains: no first-class graph structure for pure code dynamic dispatch (`event`/`Action<>`/hub topic-subscription topology).

## Environment Snapshot

## Indexed Repo Snapshot

Source: `list_repos`

```yaml
name: neonspark-core
indexedAt: 2026-04-09T08:33:13.188Z
lastCommit: 8d95c371267c4e000291052410a0784a61025bf5
files: 8044
nodes: 100975
edges: 451052
processes: 300
```

## Dirty Workspace Governance Precheck

Commands run before any write:

```bash
./.agents/bin/workspace-python-check
./.agents/bin/workspace-preflight --project-path "$(pwd)"
```

Observed:

1. python gate passed (`>=3.8`).
2. preflight exit code `0` (residual dirty advisory present but non-blocking).

## Revalidation Findings

## Finding R1: Trigger-Token Hard Gate Claim Remains Retired

Status: `confirmed fixed at tooling level`

Evidence:

1. `cypher` still returns persisted `unity-rule-*` synthetic edges.
2. `context(uid=...InitGlobal..., runtime_chain_verify=on-demand, response_profile=full)` still returns:
   - `runtime_claim.rule_id = graph-only.runtime-closure.v1`
   - `runtime_claim.scope.trigger_family = graph_only`
3. `gitnexus://repo/neonspark-core/process/proc_0_unity_runtime_root` remains readable as persisted process trace.

Implication:

Runtime-claim path is still graph-driven, not query-token gated.

## Finding R2: Anchored Retrieval Can Still Emit Low-Confidence Heuristic Clues

Status: `still open`  
Note: this section follows the requested deterministic-anchor test method.

### Test Setup

Resources and GUIDs:

1. `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset`
   - guid: `69199acacbf8a7e489ad4aa872efcabd`
2. `Assets/NEON/DataAssets/Powerups/3_武器道具/3_3_item_weapon_soulbringer_use_mana_icecore.asset`
   - guid: `6dad55384d0f73c4eaca4ad86b2d1d11`

Common params:

1. `unity_resources=on`
2. `unity_hydration_mode=compact`
3. fixed `resource_path_prefix`

### Case A (cleaner)

Query/Context anchor:

1. symbol: `ReloadBase` (`Class:...ReloadBase.cs:ReloadBase`)
2. resource_path_prefix: `.../1_weapon_orb_key.asset`

Observed:

1. no low-confidence `resource_heuristic` in `process_hints` for this anchored query.
2. `context(uid=ReloadBase, resource_path_prefix=...)` also did not surface low-confidence heuristic process rows.

### Case B (problem persists)

Query/Context anchor:

1. symbol: `SoulBringerIceCoreMgrPu` (`Class:...SoulBringerIceCoreMgrPu.cs:SoulBringerIceCoreMgrPu`)
2. resource_path_prefix: `.../3_3_item_weapon_soulbringer_use_mana_icecore.asset`

Observed:

1. query still returns `derived:*` row with:
   - `confidence=low`
   - `evidence_mode=resource_heuristic`
   - `summary=SoulBringerIceCoreMgrPu runtime heuristic clue`
2. context with exact symbol `uid` still returns the same low-confidence heuristic process and verify hint.

### GUID token variant

Added GUID token to query text while keeping fixed symbol/resource path.

Observed:

1. for SoulBringer case, low-confidence heuristic rows still remained.
2. for ReloadBase case, GUID token did not improve stability and could degrade candidate surface.

Implication:

Even deterministic symbol+resource anchoring does not reliably suppress low-confidence heuristic clues.

## Finding R3: Evidence Tiers Are Still Not Cleanly Separated in User-Facing Contract

Status: `still open`

Evidence:

In full-profile responses, a single payload still co-locates:

1. graph facts (`incoming/outgoing`, synthetic-edge hops),
2. closure/verifier state (`runtime_claim.status`, `verification_core_status`, `evidence_level`),
3. heuristic guidance (`next_hops`, verify hints, manual follow-up commands).

Implication:

This remains below the planning expectation in section 6.2:

1. graph facts,
2. closure state,
3. heuristic clues

are distinguishable by fields but not separated as first-class output tiers.

## Finding R4: Seed-First Workflow Is Available but Still Secondary

Status: `still open`

Evidence:

1. deterministic controls (`uid`, `resource_path_prefix`) are present.
2. default flow is still mostly query-first; seed controls are typically surfaced as follow-up (`decision.recommended_follow_up`, `upgrade_hints`).

Implication:

Seed-first remains an expert narrowing path, not the dominant first interaction contract.

## Finding R5: Missing Tooling Item from Planning Section 6 (Added)

Status: `still open`  
Source gap: `Docs/plans/...reset-design.md` section 6.4

Issue:

For pure code dynamic dispatch, graph still lacks first-class entities for:

1. event topics,
2. subscriptions,
3. publisher/topic/subscriber relationships,
4. callback binding artifacts.

Revalidation evidence:

1. `context(NewEventHub)` and `context(Raise @ NewEventHub.cs)` mainly expose generic call edges and projected/static process participation.
2. no dedicated topic/subscription graph tier is returned for hub-style dispatch.
3. query around `NewEventHub.Raise OpenConsoleEvent` can still be dominated by low-confidence resource heuristics, rather than a first-class dispatch topology.

Implication:

Planning section 6.4 remains valid and should stay in tooling-track backlog.

## Mapping Against Planning Section 6

Reference: `Docs/plans/2026-04-09-gitnexus-runtime-rule-planning-reset-design.md` section 6

1. 6.1 retrieval noise / drift: still open (revalidated with deterministic-anchor variant in R2).
2. 6.2 tier separation: still open (R3).
3. 6.3 seed-first workflow: still open (R4).
4. 6.4 dynamic dispatch first-class structure: still open and explicitly added to this report (R5; missing in prior report).

## Updated Problem Statement (Tooling Track)

The core runtime closure mechanism remains graph-capable (`graph_only` path works), but product-contract quality issues remain:

1. low-confidence heuristic clue competition under anchored retrieval in specific domains;
2. insufficient tiered separation in user-facing payloads;
3. seed-first path not yet primary by default;
4. no first-class dynamic-dispatch topology for pure code event systems.

## Recommended Follow-Up

1. Add a deterministic-anchor noise benchmark:
   - fixed `uid`
   - fixed `resource_path_prefix`
   - optional guid token
   - track low-confidence `resource_heuristic` leakage rate.
2. Introduce explicit output-tier envelope in query/context contracts:
   - `facts`
   - `closure`
   - `clues`
3. Add seed-first entry templates in CLI/MCP examples so first hop is deterministic when anchors are known.
4. Define schema extension proposal for dynamic dispatch:
   - event-topic entity
   - subscribe edges
   - publish edges
   - callback binding evidence nodes.

## Evidence Index (This Revalidation)

Primary evidence calls/resources:

1. `list_repos`
2. `cypher(reason CONTAINS 'unity-rule-')`
3. `context(uid=Method:...Global.cs:InitGlobal, runtime_chain_verify=on-demand, response_profile=full)`
4. `gitnexus://repo/neonspark-core/process/proc_0_unity_runtime_root`
5. anchored query/context for:
   - `ReloadBase` + `.../1_weapon_orb_key.asset`
   - `SoulBringerIceCoreMgrPu` + `.../3_3_item_weapon_soulbringer_use_mana_icecore.asset`
6. GUID extraction from:
   - `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset.meta`
   - `Assets/NEON/DataAssets/Powerups/3_武器道具/3_3_item_weapon_soulbringer_use_mana_icecore.asset.meta`
7. dynamic dispatch evidence:
   - `context(NewEventHub @ Assets/Veewo/Framework/Foundation/NewEventHub.cs)`
   - `context(Raise @ Assets/Veewo/Framework/Foundation/NewEventHub.cs)`
   - `query("NewEventHub.Raise OpenConsoleEvent", unity_resources=on)`

