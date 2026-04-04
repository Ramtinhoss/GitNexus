---
name: gitnexus-unity-rule-gen
description: "Interactive workflow for generating Unity analyze_rules: collect chain clues from user, explore graph to fill parameters, generate rule YAML, compile to bundle, analyze, and verify. Use when: 'create unity rules', 'generate analyze rules', 'add resource binding rules', 'unity rule gen'."
---

# Unity Analyze Rules 交互式生成工作流

本技能引导 agent 从用户描述的自然语言调用链路线索出发，通过图谱探索补全参数，交互式生成 `analyze_rules` 规则。支持一次录入多条规则，一次性 analyze 后逐一验证。

## Phase 0: 初始化

```
1. 确认 gitnexus CLI 可用（gitnexus --version）
2. 确认目标仓库路径（询问用户或从 cwd 推断）
3. 确认仓库已索引（gitnexus status），未索引则先 analyze
4. 确认 UNITY_ASSET_GUID_REF 和 UNITY_COMPONENT_INSTANCE 边存在：
```

```
mcp__gitnexus__cypher:
  query: |
    MATCH ()-[r:CodeRelation]->()
    WHERE r.type IN ['UNITY_ASSET_GUID_REF', 'UNITY_COMPONENT_INSTANCE']
    RETURN r.type AS edgeType, count(*) AS cnt
  repo: <repo-name>
```

如果这两种边不存在，说明索引时未启用 Unity 资源解析，需要重新 analyze，**必须加 Unity 参数**：

```bash
gitnexus analyze --force --extensions ".cs .meta"
# 如果所有代码都在 Assets/ 下，可加 --scope-prefix Assets/ 缩短分析时间
```

---

## Phase 1: 规则录入循环

```
loop:
  1.1 收集用户链路线索
  1.2 图谱探索补全
  1.3 多路径确认
  1.4 binding 类型判定
  1.5 生成规则 YAML 并暂存
  1.6 询问用户：是否继续录入下一条规则？
      - 是 → 回到 1.1
      - 否 → 进入 Phase 2
```

### 1.1 收集用户链路线索

向用户询问：

| 信息 | 问题 | 示例 |
|------|------|------|
| 场景名称 | 你想验证哪个资源→代码链路？ | weapon-powerup-gungraph |
| 资源引用字段 | 哪些序列化字段名触发资源加载？ | `gungraph\|graph` |
| 目标入口方法 | 加载的资源上哪些方法会被触发？ | OnEnable, Awake |
| 持有字段的类 | 哪些类持有触发加载的字段？ | WeaponPowerUp |
| 加载方法 | 哪些方法触发资源加载？ | Equip |
| 动态跳转 | 链路中是否有静态分析无法解析的间接调用？ | 事件派发 `NetEventHub.OnPickUpItem → OnClientPickItUp`；条件分支多态 `if (isX) handler = new A()` 后 `handler.Run()` |
| 额外 lifecycle | 项目有自定义入口方法吗？ | Init |
| lifecycle 范围 | 自定义入口方法的作用范围？ | Assets/Code/Graph |

### 1.2 图谱探索补全

用户不确定某些字段时，按优先级探索：**Cypher 直查 > gitnexus context > 文件 grep**

```
# 查找资源引用字段名
mcp__gitnexus__cypher:
  query: |
    MATCH ()-[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->()
    RETURN DISTINCT r.reason
    LIMIT 20
  repo: <repo-name>

# 查找挂载在资源上的组件类
mcp__gitnexus__cypher:
  query: |
    MATCH (c:Class)-[r:CodeRelation {type:'UNITY_COMPONENT_INSTANCE'}]->(f:File)
    WHERE f.filePath CONTAINS '.asset'
    RETURN c.name, f.filePath
    LIMIT 20
  repo: <repo-name>

# 查找特定类的方法列表
mcp__gitnexus__context:
  name: <ClassName>
  repo: <repo-name>
```

如果图谱查询无结果，回退到文件直读：

```
# 查找 [SerializeField] 字段
Grep: pattern="\[SerializeField\]" path=<Assets目录>

# 查找特定方法定义
Grep: pattern="void Init\b|void Setup\b" path=<Assets目录>
```

### 1.3 多路径确认

- 同一位置 ≥2 候选路径 → **向用户确认**选择哪条
- 探索 3 步无结果 → **向用户补充提问**

### 1.4 binding 类型判定

| 链路特征 | binding kind | 说明 |
|---------|-------------|------|
| asset GUID 引用 → 目标资源组件激活 | `asset_ref_loads_components` | 序列化字段引用 asset，加载时触发组件 lifecycle |
| 方法调用 → 字段引用的资源加载 | `method_triggers_field_load` | 特定方法触发序列化字段引用的资源加载 |
| 方法调用 → SceneManager.LoadScene → 场景组件激活 | `method_triggers_scene_load` | 特定方法触发场景加载，场景中组件 lifecycle 被触发 |
| 静态分析无法解析的间接调用（调用目标在编译期不确定） | `method_triggers_method` | 声明"方法 A 在运行时触发方法 B"，注入合成 CALLS 边桥接 gap |
| 项目自定义入口方法 | `lifecycle_overrides` | 非标准 Unity lifecycle 的自定义入口 |

### 1.5 生成规则 YAML

使用以下模板，根据收集的线索填充：

```yaml
id: unity.<scenario-name>.v2
version: 2.0.0
family: analyze_rules
description: >-
  （可选）描述该规则覆盖的业务场景和调用链背景，
  包括间接调用的机制说明（事件派发/回调/条件分支多态等）。
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

resource_bindings:
  - kind: asset_ref_loads_components
    ref_field_pattern: "<field_pattern>"
    target_entry_points:
      - OnEnable
      - Awake

  - kind: method_triggers_field_load
    host_class_pattern: "<class_pattern>"
    field_name: "<field_name>"
    loader_methods:
      - <method_name>

  # 类型 C（可选）：方法触发场景加载，场景中组件 lifecycle 被触发
  - kind: method_triggers_scene_load
    host_class_pattern: "<class_pattern>"
    loader_methods:
      - <method_name>
    scene_name: "<scene_name>"           # 匹配 .unity 文件名（不含扩展名）
    target_entry_points:
      - Awake
      - Start
      - OnEnable

  # 类型 D（可选）：声明静态分析无法解析的间接调用
  # 适用场景：
  #   - 事件派发：C# Action/UnityEvent/delegate 的 Invoke()
  #   - 回调注册：Mirror SyncList.Callback、Observer 模式
  #   - 条件分支多态：if/switch 决定实际调用目标（状态机、策略模式）
  #   - 虚方法分派：接口/基类引用调用，实际类型由运行时条件决定
  # 注入一条 source_method → target_method 的合成 CALLS 边（精确匹配，一条边）
  - kind: method_triggers_method
    description: >-
      说明间接调用的机制。例如：
      "A 通过 EventHub.OnXxx?.Invoke() 触发，B 在初始化时订阅该事件"；
      "if (isServer) 分支中 handler 实际类型为 ConcreteHandler，
      后续 handler.Run() 实际调用 ConcreteHandler.Run()"
    source_class_pattern: "<source_class_regex>"   # 例如 "^PlayerActor$"
    source_method: "<source_method_name>"           # 例如 "ProcessInteractables"
    target_class_pattern: "<target_class_regex>"   # 例如 "^NetPlayer$"
    target_method: "<target_method_name>"           # 例如 "OnClientPickItUp"

lifecycle_overrides:
  additional_entry_points:
    - <custom_entry>
  scope: "<path_prefix>"

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
```

### 1.6 暂存并询问

将生成的 YAML 暂存（不写入文件），向用户确认：

> 规则 `<ruleId>` 已生成。是否继续录入下一条规则？

- 是 → 回到 1.1
- 否 → 进入 Phase 2

---

## Phase 2: 写入 + compile + analyze

### 2.1 写入规则文件

```bash
mkdir -p "$TARGET_REPO/.gitnexus/rules/approved"
# 将每条暂存的 YAML 写入对应文件
# 文件名: approved/<ruleId>.yaml
```

### 2.2 更新 catalog.json

```bash
# 如果 catalog.json 不存在，创建初始结构
if [ ! -f "$TARGET_REPO/.gitnexus/rules/catalog.json" ]; then
  echo '{"version":1,"rules":[]}' > "$TARGET_REPO/.gitnexus/rules/catalog.json"
fi
```

向 `rules` 数组追加每条规则的条目：

```json
{
  "id": "<ruleId>",
  "version": "2.0.0",
  "enabled": true,
  "file": "approved/<ruleId>.yaml",
  "family": "analyze_rules"
}
```

### 2.3 编译规则

```bash
gitnexus rule-lab compile --repo-path "$TARGET_REPO"
```

### 2.4 重建索引

```bash
gitnexus analyze "$TARGET_REPO" --force --extensions ".cs .meta"
# 如果所有代码都在 Assets/ 下，可加 --scope-prefix Assets/
```

---

## Phase 3: 逐一验证

对每条规则执行 4 项验证，每项给出 PASS/FAIL 判定。

### 验证 1: 合成边存在性

```
mcp__gitnexus__cypher:
  query: |
    MATCH (a)-[r:CodeRelation {type: 'CALLS'}]->(b)
    WHERE r.reason STARTS WITH 'unity-rule-'
    RETURN r.reason AS reason, count(*) AS cnt
    ORDER BY cnt DESC
  repo: <repo-name>
```

**PASS**: 返回 ≥1 行，且 `reason` 包含规则 ID。
**FAIL 诊断**: 规则未被 pipeline 加载 → 检查 catalog.json 的 `family` 字段。

### 验证 2: 运行时链路验证

```
mcp__gitnexus__query:
  query: "<trigger_token>"
  runtime_chain_verify: "on-demand"
  repo: <repo-name>
```

**PASS**: `runtime_chain.status === 'verified_full'` 且 `evidence_level === 'verified_chain'`。
**FAIL 诊断**:
- `rule_not_matched` → 规则的 `trigger_tokens` 未匹配查询文本
- `verification_failed` → 图谱中无匹配的 `unity-rule-*` 合成边

### 验证 3: Process 完整性

```
mcp__gitnexus__context:
  name: "<target_class>"
  repo: <repo-name>
```

**PASS**: `processes` 中至少有一个包含跨越资源层和代码层的步骤。
**FAIL 诊断**: 合成边 confidence 过低 → 检查 `RULE_EDGE_CONFIDENCE`（应为 0.75）。

### 验证 4: 合成边分布

```
mcp__gitnexus__cypher:
  query: |
    MATCH (a)-[r:CodeRelation {type: 'CALLS'}]->(b)
    WHERE r.reason STARTS WITH 'unity-rule-'
    RETURN
      CASE
        WHEN r.reason CONTAINS 'resource-load' THEN 'resource-load'
        WHEN r.reason CONTAINS 'lifecycle-override' THEN 'lifecycle-override'
        WHEN r.reason CONTAINS 'loader-bridge' THEN 'loader-bridge'
        WHEN r.reason CONTAINS 'scene-load' THEN 'scene-load'
        WHEN r.reason CONTAINS 'method-bridge' THEN 'method-bridge'
        ELSE 'other'
      END AS edgeKind,
      count(*) AS cnt
  repo: <repo-name>
```

**PASS**: 规则涉及的边类型均有产出（`method_triggers_method` 对应 `method-bridge`）。

---

## 失败诊断路径

| 症状 | 可能原因 | 修复方向 |
|------|---------|---------|
| 验证 1 失败（0 合成边） | 规则未被 compile 或 family 不对 | 检查 catalog.json + compiled bundle |
| 验证 1 部分（只有 resource-load） | method_triggers_field_load 参数错误 | 检查 host_class_pattern / loader_methods |
| 验证 1 部分（无 scene-load） | method_triggers_scene_load 参数错误 | 检查 scene_name 是否匹配 .unity 文件名 |
| 验证 1 部分（无 method-bridge） | method_triggers_method 类名/方法名不匹配 | 检查 source/target_class_pattern 和 source/target_method 是否与图谱中节点名一致 |
| 验证 2 失败（rule_not_matched） | trigger_tokens 未匹配查询文本 | 调整 match.trigger_tokens |
| 验证 2 失败（verification_failed） | 合成边 reason 中的 ruleId 不匹配 | 检查规则 ID 一致性 |
| 验证 3 失败（无 Process） | 合成边 confidence 过低 | 检查 RULE_EDGE_CONFIDENCE（应为 0.75） |
| 验证 4 链路断裂（中间有间接调用） | 事件派发/回调/条件分支多态/虚方法分派无静态 CALLS 边 | 添加 `method_triggers_method` binding 桥接间接调用 |
| lifecycle_overrides 无效 | scope 值不是文件路径前缀 | scope 应匹配 filePath 而非类名 |

---

## 参考文档

- 设计文档：`docs/plans/2026-04-04-unity-rule-gen-skill-design.md`
- YAML 格式定义：设计文档 section 3.3
- 注入逻辑：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
- 规则类型定义：`gitnexus/src/rule-lab/types.ts:90-114`
- 编译命令：`gitnexus rule-lab compile --repo-path <path>`
