# GitNexus Skill Matrix Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved v2 workflow redesign so GitNexus main-matrix skills consistently apply MCP-first routing, Unity resource-binding escalation, and UIToolkit UI trace triggers.

**Architecture:** Introduce a shared contract layer under `.agents/skills/gitnexus/_shared/` and convert scenario skills to reference it. Keep role boundaries strict: `guide` is routing/index, `cli` is command manual, scenario skills execute task-specific workflows with shared contract references. Validate matrix consistency with repeatable grep-based checks.

**Tech Stack:** Markdown docs, GitNexus skill files, shell validation (`rg`, `sed`, `git diff`).

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

### Task 1: Capture preflight and create implementation branch checkpoint

**User Verification: not-required**

**Files:**
- Modify: `docs/plans/2026-03-30-gitnexus-skill-matrix-workflow-implementation-plan.md`

**Step 1: Record preflight cache facts at top of execution log**

Add this facts block to execution notes (not skill files yet):

```markdown
Preflight cache:
- worker_profile=full-lifecycle
- execution_mode=parallel-worker
- permission_mode=normal
- request_user_input_available=true
- large-worktree-risk=false
- worktree-dirty=true
- worktree-exempt=false
- heavy-checks-skipped=false
```

**Step 2: Verify current working state**

Run: `git status --short`
Expected: Existing unrelated edits may appear; no destructive cleanup is performed.

**Step 3: Commit plan artifact only if execution requires it**

Run:
```bash
git add docs/plans/2026-03-30-gitnexus-skill-matrix-workflow-implementation-plan.md
git commit -m "docs(plan): add skill matrix workflow implementation plan"
```
Expected: commit may be skipped if `docs/plans/` is ignored.

### Task 2: Add shared workflow contract files

**User Verification: not-required**

**Files:**
- Create: `.agents/skills/gitnexus/_shared/workflow-contract.md`
- Create: `.agents/skills/gitnexus/_shared/unity-resource-binding-contract.md`
- Create: `.agents/skills/gitnexus/_shared/unity-ui-trace-contract.md`

**Step 1: Write failing contract presence check**

Run:
```bash
for f in \
  .agents/skills/gitnexus/_shared/workflow-contract.md \
  .agents/skills/gitnexus/_shared/unity-resource-binding-contract.md \
  .agents/skills/gitnexus/_shared/unity-ui-trace-contract.md; do
  test -f "$f" || echo "MISSING:$f"
done
```
Expected: `MISSING:` lines before files are created.

**Step 2: Write minimal complete contract docs**

Minimum required content snippets:

```markdown
# Workflow Contract
- MCP-first for analysis tasks
- CLI fallback for setup/analyze/status/clean/wiki/list or explicit CLI request
- Stale index: analyze then return to MCP workflow
```

```markdown
# Unity Resource Binding Contract
Trigger when code-only context/query cannot explain lifecycle and Unity serialized/binding state matters.
- Start compact hydration
- If needsParityRetry=true, rerun parity before conclusions
```

```markdown
# Unity UI Trace Contract
Trigger for UIToolkit visual semantics (layout/element/style/selector behavior).
Default order: asset_refs -> template_refs -> selector_bindings.
```

**Step 3: Verify contracts exist and contain core markers**

Run:
```bash
rg -n "MCP-first|needsParityRetry|asset_refs|selector_bindings" .agents/skills/gitnexus/_shared/*.md -S
```
Expected: matches across all three files.

**Step 4: Commit**

```bash
git add .agents/skills/gitnexus/_shared/*.md
git commit -m "docs(skills): add shared workflow and unity contracts"
```

### Task 3: Wire AGENTS.md to shared contracts

**User Verification: not-required**

**Files:**
- Modify: `AGENTS.md`

**Step 1: Write failing reference check**

Run:
```bash
rg -n "_shared/workflow-contract|_shared/unity-resource-binding-contract|_shared/unity-ui-trace-contract" AGENTS.md -S
```
Expected: no matches before update.

**Step 2: Add mandatory contract reference block under Always Start Here**

Insert concise block like:

```markdown
6. **Apply shared workflow contracts (mandatory):**
   - `.agents/skills/gitnexus/_shared/workflow-contract.md`
   - `.agents/skills/gitnexus/_shared/unity-resource-binding-contract.md`
   - `.agents/skills/gitnexus/_shared/unity-ui-trace-contract.md`
```

**Step 3: Verify references**

Run: `rg -n "Apply shared workflow contracts|_shared/" AGENTS.md -S`
Expected: all three shared contracts referenced.

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): require shared gitnexus workflow contracts"
```

### Task 4: Clarify guide and cli role boundaries

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`

**Step 1: Add guide role statement + references to shared contracts**

Guide must explicitly say:

```markdown
- This file is routing/index guidance.
- Scenario execution rules come from `_shared/*` contracts.
```

**Step 2: Add cli role statement to prevent strategy duplication**

CLI must explicitly say:

```markdown
- This file is command-operation manual.
- For scenario decision logic, follow `gitnexus-guide` + `_shared` contracts.
```

**Step 3: Verify boundary markers**

Run:
```bash
rg -n "routing/index|command-operation manual|_shared/workflow-contract" \
  .agents/skills/gitnexus/gitnexus-guide/SKILL.md \
  .agents/skills/gitnexus/gitnexus-cli/SKILL.md -S
```
Expected: boundary text present in both files.

**Step 4: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-guide/SKILL.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md
git commit -m "docs(skills): clarify guide vs cli boundaries and shared contract routing"
```

### Task 5: Update exploring workflow with both Unity trigger paths

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`

**Step 1: Add workflow branches for two triggers**

Required additions:

```markdown
- If lifecycle meaning depends on Unity serialized/resource binding state, follow `_shared/unity-resource-binding-contract.md`.
- If question concerns UIToolkit visual semantics, follow `_shared/unity-ui-trace-contract.md`.
```

**Step 2: Add checklist gates (must-run once triggered)**

Checklist should include explicit "must run" phrasing, not optional wording.

**Step 3: Verify presence**

Run:
```bash
rg -n "unity-resource-binding-contract|unity-ui-trace-contract|UIToolkit|must" .agents/skills/gitnexus/gitnexus-exploring/SKILL.md -S
```
Expected: both contracts and trigger language exist.

**Step 4: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-exploring/SKILL.md
git commit -m "docs(exploring): add unity binding and ui-trace trigger contracts"
```

### Task 6: Update debugging workflow with both Unity trigger paths

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md`

**Step 1: Add debug pattern for UIToolkit visual-semantic issues**

Example snippet:

```markdown
UI semantic failure path:
1) asset_refs
2) template_refs
3) selector_bindings
4) strict re-check when ambiguity remains
```

**Step 2: Add binding escalation path for lifecycle ambiguity**

Ensure compact->parity completeness gate is referenced via shared contract.

**Step 3: Verify presence**

Run:
```bash
rg -n "unity-resource-binding-contract|unity-ui-trace-contract|selector_bindings|needsParityRetry" .agents/skills/gitnexus/gitnexus-debugging/SKILL.md -S
```
Expected: all keywords matched.

**Step 4: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-debugging/SKILL.md
git commit -m "docs(debugging): add unity binding and ui semantic trace workflows"
```

### Task 7: Align impact/refactoring/pr-review with shared Unity triggers

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-pr-review/SKILL.md`

**Step 1: Add conditional trigger clauses in each workflow/checklist**

Required condition text pattern:

```markdown
If analysis touches Unity serialized/binding-state interpretation, apply `_shared/unity-resource-binding-contract.md`.
If analysis touches UIToolkit visual semantics, apply `_shared/unity-ui-trace-contract.md`.
```

**Step 2: Verify all three files include both references**

Run:
```bash
for f in \
  .agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md \
  .agents/skills/gitnexus/gitnexus-refactoring/SKILL.md \
  .agents/skills/gitnexus/gitnexus-pr-review/SKILL.md; do
  echo "== $f";
  rg -n "unity-resource-binding-contract|unity-ui-trace-contract" "$f" -S;
done
```
Expected: two matches per file minimum.

**Step 3: Commit**

```bash
git add \
  .agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md \
  .agents/skills/gitnexus/gitnexus-refactoring/SKILL.md \
  .agents/skills/gitnexus/gitnexus-pr-review/SKILL.md
git commit -m "docs(skills): align impact/refactoring/pr-review with shared unity trigger contracts"
```

### Task 8: Run matrix consistency verification

**User Verification: required**

**Files:**
- Modify: none (verification only)

**Step 1: Run consistency checks for priority and contract links**

Run:
```bash
rg -n "MCP|CLI|_shared/workflow-contract|_shared/unity-resource-binding-contract|_shared/unity-ui-trace-contract" \
  AGENTS.md \
  .agents/skills/gitnexus/gitnexus-*/SKILL.md -S
```
Expected: all skill files reference shared contracts where applicable.

**Step 2: Run focused checks for exploring/debugging triggers**

Run:
```bash
rg -n "UIToolkit|visual semantics|selector_bindings|needsParityRetry" \
  .agents/skills/gitnexus/gitnexus-exploring/SKILL.md \
  .agents/skills/gitnexus/gitnexus-debugging/SKILL.md -S
```
Expected: explicit trigger criteria and workflow sequence present.

**Step 3: Human review checkpoint**

Reviewer confirms:
- no contradictory guidance between guide and cli,
- scenario skills no longer duplicate long strategy prose,
- shared contracts are understandable standalone.

**Step 4: Commit verification note**

```bash
git add -A
git commit -m "docs(skills): verify main-matrix workflow consistency"
```

### Task 9: Final delivery summary and handoff

**User Verification: required**

**Files:**
- Modify: none (report output)

**Step 1: Produce final change summary with file list and key behavioral changes**

Include:
- new shared contracts,
- updated trigger behavior,
- MCP-first + CLI fallback enforcement points.

**Step 2: Provide operator-facing quickstart examples**

Include one example each for:
- backend-only question path,
- Unity binding ambiguity path,
- UIToolkit visual-semantic path.

**Step 3: Recommend follow-up mirror sync (out of current scope)**

Document optional next phase:
- apply same contract model to `gitnexus-claude-plugin` and `gitnexus-cursor-integration` skill mirrors.

**Step 4: Final commit if any report artifacts were saved**

```bash
git add <report-files-if-any>
git commit -m "docs: add rollout summary for main skill matrix workflow"
```
