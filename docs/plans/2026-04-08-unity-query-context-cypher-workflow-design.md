# Unity Query/Context/Cypher 工作流化说明文档设计

Date: 2026-04-08  
Owner: GitNexus

## 1. 目标与背景

本设计用于产出一份类似 `UNITY_RUNTIME_PROCESS.md` 的面向人类用户文档，聚焦 Unity 项目中 `gitnexus query/context/cypher` 的：

1. 使用场景
2. 返回数据结构与语义
3. Agent 可继续执行的深入检索路径

该文档的首要用途不是排版说明，而是为后续工具优化提供可执行的分析基线。

## 2. 约束与真理源

1. Unity runtime process 语义以 `docs/unity-runtime-process-source-of-truth.md` 为唯一对外真理源。
2. 查询工作流遵循 `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` 与 `_shared/unity-runtime-process-contract.md`。
3. 对 runtime chain 结论采用双层语义：
   - verifier-core: `verified_full | failed`
   - policy-adjusted: 对外可见状态（在 `strict + fallbackToCompact` 下允许降级）
4. `runtime_chain_verify=on-demand` 是唯一强验证开关。

## 3. 设计主线

采用“场景优先”组织，不按命令拆章节。以高频三工作流为骨架：

1. `gitnexus-exploring`: 从概念检索到执行流定位
2. `gitnexus-debugging`: 从低置信线索到闭环验证
3. `gitnexus-refactoring`: 从改动意图到结构证据面

每章固定模板：

1. 场景触发条件
2. 推荐命令序列（CLI/MCP）
3. 关键返回字段解读
4. 下一跳检索决策树（`next_hops` / `process_ref` / `runtime_claim` / `cypher`）
5. 误判风险与规避规则

## 4. 文档信息架构

## 4.1 Chapter A: Exploring

1. 入口：`query`（概念 -> 流程候选）
2. 深挖：`context`（符号 360°）
3. 读流程：`process_ref.reader_uri`（persistent/derived）
4. 补洞：`cypher`（结构化问题）

重点字段：

1. `processes[]`, `process_symbols[]`, `definitions[]`
2. `evidence_mode`, `confidence`
3. `process_ref.{id, kind, reader_uri, origin}`

## 4.2 Chapter B: Debugging

1. 入口：`context --unity-resources on`
2. 证据状态：`hydrationMeta`, `missing_evidence`, `evidence_meta`
3. 强验证：`runtime_chain_verify=on-demand`
4. 缺口追查：用 `runtime_claim.gaps` 驱动 `cypher` 定位

重点字段：

1. `runtime_claim`
2. `runtime_chain`
3. `verification_hint`
4. `next_hops`

## 4.3 Chapter C: Refactoring

1. 先查覆盖：`query`（改动可能命中哪些流程）
2. 再查关系：`context`（incoming/outgoing + process participation）
3. 最后枚举：`cypher`（HAS_METHOD/CALLS/STEP_IN_PROCESS）

重点字段：

1. `incoming`, `outgoing`, `directIncoming`, `directOutgoing`
2. `process_subtype`, `runtime_chain_confidence`, `runtime_chain_evidence_level`
3. `process_ref.reader_uri`

## 4.4 Chapter D: Unity vs 通用对照

明确说明：

1. Unity 特化参数：`unity_resources`, `unity_hydration_mode`, `unity_evidence_mode`, `resource_path_prefix`, `resource_seed_mode`, `runtime_chain_verify`
2. Unity 特化返回：`resourceBindings`, `serializedFields`, `hydrationMeta`, `runtime_claim`, `runtime_chain`, `next_hops`
3. 非 Unity 项目退化行为与仍可复用的通用字段

## 4.5 Chapter E: 优化导向附录

把工作流转成优化指标：

1. `next_hops.next_command` 可执行率
2. low-confidence 场景收敛率
3. parity rerun 收益率
4. 可行动字段覆盖率（是否足够引导下一步）

## 5. 返回结构消费模型（Agent 视角）

统一模型：返回 = 证据包 + 决策提示

1. 证据包：
   - `processes/process_symbols/definitions`
   - `incoming/outgoing`
   - `resourceBindings`
   - `runtime_claim`
2. 决策提示：
   - `next_hops`
   - `verification_hint`
   - `process_ref.reader_uri`

默认下一跳顺序：

1. 优先执行 `next_hops[].next_command`
2. 读取 `process_ref.reader_uri`
3. 遇到低置信或 `needsParityRetry` 时走 parity/verify 分支
4. 用 `cypher` 做结构化补查

## 6. 错误处理与防误判规范

1. 不可从 `processes=[]` 直接判定“无运行时链路”。
2. 当 `hydrationMeta.needsParityRetry=true`，必须 rerun parity。
3. 当 `hydration_policy=strict` 且 `fallbackToCompact=true`，只能给 policy-adjusted 结论，不能给 closure 终判。
4. `runtime_claim.reason` 需区分：
   - `rule_not_matched`
   - `rule_matched_but_evidence_missing`
   - `rule_matched_but_verification_failed`

## 7. 关键实现锚点（用于后续文档正文引用）

1. CLI 入口与参数：`gitnexus/src/cli/index.ts`, `gitnexus/src/cli/tool.ts`
2. MCP 工具 schema：`gitnexus/src/mcp/tools.ts`
3. query/context/cypher 返回组装：`gitnexus/src/mcp/local/local-backend.ts`
4. runtime claim 两层语义：`gitnexus/src/mcp/local/runtime-claim.ts`
5. graph-only on-demand verifier：`gitnexus/src/mcp/local/runtime-chain-verify.ts`
6. process 可读引用：`gitnexus/src/mcp/local/process-ref.ts`
7. process/derived-process 资源读取：`gitnexus/src/mcp/resources.ts`, `gitnexus/src/mcp/local/derived-process-reader.ts`

## 8. 交付物定义

基于本设计的实现阶段将产出：

1. 新的人类文档（暂定 `UNITY_QUERY_CONTEXT_CYPHER_WORKFLOWS.md`）
2. 在 `UNITY_RUNTIME_PROCESS.md` 增加跳转链接
3. 至少三组 Unity 实测样例（exploring/debugging/refactoring 各一组）及“下一跳检索”演示

## 9. 验收标准

1. 用户可从任一工作流入口执行到可复现的下一跳（命令可执行）。
2. 文档明确区分 verifier-core 与 policy-adjusted，避免错误闭环结论。
3. 文档中所有关键字段都能在当前实现中找到对应源码锚点。
4. 文档内容可直接支持后续工具优化议题（结果可行动性、置信收敛、验证成本）。
