# Unity Accuracy Baseline and Regression Framework Design

Date: 2026-02-28
Status: validated design
Scope: GitNexus Unity/C# indexing accuracy baseline and regression gates

## 1. Context

Recent work improved Unity accuracy in core query surfaces:

- `c6ef509`: symbol-level FTS preference, ambiguity handling, `target_uid/file_path` support, line number fix, context/impact fallback improvements.
- `ad01504`: `analyze --extensions` support and Unity-oriented indexing noise reduction.
- Real-project retests were already run on multiple Unity subtrees (`Code`, `Game`, `Actors`).

Current gap is not feature capability. The gap is a stable, repeatable quality gate for:

- correctness of retrieval and graph relations
- user-facing task reliability
- performance regression detection

## 2. Goals and Non-Goals

Goals:

1. Define a repeatable Unity baseline dataset with human-labeled ground truth.
2. Enforce strict hard-threshold gates for accuracy and performance.
3. Provide fast diagnosis when regressions happen.
4. Support both local and CI execution with consistent outputs.

Non-goals (v1):

1. Full automation of dataset labeling from external tools (Roslyn/LSP).
2. Broad language coverage beyond Unity/C#.
3. Complex dashboards; JSON + Markdown reports are sufficient.

## 3. Chosen Strategy

Chosen approach: mixed gate (`C`) with strict hard thresholds (`1`).

Three channels run in one benchmark pipeline:

1. Golden assertions (primary correctness gate).
2. E2E task smoke cases (usability gate).
3. Performance guard (runtime and graph-size stability gate).

Any single channel failing its threshold fails the full benchmark run.

## 4. Dataset Design

Base folder:

- `benchmarks/unity-baseline/v1/`

Files:

1. `symbols.jsonl`
- Human-labeled target symbols.
- Required fields:
  - `symbol_uid`
  - `file_path`
  - `symbol_name`
  - `symbol_type`
  - `start_line`
  - `end_line`

2. `relations.jsonl`
- Ground-truth graph assertions.
- Required fields:
  - `src_uid`
  - `edge_type`
  - `dst_uid`
  - `must_exist` (boolean)
  - `note` (optional)

3. `tasks.jsonl`
- E2E smoke scenarios over `query/context/impact`.
- Required fields:
  - `tool` (`query|context|impact`)
  - `input` (tool args)
  - `must_hit_uids` (list)
  - `must_not_hit_uids` (list)
  - `min_result_count` (optional)

4. `thresholds.json`
- Single source of truth for gates.

Initial scale:

- 30-50 symbols
- 100-150 relation assertions
- 10-15 smoke tasks

## 5. Gate Thresholds (Strict Profile)

Hard thresholds:

1. `query`:
- precision `>= 0.90`
- recall `>= 0.85`

2. `context + impact` (combined):
- F1 `>= 0.80`

3. smoke:
- pass rate `== 100%`

4. performance:
- `analyze` wall-clock time regression `<= +15%` vs baseline
- graph-size sanity checks (node/edge count drift) must be within configured bounds

Notes:

- Thresholds are hard-fail from v1.
- No warning-only mode in this design.

## 6. Runner Architecture

Single entrypoint command (example):

```bash
node dist/cli/index.js benchmark-unity --profile quick
```

Pipeline stages:

1. Build index:
- run `analyze --force --extensions .cs <dataset_root>`
- collect time, node count, edge count

2. Golden evaluation:
- run symbol and relation checks
- compute precision, recall, F1

3. Smoke evaluation:
- execute task scenarios
- validate required hits and forbidden hits

4. Gate and report:
- compare metrics with `thresholds.json`
- write reports:
  - `benchmark-report.json`
  - `benchmark-summary.md`

## 7. Execution Modes

Two profiles:

1. `quick` (PR gate):
- small subset (for fast feedback)
- target: catch obvious regressions

2. `full` (pre-merge/nightly):
- full dataset
- target: release-level confidence

Both profiles must use identical metric logic and output schema.

## 8. Failure Diagnosis Flow

When a run fails:

1. Identify failing channel (`golden`, `smoke`, `perf`).
2. Print top failure classes:
- ambiguous-name wrong hit
- missing incoming/outgoing relations
- downstream impact unexpectedly zero
- performance threshold breach
3. Export sample failures with enough context:
- query/tool input
- expected uid(s)
- actual uid(s)
- source file path

This avoids full-log manual investigation for common failure modes.

## 9. Rollout Plan (Incremental)

Week 1 target:

1. Create dataset folder and schemas.
2. Label first `v1` set (30 symbols, 100 relations, 10 tasks).
3. Implement local runner with report output.
4. Validate one full run against current branch and freeze baseline report.

Week 2 target:

1. Add CI `quick` gate for PR.
2. Add `full` nightly job.
3. Tune only dataset coverage, not threshold strictness.

## 10. Risks and Mitigations

1. Risk: high labeling cost.
- Mitigation: small but high-signal sample first, expand gradually.

2. Risk: flaky perf gate due to machine variance.
- Mitigation: fix benchmark environment and use the same dataset path and index settings.

3. Risk: overfitting to smoke scripts.
- Mitigation: keep golden assertions as primary gate and rotate smoke tasks by incident history.

## 11. Acceptance Criteria for This Design

Design is considered complete when:

1. team agrees on schema and strict thresholds
2. runner output contract (`json + md`) is fixed
3. quick/full profiles and failure triage format are agreed
4. implementation can start without additional architecture decisions

