# Unity Query / Context / Cypher：面向人的使用指南

## Intro and Audience

这份文档不是操作手册优先，而是理解优先。

它回答四个问题：
- `query`、`context`、`cypher` 各自负责解决什么问题
- 它们会返回什么类型的结果
- 什么时候应该继续深挖
- 什么时候 agent 可以直接把结论返回给用户

相关文档：
- `UNITY_RUNTIME_PROCESS.md`：Unity runtime process 的整体架构说明
- `docs/unity-runtime-process-source-of-truth.md`：Unity runtime process 的语义真理源

适用读者：
- 想理解一个 Unity 功能“是怎么串起来的”的工程师
- 想判断一个运行时结论“能不能站得住”的工程师
- 想在改代码前先知道风险范围的工程师

## Three Tools

先建立一个简单心智模型：
- `query`：回答“系统里有哪些可能相关的流程和符号？”
- `context`：回答“这个具体符号上下游是谁，它处在什么流程里？”
- `cypher`：回答“我需要一条精确的结构化证明，图里到底有哪些关系？”

| 工具 | 用户意图 | 主要返回 | 适合直接回答用户的问题 | 不够用时怎么办 |
| --- | --- | --- | --- | --- |
| `query` | 我想先找相关流程 | `processes[]`、`process_symbols[]`、`definitions[]`、`next_hops[]`，必要时带 `runtime_claim` | “这件事大概率涉及哪些流程/符号？” | 跳到 `context` 看具体符号，或跳到 `cypher` 做结构验证 |
| `context` | 我想看某个符号的上下文 | `symbol`、`incoming`、`outgoing`、`processes[]`、`next_hops[]`，必要时带 `runtime_claim` | “谁调用它？它调用谁？它在不在关键流程里？” | 如果存在歧义、低置信度或要算范围，继续 `cypher` |
| `cypher` | 我要图级别、可验证的关系证明 | `markdown`、`row_count` | “图里确实存在这些关系吗？” | 若仍无法下结论，说明图证据本身不足，需要换锚点或重跑检索 |

## Return Shapes

### `query` 返回什么

`query` 的职责不是给最终证明，而是给“第一轮可行动候选集”。

重点字段：
- `processes[]`：候选执行流。适合回答“系统可能怎么工作”。
- `process_symbols[]`：流程里的关键符号。适合回答“下一步该看谁”。
- `definitions[]`：虽然不在流程里，但和主题相关的独立定义。
- `next_hops[]`：建议 agent 下一条执行什么命令。
- `runtime_claim`：只有显式开启运行时验证时才会出现，用于回答“这个运行时结论是否成立”。

对人类用户的常见解释方式：
- 如果 `processes[]` 很集中且置信度高，agent 可以直接总结“这件事主要发生在这些流程里”。
- 如果 `processes[]` 很散、`next_hops[]` 很多，说明结论还不收敛，应该继续深挖。

Evidence Ref: workflows.exploring.query  
Evidence Ref: workflows.debugging.query  
Evidence Ref: workflows.refactoring.query

### `context` 返回什么

`context` 的职责是把“某个符号”放回真实上下文。

重点字段：
- `symbol`：你当前看的目标符号是谁。
- `incoming.calls`：谁调用它。
- `outgoing.calls`：它调用谁。
- `processes[]`：它参与了哪些流程。
- `next_hops[]`：如果还没看够，下一步建议看哪个符号。
- `runtime_claim`：当你要求运行时验证时，返回针对这个符号的闭环判断。

对人类用户的常见解释方式：
- 如果调用方和被调方都很清楚，agent 可以直接解释该符号的职责。
- 如果返回了多个候选或歧义符号，agent 不应假装明确，应该先消歧。

Evidence Ref: workflows.exploring.context  
Evidence Ref: workflows.debugging.context  
Evidence Ref: workflows.refactoring.context

### `cypher` 返回什么

`cypher` 的职责不是“探索”，而是“证明”。

返回结构很简单：
- `markdown`：结果表格
- `row_count`：命中行数

对人类用户的常见解释方式：
- `row_count > 0`：图里确实有这类关系，可以当作结构证据。
- `row_count = 0`：当前写法没有命中，不一定说明关系不存在，也可能是锚点不对。

Evidence Ref: workflows.exploring.cypher  
Evidence Ref: workflows.debugging.cypher  
Evidence Ref: workflows.refactoring.cypher

## Key Parameters

参数的作用也需要先讲清楚，否则用户会看到很多命令但不知道为什么要加这些 flag。

| 参数 | 主要作用 | 什么时候用 | 不该怎么理解 |
| --- | --- | --- | --- |
| `runtime_chain_verify=on-demand` | 请求运行时闭环判断 | 用户明确问“这条运行时链到底是否成立” | 不是默认探索模式，也不是所有查询都该开 |
| `unity_resources=on` | 把 Unity 资源证据带进来 | 话题跨资源层和代码层时 | 不是单纯“多返回一点信息” |
| `unity_hydration=compact/parity` | 控制 Unity 证据展开深度 | `compact` 用于快速探路，`parity` 用于最终确认 | `compact` 不等于可做最终 closure 结论 |
| `scope_preset` | 控制检索范围噪音 | Unity 项目太大、需要收窄搜索时 | 不是结果真实性开关 |
| `file` / `uid` | 消歧具体符号 | 名字重复时 | 不是“可选优化”，而是避免看错符号 |
| `resource_path_prefix` | 用资源路径给检索加锚点 | 用户知道具体 prefab/asset 路径时 | 不是必须项，但常能显著提升收敛 |

## Agent Decision Rules

用户真正关心的是：agent 到底什么时候该继续挖，什么时候该直接回答。

### 什么时候可以直接给结论

满足以下条件时，agent 可以直接总结，不必继续深挖：
- `query` 已经返回单个或少量高置信度流程，且主题清晰
- `context` 的上下游关系清楚，没有符号歧义
- 对运行时问题，如果 `runtime_claim.status=verified_full`，并且 `hops` 非空、`gaps` 为空
- 对结构问题，如果 `cypher.row_count > 0` 且查询正好命中你要证明的关系

这类结论通常是：
- “这个功能主要经过哪几个流程”
- “这个符号的职责是什么”
- “这条结构关系在图里确实存在”
- “这条运行时链已经闭环”

### 什么时候必须继续深挖

出现以下信号时，不应该直接给用户下结论：
- `query` 返回很多候选流程，没有明显主路径
- `context` 返回歧义符号，或者 `processes[]` 只是低置信度线索
- `evidence_mode=resource_heuristic`
- `needsParityRetry=true`
- `fallbackToCompact=true`
- `runtime_claim.status=failed`
- `runtime_claim.hops` 和 `runtime_claim.gaps` 说明还有缺口
- `cypher.row_count=0`，但你并不能证明查询写法已经覆盖了正确锚点

这时 agent 应该做的不是“硬总结”，而是明确告诉用户：
- 当前证据到哪一层
- 缺口在哪
- 下一跳应该看什么

## Exploring Workflow

用户意图：
- “这个功能大概怎么工作？”
- “这个概念在代码里主要落在哪些流程？”

推荐顺序：
1. 先用 `query` 找流程和符号候选
2. 再用 `context` 看核心符号的上下游
3. 最后仅在需要证明关系时用 `cypher`

典型命令：

```bash
gitnexus query -r GitNexus -l 3 "runtime chain verify"
```

这个阶段最重要的不是记住命令，而是会读这几个字段：
- `processes[]`
- `process_symbols[]`
- `processes[].process_ref.reader_uri`
- `next_hops[]`

如何对用户说人话：
- 如果 `processes[]` 明显集中，可以直接说“当前最相关的是这些流程”
- 如果 `next_hops[]` 还很多，就说“已找到方向，但还需要继续看这些符号”

示例信号：
- `processes[0].process_ref.reader_uri = gitnexus://repo/GitNexus/process/proc_46_bm25search`
- `next_hops[0].next_command = gitnexus context --repo "GitNexus" --unity-resources on --unity-hydration parity "normalizePath"`

这里的含义不是“用户现在必须自己跑这条命令”，而是：
- agent 已经有了下一跳
- 还没到可以终结解释的时候

## Debugging Workflow

用户意图：
- “这条运行时链真的成立吗？”
- “为什么现在还不能说它闭环了？”

推荐顺序：
1. 用 `query + runtime_chain_verify=on-demand` 请求运行时判断
2. 用 `runtime_claim` 判断是已闭环、证据不足，还是验证失败
3. 只有需要理解具体符号上下游时再跳 `context`

典型命令：

```bash
gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --scope-preset unity-all "verifyRuntimeClaimOnDemand runtime closure"
```

这一类问题，用户最关心的不是流程列表，而是最终判断边界：
- `verifier-core`：验证器内部结论
- `policy-adjusted`：对外能否安全下结论
- `runtime_claim.reason`：为什么失败
- `hops` / `gaps`：证据已经到哪，缺口还在哪

必须讲清楚的规则：
- `verified_full` 才能说“运行时链闭环”
- 但即使是 `verified_full`，也必须满足 `hops > 0` 且 `gaps = 0`
- 若 `needsParityRetry=true`，说明还不能收口
- 若 `fallbackToCompact=true`，说明 strict 结果发生了退化，不能直接拿去下 closure 结论

### Negative Semantic Cases

NEG-01：`processes=[]` 不等于“运行时链不存在”。

- 错误理解：没有流程行，所以可以直接否定
- 正确理解：要看 `runtime_claim`，而不是只看 `processes[]`
- Evidence Ref: negative_cases.neg_01
- Verification command:

```bash
jq -e '.negative_cases.neg_01.assumption.processes_empty==true and .negative_cases.neg_01.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_01.runtime_claim.status!="verified_full" and (.negative_cases.neg_01.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_01.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

NEG-02：`strict + fallbackToCompact=true` 不能直接判定闭环。

- 错误理解：既然请求了 strict，返回什么都能当最终结论
- 正确理解：一旦 fallback，必须 parity rerun
- Evidence Ref: negative_cases.neg_02
- Verification command:

```bash
jq -e '.negative_cases.neg_02.assumption.fallback_to_compact==true and .negative_cases.neg_02.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_02.runtime_claim.status!="verified_full" and (.negative_cases.neg_02.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_02.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

NEG-03：`hops` 与 `gaps` 同时缺失时，不能标记为 verified。

- 错误理解：没有链路细节也可以给“已验证”
- 正确理解：没有链材料就不能给 closure
- Evidence Ref: negative_cases.neg_03
- Verification command:

```bash
jq -e '.negative_cases.neg_03.assumption.hops_empty==true and .negative_cases.neg_03.assumption.gaps_empty==true and .negative_cases.neg_03.runtime_claim.verification_core_status=="failed" and .negative_cases.neg_03.runtime_claim.status!="verified_full" and (.negative_cases.neg_03.runtime_claim.reason=="rule_not_matched" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_evidence_missing" or .negative_cases.neg_03.runtime_claim.reason=="rule_matched_but_verification_failed")' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```

## Refactoring Workflow

用户意图：
- “我改这个符号，会影响到哪里？”
- “当前是不是已经足够安全，可以开始改？”

推荐顺序：
1. `query` 找相关流程和高频锚点
2. `context` 看该符号的直接上下游与流程参与
3. `cypher` 对关键结构关系做证明

典型命令：

```bash
gitnexus query -r GitNexus -l 3 "rename workflow blast radius"
```

这个阶段，用户最关心的是“改动风险”，不是“工具返回了多少字段”。

所以 agent 应该优先回答：
- 它有多少直接调用方
- 它是否处在关键流程里
- 是否存在跨模块影响

可直接复用的结构证明模板：

`CALLS`：

```bash
gitnexus cypher -r GitNexus "MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b:Function {name: 'verifyRuntimeClaimOnDemand'}) RETURN a.name AS caller, a.filePath AS file LIMIT 10"
```

`HAS_METHOD`：

```bash
gitnexus cypher -r GitNexus "MATCH (c:Class)-[:CodeRelation {type: 'HAS_METHOD'}]->(m:Method) RETURN c.name AS class, m.name AS method LIMIT 20"
```

`STEP_IN_PROCESS`：

```bash
gitnexus cypher -r GitNexus "MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process) RETURN s.name AS symbol, p.heuristicLabel AS process, r.step AS step ORDER BY r.step LIMIT 10"
```

什么时候可以直接告诉用户“可以开始改了”：
- `context` 已经说明直接调用方有限
- `STEP_IN_PROCESS` 没有显示它处在大量关键流程中
- `cypher` 已经补齐了你真正关心的结构关系

如果还不能直接开始改，agent 应该明确说：
- 现在还缺哪类结构证据
- 下一步要补哪一种关系查询

## Unity vs Generic Behavior

Unity 与普通静态代码检索的最大差异，不在“命令不同”，而在“结论门槛不同”。

- 普通仓库常常只需要静态调用链就能回答问题
- Unity 往往需要资源层与代码层共同成立
- 因此 Unity 更常出现“看起来有线索，但还不能闭环”的场景
- 这也是为什么 `runtime_claim`、`hops`、`gaps`、`needsParityRetry`、`fallbackToCompact` 在 Unity 语境里很关键

## Optimization Metrics

| 指标 | 定义 | 采集方式 | Failure Signal |
| --- | --- | --- | --- |
| 可执行率 | 文档中的关键命令能否直接跑通并返回结构化结果 | 定期执行文档里的示例命令，统计 exit code 与 JSON 可解析率 | 关键命令失败率超过 10% |
| 收敛率 | 用户问题从首条检索到可返回结论所需轮次 | 记录一次任务中 `query/context/cypher` 的调用次数 | 中位轮次持续高于 4 |
| 收益率 | 文档是否帮助 agent 更早收敛到正确结论 | 对比“检索阶段发现风险”与“回归后才发现风险”的比例 | 回归后才暴露的问题比例高于 30% |

