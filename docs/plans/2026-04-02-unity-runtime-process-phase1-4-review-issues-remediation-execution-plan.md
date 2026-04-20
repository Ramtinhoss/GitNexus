# Unity Runtime Process Phase1-4 Review Issues Remediation Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-04-02  
**Repo:** `GitNexus`  
**Owner:** GitNexus MCP / Unity Runtime Process  
**Plan Type:** Review issue remediation execution plan (post fact-check)

**Goal:** 修复 2026-04-02 review/fact-check 已确认的 6 个问题，确保 Phase1-4 对外契约从“字段存在”升级为“行为可验证且可回归”。

**Architecture:**  
优先修复契约阻断项（process reader 可读性、rule registry 作用域边界），再修复语义一致性项（rule-driven verifier 真正驱动、hydration 参数语义落地），最后补齐可执行性与验收覆盖（`next_action` 解析、失败分类覆盖）。修复同时更新真理源与验收 runner，避免“代码已改但验收仍假阳性”。

**Tech Stack:** TypeScript, MCP local backend, Vitest, node:test, benchmark runners, repo-local `.gitnexus/rules/**`.

---

## Status Ledger

Task | Status | Facts
--- | --- | ---
Task 0 | completed | Baseline captured with command evidence and FC mapping in docs/reports/2026-04-02-phase1-4-remediation-baseline.md
Task 1 | completed | queryProcessDetail now resolves by id first; integration test validates reader_uri readResource; phase1 runner upgraded to behavior-level readback metric (docs/reports/2026-04-02-phase1-process-ref-acceptance.remediated.json shows readable_rate=1.0)
Task 2 | completed | Removed ancestor fallback; registry missing catalog/rule mapped to diagnosable errors and then to rule_not_matched; registry + claim tests passing
Task 3 | completed | Human gate passed (`通过`): rule-driven matcher/required_hops/claim semantics accepted with test evidence
Task 4 | completed | Hydration precedence matrix implemented (policy high-priority, mode as input); hydrationMeta now exposes requestedMode/effectiveMode/reason; phase4 integration tests pass
Task 5 | completed | YAML scalar/list parser hardened; quote-safe parsing tests added; next_action now shell-parseable with balanced quotes
Task 6 | completed | Phase2 acceptance runner now enforces 4/4 failure reason coverage with hard assertion and reproduction commands; remediated artifact generated
Task 7 | completed | Truth-source/fact-check/issue-report/skill-contract synced to remediated semantics and acceptance criteria
Task 8 | completed | Human gate passed (`通过`); release gate commands green; validation + summary reports generated

## Context Baseline

### Source Documents

1. `docs/reports/2026-04-02-unity-runtime-process-phase1-4-review-fact-check.md`
2. `docs/reports/2026-04-02-unity-runtime-process-phase1-4-review-issue-report.md`
3. `docs/plans/2026-04-01-unity-runtime-process-structural-remediation-design.md`
4. `docs/unity-runtime-process-source-of-truth.md`

### Confirmed Problem Set (Must-fix Scope)

1. FC-01 / P1-READ-001: persistent `process_ref.reader_uri` 回读失败。
2. FC-02 / P2-RULE-001: rule registry 存在跨仓 ancestor fallback。
3. FC-03 / P2-RULE-002: verifier 执行仍由 Reload 硬编码主导，非真正 rule-driven。
4. FC-04 / P4-HYDR-001: `unity_hydration_mode` 参数未驱动执行。
5. FC-05 / P2-CLAIM-001: `runtime_claim.next_action` 尾引号损坏。
6. FC-06 / P2-ACC-001: Phase2 验收未覆盖全部失败分类。

### Root Cause Classification (for Execution Priority)

- Contract breaker: FC-01, FC-02
- Semantic divergence: FC-03, FC-04
- Actionability/acceptance gap: FC-05, FC-06

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-P1-READABLE | critical | Task 1, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable"` | `docs/reports/2026-04-02-phase1-4-remediation-validation.md:fc01.readable_via_reader_uri` | `readable_via_reader_uri < 100%` or any `Process 'proc_*' not found`
DC-P2-NO-FALLBACK | critical | Task 2, Task 8 | `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/runtime-claim-rule-registry.test.js` | `docs/reports/2026-04-02-phase1-4-remediation-validation.md:fc02.catalog_path_scope` | catalog path escapes target repo rulesRoot
DC-P2-RULE-DRIVEN | critical | Task 3, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts` | `docs/reports/2026-04-02-phase1-4-remediation-validation.md:fc03.rule_execution_inputs` | required hops/guarantees still hardcoded in verifier path
DC-P4-HYDRATION-SEM | critical | Task 4, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase4 hydration policy"` | `docs/reports/2026-04-02-phase1-4-remediation-validation.md:fc04.requested_vs_effective_mode` | `unity_hydration_mode` changes have no observable effect in allowed precedence matrix
DC-P2-ACTIONABLE-HINT | critical | Task 5, Task 8 | `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts -- -t "next_action"` | `docs/reports/2026-04-02-phase1-4-remediation-validation.md:fc05.next_action_shell_parsable` | trailing quote mismatch / command not shell-parseable
DC-P2-FAILURE-COVERAGE | critical | Task 6, Task 8 | `node gitnexus/dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json` | `...phase2-runtime-claim-acceptance.remediated.json:failure_classification_coverage` | not exactly four reasons: `rule_not_matched`, `rule_matched_but_evidence_missing`, `rule_matched_but_verification_failed`, `gate_disabled`

## Authenticity Assertions

1. `assert reader_uri is executable`: 所有 `process_ref.reader_uri` 必须可直接 `readResource` 成功，不能只检查字段存在。
2. `assert no cross-repo rule bleed`: 目标 repo 无规则时必须显式 `rule_not_matched`，不得加载 `process.cwd()` 祖先规则。
3. `assert rule-driven inputs are consumed`: `required_hops/guarantees/non_guarantees` 必须从 matched rule 注入执行与输出，不允许固定模板兜底。
4. `assert hydration param contract is observable`: 在同一 `hydration_policy` 下，`unity_hydration_mode` 的允许行为必须可观测并可解释。
5. `assert next_action copy-paste runnable`: `next_action` 必须可被 shell parser 接受。
6. `assert acceptance can fail correctly`: runner 必须可构造并报告四类失败，不允许“只覆盖两类仍通过”。

## Issue Validation Standards

### FC-01 / P1-READ-001

- Current fail reproduction:
  - `query` 返回 persistent `process_ref.reader_uri`。
  - `readResource(uri)` 返回 `Process 'proc_*' not found`。
- Fix pass criteria:
  - persistent URI 可按 `id` 或可逆映射成功读取。
  - `readable_via_reader_uri = 100%`（采样集与 acceptance runner 一致）。
- Evidence:
  - integration test + validation report section `fc01`.

### FC-02 / P2-RULE-001

- Current fail reproduction:
  - 目标 repo 无 rules 时加载到外部仓 `catalog.json`。
- Fix pass criteria:
  - `loadRuleRegistry(repoPath, rulesRoot)` 只在目标 repo rulesRoot 内解析。
  - 无规则时返回 `rule_not_matched`，无隐式 fallback。
- Evidence:
  - updated unit test + validation report section `fc02`.

### FC-03 / P2-RULE-002

- Current fail reproduction:
  - verifier 使用固定 token/path/guid + fixed required segments。
- Fix pass criteria:
  - verifier 执行链路以 matched rule 作为输入源。
  - `required_hops` 驱动 segment closure 判定。
  - `guarantees/non_guarantees` 默认来源为 rule（允许在缺省场景定义最小安全默认）。
- Evidence:
  - runtime-chain tests + validation report section `fc03`.

### FC-04 / P4-HYDR-001

- Current fail reproduction:
  - `unity_hydration_mode` 只 parse，不参与行为。
- Fix pass criteria:
  - 实施并文档化参数优先级：
    - `hydration_policy` 决策层，高优先级。
    - `unity_hydration_mode` 执行模式输入，低优先级且可回显。
  - 响应中可观察 `requested/effective/reason`。
- Evidence:
  - integration tests + validation report section `fc04`.

### FC-05 / P2-CLAIM-001

- Current fail reproduction:
  - `next_action` 尾引号缺失导致命令不可执行。
- Fix pass criteria:
  - 规则解析改为可靠 YAML 解析，或修复字符串解析器并新增 quote-safe 测试。
  - 所有 failure reason 的 `next_action` 可通过 shell parse。
- Evidence:
  - unit tests + validation report section `fc05`.

### FC-06 / P2-ACC-001

- Current fail reproduction:
  - acceptance runner 只统计两类失败。
- Fix pass criteria:
  - runner 输出覆盖四类失败并对 coverage 做严格断言。
  - 缺失任一分类时 runner 返回 failure。
- Evidence:
  - remediated acceptance artifact + validation report section `fc06`.

## Execution Tasks

### Task 0: Baseline Freeze and Reproduction Snapshot

**User Verification:** not-required

**Files:**
- Create: `docs/reports/2026-04-02-phase1-4-remediation-baseline.md`

**Steps:**
1. 记录当前 HEAD、索引时间、关键 env gate。
2. 复现 6 个问题并存证（命令、关键信息、失败信号）。
3. 固化 baseline 作为修复前对照。

**Validation Gate:** baseline 文档必须能一一映射到 FC-01..FC-06。

### Task 1: Fix FC-01 Process Reader Readability

**User Verification:** not-required

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/process-ref.ts`
- Modify: `gitnexus/src/mcp/resources.ts` (if process route contract needs explicit id/readable handling)
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.ts`

**Steps:**
1. 让 `queryProcessDetail` 支持 process `id` 直查，再回退 label/heuristicLabel。
2. 对 persistent `reader_uri` 与 resource parser 做一致性修正。
3. 补充集成测试：对 query 输出的每个 persistent URI 执行 readResource 并断言成功。
4. 升级 Phase1 runner：指标从字段可读改为真实回读成功率。

**Validation Gate:** `readable_via_reader_uri == 1.0`。

### Task 2: Fix FC-02 Rule Registry Scope Leakage

**User Verification:** not-required

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`

**Steps:**
1. 删除 `findAncestorRulesCatalog(process.cwd())` 兜底路径。
2. 缺 catalog/rule 文件时返回可诊断错误并在调用侧映射为 `rule_not_matched`。
3. 测试覆盖：
   - 目标 repo 无规则目录。
   - rulesRoot 存在但 catalog 缺失。
   - catalog 存在但 rule 文件缺失。

**Validation Gate:** catalog path 不得逃逸出 `repoPath/.gitnexus/rules`。

### Task 3: Fix FC-03 Rule-driven Verifier Semantics

**User Verification:** required

**Human Verification Checklist:**
1. 验证器是否仍依赖固定 Reload 常量才能工作。
2. 修改 rule `required_hops` 是否能影响 claim 结果。
3. 修改 rule `guarantees/non_guarantees` 是否能反映在输出。
4. 非 Reload trigger family 是否可通过规则扩展接入。

**Acceptance Criteria:**
1. 固定常量仅可作为 bootstrap default，不得成为唯一执行入口。
2. `required_hops` 调整后 evidence level 与 status 随之变化。
3. claim 的 guarantees/non_guarantees 来源可追溯到 matched rule。
4. 至少一条非 Reload 示例规则可走通匹配与失败分类路径。

**Failure Signals:**
1. 仍只有 `trigger_family=reload` 才能进入有效执行。
2. 修改 rule 文件对验证结果无影响。
3. claim 语义字段仍完全固定模板。

**User Decision Prompt:**  
`请仅回复“通过”或“不通过”：Task 3 的 rule-driven 行为是否满足以上 4 条验收标准？`

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `.gitnexus/rules/approved/*.yaml` (必要时新增示例规则)

**Validation Gate:** verifier 主逻辑输入来自 matched rule，非硬编码 segment/template。

### Task 4: Fix FC-04 Hydration Mode/Policy Contract

**User Verification:** not-required

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/hydration-policy-repeatability-runner.ts`

**Steps:**
1. 明确实现参数优先级矩阵并固化到代码注释与工具说明。
2. 输出 `hydrationMeta` 扩展字段（`requestedMode/effectiveMode/reason`）。
3. 补冲突矩阵测试（policy × mode）。
4. 校验 strict fallback 降级逻辑仍有效。

**Validation Gate:** 参数行为与文档一致，且调用方能从响应中解释行为。

### Task 5: Fix FC-05 `next_action` Parsing Robustness

**User Verification:** not-required

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts`
- Modify: `.gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml` (如需规范化 quoting)

**Steps:**
1. 以安全解析替换当前 `readScalar` 正则剥引号逻辑。
2. 增加带空格、双引号、单引号、转义字符的 parser 测试。
3. 校验 `next_action` 可直接复制执行。

**Validation Gate:** parser 输出与规则文件文本语义一致，无尾引号损坏。

### Task 6: Fix FC-06 Phase2 Acceptance Classification Coverage

**User Verification:** not-required

**Files:**
- Modify: `gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.test.ts`
- Modify: `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json` (new artifact)

**Steps:**
1. runner 增加四类失败场景构造与采集。
2. 增加 hard assertion：coverage 必须是 4/4。
3. 报告输出加入缺失分类详情与复现命令。

**Validation Gate:** 缺任一 failure reason 时 runner 失败。

### Task 7: Truth-source / Contract Sync

**User Verification:** not-required

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/reports/2026-04-02-unity-runtime-process-phase1-4-review-fact-check.md` (follow-up section)
- Modify: `docs/reports/2026-04-02-unity-runtime-process-phase1-4-review-issue-report.md` (resolution status)
- Modify: `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md`

**Steps:**
1. 将修复后的真实语义写入真理源。
2. 标记 6 个问题的最终状态（fixed / accepted risk / deferred）。
3. 对 skill contract 中与实现不一致的描述进行同步。

**Validation Gate:** 文档与代码行为一致，无冲突条目。

### Task 8: Final Regression and Submission Pack

**User Verification:** required

**Human Verification Checklist:**
1. 全量 build 与目标测试集通过。
2. 6 个问题校验标准全部满足。
3. 关键验收 artifact 已生成并可追溯。
4. 真理源与 issue report 状态一致。

**Acceptance Criteria:**
1. `npm --prefix gitnexus run build` 成功。
2. 指定测试命令全部通过且无跳过关键用例。
3. `docs/reports/2026-04-02-phase1-4-remediation-validation.md` 完整记录 6 项通过证据。
4. 无 open Critical issue。

**Failure Signals:**
1. 任一关键命令失败。
2. 任一 FC 项缺证据或结果不达标。
3. 文档与代码行为不一致。

**User Decision Prompt:**  
`请仅回复“通过”或“不通过”：Task 8 的最终回归与提交包是否满足以上 4 条验收标准？`

**Files:**
- Create: `docs/reports/2026-04-02-phase1-4-remediation-validation.md`
- Create: `docs/reports/2026-04-02-phase1-4-remediation-summary.md`

**Validation Commands (Release Gate):**
1. `npm --prefix gitnexus run build`
2. `npm --prefix gitnexus exec vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
3. `npm --prefix gitnexus exec vitest run gitnexus/test/integration/local-backend-calltool.test.ts -- -t "phase1 process_ref readable|phase2 runtime_claim contract|phase2 failure classifications|phase2 no cross-repo bootstrap fallback|phase4 hydration policy|phase4 missing_evidence and needsParityRetry"`
4. `node gitnexus/dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase1-process-ref-acceptance.remediated.json`
5. `node gitnexus/dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo GitNexus --out docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json`

## Risk and Rollback

1. 风险: rule-driven 改造可能影响现有 Reload 验证稳定性。  
   回滚: 保留 feature flag 或兼容桥接分支，失败时回退到上一稳定 commit。
2. 风险: hydration 参数语义变更影响调用方预期。  
   回滚: 保持旧字段兼容并在响应中增加迁移提示。
3. 风险: parser 更换引入规则解析兼容性问题。  
   回滚: 增加 golden tests 覆盖现存规则样本并启用双解析对照开关。

## Submission Definition

满足以下条件才允许“完成后提交”：

1. 6 个问题全部达到对应 `Fix pass criteria`。
2. `Design Traceability Matrix` 中所有 critical 条目验证通过。
3. `docs/reports/2026-04-02-phase1-4-remediation-validation.md` 已落盘且包含命令、结果、证据路径。
4. 变更集包含代码、测试、runner、文档四类资产，不接受仅文档修复。

## Plan Audit Verdict

audit_scope: `FC-01..FC-06 remediation execution, verification, and submission gates`  
finding_summary: `P0=0, P1=0, P2=1`  
critical_mismatches:
- none  
major_risks:
- none  
anti_placeholder_checks:
- `reader_uri must be executable` included  
- `no cross-repo fallback` included  
authenticity_checks:
- `rule-driven inputs consumed` included  
- `acceptance must fail when coverage<4` included  
approval_decision: pass
