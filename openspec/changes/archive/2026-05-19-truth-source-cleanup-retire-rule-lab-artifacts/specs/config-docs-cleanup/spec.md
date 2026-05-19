# Specification Delta

## Capability 对齐（已确认）

- Capability: `config-docs-cleanup`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: modified
- 用户确认摘要: gitnexus-config-files.md 仍描述已退役的 rule-lab/sync-manifest 机制

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: rule-lab-state-files
**Reason**: Rule Lab 离线规则创作系统已于 v1.5.0 移除（2026-05-18），所有相关 CLI 命令、MCP 工具和核心模块已删除。
**Migration**: 以下文件条目 SHALL 从 `docs/gitnexus-config-files.md` 的 Repo-local 表格中移除：
- `rules/catalog.json`
- `rules/approved/*.yaml`
- `rules/compiled/*.v2.json`
- `rules/lab/runs/**`
- `rules/reports/*.md`

以下可选输入条目 SHALL 同时移除：
- `.gitnexus/rules/overrides.yaml`

#### Scenario: rule-lab-entries-removed
- **WHEN** 阅读 `docs/gitnexus-config-files.md`
- **THEN** 文档中 SHALL NOT 出现 `rule-lab`、`catalog.json`、`approved/*.yaml`、`compiled/*.v2.json`、`lab/runs`、`rules/reports` 相关描述

### Requirement: sync-manifest-description
**Reason**: sync-manifest 机制已于 2026-05-11 移除，`sync-manifest.txt`、`sync-manifest.ts`、`--sync-manifest-policy` 等 CLI 参数均已删除。
**Migration**: `docs/gitnexus-config-files.md` 中 SHALL 移除：
- `.gitnexus/sync-manifest.txt` 可选输入条目
- `sync-manifest.txt` unified rules 整个章节（含格式示例和规则列表）

#### Scenario: sync-manifest-entries-removed
- **WHEN** 阅读 `docs/gitnexus-config-files.md`
- **THEN** 文档中 SHALL NOT 出现 `sync-manifest`、`scope-manifest`、`@extensions=`、`@repoAlias=` 相关描述

## MODIFIED Requirements

### Requirement: meta-json-schema-completeness
`docs/gitnexus-config-files.md` 的 `meta.json` schema 示例 SHALL 包含 `csharpDefineCsproj` 可选字段。

#### Scenario: csharp-define-csproj-documented
- **WHEN** 阅读 `docs/gitnexus-config-files.md` 的 `meta.json` schema
- **THEN** `analyzeOptions` 对象 SHALL 包含字段 `"csharpDefineCsproj": "optional-path-to.csproj"` 并附注说明该参数由 `--csharp-define-csproj` CLI 参数持久化
