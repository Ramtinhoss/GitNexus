# Unity Benchmark Usage and Failure Playbook

## Commands

Quick profile:

```bash
cd gitnexus
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile quick --target-path ../benchmarks/fixtures/unity-mini
```

Full profile:

```bash
cd gitnexus
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile full --target-path ../benchmarks/fixtures/unity-mini
```

NPM script shortcuts:

```bash
cd gitnexus
npm run benchmark:quick
npm run benchmark:full
```

## Thresholds (Hard Gate)

| Metric | Threshold | Gate Key |
|---|---|---|
| Query precision | >= 0.90 | `query.precision` |
| Query recall | >= 0.85 | `query.recall` |
| Context + impact F1 | >= 0.80 | `contextImpact.f1` |
| Smoke pass rate | = 1.00 | `smoke.passRate` |
| Analyze time regression | <= +15% | `performance.analyzeTimeRegression` |

Any failed threshold causes non-zero exit status.

## Output Files

- JSON report: `gitnexus/.gitnexus/benchmark/benchmark-report.json`
- Markdown summary: `gitnexus/.gitnexus/benchmark/benchmark-summary.md`

## Failure Triage

The benchmark writes failure classes and an aggregated failure triage section.
Use this mapping to drive fixes:

| Failure class | Typical cause | Next action |
|---|---|---|
| `ambiguous-name-wrong-hit` | Symbol disambiguation picked wrong candidate | tighten ranking and disambiguation rules for same-name symbols |
| `context-empty-refs` | `context` response has no useful refs for target | add class/interface fallback using file-scoped refs and process backfill |
| `impact-downstream-zero` | `impact` traversal returned zero downstream/upstream symbols | review minConfidence defaults and seed expansion rules for class/interface targets |

## CI Integration

- PR gate: `.github/workflows/ci.yml` runs `npm run benchmark:quick`
- Nightly: `.github/workflows/unity-benchmark-nightly.yml` runs `npm run benchmark:full`
