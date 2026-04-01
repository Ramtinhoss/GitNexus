# Neonspark Reload Runtime Chain - Fact Check Case

Date: 2026-03-31
Repo: `neonspark` (`/Volumes/Shuttle/unity-projects/neonspark`)
Goal: Verify whether current GitNexus retrieval can recover how `Reload` is loaded and executed at runtime.

## 1. Scope and Question

Question under verification:

- Can we reconstruct the real runtime chain for `Reload` (Unity ScriptableObject-based graph node) in a real Unity repo?
- If `process` is empty, can we still reconstruct via resource evidence + code path?

## 2. Environment and Index State

Verification command:

```bash
node /Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js status
```

Observed result:

- Indexed commit: `9d105b2`
- Current commit: `9d105b2`
- Status: up-to-date

## 3. Retrieval Facts (GitNexus)

Commands:

```bash
node .../cli/index.js query -r neonspark --unity-resources on --unity-hydration compact "Reload NEON.Game.Graph.Nodes.Reloads"
node .../cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
node .../cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs" --unity-resources on --unity-hydration parity Reload
```

Observed facts:

1. `query` (compact):
   - `processes=0`
   - `process_symbols=0`
   - `Reload.resourceBindings=0`
2. `query` (parity):
   - `processes=0`
   - `process_symbols=0`
   - `Reload.resourceBindings=21`
3. `context` (parity):
   - `processes=0`
   - `resourceBindings=21`
   - `hydrationMeta.effectiveMode=parity`
   - `hydrationMeta.isComplete=true`

Conclusion from retrieval layer:

- Current `process` is empty for this target.
- Unity parity hydration provides sufficient resource leads, but they are not projected into `process`.

## 4. Runtime Chain Reconstruction (Verified Case)

Chosen case:

- `Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset`

### 4.1 Resource binding chain

1. PowerUp asset uses `WeaponPowerUp` script:
   - `m_Script guid: f70f...`
   - file: `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs.meta` (`guid: f70f...`)
2. Same asset references graph:
   - `gungraph guid: 69199acacbf8a7e489ad4aa872efcabd`
   - file: `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset.meta` (`guid: 69199...`)
3. Graph contains `Reload` node:
   - `m_Script guid: bd387039cacb475381a86f156b54bac2`
   - file: `Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta` (`guid: bd387...`)
4. Graph wiring shows:
   - `Reload.ResultRPM -> GunOutput.RPM`

### 4.2 Runtime execution chain (code-level)

1. Pickup flow eventually executes powerup pick:
   - `Pickup` calls `player.HoldPickup(this)` or `powerUp.PickItUp(...)`
   - `PlayerActor.HoldPickup` calls `p.powerUp.PickItUp(p, this)`
2. `FirearmsPowerUp.PickItUp` triggers equip:
   - `base.PickItUp(...)`
   - `EquipWithEvent()`
3. `WeaponPowerUp.Equip` loads graph:
   - `player.Gun.gungraph.CurGunGraph = gungraph`
   - `CurGunGraph.CurPlayerActor = player`
4. `GunGraphMB` registers graph events:
   - `OnEnable -> RegisterGraphEvents() -> CurGunGraph.RegisterEvents()`
5. `GunGraph.RegisterEvents` invokes `IGraphEvent.Register()` on nodes:
   - `ReloadBase.Register -> OnEquip`
6. `Reload.OnEquip` subscribes runtime shooting events:
   - `EventHub.OnPlayerShooting += OnStartShooting`
   - `EventHub.OnPlayerStopShooting += OnStopShooting`
7. Shooting routine drives graph output:
   - `Gun.GunAttackRoutine -> CurGunGraph.StartRoutineWithEvents(...)`
   - loop uses `output.FireDelay`
8. `GunOutput.FireDelay` reads RPM input from connected node:
   - `RPMPort.GetValue(RPM)` pulls from `Reload.ResultRPM`
9. `ReloadBase.GetValue` runs reload logic:
   - `CheckReload()`
   - `NeedReload()`
   - `ReloadRoutine()` when needed

### 4.3 Secondary sample (cross-check)

Another graph from `Reload` resource bindings:

- `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_gun_hollow.asset`

Its graph GUID is referenced by:

- `Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/枪_Gun/1_weapon_gun_hollow.asset` (`gungraph` field)

This confirms the same `PowerUp asset -> gungraph -> Reload node -> runtime` pattern is not unique to one asset.

## 5. Verdict

1. The runtime chain for `Reload` is reproducible on real repo with concrete evidence.
2. Current GitNexus `process` output does not reconstruct this chain (still empty for this case).
3. Practical reconstruction currently depends on:
   - parity `resourceBindings`
   - YAML/meta resource tracing
   - code-level runtime path stitching

## 6. Implication for Design

To make agent behavior reliable for runtime questions, the system needs process-level integration of Unity resource/lifecycle evidence so that chain clues appear in `process` (single-shot or multi-hop stitched).

## 7. 2026-04-01 Follow-up

Follow-up acceptance now exists at:

- `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`
- `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md`

Observed delta:

1. `query/context` still expose low-confidence runtime clues instead of overstating certainty.
2. Explicit `--runtime-chain-verify on-demand` now closes the Reload chain to `verified_full`.
3. The stitched chain is no longer only a prose fact-check; it is stored with filesystem-verified hop anchors.
