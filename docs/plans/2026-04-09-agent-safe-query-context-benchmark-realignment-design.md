# Agent-Safe Query/Context Benchmark Realignment Design

Date: 2026-04-09
Owner: GitNexus
Status: Approved for planning

## 1. Goal

Realign the agent-safe `query/context` benchmark so it measures the intended optimization target:

1. whether slim default returns improve deterministic convergence efficiency
2. whether slim default returns reduce payload/token cost
3. whether real agent investigation remains usable under the slimmer contract

These three questions must be measured separately. They must not be collapsed into one before/after number.

## 2. Problem Diagnosis

The current merged benchmark state preserved useful evidence, but it no longer answers the original design question.

### 2.1 Acceptance metric drift

The approved design defines deterministic `workflow_replay` as the primary evaluation mode and `same_script` as a secondary fixed-plan payload control.

Current implementation instead compares:

- `same_script` as `before`
- `subagent_live` as `after`

This turns the benchmark from a convergence test into a strategy-comparison test.

### 2.2 Prompt objective drift

The live prompt asks the agent to determine the "strongest supported relation" from the seeds.

That prompt is neutral with respect to hidden answers, but it is not neutral with respect to the benchmark objective. It allows the agent to produce a valid relation that is different from the canonical benchmark tuple.

### 2.3 Scoring rigidity mismatch

The current live scorer derives the measured semantic tuple from telemetry tool outputs via string/edge matching rather than from the agent's final structured result plus proof validation.

This creates false failures in two directions:

1. an agent may discover equivalent evidence but express it with a different symbol identity or proof wording
2. an agent may return a structured result that should be judged against validated evidence, but the scorer instead only checks whether canonical strings appeared somewhere in tool output

### 2.4 Product-signal ambiguity

The current report cannot separate:

1. strategy cost from free-form agent exploration
2. payload cost from `slim` vs `full`
3. guidance quality from raw retrieval quality

Because of that, negative live deltas cannot be attributed cleanly to the slim response contract.

## 3. Non-Goals

This realignment does not include:

1. changing Unity runtime verifier semantics
2. rewriting retrieval ranking end-to-end
3. hardcoding benchmark-case-specific retrieval behavior
4. removing `subagent_live` telemetry support

## 4. Root Cause Summary

The benchmark deviation is caused by three stacked issues:

1. metric mismatch: deterministic convergence and free-form investigation were treated as the same metric
2. objective mismatch: the live prompt targeted "best supported relation" instead of "recover the intended benchmark proof target from seeds"
3. score mismatch: exact canonical tuple recovery was judged from tool-output string presence rather than evidence-backed semantic normalization

The current failure report should therefore be treated as a diagnostic signal, not as the acceptance result for the slim return optimization.

## 5. Benchmark Model After Realignment

### 5.1 Track A: Acceptance track (`workflow_replay`)

This remains the only merge-gating acceptance metric for the agent-safe return optimization.

Purpose:

1. measure convergence efficiency under a deterministic replay state machine
2. detect whether slim returns reduce re-query / re-context / re-cypher detours
3. preserve canonical semantic tuple equality

Comparison:

- `before = workflow_replay_full`
- `after = workflow_replay_slim`

### 5.2 Track B: Payload control (`same_script`)

This remains a fixed-plan control track.

Purpose:

1. hold tool sequence constant
2. measure token and payload savings without strategy variance
3. confirm semantic tuple equivalence under a fully controlled path

Comparison:

- `before = same_script_full`
- `after = same_script_slim`

### 5.3 Track C: Diagnostic live track (`subagent_live`)

This remains in the benchmark suite, but only as a diagnostic track.

Purpose:

1. measure real agent usability under the slim contract
2. surface prompt drift, ambiguity, and guidance gaps
3. preserve auditable telemetry artifacts

This track must not decide merge acceptance for slim-return optimization by itself.

## 6. Live Prompt Realignment

The live prompt must continue to avoid leaking the canonical tuple, but it must be tightened enough to reduce objective drift.

### 6.1 Required prompt shape

Each case prompt must provide:

1. benchmark case label
2. repo name
3. resource seed
4. symbol/class seed
5. a bounded investigation objective
6. required wrapper command
7. required final JSON schema

### 6.2 Required live objective language

The objective must ask the agent to:

1. start from the provided seeds
2. identify the primary symbol anchor most directly supported by the seeded resource neighborhood
3. collect the minimum structural proof needed for the benchmark case category
4. stop once that minimum proof is satisfied or clearly unavailable

The objective must not ask for:

1. the "best" or "strongest" arbitrary relation
2. an open-ended summary of everything related to the seed
3. proof closure beyond the benchmark case contract

### 6.3 Allowed hidden contract

The harness may keep the exact canonical proof edge(s) hidden from the prompt, but it must constrain the proof category:

1. WeaponPowerUp case: pickup/equip bridge proof category
2. Reload case: intra-reload call proof category

## 7. Semantic Scoring Realignment

### 7.1 Acceptance scoring

Acceptance tracks (`workflow_replay`, `same_script`) continue to require canonical semantic tuple equality.

### 7.2 Live-track scoring

`subagent_live` must use two layers of judgment:

1. `normalized_tuple_pass`
   The agent result matches the canonical case after canonicalization of symbol identity and proof-edge representation.
2. `evidence_validation_pass`
   Telemetry-backed proof evidence actually supports the returned normalized tuple.

Both results must be reported. Neither should silently overwrite the other.

### 7.3 Canonicalization rules

At minimum, live scoring must normalize:

1. class symbol names vs fully-qualified class identities
2. method symbols vs method-owner pairs
3. proof edge wording vs structured caller/callee pairs
4. resource anchor aliases that refer to the exact seeded path

### 7.4 Failure taxonomy

Live-track failures must be classified into one of:

1. `semantic_drift`
2. `evidence_missing`
3. `expression_mismatch`
4. `over_investigated`

This taxonomy is required so the report distinguishes retrieval problems from prompt/scoring problems.

## 8. Slim Return Optimization Direction

The next optimization round should focus less on field removal and more on next-step guidance quality.

### 8.1 Current guidance issue

Current slim responses expose `upgrade_hints`, but default follow-up guidance is biased toward `response_profile=full`.

That encourages payload expansion before search-space narrowing.

### 8.2 Required guidance priority

For slim `query/context`, the default recommended next step should prefer:

1. resource narrowing
2. symbol narrowing
3. case-relevant proof target hints
4. explicit `response_profile=full` only when narrow guidance is insufficient

### 8.3 New slim guidance fields

The next revision should add lightweight decision support such as:

1. `primary_anchor`
2. `missing_proof_targets`
3. `suggested_context_targets`
4. `suggested_cypher_goal`

These fields must remain slim and deterministic.

## 9. Required Benchmark Matrix

The next benchmark run must report four controlled comparisons:

1. `workflow_replay_full`
2. `workflow_replay_slim`
3. `same_script_full`
4. `same_script_slim`

And one diagnostic track:

5. `subagent_live_slim`

Optional:

6. `subagent_live_full`

If `subagent_live_full` is included, it must be reported only as a diagnostic contrast, not as acceptance.

## 10. Acceptance Criteria

The optimization round is considered successful only if all of the following are true:

1. `workflow_replay_slim` preserves canonical semantic tuple equality for both fixed cases
2. `workflow_replay_slim` does not regress tool calls against `workflow_replay_full`
3. `same_script_slim` preserves canonical semantic tuple equality for both fixed cases
4. `same_script_slim` reduces token cost against `same_script_full`
5. `subagent_live_slim` report includes failure taxonomy and auditable telemetry
6. any live failure can be attributed to a classified cause rather than reported as an undifferentiated semantic miss

## 11. Deliverables

The follow-up implementation must produce:

1. a revised benchmark report schema with explicit track separation
2. revised live prompts with bounded objective language
3. normalized live scoring with evidence validation
4. updated slim guidance fields and tests
5. updated docs describing acceptance vs diagnostic tracks
