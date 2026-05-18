# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认所有 5 个 capability specs 已产出且一致性良好
  - `specs/analyze/spec.md` — Phase 5.7 移除，Pipeline 顺序更新
  - `specs/mcp-tools/spec.md` — 5 个 MCP 工具移除，retrieval hint 移除
  - `specs/cli-commands/spec.md` — rule-lab 子命令组移除
  - `specs/unity-runtime-synthetic-edges/spec.md` — 4 种 binding kind 移除
  - `specs/compiled-bundles/spec.md` — compiled-bundles 全链路移除，types 移除
- [x] 1.2 确认所有外部依赖无阻塞（无外部 API 调用方）

## 2. 核心实现任务

### 组 A — 删除独立模块（无代码依赖）

- [x] 2.1 删除 `src/rule-lab/` 整个目录（含 types.ts, compiled-bundles.ts, analyze.ts, discover.ts, curate.ts, promote.ts, compile.ts, regress.ts, review-pack.ts, curation-input-builder.ts, paths.ts, schema/*.json, __fixtures__/*.json）
- [x] 2.2 删除 `src/core/ingestion/unity-runtime-binding-rules.ts`
  - **Spec**: `specs/unity-runtime-synthetic-edges/spec.md` — 所有 4 种 binding kind REMOVED
  - **验证**: 文件不存在，TypeScript 编译通过
- [x] 2.3 删除 `src/cli/rule-lab.ts`
  - **Spec**: `specs/cli-commands/spec.md` — rule-lab CLI source file REMOVED
  - **验证**: 文件不存在，编译通过
- [x] 2.4 删除 `gitnexus/skills/gitnexus-unity-rule-gen.md`（skill 源文件）
- [x] 2.5 删除 `gitnexus/skills/_shared/unity-rule-authoring-contract.md`（shared contract）
- [x] 2.6 删除文档：`docs/gap-lab-rule-lab-architecture.md`、`docs/unity-runtime-process-rule-lab-agent-context.md`、`docs/unity-runtime-process-rule-driven-implementation.md`
- [x] 2.7 删除 benchmark：`src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts`、`phase5-rule-lab-acceptance-runner.test.ts`
- [x] 2.8 删除所有 rule-lab 相关测试文件：
  - `src/cli/rule-lab.test.ts`
  - `src/rule-lab/analyze.test.ts`、`paths.test.ts`、`curate.test.ts`、`promote.test.ts`、`regress.test.ts`、`review-pack.test.ts`、`discover.test.ts`
  - `test/unit/rule-lab-m1.test.ts`、`test/unit/rule-lab-bindings.test.ts`、`test/unit/rule-lab-tools.test.ts`
  - `test/unit/unity-runtime-binding-rules.test.ts`
  - `test/integration/rule-lab-contracts.test.ts`、`test/integration/no-gap-lab-surface.test.ts`、`test/integration/unity-rule-authoring-skill-contracts.test.ts`
  - `test/unit/rule-dsl-schema.test.ts`
- [x] 2.9 删除安装残留：
  - `.agents/skills/gitnexus/gitnexus-unity-rule-gen/`
  - `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/`
  - `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
  - `.claude/skills/gitnexus-rule-lab`（悬空 symlink）
  - `.claude/skills/gitnexus-unity-e2e-verify`（symlink）
- [x] 2.10 删除 test fixture：
  - `test/fixtures/mini-repo/.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
  - `test/fixtures/mini-repo/.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`

### 组 B — Pipeline 核心

- [x] 2.11 修改 `src/core/ingestion/pipeline.ts`
  - 移除 `applyUnityRuntimeBindingRules` import（L16）
  - 移除 `loadAnalyzeRules` import（L20）
  - 移除 `unityRuleBindingResult` 变量声明（L430）
  - 移除 Phase 5.7 try/catch 块（L525-560）
  - 移除 return 对象中的 `unityRuleBindingResult` 字段（L663）
  - **Spec**: `specs/analyze/spec.md` — Phase 5.7 REMOVED, Pipeline 顺序 MODIFIED
  - **验证**: `npm run build` 成功，pipeline.ts 无 `ruleBinding` 引用
- [x] 2.12 修改 `src/types/pipeline.ts`
  - 移除 `UnityRuntimeBindingResult` import（L5）
  - 移除 `PipelineResult.unityRuleBindingResult` 字段（L49）
  - 移除 `PipelineRuntimeSummary.unityRuleBindingResult` 字段（L59）
  - **Spec**: `specs/analyze/spec.md` — UnityRuntimeBindingResult type REMOVED
  - **验证**: 编译通过，类型检查无 `unityRuleBindingResult` 引用

### 组 C — CLI 输出

- [x] 2.13 修改 `src/cli/analyze-summary.ts`
  - 移除 `UnityRuntimeBindingResult` import（L2）
  - 移除 `formatUnityRuleBindingSummary` 函数（L59-87）
  - **Spec**: `specs/analyze/spec.md` — Analyze CLI output MODIFIED
  - **验证**: 编译通过，导出中无 `formatUnityRuleBindingSummary`
- [x] 2.14 修改 `src/cli/analyze.ts`
  - 移除 `formatUnityRuleBindingSummary` import（L27）
  - 移除 `formatUnityRuleBindingSummary(...)` 调用块（L511-514）
  - **验证**: 编译通过，analyze 输出无 `Unity Rule Binding Diagnostics`
- [x] 2.15 修改 `src/cli/analyze-runtime-summary.ts`
  - 移除 `unityRuleBindingResult: input.unityRuleBindingResult` 字段（L9）
  - **验证**: 编译通过
- [x] 2.16 修改 `src/cli/analyze-summary.test.ts`
  - 移除 `formatUnityRuleBindingSummary` import（L6）
  - 移除 2 个相关 test case（L43-99）
  - **验证**: `npx vitest run src/cli/analyze-summary.test.ts` 通过
- [x] 2.17 修改 `src/cli/analyze-runtime-summary.test.ts`
  - 移除 `unityRuleBindingResult` 字段（L11）和断言（L26）
  - **验证**: 测试通过

### 组 D — CLI 入口 + AI Context

- [x] 2.18 修改 `src/cli/index.ts`
  - 移除 `attachRuleLabCommands` import（L9）
  - 移除 `attachRuleLabCommands(...)` 调用（L73-74）
  - **Spec**: `specs/cli-commands/spec.md` — CLI MODIFIED
  - **验证**: `gitnexus --help` 输出不含 `rule-lab`
- [x] 2.19 修改 `src/cli/ai-context.ts`
  - 移除 skill 表中的 `gitnexus-unity-rule-gen` 行（L82）
  - 移除 `installSkills()` 中的 `gitnexus-unity-rule-gen` 条目
  - 移除 `verification_rules`/`trigger_tokens` 引用（L70）
  - **验证**: 编译通过，生成 AGENTS.md 不含 unity-rule-gen

### 组 E — MCP 层

- [x] 2.20 修改 `src/mcp/tools.ts`
  - 移除 5 个 `rule_lab_*` 工具定义（L404-470）
  - **Spec**: `specs/mcp-tools/spec.md` — 5 个 MCP 工具 REMOVED
  - **验证**: `GITNEXUS_TOOLS` 不含 `rule_lab_` 开头的工具名
- [x] 2.21 修改 `src/mcp/local/local-backend.ts`
  - 移除 rule-lab imports（L43-48 中的 `analyzeRuleLabSlice` 等 5 个 + `loadCompiledRuleBundle`）
  - 移除 5 个 dispatch case（L1282-1291）
  - 移除 5 个 handler 方法（L1334-1495）
  - 移除 `resolveRetrievalRuleHint` 函数（L697-711）
  - 移除 `pickRetrievalRuleHintFromBundle` 函数（L713-790 区域）
  - 移除 `RetrievalRuleHint` interface（L264-272）
  - 移除两处 `resolveRetrievalRuleHint()` 调用（L1994, L2834）及相关赋值
  - **Spec**: `specs/mcp-tools/spec.md` — retrieval hint REMOVED, dispatch MODIFIED
  - **验证**: 编译通过，`callTool` 对 `rule_lab_*` 返回 "Unknown tool"

### 组 F — Runtime Claim Rule Registry

- [x] 2.22 修改 `src/mcp/local/runtime-claim-rule-registry.ts`
  - 移除 `loadCompiledRuleBundle` import（L3）
  - 移除 `UnityResourceBinding`/`LifecycleOverrides` import（L4）
  - 移除 `loadAnalyzeRules` 函数（L380-395）
  - 移除 `loadRuleRegistry` 函数（L287-400 区域）
  - 从 `parseRuleYaml` 中移除 resource_bindings 和 lifecycle_overrides 解析逻辑
  - 从 `RuntimeClaimRule` 接口中移除 `resource_bindings`、`lifecycle_overrides`、`family` 字段
  - **Spec**: `specs/compiled-bundles/spec.md` — parseRuleYaml binding REMOVED
  - **验证**: 编译通过，`RuntimeClaimRule` 类型简化
- [x] 2.23 修改 `test/unit/runtime-claim-rule-registry.test.ts`
  - 移除 `loadRuleRegistry` 相关测试
  - 移除 resource_bindings/lifecycle_overrides 解析测试
  - **验证**: 测试通过
- [x] 2.24 修改 `test/unit/local-backend-runtime-claim-evidence-gate.test.ts`
  - 移除 `writeCompiledRuleBundle` import 和使用
  - **验证**: 测试通过
- [x] 2.25 修改 `test/unit/runtime-chain-verify-graph-only-input.test.ts`
  - 移除 `writeCompiledRuleBundle` import 和使用
  - **验证**: 测试通过
- [x] 2.26 修改 `test/integration/local-backend-calltool.test.ts`
  - 移除 `promoteCuratedRules` import（L15）
  - 移除 `phase5 rule-lab promoted rule is loadable` test case（L452-510）
  - **验证**: 测试通过
- [x] 2.27 修改 `test/integration/reload-v1-current-source-regression.test.ts`
  - 移除 `promoteCuratedRules` import（L6）及相关调用（L88, L96, L161, L199）
  - **验证**: 测试通过
- [x] 2.28 修改 `test/unit/tools.test.ts`
  - 移除 `rule_lab_*` 工具名验证逻辑
  - **验证**: 测试通过

### 组 G — 配置与文档

- [x] 2.29 修改 `gitnexus/vitest.config.ts`
  - 从 `include` 中移除 `src/cli/rule-lab.test.ts`（L8）和 `src/rule-lab/**/*.test.ts`（L9）
  - 确认 `coverage.thresholds.autoUpdate` 为 `true`
  - **验证**: `npx vitest run` 不报缺失文件错误
- [x] 2.30 修改 `gitnexus/AGENTS.md`
  - 移除「新增 binding kind 或 resource_bindings 字段时的强制要求」整节（含类型定义/解析器/单元测试三件事要求）
  - **验证**: 编译通过
- [x] 2.31 修改 `docs/unity-runtime-process-source-of-truth.md`
  - 更新 Pipeline 执行顺序表（移除 Phase 5.7 行）
  - 移除 Phase 5 Offline Rule Lab 概述节
  - 移除 Rule Lab 生命周期节
  - 新增「附录 C：已退役 — Rule Lab 离线规则创作系统（v1.5.0 移除）」
  - **验证**: 文档结构完整，退役附录含退役日期/原因/退役模块表/保留能力清单
- [x] 2.32 修改 `UNITY_RUNTIME_PROCESS.md`
  - 更新第八节 Pipeline 执行顺序表（移除 Phase 5.7）
  - 更新第九节配置方式表（移除「规则驱动边注入」行）
  - 移除规则类型系统已实现/规则族区分已实现行（L415-416）
  - **验证**: 文档中无 rule-lab 相关引用
- [x] 2.33 修改 `docs/event-delegate-gap-analysis.md`
  - 移除 reduced rule-lab 职责边界引用（L13, L45）
  - **验证**: 文档中无 `rule-lab` 引用

## 3. 收敛与验证准备

- [x] 3.1 运行完整测试套件确认所有非 rule-lab 测试通过
  - `npx vitest run` — 全部 pass，无 rule-lab 相关错误
- [x] 3.2 运行 TypeScript 编译确认无类型错误
  - `npm run build` — 成功，无 `rule-lab`/`ruleBinding`/`compiledBundle` 相关编译错误
- [x] 3.3 运行 `gitnexus analyze` 在测试 repo 上确认：
  - 输出不含 `Unity Rule Binding Diagnostics` 行
  - 输出不含 `[UnityRuleBinding]` 前缀的日志
  - Pipeline 直接从 Phase 5.6 进入 Phase 6
- [x] 3.4 运行 `gitnexus --help` 确认 `rule-lab` 不在子命令列表中
- [x] 3.5 确认 MCP 工具列表中无 `rule_lab_*` 工具

## 4. 验证与回写收敛

- [x] 4.1 基于验证结果生成或更新 `verification.md`
- [x] 4.2 基于 verification 结论生成或更新 `writeback.md`
- [x] 4.3 执行回写目标并记录审计证据
