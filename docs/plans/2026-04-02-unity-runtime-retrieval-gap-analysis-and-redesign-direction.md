# Unity Runtime 检索缺口分析与重设计方向

Date: 2026-04-02  
Owner: GitNexus
Status: Draft (analysis baseline for redesign)

## 0. 文档目标

本文件用于沉淀当前 Unity runtime 检索链路在真实仓库中的能力边界，明确：

1. 已有实现到底做到了什么；
2. 与用户真实查询意图之间的差距；
3. 差距根因属于“规则数据缺失”还是“框架/数据模型缺口”；
4. 后续应如何重设计规则数据结构与生成/编排工作流。

本文作为下一步规则体系与索引构建联动改造的事实基线。

---

## 1. 用户意图目标（当前会话澄清）

用户目标不是“一次查询直接输出完整调用链”，而是：

1. 查询结果必须提供足够的下一跳线索，支持继续检索；
2. 对 Unity（特别是 ScriptableObject / 资源序列化引用）应形成可追踪链路；
3. 尽可能把资源引用链转换到 GitNexus 现有 CALLS/process 框架可消费的路径；
4. 在 `EnergyByAttackCount + 1_weapon_0_james_new.asset` 这类场景中，至少应命中关键 GunGraph 资源并可继续跳转。

该目标强调“可继续检索的链路可解释性”，而非单次完备性。

---

## 2. 本次事实核查结果（2026-04-02）

### 2.1 索引重建（已执行）

执行命令：

```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on \
GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --repo-alias neonspark-core --force
```

结果：

- 索引完成：99.6s
- Repo: `neonspark-core`
- Commit: `c7f8d8d`
- Stats: `44399 files / 134130 nodes / 333867 edges / 300 processes`

### 2.2 关键边计数（重建后）

通过 `cypher` 核查：

1. synthetic CALLS (`reason` 包含 `unity-lifecycle-synthetic` 或 `unity-runtime-loader-synthetic`)：`256`
2. `UNITY_RESOURCE_SUMMARY`：`37691`
3. `UNITY_COMPONENT_INSTANCE`：`0`
4. `UNITY_SERIALIZED_TYPE_IN`：`0`

结论：

- `Unity synthetic CALLS` 受 analyze 环境变量控制，已生效；
- 组件级/序列化类型级关系仍未入图（不是本次 analyze 参数问题）。

### 2.3 synthetic calls 结构（当前实现）

reason 分布：

- `unity-runtime-loader-synthetic`: 155
- `unity-lifecycle-synthetic`: 101

高频方法对（样例）：

- `GetValue -> CheckReload`
- `RegisterEvents -> StartRoutineWithEvents`
- `StartRoutineWithEvents -> GetValue`
- `unity-runtime-root -> Awake/OnEnable/OnDisable/...`

### 2.4 目标案例资源链事实

针对用户指定武器资产：

- `Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset`

事实：

1. 该资产包含 `gungraph guid: 7289942075c31ab458d5214b4adc38a1`；
2. 该 guid 对应 `Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset.meta`；
3. `1_weapon_0_james1.asset` 内确实存在 `m_Script guid: 1b63118991a192f4d8ac217fd7fe49ce`（即 `EnergyByAttackCount.cs.meta` guid）。

即：`james_new.asset -> gungraph(james1.asset) -> EnergyByAttackCount node` 这条资源链在文件事实层成立。

### 2.5 当前检索表现与事实不一致点

对 `context/query(EnergyByAttackCount, unity_resources=on, parity)` 的输出中：

1. `resourceBindings` 未出现 `1_weapon_0_james1.asset`；
2. 验证 hint 指向其他 graph（如 `1_weapon_0_cassie.asset`）；
3. runtime claim 对用户 query 资产给出 `queried resource is not present in symbol binding evidence`；
4. `unityDiagnostics` 出现：
   - `No MonoBehaviour block matched script guid ... in ...1_weapon_0_james1.asset`

这与 2.4 的文件事实形成直接冲突，表明“资源解析/绑定层”存在漏召回或解析判定错误。

### 2.6 第二轮事实核查补充（2026-04-02 晚）

在执行与独立 review 后，补充核查得到以下新事实：

1. 新增 Unity 边已可写入（CLI cypher 可见）：
   - `UNITY_COMPONENT_INSTANCE`: 67642
   - `UNITY_SERIALIZED_TYPE_IN`: 4582
   - `UNITY_ASSET_GUID_REF`: 8196
   - `UNITY_GRAPH_NODE_SCRIPT_REF`: 61684
2. 但 anchor 链仍未闭环：`james_new -> james1` 命中，`james1 -> EnergyByAttackCount` 未稳定命中到图边/runtime claim。
3. `next_hops` 已能包含 `james1.asset`，但不是稳定 top-1，说明排序策略仍不足以表达“用户显式资源 seed 优先”。
4. `runtime_claim` 仍可能报 `queried resource absent`，反映 verifier 语义仍是“direct binding 必须命中”，尚未接受“seed->mapped resource”的等价证据。
5. `next_hops.next_command` 与 CLI 参数契约出现不一致（生成了 CLI 不支持的参数），破坏“线索可执行性”目标。
6. 存在工具链一致性风险：CLI 与 MCP 侧对同一 repo 的观测结果可能不一致，若无统一执行入口门禁，易出现“局部通过、整体失败”。

---

## 3. 当前实现能力分层（As-Is）

### 3.1 检索主链

1. `query` 使用 `BM25 + semantic` RRF 融合召回；
2. `semantic` 依赖 embedding（当前 neonspark embeddings=0，实际主要依赖 BM25）；
3. process 归并依赖 `STEP_IN_PROCESS` + `HAS_METHOD` 投影。

### 3.2 Unity 证据链

1. Unity hydration 为 query-time 旁路（compact/parity）；
2. 资源证据主要来自 `UNITY_RESOURCE_SUMMARY` + 运行时补水；
3. `processRows` 为空时注入 `resource_heuristic` low clue。

### 3.3 runtime chain verify

1. `runtime_chain_verify=on-demand` 触发规则匹配与 hop 验证；
2. 当前核心执行更偏 `trigger token + required_hops + CALLS heuristic`；
3. 满足 required hops 时可 `verified_full`，但不等价于业务链完整覆盖。

### 3.4 synthetic CALLS

1. analyze 时可注入 lifecycle + runtime-loader synthetic CALLS；
2. anchor 集合与确定性桥接对由代码常量定义；
3. 其价值主要在“方法链可见性增强”，不直接解决资源映射缺口。

---

## 4. 现有实现缺陷（面向用户目标）

### 4.1 资源命中缺口（核心 blocker）

1. 用户已给定目标资产路径时，系统未把该路径纳入首要证据主线；
2. `resourceBindings` 与真实 `asset -> graph -> node` 链不一致；
3. 导致下一跳线索偏离用户意图，无法继续精确检索。

### 4.2 图模型缺口

1. 缺少组件实例/序列化类型关系持久边（`UNITY_COMPONENT_INSTANCE` / `UNITY_SERIALIZED_TYPE_IN` 为 0）；
2. 现有 `UNITY_RESOURCE_SUMMARY` 粒度偏粗，不足以表达资源内对象级关系；
3. 缺少 asset guid 引用反向索引边，难以从“武器资产”稳定跳到“目标 graph”。

### 4.3 process 与 runtime verify 双轨割裂

1. process 仍是 CALLS tracing 的产物；
2. runtime verify 是请求时旁路，不回写 process；
3. 用户看到 `process` 与 `runtime_chain` 语义不一致，难以形成统一调查路径。

### 4.4 规则执行能力不足

1. 当前 rule DSL 虽有 topology/closure 结构，但验证执行未形成真正“拓扑求解”；
2. 规则更多影响 required hops 判定，而非驱动真实多跳资源-代码拼链。

### 4.5 query UX 缺口

1. low clue 场景的 `verification_hint` 目标常为“首个 binding”，缺乏 query-aware rerank；
2. 对“已指定资源路径”的请求，没有输出“最相关可跳转证据优先级”。

### 4.6 实现工程化缺口（本轮新增）

1. Unity YAML 解析对 object header 的兼容性不足（例如负数 object id），会导致真实存在的 MonoBehaviour 节点漏解析；
2. `next_hops` 的命令模板与 CLI/MCP 契约未统一，导致“输出可读但不可执行”；
3. 验证口径与检索口径未对齐（retrieval 已支持映射链，verifier 仍按 direct binding 约束）；
4. 缺少“同一入口、同一数据源”的集成门禁，导致验收结果不稳定。

---

## 5. 根因分类：哪些靠规则能补，哪些不能

### 5.1 规则可补

1. trigger family / query intent 匹配规则；
2. required hops / failure map / guarantees 语义；
3. synthetic CALLS 的 anchor 与桥接集合可配置化。

### 5.2 规则难以单独补齐

1. 资源解析层漏召回（如 `james1.asset` 误判未匹配）；
2. 图中缺失对象级关系边；
3. 缺少资源 guid 引用图与可追踪路径索引。

结论：

- 仅把 runtime anchors/桥接“规则化并编排入索引”不足以解决用户当前痛点；
- 必须同时补齐“资源关系建模 + 规则驱动执行引擎 + query 线索排序”。

---

## 6. 是否需要从头重来

结论：不建议“整体从头重写”，建议“Unity runtime 子系统重构”。

原因：

1. GitNexus 的基础设施（repo 管理、索引管线、MCP 接口、通用 query/context）可复用；
2. 问题集中在 Unity 领域建模与规则执行层，不在通用框架本体。

建议策略：

- 保留主框架；
- 重构 Unity runtime 相关的数据层、规则层、检索编排层。

---

## 7. 规则数据结构重设计方向（To-Be）

建议把规则拆成三类并明确执行阶段。

### 7.1 Analyze Rules（索引期规则）

目标：把领域知识编译进图。

建议字段：

1. `host_match`：基类/命名/路径/命名空间匹配；
2. `anchors`：生命周期、loader、runtime 方法集合；
3. `bridge_templates`：确定性桥接对/序列；
4. `resource_projection`：资源对象关系提取策略（asset->guid->object->script）；
5. `edge_emit`：输出边类型、confidence、reason。

输出：

- `CALLS` synthetic edges
- `UNITY_COMPONENT_INSTANCE`
- `UNITY_SERIALIZED_TYPE_IN`
- （新增建议）`UNITY_ASSET_GUID_REF` / `UNITY_GRAPH_NODE_SCRIPT_REF`

### 7.2 Retrieval Rules（查询期编排规则）

目标：保证“下一跳可用”。

建议字段：

1. `intent_match`：query token + resource path + symbol tuple；
2. `seed_priority`：资源 seed 选择顺序（query asset > linked graph > fallback）；
3. `hop_planner`：资源跳转顺序模板；
4. `hint_policy`：low clue 时的 next target 生成规则；
5. `ranking_overrides`：关键路径 boost/噪音抑制。

输出：

- `next_hops[]`（可直接继续 query 的明确目标）
- `trace_candidates[]`（按可置信度排序）

### 7.3 Verification Rules（验证期规则）

目标：可审计闭环，不等同于 process。

建议字段：

1. `topology`：可执行 hop DAG（非仅 required_hops 列表）；
2. `evidence_extractors`：每 hop 的证据提取器；
3. `pass_criteria`：segment 通过条件；
4. `claim_semantics`：status/evidence_level 与 guarantees 规则。

输出：

- `runtime_chain` + `gaps`
- `why_not_next`（失败原因和下一步命令）

---

## 8. 规则生成与编排工作流重设计方向

## 8.1 现有 Rule Lab 需要补的能力

1. 从“离线规则文本生成”升级为“可编译到 analyze/query/verify 三阶段”；
2. 增加 `compile` 阶段，生成可执行 rule bundle（含 schema 版本）；
3. 增加 `probe` 阶段，验证资源链命中率与下一跳可用性。

## 8.2 建议新流程

1. `discover`：收集失败 query 与事实样本（含用户给定资源路径）；
2. `analyze`：生成三类候选规则（analyze/retrieval/verification）；
3. `review-pack`：展示候选规则对典型 query 的链路影响；
4. `curate`：人工确认 topology 与资源映射语义；
5. `promote`：写入规则目录并生成编译产物；
6. `reindex-with-rules`：带规则重新 analyze；
7. `regress`：运行 query 回归集，核查
   - 关键资源命中率
   - 下一跳可用率
   - 误导 hint 率
   - runtime claim 真实性。

---

## 9. 建议优先级（解决方向）

P0（必须先做）：

1. 修复资源解析漏召回（包含 YAML object header 兼容性，如负数 object id）；
2. 恢复/实现 `UNITY_COMPONENT_INSTANCE` 与 `UNITY_SERIALIZED_TYPE_IN` 边持久化；
3. 查询时若用户提供资源路径，强制纳入 seed 优先级第一；
4. 对齐 verifier 语义：支持 `seed -> mapped resource` 作为等价证据，避免误报 `queried resource absent`；
5. 对齐 `next_hops.next_command` 与 CLI/MCP 参数契约，保证“可执行”。

P1：

1. 将 synthetic anchors/bridges 从代码常量迁移到 analyze rules；
2. retrieval rule 驱动 next-hop 输出；
3. 提供 query 参数控制 `resource_seed_mode`（strict query-asset / relaxed）。

P2：

1. verifier 从 heuristic 选边升级为 topology 执行器；
2. process 与 runtime_chain 的关系可观测化（显式“来自 verify 旁路/持久流程”标记）。

---

## 10. 验收建议（面向用户意图）

以 `EnergyByAttackCount + 1_weapon_0_james_new.asset` 为基准：

1. 查询输出必须包含 `1_weapon_0_james1.asset` 作为高优先下一跳；
2. 至少输出一条 `asset -> gungraph -> node-script` 的可验证路径；
3. `verification_hint.target` 不得偏离用户提供资源（除非给出冲突解释）；
4. runtime claim 若未覆盖用户资源，应明确说明“冲突资源路径及原因”；
5. `next_hops[]` 提供的命令必须能在当前 CLI/MCP 契约下直接执行。

---

## 11. 当前结论

1. 当前系统已具备“方法链增强能力”（synthetic CALLS），但仍缺“资源链准确命中能力”；
2. 用户核心痛点在资源链，不在单纯方法桥接；
3. 下一阶段应把规则重设计聚焦到“三阶段规则编排 + 资源关系入图 + 查询下一跳可用性”；
4. 预期落差主要来自工程门禁不足（解析健壮性、契约一致性、验证语义一致性），不是用户目标不合理；
5. 结论上应优先优化执行计划与验收门禁，再进入下一轮实现，而非推倒重来。
