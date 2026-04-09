# Subagent-Live Agent-Safe Query Context Benchmark Design

**Date:** 2026-04-08

## Goal

Replace the synthetic `workflow_replay` comparison with a real subagent-driven live benchmark that measures actual investigation-time tool calls and token estimates, while still preserving the fixed-script control track for comparison.

## Problem

The current benchmark compares:

- `same_script`: a fixed scripted control path
- `workflow_replay`: a deterministic state machine that simulates retries

That is useful for regression control, but it does not represent real agent behavior because no LLM decides which tool to call next and no prompt discipline is exercised.

## Constraints

- The benchmark must use a real spawned subagent.
- The prompt must not leak the expected proof edges or full canonical chain.
- The agent should investigate from a normal task framing plus a class/symbol seed and resource seed.
- Tool-call and token accounting must come from externally auditable telemetry, not only from the agent's self-report.
- The existing fixed-script control track should remain as a baseline.

## Chosen Approach

Use a real subagent for each benchmark case, but force all benchmarked GitNexus investigation calls through a telemetry wrapper command.

The wrapper will:

- invoke the existing direct CLI commands (`query`, `context`, `cypher`)
- record each call's input, output, duration, and token estimate
- write machine-readable JSONL/JSON artifacts for later aggregation

The subagent remains responsible for the investigation strategy. The benchmark harness only provides:

- a task prompt
- the allowed command surface
- the completion contract for the final structured result

## Why This Approach

- It preserves real agent decision-making.
- It avoids relying on opaque internal subagent tool logs that the parent session cannot reliably inspect.
- It keeps metric collection deterministic and externally checkable.
- It allows neutral prompts that do not disclose the expected proof edges.

## Alternatives Considered

### 1. Native subagent tool usage only

Rejected because the parent session cannot reliably recover full per-call telemetry from native subagent tool use.

### 2. Parent-agent-controlled model loop

Rejected because it would not be a true subagent investigation.

## Prompt Contract

Each case prompt should provide:

- the benchmark case label
- the repo name
- a symbol/class seed
- a resource seed
- a short investigation objective
- the wrapper command to use
- the final JSON schema to return

It must not provide:

- canonical proof edges
- the expected semantic tuple
- the complete correct chain

## Report Shape

Keep `same_script` as the control track and replace `workflow_replay` with `subagent_live`.

For each case, report:

- telemetry-backed `steps`
- `semantic_tuple`
- `semantic_tuple_pass`
- `tool_calls_to_completion`
- `tokens_to_completion`
- prompt metadata
- final agent summary/result payload

Top-level summaries continue to include:

- `token_summary`
- `call_summary`
- `semantic_equivalence`

where `before = same_script` and `after = subagent_live`.

## Verification

- Unit tests cover telemetry logging, prompt assembly, and report aggregation.
- Live benchmark runs two real subagent cases: `weapon_powerup` and `reload`.
- Canonical semantic tuple comparison still happens outside the prompt, in the parent runner.
- The final report must reject placeholders and require non-empty proof evidence before accepting pass.
