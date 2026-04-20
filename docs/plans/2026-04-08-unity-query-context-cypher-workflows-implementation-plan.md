# Unity Query/Context/Cypher Workflows Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a human-facing Unity documentation artifact that explains `query/context/cypher` usage scenarios, return structures, and agent follow-up retrieval strategies for exploring/debugging/refactoring workflows.

**Architecture:** Build an evidence-first documentation pipeline: capture live Unity tool outputs into versioned artifacts, enforce semantic checks on closure/parity behavior, and then author workflow chapters from those validated artifacts. Keep one authoritative user guide plus cross-links from existing runtime-process documentation.

**Tech Stack:** Markdown docs, GitNexus CLI/MCP outputs, shell verification (`rg`, `jq`), git.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | `test -f` prechecks returned non-zero (`json_exit=1`, `md_exit=1`); captured live `workflows.exploring/debugging/refactoring` + `negative_cases.neg_01/02/03`; baseline semantic `jq -e` passed
Task 2 | completed | red check passed (`test -f` exit=1); created `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` with mandatory sections; section anchor verification (`rg -n "^## "`) passed
Task 3 | completed | exploring chapter now includes `query -> context -> cypher` playbook, `process_ref.reader_uri` and `next_hops` action chain; verification `rg -n` for required fields passed
Task 4 | completed | debugging chapter now includes `verifier-core/policy-adjusted`, strict fallback and parity retry guardrails, runtime_claim taxonomy, and hops/gaps-driven next action; dual semantic `jq -e` checks passed
Task 5 | completed | added NEG-01/02/03 anti-fake cases with bad/correct interpretation + executable `jq -e` commands; negative semantic gate checks and evidence refs passed
Task 6 | completed | added refactoring `query -> context -> cypher` sequence with `CALLS/HAS_METHOD/STEP_IN_PROCESS` templates and metric framework (`可执行率/收敛率/收益率`) including `采集方式` and `Failure Signal`
Task 7 | completed | human verification initially failed on readability; guide restructured around tool role, return shapes, parameter purpose, and deepen-vs-conclude rules; human verification returned `通过`
Task 8 | completed | added `Source Anchor Map` covering CLI surface, MCP schema, return assembly, runtime semantics, verifier path, and process refs; required source-path coverage `rg -n` passed

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 三工作流组织必须成立（exploring/debugging/refactoring） | critical | Task 2, Task 3, Task 4, Task 6 | `rg -n "^## .*Exploring|^## .*Debugging|^## .*Refactoring" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md:workflow_headings` | 任一工作流章节缺失
DC-02 Unity runtime 双层语义与 guardrails 必须与真理源一致 | critical | Task 1, Task 4 | `jq -e '(.workflows.debugging.query.runtime_claim.verification_core_status=="verified_full" or .workflows.debugging.query.runtime_claim.verification_core_status=="failed") and (if .workflows.debugging.query.hydrationMeta.fallbackToCompact==true then .workflows.debugging.query.runtime_claim.status!="verified_full" else true end) and (if .workflows.debugging.query.runtime_claim.status=="verified_full" then ((.workflows.debugging.query.runtime_claim.evidence_level=="verified_chain") and ((.workflows.debugging.query.runtime_claim.hops|length)>0) and ((.workflows.debugging.query.runtime_claim.gaps|length)==0)) else true end) and (if .workflows.debugging.query.runtime_claim.status=="failed" then (.workflows.debugging.query.runtime_claim.reason=="rule_not_matched" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_evidence_missing" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_verification_failed") else true end)' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json` | `docs/reports/2026-04-08-unity-query-context-cypher-evidence.json:workflows.debugging.query.runtime_claim` | strict fallback 仍给 closure，或 verified_full 无闭环证据，或 failed 无合法分类原因
DC-03 每个工作流必须具备“命令 -> 关键字段 -> 下一跳动作”链路 | critical | Task 1, Task 3, Task 4, Task 6 | `jq -e '.workflows|has("exploring") and has("debugging") and has("refactoring")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json && rg -n "Evidence Ref: workflows\\.exploring|Evidence Ref: workflows\\.debugging|Evidence Ref: workflows\\.refactoring|next_hops|process_ref\\.reader_uri|runtime_claim" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `evidence.json:workflows.* + guide:evidence_ref markers` | 缺工作流证据集，或文档未绑定真实证据引用
DC-04 文档需服务后续优化：提供可测指标与失败信号 | critical | Task 6 | `rg -n "可执行率|收敛率|收益率|Failure Signal|采集方式" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md:optimization_metrics_appendix` | 指标缺采集方式或缺失败信号
DC-05 占位符泄漏必须被阻断且示例可直接复制执行 | critical | Task 7 | `! rg -n "<[^>]+>|TODO|TBD" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md:runnable_commands` | 出现占位符或未完成标记
DC-06 关键反作弊负向规则必须显式验证 | critical | Task 5, Task 7 | `jq -e '(.negative_cases.neg_01.assumption.processes_empty==true and .negative_cases.neg_01.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_01.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_01.runtime_claim.status!="verified_full") and (.negative_cases.neg_02.assumption.fallback_to_compact==true and .negative_cases.neg_02.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_02.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_02.runtime_claim.status!="verified_full") and (.negative_cases.neg_03.assumption.hops_empty==true and .negative_cases.neg_03.assumption.gaps_empty==true and .negative_cases.neg_03.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_03.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_03.runtime_claim.status!="verified_full")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json && rg -n "NEG-01|NEG-02|NEG-03|jq -e" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `evidence.json:negative_cases.runtime_claim + guide:NEG cases` | 负向样例未绑定真实 runtime_claim 语义，或 taxonomy/禁闭环断言缺失
DC-07 与既有 Unity 文档建立可追溯链接 | high | Task 7 | `rg -n "UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS|unity-runtime-process-source-of-truth" UNITY_RUNTIME_PROCESS.md UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `UNITY_RUNTIME_PROCESS.md:cross_link` | 新旧文档未建立可用链接
DC-08 关键字段必须可追溯到源码锚点 | critical | Task 8 | `rg -n "gitnexus/src/cli/tool.ts|gitnexus/src/mcp/tools.ts|gitnexus/src/mcp/local/local-backend.ts|gitnexus/src/mcp/local/runtime-claim.ts|gitnexus/src/mcp/local/runtime-chain-verify.ts|gitnexus/src/mcp/local/process-ref.ts" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md` | `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md:source_anchor_map` | 关键字段无源码锚点映射
DC-09 freeze gate 必须可执行：verified 结论不能在 hops/gaps 均空时成立 | critical | Task 4, Task 7 | `jq -e 'if .workflows.debugging.query.runtime_claim.status=="verified_full" then ((.workflows.debugging.query.runtime_claim.hops|length)>0 and (.workflows.debugging.query.runtime_claim.gaps|length)==0) else true end' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json` | `evidence.json:workflows.debugging.query.runtime_claim` | 出现 verified_full 且 hops/gaps 同时空或不满足闭环约束

## Authenticity Assertions

- assert no placeholder path: 最终“可执行命令”区块不允许 `<...>`、`TODO`、`TBD`。
- assert live mode has tool evidence: 每个工作流章节必须包含 `Evidence Ref: workflows.<name>...`，且可在 `docs/reports/2026-04-08-unity-query-context-cypher-evidence.json` 找到对应字段。
- assert freeze requires non-empty confirmed_chain.steps: 任何“闭环/验证”结论必须同时给出 `runtime_claim.hops` 或 `runtime_claim.gaps` 的非空证据，不允许仅凭字段存在。

### Task 1: Capture Live Evidence and Semantic Baseline

**User Verification: not-required**

**Files:**
- Create: `docs/reports/2026-04-08-unity-query-context-cypher-evidence.json`
- Create: `docs/reports/2026-04-08-unity-query-context-cypher-evidence.md`

**Step 1: Write failing existence checks**

Run:
`test -f docs/reports/2026-04-08-unity-query-context-cypher-evidence.json; test -f docs/reports/2026-04-08-unity-query-context-cypher-evidence.md`
Expected: non-zero exits.

**Step 2: Capture workflow-level live outputs**

Capture three workflow evidence sets under JSON keys:
- `workflows.exploring` (query/context/cypher chain),
- `workflows.debugging` (query/context with runtime-claim focus),
- `workflows.refactoring` (query/context/cypher for structure surface).

Also capture `negative_cases` dataset:
- `negative_cases.neg_01` with `assumption.processes_empty=true` + full `runtime_claim`,
- `negative_cases.neg_02` with `assumption.fallback_to_compact=true` + full `runtime_claim`,
- `negative_cases.neg_03` with `assumption.hops_empty=true` and `assumption.gaps_empty=true` + full `runtime_claim`.

Persist raw JSON in `.json`, and add human-readable extraction in `.md`.

**Step 3: Run semantic baseline checks (failure-first)**

Run:
`jq -e '(.workflows|has("exploring") and has("debugging") and has("refactoring")) and ((.workflows.exploring.query|type)=="object") and ((.workflows.exploring.context|type)=="object") and ((.workflows.exploring.cypher.row_count|tonumber)>=1) and ((.workflows.debugging.query|type)=="object") and ((.workflows.refactoring.cypher.row_count|tonumber)>=1) and (.workflows.debugging.query.runtime_claim.verification_core_status=="verified_full" or .workflows.debugging.query.runtime_claim.verification_core_status=="failed") and (if .workflows.debugging.query.runtime_claim.status=="verified_full" then ((.workflows.debugging.query.runtime_claim.hops|length)>0 and (.workflows.debugging.query.runtime_claim.gaps|length)==0 and .workflows.debugging.query.runtime_claim.evidence_level=="verified_chain") else true end) and (if .workflows.debugging.query.runtime_claim.status=="failed" then (.workflows.debugging.query.runtime_claim.reason=="rule_not_matched" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_evidence_missing" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_verification_failed") else true end)' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json`

Expected: PASS only when live outputs are structurally and semantically complete.

**Step 4: Commit**

```bash
git add docs/reports/2026-04-08-unity-query-context-cypher-evidence.json docs/reports/2026-04-08-unity-query-context-cypher-evidence.md
git commit -m "docs(report): capture live unity query-context-cypher semantic baseline"
```

### Task 2: Create Documentation Skeleton

**User Verification: not-required**

**Files:**
- Create: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Write failing check**

Run: `test -f UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: non-zero exit.

**Step 2: Add skeleton with mandatory sections**

Include:
- intro + audience,
- `## Exploring Workflow`,
- `## Debugging Workflow`,
- `## Refactoring Workflow`,
- `## Unity vs Generic Behavior`,
- `## Optimization Metrics`.

**Step 3: Verify section anchors**

Run: `rg -n "^## " UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: all mandatory sections present.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: scaffold unity query-context-cypher workflows guide"
```

### Task 3: Implement Exploring Workflow Playbook

**User Verification: not-required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Red check for missing action chain**

Run: `rg -n "Exploring Workflow|next_hops|process_ref\.reader_uri|gitnexus query|gitnexus context|gitnexus cypher" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: missing/incomplete before edits.

**Step 2: Author exploring chapter from live evidence**

Must include:
- concept-to-process discovery using `query`,
- symbol deep dive using `context`,
- process/derived-process follow-up via `process_ref.reader_uri`,
- `cypher`补洞策略,
- one concrete command-field-next-hop walkthrough tied to evidence artifact,
- explicit evidence marker: `Evidence Ref: workflows.exploring.*`.

**Step 3: Verify command->field->action chain exists**

Run: `rg -n "Evidence Ref: workflows\\.exploring|next_hops|process_ref\\.reader_uri|processes\\[\\]|process_symbols\\[\\]|definitions\\[\\]" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: complete chain present.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: add exploring workflow command-field-action playbook"
```

### Task 4: Implement Debugging Workflow with Dual-Semantic Closure Rules

**User Verification: not-required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Red check for missing dual-semantic guards**

Run: `rg -n "verifier-core|policy-adjusted|needsParityRetry|fallbackToCompact|runtime_chain_verify=on-demand" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: incomplete before edits.

**Step 2: Author debugging chapter**

Must include:
- low-confidence interpretation (`evidence_mode/resource_heuristic`),
- parity retry trigger and strict fallback warning,
- `runtime_claim` reason taxonomy,
- `hops/gaps`-driven next command logic,
- explicit evidence marker: `Evidence Ref: workflows.debugging.*`.

**Step 3: Semantic verification against live artifact (includes dedicated freeze gate)**

Run:
`jq -e '(if .workflows.debugging.query.hydrationMeta.fallbackToCompact==true then .workflows.debugging.query.runtime_claim.status!="verified_full" else true end) and (if .workflows.debugging.query.runtime_claim.status=="verified_full" then ((.workflows.debugging.query.runtime_claim.hops|length)>0 and (.workflows.debugging.query.runtime_claim.gaps|length)==0 and .workflows.debugging.query.runtime_claim.evidence_level=="verified_chain") else true end) and (if .workflows.debugging.query.runtime_claim.status=="failed" then (.workflows.debugging.query.runtime_claim.reason=="rule_not_matched" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_evidence_missing" or .workflows.debugging.query.runtime_claim.reason=="rule_matched_but_verification_failed") else true end)' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json && jq -e 'if .workflows.debugging.query.runtime_claim.status=="verified_full" then ((.workflows.debugging.query.runtime_claim.hops|length)>0 and (.workflows.debugging.query.runtime_claim.gaps|length)==0) else true end' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json`

Expected: PASS.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: add debugging workflow with verifier-core vs policy-adjusted guards"
```

### Task 5: Add Anti-Fake Negative Semantic Cases

**User Verification: not-required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Add failure-first placeholders (red)**

Run: `rg -n "NEG-01|NEG-02|NEG-03" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: no matches before edits.

**Step 2: Add three mandatory negative cases**

Add explicit cases with failure criteria:
- `NEG-01`: `processes=[]` does not mean no runtime chain.
- `NEG-02`: `strict + fallbackToCompact=true` cannot conclude closure.
- `NEG-03`: missing `hops` and missing `gaps` cannot be labeled verified.

Each case must include:
- bad interpretation,
- correct interpretation,
- verification command (`jq -e` based),
- explicit evidence marker (`Evidence Ref: negative_cases.neg_0x`).

**Step 3: Verify negative-case completeness**

Run:
`jq -e '(.negative_cases.neg_01.assumption.processes_empty==true and .negative_cases.neg_01.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_01.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_01.runtime_claim.status!="verified_full") and (.negative_cases.neg_02.assumption.fallback_to_compact==true and .negative_cases.neg_02.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_02.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_02.runtime_claim.status!="verified_full") and (.negative_cases.neg_03.assumption.hops_empty==true and .negative_cases.neg_03.assumption.gaps_empty==true and .negative_cases.neg_03.runtime_claim.verification_core_status=="failed" and (.negative_cases.neg_03.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_verification_failed") and .negative_cases.neg_03.runtime_claim.status!="verified_full")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json && rg -n "NEG-01|NEG-02|NEG-03|Evidence Ref: negative_cases\\.neg_01|Evidence Ref: negative_cases\\.neg_02|Evidence Ref: negative_cases\\.neg_03|jq -e" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

Expected: semantic checks pass and all NEG cases contain executable verification commands.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: add anti-fake negative semantic cases for runtime retrieval"
```

### Task 6: Implement Refactoring Workflow and Optimization Metrics

**User Verification: not-required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Red check for missing refactoring + metrics**

Run: `rg -n "Refactoring Workflow|HAS_METHOD|STEP_IN_PROCESS|Optimization Metrics|Failure Signal" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: incomplete before edits.

**Step 2: Author refactoring + metrics sections**

Must include:
- `query -> context -> cypher` refactor-prep sequence,
- structural query templates (`CALLS/HAS_METHOD/STEP_IN_PROCESS`),
- at least 3 measurable optimization metrics with collection method and failure signals,
- explicit evidence marker: `Evidence Ref: workflows.refactoring.*`.

**Step 3: Verify metric completeness**

Run: `rg -n "Evidence Ref: workflows\\.refactoring|可执行率|收敛率|收益率|采集方式|Failure Signal" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: all metrics include collection + failure definition.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: add refactoring workflow and optimization metric framework"
```

### Task 7: Cross-Link, Placeholder Gate, and Final Semantic Consistency

**User Verification: required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
- Modify: `UNITY_RUNTIME_PROCESS.md`

**Human Verification Checklist:**
- 新文档中的命令示例没有占位符，且可直接复制执行。
- 旧文档到新文档的链接可用，新文档回链真理源。
- 负向规则（NEG-01/02/03）能清楚防止误判。
- 指标章节可直接支持后续优化讨论。

**Acceptance Criteria:**
- 文档内无 `<...>`、`TODO`、`TBD` 占位符。
- 链接路径有效且双向可追溯。
- 每条负向规则有对应验证命令。
- 指标具备“定义 + 采集方式 + failure signal”。

**Failure Signals:**
- 文档存在占位符。
- 链接失效或未建立。
- 负向规则缺命令或缺失败判定。
- 指标无法落地采集。

**User Decision Prompt:**
- `请按清单检查文档后只回复：通过 或 不通过。`

**Step 1: Enforce placeholder rejection gate**

Run: `! rg -n "<[^>]+>|TODO|TBD" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: PASS.

**Step 2: Verify links and semantic anchors**

Run:
`rg -n "UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS|unity-runtime-process-source-of-truth|NEG-01|NEG-02|NEG-03|next_hops|runtime_claim|Evidence Ref: workflows\\.exploring|Evidence Ref: workflows\\.debugging|Evidence Ref: workflows\\.refactoring" UNITY_RUNTIME_PROCESS.md UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md && jq -e 'if .workflows.debugging.query.runtime_claim.status==\"verified_full\" then ((.workflows.debugging.query.runtime_claim.hops|length)>0 and (.workflows.debugging.query.runtime_claim.gaps|length)==0) else true end' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json`

Expected: all anchors present.

**Step 3: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md UNITY_RUNTIME_PROCESS.md
git commit -m "docs: finalize unity query-context-cypher workflows guide with anti-fake gates"
```

### Task 8: Add Source Anchor Traceability Map

**User Verification: not-required**

**Files:**
- Modify: `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`

**Step 1: Red check for missing source anchors**

Run: `rg -n "Source Anchor Map|gitnexus/src/mcp/local/local-backend.ts|gitnexus/src/mcp/tools.ts" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: incomplete before edits.

**Step 2: Add source-anchor map section**

Create a dedicated `Source Anchor Map` table that maps key documented fields to concrete implementation files:
- CLI surface: `gitnexus/src/cli/tool.ts`, `gitnexus/src/cli/index.ts`
- Tool schema: `gitnexus/src/mcp/tools.ts`
- Return assembly: `gitnexus/src/mcp/local/local-backend.ts`
- Runtime semantics: `gitnexus/src/mcp/local/runtime-claim.ts`, `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Process links: `gitnexus/src/mcp/local/process-ref.ts`, `gitnexus/src/mcp/resources.ts`

**Step 3: Verify anchor coverage**

Run: `rg -n "gitnexus/src/cli/tool.ts|gitnexus/src/mcp/tools.ts|gitnexus/src/mcp/local/local-backend.ts|gitnexus/src/mcp/local/runtime-claim.ts|gitnexus/src/mcp/local/runtime-chain-verify.ts|gitnexus/src/mcp/local/process-ref.ts|gitnexus/src/mcp/resources.ts" UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`
Expected: all required anchor paths present.

**Step 4: Commit**

```bash
git add UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md
git commit -m "docs: add source anchor traceability map for query-context-cypher guide"
```

## Plan Audit Verdict
audit_scope: design clauses DC-01..DC-09 from `docs/plans/2026-04-08-unity-query-context-cypher-workflow-design.md`
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- workflow evidence was tool-level only; status: fixed by workflow-scoped evidence dataset requirement in Task 1
- authenticity gates were declarative only; status: fixed by `Evidence Ref` + executable checks in Task 3/4/6/7
- source-anchor traceability task was missing; status: fixed by Task 8
- NEG-case gate previously used mirror status fields only; status: fixed via runtime_claim semantic assertions in DC-06/Task 5
- freeze evidence gate was implicit; status: fixed via explicit DC-09 + dedicated jq checks
anti_placeholder_checks:
- explicit `<...>|TODO|TBD` rejection command added: fixed
authenticity_checks:
- runtime closure semantics and taxonomy are asserted via jq checks on workflow evidence: fixed
- NEG-01/02/03 must pass semantic jq predicates against `negative_cases`: fixed
approval_decision: pass
