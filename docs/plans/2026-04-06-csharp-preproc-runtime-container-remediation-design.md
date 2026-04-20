# C# 预处理归一化与 Runtime 容器扩展修复设计

日期：2026-04-06
关联分析：
- `docs/reports/2026-04-06-neonspark-tree-sitter-error-classification-gitnexus-remediation.md`
- `docs/reports/2026-04-06-neonspark-tree-sitter-error-classification-upstream-brief.md`

## 1. 问题与目标

当前 Neonspark 审计中 `root_has_error` 主要受 C# 条件编译块（`#if/#elif/#else/#endif`）影响。GitNexus 在 ingestion 中直接 parse 原始源码，导致分支拼接后的语法噪声进入 tree-sitter，进而影响 `DEFINES/HAS_METHOD/CALLS` 质量。

本设计目标：
1. 在 analyze 期间对 C# 文件执行“单一编译画像”归一化再解析，显著降低 `root_has_error`。
2. 修正 `missing_class_with_methods` 口径偏差，提升诊断信噪比。
3. 将 runtime binding 的 class 匹配能力扩展到 class-like 容器（受配置开关保护）。

## 2. 已确认约束

1. **define 来源策略（已确认）**
- Unity 项目：从用户传入的 `Assembly-CSharp.csproj`（或指定 csproj）读取 `DefineConstants`。
- 其他 C# 项目：由 `gitnexus-cli` skill 工作流指导定位“最可能 csproj”，CLI 本身只接收路径参数。

2. **交付节奏（已确认）**
- 按 `A → B → C` 分阶段：
  - A: 预处理归一化
  - B: 诊断分类修正
  - C: runtime 容器扩展

3. **Unity runtime process 真理源约束**
- 规则注入行为需与 `docs/unity-runtime-process-source-of-truth.md` 一致，特别是 Phase 5.7 规则驱动注入契约。

## 3. 方案总览

### A. C# 条件编译归一化（P0）

核心思路：新增 C# 预处理归一化模块，在 parse 前按 `DefineConstants` 折叠分支，仅保留一个激活分支；未激活分支以“保留换行”的占位内容替换，确保行号稳定。

设计要点：
1. 新模块 `csharp-preproc-normalizer`：
- 输入：原始 C# 文本 + define 集合。
- 输出：`normalizedText` + `meta`（是否使用归一化、是否回退）。
2. 解析策略：
- 首先 parse `normalizedText`。
- 如异常可按策略回退 parse 原文，并记录 fallback 诊断。
3. 接入路径：
- 串行 parsing 路径。
- worker parse 路径（避免两条链路行为不一致）。

### B. 分类口径修正（P1）

核心思路：将 `missing_class_with_methods` 改为 container-aware 主口径。

设计要点：
1. 新主口径：`missing_container_with_methods`。
2. `container_counts` 输出至少含：`class/interface/struct/record/delegate/enum`。
3. `missing_class_with_methods` 保留兼容，但作为次级标签。
4. 增加 `is_false_positive_likely` 以便审计聚焦真实风险。

### C. Runtime 容器扩展（P1）

核心思路：`applyUnityRuntimeBindingRules` 的 class 索引从仅 `Class` 扩展为可配置 class-like 容器。

设计要点：
1. 新配置：`unity.enableContainerNodes`（默认 `false`）。
2. 开关开启时纳入 `Class/Struct/Interface/Record`。
3. 作用域：`method_triggers_method` 与 `lifecycle_overrides` 扫描池。
4. 兼容性：默认行为保持不变。

## 4. 可行性结论

1. 建议 2 可行，且收益最大；但必须统一串行 + worker 解析路径，否则会出现结果分叉。
2. 建议 3 可行且风险低，属于诊断层优化。
3. 建议 4 可行，但必须引入默认关闭开关，以防规则过匹配。

## 5. 验收预期（修复后）

1. `root_has_error`：在相同 neonspark scope 下较 2026-04-06 基线明显下降。
2. 分类信噪比：`missing_*_with_methods` 总量下降，且与 `root_has_error` 交集占比上升。
3. runtime 规则：
- `enableContainerNodes=false`：现有命中不回归。
- `enableContainerNodes=true`：struct/interface 场景新增可解释命中。

## 6. 风险与回滚

1. 宏语义偏差风险：单一编译画像可能与真实构建配置不完全一致。
- 缓解：define 来源固定为 csproj `DefineConstants`，并输出运行时诊断。
2. 容器扩展过匹配风险：
- 缓解：默认关闭 + 单测覆盖 + 规则证据输出核验。
3. 实施复杂度风险（多入口 parse）：
- 缓解：统一封装 parse 前处理逻辑，避免散点复制。

## 7. 文档与工作流同步要求

本改动涉及 CLI 参数与行为，必须同步更新：
1. `gitnexus/skills/gitnexus-cli.md`（源 skill）
2. `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`（安装侧 skill）
3. `AGENTS.md` 中 CLI setup/skill 映射相关段落（如有行为说明变更）

