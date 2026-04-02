# Rule Lab 数据驱动重构设计（全栈一次重构）

Date: 2026-04-02
Owner: GitNexus
Status: Approved (by user)

## 0. 背景与问题

当前 Rule Lab 与 runtime verifier 的实现存在结构性偏差：

1. `reload` 场景仍有专用硬编码验证分支（固定资源路径/GUID/链路逻辑），导致“规则数据驱动”目标被削弱。
2. Rule Lab `promote` 阶段生成的规则对 `resource_types` / `host_base_type` 写入 `unknown`，规则语义不足。
3. `analyze` 当前输出最小占位候选，缺乏拓扑关系级候选抽取能力。
4. Phase5 验收 gate 侧重阶段覆盖与指标字段存在性，未能确保“规则可独立驱动链路验证”。

本设计目标是让“用户 + agent 共创的规则数据”成为 runtime chain 验证的唯一驱动源。

## 1. 目标与边界（已确认）

1. Rule Lab 的核心目标：
- 用规则数据表达拓扑关系与验证约束。
- runtime verifier 只基于规则 + 仓库证据执行，不依赖项目特定硬编码。

2. 兼容策略：
- 不做旧规则格式向后兼容。
- 测试与迁移阶段直接删除旧版规则文件，仅允许新 DSL 规则。

3. 结果约束：
- 缺少证据时必须显式返回 `gaps` 与失败分类。
- 不允许隐式 fallback 到旧逻辑。

4. 验收约束：
- 功能验收 + 结构验收双轨通过才算发布可用。

5. 非目标：
- 本轮不提供自动旧规则迁移器。
- 本轮不保证历史规则文件可继续加载。

## 2. 规则 DSL 设计（已确认）

### 2.1 设计原则

1. 规则表达层级为“拓扑关系级”（类型/基类/关系），非“具体 GUID/path 绑定级”。
2. 规则语言采用声明式谓词 DSL。
3. runtime 执行器按 DSL 解释执行，生成 hop/gap/status。

### 2.2 DSL 核心结构

1. `match`
- 触发匹配条件：tokens、symbol kind、可选模块范围。

2. `topology`
- hop 列表，每个 hop 声明：
- `from`：实体类型与约束（如 `resource.type`、`script.base_type`）
- `to`：目标实体类型与约束
- `edge`：关系类型（如 binds_script、calls、references）
- `constraints`：补充过滤条件（binding kind、method name 集合等）

3. `closure`
- `required_hops`：必须满足的 hop 集合
- 失败分类映射：匹配失败 / 证据不足 / 验证失败

4. `claims`
- `guarantees`、`non_guarantees`、`next_action`

### 2.3 示例（结构示意）

```yaml
id: neon.reload.v2
version: 2.0.0
match:
  trigger_tokens: [reload]
topology:
  - hop: resource
    from: { entity: resource, type: [asset, prefab, scene] }
    to:   { entity: script, base_type: [ReloadBase, Node] }
    edge: { kind: binds_script }
  - hop: code_loader
    from: { entity: method, name_any: [Equip, RegisterEvents] }
    to:   { entity: method, name_any: [StartRoutineWithEvents] }
    edge: { kind: calls }
closure:
  required_hops: [resource, guid_map, code_loader, code_runtime]
claims:
  guarantees: [...]
  non_guarantees: [...]
```

## 3. Rule Lab 六阶段重构（已确认）

### 3.1 discover

目标：从“依赖现有 catalog 切片”升级为“构建候选拓扑切片空间”。

输出：`slice-plan.json`，包含候选领域切片（如 reload/startup/loot/ui-binding）。

### 3.2 analyze

目标：从“单候选占位”升级为“多候选拓扑抽取”。

输出：每个 slice 的候选拓扑集合，含：
- 拓扑谓词草稿
- 证据样本
- 反例样本
- 覆盖率/冲突率统计

### 3.3 review-pack

目标：从 token 裁剪包升级为“决策包”。

输出：按候选拓扑组织的审阅卡，支持用户/agent 对候选进行选择和收敛。

### 3.4 curate

目标：从“非空步骤校验”升级为“规则草案结构化确认”。

输出：`dsl-draft.json`，必须包含：
- 拓扑谓词
- 必需 hops
- 失败分类映射
- guarantees / non_guarantees

### 3.5 promote

目标：从“unknown 占位 YAML”升级为“DSL 编译 + lint + catalog upsert”。

要求：
- 禁止输出 `resource_types/host_base_type` 纯 unknown 占位规则。
- 对 schema 与语义一致性执行 lint。

### 3.6 regress

目标：从“手工传 precision/coverage”升级为“自动 probe 评测”。

输出：
- probe 通过率
- precision/coverage 计算结果
- 失败样本与回放命令

## 4. Runtime Verifier 与验收重构（已确认）

### 4.1 verifier 重构

1. 删除 `reload` 专用硬编码分支与固定路径/GUID 常量。
2. 统一执行路径：
- 规则匹配
- 谓词执行
- hop/gap 归并
- closure 判定
- runtime claim 输出

### 4.2 失败分类

保留并标准化：
- `rule_not_matched`
- `rule_matched_but_evidence_missing`
- `rule_matched_but_verification_failed`
- `gate_disabled`

### 4.3 双轨验收

1. 功能验收
- 对每条 promoted 规则执行 query/context probes。
- 验证 runtime_claim 状态与 hop 闭环符合期望。

2. 结构验收
- 静态门禁扫描 verifier 源码，禁止项目特定路径/GUID/token 常量。
- 规则 schema/lint 必须通过。

3. Phase5 gate 升级
- 从“阶段覆盖 + 指标字段存在”升级为：
- 阶段覆盖
- DSL lint
- probe 通过率阈值
- 静态禁硬编码门禁

## 5. 执行里程碑（已确认，路线B）

### M1: 模型与存储面

1. 新 DSL schema 与 parser
2. registry 仅加载新格式
3. promote 编译链路替换
4. 旧规则清理策略落地

### M2: verifier 引擎

1. DSL 执行器实现
2. 移除 reload 硬编码分支
3. 静态门禁接入 CI

### M3: Rule Lab 生产链路

1. discover/analyze/review-pack/curate 重构
2. 产物结构化与可追溯

### M4: 验收体系

1. probe 套件与回放机制
2. phase5 gate 升级
3. 文档与技能流程同步

## 6. 发布条件与回滚

1. 发布条件
- M1~M4 全部通过
- 功能+结构双验收通过

2. 回滚策略
- 仅允许版本级回滚（代码与规则同步回退）
- 不启用旧逻辑 fallback

## 7. 已确认决策记录

1. 不进入 writing-plans 阶段，先完成设计文档与事实核查文档。
2. 不做旧规则格式兼容。
3. 测试时允许直接删除旧规则文件。
4. 验收必须包含结构门禁（禁硬编码）与功能门禁（runtime claim 闭环）。
