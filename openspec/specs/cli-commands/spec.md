# Specification Delta: cli-commands

## Capability 对齐（已确认）

- Capability: `cli-commands`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 已确认 5 个 capabilities 全部保留

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: rule-lab CLI Subcommand Group

**Reason**: Rule lab 离线规则创作工作流不再维护。`gitnexus rule-lab analyze|review-pack|curate|promote|regress|compile` 全部移除。

**Migration**: 用户应使用 Phase 5.5 + Phase 5.6 的自动分析能力替代 rule-lab 的规则创作。

#### Scenario: rule-lab command not registered
- **WHEN** `gitnexus --help` 执行
- **THEN** 帮助输出中不含 `rule-lab` 子命令

#### Scenario: rule-lab command returns error
- **WHEN** `gitnexus rule-lab analyze` 执行
- **THEN** Commander 返回 "unknown command" 错误

### Requirement: attachRuleLabCommands Function

**Reason**: `attachRuleLabCommands()` 在 `src/cli/rule-lab.ts` 中定义，整个文件随 rule-lab 移除而删除。

**Migration**: `src/cli/index.ts` 中移除 import 和调用。

#### Scenario: cli/index.ts does not import rule-lab
- **WHEN** CLI 入口模块加载
- **THEN** 不 import `src/cli/rule-lab.js`
- **AND** 不调用 `attachRuleLabCommands()`

### Requirement: rule-lab CLI Source File

**Reason**: `src/cli/rule-lab.ts` 包含所有 rule-lab 子命令的 Commander 注册和 handler 实现，全部移除。

**Migration**: 文件直接删除。

#### Scenario: src/cli/rule-lab.ts does not exist
- **WHEN** TypeScript 编译
- **THEN** 不包含 `src/cli/rule-lab.ts` 编译产物

## MODIFIED Requirements

### Requirement: CLI Command Registry

The `src/cli/index.ts` entry point SHALL register only non-rule-lab commands. The program SHALL NOT include `rule-lab` as a subcommand.

#### Scenario: CLI help lists available commands
- **WHEN** `gitnexus --help` 执行
- **THEN** 列出的命令包含 `analyze`, `status`, `mcp` 等
- **AND** 不包含 `rule-lab`
