# NeonSpark Runtime Retrieval Tooling Report

Date: 2026-04-09 14:26:32 CST
GitNexus repo commit: `d0f9bbcd`
Target indexed repo: `neonspark-core`
Target indexed commit: `2e1a505`
Authoring context: cross-repo writeback from `repo://gitnexus`

## Purpose

This report consolidates the tool-related findings from the NeonSpark Harness re-verification back into the GitNexus repository.

The goal is not to restate repository-specific runtime chains. The goal is to record which earlier GitNexus-side judgments are now outdated, which ones still hold, and which remaining problems are better framed as retrieval/product-contract issues rather than rule-compilation failures.

## Executive Summary

### Judgment that should be retired

The earlier claim that Unity runtime retrieval still depends on query-time `trigger_tokens` as a hard gate is no longer accurate.

Current evidence shows:

1. rule-produced Unity synthetic edges are persisted in graph state;
2. `context` can consume those edges without any query text;
3. `runtime_claim.scope.trigger_family` now reports `graph_only` in the tested path.

### Problems that still remain

The remaining tooling problems are now better described as:

1. retrieval is still sensitive to natural-language phrasing and can drift in ranking/recall;
2. noisy `resource_heuristic` clues still compete with higher-value runtime candidates;
3. query/context/runtime-verifier responsibilities are still not cleanly separated in the user-facing workflow;
4. seed-oriented retrieval exists, but it is still secondary in the discovery path and UX framing;
5. the remaining "trigger-word bias" concern is now mostly about existing rule assets / rule contracts and retrieval ergonomics, not about the core graph-only runtime closure mechanism.

## Environment Snapshot

### Repo registry resolution

Command:

```bash
python3 "$HOME/.agents/scripts/repo-registry.py" resolve --repo-ref 'repo://gitnexus'
```

Output:

```text
/Users/nantasmac/projects/agentic/GitNexus
```

### Indexed repo snapshot

Resource:

```text
gitnexus://repo/neonspark-core/context
```

Observed fields:

```yaml
project: neonspark-core
files: 8044
symbols: 100935
processes: 300
indexed: 2026-04-09T05:57:31.338Z
commit: 2e1a505
```

This report therefore uses a current graph, not an older stale snapshot.

## Finding 1: Query-Time `trigger_tokens` Is No Longer a Hard Gate

### Verdict

Status: `confirmed fixed at tooling level`

This does not mean all retrieval problems are solved. It means the specific earlier claim about query-time token gating is now outdated.

### Evidence A: persisted rule-produced edges exist in graph storage

MCP `cypher`:

```cypher
MATCH ()-[r:CodeRelation {type:'CALLS'}]->()
WHERE r.reason CONTAINS 'unity-rule-'
RETURN r.reason AS reason, count(*) AS edges
ORDER BY edges DESC
LIMIT 20
```

Observed result:

```text
unity-rule-scene-load:unity.battlemode-editor-global-init.v2      17
unity-rule-lifecycle-override:unity.pickup-powerup-runtime-chain.v2 9
unity-rule-method-bridge:unity.pickup-powerup-runtime-chain.v2     2
unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2       2
unity-rule-lifecycle-override:unity.battlemode-editor-global-init.v2 1
unity-rule-resource-load:unity.pickup-powerup-runtime-chain.v2     1
unity-rule-lifecycle-override:unity.weapon-powerup-equip-chain.v2  1
```

Implication:

Rule outputs are persisted graph facts. They are not query-only temporary matches.

### Evidence B: `context` consumes rule edges without query text

MCP `context` call:

```text
uid = Method:Assets/NEON/Code/Framework/Global.cs:InitGlobal
unity_resources = on
unity_hydration_mode = compact
response_profile = full
runtime_chain_verify = on-demand
```

Relevant returned fields:

```json
{
  "runtime_claim": {
    "rule_id": "graph-only.runtime-closure.v1",
    "scope": {
      "host_base_type": ["InitGlobal"],
      "trigger_family": "graph_only"
    }
  }
}
```

Relevant hop notes:

```text
Synthetic edge observed in graph (unity-rule-scene-load:unity.battlemode-editor-global-init.v2)
Synthetic edge observed in graph (unity-rule-lifecycle-override:unity.battlemode-editor-global-init.v2)
```

Implication:

The runtime claim path is no longer anchored on query text. It is consuming graph evidence directly.

### Evidence C: persisted process trace exists without query-time reconstruction

Resource:

```text
gitnexus://repo/neonspark-core/process/proc_0_unity_runtime_root
```

Observed trace:

```yaml
1: unity-runtime-root reason=unity-rule-lifecycle-override:unity.weapon-powerup-equip-chain.v2
2: EquipWithEvent (Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs)
3: Equip (Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs)
4: OnAddPowerUp (Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.PickUp.cs)
```

Implication:

At least this runtime path is already materialized as a process, not assembled only because the user asked with the right wording.

### Source anchors for the process

- `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Framework/Global.cs`
- `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs`
- `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.PickUp.cs`

Relevant code excerpts inspected during verification:

1. `InitGlobal()` loads the `Global` scene in `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Framework/Global.cs`.
2. `EquipWithEvent()` calls `Equip()` in `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs`.
3. `Equip()` calls `player.NetPlayer.OnAddPowerUp(id)` in the same file.
4. `OnAddPowerUp(int powerId)` dispatches to `CmdAddItem(powerId)` in `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.PickUp.cs`.

## Finding 2: Retrieval Still Has Phrasing Drift and Heuristic Noise

### Verdict

Status: `still a real product/tooling problem`

The token gate issue is largely gone, but retrieval quality is still sensitive to phrasing.

### Evidence A: two different phrasings produce materially different candidate surfaces

MCP `query` A:

```text
weapon powerup equip runtime chain
```

Observed top candidate / hints:

```text
primary_candidate = Equip
process_hint includes: Unity-runtime-root -> OnAddPowerUp (confidence=high)
```

MCP `query` B:

```text
how does equiping a gun prefab happen after picking a power up
```

Observed top candidate / hints:

```text
primary_candidate = FirearmsPowerUp
process_hints are dominated by low-confidence runtime heuristic clues
```

Implication:

The same underlying runtime topic can still surface very different candidate sets and confidence shapes depending on phrasing.

### Evidence B: noisy heuristic resource clues still enter the result set

Observed `process_hints` / `resource_hints` from the above queries included low-confidence clues such as:

```text
DualColdWeaponPowerUp runtime heuristic clue
HybridWeaponPowerUp runtime heuristic clue
SimpleChain runtime heuristic clue
Assets/NEON/Prefab/EnemyPrefab/prefab/V_zombi_jumper.prefab
```

Implication:

The system can now reach graph-backed runtime facts, but still mixes them with broad heuristic clue expansion in a way that increases user interpretation cost.

## Finding 3: Query / Context / Runtime-Verifier Responsibilities Still Overlap Too Much

### Verdict

Status: `still a tooling/UX boundary problem`

The retrieval pipeline is stronger than before, but user-facing outputs still mix:

1. graph-backed facts;
2. closure verification state;
3. heuristic follow-up advice;
4. gap diagnostics.

### Evidence A: `context` on a symbol returns graph-backed hops but also unresolved verifier gaps

For `InitGlobal`, `context(..., runtime_chain_verify=on-demand, response_profile=full)` returned:

```json
{
  "runtime_claim": {
    "rule_id": "graph-only.runtime-closure.v1",
    "status": "failed",
    "evidence_level": "clue",
    "verification_core_status": "failed"
  }
}
```

While at the same time the hop list contains strong graph evidence:

```text
Synthetic edge observed in graph (unity-rule-scene-load:unity.battlemode-editor-global-init.v2)
Synthetic edge observed in graph (unity-rule-lifecycle-override:unity.battlemode-editor-global-init.v2)
```

And the same payload also exposes unresolved segments:

```text
guid_map: bind segment missing
runtime: runtime segment missing
```

Implication:

The tool now exposes the right internals, but the workflow still asks the user to interpret three different layers at once:

1. graph existence;
2. verifier closure;
3. remaining gap taxonomy.

That is accurate for expert users, but still heavy for default retrieval workflows.

### Evidence B: query outputs still mix deterministic narrowing with heuristic instruction

Example `upgrade_hints` / `decision.recommended_follow_up` from live queries included:

```text
recommended_follow_up = uid=Method:...:Equip
recommended_follow_up = resource_path_prefix=Assets/NEON/Prefab/EnemyPrefab/prefab/V_zombi_jumper.prefab
follow_next_hop -> Inspect asset + .meta linkage ...
```

Implication:

The system knows how to narrow deterministically, but that deterministic path is still framed as a secondary follow-up after an initial noisy retrieval round.

## Finding 4: Seed-Oriented Retrieval Exists, but It Is Still Secondary in the Retrieval Contract

### Verdict

Status: `improvement opportunity, not a core-failure bug`

The system already exposes structured anchors such as:

1. `uid`
2. `resource_path_prefix`
3. `unity_resources`
4. `unity_hydration_mode`

But in the current workflow they still feel like expert narrowing controls, not the primary contract for runtime retrieval.

### Evidence A: deterministic narrowing appears after query, not as the main path users are guided into

Across the live query results, the deterministic follow-up signals existed, but only after the system first performed broader natural-language retrieval:

```text
decision.recommended_follow_up = uid=...
decision.recommended_follow_up = resource_path_prefix=...
suggested_context_targets[] includes exact uid-based upgrades
```

Implication:

Seed retrieval is present as a capability, but it is still not the dominant workflow framing.

### Evidence B: the reportable evidence for precise runtime retrieval is still easier to produce with expert graph navigation

The strongest evidence in this re-verification came from:

1. `context(uid=...)`
2. `cypher`
3. `process` resource reads

not from a single natural-language query alone.

Implication:

This suggests that the next maturity step is not more keyword tweaking. It is making seed-first retrieval feel like a first-class entry path.

## Finding 5: "Rule Design Still Leans on Trigger Words" Should Now Be Interpreted Carefully

### Verdict

Status: `partly outdated if interpreted as a core engine limitation`

If this statement is interpreted as:

> "The new GitNexus runtime closure still fundamentally requires trigger words to function."

then it is contradicted by the evidence in Finding 1.

If it is interpreted as:

> "Existing rule assets, rule contracts, and retrieval ergonomics still bias users toward wording-driven discovery instead of seed-first graph retrieval."

then it is still valid.

### Evidence

1. Graph-only runtime claim works without query text.
2. Persisted synthetic edges exist in graph state.
3. Retrieval results are still phrasing-sensitive.
4. Deterministic narrowing exists but is still mostly a second-step workflow.

Implication:

The remaining problem is now less about raw runtime closure capability and more about:

1. current rule asset shape;
2. seed-oriented retrieval contract design;
3. default UX around narrowing and clue separation.

## Suggested Reframing for Current GitNexus Planning

### Reframe 1

Replace:

```text
runtime retrieval still depends on trigger token matching
```

With:

```text
runtime retrieval no longer depends on trigger token matching as a hard gate,
but natural-language phrasing still affects recall, ranking, and clue noise.
```

### Reframe 2

Replace:

```text
rule design is still trigger-word based
```

With:

```text
existing rule assets and retrieval ergonomics still do not make seed-first retrieval
the dominant user path, even though graph-only runtime closure is already available.
```

### Reframe 3

Elevate the remaining tool-side opportunities to:

1. stronger separation of graph facts vs verifier state vs heuristic clues;
2. a more explicit seed-first retrieval contract;
3. lower-noise default retrieval for Unity runtime use cases;
4. clearer user-facing progression from query discovery -> seed narrowing -> closure verification.

## Recommended Follow-Up Work

1. Add a seed-first runtime retrieval acceptance report that starts from `uid` or `resource_path_prefix`, not natural-language query text.
2. Add a retrieval-noise benchmark that compares multiple phrasings for the same runtime topic and records candidate drift.
3. Separate output tiers more aggressively:
   - graph facts
   - verifier closure state
   - heuristic clues
4. Revisit rule/report vocabulary so "trigger token dependency" is reserved only for real engine-level gating, not for phrasing-sensitive ranking behavior.

## Evidence Index

### MCP / Resource evidence used

1. `gitnexus://repo/neonspark-core/context`
2. `gitnexus://repo/neonspark-core/process/proc_0_unity_runtime_root`
3. `query("weapon powerup equip runtime chain")`
4. `query("how does equiping a gun prefab happen after picking a power up")`
5. `query("InitGlobal BattleMode load runtime startup chain")`
6. `context(uid=Method:Assets/NEON/Code/Framework/Global.cs:InitGlobal, runtime_chain_verify=on-demand, response_profile=full)`
7. `context(uid=Method:Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs:Equip, runtime_chain_verify=on-demand, response_profile=full)`
8. `cypher(reason CONTAINS 'unity-rule-')`
9. `cypher(reason = 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2')`
10. `cypher(reason = 'unity-rule-method-bridge:unity.pickup-powerup-runtime-chain.v2')`

### Source anchors used

1. `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Framework/Global.cs`
2. `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs`
3. `/Volumes/Shuttle/unity-projects/neonspark/Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.PickUp.cs`
