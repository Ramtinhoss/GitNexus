# Unity Query/Context/Cypher 工作流指南

## Intro and Audience

本文面向 Unity 场景下的 GitNexus 检索工作，目标是把 `query/context/cypher` 串成可执行闭环，帮助你在探索、调试、重构三类任务里快速收敛。

相关文档：
- `UNITY_RUNTIME_PROCESS.md`：运行时链路架构与实现说明
- `docs/unity-runtime-process-source-of-truth.md`：Unity runtime process 对外语义真理源

读者对象：
- 需要快速理解陌生 Unity 代码路径的工程师
- 需要定位 runtime closure 失败原因的工程师
- 需要在改名前评估风险面的工程师

## Exploring Workflow

目标：从概念查询出发，逐步定位到可执行的符号与流程证据。

Evidence Ref: workflows.exploring.query  
Evidence Ref: workflows.exploring.context  
Evidence Ref: workflows.exploring.cypher

1. 用 `query` 做概念到流程的第一跳。

```bash
gitnexus query -r GitNexus -l 3 "runtime chain verify"
```

优先看这些字段：
- `processes[]`：候选执行流（按优先级排序）
- `processes[].process_ref.reader_uri`：可直接读取流程详情的 URI
- `process_symbols[]`：流程里的关键符号锚点
- `definitions[]`：未入流但相关的结构定义
- `next_hops[]`：下一条建议命令

2. 用 `context` 深挖单个符号。

```bash
gitnexus context -r GitNexus verifyRuntimeClaimOnDemand
```

重点关注：
- `incoming.calls`：谁在调用目标符号
- `outgoing.calls`：目标符号调用了谁

3. 用 `cypher` 补结构缺口。

```bash
gitnexus cypher -r GitNexus "MATCH (p:Process) RETURN p.heuristicLabel AS process LIMIT 5"
```

适用时机：
- `query/context` 给了方向，但你还需要明确关系切片或数量边界。

4. 命令 -> 字段 -> 下一跳（示例）。

命令：

```bash
gitnexus query -r GitNexus -l 3 "runtime chain verify"
```

字段信号：
- `processes[0].process_ref.reader_uri = gitnexus://repo/GitNexus/process/proc_46_bm25search`
- `next_hops[0].next_command = gitnexus context --repo "GitNexus" --unity-resources on --unity-hydration parity "normalizePath"`

下一跳动作：
- 先读取 `process_ref.reader_uri` 查看流程全貌
- 再执行 `next_hops[0].next_command` 进入符号级证据

## Debugging Workflow

目标：解释为什么没有达到 runtime closure，并给出下一步可执行动作。

Evidence Ref: workflows.debugging.query  
Evidence Ref: workflows.debugging.context  
Evidence Ref: workflows.debugging.cypher

1. 显式开启运行时验证。

```bash
gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --scope-preset unity-all "verifyRuntimeClaimOnDemand runtime closure"
```

参数语义：`runtime_chain_verify=on-demand`。

2. 先看证据质量，再谈闭环。
- 当 `evidence_mode=resource_heuristic` 或整体 `confidence=low` 时，只能当作线索，不可直接下闭环结论。

3. 严格使用双层语义。
- `verifier-core`：验证器内部二元结果（`verified_full` / `failed`）
- `policy-adjusted`：对外展示结果（受 hydration 策略影响）
- 若 `needsParityRetry=true`，必须先 parity rerun 再做 closure 结论
- 若 `fallbackToCompact=true`，不能把 compact 结果当最终闭环结论

4. `runtime_claim` 原因分类（taxonomy）。
- `rule_not_matched`
- `rule_matched_but_evidence_missing`
- `rule_matched_but_verification_failed`

5. 用 `hops/gaps` 决策下一条命令。
- `hops` 有值且 `gaps` 有值：执行 `runtime_claim.next_action` 或各 gap 的 `next_command` 补链
- `hops` 为空：回到 `next_hops[]` 重新找符号锚点
- 只有在 `verified_full` 且 `hops>0` 且 `gaps=0` 时，才可判定闭环

示例下一跳：

```bash
node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "verifyRuntimeClaimOnDemand runtime closure"
```

### Negative Semantic Cases

NEG-01：`processes=[]` 不等于“运行时链路不存在”。

- Bad interpretation：没有 process 行就表示链路被证伪
- Correct interpretation：必须结合 `runtime_claim.verification_core_status` 与 `runtime_claim.reason` 判定
- Evidence Ref: negative_cases.neg_01
- Verification command:

```bash
jq -e '.negative_cases.neg_01.assumption.processes_empty==true and .negative_cases.neg_01.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_01.runtime_claim.status!="verified_full" and (.negative_cases.neg_01.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

NEG-02：`strict + fallbackToCompact=true` 不能直接判定闭环。

- Bad interpretation：既然请求了 strict，就可直接接受 compact fallback 的结果
- Correct interpretation：发生 fallback 后必须 parity rerun，再判定 closure
- Evidence Ref: negative_cases.neg_02
- Verification command:

```bash
jq -e '.negative_cases.neg_02.assumption.fallback_to_compact==true and .negative_cases.neg_02.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_02.runtime_claim.status!="verified_full" and (.negative_cases.neg_02.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

NEG-03：`hops` 与 `gaps` 同时缺失时，不能标记为 verified。

- Bad interpretation：即使没有链路细节也可以给 verified
- Correct interpretation：证据链为空时必须保持 non-verified 并继续采证
- Evidence Ref: negative_cases.neg_03
- Verification command:

```bash
jq -e '.negative_cases.neg_03.assumption.hops_empty==true and .negative_cases.neg_03.assumption.gaps_empty==true and .negative_cases.neg_03.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_03.runtime_claim.status!="verified_full" and (.negative_cases.neg_03.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

## Refactoring Workflow

目标：在 rename/extract/split 之前构建可验证的风险面地图。

Evidence Ref: workflows.refactoring.query  
Evidence Ref: workflows.refactoring.context  
Evidence Ref: workflows.refactoring.cypher

1. `query` 先找候选流程和符号锚点。

```bash
gitnexus query -r GitNexus -l 3 "rename workflow blast radius"
```

2. `context` 看直接调用关系与流程参与度。

```bash
gitnexus context -r GitNexus -f gitnexus/src/mcp/server.ts getNextStepHint
```

3. `cypher` 做结构化证明再改代码。

模板 A（`CALLS`）：

```bash
gitnexus cypher -r GitNexus "MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b:Function {name: 'verifyRuntimeClaimOnDemand'}) RETURN a.name AS caller, a.filePath AS file LIMIT 10"
```

模板 B（`HAS_METHOD`）：

```bash
gitnexus cypher -r GitNexus "MATCH (c:Class)-[:CodeRelation {type: 'HAS_METHOD'}]->(m:Method) RETURN c.name AS class, m.name AS method LIMIT 20"
```

模板 C（`STEP_IN_PROCESS`）：

```bash
gitnexus cypher -r GitNexus "MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process) RETURN s.name AS symbol, p.heuristicLabel AS process, r.step AS step ORDER BY r.step LIMIT 10"
```

重构前决策建议：
- 若 `context.incoming.calls` 很多，先拆小改动再提交
- 若 `STEP_IN_PROCESS` 覆盖面广，先按受影响流程补回归

## Unity vs Generic Behavior

- Unity 检索除了静态调用链，还必须结合 `runtime_claim`、`hops`、`gaps`。
- 通用仓库更常依赖 `CALLS/IMPORTS/HAS_METHOD`，Unity 更依赖资源锚点与 hydration 策略。
- strict 模式发生 fallback 时，Unity 必须先 parity rerun，不能直接给 closure 结论。

## Optimization Metrics

| 指标 | 定义 | 采集方式 | Failure Signal |
| --- | --- | --- | --- |
| 可执行率 | 文档命令可直接执行并返回结构化结果的比例 | 批量执行命令，统计 exit code 与 JSON 可解析率 | 关键命令失败率 > 10% |
| 收敛率 | 从首条 `query` 到可执行下一跳命令的轮次 | 记录每次排查的 `query/context/cypher` 次数 | 中位轮次持续 > 4 |
| 收益率 | 通过结构化检索提前发现风险点的比例 | 对比检索阶段发现问题 vs 回归阶段发现问题 | 回归阶段才发现的问题比例 > 30% |
