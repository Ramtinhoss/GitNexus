# NeonSpark v1 Single-Repo Benchmark Design

Date: 2026-03-02
Status: validated design
Scope: Execute P0-T2 for real-repo Unity baseline using a single fixed subset repo and generate the first full benchmark report.

## 1. Context and Decision

Current benchmark infra is complete for `unity-mini`, but real-repo baseline closure is blocked.
This design targets NeonSpark and explicitly keeps the fixed subset as **one indexed repo**.

Confirmed constraints:

1. Scope source paths: `Assets/NEON/Code` + `Packages`.
2. Packages inclusion policy: only `com.veewo.*` and `com.neonspark.*`.
3. Stage target: first run uses 20 symbols (14 business-chain + 6 infrastructure).
4. First full report may fail thresholds but must be reproducible and archived.

## 2. Architecture: Single-Repo Fixed Subset

### 2.1 Fixture root

Create and maintain one fixture root:

`benchmarks/fixtures/neonspark-v1-subset/`

### 2.2 Sync source policy

Sync from upstream NeonSpark repo (`/Volumes/Shuttle/unity-projects/neonspark`) with preserved relative paths:

1. `Assets/NEON/Code/**`
2. `Packages/com.veewo.*/**`
3. `Packages/com.neonspark.*/**`

Rules:

1. Include only `.cs` files.
2. Exclude generated/cache artifacts.
3. Use a deterministic manifest-driven sync.

### 2.3 Repo identity

All analysis for this phase runs against the single fixture root path.
That yields one indexed repo identity (e.g. `neonspark-v1-subset`) for all benchmark tasks.

## 3. Dataset Contracts and Data Flow

### 3.1 Dataset root

`benchmarks/unity-baseline/neonspark-v1/`

Required files:

1. `thresholds.json`
2. `symbols.jsonl`
3. `relations.jsonl`
4. `tasks.jsonl`

Operational files:

1. `sync-manifest.txt`
2. `symbols.candidates.jsonl`
3. `symbols.selected.txt`

### 3.2 Flow

Stage A: Sync fixture

1. Build fixture from `sync-manifest.txt` into `benchmarks/fixtures/neonspark-v1-subset/`.
2. Emit file count/log summary.

Stage B: Analyze fixture

1. Run analyze with extension filter `.cs`.
2. Confirm single repo identity is indexed.

Stage C: Candidate extraction

1. Export candidates into `symbols.candidates.jsonl`.
2. Include UID, file path, symbol name/type, line range.

Stage D: Human selection

1. Select 20 UIDs into `symbols.selected.txt`.
2. Keep ratio: 14 business-chain + 6 infrastructure.

Stage E: Dataset generation

1. Generate `symbols.jsonl` from selected UIDs.
2. Build minimum viable `relations.jsonl` and `tasks.jsonl` to support full profile execution.

Stage F: First full benchmark

1. Run `benchmark-unity --profile full` with target path pointing to the single fixture root.
2. Produce JSON + Markdown report.
3. Archive run artifacts under docs.

## 4. Guardrails and Error Handling

Pre-run fail-fast checks:

1. Fixture path exists and has `.cs` files.
2. Candidate pool size >= 30.
3. `symbols.selected.txt` has exactly 20 entries.
4. Every selected UID resolves in current index.
5. Dataset schema validation passes.

Failure classes to triage in first report:

1. `ambiguous-name-wrong-hit`
2. `context-empty-refs`
3. `impact-downstream-zero`
4. `insufficient-result-count`
5. `tool-error` / `tool-execution-error`

## 5. Acceptance Criteria for P0-T2

P0-T2 is complete when:

1. `benchmark-unity --profile full` runs on `neonspark-v1` against `neonspark-v1-subset`.
2. Report artifacts are generated (JSON + Markdown).
3. Artifacts and run context are archived in docs with date/path details.
4. First-run threshold failure is allowed and documented; no threshold tuning is done in this step.

## 6. Non-Goals (This Iteration)

1. Automatic threshold tuning.
2. Expansion to 50-symbol stage.
3. Multi-root indexing architecture changes.
4. Module-definition architecture work.

