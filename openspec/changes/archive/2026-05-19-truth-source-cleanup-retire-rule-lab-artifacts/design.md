# Design

## Context

4 个已归档 spec（remove-rule-lab、fix-unity-resource-chain、remove-sync-manifest、clean-preserve-config）已实施完毕或部分实施。真源文档、配置文档、skill 文件、AGENTS.md 的残留过时内容需要统一清理。`clean.ts` 的行为修正因 sync-manifest 同期移除而改变了保留范围。

## Goals / Non-Goals

**Goals:**

- 校准 `docs/unity-runtime-process-source-of-truth.md` 中全部代码行号引用，补充缺失的 3 个 unity-config 参数
- 清理 `docs/gitnexus-config-files.md` 中已退役的 rule-lab/sync-manifest 内容
- 删除 3 个完全不可用的 rule-lab skill 文件和 1 个 shared contract
- 更新 `gitnexus-guide/SKILL.md` 和 `AGENTS.md` 中的 skill/tool 引用
- 修正 `clean.ts` 为选择性删除，保留 `meta.json` 和 `config.json`

**Non-Goals:**

- 不修改真源文档的架构语义（Phase 顺序、字段含义不变）
- 不新增功能或能力
- 不修改 pipeline / MCP 核心逻辑
- 不重建索引或执行运行时验证
- 不重写 `gitnexus-unity-e2e-verify` skill 为 graph-only 验证流程（完全删除）

## Decisions

### D1: 行号校准策略

对真源文档中每个 `文件名:行号` 引用，逐项在当前代码中定位实际行号并替换。对不再有明确对应行号的引用（如 `schema.ts:254`），改为引用文件路径 + 关键代码段描述，避免再次漂移。

### D2: Skill 删除 vs 标记退役

用户确认完全删除。理由：skill 核心流程依赖不存在的 CLI 命令，标记退役没有实际价值，反而可能误导 Agent 尝试使用。

### D3: clean.ts 保留范围

保留 `meta.json`（含 csharpDefineCsproj 等 analyzeOptions）和 `config.json`（仓库级 Unity 配置）。不保留 `sync-manifest.txt`（已移除）、不保留 `rules/` 目录（rule-lab 已退役）。

实现方式：从 `fs.rm(storagePath, { recursive: true })` 改为枚举 `.gitnexus/` 目录内容，删除除 `meta.json`、`config.json`、`.gitnexusignore` 之外的所有条目。

### D4: gitnexus-config-files.md 清理范围

移除 rule-lab 相关的全部 5 个状态文件条目 + 1 个可选输入条目 + sync-manifest 条目 + sync-manifest unified rules 整个章节。补充 `meta.json` schema 中的 `csharpDefineCsproj` 字段。

### D5: AGENTS.md 更新范围

从 Skill 安装表和 `available_skills` 列表中移除 `gitnexus-unity-rule-gen` 和 `gitnexus-unity-e2e-verify` 条目。检查 MCP 工具引用中是否有 `rule_lab_*` 残留并移除。

## Risks / Migration

| 风险 | 影响 | 缓解 |
|------|------|------|
| 行号再次漂移 | 中 | 考虑部分高频变动引用改为"关键代码段描述"而非精确行号 |
| 用户依赖已删除的 skill | 低 | skill 已不可用（CLI 命令不存在），删除只是消除误导 |
| clean 保留 meta.json 导致旧 meta 干扰新 analyze | 低 | analyze 的 `validateStoredOptions()` 会校验字段有效性，过期字段会 warn 并回退默认值 |
