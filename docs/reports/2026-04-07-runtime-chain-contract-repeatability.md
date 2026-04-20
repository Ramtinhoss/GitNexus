# Runtime-Chain Contract Repeatability (2026-04-07)

## Scope

Validate hydration-policy repeatability plus runtime-claim semantic contract fields:

- strict fallback downgrade target: `verified_partial/verified_segment`
- core-vs-adjusted split is machine-readable in report output
- downgrade guard remains strict-only

## Commands

- `npm --prefix gitnexus exec vitest run gitnexus/test/unit/hydration-policy-repeatability-runner.test.ts`
- `npm --prefix gitnexus run build`
- `node gitnexus/dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo GitNexus --out docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`
- `npx --yes tsx gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts --repo GitNexus --out docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`

## Results

- Unit gate: PASS (`hydration-policy-repeatability-runner.test.ts`)
- Dist runner: FAIL (`Cannot find module .../dist/core/search/bm25-index.js` imported from `dist/mcp/local/local-backend.js`)
- Source runner (tsx): PASS, artifact generated

## Semantic Evidence

From `docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`:

- `policy_mapping.strict.downgradeOnFallback = "verified_partial/verified_segment"`
- `semantic_contract.coreAdjustedDelta.strictFallbackRuns = 0`
- `semantic_contract.coreAdjustedDelta.strictFallbackAdjustedRuns = 0`
- `semantic_contract.coreAdjustedDelta.nonStrictAdjustedRuns = 0`
- `semantic_contract.downgradeOnlyWhenStrictFallback = true`

## Notes

- This run validated contract-field presence and strict-only downgrade guard.
- No strict fallback sample was observed (`strictFallbackRuns=0`), so runtime downgrade behavior was not exercised in this artifact run.
