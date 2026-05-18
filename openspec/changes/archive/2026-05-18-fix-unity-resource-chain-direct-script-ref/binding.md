# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: N/A（本次变更为缺陷修复，不涉及新增行为规范。资源链检索语义已在 `docs/unity-runtime-process-source-of-truth.md` 中定义）
- `project_page_ref`: `docs/unity-runtime-process-source-of-truth.md`（Unity Runtime Process 真理源）
- `additional_context_refs`:
  - `gitnexus/AGENTS.md`（子项目 Agent 指引，含 Unity 检索契约）
  - `gitnexus/src/mcp/local/agent-safe-response.ts`（slim 响应层，resource_chains 过滤逻辑）
  - `gitnexus/src/mcp/local/unity-enrichment.ts`（hydration 入口，loadUnityContext / projectUnityBindings）

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`（本次无新增 capability，不产生 spec）
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据
- 资源链检索的正确行为由 `docs/unity-runtime-process-source-of-truth.md` 中定义的检索契约描述

## 回写目标

- `writeback_targets`:
  - `gitnexus/src/mcp/local/local-backend.ts`：泛化 `UnityResourceChainPayload` 类型，修改 `loadSeedUnityResourceChains` 增加单跳查询，在 context/query handler 增加 bindings→chains 桥接
  - `gitnexus/src/mcp/local/agent-safe-response.ts`：放宽 `buildResourceChains` 过滤条件
  - `docs/unity-runtime-process-source-of-truth.md`：若检索契约描述需要同步更新
- `writeback_owner`: nantasmac
- `writeback_timing`: 实施完成并验证通过后回写

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若真理源文档中资源链检索契约与实现不一致，在实施过程中同步更新

## 待确认项

- [x] 已确认根因：`loadSeedUnityResourceChains` 仅查询两跳 `UNITY_ASSET_GUID_REF → UNITY_GRAPH_NODE_SCRIPT_REF` 模式，忽略了直接 `UNITY_GRAPH_NODE_SCRIPT_REF` 单跳模式
- [x] 已确认影响范围：`local-backend.ts`（类型 + 3 处函数）+ `agent-safe-response.ts`（1 处 filter）
- [x] 已确认图数据层无需修改（`UNITY_GRAPH_NODE_SCRIPT_REF` 边已正确创建）
- [x] 已确认回写目标（2 个源文件 + 1 个文档）
- [x] 已确认回归测试方式：用 neonspark 仓库 `MobileUtilitySetShortcut` 查询验证 `resource_chains` 非空
