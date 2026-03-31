# Phase3 Lifecycle Synthetic CALLS Acceptance Report

Date: 2026-03-31
Branch: nantas-dev
Status: Ready for user verification

## Authenticity Gate
- [x] assert no placeholder path
- [x] assert live mode has tool evidence
- [x] assert synthetic edges vanish when the flag is off
- [x] assert freeze requires non-empty confirmed_chain.steps

## Command Log

```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" --unity-resources on --unity-hydration parity WeaponPowerUp
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "WeaponPowerUp Equip CurGunGraph"
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "GunGraph RegisterEvents StartRoutineWithEvents"
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs" --unity-resources on --unity-hydration parity Reload
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "Reload NEON.Game.Graph.Nodes.Reloads"
node gitnexus/dist/cli/index.js cypher -r neonspark "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason IN ['unity-lifecycle-synthetic','unity-runtime-loader-synthetic'] RETURN count(r) AS synthetic_calls"
/usr/bin/time -p node gitnexus/dist/cli/index.js context -r gitnexus --unity-resources off LocalBackend
/usr/bin/time -p env GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js context -r gitnexus --unity-resources off LocalBackend
/usr/bin/time -p node gitnexus/dist/cli/index.js query -r gitnexus --unity-resources off "process detection"
/usr/bin/time -p env GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on node gitnexus/dist/cli/index.js query -r gitnexus --unity-resources off "process detection"
npm --prefix gitnexus run test:u3:gates
```

## Baseline vs Phase3

| Metric | Baseline / Flag Off | Phase3 / Flag On | Delta |
| --- | ---: | ---: | ---: |
| neonspark synthetic CALLS count | 0 | 0 | 0 |
| neonspark acceptance total `processes` (5 commands) | 1 | 1 | 0 |
| neonspark acceptance total `process_symbols` (5 commands) | 1 | 1 | 0 |
| gitnexus non-Unity `context(LocalBackend)` processes | 70 | 70 | 0 |
| gitnexus non-Unity `query("process detection")` processes | 5 | 5 | 0 |
| gitnexus non-Unity `query("process detection")` process_symbols | 3 | 3 | 0 |

Timing guardrail:
- non-Unity context: `0.25s` (off) vs `0.23s` (on)
- non-Unity query: `0.33s` (off) vs `0.35s` (on)
- `npm --prefix gitnexus run test:u3:gates`: PASS (`49/49`)

## Neonspark Reload Verdict

Result: **partial pass**.

- Loader segment evidence present: `WeaponPowerUp`, `Equip`, `CurGunGraph`.
- Runtime segment evidence present: `RegisterEvents`, `StartRoutineWithEvents`.
- Reload segment evidence present: `Reload`, `ReloadRoutine`.
- `confirmed_chain.steps` is non-empty (`3` steps), satisfying freeze gate.

On this index snapshot (`neonspark` commit `9d105b2`, indexed 2026-03-30), process-symbol counts did not increase with the flag toggle; evidence was definition-driven rather than additional process edges.

## Architecture Note

Process recursion remains based on `CALLS` only; no new orchestration field was introduced.
