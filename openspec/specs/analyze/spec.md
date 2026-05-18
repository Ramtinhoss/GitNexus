# Specification Delta: analyze

## Capability 对齐（已确认）

- Capability: `analyze`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 已确认 5 个 capabilities 全部保留

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: Phase 5.7 Rule-Driven Binding Injection

**Reason**: Unity lifecycle 自动检测（Phase 5.6）+ graph-only runtime verification 已覆盖原有规则驱动场景。Phase 5.7 在每次 analyze 结束时输出警告信息，即使无任何规则配置也产生噪音。

**Migration**: 无需迁移。Phase 5.5（资源绑定解析）和 Phase 5.6（内置 lifecycle 合成 CALLS）不受影响。

#### Scenario: Analyze runs without rule binding phase
- **WHEN** `gitnexus analyze` 执行
- **THEN** Pipeline 跳过 Phase 5.7，直接从 Phase 5.6 进入 Phase 6（processes）
- **AND** 不再输出 `Unity Rule Binding Diagnostics` 行到 stdout

### Requirement: loadAnalyzeRules Function

**Reason**: `loadAnalyzeRules()` 仅被 pipeline.ts Phase 5.7 调用，移除调用方后函数无消费者。

**Migration**: 函数从 `runtime-claim-rule-registry.ts` 中移除。

#### Scenario: runtime-claim-rule-registry does not export loadAnalyzeRules
- **WHEN** 其他模块 import `runtime-claim-rule-registry.ts`
- **THEN** `loadAnalyzeRules` 不可用

### Requirement: UnityRuntimeBindingResult Type

**Reason**: `UnityRuntimeBindingResult` 类型仅在 Phase 5.7 的 binding 结果中使用，移除 Phase 5.7 后无消费者。

**Migration**: 类型从 `types/pipeline.ts` 的 `PipelineResult` 和 `PipelineRuntimeSummary` 接口中移除。

#### Scenario: PipelineResult does not include unityRuleBindingResult
- **WHEN** analyze 完成后返回 `PipelineResult`
- **THEN** 返回对象中不含 `unityRuleBindingResult` 字段

## MODIFIED Requirements

### Requirement: Pipeline Execution Order

The system SHALL execute analyze phases in the following order, without Phase 5.7:

```
Phase 1-4:   Scan → Structure → Parse → MRO
Phase 5:     Communities
Phase 5.5:   processUnityResources (UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF 边)
Phase 5.6:   applyUnityLifecycleSyntheticCalls (通用 lifecycle 合成 CALLS)
Phase 6:     processProcesses (沿所有 CALLS 边追踪，生成 Process)
```

#### Scenario: Analyze pipeline skips Phase 5.7
- **WHEN** `runPipelineFromRepo()` 在 `skipGraphPhases=false` 时执行
- **THEN** Phase 5.6 之后直接进入 Phase 6
- **AND** `unityRuleBindingResult` 变量不再声明或赋值

### Requirement: Analyze CLI Output

The system SHALL print analyze summary without rule binding diagnostics.

#### Scenario: Analyze completes without rule binding output
- **WHEN** `gitnexus analyze` 完成
- **THEN** stdout 不包含 `Unity Rule Binding Diagnostics:` 行
- **AND** 不调用 `formatUnityRuleBindingSummary()`
