# Agent-Safe Query/Context Benchmark Design

Date: 2026-04-08
Owner: GitNexus
Status: Approved for planning

## 1. Goal

Optimize agent-facing `query/context` usage for Unity retrieval workflows with two hard constraints:

1. Improve workflow execution efficiency by reducing noise-driven re-query / re-context / re-cypher detours.
2. Reduce tool-return token cost without shrinking retrieval capability.

This design fixes two benchmark cases and defines how before/after comparisons must be measured.

## 2. Non-Goals

This design does not include:

1. Rewriting retrieval ranking end-to-end.
2. Changing runtime verifier semantics.
3. Adding case-specific hardcoded logic for reload or weapon powerup.
4. Expanding Unity runtime process scope beyond agent-safe return shaping and benchmark instrumentation.

## 3. Baseline Reality

### 3.1 WeaponPowerUp latest live baseline

Benchmark case:

- `HoldPickup -> PickItUp -> EquipWithEvent -> WeaponPowerUp.Equip`

Latest live retrieval conclusion on `neonspark-core`:

1. `Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset` still anchors to `WeaponPowerUp`.
2. `HoldPickup -> WeaponPowerUp.PickItUp` can be structurally proven.
3. `EquipWithEvent -> WeaponPowerUp.Equip` can be structurally proven.
4. Query-time `runtime_claim` is still not closure and must remain `not_verified_full`.

### 3.2 Reload latest live baseline

Benchmark case:

- seeded reload chain around `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset`

Latest live retrieval conclusion on `neonspark-core`:

1. Broad reload text queries still drift into low-confidence heuristic clues.
2. Seeded reload queries can recover the correct gungraph asset neighborhood and `Reload` / `ReloadBase` anchors.
3. `ReloadBase.GetValue -> ReloadBase.CheckReload` can be structurally proven.
4. Latest live query-time `runtime_claim` is still not closure and must remain `not_verified_full`.

Historical acceptance artifacts such as `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md` are useful provenance, but must not be used as the semantic baseline for this optimization. The benchmark must compare against latest live retrieval behavior.

## 4. Benchmark Contract

### 4.1 Two fixed benchmark cases

#### Case A: WeaponPowerUp Equip Chain

- User intent: locate the resource-backed equip chain and prove the two bridge edges.
- Canonical semantic tuple:
  - `resource_anchor = Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset`
  - `symbol_anchor = WeaponPowerUp`
  - `proof_edges = {HoldPickup -> WeaponPowerUp.PickItUp, EquipWithEvent -> WeaponPowerUp.Equip}`
  - `closure_status = not_verified_full`

#### Case B: Reload Chain

- User intent: locate the reload graph chain around the player gun graph and prove the reload proof edge.
- Canonical semantic tuple:
  - `resource_anchor = Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset`
  - `symbol_anchor = ReloadBase`
  - `proof_edge = ReloadBase.GetValue -> ReloadBase.CheckReload`
  - `closure_status = not_verified_full`

### 4.2 Acceptance rule

After optimization, both benchmark cases must still produce the same semantic tuple. Output shape may become slimmer, but semantic tuple equality is mandatory.

## 5. Primary Evaluation Mode: Convergence Efficiency Replay

The primary benchmark is not a fixed script replay. It is a deterministic workflow replay with explicit retry rules, so that query noise can surface as extra tool calls.

### 5.1 State machine

Each case runs through the following state machine:

- `Q`: run `query`
- `RQ`: rerun a narrower `query`
- `C`: run `context`
- `P`: run `cypher`
- `STOP`: semantic tuple satisfied
- `FAIL`: max steps reached without satisfying semantic tuple

### 5.2 Retry triggers

#### Query -> Re-query

Trigger a narrower query when any of the following is true:

1. No usable primary anchor is returned.
2. Returned resource domain is clearly off-target for the case.
3. Only fallback-style candidates are present.
4. Runtime preview indicates evidence missing while case-specific proof anchors are absent.

#### Query -> Context

Move to `context` only when the query has already exposed a concrete symbol anchor suitable for proof work.

#### Context -> Second Context

Run a second `context` only when the first context remains too generic to support proof, such as class-level context without the method anchors needed for the case.

#### Context -> Cypher

Move to `cypher` only when there is enough anchor specificity to write a single proof query for the case.

#### Cypher -> Second Cypher

Retry `cypher` only when:

1. `row_count = 0`, and
2. the current anchor is still plausibly incomplete rather than wrong.

No unbounded cypher retries are allowed.

### 5.3 Case A replay script

#### Start

`Q1 = query("weapon powerup equip chain")`

#### Narrowing

If `Q1` does not converge on the correct resource and bridge symbols:

`RQ1 = query(seed with 1_weapon_orb_key.asset)`

#### Proof path

1. `C1 = context(HoldPickup)`
2. `C2 = context(EquipWithEvent)`
3. `P1 = cypher` proving both bridge edges

#### Stop condition

Stop when the WeaponPowerUp semantic tuple is satisfied.

### 5.4 Case B replay script

#### Start

`Q1 = query("reload getvalue checkreload")`

#### Narrowing

If `Q1` does not converge on the correct gungraph asset and reload anchors:

`RQ1 = query(seed with Gungraph_use/1_weapon_orb_key.asset)`

#### Proof path

1. `C1 = context(ReloadBase)`
2. `P1 = cypher` proving `GetValue -> CheckReload`

#### Stop condition

Stop when the Reload semantic tuple is satisfied.

## 6. Secondary Evaluation Mode: Same-Script Control Track

The control track is still required, but only as a no-regression guard.

Purpose:

1. Confirm semantic tuple equivalence under a fixed tool plan.
2. Measure token savings when the control flow is held constant.

In this track, `toolCalls` may remain unchanged. That is expected and not a failure. The value of this track is payload comparison, not convergence improvement.

## 7. Default Return Strategy

The optimization target is to make the default return slim for agent use.

### 7.1 Default behavior

Default `query/context` returns become slim.

### 7.2 Explicit upgrade path

Full payload must remain available through an explicit upgrade, such as:

- `response_profile=full`
- `unity_evidence_mode=full`
- `runtime_chain_verify=on-demand`

The benchmark requires that the slim return still tells the agent how to reach the full evidence path when needed.

## 8. Slim Return Contract

### 8.1 Query default slim contract

Default `query` keeps only:

1. `summary`
2. `candidates[]`
3. `process_hints[]`
4. `resource_hints[]`
5. `decision`
6. `fallback_candidates[]` only when there is no converged primary path
7. `upgrade_hints[]`
8. `runtime_preview`

Default `query` must not return:

1. full `processes[]`
2. full `definitions[]`
3. full `resourceBindings[]`
4. aggregate `serializedFields`
5. full `runtime_claim.hops[]`

### 8.2 Context default slim contract

Default `context` keeps:

1. `symbol`
2. slim `incoming`
3. slim `outgoing`
4. slim `processes[]`
5. `resource_hints[]`
6. `verification_hint`
7. `upgrade_hints[]`

Default `context` must not return:

1. full Unity serialized payloads
2. unrelated fallback-style definition buckets

### 8.3 Upgrade hints contract

Each `upgrade_hint` must contain:

1. `goal`
2. `why`
3. `param_delta`
4. `next_command`

Supported goals:

1. `see_full_processes`
2. `see_unity_evidence`
3. `verify_runtime`
4. `prove_structure`

## 9. Source-Level Change Targets

Primary implementation surfaces:

1. `gitnexus/src/mcp/local/local-backend.ts`
   - query/context result assembly
   - `processes[]` to `process_hints[]`
   - `definitions[]` to conditional `fallback_candidates[]`
   - `next_hops[]` to slimmer `upgrade_hints[]`
   - safer verifier anchor selection
2. `gitnexus/src/mcp/local/unity-evidence-view.ts`
   - today it trims bindings and reference fields but still leaks scalar-heavy payloads
   - default slim mode must suppress aggregate `serializedFields`
3. verifier anchor selection helpers in `local-backend.ts`
   - must prefer seeded or process-linked anchors
   - must not let generic fallback symbols dominate proof routing

## 10. Metrics

### 10.1 Primary metrics

For convergence replay:

1. `tool_calls_to_completion`
2. `tokens_to_completion`
3. `query_retry_count`
4. `context_retry_count`
5. `cypher_retry_count`
6. `calls_to_first_valid_anchor`
7. `stop_reason`

### 10.2 Control metrics

For same-script replay:

1. `totalTokensEst`
2. `durationMs`
3. `semantic_tuple_pass`

### 10.3 Token estimate contract

Use the existing benchmark utility in `gitnexus/src/benchmark/u2-e2e/metrics.ts`:

- `estimateTokens(text) = ceil(chars / 4)`

This keeps before/after comparisons on a stable, already-used metric.

## 11. Expected Outcome

These are design targets, not acceptance shortcuts.

### 11.1 WeaponPowerUp

#### Convergence replay

- expected before: about 5 steps
- expected after: about 4 steps
- expected token reduction: at least 50%

#### Same-script control

- expected tool calls: unchanged when script is fixed
- expected token reduction: at least 50%

### 11.2 Reload

#### Convergence replay

- expected before: about 4 steps
- expected after: about 3-4 steps
- expected token reduction: 40% to 60%

#### Same-script control

- expected tool calls: unchanged when script is fixed
- expected token reduction: 40% to 60%

### 11.3 Suite-level expectation

1. Workflow efficiency improves mainly by reducing detours caused by noisy query payloads.
2. Token savings are the primary guaranteed win.
3. Tool-call savings are expected to be moderate and case-dependent.

## 12. Artifacts

Implementation must emit before/after benchmark reports with the following top-level shape:

1. `cases.weapon_powerup`
2. `cases.reload`
3. `same_script`
4. `workflow_replay`
5. `semantic_equivalence`
6. `token_summary`
7. `call_summary`

Each case report must include:

1. `tool_plan`
2. `steps[]`
3. `semantic_tuple`
4. `semantic_tuple_pass`
5. `tool_calls_to_completion`
6. `tokens_to_completion`
7. `retry_breakdown`
8. `stop_reason`

## 13. Implementation Boundary

This design authorizes only:

1. default slimming of `query/context`
2. new slim return contract fields
3. before/after benchmark replay and reporting

This design does not authorize:

1. retrieval ranking rewrites
2. verifier semantic changes
3. Unity rule expansion
4. case-specific hardcoded shortcuts

## 14. Final Acceptance

Implementation is acceptable only when all of the following hold:

1. `WeaponPowerUp` semantic tuple passes.
2. `Reload` semantic tuple passes.
3. Workflow replay token usage drops materially.
4. Workflow replay tool calls do not increase.
5. Full evidence can still be reached through explicit upgrade paths.
