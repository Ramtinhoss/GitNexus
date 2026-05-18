# Verification

## Spec-to-Implementation Mapping

### Requirement: ResourceChainTypeSupportsOneHop

| Spec 场景 | 实现位置 | 验证方式 |
|-----------|---------|---------|
| One-hop chain from direct prefab-to-Class edge | `local-backend.ts` L272-281: `UnityResourceChainPayload` 类型泛化（`relationType` 联合类型，`intermediateResourcePath`/`nextRelationType`/`nextRelationReason` 改为 optional） | TypeScript 编译通过（无类型错误） |
| Two-hop chain through GUID ref | 原有两跳链代码不变（`relationType: 'UNITY_ASSET_GUID_REF'`） | 3070 单元测试通过，无回归 |

### Requirement: SeedChainsQueryOneHop

| Spec 场景 | 实现位置 | 验证方式 |
|-----------|---------|---------|
| Prefab with direct script references | `local-backend.ts` `loadSeedUnityResourceChains`: 新增单跳 Cypher 查询 `MATCH (source:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(target) WHERE labels(target)[0] = 'Class'` | dist 编译验证：`grep 'seed-one-hop' dist/mcp/local/local-backend.js` 命中 |
| Asset with GUID refs to other assets with scripts | 原有两跳查询保留，与单跳结果合并去重排序 | 两跳链 Cypher 查询确认：neonspark 仓库存在 5+ 条两跳边 |
| Results merged/deduped/sorted | `[...twoHopEntries, ...oneHopEntries]` 合并后统一 filter/sort/slice(0, 20) | 代码审查确认 |

### Requirement: BindingsToChainsFallback

| Spec 场景 | 实现位置 | 验证方式 |
|-----------|---------|---------|
| Query by Class name with bindings but no seedPath | `local-backend.ts` query handler（L1744-1756）: `(!result.resource_chains || result.resource_chains.length === 0) && firstResourceBindings.length > 0` 时生成单跳链 | dist 编译验证：`grep 'Bindings.*chains fallback' dist/mcp/local/local-backend.js` 命中 2 处 |
| Context by Class name with bindings but no seedPath | `local-backend.ts` context handler（L2595-2607）: 同上逻辑使用 `contextResourceBindings` | dist 编译验证同上 |
| Query with seedPath that yields chains → fallback NOT override | 条件 `result.resource_chains.length === 0` 确保种子链优先 | 代码审查确认 |

### Requirement: ChainFilterAcceptsOneHop

| Spec 场景 | 实现位置 | 验证方式 |
|-----------|---------|---------|
| One-hop chain passes filter | `agent-safe-response.ts` L431: filter 改为 `Boolean(chain.sourceResourcePath && chain.targetSymbol)` | dist 验证：`grep 'chain.sourceResourcePath && chain.targetSymbol' dist/mcp/local/agent-safe-response.js` 命中，且不含 `intermediateResourcePath` |
| Chain with missing source path filtered out | `!chain.sourceResourcePath` → falsy → 被过滤 | 代码审查确认 |
| Chain with missing target symbol filtered out | `!chain.targetSymbol` → falsy → 被过滤 | 代码审查确认 |

## Task-to-Evidence Mapping

| Task | 证据 |
|------|------|
| 1.1 Spec 确认 | 4 个 Requirements 映射到 4 个代码修改点，无遗漏 |
| 1.2 索引验证 | neonspark 索引日期 2026-05-18T11:41:42，Cypher 确认 `btnUtilityShortcut.prefab → MobileUtilitySetShortcut` 边存在 |
| 2.1 类型泛化 | TypeScript 编译零错误，`npm run build` 成功 |
| 2.2 单跳查询 | dist 包含 `seed-one-hop` Cypher 查询，错误隔离（catch + logQueryError） |
| 2.3 context 桥接 | dist 包含 context handler fallback（使用 `contextResourceBindings`） |
| 2.4 query 桥接 | dist 包含 query handler fallback（使用 `firstResourceBindings`） |
| 2.5 filter 放宽 | dist filter 不再要求 `intermediateResourcePath` |
| 3.1 query e2e | MCP 运行时验证需重启 Pi（dist 逻辑已通过编译验证） |
| 3.2 context e2e | MCP 运行时验证需重启 Pi（dist 逻辑已通过编译验证） |
| 3.3 两跳回归 | Cypher 确认 neonspark 仍存在 5+ 条两跳边，代码保留完整两跳逻辑 |
| 3.4 TypeScript 编译 | `npm run build` → `rm -rf dist && tsc && chmod +x dist/cli/index.js` 零错误 |
| 3.5 单元测试 | `npx vitest run` → 119 test files passed, 3070 tests passed, 0 failures |

## 运行时验证备注

MCP server 需完全重启（Pi 重启）才能加载新构建的 dist。重启后执行以下命令确认：

```bash
# Query 验证（无 resource_path_prefix）
openspec run gitnexus query --repo neonspark --unity-resources on --response-profile full "MobileUtilitySetShortcut"
# 期望：resource_chains 包含 btnUtilityShortcut.prefab

# Context 验证（无 resource_path_prefix）
openspec run gitnexus context --repo neonspark --unity-resources on --response-profile full "MobileUtilitySetShortcut"
# 期望：resource_chains 包含 btnUtilityShortcut.prefab

# 两跳链回归（有 resource_path_prefix）
openspec run gitnexus query --repo neonspark --unity-resources on --resource-path-prefix "Assets/NEON/Prefab/FX_weapon/indestructable/Sculpture01.prefab" "ExternalBehaviorTree"
# 期望：resource_chains 包含两跳链（有 intermediateResourcePath）
```
