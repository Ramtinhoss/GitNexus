# Prefab Source Scan-Context Refactor Design

Date: 2026-04-10  
Status: Draft accepted in discussion

## 1. 背景与问题

`PrefabInstance.m_SourcePrefab` 的资源边补齐已经落地，但当前实现把该能力放在 `processUnityResources` 内的独立资源遍历 pass。  
在 neonharness 固定 case 中，打开 prefab-source 后 RSS 峰值显著增长（`+3.96 GiB`）。

关键现象：

1. 增长量与新增边数不成比例（边数仅 `+56,651`）。
2. 增长量与 scoped `.unity/.prefab` 资源体量同量级。
3. 当前 pass 会对 scoped `.unity/.prefab` 做整文件读取与对象解析，且会写入 `resourceDocCache`。

结论：问题核心不是“边数量”，而是“新增能力没有复用 scan-context 的流式筛选主线，导致重型读取路径扩大到全量资源”。

## 2. 目标

把 prefab-source 从“独立重型 pass”重构为“scan-context 同次流式扫描产物”，并由 `processUnityResources` 统一消费。

具体目标：

1. 主线 C（prefab-source）并入主线 A（scan-context）。
2. scan-context 明确定义为“可挂载更多资源字段识别需求”的承载器。
3. `processUnityResources` 成为 scan-context 产物的统一消费点（统一写图、统一去重、统一 diagnostics）。
4. 保持现有 graph 契约不变（仍使用 `UNITY_ASSET_GUID_REF` 表达 `scene/prefab -> prefab`）。

## 3. 非目标

1. 不改 query-time runtime verification 逻辑。
2. 不改 Rule Lab family 与 schema。
3. 不把 scan-context 扩展为“全字段全语义解析器”。
4. 不在本次引入 per-instance override 真值模型。

## 4. As-Is 与 To-Be

### 4.1 As-Is（当前）

1. scan-context（主线 A）流式扫描资源，只抓 `m_Script.guid` 命中线索。
2. resolver（主线 B）按命中范围做深解析，提取组件绑定与字段引用。
3. prefab-source（主线 C）在 `processUnityResources` 内单独遍历 `.unity/.prefab`，整文件读取后解析 `PrefabInstance.m_SourcePrefab`。

### 4.2 To-Be（目标）

1. scan-context 在一次资源扫描中并行产出：
   - `scriptGuidHits`（现有）
   - `prefabSourceHits`（新增，仅 `m_SourcePrefab`）
2. `processUnityResources` 只消费 scan-context 产物：
   - 组件线索走 resolver（主线 B）
   - prefab-source 线索直接写 `UNITY_ASSET_GUID_REF`
3. 删除/下线 `processUnityResources` 内“独立 prefab-source 全量解析 pass”。

## 5. 架构设计

### 5.1 Scan-Context 承载器（核心）

`UnityScanContext` 从“脚本命中缓存集合”升级为“资源线索承载器（resource signal carrier）”：

1. 维持现有字段（symbol/script/guid/resource 命中映射）。
2. 增加 prefab-source 线索集合（建议命名示例：`prefabSourceRefs`）。
3. prefab-source 线索记录采用轻量结构，不携带 YAML 全对象。

建议记录字段：

- `sourceResourcePath`
- `targetGuid`
- `targetResourcePath`（如果可解析）
- `fileId`
- `fieldName`（固定 `m_SourcePrefab`）
- `sourceLayer`（`scene | prefab`）

### 5.2 字段识别挂载机制（可扩展）

在 scan-context 资源扫描层引入“字段识别挂载点”，把新能力定义为“识别器（recognizer）”而不是“新 pass”：

1. 默认识别器：
   - script-guid 识别器（现有）
   - prefab-source 识别器（新增）
2. 识别器只做“线索提取”，不做重型语义求值。
3. 后续新增资源字段需求时，按同一机制挂载识别器，避免孤立另起炉灶。

### 5.3 统一消费点

统一消费点固定在 `processUnityResources`：

1. 消费 scan-context 的 `scriptGuidHits` 驱动 resolver 深解析。
2. 消费 scan-context 的 `prefabSourceRefs` 写入 `UNITY_ASSET_GUID_REF`。
3. 统一执行 dedupe、diagnostics、payload reason 构造。

这保证“产物入口一致、写图语义一致、观测口一致”。

## 6. 数据契约与边语义

边类型保持不变：`UNITY_ASSET_GUID_REF`。

reason 结构保持同族：

```json
{
  "resourcePath": "<scene-or-prefab>",
  "targetResourcePath": "<prefab>",
  "guid": "<guid>",
  "fileId": "<fileId>",
  "fieldName": "m_SourcePrefab",
  "sourceLayer": "scene|prefab"
}
```

去重策略保持资源级：

- source resource
- target resource
- `fieldName`
- guid

## 7. 性能与内存策略

### 7.1 原则

1. 线索提取优先流式读取。
2. scan-context 不缓存大文件对象块。
3. 深解析只在 resolver 命中路径发生。

### 7.2 预期收益

1. 去掉 prefab-source 的独立全量对象解析峰值。
2. 让内存曲线回归“扫描轻、解析重但有命中门槛”的两段式结构。
3. 新增字段需求可复用同一承载器，不重复引入全量 pass。

## 8. 兼容性与风险

### 8.1 兼容性

1. 图谱关系类型不变。
2. query/context 检索契约不变。
3. Rule Lab 与 runtime closure 不受影响。

### 8.2 风险

1. 轻解析器对异常 YAML 片段的鲁棒性。
2. 与现有 script-guid 扫描共享一趟读取时的实现复杂度上升。
3. 需要补齐统计与测试，避免“功能正确但内存退化”再次发生。

## 9. 验收标准

1. 功能正确性：
   - `scene -> prefab` 与 `prefab -> prefab` 边仍完整产出。
2. 构建资源占用：
   - 在 neonharness 固定 case 中，RSS 明显低于当前 prefab-source 独立 pass 版本。
3. 架构一致性：
   - 新增资源字段识别需求无需再创建独立重型 pass。
4. 文档一致性：
   - `UNITY_RESOURCE_BINDING.md` 与 SSOT 同步说明“scan-context 承载器 + processUnityResources 统一消费”。

## 10. 文档回写要求

本设计对应三份文档同步：

1. `docs/plans/2026-04-10-prefab-source-scan-context-refactor-design.md`（本文）
2. `UNITY_RESOURCE_BINDING.md`
   - 补充 As-Built 主线说明
   - 增加“scan-context 可扩展承载器 + 统一消费点”的演进方向
3. `docs/unity-runtime-process-source-of-truth.md`
   - 明确 scan-context 在 Analyze 侧的定位
   - 明确统一消费点在 `processUnityResources`
   - 对未落地部分标注为 design direction，避免混淆 As-Built
