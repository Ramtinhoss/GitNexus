# Rule Lab 数据驱动改造事实核查

Date: 2026-04-02
Owner: GitNexus
Status: Draft for redesign baseline

## 结论摘要

- 主张 1：属实。`reload` 运行时验证仍包含硬编码路径/GUID，且存在 `reload` 专用验证分支。
- 主张 2：属实。`promote` 当前会把 `resource_types` / `host_base_type` 固定写为 `unknown`。
- 主张 3：属实。`rule-lab analyze` 当前实现是“单候选 + 单 resource hop”的最小占位策略。
- 主张 4：基本属实。phase5 gate 仅校验阶段覆盖数量与 metrics 数值类型，不校验“规则是否真实驱动了链路拓扑”。
- 主张 5：属实。runtime claim 存在 `minimum evidence` 不满足时的强制降级逻辑（置 failed + 添加 non-guarantee）。

## 逐项核查

| 主张 | 结论 | 证据 |
|---|---|---|
| 1) reload 运行时验证存在硬编码路径/GUID/专用分支 | 属实 | 硬编码常量：`RESOURCE_ASSET_PATH`、`GRAPH_ASSET_PATH`、`RELOAD_META_PATH`、`RELOAD_GUID`、`GRAPH_GUID` 在 [runtime-chain-verify.ts:65](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:65)、[runtime-chain-verify.ts:66](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:66)、[runtime-chain-verify.ts:67](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:67)、[runtime-chain-verify.ts:68](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:68)、[runtime-chain-verify.ts:69](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:69)。专用分支：`isReloadRule -> verifyReloadRuntimeChain` 于 [runtime-chain-verify.ts:468](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:468)-[runtime-chain-verify.ts:473](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:473)，无匹配 rule 时仍有 `shouldVerifyReloadChain` 回退于 [runtime-chain-verify.ts:475](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:475)-[runtime-chain-verify.ts:476](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:476)。 |
| 2) promote 会把 resource_types/host_base_type 写为 unknown | 属实 | YAML 生成固定写入 `unknown`： [promote.ts:69](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:69)-[promote.ts:72](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:72)。`trigger_family` 也来自 title 首 token 推断，缺失则 `unknown`： [promote.ts:51](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:51)-[promote.ts:55](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:55)。 |
| 3) rule-lab analyze 当前是最小占位候选 | 属实 | 每个 slice 仅构造一个 candidate： [analyze.ts:53](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:53)-[analyze.ts:61](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:61)。候选 evidence 仅含 1 条 `resource` hop（`anchor: ...:1`）： [analyze.ts:34](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:34)-[analyze.ts:40](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:40)。真理源同样明确“最小可用候选”： [unity-runtime-process-source-of-truth.md:249](/Users/nantasmac/projects/agentic/GitNexus/docs/unity-runtime-process-source-of-truth.md:249)-[unity-runtime-process-source-of-truth.md:250](/Users/nantasmac/projects/agentic/GitNexus/docs/unity-runtime-process-source-of-truth.md:250)。 |
| 4) phase5 gate 主要验证阶段覆盖和数值字段，未验证数据驱动链路真实性 | 基本属实 | gate 仅检查 `stage_coverage.length===6` 与 `metrics.precision/coverage` 为 number： [phase5-rule-lab-acceptance-runner.ts:233](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:233)-[phase5-rule-lab-acceptance-runner.ts:239](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:239)。`buildPhase5...` 主要做阶段执行与产物存在性检查： [phase5-rule-lab-acceptance-runner.ts:199](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:199)-[phase5-rule-lab-acceptance-runner.ts:208](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:208)。回归指标由输入阈值比较驱动，不验证链路拓扑真实性： [regress.ts:42](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/regress.ts:42)-[regress.ts:55](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/regress.ts:55)。 |
| 5) runtime claim 对 minimum evidence 的降级逻辑 | 属实 | `minimumEvidenceSatisfied===false` 时强制降级：`status='failed'`、`evidence_level='clue'`、追加 `minimum_evidence_contract_not_satisfied`： [runtime-chain-verify.ts:583](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:583)-[runtime-chain-verify.ts:592](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:592)。该标志来源于 evidence_meta： [local-backend.ts:1394](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1394)-[local-backend.ts:1397](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1397)，并传入 verifier： [local-backend.ts:1416](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1416)-[local-backend.ts:1423](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1423)。 |

## 风险影响

- 规则可解释性风险：`reload` 特化常量与分支会掩盖规则数据本身信息不足，造成“看起来规则驱动，实则代码兜底”。
- 可迁移性风险：`unknown` scope 字段使规则难以泛化到新仓库/新资源拓扑。
- 验收失真风险：phase5 gate 通过并不等于“数据驱动链路真实成立”。
- 运行时稳定性风险：`minimum evidence` 被裁剪时会触发 claim 降级，导致线上/验收结果受证据采样策略影响较大。

## 改造建议

- 去硬编码：移除 `reload` 专用常量和路径/GUID 分支，统一走声明式规则谓词 + 通用验证器。
- 扩展规则 schema：在 Rule YAML 中强制要求可验证的 topology 字段（resource 类型、host base 类型、guid/asset/script 关系约束、required_hops 语义）。
- 强化 analyze/curate：让 `analyze` 直接产出结构化候选（非占位 hop），`curate` 必填拓扑断言并可机审。
- 升级 phase5 gate：增加“真实性校验”项（使用已推广规则进行 on-demand runtime claim 验证，并断言 hop 锚点来自仓库真实文件/符号，不允许 fixture 占位）。
- 细化 minimum evidence 策略：把“证据不足降级”拆分为可观测原因（裁剪、过滤耗尽、索引过期、规则缺字段），并在回归报告里单独统计。

## 证据清单

- [docs/unity-runtime-process-source-of-truth.md:231](/Users/nantasmac/projects/agentic/GitNexus/docs/unity-runtime-process-source-of-truth.md:231)
- [docs/unity-runtime-process-source-of-truth.md:249](/Users/nantasmac/projects/agentic/GitNexus/docs/unity-runtime-process-source-of-truth.md:249)
- [docs/unity-runtime-process-source-of-truth.md:250](/Users/nantasmac/projects/agentic/GitNexus/docs/unity-runtime-process-source-of-truth.md:250)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:65](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:65)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:67](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:67)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:68](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:68)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:69](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:69)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:314](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:314)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:468](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:468)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:475](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:475)
- [gitnexus/src/mcp/local/runtime-chain-verify.ts:583](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:583)
- [gitnexus/src/rule-lab/promote.ts:51](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:51)
- [gitnexus/src/rule-lab/promote.ts:69](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:69)
- [gitnexus/src/rule-lab/analyze.ts:34](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:34)
- [gitnexus/src/rule-lab/analyze.ts:60](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:60)
- [gitnexus/src/rule-lab/regress.ts:42](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/regress.ts:42)
- [gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:199](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:199)
- [gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:233](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts:233)
- [gitnexus/src/mcp/local/local-backend.ts:1394](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1394)
- [gitnexus/src/mcp/local/local-backend.ts:1416](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1416)
