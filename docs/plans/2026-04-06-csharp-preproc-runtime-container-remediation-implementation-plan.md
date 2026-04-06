# C# Preproc + Runtime Container Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过 `csproj DefineConstants` 驱动的 C# 条件编译归一化，降低 `root_has_error`；同时修正审计分类口径，并为 Unity runtime 规则增加可控的 class-like 容器支持。

**Architecture:** 在 analyze CLI 增加 `--csharp-define-csproj` 参数，将 define profile 注入 ingestion pipeline；在 parse 前统一执行 C# 预处理归一化（串行 + worker 一致）；在审计层新增 container-aware 分类；在 runtime rule 层通过 `unity.enableContainerNodes` 开关扩展容器匹配，默认保持旧行为。

**Tech Stack:** TypeScript, Node.js, tree-sitter 0.22.4, tree-sitter-c-sharp 0.23.1, Vitest, GitNexus pipeline/CLI/skills docs.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | `--csharp-define-csproj` 已加入 analyze CLI，`buildPipelineRunOptionsForAnalyze` 透传到 pipeline（`dist/cli/analyze.test.js` 通过）
Task 2 | completed | 新增 `csharp-define-profile.ts` + `test/unit/csharp-define-profile.test.ts`（通过）
Task 3 | completed | 新增 `csharp-preproc-normalizer.ts` + `test/unit/csharp-preproc-normalizer.test.ts`（通过）
Task 4 | completed | pipeline chunk 阶段按 C# define profile 归一化；串行 `parsing/import/call/heritage` 均支持 raw fallback
Task 5 | completed | worker 输入协议新增 `rawContent` + `csharpPreprocFallbackFiles`；`processParsing` 汇总 fallback 计数（单测通过）
Task 6 | completed | `PipelineResult/PipelineRuntimeSummary` 增加 `csharpPreprocDiagnostics`；analyze summary 输出已包含 CSharp Preproc 行
Task 7 | completed | 新增 `scripts/tree-sitter-audit-classify.mjs` 与 `test/unit/tree-sitter-audit-classify.test.ts`；文档口径改为 container-aware
Task 8 | completed | `unity.enableContainerNodes` 默认 false；runtime binding 支持 class-like 容器并新增 off/on 回归测试
Task 9 | completed | `gitnexus/skills/gitnexus-cli.md`、`.agents/.../gitnexus-cli/SKILL.md`、`AGENTS.md` 已同步 `--csharp-define-csproj` 工作流
Task 10 | completed | 用户已确认“通过”；验证报告已覆盖 5 条人工核验并附命令证据

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 单一编译画像来自 csproj DefineConstants | critical | Task 1, Task 2 | `cd gitnexus && npm test -- test/unit/csharp-define-profile.test.ts` | `defineProfile.symbols` | symbols 为空或未读取 DefineConstants
DC-02 C# parse 统一走预处理归一化（串行+worker） | critical | Task 3, Task 4, Task 5 | `cd gitnexus && npm test -- test/unit/csharp-preproc-normalizer.test.ts test/integration/csharp-preproc-pipeline.test.ts` | `pipeline.preprocStats.normalizedFiles` | normalizedFiles=0 或 worker/串行结果不一致
DC-03 预处理失败可回退并可观测 | critical | Task 6 | `cd gitnexus && npm test -- test/unit/analyze-runtime-summary.test.ts` | `runtimeSummary.csharpPreprocDiagnostics` | 无 fallback 计数或字段缺失
DC-04 审计分类口径改为 container-aware | high | Task 7 | `node gitnexus/scripts/tree-sitter-audit-classify.mjs --input <diagnostics.jsonl>` | `summary.byType.missing_container_with_methods` | interface/struct 样本仍被主告警误判
DC-05 runtime 容器扩展默认不回归 | critical | Task 8 | `cd gitnexus && npm test -- test/unit/unity-runtime-binding-rules.test.ts` | `result.edgesInjected`（开关 off/on 两组） | 开关 off 行为变化或开关 on 未新增目标命中
DC-06 CLI 行为变更同步到 skill 工作流 | high | Task 9 | `rg -n "csharp-define-csproj" gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md` | 两个 skill 文件都含新参数指导 | 仅代码改动而 skill 无同步说明

## Authenticity Assertions

1. `assert no placeholder path`
- `--csharp-define-csproj` 传空值/不存在路径必须报错，不允许静默 fallback 到“假默认 define”。

2. `assert live mode has tool evidence`
- analyze 输出必须包含 `csharpPreprocDiagnostics`，至少包含 `normalizedFiles / fallbackFiles / skippedFiles`。

3. `assert freeze requires non-empty confirmed_chain.steps`
- runtime 容器扩展在 `enableContainerNodes=false` 时命中集合与基线完全一致；开启后新增命中必须有 rule id 与 source/target method 证据。

4. `assert classification is semantic, not structural-only`
- container-aware 分类必须统计 `class/interface/struct/record/delegate/enum`，不能仅用 `class_count` 断言高风险。

### Task 1: CLI 参数扩展与 options 贯通

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/types/pipeline.ts`
- Test: `gitnexus/src/cli/analyze.test.ts`

**Step 1: Write the failing test**
- 在 `analyze.test.ts` 增加用例：CLI 解析 `--csharp-define-csproj` 后，`analyzeCommand` 接收该值并传入 pipeline options。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/cli/analyze.test.ts`
- Expected: FAIL（参数未识别或未透传）。

**Step 3: Write minimal implementation**
- `index.ts` 增加 analyze option。
- `AnalyzeOptions`、pipeline run options 增加 `csharpDefineCsproj?: string`。
- `analyze.ts` 将该参数注入 `runPipelineFromRepo`。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/cli/analyze.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/cli/index.ts gitnexus/src/cli/analyze.ts gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze.test.ts
git commit -m "feat(cli): add --csharp-define-csproj analyze option"
```

### Task 2: csproj DefineConstants 读取器

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/tree-sitter/csharp-define-profile.ts`
- Test: `gitnexus/test/unit/csharp-define-profile.test.ts`

**Step 1: Write the failing test**
- 覆盖：
  - `DefineConstants` 正常分号分割。
  - 多 `PropertyGroup` 处理。
  - 无字段时返回空集合。
  - 路径不存在时返回可识别错误。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/unit/csharp-define-profile.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- 实现 `loadCSharpDefineProfileFromCsproj(csprojPath)`。
- 输出结构包含：`symbols: Set<string>`, `sourcePath`, `rawDefineConstants`。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/unit/csharp-define-profile.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/core/tree-sitter/csharp-define-profile.ts gitnexus/test/unit/csharp-define-profile.test.ts
git commit -m "feat(csharp): load DefineConstants profile from csproj"
```

### Task 3: C# 预处理归一化器

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/core/tree-sitter/csharp-preproc-normalizer.ts`
- Test: `gitnexus/test/unit/csharp-preproc-normalizer.test.ts`

**Step 1: Write the failing test**
- 覆盖：
  - `#if/#elif/#else/#endif` 折叠。
  - 嵌套分支。
  - 未定义符号路径。
  - 行号保真（行数保持一致）。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/unit/csharp-preproc-normalizer.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- 实现 tokenizer + directive stack。
- 输出：`normalizedText`, `changed`, `diagnostics`。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/unit/csharp-preproc-normalizer.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/core/tree-sitter/csharp-preproc-normalizer.ts gitnexus/test/unit/csharp-preproc-normalizer.test.ts
git commit -m "feat(csharp): add conditional-compilation normalizer"
```

### Task 4: 串行链路接入归一化

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/parsing-processor.ts`
- Modify: `gitnexus/src/core/ingestion/import-processor.ts`
- Modify: `gitnexus/src/core/ingestion/call-processor.ts`
- Modify: `gitnexus/src/core/ingestion/heritage-processor.ts`
- Create: `gitnexus/test/integration/csharp-preproc-pipeline.test.ts`

**Step 1: Write the failing integration test**
- 构造带 `#if` 的 C# fixture。
- 断言开启 define profile 后可提取目标 symbol/关系。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/integration/csharp-preproc-pipeline.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- 在 C# parse 前调用 normalizer。
- 非 C# 语言保持原逻辑。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/integration/csharp-preproc-pipeline.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/core/ingestion/parsing-processor.ts gitnexus/src/core/ingestion/import-processor.ts gitnexus/src/core/ingestion/call-processor.ts gitnexus/src/core/ingestion/heritage-processor.ts gitnexus/test/integration/csharp-preproc-pipeline.test.ts
git commit -m "feat(ingestion): apply csharp preproc normalization in sequential parsers"
```

### Task 5: Worker 链路接入归一化

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/workers/worker-pool.ts`
- Modify: `gitnexus/src/core/ingestion/workers/parse-worker.ts`
- Modify: `gitnexus/src/core/ingestion/pipeline.ts`
- Test: `gitnexus/test/unit/sequential-language-availability.test.ts`
- Create: `gitnexus/test/unit/parse-worker-csharp-preproc.test.ts`

**Step 1: Write the failing worker test**
- 断言 worker 在收到 preproc profile 后与串行链路结果一致。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/unit/parse-worker-csharp-preproc.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- worker-pool message 协议加入 parse config。
- parse-worker 消费 config 并执行归一化。
- pipeline 在 worker dispatch 时传入 config。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/unit/parse-worker-csharp-preproc.test.ts test/integration/csharp-preproc-pipeline.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/core/ingestion/workers/worker-pool.ts gitnexus/src/core/ingestion/workers/parse-worker.ts gitnexus/src/core/ingestion/pipeline.ts gitnexus/test/unit/parse-worker-csharp-preproc.test.ts
git commit -m "feat(worker): enable csharp preproc normalization in parse workers"
```

### Task 6: 预处理诊断与 analyze 摘要

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/types/pipeline.ts`
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/cli/analyze-runtime-summary.ts`
- Modify: `gitnexus/src/cli/analyze-summary.ts`
- Test: `gitnexus/src/cli/analyze-runtime-summary.test.ts`

**Step 1: Write the failing test**
- 断言 runtime summary 含 `csharpPreprocDiagnostics` 字段与计数。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- src/cli/analyze-runtime-summary.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- pipeline 汇总 preproc 统计。
- analyze 输出 summary 和日志预览。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- src/cli/analyze-runtime-summary.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/types/pipeline.ts gitnexus/src/cli/analyze.ts gitnexus/src/cli/analyze-runtime-summary.ts gitnexus/src/cli/analyze-summary.ts gitnexus/src/cli/analyze-runtime-summary.test.ts
git commit -m "feat(analyze): report csharp preproc diagnostics in runtime summary"
```

### Task 7: 审计分类改造（container-aware）

**User Verification: not-required**

**Files:**
- Create: `gitnexus/scripts/tree-sitter-audit-classify.mjs`
- Create: `gitnexus/test/unit/tree-sitter-audit-classify.test.ts`
- Modify: `docs/neonspark-tree-sitter-parallel-audit-plan.md`

**Step 1: Write the failing test**
- 输入样本 JSONL，断言 `missing_container_with_methods` 与 `is_false_positive_likely` 分类正确。

**Step 2: Run test to verify it fails**
- Run: `cd gitnexus && npm test -- test/unit/tree-sitter-audit-classify.test.ts`
- Expected: FAIL。

**Step 3: Write minimal implementation**
- 新增分类脚本，输出 `container_counts`。
- 文档更新主告警定义。

**Step 4: Run test to verify it passes**
- Run: `cd gitnexus && npm test -- test/unit/tree-sitter-audit-classify.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/scripts/tree-sitter-audit-classify.mjs gitnexus/test/unit/tree-sitter-audit-classify.test.ts docs/neonspark-tree-sitter-parallel-audit-plan.md
git commit -m "feat(audit): add container-aware tree-sitter classification"
```

### Task 8: Runtime 容器扩展开关

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/config/unity-config.ts`
- Modify: `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
- Modify: `gitnexus/test/unit/unity-runtime-binding-rules.test.ts`
- Modify: `docs/unity-runtime-process-source-of-truth.md`

**Step 1: Write failing tests first**
- case A: `enableContainerNodes=false` 时行为与当前一致。
- case B: `enableContainerNodes=true` 时 struct/interface 可命中 `method_triggers_method`。

**Step 2: Run tests to verify fail**
- Run: `cd gitnexus && npm test -- test/unit/unity-runtime-binding-rules.test.ts`
- Expected: FAIL（新增 case 未满足）。

**Step 3: Write minimal implementation**
- `UnityConfig` 增加 `enableContainerNodes` 默认 `false`。
- `applyUnityRuntimeBindingRules` 构建 `containerNodes`（受开关控制）。

**Step 4: Run tests to verify pass**
- Run: `cd gitnexus && npm test -- test/unit/unity-runtime-binding-rules.test.ts`
- Expected: PASS。

**Step 5: Commit**
```bash
git add gitnexus/src/core/config/unity-config.ts gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts gitnexus/test/unit/unity-runtime-binding-rules.test.ts docs/unity-runtime-process-source-of-truth.md
git commit -m "feat(unity-rules): gate class-like container matching via config"
```

### Task 9: CLI Skill 工作流同步

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/skills/gitnexus-cli.md`
- Modify: `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`
- Modify: `AGENTS.md`

**Step 1: Write doc assertions (failing check)**
- 增加脚本化检查：两个 skill 都必须包含 `--csharp-define-csproj` 说明、Unity 场景下 csproj 来源说明。

**Step 2: Run check to verify fail**
- Run: `rg -n "csharp-define-csproj|DefineConstants|Assembly-CSharp.csproj" gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md AGENTS.md`
- Expected: 缺失命中。

**Step 3: Write minimal doc updates**
- 更新 CLI skill 工作流：
  - Unity：优先传 `Assembly-CSharp.csproj`。
  - 非 Unity：在 skill 流程中指导定位最可能 csproj，再传 CLI 参数。

**Step 4: Run check to verify pass**
- Run: 同上 `rg` 命令。
- Expected: 三处文档均命中关键说明。

**Step 5: Commit**
```bash
git add gitnexus/skills/gitnexus-cli.md .agents/skills/gitnexus/gitnexus-cli/SKILL.md AGENTS.md
git commit -m "docs(skill): sync csharp define csproj workflow guidance"
```

### Task 10: 端到端验证与证据归档

**User Verification: required**

**Human Verification Checklist:**
- 使用 `--csharp-define-csproj` 运行一次 neonspark analyze（可缩小 scope）成功完成。
- analyze 输出包含 `csharpPreprocDiagnostics` 字段。
- 关键样本文件（如 `LocalPlayerInput.cs`）在新审计下 `root_has_error` 计数下降或保持可解释。
- `enableContainerNodes=false` 时 runtime 规则命中与基线一致。
- `enableContainerNodes=true` 时新增至少一个 struct/interface 可解释命中。

**Acceptance Criteria:**
- 每条 checklist 均有命令输出或报告文件证据。

**Failure Signals:**
- analyze 因 csproj 读取失败崩溃且无可读错误。
- 无 preproc 诊断字段。
- runtime 开关关闭出现命中回归。
- runtime 开关开启无新增命中且无诊断说明。

**User Decision Prompt:**
- `请仅回复“通过”或“不通过”：上述 5 条人工核验是否全部满足？`

**Files:**
- Create: `docs/reports/2026-04-06-csharp-preproc-runtime-container-remediation-verification.md`

**Step 1: Prepare verification commands**
- `cd gitnexus && npm test -- test/unit/csharp-define-profile.test.ts test/unit/csharp-preproc-normalizer.test.ts test/unit/parse-worker-csharp-preproc.test.ts test/unit/unity-runtime-binding-rules.test.ts`
- `gitnexus analyze /Volumes/Shuttle/projects/neonspark --scope-manifest /Volumes/Shuttle/projects/neonspark/.gitnexus/sync-manifest.txt --extensions .cs,.meta --csharp-define-csproj /Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`

**Step 2: Capture evidence**
- 记录命令输出、统计对比、关键样本文件结果。

**Step 3: Write verification report**
- 汇总 baseline vs remediation 的指标变化。

**Step 4: Final verification run**
- 再次运行核心单测与关键命令，确保可重复。

**Step 5: Commit**
```bash
git add docs/reports/2026-04-06-csharp-preproc-runtime-container-remediation-verification.md
git commit -m "docs(report): verification evidence for csharp preproc and runtime container remediation"
```

## Plan Audit Verdict

audit_scope: [docs/plans/2026-04-06-csharp-preproc-runtime-container-remediation-design.md, remediation report sections 2/3/4, unity runtime process source-of-truth section 2.1-2.2]
finding_summary: P0=0, P1=1, P2=2
critical_mismatches:
- none
major_risks:
- [P1] writing-plans 规范建议使用独立 reviewer subagent 做计划审计；当前会话未显式请求子代理审计，按会话策略采用主代理自审。status: accepted
anti_placeholder_checks:
- `--csharp-define-csproj` 空路径/无效路径必须报错且阻断 analyze：planned
- preproc 诊断字段必须有真实计数，不允许固定占位值：planned
authenticity_checks:
- worker 与串行 parse 都必须走同一 preproc profile，防止“只修一条链路”：planned
- runtime container 开关默认 false，关闭态行为与基线一致：planned
approval_decision: pass
