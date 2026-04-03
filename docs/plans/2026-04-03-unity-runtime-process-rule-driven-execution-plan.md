# Unity Runtime Process 规则驱动 — 分阶段执行计划

> 基于 `docs/plans/2026-04-03-unity-runtime-process-rule-driven-design.md` 方案设计
> 生成日期：2026-04-03

---

## Phase 1: 规则基础设施 + 配置加载器

**目标**：建立 `resource_bindings` 类型系统和统一配置加载，不改变运行时行为。

### 1.1 扩展规则类型系统

- **文件**：`gitnexus/src/rule-lab/types.ts`（98 行）
- **变更**：
  - 新增 `UnityResourceBinding` 接口（`kind`, `ref_field_pattern`, `target_entry_points`, `host_class_pattern`, `field_name`, `loader_methods`）
  - 新增 `LifecycleOverrides` 接口（`additional_entry_points`, `scope`）
  - 扩展 `RuleDslDraft` 添加可选字段 `resource_bindings?: UnityResourceBinding[]` 和 `lifecycle_overrides?: LifecycleOverrides`
- **验证**：TypeScript 编译通过，现有规则加载不受影响

### 1.2 扩展规则注册表解析 + 规则族区分

- **文件**：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`（313 行）
- **变更**：
  - `loadRuleRegistry` 解析 YAML 中的 `resource_bindings`、`lifecycle_overrides` 和 `family` 字段，存入 `RuntimeClaimRule`
  - `RuntimeClaimRule` 接口新增 `family?: 'analyze_rules' | 'verification_rules'` 字段
  - 新增 `loadAnalyzeRules(repoPath)` 函数：调用 `loadRuleRegistry` 后过滤 `family === 'analyze_rules'` 的规则，供 Phase 3 的 pipeline 注入步骤使用
  - 现有 v1 规则（无 `family` 字段）默认归类为 `verification_rules`，保持向后兼容
- **文件**：`.gitnexus/rules/catalog.json`
  - 扩展 catalog 条目支持可选 `family` 字段
- **验证**：现有 `.gitnexus/rules/approved/` 下的 v1 规则仍能正常加载，`loadAnalyzeRules` 对无 analyze_rules 的仓库返回空数组

### 1.3 新建统一配置加载器

- **新文件**：`gitnexus/src/core/config/unity-config.ts`
- **变更**：
  - 定义 `UnityConfig` 接口（`maxSyntheticEdgesPerClass`, `maxSyntheticEdgesTotal`, `lazyMaxPaths`, `lazyBatchSize`, `lazyMaxMs`, `payloadMode`）
  - 实现 `resolveUnityConfig(cliArgs?, configPath?)`：CLI 参数 > `.gitnexus/config.json` > 内置默认值
  - 输出 `configSource` 字段标注每个参数来源
- **验证**：单元测试覆盖三级优先级

### 1.4 规则 Schema 文件

- **文件**：`gitnexus/src/rule-lab/schema/rule-dsl.schema.json`
- **变更**：添加 `resource_bindings` 和 `lifecycle_overrides` 的 JSON Schema 定义
- **验证**：现有规则 YAML 通过 schema 校验

**Phase 1 完成标志**：`npm run build` 通过，现有测试全绿，无行为变更。

---

## Phase 2: Pipeline 重排序 + Lifecycle 始终启用

**目标**：将 Unity 资源处理提前到 Process 生成之前，lifecycle 注入改为默认启用。

### 2.1 Pipeline 重排序

- **文件**：`gitnexus/src/core/ingestion/pipeline.ts`（552 行）
- **当前顺序**：Phase 5 Communities → Phase 5.5 `applyUnityLifecycleSyntheticCalls` → Phase 6 Processes → Phase 7 `processUnityResources`
- **新顺序**：
  - Phase 5: Communities（不变）
  - Phase 5.5: `processUnityResources`（从 Phase 7 提前）
  - Phase 5.6: `applyUnityLifecycleSyntheticCalls`（不变，但改为始终启用）
  - Phase 5.7: `applyUnityRuntimeBindingRules`（新步骤，Phase 3 实现，此阶段为空壳）
  - Phase 6: Processes（不变）
- **风险**：`processUnityResources` 只依赖 Class 节点（Phase 3 已有）和文件系统，提前是安全的
- **验证**：对 neonspark 运行 `gitnexus analyze`，对比 Phase 7 输出与 Phase 5.5 输出一致

### 2.2 Lifecycle 注入始终启用

- **文件**：`gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts`（448 行）
- **变更**：
  - 移除 `enabled` 开关逻辑，对检测到 Unity 项目（存在 `.meta` 文件）时始终执行
  - 从 Phase 1.3 的 `resolveUnityConfig` 读取 `maxSyntheticEdgesPerClass` / `maxSyntheticEdgesTotal`
  - 保留硬编码锚点/桥接/评分作为 fallback（Phase 6 移除）
- **文件**：`gitnexus/src/core/ingestion/pipeline.ts`
- **变更**：调用 `applyUnityLifecycleSyntheticCalls` 时不再检查 env var gate，改为读 `resolveUnityConfig`
- **验证**：不设置任何 `GITNEXUS_UNITY_*` 环境变量，lifecycle 合成边仍被注入

**Phase 2 完成标志**：Pipeline 新顺序运行正常，lifecycle 默认启用，硬编码系统仍作为 fallback 存在。

---

## Phase 3: 规则驱动合成边注入

**目标**：实现核心的资源↔代码边界穿越边注入逻辑。

### 3.1 新建规则驱动注入模块

- **新文件**：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
- **实现**：
  - `applyUnityRuntimeBindingRules(graph, rules, config)` 主函数
  - `asset_ref_loads_components` 处理：查 `UNITY_ASSET_GUID_REF` → 目标资源 → `UNITY_COMPONENT_INSTANCE` → Class → `HAS_METHOD` → 注入 CALLS 边
  - `method_triggers_field_load` 处理：查 Class → `loader_methods` → `UNITY_COMPONENT_INSTANCE` → serializedFields → GUID → 目标资源 → 组件入口 → 注入 CALLS 边
  - `lifecycle_overrides` 处理：追加额外 lifecycle 入口边
  - 所有合成边：`confidence=0.75`，`reason=unity-rule-resource-load:{ruleId}` 或 `unity-rule-loader-bridge:{ruleId}`

### 3.2 接入 Pipeline

- **文件**：`gitnexus/src/core/ingestion/pipeline.ts`
- **变更**：Phase 5.7 步骤调用 `applyUnityRuntimeBindingRules`，从 `.gitnexus/rules/` 加载 `analyze_rules` 族规则

### 3.3 为 neonspark 编写 analyze_rules

- **文件**：neonspark 仓库的 `.gitnexus/rules/approved/` 下新建规则 YAML
- **内容**：按设计文档 §2 的 schema 编写 weapon-powerup-gungraph 规则，使用 `version: 2.0.0` + `family: analyze_rules`
- **规则格式共存**：现有 v1 规则（如 `unity.gungraph.reload.output-getvalue.v1.yaml`）保持不变，归类为 `verification_rules`。新的 analyze_rules 必须使用 v2 格式（`assertDslShape` 对 majorVersion >= 2 强制要求 DSL 结构）。两种格式通过 `family` 字段区分，互不干扰。
- **验证**：
  - `gitnexus analyze` 后用 Cypher 查询：`MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b) WHERE r.reason STARTS WITH 'unity-rule-' RETURN a.name, b.name, r.reason`
  - Process 生成结果包含 WeaponPowerUp.Equip → ReloadBase.GetValue 完整链路

**Phase 3 完成标志**：规则驱动的合成边成功注入，Process 包含完整的资源↔代码链路。

---

## Phase 4: 移除环境变量 + 配置迁移

**目标**：消除所有 `GITNEXUS_UNITY_*` 环境变量，统一到配置文件。

### 4.1 删除配置文件

| 文件 | 行数 |
|------|------|
| `gitnexus/src/core/ingestion/unity-lifecycle-config.ts` | 43 |
| `gitnexus/src/mcp/local/unity-runtime-chain-verify-config.ts` | 7 |
| `gitnexus/src/mcp/local/unity-process-confidence-config.ts` | 4 |
| `gitnexus/src/mcp/local/unity-lazy-config.ts` | 13 |

### 4.2 迁移调用方

- **文件**：`gitnexus/src/mcp/local/local-backend.ts`（3527 行）
  - 移除 `resolveUnityRuntimeChainVerifyEnabled` 调用，`runtime_chain_verify` 仅由请求参数控制
  - 移除 `resolveUnityProcessConfidenceFieldsEnabled` 调用，扩展字段始终输出
  - 移除 `resolveUnityLazyConfig` 调用，改用 `resolveUnityConfig`
- **文件**：`gitnexus/src/mcp/local/unity-lazy-hydrator.ts`
  - 移除 `resolveUnityLazyConfig` 导入，改用 `resolveUnityConfig`
- **文件**：`gitnexus/src/mcp/local/unity-runtime-hydration.ts`
  - 移除 `resolveUnityLazyConfig` 导入，改用 `resolveUnityConfig`
  - 同步处理 `GITNEXUS_UNITY_PARITY_WARMUP_MAX_PARALLEL` 引用（见 4.4）
- **文件**：`gitnexus/src/mcp/local/process-confidence.ts`
  - 移除 `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` 引用，扩展字段始终输出
- **文件**：`gitnexus/src/mcp/tools.ts`（481 行）
  - 移除工具描述中关于 `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` 的说明
- **文件**：`gitnexus/src/core/ingestion/pipeline.ts`
  - 移除 `resolveUnityLifecycleConfig(env)` 调用，改用 `resolveUnityConfig`
- **文件**：`gitnexus/src/core/ingestion/unity-resource-processor.ts`
  - 移除 `GITNEXUS_UNITY_PAYLOAD_MODE` 读取，改用 `resolveUnityConfig().payloadMode`

### 4.3 添加 CLI 参数

- **文件**：`gitnexus/src/cli/index.ts`（213 行）
- **变更**：添加 `--unity-max-synthetic-edges`, `--unity-payload-mode` 等 CLI 参数，传入 `resolveUnityConfig`

### 4.4 清理 parity 相关 env vars

5 个 parity 环境变量的具体处置：

| 环境变量 | 所在文件 | 处置 |
|---------|---------|------|
| `GITNEXUS_UNITY_PARITY_WARMUP` | `cli/mcp.ts`, `cli/eval-server.ts` | 移入 `.gitnexus/config.json` 的 `unity.parityWarmup` |
| `GITNEXUS_UNITY_PARITY_WARMUP_MAX_PARALLEL` | `unity-runtime-hydration.ts` | 移入 `unity.parityWarmupMaxParallel` |
| `GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS` | `unity-parity-seed-loader.ts` | 移入 `unity.paritySeedCacheIdleMs` |
| `GITNEXUS_UNITY_PARITY_SEED_CACHE_MAX_ENTRIES` | `unity-parity-seed-loader.ts` | 移入 `unity.paritySeedCacheMaxEntries` |
| `GITNEXUS_UNITY_PARITY_CACHE_MAX_ENTRIES` | `unity-parity-cache.ts` | 移入 `unity.parityCacheMaxEntries` |

注意：`cli/mcp.ts` 和 `cli/eval-server.ts` 中硬编码 `GITNEXUS_UNITY_PARITY_WARMUP = '1'` 的启动行为，需改为从配置加载器读取默认值。

### 4.5 同步测试文件

| 测试文件 | 处置 |
|---------|------|
| `unity-lazy-config.test.ts` | 删除（源文件已删除） |
| `runtime-claim-rule-registry.test.ts` | 更新（Phase 1.2 扩展了 family 字段） |

### 4.6 同步 benchmark 文件

以下 benchmark runner 引用 `GITNEXUS_UNITY_*` 环境变量，需同步迁移：
- `phase2-runtime-claim-acceptance-runner.ts`
- `hydration-policy-repeatability-runner.ts`
- `reload-v1-acceptance-runner.ts`

改为从 `resolveUnityConfig` 读取，或通过 CLI 参数传入。

**Phase 4 验证**：
- `grep -r 'GITNEXUS_UNITY_' gitnexus/src/` 返回零结果（包括 benchmark 目录）
- `.gitnexus/config.json` 中的参数可通过 CLI `--unity-*` 覆盖
- 不设置任何环境变量，所有功能正常工作
- `npm run build` 通过，删除的配置文件无残留导入

---

## Phase 5: 查询时 Verifier 简化

**目标**：移除查询时的启发式/文件 I/O 逻辑，改为检查 analyze 时已物化的 Process。

### 5.1 简化 runtime-chain-verify

- **文件**：`gitnexus/src/mcp/local/runtime-chain-verify.ts`（934 行）
- **移除**：
  - `inspectResourceGuidEvidence`（文件系统 I/O）
  - `chooseBestCallEdge`（regex 启发式）
  - `chooseTopologyCallEdge`（子串连续性判断）
  - `verifyRuleDrivenRuntimeChain` 核心 449 行逻辑
  - 移除对 `runtime-chain-extractors.ts` 中 `fetchAnchoredCallEdges` 的调用（函数定义在 extractors 中，此处移除调用）
- **替换为**：检查 Process 是否包含预期的合成边（`reason STARTS WITH 'unity-rule-'`）
- **保留**：`verifyRuntimeClaimOnDemand` 入口，简化为：加载规则 → 检查图谱 Process → 返回 `RuntimeClaim`

### 5.2 清理 runtime-chain-extractors

- **文件**：`gitnexus/src/mcp/local/runtime-chain-extractors.ts`
- **变更**：`runtime-chain-verify.ts` 简化后，审计该文件的所有导出函数（`fetchAnchoredCallEdges`, `callEdgeKey`, `dedupeCallEdges`, `symbolCandidateFromCallEdgeTarget`）是否仍有调用方。如果全部变为死代码，整体删除该文件。

### 5.3 清理 runtime-chain-evidence

- **文件**：`gitnexus/src/mcp/local/runtime-chain-evidence.ts`
- **变更**：审计 `deriveRuntimeChainEvidenceLevel` 等导出是否仍被使用，移除死代码。

### 5.4 添加 evidence_source 标注

- **文件**：`gitnexus/src/mcp/local/runtime-chain-verify.ts`
- **变更**：`RuntimeChainResult` 添加 `evidence_source: 'analyze_time' | 'query_time'` 字段
- 规则驱动的结果标注为 `analyze_time`

**Phase 5 验证**：
- `gitnexus query "ReloadBase" --runtime-chain-verify on-demand` 返回完整链路
- 查询时不再触发文件系统 I/O
- 预期 `runtime-chain-verify.ts` 从 934 行缩减到 ~200 行
- `runtime-chain-extractors.ts` 和 `runtime-chain-evidence.ts` 中无死代码残留

---

## Phase 6: 移除硬编码系统

**目标**：删除所有项目特化的硬编码逻辑，完成向规则驱动的完全迁移。

### 6.1 清理 unity-lifecycle-synthetic-calls

- **文件**：`gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts`（448 行）
- **移除**：
  - `RUNTIME_LOADER_ANCHORS`（8 个硬编码方法名锚点）
  - `DETERMINISTIC_LOADER_BRIDGES`（7 对硬编码桥接链）
  - 项目特化的路径评分权重
- **保留**：通用 lifecycle 回调检测（`detectUnityLifecycleHosts`）和标准 lifecycle 方法注入
- **预期**：从 448 行缩减到 ~150 行

### 6.2 最终验证

1. 对 neonspark 运行 `gitnexus analyze`（无环境变量），lifecycle + 规则驱动边均注入
2. `gitnexus query "ReloadBase" --runtime-chain-verify on-demand` 链路完整
3. Cypher 验证合成边存在
4. Process 包含 WeaponPowerUp.Equip → ReloadBase.GetValue 完整链路
5. 查询时无文件系统 I/O
6. `grep -r 'RUNTIME_LOADER_ANCHORS\|DETERMINISTIC_LOADER_BRIDGES' gitnexus/src/` 返回零结果

---

## 依赖关系与风险

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
```

- Phase 4 必须在 Phase 5 之前完成：两者都修改 `local-backend.ts`（Phase 4 移除 env var gate，Phase 5 简化 verify 调用），串行避免合并冲突
- Phase 6 依赖 Phase 5 完成

| 风险 | 缓解 |
|------|------|
| Pipeline 重排序导致 UNITY_* 边数据不完整 | Phase 2 对比测试：提前后的输出 vs 原位置输出 |
| 规则覆盖不足导致 Process 链路断裂 | Phase 3 保留硬编码 fallback，Phase 6 才移除 |
| 环境变量移除影响 CI/用户脚本 | Phase 4 添加迁移警告日志，首次检测到旧 env var 时提示 |
| Parity env vars 迁移遗漏 | Phase 4.4 逐一列出 5 个 parity 参数及其所在文件和目标配置键 |
| 删除配置文件导致编译失败 | Phase 4.2 完整列出所有导入方（含 hydrator/hydration/process-confidence） |
| v1/v2 规则格式混淆 | Phase 1.2 明确 family 字段区分，v1 默认归类 verification_rules |

## 预估代码变更量

| Phase | 新增 | 修改 | 删除 | 净变化 |
|-------|------|------|------|--------|
| 1 | ~140 行 | ~60 行 | 0 | +200 |
| 2 | 0 | ~80 行 | ~20 行 | +60 |
| 3 | ~250 行 | ~30 行 | 0 | +280 |
| 4 | ~50 行 | ~150 行 | ~100 行 | 0 |
| 5 | ~50 行 | ~100 行 | ~800 行 | -650 |
| 6 | 0 | ~20 行 | ~300 行 | -280 |
| **总计** | **~490** | **~440** | **~1220** | **-290** |

最终结果：净减少约 290 行代码，同时获得更强的可扩展性和可维护性。
