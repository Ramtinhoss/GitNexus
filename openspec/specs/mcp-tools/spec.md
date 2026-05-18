# Specification Delta: mcp-tools

## Capability 对齐（已确认）

- Capability: `mcp-tools`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 已确认 5 个 capabilities 全部保留

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: rule_lab_analyze MCP Tool

**Reason**: Offline rule-lab analyze 工作流不再维护，对应的 MCP 工具移除。

**Migration**: 调用方应移除对 `rule_lab_analyze` 的引用。

#### Scenario: MCP tool list excludes rule_lab_analyze
- **WHEN** MCP client 请求工具列表
- **THEN** 返回列表中不含 `rule_lab_analyze`

### Requirement: rule_lab_review_pack MCP Tool

**Reason**: rule-lab review-pack 工作流不再维护。

**Migration**: 调用方应移除对 `rule_lab_review_pack` 的引用。

#### Scenario: MCP tool list excludes rule_lab_review_pack
- **WHEN** MCP client 请求工具列表
- **THEN** 返回列表中不含 `rule_lab_review_pack`

### Requirement: rule_lab_curate MCP Tool

**Reason**: rule-lab curate 工作流不再维护。

**Migration**: 调用方应移除对 `rule_lab_curate` 的引用。

#### Scenario: MCP tool list excludes rule_lab_curate
- **WHEN** MCP client 请求工具列表
- **THEN** 返回列表中不含 `rule_lab_curate`

### Requirement: rule_lab_promote MCP Tool

**Reason**: rule-lab promote 工作流不再维护。

**Migration**: 调用方应移除对 `rule_lab_promote` 的引用。

#### Scenario: MCP tool list excludes rule_lab_promote
- **WHEN** MCP client 请求工具列表
- **THEN** 返回列表中不含 `rule_lab_promote`

### Requirement: rule_lab_regress MCP Tool

**Reason**: rule-lab regress 工作流不再维护。

**Migration**: 调用方应移除对 `rule_lab_regress` 的引用。

#### Scenario: MCP tool list excludes rule_lab_regress
- **WHEN** MCP client 请求工具列表
- **THEN** 返回列表中不含 `rule_lab_regress`

### Requirement: resolveRetrievalRuleHint Query-Time Hint

**Reason**: `resolveRetrievalRuleHint()` 依赖 `retrieval_rules` compiled bundle，该编译产物随 rule-lab 移除而不再生成。query/context 主检索能力不受影响。

**Migration**: query/context 工具不再调用 `resolveRetrievalRuleHint()`，移除 `RetrievalRuleHint` 接口和相关代码。

#### Scenario: query tool does not load retrieval_rules bundle
- **WHEN** `query` MCP 工具执行
- **THEN** 不调用 `resolveRetrievalRuleHint()`
- **AND** 不加载 `.gitnexus/rules/compiled/retrieval_rules.v2.json`

#### Scenario: context tool does not load retrieval_rules bundle
- **WHEN** `context` MCP 工具执行
- **THEN** 不调用 `resolveRetrievalRuleHint()`

## MODIFIED Requirements

### Requirement: MCP Tool Registry

The system SHALL expose only non-rule-lab MCP tools. The tool registry in `tools.ts` SHALL NOT include `rule_lab_analyze`, `rule_lab_review_pack`, `rule_lab_curate`, `rule_lab_promote`, or `rule_lab_regress`.

#### Scenario: GITNEXUS_TOOLS array excludes rule_lab tools
- **WHEN** `GITNEXUS_TOOLS` 常量被导出
- **THEN** array 中不含任何 `name` 以 `rule_lab_` 开头的工具定义
- **AND** 不含 `RetrievalRuleHint` 相关 interface 导出

### Requirement: Local Backend Dispatch

The system SHALL NOT include dispatch cases for rule-lab tool names. The `callTool` switch statement in `local-backend.ts` SHALL omit `rule_lab_analyze`, `rule_lab_review_pack`, `rule_lab_curate`, `rule_lab_promote`, and `rule_lab_regress`.

#### Scenario: callTool rejects unknown rule_lab tool
- **WHEN** `callTool` 被调用且 tool name 为 `rule_lab_analyze`
- **THEN** 返回错误 "Unknown tool: rule_lab_analyze"
