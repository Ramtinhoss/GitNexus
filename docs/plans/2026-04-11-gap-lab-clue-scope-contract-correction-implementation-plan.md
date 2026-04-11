# Gap-Lab Clue and Scope Contract Correction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct gap-lab so generic subtype discovery remains exhaustive, example clues cannot become hidden scope gates, and invalid candidate filtering is blocked before C3.

**Architecture:** Split the workflow contract into `slice_focus`, `discovery_scope`, `search_seed`, and `validation_exemplar`, then enforce that model in three layers: skill/shared-contract wording, candidate-audit tooling, and anti-regression tests. Finally, add a documented run-repair workflow for neonspark slices already affected by the old behavior.

**Tech Stack:** Markdown skills, TypeScript CLI/gap-lab modules, Vitest integration/unit tests, JSON/JSONL run artifacts, ripgrep, GitNexus Rule Lab CLI.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added the failing contract-separation test, observed red on missing `search_seeds`, then updated source/installed skill copies plus shared contract and verified the targeted Vitest case passed.
Task 2 | completed | Added the explicit-scope-override test, observed red on missing `explicit_discovery_scope_override`, updated source/installed wording plus shared policy, and verified the targeted Vitest case passed.
Task 3 | completed | Added the missing-module unit test, observed red on unresolved `candidate-audit`, implemented the default-scope reason-code audit plus a narrow `coverage-gate` type hook, and verified the targeted unit test passed.
Task 4 | completed | Strengthened the red case to require explicit `eligibleRows`, implemented `promotion_backlog` as an eligible state distinct from rejection, updated contracts, and verified the targeted unit test passed.
Task 5 | completed | Added the candidate-audit drift regression, observed the gate incorrectly pass, then derived coverage from `slice.candidates.jsonl`, preserved placeholder-id rejection ahead of audit, and verified the targeted integration tests passed.
Task 6 | completed | Added the exemplar-scope-drift regression fixture/tests, exposed and fixed a `./Assets/...` lexical path-normalization bug, and verified the targeted integration tests passed for both cross-module default-scope discovery and generic seeds without exemplars.
Task 7 | completed | Added the docs/contract regression, observed missing repo-level wording, updated source-of-truth/config/skill contracts for candidate-derived coverage and backlog semantics, and verified the targeted docs test passed.
Task 8 | completed | Added the repair checklist/docs, archived the live neonspark run to `.pre-contract-fix`, confirmed baseline user-code `out_of_focus_scope` rows in the real artifact, captured summary/closure evidence from the live slice, and passed the required human verification gate.
Task 9 | in_progress | Starting the final changelog/assertion red phase and full integration/parity verification run.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Split `slice_focus`, `discovery_scope`, `search_seed`, and `validation_exemplar` into separate contract terms | critical | Task 1, Task 2 | `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "seed|scope|exemplar|focus"` | `gitnexus/skills/gitnexus-unity-rule-gen.md:Phase B`, `gitnexus/skills/_shared/unity-gap-lab-contract.md:Control Policy` | skill still says clues "anchor this slice" or inferred scope remains allowed
DC-02 Default `full_user_code` runs must not exclude user-code matches because they are outside exemplar module/community | critical | Task 3, Task 4, Task 8 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "rejects exemplar-driven exclusion"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.candidates.jsonl:reason_code` | user-code rows contain `out_of_focus_scope`-style reason under default scope
DC-03 Pre-C3 gating must derive semantic coverage from `slice.candidates.jsonl`, not trust summary counts alone | critical | Task 5, Task 6 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "blocks c3 on candidate-audit drift"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.json:coverage_gate`, `.candidates.jsonl:stage/reason_code` | C3 proceeds when summary counts pass but candidate rows reveal invalid exclusions
DC-04 Promotion choice must be separate from eligibility so "not this round" is not encoded as rejection | critical | Task 4, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "keeps eligible backlog separate from rejection"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.candidates.jsonl:status` | valid user-code rows are rejected/deferred only because they were not chosen for immediate promotion
DC-05 Generic subtype seeds must still complete exhaustive discovery when no exemplar is provided | critical | Task 6, Task 9 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "generic seeds without exemplar"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.candidates.jsonl:scopeClass/status` | workflow requires exemplar to reach exhaustive user-code accounting
DC-06 Existing neonspark slices affected by old contract must have an executable semantic repair path | critical | Task 8, Task 9 | `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; gitnexus rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && if rg -n '"reasonCode": "(out_of_focus_scope|deferred_non_clue_module)"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"; then exit 1; else exit 0; fi && rg -n '"processed_user_matches"|"user_raw_matches"|"confirmed_chain"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"` | `/Volumes/Shuttle/projects/neonspark/.gitnexus/gap-lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook.candidates.jsonl:reasonCode`, `/Volumes/Shuttle/projects/neonspark/.gitnexus/gap-lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook.json:coverage_gate/confirmed_chain` | analyze does not execute on the repaired real run, invalid reason codes remain, or candidate-derived summary signals are absent

## Authenticity Assertions

- `assert no placeholder path`: candidate-audit tests must fail if persisted run/slice identifiers contain `<run_id>` or `<slice_id>`.
- `assert live mode has tool evidence`: real-repo repair steps must include executable commands and expected evidence, not only prose.
- `assert freeze requires non-empty confirmed_chain.steps`: any repaired slice that moves to `verified/done` must still honor closure-evidence gates.
- `assert candidate audit derives truth from candidates.jsonl`: tests must prove summary-only spoofing is rejected.
- `assert default scope forbids exemplar-derived exclusions`: negative tests must explicitly seed one exemplar and still require cross-module user-code retention.
- `assert generic seeds work without exemplar`: tests must prove exhaustive discovery still works when no exemplar is provided.
- `assert placeholder path rejection is executable`: at least one task must run a command or test that explicitly rejects `<run_id>` / `<slice_id>`.

## Skill References

- `@superpowers:executing-plans`
- `@superpowers:verification-before-completion`
- `@gitnexus-unity-rule-gen`
- `@gitnexus-guide`

### Task 1: Rewrite Phase B Contract Terms

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('separates search seeds, validation exemplars, focus, and discovery scope', async () => {
  const { source } = await readSkills();
  expect(source).toMatch(/search_seeds/i);
  expect(source).toMatch(/validation_exemplars/i);
  expect(source).toMatch(/discovery_scope/i);
  expect(source).not.toMatch(/anchor this slice/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "search seeds|validation exemplars|discovery scope"`
Expected: FAIL because current wording still uses clue-anchoring language.

**Step 3: Write minimal implementation**

```md
Replace:
- "Required user clues"
With:
- "Optional search_seeds"
- "Optional validation_exemplars"
- "discovery_scope defaults to full_user_code unless user explicitly overrides"
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "search seeds|validation exemplars|discovery scope"`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "fix(gap-lab): split seed, exemplar, and scope contract terms"
```

### Task 2: Add Contract Tests for Explicit Scope Override Only

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`

**Step 1: Write the failing test**

```ts
it('allows scope narrowing only as explicit user override', async () => {
  const { source } = await readSkills();
  expect(source).toMatch(/explicit_discovery_scope_override/i);
  expect(source).toMatch(/full_user_code/i);
  expect(source).not.toMatch(/inferred community.*scope/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "explicit user override"`
Expected: FAIL

**Step 3: Write minimal implementation**

```md
Add:
- explicit_discovery_scope_override
- allowed modes: full_user_code, path_prefix_override, module_override
- inferred exemplar locality must not narrow scope
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "explicit user override"`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md
git commit -m "test(gap-lab): guard explicit scope override semantics"
```

### Task 3: Encode Scope-Mode Reason-Code Policy

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/gap-lab/candidate-audit.ts`
- Create: `gitnexus/test/unit/gap-lab/candidate-audit.test.ts`
- Modify: `gitnexus/src/gap-lab/coverage-gate.ts`

**Step 1: Write the failing test**

```ts
it('rejects exemplar-driven exclusions under full_user_code scope', async () => {
  const result = auditCandidateRows({
    discoveryScopeMode: 'full_user_code',
    rows: [{ scopeClass: 'user_code', status: 'rejected', reasonCode: 'out_of_focus_scope' as any }],
  });
  expect(result.blocked).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-audit.test.ts`
Expected: FAIL because audit module does not exist.

**Step 3: Write minimal implementation**

```ts
const DISALLOWED_DEFAULT_SCOPE_REASONS = new Set([
  'out_of_focus_scope',
  'deferred_non_clue_module',
  'community_mismatch',
  'not_example_chain',
]);
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-audit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/gap-lab/candidate-audit.ts gitnexus/test/unit/gap-lab/candidate-audit.test.ts gitnexus/src/gap-lab/coverage-gate.ts
git commit -m "feat(gap-lab): audit reason codes by discovery scope mode"
```

### Task 4: Separate Eligibility From Promotion Backlog

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/gap-lab/candidate-audit.ts`
- Modify: `gitnexus/test/unit/gap-lab/candidate-audit.test.ts`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`

**Step 1: Write the failing test**

```ts
it('treats promotion_backlog as eligible rather than rejected', async () => {
  const result = auditCandidateRows({
    discoveryScopeMode: 'full_user_code',
    rows: [{ scopeClass: 'user_code', status: 'promotion_backlog' as any }],
  });
  expect(result.blocked).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-audit.test.ts -t "promotion_backlog"`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
const ELIGIBLE_STATUSES = new Set(['verified_missing', 'accepted', 'eligible', 'promotion_backlog']);
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-audit.test.ts -t "promotion_backlog"`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/gap-lab/candidate-audit.ts gitnexus/test/unit/gap-lab/candidate-audit.test.ts gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md
git commit -m "fix(gap-lab): separate promotion backlog from rejection semantics"
```

### Task 5: Derive Coverage From `slice.candidates.jsonl`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/gap-lab/coverage-gate.ts`
- Modify: `gitnexus/src/gap-lab/slim-artifacts.ts`
- Modify: `gitnexus/src/cli/rule-lab.ts`
- Modify: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`

**Step 1: Write the failing integration test**

```ts
it('blocks c3 on candidate-audit drift even when slice summary counts look passed', async () => {
  // write slice.json with processed=user_raw
  // write candidates.jsonl with one user_code row rejected by out_of_focus_scope
  // expect ruleLabAnalyzeCommand to throw
});

it('rejects placeholder run and slice ids during candidate-audit entry', async () => {
  await expect(ruleLabAnalyzeCommand({
    repoPath: '/tmp',
    runId: '<run_id>',
    sliceId: '<slice_id>',
  })).rejects.toThrow(/placeholder values are not allowed/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "candidate-audit drift|placeholder run and slice ids"`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// In coverage gate:
// - load slice.candidates.jsonl
// - derive raw/processed counts
// - compare derived counts to slice.json
// - set status blocked on mismatch
// - preserve explicit placeholder-id rejection before any audit path runs
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "candidate-audit drift|placeholder run and slice ids"`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/gap-lab/coverage-gate.ts gitnexus/src/gap-lab/slim-artifacts.ts gitnexus/src/cli/rule-lab.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts
git commit -m "feat(gap-lab): derive coverage gate from candidate artifacts"
```

### Task 6: Block Default-Scope Exemplar Filtering End-to-End

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`
- Create: `gitnexus/test/fixtures/gap-lab-exhaustive/exemplar-scope-drift/files.json`

**Step 1: Write the failing integration test**

```ts
it('rejects exemplar-driven exclusion under default full_user_code scope', async () => {
  // fixture contains one exemplar-like NetworkCode match and one Game match
  // both are user_code and same subtype
  // expect audit to keep both accounted for without out_of_focus_scope
});

it('supports generic subtype seeds without any exemplar input', async () => {
  // fixture uses only subtype pattern seeds
  // expect exhaustive discovery to classify and account for user_code matches
  // without requiring validation_exemplars
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "exemplar-driven exclusion|generic subtype seeds without any exemplar input"`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// Ensure integration fixture + audit path classify both rows as valid user_code participants
// unless explicit scope override is present
// and ensure absence of exemplar does not lower coverage or require special waiver
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "exemplar-driven exclusion|generic subtype seeds without any exemplar input"`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/fixtures/gap-lab-exhaustive/exemplar-scope-drift/files.json
git commit -m "test(gap-lab): block exemplar-driven filtering under default scope"
```

### Task 7: Update Fixed Buckets and Candidate States in Docs and Contracts

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/gitnexus-config-files.md`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
- Test: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing contract test**

```ts
it('documents backlog-capable eligibility and candidate-derived coverage truth', async () => {
  const text = await readRepoFile('docs/unity-runtime-process-source-of-truth.md');
  expect(text).toMatch(/promotion_backlog|eligible/i);
  expect(text).toMatch(/candidate-derived coverage/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "candidate-derived coverage|promotion_backlog"`
Expected: FAIL

**Step 3: Write minimal implementation**

```md
Add wording:
- default scope forbids exemplar/module exclusion reasons
- slice summary is derived from candidates.jsonl
- eligible/backlog is distinct from rejection
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "candidate-derived coverage|promotion_backlog"`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/gitnexus-config-files.md gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(gap-lab): codify candidate-derived coverage and backlog semantics"
```

### Task 8: Validate neonspark Run Repair Semantics

**User Verification: required**
- Human Verification Checklist:
  1. Confirm the repair procedure preserves the original run artifacts before rerun.
  2. Confirm the rerun instructions explicitly reprocess previously excluded user-code rows.
  3. Confirm the acceptance step requires checking candidate reason codes and coverage gate behavior, not only total counts.
  4. Confirm the final verification still requires analyze and closure evidence.
- Acceptance Criteria:
  1. Procedure contains a backup/archive step for old slice artifacts.
  2. Procedure names `out_of_focus_scope` / `deferred_non_clue_module` as invalid under default scope.
  3. Procedure includes executable commands to inspect `slice.candidates.jsonl` and `slice.json` on the real neonspark run.
  4. Procedure includes explicit analyze/retrieval verification commands before `verified/done`.
- Failure Signals:
  1. Old artifact set would be overwritten without audit trail.
  2. Repair text only says "rerun the slice" without candidate-audit inspection.
  3. Human reviewer cannot tell how invalid exclusions and C3 blocking are detected on the real run.
  4. Closure evidence gate is omitted from repaired workflow.
- User Decision Prompt:
  `请仅回复“通过”或“不通过”：neonspark run repair 流程是否满足你的预期？`

**Files:**
- Modify: `docs/plans/2026-04-11-gap-lab-clue-scope-contract-correction-design.md`
- Modify: `docs/plans/2026-04-11-gap-lab-clue-scope-contract-correction-implementation-plan.md`
- Create: `docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md`

**Step 1: Write the failing real-run repair verification checklist**

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_DIR="$REPO_PATH/.gitnexus/gap-lab/runs/gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
rg -n '"reasonCode": "(out_of_focus_scope|deferred_non_clue_module)"' "$RUN_DIR/slices/$SLICE_ID.candidates.jsonl"
rg -n '"coverage_incomplete"|"confirmed_chain"|"status"' "$RUN_DIR/slices/$SLICE_ID.json"
```

**Step 2: Run check to verify current repair spec is incomplete**

Run: `test -f docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md`
Expected: FAIL because checklist file does not exist yet.

**Step 3: Write minimal implementation**

```md
## neonspark Run Repair Checklist
Command: `cp -R "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID" "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID.pre-contract-fix"`
Command: `rg -n '"reasonCode": "(out_of_focus_scope|deferred_non_clue_module)"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"`
Command: `rg -n '"scopeClass": "user_code"|"status": "rejected"|"status": "promotion_backlog"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"`
Command: `gitnexus rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"`
Command: `rg -n '"coverage_incomplete"|"processed_user_matches"|"user_raw_matches"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"`
Command: `rg -n '"steps": \\[\\]|confirmed_chain' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"`
```

**Step 4: Run semantic verification checks on the real neonspark run**

Run: `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; rg -n '"reasonCode": "(out_of_focus_scope|deferred_non_clue_module)"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"`
Expected: before repair, invalid reason codes are observable on the real run artifact and establish the failing baseline.

Run: `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; gitnexus rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"`
Expected: after code changes plus rerun/reclassification, `rule-lab analyze` executes on the repaired real run and no longer blocks on stale candidate semantics.

Implementation note: for this repository checkout, execute the real-run validation with the checkout-local built CLI (`node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze ...`) so the command uses the code under test rather than the globally installed binary.

Run: `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; if rg -n '"reasonCode": "(out_of_focus_scope|deferred_non_clue_module)"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.candidates.jsonl"; then exit 1; else exit 0; fi`
Expected: after repair, invalid default-scope reason codes are absent from the real run artifact.

Implementation note: the live neonspark artifact currently uses legacy snake_case candidate fields (`scope`, `lifecycle_stage`, `reason_code`), so the verification checklist must inspect those concrete field names during repair.

Run: `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; rg -n '"processed_user_matches"|"user_raw_matches"|"coverage_incomplete"|"confirmed_chain"' "$REPO_PATH/.gitnexus/gap-lab/runs/$RUN_ID/slices/$SLICE_ID.json"`
Expected: after repair, the slice summary reflects candidate-derived counts, no invalid `coverage_incomplete` remains for the repaired reason-code path, and closure evidence remains required before `verified/done`.

**Step 5: Commit**

```bash
git add docs/plans/2026-04-11-gap-lab-clue-scope-contract-correction-design.md docs/plans/2026-04-11-gap-lab-clue-scope-contract-correction-implementation-plan.md docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md
git commit -m "docs(gap-lab): add neonspark run repair workflow"
```

### Task 9: Final Verification and Distribution Parity

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/CHANGELOG.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Test: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`
- Test: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the final release-note assertion**

```ts
it('tracks clue/scope contract correction in changelog', async () => {
  const changelog = await readRepoFile('gitnexus/CHANGELOG.md');
  expect(changelog).toMatch(/clue and scope contract correction/i);
});
```

**Step 2: Run tests to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: FAIL until changelog and final wording are updated.

**Step 3: Write minimal implementation**

```md
Add `[Unreleased]` bullets:
- gap-lab clue/scope contract correction
- candidate-derived coverage audit
- default-scope anti-exemplar filtering guard
```

**Step 4: Run tests and parity checks**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts && diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md && diff -u gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
Expected: PASS with no diff output.

**Step 5: Commit**

```bash
git add gitnexus/CHANGELOG.md gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "chore(gap-lab): finalize clue and scope contract correction"
```

## Plan Audit Verdict
audit_scope: gap-lab contract wording, candidate-audit tooling, anti-regression tests, neonspark run-repair workflow
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- Plan commands use concrete repo-local file paths and reject placeholder run/slice ids in verification tasks: pass
- Candidate-audit tasks require failure on summary/candidate drift rather than trusting placeholder summary counts: pass
authenticity_checks:
- Negative tests require default-scope anti-exemplar filtering behavior: pass
- Negative tests require generic subtype discovery without exemplar input: pass
- Coverage audit requires semantic derivation from `slice.candidates.jsonl`: pass
- neonspark repair path requires executable commands on the real run plus coverage and closure-evidence verification: pass
approval_decision: pass
