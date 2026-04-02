# Phase 5 Rule Lab Acceptance

- generated_at: 2026-04-02T06:08:09.228Z
- repo_alias: GitNexus
- run_id: a1625eaf903d

## Stage Coverage
- discover: passed (gitnexus rule-lab discover --scope full)
- analyze: passed (gitnexus rule-lab analyze --run-id a1625eaf903d --slice-id slice-f429348f30)
- review-pack: passed (gitnexus rule-lab review-pack --run-id a1625eaf903d --slice-id slice-f429348f30 --max-tokens 6000)
- curate: passed (gitnexus rule-lab curate --run-id a1625eaf903d --slice-id slice-f429348f30 --input-path /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-f429348f30/curation-input.json)
- promote: passed (gitnexus rule-lab promote --run-id a1625eaf903d --slice-id slice-f429348f30)
- regress: passed (gitnexus rule-lab regress --precision 0.93 --coverage 0.85 --run-id a1625eaf903d)

## Metrics
- precision: 0.93
- coverage: 0.85
- token_budget: 60

## Failure Classifications
- rule_not_matched: confirm trigger_family tokens and rerun discover/analyze/promote | repro: gitnexus rule-lab analyze --run-id a1625eaf903d --slice-id <slice_id>
- rule_matched_but_evidence_missing: add stronger confirmed_chain anchors in curation input and promote again | repro: gitnexus rule-lab curate --run-id a1625eaf903d --slice-id <slice_id> --input-path <curation-input.json>
- precision_below_threshold: trim noisy rules or tighten curation semantics before regress | repro: gitnexus rule-lab regress --precision 0.85 --coverage 0.92 --run-id a1625eaf903d
- coverage_below_threshold: add additional approved rules/slices and rerun regress | repro: gitnexus rule-lab regress --precision 0.95 --coverage 0.70 --run-id a1625eaf903d

## Artifact Paths
- manifest: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/manifest.json
- candidates: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-f429348f30/candidates.jsonl
- review_cards: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-f429348f30/review-cards.md
- curation_input: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-f429348f30/curation-input.json
- curated: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/lab/runs/a1625eaf903d/slices/slice-f429348f30/curated.json
- catalog: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/catalog.json
- promoted_files: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/approved/demo.startup.v1.yaml
- regress_report: /Users/nantasmac/projects/agentic/GitNexus/.gitnexus/rules/reports/a1625eaf903d-regress.md

## Final Verification Gate
- gate_result: pass
- gate_check: `runPhase5RuleLabGate(reportPath)` returns `{ pass: true }` for this report and `{ pass: false, reason: "acceptance_report_missing" }` for missing report path.

## Release Notes
- Added offline Rule Lab pipeline stages (`discover/analyze/review-pack/curate/promote/regress`) with deterministic artifacts under `.gitnexus/rules/lab/runs/**`.
- Added CLI command group `gitnexus rule-lab ...` and MCP tools `rule_lab_*` for agent-side execution.
- Added runtime verifier loadability coverage for promoted rules (`demo.startup.v1`) and Phase 5 acceptance evidence artifacts.
