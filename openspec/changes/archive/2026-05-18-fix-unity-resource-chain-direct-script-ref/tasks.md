# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 `specs/unity-resource-chains/spec.md` 中 4 个 Requirements 的实现范围与边界
  - `ResourceChainTypeSupportsOneHop`: 类型泛化 → `local-backend.ts` 类型定义
  - `SeedChainsQueryOneHop`: 单跳查询 → `local-backend.ts` `loadSeedUnityResourceChains`
  - `BindingsToChainsFallback`: 桥接 → `local-backend.ts` context handler + query handler
  - `ChainFilterAcceptsOneHop`: filter 放宽 → `agent-safe-response.ts` `buildResourceChains`
- [x] 1.2 确认依赖前置条件：neonspark 仓库索引需为最新（含 `btnUtilityShortcut.prefab` 的 `UNITY_GRAPH_NODE_SCRIPT_REF` 边）

## 2. 核心实现任务

- [x] 2.1 泛化 `UnityResourceChainPayload` 类型
  - 文件：`gitnexus/src/mcp/local/local-backend.ts`
  - `relationType`: 从 `'UNITY_ASSET_GUID_REF'` 扩展为 `'UNITY_ASSET_GUID_REF' | 'UNITY_GRAPH_NODE_SCRIPT_REF'`
  - `intermediateResourcePath`: 改为 `intermediateResourcePath?: string`
  - `nextRelationType`: 改为 `nextRelationType?: 'UNITY_GRAPH_NODE_SCRIPT_REF'`
  - `nextRelationReason`: 改为 `nextRelationReason?: string`
  - 验证：TypeScript 编译通过，现有两跳链消费代码不受影响

- [x] 2.2 `loadSeedUnityResourceChains` 增加单跳查询
  - 文件：`gitnexus/src/mcp/local/local-backend.ts`
  - 在现有两跳查询之后，新增单跳 Cypher 查询：
    ```cypher
    MATCH (source:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(target)
    WHERE labels(target)[0] IN ['Class']
    RETURN ...
    ```
  - 将单跳结果映射为 `UnityResourceChainPayload`（`intermediateResourcePath = undefined`）
  - 合并两跳结果 + 单跳结果，统一 scoring/dedup/sort
  - 单跳查询失败时 catch 并 `logQueryError`，不影响两跳结果
  - 验证：neonspark 仓库 `query MobileUtilitySetShortcut --resource-path-prefix "Assets/NEON/Prefab/UI/ui_mobile/btnUtilityShortcut.prefab"` 返回非空 `resource_chains`

- [x] 2.3 context handler 增加 bindings→chains 桥接
  - 文件：`gitnexus/src/mcp/local/local-backend.ts`（`handleContext` 函数，`result.resource_chains` 赋值点之后）
  - 当 `result.resource_chains.length === 0 && contextResourceBindings.length > 0` 时：
    - 从 `contextResourceBindings` 生成单跳链，`targetSymbol` 使用 `symNodeId/symName/symFilePath`
    - 赋值给 `result.resource_chains`
  - 验证：neonspark 仓库 `context MobileUtilitySetShortcut --unity-resources on`（无 `resource_path_prefix`）返回非空 `resource_chains`

- [x] 2.4 query handler 增加 bindings→chains 桥接
  - 文件：`gitnexus/src/mcp/local/local-backend.ts`（query handler，`result.resource_chains` 赋值点之后）
  - 当 `result.resource_chains.length === 0 && firstResourceBindings.length > 0` 时：
    - 从 `firstResourceBindings` 生成单跳链
    - 赋值给 `result.resource_chains`
  - 验证：neonspark 仓库 `query MobileUtilitySetShortcut --unity-resources on`（无 `resource_path_prefix`）返回非空 `resource_chains`

- [x] 2.5 `buildResourceChains` filter 放宽
  - 文件：`gitnexus/src/mcp/local/agent-safe-response.ts`
  - filter 条件从 `Boolean(chain.sourceResourcePath && chain.intermediateResourcePath && chain.targetSymbol)` 改为 `Boolean(chain.sourceResourcePath && chain.targetSymbol)`
  - 验证：slim response 中单跳链正常输出；`intermediateResourcePath` 为 `undefined` 的链不被过滤

## 3. 收敛与验证准备

- [x] 3.1 neonspark e2e 验证：`query MobileUtilitySetShortcut --unity-resources on` → `resource_chains` 非空且包含 `btnUtilityShortcut.prefab`
- [x] 3.2 neonspark e2e 验证：`context MobileUtilitySetShortcut --unity-resources on` → `resource_chains` 非空
- [x] 3.3 两跳链回归：选择一个含 `UNITY_ASSET_GUID_REF` 的场景（如 ScriptableObject GUID 引用另一资产上的脚本），确认两跳链仍正常返回
- [x] 3.4 TypeScript 编译：`npx tsc --noEmit` 通过
- [x] 3.5 现有单元测试：`npx vitest run` 通过（无回归）

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成或更新 `verification.md`（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 `verification.md` 结论生成或更新 `writeback.md`（目标、字段映射、前置条件）
- [x] 4.3 执行 `writeback.md` 中定义的回写目标，并记录可审计证据（链接、时间、执行人、结果）
