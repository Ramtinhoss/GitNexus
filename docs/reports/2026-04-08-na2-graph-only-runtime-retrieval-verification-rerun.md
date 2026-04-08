# NA2 Graph-Only Runtime Retrieval Verification Rerun (2026-04-08)

## Command

```bash
node gitnexus/dist/cli/index.js query \
  --repo neonspark-core \
  --unity-resources on \
  --unity-hydration parity \
  --resource-path-prefix "Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset" \
  --runtime-chain-verify on-demand \
  "1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip"
```

Exit code: `0`

Output artifact:
- `docs/reports/2026-04-08-na2-graph-only-runtime-retrieval-verification-rerun.json`

## Runtime Claim Summary

- `runtime_claim.rule_id`: `graph-only.runtime-closure.v1`
- `runtime_claim.status`: `verified_full`
- `runtime_claim.evidence_level`: `verified_chain`
- `runtime_claim.gaps`: `[]`

Required bridge snippets are present in `runtime_claim.hops[].snippet`:
- `HoldPickup -> PickItUp`
- `EquipWithEvent -> Equip`

## Bridge Evidence Cypher Check

```bash
gitnexus cypher --repo neonspark-core \
  "MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b) \
   WHERE r.reason CONTAINS 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2' \
   RETURN a.name,b.name LIMIT 10"
```

Result:

| a.name | b.name |
| --- | --- |
| HoldPickup | PickItUp |
| EquipWithEvent | Equip |

`row_count=2`

## Acceptance Checklist

- [x] Command exits `0` and returns JSON.
- [x] `runtime_claim.status=verified_full` and `runtime_claim.evidence_level=verified_chain`.
- [x] Segment-missing gap reasons are absent.
- [x] Both bridge snippets appear in `runtime_claim.hops[].snippet`.
- [x] Rule identity is graph-only (`graph-only.runtime-closure.v1`).
