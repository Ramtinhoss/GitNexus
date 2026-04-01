# Unity Runtime Process Skill Distribution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Unity runtime process usage guidance setup-distributed, centralized in one shared contract, and consistently referenced by all related GitNexus workflow skills.

**Architecture:** Add one shared contract file under `gitnexus/skills/_shared`, shift relevant skills to lightweight trigger-and-load guidance, update AGENTS/CLAUDE generator to expose runtime process source-of-truth entry, and harden setup installer/tests so `_shared` is always distributed.

**Tech Stack:** TypeScript (CLI/setup), Markdown skill templates, Node test runner (`node --test`).

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | pending | Add shared runtime process contract file.
Task 2 | pending | Add AGENTS/CLAUDE Unity runtime process source-of-truth section in ai-context generator.
Task 3 | pending | Route skills to shared runtime process contract with trigger-based loading.
Task 4 | pending | Extend setup installer to distribute `_shared` safely.
Task 5 | pending | Add/adjust setup and ai-context tests for `_shared` + AGENTS entry.
Task 6 | pending | Run verification commands and capture evidence.
Task 7 | pending | Commit in small, reviewable slices.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 shared runtime contract is single source | critical | Task 1, Task 3 | `rg -n "unity-runtime-process-contract|_shared/unity-runtime-process-contract.md" gitnexus/skills` | `gitnexus/skills/_shared/unity-runtime-process-contract.md` exists and referenced by targeted skills | Missing file or missing references in any targeted skill
DC-02 AGENTS/CLAUDE exposes runtime process source-of-truth | critical | Task 2, Task 5 | `node --test gitnexus/src/cli/ai-context.test.ts` | Generated AGENTS content contains Unity runtime process section | Test failure or missing section text in generated output
DC-03 setup distributes shared docs without regressing existing skill install | critical | Task 4, Task 5 | `node --test gitnexus/src/cli/setup.test.ts` | Setup output tree includes `_shared` and existing skill install tests pass | `_shared` missing or any pre-existing setup test fails
DC-04 skills keep minimal guidance and avoid duplicated long guardrails | high | Task 3 | `rg -n "Phase 5 Confidence Guardrails|resourceBindings.*asset/meta" gitnexus/skills/gitnexus-*.md` | Target skills contain trigger + shared-contract load pattern | Large duplicated policy blocks remain or trigger wording absent

## Authenticity Assertions

- assert no placeholder path: every shared reference must point to an existing distributed path under `gitnexus/skills/_shared/`.
- assert live mode has tool evidence: skill guidance includes concrete `query/context` and hydration/runtime verify control where relevant.
- assert freeze requires non-empty confirmed_chain.steps (adapted): risk/closure claims must require concrete hop/evidence anchors from shared contract, not empty-process shortcuts.

### Task 1: Add Shared Runtime Process Contract

**User Verification: not-required**

**Files:**
- Create: `gitnexus/skills/_shared/unity-runtime-process-contract.md`

**Step 1: Write the failing check command**

Run: `test -f gitnexus/skills/_shared/unity-runtime-process-contract.md`
Expected: non-zero exit (file missing).

**Step 2: Add minimal complete shared contract**

Create contract with:
- trigger conditions,
- compact/parity hydration rule,
- empty-process fallback via `resourceBindings` + asset/meta mapping,
- low-confidence `verification_hint` requirement,
- hop-anchor closure rule,
- optional `runtime_chain_verify=on-demand` guidance for Reload-focused verification.

**Step 3: Run presence check**

Run: `test -f gitnexus/skills/_shared/unity-runtime-process-contract.md`
Expected: zero exit.

**Step 4: Commit**

```bash
git add gitnexus/skills/_shared/unity-runtime-process-contract.md
git commit -m "docs(skills): add shared unity runtime process contract"
```

### Task 2: Add AGENTS/CLAUDE Runtime Process Source-of-Truth Entry

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/ai-context.ts`

**Step 1: Write/adjust test expectation first (red)**

Add assertion in `ai-context` tests for Unity runtime process source-of-truth section text in generated AGENTS content.

**Step 2: Run target test**

Run: `node --test gitnexus/src/cli/ai-context.test.ts`
Expected: FAIL on missing Unity runtime process section.

**Step 3: Implement generator update**

Update `generateGitNexusContent(...)` block to include:
- section title `Unity Runtime Process 真理源`,
- reference to `docs/unity-runtime-process-source-of-truth.md`,
- instruction that Unity runtime process tasks must load this truth source first.

**Step 4: Re-run test**

Run: `node --test gitnexus/src/cli/ai-context.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/ai-context.ts gitnexus/src/cli/ai-context.test.ts
git commit -m "docs(ai-context): include unity runtime process source-of-truth entry"
```

### Task 3: Route Related Skills to Shared Contract

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `gitnexus/skills/gitnexus-debugging.md`
- Modify: `gitnexus/skills/gitnexus-impact-analysis.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `gitnexus/skills/gitnexus-pr-review.md`
- Modify: `gitnexus/skills/gitnexus-refactoring.md`
- Modify: `gitnexus/skills/gitnexus-cli.md`

**Step 1: Add red check for reference coverage**

Run:
`for f in gitnexus/skills/gitnexus-{exploring,debugging,impact-analysis,guide,pr-review,refactoring,cli}.md; do rg -q "_shared/unity-runtime-process-contract.md" "$f" || echo "missing:$f"; done`

Expected: one or more `missing:*` lines before edits.

**Step 2: Implement lightweight trigger + shared-load guidance**

For each targeted skill:
- add trigger phrase for Unity runtime process semantics,
- add one line to load `_shared/unity-runtime-process-contract.md`,
- keep only minimal task-local execution hints,
- remove duplicated long Phase 5 guardrail blocks where replaced by shared contract.

**Step 3: Run coverage check**

Run same command as Step 1.
Expected: no `missing:*` output.

**Step 4: Commit**

```bash
git add gitnexus/skills/gitnexus-*.md gitnexus/skills/_shared/unity-runtime-process-contract.md
git commit -m "docs(skills): route runtime-process workflows through shared contract"
```

### Task 4: Extend Setup Installer for `_shared` Distribution

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.ts`

**Step 1: Add failing setup test scenario first**

In `setup.test.ts`, add expectation that `_shared/unity-runtime-process-contract.md` exists in installed target.

**Step 2: Run setup tests**

Run: `node --test gitnexus/src/cli/setup.test.ts`
Expected: FAIL if installer omits `_shared`.

**Step 3: Implement installer logic**

Update `installSkillsTo` to copy `_shared` as a distributable directory while preserving existing flat and skill-directory behavior.

**Step 4: Re-run setup tests**

Run: `node --test gitnexus/src/cli/setup.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/setup.ts gitnexus/src/cli/setup.test.ts
git commit -m "feat(setup): distribute shared skill docs under _shared"
```

### Task 5: Cross-Check Distribution and Generated Content

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/ai-context.test.ts` (if not fully covered in Task 2)
- Modify: `gitnexus/src/cli/setup.test.ts` (if not fully covered in Task 4)

**Step 1: Add missing regression assertions**

Ensure tests cover:
- AGENTS section runtime-process source-of-truth text,
- project/global setup includes `_shared` payload when skills are installed.

**Step 2: Run focused test suite**

Run:
`node --test gitnexus/src/cli/ai-context.test.ts gitnexus/src/cli/setup.test.ts`

Expected: PASS.

**Step 3: Commit**

```bash
git add gitnexus/src/cli/ai-context.test.ts gitnexus/src/cli/setup.test.ts
git commit -m "test(setup): verify runtime-process guidance distribution paths"
```

### Task 6: Verification Evidence Sweep

**User Verification: required**

**Files:**
- Modify: none

**Step 1: Run textual integrity checks**

Run:
`rg -n "Unity Runtime Process 真理源|unity-runtime-process-contract|runtime_chain_verify|verification_hint" gitnexus/src/cli/ai-context.ts gitnexus/skills`

Expected: hits in AGENTS generator and targeted skill/shared files.

**Step 2: Run full touched tests**

Run:
`node --test gitnexus/src/cli/ai-context.test.ts gitnexus/src/cli/setup.test.ts`

Expected: PASS.

**Step 3: User verification checkpoint**

User reviews generated guidance style and confirms wording matches desired "共享文档按需加载" strategy.

### Task 7: Final Commit Hygiene

**User Verification: not-required**

**Files:**
- Modify: none

**Step 1: Review final diff**

Run: `git diff --stat && git diff --name-only`
Expected: only planned files changed.

**Step 2: Final commit**

```bash
git add gitnexus/src/cli/ai-context.ts gitnexus/src/cli/setup.ts gitnexus/src/cli/*.test.ts gitnexus/skills docs/plans
git commit -m "docs(setup): unify unity runtime process guidance via shared distributed contract"
```

## Plan Audit Verdict
audit_scope: design clauses DC-01..DC-04 for shared runtime-process contract distribution and workflow routing
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- Independent reviewer subagent audit not executed in this session due runtime policy restricting `spawn_agent` unless user explicitly requests delegation; status: accepted
anti_placeholder_checks:
- Shared contract target path is concrete (`gitnexus/skills/_shared/unity-runtime-process-contract.md`): pass
- Verification commands include concrete file/test paths: pass
authenticity_checks:
- Critical clauses map to executable commands + artifact fields + failure signals: pass
- Runtime chain closure guard requires evidence anchors and disallows empty-process shortcut: pass
approval_decision: pass

