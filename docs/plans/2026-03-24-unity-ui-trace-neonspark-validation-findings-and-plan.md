# Unity UI Trace Neonspark 实仓问题与行动计划（2026-03-24）

## 1. 背景与目标

本文记录 `unity_ui_trace` 在 neonspark 实仓验证中的问题表现，并给出下一步修复计划。

- 功能范围：`asset_refs | template_refs | selector_bindings`
- 约束：V1 仍为 query-time 模式（不做 DB schema migration，不写入新 relation）
- 验证对象：`/Volumes/Shuttle/unity-projects/neonspark`
- 验证 CLI：`/Users/nantasmac/projects/agentic/GitNexus/gitnexus/dist/cli/index.js`（由当前源码编译）

## 2. 验证前置与执行概况

### 2.1 前置状态

- 初始 `status` 显示 stale：
  - Indexed commit: `2ffe84a`
  - Current commit: `1c8896f`
- 已按要求重建索引：
  - `gitnexus analyze /Volumes/Shuttle/unity-projects/neonspark`
- 重建后 `status`：up-to-date（Indexed commit = Current commit = `1c8896f`）

### 2.2 核心实测结果

1. `asset_refs`（target: `Assets/NEON/VeewoUI/Uxml/Shell/Views/EliteBossScreenNew.uxml`）
- 返回 `results=[]`
- 诊断：`ambiguous`
- candidates:
  - `Assets/NEON/VeewoUI/Uxml/Shell/Views/EliteBossScreenNew.uxml`
  - `Assets/NEON/VeewoUI/Uxml/BarScreen/Boss/EliteBossScreen.uxml`

2. `template_refs`（target: `Assets/NEON/VeewoUI/Uxml/Shell/Views/DressUpScreenNew.uxml`）
- 返回 `results=[]`
- 诊断：`ambiguous`
- candidates:
  - `Assets/NEON/VeewoUI/Uxml/Shell/Views/DressUpScreenNew.uxml`
  - `Assets/NEON/VeewoUI/Uxml/BarScreen/DressUp/DressupScreen.uxml`

3. `selector_bindings`（target: `PatchItemPreview` / `EliteBoss`）
- 返回 `results=[]`
- 诊断：`not_found`

4. 稳定性问题
- 对部分 `asset_refs` 查询，默认堆内存出现 OOM。
- 设置 `NODE_OPTIONS='--max-old-space-size=8192'` 后可运行，但结果仍多为 `not_found`。

## 3. 发现的问题（按优先级）

## P0-1: 路径 target 仍触发名称归一化扩展匹配，导致误报 ambiguous

**现象**
- 即使传入完整 `.uxml` 路径，也会匹配到“同根名旧屏幕”，触发 unique-result gate。

**影响**
- 实仓上大量新旧并存场景无法返回结果。

**建议修复**
- 如果 `target` 是存在的 `.uxml` 路径，直接作为唯一候选，不再扩展 basename 归一化匹配。

## P0-2: `template_refs` 解析对命名空间标签兼容不足

**现象**
- neonspark 中大量模板写法为 `<ui:Template ...>`。
- 当前解析链对 `template_refs` 命中不足（返回 not_found/ambiguous）。

**影响**
- `template_refs` 在真实 UXML 项目中覆盖不完整。

**建议修复**
- 解析器支持 `Template` 与 `ui:Template`（Style 同理）。

## P0-3: `asset_refs` 全量扫描内存压力高，且多行 YAML 引用易漏检

**现象**
- 大仓中运行 `asset_refs` 容易 OOM。
- 实仓中存在已知 GUID 引用（如 `PatchItemPreview`）但 trace 返回 not_found。
- 怀疑原因之一：YAML 引用跨行（`guid` 与 `}` 不在同一行），当前行级正则漏匹配。

**影响**
- `asset_refs` 实仓可用性与稳定性不足。

**建议修复**
- 从“全量文件扫描”改为“GUID 反查候选文件后定向扫描”。
- 扫描器改流式 + 多行对象块聚合匹配，避免单行正则假设。

## P1-1: `selector_bindings` 目标绑定策略过严

**现象**
- 当前强依赖“目标名与 C# 文件名 canonical 对齐”。
- 实仓中常见配置类、包装类、旧新命名并存，导致 not_found。

**影响**
- `selector_bindings` 命中率偏低。

**建议修复**
- 当 target 为 UXML 路径时，优先沿 prefab/asset `m_Script` 反向找 C#。
- 文件名对齐作为 fallback，而非 primary gate。

## 4. 下一步行动计划

### Batch A（必须先做，P0）

1. 修 `target` 路径唯一化规则（避免路径 target 误判 ambiguous）
2. 扩展 `uxml-ref-parser` 支持 `ui:Template/ui:Style`
3. 重构 `asset_refs` 扫描：
   - GUID 先筛候选文件
   - 流式扫描
   - 多行 YAML 引用匹配

### Batch B（命中率增强，P1）

4. 放宽 `selector_bindings` 入口策略（UXML->资源->脚本链）
5. 补充 neonspark 风格回归测试样本

## 5. 验收标准（修复后）

1. 实仓验证必须满足：
- `template_refs`：对 `CoreScreen.uxml` 等含 `<ui:Template>` 文件返回非空结果，且每个 hop 有 `path+line`
- `asset_refs`：对已知 GUID 被 prefab/asset 引用的 UXML（如 `PatchItemPreview.uxml`）返回非空结果
- `selector_bindings`：至少 1 个实仓目标返回非空结果

2. 稳定性要求：
- 默认 Node 内存配置下，不得因单次 trace OOM

3. 诊断一致性：
- 仅在确实多候选时返回 `ambiguous`
- `not_found` 需可由人工 grep 复核（不存在可追溯链）

## 6. 建议执行顺序

- 先完成 Batch A 并做一次 neonspark 复测。
- 若三类目标仍存在系统性 not_found，再进入 Batch B。

## 7. 执行结果更新（2026-03-24）

### 7.1 已完成项

1. `P0-1` 路径 target 唯一化
- 当 target 为存在的 `.uxml` 路径时，直接唯一命中，不再扩展 basename 归一化候选。

2. `P0-2` `ui:Template/ui:Style` 兼容
- `uxml-ref-parser` 已支持命名空间写法，`template_refs` 命中恢复。

3. `P0-3` `asset_refs` 稳定性与漏检
- 扫描器已改为流式读取，避免全量读入内存。
- 支持按目标 GUID 定向候选文件筛选。
- 支持多行 YAML 对象块聚合匹配（跨行 `guid` 场景）。

4. `P1-1` `selector_bindings` 策略放宽
- target 为 UXML 路径时，优先走 `UXML -> prefab/asset -> m_Script -> C#`。
- 文件名 canonical 对齐保留为 fallback。

5. `selector_bindings` 命中质量增强
- 复合 USS 选择器 token 匹配（例如 `.isLock .patchPreview-icon` 可匹配 `AddToClassList(\"isLock\")`）。
- 增加结果 `score` 与 `confidence(high|medium|low)`。
- 新增 `selector_mode` 开关：
  - `balanced`（默认）：高召回（token 匹配）
  - `strict`：高精度（仅 `.className` 精确选择器）

6. 回归测试与 CI smoke
- 新增/扩展 Unity UI Trace 相关回归测试。
- CI 新增 `test:unity-ui-trace:smoke`，覆盖 `asset_refs/template_refs/selector_bindings` 最小闭环。

### 7.2 实仓复测结果（neonspark）

- `asset_refs`：`PatchItemPreview` 返回非空（2 条）。
- `template_refs`：`CoreScreen.uxml` 返回非空（多条，每 hop 含 `path+line`）。
- `selector_bindings`：`PatchItemPreview.uxml` 返回非空（3 条，含 `score/confidence`）。

抽样回归（20 targets）报告：
- `docs/reports/2026-03-24-unity-ui-trace-neonspark-sample-regression.md`
- `docs/reports/2026-03-24-unity-ui-trace-neonspark-sample-regression.json`

### 7.3 当前剩余风险

1. `balanced` 模式在复杂页面上可能引入次要噪声结果（已通过排序和 `confidence` 缓解，但未完全消除）。
2. `asset_refs/selector_bindings` 在大型仓上单次查询耗时仍较高（稳定性已改善，但性能仍有优化空间）。

### 7.4 下一步（建议）

1. 引入可选阈值过滤（例如 `min_score` 或 `confidence>=medium`）进一步降噪。
2. 对 `asset_refs` 引入轻量缓存（GUID -> candidate files）降低重复查询延迟。
3. 将 neonspark 抽样基线纳入周期性回归任务，持续跟踪命中率与误报率变化。
