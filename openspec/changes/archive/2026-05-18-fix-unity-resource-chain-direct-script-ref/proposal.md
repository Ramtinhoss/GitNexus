# Proposal

## 问题定义

GitNexus 的 Unity 资源链检索（`resource_chains`）存在结构性缺陷：当查询某个 Class（如 `MobileUtilitySetShortcut`）时，即使该 Class 被 prefab 直接引用，`resource_chains` 输出始终为空。根因分析如下：

1. **`loadSeedUnityResourceChains` 仅查询两跳链路**：Cypher 查询模式为 `seed → UNITY_ASSET_GUID_REF → intermediate → UNITY_GRAPH_NODE_SCRIPT_REF → Class`，但图数据中普遍存在的直接链路是 `prefab → UNITY_GRAPH_NODE_SCRIPT_REF → Class`（单跳），导致两跳模式命中率为零。

2. **`resource_chains` 依赖 `seedPath` 非空**：按 Class 名称查询且无 `resource_path_prefix` 时，`seedPath` 为 `undefined`，`loadSeedUnityResourceChains` 直接返回空数组。

3. **已存在的 `resourceBindings` 未桥接到 `resource_chains`**：`loadUnityContext` 成功从图数据中解析出 Class→prefab 的绑定数据，但这些数据仅用于生成 `resource_hints`（线索），从未转换为 `resource_chains`（证据链）。

4. **`buildResourceChains` 过滤条件过严**：要求 `intermediateResourcePath` 非空，导致即使单跳链被生成也会被丢弃。

结果：系统「知道」prefab 存在（体现在 `missing_proof_targets` 中），但无法将其作为可验证的证据链返回给 Agent——形成「有线索无闭环」的半成品状态。

## 范围边界

**修改范围**：
- `gitnexus/src/mcp/local/local-backend.ts`：
  - 泛化 `UnityResourceChainPayload` 类型，支持单跳链（`intermediateResourcePath` / `nextRelationType` 变为 optional，`relationType` 扩展为联合类型）
  - `loadSeedUnityResourceChains`：新增对 `UNITY_GRAPH_NODE_SCRIPT_REF` 单跳链的查询
  - context handler：当 `resource_chains` 为空但 `resourceBindings` 非空时，从 bindings 生成单跳链
  - query handler：同上桥接逻辑
- `gitnexus/src/mcp/local/agent-safe-response.ts`：
  - `buildResourceChains`：放宽 filter，允许 `intermediateResourcePath` 为空

**不变范围**：
- 图数据层（`unity-resource-processor.ts`）：`UNITY_GRAPH_NODE_SCRIPT_REF` 边已正确创建，无需修改
- `loadUnityContext` / `projectUnityBindings`：工作正常，无需修改
- 两跳链（`UNITY_ASSET_GUID_REF → UNITY_GRAPH_NODE_SCRIPT_REF`）：保留不变
- `resource_hints` / `next_hops` 生成逻辑：不受影响

**回归约束**：
- neonspark 仓库：`query MobileUtilitySetShortcut` 且 `unity_resources=on` 时，`resource_chains` 必须非空并包含 `btnUtilityShortcut.prefab`
- 两跳链场景不可退化
- 无 seedPath 的普通 query/context 调用行为不变（除新增 resource_chains 输出外）

## Capabilities

### New Capabilities

（本次为缺陷修复，无新增能力）

### Modified Capabilities

- `unity-resource-chains`: `resource_chains` 检索现在支持单跳 `UNITY_GRAPH_NODE_SCRIPT_REF` 链（prefab 直接引用 Class），并支持从 `resourceBindings` 自动生成链结构。此前仅支持两跳 `UNITY_ASSET_GUID_REF → UNITY_GRAPH_NODE_SCRIPT_REF` 链，且仅在存在 `seedPath` 时输出结果。

## Impact

- **query/context 输出**：按 Class 查询 Unity 组件时，`resource_chains` 从始终空变为包含实际 prefab 绑定链（≤5 条）
- **向后兼容**：两跳链不变，`UnityResourceChainPayload` 新增字段均为 optional，现有消费者无 breakage
- **查询性能**：单跳查询与两跳查询可并行执行，额外开销 <20ms（同一次 Cypher round-trip 内 UNION 或 sequential）
- **响应体积**：每个 binding 转为一个 chain entry（hard cap 5），JSON 体积微增（< 2KB）

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 真理源文档：`docs/unity-runtime-process-source-of-truth.md`（若检索契约描述需同步）
  - 源文件：`gitnexus/src/mcp/local/local-backend.ts`（类型 + 4 处修改点）
  - 源文件：`gitnexus/src/mcp/local/agent-safe-response.ts`（1 处 filter）
