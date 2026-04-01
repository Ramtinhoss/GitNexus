# Reload V1 Runtime Chain Acceptance

Date: 2026-04-01
Repo Alias: `neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542`
Artifact: `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`

## Result

- Status parity: PASS (`indexedCommit == currentCommit == 9d105b2988e0a9711e6ef64cb4a8e458516f6c9c`)
- Runtime chain status: PASS (`verified_full`)
- Evidence level: PASS (`verified_chain`)
- Anchor authenticity: PASS (`5/5` anchors validated)
- Verify-only gate: PASS (`node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`)

## Clause Coverage

- `DC-03`: PASS
  `runtime_chain` emitted with non-empty anchored hops.
- `DC-04`: PASS
  Chain includes resource, `guid_map`, loader, and runtime segments.
- `DC-05`: PASS
  Low-confidence clue rows remain actionable through structured `verification_hint`.
- `DC-07`: PASS
  Reload query still closed the chain even though the process rows remained heuristic.
- `DC-08`: PASS
  All persisted anchors were filesystem-validated.

## Confirmed Hops

1. `resource`
   `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset:12`
2. `guid_map`
   `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset:1056`
3. `code_loader`
   `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:45`
4. `code_runtime`
   `Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:235`
5. `code_runtime`
   `Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:61`

## Delta vs 2026-03-31 Fact Check

- Previous fact check: parity `query/context` exposed resource evidence but left `processes=0`.
- Current V1 behavior: parity `query/context` still preserve low-confidence clue semantics, but `--runtime-chain-verify on-demand` now emits a verified stitched chain with anchor-backed closure.
- Previous gap: resource/meta/code stitching lived only in manual analysis.
- Current state: the same reconstruction is persisted as a machine-checkable artifact with verify-only revalidation.
