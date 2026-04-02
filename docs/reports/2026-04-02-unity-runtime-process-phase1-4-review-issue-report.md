# Unity Runtime Process Phase1-4 问题汇报

Date: 2026-04-02
Repo: `GitNexus` (`/Volumes/Shuttle/projects/agentic/GitNexus`)
Source Design: `docs/plans/2026-04-01-unity-runtime-process-structural-remediation-design.md` (Phase1-4)

## 1. 总结

本次基于 Phase1-4 目标进行源码与行为对照后，确认存在 6 个问题（2 个 Critical，2 个 High，2 个 Medium）。

- **Critical-1**：`process_ref` 的 persistent `reader_uri` 实际不可读，阻断 Phase1 “readable_rate=100%”真实达成。
- **Critical-2**：规则加载存在跨仓 fallback，违反“在线验证只加载项目规则、无隐式 fallback”。
- **High-1**：Phase2 目前仍以 Reload 硬编码 verifier 为主，未达到设计要求的通用 rule-driven verifier。
- **High-2**：`unity_hydration_mode` 参数被解析但不参与决策，和契约预期不一致。
- **Medium-1**：`next_action` YAML 解析会损坏尾部引号，导致命令不可直接执行。
- **Medium-2**：Phase2 验收覆盖不足，未覆盖全部失败分类。

## 2. 问题清单

| ID | 严重级别 | 关联 Phase | 问题 | 当前结论 |
|---|---|---|---|---|
| P1-READ-001 | Critical | Phase1 | `process_ref.reader_uri` 不可读 | Confirmed |
| P2-RULE-001 | Critical | Phase2 | 规则加载跨仓 fallback | Confirmed |
| P2-RULE-002 | High | Phase2 | verifier 仍 hardcode Reload | Confirmed |
| P4-HYDR-001 | High | Phase4 | `unity_hydration_mode` 未生效 | Confirmed |
| P2-CLAIM-001 | Medium | Phase2 | `next_action` 引号损坏 | Confirmed |
| P2-ACC-001 | Medium | Phase2 | 验收未覆盖全部失败分类 | Confirmed |

## 3. 逐项说明

### P1-READ-001 (Critical)

**现象**
- `query` 返回的 `process_ref.reader_uri` 为 `gitnexus://repo/{name}/process/{processId}`。
- 该 URI 回读时，多数 persistent process 返回 `Process 'proc_*' not found`。

**证据**
- `process_ref` 生成按 process id 拼接 URI：`gitnexus/src/mcp/local/process-ref.ts:46`
- process resource 读取按 `label/heuristicLabel` 查找，不按 `id`：`gitnexus/src/mcp/local/local-backend.ts:2681`
- 现场复测（2026-04-02）：`readable_via_reader_uri=0/5`。

**影响**
- Phase1 的“process identity 与可读性一致化”未真正闭环。
- `readable_rate=100%` 目前仅是字段级通过，非行为级通过。

**建议**
1. `queryProcessDetail` 同时支持 `id` 直查（优先 `id`，再回退 `label/heuristicLabel`）。
2. Phase1 验收 runner 增加“按 `reader_uri` 实际 readResource 成功率”。

### P2-RULE-001 (Critical)

**现象**
- 当目标 repo 无 `.gitnexus/rules/catalog.json` 时，规则加载会回退到 `process.cwd()` 祖先目录查找规则。

**证据**
- fallback 逻辑：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:102`
- 对应测试已固化此行为：`gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts:15`
- 临时空仓复测：实际加载到当前工作仓库 `GitNexus/.gitnexus/rules/catalog.json`。

**影响**
- 违反设计“在线验证只加载项目规则，未命中则显式失败”。
- 可能导致跨仓误判与安全边界污染。

**建议**
1. 移除祖先目录 fallback，默认仅加载目标 repo rulesRoot。
2. 缺失规则时直接返回 `rule_not_matched`。

### P2-RULE-002 (High)

**现象**
- verifier 判断与链路仍以 Reload 关键字/路径/GUID 常量硬编码。
- `required_hops/guarantees/non_guarantees` 虽在 registry 解析，但未作为执行主逻辑输入。

**证据**
- Reload tokens/path/GUID 常量：`gitnexus/src/mcp/local/runtime-chain-verify.ts:53-67`
- `shouldVerifyReloadChain` 关键字判断：`gitnexus/src/mcp/local/runtime-chain-verify.ts:73`
- `requiredSegments` 硬编码：`gitnexus/src/mcp/local/runtime-chain-verify.ts:310`
- claim guarantee 来源仍是固定模板：`gitnexus/src/mcp/local/runtime-claim.ts:36`

**影响**
- Phase2 “Rule Registry 驱动验证器”目标只达成了“规则识别/元数据绑定”，未达成“规则执行驱动”。

**建议**
1. 将 required hops、guarantee 语义迁移为 rule 输入。
2. `verifyRuntimeChainOnDemand` 改为按匹配规则执行，不再绑死 Reload 特例。

### P4-HYDR-001 (High)

**现象**
- `unity_hydration_mode` 被 parse，但实际 hydration 决策只由 `hydration_policy` 决定。

**证据**
- 仅 parse：`gitnexus/src/mcp/local/local-backend.ts:706,1534`
- 实际执行模式来自 policy：`gitnexus/src/mcp/local/local-backend.ts:857,1736`

**影响**
- 与已有 skill/契约中“显式设置 `unity_hydration_mode` 控制 compact/parity”不一致。
- 可能导致调用方误判行为。

**建议**
1. 落实“policy 高于 mode，但 mode 可作为显式覆盖/执行模式输入”的冲突策略。
2. 在响应中回显最终执行策略解释（requested/effective/reason）。

### P2-CLAIM-001 (Medium)

**现象**
- `runtime_claim.next_action` 尾部引号缺失，直接复制执行会失败。

**证据**
- 标量解析正则：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:52`
- 现场输出示例：`... on-demand "Reload NEON.Game.Graph.Nodes.Reloads`（缺右引号）。

**影响**
- 降低失败分类“actionable hint”可执行性。

**建议**
1. 改为可靠 YAML 解析器（例如 `yaml` 包）。
2. 至少修正 `readScalar` 的引号剥离逻辑。

### P2-ACC-001 (Medium)

**现象**
- Phase2 验收 runner 仅覆盖 `rule_not_matched` 与 `gate_disabled`，未覆盖另两类失败。

**证据**
- 只采集两项：`gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.ts:65-68`
- 未发现 `rule_matched_but_evidence_missing` / `rule_matched_but_verification_failed` 的 runner 校验。

**影响**
- 会出现“验收报告通过但失败分类不完备”的假阳性。

**建议**
1. 补充两类失败的强制测试样本与覆盖率统计。
2. Phase2 报告增加四类失败分类完整性断言。

## 4. 本次核查中已通过项（非问题）

1. `npm --prefix gitnexus run build` 通过。
2. `runtime-chain-verify` 单测通过。
3. Phase2/3/4 相关集成筛选测试通过。
4. 既有 benchmark 指标：`summarySizeReductionPct=64.2`、`queryContextP95DeltaPct=12.4`（满足 Phase3 目标）。

## 5. 处置优先级建议

1. 先修 `P1-READ-001` 与 `P2-RULE-001`（阻断级，影响契约真实性）。
2. 再修 `P2-RULE-002` 与 `P4-HYDR-001`（语义一致性）。
3. 最后补 `P2-CLAIM-001` 与 `P2-ACC-001`（可用性与验收完整性）。

## 6. Resolution Status (2026-04-02 Remediation Complete)

| ID | Resolution Status | Key Result | Evidence Artifact |
|---|---|---|---|
| P1-READ-001 | fixed | process reader 支持 id 直查；reader_uri 回读测试/runner 均行为级验证 | `docs/reports/2026-04-02-phase1-process-ref-acceptance.remediated.json` |
| P2-RULE-001 | fixed | rule registry 不再跨仓 fallback，缺失规则映射 `rule_not_matched` | registry + runtime-chain tests |
| P2-RULE-002 | fixed | verifier matcher/required_hops/claim semantics 改为 rule-driven | `gitnexus/src/mcp/local/runtime-chain-verify.test.ts` |
| P4-HYDR-001 | fixed | policy/mode precedence 落地并回显 `requested/effective/reason` | phase4 integration tests |
| P2-CLAIM-001 | fixed | `next_action` 引号解析修复，可 shell parse | parser tests + runtime claim next_action test |
| P2-ACC-001 | fixed | acceptance runner 强制 4/4 失败分类覆盖，不足即失败 | `docs/reports/2026-04-02-phase2-runtime-claim-acceptance.remediated.json` |
