# Gap-Lab Residual Removal and Direct Rule Flow Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all gap-lab residual surfaces from product-facing code/docs/skills, and make the verified direct flow (`approved -> compile -> analyze -> CLI validation`) the only public workflow.

**Architecture:** This change removes gap-lab code paths and handoff-era data contracts end-to-end (CLI, MCP, rule-lab model fields, docs, and skill contracts). The runtime pipeline remains unchanged: analyze-time still loads `analyze_rules` from approved/compiled artifacts. Rule authoring guidance is simplified to direct authoring and compile, avoiding run/slice orchestration as a required operator path.

**Tech Stack:** TypeScript, Vitest, Commander CLI, MCP local backend, Markdown skills/docs.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Remove all product-facing gap-lab entrypoints (CLI + MCP) | critical | Task 1, Task 2 | `npx --prefix gitnexus vitest run gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts -t "no gap-lab|no discover"` | `gitnexus/src/cli/index.ts`, `gitnexus/src/mcp/tools.ts:GITNEXUS_TOOLS[]` | `gap-lab` command or `rule_lab_discover` still appears
DC-02 Remove gap-handoff lineage model from reduced rule-lab | critical | Task 3, Task 4 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/review-pack.test.ts` | `gitnexus/src/rule-lab/types.ts`, `gitnexus/src/rule-lab/review-pack.ts` | `source_gap_*` fields still present or required by tests
DC-03 Public operator docs/skills expose only direct flow | critical | Task 5, Task 6 | `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts` | `docs/gap-lab-rule-lab-architecture.md`, `gitnexus/skills/gitnexus-unity-rule-gen.md` | docs still require run/slice/gap-lab orchestration
DC-04 Setup-distributed skill contracts remain source/install consistent after rename | critical | Task 6 | `diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md && diff -u gitnexus/skills/_shared/unity-rule-authoring-contract.md .agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` | `AGENTS.md` setup mapping table, source/install skill files | source/install drift or stale `unity-gap-lab-contract.md` reference
DC-05 Runtime behavior for direct flow is unchanged (compile+analyze still injects rules) | critical | Task 7 | `node gitnexus/dist/cli/index.js rule-lab compile --repo-path /Volumes/Shuttle/unity-projects/neonspark --family analyze_rules && node gitnexus/dist/cli/index.js analyze -f /Volumes/Shuttle/unity-projects/neonspark && node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason STARTS WITH 'unity-rule-' RETURN count(*) AS cnt"` | `/Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/{approved,catalog.json,compiled/analyze_rules.v2.json}`, cypher count | compile/analyze fails or rule-injected CALLS count is zero

## Authenticity Assertions

1. Assert no placeholder path: no docs/skills command examples contain `<run_id>/<slice_id>` as required operator input.
2. Assert live mode has tool evidence: direct flow docs must include executable `rule-lab compile`, `analyze`, and `cypher` commands.
3. Assert freeze requires non-empty confirmed_chain.steps equivalent guard: reduced rule-lab guard tests must still fail when evidence is empty.
4. Assert no hidden fallback surface: CLI help and MCP tool list must not expose `gap-lab` or `rule_lab_discover` after cleanup.

### Task 1: Lock the New Public Surface Contract in Tests

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/rule-lab.test.ts`
- Modify: `gitnexus/test/unit/tools.test.ts`
- Modify: `gitnexus/test/unit/rule-lab-tools.test.ts`
- Create: `gitnexus/test/integration/no-gap-lab-surface.test.ts`

**Step 1: Write the failing test**

```ts
it('does not expose gap-lab or rule_lab_discover surfaces', () => {
  expect(getRuleLabCommandNames(program)).not.toContain('discover');
  expect(GITNEXUS_TOOLS.map(t => t.name)).not.toContain('rule_lab_discover');
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts gitnexus/test/integration/no-gap-lab-surface.test.ts`
Expected: FAIL, current code still exposes `discover`/`rule_lab_discover`.

**Step 3: Write minimal implementation**

```ts
// rule-lab.test.ts expected commands
expect(cmds).toEqual(['analyze', 'review-pack', 'curate', 'promote', 'regress', 'compile']);

// tools.test.ts expected names must not include rule_lab_discover
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts gitnexus/test/integration/no-gap-lab-surface.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts gitnexus/test/integration/no-gap-lab-surface.test.ts
git commit -m "test(rule-lab): lock no-gap-lab public surface contract"
```

### Task 2: Remove CLI and MCP Gap-Lab/Discover Entry Points

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/rule-lab.ts`
- Delete: `gitnexus/src/cli/gap-lab.ts`
- Delete: `gitnexus/src/cli/gap-lab.test.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`

**Step 1: Write the failing test**

```ts
expect(program.commands.map(c => c.name())).not.toContain('gap-lab');
expect(GITNEXUS_TOOLS.map(t => t.name())).not.toContain('rule_lab_discover');
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts`
Expected: FAIL before removal.

**Step 3: Write minimal implementation**

```ts
// cli/index.ts
// remove: import { attachGapLabCommands } from './gap-lab.js';
// remove: attachGapLabCommands(program, ...)

// cli/rule-lab.ts
// remove discover command + handler + imports

// mcp/tools.ts + local-backend.ts
// remove rule_lab_discover schema and dispatch branch
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/index.ts gitnexus/src/cli/rule-lab.ts gitnexus/src/mcp/tools.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/cli/rule-lab.test.ts gitnexus/test/unit/tools.test.ts gitnexus/test/unit/rule-lab-tools.test.ts
git rm gitnexus/src/cli/gap-lab.ts gitnexus/src/cli/gap-lab.test.ts
git commit -m "refactor(cli,mcp): remove gap-lab and discover entrypoints"
```

### Task 3: Remove Gap-Lab Engine and Legacy Integration Tests

**User Verification: not-required**

**Files:**
- Delete: `gitnexus/src/gap-lab/candidate-audit.ts`
- Delete: `gitnexus/src/gap-lab/candidate-resolver.ts`
- Delete: `gitnexus/src/gap-lab/coverage-gate.ts`
- Delete: `gitnexus/src/gap-lab/exhaustive-scanner.ts`
- Delete: `gitnexus/src/gap-lab/missing-edge-verifier.ts`
- Delete: `gitnexus/src/gap-lab/parity-gate.ts`
- Delete: `gitnexus/src/gap-lab/pattern-library.ts`
- Delete: `gitnexus/src/gap-lab/rule-coverage-lookup.ts`
- Delete: `gitnexus/src/gap-lab/run.ts`
- Delete: `gitnexus/src/gap-lab/scope-classifier.ts`
- Delete: `gitnexus/src/gap-lab/slim-artifacts.ts`
- Delete: `gitnexus/src/gap-lab/syncvar-source-anchor-recovery.ts`
- Delete: `gitnexus/src/gap-lab/*.test.ts`
- Delete: `gitnexus/test/unit/gap-lab/*.test.ts`
- Delete: `gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts`
- Delete: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

**Step 1: Write the failing test**

```ts
it('no source file imports src/gap-lab modules', async () => {
  // grep-based assertion over src/ and test/
});
```

**Step 2: Run test to verify it fails**

Run: `rg -n "src/gap-lab|../gap-lab|./gap-lab" gitnexus/src gitnexus/test -S`
Expected: non-empty output before deletion.

**Step 3: Write minimal implementation**

```ts
// delete module tree and dependent tests after Task 2 removed entrypoints
```

**Step 4: Run test to verify it passes**

Run: `rg -n "src/gap-lab|../gap-lab|./gap-lab" gitnexus/src gitnexus/test -S`
Expected: empty output.

**Step 5: Commit**

```bash
git rm -r gitnexus/src/gap-lab gitnexus/test/unit/gap-lab gitnexus/test/integration/gap-lab-exhaustive-discovery.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts
git commit -m "chore: remove legacy gap-lab engine and tests"
```

### Task 4: Remove Gap-Handoff Lineage Fields from Reduced Rule-Lab

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/types.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Delete: `gitnexus/src/rule-lab/gap-handoff.ts`
- Delete: `gitnexus/src/rule-lab/gap-handoff.test.ts`

**Step 1: Write the failing test**

```ts
expect(persistedReviewPack).not.toContain('source_gap_handoff');
expect(persistedReviewPack).not.toContain('source_gap_candidate_ids');
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/analyze.test.ts`
Expected: FAIL before field removal.

**Step 3: Write minimal implementation**

```ts
// types.ts
// remove RuleLabSourceGapHandoff, source_gap_handoff, source_gap_candidate_ids

// review-pack.ts
// remove Handoff Summary and source_gap_candidate_ids collection/rendering
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/analyze.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/review-pack.ts gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/analyze.test.ts
git rm gitnexus/src/rule-lab/gap-handoff.ts gitnexus/src/rule-lab/gap-handoff.test.ts
git commit -m "refactor(rule-lab): drop gap-handoff lineage fields"
```

### Task 5: Rewrite SSOT and Workflow Docs to Direct Flow

**User Verification: required**

**Human Verification Checklist:**
- `docs/gap-lab-rule-lab-architecture.md` states direct flow as only public path.
- `docs/unity-runtime-process-source-of-truth.md` no longer frames gap-lab as compatibility workflow.
- `docs/gitnexus-config-files.md` no longer lists `.gitnexus/gap-lab/runs/**` in active ownership table.
- `gitnexus/skills/gitnexus-guide.md` no longer recommends/mentions gap-lab workflow.
- `gitnexus/skills/gitnexus-unity-rule-gen.md` examples are direct flow commands (`approved -> compile -> analyze -> cli verify`).

**Acceptance Criteria:**
- Each checklist item is directly visible in file content and passes grep checks below.

**Failure Signals:**
- Any primary doc/skill still contains required operator guidance with `gap-lab`, `run-id/slice-id` handoff chain, or `.gitnexus/gap-lab/runs/**` as active path.

**User Decision Prompt:**
- `请只回复：通过 或 不通过。`

**Files:**
- Modify: `docs/gap-lab-rule-lab-architecture.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/gitnexus-config-files.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`

**Step 1: Write the failing test**

```ts
expect(docText).not.toMatch(/\.gitnexus\/gap-lab\/runs\*\*/i);
expect(skillText).toMatch(/rule-lab compile/i);
expect(skillText).not.toMatch(/gap-lab run/i);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: FAIL with current gap-lab assertions.

**Step 3: Write minimal implementation**

```md
# Unity Rule Authoring (Direct Flow)
1. edit approved yaml
2. gitnexus rule-lab compile --family analyze_rules
3. gitnexus analyze -f <repo>
4. gitnexus cypher ... validate injected edges
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: PASS with updated direct-flow assertions.

**Step 5: Commit**

```bash
git add docs/gap-lab-rule-lab-architecture.md docs/unity-runtime-process-source-of-truth.md docs/gitnexus-config-files.md gitnexus/skills/gitnexus-guide.md gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs: switch public workflow to direct rule authoring flow"
```

### Task 6: Rename Shared Skill Contract and Sync Setup/Installed Copies

**User Verification: required**

**Human Verification Checklist:**
- Shared contract filename is `unity-rule-authoring-contract.md` in both source and installed skills.
- `AGENTS.md` setup index points to the new contract filename.
- `gitnexus-unity-rule-gen` source and installed copies remain byte-identical.
- No references to `unity-gap-lab-contract.md` remain in active skill docs.

**Acceptance Criteria:**
- `diff -u` checks are empty and grep for old contract name is empty in active skill paths.

**Failure Signals:**
- Missing contract in installed path, stale old filename in AGENTS/setup maps, or source/install drift.

**User Decision Prompt:**
- `请只回复：通过 或 不通过。`

**Files:**
- Create: `gitnexus/skills/_shared/unity-rule-authoring-contract.md`
- Delete: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Create: `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
- Delete: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
- Modify: `AGENTS.md`
- Modify: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts` (rename + rewrite)
- Create: `gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts`
- Delete: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing test**

```ts
expect(fs.existsSync('gitnexus/skills/_shared/unity-rule-authoring-contract.md')).toBe(true);
expect(activeSkillText).not.toMatch(/unity-gap-lab-contract\.md/);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts`
Expected: FAIL before rename/sync.

**Step 3: Write minimal implementation**

```md
# Unity Rule Authoring Contract
- exact pair input
- fail-closed binding
- non-empty evidence
- direct compile + analyze verification
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add AGENTS.md gitnexus/skills/_shared/unity-rule-authoring-contract.md .agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts
git rm gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "refactor(skills): rename and enforce unity rule authoring shared contract"
```

### Task 7: Validate Direct Flow Still Works on neonspark

**User Verification: not-required**

**Files:**
- Modify: `docs/reports/2026-04-13-gap-lab-removal-direct-flow-validation.md`

**Step 1: Write the failing test**

```bash
# semantic assertion should fail if no injected edges exist
node -e "if (Number(process.env.CALLS_CNT||0) <= 0) throw new Error('no injected calls');"
```

**Step 2: Run test to verify it fails (pre-change baseline optional)**

Run: `node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason STARTS WITH 'unity-rule-' RETURN count(*) AS cnt"`
Expected: capture baseline count for comparison.

**Step 3: Write minimal implementation**

```bash
node gitnexus/dist/cli/index.js rule-lab compile --repo-path /Volumes/Shuttle/unity-projects/neonspark --family analyze_rules
node gitnexus/dist/cli/index.js analyze -f /Volumes/Shuttle/unity-projects/neonspark
```

**Step 4: Run test to verify it passes**

Run: `node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason STARTS WITH 'unity-rule-' RETURN count(*) AS cnt"`
Expected: `cnt > 0` and report recorded.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-13-gap-lab-removal-direct-flow-validation.md
git commit -m "test: verify direct compile-analyze flow after gap-lab removal"
```

### Task 8: Final Cleanup Guard and Release Notes

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/CHANGELOG.md`
- Modify: `docs/gap-lab-rule-lab-architecture.md` (migration note section)

**Step 1: Write the failing test**

```bash
rg -n "gap-lab" gitnexus/src gitnexus/skills AGENTS.md docs/*.md -S
# expected to return 0 matches in active operator docs/surfaces
```

**Step 2: Run test to verify it fails**

Run: `rg -n "gap-lab" gitnexus/src gitnexus/skills AGENTS.md docs/*.md -S`
Expected: FAIL before final cleanup.

**Step 3: Write minimal implementation**

```md
## [Unreleased]
- BREAKING: removed gap-lab surfaces and discover entrypoint
- Direct rule flow is now the only public workflow
```

**Step 4: Run test to verify it passes**

Run: `rg -n "gap-lab" gitnexus/src gitnexus/skills AGENTS.md docs/*.md -S`
Expected: only archived historical docs or explicit migration note remain.

**Step 5: Commit**

```bash
git add gitnexus/CHANGELOG.md docs/gap-lab-rule-lab-architecture.md
git commit -m "chore: add final no-gap-lab cleanup guard and migration notes"
```

## Plan Quality Check (Optional, Non-Blocking)

- Critical clauses all map to concrete tasks and executable commands.
- Negative assertions cover fake compliance risks (placeholder paths, hidden legacy surfaces, empty evidence guard regression).
- Verification commands include semantic evidence fields, not file-existence-only checks.

