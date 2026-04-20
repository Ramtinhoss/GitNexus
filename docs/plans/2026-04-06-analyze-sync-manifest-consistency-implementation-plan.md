# Analyze Sync-Manifest Consistency Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `gitnexus analyze` 在存在 `.gitnexus/sync-manifest.txt` 时默认稳定复用该配置，并在用户显式参数与 manifest 不一致时做可审计的一致性检查与交互更新。

**Architecture:** 在 CLI 层引入“统一 manifest 配置解析 + 一致性守卫”两层机制。第一层把 `sync-manifest` 从“可选 scope 文件”升级为“默认配置入口”（可被显式 CLI 覆盖）；第二层比较本次显式参数与 manifest 期望值，按策略执行 `ask/update/keep/error`，避免静默漂移。所有行为以可测试的纯函数封装，`analyze` 只负责组装与调用。

**Tech Stack:** TypeScript, Commander CLI, Node.js `node:test`, existing GitNexus CLI pipeline.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added 3 failing tests for manifest directives/precedence/unknown-key and verified build+test fails only in new cases (`pass=7 fail=3`), then committed as `1a0c09ec`.
Task 2 | completed | Added `scope-manifest-config.ts` parser, wired directive precedence into `resolveEffectiveAnalyzeOptions`, and verified `analyze-options` tests pass (`pass=11 fail=0`), committed as `5a0cb109`.
Task 3 | completed | Added `sync-manifest.ts` + analyze auto-scope-manifest injection path and verified `analyze + analyze-options` tests pass (`pass=13 fail=0`), committed as `d174a443`.
Task 4 | completed | Implemented mismatch guard with `ask|update|keep|error`, TTY prompt + non-TTY failure path, and deterministic manifest rewrite; verified `sync-manifest + analyze` tests pass (`pass=5 fail=0`), committed as `abd0fdd1`.
Task 5 | completed | Added anti-fake guards (`placeholder path` reject, explicit `stdin.isTTY` evidence requirement, non-empty diff rewrite guard), verified `sync-manifest + analyze` tests pass (`pass=8 fail=0`), committed as `2dad46ec`.
Task 6 | completed | Made benchmark analyze `extensions` optional end-to-end, removed implicit `.cs` defaults in benchmark CLI commands, and verified benchmark tests pass (`pass=7 fail=0`), committed as `1a80ff39`.
Task 7 | completed | Updated config docs + source/distributed skills + AGENTS analyze-option contract, and verified source/install skill parity via `diff -u` (no diff), committed as `430d476f`.
Task 8 | completed | Human verification gate passed (`通过`, 2026-04-06), with TTY/non-TTY acceptance criteria satisfied and evidence from `analyze + sync-manifest` suite.
Task 9 | completed | Added executable closure gate `gitnexus/scripts/check-sync-manifest-traceability.mjs`; ran full targeted suite twice (all pass). Note: one non-blocking vitest worker termination timeout warning appeared after successful run summary.
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Manifest 必须解析 `@extensions/@repoAlias/@embeddings` 与 scope 行 | critical | Task 1, Task 2 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js` | `gitnexus/src/cli/analyze-options.test.ts:directive parsing cases` | 指令行被当作 scope，或指令值未进入 effective options
DC-02 选项优先级必须是 `CLI > manifest > meta(reuse) > default` | critical | Task 1, Task 3 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js` | `gitnexus/src/cli/analyze-options.test.ts:precedence cases` | CLI 显式值未覆盖 manifest，或 meta 反向覆盖 manifest
DC-03 存在 `.gitnexus/sync-manifest.txt` 时 analyze 默认等价于 `--scope-manifest` | critical | Task 3, Task 5 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze.test.js` | `gitnexus/src/cli/analyze.test.ts:auto manifest cases` | 未传 `--scope-manifest` 时未加载 manifest 或路径解析错误
DC-04 显式参数与 manifest 不一致时必须提示并允许更新 manifest | critical | Task 4, Task 5, Task 8 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js gitnexus/dist/cli/analyze.test.js` | `gitnexus/src/cli/sync-manifest.test.ts:mismatch decision cases`, `gitnexus/src/cli/analyze.test.ts:interactive prompt integration` | 参数漂移被静默吞掉，或非 TTY 下无策略仍继续执行
DC-05 未知 manifest 指令必须 fail-fast（不可静默忽略） | critical | Task 1, Task 2 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js` | `gitnexus/src/cli/analyze-options.test.ts:unknown directive case` | 未知 `@key` 未报错并继续分析
DC-06 benchmark 入口不能隐式覆盖 manifest 选项（尤其 extensions） | major | Task 6 | `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/analyze-runner.test.js gitnexus/dist/cli/benchmark-unity.test.js gitnexus/dist/cli/benchmark-agent-context.test.js` | `gitnexus/src/benchmark/analyze-runner.test.ts:optional extensions case` | 即使传 manifest，仍固定注入 `--extensions .cs`
DC-07 文档与分发 skill 必须与实现一致（源码 + 安装产物） | major | Task 7 | `diff -u gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md` | `gitnexus/skills/*.md`, `.agents/skills/gitnexus/*/SKILL.md` | 用户仓库技能仍教错参数格式或错的 manifest 契约
DC-08 关键反作弊检查必须覆盖非交互模式与占位路径 | critical | Task 5, Task 9 | `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js gitnexus/dist/cli/analyze.test.js` | `gitnexus/src/cli/sync-manifest.test.ts:negative cases` | 使用占位路径也通过，或非 TTY 模式假装“已询问用户”

## Authenticity Assertions

- `assert no placeholder path`: 所有 manifest 读写与自动发现测试必须使用真实 repo-relative 路径，禁止 `TODO`、`<path>`、`/tmp/placeholder` 伪路径通过。
- `assert live mode has tool evidence`: 交互询问分支必须在测试中验证 `process.stdin.isTTY` 条件与实际 prompt 文案，不允许仅检查“函数被调用”。
- `assert freeze requires non-empty confirmed_chain.steps`: 对应本任务中“最终采用的 manifest 更新决策”必须有非空 diff 证据（如 `confirmed_manifest_diff.entries.length > 0`）才允许执行写回。

## Skill References

- `@superpowers:executing-plans`
- `@superpowers:verification-before-completion`
- `@gitnexus-cli`

### Task 1: 建立 Manifest 指令与优先级失败测试基线

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/analyze-options.test.ts`
- Test: `gitnexus/src/cli/analyze-options.test.ts`

**Step 1: Write the failing test**

```ts
test('resolveEffectiveAnalyzeOptions reads @extensions/@repoAlias/@embeddings from manifest', async () => {
  // manifest: Assets/ + directives
  // expect includeExtensions=['.cs','.meta'], repoAlias='neonspark-core', embeddings=false
});

test('resolveEffectiveAnalyzeOptions enforces precedence CLI > manifest > meta', async () => {
  // CLI extensions='.ts' should override manifest '@extensions=.cs,.meta'
});

test('resolveEffectiveAnalyzeOptions rejects unknown manifest directives', async () => {
  // @foo=bar => throws /Unknown manifest directive/
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js`
Expected: FAIL in new directive/precedence cases.

**Step 3: Write minimal implementation placeholder hooks**

```ts
// temporary TODO hooks in analyze-options.ts:
// - parse manifest config with directives
// - merge precedence
```

**Step 4: Run test to verify it still fails for unimplemented branches**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js`
Expected: FAIL only in newly introduced cases (existing cases保持通过)。

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze-options.test.ts
git commit -m "test(cli): add failing coverage for sync-manifest directives and precedence"
```

### Task 2: 实现 Unified Manifest 解析器（含未知指令 fail-fast）

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/cli/scope-manifest-config.ts`
- Modify: `gitnexus/src/cli/analyze-options.ts`
- Test: `gitnexus/src/cli/analyze-options.test.ts`

**Step 1: Write the failing test for parser unit behavior**

```ts
// parseScopeManifestConfig(raw)
// -> { scopeRules: ['Assets','Packages'], directives: { extensions: '.cs,.meta', repoAlias: 'x', embeddings: 'false' } }
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js`
Expected: FAIL because parser function not found / wrong output.

**Step 3: Write minimal implementation**

```ts
export interface ScopeManifestConfig {
  scopeRules: string[];
  directives: {
    extensions?: string;
    repoAlias?: string;
    embeddings?: string;
  };
}

// parse non-@ lines as scope rules; parse @key=value; throw on unknown key
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze-options.test.js`
Expected: PASS for parser and unknown-directive negative case.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/scope-manifest-config.ts gitnexus/src/cli/analyze-options.ts gitnexus/src/cli/analyze-options.test.ts
git commit -m "feat(cli): parse unified scope-manifest directives with fail-fast validation"
```

### Task 3: 接入 analyze 默认 manifest 自动发现与优先级合并

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/cli/sync-manifest.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/cli/analyze-options.ts`
- Create: `gitnexus/src/cli/analyze.test.ts`
- Test: `gitnexus/src/cli/analyze.test.ts`

**Step 1: Write the failing test**

```ts
test('analyze auto-loads .gitnexus/sync-manifest.txt when CLI scope options are omitted', async () => {
  // no --scope-manifest, no --scope-prefix, manifest exists => resolved options use manifest
});

test('explicit --scope-manifest still wins over auto-detected default file', async () => {
  // explicit path must override default file
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze.test.js`
Expected: FAIL (auto-detection not implemented).

**Step 3: Write minimal implementation**

```ts
// sync-manifest.ts
export function resolveDefaultSyncManifestPath(repoPath: string): string;
export function shouldAutoUseSyncManifest(options: AnalyzeOptions): boolean;

// analyze.ts
// before resolveEffectiveAnalyzeOptions: inject scopeManifest when auto-use and file exists
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze.test.js gitnexus/dist/cli/analyze-options.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/sync-manifest.ts gitnexus/src/cli/analyze.ts gitnexus/src/cli/analyze-options.ts gitnexus/src/cli/analyze.test.ts
git commit -m "feat(cli): auto-apply sync-manifest as default analyze config"
```

### Task 4: 实现“参数不一致检查 + 询问是否更新 manifest”守卫

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/cli/sync-manifest.ts`
- Create: `gitnexus/src/cli/sync-manifest.test.ts`
- Test: `gitnexus/src/cli/sync-manifest.test.ts`

**Step 1: Write the failing test**

```ts
test('when explicit CLI values differ from manifest, TTY mode asks whether to update manifest', async () => {
  // expect prompt emitted with diff summary
});

test('non-TTY without explicit policy exits with actionable error', async () => {
  // prevent silent drift in CI
});

test('policy=update rewrites manifest with normalized directives', async () => {
  // writes deterministic file content
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js`
Expected: FAIL until compare/policy/prompt logic is added.

**Step 3: Write minimal implementation**

```ts
export type SyncManifestPolicy = 'ask' | 'update' | 'keep' | 'error';

// compare manifest directives with explicit CLI input
// ask/update/keep/error decision
// deterministic rewrite preserving scope rules + normalized directives
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js gitnexus/dist/cli/analyze.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/index.ts gitnexus/src/cli/analyze.ts gitnexus/src/cli/sync-manifest.ts gitnexus/src/cli/sync-manifest.test.ts
git commit -m "feat(cli): guard analyze-manifest drift with interactive sync policy"
```

### Task 5: 完成关键负向用例与真实性断言测试

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/sync-manifest.test.ts`
- Modify: `gitnexus/src/cli/analyze.test.ts`
- Test: `gitnexus/src/cli/sync-manifest.test.ts`

**Step 1: Write the failing negative tests**

```ts
test('rejects placeholder manifest path values', () => {
  // assert no placeholder path
});

test('TTY prompt branch requires concrete stdin.isTTY evidence', () => {
  // assert live mode has tool evidence
});

test('manifest rewrite requires non-empty diff entries', () => {
  // assert freeze requires non-empty confirmed_chain.steps equivalent
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js`
Expected: FAIL in new anti-fake cases.

**Step 3: Write minimal implementation**

```ts
// add guards:
// - placeholder path pattern rejection
// - no-op rewrite blocked when diff is empty
// - prompt only under verified TTY
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/sync-manifest.test.js gitnexus/dist/cli/analyze.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/sync-manifest.test.ts gitnexus/src/cli/analyze.test.ts
git commit -m "test(cli): add anti-fake guards for sync-manifest drift workflow"
```

### Task 6: 修复 benchmark analyze 参数注入陷阱

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/benchmark/analyze-runner.ts`
- Modify: `gitnexus/src/benchmark/analyze-runner.test.ts`
- Modify: `gitnexus/src/cli/benchmark-unity.ts`
- Modify: `gitnexus/src/cli/benchmark-agent-context.ts`
- Test: `gitnexus/src/benchmark/analyze-runner.test.ts`

**Step 1: Write the failing test**

```ts
test('buildAnalyzeArgs omits --extensions when not explicitly provided', () => {
  // ensure manifest can control extensions
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/analyze-runner.test.js`
Expected: FAIL (current code always injects `--extensions`).

**Step 3: Write minimal implementation**

```ts
// AnalyzeRunOptions.extensions?: string
// only append '--extensions' when options.extensions is defined
// remove commander default '.cs' for benchmark analyze options
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/benchmark/analyze-runner.test.js gitnexus/dist/cli/benchmark-unity.test.js gitnexus/dist/cli/benchmark-agent-context.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/index.ts gitnexus/src/benchmark/analyze-runner.ts gitnexus/src/benchmark/analyze-runner.test.ts gitnexus/src/cli/benchmark-unity.ts gitnexus/src/cli/benchmark-agent-context.ts
git commit -m "fix(benchmark): avoid implicit extensions override when using scope manifest"
```

### Task 7: 同步文档与可分发 skill（源码 + 安装产物）

**User Verification: not-required**

**Files:**
- Modify: `docs/gitnexus-config-files.md`
- Modify: `gitnexus/skills/gitnexus-cli.md`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `AGENTS.md`

**Step 1: Write failing doc-contract checks**

```bash
# command-level check (fails until text is updated)
rg -n "--extensions \"\.cs \.meta\"|Scope manifest syntax: Each line is a path prefix only" \
  gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md
```

**Step 2: Run check to verify it fails**

Run: 上述 `rg` 命令
Expected: 命中旧文案（FAIL）。

**Step 3: Write minimal documentation updates**

```md
- --extensions example: .cs,.meta (comma-separated)
- sync-manifest supports directives + precedence
- when explicit CLI params differ: ask/update policy
```

**Step 4: Run check to verify it passes**

Run:
`diff -u gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md`
`diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
Expected: no diff.

**Step 5: Commit**

```bash
git add docs/gitnexus-config-files.md gitnexus/skills/gitnexus-cli.md gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md AGENTS.md
git commit -m "docs(skills): align sync-manifest workflow and extension syntax with CLI behavior"
```

### Task 8: 人工验收交互流（TTY 与非 TTY）

**User Verification: required**

**Human Verification Checklist:**
1. 在有 `.gitnexus/sync-manifest.txt` 的仓库执行 `gitnexus analyze`（不带 scope 参数）时，CLI 显示使用 manifest 配置。
2. 显式传入与 manifest 冲突的参数时，TTY 会出现“是否更新 manifest”的明确提问。
3. 选择“更新”后，manifest 内容与本次参数一致且格式规范。
4. 在非 TTY（CI 模拟）且未给 `--sync-manifest-policy` 时，命令失败并给出可执行修复建议。

**Acceptance Criteria:**
1. 输出含 manifest 路径与生效参数摘要。
2. 提问文案包含差异项列表，不是模糊提示。
3. 写回文件仅变更差异项，无无关改动。
4. 错误信息包含可选策略值（`ask|update|keep|error`）。

**Failure Signals:**
- 任一场景出现“静默继续分析”且未给出差异或策略。
- 写回后 manifest 丢失 scope 行或出现重复 directive。
- 非 TTY 未配置策略仍然继续执行。

**User Decision Prompt:**
`请仅回复“通过”或“不通过”：以上 4 项人工验收是否全部满足？`

**Files:**
- Test: `gitnexus/src/cli/sync-manifest.test.ts`
- Test: `gitnexus/src/cli/analyze.test.ts`

**Step 1: Prepare failing acceptance harness**

```bash
TMP_REPO=\"$(mktemp -d)\"
git -C \"$TMP_REPO\" init
mkdir -p \"$TMP_REPO/.gitnexus\"
cat > \"$TMP_REPO/.gitnexus/sync-manifest.txt\" <<'MANIFEST'
Assets/
@extensions=.cs,.meta
@repoAlias=demo-repo
@embeddings=false
MANIFEST
# run analyze fixture with explicit mismatch args in tests (e.g. --extensions .ts)
```

**Step 2: Run to verify failure first**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze.test.js gitnexus/dist/cli/sync-manifest.test.js`
Expected: FAIL before interactive flow is fully wired.

**Step 3: Implement minimal UX/message polish**

```ts
// ensure prompt text includes diff items and actionable choices
```

**Step 4: Run to verify pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/cli/analyze.test.js gitnexus/dist/cli/sync-manifest.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/analyze.test.ts gitnexus/src/cli/sync-manifest.test.ts
git commit -m "test(cli): validate interactive and non-interactive sync-manifest acceptance flow"
```

### Task 9: 总回归与交付前验证

**User Verification: not-required**

**Files:**
- Create: `gitnexus/scripts/check-sync-manifest-traceability.mjs`
- Modify: `docs/plans/2026-04-06-analyze-sync-manifest-consistency-implementation-plan.md` (status updates only)

**Step 1: Write failing executable closure gate**

```js
// check-sync-manifest-traceability.mjs
// Fail when any critical DC row lacks: mapped task, verification command, evidence field, failure signal.
// Fail when any critical DC does not map to at least one concrete semantic test case id.
// Required semantic case ids:
//   DC-01: directive parsing + unknown directive fail-fast
//   DC-02: precedence merge case
//   DC-03: auto default sync-manifest load case
//   DC-04: mismatch prompt/update decision case
//   DC-05: unknown directive fail-fast case
//   DC-08: placeholder rejection + non-TTY policy gate case
// Fail when verification command list omits any mapped semantic case group.
```

**Step 2: Run verification suite**

Run:
`npm --prefix gitnexus run build`
`node gitnexus/scripts/check-sync-manifest-traceability.mjs docs/plans/2026-04-06-analyze-sync-manifest-consistency-implementation-plan.md`
`node --test gitnexus/dist/cli/analyze-options.test.js gitnexus/dist/cli/analyze.test.js gitnexus/dist/cli/sync-manifest.test.js gitnexus/dist/benchmark/analyze-runner.test.js`
`npm --prefix gitnexus run test -- test/unit/runtime-claim-rule-registry.test.ts`
Expected: all PASS.

**Step 3: Address minimal regressions**

```ts
// only fix regressions introduced by this change set
```

**Step 4: Re-run full targeted verification**

Run: same commands as Step 2.
Expected: PASS with stable output.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(cli): finalize sync-manifest stability guard and workflow consistency"
```

## Plan Audit Verdict
> This block is a **re-audit snapshot** only. It MUST be overwritten after each independent audit run and is non-authoritative if stale.

audit_scope: [analyze options precedence, sync-manifest defaulting, mismatch guard, benchmark option injection, docs/skills sync]
finding_summary: P0=0, P1=0, P2=2
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path` exists and has explicit negative test (`rejects placeholder manifest path values`): pass
- Task 8 acceptance harness uses deterministic executable commands with no placeholder tokens: pass
- non-TTY anti-fake policy gate has explicit failure-path coverage: pass
authenticity_checks:
- `assert live mode has tool evidence` mapped to TTY prompt tests: pass
- `assert freeze requires non-empty confirmed_chain.steps` mapped to non-empty manifest diff guard: pass
- semantic closure gate in Task 9 requires executable semantic-case mapping (not structure-only): pass
- embedded verdict block remains stale-prone even with snapshot disclaimer: fail (P2 improvement)
approval_decision: pass
