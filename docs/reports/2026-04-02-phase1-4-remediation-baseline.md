# 2026-04-02 Phase1-4 Remediation Baseline Snapshot

Date (UTC): 2026-04-02T04:11:52Z
Workspace: `/Users/nantasmac/projects/agentic/GitNexus/.worktrees/unity-runtime-phase1-4-remediation`
Branch: `unity-runtime-phase1-4-remediation-20260402`
HEAD: `f6b25d2e34f9fc8b75b3e5488a2255e874dfaa93`

## Environment / Index Gates

1. Index rebuild
   - Command: `gitnexus analyze`
   - Result: `Repository indexed successfully (5.7s)`
   - Indexed repo alias: `unity-runtime-phase1-4-remediation`
   - Stats: `3,380 nodes | 7,753 edges | 280 clusters | 240 flows`
2. Build baseline
   - Command: `npm --prefix gitnexus run build`
   - Result: pass
3. Runtime env notes
   - `node_modules` installed in this worktree via `npm --prefix gitnexus install`

## FC-01..FC-06 Baseline Reproduction

### FC-01 / P1-READ-001 (`process_ref.reader_uri` readability)

- Command:
  - Node script: `query(repo=unity-runtime-phase1-4-remediation, query=Reload)` -> for each `process_ref.reader_uri`, call `readResource(uri)`.
- Baseline output:
  - `total=5, ok=5, fail=0, sample_failure=null`
- Observation:
  - **Unexpected vs plan assumption**: this baseline did **not** reproduce the prior `Process 'proc_*' not found` failure in current indexed state.
- Signal:
  - Assumption drift detected; requires re-scope decision before FC-01 code changes.

### FC-02 / P2-RULE-001 (cross-repo/ancestor fallback)

- Command:
  - Node script calling `loadRuleRegistry(nonexistentRepoPath)` under nested cwd with ancestor `.gitnexus/rules/catalog.json`.
- Baseline output (key fields):
  - `escapedRequestedRepo=true`
  - `resolvedCatalogPath=/.../workspace/.gitnexus/rules/catalog.json`
- Signal:
  - Registry escaped requested repo boundary and loaded ancestor catalog.

### FC-03 / P2-RULE-002 (verifier still reload-hardcoded)

- Commands:
  1. Static evidence:
     - `rg -n "RELOAD_QUERY_TOKENS|shouldVerifyReloadChain|requiredSegments = \['resource', 'guid_map', 'code_loader', 'code_runtime'\]" gitnexus/src/mcp/local/runtime-chain-verify.ts`
  2. Behavior evidence:
     - Node script with custom non-reload rule (`trigger_family: startup`) + `verifyRuntimeClaimOnDemand(...)`.
- Baseline output (behavior evidence):
  - `{ "rule_id": "none", "reason": "rule_not_matched", "status": "failed" }`
- Signal:
  - Non-reload rule exists but matcher path still does not execute it.

### FC-04 / P4-HYDR-001 (`unity_hydration_mode` not driving behavior)

- Commands:
  1. Static evidence:
     - `rg -n "unityHydrationMode =|hydrationPolicy === 'strict' \? 'parity'" gitnexus/src/mcp/local/local-backend.ts`
  2. Behavior comparison:
     - `query(... hydration_policy=strict, unity_hydration_mode=compact)`
     - `query(... hydration_policy=strict, unity_hydration_mode=parity)`
- Baseline output:
  - `compact_has_hydrationMeta=false`
  - `parity_has_hydrationMeta=false`
  - `same_missing_evidence=true`
  - `compact_process_count=5`, `parity_process_count=5`
- Signal:
  - Mode switch shows no observable delta under same policy.

### FC-05 / P2-CLAIM-001 (`next_action` trailing quote corruption)

- Command:
  - Node script: `query(repo=unity-runtime-phase1-4-remediation, query=UnrelatedUnityChain, runtime_chain_verify=on-demand)`
- Baseline output:
  - `reason=rule_not_matched`
  - `next_action=node ... --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads`
- Signal:
  - Missing closing quote confirmed.

### FC-06 / P2-ACC-001 (acceptance coverage incomplete)

- Commands:
  - `node gitnexus/dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo unity-runtime-phase1-4-remediation --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.baseline.json`
  - `cat docs/reports/2026-04-02-phase2-runtime-claim-acceptance.baseline.json`
- Baseline output:
  - `failure_classification_coverage=["rule_not_matched","gate_disabled"]`
- Signal:
  - Only 2 categories covered; missing `rule_matched_but_evidence_missing` and `rule_matched_but_verification_failed`.

## Baseline Conclusion

1. Reproduced as expected: FC-02, FC-03, FC-04, FC-05, FC-06.
2. Unexpected result: FC-01 currently reads 5/5 via `reader_uri` in this indexed baseline.
3. Execution impact:
   - Plan assumption mismatch exists before Task 1.
   - Needs human decision to either:
     - re-scope FC-01 implementation to regression-hardening, or
     - keep original FC-01 code changes despite non-reproduction.

## Artifacts

1. `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.baseline.json`
2. This file: `docs/reports/2026-04-02-phase1-4-remediation-baseline.md`
