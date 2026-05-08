# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-rebuild-recovery-guidance`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认 neonspark 现场故障中 analyze 崩溃后无恢复指导，要求 SKILL.md 增加明确的损坏特征识别和 clean→rebuild 恢复流程

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: rebuild-recovery-section
The gitnexus-cli SKILL.md SHALL contain a dedicated "Rebuild recovery" subsection under the analyze command documentation that describes what to do when `analyze --force` hangs or crashes.

#### Scenario: identify-corruption
- **GIVEN** an agent encounters an analyze hang or crash
- **WHEN** the agent reads the SKILL.md
- **THEN** the agent SHALL find a list of concrete corruption signatures:
  - `.gitnexus/csv/` exists but `relations.csv` is missing (crash mid-streaming)
  - `.gitnexus/lbug.wal` exists while `.gitnexus/lbug` is only a few KB (LadybugDB unrecovered state)
  - `analyze` hangs indefinitely at the "Loading into LadybugDB..." phase

#### Scenario: recovery-commands
- **GIVEN** the agent has identified a corrupted index
- **WHEN** the agent reads the recovery section
- **THEN** the agent SHALL see the exact two-step recovery command sequence:
  1. `gitnexus clean --force` (removes corrupted index, preserves sync-manifest)
  2. `gitnexus analyze --force` (rebuilds the index)

### Requirement: troubleshooting-analyze-hang
The gitnexus-cli SKILL.md Troubleshooting section SHALL include an entry for `analyze --force` hangs or crashes that references the recovery section.

#### Scenario: quick-troubleshooting-lookup
- **GIVEN** an agent scanning the Troubleshooting section for analyze issues
- **WHEN** the agent reads the bullet list
- **THEN** there SHALL be an entry: "`analyze --force` hangs or crashes: Run `gitnexus clean --force` to remove the corrupted index (sync-manifest is preserved), then `gitnexus analyze --force` to rebuild."
- **AND** the entry SHALL reference the common corruption signatures

### Requirement: clean-post-analyze-mandatory
The SKILL.md SHALL state that after any `gitnexus clean`, the user MUST run `gitnexus analyze --force` to rebuild the index, since clean removes all index data.

#### Scenario: clean-then-rebuild
- **GIVEN** the agent has just run `gitnexus clean --force`
- **WHEN** the agent checks the clean command documentation
- **THEN** the documentation SHALL remind the agent that the index is now empty and `gitnexus analyze --force` is required to restore it
