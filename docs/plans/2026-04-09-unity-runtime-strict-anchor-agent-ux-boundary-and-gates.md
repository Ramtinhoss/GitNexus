# Unity Runtime Strict-Anchor Agent UX: Boundaries and Acceptance Gates

Date: 2026-04-09
Repo: GitNexus
Status: Draft for execution
Audience: tooling / retrieval / MCP contract owners

## 1. Decision

When `uid + resource_path_prefix` are known, default agent experience must be **strict anchor first**:

1. prioritize deterministic facts and closure progress;
2. suppress clue-tier competition in first-screen decision path;
3. require explicit user action to expand exploratory clues.

## 2. User-Facing Goal

For anchored runtime retrieval, first-screen output should answer:

1. what deterministic symbol/path is being traced;
2. what closure state is reached;
3. what deterministic next step to run.

It should not require users/agents to parse low-confidence heuristic noise first.

## 3. Evidence Tier Contract (Target)

The response contract should expose three tiers with strict ordering:

1. `facts`:
   - persisted graph/process facts;
   - direct/projected code/process evidence.
2. `closure`:
   - runtime verification state and missing segments.
3. `clues`:
   - heuristic or exploratory suggestions (`resource_heuristic`, manual verification hints).

For strict-anchor mode, tier-3 clues are non-primary by default.

## 4. Problem Boundary

### 4.1 Treated as defects (must fix)

1. anchored request returns unrelated `primary_candidate`.
2. anchored request first-screen summary is dominated by low-confidence `resource_heuristic`.
3. adding GUID token causes anchor drift in candidate/follow-up.
4. recommended follow-up is non-deterministic when deterministic anchor exists.
5. placeholder or unrelated follow-up command leakage.

### 4.2 Treated as expected boundary behavior (not immediate defects)

1. `runtime_claim.failed` can coexist with strong graph hops when closure segments are missing.
2. method-only (no seed) context may remain graph-inspection only and not close runtime chain.
3. dynamic dispatch (event/topic/subscription) still requiring manual inference until dedicated graph structure exists.

## 5. P0/P1/P2 Priority

### P0 (release blocker for strict-anchor UX)

1. **Anchor consistency**:
   - in anchored calls, `decision.primary_candidate` must equal anchor symbol (or approved canonical alias mapping).
2. **First-screen anti-noise**:
   - if any non-heuristic high/medium lead exists, first-screen summary cannot be a low-confidence heuristic clue.
3. **Deterministic follow-up**:
   - follow-up priority must be `resource_path_prefix` / `uid` / explicit closure step.
   - no `follow_next_hop` generic placeholder in strict-anchor default path.
4. **GUID invariance**:
   - adding/removing GUID token (while keeping `uid + resource_path_prefix`) must not change primary candidate and top follow-up.

### P1 (high-value contract hardening)

1. explicit top-level envelope for `facts` / `closure` / `clues`.
2. strict-anchor mode should hide clue-tier rows from default summary block and place them in expandable section.
3. docs/skills/examples must present seed-first as default operational path.

### P2 (capability evolution)

1. first-class dynamic-dispatch graph model:
   - event topic entities;
   - publish/subscribe edges;
   - callback binding artifacts.

## 6. Quantitative Gates

All gates are evaluated on deterministic-anchor benchmark suite (fixed `uid + resource_path_prefix`, GUID optional variant):

1. `anchor_top1_pass = 100%` (P0)
2. `recommended_follow_up_hit = 100%` (P0)
3. `heuristic_top_summary_detected = 0%` (P0)
4. `guid_invariance_pass = 100%` (P0)
5. `placeholder_leak_detected = 0%` (P0)
6. `post_narrowing_anchor_pass = 100%` (guardrail; should remain true)

If any P0 metric fails, strict-anchor UX is considered unmet.

## 7. Benchmark/Test Matrix (Minimum)

1. Case A (clean anchor baseline):
   - `ReloadBase` + `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset`
2. Case B (known problematic anchor):
   - `SoulBringerIceCoreMgrPu` + `Assets/NEON/DataAssets/Powerups/3_武器道具/3_3_item_weapon_soulbringer_use_mana_icecore.asset`
3. GUID variant for each case:
   - same anchor + corresponding GUID token appended to query text.
4. Regression check:
   - `InitGlobal` graph-only runtime closure path remains functional.

## 8. Rollout Sequence

1. lock strict-anchor acceptance gates into benchmark output.
2. enforce P0 in response shaping/ranking path.
3. ship tiered response envelope and docs/skills updates.
4. start P2 design track for dynamic dispatch graph entities.

## 9. Exit Criteria for This Track

Strict-anchor track is complete when:

1. all P0 metrics pass on benchmark suite;
2. tier separation is visible in user-facing contract;
3. anchored runs do not require manual clue filtering for first decision.
