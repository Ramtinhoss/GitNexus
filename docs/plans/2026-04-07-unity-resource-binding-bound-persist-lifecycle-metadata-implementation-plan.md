# Unity Resource-Binding-Coupled Lifecycle Persist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make lifecycle process metadata persistence automatically enabled whenever Unity resource-binding indexing flow is active, and remove dependency on external toggles for `persistLifecycleProcessMetadata`.

**Architecture:** Move persistence decision from config/env-driven toggle to pipeline runtime semantics: if the Unity resource-binding indexing path is active for the repo, lifecycle process metadata is persisted. Keep non-Unity repos unchanged. Update runtime SSOT and related docs to match code truth.

**Tech Stack:** TypeScript, GitNexus ingestion pipeline, LadybugDB graph schema, Vitest, Markdown docs.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1: Replace External Toggle With Pipeline-Derived Decision | completed | Added fail-first integration assertion for Unity-flow auto-persist, observed expected FAIL (`processSubtype` missing), implemented pipeline predicate coupling to Unity flow (`Assets/*.cs`), removed `persistLifecycleProcessMetadata` from `unity-config`, reran focused test PASS.
Task 2: Regression Coverage for Non-Unity and Process Evidence Semantics | completed | Expanded integration suite with non-Unity negative case + step-evidence semantics (`reason != trace-detection`, `confidence != 1.0` for Unity), regression commands PASS for `unity-lifecycle-process-persist.test.ts` and targeted `local-backend-calltool` lifecycle compatibility case.
Task 3: Update SSOT and Runtime Process Docs | completed | Updated SSOT + implementation manual to remove “always persisted/toggle” semantics and document Unity-flow-coupled persistence; consistency grep kept only intentional references (`persistLifecycleProcessMetadata` removal note, deleted env var mapping). Human verification gate passed (`通过`).
Task 4: Update CLI/Config Guidance to Prevent Operator Misconfiguration | completed | Added explicit operator-facing notes in CLI skill/config docs that lifecycle process metadata persistence has no external env/config toggle and is pipeline-derived from Unity-flow activation; stale-token grep in CLI/config/AGENTS returned zero matches.
Task 5: End-to-End Verification and Final Evidence Snapshot | completed | Ran all targeted verification commands (3/3 PASS), generated pipeline-backed persisted `Process`/`STEP` evidence sample, and created validation report `docs/reports/2026-04-07-unity-resource-binding-persist-coupling-validation.md`.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: Lifecycle metadata persistence must be auto-enabled by Unity resource-binding indexing flow, not external config/env. | critical | Task 1, Task 2 | `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "auto-enables lifecycle metadata persistence when unity resource-binding flow is active"` | `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts:autoPersistOnUnityFlow` | Unity-flow analyze output still lacks `processSubtype/runtimeChainConfidence` or still requires config/env.
DC-02: Non-Unity indexing behavior must remain stable and not emit fake lifecycle metadata. | critical | Task 2 | `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "does not emit unity lifecycle metadata for non-unity repositories"` | `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts:nonUnityNoLifecycleSubtype` | Non-Unity fixture emits `unity_lifecycle` subtype or synthetic lifecycle evidence fields.
DC-03: Source-of-truth docs must reflect as-built behavior (no external toggle dependency). | critical | Task 3 | `rg -n "persistLifecycleProcessMetadata|始终持久化|外部配置|resource binding" docs/unity-runtime-process-source-of-truth.md docs/unity-runtime-process-rule-driven-implementation.md` | `docs/unity-runtime-process-source-of-truth.md:2.1/5.x/6` | Docs still claim external toggle or contradictory defaults/semantics.
DC-04: CLI/skill guidance must not suggest nonexistent toggle usage for this behavior. | major | Task 4 | `rg -n "persistLifecycleProcessMetadata|GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST" .agents/skills/gitnexus/gitnexus-cli/SKILL.md docs/gitnexus-config-files.md` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md:analyze section` | Operator docs still tell users to enable persistence via env/config toggle.

## Authenticity Assertions

- `assert no placeholder path`: all changed docs and tests must reference real repository paths/files, not placeholder repo names.
- `assert live mode has tool evidence`: integration tests must inspect actual persisted `Process`/`STEP_IN_PROCESS` graph data, not mocked response-only fields.
- `assert freeze requires non-empty confirmed_chain.steps`: when asserting lifecycle persistence in Unity flow, test must validate at least one process has step evidence with non-empty `step` chain and non-default reason/confidence semantics.

### Task 1: Replace External Toggle With Pipeline-Derived Decision

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Modify: `gitnexus/src/core/config/unity-config.ts`
- Test: `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts`

**Step 1: Write/adjust failing test for persistence decision source**

Add a focused integration test case asserting Unity indexing persists lifecycle metadata without requiring `unity.persistLifecycleProcessMetadata` configuration.

Example assertion shape:

```ts
expect(processRows.some((p) => p.processSubtype === 'unity_lifecycle')).toBe(true);
expect(stepRows.some((s) => s.reason && s.reason !== 'trace-detection')).toBe(true);
```

**Step 2: Run test to verify it fails before implementation**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "auto-enables lifecycle metadata persistence when unity resource-binding flow is active"`

Expected: FAIL on current code path when external toggle is absent.

**Step 3: Implement minimal production change**

- In `pipeline.ts`, compute persistence from Unity resource-binding indexing flow activation (pipeline runtime condition), not config field.
- Remove/stop using `unityConfig.config.persistLifecycleProcessMetadata` in persistence branching.
- Keep behavior explicit in code comments: persistence is tied to Unity resource-binding indexing flow.
- In `unity-config.ts`, deprecate/remove `persistLifecycleProcessMetadata` from config contract if no longer consumed.

**Step 4: Run the focused test again**

Run: `npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts -t "auto-enables lifecycle metadata persistence when unity resource-binding flow is active"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/core/ingestion/pipeline.ts gitnexus/src/core/config/unity-config.ts gitnexus/test/integration/unity-lifecycle-process-persist.test.ts
git commit -m "refactor(unity): bind lifecycle metadata persistence to resource-binding flow"
```

### Task 2: Regression Coverage for Non-Unity and Process Evidence Semantics

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/unity-lifecycle-process-persist.test.ts`
- Optional Modify: `gitnexus/test/integration/local-backend.test.ts`

**Step 1: Add non-Unity negative test and step-evidence assertions**

- Non-Unity fixture must not emit `unity_lifecycle` subtype.
- Unity fixture must keep step evidence semantic quality (not all forced to fallback defaults).

**Step 2: Run tests to verify fail-before-fix (if new assertions fail)**

Run:

```bash
npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts
```

Expected: FAIL if assertions expose regressions.

**Step 3: Minimal fix (only if needed)**

Adjust pipeline persistence condition or step-evidence write path to satisfy both positive and negative cases without widening scope.

**Step 4: Run targeted regression suite**

Run:

```bash
npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts
npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/unity-lifecycle-process-persist.test.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "test(unity): lock auto-persist lifecycle metadata semantics"
```

### Task 3: Update SSOT and Runtime Process Docs

**User Verification: required**

**Human Verification Checklist:**
- SSOT now states lifecycle metadata persistence is tied to Unity resource-binding indexing flow.
- SSOT no longer claims config/env toggle controls this behavior.
- Runtime implementation doc no longer lists conflicting default or toggle semantics.
- Documented behavior matches pipeline implementation references.

**Acceptance Criteria:**
- Each checklist item is explicitly visible in updated markdown sections with concrete file/line anchors.

**Failure Signals:**
- Any remaining contradictory statement such as “always persisted” or “config toggle controls persist” without the new coupling rule.

**User Decision Prompt:**
- `请仅回复“通过”或“不通过”：SSOT 与实现文档是否已准确反映“生命周期元数据持久化与 resource-binding 流程绑定，且不依赖外部配置”的新真理？`

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/unity-runtime-process-rule-driven-implementation.md`

**Step 1: Update SSOT clauses and behavior tables**

- Correct sections in architecture overview, config behavior, and known boundaries.
- Replace stale claims about always-on persistence or config toggle semantics with the new coupling rule.

**Step 2: Update runtime implementation manual**

- Remove contradictory default (`default: true`) if no longer true in code.
- Clarify that persistence is pipeline-derived from Unity resource-binding flow.

**Step 3: Run doc consistency grep checks**

Run:

```bash
rg -n "persistLifecycleProcessMetadata|始终持久化|default: true|GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST" docs/unity-runtime-process-source-of-truth.md docs/unity-runtime-process-rule-driven-implementation.md
```

Expected: only intentional, consistent statements remain.

**Step 4: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/unity-runtime-process-rule-driven-implementation.md
git commit -m "docs(unity): align SSOT with resource-binding-coupled lifecycle persistence"
```

### Task 4: Update CLI/Config Guidance to Prevent Operator Misconfiguration

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
- Modify: `docs/gitnexus-config-files.md`
- Optional Modify: `AGENTS.md` (only if behavior statement appears there)

**Step 1: Remove stale guidance implying external toggle control**

- Ensure analyze guidance does not imply users can/should toggle lifecycle metadata persistence externally.
- If config schema examples mention this toggle, annotate as deprecated/removed per implementation.

**Step 2: Verify guidance consistency**

Run:

```bash
rg -n "persistLifecycleProcessMetadata|GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST" .agents/skills/gitnexus/gitnexus-cli/SKILL.md docs/gitnexus-config-files.md AGENTS.md
```

Expected: no stale operator instructions for this behavior.

**Step 3: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-cli/SKILL.md docs/gitnexus-config-files.md AGENTS.md
git commit -m "docs(cli): remove stale lifecycle-persist toggle guidance"
```

### Task 5: End-to-End Verification and Final Evidence Snapshot

**User Verification: not-required**

**Files:**
- Create: `docs/reports/2026-04-07-unity-resource-binding-persist-coupling-validation.md`

**Step 1: Run full targeted verification**

Run:

```bash
npm --prefix gitnexus exec vitest run test/integration/unity-lifecycle-process-persist.test.ts
npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"
npm --prefix gitnexus exec vitest run test/integration/local-backend.test.ts -t "query process detail includes persisted lifecycle evidence"
```

Expected: PASS.

**Step 2: Produce validation report**

Record:
- executed commands,
- pass/fail summary,
- representative persisted Process/STEP evidence excerpts,
- doc sync checklist completion.

**Step 3: Commit**

```bash
git add docs/reports/2026-04-07-unity-resource-binding-persist-coupling-validation.md
git commit -m "docs(report): validate resource-binding-coupled lifecycle persistence"
```

## Plan Audit Verdict
audit_scope: [pipeline persistence semantics, unity config contract, SSOT/runtime docs, CLI guidance]
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- [P1] Ambiguity in “resource-binding flow active” predicate (isUnityProject vs bindingCount>0 vs analyzeRules>0) may cause expectation mismatch; status: accepted (must be fixed during Task 1 by encoding one explicit rule + test name that mirrors that rule).
anti_placeholder_checks:
- plan paths and commands are concrete and repository-local: pass
authenticity_checks:
- includes graph-backed integration verification for Process/STEP evidence, not shape-only checks: pass
approval_decision: pass
