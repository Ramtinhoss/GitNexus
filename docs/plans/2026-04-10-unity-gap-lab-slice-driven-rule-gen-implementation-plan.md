# Unity Gap-Lab Slice-Driven Rule Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `gitnexus-unity-rule-gen` 从“链路线索一次性录入”迁移为“gap-lab 切片驱动、可跨会话恢复、单切片闭环执行”的工作流。

**Architecture:** 采用“契约先行 + 技能迁移 + 文档与测试护栏”三层实现。第一层用共享契约和集成测试固定 gap taxonomy、focus-lock、持久化布局和反作弊语义；第二层重写 skill 工作流为 Phase A/B/C/D，并把单切片执行绑定到现有 `rule-lab` 生命周期命令；第三层同步更新配置/真理源/安装产物文档，保证 setup 分发后的行为与主仓一致。

**Tech Stack:** Markdown skills (`gitnexus/skills/**` + `.agents/skills/**`), TypeScript integration tests (`vitest` + `node --test` via `dist`), GitNexus Rule Lab CLI/MCP, JSON/JSONL artifacts under `.gitnexus/gap-lab/**`.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Focus-lock mandatory: 未指定 `gap_type/gap_subtype` 时必须先询问并锁定 | critical | Task 1, Task 3, Task 7 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `gitnexus/skills/gitnexus-unity-rule-gen.md:focus-lock prompt block` | 技能直接进入 discovery，未出现 focus 询问与锁定步骤
DC-02 Slice-first workflow: 必须有 Phase A/B/C/D，且每轮只执行一个 slice | critical | Task 1, Task 3, Task 8 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `gitnexus/skills/gitnexus-unity-rule-gen.md:Phase A/B/C/D sections` | 出现“run all slices”隐式行为或缺少任一阶段
DC-03 Gap taxonomy contract: `gap_type/gap_subtype/pattern_id/detector_version` 必须落盘 | critical | Task 2, Task 3, Task 7 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `gitnexus/skills/_shared/unity-gap-lab-contract.md:taxonomy schema` | candidate 记录缺任一关键字段或字段名漂移
DC-04 Session-resumable persistence: `.gitnexus/gap-lab/runs/<run_id>/*` 布局与职责完整 | critical | Task 1, Task 3, Task 5, Task 8 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js gitnexus/dist/test/integration/rule-lab-contracts.test.js` | `docs/gitnexus-config-files.md:gap-lab ownership table`, `skill persistence tree` | 缺 `progress.json` 或 `inventory.jsonl` 等关键恢复文件
DC-05 Gap discovery policy: semantic-first + graph-missing verification，不允许 graph-only 假发现 | critical | Task 3, Task 7 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `gitnexus/skills/gitnexus-unity-rule-gen.md:discovery pipeline section` | 工作流把“图里不存在”当成唯一发现逻辑且无语义候选阶段
DC-06 Pattern catalog strategy: built-in + repo override，run 内 freeze `patterns_version/pattern_snapshot_hash` | major | Task 2, Task 3, Task 8 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `manifest.json template in skill`, `unity-gap-lab-contract.md` | 每轮临时改 pattern 导致 run 不可复现
DC-07 Binding mapping policy: 使用现有 kind 映射，无法表达时标记 `needs new binding kind` | major | Task 3, Task 7 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js` | `gitnexus/skills/gitnexus-unity-rule-gen.md:binding mapping table` | 把无法映射的 gap 强行写成错误 binding
DC-08 Distribution parity: 源 skill 与安装副本必须同步 | critical | Task 4, Task 9 | `diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` | `source/install skill files` | setup 后用户仓仍拿到旧版 chain-clue 工作流
DC-09 Source-of-truth/doc sync: Unity runtime 真理源与 config 规则同步声明 gap-lab 边界 | major | Task 5, Task 6, Task 9 | `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/rule-lab-contracts.test.js` | `docs/unity-runtime-process-source-of-truth.md`, `docs/gitnexus-config-files.md`, `AGENTS.md` | 文档仍指向旧流程或遗漏新状态文件所有权

## Authenticity Assertions

- `assert no placeholder path`: 任何落盘路径不得包含 `<run_id>`、`<slice_id>`、`<path>` 这类占位符字符串；测试必须断言真实路径模式。
- `assert live mode has tool evidence`: skill 中的 live 执行步骤必须包含可执行命令与预期输出证据，而不是“手工假设已完成”。
- `assert freeze requires non-empty confirmed_chain.steps`: 在进入 `verified/done` 前，必须要求非空 `confirmed_chain.steps`（或等价非空闭环证据数组）并写入切片文件。

## Skill References

- `@superpowers:executing-plans`
- `@superpowers:verification-before-completion`
- `@gitnexus-unity-rule-gen`
- `@gitnexus-guide`

### Task 1: 建立 Gap-Lab 技能契约失败测试基线

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('enforces Phase A/B/C/D + mandatory focus-lock + single-slice loop', async () => {
  // read gitnexus/skills/gitnexus-unity-rule-gen.md
  // expect phase headers and explicit "if target gap_type/subtype missing -> ask user"
  // reject any "run all slices" wording
});

it('requires .gitnexus/gap-lab persistence layout fields in skill contract', async () => {
  // assert manifest/slice-plan/progress/inventory/decisions/slices/<slice_id>.json are all documented
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL (当前 skill 仍是 chain-clue-first，缺少 gap-lab 关键语义)。

**Step 3: Write minimal implementation placeholder hooks**

```ts
// Add TODO expectations and helper readers in test file:
// - readRepoFile('gitnexus/skills/gitnexus-unity-rule-gen.md')
// - readRepoFile('.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md')
```

**Step 4: Run test to verify it still fails only on new assertions**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL with explicit missing clauses list.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "test(integration): add failing gap-lab skill contract coverage"
```

### Task 2: 新增 Gap-Lab 共享契约文档（source + installed）

**User Verification: not-required**

**Files:**
- Create: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Create: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
- Modify: `AGENTS.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing test for contract references**

```ts
it('requires shared unity-gap-lab contract file and schema blocks', async () => {
  // check both source and installed _shared contract exist
  // assert taxonomy, status model, persistence schema headings present
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL because `_shared/unity-gap-lab-contract.md` 不存在。

**Step 3: Write minimal implementation**

```md
# Unity Gap-Lab Contract
- taxonomy keys: gap_type, gap_subtype, pattern_id, detector_version
- status enum: pending|in_progress|blocked|rule_generated|indexed|verified|done
- persistence tree under .gitnexus/gap-lab/runs/<run_id>/...
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: PASS for shared-contract existence assertions.

**Step 5: Commit**

```bash
git add gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md AGENTS.md
git commit -m "docs(skill): add shared unity gap-lab contract and setup index entry"
```

### Task 3: 重写 Source Skill 为 Slice-Driven Gap-Lab 工作流

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing test for new workflow semantics**

```ts
it('documents Phase A init, Phase B focus-lock, Phase C single-slice execution, Phase D persist-stop', async () => {
  // assert sections and ordering
});

it('documents confidence policy and confirmation thresholds', async () => {
  // >=0.8 auto, 0.5-0.8 lightweight confirm, <0.5 mandatory confirm
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL on missing phase/confidence/focus-lock semantics.

**Step 3: Write minimal implementation**

```md
## Phase A Run Init
- create full slice skeleton under .gitnexus/gap-lab/runs/<run_id>/

## Phase B Focus Lock
- if no gap_type/gap_subtype provided, ask user and lock one slice

## Phase C Single-Slice Loop
- discover -> missing-edge verify -> generate rule -> compile/analyze -> verify

## Phase D Persist & Stop
- update progress.json + slice status, stop with resumable next command
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: PASS for phase/focus/taxonomy/persistence assertions.

**Step 5: Commit**

```bash
git add gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "feat(skill): migrate unity rule gen to gap-lab slice-driven workflow"
```

### Task 4: 同步安装副本并加 Parity Guard

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing parity test**

```ts
it('keeps source and installed unity-rule-gen skill in byte-level parity', async () => {
  // expect(sourceSkill === installedSkill)
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL until installed copy is updated.

**Step 3: Write minimal implementation**

```bash
cp gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md
```

**Step 4: Run test to verify it passes**

Run: `diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md && npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: `diff` 无输出且测试 PASS。

**Step 5: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts
git commit -m "chore(skill): sync installed unity rule-gen copy with source"
```

### Task 5: 更新 Config/State 文件所有权文档与契约测试

**User Verification: not-required**

**Files:**
- Modify: `docs/gitnexus-config-files.md`
- Modify: `gitnexus/test/integration/rule-lab-contracts.test.ts`
- Test: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('documents gap-lab state ownership under .gitnexus/gap-lab/runs/**', async () => {
  // assert docs mention manifest/slice-plan/progress/inventory/decisions/slices/*.json
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/rule-lab-contracts.test.js`
Expected: FAIL because config doc lacks gap-lab ownership rows.

**Step 3: Write minimal implementation**

```md
| `gap-lab/runs/**` | `gitnexus-unity-rule-gen` | Gap-lab run artifacts and resumable progress |
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/rule-lab-contracts.test.js`
Expected: PASS for new doc contract assertions.

**Step 5: Commit**

```bash
git add docs/gitnexus-config-files.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(config): add gap-lab artifact ownership contract"
```

### Task 6: 回写 Unity Runtime 真理源与 Guide 指南

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `gitnexus/skills/gitnexus-guide.md`
- Modify: `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- Test: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('truth source states gap-lab is authoring workflow and does not change query-time graph-only closure', async () => {
  // assert doc includes boundary statement and resume semantics
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/rule-lab-contracts.test.js`
Expected: FAIL until truth-source wording is updated.

**Step 3: Write minimal implementation**

```md
- gap-lab slice workflow is offline authoring/orchestration layer
- query-time runtime closure remains graph-only
- strict fallback requires parity rerun before closure claims
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/rule-lab-contracts.test.js`
Expected: PASS with updated truth-source and guide references.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md gitnexus/skills/gitnexus-guide.md .agents/skills/gitnexus/gitnexus-guide/SKILL.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(unity): align truth source and guide with gap-lab authoring boundary"
```

### Task 7: 增加反作弊负向测试（占位符/伪闭环/伪 live 证据）

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`

**Step 1: Write the failing negative tests**

```ts
it('rejects placeholder artifacts and requires concrete gap-lab paths', async () => {
  // fail if <run_id>/<slice_id>/<path> appears in executable steps
});

it('requires non-empty closure evidence before verified/done transition', async () => {
  // expect wording requiring confirmed_chain.steps (or equivalent non-empty evidence array)
});

it('requires executable tool evidence in live mode sections', async () => {
  // assert command + expected signal pairs exist
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: FAIL on anti-placeholder / authenticity checks.

**Step 3: Write minimal implementation**

```md
- add explicit "placeholder values are invalid" guard
- add verified/done gate requiring non-empty closure evidence field
- add command/evidence pairs for compile/analyze/verify steps
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js`
Expected: PASS for all negative assertions.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/skills/gitnexus-unity-rule-gen.md
git commit -m "test(skill): add anti-fake guards for gap-lab workflow authenticity"
```

### Task 8: 人工验收（单切片闭环 + 跨会话恢复）

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md`
- Test: `docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md`

**Human Verification Checklist:**
- 在未指定 `gap_type/gap_subtype` 时，技能先询问并锁定单个 slice。
- 首次运行后生成 `.gitnexus/gap-lab/runs/<run_id>/manifest.json`、`slice-plan.json`、`progress.json`。
- 单轮只处理一个 slice，结束时 `progress.json.checkpoint_phase` 更新为可恢复阶段。
- 重新进入会话后，技能可从 `progress.json` 给出继续命令而非重新初始化。
- 在无闭环证据时，状态不会进入 `verified/done`。

**Acceptance Criteria:**
- 每条 checklist 都在 smoke report 中有对应“命令 + 输出摘要 + 判定”。
- 产物路径为真实 run id，不含占位符。
- `slice-plan` 中存在且仅存在本轮 focus slice 的 `in_progress -> verified|blocked` 迁移记录。
- 恢复阶段指令可直接执行且不会重置已有 inventory。
- 证据不足场景被明确标记为 `blocked` 或 `rule_generated`，不是 `done`。

**Failure Signals:**
- 缺少 focus 询问或出现“全量 slice 自动执行”。
- 缺少 `progress.json` 或恢复提示无效。
- 状态在证据为空时仍标记 `verified/done`。
- 报告中的命令/输出为模板文本，不可复现。

**User Decision Prompt:**
- `请仅回复：通过 或 不通过。`

**Step 1: Write the failing verification scaffold**

```md
# Unity Gap-Lab Skill Smoke
- Case A: first-run focus lock
- Case B: resume from progress.json
- Case C: insufficient evidence gate
```

**Step 2: Run verification to confirm gaps are visible**

Run: `rg -n "Case A|Case B|Case C|判定" docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md`
Expected: 初始仅有模板，尚无完整证据。

**Step 3: Fill report with real execution evidence**

```md
## Case A
Command: <actual command>
Output summary: <actual>
Decision: PASS|FAIL
```

**Step 4: Re-run verification to ensure report completeness**

Run: `rg -n "Command:|Output summary:|Decision:" docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md`
Expected: 每个 case 都有完整证据字段。

**Step 5: Commit**

```bash
git add docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md
git commit -m "test(manual): add unity gap-lab skill smoke verification evidence"
```

### Task 9: 收口验证与交付提交

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/CHANGELOG.md`
- Test: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Test: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write failing changelog/doc release checks**

```md
- Add entry: unity-rule-gen migrated to gap-lab slice-driven workflow
- Add entry: new shared contract + gap-lab state ownership docs
```

**Step 2: Run verification to ensure checks catch missing updates**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js gitnexus/dist/test/integration/rule-lab-contracts.test.js`
Expected: 若漏同步文档/副本，应 FAIL。

**Step 3: Write minimal implementation**

```md
## [Unreleased]
- Added gap-lab slice-driven unity rule generation workflow and contracts.
```

**Step 4: Run full targeted verification to pass**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/test/integration/unity-gap-lab-skill-contracts.test.js gitnexus/dist/test/integration/rule-lab-contracts.test.js && diff -u gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
Expected: 所有测试 PASS，`diff` 无输出。

**Step 5: Commit**

```bash
git add gitnexus/CHANGELOG.md gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md docs/gitnexus-config-files.md docs/unity-runtime-process-source-of-truth.md docs/reports/2026-04-10-unity-gap-lab-skill-smoke.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/test/integration/rule-lab-contracts.test.ts AGENTS.md

git commit -m "feat(skill): ship unity gap-lab slice-driven rule generation workflow"
```

## Plan Audit Verdict
audit_scope: 设计文档 1-14 节（问题/目标/taxonomy/pattern catalog/state machine/persistence/迁移计划）+ Unity runtime 真理源边界一致性 + setup 安装副本一致性
finding_summary: P0=0, P1=1, P2=2
critical_mismatches:
- none
major_risks:
- `startup_bootstrap_gap` 仍使用 `method_triggers_method` 过渡映射，可能在复杂反射入口下覆盖不足；status: accepted
anti_placeholder_checks:
- 要求在合同测试中拒绝 `<run_id>/<slice_id>/<path>` 占位符；result: planned
- 要求 smoke report 使用真实命令与真实 artifact 路径；result: planned
authenticity_checks:
- 要求 `verified/done` 前必须有非空闭环证据数组；result: planned
- 要求 live 模式命令与输出信号成对记录；result: planned
approval_decision: pass
