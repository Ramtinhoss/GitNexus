# Gap-Lab Exhaustive Candidate Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `gitnexus-unity-rule-gen` produce exhaustive, auditable candidate coverage from generic subtype patterns before C3 rule generation.

**Architecture:** Add an explicit C1 discovery engine (repo-wide lexical universe + scope classification + symbol resolution + missing-edge verification), persist compact slice artifacts, and enforce a hard coverage gate prior to C3. Keep Rule Lab command chain unchanged and adapt handoff inputs.

**Tech Stack:** TypeScript, Node.js, GitNexus CLI/Rule-Lab modules, ripgrep, Vitest.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added exhaustive/coverage/reason_code contract clauses; skill-contract suite now passes (19/19)
Task 2 | completed | Added rg-first exhaustive scanner + pattern library; unit tests pass (2/2)
Task 3 | completed | Added scope classifier with deterministic reason_code + evidence; unit tests pass (3/3)
Task 4 | completed | Added resolver + missing-edge verifier with ambiguity filtering; unit tests pass (3/3)
Task 5 | completed | Added coverage gate + CLI pre-check; integration test confirms C3 blocking on incomplete coverage
Task 6 | completed | Added slim-artifact writer + cleanup, integrated into coverage gate; slim artifact test passes
Task 7 | completed | Added parity gate + anti-fake checks + exhaustive integration fixtures/tests; suite passes (7/7)
Task 8 | completed | Docs/contracts/changelog synchronized; source/install parity diff clean; contract tests pass (23/23)

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Exhaustive lexical universe for subtype pattern | critical | Task 2, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "builds repo-wide lexical universe"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.candidates.jsonl:stage=raw_match` | `user_code raw universe count is 0 despite known fixtures`
DC-02 No silent drop before C3 | critical | Task 5, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "blocks c3 when coverage incomplete"` | `slices/<slice>.json:coverage_gate` | `C3 allowed while processed_user_matches < user_raw_matches`
DC-03 Explicit reason for each rejected/deferred candidate | critical | Task 3, Task 6, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "records reason_code for non-accepted candidates"` | `slices/<slice>.candidates.jsonl:reason_code` | `candidate stage=rejected|deferred has missing reason_code`
DC-04 Gap-lab/rules-lab parity before C1/C3 | critical | Task 4, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "enforces run artifact parity gate"` | `slices/<slice>.json:parity_status` | `phase advanced with missing rules/lab slice artifact`
DC-05 Balanced-slim artifact model | major | Task 6, Task 7 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "writes slim artifacts"` | run tree contains only required files | extra per-stage files (`universe/scope/coverage` standalone) created
DC-06 Skill and installed copy parity | major | Task 8 | `diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` | identical files | source/installed skill drift

## Authenticity Assertions

1. assert no placeholder path in persisted run artifacts.
2. assert coverage gate checks semantic counts, not only field presence.
3. assert C3 is blocked when unresolved user-code matches exist.
4. assert parity gate fails on missing `.gitnexus/rules/lab/runs/<run>/slices/<slice>/slice.json`.

### Task 1: Define Exhaustive Discovery Contract

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`

**Step 1: Write failing contract tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "exhaustive|coverage|reason_code"`
Expected: FAIL because clauses absent.

**Step 2: Add contract clauses**
Add clauses for C1a/C1b/C1c/C1d, coverage gate, reason_code, slim artifacts.

**Step 3: Verify tests pass**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
Expected: PASS.

**Step 4: Commit**
Run:
```bash
git add gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "feat(skill): add exhaustive discovery and coverage gate contract"
```

### Task 2: Implement Repo-Wide Lexical Universe Scanner

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/gap-lab/exhaustive-scanner.ts`
- Create: `gitnexus/src/gap-lab/pattern-library.ts`
- Create: `gitnexus/test/unit/gap-lab/exhaustive-scanner.test.ts`

**Step 1: Write failing unit tests**
Add tests for `SyncVar hook` and `Callback +=` patterns over fixture trees.

**Step 2: Run failing tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/exhaustive-scanner.test.ts`
Expected: FAIL.

**Step 3: Implement scanner**
Implement pattern-driven `rg` execution and normalized match records.

**Step 4: Run tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/exhaustive-scanner.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add gitnexus/src/gap-lab/exhaustive-scanner.ts gitnexus/src/gap-lab/pattern-library.ts gitnexus/test/unit/gap-lab/exhaustive-scanner.test.ts
git commit -m "feat(gap-lab): add exhaustive lexical scanner"
```

### Task 3: Add Scope Classification and Reason Codes

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/gap-lab/scope-classifier.ts`
- Create: `gitnexus/test/unit/gap-lab/scope-classifier.test.ts`

**Step 1: Write failing tests**
Test `user_code/third_party/unknown` with path fixtures.

**Step 2: Run failing tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/scope-classifier.test.ts`
Expected: FAIL.

**Step 3: Implement classifier**
Add reason codes and evidence payloads.

**Step 4: Run tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/scope-classifier.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add gitnexus/src/gap-lab/scope-classifier.ts gitnexus/test/unit/gap-lab/scope-classifier.test.ts
git commit -m "feat(gap-lab): classify lexical matches by ownership scope"
```

### Task 4: Integrate Resolver + Graph Missing Verification

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/gap-lab/candidate-resolver.ts`
- Create: `gitnexus/src/gap-lab/missing-edge-verifier.ts`
- Create: `gitnexus/test/unit/gap-lab/candidate-resolver.test.ts`

**Step 1: Write failing tests**
Use fixtures for resolvable and ambiguous handlers.

**Step 2: Run failing tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-resolver.test.ts`
Expected: FAIL.

**Step 3: Implement resolver/verifier**
Generate candidate lifecycle states and verification evidence.

**Step 4: Run tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/unit/gap-lab/candidate-resolver.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add gitnexus/src/gap-lab/candidate-resolver.ts gitnexus/src/gap-lab/missing-edge-verifier.ts gitnexus/test/unit/gap-lab/candidate-resolver.test.ts
git commit -m "feat(gap-lab): resolve anchors and verify missing edges"
```

### Task 5: Enforce Coverage Gate Before C3

**User Verification: required**
- Human Verification Checklist:
  1. Run with fixture where one user-code match is intentionally unprocessed.
  2. Confirm workflow marks slice `blocked`.
  3. Confirm C3 command is not emitted.
- Acceptance Criteria:
  1. Processed count is strictly less than raw count in artifact.
  2. `status=blocked` with `coverage_incomplete`.
  3. `next_command` does not contain `rule-lab analyze`.
- Failure Signals:
  1. Slice remains `in_progress` despite incomplete coverage.
  2. C3 is still suggested.
  3. Missing unresolved candidate list.
- User Decision Prompt:
  `请仅回复“通过”或“不通过”：coverage gate 阻断行为是否符合预期？`

**Files:**
- Create: `gitnexus/src/gap-lab/coverage-gate.ts`
- Modify: `gitnexus/src/cli/rule-lab.ts`
- Create: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`

**Step 1: Write failing integration test**
Add case: incomplete coverage should block C3.

**Step 2: Run failing test**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "blocks c3 when coverage incomplete"`
Expected: FAIL.

**Step 3: Implement coverage gate**
Compute counts and enforce transition block.

**Step 4: Run test**
Run same command.
Expected: PASS.

**Step 5: Commit**
```bash
git add gitnexus/src/gap-lab/coverage-gate.ts gitnexus/src/cli/rule-lab.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts
git commit -m "feat(gap-lab): enforce exhaustive coverage gate before c3"
```

### Task 6: Implement Balanced-Slim Artifact Writer

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/gap-lab/slim-artifacts.ts`
- Modify: `gitnexus/src/gap-lab/coverage-gate.ts`
- Modify: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`

**Step 1: Add failing test for artifact count/shape**

**Step 2: Run failing test**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts -t "writes slim artifacts"`
Expected: FAIL.

**Step 3: Implement writer**
Persist only `slice.json`, `slice.candidates.jsonl`, `inventory.jsonl`, `decisions.jsonl`.

**Step 4: Run tests**
Run same command.
Expected: PASS.

**Step 5: Commit**
```bash
git add gitnexus/src/gap-lab/slim-artifacts.ts gitnexus/src/gap-lab/coverage-gate.ts gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts
git commit -m "feat(gap-lab): persist balanced-slim candidate artifacts"
```

### Task 7: Add End-to-End Contract and Anti-Fake Tests

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`
- Create: `gitnexus/test/fixtures/gap-lab-exhaustive/**`

**Step 1: Add negative tests**
Add checks for placeholder leakage and semantic gate bypass.

**Step 2: Run suite**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`
Expected: PASS.

**Step 3: Commit**
```bash
git add gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/fixtures/gap-lab-exhaustive
git commit -m "test(gap-lab): add exhaustive coverage and anti-fake integration tests"
```

### Task 8: Sync Setup Artifacts and Docs

**User Verification: required**
- Human Verification Checklist:
  1. Source and installed skill docs are byte-level identical.
  2. AGENTS/setup index still lists correct files.
  3. Contract tests pass after sync.
- Acceptance Criteria:
  1. `diff -u` exits 0.
  2. AGENTS references updated behavior language.
  3. integration tests pass.
- Failure Signals:
  1. Source/installed drift.
  2. Missing contract fields in installed copy.
  3. test failure in skill-contract suite.
- User Decision Prompt:
  `请仅回复“通过”或“不通过”：文档与安装产物同步是否完成？`

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/gitnexus-config-files.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `gitnexus/CHANGELOG.md`

**Step 1: Update docs**
Reflect exhaustive coverage gate and slim artifacts.

**Step 2: Verify sync**
Run:
```bash
diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md
diff -u gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md
```
Expected: no diff.

**Step 3: Run contract tests**
Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: PASS.

**Step 4: Commit**
```bash
git add AGENTS.md docs/gitnexus-config-files.md docs/unity-runtime-process-source-of-truth.md gitnexus/CHANGELOG.md
git commit -m "docs: sync exhaustive gap-lab workflow contracts and setup artifacts"
```

## Plan Audit Verdict
audit_scope: design clauses DC-01..DC-06 for exhaustive discovery, coverage gate, parity gate, and slim artifacts
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- coverage gate requires semantic count equality (`user_raw == processed_user`): pass
- C3 blocked on incomplete coverage: pass
authenticity_checks:
- critical clauses mapped to executable verification commands: pass
- concrete artifact evidence fields specified: pass
- negative tests included for anti-fake behavior: pass
approval_decision: pass
