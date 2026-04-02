# Unity Runtime Process Phase1-4 事实核查

Date: 2026-04-02
Repo: `GitNexus` (`/Volumes/Shuttle/projects/agentic/GitNexus`)
Design Baseline: `docs/plans/2026-04-01-unity-runtime-process-structural-remediation-design.md`

## 0. 核查目标

对 review 结论中的 6 个问题进行逐条事实核查，确认：

1. 是否可稳定复现。
2. 是否有直接代码证据。
3. 是否与 Phase1-4 设计目标冲突。

## 1. 环境与前置

### 1.1 索引状态

执行：

```bash
gitnexus analyze
```

观察：

- 成功重建索引（`Repo Name: GitNexus`）。
- 新索引统计：`3,372 nodes | 7,749 edges | 240 flows`。

### 1.2 构建与测试基线

执行：

```bash
npm --prefix gitnexus run build
npm --prefix gitnexus exec vitest run src/mcp/local/runtime-chain-verify.test.ts
npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -- -t "phase2 runtime_claim contract|phase2 failure classifications|phase2 reload bootstrap rule|phase3 evidence mode|phase3 minimum evidence contract|phase4 hydration policy|phase4 missing_evidence and needsParityRetry"
```

观察：

- 构建通过。
- 上述筛选测试通过。

说明：测试通过不等于契约目标完全达成，仍需行为级核查。

## 2. 逐条事实核查

## FC-01: `process_ref.reader_uri` persistent 回读不可用

**待核查断言**
- Phase1 已做到“`process_ref.readable_rate=100%` 且 reader 可读”。

**复现方式**
- 用本地后端 `query` 拿到 `process_ref.reader_uri`，再逐个 `readResource(uri)` 回读。

**实际结果**
- 复测输出：`readable_via_reader_uri=0/5`
- 典型返回：`error: Process 'proc_12_buildreloadacceptanc' not found`

**代码证据**
- `process_ref` 为 persistent process 拼接 `.../process/{processId}`：
  - `gitnexus/src/mcp/local/process-ref.ts:46`
- process reader 按 `label/heuristicLabel` 匹配而非 `id`：
  - `gitnexus/src/mcp/local/local-backend.ts:2681`

**结论**
- `Confirmed`。字段级 readable 与行为级 readable 不一致。

## FC-02: 规则加载存在跨仓 fallback

**待核查断言**
- 在线验证仅加载目标 repo 的 `.gitnexus/rules`。

**复现方式**
- 构造一个无规则目录的临时 repo，调用 `loadRuleRegistry`。

**实际结果**
- 返回的 `catalogPath` 指向当前工作仓库：
  - `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/rules/catalog.json`

**代码证据**
- 祖先 fallback 逻辑：
  - `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:102`
- fallback 行为测试：
  - `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts:15`

**结论**
- `Confirmed`。与“仅项目规则、无隐式 fallback”目标冲突。

## FC-03: verifier 执行仍以 Reload 硬编码为中心

**待核查断言**
- Phase2 已完成 rule-driven verifier（规则驱动匹配与执行）。

**复现方式**
1. 查执行入口是否硬编码 Reload token/path/guid。
2. 注入自定义规则，观察 claim 是否采用规则内 guarantees/non_guarantees 语义。

**实际结果**
- 触发判定依赖硬编码 tokens：`reload/pickitup/...`。
- required segments 使用硬编码数组：`['resource','guid_map','code_loader','code_runtime']`。
- 自定义规则时，`scope` 会按规则变化，但 `guarantees/non_guarantees` 仍来自固定模板。

**代码证据**
- `RELOAD_QUERY_TOKENS`、固定路径/GUID：
  - `gitnexus/src/mcp/local/runtime-chain-verify.ts:53-67`
- `shouldVerifyReloadChain`：
  - `gitnexus/src/mcp/local/runtime-chain-verify.ts:73`
- 固定 required segments：
  - `gitnexus/src/mcp/local/runtime-chain-verify.ts:310`
- 固定 claim 模板：
  - `gitnexus/src/mcp/local/runtime-claim.ts:36`

**结论**
- `Confirmed`。当前是“规则元数据接线 + Reload特例执行”，非通用规则执行器。

## FC-04: `unity_hydration_mode` 参数未驱动执行

**待核查断言**
- Phase4 参数关系中，`unity_hydration_mode` 与 `hydration_policy` 有明确优先级并都参与行为。

**复现方式**
- 追踪参数变量在 `query/context` 的读写路径。

**实际结果**
- `unityHydrationMode` 仅被 parse；后续未参与模式决策。
- 实际模式由 `hydrationPolicy` 推导：`strict => parity`，其它 => `compact`/升级逻辑。

**代码证据**
- parse 位置：
  - `gitnexus/src/mcp/local/local-backend.ts:706,1534`
- 决策位置：
  - `gitnexus/src/mcp/local/local-backend.ts:857,1736`

**结论**
- `Confirmed`。`unity_hydration_mode` 目前为“可传但不生效”的契约噪声参数。

## FC-05: `next_action` 尾引号损坏

**待核查断言**
- 失败分类返回的 `next_action` 可直接执行。

**复现方式**
- 触发 `rule_not_matched` 并打印 `runtime_claim.next_action`。

**实际结果**
- 输出结尾缺失右引号：
  - `... --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads`

**代码证据**
- 标量解析引号处理：
  - `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:52`

**结论**
- `Confirmed`。actionable hint 存在格式损坏。

## FC-06: Phase2 验收未覆盖全部失败分类

**待核查断言**
- Phase2 验收已覆盖 4 类失败：
  - `rule_not_matched`
  - `rule_matched_but_evidence_missing`
  - `rule_matched_but_verification_failed`
  - `gate_disabled`

**复现方式**
- 检查 Phase2 acceptance runner 的失败分类采集来源。

**实际结果**
- runner 仅收集 `unmatched` 与 `gateDisabled` 两个样本。
- 未覆盖 `rule_matched_but_evidence_missing`、`rule_matched_but_verification_failed`。

**代码证据**
- 采集逻辑仅两项：
  - `gitnexus/src/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.ts:65-68`

**结论**
- `Confirmed`。验收通过无法证明失败分类完备。

## 3. 核查总判定

- 6/6 问题均已被代码证据和可复现行为确认。
- 其中 `FC-01`、`FC-02` 属于阻断级问题，会直接破坏“契约可读性”和“规则作用域边界”的可信度。

## 4. 建议的验收补强（最小集）

1. **Phase1**：新增 `reader_uri` 实际回读成功率指标（不是只看字段存在）。
2. **Phase2**：新增失败分类 4/4 覆盖断言；新增“目标 repo 无规则时不得跨仓加载”断言。
3. **Phase2**：新增“规则 guarantees/non_guarantees/required_hops 真实驱动执行”的对照测试。
4. **Phase4**：新增 `unity_hydration_mode` 与 `hydration_policy` 冲突矩阵测试，明确 requested/effective 行为。

