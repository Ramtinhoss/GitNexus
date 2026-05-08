# Specification Delta

## Capability 对齐（已确认）

- Capability: `<capability-id>`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `<new|modified|removed|renamed>`
- 用户确认摘要: <粘贴或概述确认结论>

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: <requirement-name>
The system SHALL <describe the new behavior>.

#### Scenario: <scenario-name>
- **WHEN** <trigger or condition>
- **THEN** <expected outcome>

## MODIFIED Requirements

### Requirement: <existing-requirement-name>
The system SHALL <describe the full updated behavior>.

#### Scenario: <scenario-name>
- **WHEN** <trigger or condition>
- **THEN** <expected outcome>

## REMOVED Requirements

### Requirement: <deprecated-requirement-name>
**Reason**: <why this behavior is removed>
**Migration**: <how callers or operators should adapt>

## RENAMED Requirements

- FROM: `### Requirement: <old-name>`
- TO: `### Requirement: <new-name>`
