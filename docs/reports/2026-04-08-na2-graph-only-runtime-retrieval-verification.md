# NA2 Graph-Only Runtime Retrieval Verification

Date: 2026-04-08 11:32:41 +0800
Scope: Validate `docs/plans/2026-04-07-graph-only-runtime-retrieval-design.md` on `na2` (`neonspark-core`) after dev CLI link + TUI restart.

## Verification Target

- Repository alias: `na2`
- Indexed repo: `neonspark-core` (`/Volumes/Shuttle/unity-projects/neonspark`)
- Scenario reference:
  `/Volumes/Shuttle/unity-projects/neonspark/Docs/Reports/2026-04-05-gitnexus-weapon-powerup-equip-chain-rule-gen-report.md`
- Query intent:
  `1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip`
- Expected:
  runtime retrieval should not depend on trigger/rule matching, and should still return complete chain closure for this case.

## Environment Snapshot

- `gitnexus --version`: `1.5.0`
- `command -v gitnexus`: `/opt/homebrew/bin/gitnexus`
- global package link target:
  `/opt/homebrew/lib/node_modules/@veewo/gitnexus -> /Users/nantasmac/projects/agentic/GitNexus/gitnexus`
- MCP session: restarted after dev-link rollout
- `neonspark-core` index (from `list_repos`):
  `indexedAt=2026-04-08T03:20:21.071Z`, `files=8009`, `nodes=100512`, `edges=454362`, `processes=300`

## Validation Steps

1. MCP `query` with:
   - `repo=neonspark-core`
   - `unity_resources=on`
   - `unity_hydration_mode=parity`
   - `resource_path_prefix=Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset`
   - `runtime_chain_verify=on-demand`
2. MCP `cypher` to confirm graph contains expected bridge edges:
   - `unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2`
3. CLI parity check (`gitnexus query` with same parameters) and extraction snapshot saved to:
   - `/tmp/na2_after_restart_graphonly.json`

## Key Results

### Runtime Claim (MCP/CLI consistent)

- `runtime_claim.rule_id = graph-only.runtime-closure.v1`
- `runtime_claim.status = failed`
- `runtime_claim.evidence_level = none`
- `runtime_claim.hops = 15`
- `runtime_claim.gaps = 4`
- gap reasons:
  - `anchor segment missing`
  - `bind segment missing`
  - `bridge segment missing`
  - `runtime segment missing`

### Graph Existence Check

- `MATCH ... WHERE r.reason CONTAINS 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2'`
- result: `bridge_edges = 2`
- samples:
  - `HoldPickup->PickItUp`
  - `EquipWithEvent->Equip`

## Verdict

- Trigger/rule matching dependency at query-time: **PASS**
  - evidence: `runtime_claim.rule_id=graph-only.runtime-closure.v1`
- Complete chain closure for this case without trigger dependency: **FAIL**
  - expected `verified_full`, observed `failed/none`
  - bridge edges exist in graph but are not converted into closure-positive runtime claim for this query.

## Current Blocker

Graph-only verifier path is active, but this case does not satisfy closure segments despite bridge edges being present. The failure is now in graph-only closure/candidate logic, not in rule compilation or method-bridge edge injection.

