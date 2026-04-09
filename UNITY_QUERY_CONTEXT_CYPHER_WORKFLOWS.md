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
| `query` | 我想先找相关流程 | 默认 slim：`summary`、`candidates`、`process_hints`、`resource_hints`、`decision`、`missing_proof_targets`、`suggested_context_targets`、`upgrade_hints`、`runtime_preview`；需要时再显式 `response_profile=full` 看 `processes[]`、`process_symbols[]`、`definitions[]`、`next_hops[]`、`runtime_claim` | “这件事大概率涉及哪些流程/符号？” | 先按 slim 提示收窄，再跳到 `context` 或 `cypher` |
| `context` | 我想看某个符号的上下文 | 默认 slim：`symbol`、`incoming`、`outgoing`、`processes`、`resource_hints`、`verification_hint`、`missing_proof_targets`、`suggested_context_targets`、`upgrade_hints`、`runtime_preview`；需要时再显式 `response_profile=full` 看 `next_hops[]`、`runtime_claim` 等重载荷字段 | “谁调用它？它调用谁？它在不在关键流程里？” | 先消歧/收窄；如果还不够，再 `full` 或 `cypher` |
| `cypher` | 我要图级别、可验证的关系证明 | `markdown`、`row_count` | “图里确实存在这些关系吗？” | 若仍无法下结论，说明图证据本身不足，需要换锚点或重跑检索 |

## Return Shapes

### `query` 返回什么

`query` 的职责不是给最终证明，而是给“第一轮可行动候选集”。
除非显式传 `response_profile=full`，否则这里说的都是默认 slim 返回。

重点字段：
- `summary`：当前检索最可能的主题摘要。
- `candidates[]`：统一重排后的首轮符号候选。适合回答“下一步优先看谁”。
- `process_hints[]`：候选执行流摘要。适合回答“系统可能怎么工作”。
- `resource_hints[]`：资源层/验证层下一跳线索。
- `decision.primary_candidate`：当前 top1 符号锚点。
- `decision.recommended_follow_up`：默认推荐的收窄动作，优先是 `resource_path_prefix=`、`uid=`、`name=` 这种可执行 narrowing。
- `suggested_context_targets[]`：结构化去歧义目标，可能带 `uid` / `filePath`。
- `missing_proof_targets[]`：当前还缺的证据面。
- `runtime_preview`：运行时验证的快速摘要；若要看 `runtime_claim` 细节，需要 `response_profile=full`。

对人类用户的常见解释方式：
- 如果 `candidates[]`、`process_hints[]` 很集中且 `decision.primary_candidate` 稳定，agent 可以直接总结“这件事主要发生在这些流程/符号里”。
- 如果 `decision.recommended_follow_up` 仍然指向新的资源或消歧目标，说明结论还没收敛，应该先 narrowing 再深挖。

Evidence Ref: workflows.exploring.query  
Evidence Ref: workflows.debugging.query  
Evidence Ref: workflows.refactoring.query

### `context` 返回什么

`context` 的职责是把“某个符号”放回真实上下文。
默认同样返回 slim 载荷；只有显式 `response_profile=full` 才会把更重的 Unity / runtime 细节完整展开。

重点字段：
- `symbol`：你当前看的目标符号是谁。
- `incoming.calls`：谁调用它。
- `outgoing.calls`：它调用谁。
- `processes`：它参与了哪些流程摘要。
- `verification_hint`：低置信流程下建议优先验证的符号。
- `resource_hints[]`：资源层或验证层下一跳线索。
- `suggested_context_targets[]`：同名符号消歧目标；带 `uid` 时优先用它。
- `runtime_preview`：当你要求运行时验证时，返回针对这个符号的闭环摘要；若要看 `runtime_claim` 细节，需要 `response_profile=full`。

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
| `response_profile=full` | 从默认 slim 升级到 legacy heavy payload | slim 已经给出方向，但你需要 `processes[]`、`process_symbols[]`、`definitions[]`、`next_hops[]`、`runtime_claim`、hydration 诊断时 | 不是默认模式，也不是第一跳就该开 |
| `runtime_chain_verify=on-demand` | 请求运行时闭环判断 | 用户明确问“这条运行时链到底是否成立” | 不是默认探索模式，也不是所有查询都该开 |
| `unity_resources=on` | 把 Unity 资源证据带进来 | 话题跨资源层和代码层时 | 不是单纯“多返回一点信息” |
| `unity_hydration_mode=compact/parity`（MCP） / `--unity-hydration compact|parity`（CLI） | 控制 Unity 证据展开深度 | `compact` 用于快速探路，`parity` 用于最终确认 | `compact` 不等于可做最终 closure 结论 |
| `scope_preset` | 控制检索范围噪音 | Unity 项目太大、需要收窄搜索时 | 不是结果真实性开关 |
| `file` / `uid` | 消歧具体符号 | 名字重复时 | 不是“可选优化”，而是避免看错符号 |
| `resource_path_prefix` | 用资源路径给检索加锚点 | 用户知道具体 prefab/asset 路径时 | 不是必须项，但常能显著提升收敛 |

## Agent Decision Rules

用户真正关心的是：agent 到底什么时候该继续挖，什么时候该直接回答。

### 什么时候可以直接给结论

满足以下条件时，agent 可以直接总结，不必继续深挖：
- `query` 的 `candidates[]` / `process_hints[]` 已经收敛，且 `decision.primary_candidate` 与主题一致
- `context` 的上下游关系清楚，没有符号歧义
- 对运行时问题，如果 slim `runtime_preview.status=verified_full` 且没有额外 strict/parity 风险，再根据需要升级 full 看 `runtime_claim`
- 对结构问题，如果 `cypher.row_count > 0` 且查询正好命中你要证明的关系

这类结论通常是：
- “这个功能主要经过哪几个流程”
- “这个符号的职责是什么”
- “这条结构关系在图里确实存在”
- “这条运行时链已经闭环”

### 什么时候必须继续深挖

出现以下信号时，不应该直接给用户下结论：
- `query` 返回很多候选流程，没有明显主路径
- `decision.recommended_follow_up` 仍提示新的 `resource_path_prefix=` / `uid=` / `name=` narrowing
- `context` 返回歧义符号，或者 `processes` 只是低置信度线索
- `evidence_mode=resource_heuristic`
- 你只看到了 slim `runtime_preview`，但还缺 full `runtime_claim` / hydration 诊断
- full 结果里 `needsParityRetry=true`
- full 结果里 `fallbackToCompact=true`
- `runtime_preview.status=failed` 或 full `runtime_claim.status=failed`
- full `runtime_claim.hops` 和 `runtime_claim.gaps` 说明还有缺口
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
gitnexus query --repo GitNexus --response-profile slim "runtime chain verify"
```

这个阶段最重要的不是记住命令，而是会读这几个字段：
- `candidates[]`
- `process_hints[]`
- `decision.primary_candidate`
- `decision.recommended_follow_up`
- `suggested_context_targets[]`

如何对用户说人话：
- 如果 `process_hints[]` 明显集中，可以直接说“当前最相关的是这些流程”
- 如果 `decision.recommended_follow_up` 还在引导新的 narrowing，就说“已找到方向，但还需要继续收窄”

示例信号：
- `decision.primary_candidate = normalizePath`
- `decision.recommended_follow_up = uid=Function:src/utils/path.ts:normalizePath`

这里的含义不是“用户现在必须自己跑这条命令”，而是：
- agent 已经有了下一跳
- 还没到可以终结解释的时候

## Debugging Workflow

用户意图：
- “这条运行时链真的成立吗？”
- “为什么现在还不能说它闭环了？”

推荐顺序：
1. 用 `query + runtime_chain_verify=on-demand` 请求运行时判断
2. 先用 slim `runtime_preview` 做快速判断；需要证据细节时再升到 full 看 `runtime_claim`
3. 只有需要理解具体符号上下游时再跳 `context`

典型命令：

```bash
gitnexus query --repo GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --response-profile slim --scope-preset unity-all "verifyRuntimeClaimOnDemand runtime closure"
```

这一类问题，用户最关心的不是流程列表，而是最终判断边界：
- slim `runtime_preview`：快速状态摘要
- `verifier-core`：验证器内部结论
- `policy-adjusted`：对外能否安全下结论
- full `runtime_claim.reason`：为什么失败
- full `hops` / `gaps`：证据已经到哪，缺口还在哪

必须讲清楚的规则：
- `verified_full` 才能说“运行时链闭环”
- 但如果你只看 slim，最多只能把它当作快速信号；要解释缺口与证据链，必须升级到 full
- 若 full 结果出现 `needsParityRetry=true`，说明还不能收口
- 若 full 结果出现 `fallbackToCompact=true`，说明 strict 结果发生了退化，不能直接拿去下 closure 结论

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
- 这也是为什么 slim `runtime_preview`、以及 full `runtime_claim` / `hops` / `gaps` / `needsParityRetry` / `fallbackToCompact` 在 Unity 语境里很关键

## Source Anchor Map

这一节的目的不是给普通用户读源码，而是保证文档里的关键概念都能追溯到实现。

| 文档概念 | 关键字段/行为 | 实现锚点 |
| --- | --- | --- |
| CLI 命令入口 | `query` / `context` / `cypher` 的命令注册与分发 | `gitnexus/src/cli/tool.ts`, `gitnexus/src/cli/index.ts` |
| MCP 工具 schema | 参数名、枚举值、对外接口定义 | `gitnexus/src/mcp/tools.ts` |
| slim 返回结果组装 | `candidates`, `process_hints`, `resource_hints`, `decision`, `missing_proof_targets`, `suggested_context_targets`, `runtime_preview` 的组装 | `gitnexus/src/mcp/local/agent-safe-response.ts` |
| full 返回结果组装 | `processes[]`, `process_symbols[]`, `definitions[]`, `next_hops[]`, `runtime_claim` 的拼装 | `gitnexus/src/mcp/local/local-backend.ts` |
| 运行时双层语义 | `policy-adjusted`、non-guarantees、closure 调整逻辑 | `gitnexus/src/mcp/local/runtime-claim.ts` |
| 运行时强验证 | `runtime_chain_verify=on-demand`, `hops`, `gaps`, verifier-core 结果 | `gitnexus/src/mcp/local/runtime-chain-verify.ts` |
| 流程引用与 reader URI | `process_ref`, `reader_uri`, persistent/derived process 链接 | `gitnexus/src/mcp/local/process-ref.ts`, `gitnexus/src/mcp/resources.ts` |

## Optimization Metrics

| 指标 | 定义 | 采集方式 | Failure Signal |
| --- | --- | --- | --- |
| 可执行率 | 文档中的关键命令能否直接跑通并返回结构化结果 | 定期执行文档里的示例命令，统计 exit code 与 JSON 可解析率 | 关键命令失败率超过 10% |
| 收敛率 | 用户问题从首条检索到可返回结论所需轮次 | 记录一次任务中 `query/context/cypher` 的调用次数 | 中位轮次持续高于 4 |
| 收益率 | 文档是否帮助 agent 更早收敛到正确结论 | 对比“检索阶段发现风险”与“回归后才发现风险”的比例 | 回归后才暴露的问题比例高于 30% |
