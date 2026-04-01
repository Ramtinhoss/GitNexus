# Unity Runtime Process V1 (Reload) 设计文档

Date: 2026-04-01
Owner: GitNexus
Status: Draft (for implementation planning)

## 0. 参考文档

1. `docs/2026-03-31-unity-runtime-process-phased-design.md`
2. `docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md`
3. `docs/plans/2026-04-01-unity-runtime-process-phase5-confidence-agent-safe-ux-implementation-plan.md`

本设计是对上述文档的 V1 落地收敛，目标是先闭环 neonspark 的 Reload 链路，再泛化。

## 1. 已确认的产品决策

1. 置信度口径采用双层模型：
- 保留 `runtime_chain_confidence`（process membership 信号）
- 新增 `runtime_chain_evidence_level`（链路证据闭环程度）

2. 性能策略采用按需强验证：
- 默认快速返回
- 命中低置信 clue 时通过显式入口触发强验证

3. 触发方式采用显式参数：
- 不做低置信自动强验证
- 避免默认请求时延/成本失控

4. 首版范围采用 Reload 案例闭环优先：
- UC-1 ~ UC-5 先在 neonspark Reload 场景稳定通过

## 2. 问题边界

### 2.1 In-Scope (V1 必须解决)

1. `context` 与 `query` 在“empty process + Unity runtime evidence”场景的契约对齐。
2. 基于当前索引和仓库文件内容，提供显式 `runtime_chain_verify` 强验证路径。
3. 为 agent 输出 hop 级证据锚点，避免“空即无链路”的误判。

### 2.2 Out-of-Scope (V1 不做)

1. 不重定义现有 `high/medium/low` 的核心语义。
2. 不要求先重建全量索引才能交付。
3. 不在 V1 强制把所有 verified 结果回写持久化 Process 图。
4. 不承诺“一次查询直接给完整链路”，允许多跳 stitched。

## 3. 设计目标

1. 修复关键误导：`context` 在有 Unity 证据时不再直接给出全空 process 线索。
2. 在不牺牲语义稳定性的前提下，提供可升级到高确定性的链路验证能力。
3. 让 agent 输出从“只有线索”升级为“线索 + 可审计验证证据”。

## 4. 核心方案

### 4.1 双层信号模型

保留字段：
- `runtime_chain_confidence`: `high | medium | low`

新增字段：
- `runtime_chain_evidence_level`: `none | clue | verified_segment | verified_chain`

语义分工：
1. `runtime_chain_confidence` 仅表达 process membership 路径的可信度。
2. `runtime_chain_evidence_level` 表达跨资源/代码 hop 的证据闭环程度。

设计原因：
- 防止把“索引中的 membership 置信度”和“运行时链路证据完备度”混为一谈。

### 4.2 Context/Query 契约对齐

在 `context` 增加与 `query` 等价的 fallback 逻辑：

触发条件：
1. `processes.length == 0`
2. `resourceBindings.length > 0` 或 `hydrationMeta.needsParityRetry == true`

输出行为：
1. 注入 `resource_heuristic` 线索行
2. `runtime_chain_confidence = low`
3. 提供结构化 `verification_hint`
4. `runtime_chain_evidence_level = clue`

结果预期：
- `context` 不再把“可继续调查”的场景表现成“完全无链路”。

### 4.3 显式按需强验证入口

新增可选参数（query/context 均支持）：
- `--runtime-chain-verify on-demand`

默认行为：
- 未传参数时仅返回快路径（现有 + clue）

启用行为：
- 进入强验证流水线并返回 `runtime_chain` 结构

### 4.4 强验证流水线（Reload V1）

#### Stage A: 资源侧确定性绑定

1. 从目标符号（如 `Reload`）提取 `resourceBindings` 图资源。
2. 读取图资源 `.meta` 的 `guid`。
3. 在 PowerUp 资产中匹配 `gungraph guid` 引用。

通过标准：
- 至少命中 1 条 `PowerUp.asset -> gungraph guid -> Graph.asset` 映射。

#### Stage B: 图节点确定性绑定

1. 在目标 Graph.asset 内定位 `m_Script guid = Reload.cs.meta guid`。
2. 校验节点端口连线满足关键方向（如 `Reload.ResultRPM -> GunOutput.RPM`）。

通过标准：
- 至少命中 1 条 Reload 节点实例和 1 条关键连线证据。

#### Stage C: Loader 代码段锚定

要求命中以下路径中的可执行段：
1. `PickItUp -> EquipWithEvent -> Equip`
2. `Equip` 中 `CurGunGraph` 赋值

通过标准：
- 每段至少 1 个 `file:line` 锚点。

#### Stage D: Runtime 执行段锚定

要求命中以下路径中的可执行段：
1. `GunGraphMB.RegisterGraphEvents -> GunGraph.RegisterEvents`
2. `Gun.GunAttackRoutine -> GunGraph.StartRoutineWithEvents`
3. `GunOutput` RPM 读取链路
4. `ReloadBase.GetValue -> CheckReload -> ReloadRoutine`

通过标准：
- 每段至少 1 个 `file:line` 锚点。

### 4.5 输出契约

新增顶层对象：`runtime_chain`

```json
{
  "runtime_chain": {
    "status": "pending | verified_partial | verified_full | failed",
    "evidence_level": "clue | verified_segment | verified_chain",
    "hops": [
      {
        "hop_type": "resource | guid_map | code_loader | code_runtime",
        "anchor": "symbol/file/line or asset/meta line",
        "confidence": "low | medium | high",
        "note": "why this hop is accepted"
      }
    ],
    "gaps": [
      {
        "segment": "loader | runtime | resource",
        "reason": "missing deterministic anchor",
        "next_command": "actionable follow-up command"
      }
    ]
  }
}
```

兼容性要求：
1. 未启用 `--runtime-chain-verify` 时，`runtime_chain` 可缺省。
2. 现有字段不删除，仅追加。

## 5. UC 验收映射

### UC-1: Symbol retrieval baseline (Reload)

验收：
1. parity 模式下至少返回 clue（query/context 任一不全空）。
2. `resourceBindings` 非零且包含实际 Graph 资产路径。

### UC-2: Resource-to-asset hop

验收：
1. 至少 1 条 `PowerUp asset -> gungraph` 的 GUID 映射。
2. 证据必须来自 `.asset/.meta` 真实行锚点。

### UC-3: Loader process segment

验收：
1. 命中 `PickItUp/EquipWithEvent/Equip` 至少一个可执行段。
2. `CurGunGraph` 赋值行锚点存在。

### UC-4: Runtime execution segment

验收：
1. 命中 `RegisterEvents/StartRoutineWithEvents/GetValue|CheckReload` 至少一个可执行段。
2. RPM/output 到 reload 逻辑的证据链可说明。

### UC-5: Agent stitched-chain output

验收：
1. 从 `Reload` 出发可拼出覆盖 UC-2/UC-3/UC-4 的 stitched chain。
2. 每 hop 必须附锚点。
3. 某 hop 缺 process 时必须继续检索，不可直接终止为“无链路”。

## 6. 风险与缓解

1. 风险：强验证引入时延。
- 缓解：显式触发，不影响默认快路径。

2. 风险：高置信语义被误用。
- 缓解：双层口径，`confidence` 与 `evidence_level` 分离。

3. 风险：索引召回盲区（如部分类定义漂移）。
- 缓解：V1 用文件锚点补齐；保留后续索引增强议题。

## 7. 回滚策略

1. `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS`：关闭后隐藏新置信度提示字段。
2. `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY`：关闭后禁用强验证，仅保留快路径。
3. 即使关闭强验证，也保留基础查询能力与已有字段兼容。

## 8. 观测与评估

最小观测指标：
1. `context` empty-process 率（目标符号集）。
2. low clue 到 verified hop 的转化率（显式验证触发后）。
3. 平均/95分位验证时延。
4. 错误终止率（错误输出“无链路”）。

## 9. 下一步

1. 基于本文进入 implementation plan 拆解（按 TDD + 小步提交）。
2. 先实现 UC-1/UC-2，再实现 UC-3/UC-4，最后闭合 UC-5。
3. 每阶段都跑 case pack 并回填证据报告。

## 10. Execution Notes

2026-04-01 implementation outcome:

1. `context/query` 现已保持低置信 clue 语义，同时追加 `runtime_chain_evidence_level`，未破坏默认返回结构。
2. `--runtime-chain-verify on-demand` 已落地到 CLI、本地后端、MCP schema，并为 Reload 案例输出 `runtime_chain`.
3. Live acceptance 已闭环：
- artifact: `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`
- report: `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md`
- result: `verified_full` + `verified_chain`

Residual risks:

1. V1 verifier 仍是 Reload-focused，其他 Unity runtime chains 还没有同等级的 deterministic coverage。
2. Live acceptance runner 为避免当前 child-process path instability，内部直接调用 `LocalBackend`，但仍记录等价 CLI provenance 命令。
3. `runtime_chain` 闭环依赖仓库文件仍与索引 commit 一致；本次通过 status parity (`9d105b2988e0a9711e6ef64cb4a8e458516f6c9c`) 已验证。
