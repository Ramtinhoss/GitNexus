# Specification Delta

## Capability 对齐（已确认）

- Capability: `clean-preserve-meta`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: modified
- 用户确认摘要: clean --force 应保留 meta.json，因 csharpDefineCsproj 等选项已持久化其中

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: clean-selective-deletion
`gitnexus clean --force` SHALL 执行选择性删除而非整目录 `rm -rf .gitnexus/`。具体行为：

1. SHALL 删除 `.gitnexus/` 下的索引数据目录和文件（`lbug/`、`csv/`、`*.wal`、`unity-parity-seed.json` 等）
2. SHALL 保留 `.gitnexus/meta.json`（含持久化 analyzeOptions 如 `csharpDefineCsproj`、`includeExtensions` 等）
3. SHALL 保留 `.gitnexus/config.json`（用户仓库级配置）
4. SHALL 保留 `.gitnexusignore`（用户提供的忽略规则）
5. 若删除后 `.gitnexus/` 目录仅剩保留文件，SHALL NOT 删除 `.gitnexus/` 目录本身
6. 保留文件不存在的场景（如首次 clean 后无 meta.json）SHALL 正常处理，不报错
7. `--all` 模式下 SHALL 对每个仓库应用相同的选择性删除逻辑
8. clean 完成后 SHALL 仍调用 `unregisterRepo` 移除全局注册

#### Scenario: clean-preserves-meta-json
- **WHEN** 用户对已索引仓库执行 `gitnexus clean --force`
- **AND** `.gitnexus/meta.json` 存在且包含 `analyzeOptions.csharpDefineCsproj`
- **THEN** `.gitnexus/meta.json` SHALL 保留不动
- **AND** `.gitnexus/lbug/` SHALL 被删除
- **AND** 全局注册 SHALL 被移除

#### Scenario: clean-no-meta-json
- **WHEN** 用户执行 `gitnexus clean --force`
- **AND** `.gitnexus/meta.json` 不存在
- **THEN** clean SHALL 正常完成，不报错

#### Scenario: clean-all-mode
- **WHEN** 用户执行 `gitnexus clean --force --all`
- **THEN** 每个仓库 SHALL 应用与单仓库模式相同的选择性删除逻辑

#### Scenario: rebuild-after-clean
- **WHEN** 用户在 `gitnexus clean --force` 后执行 `gitnexus analyze --force`
- **THEN** analyze SHALL 复用 `meta.json` 中已持久化的 `analyzeOptions`（如 `csharpDefineCsproj`），无需用户重新指定
