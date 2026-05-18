# Proposal

## 问题定义

GitNexus 的 `analyze` 阶段（Phase 5.7）残留了 Unity rule lab 的规则驱动合成边注入逻辑。每次 analyze 结束时都会输出 `Unity Rule Binding Diagnostics` 警告信息，即使没有任何规则配置也会产生 fallback 警告。此外，CLI `rule-lab` 子命令和 MCP `rule_lab_*` 工具作为离线规则创作工作流，在简化版本的 GitNexus 中已不再需要——Unity lifecycle 自动检测（Phase 5.6）+ graph-only runtime verification 已覆盖原有的规则驱动场景。

这些残留代码增加了代码库的维护负担、analyze 输出噪音和测试复杂性，需彻底移除。

## 范围边界

**移除范围**：
- `analyze` 主流程中的 Phase 5.7（`loadAnalyzeRules` → `applyUnityRuntimeBindingRules` 合成边注入）
- CLI `rule-lab` 子命令组（analyze/review-pack/curate/promote/regress/compile）
- MCP `rule_lab_*` 5 个工具及后端 handler
- `gitnexus/src/rule-lab/` 整个核心模块（含 compiled-bundles.ts、types.ts 等全部文件）
- `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts` 注入引擎
- query-time `retrieval_rules`/`verification_rules` compiled bundle 消费逻辑
- 所有相关测试文件、skill 文件、benchmark、fixture
- `.gitnexus/rules/` 目录下的编译产物不再被消费（历史文件静默忽略）

**保留范围**：
- Phase 5.5（Unity 资源绑定解析）— 不受影响
- Phase 5.6（内置 Lifecycle 合成 CALLS 注入）— 不受影响
- Query-time graph-only runtime chain verification — 不受影响
- 非 rule-lab 的 MCP 工具（query/context/impact/rename 等）— 不受影响

**文档处理**：
- `docs/unity-runtime-process-source-of-truth.md` 中相关设计拆分为退役附录 C
- `UNITY_RUNTIME_PROCESS.md` 更新 Pipeline 执行顺序
- 历史计划文档（`docs/plans/`）保留不动

## Capabilities

### New Capabilities

（本次为纯移除操作，无新增能力）

### Modified Capabilities

- `analyze`: Phase 5.7 规则驱动合成边注入移除 — analyze 阶段不再加载 `analyze_rules` compiled bundle 或执行 runtime binding rules
- `mcp-tools`: 移除 5 个 `rule_lab_*` MCP 工具（analyze/review-pack/curate/promote/regress）— 离线规则创作工作流不再通过 MCP 暴露
- `cli-commands`: 移除 `rule-lab` 子命令组及全部 6 个子命令（analyze/review-pack/curate/promote/regress/compile）
- `unity-runtime-synthetic-edges`: 移除整个规则驱动的合成边注入系统（`unity-runtime-binding-rules.ts`），包含 4 种 binding kind（asset_ref_loads_components / method_triggers_field_load / method_triggers_scene_load / method_triggers_method）
- `compiled-bundles`: 移除 compiled rule bundle 的读取/写入/消费全链路（`compiled-bundles.ts`），query-time retrieval hint 回归纯 graph-based

## Impact

- **analyze 输出更干净**：不再输出 `Unity Rule Binding Diagnostics` 行
- **analyze 性能**：Phase 5.7 的 compiled bundle 加载 + 图遍历已是一个轻量步骤（通常 <100ms），移除后性能影响可忽略
- **CLI 变化**：`gitnexus rule-lab *` 子命令不可用
- **MCP 工具变化**：`rule_lab_analyze` 等 5 个工具不可用
- **query/context 工具**：不再基于 `retrieval_rules` 提供检索建议（影响极小，主要检索能力不变）
- **测试覆盖率**：删除大量 rule-lab 测试，需调整 `vitest.config.ts` 的 coverage thresholds

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 真理源文档：`docs/unity-runtime-process-source-of-truth.md`（新增退役附录 C）
  - Pipeline 文档：`UNITY_RUNTIME_PROCESS.md`（更新执行顺序表）
  - 缺口分析：`docs/event-delegate-gap-analysis.md`（移除 rule-lab 引用）
  - Agent 指引：`gitnexus/AGENTS.md`（移除 binding kind 强制要求）
