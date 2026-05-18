# Specification Delta: compiled-bundles

## Capability 对齐（已确认）

- Capability: `compiled-bundles`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 已确认 5 个 capabilities 全部保留

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: compiled-bundles.ts Module

**Reason**: `compiled-bundles.ts` 提供 `loadCompiledRuleBundle`、`writeCompiledRuleBundle`、`compiledBundlePath` 及 `CompiledRuleBundle`、`StageAwareCompiledRule` 类型。所有消费方随 rule-lab 移除而消失：`loadAnalyzeRules`（analyze pipeline）、`loadRuleRegistry`（discover/analyze pipeline）、`resolveRetrievalRuleHint`（query-time hint）、promote（rule-lab CLI/MCP）。模块无剩余消费者。

**Migration**: 文件整体删除。

#### Scenario: compiled-bundles.ts does not exist
- **WHEN** TypeScript 编译
- **THEN** 不包含 `src/rule-lab/compiled-bundles.js` 编译产物

### Requirement: CompiledRuleBundle Type and Interface

**Reason**: `CompiledRuleBundle`、`StageAwareCompiledRule`、`RuleBundleFamily` 类型仅被 removed code 使用。

**Migration**: 随 `compiled-bundles.ts` 删除。

#### Scenario: No compiled bundle types in codebase
- **WHEN** 搜索 `CompiledRuleBundle` 类型
- **THEN** 代码库中无定义或引用

### Requirement: loadCompiledRuleBundle for analyze_rules

**Reason**: `loadAnalyzeRules()` 调用 `loadCompiledRuleBundle(repoPath, 'analyze_rules')` 加载 analyze 编译产物。该函数随 Phase 5.7 移除。

**Migration**: `loadAnalyzeRules` 函数从 `runtime-claim-rule-registry.ts` 中移除。

#### Scenario: runtime-claim-rule-registry does not import compiled-bundles
- **WHEN** `runtime-claim-rule-registry.ts` 被 import
- **THEN** 不 import `../../rule-lab/compiled-bundles.js`

### Requirement: loadCompiledRuleBundle for verification_rules

**Reason**: `loadRuleRegistry()` 调用 `loadCompiledRuleBundle(repoPath, 'verification_rules')` 加载验证编译产物。该函数仅被 discover.ts 和 loadAnalyzeRules 调用，两者均移除。

**Migration**: `loadRuleRegistry()` 函数从 `runtime-claim-rule-registry.ts` 中移除。

#### Scenario: loadRuleRegistry function removed
- **WHEN** 搜索 `loadRuleRegistry` 导出
- **THEN** 代码库中无定义（测试中引用同步移除）

### Requirement: loadCompiledRuleBundle for retrieval_rules

**Reason**: `resolveRetrievalRuleHint()` 调用 `loadCompiledRuleBundle(repoPath, 'retrieval_rules')` 加载检索提示编译产物。该函数随 rule-lab 移除。

**Migration**: `resolveRetrievalRuleHint()` 和 `pickRetrievalRuleHintFromBundle()` 从 `local-backend.ts` 中移除。

#### Scenario: local-backend.ts does not import compiled-bundles
- **WHEN** `local-backend.ts` 被 import
- **THEN** 不 import `../../rule-lab/compiled-bundles.js`

### Requirement: parseRuleYaml Resource Binding Parsing

**Reason**: `parseRuleYaml()` 中的 `resource_bindings` 和 `lifecycle_overrides` 解析逻辑仅服务于 rule-lab YAML 规则文件中的 binding 字段。移除 rule-lab 后无 YAML 规则文件需要解析这些字段。

**Migration**: 从 `parseRuleYaml()` 中移除 binding 解析代码块，从 `RuntimeClaimRule` 类型中移除 `resource_bindings`、`lifecycle_overrides`、`family` 字段。

#### Scenario: RuntimeClaimRule type simplified
- **WHEN** `RuntimeClaimRule` 类型被使用
- **THEN** 不含 `resource_bindings?: UnityResourceBinding[]` 字段
- **AND** 不含 `lifecycle_overrides?: LifecycleOverrides` 字段

### Requirement: rule-lab/types.ts Module

**Reason**: `types.ts` 定义了 `UnityResourceBinding`、`LifecycleOverrides`、`RuleLabSlice`、`RuleLabCandidate`、`RuleDslDraft` 等全部 rule-lab 类型。移除所有消费方后无引用。

**Migration**: 文件随 `src/rule-lab/` 目录整体删除。

#### Scenario: rule-lab/types.ts does not exist
- **WHEN** TypeScript 编译
- **THEN** 不包含 `src/rule-lab/types.js` 编译产物

### Requirement: Existing Compiled Bundle Files on Disk

**Reason**: 已有 repo 中 `.gitnexus/rules/compiled/*.v2.json` 文件不再被任何代码消费。

**Migration**: 无需主动清理。analyze 不再尝试加载这些文件，已存在的文件静默忽略。用户可手动删除 `.gitnexus/rules/lab/` 和 `.gitnexus/rules/compiled/` 目录。

#### Scenario: Analyze ignores compiled bundle files
- **WHEN** `gitnexus analyze` 在已有 `.gitnexus/rules/compiled/` 的 repo 上执行
- **THEN** analyze 不尝试读取 compiled 目录中的任何文件
- **AND** 不输出任何与 compiled bundle 相关的警告或错误
