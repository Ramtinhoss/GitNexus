# Partial Class Unity Enrich 方案设计

## 背景与问题

在 `neonspark-u2-full-e2e-20260310-030343` 中，`PlayerActor` 失败并非资源缺失，而是两层问题叠加：

1. 检索层：`context(on)` 对 `PlayerActor` 返回 `ambiguous`，benchmark 未做消歧。
2. 索引层：Unity enrich 的 `scan-context` 仅保留 `paths.size===1` 的 `symbol -> scriptPath`，partial class（`PlayerActor`/`NetPlayer`）被过滤，导致未写入 `UNITY_COMPONENT_INSTANCE`。

当前重复类名规模：`285` 个重复类名，共 `861` 个重复 class 节点；Top 例子：`PlayerActor(38)`、`NetPlayer(36)`。

## Partial Class 使用情景分型

1. Unity 可挂载 partial class：通常一个主文件（如 `PlayerActor.cs`）+ 多个分片（`PlayerActor.*.cs`），资源绑定应归属于“主脚本 guid”。
2. 非挂载 partial class（UI/Generated）：如 `*.Generated.cs` + 手写文件组合，通常不要求 Unity 资源绑定。
3. 同名非 partial 冲突：不同目录/类型（Class/Property/Folder）同名，检索需优先 class 且支持 file hint。

## 候选方案

### 方案 A：仅修 benchmark 消歧（短平快）

- 修复 `PlayerActor` 场景配置（`context` 参数 `query -> name`，补 `contextFileHint`）。
- retrieval runner 遇到 `ambiguous` 自动二次尝试 `file_path`/`uid`。

优点：改动小、见效快。  
缺点：不解决 enrich 侧 partial class 丢边问题。

### 方案 B：canonical script + benchmark 消歧（推荐）

- 在 `scan-context` 为重复 symbol 选出 canonical 脚本，而不是整体丢弃。
- enrich 以 canonical script 对应 guid 进行资源命中和关系写入。
- benchmark 同步做消歧兜底，保证场景稳定。

优点：同时修复根因与验证链路；改动可控。  
缺点：需要设计可解释的 canonical 选择规则与诊断输出。

### 方案 C：引入“逻辑类型实体”（长期）

- 图谱新增 logical type 层，将 partial class 文件聚合为一个类型实体后再做资源挂接。

优点：语义最完整。  
缺点：涉及 schema/查询语义升级，成本高，不适合本轮优先级。

## 推荐设计（B，分两阶段）

### 阶段 1：可靠性止血（benchmark）

1. `PlayerActor` 场景配置修正：
   - deep-dive context 用 `name` 字段。
   - 增加 `contextFileHint: Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs`。
2. retrieval runner 增加消歧策略：
   - `context(name)` 若 ambiguous，优先 `file_path=contextFileHint` 重试。
   - 无 hint 时从候选中优先 `kind=Class` 且 `basename == <symbol>.cs`。

### 阶段 2：partial class canonical 映射（enrich）

1. `scan-context` 维护 `symbol -> scriptPath[]` 候选集合。
2. 为每个 symbol 计算 canonical scriptPath（规则顺序）：
   - 精确文件名匹配：`<symbol>.cs`；
   - 排除明显分片：`*.Generated.cs`/`*.<suffix>.cs`（可配置）；
   - 资源命中数最高（根据 guidToResourceHits）；
   - 最后按路径稳定排序。
3. `processUnityResources` 预过滤不再“重复即跳过”，改为“有 canonical 即继续”。
4. 图谱写入约束：仅对 `filePath == canonicalScriptPath` 的 class 节点写 `UNITY_COMPONENT_INSTANCE`，避免 partial 片段节点重复放大同一绑定。
5. 输出诊断新增：
   - `canonical-map: selected/ambiguous/fallback` 计数；
   - 关键样本（PlayerActor/NetPlayer）选路日志（限量）。

## 成功标准

1. `PlayerActor` 在 E2E 中 `context(on)` 返回非空 `resourceBindings`。
2. `NetPlayer`、`PlayerActor` 均可在 `context --uid --unity-resources on` 获取资源绑定。
3. analyze diagnostics 中 `missing scanContext script mapping` 显著下降。
4. 新增回归测试覆盖：重复 symbol + partial class + scenario 消歧。

## 非目标

1. 本轮不改图谱 schema。
2. 本轮不引入跨语言/跨程序集类型归并。
