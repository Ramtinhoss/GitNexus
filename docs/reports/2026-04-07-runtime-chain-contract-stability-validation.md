# Runtime-Chain Contract Stability Validation (2026-04-07)

## Gates Executed

1. Build
- Command: `npm --prefix gitnexus run build`
- Result: PASS

2. Runtime-chain suites
- Command: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/test/unit/mcp-tools.contract.test.ts gitnexus/test/unit/runtime-claim.policy.test.ts gitnexus/test/unit/hydration-policy-repeatability-runner.test.ts`
- Result: PASS (`4 files`, `50 tests`)

3. Setup + AI-context contract suites (node:test)
- Command: `node --test gitnexus/dist/cli/setup.test.js gitnexus/dist/cli/ai-context.test.js`
- Result: PASS (`16 tests`)

4. Contract grep gate
- Command: `rg -n "verifier-core|policy-adjusted|fallbackToCompact|verified_partial|verified_segment" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md gitnexus/src/mcp/tools.ts gitnexus/skills/_shared/unity-runtime-process-contract.md`
- Result: PASS (matches found in all required files)

## Artifact Evidence

- Repeatability JSON: `docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`
- Repeatability MD: `docs/reports/2026-04-07-runtime-chain-contract-repeatability.md`
- Semantic fields present:
  - `policy_mapping.strict.downgradeOnFallback`
  - `semantic_contract.coreAdjustedDelta`
  - `semantic_contract.downgradeOnlyWhenStrictFallback`

## Known Issues / Residual Risk

- `node gitnexus/dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js ...` currently fails with:
  - `Cannot find module .../dist/core/search/bm25-index.js` imported from `dist/mcp/local/local-backend.js`
- Workaround used in this run:
  - `npx --yes tsx gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts --repo GitNexus --out docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`
- Impact: benchmark artifact generation is still verifiable, but dist-runner path needs separate packaging/import fix.
