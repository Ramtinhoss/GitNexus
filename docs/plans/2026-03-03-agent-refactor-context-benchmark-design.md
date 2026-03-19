# Agent Refactor Context Benchmark Design

Date: 2026-03-03
Status: validated design
Scope: Add a new benchmark suite focused on coding-agent refactor context quality and collection efficiency, while keeping existing Unity baseline benchmark as the stable foundation.

## 1. Context and Confirmed Decisions

Current benchmark (`benchmark-unity`) is calibrated for symbol/relation/task correctness and remains the foundation regression suite.
The next phase must evaluate practical agent value during refactor preparation, especially context sufficiency and collection efficiency.

Confirmed with user:

1. Keep existing passed benchmarks as baseline regression gates.
2. Add a new benchmark suite for agent refactor context collection.
3. Allow `query`, `context`, `impact`, and `cypher` in the new suite.
4. Use scenario-based evaluation.
5. V1 scope uses 3 scenarios:
   - `MinionsManager`
   - `MainUIManager`
   - `MirrorNetMgr`

## 2. Design Goals and Non-Goals

Goals:

1. Evaluate whether agents can collect minimum critical context needed before refactoring a class.
2. Measure collection efficiency under realistic tool-call budgets.
3. Produce explainable scenario-level reports (what passed, what failed, why).
4. Keep architecture isolated from existing `benchmark-unity`.

Non-goals (v1):

1. Replacing existing baseline benchmark.
2. Building an autonomous planner agent in benchmark runtime.
3. Modeling full refactor code generation quality.
4. Building dynamic threshold auto-tuning.

## 3. Core Evaluation Model

Each scenario is scored by six checks:

1. `T` Target Disambiguation
2. `U` Upstream Caller Coverage
3. `D` Downstream Dependency Coverage
4. `B` Blast Radius Coverage
5. `I` Internal Refactor Surface Coverage
6. `E` Collection Efficiency

Single scenario score:

- `coverage = passed_checks / total_checks`

Suite score:

- Average coverage across all scenarios.
- Average tool-call count across scenarios.

Hard rules:

1. `T` is mandatory (fail if missing).
2. Existing `benchmark-unity` remains unchanged and continues as foundation gate.

## 4. Scenario Definitions (V1)

### 4.1 MinionsManager

- target UID: `Class:Assets/NEON/Code/Game/AllMinionManager/MinionsManager.cs:MinionsManager`
- minimum checks:
  - `U`: incoming callers >= 10
  - `D`: outgoing dependencies >= 10
  - `B`: upstream impacted count >= 20
  - `I`: internal surface hit >= 2 (`AddMinion`, `RemoveMinion`, `SetPlayer` style anchors)
  - `E`: tool calls <= 4

### 4.2 MainUIManager

- focus: UI routing/state transition manager refactor context
- minimum checks:
  - `U`: incoming callers >= 8
  - `D`: outgoing dependencies >= 8
  - `B`: impact spans >= 2 UI-related modules
  - `I`: internal surface hit >= 2 route/show/hide/refresh style methods
  - `E`: tool calls <= 4

### 4.3 MirrorNetMgr

- focus: network/sync orchestration refactor context
- minimum checks:
  - `U`: incoming callers >= 6
  - `D`: outgoing dependencies >= 6
  - `B`: impacted count >= 10 and cross-module spread >= 2 categories
  - `I`: internal surface hit >= 2 sync/rpc/state methods
  - `E`: tool calls <= 4

## 5. Gate Thresholds (V1)

1. per-scenario coverage >= `0.83` (at least 5/6 checks)
2. suite average coverage >= `0.90`
3. suite average calls <= `4`
4. `T` mandatory pass for every scenario

## 6. Architecture and Isolation Strategy

Use parallel suite architecture:

1. Keep `benchmark-unity` unchanged.
2. Add a new command: `benchmark-agent-context`.
3. Add new dataset root: `benchmarks/agent-context/neonspark-refactor-v1/`.
4. Add independent report dir (e.g. `.gitnexus/benchmark-agent-context/`).

No schema changes to existing `benchmark-unity` dataset files.

## 7. Data Contract (New Suite)

### 7.1 Files

1. `thresholds.json` (suite-level thresholds)
2. `scenarios.jsonl` (one scenario per line)

### 7.2 Scenario row fields

1. `scenario_id`
2. `target_uid`
3. `tool_plan` (ordered steps using `query/context/impact/cypher`)
4. `checks` (definitions for T/U/D/B/I/E)

## 8. Runtime Behavior

For each scenario:

1. Execute tool plan in order.
2. Cache each step output.
3. Evaluate checks over cached outputs.
4. Build scenario verdict and failure reasons.

Aggregate:

1. suite coverage
2. efficiency metrics
3. required-check pass rate

## 9. Reporting

JSON report must include:

1. per-scenario step inputs
2. per-scenario check results
3. scenario coverage and calls used
4. suite aggregate metrics
5. gate pass/fail reasons

Markdown report must include:

1. scenario scoreboard
2. top failure classes
3. recommended triage order

## 10. Rollout Plan

1. Land dataset schema and runner with non-gating runs first.
2. Capture baseline results for 3 scenarios.
3. Tune thresholds once using observed distributions.
4. Add nightly execution.
5. Keep foundation benchmark gate unchanged.

## 11. Acceptance Criteria

Design is complete when:

1. Parallel-suite approach is explicit and accepted.
2. Scenario model and checks are fixed.
3. V1 symbols/scenarios are fixed.
4. Threshold policy is fixed.
5. Rollout path preserves existing baseline gate.
