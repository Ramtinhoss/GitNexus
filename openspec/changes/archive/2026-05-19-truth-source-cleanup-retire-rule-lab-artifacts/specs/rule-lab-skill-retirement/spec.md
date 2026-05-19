# Specification Delta

## Capability 对齐（已确认）

- Capability: `rule-lab-skill-retirement`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: removed
- 用户确认摘要: 完全删除 rule-lab 相关 skill 和 contract 文件

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: unity-rule-gen-skill
**Reason**: `gitnexus-unity-rule-gen` skill 的核心流程（Phase B/C/D）完全依赖已移除的 `gitnexus rule-lab analyze/review-pack/curate/promote/compile` CLI 命令。Rule Lab 系统已于 v1.5.0 移除，该 skill 不可用。
**Migration**: 删除 `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`。

#### Scenario: rule-gen-skill-deleted
- **WHEN** 检查 `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- **THEN** 文件 SHALL NOT exist

### Requirement: unity-e2e-verify-skill
**Reason**: `gitnexus-unity-e2e-verify` skill 的 Phase 1 规则创建依赖 `analyze_rules` + `rule-lab compile`，引用的 `gitnexus/src/rule-lab/types.ts` 已不存在。Rule Lab 系统已移除，该 skill 不可用。
**Migration**: 删除 `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md`。

#### Scenario: e2e-verify-skill-deleted
- **WHEN** 检查 `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md`
- **THEN** 文件 SHALL NOT exist

### Requirement: unity-rule-authoring-contract
**Reason**: `_shared/unity-rule-authoring-contract.md` 核心流程 `approved/*.yaml -> rule-lab compile -> analyze` 已不可用。Rule Lab 系统已移除。
**Migration**: 删除 `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`。

#### Scenario: authoring-contract-deleted
- **WHEN** 检查 `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
- **THEN** 文件 SHALL NOT exist

### Requirement: guide-skill-rule-gen-reference
**Reason**: `gitnexus-guide/SKILL.md` 的 skill 表格中引用了已删除的 `gitnexus-unity-rule-gen` skill。
**Migration**: 从 skill 表格中移除对应行。

#### Scenario: guide-reference-removed
- **WHEN** 阅读 `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`
- **THEN** 文档中 SHALL NOT 出现 `gitnexus-unity-rule-gen` 或 `analyze_rules` 相关引用

### Requirement: agents-md-skill-references
**Reason**: `AGENTS.md` 的 skill 安装表和可用 skill 列表中引用了已删除的 `gitnexus-unity-rule-gen` 和 `gitnexus-unity-e2e-verify` skill，以及已移除的 MCP `rule_lab_*` 工具。
**Migration**: 移除相关条目。

#### Scenario: agents-md-cleaned
- **WHEN** 阅读 `AGENTS.md`
- **THEN** 文档中 SHALL NOT 出现 `gitnexus-unity-rule-gen`、`gitnexus-unity-e2e-verify`、`rule_lab_analyze`、`rule_lab_review_pack`、`rule_lab_curate`、`rule_lab_promote`、`rule_lab_regress` 的引用
