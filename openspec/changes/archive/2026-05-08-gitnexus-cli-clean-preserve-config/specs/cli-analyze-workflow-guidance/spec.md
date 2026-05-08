# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-analyze-workflow-guidance`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认 SKILL.md 中 sync-manifest 路径与手动 CLI flag 路径混排导致 agent 频繁触发 drift guard，要求明确拆分为互斥路径

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: analyze-mutually-exclusive-paths
The gitnexus-cli SKILL.md SHALL present `gitnexus analyze` usage as two mutually exclusive paths, not as a flat flag table with optional notes.

#### Scenario: path-a-sync-manifest
- **GIVEN** a repository with an existing `.gitnexus/sync-manifest.txt`
- **WHEN** an agent reads the SKILL.md analyze section
- **THEN** the agent SHALL see a "Path A: sync-manifest managed" section as the primary recommended path
- **AND** the example command SHALL be `gitnexus analyze --force`
- **AND** the agent SHALL understand that `--scope-prefix`, `--scope-manifest`, `--extensions`, and `--repo-alias` MUST NOT be passed when using Path A

#### Scenario: path-b-manual-cli
- **GIVEN** a repository without a sync-manifest or a first-time indexing scenario
- **WHEN** an agent reads the SKILL.md analyze section
- **THEN** the agent SHALL see a "Path B: manual CLI flags" section
- **AND** the agent SHALL understand that Path B is used ONLY when no sync-manifest exists
- **AND** the example command SHALL include explicit `--extensions`, `--scope-prefix`, and `--repo-alias` flags

#### Scenario: no-mixing
- **GIVEN** the SKILL.md presents both Path A and Path B
- **THEN** there SHALL be an explicit warning that the two paths MUST NOT be mixed
- **AND** the warning SHALL explain that mixing triggers the drift guard and may fail in non-TTY environments

### Requirement: simplified-flag-table
The SKILL.md analyze flag table SHALL be reduced to only the flags that are relevant across both paths, with path-specific flags moved into their respective sections.

#### Scenario: common-flags
- **GIVEN** the analyze section of SKILL.md
- **THEN** the top-level flag table SHALL contain only: `--force`, `--embeddings`, `--skills`
- **AND** path-specific flags (`--extensions`, `--scope-prefix`, `--scope-manifest`, `--repo-alias`, `--csharp-define-csproj`) SHALL appear ONLY within their respective path sections or a dedicated manual-flags table

### Requirement: csharp-preproc-as-supplement
The `--csharp-define-csproj` flag SHALL be documented as a supplementary optimization, not as a primary required flag in the main analyze workflow.

#### Scenario: unity-project-guidance
- **GIVEN** a Unity project using Path A (sync-manifest)
- **WHEN** the agent reads the analyze guidance
- **THEN** `--csharp-define-csproj` SHALL appear in a "C# preprocessing" subsection rather than the main flag table
- **AND** the guidance SHALL explain that the flag is optional but recommended for projects with heavy `#if` conditional compilation

## REMOVED Requirements

### Requirement: unified-flat-flag-table
**Reason**: The original flat flag table caused agents to mix sync-manifest and manual flags, triggering drift guard failures.
**Migration**: Agents must now follow either Path A or Path B as presented in the updated SKILL.md.
