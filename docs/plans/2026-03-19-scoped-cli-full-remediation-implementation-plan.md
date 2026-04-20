# Scoped GitNexus CLI Full Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all unscoped/offical `gitnexus` npm invocations in production paths and fixtures with scoped `@veewo/gitnexus`, and enforce this through code generation, hooks, docs, and tests.

**Architecture:** Treat command strings as two categories: runtime executable entrypoints (hooks/scripts/setup output) and instructional text generators (AGENTS/CLAUDE/skills/README/fixtures). Runtime paths must be corrected first to stop future accidental execution; text/template paths must be corrected second to prevent reintroduction. Finally, tests and regression scans become the enforcement layer.

**Tech Stack:** TypeScript (CLI + tests), shell hooks, markdown docs/skills/templates, ripgrep, npm/npx command conventions.

---

### Task 1: Baseline inventory + failing guard tests

**Files:**
- Modify: `gitnexus/test/integration/hooks-e2e.test.ts`
- Modify: `gitnexus/src/cli/ai-context.test.ts`
- Create: `gitnexus/test/unit/scoped-cli-commands.test.ts`

**Step 1: Write failing tests for scoped command policy**

Add test coverage that fails when generated/help text still includes:
- `npx -y /npx -y /gitnexus analyze`
- `npx -y /gitnexus ...`
- `gitnexus@latest` (unscoped)

And expects scoped forms:
- `npx -y @veewo/gitnexus@latest ...`

**Step 2: Run target tests and verify fail**

Run:
```bash
npm --prefix gitnexus test -- hooks-e2e ai-context scoped-cli-commands
```
Expected: FAIL on old unscoped literals.

**Step 3: Commit (test-only checkpoint)**

```bash
git add gitnexus/test/integration/hooks-e2e.test.ts gitnexus/src/cli/ai-context.test.ts gitnexus/test/unit/scoped-cli-commands.test.ts
git commit -m "test(cli): add scoped command policy regression checks"
```

### Task 2: Fix command generators in core CLI code

**Files:**
- Modify: `gitnexus/src/cli/ai-context.ts`
- Modify: `gitnexus/src/mcp/resources.ts`
- Modify: `gitnexus/src/cli/setup.ts`
- Modify: `gitnexus/src/cli/setup.test.ts`

**Step 1: Replace unscoped command literals in generated context text**

Update AGENTS/CLAUDE guidance emitted by `ai-context.ts` and MCP `resources.ts` to scoped command literals.

**Step 2: Harden setup fallback package**

Change fallback package from `gitnexus@latest` to `@veewo/gitnexus@latest` so fallback path is safe.

**Step 3: Update setup tests for expected package spec**

Adjust assertions expecting `gitnexus@latest`.

**Step 4: Run focused tests**

Run:
```bash
npm --prefix gitnexus test -- setup ai-context resources
```
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/ai-context.ts gitnexus/src/mcp/resources.ts gitnexus/src/cli/setup.ts gitnexus/src/cli/setup.test.ts
git commit -m "fix(cli): use scoped package in generated guidance and setup fallback"
```

### Task 3: Fix production runtime hooks/scripts (actual execution paths)

**Files:**
- Modify: `gitnexus/hooks/claude/pre-tool-use.sh`
- Modify: `gitnexus/hooks/claude/gitnexus-hook.cjs`
- Modify: `gitnexus-cursor-integration/hooks/augment-shell.sh`
- Modify: `gitnexus-claude-plugin/hooks/gitnexus-hook.js`

**Step 1: Replace runtime command execution to scoped npx**

Replace all `npx (-y) gitnexus ...` with `npx -y @veewo/gitnexus@latest ...`.

**Step 2: Keep behavior unchanged except package target**

Do not alter hook trigger logic, timeout, or output format.

**Step 3: Run hook-related tests**

Run:
```bash
npm --prefix gitnexus test -- hooks
```
Expected: PASS.

**Step 4: Commit**

```bash
git add gitnexus/hooks/claude/pre-tool-use.sh gitnexus/hooks/claude/gitnexus-hook.cjs gitnexus-claude-plugin/hooks/gitnexus-hook.js gitnexus-cursor-integration/hooks/augment-shell.sh
git commit -m "fix(hooks): execute scoped @veewo/gitnexus commands"
```

### Task 4: Fix MCP config templates and plugin mcp manifests

**Files:**
- Modify: `.mcp.json`
- Modify: `gitnexus-claude-plugin/.mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-cli/mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-debugging/mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-exploring/mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-guide/mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-impact-analysis/mcp.json`
- Modify: `gitnexus-claude-plugin/skills/gitnexus-refactoring/mcp.json`

**Step 1: Replace all `gitnexus@latest mcp` with `@veewo/gitnexus@latest mcp`**

Ensure JSON remains valid.

**Step 2: Validate JSON files**

Run:
```bash
node -e 'for (const f of process.argv.slice(1)) JSON.parse(require("fs").readFileSync(f,"utf8"));' .mcp.json gitnexus-claude-plugin/.mcp.json gitnexus-claude-plugin/skills/gitnexus-*/mcp.json
```
Expected: no output, exit 0.

**Step 3: Commit**

```bash
git add .mcp.json gitnexus-claude-plugin/.mcp.json gitnexus-claude-plugin/skills/gitnexus-*/mcp.json
git commit -m "fix(mcp): switch templates and manifests to scoped package"
```

### Task 5: Fix all skills + AGENTS/CLAUDE production copies

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.agents/skills/gitnexus/*.md`
- Modify: `.agents/skills/gitnexus/*/SKILL.md`
- Modify: `.claude/skills/gitnexus/**/*.md`
- Modify: `gitnexus/skills/*.md`
- Modify: `gitnexus-claude-plugin/skills/*/SKILL.md`
- Modify: `gitnexus-cursor-integration/skills/*/SKILL.md`

**Step 1: Apply scoped replacements for actionable CLI commands**

Replace examples/instructions that recommend unscoped `npx -y /gitnexus ...`.

**Step 2: Preserve non-command narrative references where needed**

E.g., keep product name “GitNexus” unchanged; only adjust executable snippets.

**Step 3: Re-run grep gate on production paths**

Run:
```bash
rg -n 'npx( -y)? gitnexus|gitnexus@latest' AGENTS.md CLAUDE.md .agents .claude gitnexus/skills gitnexus-claude-plugin/skills gitnexus-cursor-integration/skills
```
Expected: 0 actionable command hits.

**Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md .agents .claude gitnexus/skills gitnexus-claude-plugin/skills gitnexus-cursor-integration/skills
git commit -m "docs(skills): standardize scoped @veewo/gitnexus command examples"
```

### Task 6: Fix fixtures and eval harnesses

**Files:**
- Modify: `benchmarks/fixtures/unity-mini/**`
- Modify: `gitnexus/src/core/unity/__fixtures__/mini-unity/**`
- Modify: `eval/bridge/gitnexus_tools.sh`
- Modify: `eval/bridge/mcp_bridge.py`
- Modify: `eval/environments/gitnexus_docker.py`
- Modify: `eval/README.md`

**Step 1: Replace fixture docs/skills command examples to scoped form**

These are not production runtime, but are test/acceptance inputs and must be consistent.

**Step 2: Update eval script runtime commands to scoped npx calls**

Ensure tool bridge and docker environment use scoped package for query/context/impact/analyze/eval-server.

**Step 3: Run eval-related tests (if present) + shell syntax checks**

Run:
```bash
bash -n eval/bridge/gitnexus_tools.sh gitnexus/hooks/claude/pre-tool-use.sh gitnexus-cursor-integration/hooks/augment-shell.sh
npm --prefix gitnexus test -- benchmark eval-server || true
```
Expected: shell checks pass; report any unavailable tests explicitly.

**Step 4: Commit**

```bash
git add benchmarks/fixtures/unity-mini gitnexus/src/core/unity/__fixtures__/mini-unity eval/bridge eval/environments eval/README.md
git commit -m "test(eval): align fixtures and eval harness with scoped package commands"
```

### Task 7: Fix top-level docs and product READMEs

**Files:**
- Modify: `README.md`
- Modify: `gitnexus/README.md`
- Modify: `INSTALL-GUIDE.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/**/*.md` (only actionable command snippets)

**Step 1: Replace unscoped actionable snippets**

Convert command blocks and MCP setup examples to scoped package invocation.

**Step 2: Keep compatibility note**

Add one short note: global binary `gitnexus` may still work after global install, but canonical docs use scoped `npx -y @veewo/gitnexus@latest ...` to avoid package ambiguity.

**Step 3: Run targeted grep validation for docs**

Run:
```bash
rg -n 'npx( -y)? gitnexus|gitnexus@latest' README.md gitnexus/README.md INSTALL-GUIDE.md CHANGELOG.md docs
```
Expected: only intentional historical references remain (if any), each annotated.

**Step 4: Commit**

```bash
git add README.md gitnexus/README.md INSTALL-GUIDE.md CHANGELOG.md docs
git commit -m "docs: remove unscoped gitnexus command guidance"
```

### Task 8: Global verification + regression report

**Files:**
- Create: `docs/reports/2026-03-19-scoped-cli-remediation-report.md`

**Step 1: Run final full-repo audit scans**

Run:
```bash
rg -n --hidden --glob '!.git' 'npx( -y)? gitnexus|gitnexus@latest'
rg -n --hidden --glob '!.git' '@veewo/gitnexus@latest|npx -y @veewo/gitnexus@latest'
```
Expected:
- First scan: no production actionable command paths left.
- Second scan: scoped usage present across workflows.

**Step 2: Run project test subset used by this remediation**

Run:
```bash
npm --prefix gitnexus test -- setup ai-context hooks resources
```
Expected: PASS.

**Step 3: Write report with residual exceptions**

Document any intentionally retained unscoped references (e.g., historical changelog quotes) with rationale.

**Step 4: Commit**

```bash
git add docs/reports/2026-03-19-scoped-cli-remediation-report.md
git commit -m "chore: add scoped cli remediation verification report"
```

---

## Acceptance Criteria

- All production workflow entrypoints execute scoped package commands.
- AGENTS/CLAUDE/skills no longer instruct unscoped commands.
- MCP config templates/manifests no longer use `gitnexus@latest`.
- Fixtures/eval harnesses are aligned and pass syntax/test checks.
- Regression tests enforce scoped command policy.

## Rollback Strategy

- Revert by task-level commits if a specific integration breaks.
- Keep Task 1 tests to prevent accidental regression on future merges.

## Risk Notes

- Large doc/fixture touch set can cause merge conflicts; use small commits by task.
- Some historical docs may intentionally mention legacy commands; annotate explicitly instead of silent retention.
- Eval environment behavior may differ by network/cache; report non-deterministic failures with raw output.
