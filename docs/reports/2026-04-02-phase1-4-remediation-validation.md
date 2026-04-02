# 2026-04-02 Phase1-4 Remediation Validation

Date (UTC): 2026-04-02T05:01:09Z
Repo: `unity-runtime-phase1-4-remediation`
Plan: `docs/plans/2026-04-02-unity-runtime-process-phase1-4-review-issues-remediation-execution-plan.md`

## Release Gate Command Results

0. `npm --prefix gitnexus test`
   - Result: pass (`55 files passed, 1588 tests passed`)
1. `npm --prefix gitnexus run build`
   - Result: pass
2. `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts`
   - Result: pass (`10 passed`)
3. `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable|phase2 runtime_claim contract|phase2 failure classifications|phase2 no cross-repo bootstrap fallback|phase4 hydration policy|phase4 missing_evidence and needsParityRetry"`
   - Result: pass (`6 passed`)
4. `node gitnexus/dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.js --repo unity-runtime-phase1-4-remediation --out docs/reports/2026-04-02-phase1-process-ref-acceptance.remediated.json`
   - Result: pass
5. `node gitnexus/dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo unity-runtime-phase1-4-remediation --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json`
   - Result: pass

## FC Validation Evidence

### fc01.readable_via_reader_uri
- Source artifact: `docs/reports/2026-04-02-phase1-process-ref-acceptance.remediated.json`
- Evidence:
  - `metrics.process_ref.total = 5`
  - `metrics.process_ref.readable_count = 5`
  - `metrics.process_ref.readable_rate = 1`
- Verdict: pass

### fc02.catalog_path_scope
- Source tests:
  - `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
  - `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Evidence:
  - `throws rule_catalog_missing when target repo has no catalog (no ancestor fallback)` passed
  - `throws rule_catalog_missing when rulesRoot exists but catalog.json is missing` passed
  - `throws rule_file_missing when catalog entry points to missing yaml file` passed
  - runtime-claim mapping to `rule_not_matched` on missing catalog/rule file passed
- Verdict: pass

### fc03.rule_execution_inputs
- Source tests: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Evidence:
  - `phase2 runtime claim required_hops are rule-driven` passed (`strict=>verified_partial`, `relaxed=>verified_full`)
  - `phase2 runtime claim guarantees/non_guarantees come from matched rule` passed
  - `phase2 non-reload trigger family can match and return evidence-missing classification` passed
- Verdict: pass

### fc04.requested_vs_effective_mode
- Source tests: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Evidence:
  - `phase4 hydration policy` passed
  - asserted `hydrationMeta.requestedMode/effectiveMode/reason`
  - strict policy + compact mode request shows strict precedence; fast policy + parity mode request shows fast override to compact
- Supporting artifact: `docs/reports/2026-04-02-phase4-hydration-policy-repeatability.remediated.json`
- Verdict: pass (code + integration evidence)

### fc05.next_action_shell_parsable
- Source tests:
  - `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts` (`parses scalar/list values with spaces, quotes, and escapes without truncation`)
  - `gitnexus/src/mcp/local/runtime-chain-verify.test.ts` (`phase2 next_action remains shell-parsable when unmatched`)
- Runtime check sample:
  - `next_action = node ... --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"`
- Verdict: pass

### fc06.failure_classification_coverage
- Source artifact: `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json`
- Evidence:
  - `coverage_pass = true`
  - `failure_classification_coverage = [rule_matched_but_verification_failed, rule_matched_but_evidence_missing, rule_not_matched, gate_disabled]`
  - `failure_classification_missing = []`
- Verdict: pass

## Design Traceability Matrix Closure

- `DC-P1-READABLE`: pass
- `DC-P2-NO-FALLBACK`: pass
- `DC-P2-RULE-DRIVEN`: pass
- `DC-P4-HYDRATION-SEM`: pass
- `DC-P2-ACTIONABLE-HINT`: pass
- `DC-P2-FAILURE-COVERAGE`: pass

## Final Validation Verdict

- 6/6 FC acceptance criteria: pass
- Critical mismatches: none
- Open critical issues: none
