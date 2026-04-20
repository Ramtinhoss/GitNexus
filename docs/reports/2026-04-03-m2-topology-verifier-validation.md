# M2 Topology Verifier Validation

Date: 2026-04-03

## Scope

Validate WS-D / M2 acceptance for topology-driven runtime-chain verification:

1. verifier executes rule topology instead of relying only on `required_hops` heuristics
2. failure output identifies the missing hop and returns deterministic retry guidance
3. reload baseline remains green
4. strict-seed mapped-resource equivalence remains accepted
5. production verifier path contains no case-literal gating

## Implementation Summary

Files changed:

- `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- `gitnexus/test/unit/runtime-chain-verify-m2.test.ts`
- `gitnexus/test/unit/runtime-chain-verify-equivalence.test.ts`

Behavior landed:

1. verification rules now preserve topology / closure / claims fields when loaded from compiled bundles
2. `verifyRuntimeChainOnDemand` inherits `rule.required_hops` when explicit `requiredHops` input is absent
3. verifier executes declared topology hops first and resolves `resource`, `guid_map`, `code_loader`, `code_runtime` against deterministic evidence
4. missing topology hops emit gap-local `why_not_next` plus deterministic `next_command`
5. successful topology closure upgrades to `verified_chain`; partial closure remains `verified_segment`

## Verification Commands

```bash
npm exec -- vitest run \
  test/unit/runtime-chain-verify-m2.test.ts \
  test/unit/runtime-chain-verify-equivalence.test.ts \
  --reporter=dot
npm run build
npm exec -- vitest run \
  test/unit/runtime-chain-verify-m2.test.ts \
  test/unit/runtime-chain-verify-equivalence.test.ts \
  test/unit/local-backend-next-hops.test.ts \
  test/unit/rule-lab-m1.test.ts \
  test/unit/tools.test.ts \
  test/integration/local-backend-calltool.test.ts \
  --reporter=dot
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
rg -n "1_weapon_0_james_new|1_weapon_0_james1|7289942075c31ab458d5214b4adc38a1|1b63118991a192f4d8ac217fd7fe49ce" \
  gitnexus/src --glob '!**/*.test.*'
```

## Results

1. Topology execution tests pass:
   - full topology closure returns `verified_full` with `verified_chain`
   - missing runtime hop returns `verified_partial` with first gap `segment=runtime`
   - gap includes `why_not_next` mentioning the expected runtime target and a deterministic verify command
   - disconnected runtime edge no longer satisfies topology closure when it does not continue from the previous matched hop
2. Strict-seed mapped-resource equivalence regression remains green and now lives under default `test/unit` collection
3. Reload acceptance baseline re-validates successfully against the refreshed artifact path
4. Production source scan under `gitnexus/src` (excluding tests) shows no anchor-case literal gating hits
5. Independent sub-agent review found no blocker after the connected-topology follow-up fix

## Acceptance Readout

1. Missing-hop pinpointing: pass
2. Reload baseline: pass
3. No case-literal gating in production verifier path: pass
4. Strict-seed mapped-resource equivalence: pass
5. Independent review: pass
