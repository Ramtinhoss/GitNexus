# Agent-Safe Query/Context Benchmark Realignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore a correct acceptance benchmark for slim `query/context` optimization while preserving `subagent_live` as a diagnostic track and improving slim next-step guidance.

**Architecture:** Split the benchmark into explicit acceptance, control, and diagnostic tracks. Reintroduce deterministic `workflow_replay` for merge-gating, keep `same_script` as the fixed-plan payload control, and downgrade `subagent_live` to evidence-rich diagnostics with normalized scoring. On the product side, revise slim response guidance so agents narrow toward resource/symbol/proof targets before upgrading to full payloads.

**Tech Stack:** TypeScript, Node.js CLI, LocalBackend MCP surface, `node:test`/Vitest, existing benchmark report writer, existing telemetry wrapper.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | added explicit report track keys (`workflow_replay_*`, `same_script_*`, `subagent_live`); `npm --prefix gitnexus exec vitest ...` failed with `No test files found` (vitest include excludes `src/**`); verified with `npm run build` + `node --test dist/benchmark/agent-safe-query-context/io.test.js dist/benchmark/agent-safe-query-context/report.test.js` PASS
Task 2 | completed | added bounded proof-category prompt contract (`pickup/equip bridge proof`, `reload call proof`), removed strongest-relation wording; verified with `npm run build` + `node --test dist/benchmark/agent-safe-query-context/subagent-live.test.js` PASS
Task 3 | completed | restored deterministic `workflow_replay` in `full`/`slim`, added `acceptance.pass` sourced from `workflow_replay_slim`, switched CLI pass/fail to acceptance; verified with `npm run build` + `node --test dist/benchmark/agent-safe-query-context/runner.test.js dist/benchmark/agent-safe-query-context/report.test.js dist/cli/benchmark-agent-safe-query-context.test.js` PASS
Task 4 | completed | added `scoreLiveTuple` normalization + telemetry evidence validation + failure classes (`semantic_drift`, `evidence_missing`, `expression_mismatch`, `over_investigated`); live pass now requires both normalized tuple and evidence validation; verified with `npm run build` + `node --test dist/benchmark/agent-safe-query-context/semantic-tuple.test.js dist/benchmark/agent-safe-query-context/subagent-live.test.js` PASS
Task 5 | completed | reranked slim guidance to narrowing-first (`resource_path_prefix`/symbol targeting) and added `missing_proof_targets` + `suggested_context_targets`; synced tool/skill/AGENTS docs; verified with `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot` PASS
Task 6 | completed | added report-level invariants; full verification/build/benchmark regeneration passed; user verification gate result=`通过`; committed `feat: realign agent-safe benchmark acceptance and slim guidance`

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 `workflow_replay` is restored as the only acceptance track for slim-return optimization | critical | Task 1, Task 3, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim` | report omits `workflow_replay_*` acceptance tracks or still derives acceptance from `subagent_live` |
DC-02 `same_script` remains the fixed-plan payload control with `full` vs `slim` comparison | critical | Task 1, Task 3, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:same_script_full`, `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:same_script_slim` | report has only one `same_script` variant or summary mixes strategy variance into payload control |
DC-03 `subagent_live` is retained only as a diagnostic track with bounded prompt objective and failure taxonomy | critical | Task 2, Task 4, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:subagent_live.weapon_powerup.failure_class` | prompt still asks for arbitrary "strongest relation", or live report lacks failure class |
DC-04 live scoring uses normalized tuple comparison plus telemetry-backed evidence validation | critical | Task 2, Task 4, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:subagent_live.reload.normalized_tuple_pass`, `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:subagent_live.reload.evidence_validation_pass` | live scoring still depends only on raw tool-output string hits or exposes a single undifferentiated boolean |
DC-05 slim `query/context` guidance prioritizes narrowing before `response_profile=full` | critical | Task 5, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot` | `gitnexus/test/unit/__snapshots__/local-backend-agent-safe-query.query.json`, `gitnexus/test/unit/__snapshots__/local-backend-agent-safe-context.context.json` | default `recommended_follow_up` still points to `response_profile=full` when resource/symbol/proof narrowing is available |
DC-06 benchmark output cleanly separates payload effects from strategy effects | critical | Task 3, Task 6 | `node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir .gitnexus/benchmark-agent-safe-query-context` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:token_summary`, `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:call_summary` | summaries compare mismatched tracks or cannot identify which delta is payload-only |

## Authenticity Assertions

- `assert no placeholder path`: reject prompts, tuples, and report artifacts that contain `TODO`, `TBD`, `placeholder`, `<resource>`, or `<symbol>`.
- `assert acceptance is not live-derived`: fail if final pass/fail can become `true` while `workflow_replay_*` artifacts are missing.
- `assert live mode has tool evidence`: fail if `subagent_live` reports any pass-like status without non-empty telemetry rows.
- `assert normalized scoring is evidence-backed`: fail if `normalized_tuple_pass=true` while `evidence_validation_pass=false` is silently treated as case pass.
- `assert slim guidance prefers narrowing`: fail if a response with resource/symbol narrowing hints still recommends `response_profile=full` first.

### Task 1: Re-Split The Benchmark Tracks

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/io.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/io.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Modify: `benchmarks/agent-safe-query-context/neonspark-v1/README.md`

**Step 1: Write the failing test**

Add report-shape assertions that require:

```ts
expect(report).toHaveProperty('workflow_replay_full.weapon_powerup');
expect(report).toHaveProperty('workflow_replay_slim.weapon_powerup');
expect(report).toHaveProperty('same_script_full.reload');
expect(report).toHaveProperty('same_script_slim.reload');
expect(report).toHaveProperty('subagent_live.weapon_powerup');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot`

Expected: FAIL because the current schema and report collapse acceptance/control/diagnostic tracks together.

**Step 3: Write minimal implementation**

Introduce explicit track keys and keep legacy live telemetry loading isolated under `subagent_live`.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/io.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add benchmarks/agent-safe-query-context/neonspark-v1/README.md gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/benchmark/agent-safe-query-context/io.ts gitnexus/src/benchmark/agent-safe-query-context/io.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts
git commit -m "test: split agent-safe benchmark into explicit tracks"
```

### Task 2: Tighten The Live Prompt And Result Contract

**Files:**
- Modify: `benchmarks/agent-safe-query-context/neonspark-v1/cases.json`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts`

**Step 1: Write the failing test**

Add prompt assertions that reject objective text containing `strongest supported relation` and require bounded case-category wording such as `pickup/equip bridge proof` or `reload call proof`.

```ts
assert.equal(prompt.includes('strongest supported relation'), false);
assert.equal(prompt.includes('pickup/equip bridge proof'), true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts --reporter=dot`

Expected: FAIL because the current prompt permits open-ended relation selection.

**Step 3: Write minimal implementation**

Update case metadata to describe hidden proof category and adjust prompt assembly so the agent is bounded to the case goal without seeing canonical edges.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add benchmarks/agent-safe-query-context/neonspark-v1/cases.json gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts
git commit -m "test: bound subagent live prompts to benchmark proof categories"
```

### Task 3: Restore Deterministic Acceptance Replays

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write the failing test**

Add assertions that:

```ts
expect(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass).toBe(true);
expect(report.acceptance.pass).toBe(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass && report.workflow_replay_slim.reload.semantic_tuple_pass);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL because acceptance is currently tied to `same_script` plus `subagent_live`.

**Step 3: Write minimal implementation**

Re-enable `workflow_replay` execution in both `full` and `slim` modes, and compute final benchmark acceptance only from the replay slim track.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "feat: restore workflow replay as acceptance benchmark"
```

### Task 4: Add Normalized Live Scoring And Failure Taxonomy

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`

**Step 1: Write the failing test**

Add tests for:

1. fully-qualified class identity normalizing to the canonical symbol anchor
2. caller/callee object pairs normalizing to canonical proof edges
3. `normalized_tuple_pass=true` with `evidence_validation_pass=false` staying non-passing
4. failure classes surfacing as `semantic_drift`, `evidence_missing`, `expression_mismatch`, or `over_investigated`

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts --reporter=dot`

Expected: FAIL because the current scorer only performs canonical string matching.

**Step 3: Write minimal implementation**

Split live scoring into:

1. normalized tuple derivation from final result + telemetry
2. evidence validation against telemetry rows
3. explicit failure classification

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.ts gitnexus/src/benchmark/agent-safe-query-context/semantic-tuple.test.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.ts gitnexus/src/benchmark/agent-safe-query-context/subagent-live.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts
git commit -m "feat: normalize live scoring and classify benchmark failures"
```

### Task 5: Improve Slim Next-Step Guidance

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Modify: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `AGENTS.md`

**Step 1: Write the failing test**

Add tests that require:

```ts
expect(out.decision.recommended_follow_up).toContain('resource_path_prefix=');
expect(out.decision.recommended_follow_up).not.toContain('response_profile=full');
expect(out).toHaveProperty('missing_proof_targets');
expect(out).toHaveProperty('suggested_context_targets');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: FAIL because slim guidance currently prioritizes full-profile upgrade.

**Step 3: Write minimal implementation**

Re-rank guidance so resource/symbol narrowing wins over full-profile expansion, and add lightweight proof-target hints without reintroducing heavy payloads.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts gitnexus/src/mcp/tools.ts gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md AGENTS.md
git commit -m "feat: prioritize narrow guidance in slim agent-safe responses"
```

### Task 6: Run Full Verification And Regenerate Benchmark Artifacts

**User Verification: required**

**Human Verification Checklist**
- Confirm the report contains `workflow_replay_full`, `workflow_replay_slim`, `same_script_full`, `same_script_slim`, and `subagent_live`.
- Confirm final benchmark acceptance is computed from `workflow_replay_slim`, not from `subagent_live`.
- Confirm `subagent_live` prompt artifacts do not contain the exact canonical proof edges.
- Confirm live cases report both normalized scoring and evidence validation fields plus a failure class when not passing.
- Confirm slim responses now recommend narrowing before `response_profile=full` where narrowing hints exist.

**Acceptance Criteria**
- The report JSON includes all five track sections with non-empty case payloads.
- The top-level acceptance field matches the replay slim case results.
- Prompt artifact grep finds no canonical proof-edge leakage.
- Live report sections include `normalized_tuple_pass`, `evidence_validation_pass`, and `failure_class`.
- Query/context snapshot tests pass with narrowing-first guidance.

**Failure Signals**
- Any track section is missing or empty.
- Acceptance remains tied to `subagent_live` or mixed summaries.
- Prompt artifacts contain canonical `proof_edge` or all canonical `proof_edges`.
- Live scoring still exposes only one pass boolean.
- Guidance tests pass only by reintroducing heavy payload fields.

**User Decision Prompt**
`通过` 或 `不通过`

**Files:**
- Verify: `gitnexus/src/benchmark/agent-safe-query-context/*.ts`
- Verify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Verify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Verify: `.gitnexus/benchmark-agent-safe-query-context/`

**Step 1: Write the failing test**

Add a report-level invariant test that rejects missing track sections, mixed acceptance sources, prompt leakage, and live report rows without scoring taxonomy.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/agent-safe-query-context/*.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: FAIL until the track split, live scoring, and guidance changes are complete.

**Step 3: Write minimal implementation and execute verification**

Run:

```bash
npm --prefix gitnexus exec vitest run \
  gitnexus/src/benchmark/agent-safe-query-context/*.test.ts \
  gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts \
  gitnexus/test/unit/local-backend-agent-safe-query.test.ts \
  gitnexus/test/unit/local-backend-agent-safe-context.test.ts \
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

**Step 4: Run user verification**

Use the checklist above and collect only `通过` or `不通过`.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts .gitnexus/benchmark-agent-safe-query-context
git commit -m "feat: realign agent-safe benchmark acceptance and slim guidance"
```

## Plan Audit Verdict
audit_scope: benchmark track split, live prompt contract, normalized scoring, slim guidance priority
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- P1: writing-plans requires an independent subagent audit, but this session is not authorized for subagent delegation; status: accepted
anti_placeholder_checks:
- revised design and plan paths use concrete filenames and reject placeholder artifacts: pass
- critical clauses include explicit failure signals and evidence fields: pass
authenticity_checks:
- acceptance is explicitly bound to `workflow_replay_slim` rather than live diagnostics: pass
- live scoring requires telemetry-backed evidence validation in addition to normalized tuple comparison: pass
- slim guidance tasks include negative tests preventing full-profile-first recommendations: pass
approval_decision: pass
