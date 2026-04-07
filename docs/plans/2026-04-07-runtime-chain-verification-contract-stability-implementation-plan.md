# Runtime Chain Verification Contract Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate semantic drift between SSOT/docs/tools/skills and runtime behavior for `runtime_chain` verification, while improving agent-side stability for closure decisions.

**Architecture:** Define a single two-layer contract (`verifier-core` vs `policy-adjusted result`), then propagate it through docs, MCP tool descriptions, backend response fields, tests, and setup-installed skill artifacts. Keep backward compatibility for existing `runtime_claim.status/evidence_level` while adding explicit metadata for agent-safe decisioning.

**Tech Stack:** TypeScript, Node.js, Vitest, GitNexus MCP (`local-backend`, `runtime-chain-verify`), CLI setup/ai-context installers, Markdown docs/skills.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Created `docs/contracts/runtime-chain-verification-semantics.md`; grep gate `rg -n "verifier-core\|policy-adjusted\|strict\|fallbackToCompact"` passed with all terms matched; committed as `2a4cdf9`.
Task 2 | completed | Updated SSOT sections 4.2/4.3/6 to `verifier-core` + `policy-adjusted` semantics; grep gate `rg -n "verifier-core\|policy-adjusted\|strict.*fallbackToCompact\|verified_partial\|verified_segment"` passed; committed as `a24ffda`.
Task 3 | completed | Updated `UNITY_RUNTIME_PROCESS.md` and `AGENTS.md` with strict fallback downgrade + parity rerun rule; cross-file grep `rg -n "verifier-core\|policy-adjusted\|fallbackToCompact\|parity rerun"` passed; committed as `4d3221b`.
Task 4 | completed | Added `gitnexus/test/unit/mcp-tools.contract.test.ts`; observed expected pre-update failure and post-update pass; `npm --prefix gitnexus exec vitest run gitnexus/test/unit/mcp-tools.contract.test.ts` now passes; pending commit for this task.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Two-layer contract must be consistent everywhere (`verifier-core` binary; `query/context` may downgrade on strict fallback) | critical | Task 1, Task 2, Task 3, Task 4, Task 8 | `rg -n "verifier-core|policy-adjusted|strict \+ fallbackToCompact|verified_partial|verified_segment" docs/unity-runtime-process-source-of-truth.md UNITY_RUNTIME_PROCESS.md gitnexus/src/mcp/tools.ts gitnexus/skills/_shared/unity-runtime-process-contract.md` | `docs/* + tools.ts` matching phrasing for both layers | Any file still says global binary only or omits strict fallback downgrade semantics
DC-02 Backend response must expose stable machine-readable distinction between core result and adjusted result | critical | Task 5, Task 6 | `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "runtime claim core vs adjusted"` | `query/context output: runtime_claim.verification_core_status + policy_adjusted` | Core/adjusted fields absent, contradictory, or non-deterministic
DC-03 Strict fallback downgrade behavior must stay deterministic and test-covered | critical | Task 5, Task 6, Task 7 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/test/integration/local-backend-calltool.test.ts` | `runtime_claim.status/evidence_level under strict+fallback` | Strict fallback path yields non-downgraded full-chain without explicit policy metadata
DC-04 Agent workflow contract must enforce parity recheck before closure claims | critical | Task 3, Task 8 | `rg -n "fallbackToCompact|needsParityRetry|rerun.*parity|before conclusions" gitnexus/skills/_shared/unity-runtime-process-contract.md gitnexus/skills/gitnexus-*.md` | `skills/_shared + scenario skills` parity rerun instructions | Skill text allows final closure on downgraded/compact fallback outputs
DC-05 Setup-installed artifacts must stay in sync with source skill templates | critical | Task 8, Task 9 | `npm --prefix gitnexus exec vitest run gitnexus/src/cli/setup.test.ts gitnexus/src/cli/ai-context.test.ts && node gitnexus/dist/cli/index.js setup --scope project --agent codex` | `.agents/skills/gitnexus/**` matches `gitnexus/skills/**` | Setup succeeds but installed skill contract differs from source templates
DC-06 No placeholder or fake compliance in reports/contract checks | critical | Task 7, Task 10 | `npm --prefix gitnexus run build && node gitnexus/dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo GitNexus --out docs/reports/2026-04-07-runtime-chain-contract-repeatability.json` | `docs/reports/...json: strict.downgradeOnFallback + coreAdjustedDelta` | Report exists but lacks semantic checks (only structural fields)

## Authenticity Assertions

- assert no placeholder path: any report path, reader URI, and next command in new docs/tests must not contain `TODO`, `TBD`, `placeholder`, `unspecified_*`, or empty path values.
- assert live mode has tool evidence: runtime closure claims in docs must cite concrete `query/context` fields (`hydrationMeta.fallbackToCompact`, `runtime_claim.status`, `runtime_claim.verification_core_status`).
- assert closure requires non-empty proof: `verified_full/verified_chain` acceptance checks must require non-empty `hops` unless explicit failure reason is present.
- assert strict fallback semantics are policy-bound: downgrade is allowed only when `hydration_policy=strict` and `fallbackToCompact=true`.

### Task 1: Create Canonical Contract Wording Block

**User Verification: not-required**

**Files:**
- Create: `docs/contracts/runtime-chain-verification-semantics.md`

**Step 1: Write canonical wording doc (first draft)**

```markdown
# Runtime Chain Verification Semantics

Layer A (verifier-core): binary (`verified_full` | `failed`).
Layer B (policy-adjusted): may downgrade in `query/context` when strict policy falls back to compact hydration.
```

**Step 2: Run lint-style grep check for mandatory terms**

Run: `rg -n "verifier-core|policy-adjusted|strict|fallbackToCompact" docs/contracts/runtime-chain-verification-semantics.md`
Expected: PASS with at least one match per term.

**Step 3: Commit**

```bash
git add docs/contracts/runtime-chain-verification-semantics.md
git commit -m "docs(contract): define runtime-chain core vs policy-adjusted semantics"
```

### Task 2: Sync SSOT to Canonical Semantics

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`

**Step 1: Write failing doc consistency check (scriptable grep gate)**

Run: `rg -n "V2 verifier 为二元结果（` docs/unity-runtime-process-source-of-truth.md`
Expected: current text found and flagged for rewrite if it implies global binary-only behavior.

**Step 2: Update sections 4.2/4.3/6 to two-layer wording**

```markdown
- verifier-core: binary
- query/context output: policy-adjusted; strict+fallback may downgrade to partial/segment
```

**Step 3: Re-run consistency gate**

Run: `rg -n "verifier-core|policy-adjusted|strict.*fallbackToCompact|verified_partial|verified_segment" docs/unity-runtime-process-source-of-truth.md`
Expected: PASS; all concepts present.

**Step 4: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md
git commit -m "docs(ssot): clarify runtime-chain two-layer semantics"
```

### Task 3: Sync Product-Facing Docs and Entry Guidance

**User Verification: not-required**

**Files:**
- Modify: `UNITY_RUNTIME_PROCESS.md`
- Modify: `AGENTS.md`

**Step 1: Write failing consistency check across docs**

Run: `rg -n "返回二元结果|verified_full|failed" UNITY_RUNTIME_PROCESS.md AGENTS.md`
Expected: detect old binary-only phrasing in product-facing docs.

**Step 2: Update docs to include downgrade/recheck semantics**

```markdown
When strict policy falls back to compact hydration, treat result as policy-adjusted and trigger parity rerun before closure claims.
```

**Step 3: Verify docs match SSOT contract**

Run: `rg -n "verifier-core|policy-adjusted|fallbackToCompact|parity rerun" UNITY_RUNTIME_PROCESS.md AGENTS.md docs/unity-runtime-process-source-of-truth.md`
Expected: PASS with aligned wording.

**Step 4: Commit**

```bash
git add UNITY_RUNTIME_PROCESS.md AGENTS.md
git commit -m "docs(runtime): align product docs with core vs adjusted semantics"
```

### Task 4: Update MCP Tool Contract Descriptions

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`

**Step 1: Write failing contract assertion test (description snapshot or string check)**

```ts
expect(queryTool.description).toContain('strict');
expect(queryTool.description).toContain('fallbackToCompact');
expect(queryTool.description).toContain('policy-adjusted');
```

**Step 2: Run test to verify fail**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/tools.contract.test.ts`
Expected: FAIL before description update.

**Step 3: Update query/context descriptions with two-layer semantics**

```ts
// Description includes verifier-core binary + query/context policy-adjusted downgrade behavior.
```

**Step 4: Re-run test to pass**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/tools.contract.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/mcp/tools.contract.test.ts
git commit -m "feat(mcp-tools): document runtime-chain core vs policy-adjusted contract"
```

### Task 5: Refactor Backend Downgrade Logic and Add Core Metadata

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim.ts`

**Step 1: Write failing unit test for shared downgrade helper behavior**

```ts
expect(adjustRuntimeClaimForPolicy(inputStrictFallbackFull).status).toBe('verified_partial');
expect(adjustRuntimeClaimForPolicy(inputBalancedFallbackFull).status).toBe('verified_full');
```

**Step 2: Run test to verify fail**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-claim.policy.test.ts`
Expected: FAIL (helper not implemented).

**Step 3: Implement minimal shared helper + metadata fields**

```ts
verification_core_status?: 'verified_full' | 'failed';
verification_core_evidence_level?: RuntimeChainEvidenceLevel;
policy_adjusted?: boolean;
policy_adjust_reason?: string;
```

**Step 4: Wire helper in both `query()` and `context()` paths**

```ts
// Replace duplicated strict-fallback blocks with one helper call.
```

**Step 5: Re-run targeted tests**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-claim.policy.test.ts gitnexus/src/mcp/local/runtime-claim.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/runtime-claim.ts gitnexus/src/mcp/local/runtime-claim.policy.test.ts
git commit -m "refactor(runtime-claim): unify policy downgrade and expose core metadata"
```

### Task 6: Expand Integration Coverage for Agent-Stable Decisioning

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`

**Step 1: Add failing integration assertion for core vs adjusted fields**

```ts
expect(out.runtime_claim.verification_core_status).toBeDefined();
expect(out.runtime_claim.policy_adjusted).toBe(true);
```

**Step 2: Run targeted integration test to fail first**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -t "runtime claim core vs adjusted"`
Expected: FAIL before implementation is fully wired.

**Step 3: Finalize assertions for strict fallback determinism and parity rerun hinting**

```ts
if (out.hydrationMeta?.fallbackToCompact) {
  expect(out.runtime_claim.status).toBe('verified_partial');
  expect(out.runtime_claim.evidence_level).toBe('verified_segment');
}
```

**Step 4: Re-run integration + unit suites**

Run: `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/local-backend-calltool.test.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts
git commit -m "test(runtime-claim): cover core/adjusted semantics and strict fallback determinism"
```

### Task 7: Benchmark/Report Semantic Gate Upgrade

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts`
- Create: `docs/reports/2026-04-07-runtime-chain-contract-repeatability.md`

**Step 1: Add failing test for report semantic fields**

```ts
expect(report.policy_mapping.strict.downgradeOnFallback).toBe('verified_partial/verified_segment');
expect(report.semantic_contract.coreAdjustedDelta).toBeDefined();
```

**Step 2: Run benchmark runner test to fail**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.test.ts`
Expected: FAIL before new semantic fields are emitted.

**Step 3: Implement semantic output fields and markdown summary**

```ts
semantic_contract: {
  coreAdjustedDelta: {...},
  downgradeOnlyWhenStrictFallback: true
}
```

**Step 4: Regenerate report artifact**

Run: `node gitnexus/dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo GitNexus --out docs/reports/2026-04-07-runtime-chain-contract-repeatability.json`
Expected: JSON contains semantic contract block.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts docs/reports/2026-04-07-runtime-chain-contract-repeatability.md docs/reports/2026-04-07-runtime-chain-contract-repeatability.json
git commit -m "feat(benchmark): add runtime-chain contract semantic repeatability gates"
```

### Task 8: Update Skill Source Templates and Shared Runtime Contract

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/_shared/unity-runtime-process-contract.md`
- Modify: `gitnexus/skills/gitnexus-exploring.md`
- Modify: `gitnexus/skills/gitnexus-debugging.md`
- Modify: `gitnexus/skills/gitnexus-impact-analysis.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `gitnexus/skills/gitnexus-cli.md`
- Modify: `gitnexus/skills/gitnexus-pr-review.md`
- Modify: `gitnexus/skills/gitnexus-refactoring.md`

**Step 1: Add failing grep gate for missing parity rerun contract**

Run: `for f in gitnexus/skills/gitnexus-*.md gitnexus/skills/_shared/unity-runtime-process-contract.md; do rg -q "fallbackToCompact\|policy-adjusted\|rerun.*parity" "$f" || echo "missing:$f"; done`
Expected: non-empty missing list before updates.

**Step 2: Update shared and scenario skills with unified contract wording**

```markdown
If runtime claim is downgraded (`verified_partial/verified_segment`) with strict fallback, treat as non-closure and rerun parity before final conclusions.
```

**Step 3: Re-run grep gate**

Run: `for f in gitnexus/skills/gitnexus-*.md gitnexus/skills/_shared/unity-runtime-process-contract.md; do rg -q "fallbackToCompact\|policy-adjusted\|rerun.*parity" "$f" || echo "missing:$f"; done`
Expected: no output.

**Step 4: Commit**

```bash
git add gitnexus/skills/_shared/unity-runtime-process-contract.md gitnexus/skills/gitnexus-*.md
git commit -m "docs(skills): unify runtime-chain closure contract for agent workflows"
```

### Task 9: Setup Install Sync and Installed Artifact Verification

**User Verification: required**

**Human Verification Checklist:**
1. `gitnexus setup --scope project --agent codex` runs successfully.
2. Installed `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` contains new two-layer wording.
3. Installed scenario skills mention strict fallback downgrade and parity rerun.
4. `setup.test.ts` and `ai-context.test.ts` pass after template updates.

**Acceptance Criteria:**
1. Setup command exits 0 and prints skill install summary.
2. Installed shared contract contains `policy-adjusted` and `fallbackToCompact` terms.
3. At least `exploring/debugging/impact-analysis` installed skills include parity rerun requirement.
4. Both test files pass without snapshot/contract mismatch.

**Failure Signals:**
1. Setup succeeds but installed skills keep old wording.
2. Source templates updated but installer copies stale payload.
3. Tests fail due to contract drift.
4. Installed files omit strict fallback behavior.

**User Decision Prompt:**
`请仅回复“通过”或“不通过”：Task 9 的 setup 安装与已安装 skill 合约是否满足以上 4 条验收标准？`

**Files:**
- Modify: `gitnexus/src/cli/setup.test.ts`
- Modify: `gitnexus/src/cli/ai-context.test.ts`
- Modify: `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md`
- Modify: `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-pr-review/SKILL.md`
- Modify: `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md`

**Step 1: Run setup tests to establish baseline**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/setup.test.ts gitnexus/src/cli/ai-context.test.ts`
Expected: initial mismatch/failure or pass baseline recorded.

**Step 2: Rebuild CLI dist**

Run: `npm --prefix gitnexus run build`
Expected: PASS.

**Step 3: Run setup to refresh installed project skills**

Run: `node gitnexus/dist/cli/index.js setup --scope project --agent codex`
Expected: PASS with installed skill count.

**Step 4: Diff source template vs installed artifacts**

Run:
```bash
diff -u gitnexus/skills/_shared/unity-runtime-process-contract.md .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md
for n in exploring debugging impact-analysis guide cli pr-review refactoring; do
  diff -u "gitnexus/skills/gitnexus-${n}.md" ".agents/skills/gitnexus/gitnexus-${n}/SKILL.md"
done
```
Expected: no semantic drift (allow only known formatting differences if normalized).

**Step 5: Re-run setup/ai-context tests**

Run: `npm --prefix gitnexus exec vitest run gitnexus/src/cli/setup.test.ts gitnexus/src/cli/ai-context.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add gitnexus/src/cli/setup.test.ts gitnexus/src/cli/ai-context.test.ts .agents/skills/gitnexus/_shared/unity-runtime-process-contract.md .agents/skills/gitnexus/gitnexus-*/SKILL.md
git commit -m "test(setup): ensure installed skills preserve runtime-chain contract semantics"
```

### Task 10: Final Regression Pack and Submission Summary

**User Verification: required**

**Human Verification Checklist:**
1. Full build passes.
2. Runtime-chain related unit/integration suites pass.
3. Doc/skill contract grep gates pass with zero missing entries.
4. New repeatability report confirms strict fallback downgrade semantics and core/adjusted clarity.

**Acceptance Criteria:**
1. `npm --prefix gitnexus run build` exits 0.
2. All listed vitest commands exit 0.
3. Grep gates output zero missing lines.
4. Report JSON/MD artifacts include semantic contract summary fields.

**Failure Signals:**
1. Any test gate fails or is skipped.
2. Any file still has binary-only wording without layer distinction.
3. Setup-installed skills diverge from source templates.
4. Report lacks core/adjusted semantic evidence.

**User Decision Prompt:**
`请仅回复“通过”或“不通过”：Task 10 的最终回归与提交包是否满足以上 4 条验收标准？`

**Files:**
- Create: `docs/reports/2026-04-07-runtime-chain-contract-stability-validation.md`
- Create: `docs/reports/2026-04-07-runtime-chain-contract-stability-summary.md`

**Step 1: Run full build**

Run: `npm --prefix gitnexus run build`
Expected: PASS.

**Step 2: Run runtime-chain suites**

Run:
```bash
npm --prefix gitnexus exec vitest run \
  gitnexus/src/mcp/local/runtime-chain-verify.test.ts \
  gitnexus/test/integration/local-backend-calltool.test.ts \
  gitnexus/src/cli/setup.test.ts \
  gitnexus/src/cli/ai-context.test.ts
```
Expected: PASS.

**Step 3: Run contract grep gates**

Run:
```bash
rg -n "verifier-core|policy-adjusted|fallbackToCompact|verified_partial|verified_segment" \
  docs/unity-runtime-process-source-of-truth.md \
  UNITY_RUNTIME_PROCESS.md \
  gitnexus/src/mcp/tools.ts \
  gitnexus/skills/_shared/unity-runtime-process-contract.md
```
Expected: PASS with required matches in all files.

**Step 4: Write validation report + summary**

```markdown
- Commands executed
- PASS/FAIL per gate
- Evidence file paths and key fields
- Residual risks (if any)
```

**Step 5: Commit**

```bash
git add docs/reports/2026-04-07-runtime-chain-contract-stability-validation.md docs/reports/2026-04-07-runtime-chain-contract-stability-summary.md
git commit -m "docs(validation): record runtime-chain contract stability gates"
```

## Plan Audit Verdict
audit_scope: [runtime-chain contract consistency across SSOT/product docs/MCP descriptions/backend semantics/tests/setup-installed skills]
finding_summary: P0=0, P1=1, P2=2
critical_mismatches:
- none
major_risks:
- Plan Authenticity Audit step in `writing-plans` requests independent subagent reviewer; current runtime policy may restrict worker delegation unless explicitly requested. status: accepted
anti_placeholder_checks:
- assert no placeholder path in docs/reports/contracts: pass (explicit grep gate included)
- assert setup-installed skills equal source templates: pass (diff gate included)
authenticity_checks:
- assert strict fallback downgrade is semantically verified, not structure-only: pass
- assert agent closure requires parity rerun on downgraded outputs: pass
approval_decision: pass
