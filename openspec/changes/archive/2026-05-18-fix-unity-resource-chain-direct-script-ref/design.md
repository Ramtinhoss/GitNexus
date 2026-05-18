# Design

## Context

`resource_chains` 是 Unity 资源检索的核心输出字段，用于向 Agent 提供「资源↔代码符号」的证据链路。当前实现仅支持两跳间接链（`seed → GUID_REF → intermediate → SCRIPT_REF → Class`），忽略了最常见的单跳直接链（`prefab → SCRIPT_REF → Class`），导致大量 prefab 引用无法被检索命中。

详细根因分析见 `proposal.md`，行为规范见 `specs/unity-resource-chains/spec.md`。

## Goals / Non-Goals

**Goals:**
- 使 `loadSeedUnityResourceChains` 同时查询两跳链和单跳链
- 使 `resource_chains` 在按 Class 查询（无 seedPath）时也能从现有 `resourceBindings` 生成链
- 泛化 `UnityResourceChainPayload` 类型以支持单跳链
- 放宽 `buildResourceChains` filter 以接受单跳链

**Non-Goals:**
- 不修改图数据层（`unity-resource-processor.ts`）
- 不修改 `loadUnityContext` / `projectUnityBindings`
- 不修改两跳链的现有行为
- 不改变 `resource_hints` / `next_hops` 生成逻辑
- 不新增 MCP 工具或 CLI 命令

## Decisions

### D1: 单跳查询执行方式 — 顺序两次查询 + 合并

**选择**：在 `loadSeedUnityResourceChains` 中，先执行现有两跳查询，再执行新增的单跳查询，将结果合并后进行统一的 scoring/dedup/sort。

**理由**：
- 无需引入 UNION 语法（Cypher-over-DuckDB 的 UNION 语义未经充分测试）
- 两次查询的 schema 略有不同（单跳无 intermediate 列），可独立映射
- 失败隔离：单跳查询失败不影响两跳结果

**代价**：额外一次 Cypher round-trip（<10ms）。

### D2: bindings→chains 桥接位置 — context/query handler 层

**选择**：在 `handleContext` 和 `handleQuery` 的 `result.resource_chains` 赋值点之后，检测 `resource_chains` 是否为空，若为空且有 `resourceBindings`，则从 bindings 生成单跳链。

**理由**：
- 桥接逻辑与 `loadSeedUnityResourceChains` 职责分离（该函数只负责 seed→chains 的图查询）
- 绑定数据已在 handler 的局部作用域中（`contextResourceBindings` / `firstResourceBindings`），无需跨层传递
- 兜底语义清晰：seed chains 优先，bindings chains 兜底

**代价**：两处 handler 各增加 ~10 行桥接代码（可抽取为共享 helper）。

### D3: 类型泛化方式 — optional 字段

**选择**：将 `intermediateResourcePath`、`nextRelationType`、`nextRelationReason` 改为 optional（`?`），`relationType` 扩展为 `'UNITY_ASSET_GUID_REF' | 'UNITY_GRAPH_NODE_SCRIPT_REF'`。

**理由**：
- 向后兼容：现有两跳链代码不受影响
- TypeScript 类型系统原生支持 optional 字段
- 下游消费者（`buildResourceChains`）天然适配 optional 字段

### D4: buildResourceChains filter 放宽

**选择**：从 `Boolean(chain.sourceResourcePath && chain.intermediateResourcePath && chain.targetSymbol)` 改为 `Boolean(chain.sourceResourcePath && chain.targetSymbol)`。

**理由**：
- `intermediateResourcePath` 在语义上不是链路必需字段
- 下游 `buildUpgradeHints` 等函数不依赖 `intermediateResourcePath`
- 最小修改，影响面可控

## Risks / Migration

| 风险 | 可能影响 | 缓解措施 |
|------|---------|---------|
| 单跳查询匹配到大量非预期 Class | `resource_chains` 可能包含与查询无关的脚本（如 prefab 引用的通用组件） | `scoreUnityResourceChainTarget` 的 targetSymbols 匹配逻辑会过滤不相关结果；hard cap 20 条 |
| bindings→chains 桥接返回 binding 中包含的其他 prefab（非目标 prefab） | 可能引入噪音 | `resourceBindings` 本身已被 `buildUnityEvidenceView` 过滤（`resourcePathPrefix`、`bindingKind` 等），噪音可控 |
| `UnityResourceChainPayload` 类型变更影响其他模块 | 编译错误 | `nextRelationType` 的所有消费点（`buildResourceChains` filter、`scoreUnityResourceChainTarget`）均为 optional-aware |
| 回归：两跳链场景退化 | 两跳链结果被覆盖或丢失 | 单跳结果与两跳结果合并（非替换）；两跳链仍先于单跳链执行 |

**降级策略**：无需降级。若单跳查询异常，catch 后记录 `logQueryError` 并继续，不影响两跳结果。
