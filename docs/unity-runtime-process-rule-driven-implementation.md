# Unity Runtime Process 规则驱动 — 技术实现手册

> 对照设计文档：`docs/plans/2026-04-03-unity-runtime-process-rule-driven-design.md`
> 实现日期：2026-04-03 | 分支：`nantas-dev`
> 变更统计：43 files, +1231 / -1486（净减 255 行）

---

## 1. 设计目标 → 实现对照总表

| 设计文档章节 | 目标 | 实现状态 | 关键文件 |
|---|---|---|---|
| §1 Lifecycle 内置行为 | lifecycle 注入始终启用，移除 env var gate | ✅ 完成 | `pipeline.ts:442-459` |
| §2 规则 Schema | `resource_bindings` + `lifecycle_overrides` 类型 | ✅ 完成 | `types.ts:90-113`, `rule-dsl.schema.json` |
| §3 Pipeline 重排序 | Unity 资源处理提前到 Phase 5.5 | ✅ 完成 | `pipeline.ts:439-474` |
| §4 合成边注入逻辑 | 规则驱动的 CALLS 边注入 | ✅ 完成 | `unity-runtime-binding-rules.ts` (222 行) |
| §5 查询阶段简化 | 移除启发式/文件 I/O | ✅ 完成 | `runtime-chain-verify.ts` (934→297 行) |
| §6 移除环境变量 | 15 个 env var → config file | ✅ 完成 | `unity-config.ts` (73 行) |
| §7 关键文件清单 | 13 个文件变更 | ✅ 全部覆盖 | 见下方详细清单 |
| §8 迁移路径 | 6 阶段渐进迁移 | ✅ 完成 | 3 个 commit |
| §9 验证方案 | 7 项验证 | ⏳ 待 neonspark 实测 | 见第 8 节 |

---

## 2. 规则类型系统（设计 §2）

### 2.1 TypeScript 接口

**文件**：`gitnexus/src/rule-lab/types.ts:90-113`

```typescript
// 资源↔代码边界穿越绑定
interface UnityResourceBinding {
  kind: 'asset_ref_loads_components' | 'method_triggers_field_load';
  ref_field_pattern?: string;       // 匹配 UNITY_ASSET_GUID_REF.fieldName
  target_entry_points?: string[];   // 目标资源上被触发的方法名
  host_class_pattern?: string;      // 持有字段的类名（正则）
  field_name?: string;              // 序列化字段名
  loader_methods?: string[];        // 触发加载的方法名
}

// 生命周期覆盖
interface LifecycleOverrides {
  additional_entry_points?: string[];
  scope?: string;
}

// RuleDslDraft 扩展（可选字段）
resource_bindings?: UnityResourceBinding[];
lifecycle_overrides?: LifecycleOverrides;
```

### 2.2 规则族区分

**文件**：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`

- `RuntimeClaimRule.family?: 'analyze_rules' | 'verification_rules'`
- 无 `family` 字段的 v1 规则默认归类为 `verification_rules`
- `loadAnalyzeRules(repoPath)` 过滤返回 `family === 'analyze_rules'` 的规则
- `catalog.json` 条目支持可选 `family` 字段

### 2.3 JSON Schema

**文件**：`gitnexus/src/rule-lab/schema/rule-dsl.schema.json`

`resource_bindings` 和 `lifecycle_overrides` 作为可选属性添加到 schema 根级 `properties`。

---

## 3. Pipeline 重排序（设计 §3）

**文件**：`gitnexus/src/core/ingestion/pipeline.ts`

### 实际执行顺序

```
Phase 1-4:   Scan → Structure → Parse → MRO          （不变）
Phase 5:     Communities                               （不变）
Phase 5.5:   processUnityResources                     （从原 Phase 7 提前）
Phase 5.6:   applyUnityLifecycleSyntheticCalls         （始终启用，auto-detect Unity）
Phase 5.7:   applyUnityRuntimeBindingRules             （新，规则驱动注入）
Phase 6:     processProcesses                          （不变，自动拾取合成边）
```

### Unity 项目自动检测

```typescript
// pipeline.ts:442
const isUnityProject = unityScopedPaths.some(p =>
  p.includes('/Assets/') && p.endsWith('.cs')
);
```

不再依赖 env var gate，检测到 Unity 项目即执行 lifecycle 注入。

---

## 4. 合成边注入逻辑（设计 §4）

**文件**：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts` (222 行)

### 4.1 入口函数

```typescript
function applyUnityRuntimeBindingRules(
  graph: KnowledgeGraph,
  rules: RuntimeClaimRule[],
  config: UnityConfig,
): UnityRuntimeBindingResult
```

### 4.2 三种绑定处理器

| 处理器 | 输入 | 图谱遍历路径 | 输出边 |
|--------|------|-------------|--------|
| `asset_ref_loads_components` | `ref_field_pattern`, `target_entry_points` | `UNITY_ASSET_GUID_REF` → 目标资源 → `UNITY_COMPONENT_INSTANCE` → Class → `HAS_METHOD` → Method | `unity-runtime-root → Method` |
| `method_triggers_field_load` | `host_class_pattern`, `loader_methods`, `target_entry_points` | Class → `HAS_METHOD` → loader → `UNITY_COMPONENT_INSTANCE` → resource → `UNITY_ASSET_GUID_REF` → target → components → entry methods | `loader Method → target Method` |
| `lifecycle_overrides` | `additional_entry_points`, `scope` | Class (filtered by scope) → `HAS_METHOD` → Method | `unity-runtime-root → Method` |

### 4.3 合成边属性

- `type: 'CALLS'`（不创建新边类型）
- `confidence: 0.75`
- `reason` 格式：
  - `unity-rule-resource-load:{ruleId}`
  - `unity-rule-loader-bridge:{ruleId}`
  - `unity-rule-lifecycle-override:{ruleId}`
- 去重：`existingPairs` Set 防止重复注入
- 自环保护：`sourceId === targetId` 时跳过

### 4.4 Pipeline 接入

```typescript
// pipeline.ts Phase 5.7
const analyzeRules = await loadAnalyzeRules(repoPath);
if (analyzeRules.length > 0) {
  const bindingResult = applyUnityRuntimeBindingRules(graph, analyzeRules, unityConfig.config);
}
```

错误处理：`loadAnalyzeRules` 失败（无 catalog）时静默跳过。

---

## 5. 查询时 Verifier 简化（设计 §5）

**文件**：`gitnexus/src/mcp/local/runtime-chain-verify.ts` (934 → 297 行，-68%)

### 5.1 移除的函数

| 函数 | 原用途 | 行数 |
|------|--------|------|
| `verifyRuleDrivenRuntimeChain` (旧) | 449 行启发式验证核心 | ~449 |
| `inspectResourceGuidEvidence` | 文件系统 I/O 读取 GUID | ~24 |
| `chooseBestCallEdge` | regex 启发式选边 | ~19 |
| `chooseTopologyCallEdge` | 子串连续性判断 | ~21 |
| `scoreResourcePath` / `scoreCallEdgeForTopology` | 路径评分 | ~40 |
| 其他 18 个辅助函数 | 各类启发式 | ~160 |

### 5.2 新的验证逻辑

```typescript
async function verifyRuleDrivenRuntimeChain(input): Promise<RuntimeChainResult> {
  // 按 ruleId 过滤查询 analyze 时注入的合成边
  const rows = await input.executeParameterized(`
    MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(t)
    WHERE r.reason CONTAINS $ruleId
      AND r.reason STARTS WITH 'unity-rule-'
    RETURN s.name, t.name, r.reason ...
    LIMIT 20
  `, { ruleId });

  // 二元结果：verified_full 或 failed
  if (rows.length > 0) return { status: 'verified_full', evidence_source: 'analyze_time', ... };
  return { status: 'failed', evidence_level: 'none', ... };
}
```

### 5.3 新增字段

`RuntimeChainResult.evidence_source?: 'analyze_time' | 'query_time'`

### 5.4 删除的文件

- `runtime-chain-extractors.ts`（104 行）— 所有导出变为死代码

---

## 6. 环境变量迁移（设计 §6）

**文件**：`gitnexus/src/core/config/unity-config.ts` (73 行)

### 6.1 配置接口

```typescript
interface UnityConfig {
  maxSyntheticEdgesPerClass: number;    // default: 12
  maxSyntheticEdgesTotal: number;       // default: 256
  lazyMaxPaths: number;                 // default: 120
  lazyBatchSize: number;                // default: 30
  lazyMaxMs: number;                    // default: 5000
  payloadMode: 'compact' | 'full';     // default: 'compact'
  persistLifecycleProcessMetadata: boolean; // default: true
  parityWarmup: boolean;                // default: false
  parityWarmupMaxParallel: number;      // default: 4
  paritySeedCacheIdleMs: number;        // default: 60000
  paritySeedCacheMaxEntries: number;    // default: 100
  parityCacheMaxEntries: number;        // default: 500
}
```

### 6.2 优先级

```
CLI 参数 > .gitnexus/config.json (unity key) > 内置默认值
```

`ResolvedUnityConfig.configSource` 记录每个参数的实际来源。

### 6.3 环境变量处置清单

| 原环境变量 | 处置 | 迁移目标 |
|-----------|------|---------|
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS` | 删除 | 始终启用 |
| `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST` | 删除 | `persistLifecycleProcessMetadata` |
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_PER_CLASS` | 迁移 | `maxSyntheticEdgesPerClass` |
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_TOTAL` | 迁移 | `maxSyntheticEdgesTotal` |
| `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` | 删除 | 始终输出 |
| `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` | 删除 | 请求参数唯一控制 |
| `GITNEXUS_UNITY_LAZY_MAX_PATHS` | 迁移 | `lazyMaxPaths` |
| `GITNEXUS_UNITY_LAZY_BATCH_SIZE` | 迁移 | `lazyBatchSize` |
| `GITNEXUS_UNITY_LAZY_MAX_MS` | 迁移 | `lazyMaxMs` |
| `GITNEXUS_UNITY_PAYLOAD_MODE` | 迁移 | `payloadMode` |
| `GITNEXUS_UNITY_PARITY_WARMUP` | 迁移 | `parityWarmup` |
| `GITNEXUS_UNITY_PARITY_WARMUP_MAX_PARALLEL` | 迁移 | `parityWarmupMaxParallel` |
| `GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS` | 迁移 | `paritySeedCacheIdleMs` |
| `GITNEXUS_UNITY_PARITY_SEED_CACHE_MAX_ENTRIES` | 迁移 | `paritySeedCacheMaxEntries` |
| `GITNEXUS_UNITY_PARITY_CACHE_MAX_ENTRIES` | 迁移 | `parityCacheMaxEntries` |

### 6.4 删除的配置文件

| 文件 | 原行数 |
|------|--------|
| `unity-lifecycle-config.ts` | 42 |
| `unity-runtime-chain-verify-config.ts` | 7 |
| `unity-process-confidence-config.ts` | 4 |
| `unity-lazy-config.ts` | 13 |

---

## 7. 硬编码系统移除（设计 §1 + §8 Phase 6）

**文件**：`gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts` (448 → 238 行，-47%)

### 7.1 移除的硬编码元素

| 元素 | 内容 | 影响 |
|------|------|------|
| `RUNTIME_LOADER_ANCHORS` | 8 个方法名：`Equip`, `StartRoutineWithEvents`, `StartAttack` 等 | 不再按方法名匹配注入 |
| `DETERMINISTIC_LOADER_BRIDGES` | 7 对桥接：`WeaponPowerUp→GunGraph`, `GunOutput→ReloadBase` 等 | 不再硬编码桥接链 |
| `scoreUnityHost()` | 基于 `NEON/Game/Graph/PowerUps` 路径的评分权重 | 不再按项目路径评分 |
| `scoreRuntimeLoaderMethod()` | 基于 `GunGraphMB/GunGraph.cs` 的评分权重 | 不再按项目路径评分 |

### 7.2 保留的通用逻辑

- `detectUnityLifecycleHosts()` — 通用 lifecycle 回调检测
- `applyUnityLifecycleSyntheticCalls()` — 标准 lifecycle 方法注入（OnEnable, Awake, Start, Update 等）
- `UnityLifecycleSyntheticConfig` / `UnityLifecycleSyntheticResult` 接口
- Host 排序改为按 lifecycle 回调数量（通用指标）

---

## 8. 验证方案对照（设计 §9）

| # | 设计文档验证项 | 验证方法 | 当前状态 |
|---|---|---|---|
| 1 | 无 env var 运行 analyze，lifecycle + 规则边均注入 | `gitnexus analyze` on neonspark（无环境变量） | ⏳ 待 neonspark 实测 |
| 2 | query ReloadBase 链路完整 | `gitnexus query "ReloadBase" --runtime-chain-verify on-demand` | ⏳ 待 neonspark 实测 |
| 3 | Cypher 查询合成边存在 | `MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b) WHERE r.reason STARTS WITH 'unity-rule-' RETURN a.name, b.name, r.reason` | ⏳ 待 neonspark 实测 |
| 4 | Process 包含完整链路 | 检查 Process 是否包含 WeaponPowerUp.Equip → ReloadBase.GetValue | ⏳ 待 neonspark 实测 |
| 5 | 查询时无文件系统 I/O | `inspectResourceGuidEvidence` 已删除，`runtime-chain-extractors.ts` 已删除 | ✅ 代码级确认 |
| 6 | `grep GITNEXUS_UNITY_` 返回零 | `grep -r 'GITNEXUS_UNITY_' gitnexus/src/ --include='*.ts'` = 0 results | ✅ 已验证 |
| 7 | config.json + CLI 覆盖 | `resolveUnityConfig` 实现 3 级优先级 + `configSource` 追踪 | ✅ 代码级确认 |

### 8.1 neonspark 实测前置条件

1. 在 neonspark 仓库 `.gitnexus/rules/approved/` 下创建 v2 analyze_rules YAML：
   ```yaml
   id: unity.weapon-powerup-gungraph.v2
   version: 2.0.0
   family: analyze_rules
   match:
     trigger_tokens: [reload, gungraph]
     host_base_type: [ScriptableObject, MonoBehaviour]
     resource_types: [asset]
   resource_bindings:
     - kind: asset_ref_loads_components
       ref_field_pattern: "gungraph|graph"
       target_entry_points: [OnEnable, Awake]
     - kind: method_triggers_field_load
       host_class_pattern: "PowerUp$"
       field_name: "gungraph"
       loader_methods: [Equip]
   lifecycle_overrides:
     additional_entry_points: [Init, Setup]
     scope: "Assets/NEON/Code/Game/Graph"
   ```
2. 更新 neonspark 的 `.gitnexus/rules/catalog.json` 添加该规则条目（含 `family: analyze_rules`）
3. 运行 `gitnexus analyze`（无需设置任何环境变量）
4. 按验证项 1-4 逐项检查

---

## 9. 文件变更完整清单

### 新建文件（3）

| 文件 | 行数 | 用途 |
|------|------|------|
| `gitnexus/src/core/config/unity-config.ts` | 73 | 统一配置加载器 |
| `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts` | 222 | 规则驱动合成边注入 |
| `docs/plans/2026-04-03-unity-runtime-process-rule-driven-execution-plan.md` | 287 | 执行计划 |

### 删除文件（6）

| 文件 | 原行数 | 原因 |
|------|--------|------|
| `unity-lifecycle-config.ts` | 42 | env var 配置 → `unity-config.ts` |
| `unity-runtime-chain-verify-config.ts` | 7 | env var gate → 请求参数 |
| `unity-process-confidence-config.ts` | 4 | env var gate → 始终输出 |
| `unity-lazy-config.ts` | 13 | env var 配置 → `unity-config.ts` |
| `unity-lazy-config.test.ts` | 10 | 源文件已删除 |
| `runtime-chain-extractors.ts` | 104 | 所有导出变为死代码 |

### 大幅修改文件

| 文件 | 行数变化 | 变更摘要 |
|------|---------|---------|
| `runtime-chain-verify.ts` | 934 → 297 | 移除启发式，改为图谱查询 |
| `unity-lifecycle-synthetic-calls.ts` | 448 → 238 | 移除硬编码锚点/桥接/评分 |
| `pipeline.ts` | 552 → 577 | 重排序 + 规则注入步骤 |
| `local-backend.ts` | -40 行 | 移除 env var gate |
| `tools.ts` | -18 行 | 移除 env var 文档 |

### 测试文件更新（10）

| 文件 | 变更摘要 |
|------|---------|
| `runtime-chain-verify-m2.test.ts` | mock 适配新查询模式 |
| `runtime-chain-verify-equivalence.test.ts` | 期望值适配二元结果 |
| `local-backend-runtime-claim-evidence-gate.test.ts` | mock 适配 + 期望值更新 |
| `local-backend-calltool.test.ts` | 移除 env var gate 测试 |
| `skill-contracts-phase5.test.ts` | 移除已删除 SKILL 术语断言 |
| `unity-lifecycle-synthetic-calls.test.ts` (×2) | 移除 loader 断言 |
| `unity-lifecycle-process-persist.test.ts` | 移除 env var 机制 |
| `unity-lifecycle-synthetic-process-regression.test.ts` | 简化为合成边存在性检查 |
| `unity-parity-seed-loader.test.ts` | 改用 `idleMsOverride` 参数 |

---

## 10. 架构变更前后对比

### Before（硬编码 + 启发式）

```
analyze:  硬编码 8 锚点 + 7 桥接 + 路径评分 → 合成 CALLS 边
          ↓ (仅 neonspark 有效)
query:    regex 启发式 + 单跳展开 + 文件系统 I/O → 弥补缺失边
          ↓ (934 行，效果有限)
result:   verified_partial / verified_segment / verified_full (多种中间状态)
config:   15 个 GITNEXUS_UNITY_* 环境变量控制行为
```

### After（规则驱动 + 图谱查询）

```
analyze:  通用 lifecycle 注入 (始终启用)
        + 规则驱动 resource_bindings 注入 (有规则就注入)
          ↓ (任何 Unity 项目均可配置)
query:    图谱查询 unity-rule-* 合成边 → 直接返回
          ↓ (297 行，无文件 I/O)
result:   verified_full / failed (二元结果，evidence_source 标注来源)
config:   .gitnexus/config.json + CLI 参数 (3 级优先级，来源可观测)
```
