# Gap-Lab + Rule-Lab 架构设计

Date: 2026-04-12
Owner: GitNexus
Status: Ideal Design（理想工程结构，不受当前实现约束）

---

## 1. 文档定位

本文描述 **gap-lab + rule-lab** 工作流的理想工程结构，面向人类用户和 agent 协作者。

目标读者：
- 需要理解整体流程的开发者
- 执行 gap-lab 分片任务的 agent
- 审查规则产物的人类用户

本文不描述当前实现细节，而是定义"应该是什么样子"。当实现与本文冲突时，以本文为重构方向。

---

## 2. 整体定位

### 2.1 这个工作流解决什么问题

Unity 项目中存在大量**运行时连接**，这些连接在 C# 静态分析层面不可见：

- Mirror 框架的 `SyncVar hook`：字段变化时自动调用 hook 方法，但代码里没有显式调用
- Mirror 框架的 `SyncList/SyncDictionary Callback`：集合变化时触发回调，但注册点和触发点分离
- 其他事件/委托模式：`+=` 注册后由框架在运行时分发

GitNexus 的图数据库依赖静态分析，这些连接天然缺失。**gap-lab + rule-lab 的目标是：系统性地发现这些缺口，生成 `analyze_rules`，让图数据库在下次构建时能正确注入这些合成边。**

### 2.2 与 query-time 的边界

- **gap-lab / rule-lab 是离线创作层**，产物是 YAML 规则文件
- **query-time runtime closure 是图查询层**，不依赖 gap-lab 的运行状态
- 两者通过 `analyze_rules` 解耦：gap-lab 生产规则，analyze 消费规则，query 查询图

---

## 3. 工作流全景

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase A  初始化（每个 run 执行一次）                                │
│  用户输入：目标仓库路径                                              │
│  产出：run 骨架，slice-plan.json                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  Phase B  分片聚焦（每个 loop 执行一次）                             │
│  用户输入：选择 gap_type / gap_subtype                               │
│  用户输入（可选）：search_seeds（加速发现的示例符号/文件）           │
│  产出：focus lock，progress.json 更新                                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  Phase C  单分片完整循环                                             │
│                                                                      │
│  C1  发现（gap-lab run CLI）                                         │
│    C1a  全库词法扫描（rg）                                           │
│    C1b  范围分类（user_code / third_party / unknown）                │
│    C1c  符号解析（handler + source/target anchor）                   │
│    C1d  防重复检查（rules/approved/ 工件比对）                       │
│    产出：candidates.jsonl，slice.json（含 coverage_gate）            │
│                                                                      │
│  C2  候选分类（gap-lab run CLI 内部）                                │
│    分类结果：accepted / promotion_backlog / rejected                 │
│    覆盖率门控：processed_user_matches == user_raw_matches            │
│                                                                      │
│  C2.5  聚合模式确认（用户决策点）                                    │
│    用户输入：per_anchor_rules 或 aggregate_single_rule               │
│                                                                      │
│  C3  规则生成（rule-lab analyze）                                    │
│    产出：rules/lab/.../candidates.jsonl，curation-input.json         │
│                                                                      │
│  C4  审查与固化（rule-lab review-pack → curate → promote）           │
│    用户输入：审查 review-cards.md，填写 curation-input.json          │
│    产出：rules/approved/*.yaml                                       │
│                                                                      │
│  C5  验证（reindex + query 验证）                                    │
│    用户输入：确认 closure 证据                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  Phase D  持久化与停止                                               │
│  更新 slice-plan.json 状态，保存 next_command，交还控制权            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 阶段详解

### Phase A — 初始化

**触发条件：** 新 run，或 run 不存在时。

**用户输入：**
- 目标仓库路径（`--repo-path`）

**产出（`.gitnexus/gap-lab/runs/<run_id>/`）：**

| 文件 | 内容 |
|------|------|
| `manifest.json` | run 元数据（创建时间、patterns_version） |
| `slice-plan.json` | 所有分片的初始状态（`pending`） |
| `progress.json` | 当前 checkpoint（`phase_a_initialized`） |
| `inventory.jsonl` | 空，后续追加 |
| `decisions.jsonl` | 空，后续追加 |
| `slices/<slice_id>.json` | 每个分片的骨架 |

**不需要用户决策，agent 自动完成。**

---

### Phase B — 分片聚焦

**触发条件：** 每次开始新的单分片循环。

**用户输入（必填）：**
- `gap_type`：顶层缺口类型（见第 5 节）
- `gap_subtype`：具体子类型（见第 5 节）

**用户输入（可选）：**
- `search_seeds`：已知的示例符号、文件路径、或运行时症状描述，用于加速发现，**不影响发现范围**
- `explicit_discovery_scope_override`：仅在明确需要缩小范围时使用（`path_prefix_override` 或 `module_override`）

**产出：**
- `slice-plan.json` 中目标分片状态变为 `in_progress`
- `progress.json.current_slice_id` 更新
- `decisions.jsonl` 追加 `phase_b_clues_confirmed` 记录

**关键约束：**
- `search_seeds` 是加速工具，不是排他范围。发现阶段必须扫描全库，不能只扫描 seed 文件。
- 没有 `search_seeds` 时，agent 必须明确告知用户这是低置信度探索性扫描，并获得用户同意。

---

### Phase C — 单分片完整循环

#### C1 — 发现（`gitnexus gap-lab run`）

**这是整个工作流的核心计算阶段，由 CLI 命令完整执行，不需要 agent 手动编排各子步骤。**

```bash
gitnexus gap-lab run \
  --repo-path <path> \
  --run-id <id> \
  --slice-id <id> \
  --gap-subtype <subtype>
```

**内部流水线：**

```
C1a  全库词法扫描
     工具：rg（ripgrep）
     输入：gap_subtype 对应的正则模式
     产出：原始命中行列表（file:line:text）

C1b  范围分类
     对每个命中行判断：user_code / third_party / unknown
     依据：文件路径（Assets/ 下为 user_code，Packages/ 下为 third_party 等）
     third_party 行保留在 candidates.jsonl，状态为 rejected，reason: third_party_scope_excluded

C1c  符号解析
     对 user_code 命中行：
     - 提取 handler symbol（从 hook = nameof(handler) 或 Callback += handler）
     - 解析 host class name
     - 解析 field name（SyncVar 分片专用）
     - 搜索 field write 方法 → source_anchor
     - 定位 handler 方法 → target_anchor

C1d  防重复检查
     对已有完整 source_anchor + target_anchor 的候选：
     检查 rules/approved/*.yaml 的 resource_bindings 是否已覆盖
     已覆盖 → rejected，reason: already_covered_by_rule
     未覆盖 → 进入 C2 分类
```

**产出：**
- `slices/<slice_id>.candidates.jsonl`：每个候选一行，包含完整字段
- `slices/<slice_id>.json`：更新 `coverage_gate`、`classification_buckets`

**覆盖率门控（C2.6）：**
- `processed_user_matches` 必须等于 `user_raw_matches`
- 不满足时命令以 exit code 1 退出，slice 状态标记为 `blocked`
- 真理源是 `candidates.jsonl` 行数，`slice.json` 里的计数是派生缓存

#### C2 — 候选分类结果

C1 命令执行后，`candidates.jsonl` 中每行的 `status` 字段反映分类结果：

| status | 含义 |
|--------|------|
| `accepted` | 有完整 source_anchor + target_anchor，且未被现有规则覆盖 |
| `promotion_backlog` | 发现了 gap，但本轮无法完整解析 anchor（仍是有效候选，未来可提升） |
| `rejected` | 明确排除（third_party、handler 无法解析、已有规则覆盖等） |

**`promotion_backlog` 不是 rejection。** 它表示"这个 gap 存在，但当前静态分析无法完整定位 source→target 锚点对"。常见原因：
- `missing_runtime_source_anchor`：字段写入点在框架内部，无用户代码写入
- `ambiguous_source_anchor`：有多个写入方法，需要用户确认选哪个
- `unresolved_host_type`：无法确定宿主类名

#### C2.5 — 聚合模式确认（用户决策点）

**触发条件：** 同一 `gap_subtype` 下有 ≥2 个 `accepted` 候选。

**用户选择：**
- `per_anchor_rules`：每个 source→target 锚点对生成一条独立规则
- `aggregate_single_rule`：所有同质锚点对合并为一条规则（要求相同 gap_type、gap_subtype、binding_kind）

**产出：** `decisions.jsonl` 追加 `rule_aggregation_mode` 记录。

#### C3 — 规则生成（`gitnexus rule-lab analyze`）

**前置检查（自动）：**
- C0 parity gate：`gap-lab` 和 `rules/lab` 的同 run/slice 工件必须存在且一致
- 覆盖率 gate：`coverage_gate.status` 必须为 `passed`

```bash
gitnexus rule-lab analyze \
  --repo-path <path> \
  --run-id <id> \
  --slice-id <id>
```

**产出（`.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/`）：**

| 文件 | 内容 |
|------|------|
| `slice.json` | 含 `source_gap_handoff`（universe→accepted→proposal 可审计缩减链） |
| `candidates.jsonl` | **提案候选**（不是穷尽候选），每行对应一条待生成规则 |
| `curation-input.json` | 预填充的固化输入，用户审查后提交 |

**两层候选语义：**
- `gap-lab candidates.jsonl` = 穷尽候选真理源（76 行）
- `rule-lab candidates.jsonl` = 提案候选（2 行，对应 2 个 accepted 候选）

`source_gap_handoff` 字段记录了这个缩减过程：`user_raw_matches=76, accepted=2, promotion_backlog=73, rejected=1`。

#### C4 — 审查与固化

**用户工作：**
1. 阅读 `review-cards.md`（由 `rule-lab review-pack` 生成）
2. 确认或修改 `curation-input.json` 中的 binding 字段
3. 提交固化

```bash
gitnexus rule-lab review-pack --repo-path <path> --run-id <id> --slice-id <id>
gitnexus rule-lab curate --repo-path <path> --run-id <id> --slice-id <id> --input-path <path>
gitnexus rule-lab promote --repo-path <path> --run-id <id> --slice-id <id>
```

**产出：** `.gitnexus/rules/approved/<rule_id>.yaml`

**binding lint（自动，`method_triggers_method` 专用）：**
- `source_class_pattern` / `target_class_pattern` 不能是 symbol-id 格式（`Class:...`）
- `source_method` / `target_method` 必须是纯方法名，不能有正则锚点

#### C5 — 验证

```bash
# 重新索引目标仓库
gitnexus analyze --repo-path <target_repo>

# 验证 runtime chain 是否闭合
gitnexus context --name <source_method> --repo <target_repo> --runtime-chain-verify on-demand
```

**通过条件：** `runtime_claim.status = verified_full`，`confirmed_chain.steps` 非空。

---

### Phase D — 持久化与停止

**产出：**
- `slice-plan.json` 中分片状态更新（`in_progress → verified/done/blocked`）
- `progress.json.checkpoint_phase` 更新
- `progress.json.next_command` 写入下次恢复命令

**状态转换规则：**

```
pending → in_progress    （Phase B focus lock 后）
in_progress → blocked    （任意 gate 失败）
in_progress → rule_generated  （C3 完成）
rule_generated → indexed      （C5 reindex 完成）
indexed → verified            （C5 closure 验证通过，需非空 confirmed_chain.steps）
verified → done               （用户确认）
```

`verified/done` 需要非空 closure 证据，不能仅凭命令成功推断。

---

## 5. Gap 分片分类体系

### 5.1 分类原则

每个分片由 `gap_type`（顶层类型）+ `gap_subtype`（具体子类型）唯一标识。

**顶层类型**定义缺口的触发机制类别。**子类型**定义具体的框架模式或代码形态。

每个子类型对应：
- 一个词法检测模式（rg 正则）
- 一个 anchor 解析策略
- 一个默认 binding kind

### 5.2 分片目录

#### `event_delegate_gap` — 事件/委托运行时分发

静态分析看不到的事件注册→触发连接。

| 子类型 | 特征 | 词法信号 | 默认 binding |
|--------|------|----------|--------------|
| `mirror_syncvar_hook` | Mirror SyncVar 字段变化时自动调用 hook 方法。hook 在字段声明的 attribute 里指定，不是显式调用。需要找到"谁写了这个字段"作为 source。 | `[SyncVar(hook = nameof(handler))]` | `method_triggers_method` |
| `mirror_synclist_callback` | Mirror SyncList 集合变化时触发 Callback 委托。注册点（`Callback +=`）和触发点（Mirror 内部）分离。 | `SyncList.Callback +=` | `method_triggers_method` |
| `mirror_syncdictionary_callback` | 同上，针对 SyncDictionary。 | `SyncDictionary.Callback +=` | `method_triggers_method` |

**`event_delegate_gap` 的 anchor 解析难点：**

`mirror_syncvar_hook` 的 target anchor（handler 方法）容易找到，但 source anchor（写字段的方法）需要额外的静态分析：
1. 找到 SyncVar 字段名
2. 在全库搜索对该字段的赋值（`field =`）
3. 找到赋值所在的封闭方法

如果找不到用户代码写入点（字段由 Mirror 框架内部序列化写入），候选进入 `promotion_backlog`，reason: `missing_runtime_source_anchor`。这是语义正确的结果，不是 bug。

#### `scene_deserialize_gap` — 场景反序列化资源加载

Unity 场景文件（`.unity`）在加载时反序列化组件，触发代码执行，但这个连接在静态分析里不可见。

| 子类型 | 特征 | 词法信号 | 默认 binding |
|--------|------|----------|--------------|
| `prefab_instantiate` | `Instantiate()` 调用触发 prefab 内组件的 Awake/Start | `Instantiate(` | `asset_ref_loads_components` |
| `scene_load_trigger` | `SceneManager.LoadScene()` 触发场景内所有组件初始化 | `LoadScene(` | `method_triggers_scene_load` |

#### `scene_load_gap` — 场景加载触发

代码方法触发场景加载，但场景文件和代码之间的连接不可见。

| 子类型 | 特征 | 词法信号 | 默认 binding |
|--------|------|----------|--------------|
| `additive_scene_load` | 叠加加载场景 | `LoadSceneMode.Additive` | `method_triggers_scene_load` |
| `async_scene_load` | 异步加载场景 | `LoadSceneAsync(` | `method_triggers_scene_load` |

#### `conditional_branch_gap` — 条件分支运行时分发

运行时根据条件选择执行路径，静态分析无法确定哪条路径会被执行。

| 子类型 | 特征 | 词法信号 | 默认 binding |
|--------|------|----------|--------------|
| `interface_dispatch` | 通过接口调用，运行时多态分发 | `interface I` + 调用点 | `method_triggers_method`（bridge） |
| `enum_state_dispatch` | 根据枚举状态分发到不同处理方法 | `switch(state)` + enum | `method_triggers_method`（bridge） |

#### `startup_bootstrap_gap` — 启动引导

应用启动时的初始化链，静态分析无法追踪完整的启动顺序。

| 子类型 | 特征 | 词法信号 | 默认 binding |
|--------|------|----------|--------------|
| `static_constructor_init` | 静态构造函数触发的初始化链 | `static` + `[RuntimeInitializeOnLoadMethod]` | `method_triggers_method`（bridge） |
| `attribute_driven_init` | Unity attribute 驱动的启动回调 | `[RuntimeInitializeOnLoadMethod]` | `method_triggers_method`（bridge） |

### 5.3 新增子类型的条件

新增子类型需要满足：
1. 有明确的词法检测信号（可以写 rg 正则）
2. 有明确的 anchor 解析策略（source 和 target 如何定位）
3. 能映射到现有 binding kind，或提出新 binding kind 的充分理由
4. 不能用现有子类型覆盖

---

## 6. 工件体系

### 6.1 gap-lab 工件（发现层真理源）

路径：`.gitnexus/gap-lab/runs/<run_id>/`

| 工件 | 格式 | 内容 | 真理源地位 |
|------|------|------|-----------|
| `manifest.json` | JSON | run 元数据 | run 级 |
| `slice-plan.json` | JSON | 所有分片状态 | run 级 |
| `progress.json` | JSON | 当前 checkpoint，next_command | run 级 |
| `inventory.jsonl` | JSONL | 跨分片的发现记录（可选） | run 级 |
| `decisions.jsonl` | JSONL | 所有决策记录（focus lock、aggregation mode 等） | run 级 |
| `slices/<id>.json` | JSON | 分片摘要，含 coverage_gate | 分片级 |
| `slices/<id>.candidates.jsonl` | JSONL | **穷尽候选真理源** | 分片级 |

**`slices/<id>.candidates.jsonl` 是整个工作流的核心真理源。** 所有下游计数、摘要、handoff 数据都必须从这个文件派生，不能从 `slice.json` 的摘要字段反向推断。

### 6.2 rule-lab 工件（规则生成层）

路径：`.gitnexus/rules/lab/runs/<run_id>/slices/<slice_id>/`

| 工件 | 格式 | 内容 |
|------|------|------|
| `slice.json` | JSON | 含 `source_gap_handoff`（可审计缩减链） |
| `candidates.jsonl` | JSONL | **提案候选**（accepted 候选 → 规则提案） |
| `curation-input.json` | JSON | 预填充的固化输入 |
| `review-cards.md` | Markdown | 人类可读的审查卡片 |
| `curated.json` | JSON | 固化后的结果 |

### 6.3 已批准规则工件

路径：`.gitnexus/rules/approved/<rule_id>.yaml`

这是 analyze 阶段消费的最终产物。`resource_bindings` 字段定义了合成边的注入规则。

**这个目录同时是 C1d 防重复检查的依据。** 在生成新规则前，必须检查 `resource_bindings` 是否已覆盖当前候选的 source→target 对。

### 6.4 工件间的数据流

```
gap-lab candidates.jsonl (穷尽候选，76行)
    ↓ gap-handoff.ts（字段校验 + accepted 过滤）
    ↓ accepted_candidates (2行)
    ↓
rule-lab candidates.jsonl (提案候选，2行)
    ↓ source_gap_handoff 记录缩减链
    ↓ (76 raw → 2 accepted → 2 proposals, 73 backlog, 1 rejected)
    ↓
curation-input.json → curated.json → rules/approved/*.yaml
    ↓
gitnexus analyze（消费 analyze_rules）
    ↓
图数据库（注入合成边）
    ↓
query-time runtime closure（graph-only）
```

---

## 7. 用户决策点汇总

| 阶段 | 决策内容 | 必填/可选 |
|------|----------|-----------|
| Phase B | 选择 gap_type / gap_subtype | 必填 |
| Phase B | 提供 search_seeds | 可选（影响发现速度，不影响范围） |
| Phase B | 同意低置信度探索性扫描（无 seeds 时） | 必填 |
| C2.5 | 选择 per_anchor_rules 或 aggregate_single_rule | 必填（≥2 accepted 时） |
| C4 | 审查 review-cards.md，确认或修改 curation-input.json | 必填 |
| C5 | 确认 closure 证据（verified_full） | 必填 |
| Phase D | 确认分片状态转换 | 必填（verified/done 需证据） |

---

## 8. 关键约束与禁止项

### 8.1 发现范围约束

- **禁止**：用 search_seeds 的文件路径缩小 C1a 的扫描范围
- **禁止**：用 `out_of_focus_scope`、`deferred_non_clue_module` 等理由排除 user_code 命中（除非有 `explicit_discovery_scope_override`）
- **要求**：C1a 必须扫描全库（或 `explicit_discovery_scope_override` 指定的范围）

### 8.2 候选状态约束

- **禁止**：把 `promotion_backlog` 当作 rejection bucket 处理
- **禁止**：用 user_clues 作为 accepted 的依据（accepted 必须基于静态可解析的 anchor 对）
- **要求**：`accepted` 候选必须有完整的 `source_anchor.symbol` 和 `target_anchor.symbol`

### 8.3 工件完整性约束

- **禁止**：`candidates.jsonl` 行缺少 `gap_type`、`gap_subtype`、`pattern_id`、`detector_version`
- **禁止**：`accepted` 行缺少 `source_anchor` 或 `target_anchor`
- **要求**：`slice.json.coverage_gate` 的计数必须与 `candidates.jsonl` 行数一致

### 8.4 防重复约束

- **禁止**：用图数据库查询判断 edge 是否存在（图状态不稳定）
- **要求**：防重复检查必须基于 `rules/approved/*.yaml` 的 `resource_bindings` 字段

### 8.5 规则生成约束

- **禁止**：`source_class_pattern` / `target_class_pattern` 使用 symbol-id 格式（`Class:...`）
- **禁止**：`source_method` / `target_method` 使用正则锚点（`^...$`）
- **禁止**：`UnknownClass` / `UnknownMethod` 占位符进入 curated 或 promoted 工件

---

## 9. 与 Unity Runtime Process 的关系

| 层 | 职责 | 工件 |
|----|------|------|
| gap-lab | 发现缺口，生成候选 | `gap-lab/runs/` |
| rule-lab | 将候选转化为规则 | `rules/lab/`，`rules/approved/` |
| analyze（Phase 5.7） | 消费规则，注入合成边 | 图数据库 |
| query-time closure | 验证运行时链路 | MCP 响应 |

gap-lab 和 rule-lab 是 analyze 的**上游创作层**，不是 query-time 的一部分。规则生成后需要重新 analyze 才能让图数据库反映新的合成边。
