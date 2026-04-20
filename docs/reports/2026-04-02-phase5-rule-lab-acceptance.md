# Phase 5 Rule Lab Acceptance

- generated_at: 2026-04-02T10:19:24.179Z
- repo_alias: GitNexus
- run_id: a1625eaf903d

## Stage Coverage
- discover: passed (gitnexus rule-lab discover --scope full)
- analyze: passed (gitnexus rule-lab analyze --run-id a1625eaf903d --slice-id slice-dfaf9b4215)
- review-pack: passed (gitnexus rule-lab review-pack --run-id a1625eaf903d --slice-id slice-dfaf9b4215 --max-tokens 6000)
- curate: passed (gitnexus rule-lab curate --run-id a1625eaf903d --slice-id slice-dfaf9b4215 --input-path /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-dfaf9b4215/curation-input.json)
- promote: passed (gitnexus rule-lab promote --run-id a1625eaf903d --slice-id slice-dfaf9b4215)
- regress: passed (gitnexus rule-lab regress --precision 0.93 --coverage 0.85 --run-id a1625eaf903d)

## Metrics
- precision: 0.93
- coverage: 0.85
- probe_pass_rate: 1
- token_budget: 586

## Authenticity Checks
- static_no_hardcoded_reload.pass: true
- static_no_hardcoded_reload.blocked_symbols: none
- dsl_lint_pass: true

## Failure Classifications
- rule_not_matched: confirm trigger_family tokens and rerun discover/analyze/promote | repro: gitnexus rule-lab analyze --run-id a1625eaf903d --slice-id <slice_id>
- rule_matched_but_evidence_missing: add stronger confirmed_chain anchors in curation input and promote again | repro: gitnexus rule-lab curate --run-id a1625eaf903d --slice-id <slice_id> --input-path <curation-input.json>
- precision_below_threshold: trim noisy rules or tighten curation semantics before regress | repro: gitnexus rule-lab regress --precision 0.85 --coverage 0.92 --run-id a1625eaf903d
- coverage_below_threshold: add additional approved rules/slices and rerun regress | repro: gitnexus rule-lab regress --precision 0.95 --coverage 0.70 --run-id a1625eaf903d
- probe_pass_rate_below_threshold: re-run regress with refreshed probes and inspect replay commands | repro: gitnexus rule-lab regress --precision 0.95 --coverage 0.90 --run-id a1625eaf903d
- static_hardcode_detected: remove project-specific reload fallback constants/branches from runtime verifier | repro: rg -n "RESOURCE_ASSET_PATH|GRAPH_ASSET_PATH|RELOAD_GUID|shouldVerifyReloadChain|verifyReloadRuntimeChain" gitnexus/src/mcp/local/runtime-chain-verify.ts
- dsl_lint_failed: fix promoted DSL placeholders and rerun promote/regress | repro: gitnexus rule-lab promote --run-id a1625eaf903d --slice-id <slice_id>

## Artifact Paths
- manifest: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/manifest.json
- candidates: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-dfaf9b4215/candidates.jsonl
- review_cards: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-dfaf9b4215/review-cards.md
- curation_input: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-dfaf9b4215/curation-input.json
- curated: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-dfaf9b4215/curated.json
- catalog: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/catalog.json
- promoted_files: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/approved/demo.startup.v1.yaml
- regress_report: /Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/reports/a1625eaf903d-regress.md
