# Unity Runtime Process E2E 验证报告

日期：2026-04-03
目标仓库：`/Volumes/Shuttle/unity-projects/neonspark`
规则 ID：`unity.weapon-equip-gungraph-reload.v2`

---

## 验证链路

WeaponPowerUp.Equip() → GunGraphMB.CurGunGraph setter → RegisterGraphEvents → GunGraph.RegisterEvents
→ [Unity 引擎隐式] GunGraph asset 加载 → 所有 Node 反序列化 → Node.OnEnable → Node.Init
→ GunOutput.Attack() → payload.GetInputValue → 节点链 GetValue → ReloadBase.GetValue → CheckReload

---

## Phase 0: CLI 构建 — PASS

从源码构建成功，`gitnexus/dist/cli/index.js` 存在。

## Phase 1: 规则创建 — PASS

### 创建的文件

1. `approved/unity.weapon-equip-gungraph-reload.v2.yaml` — 4 条 resource_bindings：

| Binding | Kind | 覆盖链路段 |
|---------|------|-----------|
| A | asset_ref_loads_components (gungraph\|graph) | WeaponPowerUp.asset → GunGraph asset GUID 引用 → lifecycle |
| B | asset_ref_loads_components (nodes) | GunGraph → Node 隐式反序列化 → OnEnable/Init |
| C | method_triggers_field_load (WeaponPowerUp.Equip) | Equip 触发 gungraph 字段资源加载 |
| D | method_triggers_field_load (GunOutput.Attack) | Attack 触发 payload 节点链 GetValue |

2. `catalog.json` — 添加了新规则条目（含 `family: "analyze_rules"`）
3. `compiled/analyze_rules.v2.json` — 手动添加编译后规则

### discover 验证

`rule-lab discover` 输出包含新 slice `weapon-equip-reload`，确认规则可被发现。

## Phase 2: analyze 执行 — PASS（但合成边注入失败）

analyze 完成：108,580 nodes / 469,655 edges / 300 flows。
但未观察到 `unity-rule-*` 合成边注入。

## Phase 3: 检索验证 — 部分完成

### 验证 1: 合成边存在性 — FAIL

Cypher 查询 `r.reason STARTS WITH 'unity-rule-'` 返回 0 行。
原因：合成边注入逻辑未被正确触发（见下方问题分析）。

### 验证 2: 运行时链路验证 — PASS

```
runtime_chain.status: verified_full
runtime_chain.evidence_level: verified_chain
hops: 5, all high confidence, 0 gaps
```

MCP query 工具的 runtime_chain_verify 机制独立于合成边，通过规则匹配 + 图谱证据验证成功。

### 验证 3 & 4: 未执行

因验证 1 失败，Process 完整性和端到端链路验证依赖合成边，暂未执行。

---

## 发现的问题

### 问题 1: `loadAnalyzeRules` 无法加载 analyze_rules 规则（已修复）

**文件**：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`

**根因**：`loadAnalyzeRules` 调用 `loadRuleRegistry`，而 `loadRuleRegistry` 优先从 `compiled/verification_rules.v2.json` 加载。当 verification bundle 存在时直接返回，完全跳过 catalog 和 analyze_rules bundle。随后 `loadAnalyzeRules` 过滤 `family === 'analyze_rules'` 得到 0 条结果。

**修复**：让 `loadAnalyzeRules` 直接从 `compiled/analyze_rules.v2.json` 加载，不再依赖 `loadRuleRegistry`。修复后确认返回 2 条规则（含新规则的 4 个 bindings）。

**修复位置**：`runtime-claim-rule-registry.ts:loadAnalyzeRules`

### 问题 2: Pipeline 静默吞掉规则注入错误

**文件**：`gitnexus/src/core/ingestion/pipeline.ts:474`

```typescript
} catch {
  // rule catalog missing or invalid — skip silently
}
```

Phase 5.7 的 catch 块吞掉了所有异常，导致规则加载失败时无任何诊断信息。建议至少在 dev 模式下输出 warning。

**状态**：未修复

### 问题 3: `method_triggers_field_load` binding 要求 target_entry_points（未修复）

**文件**：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:163`

```typescript
if (!classPattern || loaderMethodNames.size === 0 || entryPoints.length === 0) return 0;
```

Binding C（WeaponPowerUp.Equip → gungraph 加载）和 Binding D（GunOutput.Attack → payload GetValue）的语义是"方法触发字段引用的资源加载"，不需要 `target_entry_points`。但代码要求 `entryPoints.length > 0`，否则直接返回 0。

这两个 binding 的目的是建立 loader 方法到被引用资源上组件方法的合成边，但当前实现假设所有 `method_triggers_field_load` 都需要指定目标入口点。

**影响**：Binding C 和 D 不会产生任何合成边。

**建议**：当 `target_entry_points` 为空时，应该使用默认的 Unity lifecycle 入口（OnEnable, Awake, Start）或跳过入口点过滤直接连接到目标资源的所有组件。

**状态**：未修复

### 问题 4: `processLifecycleOverrides` scope 匹配目标错误（未修复）

**文件**：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:215`

```typescript
if (scopePattern && !scopePattern.test(cls.properties.name)) continue;
```

`scope` 字段值为 `"Assets/NEON/Code/Game/Graph"`（文件路径前缀），但代码用它匹配 `cls.properties.name`（类名如 `GunGraph`、`ReloadBase`）。路径模式永远不会匹配类名。

**影响**：lifecycle_overrides 的 scope 过滤无效，要么全部匹配（无 scope 时）要么全部不匹配（有 scope 时）。当前规则设置了 scope，所以 0 条 lifecycle override 边被注入。

**建议**：应该匹配 `cls.properties.filePath` 而非 `cls.properties.name`。

**状态**：未修复

### 问题 5: discover 不直接读取 approved/ 目录的 YAML

`rule-lab discover` 优先从 `compiled/analyze_rules.v2.json` 加载。手动写入 `approved/` 的规则必须同时手动更新 compiled bundle 才能被 discover 看到。没有独立的 compile/rebuild-bundle 命令。

**影响**：工作流摩擦——手动创建规则后需要额外步骤更新 compiled bundle。

**状态**：通过手动编辑 compiled bundle 绕过

---

## 已完成的修复

| # | 修复 | 文件 | 状态 |
|---|------|------|------|
| 1 | loadAnalyzeRules 直接读 analyze_rules bundle | runtime-claim-rule-registry.ts | 已修复，已验证 |

## 待修复项

| # | 问题 | 优先级 | 影响 |
|---|------|--------|------|
| 2 | Pipeline catch 静默吞错误 | P2 | 诊断困难 |
| 3 | method_triggers_field_load 强制要求 entry_points | P1 | Binding C/D 无法注入边 |
| 4 | lifecycle scope 匹配类名而非文件路径 | P1 | lifecycle override 边全部丢失 |
| 5 | 缺少独立的 compile/rebuild-bundle 命令 | P3 | 工作流摩擦 |

---

## 下一步

1. 修复问题 3 和 4（P1），重新构建 + analyze + 验证合成边
2. 完成验证 3（Process 完整性）和验证 4（端到端链路）
3. 可选：修复问题 2 的静默 catch
