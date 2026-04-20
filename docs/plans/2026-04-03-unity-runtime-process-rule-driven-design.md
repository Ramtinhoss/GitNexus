# Unity Runtime Process 规则驱动方案设计

## Context

当前 analyze 阶段的合成调用边注入完全硬编码（8 个方法名锚点、7 对桥接链、项目特化的路径评分），只适用于 neonspark 的 Reload/GunGraph 场景。查询阶段的 runtime chain verifier 用 regex 启发式、单跳展开、文件系统 I/O 来弥补图谱缺失的边，效果有限。

用户的核心需求：规则应定义**资源↔代码的边界穿越**（哪个资源加载触发哪个代码入口），而非代码到代码的桥接（那些已经在 CALLS 边中）。输入"类符号 + 资源锚点"，检索出完整运行时调用链。

## 链路验证结果（neonspark 实测）

通过 GitNexus 检索 neonspark-core 仓库，验证了用户描述的武器拾取→Reload 链路：

| 链路段 | 图谱可见性 | 证据 |
|--------|-----------|------|
| weapon .asset → WeaponPowerUp 类 | 可见 | UNITY_COMPONENT_INSTANCE 边 |
| weapon .asset → gungraph .asset | 可见 | UNITY_ASSET_GUID_REF (fieldName="gungraph") |
| gungraph .asset → GunOutput/ReloadBase 等节点类 | 可见 | UNITY_COMPONENT_INSTANCE 边 |
| WeaponPowerUp.Equip → 各方法 | 可见 | CALLS 边 |
| GunGraph.StartAttack → OutputAttack → GunOutput.Attack | 完全可见 | CALLS 链 |
| GunOutput.Attack → Reload 节点 GetValue | 大部分可见 | CALLS 边 |
| **WeaponPowerUp.Equip → GunGraph 加载** | **不可见** | 缺少资源→代码边界穿越边 |
| **资源加载 → Node.OnEnable → Init** | **不可见** | 缺少 Unity 生命周期触发边 |

关键发现：图谱中已有丰富的 UNITY_COMPONENT_INSTANCE 和 UNITY_ASSET_GUID_REF 数据，代码侧的 CALLS 链也基本完整。**唯一缺失的是资源↔代码的边界穿越边**——正好是规则应该定义的部分。

## 方案设计

### 1. Lifecycle 内置行为 + 规则扩展

**内置行为**（不需要规则，analyze 时自动执行）：
- 为所有 MonoBehaviour/ScriptableObject 的标准 lifecycle 回调（OnEnable、Awake、Start、Update 等）注入从 `unity-runtime-root` 到回调方法的合成 CALLS 边
- 保留现有 `detectUnityLifecycleHosts` 逻辑，但移除项目特化的评分权重

**规则可覆盖/扩展**：
- 规则可以通过 `lifecycle_overrides` 声明额外的入口方法（如项目自定义的 `Init`、`Setup` 等）
- 规则可以限定 lifecycle 注入的范围（如只对特定 module_scope 下的类注入）

### 2. 规则 Schema

规则定义资源↔代码边界穿越（不定义代码到代码的桥接）：

```yaml
# 规则示例：武器 PowerUp 资源加载 GunGraph 并触发节点初始化
id: unity.weapon-powerup-gungraph.v1
version: 2.0.0
family: analyze_rules

match:
  host_base_type: [ScriptableObject, MonoBehaviour]
  resource_types: [asset]
  module_scope: [Assets/NEON/Code/Game]  # 可选，限定范围

resource_bindings:
  # 类型 A：资源 GUID 引用链触发目标资源上组件的生命周期回调
  - kind: asset_ref_loads_components
    ref_field_pattern: "gungraph|graph"   # 匹配 UNITY_ASSET_GUID_REF.fieldName
    target_entry_points: [OnEnable, Awake] # 被触发的生命周期方法（扩展内置 lifecycle）

  # 类型 B：类的特定方法触发其序列化字段引用的资源加载
  - kind: method_triggers_field_load
    host_class_pattern: "PowerUp$"        # 持有字段的类名模式（正则）
    field_name: "gungraph"                # 序列化字段名
    loader_methods: [Equip]               # 触发加载的方法

# 可选：覆盖/扩展内置 lifecycle 行为
lifecycle_overrides:
  additional_entry_points: [Init, Setup]  # 项目特有的入口方法
  scope: "Assets/NEON/Code/Game/Graph"    # 只对此范围生效
```

TypeScript 接口：

```typescript
interface UnityResourceBinding {
  kind: 'asset_ref_loads_components' | 'method_triggers_field_load';
  // asset_ref_loads_components:
  ref_field_pattern?: string;       // 匹配 UNITY_ASSET_GUID_REF.fieldName
  target_entry_points?: string[];   // 目标资源上被触发的方法名
  // method_triggers_field_load:
  host_class_pattern?: string;      // 持有字段的类名（正则）
  field_name?: string;              // 序列化字段名
  loader_methods?: string[];        // 触发加载的方法名
}

interface LifecycleOverrides {
  additional_entry_points?: string[];  // 额外的入口方法名
  scope?: string;                      // 生效范围（路径前缀）
}
```

### 3. Pipeline 重排序

核心问题：合成边需要在 Phase 6（Process 生成）之前注入，但 UNITY_* 边在 Phase 7 才创建。

解决方案：将 Unity 资源处理提前到 Phase 5.5。这是安全的——`processUnityResources` 只依赖 Class 节点（Phase 3 已有）和文件系统，不依赖 Community 或 Process。

```
当前顺序：
  Phase 5:   Communities
  Phase 5.5: applyUnityLifecycleSyntheticCalls (硬编码) ← 拆分
  Phase 6:   Process 生成
  Phase 7:   processUnityResources ← 提前

新顺序：
  Phase 5:   Communities
  Phase 5.5: processUnityResources (提前，创建 UNITY_* 边)
  Phase 5.6: applyUnityLifecycleSyntheticCalls (精简，只保留通用 lifecycle 注入，移除硬编码锚点/桥接/评分)
  Phase 5.7: applyUnityRuntimeBindingRules (新，读规则 + UNITY_* 边，注入资源↔代码边界穿越边)
             - 如果规则有 lifecycle_overrides，在此阶段追加额外的 lifecycle 入口边
  Phase 6:   Process 生成 (不变，自动拾取所有合成 CALLS 边)
```

### 4. 合成边注入逻辑

新文件：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`

对每条规则的每个 `resource_binding`：

**`asset_ref_loads_components`**：
1. 查图谱所有 `UNITY_ASSET_GUID_REF` 边，筛选 `fieldName` 匹配 `ref_field_pattern` 的
2. 对每条匹配的引用边，找到目标资源文件
3. 查图谱该资源文件的 `UNITY_COMPONENT_INSTANCE` 反向边，找到挂载的 Class 节点
4. 对每个 Class，通过 `HAS_METHOD` 找到 `target_entry_points` 中的方法
5. 注入合成 CALLS 边：`资源加载锚点 → 入口方法`，reason=`unity-rule-resource-load:{ruleId}`

**`method_triggers_field_load`**：
1. 查图谱匹配 `host_class_pattern` 的 Class 节点
2. 通过 `HAS_METHOD` 找到 `loader_methods` 中的方法
3. 查该 Class 的 `UNITY_COMPONENT_INSTANCE` 边，解析 serializedFields 找到 `field_name` 对应的 GUID
4. 沿 `UNITY_ASSET_GUID_REF` 找到目标资源
5. 找目标资源上的组件类的入口方法
6. 注入合成 CALLS 边：`loader 方法 → 目标入口方法`，reason=`unity-rule-loader-bridge:{ruleId}`

不创建新边类型——全部用带标注的 CALLS 边，confidence=0.75。Process 生成器已经能处理 confidence >= 0.5 的 CALLS 边。

### 5. 查询阶段简化

规则驱动 analyze 后，以下查询时逻辑可移除/简化：

| 当前查询时逻辑 | 处置 |
|---|---|
| `inspectResourceGuidEvidence` (文件系统 I/O) | 移除——GUID 关系已在图谱中 |
| `chooseBestCallEdge` regex 启发式 | 移除——边已在图谱中，无需猜测 |
| `fetchAnchoredCallEdges` 单跳展开 + 40 边上限 | 移除——完整链路已物化为 Process |
| `chooseTopologyCallEdge` 子串连续性判断 | 移除——边有精确节点 ID |
| `verifyRuleDrivenRuntimeChain` 449 行核心逻辑 | 简化为：检查 Process 是否包含预期的合成边 |

`verifyRuntimeClaimOnDemand` 保留但简化：加载规则 → 检查图谱中是否存在匹配的 Process → 返回 RuntimeClaim。

### 6. 移除隐式环境变量，改为显式配置

当前系统有 10 个 `GITNEXUS_UNITY_*` 环境变量控制行为，使用方式隐蔽，容易在测试验证中遗漏导致结果失真。V2 方案将它们全部移除，改为显式的配置文件和 CLI 参数。

#### 6.1 需要移除的环境变量

| 环境变量 | 当前默认 | 当前作用 | V2 处置 |
|---------|---------|---------|--------|
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS` | off | 是否注入 lifecycle 合成边 | **移除**——lifecycle 注入改为内置默认行为，始终对 Unity 项目生效 |
| `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST` | off | 是否持久化 Process 子类型/置信度 | **移除**——Process 元数据始终持久化 |
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_PER_CLASS` | 12 | 每个类最多注入多少合成边 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.maxSyntheticEdgesPerClass` |
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_TOTAL` | 256 | 全局合成边上限 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.maxSyntheticEdgesTotal` |
| `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` | off | 是否输出 runtime_chain_* 扩展字段 | **移除**——扩展字段始终输出 |
| `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` | on | 全局 gate，关闭后禁用强验证 | **移除**——`runtime_chain_verify` 请求参数即为唯一开关 |
| `GITNEXUS_UNITY_LAZY_MAX_PATHS` | 120 | lazy hydration 最大路径数 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.lazyMaxPaths` |
| `GITNEXUS_UNITY_LAZY_BATCH_SIZE` | 30 | lazy hydration 批次大小 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.lazyBatchSize` |
| `GITNEXUS_UNITY_LAZY_MAX_MS` | 5000 | lazy hydration 超时 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.lazyMaxMs` |
| `GITNEXUS_UNITY_PAYLOAD_MODE` | compact | 资源绑定载荷详略 | **移入配置文件**——`.gitnexus/config.json` 的 `unity.payloadMode` |

#### 6.2 新的配置方式

**行为开关**：不再需要。V2 中：
- Lifecycle 注入对 Unity 项目始终生效（通过检测项目中是否存在 `.meta` 文件自动判断）
- 规则驱动注入由 `.gitnexus/rules/` 目录下是否存在 `analyze_rules` 规则决定——有规则就注入，无规则就跳过
- Process 元数据和扩展字段始终持久化和输出
- `runtime_chain_verify` 保留为请求参数（`off` / `on-demand`），不再有全局 gate 拦截

**调优参数**：移入 `.gitnexus/config.json`，可通过 CLI 覆盖：

```jsonc
// .gitnexus/config.json
{
  "unity": {
    "maxSyntheticEdgesPerClass": 12,
    "maxSyntheticEdgesTotal": 256,
    "lazyMaxPaths": 120,
    "lazyBatchSize": 30,
    "lazyMaxMs": 5000,
    "payloadMode": "compact"   // "compact" | "full"
  }
}
```

CLI 覆盖示例：
```bash
gitnexus analyze --unity-max-synthetic-edges 512
gitnexus query "ReloadBase" --unity-payload-mode full
```

#### 6.3 配置加载优先级

```
CLI 参数 > .gitnexus/config.json > 内置默认值
```

不再读取环境变量。配置来源可观测——analyze 和 query 的输出中包含 `configSource` 字段标注每个参数的实际来源。

#### 6.4 需要删除的配置文件

| 文件 | 处置 |
|------|------|
| `gitnexus/src/core/ingestion/unity-lifecycle-config.ts` | 删除——逻辑合并到配置加载器 |
| `gitnexus/src/mcp/local/unity-runtime-chain-verify-config.ts` | 删除——全局 gate 移除 |
| `gitnexus/src/mcp/local/unity-process-confidence-config.ts` | 删除——扩展字段始终输出 |
| `gitnexus/src/mcp/local/unity-lazy-config.ts` | 删除——参数移入配置加载器 |

### 7. 关键文件清单

| 文件 | 变更 |
|------|------|
| `gitnexus/src/core/ingestion/pipeline.ts` | 重排序：Unity 资源处理提前，插入规则驱动注入步骤；移除 env var 读取 |
| `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts` | 新建：规则驱动的合成边注入 |
| `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts` | 精简：保留 lifecycle 回调检测，移除硬编码锚点/桥接/评分，改为始终启用 |
| `gitnexus/src/core/ingestion/unity-lifecycle-config.ts` | 删除：env var 配置改为 `.gitnexus/config.json` |
| `gitnexus/src/mcp/local/unity-runtime-chain-verify-config.ts` | 删除：全局 gate 移除 |
| `gitnexus/src/mcp/local/unity-process-confidence-config.ts` | 删除：扩展字段始终输出 |
| `gitnexus/src/mcp/local/unity-lazy-config.ts` | 删除：参数移入配置加载器 |
| `gitnexus/src/rule-lab/types.ts` | 扩展：添加 `UnityResourceBinding` 类型 |
| `gitnexus/src/mcp/local/runtime-chain-verify.ts` | 简化：移除启发式/文件 I/O/单跳展开 |
| `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts` | 扩展：支持 `resource_bindings` 解析 |
| `gitnexus/src/mcp/local/local-backend.ts` | 移除 env var gate 逻辑，扩展字段始终输出 |
| `gitnexus/src/mcp/tools.ts` | 保留 `runtime_chain_verify` 请求参数，移除全局 gate 文档 |
| `gitnexus/src/cli/index.ts` | 添加 `--unity-*` CLI 参数覆盖配置 |

### 8. 迁移路径

1. **Phase 1**：添加规则基础设施（`resource_bindings` 类型、规则加载）+ 新建 `.gitnexus/config.json` 配置加载器
2. **Phase 2**：pipeline 重排序（Unity 资源处理提前），lifecycle 注入改为始终启用，硬编码系统作为 fallback 保留
3. **Phase 3**：为 neonspark 编写 analyze_rules，验证生成的 Process 质量
4. **Phase 4**：移除所有 `GITNEXUS_UNITY_*` 环境变量及其配置文件，扩展字段始终输出，全局 gate 移除
5. **Phase 5**：简化查询时 verifier，添加 `evidence_source: 'analyze_time'` 标注
6. **Phase 6**：移除硬编码系统（`RUNTIME_LOADER_ANCHORS`、`DETERMINISTIC_LOADER_BRIDGES`、项目特化评分）

### 9. 验证方案

1. 对 neonspark 仓库运行 `gitnexus analyze`（无需设置任何环境变量），验证 lifecycle 合成边和规则驱动边均已注入
2. 用 `gitnexus query "ReloadBase" --runtime-chain-verify on-demand` 验证链路完整性（无需全局 gate 环境变量）
3. 用 Cypher 查询验证合成边：`MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b) WHERE r.reason STARTS WITH 'unity-rule-' RETURN a.name, b.name, r.reason`
4. 对比 Process 生成结果：新方案的 Process 应包含从 WeaponPowerUp.Equip 到 ReloadBase.GetValue 的完整链路
5. 验证查询时不再触发文件系统 I/O（无 `inspectResourceGuidEvidence` 调用）
6. 验证 `grep -r 'GITNEXUS_UNITY_' gitnexus/src/` 返回零结果，确认所有环境变量已移除
7. 验证 `.gitnexus/config.json` 中的调优参数可通过 CLI `--unity-*` 参数覆盖
