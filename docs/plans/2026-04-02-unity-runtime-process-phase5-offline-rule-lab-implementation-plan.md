# Unity Runtime Process Phase 5 Offline Rule Lab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-usable offline Rule Lab pipeline for Unity runtime-process rule discovery, slice analysis, human curation, promotion, and regression verification, with artifacts persisted under `.gitnexus/rules/**` and immediate verifier consumption.

**Architecture:** Implement Rule Lab as a new TypeScript module set under `gitnexus/src/rule-lab/` with deterministic JSON artifact contracts and idempotent file writes. Expose the workflow through CLI (`gitnexus rule-lab ...`) as the primary interface, then add MCP tool wrappers so agents can run the same lifecycle in-session. Add acceptance runners + authenticity gates to ensure outputs are semantically valid (not structure-only placeholders) and immediately loadable by runtime claim verification.

**Tech Stack:** TypeScript, Node.js fs/path APIs, Commander CLI, MCP local backend/tool schema, Vitest + node:test, benchmark `u2-e2e` runners, repo-local `.gitnexus/rules/**` artifacts.

**Preflight Assumption:** `using-superpowers` preflight is satisfied for this session and execution can proceed in the current checkout (`worktree-exempt=true`).

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-P5-01: Rule Lab must provide six lifecycle entrypoints (`discover/analyze/review-pack/curate/promote/regress`) via CLI | critical | Task 7, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/cli/rule-lab.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/manifest.json:stages[]` | any stage command missing or writes no stage marker
DC-P5-02: discover+analyze must persist deterministic slice artifacts under `.gitnexus/rules/lab/runs/**` | critical | Task 2, Task 3 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts gitnexus/src/rule-lab/analyze.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/manifest.json`, `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/candidates.jsonl` | missing manifest/slice files or unstable IDs for same input
DC-P5-03: review-pack must enforce per-pack token budget (`<=6000`) and emit truncation diagnostics | critical | Task 4 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/review-pack.test.ts` | `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/review-cards.md:meta.token_budget_estimate` | token estimate > 6000 without split/truncation metadata
DC-P5-04: curate+promote must reject placeholder/empty semantic closure and only promote confirmed candidates | critical | Task 5, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts` | `.gitnexus/rules/approved/*.yaml`, `.gitnexus/rules/catalog.json`, curated input `confirmed_chain.steps` | placeholder values accepted, or promoted rule lacks non-empty confirmed chain steps
DC-P5-05: promoted rules must be immediately loadable by runtime verifier and reflected in runtime_claim fields | critical | Task 6, Task 10 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase5 rule-lab promoted rule is loadable"` | query/context output `runtime_claim.rule_id`, `runtime_claim.scope`, `runtime_claim.hops` | promoted rule exists on disk but runtime_claim remains `rule_not_matched`
DC-P5-06: regress stage must compute precision/coverage and fail promotion gate if below threshold (`precision<0.90` or `coverage<0.80`) | critical | Task 7 | `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts` | `.gitnexus/rules/reports/<run_id>-regress.md:metrics.precision, metrics.coverage` | thresholds not enforced or report missing numeric metrics
DC-P5-07: Phase 5 acceptance runner must provide reproducible end-to-end evidence and explicit failure signals | critical | Task 11 | `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.js` | `docs/reports/2026-04-02-phase5-rule-lab-acceptance.json` | acceptance report passes while mandatory stages or metrics are missing
DC-P5-08: docs/config contracts must match implemented ownership and artifact schema | critical | Task 12 | `npm --prefix gitnexus exec vitest run gitnexus/test/integration/rule-lab-contracts.test.ts` | `docs/gitnexus-config-files.md`, `docs/unity-runtime-process-source-of-truth.md` | docs state diverges from implemented path/ownership/contract fields

## Authenticity Assertions

- `assert no placeholder path`: fail if promoted YAML, catalog entry, or review card contains `TODO|TBD|placeholder|<...>`.
- `assert live mode has tool evidence`: fail if `rule-lab regress` reports metrics without listing source artifacts and command provenance.
- `assert freeze requires non-empty confirmed_chain.steps`: fail promotion when curated item lacks `confirmed_chain.steps[0]`.
- `assert semantic closure over structure-only`: fail if candidate has fields present but no hop anchors (`anchor` + `snippet`) in confirmed chain.
- `assert verifier load reality`: fail if promoted rule exists but on-demand `runtime_claim` cannot resolve the promoted `rule_id`.

### Task 1: Rule Lab Core Types + Artifact Paths

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/types.ts`
- Create: `gitnexus/src/rule-lab/paths.ts`
- Create: `gitnexus/src/rule-lab/paths.test.ts`
- Modify: `gitnexus/src/cli/index.ts`

**Step 1: Write the failing test**

```ts
import { buildRunId, getRuleLabPaths } from './paths.js';

it('builds deterministic run/slice paths under .gitnexus/rules/lab/runs', () => {
  const runId = buildRunId({ repo: 'GitNexus', scope: 'full', seed: 'abc' });
  const p = getRuleLabPaths('/repo', runId, 'slice-a');
  expect(p.manifestPath).toContain('/.gitnexus/rules/lab/runs/');
  expect(p.candidatesPath).toContain('/slices/slice-a/candidates.jsonl');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/paths.test.ts`
Expected: FAIL (`rule-lab` path helpers do not exist).

**Step 3: Write minimal implementation**

```ts
export function buildRunId(input: { repo: string; scope: 'full'|'diff'; seed: string }): string {
  return createHash('sha1').update(`${input.repo}:${input.scope}:${input.seed}`).digest('hex').slice(0, 12);
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/paths.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/paths.ts gitnexus/src/rule-lab/paths.test.ts gitnexus/src/cli/index.ts
git commit -m "feat(rule-lab): add core artifact types and deterministic path helpers"
```

### Task 2: `rule-lab discover` (Manifest + Slice Enumeration)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/discover.ts`
- Create: `gitnexus/src/rule-lab/discover.test.ts`
- Modify: `docs/gitnexus-config-files.md`

**Step 1: Write the failing test**

```ts
it('writes manifest with slices and next_actions', async () => {
  const out = await discoverRuleLabRun({ repoPath: fixtureRepo, scope: 'full' });
  expect(out.manifest.slices.length).toBeGreaterThan(0);
  expect(out.manifest.next_actions).toContain('rule-lab analyze');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts`
Expected: FAIL (`discoverRuleLabRun` missing).

**Step 3: Write minimal implementation**

```ts
export async function discoverRuleLabRun(input: DiscoverInput): Promise<DiscoverOutput> {
  // enumerate scope by path/resource-type/host-base-type buckets and persist manifest
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/discover.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/discover.ts gitnexus/src/rule-lab/discover.test.ts docs/gitnexus-config-files.md
git commit -m "feat(rule-lab): implement discover stage with manifest and slice list"
```

### Task 3: `rule-lab analyze` (Candidate Extraction Per Slice)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/analyze.ts`
- Create: `gitnexus/src/rule-lab/analyze.test.ts`
- Create: `gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json`

**Step 1: Write the failing test**

```ts
it('writes candidates.jsonl with anchor-backed candidates', async () => {
  const result = await analyzeRuleLabSlice({ repoPath: fixtureRepo, runId: 'run-x', sliceId: 'slice-a' });
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates[0].evidence.hops[0].anchor).toMatch(/:\d+$/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/analyze.test.ts`
Expected: FAIL (`analyzeRuleLabSlice` missing).

**Step 3: Write minimal implementation**

```ts
export async function analyzeRuleLabSlice(input: AnalyzeInput): Promise<AnalyzeOutput> {
  // read slice config, query graph/resource evidence, emit candidates.jsonl
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/analyze.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json
git commit -m "feat(rule-lab): implement analyze stage and candidate extraction"
```

### Task 4: `rule-lab review-pack` (Token Budget and Card Packing)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/review-pack.ts`
- Create: `gitnexus/src/rule-lab/review-pack.test.ts`

**Step 1: Write the failing test**

```ts
it('splits cards to keep token budget <= 6000', async () => {
  const out = await buildReviewPack({ runId: 'run-x', sliceId: 'slice-a', maxTokens: 6000 });
  expect(out.meta.token_budget_estimate).toBeLessThanOrEqual(6000);
  expect(out.meta.truncated || out.cards.length > 0).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/review-pack.test.ts`
Expected: FAIL (review-pack stage not implemented).

**Step 3: Write minimal implementation**

```ts
export async function buildReviewPack(input: ReviewPackInput): Promise<ReviewPackOutput> {
  // pack 3-4 candidates/card, estimate tokens, split/truncate with diagnostics
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/review-pack.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/review-pack.ts gitnexus/src/rule-lab/review-pack.test.ts
git commit -m "feat(rule-lab): add review-pack generator with token budget enforcement"
```

### Task 5: `rule-lab curate` (Human Semantic Confirmation)

**User Verification: required**

**Human Verification Checklist:**
- Review card中的候选命名是否可读且语义明确。
- 每条确认候选是否具备非空 `confirmed_chain.steps`。
- `guarantees` 与 `non_guarantees` 是否能区分“确认能力”与“非保证能力”。
- 是否存在明显 placeholder 文本（TODO/TBD/<...>）。

**Acceptance Criteria:**
- 每个 checklist 项都被判定为“满足”，否则不能进入 promote。
- 至少 1 条 curated 记录可进入 promote，且每条都包含 `confirmed_chain.steps`。
- `guarantees`/`non_guarantees` 至少各 1 条非空语义项。
- placeholder 检查结果为 0 命中。

**Failure Signals:**
- 任一 curated 项 `confirmed_chain.steps.length === 0`。
- `guarantees` 与 `non_guarantees` 为空或重复无语义区分。
- review/curate 产物出现 `TODO|TBD|placeholder|<...>`。

**User Decision Prompt:**
- `请只回复“通过”或“不通过”：以上 Rule Lab curate 语义审阅是否通过？`

**Files:**
- Create: `gitnexus/src/rule-lab/curate.ts`
- Create: `gitnexus/src/rule-lab/curate.test.ts`
- Create: `gitnexus/src/rule-lab/schema/curation-input.schema.json`

**Step 1: Write the failing test**

```ts
it('rejects curation input with empty confirmed_chain.steps', async () => {
  await expect(curateRuleLabSlice({ inputPath: badInput })).rejects.toThrow(/confirmed_chain\.steps/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts`
Expected: FAIL (`curateRuleLabSlice` + schema validation missing).

**Step 3: Write minimal implementation**

```ts
if (!Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0) {
  throw new Error('confirmed_chain.steps must be non-empty for promotion');
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/curate.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/curate.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/schema/curation-input.schema.json
git commit -m "feat(rule-lab): add curate stage with semantic closure validation"
```

### Task 6: `rule-lab promote` (Approved YAML + Catalog Update)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/promote.ts`
- Create: `gitnexus/src/rule-lab/promote.test.ts`
- Modify: `.gitnexus/rules/catalog.json` (test fixture/runtime sample)

**Step 1: Write the failing test**

```ts
it('promotes curated candidate into approved yaml and catalog entry', async () => {
  const out = await promoteCuratedRules({ runId: 'run-x', sliceId: 'slice-a' });
  expect(out.catalog.rules.some((r) => r.id === 'demo.rule.v1')).toBe(true);
  expect(out.promotedFiles[0]).toMatch(/rules\/approved\/.*\.yaml$/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/promote.test.ts`
Expected: FAIL (promotion pipeline absent).

**Step 3: Write minimal implementation**

```ts
export async function promoteCuratedRules(input: PromoteInput): Promise<PromoteOutput> {
  // write approved/*.yaml and upsert catalog.json with versioned entry
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/promote.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts gitnexus/src/rule-lab/promote.test.ts .gitnexus/rules/catalog.json
git commit -m "feat(rule-lab): implement promote stage and catalog upsert"
```

### Task 7: `rule-lab regress` (Precision/Coverage Gates)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/regress.ts`
- Create: `gitnexus/src/rule-lab/regress.test.ts`
- Create: `gitnexus/src/rule-lab/schema/regress-report.schema.json`

**Step 1: Write the failing test**

```ts
it('fails when precision or coverage is below threshold', async () => {
  const out = await runRuleLabRegress({ precision: 0.85, coverage: 0.92 });
  expect(out.pass).toBe(false);
  expect(out.failures).toContain('precision_below_threshold');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts`
Expected: FAIL (regress evaluator not implemented).

**Step 3: Write minimal implementation**

```ts
const pass = metrics.precision >= 0.90 && metrics.coverage >= 0.80;
if (!pass) failures.push(...);
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/regress.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/regress.ts gitnexus/src/rule-lab/regress.test.ts gitnexus/src/rule-lab/schema/regress-report.schema.json
git commit -m "feat(rule-lab): add regress stage with threshold gate"
```

### Task 8: CLI Entry (`gitnexus rule-lab ...`) and Command Contract

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/cli/rule-lab.ts`
- Create: `gitnexus/src/cli/rule-lab.test.ts`
- Modify: `gitnexus/src/cli/index.ts`

**Step 1: Write the failing test**

```ts
it('registers all six rule-lab subcommands', async () => {
  const cmds = getRuleLabCommandNames(program);
  expect(cmds).toEqual(['discover', 'analyze', 'review-pack', 'curate', 'promote', 'regress']);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/rule-lab.test.ts`
Expected: FAIL (subcommands not wired).

**Step 3: Write minimal implementation**

```ts
program
  .command('rule-lab')
  .command('discover')
  // ... analyze/review-pack/curate/promote/regress
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/rule-lab.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/rule-lab.ts gitnexus/src/cli/rule-lab.test.ts gitnexus/src/cli/index.ts
git commit -m "feat(cli): add rule-lab subcommand group"
```

### Task 9: MCP Tool Surface for Rule Lab (Agent Invocation)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Create: `gitnexus/test/unit/rule-lab-tools.test.ts`

**Step 1: Write the failing test**

```ts
it('exposes rule_lab_* tools in schema and dispatches to backend handlers', async () => {
  expect(GITNEXUS_TOOLS.map(t => t.name)).toContain('rule_lab_discover');
  const out = await backend.callTool('rule_lab_discover', { repo: 'test-repo', scope: 'full' });
  expect(out).toHaveProperty('artifact_paths');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/rule-lab-tools.test.ts`
Expected: FAIL (MCP tool names/dispatch paths missing).

**Step 3: Write minimal implementation**

```ts
case 'rule_lab_discover':
  return this.ruleLabDiscover(repo, params);
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/unit/rule-lab-tools.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/test/unit/rule-lab-tools.test.ts
git commit -m "feat(mcp): expose rule-lab lifecycle tools"
```

### Task 10: Runtime Verifier Load Integration Test (Promote -> Claim)

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write the failing test**

```ts
it('phase5 rule-lab promoted rule is loadable', async () => {
  const out = await backend.callTool('query', {
    query: 'Startup Graph Trigger',
    unity_resources: 'on',
    runtime_chain_verify: 'on-demand',
  });
  expect(out.runtime_claim?.rule_id).toBe('demo.startup.v1');
  expect(out.runtime_claim?.reason).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase5 rule-lab promoted rule is loadable"`
Expected: FAIL (promote artifacts not wired into runtime load path).

**Step 3: Write minimal implementation**

```ts
// ensure promote writes catalog+yaml exactly under repo/.gitnexus/rules so loadRuleRegistry resolves immediately
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase5 rule-lab promoted rule is loadable"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "test(rule-lab): verify promoted rules are immediately loadable by runtime claim"
```

### Task 11: Phase 5 Acceptance Runner + Reports

**User Verification: required**

**Human Verification Checklist:**
- 验收报告是否包含 6 个阶段命令与结果。
- 报告是否包含 `precision/coverage/token_budget` 三类核心指标。
- 报告是否包含失败分类与复现命令。
- 报告中的 `artifact_paths` 是否都能在本地找到。

**Acceptance Criteria:**
- 6 个阶段都有执行记录和状态。
- 指标字段均为数值且满足阈值逻辑。
- 每个失败分类都有明确 `retry_hint` 或复现命令。
- `artifact_paths` 100% 可访问。

**Failure Signals:**
- 任一阶段缺失或状态为空。
- 指标字段缺失/非数值。
- 报告引用的路径不存在。

**User Decision Prompt:**
- `请只回复“通过”或“不通过”：Phase 5 Rule Lab 验收报告是否通过人工验收？`

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts`
- Create: `docs/reports/2026-04-02-phase5-rule-lab-acceptance.json` (generated)
- Create: `docs/reports/2026-04-02-phase5-rule-lab-acceptance.md` (generated)

**Step 1: Write the failing test**

```ts
test('phase5 rule-lab acceptance runner emits complete stage coverage', async () => {
  const report = await buildPhase5RuleLabAcceptanceReport({ repoAlias: 'GitNexus' });
  assert.equal(report.stage_coverage.length, 6);
  assert.equal(typeof report.metrics.precision, 'number');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.js`
Expected: FAIL (runner missing).

**Step 3: Write minimal implementation**

```ts
export async function buildPhase5RuleLabAcceptanceReport(...) {
  // execute discover/analyze/review-pack/curate/promote/regress and aggregate evidence
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts docs/reports/2026-04-02-phase5-rule-lab-acceptance.json docs/reports/2026-04-02-phase5-rule-lab-acceptance.md
git commit -m "feat(benchmark): add phase5 rule-lab acceptance runner and evidence reports"
```

### Task 12: Documentation + Contract Sync

**User Verification: not-required**

**Files:**
- Modify: `docs/gitnexus-config-files.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Create: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('docs and contract tests reflect rule-lab ownership and lifecycle artifacts', async () => {
  const cfg = await fs.readFile('docs/gitnexus-config-files.md', 'utf-8');
  expect(cfg).toMatch(/rule-lab-discover/);
  expect(cfg).toMatch(/rules\/lab\/runs/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: FAIL (contract sync assertions not implemented).

**Step 3: Write minimal implementation**

```md
- Update docs with final artifact schema, ownership, cleanup boundaries, and runtime claim loading boundary.
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/rule-lab-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/gitnexus-config-files.md docs/unity-runtime-process-source-of-truth.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(rule-lab): sync phase5 contracts and ownership rules"
```

### Task 13: Final Verification Gate + Release Notes

**User Verification: not-required**

**Files:**
- Modify: `docs/reports/2026-04-02-phase5-rule-lab-acceptance.md`
- Modify: `docs/unity-runtime-process-source-of-truth.md`

**Step 1: Write the failing test**

```ts
it('phase5 gate fails when required artifacts are missing', async () => {
  const gate = await runPhase5RuleLabGate({ reportPath: '/tmp/missing.json' });
  expect(gate.pass).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts -- -t "gate fails"`
Expected: FAIL until gate checks are added.

**Step 3: Write minimal implementation**

```ts
if (!fs.existsSync(reportPath)) return { pass: false, reason: 'acceptance_report_missing' };
```

**Step 4: Run test to verify it passes**

Run:
`npm --prefix gitnexus run build && npm --prefix gitnexus exec vitest run gitnexus/src/rule-lab/*.test.ts gitnexus/src/cli/rule-lab.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts && node --test gitnexus/dist/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.js`

Expected: PASS with complete acceptance evidence.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-02-phase5-rule-lab-acceptance.md docs/unity-runtime-process-source-of-truth.md gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts
git commit -m "chore(rule-lab): enforce phase5 verification gate and finalize evidence"
```

## Plan Audit Verdict
audit_scope: [Phase 5 section (9.1-9.9) in `docs/plans/2026-04-01-unity-runtime-process-structural-remediation-design.md`, updated runtime claim truth source, `.gitnexus/rules/**` ownership + lifecycle command contract]
finding_summary: P0=0, P1=0, P2=2
audit_execution_mode: fallback-serial (subagent audit not invoked in this session; independent manual audit applied with same rubric)
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` mapped to Task 5 + Task 6 tests: pass (planned)
- `assert freeze requires non-empty confirmed_chain.steps` mapped to Task 5 curate validator: pass (planned)
authenticity_checks:
- semantic closure via hop anchors required before promotion: pass (planned)
- runtime verifier immediate load after promote (not structure-only): pass (planned)
- token budget and truncation diagnostics for review-pack: pass (planned)
approval_decision: pass
