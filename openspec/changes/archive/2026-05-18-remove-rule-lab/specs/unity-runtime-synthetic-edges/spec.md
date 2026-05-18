# Specification Delta: unity-runtime-synthetic-edges

## Capability 对齐（已确认）

- Capability: `unity-runtime-synthetic-edges`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 已确认 5 个 capabilities 全部保留

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: applyUnityRuntimeBindingRules Function

**Reason**: 规则驱动的合成边注入被 Phase 5.6 的内置 lifecycle 自动检测 + graph-only runtime verification 取代。`applyUnityRuntimeBindingRules()` 在 `unity-runtime-binding-rules.ts` 中定义，仅被 pipeline.ts Phase 5.7 调用。

**Migration**: 函数所在文件 `unity-runtime-binding-rules.ts` 整体删除。

#### Scenario: pipeline does not call applyUnityRuntimeBindingRules
- **WHEN** `runPipelineFromRepo()` 执行
- **THEN** 不 import `applyUnityRuntimeBindingRules`
- **AND** 不调用该函数

### Requirement: asset_ref_loads_components Binding Kind

**Reason**: 资源引用链触发代码执行的规则驱动注入不再需要。该 binding kind 仅在 `applyUnityRuntimeBindingRules` 中处理。

**Migration**: 处理逻辑随 `unity-runtime-binding-rules.ts` 删除。

#### Scenario: No asset_ref_loads_components edges injected
- **WHEN** analyze 完成
- **THEN** knowledge graph 中不含 `reason` 为 `unity-rule-asset_ref_loads_components:*` 的 CALLS 边

### Requirement: method_triggers_field_load Binding Kind

**Reason**: 代码方法触发字段引用资源加载的规则驱动注入不再需要。

**Migration**: 处理逻辑随 `unity-runtime-binding-rules.ts` 删除。

#### Scenario: No method_triggers_field_load edges injected
- **WHEN** analyze 完成
- **THEN** knowledge graph 中不含 `reason` 为 `unity-rule-method_triggers_field_load:*` 的 CALLS 边

### Requirement: method_triggers_scene_load Binding Kind

**Reason**: 代码方法触发场景加载（通过场景文件名匹配 `.unity` File 节点并沿 prefab 链覆盖）的规则驱动注入不再需要。

**Migration**: 处理逻辑随 `unity-runtime-binding-rules.ts` 删除。

#### Scenario: No method_triggers_scene_load edges injected
- **WHEN** analyze 完成
- **THEN** knowledge graph 中不含 `reason` 为 `unity-rule-method_triggers_scene_load:*` 的 CALLS 边

### Requirement: method_triggers_method Binding Kind

**Reason**: 代码方法间触发的规则驱动注入不再需要。

**Migration**: 处理逻辑随 `unity-runtime-binding-rules.ts` 删除。

#### Scenario: No method_triggers_method edges injected
- **WHEN** analyze 完成
- **THEN** knowledge graph 中不含 `reason` 为 `unity-rule-method_triggers_method:*` 的 CALLS 边

### Requirement: UnityRuntimeBindingResult and UnityRuntimeBindingDiagnostics Types

**Reason**: 这些类型仅用于 `applyUnityRuntimeBindingRules` 的返回值，移除函数后无消费者。

**Migration**: `UnityRuntimeBindingResult` 和 `UnityRuntimeBindingDiagnostics` 接口随文件删除。

#### Scenario: No binding result types exported
- **WHEN** 其他模块编译
- **THEN** 不引用 `UnityRuntimeBindingResult` 或 `UnityRuntimeBindingDiagnostics`

## MODIFIED Requirements

### Requirement: Unity Synthetic Edge Injection

The system SHALL inject Unity synthetic CALLS edges only through Phase 5.6 (`applyUnityLifecycleSyntheticCalls`), which handles built-in lifecycle callbacks (OnEnable/Awake/Start/Update etc.). Rule-driven binding injection is no longer performed.

#### Scenario: Unity lifecycle synthetic calls still work
- **WHEN** analyze 在 Unity 项目（含 `Assets/*.cs` 文件）上执行
- **THEN** Phase 5.6 自动检测 Unity 项目并注入 lifecycle 合成 CALLS 边
- **AND** `unityLifecycleSyntheticResult.hostCount` 反映检测到的 MonoBehaviour 宿主数量
