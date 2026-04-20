# gitnexus.unity_ui_trace 在 UI 背景语义排查任务中的表现总结（NeonNew）

## 1. 背景与任务类型
本次问题属于 **UIToolkit 重构后与 legacy 页面视觉语义不一致** 的排查：
- 页面背景图缺失：`SystemScreenNew`、`OnlineHomePageView`、`ModeSelectScreenNew`
- `BarShell` Core group 下页面背景色与 legacy 不一致

该类任务的关键难点不是“资源是否被引用”，而是“运行时谁在生效、样式语义是否对齐 legacy”。

## 2. 实测方式与证据（unity_ui_trace / asset_refs）
在本次排查中，`unity_ui_trace` 主要用于静态引用链确认（`goal=asset_refs`）。

### 2.1 `SystemScreenNew.uxml`
发现被以下 prefab 引用：
- `Assets/NEON/Prefab/UI/GlobalShell_Embedded.prefab:290`
- `Assets/NEON/Prefab/UI/MainScreenShell_Embedded.prefab:353`

### 2.2 `OnlineHomePageNew.uxml`
发现被以下 prefab 引用：
- `Assets/NEON/Prefab/UI/GlobalShell_Embedded.prefab:240`
- `Assets/NEON/Prefab/UI/MainScreenShell_Embedded.prefab:303`

### 2.3 `ModeSelectScreenNew.uxml`
发现被以下 prefab 引用：
- `Assets/NEON/Prefab/UI/GlobalShell_Embedded.prefab:340`
- `Assets/NEON/Prefab/UI/MainScreenShell_Embedded.prefab:403`

### 2.4 `BarShell.uxml`
发现被以下 prefab 引用：
- `Assets/NEON/Prefab/UI/BarShell_Embedded.prefab:851`
- `Assets/NEON/Prefab/UI/GlobalShell_Embedded.prefab:108`

> 输出包含证据链（路径/行号/片段），可直接用于“引用存在性”审计。

## 3. 工具表现（优点）

1. 对“静态资源引用是否存在”的确认效率很高。
2. 证据链可读性好，适合快速形成可复核结论（尤其是跨 prefab 引用）。
3. 能快速暴露“多壳层并存引用”现象（如同一 UXML 同时挂到 `GlobalShell_Embedded` 与 `MainScreenShell_Embedded`），有助于后续缩小排查范围。
4. 对大仓库中的 Unity UI 资源关联查询，信噪比优于纯文本 grep。

## 4. 在本任务中暴露的问题与边界

1. `asset_refs` 只回答“谁引用了谁”，不回答“运行时谁在生效”。
2. 无法直接判断页面背景图缺失的真实原因：
   - 是 class 没挂上
   - 还是 class 被覆盖
   - 或运行时逻辑切换了容器/样式
3. 对“视觉语义一致性”缺乏直接表达能力：
   - 无法比较 legacy 与新页面在背景语义（图层、色板、优先级）上的等价关系
4. 对多引用结果缺少“活跃路径优先级”输出：
   - 结果展示多个 prefab 命中，但不会提示当前场景/路由下的主生效链
5. 对 USS 级联最终态不可见：
   - 看不到 runtime effective style（最终背景图/颜色是否命中）

## 5. 对这类任务的正确使用姿势

`unity_ui_trace` 适合做 **第一阶段证据确认**，不适合作为根因结论工具。建议固定为两段式流程：

1. **静态定位阶段（unity_ui_trace）**
   - 用 `asset_refs` 快速确认 UXML/Prefab 关联是否断链
   - 识别多壳层复用与潜在路由冲突点
2. **语义验证阶段（graph + source + runtime）**
   - 用 `cypher/context` 追踪 Screen/Shell 绑定与样式注入路径
   - 读 UXML/USS + C# 生命周期逻辑
   - 必要时补 runtime 证据（实际 class 列表、最终背景样式）

## 6. 改进建议（面向 GitNexus 工具能力）

1. 在 `asset_refs` 结果中增加“候选活跃路径评分”（按路由/屏幕绑定关系排序）。
2. 增加 `style_effective` 类目标：输出某元素在给定页面上下文下的最终背景图与颜色来源（规则链）。
3. 增加 legacy 对齐检查模式：输入“新页面 + legacy 页面”，输出背景语义差异清单（缺图、色值偏差、优先级变化）。
4. 对多 prefab 命中结果增加聚合视图：按 shell 分组展示，降低人工比对成本。

## 7. 结论
在“UIToolkit 重构后背景图/背景色与 legacy 不一致”的任务里，`gitnexus.unity_ui_trace` 的定位是：
- **强项**：快速、可信地确认静态引用链。
- **短板**：无法独立完成运行时视觉语义根因判断。

因此，它应被定义为“证据入口工具”，必须与 `cypher/context + 源码阅读 + 运行时样式验证` 联合使用，才能得到可落地的最终诊断。
