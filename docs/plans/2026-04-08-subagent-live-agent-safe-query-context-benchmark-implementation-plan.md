# Subagent-Live Agent-Safe Query Context Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the synthetic workflow replay benchmark with a real subagent-driven live benchmark that measures actual investigation tool calls and token usage without leaking canonical answers into the prompt.

**Architecture:** Keep the existing `same_script` control track as the deterministic baseline, and add a sibling `subagent_live` execution path that spawns one real subagent per case. The subagent must investigate through a telemetry wrapper command that invokes GitNexus direct CLI tools and records auditable JSONL telemetry, while the parent runner performs semantic tuple comparison against frozen canonical data outside the prompt.

**Tech Stack:** TypeScript, Node.js CLI, Codex subagents, GitNexus direct CLI commands, `node:test`/Vitest.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | in_progress | Revising benchmark architecture from deterministic `workflow_replay` to telemetry-backed `subagent_live`; design approved by user in-session.
Task 2 | pending | Add telemetry wrapper + subagent case prompt contract and replace `workflow_replay` runner with `subagent_live`.
Task 3 | pending | Update report/CLI/tests to surface `subagent_live` metrics and preserve `same_script` comparison.
Task 4 | pending | Run build/tests plus live subagent benchmark for `weapon_powerup` and `reload`, then report real call/token results.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Real subagent execution must replace synthetic retry replay for live measurement | critical | Task 2, Task 3, Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:subagent_live` | report still emits `workflow_replay` as the only live track or no subagent artifact exists |
DC-02 Prompts must not leak canonical proof edges or complete expected chains | critical | Task 2, Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts --reporter=dot` | `benchmarks/agent-safe-query-context/neonspark-v1/cases.json:agent_prompt`, `.gitnexus/benchmark-agent-safe-query-context/subagent-runs/*.json` | prompt text contains canonical `proof_edge`, `proof_edges`, or the exact expected tuple |
DC-03 Live tool metrics must come from auditable telemetry rather than agent self-report | critical | Task 2, Task 3, Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/subagent-runs/*/telemetry.jsonl` | live report has call/token totals without per-step telemetry rows |
DC-04 Semantic tuple evaluation must still compare the subagent-discovered result against the frozen canonical tuple | critical | Task 2, Task 4 | `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:cases.*.semantic_tuple_pass` | benchmark reports pass without canonical tuple comparison |
DC-05 Fixed-script control track must remain available as the before-comparison baseline | critical | Task 3, Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:same_script` | `same_script` missing or no before/after summaries can be computed |

## Authenticity Assertions

- `assert no placeholder path`: fail if prompt, telemetry, or report artifacts contain `TODO`, `TBD`, or `placeholder`.
- `assert live mode has tool evidence`: reject `subagent_live` pass results when telemetry rows are missing.
- `assert prompt does not leak answers`: fail if any prompt contains the canonical `proof_edge` string or all expected `proof_edges`.
- `assert prompt contract is complete`: fail if a generated prompt omits the wrapper command or the required final JSON schema.
- `assert live mode only counts allowlisted wrapper calls`: reject telemetry rows for tools outside `query|context|cypher`.
- `assert telemetry rows are structurally complete`: every telemetry row must include `tool`, `input`, `output`, `durationMs`, and `totalTokensEst`.
- `assert freeze requires non-empty proof`: `semantic_tuple_pass=true` is invalid unless the final agent result contains non-empty proof evidence derived from telemetry-backed investigation.

### Task 1: Freeze The Revised Live-Benchmark Contract

**Files:**
- Modify: `benchmarks/agent-safe-query-context/neonspark-v1/cases.json`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/io.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/io.test.ts`

**Step 1: Write the failing test**

Add assertions that each case exposes neutral agent prompt inputs such as label/objective/symbol seed/resource seed, and that prompt generation includes the wrapper command plus final JSON schema while rejecting canonical proof-edge leakage.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts --reporter=dot`

Expected: FAIL because the current case schema has scripted replay inputs rather than a live prompt contract.

**Step 3: Write the minimal implementation**

Update the suite schema to add neutral live-agent prompt inputs while keeping the canonical tuple only in the benchmark-owned expected data.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add benchmarks/agent-safe-query-context/neonspark-v1/cases.json gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/benchmark/agent-safe-query-context/io.ts gitnexus/src/benchmark/agent-safe-query-context/io.test.ts
git commit -m "test: freeze subagent live benchmark contract"
```

### Task 2: Implement Telemetry Wrapper And Real Subagent Runner

**Files:**
- Create: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.ts`
- Create: `gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.test.ts`

**Step 1: Write the failing test**

Add tests that verify:
- the subagent prompt excludes canonical proof strings
- the subagent prompt includes the wrapper command and final JSON schema
- telemetry rows are written for each wrapper tool call
- telemetry rows reject non-allowlisted tools and missing field values
- the runner returns a structured final result plus telemetry-backed call/token totals

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.test.ts --reporter=dot`

Expected: FAIL because no live runner or telemetry wrapper exists.

**Step 3: Write the minimal implementation**

Spawn one subagent per case, give it the neutral investigation task and wrapper usage instructions, record telemetry through the wrapper command, and compare the returned tuple against the frozen canonical tuple in the parent runner.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.ts gitnexus/src/benchmark/agent-safe-query-context/telemetry-tool.test.ts
git commit -m "feat: add subagent live benchmark runner"
```

### Task 3: Update Report, CLI, And Regression Expectations

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write the failing test**

Add assertions that the report contains `same_script` and `subagent_live`, and that `token_summary` / `call_summary` compare those two tracks.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL because the current report still emits `workflow_replay`.

**Step 3: Write the minimal implementation**

Replace the live-track aggregation from `workflow_replay` to `subagent_live`, preserve `same_script`, and persist subagent telemetry artifacts under the report directory.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "feat: switch benchmark reporting to subagent live runs"
```

### Task 4: Run Local Regressions And Execute The Real Live Benchmark

**User Verification: required**

**Human Verification Checklist**
- Confirm both cases were executed by real spawned subagents.
- Confirm the agent prompts do not reveal the canonical proof edges.
- Confirm telemetry artifacts exist for every reported live call.
- Confirm the final semantic tuple comparison still passes for both cases.
- Confirm the reported call/token deltas now reflect `same_script` vs `subagent_live`.

**Acceptance Criteria**
- Benchmark artifacts include one subagent run directory per case with prompt/result/telemetry files.
- Prompt artifact text does not contain canonical proof edges.
- Each live case has non-empty telemetry rows and derived totals.
- `semantic_tuple_pass` is `true` for both cases.
- `call_summary` and `token_summary` use `same_script.before` and `subagent_live.after`.

**Failure Signals**
- No subagent-run artifact exists or the benchmark only contains synthetic runner output.
- Prompt text leaks exact `proof_edge` or all expected `proof_edges`.
- Telemetry rows are missing while live totals are still reported.
- Either case fails semantic tuple comparison.
- Summary fields still compare against `workflow_replay`.

**User Decision Prompt**
`通过` 或 `不通过`

**Files:**
- Verify: `gitnexus/src/benchmark/agent-safe-query-context/*.ts`
- Verify: `.gitnexus/benchmark-agent-safe-query-context/`

**Step 1: Write the failing test**

Add a report-level invariant test that rejects placeholder prompt/telemetry artifacts and requires `subagent_live` evidence for live runs.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL until report invariants and live artifacts align with the new runner.

**Step 3: Write minimal implementation and execute verification**

Run:

```bash
npm --prefix gitnexus exec vitest run \
  gitnexus/src/benchmark/agent-safe-query-context/*.test.ts \
  gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts \
  --reporter=dot
```

Run:

```bash
npm --prefix gitnexus run build
```

Run:

```bash
node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context \
  benchmarks/agent-safe-query-context/neonspark-v1 \
  --repo neonspark-core \
  --skip-analyze \
  --report-dir .gitnexus/benchmark-agent-safe-query-context
```

**Step 4: Run test to verify it passes**

Run: `jq '.cases.weapon_powerup.semantic_tuple_pass and .cases.reload.semantic_tuple_pass' .gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`

Expected: `true`

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context gitnexus/src/cli/benchmark-agent-safe-query-context.ts
git commit -m "test: run live subagent benchmark for agent-safe query context"
```

## Plan Audit Verdict
audit_scope: revised live-benchmark design; prompt neutrality; telemetry authenticity; semantic tuple closure; same_script comparison integrity
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- prompt/report/telemetry artifacts reject `TODO|TBD|placeholder`: included
- canonical proof edge leakage is checked as a negative assertion: included
authenticity_checks:
- live mode requires telemetry-backed tool evidence: included
- prompt generation requires wrapper-command and final-JSON-schema fields: included
- telemetry rejects non-allowlisted tool rows and incomplete row schema: included
- semantic tuple pass still depends on canonical tuple comparison in parent runner: included
approval_decision: pass
