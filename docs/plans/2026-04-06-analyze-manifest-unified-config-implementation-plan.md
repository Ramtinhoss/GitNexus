# Analyze Manifest Unified Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `--scope-manifest` 成为 analyze 的稳定配置入口，同时支持路径范围与扩展名/alias/embeddings 指令，降低参数遗漏导致的索引漂移。

**Architecture:** 在现有 `scope-manifest` 文本格式上引入兼容扩展：新增 `@key=value` 指令并保持路径规则不变。`analyze-options` 在计算 effective options 时先解析 manifest 指令，再按“CLI > manifest > meta(reuse) > default”合并。`meta.json` 保持状态快照职责，不与 manifest 合并。

**Tech Stack:** TypeScript, Node.js, Commander CLI, node:test + assert, existing analyze pipeline.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Manifest supports `@extensions/@repoAlias/@embeddings` plus scope lines | critical | Task 1, Task 2 | `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts gitnexus/src/cli/analyze-options.test.ts` | `gitnexus/src/cli/scope-filter.test.ts:new directive parsing cases` | directive line treated as scope path or silently ignored
DC-02 Precedence is `CLI > manifest > meta(reuse) > default` | critical | Task 3 | `npm --prefix gitnexus run test -- gitnexus/src/cli/analyze-options.test.ts` | `gitnexus/src/cli/analyze-options.test.ts:resolveEffectiveAnalyzeOptions precedence cases` | CLI value fails to override manifest or meta value overrides manifest unexpectedly
DC-03 Unknown directives fail fast | critical | Task 2, Task 3 | `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts gitnexus/src/cli/analyze-options.test.ts` | `parse/resolve tests asserting thrown error` | unknown key accepted and analyze proceeds
DC-04 Backward compatibility for pure scope manifest | critical | Task 1, Task 4 | `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts gitnexus/src/cli/analyze-multi-scope-regression.test.ts` | `legacy scope cases unchanged` | existing pure-scope tests regress
DC-05 Docs and examples reflect new stable workflow | major | Task 5 | `rg -n "@extensions|--scope-manifest" docs/gitnexus-config-files.md docs/config-files/2026-04-06-analyze-manifest-unified-config-design.md` | `docs entries with precedence + examples` | docs still claim manifest only supports scope and omit directive behavior

## Authenticity Assertions

1. assert no placeholder path: test fixtures must use real repo-relative manifest content, not `TODO`/`<path>` placeholders.
2. assert live mode has tool evidence: precedence tests must verify actual resolved values (`includeExtensions`, `repoAlias`, `embeddings`, `scopeRules`), not only object key presence.
3. assert freeze requires non-empty confirmed_chain.steps (adapted): unknown-directive negative tests must assert explicit throw message, not generic pass/fail wrappers.

### Task 1: Extend Manifest Parser Contract

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/scope-filter.ts`
- Modify: `gitnexus/src/cli/scope-filter.test.ts`

**Step 1: Write the failing test**

```ts
test('parseScopeManifestConfig extracts directives and scope rules together', () => {
  const parsed = parseScopeManifestConfig(`Assets/\n@extensions=.cs,.meta\n@repoAlias=demo\n@embeddings=false`);
  assert.deepEqual(parsed.scopeRules, ['Assets']);
  assert.equal(parsed.directives.extensions, '.cs,.meta');
  assert.equal(parsed.directives.repoAlias, 'demo');
  assert.equal(parsed.directives.embeddings, 'false');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts`
Expected: FAIL with missing parser API / assertion mismatch.

**Step 3: Write minimal implementation**

```ts
export interface ScopeManifestDirectives { extensions?: string; repoAlias?: string; embeddings?: string }
export interface ScopeManifestConfig { scopeRules: string[]; directives: ScopeManifestDirectives }
```

Add parser to split directive lines and regular scope lines.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts`
Expected: PASS with all existing scope parsing tests still green.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/scope-filter.ts gitnexus/src/cli/scope-filter.test.ts
git commit -m "feat: parse analyze manifest directives with scope rules"
```

### Task 2: Add Negative Validation for Manifest Directives

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/scope-filter.ts`
- Modify: `gitnexus/src/cli/scope-filter.test.ts`

**Step 1: Write the failing test**

```ts
test('parseScopeManifestConfig rejects unknown directives', () => {
  assert.throws(() => parseScopeManifestConfig('Assets/\n@foo=bar'), /unknown manifest directive/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts -t "unknown directives"`
Expected: FAIL because parser currently accepts/ignores unknown key.

**Step 3: Write minimal implementation**

```ts
if (!SUPPORTED_KEYS.has(key)) {
  throw new Error(`Unknown manifest directive: ${key}`);
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/scope-filter.test.ts`
Expected: PASS with explicit throw message assertions.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/scope-filter.ts gitnexus/src/cli/scope-filter.test.ts
git commit -m "test: fail fast on unknown analyze manifest directives"
```

### Task 3: Wire Precedence into `resolveEffectiveAnalyzeOptions`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/analyze-options.ts`
- Modify: `gitnexus/src/cli/analyze-options.test.ts`

**Step 1: Write the failing test**

```ts
test('resolveEffectiveAnalyzeOptions uses manifest directives when CLI omits values', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions({ scopeManifest: manifestPath }, stored);
  assert.deepEqual(resolved.includeExtensions, ['.cs', '.meta']);
  assert.equal(resolved.repoAlias, 'neonspark-core');
  assert.equal(resolved.embeddings, false);
});
```

Add companion test proving CLI still overrides manifest.

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/analyze-options.test.ts`
Expected: FAIL because current logic only takes scope rules from manifest.

**Step 3: Write minimal implementation**

```ts
const manifest = options?.scopeManifest ? await parseScopeManifestConfigFile(options.scopeManifest) : null;
// merge: cli > manifest directives > stored (if reuse) > defaults
```

Keep `scopeRules` behavior backward compatible.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/analyze-options.test.ts`
Expected: PASS for precedence and negative cases.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze-options.ts gitnexus/src/cli/analyze-options.test.ts
git commit -m "feat: apply manifest directive precedence for analyze options"
```

### Task 4: Add End-to-End CLI Regression for Manifest-Only Analyze

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/analyze-multi-scope-regression.test.ts`
- Modify: `gitnexus/src/cli/analyze.ts` (only if needed for error surfacing)

**Step 1: Write the failing test**

```ts
test('analyze uses manifest directives without extra CLI flags', async () => {
  // fixture manifest contains scope + @extensions
  // assert resulting indexed file set reflects both filters
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/analyze-multi-scope-regression.test.ts`
Expected: FAIL before directive wiring is complete.

**Step 3: Write minimal implementation**

If Task 3 is correct, this should be test-only; only adjust analyze error text if assertion clarity is insufficient.

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run test -- gitnexus/src/cli/analyze-multi-scope-regression.test.ts`
Expected: PASS and no regressions in existing scope diagnostics.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze-multi-scope-regression.test.ts gitnexus/src/cli/analyze.ts
git commit -m "test: cover manifest-only analyze configuration stability"
```

### Task 5: Update Config Documentation

**User Verification: required**

**Human Verification Checklist:**
1. `docs/gitnexus-config-files.md` 明确新增 `@extensions/@repoAlias/@embeddings`。  
2. 文档优先级写明 `CLI > manifest > meta(reuse) > default`。  
3. 保留“`meta.json` 是状态快照、不可与 manifest 合并”的说明。  
4. 给出最小稳定命令示例（仅 `--scope-manifest`）。

**Acceptance Criteria:**
1. 能在文档中找到三种指令语法和含义。  
2. 能在文档中找到优先级顺序。  
3. 能在文档中找到“为何不合并 meta 与 manifest”。  
4. 复制示例命令即可表达推荐工作流。

**Failure Signals:**
1. 指令列表缺任一项。  
2. 优先级描述与实现不一致。  
3. 文档暗示可删除 `meta.json`。  
4. 示例仍要求必须显式传 `--extensions`。

**User Decision Prompt:**
`请仅回复“通过”或“不通过”：文档中的新配置设计和优先级是否符合你的预期？`

**Files:**
- Modify: `docs/gitnexus-config-files.md`
- Modify: `docs/config-files/2026-04-06-analyze-manifest-unified-config-design.md`

**Step 1: Write the failing test**

```bash
rg -n "@extensions|@repoAlias|@embeddings|CLI > manifest > meta" docs/gitnexus-config-files.md
# expect: no full matches before doc update
```

**Step 2: Run test to verify it fails**

Run: `rg -n "@extensions|@repoAlias|@embeddings|CLI > manifest > meta" docs/gitnexus-config-files.md`
Expected: FAIL / incomplete matches.

**Step 3: Write minimal implementation**

Add directive syntax, precedence, and migration snippet.

**Step 4: Run test to verify it passes**

Run: `rg -n "@extensions|@repoAlias|@embeddings|CLI > manifest > meta" docs/gitnexus-config-files.md docs/config-files/2026-04-06-analyze-manifest-unified-config-design.md`
Expected: PASS with all expected sections found.

**Step 5: Commit**

```bash
git add docs/gitnexus-config-files.md docs/config-files/2026-04-06-analyze-manifest-unified-config-design.md
git commit -m "docs: define unified analyze manifest directives and precedence"
```

## Plan Audit Verdict
audit_scope: [docs/config-files/2026-04-06-analyze-manifest-unified-config-design.md, docs/gitnexus-config-files.md, analyze manifest parsing + precedence requirements]
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- [P1] Independent subagent audit was not executed in this session due orchestration policy constraints; status: accepted
anti_placeholder_checks:
- negative tests require explicit unknown-directive error message, result: planned
- precedence tests require concrete value assertions (not key presence), result: planned
authenticity_checks:
- critical clauses mapped to task+command+evidence+failure signal, result: pass
- backward-compatibility regression gate present, result: pass
approval_decision: pass
