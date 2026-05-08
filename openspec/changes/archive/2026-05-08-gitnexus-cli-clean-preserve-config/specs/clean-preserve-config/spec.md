# Specification Delta

## Capability 对齐（已确认）

- Capability: `clean-preserve-config`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `new`
- 用户确认摘要: 用户已在现场排查中确认 clean 误删 sync-manifest 是重建超时根因之一，要求 clean 保留配置文件

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: selective-clean
The `gitnexus clean` command SHALL remove only index data files from the repository's `.gitnexus/` storage directory while preserving configuration files.

#### Scenario: default-single-repo-clean
- **WHEN** the user runs `gitnexus clean --force` in a repository that has been indexed
- **THEN** all files and subdirectories under `.gitnexus/` SHALL be removed EXCEPT for entries listed in the preserved-config set
- **AND** the `sync-manifest.txt` file SHALL remain intact with its original content
- **AND** the repository SHALL be unregistered from the global registry as before

#### Scenario: all-repos-clean
- **WHEN** the user runs `gitnexus clean --all --force`
- **THEN** for each indexed repository, the same selective deletion rule SHALL apply
- **AND** `sync-manifest.txt` in each repository's `.gitnexus/` directory SHALL be preserved

### Requirement: preserved-config-set
The clean command SHALL maintain an explicit allow-list of configuration files that must never be deleted during a clean operation.

#### Scenario: current-allow-list
- **GIVEN** the current implementation
- **THEN** the preserved-config set SHALL contain at minimum `sync-manifest.txt`
- **AND** future configuration files MAY be added to this set without changing the deletion logic

### Requirement: backward-compatible-cli
The `gitnexus clean` command-line interface SHALL remain unchanged; no new flags are introduced and existing flags retain identical semantics.

#### Scenario: existing-scripts
- **GIVEN** any script or automation that calls `gitnexus clean --force` or `gitnexus clean --all --force`
- **WHEN** the new selective-clean logic is deployed
- **THEN** the script SHALL continue to work without modification
- **AND** the only observable behavioral difference SHALL be the continued presence of `sync-manifest.txt`
