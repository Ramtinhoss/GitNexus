# Neonspark Reload Validation Gap Remediation

Date: 2026-04-03
Scope: `docs/plans/2026-04-03-unity-runtime-validation-gap-remediation-plan.md`

## Outcome

Current source now separates the two query shapes cleanly:

1. Broad reload query no longer drifts to unrelated resource hops.
2. Seeded orb-key query verifies the intended `resource -> guid_map -> code_loader -> code_runtime` chain.
3. Historical acceptance artifact `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json` verifies successfully on the rebuilt `dist` runner.

## Broad Query

Command:

```bash
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on \
node gitnexus/dist/cli/index.js query -r neonspark-core \
  --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand \
  "Reload NEON.Game.Graph.Nodes.Reloads"
```

Observed result:

- `next_hops[0]` is now the retrieval-rule follow-up for `Reload GunGraph`; no unrelated resource path is emitted.
- `runtime_claim.status=verified_partial`
- `runtime_chain.hops` closes:
  - `RegisterGraphEvents -> RegisterEvents`
  - `RegisterEvents -> StartRoutineWithEvents`
- `runtime_chain.gaps` explicitly report missing `resource` and `guid_map` instead of choosing an arbitrary graph asset.

Interpretation:

- Broad query remains intentionally non-committal on resource selection when no seed corroboration exists.
- This is preferable to the previous false-positive closure on `gun_tata` / monster assets.

## Seeded Query

Command:

```bash
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on \
node gitnexus/dist/cli/index.js query -r neonspark-core \
  --unity-resources on --unity-hydration parity --unity-evidence full \
  --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" \
  --resource-seed-mode strict --runtime-chain-verify on-demand \
  "reload GunGraph Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset"
```

Observed result:

- `runtime_claim.status=verified_full`
- `runtime_claim.evidence_level=verified_chain`
- required hops:
  - `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset`
  - `.../1_weapon_orb_key.asset.meta`
  - `RegisterGraphEvents -> RegisterEvents`
  - `RegisterEvents -> StartRoutineWithEvents`
- `evidence_meta.minimum_evidence_satisfied=false` and `filter_exhausted=true` no longer erase the closed chain.

## Rule Artifacts

- approved yaml sha256: `8a05f2f2dc798fbfb4c2d8dd50572e5a2715c5e393882d2a98135aa933e224a6`
- compiled verification bundle sha256: `d5a6a1036e538f769913712968cec900d2653014cca56da871745c75664dd53d`
- promoted rule path:
  `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/approved/demo.neonspark.reload.v1.yaml`

## Acceptance Parity

Command:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```

Result:

- `passed`

## Remaining Deliberate Gap

- Broad query without a user/resource seed still does not infer a concrete reload asset.
- The current behavior is to return the rule-configured `Reload GunGraph` follow-up plus a partial verified code chain.
- This is a deliberate fallback to avoid false resource closure.
