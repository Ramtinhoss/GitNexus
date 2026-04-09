# Agent-Safe Query/Context Benchmark Deviation And Test Results

Date: 2026-04-09
Branch: `agent-safe-query-context-benchmark`
Base branch: `nantas-dev`
Design reference: `docs/plans/2026-04-08-agent-safe-query-context-benchmark-design.md`

## Summary

The implemented benchmark work in this branch currently contains a design deviation: the primary measured path was shifted from the design's deterministic convergence replay to a real `subagent_live` track. That produced useful realism data, but it is not the same acceptance mechanism described by the approved design.

## Recorded Design Deviations

1. The design defines `workflow_replay` as the primary evaluation mode and `same_script` as the secondary control track.
   Current branch state added `subagent_live` as the main reported live path and treated it as the primary before/after comparison surface.

2. The design fixes two benchmark cases with mandatory semantic tuple equality:
   - WeaponPowerUp: seeded resource anchor plus two bridge proof edges
   - Reload: seeded gungraph asset plus `ReloadBase.GetValue -> ReloadBase.CheckReload`
   Current live subagent prompt asked for the "strongest supported relation" from the seeds, which allowed plausible but non-canonical conclusions.

3. The design's optimization target is convergence efficiency under the deterministic replay state machine:
   `Q -> RQ -> C -> P -> STOP|FAIL`
   Current live measurement instead captured free-form agent exploration through a telemetry wrapper.

## Current Benchmark Results

Source artifact:
- `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`

### Semantic Equivalence

- `semantic_equivalence.pass = false`
- `weapon_powerup.semantic_tuple_pass = false`
- `reload.semantic_tuple_pass = false`

### Tool Call Summary

- `weapon_powerup`: before `4`, after `13`, saved `-9`
- `reload`: before `3`, after `7`, saved `-4`

### Token Summary

- `weapon_powerup`: before `7043`, after `9693`, saved `-2650`, reduction `-0.376`
- `reload`: before `11660`, after `6211`, saved `5449`, reduction `0.467`

### Live Result Drift

WeaponPowerUp live result drift:
- resource anchor remained the seeded orb asset
- symbol anchor drifted to `Method:Assets/NEON/Code/Game/MultipleLauncher.cs:LoadWeaponPowerUp`
- live result did not satisfy the canonical `WeaponPowerUp` symbol anchor plus two bridge proof edges tuple

Reload live result drift:
- resource anchor remained the seeded player gun graph asset
- symbol anchor drifted to fully-qualified `ReloadBase` class identity
- live result proved `asset -> Reload -> ReloadBase`, but did not prove canonical edge `ReloadBase.GetValue -> ReloadBase.CheckReload`

## Verification Status

### Previously executed targeted checks in this worktree

- `npm exec -- tsx --test src/benchmark/agent-safe-query-context/io.test.ts src/benchmark/agent-safe-query-context/subagent-live.test.ts src/benchmark/agent-safe-query-context/report.test.ts src/cli/benchmark-agent-safe-query-context.test.ts`
  - pass
- `npm run build`
  - pass

### Finishing-flow verification

- `npm --prefix gitnexus test`
  - pass
  - result: `79 passed`, `1669 passed`, `1 skipped`

## Follow-up Direction

This branch is being merged so the recorded implementation state, benchmark harness, and failing live benchmark evidence are preserved on `nantas-dev`. Requirement discussion should restart from the benchmark evidence above, especially around:

1. whether deterministic replay remains the acceptance metric
2. whether real subagent exploration should stay as a secondary diagnostic track
3. how tightly the live prompt should constrain the target proof objective
