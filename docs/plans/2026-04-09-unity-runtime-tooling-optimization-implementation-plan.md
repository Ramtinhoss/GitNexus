# Unity Runtime Tooling Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Unity runtime tooling trust defects, make seeded narrowing the default operational path, and align agent-facing guidance with the graph-only runtime closure contract.

**Architecture:** Keep the current V2 architecture intact. The implementation only sharpens contract correctness and response shaping: fix verifier follow-up command generation, re-rank slim summaries away from low-confidence heuristic clues, align Rule Lab schema with executable binding support, and synchronize MCP/skill/docs/benchmarks with the seed-first workflow. No new runtime tool is introduced and no query-time rule matching is added back.

**Tech Stack:** TypeScript, Vitest, JSON Schema, GitNexus MCP local backend, agent-safe benchmark, Markdown skill/docs content.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added anchor-priority tests; updated verifier subject selection to `seedPath > symbolName > queryText > unity-runtime-chain`; query/context callsites now pass stronger anchors; targeted test run passed (`npx vitest run --config vitest.runtime-chain-verify.config.ts -t "follow-up command|resource seed path" --reporter=dot`).
Task 2 | completed | Added `test/unit/rule-dsl-schema.test.ts` with enum + valid/invalid per-kind checks; updated schema enum + conditional required fields for `method_triggers_scene_load`/`method_triggers_method`; verification passed (`npm --prefix gitnexus exec vitest run test/unit/runtime-claim-rule-registry.test.ts test/unit/rule-dsl-schema.test.ts --reporter=dot`).
Task 3 | completed | Added failing first-screen ranking assertions in query/context tests; implemented ranked process hint scoring + `chooseTopSummary` + context `summary`; verification passed (`npm --prefix gitnexus exec vitest run test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`).
Task 4 | completed | Added contract wording assertions in benchmark CLI test; synchronized MCP/tooling/skills/shared contract/AGENTS wording around `discovery -> seed narrowing -> closure verification`, clue-tier `resource_heuristic`, and coexistence semantics; verification passed (`npx tsx --test src/cli/benchmark-agent-safe-query-context.test.ts`).
Task 5 | completed | Added drift metrics `placeholder_leak_detected` and `heuristic_top_summary_detected` in runner/report/CLI output; extended runner/report/CLI tests for leakage + semantic-pass-but-quality-fail cases; verification passed (`npx tsx --test src/benchmark/agent-safe-query-context/runner.test.ts src/benchmark/agent-safe-query-context/report.test.ts src/cli/benchmark-agent-safe-query-context.test.ts`).
Task 6 | completed | Verification/build/benchmark refresh done: unit + benchmark-node tests passed, build passed, benchmark CLI passed with `placeholder_leak_detected=false` and `heuristic_top_summary_detected=false` for both cases; refreshed artifacts committed under `.gitnexus/benchmark-agent-safe-query-context/*`.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Placeholder-free verifier follow-up commands | critical | Task 1 | `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts --reporter=dot` | `src/mcp/local/runtime-chain-verify.test.ts` | any assertion still allows unrelated fallback text like `Reload NEON.Game.Graph.Nodes.Reloads`
DC-02 Rule Lab schema matches executable binding kinds | critical | Task 2 | `npm --prefix gitnexus exec vitest run test/unit/runtime-claim-rule-registry.test.ts test/unit/rule-dsl-schema.test.ts --reporter=dot` | `test/unit/rule-dsl-schema.test.ts` | schema still rejects `method_triggers_scene_load` or `method_triggers_method`, or accepts invalid per-kind samples that should fail
DC-03 Slim first-screen summary does not foreground low-confidence heuristic clue over stronger lead | critical | Task 3 | `npm --prefix gitnexus exec vitest run test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts --reporter=dot` | `test/unit/local-backend-agent-safe-query.test.ts` | `summary` or top decision still points at low-confidence heuristic clue when stronger graph-backed lead exists
DC-04 Narrowing outranks expansion when seed/uid anchors exist | critical | Task 3, Task 4 | `npm --prefix gitnexus exec vitest run test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot` | `test/unit/local-backend-agent-safe-query.test.ts`, `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json:workflow_replay_slim.*.recommended_follow_up_hit` | `recommended_follow_up` falls back to `response_profile=full` or misses seeded narrowing in anchored cases
DC-05 Agent guidance distinguishes graph facts, closure state, and heuristic clues | critical | Task 4 | `npm --prefix gitnexus exec vitest run src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot` | `gitnexus/src/mcp/tools.ts`, `gitnexus/skills/_shared/unity-runtime-process-contract.md`, `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` | docs/skills still describe first `query` as closure proof or do not classify `resource_heuristic` as clue-tier
DC-06 Benchmarks catch placeholder leakage and first-screen heuristic noise | critical | Task 5 | `npm --prefix gitnexus exec vitest run src/benchmark/agent-safe-query-context/runner.test.ts src/benchmark/agent-safe-query-context/report.test.ts src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot` | `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json` | benchmark does not expose placeholder leakage or cannot detect top-summary heuristic drift

## Authenticity Assertions

- Assert no placeholder path or unrelated default verifier query is emitted in `runtime_claim.next_action` or `gaps[].next_command`.
- Assert Rule Lab schema accepts every executable `resource_bindings.kind` supported by `UnityResourceBinding` and `applyUnityRuntimeBindingRules`.
- Assert slim query top summary is anchored to a stronger graph-backed lead when one exists; do not accept field-presence-only checks.
- Assert benchmark output records whether narrowing hits the intended anchor and whether placeholder leakage occurred; do not accept a single undifferentiated `pass` boolean.

### Task 1: Fix Verifier Follow-Up Command Generation

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`

**Step 1: Write the failing tests**

Add focused tests in `gitnexus/src/mcp/local/runtime-chain-verify.test.ts` for:

```ts
expect(out.next_action).toContain('InitGlobal');
expect(out.next_action).not.toContain('Reload NEON.Game.Graph.Nodes.Reloads');
expect(out.gaps?.every((gap) => !gap.next_command.includes('Reload NEON.Game.Graph.Nodes.Reloads'))).toBe(true);
```

Cover:

- `context(uid=Method:...:InitGlobal)` style input where `queryText` is missing or unhelpful;
- seed-aware input where `resourceSeedPath` should appear in the follow-up command;
- negative case asserting unrelated default placeholder text never leaks.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts --reporter=dot`

Expected: FAIL on assertions showing placeholder fallback or non-anchor-aware follow-up generation.

**Step 3: Write minimal implementation**

Change command construction so it derives the follow-up subject from the best available anchor:

```ts
const subject = seedPath ?? symbolName ?? queryText ?? 'unity-runtime-chain';
```

Then ensure `local-backend.ts` passes the strongest available subject into verifier/gap generation for both `query()` and `context()`.

Implementation constraints:

- prefer `resourceSeedPath` over plain query text when present;
- prefer exact symbol anchor over generic fallback text;
- preserve existing parity + `runtime-chain-verify on-demand` flags;
- never emit the stale reload placeholder unless the active case really is that reload query.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts --reporter=dot`

Expected: PASS with no placeholder leakage and anchor-aware commands.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts
git commit -m "fix: anchor runtime verifier follow-up commands"
```

### Task 2: Align Rule Lab Schema With Executable Binding Support

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/schema/rule-dsl.schema.json`
- Create: `gitnexus/test/unit/rule-dsl-schema.test.ts`
- Test: `gitnexus/test/unit/runtime-claim-rule-registry.test.ts`
- Verify: `gitnexus/src/rule-lab/types.ts`
- Verify: `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`

**Step 1: Write the failing tests**

Create `gitnexus/test/unit/rule-dsl-schema.test.ts` that loads the schema JSON and asserts:

```ts
expect(enumValues).toEqual([
  'asset_ref_loads_components',
  'method_triggers_field_load',
  'method_triggers_scene_load',
  'method_triggers_method',
]);
```

Add shape-level assertions for the added kinds:

```ts
expect(kindProps).toContain('scene_name');
expect(kindProps).toContain('source_class_pattern');
expect(kindProps).toContain('source_method');
expect(kindProps).toContain('target_class_pattern');
expect(kindProps).toContain('target_method');
```

Also add schema sample validation helpers that assert:

```ts
expect(validate(validMethodTriggersSceneLoadRule)).toBe(true);
expect(validate(validMethodTriggersMethodRule)).toBe(true);
expect(validate(invalidMethodTriggersSceneLoadRuleMissingSceneName)).toBe(false);
expect(validate(invalidMethodTriggersMethodRuleMissingTargetMethod)).toBe(false);
```

If no JSON Schema validator is already present in test utilities, add the smallest local test helper needed to validate the schema with explicit valid/invalid samples rather than field-presence-only checks.

Also extend `gitnexus/test/unit/runtime-claim-rule-registry.test.ts` only if needed to prove parser/schema parity on the same kinds.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/runtime-claim-rule-registry.test.ts test/unit/rule-dsl-schema.test.ts --reporter=dot`

Expected: FAIL because schema enum and/or field surface is still limited to two kinds.

**Step 3: Write minimal implementation**

Update `gitnexus/src/rule-lab/schema/rule-dsl.schema.json` so `resource_bindings.kind` supports all executable kinds and documents their fields.

Minimum schema changes:

- add `method_triggers_scene_load`;
- add `method_triggers_method`;
- expose `scene_name`;
- expose `source_class_pattern`, `source_method`, `target_class_pattern`, `target_method`.

If the current schema cannot express per-kind requirements cleanly with the existing flat shape, refactor `resource_bindings.items` to a `oneOf`-based schema so each kind can require its own minimum field set.

Do not change executable semantics in `types.ts` or `unity-runtime-binding-rules.ts` unless tests reveal a true mismatch. This task is primarily contract parity, not behavior expansion.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/runtime-claim-rule-registry.test.ts test/unit/rule-dsl-schema.test.ts --reporter=dot`

Expected: PASS with schema, parser tests, and executable support in agreement.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/schema/rule-dsl.schema.json gitnexus/test/unit/rule-dsl-schema.test.ts gitnexus/test/unit/runtime-claim-rule-registry.test.ts
git commit -m "fix: align rule lab schema with runtime binding kinds"
```

### Task 3: Re-rank Slim Query/Context First-Screen Output

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-query.test.ts`
- Test: `gitnexus/test/unit/local-backend-agent-safe-context.test.ts`

**Step 1: Write the failing tests**

Add or extend tests asserting:

```ts
expect(out.summary).toBe('Unity-runtime-root → OnAddPowerUp');
expect(out.decision.primary_candidate).toBe('Equip');
expect(out.process_hints[0].confidence).toBe('high');
expect(out.summary).not.toContain('runtime heuristic clue');
```

Required cases:

- a response with both high-confidence process hint and low-confidence heuristic clue;
- a response where `recommended_follow_up` already points to `uid=` or `resource_path_prefix=` but `summary` still points at heuristic clue;
- a context response where clue-tier rows remain present but are not promoted to the top summary/default reading.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: FAIL because current slim summary still prefers `processHints[0]` even when it is a low-confidence heuristic clue.

**Step 3: Write minimal implementation**

Refactor slim shaping in `agent-safe-response.ts` so summary selection uses ranked preference instead of array order:

```ts
const summary = chooseTopSummary({ candidates, processHints, runtimePreview });
```

Ranking rules:

- prefer exact/high-confidence graph-backed lead;
- then medium-confidence projected/process lead;
- only then low-confidence heuristic clue;
- keep heuristic clues in `process_hints` and `resource_hints`, but do not let them dominate first-screen summary when stronger evidence exists.

Do not remove `resource_heuristic` rows from payload.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/local-backend-agent-safe-query.test.ts test/unit/local-backend-agent-safe-context.test.ts --reporter=dot`

Expected: PASS with top summary aligned to stronger graph-backed leads and narrowing actions.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/agent-safe-response.ts gitnexus/test/unit/local-backend-agent-safe-query.test.ts gitnexus/test/unit/local-backend-agent-safe-context.test.ts
git commit -m "feat: prioritize graph-backed slim summaries"
```

### Task 4: Sync MCP Contract, Skills, and Installed Guidance

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`
- Modify: `gitnexus/skills/_shared/unity-runtime-process-contract.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `AGENTS.md`

**Step 1: Write the failing documentation-oriented tests**

Add or extend a targeted test in `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts` or adjacent existing contract tests so it asserts key wording fragments are present:

```ts
expect(text).toContain('discovery -> seed narrowing -> closure verification');
expect(text).toContain('resource_heuristic');
expect(text).toContain('clue');
expect(text).toContain('strong graph hops can coexist with failed closure');
```

If no existing text-oriented test is appropriate, create the minimal assertion in the existing CLI benchmark contract test file rather than inventing a large new test harness.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL because current docs/tool descriptions do not yet spell out the seed-first runtime sequence and clue-tier semantics clearly enough.

**Step 3: Write minimal implementation**

Update all contract-bearing docs so they say the same thing:

- `query()` is discovery-first, not closure proof;
- follow `decision.recommended_follow_up` before expanding payload size;
- use `uid` / `resource_path_prefix` for narrowing;
- request `runtime_chain_verify=on-demand` only after narrowing;
- classify `resource_heuristic` as clue-tier evidence;
- explain that strong graph hops plus `runtime_claim.failed` means partial bridge evidence, not contradiction.

Also update `AGENTS.md` references when the query/context default contract wording changes.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS with tool descriptions and skill docs aligned to the design.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/skills/gitnexus-exploring.md .agents/skills/gitnexus/gitnexus-exploring/SKILL.md gitnexus/skills/_shared/unity-runtime-process-contract.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md AGENTS.md
git commit -m "docs: clarify seed-first unity runtime workflow"
```

### Task 5: Extend Benchmarks To Detect Placeholder Leakage and Heuristic First-Screen Drift

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/types.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts`
- Modify: `gitnexus/src/benchmark/agent-safe-query-context/report.test.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts`

**Step 1: Write the failing tests**

Extend benchmark metrics to track:

```ts
placeholder_leak_detected: boolean;
heuristic_top_summary_detected: boolean;
```

Add tests proving:

- a leaked placeholder follow-up marks the run as failing;
- a top summary anchored to a low-confidence heuristic clue is surfaced separately from semantic tuple pass;
- a case can still pass semantic tuple matching while failing first-screen signal quality, and the report must show both.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run src/benchmark/agent-safe-query-context/runner.test.ts src/benchmark/agent-safe-query-context/report.test.ts src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: FAIL because the benchmark currently does not expose these two failure classes explicitly.

**Step 3: Write minimal implementation**

Update benchmark telemetry extraction so it:

- inspects `runtime_preview`, `upgrade_hints`, `decision.recommended_follow_up`, and `summary`;
- flags unrelated placeholder leakage;
- flags heuristic-first summary drift;
- keeps existing semantic tuple metrics intact instead of replacing them.

Update the generated report so these new checks are visible in both JSON and Markdown summary output.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run src/benchmark/agent-safe-query-context/runner.test.ts src/benchmark/agent-safe-query-context/report.test.ts src/cli/benchmark-agent-safe-query-context.test.ts --reporter=dot`

Expected: PASS with explicit placeholder and first-screen-noise reporting.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/agent-safe-query-context/runner.ts gitnexus/src/benchmark/agent-safe-query-context/report.ts gitnexus/src/benchmark/agent-safe-query-context/types.ts gitnexus/src/benchmark/agent-safe-query-context/runner.test.ts gitnexus/src/benchmark/agent-safe-query-context/report.test.ts gitnexus/src/cli/benchmark-agent-safe-query-context.ts gitnexus/src/cli/benchmark-agent-safe-query-context.test.ts
git commit -m "test: expose unity runtime placeholder and heuristic drift"
```

### Task 6: Full Verification and Artifact Refresh

**User Verification: not-required**

**Files:**
- Verify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Verify: `gitnexus/src/mcp/local/agent-safe-response.ts`
- Verify: `gitnexus/src/rule-lab/schema/rule-dsl.schema.json`
- Verify: `gitnexus/src/mcp/tools.ts`
- Verify: `gitnexus/src/benchmark/agent-safe-query-context/*.ts`
- Artifact: `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`
- Artifact: `.gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md`

**Step 1: Run targeted unit and benchmark tests**

Run:

```bash
npm --prefix gitnexus exec vitest run \
  src/mcp/local/runtime-chain-verify.test.ts \
  test/unit/rule-dsl-schema.test.ts \
  test/unit/runtime-claim-rule-registry.test.ts \
  test/unit/local-backend-agent-safe-query.test.ts \
  test/unit/local-backend-agent-safe-context.test.ts \
  src/benchmark/agent-safe-query-context/runner.test.ts \
  src/benchmark/agent-safe-query-context/report.test.ts \
  src/cli/benchmark-agent-safe-query-context.test.ts \
  --reporter=dot
```

Expected: PASS.

**Step 2: Build the package**

Run: `npm --prefix gitnexus run build`

Expected: PASS and `gitnexus/dist/cli/index.js` refreshed.

**Step 3: Refresh benchmark artifact**

Run:

```bash
node gitnexus/dist/cli/index.js benchmark-agent-safe-query-context \
  benchmarks/agent-safe-query-context/neonspark-v1 \
  --repo neonspark-core \
  --skip-analyze \
  --report-dir .gitnexus/benchmark-agent-safe-query-context
```

Expected:

- generated `.gitnexus/benchmark-agent-safe-query-context/benchmark-report.json`
- generated `.gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md`
- no placeholder leakage flagged
- no first-screen heuristic promotion flagged on the targeted anchored cases

**Step 4: Inspect artifact for design clauses**

Verify the artifact contains:

```json
{
  "recommended_follow_up_hit": true,
  "placeholder_leak_detected": false,
  "heuristic_top_summary_detected": false
}
```

for the targeted anchored NeonSpark cases.

**Step 5: Commit**

```bash
git add .gitnexus/benchmark-agent-safe-query-context/benchmark-report.json .gitnexus/benchmark-agent-safe-query-context/benchmark-summary.md
git commit -m "chore: refresh unity runtime tooling benchmark artifacts"
```

## Plan Audit Verdict
audit_scope: design clauses DC-01 through DC-06 covering verifier follow-up correctness, Rule Lab contract parity, slim summary ranking, seed-first guidance, and benchmark drift detection
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- runtime verifier follow-up commands must reject unrelated default reload query text; result: covered in Task 1 and Task 5
- benchmark report must surface placeholder leakage explicitly; result: covered in Task 5 and Task 6
authenticity_checks:
- Rule Lab schema parity is verified against actual executable binding kinds and explicit valid/invalid per-kind samples, not only against docs or field presence; result: covered in Task 2
- slim summary behavior is verified semantically against stronger graph-backed leads, not field presence; result: covered in Task 3
- workflow guidance is verified by text-bearing contract tests and benchmark outputs, not only by markdown edits; result: covered in Task 4 and Task 5
approval_decision: pass
