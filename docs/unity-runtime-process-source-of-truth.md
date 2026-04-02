# Unity Runtime Process 真理源（Design × As-Built）

Date: 2026-04-02  
Owner: GitNexus  
Status: Active (source of truth)

## 1. 文档定位

本文用于统一以下两类信息：

1. 设计意图：
   - `docs/2026-03-31-unity-runtime-process-phased-design.md`
   - `docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md`
2. 实际实现（代码与测试）：
   - ingestion / process 生成链路
   - MCP `query/context` 检索链路
   - `runtime_chain_verify=on-demand` 强验证链路

当历史设计文档与当前代码行为冲突时，以“当前代码 + 本文”作为 Unity runtime process 的对外真理源。

## 2. As-Built 架构总览

### 2.1 Analyze 侧（图构建）

1. Pipeline 先构图再注入 Unity synthetic CALLS：
   - `gitnexus/src/core/ingestion/pipeline.ts:430-433`
2. Synthetic CALLS 来源：
   - lifecycle 回调与 runtime loader 锚点检测：`gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts:8-38, 76-122`
   - runtime-root/lifecycle/loader bridge 注入：`gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts:230-299`
3. Process 生成基于 CALLS tracing，并标注：
   - `processSubtype = unity_lifecycle | static_calls`
   - `runtimeChainConfidence = medium | high`
   - 代码：`gitnexus/src/core/ingestion/process-processor.ts:178-195`
4. 生命周期 metadata 持久化受开关控制：
   - `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST`
   - 代码：`gitnexus/src/core/ingestion/pipeline.ts:431, 487-510`
5. Unity 资源摘要边持久化：
   - `UNITY_RESOURCE_SUMMARY`：`gitnexus/src/core/ingestion/unity-resource-processor.ts:192-207`
   - `Class -> File` schema 路由：`gitnexus/src/core/lbug/schema.ts:254`

### 2.2 Query/Context 侧（检索与投影）

1. 直接 process membership：`STEP_IN_PROCESS`。
2. 类符号方法投影（Phase 2）：
   - `HAS_METHOD -> STEP_IN_PROCESS` 合并：`gitnexus/src/mcp/local/local-backend.ts:763-793, 1460-1483`
   - 证据模式合并：`gitnexus/src/mcp/local/process-evidence.ts:46-114`
3. empty-process + Unity evidence fallback（Phase 5/V1）：
   - 触发：`processRows.length===0` 且 `resourceBindings>0` 或 `needsParityRetry`
   - 注入 `resource_heuristic` + low clue
   - `query`：`gitnexus/src/mcp/local/local-backend.ts:858-883`
   - `context`：`gitnexus/src/mcp/local/local-backend.ts:1544-1567`

### 2.3 On-Demand 强验证（Rule-Driven Dispatch + Reload Deep Extractor）

1. 显式入口：
   - CLI: `--runtime-chain-verify off|on-demand`  
     `gitnexus/src/cli/index.ts:106, 118`
   - MCP schema: `runtime_chain_verify`  
     `gitnexus/src/mcp/tools.ts:102-107, 203-208`
2. 执行条件：
   - 请求参数 `runtime_chain_verify=on-demand`
   - 全局 gate `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` 为启用
   - `query/context` 接入：`gitnexus/src/mcp/local/local-backend.ts`
3. claim + verifier 调度：
   - `verifyRuntimeClaimOnDemand` 先加载规则目录、匹配 `trigger_family` token，再把 matched rule 注入 verifier。
   - verifier 按 rule 分发：
     - Reload family -> 使用 Reload 深度锚点提取（resource/guid_map/code_loader/code_runtime）
     - 非 Reload family -> 使用通用 rule-driven heuristic（resource/guid/code hints）
   - 兼容路径：若无 matched rule 上下文，`verifyRuntimeChainOnDemand` 仍保留 legacy Reload token 触发路径（主要用于直接调用/测试）。
   - 代码：`gitnexus/src/mcp/local/runtime-chain-verify.ts`
4. Verifier 实现：
   - `verifyRuntimeClaimOnDemand` + `verifyRuntimeChainOnDemand`
   - `required_hops` 驱动 `status/evidence_level` 计算；`guarantees/non_guarantees` 来源于 matched rule
   - 输出 `runtime_chain.{status,evidence_level,hops,gaps}`
5. V1 验收 runner：
   - `gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.ts:149-238`
   - 语义闭环校验（CurGunGraph + runtime anchors）：`101-116`

## 3. 设计与实现对照（阶段）

| 阶段 | 设计目标 | As-Built 结论 | 代码/证据 |
| --- | --- | --- | --- |
| Phase 0 | 基线与指标固化 | 已有报告产物 | `docs/reports/2026-03-31-phase0-unity-runtime-process-*.{json,md}` |
| Phase 1 | Unity summary schema hygiene + fallback 统计真实化 | 已落地 | `schema.ts:254`; `lbug-adapter.ts:256-259`; `analyze-summary.ts:62-88` |
| Phase 2 | class->method process 投影 | 已落地（query/context 双侧） | `local-backend.ts:763-793, 1460-1483`; `process-evidence.ts` |
| Phase 3 | lifecycle + loader synthetic CALLS | 已落地（默认关闭） | `unity-lifecycle-synthetic-calls.ts`; `unity-lifecycle-config.ts:24-41` |
| Phase 4 | persisted lifecycle process artifact | 已落地（受 persist 开关控制） | `pipeline.ts:487-510`; `resources.ts:302-307, 428-430` |
| Phase 5 | confidence + verification_hint agent-safe 合约 | 已落地（字段开关控制） | `process-confidence.ts`; `local-backend.ts:924-928, 954-958, 1579-1583` |
| V1 Reload | 双层信号 + on-demand verify + 验收闭环 | 已落地（Reload-focused） | `runtime-chain-evidence.ts`; `runtime-chain-verify.ts`; `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md` |

## 4. 对外契约真理源

## 4.1 `query/context` 常驻字段（无需 flag）

1. `processes[].evidence_mode`: `direct_step | method_projected | resource_heuristic`
2. `processes[].confidence`: `high | medium | low`
3. `process_symbols[].process_evidence_mode`
4. `process_symbols[].process_confidence`

代码依据：
- `gitnexus/src/mcp/local/local-backend.ts:952-953, 1577-1578`

## 4.2 `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on` 扩展字段

1. `runtime_chain_confidence`
2. `runtime_chain_evidence_level`: `none | clue | verified_segment | verified_chain`
3. `verification_hint`（low confidence 时应可行动）

代码依据：
- `gitnexus/src/mcp/local/local-backend.ts:924-928, 954-958, 1579-1583`
- `gitnexus/src/mcp/local/runtime-chain-evidence.ts:1-24`

## 4.3 `runtime_chain` 输出条件

1. 请求显式传 `runtime_chain_verify=on-demand`
2. 全局 gate `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` 未关闭
3. 运行时始终通过 `runtime_claim` 统一输出（包括失败分类）
   - 无规则 / 无匹配 -> `reason=rule_not_matched`
   - 匹配但证据不足 -> `reason=rule_matched_but_evidence_missing`
   - 匹配且验证失败 -> `reason=rule_matched_but_verification_failed`
   - gate 关闭 -> `reason=gate_disabled`
4. 若存在 matched rule，verifier 读取该 rule 的 `required_hops` 参与 `status/evidence_level` 判定（`missing required -> partial/failed`）

代码依据：
- `gitnexus/src/mcp/local/local-backend.ts:994-1004, 1586-1594`
- `gitnexus/src/mcp/local/runtime-chain-verify.ts`

## 4.4 `process_ref / runtime_claim / evidence policy` 合约（Phase 1-4 补充）

1. `query/context` 的 `processes[]` 现在同时返回：
   - `id`（可读 process id；heuristic 情况下为 `derived:*`）
   - `process_ref`：
     - `id`
     - `kind`: `persistent | derived`
     - `readable`
     - `reader_uri`
     - `origin`: `step_in_process | method_projected | resource_heuristic`
2. 请求 `runtime_chain_verify=on-demand` 时，返回 `runtime_claim`（rule-driven）：
   - `rule_id`, `rule_version`, `scope`
   - `status`, `evidence_level`, `hops`, `gaps`
   - `guarantees`, `non_guarantees`
   - 失败分类：`rule_not_matched | rule_matched_but_evidence_missing | rule_matched_but_verification_failed | gate_disabled`
3. `unity_evidence_mode`:
   - `summary | focused | full`
   - 与 `resource_path_prefix / binding_kind / max_bindings / max_reference_fields` 共同决定证据裁剪与 `evidence_meta`
4. `hydration_policy`:
   - `fast => compact`（高优先级，可覆盖 `unity_hydration_mode`）
   - `balanced => 使用请求的 unity_hydration_mode（compact/parity）；compact 且缺证据时可自动 parity 升级`
   - `strict => parity`（高优先级，可覆盖 `unity_hydration_mode`）；若 fallback_to_compact，runtime claim 降级到 `verified_partial / verified_segment`
   - 响应 `hydrationMeta` 必须可观测：`requestedMode/effectiveMode/reason`
5. `missing_evidence[]`:
   - 在不完整输出时必须返回解释条目
   - 保留兼容字段 `hydrationMeta.needsParityRetry`（compact incomplete 场景）

## 5. 运行时开关（当前真实默认值）

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS` | `off` | 是否注入 lifecycle/loader synthetic CALLS |
| `GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST` | `off` | 是否持久化 processSubtype/runtimeChainConfidence/sourceReasons |
| `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS` | `off` | 是否输出 runtime_chain_* 与 verification_hint 扩展字段 |
| `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` | `on` | 全局 gate；关闭后禁用 on-demand 强验证 |
| 请求参数 `runtime_chain_verify` | `off` | 单次请求是否触发 verifier |

代码依据：
- `unity-lifecycle-config.ts:24-41`
- `unity-process-confidence-config.ts:1-4`
- `unity-runtime-chain-verify-config.ts:1-7`
- `cli/index.ts:106, 118`

## 6. 已确认偏差与边界

1. Verifier 执行入口已按 matched rule 驱动（不再由 Reload 关键字硬门控）。Reload 场景使用深度锚点提取；非 Reload 当前走通用 rule-driven heuristic（resource/guid/code hints），专用深度 hop 抽取器仍待扩展。
2. Phase 3 文档中的建议 flag `GITNEXUS_UNITY_PROCESS_METHOD_PROJECTION` 当前未实现为独立开关；方法投影在 query/context 默认启用。
3. V1 不回写 verified chain 到 Process 持久图（仅请求时计算并返回），与设计的 out-of-scope 一致。
4. 强验证链路对仓库文件内容与索引状态一致性敏感；若索引 stale，应先 `gitnexus analyze`。

## 7. 2026-04-02 修复回写（FC-01..FC-06）

1. FC-01: `queryProcessDetail` 支持 `id` 优先查找；`phase1 process_ref readable` 从字段检查升级为 `reader_uri` 实际回读。
2. FC-02: 移除 rule registry ancestor fallback；缺 catalog/rule 文件会抛可诊断错误，并在 claim 层映射为 `rule_not_matched`。
3. FC-03: `trigger_family` 匹配改为 token-based rule matching；`required_hops` 驱动 status；verifier 改为按 matched rule 分发执行（Reload deep extractor + non-Reload heuristic）；claim 的 `guarantees/non_guarantees` 来源于 matched rule。
4. FC-04: hydration precedence 显式化并可观测（`requestedMode/effectiveMode/reason`）。
5. FC-05: YAML scalar/list 解析改为 quote-safe 逻辑，`next_action` 保证可 shell 解析。
6. FC-06: Phase2 acceptance runner 强制 4/4 失败分类覆盖，不足则直接失败并输出缺失分类及复现命令。

## 8. 维护规则

1. 任何 Unity runtime process 行为变更（字段、flag、语义、默认值），必须同步更新本文。
2. 扩展非 Reload 场景专用 verifier/extractor 时，需在本文补充：
   - 触发判定
   - 必需 hop 段
   - 与通用 heuristic 的优先级
   - 验收与回滚策略
3. `AGENTS.md` 应持续指向本文，作为该领域唯一入口文档。
