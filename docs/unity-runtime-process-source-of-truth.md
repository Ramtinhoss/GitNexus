# Unity Runtime Process 真理源（Design × As-Built）

Date: 2026-04-03
Owner: GitNexus
Status: Active (source of truth) — V2 规则驱动架构

## 1. 文档定位

本文用于统一以下两类信息：

1. 设计意图：
   - `docs/plans/2026-04-03-unity-runtime-process-rule-driven-design.md`（V2 规则驱动方案设计）
   - `docs/unity-runtime-process-rule-driven-implementation.md`（V2 技术实现手册）
2. 实际实现（代码与测试）：
   - ingestion / process 生成链路
   - MCP `query/context` 检索链路
   - `runtime_chain_verify=on-demand` 强验证链路

当历史设计文档与当前代码行为冲突时，以"当前代码 + 本文"作为 Unity runtime process 的对外真理源。

## 2. As-Built 架构总览

### 2.1 Analyze 侧（图构建）

Pipeline 执行顺序（`gitnexus/src/core/ingestion/pipeline.ts`）：

```
Phase 1-4:   Scan → Structure → Parse → MRO
Phase 5:     Communities
Phase 5.5:   processUnityResources (UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF 边)
Phase 5.6:   applyUnityLifecycleSyntheticCalls (通用 lifecycle 合成 CALLS)
Phase 5.7:   applyUnityRuntimeBindingRules (规则驱动资源↔代码边界穿越 CALLS)
Phase 6:     processProcesses (沿所有 CALLS 边追踪，生成 Process)
```

1. Unity 资源绑定解析（Phase 5.5）：
   - `processUnityResources`：`pipeline.ts:441`
   - 产出 `UNITY_COMPONENT_INSTANCE`、`UNITY_ASSET_GUID_REF`、`UNITY_RESOURCE_SUMMARY` 边
2. 内置 Lifecycle 注入（Phase 5.6）：
   - 对 Unity 项目自动生效（检测 `Assets/*.cs` 文件）：`pipeline.ts:444`
   - 通用 lifecycle 回调注入（OnEnable/Awake/Start/Update 等）：`unity-lifecycle-synthetic-calls.ts:52-107`
   - 配置从 `resolveUnityConfig()` 读取：`pipeline.ts:445`
3. 规则驱动注入（Phase 5.7）：
   - 加载 `analyze_rules` 族规则：`pipeline.ts:465`
   - 三种绑定处理器：`unity-runtime-binding-rules.ts:119,150,200`
   - 合成边属性：`confidence=0.75`，`reason=unity-rule-{kind}:{ruleId}`
4. Process 生成（Phase 6）：
   - 基于 CALLS tracing，标注 `processSubtype` 和 `runtimeChainConfidence`：`pipeline.ts:490-525`
   - 生命周期 metadata 始终持久化：`pipeline.ts:446`

### 2.2 Query/Context 侧（检索与投影）

1. 直接 process membership：`STEP_IN_PROCESS`。
2. 类符号方法投影：
   - `HAS_METHOD -> STEP_IN_PROCESS` 合并：`local-backend.ts:763-793, 1460-1483`
   - 证据模式合并：`process-evidence.ts:46-114`
3. empty-process + Unity evidence fallback：
   - 触发：`processRows.length===0` 且 `resourceBindings>0` 或 `needsParityRetry`
   - 注入 `resource_heuristic` + low clue
4. 扩展字段始终输出（不再需要 flag）：
   - `runtime_chain_confidence`、`runtime_chain_evidence_level`、`verification_hint`
   - `process-confidence.ts`；`local-backend.ts`

### 2.3 On-Demand 强验证（简化后的规则驱动验证）

1. 显式入口：
   - CLI: `--runtime-chain-verify off|on-demand`
   - MCP schema: `runtime_chain_verify`（`tools.ts`）
   - 请求参数为唯一控制开关，无全局 gate
2. 验证逻辑（`runtime-chain-verify.ts`，297 行）：
   - `verifyRuntimeClaimOnDemand`：加载规则目录 → 加权匹配（`trigger_tokens + host_base_type + resource_types + module_scope`）→ 分发验证
   - `verifyRuleDrivenRuntimeChain`：查询图谱中 `unity-rule-*` 合成边 → 二元结果
   - 无文件系统 I/O、无 regex 启发式、无单跳展开
3. 验证结果：
   - `status: 'verified_full'` + `evidence_source: 'analyze_time'`（图谱中存在匹配的合成边）
   - `status: 'failed'` + `evidence_level: 'none'`（无匹配合成边）
   - `runtime_claim` 统一输出失败分类：`rule_not_matched | rule_matched_but_evidence_missing | rule_matched_but_verification_failed`

### 2.4 Phase 5 Offline Rule Lab（Discover → Analyze → Review → Curate → Promote → Regress）

1. Rule Lab 模块分层（`gitnexus/src/rule-lab/`）：
   - 路径与 run/slice 约定：`paths.ts:32-56`
   - discover → analyze → review-pack → curate → promote → regress
2. 规则族区分：
   - `family: 'analyze_rules'`：索引阶段注入合成边（`loadAnalyzeRules`）
   - `family: 'verification_rules'`：查询阶段验证（`loadRuleRegistry`）
   - v1 规则（无 family 字段）默认归类为 `verification_rules`
3. Runtime verifier 装载闭环：
   - promote 写入 `.gitnexus/rules/catalog.json` + `approved/*.yaml`
   - `verifyRuntimeClaimOnDemand` 通过 `loadRuleRegistry` 读取 repo-local 规则

## 3. 设计与实现对照（阶段）

| 阶段 | 设计目标 | As-Built 结论 | 代码/证据 |
| --- | --- | --- | --- |
| Phase 0 | 基线与指标固化 | 已有报告产物 | `docs/reports/2026-03-31-phase0-*` |
| Phase 1 | Unity summary schema hygiene | 已落地 | `schema.ts:254` |
| Phase 2 | class→method process 投影 | 已落地（query/context 双侧） | `local-backend.ts:763-793, 1460-1483` |
| Phase 3 | lifecycle + loader synthetic CALLS | **V2 重构**：lifecycle 始终启用，loader 改为规则驱动 | `unity-lifecycle-synthetic-calls.ts`；`unity-runtime-binding-rules.ts` |
| Phase 4 | persisted lifecycle process artifact | **V2 变更**：始终持久化 | `pipeline.ts:446,524-525` |
| Phase 5 | confidence + verification_hint 合约 | **V2 变更**：扩展字段始终输出 | `process-confidence.ts`；`local-backend.ts` |
| V1 Reload | on-demand verify + 验收闭环 | **V2 重构**：verifier 简化为图谱查询 | `runtime-chain-verify.ts` (934→297 行) |
| V2 规则驱动 | 规则定义资源↔代码边界穿越 | 已落地 | `unity-runtime-binding-rules.ts`；`unity-config.ts` |

## 4. 对外契约真理源

### 4.1 `query/context` 常驻字段（始终输出）

1. `processes[].evidence_mode`: `direct_step | method_projected | resource_heuristic`
2. `processes[].confidence`: `high | medium | low`
3. `process_symbols[].process_evidence_mode`
4. `process_symbols[].process_confidence`
5. `runtime_chain_confidence`（V2：始终输出，不再需要 flag）
6. `runtime_chain_evidence_level`: `none | clue | verified_segment | verified_chain`
7. `verification_hint`（low confidence 时应可行动）

### 4.2 `runtime_chain` 输出条件

1. 请求显式传 `runtime_chain_verify=on-demand`（唯一开关）
2. 运行时始终通过 `runtime_claim` 统一输出（包括失败分类）
   - 无规则 / 无匹配 → `reason=rule_not_matched`
   - 匹配但证据不足 → `reason=rule_matched_but_evidence_missing`
   - 匹配且验证失败 → `reason=rule_matched_but_verification_failed`
3. 验证结果携带 `evidence_source: 'analyze_time' | 'query_time'`

### 4.3 `process_ref / runtime_claim / evidence policy` 合约

1. `query/context` 的 `processes[]` 返回：
   - `id`（可读 process id；heuristic 情况下为 `derived:*`）
   - `process_ref`：`id`, `kind`, `readable`, `reader_uri`, `origin`
2. 请求 `runtime_chain_verify=on-demand` 时，返回 `runtime_claim`（rule-driven）：
   - `rule_id`, `rule_version`, `scope`
   - `status`, `evidence_level`, `hops`, `gaps`
   - `guarantees`, `non_guarantees`
3. `unity_evidence_mode`: `summary | focused | full`
4. `hydration_policy`: `fast => compact`; `balanced => 按请求`; `strict => parity`
5. `resource_path_prefix` / seed contract：类符号 + 资源路径联合检索为主路径

### 4.4 Phase 5 Offline Rule Lab 合约

1. Rule Lab 六阶段生命周期：discover → analyze → review_pack → curate → promote → regress
2. Artifact 路径：`.gitnexus/rules/lab/runs/<run_id>/...`
3. promote 后即时供 runtime claim verifier 和 analyze pipeline 读取
4. 规则族区分：`analyze_rules`（索引阶段注入）vs `verification_rules`（查询阶段验证）

## 5. 配置方式（V2）

### 5.1 行为控制

V2 移除所有 `GITNEXUS_UNITY_*` 环境变量，行为由自动检测和显式配置控制：

| 行为 | 控制方式 |
| --- | --- |
| Lifecycle 合成边注入 | 对 Unity 项目自动生效（检测 `Assets/*.cs`） |
| 规则驱动边注入 | `.gitnexus/rules/` 下有 `analyze_rules` 规则即生效 |
| Process 元数据持久化 | 始终持久化 |
| 扩展置信度字段输出 | 始终输出 |
| 运行时链路验证 | 请求参数 `runtime_chain_verify=on-demand` 为唯一开关 |

### 5.2 调优参数

通过 `.gitnexus/config.json` 的 `unity` 键配置，CLI 参数可覆盖：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `maxSyntheticEdgesPerClass` | 12 | 每个类最多注入合成边数 |
| `maxSyntheticEdgesTotal` | 256 | 全局合成边上限 |
| `lazyMaxPaths` | 120 | lazy hydration 最大路径数 |
| `lazyBatchSize` | 30 | lazy hydration 批次大小 |
| `lazyMaxMs` | 5000 | lazy hydration 超时 |
| `payloadMode` | `compact` | 资源绑定载荷详略 |
| `parityWarmup` | false | 启动时预热 parity |
| `parityWarmupMaxParallel` | 4 | 预热并发数 |

代码依据：`gitnexus/src/core/config/unity-config.ts:4-18,26-40`

优先级：`CLI 参数 > .gitnexus/config.json > 内置默认值`

## 6. 已确认偏差与边界

1. V2 verifier 为二元结果（`verified_full` / `failed`），不再产出 `verified_partial` / `verified_segment` 中间状态。需要中间状态的场景应通过规则覆盖度提升来解决。
2. 方法投影在 query/context 默认启用，无独立开关。
3. 强验证链路不回写 verified chain 到 Process 持久图（仅请求时计算并返回）。
4. 强验证链路对仓库文件内容与索引状态一致性敏感；若索引 stale，应先 `gitnexus analyze`。
5. 资源锚点优先：seeded 查询（类符号 + 资源路径）是完成运行时链闭环的主路径。无 seed 时返回 gap 而非猜测。

## 7. V2 迁移回写（2026-04-03）

1. **规则基础设施**：`UnityResourceBinding` / `LifecycleOverrides` 类型 + `family` 字段 + `loadAnalyzeRules()` + 统一配置加载器
2. **Pipeline 重排序**：Unity 资源处理从 Phase 7 提前到 Phase 5.5，lifecycle 始终启用，规则驱动注入插入 Phase 5.7
3. **规则驱动注入**：`applyUnityRuntimeBindingRules` 实现三种绑定处理器（`asset_ref_loads_components` / `method_triggers_field_load` / `lifecycle_overrides`）
4. **环境变量清除**：15 个 `GITNEXUS_UNITY_*` env var 全部移除，迁移到 `resolveUnityConfig()` 统一配置
5. **Verifier 简化**：`runtime-chain-verify.ts` 从 934 行缩减到 297 行，移除所有启发式/文件 I/O，改为图谱查询
6. **硬编码移除**：`RUNTIME_LOADER_ANCHORS`（8 锚点）、`DETERMINISTIC_LOADER_BRIDGES`（7 桥接）、项目特化评分全部删除

## 8. Rule Lab 当前边界（2026-04-03 As-Built）

1. `promote.ts` 仍允许从 curated 内容推断 `trigger_family`，但 scope/topology/claims 必须通过 DSL lint。
2. `analyze.ts` 已升级为多候选 topology 输出（含 coverage/conflict/counter-example 统计）。
3. Rule Lab 产物写入 `.gitnexus/rules/**`，受仓库 `.gitignore` 影响（默认忽略 `.gitnexus`）。
4. V2 新增 `analyze_rules` 族规则在索引阶段生效；现有 `verification_rules` 族规则在查询阶段生效。两种规则通过 `family` 字段区分，互不干扰。

## 9. 维护规则

1. 任何 Unity runtime process 行为变更（字段、配置、语义、默认值），必须同步更新本文。
2. 扩展新的 `resource_bindings` kind 时，需在本文补充触发判定、图谱遍历路径、合成边属性。
3. `AGENTS.md` / `CLAUDE.md` 应持续指向本文，作为该领域唯一入口文档。
