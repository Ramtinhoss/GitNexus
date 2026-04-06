# Neonspark Tree-sitter Error Classification（GitNexus 侧问题分析与修复建议）

- 日期: 2026-04-06
- 关联上游简报: `docs/reports/2026-04-06-neonspark-tree-sitter-error-classification-upstream-brief.md`
- 适用范围: GitNexus 源码仓库（ingestion / runtime rules / diagnostics 分类）
- 聚焦建议: **2 / 3 / 4**

---

## 1. 问题摘要（GitNexus 视角）

当前 `root_has_error` 的高占比样本与 `#if/#else/#endif` 强相关。GitNexus 直接将原始 C# 源码送入 tree-sitter，未做条件编译归一化，导致大量“跨分支拼接语句”在 AST 上形成 `ERROR` 或 `MISSING`，继而影响符号归属与下游规则命中。

同时，`missing_class_with_methods` 诊断口径偏窄（仅看 `class_declaration`），把 interface/struct 主导文件误判为“缺失 class”。

另外，运行时桥接规则仅建立 `Class` 索引，导致 class-like 容器（Struct/Interface/Record）的方法无法参与 `method_triggers_method` 匹配。

---

## 2. 建议 2：Ingestion 前增加条件编译归一化（稳态方案）

### 2.1 成因

- 入口解析调用为 `parseContent(file.content)`：
  - `gitnexus/src/core/tree-sitter/parser-loader.ts`
  - `gitnexus/src/core/ingestion/parsing-processor.ts`
- 当前无预处理折叠逻辑，`#if` 分支直接进入 parser。

### 2.2 修复建议

在 GitNexus 增加 **C# 预处理归一化层**（建议模块：`gitnexus/src/core/tree-sitter/csharp-preproc-normalizer.ts`）：

1. 扫描并折叠 `#if/#elif/#else/#endif` 块（按 define profile 保留单一路径）。
2. 保持行号映射（source map），用于 diagnostics 回溯原文件。
3. 解析策略改为：
   - 先 parse normalized 内容；
   - 若失败且策略允许，回退 parse 原文并记录 `parse-fallback-used`。

### 2.3 验收标准

- `root_has_error` 显著下降（重点样本：`LocalPlayerInput.cs`、`Stat.cs`、`StudioEventEmitter.cs`）。
- 核心符号数量（Class/Method）不低于 baseline。
- 新增 diagnostics 可区分：`preproc-normalized` / `preproc-fallback`。

---

## 3. 建议 3：修正 `missing_class_with_methods` 分类口径

### 3.1 成因

现有审计定义（见 `docs/neonspark-tree-sitter-parallel-audit-plan.md`）使用：
`class_declaration = 0 && method_declaration > 0`。
该规则忽略 `interface_declaration`、`struct_declaration`、`record_declaration`，导致高误报。

### 3.2 修复建议

将分类规则改为 container-aware：

- `missing_container_with_methods`（新）:
  - `class/interface/struct/record/delegate/enum` 全为 0 且 `method_declaration > 0`
- `missing_class_with_methods`（保留兼容）:
  - 降级为子类标签，不再作为主告警。
- 输出字段建议新增：
  - `container_counts`
  - `is_false_positive_likely`

### 3.3 验收标准

- interface-heavy 样本（如 `rail_game_server.cs`）不再进入高风险告警桶。
- 告警总量下降且与 `root_has_error` 交集占比上升（更聚焦真实解析质量问题）。

---

## 4. 建议 4：扩展运行时规则索引到 class-like 容器

### 4.1 成因

`applyUnityRuntimeBindingRules` 当前只收集 `node.label === 'Class'`：
- `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`

但 `HAS_METHOD` 的 owner 可能来自其他容器类型（见 `CLASS_CONTAINER_TYPES`）：
- `gitnexus/src/core/ingestion/utils.ts`

### 4.2 修复建议

1. 将 `classNodes` 扩展为 `containerNodes`，标签集合至少包含：
   - `Class`, `Struct`, `Interface`, `Record`
2. `method_triggers_method` 的 class pattern 匹配改为对 container 统一执行。
3. 为避免回归，默认保持仅 `Class`，通过配置开关启用扩展：
   - `unityRuntimeRules.enableContainerNodes=true`

### 4.3 验收标准

- 不影响现有 `Class` 规则命中率。
- 在 struct/interface 场景新增可解释命中（含 rule id 与 source/target method 证据）。

---

## 5. 实施优先级与风险

1. **P0: 建议 2（预处理归一化）**
   - 直接降低 `root_has_error`，收益最大。
2. **P1: 建议 3（分类口径修正）**
   - 立刻减少误报，提升诊断信噪比。
3. **P1: 建议 4（容器扩展）**
   - 提高规则鲁棒性，减少图谱盲区。

主要风险：
- 归一化策略与真实编译宏不一致，可能改变 AST 形态。
- 容器扩展可能带来过匹配，需要新增规则侧约束与回归测试。

建议先在 neonspark scope 做 A/B 回放，再全仓默认开启。

---

## 6. 复验结论（2026-04-06 二次审计）

复验基于本地已修复源码重新执行，覆盖单测/集成测试、`analyze` 实仓回放、tree-sitter 审计重跑与分类复判。

### 6.1 建议 2（C# 预处理归一化）结论

状态：**通过（显著改善）**

- neonspark `analyze`（带 `--csharp-define-csproj /Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`）成功。
- runtime 摘要输出：
  - `CSharp Preproc: defines=165, normalized=1370, fallback=2, skipped=6606, exprErrors=874`
- 全量 `.cs`（8070 文件）对比：
  - raw `root_has_error`: **161**
  - normalized+fallback 最终 `root_has_error`: **5**
- 重点样本：
  - `Assets/NEON/Code/Game/Input/LocalPlayerInput.cs`: `true -> false`
  - `Packages/com.veewo.stat/Runtime/Stat.cs`: `true -> false`
  - `Assets/Plugins/FMOD/src/StudioEventEmitter.cs`: `true -> false`

证据：

- `.gitnexus/reports/tree-sitter-audit/ts-audit-20260406092647-recheck/preproc-effect-summary.json`
- `.gitnexus/reports/tree-sitter-audit/ts-audit-20260406092647-recheck/sample-raw-vs-normalized.json`

### 6.2 建议 3（container-aware 分类口径）结论

状态：**通过**

- 复跑审计得到历史口径原始计数：
  - `parse_throw=0`, `root_has_error=161`, `missing_class_with_methods=176`
- 使用新分类器复判后：
  - `missing_container_with_methods=0`
  - `missing_class_with_methods=176` 仅作为 `compatibility_tags`
  - `falsePositiveLikely=173`
- interface-heavy 样本 `Assets/Plugins/WeGameSDK/rail_game_server.cs`：
  - `classified_error_type=ok`
  - `compatibility_tags=["missing_class_with_methods"]`

证据：

- `.gitnexus/reports/tree-sitter-audit/ts-audit-20260406092647-recheck/classification.json`

### 6.3 建议 4（runtime 容器扩展）结论

状态：**通过**

- `unity.enableContainerNodes` 默认值为 `false`（保持基线）。
- `applyUnityRuntimeBindingRules` 已按开关扩展容器集合：
  - off: `Class`
  - on: `Class|Struct|Interface|Record`
- 回归测试通过：
  - `enableContainerNodes=false` 不注入新增边
  - `enableContainerNodes=true` 命中 struct/interface 并注入 `unity-rule-method-bridge:*`

证据：

- `gitnexus/src/core/config/unity-config.ts`
- `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
- `gitnexus/test/unit/unity-runtime-binding-rules.test.ts`

结论汇总：

- 建议 2：**已解决（剩余 5 个文件，见下一节）**
- 建议 3：**已解决**
- 建议 4：**已解决**

---

## 7. 剩余 5 个 `root_has_error` 文件分析

剩余文件列表（normalized+fallback 后）：

1. `Assets/Plugins/Sirenix/Odin Inspector/Modules/Unity.Addressables/Validators/AssetLabelReferenceValidator.cs`
2. `Assets/Plugins/Mirror/Runtime/NetworkReader.cs`
3. `Assets/Plugins/Mirror/Runtime/NetworkWriter.cs`
4. `Assets/NEON/Code/Framework/InGameConsole_ScriptRegister.cs`
5. `Assets/GameAnalytics/Plugins/Scripts/Setup/Settings.cs`

分析产物：

- `.gitnexus/reports/tree-sitter-audit/ts-audit-20260406092647-recheck/remaining-error-analysis.json`

### 7.1 文件级结论

1) Sirenix `AssetLabelReferenceValidator.cs`
- normalized 后仍报错，错误锚点集中在：
  - `required = true;`
  - `required = requiredAttr != null;`
- 判断：更像是 grammar 在该上下文对标识符/表达式恢复失败（非 preproc 分支拼接问题）。

2) Mirror `NetworkReader.cs`
- 主要锚点在 unsafe 泛型指针表达式：
  - `value = *(T*)ptr;`
- 判断：属于 `unsafe + pointer cast + generic T` 语法形态兼容性问题（非 preproc 主因）。

3) Mirror `NetworkWriter.cs`
- 主要锚点：
  - `*(T*)ptr = value;`
- 判断：同上，属于 tree-sitter-c-sharp 对该类 unsafe 写法的解析盲点。

4) `InGameConsole_ScriptRegister.cs`
- preproc 归一化后，原先 `#if/#endif` 相关错误已消失，仅剩：
  - `var msg = $"";`
- 判断：主问题已由 preproc 修复收敛，剩余为单点语法解析问题（疑似 grammar 对空插值字符串恢复不稳）。

5) GameAnalytics `Settings.cs`
- 锚点为类型体中的孤立分号：
  - `;`（两处）
- raw 中曾出现平台枚举列表错误，但 normalized 后已消失。
- 判断：剩余问题与 empty declaration（孤立分号）处理相关，非 preproc 主因。

### 7.2 风险与建议

- 风险面：5/8070（约 0.06%），且 4/5 位于第三方插件目录（Sirenix/Mirror/GameAnalytics）。
- 对 GitNexus runtime/process 的当前影响：相较修复前已显著收敛，不再是系统性 preproc 失败。

建议：

1. 对第三方插件路径维持“低优先级已知解析噪声”策略，避免阻塞主链路验收。
2. 为 `unsafe pointer cast` 与 `empty declaration` 追加最小复现语料到 grammar 回归测试集。
3. 在后续 tree-sitter-c-sharp 升级窗口，优先验证这 5 个文件是否自然消失。
