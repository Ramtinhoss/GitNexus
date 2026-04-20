# 2026-04-02 M0 Three-Bucket Validation

- generated_at: 2026-04-02T16:27:16.587Z
- repo_alias: neonspark-core

## Metrics
- anchor_pass_rate: 1
- holdout_next_hop_usability: 1
- negative_false_positive_rate: 0

## Gates
- anchor_pass: true
- holdout_pass: true
- negative_pass: true
- command_contract_pass: true
- cypher_edge_counts_pass: true
- anchor_chain_closure_pass: true
- anti_hardcode_pass: true
- overall_pass: true

## Anchor Case
- query: EnergyByAttackCount Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset
- top_target: Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset
- runtime_status: verified_partial
- runtime_reason: (none)

## Raw Evidence Pointers
- cypher edge counts + anchor closure (with query strings): /Volumes/Shuttle/projects/agentic/GitNexus/docs/reports/2026-04-02-m0-three-bucket-validation.json#evidence.cypher
- command contract + smoke output: /Volumes/Shuttle/projects/agentic/GitNexus/docs/reports/2026-04-02-m0-three-bucket-validation.json#evidence.command_contract
- anti-hardcode + fallback scans: /Volumes/Shuttle/projects/agentic/GitNexus/docs/reports/2026-04-02-m0-three-bucket-validation.json#evidence.static_checks

## Artifacts
- report_json: /Volumes/Shuttle/projects/agentic/GitNexus/docs/reports/2026-04-02-m0-three-bucket-validation.json
