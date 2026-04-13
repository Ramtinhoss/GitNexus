# Gap-Lab / Rule-Lab 回滚后架构（Source of Decision）

Date: 2026-04-13  
Owner: GitNexus  
Status: Active

---

## 1. 文档定位

本文记录已经确认的回滚方案，替代之前的“gap-lab + rule-lab 双状态机”理想化设计。  
当旧文档与本文冲突时，以本文为准。

---

## 2. 已确认决策（不可回退）

1. `gap-lab` 不再作为产品工作流继续推进。  
2. 保留缩减版 `rule-lab`，仅用于“稀疏、非规律”的缺口补规则。  
3. 缩减版 `rule-lab` 只保留 3 个 guard：
   - duplicate-prevention（与 `rules/approved/*.yaml` 去重）
   - fail-closed binding resolution（未解析绑定直接失败）
   - non-empty evidence before promote（无有效 evidence 不可晋升）
4. 缩减版 `rule-lab` 仅支持 `exact source/target pair`，不做穷举候选宇宙。  
5. anchor 歧义必须在 authoring/skill 层由用户选择，不允许自动猜测。  
6. event/delegate 缺口属于 analyzer 能力建设，不属于规则作者工作流。  
7. query-time runtime closure 保持 graph-only，不依赖 gap-lab/rule authoring 状态。

---

## 3. 新工作流边界

### 3.1 保留的最小闭环

```text
User clue (exact pair) -> rule-lab analyze -> review/curate -> promote
```

约束：
- 输入是明确的 source/target 组合，不是全库穷举发现结果。
- `rule-lab analyze` 负责产生 proposal candidate + `curation-input.json`。
- 只有通过 3 guards 的 proposal 才允许进入 promote。

### 3.2 删除的旧机制

以下机制不再作为默认产品流程：
- `gap-lab` 分片穷举发现（C1a~C1d）
- C0 parity gate（gap-lab 与 rules/lab 工件对齐门）
- C2.6 candidate-derived coverage gate
- 基于 exhaustive universe 的 `source_gap_handoff` 审计依赖

保留说明：
- 旧工件/命令可以继续存在于代码中用于兼容或迁移，但不再出现在文档主路径与 skill 操作路径中。

---

## 4. 缩减版 Rule-Lab 规范

### 4.1 输入契约

每次 authoring 只处理一个或一组明确的 `exact source/target pairs`。  
若存在多个 source 或 target 候选，必须先由用户做离散选择，再进入 analyze。

### 4.2 三个强制 Guard

1. Duplicate-prevention  
   与 `.gitnexus/rules/catalog.json` + `.gitnexus/rules/approved/*.yaml` 对比，`rule_id` 冲突直接阻断（hard-stop）。

2. Fail-closed binding resolution  
   绑定解析失败时不得降级写入占位符，直接阻断。

3. Non-empty evidence before promote  
   `confirmed_chain.steps` 或等价 evidence 为空时，禁止 promote。

### 4.3 非目标

缩减版 `rule-lab` 不负责：
- 大规模规律性 gap 的自动发现
- event bus / delegate 注册体系的结构化提取
- query-time verifier 的逻辑控制

---

## 5. Event/Delegate 问题的归属

`NewEventHub` / `EventHub` / `NetEventHub` 这类模式不走规则作者闭环作为主路径。  
主路径是 analyzer-native 能力：
- 捕获 `assignment_expression`（`+=` / `-=`）
- 建立 delegate/action field 符号与注册/触发关联
- 捕获泛型事件总线的类型参数与 callback 绑定

规则作者路径仅用于少量、非规律、无法稳定算法化的残余缺口。

---

## 6. 与 Query-Time 的关系

- query-time runtime closure 仍是 graph-only。  
- 规则系统在 analyze-time 注入合成边；query-time 不做规则目录匹配闭环。  
- 当 `hydration_policy=strict` 且 `fallbackToCompact=true`，仍需 parity rerun 后再做 closure 结论。

---

## 7. 迁移要求

1. 文档与 skill 不再把 `gitnexus gap-lab run` 作为主推荐路径。  
2. 对外指引统一改为“exact-pair + 3 guards”的 reduced `rule-lab`。  
3. event/delegate 缺口文档统一标注为 analyzer track。  
4. 若未来删除旧 gap-lab 实现，需同步更新本文件与相关 skills。
