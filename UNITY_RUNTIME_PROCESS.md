# GitNexus Unity 运行时调用链检索 — 架构与实现说明

> 对外契约与最终语义以 [docs/unity-runtime-process-source-of-truth.md](docs/unity-runtime-process-source-of-truth.md) 为准。
> 本文为可读性优先的架构说明，已按 2026-04-08 graph-only runtime closure 行为同步。
> 工作流落地文档参见 [UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md](UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md)。

## 一、这个功能解决什么问题？

Unity 游戏项目中，一个 C# 脚本在运行时被调用的完整链路往往跨越"资源层"和"代码层"。以一把武器的换弹（Reload）为例：

```
玩家拾取武器 → 武器配置资源(.asset) → 加载 GunGraph 资源 → 初始化节点脚本
→ 玩家射击 → GunOutput.Attack → 一系列节点 GetValue → Reload 节点执行
```

传统的静态代码分析只能看到代码之间的调用关系（`A.foo()` 调用 `B.bar()`），但看不到：
- 哪个资源文件触发了哪段代码的执行
- Unity 引擎隐式调用的生命周期方法（`OnEnable`、`Awake` 等）
- 资源之间通过 GUID 引用形成的加载链

**运行时调用链检索**就是为了把这些隐式关联补全，让完整链路可见、可查询。

预期使用方式：用户提供一个 C# 类名（如 `ReloadBase`）+ 一个资源文件路径（如 `Assets/.../1_weapon_orb_key.asset`），系统返回从资源到代码的完整调用链路。

## 二、核心设计理念

核心洞察：**图谱中已有丰富的资源绑定数据和代码调用数据，唯一缺失的是资源↔代码的边界穿越边。**

通过对 neonspark 仓库的实际检索验证：

| 数据类型 | 图谱中是否已有 | 示例 |
|---------|-------------|------|
| 类→资源文件的挂载关系 | 已有 | WeaponPowerUp → weapon .asset |
| 资源→资源的 GUID 引用 | 已有 | weapon .asset → gungraph .asset（fieldName="gungraph"） |
| 代码→代码的调用关系 | 已有 | GunGraph.StartAttack → OutputAttack → GunOutput.Attack |
| **资源加载触发代码执行** | **缺失** | weapon .asset 加载 → GunGraph.OnEnable |
| **代码方法触发资源加载** | **缺失** | WeaponPowerUp.Equip → 加载 gungraph 字段引用的资源 |

因此，Phase 5.6 内置 lifecycle 检测的职责很明确：**自动发现资源↔代码的边界穿越关系**，不定义代码到代码的桥接（那些已经在 CALLS 边中了）。

## 三、整体架构

```

┌──────────────────────────────────────────────────────────────┐
│  索引阶段：Analyze（图构建）                                   │
│  "检测资源绑定和生命周期，在图谱中补全资源↔代码的边界穿越边"                    │
│                                                              │
│  ① 解析资源绑定 → UNITY_COMPONENT_INSTANCE / GUID_REF 边     │
│  ② 内置 lifecycle 注入 → OnEnable/Awake/Start 等合成 CALLS   │
│  ④ Process 生成 → 自动拾取所有 CALLS 边，生成完整执行流程       │
└──────────────────────────────────────────────────────────────┘
                         ↓ 图谱数据（完整链路已物化）
┌──────────────────────────────────────────────────────────────┐
│  查询阶段：Query / Context                                    │
│  "直接从图谱返回完整的运行时调用链"                               │
│                                                              │
│  输入：类符号 + 资源锚点                                       │
│  输出：包含资源→代码边界穿越的完整 Process 链路                   │
│  无需启发式补偿、无需文件系统 I/O、无需逐跳展开                   │
└──────────────────────────────────────────────────────────────┘
```

与 V1 的关键区别：**资源↔代码的边界穿越在索引阶段通过内置 lifecycle 检测自动物化**为图谱中的 CALLS 边。查询阶段直接读取完整链路，不再需要实时验证和启发式补偿。

## 四、索引阶段 — "在图谱中补全完整链路"

索引阶段分为四个子步骤，按顺序执行：

### 步骤 ①：解析资源绑定

系统扫描 Unity 项目中的所有资源文件（`.prefab`、`.asset`、`.unity`），解析它们与 C# 脚本之间的关系，写入图谱：

| 关系类型 | 含义 | 比喻 |
|---------|------|------|
| `UNITY_COMPONENT_INSTANCE` | 脚本 A 被挂载在资源 B 上 | "这个脚本被配置在这个资源文件里" |
| `UNITY_ASSET_GUID_REF` | 资源 A 的某个字段引用了资源 B | "这个配置文件的 gungraph 字段指向另一个资源" |

这些关系是后续 lifecycle 合成边注入的数据基础。

### 步骤 ②：内置 Lifecycle 注入

Unity 引擎会自动调用 MonoBehaviour/ScriptableObject 上的生命周期方法，但代码里没有显式调用。系统自动为这些方法注入合成调用边：

```
unity-runtime-root → OnEnable
unity-runtime-root → Awake
unity-runtime-root → Start
unity-runtime-root → Update
...
```

这是**内置行为**，不需要规则定义，对所有 Unity 项目自动生效。

### 步骤 ③：Process 生成

系统沿所有 CALLS 边（包括代码解析的、内置 lifecycle 的）追踪调用链，生成 Process（执行流程）。每个 Process 是一条从入口到终点的完整调用路径。

由于步骤 ② 已经补全了资源↔代码的边界穿越边，Process 生成器能自动拾取这些边，生成**跨越资源层和代码层的完整链路**。

## 五、查询阶段 — "直接返回完整链路"

当用户通过 `query()` 或 `context()` 查询一个 Unity 类时：

1. **Process 匹配**：查找该符号参与的 Process，直接返回完整链路
2. **方法投影**：如果类本身不在 Process 中，但它的方法在，则投影到类上
3. **资源锚点过滤**：如果用户提供了资源路径，用它从多个候选 Process 中筛选出正确的那条

每个 Process 结果携带：

| 字段 | 含义 |
|------|------|
| `evidence_mode` | `direct_step`（直接参与）/ `method_projected`（方法投影） |
| `confidence` | `high` / `medium` / `low` |
| `runtime_chain_confidence` | 运行时链路置信度（始终输出） |
| `runtime_chain_evidence_level` | `none` / `clue` / `verified_segment` / `verified_chain`（始终输出） |

### On-Demand 强验证

请求时传 `runtime_chain_verify=on-demand`，系统会：
1. 使用结构化锚点（`symbolName/resourceSeedPath/mappedSeedTargets/resourceBindings`）提取图谱候选边
2. 按 Anchor/Bind/Bridge/Runtime 四段证据评估闭环，不做 query-time rule/token 匹配
3. 仅当四段同时满足时返回 `verified_full`；否则返回 `failed`（证据级别可为 `none/clue/verified_segment`）
4. `query/context` 对外结果为 `policy-adjusted`：当 `hydration_policy=strict` 且 `hydrationMeta.fallbackToCompact=true` 时，可降级为 `verified_partial/verified_segment`
5. 如果命中 strict fallback 降级，必须执行 parity rerun 后再做 closure 结论
6. `runtime_claim.rule_id` 使用兼容标识 `graph-only.runtime-closure.v1`，表示 query-time verifier 为 graph-only 模式

不再需要全局 gate 环境变量，请求参数为唯一控制开关。

### 与 V1 的查询体验对比

| 维度 | V1（查询时验证） | V2（索引时物化） |
|------|----------------|----------------|
| 完整链路 | 需要逐跳展开，受限于单跳展开和 40 边上限 | 直接从 Process 返回完整链路 |
| 资源→代码边界 | 查询时读文件系统验证 GUID | 已在图谱中，无文件 I/O |
| 代码段匹配 | 用 regex 启发式猜测 loader/runtime 方法 | 边已在图谱中，精确匹配 |
| 响应速度 | 需要多次 Cypher 查询 + 文件读取 | 单次图谱查询 |

## 六、具体示例：武器拾取→Reload 的完整链路

以 neonspark 项目为例，用户输入：
- 类符号：`ReloadBase`
- 资源锚点：`Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset`

系统返回的完整链路：

```
1_weapon_orb_key.asset (WeaponPowerUp 配置)
  │
  ├─[UNITY_ASSET_GUID_REF, field="gungraph"]
  │  → Gungraph_use/1_weapon_orb_key.asset (GunGraph 资源)
  │      │
  │      ├─[UNITY_COMPONENT_INSTANCE] → GunOutput 类
  │      ├─[UNITY_COMPONENT_INSTANCE] → ReloadBase 子类
  │      └─[UNITY_COMPONENT_INSTANCE] → 其他节点类
  │
  ├─[lifecycle 合成 CALLS] WeaponPowerUp.Equip → GunOutput.OnEnable
  │                                          ↓ [代码 CALLS]
  │                                        Node.Init
  │
  └─[代码 CALLS 链]
     GunGraph.StartAttack → AttackRoutine → OutputAttack
       → GunOutput.Attack → ... → ReloadBase.GetValue
```

其中：
- 灰色部分（UNITY_* 边）：步骤 ① 解析资源绑定时已建立
- 蓝色部分（lifecycle 合成 CALLS）：步骤 ② 内置 lifecycle 注入
- 绿色部分（代码 CALLS）：代码解析阶段已建立

Process 生成器将这些边串联成一条完整的执行流程。

## 七、Pipeline 执行顺序

```
  Phase 1-4: 代码解析（Class/Method/Function 节点，CALLS/IMPORTS 边）
  Phase 5:   社区检测（Community 节点，MEMBER_OF 边）
  Phase 5.5: 资源绑定解析（UNITY_COMPONENT_INSTANCE, UNITY_ASSET_GUID_REF 边）
  Phase 5.6: 内置 Lifecycle 注入（通用 lifecycle 合成 CALLS 边）
  Phase 6:   Process 生成（沿所有 CALLS 边追踪，生成完整执行流程）
```

关键设计：资源绑定解析（Phase 5.5）必须在 Lifecycle 注入（Phase 5.6）之前，因为 Lifecycle 注入需要读取 UNITY_COMPONENT_INSTANCE 边来定位 MonoBehaviour 宿主。

## 八、配置方式

V2 方案移除了所有隐式的环境变量开关，改为显式的配置文件和 CLI 参数。

### 行为控制

不再需要手动开启任何开关：

| 行为 | V1（环境变量） | V2（自动/显式） |
|------|-------------|---------------|
| Lifecycle 合成边注入 | 需设置 `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on` | 对 Unity 项目自动生效 |
| Process 元数据持久化 | 需设置 `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on` | 按 Unity resource-binding flow 条件持久化（Unity 自动检测命中 `Assets/*.cs`） |
| 扩展置信度字段输出 | 需设置 `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on` | 始终输出 |
| 运行时链路验证 | 需确保 `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` 未关闭 | 请求参数 `runtime_chain_verify=on-demand` 即为唯一开关 |

### 调优参数

通过 `.gitnexus/config.json` 配置，可用 CLI 参数覆盖：

```jsonc
{
  "unity": {
    "maxSyntheticEdgesPerClass": 12,  // 每个类最多注入多少合成边
    "maxSyntheticEdgesTotal": 256,    // 全局合成边上限
    "lazyMaxPaths": 120,              // lazy hydration 最大路径数
    "lazyBatchSize": 30,              // lazy hydration 批次大小
    "lazyMaxMs": 5000,                // lazy hydration 超时(ms)
    "payloadMode": "compact"          // 资源绑定载荷详略："compact" | "full"
  }
}
```

配置加载优先级：`CLI 参数 > .gitnexus/config.json > 内置默认值`

## 九、关键设计决策

| 决策 | 原因 |
|------|------|
| 边界穿越通过内置 lifecycle 检测 | 资源↔代码的边界穿越由 Phase 5.6 自动检测 lifecycle 方法，不需要手动规则 |
| 不创建新边类型 | 全部用带标注的 CALLS 边，Process 生成器自动拾取 |
| 资源锚点优先 | "类名 + 资源路径"联合查询是定位正确链路的主路径 |
| 歧义时返回 gap 而非猜测 | 宁可告诉用户"这里不确定"，也不给错误答案 |

## 十、数据流全景图

```
Unity 项目文件系统
  │
  ├── .cs 脚本 ──→ Class/Method 节点 + CALLS 边
  ├── .meta 文件 ──→ GUID 映射
  ├── .prefab/.asset ──→ UNITY_COMPONENT_INSTANCE + UNITY_ASSET_GUID_REF 边
  ┌──────────────────────────────────────────────┐
  │            gitnexus analyze                   │
  │                                              │
  │  代码 CALLS ─┐                               │
  │  lifecycle ──┘──→ 合成 CALLS 边 ──→ Process  │
                               │
  └──────────────────────────────────────────────┘
         │
    知识图谱（完整链路已物化）
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │  query / context                              │
  │                                              │
  │  输入：ReloadBase + 1_weapon_orb_key.asset    │
  │  输出：WeaponPowerUp.Equip                    │
  │        → [lifecycle] GunOutput.OnEnable        │
  │        → Node.Init                            │
  │        → GunGraph.StartAttack                 │
  │        → ... → ReloadBase.GetValue            │
  └──────────────────────────────────────────────┘
```

## 十一、实现状态（2026-04-08）

| 模块 | 状态 | 关键文件 |
|------|------|---------|
| 统一配置加载器 | ✅ 已实现 | `core/config/unity-config.ts`（`resolveUnityConfig`） |
| Verifier 简化 | ✅ 已实现 | `runtime-chain-verify.ts`（934→297 行） |
| 硬编码移除 | ✅ 已实现 | `unity-lifecycle-synthetic-calls.ts`（448→238 行） |
| 环境变量清除 | ✅ 已实现 | 15 个 `GITNEXUS_UNITY_*` 全部移除 |
| neonspark（na2）实测 | ✅ 已验证 | graph-only 路径下 `runtime_claim.rule_id=graph-only.runtime-closure.v1`，WeaponPowerUp 链路可达 `verified_full` |

SSOT 文档：`docs/unity-runtime-process-source-of-truth.md`
