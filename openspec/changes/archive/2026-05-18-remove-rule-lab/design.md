# Design

## Context

GitNexus 的 Unity rule lab 是一个离线规则创作系统，包含 YAML 规则编写、编译为 JSON bundle、analyze 阶段消费编译产物注入合成边、以及 CLI/MCP 工具全链路。随着 Phase 5.6（内置 lifecycle 自动检测）和 graph-only runtime verification 的成熟，rule lab 的离线创作工作流和 analyze 阶段的规则驱动注入已不再需要。

本次变更是纯移除操作，不新增任何功能。

## Goals / Non-Goals

**Goals:**

- 从 analyze 主流程中移除 Phase 5.7 规则驱动合成边注入
- 从 CLI 中移除 `rule-lab` 子命令组（6 个子命令）
- 从 MCP 工具中移除 5 个 `rule_lab_*` 工具
- 从 MCP 后端移除 retrieval_rules/verification_rules compiled bundle 消费逻辑
- 删除 `src/rule-lab/` 整个核心模块目录
- 删除 `src/core/ingestion/unity-runtime-binding-rules.ts` 注入引擎
- 清理所有相关测试、skill 文件、benchmark、fixture
- 更新真理源文档，拆分退役附录

**Non-Goals:**

- 不修改 Phase 5.5（Unity 资源绑定解析）或 Phase 5.6（lifecycle 合成 CALLS）
- 不修改 query/context/impact/rename 等非 rule-lab MCP 工具的核心检索逻辑
- 不主动清理已有 repo 中的 `.gitnexus/rules/compiled/*.v2.json` 历史文件
- 不删除 `docs/plans/` 和 `docs/reports/` 中的历史计划与报告文档

## Decisions

### D1: 移除 vs 标记 deprecated

**决策**: 直接移除（删除文件/代码），而非标记 `@deprecated`。

**理由**: Rule lab 的代码量约 3000+ 行，分布在 20+ 个文件中。标记 deprecated 只会增加维护负担而不产生价值——Phase 5.6 + graph-only verification 已完全替代其功能。直接删除可立即减少代码库体积和测试复杂度。

### D2: compiled-bundles 消费方的处理

**决策**: 全部移除，包括 `loadCompiledRuleBundle`、`loadRuleRegistry`、`loadAnalyzeRules`、`resolveRetrievalRuleHint`。

**理由**: `retrieval_rules` 消费方（query-time hint）和 `verification_rules` 消费方（`loadRuleRegistry`）仅在 rule-lab 生成编译产物时有用。移除 rule-lab 后这些编译产物不再更新，消费方成为死代码。graph-only runtime verification 已在 ai-context 中声明为 query-time 的标准路径。

### D3: runtime-claim-rule-registry.ts 的处理

**决策**: 保留文件但移除 rule-lab 相关函数（`loadAnalyzeRules`、`loadRuleRegistry`）和类型引用（`UnityResourceBinding`、`LifecycleOverrides`），从 `parseRuleYaml` 中移除 binding 解析逻辑。

**理由**: `runtime-claim-rule-registry.ts` 的 `parseRuleYaml` 函数解析基础规则字段（id/trigger_family/host_base_type 等）可能仍有用。如果后续确认无消费者，可在后续 change 中进一步清理。

### D4: 真理源文档的处理

**决策**: 在 `docs/unity-runtime-process-source-of-truth.md` 末尾新增「附录 C：已退役 — Rule Lab」，而非删除原有内容。

**理由**: 保留退役设计的可追溯性。附录 C 明确标注退役日期、原因和保留的能力清单。Pipeline 执行顺序表直接移除 Phase 5.7 行，不在正文中保留退役引用以避免混淆。

### D5: 测试覆盖率阈值

**决策**: 移除大量测试后，在 `vitest.config.ts` 中将 `coverage.thresholds.autoUpdate` 改为 `true`（默认行为），让 vitest 自动重新计算基准。不硬性调整数值。

**理由**: 硬性数值容易过时，`autoUpdate: true` 让覆盖率阈值自动适应代码库变化。

## Risks / Migration

### R1: 编译产物残留文件

**风险**: 已有 repo 中 `.gitnexus/rules/compiled/*.v2.json` 和 `.gitnexus/rules/lab/runs/*/` 文件不再被消费，占用磁盘空间。

**缓解**: 影响极小（通常 <100KB）。analyze 不再尝试加载这些文件，不产生错误。用户可手动清理。

### R2: 第三方调用方

**风险**: 外部脚本或 CI pipeline 可能调用 `gitnexus rule-lab *` 命令或 `rule_lab_*` MCP 工具。

**缓解**: 这些命令/工具从未在公开文档中作为稳定 API 承诺。调用方会遇到 "unknown command" 或 "Unknown tool" 错误，可据此迁移。

### R3: 测试覆盖率下降触发 CI 失败

**风险**: 删除大量 rule-lab 测试代码可能使覆盖率百分比暂时低于阈值（删除的是测试代码，不是实现代码，实际上覆盖率应该上升）。

**缓解**: 实际风险很低——删除的是测试代码和实现代码同时进行，覆盖率比例可能持平或上升。CI 中 `autoUpdate` 会自动调整阈值。

### R4: Skill 文件残留

**风险**: 已安装到用户 `~/.agents/skills/gitnexus/` 的 `gitnexus-unity-rule-gen` 和 `gitnexus-unity-e2e-verify` 目录不会被本次变更自动清理。

**缓解**: 下次 `gitnexus setup` 运行时，`installSkillsTo` 通过 glob 动态发现 skill 源文件，已移除的 skill 源文件不会被重新安装。已安装的旧目录可通过手动删除或在 setup 中新增清理逻辑处理（非本次 scope）。
