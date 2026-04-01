# Unity Runtime Process 结构化修复设计（Phased, v2）

Date: 2026-04-01
Owner: GitNexus
Status: Draft (Review-Synced)

## 0. 文档目的

本设计用于系统性解决 Unity runtime process 在真实仓库验证中暴露的结构性问题，目标是契约一致、可测验收、长期可扩展，而不是快速修补单点 bug。

本设计直接吸收以下输入：

1. 真实仓库问题报告：`/Volumes/Shuttle/projects/neonspark/Docs/Reports/2026-04-01-gitnexus-exploring-reload-callchain-retro.md`
2. Unity runtime process 真理源：`docs/unity-runtime-process-source-of-truth.md`
3. 现状实现与复现实证（`query/context/runtime_chain_verify`）

## 1. 已确认约束（Hard Constraints）

1. 不保留旧行为兼容窗口。
- 原因：Unity runtime process 功能尚未对外发布。
- 含义：允许直接切换到新契约，不要求双轨并存一个 release 周期。

2. 不保留内置 fallback。
- 原因：fallback 会污染后续验证标准，掩盖规则契约真实性能。
- 含义：运行时验证仅由项目规则契约驱动；无规则命中时必须显式失败并返回可执行提示。

3. Reload 链路必须用新规则契约复现。
- 含义：`Reload` 不再走 hardcode verifier 特例，而是走 rule-based contract，仍要产出可验 hop 链路。

## 2. 问题分解（来自报告）

本次修复范围按 4 类问题拆解，每类单独一个 Phase：

1. Process 可读性断层。
- 现象：`proc:heuristic:*` 无法直接通过 process resource 读取。

2. 验证结论语义过宽。
- 现象：`verified_full` 易被误读为“运行时根因已闭环”。

3. Unity 资源证据噪声过大。
- 现象：`resourceBindings` 体量大、阅读成本高、定位效率低。

4. compact/parity 完整性语义不稳定。
- 现象：用户感知“何时需要 parity”不够确定，策略解释不足。

离线 Rule Lab 工具作为独立 Phase（Phase 5），解决规则生成与业务语义落地的可扩展性。

## 3. 目标架构（Target Architecture）

### 3.1 契约层

1. `process_ref`：统一 process 身份与可读性。
2. `runtime_claim`：将验证结果从状态词升级为“有作用域的声明（claim）”。
3. `unity_evidence_mode` + `hydration_policy`：统一证据交付与完整性策略。

### 3.2 执行层

1. `Verifier Rule Registry`：规则发现、匹配、执行、评分。
2. `Evidence Adapter`：按资源格式抽取标准化证据事实（facts）。
3. `Derived Process Resolver`：让派生流程也可读、可追溯。

### 3.3 治理层

1. 在线验证路径仅加载项目规则（`.gitnexus/rules/approved`）。
2. 规则未命中必须显式失败（`rule_not_matched`），禁止隐式兜底。
3. 离线 Rule Lab 负责规则发现/聚类/候选生成。
4. Agent + 人类协作完成语义命名与边界确认。

## 4. Phase -1 契约接线（先决条件）

本 Phase 不解决业务语义，只解决“后续各 Phase 可调用、可观测、可验收”的接线问题。

### 4.1 必做接线

1. MCP Resources 扩展：
- 新增模板：`gitnexus://repo/{name}/derived-process/{id}`
- `parseUri/readResource` 支持 `derived-process` 路由。

2. MCP Tool Schema 扩展：
- `query/context` 新增可选参数：
  - `unity_evidence_mode: summary | focused | full`
  - `hydration_policy: fast | balanced | strict`
  - `resource_path_prefix`、`binding_kind`、`max_bindings`、`max_reference_fields`

3. 规则未命中失败分类：
- `rule_not_matched`
- `rule_matched_but_evidence_missing`
- `rule_matched_but_verification_failed`

### 4.2 验收

1. 所有新增参数能通过 MCP schema 校验并被后端接收。
2. `derived-process` URI 可被读取并返回结构化数据。
3. 未命中规则时返回标准失败分类，而不是空结构或 silent fallback。

### 4.3 DoD

1. 更新 `docs/unity-runtime-process-source-of-truth.md` 对外契约章节。

## 5. Phase 计划

---

## Phase 1 - Process Identity 与可读性一致化

### 5.1 目标

消除“query/context 返回 process id，但 process resource 无法读取”的契约断层。

### 5.2 设计

1. 引入统一结构 `process_ref`：

```json
{
  "id": "...",
  "kind": "persistent | derived",
  "readable": true,
  "reader_uri": "gitnexus://repo/{name}/process/{name} or gitnexus://repo/{name}/derived-process/{id}",
  "origin": "step_in_process | method_projected | resource_heuristic"
}
```

2. `query/context` 中不再直接暴露不可读 opaque heuristic id。
3. 引入 `derived-process` reader，使所有 `process_ref` 可读。
4. `derived` id 必须稳定：同一 `indexedCommit + symbol + evidence set` 生成同一 id。

### 5.3 验收

1. 报告 Step 5 场景中，`process_ref.readable_rate = 100%`。
2. 不再出现“返回 process id 但 process not found”。
3. `derived` id 稳定性：同输入重跑 3 次 id 一致率 `= 100%`。

### 5.4 风险

1. derived process 过多导致噪声。
- 缓解：按 `origin/confidence/path overlap` 排序 + top-k 限制。

### 5.5 DoD

1. 更新真理源文档中的 process 对外契约。

---

## Phase 2 - Runtime Claim 契约与规则注册验证器

### 6.1 目标

解决 `verified_full` 语义过宽问题，并移除 hardcode verifier，切换到规则契约驱动。

### 6.2 设计

1. 新增 `runtime_claim`：

```json
{
  "rule_id": "unity.gungraph.node.output-getvalue.v1",
  "rule_version": "1.0.0",
  "scope": {
    "resource_types": ["asset", "prefab", "scene"],
    "host_base_type": ["ScriptableObject"],
    "trigger_family": "gungraph_output"
  },
  "status": "verified_full | verified_partial | failed",
  "evidence_level": "verified_chain | verified_segment | clue | none",
  "guarantees": ["resource_to_runtime_chain_closed"],
  "non_guarantees": ["runtime_state_machine_root_cause"],
  "hops": [],
  "gaps": []
}
```

2. Verifier 引擎改为 `Rule Registry`：
- 输入 query/context 线索 + resource evidence + graph anchors。
- 匹配规则后执行 `required_segments` 校验。
- 返回 claim，而非场景 hardcode 文案。

3. 明确“无 fallback”策略：
- 在线验证只加载项目规则（`.gitnexus/rules/approved`）。
- 无规则命中时返回 `status=failed` + `reason=rule_not_matched` + actionable hint。

4. 保留并沿用 `runtime_chain_verify` gate 语义：
- 仅在 `runtime_chain_verify=on-demand` 且 `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY=on` 时执行规则验证。
- 当 gate 关闭时，返回 `status=failed` + `reason=gate_disabled`（或缺省 claim），不得隐式执行验证。

5. Reload 首条项目规则 bootstrap：
- 从现有 Reload verifier 的确定性锚点提取第一条项目规则文件：
  - `.gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml`
- 在 `rules/catalog.json` 中注册并激活，作为 Phase 2 验收基线。

6. Reload 迁移要求：
- 将现有 reload 硬编码逻辑迁移为首条项目正式规则。
- 使用新契约复现原先可验证链路（`resource/guid_map/code_loader/code_runtime`）。

7. 规则未命中质量门：
- 对已纳入目标范围的 curated query set，`rule_not_matched_rate <= 5%`。

### 6.3 验收

1. `runtime_chain_verify=on-demand` 输出包含 `runtime_claim.rule_id/version/scope/guarantees/non_guarantees`。
2. Reload 规则驱动复现 `verified_chain`。
3. gate 关闭时返回 `gate_disabled` 分类，且不执行规则验证。
4. 不存在 legacy fallback 路径分支。
5. 未命中失败分类完备，并附可执行 `next_action`。
6. Reload bootstrap 规则文件已生成、注册并可被加载。

### 6.4 风险

1. 初期规则覆盖不足导致 miss。
- 缓解：Phase 5 Rule Lab 补齐候选规则；严格使用失败分类跟踪。

### 6.5 DoD

1. 更新真理源文档中的 verifier 范围与声明语义。

---

## Phase 3 - 证据降噪与可消费交付

### 7.1 目标

解决 Unity 资源模式输出噪声过高问题，提升 agent 与开发者消费效率。

### 7.2 设计

1. 引入证据模式：
- `unity_evidence_mode=summary | focused | full`

2. 引入可控裁剪参数：
- `resource_path_prefix`
- `binding_kind`
- `max_bindings`
- `max_reference_fields`

3. 参数冲突优先级（新增）：

| 参数 | 作用层 | 优先级 |
| --- | --- | --- |
| `scope_preset` | 检索召回层（symbol/process candidates） | 低 |
| `resource_path_prefix` | hydration 绑定过滤层 | 高 |
| `binding_kind` | hydration 绑定过滤层 | 中 |
| `max_bindings/max_reference_fields` | 输出截断层 | 最高（最终输出门） |

冲突处理规则：
1. 先执行 `scope_preset` 召回，再执行 `resource_path_prefix/binding_kind` 过滤。
2. 若过滤后命中为空，返回 `filter_exhausted` 诊断并附建议放宽参数。
3. 截断参数只影响输出体量，不得破坏 `verifier_minimum_evidence_contract`。

4. 统一截断透明度：

```json
{
  "evidence_meta": {
    "truncated": true,
    "omitted_count": 812,
    "next_fetch_hint": "rerun with unity_evidence_mode=full and resource_path_prefix=..."
  }
}
```

5. `verifier_minimum_evidence_contract`（关键新增）：
- 即使在 `summary/focused` 模式，仍必须保留 verifier 最小必需字段：
  - `resourceBindings[].resourcePath`
  - `resourceBindings[].evidence.line`
  - `hydrationMeta.needsParityRetry`
  - 与当前匹配规则相关的最小 guid/anchor 线索
- 不满足最小集时，必须拒绝输出 `verified_*`，并返回补拉提示。

### 7.3 验收

1. 关键链路查询可在 `summary/focused` 下完成初步定位。
2. 在不破坏 verifier 最小集前提下，`summary` 模式平均响应体积相对 `full` 下降 `>= 60%`。
3. `resourceBindingCount` 超大时保持输出可读，且无关键 segment 漏失。
4. `query/context` P95 延迟增幅不超过 `15%`。

### 7.4 风险

1. 过度裁剪导致漏证据。
- 缓解：最小证据契约 + required segments 未满足时强制建议补拉 full。

### 7.5 DoD

1. 更新真理源文档中的证据输出与字段稳定性说明。

---

## Phase 4 - Hydration Policy 与完整性语义统一

### 8.1 目标

将“compact 是否需要 parity”从体量信号升级为任务语义驱动，并与现有参数体系兼容。

### 8.2 设计

1. 新增策略字段：
- `hydration_policy=fast | balanced | strict`

2. 参数关系表（新增，防冲突）：

| 输入 | 语义 | 优先级 |
| --- | --- | --- |
| `unity_hydration_mode` | 底层执行模式（compact/parity） | 低 |
| `hydration_policy` | 对外策略语义（速度/完整性） | 高 |

策略映射：
1. `fast` -> 默认 `compact`，仅保留最小证据。
2. `balanced` -> 先 `compact`，按缺口升级 parity。
3. `strict` -> 直接 parity；若发生 `fallback_to_compact`，`runtime_claim.status` 最高为 `verified_partial`，`evidence_level` 最高为 `verified_segment`。

3. `needsParityRetry` 语义保留（不降级为实现细节）：
- 继续作为现有 skill/真理源兼容信号。
- 同时新增 `missing_evidence[]` 作为面向策略层的主解释。

4. 结果可重复性约束：
- 验收时固定 warmup 语义：`GITNEXUS_UNITY_PARITY_WARMUP=off`。
- 报告必须记录 cache/warmup 状态，避免将异步预热波动误判为语义漂移。

### 8.3 验收

1. 相同 query 在相同 policy + warmup 设置下结果可重复、可解释。
2. 用户可通过 policy 明确控制“速度 vs 完整性”。
3. 报告 Step 3/4 可得到一致解释（为何需要/不需要 parity）。
4. `strict` 若发生 `fallback_to_compact`，结论级别自动降级为 `verified_partial/verified_segment`。

### 8.4 风险

1. policy 增加复杂度。
- 缓解：默认 `balanced`，并提供自动推荐升级路径。

### 8.5 DoD

1. 更新真理源文档中的 hydration 参数关系和推荐使用方式。

---

## Phase 5 - 离线 Rule Lab（专用项目分析工具）

### 9.1 目标

将规则补全过程产品化为离线工具，支持自动发现 + 分片审阅 + 人工语义确认，最终沉淀项目规则。

### 9.2 设计原则

1. 不做“全仓一次性大报告”，必须可分片。
2. 每次人机交互在可控 token 范围内。
3. 自动化主导发现，人类主导语义与边界。

### 9.3 Skill 驱动工作流（分片化）

1. `rule-lab-discover`
- 输入：repo + 范围（full 或 diff）
- 输出：run manifest + slices（不直接给大报告）

2. `rule-lab-analyze --slice <id>`
- 只分析单 slice，生成候选规则与证据。

3. `rule-lab-review-pack --slice <id>`
- 生成可审阅卡片（每包 3-4 条候选，单条 3-5 个关键 hop）。

4. `rule-lab-curate --slice <id>`
- 吸收人类补充：命名、保证边界、别名、禁用条件。

5. `rule-lab-promote --slice <id>`
- 将确认候选转为 `approved` 规则。

6. `rule-lab-regress --slice <id|all>`
- 规则回放，输出 coverage/precision 回归结果。

### 9.4 命令入口契约（新增）

为保证 Phase 5 可执行，约定以下入口（CLI 或 MCP 至少实现一种，推荐双入口）：

1. CLI 子命令：
- `gitnexus rule-lab discover --repo <name> [--scope full|diff]`
- `gitnexus rule-lab analyze --repo <name> --slice <id>`
- `gitnexus rule-lab review-pack --repo <name> --slice <id>`
- `gitnexus rule-lab curate --repo <name> --slice <id> --input <file>`
- `gitnexus rule-lab promote --repo <name> --slice <id>`
- `gitnexus rule-lab regress --repo <name> [--slice <id>|--all]`

2. MCP 工具名（建议）：
- `rule_lab_discover`
- `rule_lab_analyze`
- `rule_lab_review_pack`
- `rule_lab_curate`
- `rule_lab_promote`
- `rule_lab_regress`

3. 输入输出最小契约：
- 输入至少包含：`repo`, `run_id`, `slice_id`（按命令阶段）。
- 输出至少包含：`artifact_paths`, `summary_metrics`, `next_actions`。
- 失败至少包含：`error_code`, `error_message`, `retry_hint`。

### 9.5 自动分片维度

1. 路径：`path_prefix`
2. 资源类型：`.asset/.prefab/.unity/.uxml/.uss`
3. 宿主类型：`ScriptableObject/MonoBehaviour`
4. 触发族：`output/init/event/lifecycle`
5. 复杂度：按候选体量与置信度二次切分

### 9.6 项目规则落盘（.gitnexus）

1. `.gitnexus/rules/lab/runs/<run_id>/manifest.json`
2. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/candidates.jsonl`
3. `.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/review-cards.md`
4. `.gitnexus/rules/approved/*.yaml`
5. `.gitnexus/rules/catalog.json`
6. `.gitnexus/rules/reports/*.md`

### 9.7 治理要求（新增）

1. `.gitnexus/rules/**` ownership 与清理行为必须在 `docs/gitnexus-config-files.md` 定义。
2. Rule Lab 输出分为：
- 永久资产：`approved/*.yaml`, `catalog.json`
- 可清理中间产物：`lab/runs/**`, `reports/**`

### 9.8 验收

1. 可在单 slice 粒度完成“自动发现 -> 人工确认 -> 规则升级”。
2. 单轮审阅 token 预算上限：`<= 6k`。
3. 候选规则晋升门槛：`precision >= 0.90`、`coverage >= 0.80`。
4. 新规则可被 verifier registry 即时加载并参与 on-demand 验证。

### 9.9 DoD

1. 更新真理源文档中的规则来源与验证边界说明。

---

## 10. 跨 Phase 验收矩阵（量化）

1. 契约一致性：
- `process_ref.readable_rate = 100%`
- `derived_id_stability = 100%`（同 commit、同输入）

2. 语义一致性：
- `runtime_claim` 必含 `scope + guarantees + non_guarantees`
- `rule_not_matched` 分类覆盖率 `= 100%`

3. 无 fallback：
- 在线验证路径 fallback 分支触发次数 `= 0`

4. Reload 回归：
- 新规则契约下复现 `verified_chain`
- 关键 segment 覆盖：`resource/guid_map/code_loader/code_runtime = 100%`

5. 噪声与性能：
- `summary` 相对 `full` 平均响应体积下降 `>= 60%`
- `query/context` P95 延迟增幅 `<= 15%`

6. Rule Lab 稳定性：
- 审阅包 token `<= 6k`
- 规则晋升门槛：`precision >= 0.90`、`coverage >= 0.80`
- 命令入口契约覆盖率：`100%`（6 个阶段入口均可调用）

## 11. 非目标（本轮不做）

1. 运行态状态机根因自动闭环（协程/事件竞态仍需 PlayMode 证据）。
2. 一次性覆盖所有 Unity 业务模式。
3. 在本阶段引入跨仓共享业务规则库。

## 12. 里程碑建议

1. M1：Phase -1 + Phase 1 + Phase 2（先修契约接线与验证语义）
2. M2：Phase 3 + Phase 4（再修证据可消费性与策略可解释性）
3. M3：Phase 5（Rule Lab）+ 首批项目规则沉淀

## 13. 交付物清单

1. 设计文档（本文）
2. 规则契约 schema（`process_ref/runtime_claim/rule schema`）
3. Rule Registry 规范与 Rule Lab 输入输出规范
4. Phase 验收报告模板（含 Reload 新契约回归）
5. `docs/gitnexus-config-files.md` 中 `.gitnexus/rules/**` 治理条目
