# Unity Analyze Rules 生成 Skill 设计

Date: 2026-04-04
Status: Draft

## 1. 目标

设计一个随 GitNexus 分发的 skill（`gitnexus-unity-rule-gen`），安装在用户的 Unity 项目仓库中。Agent 从用户描述的自然语言调用链路线索出发，通过图谱探索补全参数，交互式生成 `analyze_rules` 规则，一次性 analyze 后逐一验证。

## 2. 问题回顾

在 2026-04-03 的 e2e 验证中，手动生成规则遇到以下问题：

| # | 问题 | 根因 |
|---|------|------|
| 1 | YAML 模板格式错误 | v2 要求 `match/topology/closure/claims` 四个 section，旧模板缺失 |
| 2 | `resource_bindings`/`lifecycle_overrides` 无法通过 YAML 传递 | `parseRuleYaml` 不解析这两个字段，只有 compiled bundle 支持 |
| 3 | 必须手动创建 compiled bundle | 没有从 YAML → compiled 的自动转换命令 |
| 4 | 探索图谱需要多轮 Cypher 查询 | 需要查 `UNITY_ASSET_GUID_REF`、`UNITY_COMPONENT_INSTANCE`、`HAS_METHOD` 等边 |
| 5 | binding 类型判定需要领域知识 | agent 需要理解 Unity 资源加载语义才能选择正确的 binding kind |

## 3. 架构决策

### 3.1 YAML 是真理源，compiled bundle 是派生产物

新增 CLI 命令 `gitnexus rule-lab compile`，从 `approved/*.yaml` 生成 `compiled/analyze_rules.v2.json`。

理由：
- 单一真理源，避免 YAML 和 compiled bundle 漂移
- 人类可读、可 diff、可 code review
- 与现有 `rule-lab promote` 的 YAML 输出保持一致

### 3.2 代码修改清单

#### 修改 1：`parseRuleYaml` 增加 `resource_bindings` / `lifecycle_overrides` 解析

文件：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`

`parseRuleYaml` 当前返回的 `RuntimeClaimRule` 类型已包含 `resource_bindings?: UnityResourceBinding[]` 和 `lifecycle_overrides?: LifecycleOverrides`，但解析逻辑未填充。

新增解析逻辑（利用现有的 `readSectionLines` 基础设施）：

```
resource_bindings:
  - kind: asset_ref_loads_components
    ref_field_pattern: "gungraph|graph"
    target_entry_points:
      - OnEnable
      - Awake

lifecycle_overrides:
  additional_entry_points:
    - Init
  scope: "Assets/NEON/Code/Game/Graph"
```

解析策略：`resource_bindings` 是一个对象数组，每个对象有固定的 key set。用 `readSectionLines('resource_bindings')` 获取原始行，然后按 `- kind:` 分割为条目，逐条解析 scalar 和 list 字段。

`lifecycle_overrides` 是单个对象，用 `readNestedList('lifecycle_overrides', 'additional_entry_points')` + `readNestedScalar('lifecycle_overrides', 'scope')` 解析。

#### 修改 2：`toStageAwareCompiledRule` 透传 Unity 字段

文件：`gitnexus/src/rule-lab/promote.ts`

`toStageAwareCompiledRule` 和 `CompiledRuntimeRule` 增加可选字段：

```typescript
// CompiledRuntimeRule 增加
resource_bindings?: UnityResourceBinding[];
lifecycle_overrides?: LifecycleOverrides;

// toStageAwareCompiledRule 透传
...(rule.resource_bindings ? { resource_bindings: rule.resource_bindings } : {}),
...(rule.lifecycle_overrides ? { lifecycle_overrides: rule.lifecycle_overrides } : {}),
```

`StageAwareCompiledRule`（`compiled-bundles.ts`）同样增加可选字段。

#### 修改 3：`buildRuleYaml` 输出 Unity 字段

文件：`gitnexus/src/rule-lab/promote.ts`

在 `buildRuleYaml` 末尾（`claims` section 之后）追加 `resource_bindings` 和 `lifecycle_overrides` 的 YAML 序列化。

#### 修改 4：新增 `rule-lab compile` CLI 命令

文件：`gitnexus/src/cli/rule-lab.ts` + 新文件 `gitnexus/src/rule-lab/compile.ts`

功能：
1. 读取 `catalog.json`，过滤 `family === 'analyze_rules'` 的条目
2. 对每个条目，读取对应的 `approved/*.yaml`，调用 `parseRuleYaml` 解析
3. 转换为 `StageAwareCompiledRule`（含 `resource_bindings`/`lifecycle_overrides`）
4. 调用 `writeCompiledRuleBundle(rulesRoot, 'analyze_rules', rules)` 写入

CLI 接口：

```bash
gitnexus rule-lab compile [--repo-path <path>] [--family <analyze_rules|verification_rules>]
```

默认 family 为 `analyze_rules`。

#### 修改 5：catalog.json 条目增加 `family` 字段

`promoteCuratedRules` 写入 catalog 时，从规则 YAML 的 `family` 字段读取并写入 catalog 条目。当前 `CatalogEntry` 接口已有 `family` 但 promote 未填充。

### 3.3 YAML 格式定义（v2 analyze_rules）

```yaml
id: unity.<scenario-name>.v2
version: 2.0.0
family: analyze_rules
trigger_family: <scenario-name>
resource_types:
  - asset
host_base_type:
  - MonoBehaviour
  - ScriptableObject

match:
  trigger_tokens:
    - <token1>
    - <token2>
  host_base_type:
    - MonoBehaviour
    - ScriptableObject
  resource_types:
    - asset

topology:
  # 对 analyze_rules 无实际语义，但 assertDslShape 要求存在
  # 可留空或填写描述性 hop

closure:
  required_hops:
    - resource
    - guid_map
    - code_loader
    - code_runtime

claims:
  guarantees:
    - resource_to_runtime_chain_closed
  non_guarantees:
    - no_runtime_execution
    - no_dynamic_data_flow_proof

# ── Unity analyze_rules 专有字段 ──

resource_bindings:
  - kind: asset_ref_loads_components
    ref_field_pattern: "gungraph|graph"
    target_entry_points:
      - OnEnable
      - Awake
      - Init

  - kind: method_triggers_field_load
    host_class_pattern: "WeaponPowerUp"
    field_name: gungraph
    loader_methods:
      - Equip

lifecycle_overrides:
  additional_entry_points:
    - Init
  scope: "Assets/NEON/Code/Game/Graph"
```

## 4. Skill 工作流设计

### 4.0 Phase 0: 初始化

```
1. 确认 gitnexus CLI 可用（gitnexus --version）
2. 确认目标仓库路径（询问用户或从 cwd 推断）
3. 确认仓库已索引（gitnexus status），未索引则先 analyze
4. 确认 UNITY_ASSET_GUID_REF 和 UNITY_COMPONENT_INSTANCE 边存在
```

### 4.1 Phase 1: 规则录入循环

```
loop:
  1.1 收集用户链路线索（自然语言描述）
  1.2 图谱探索补全
      优先级：Cypher 直查 > gitnexus context > 文件 grep
      - UNITY_ASSET_GUID_REF：找序列化字段名
      - UNITY_COMPONENT_INSTANCE：找资源上挂载的类
      - HAS_METHOD：找类的方法列表
      - 文件直读：确认 [SerializeField] 字段、lifecycle 方法
  1.3 多路径确认
      - 同一位置 ≥2 候选 → 向用户确认
      - 探索 3 步无结果 → 向用户补充提问
  1.4 binding 类型判定
      | 链路特征 | binding kind |
      |---------|-------------|
      | asset GUID 引用 → 目标资源组件激活 | asset_ref_loads_components |
      | 方法调用 → 字段引用的资源加载 | method_triggers_field_load |
      | 项目自定义入口方法 | lifecycle_overrides |
  1.5 生成规则 YAML 并暂存
  1.6 询问用户：是否继续录入下一条规则？
      - 是 → 回到 1.1
      - 否 → 进入 Phase 2
```

### 4.2 Phase 2: 写入 + analyze

```
1. 写入所有规则 YAML 到 .gitnexus/rules/approved/
2. 更新 catalog.json（追加条目，含 family: "analyze_rules"）
3. gitnexus rule-lab compile（新命令，YAML → compiled bundle）
4. gitnexus analyze --force
```

### 4.3 Phase 3: 逐一验证

对每条规则执行 4 项验证：

```
验证 1: 合成边存在性
  Cypher: MATCH ()-[r:CodeRelation {type:'CALLS'}]->()
          WHERE r.reason CONTAINS '<ruleId>'
          RETURN count(*)
  PASS: count > 0

验证 2: 运行时链路验证
  gitnexus query "<trigger_token>" --runtime-chain-verify on-demand
  PASS: runtime_claim.status === 'verified_full'

验证 3: Process 完整性
  gitnexus context <target_class>
  PASS: processes[] 中至少一个包含 unity_runtime_root

验证 4: 合成边分布
  Cypher: MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b)
          WHERE r.reason CONTAINS '<ruleId>'
          RETURN r.reason, count(*) ORDER BY count(*) DESC
  PASS: 三种边类型（resource-load, lifecycle-override, loader-bridge）均有产出
```

汇总报告，标注每条规则的 PASS/FAIL 和诊断信息。

### 4.4 失败诊断路径

| 症状 | 可能原因 | 修复方向 |
|------|---------|---------|
| 验证 1 失败（0 合成边） | 规则未被 compile 或 family 不对 | 检查 catalog.json + compiled bundle |
| 验证 1 部分（只有 resource-load） | method_triggers_field_load 参数错误 | 检查 host_class_pattern / loader_methods |
| 验证 2 失败（rule_not_matched） | trigger_tokens 未匹配查询文本 | 调整 match.trigger_tokens |
| 验证 2 失败（verification_failed） | 合成边 reason 中的 ruleId 不匹配 | 检查规则 ID 一致性 |
| 验证 3 失败（无 Process） | 合成边 confidence 过低 | 检查 RULE_EDGE_CONFIDENCE（应为 0.75） |
| lifecycle_overrides 无效 | scope 值不是文件路径前缀 | scope 应匹配 filePath 而非类名 |

## 5. Skill 文件结构

```
.agents/skills/gitnexus/gitnexus-unity-rule-gen/
  SKILL.md          # skill 定义（本设计的 Phase 0-3 工作流）
```

随 GitNexus 分发，`gitnexus analyze` 时自动写入目标仓库的 `.agents/skills/gitnexus/` 目录。

## 6. 实现步骤

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| 1 | `parseRuleYaml` 增加 `resource_bindings`/`lifecycle_overrides` 解析 | `runtime-claim-rule-registry.ts` | 无 |
| 2 | `StageAwareCompiledRule` 增加可选 Unity 字段 | `compiled-bundles.ts` | 无 |
| 3 | `toStageAwareCompiledRule` 透传 Unity 字段 | `promote.ts` | #2 |
| 4 | `buildRuleYaml` 输出 Unity 字段 | `promote.ts` | 无 |
| 5 | 新增 `rule-lab compile` 命令 | `rule-lab.ts` + `compile.ts` | #1, #2 |
| 6 | catalog.json 条目写入 `family` 字段 | `promote.ts` | 无 |
| 7 | 编写 `gitnexus-unity-rule-gen` SKILL.md | `.agents/skills/gitnexus/` | #5 |
| 8 | 更新 `gitnexus-unity-e2e-verify` SKILL.md | `.agents/skills/gitnexus/` | #7 |
