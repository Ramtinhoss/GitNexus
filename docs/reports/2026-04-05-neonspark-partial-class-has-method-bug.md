# neonspark partial class HAS_METHOD 缺失问题调查报告

- 日期: 2026-04-05
- 仓库: `/Volumes/Shuttle/projects/neonspark`
- GitNexus 版本: 1.5.0-rc.4
- 触发背景: 调查 `weapon-powerup-equip-chain` 规则第二条 method bridge（`EquipWithEvent -> WeaponPowerUp.Equip`）无法产出合成边

---

## 1. 问题描述

`unity.weapon-powerup-equip-chain.v2` 规则包含两条 `method_triggers_method` 桥接：

1. `PlayerActor.HoldPickup -> WeaponPowerUp.PickItUp` — **已产出合成边** ✅
2. `FirearmsPowerUp.EquipWithEvent -> WeaponPowerUp.Equip` — **未产出合成边** ❌

第二条桥接在 `analyze` 后仍然缺失，`runtime_chain_verify` 无法闭合。

---

## 2. 根因链路（已确认）

### 2.1 processMethodTriggersMethod 的查找机制

`unity-runtime-binding-rules.ts` 的 `processMethodTriggersMethod` 函数通过 `methodsByClassId` 索引查找 source 方法。该索引在 `applyUnityRuntimeBindingRules` 里构建：

```ts
for (const rel of graph.iterRelationships()) {
  if (rel.type !== 'HAS_METHOD') continue;
  const method = graph.getNode(rel.targetId);
  // ...
  methodsByClassId.set(rel.sourceId, list);
}
```

即：只有存在 `HAS_METHOD` 边的方法才能被找到。

### 2.2 FirearmsPowerUp.cs 的方法没有 HAS_METHOD 边

图查询确认：

```cypher
MATCH (m:Method)
WHERE m.filePath = 'Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs'
OPTIONAL MATCH (c)-[r:CodeRelation {type: 'HAS_METHOD'}]->(m)
RETURN m.name, c.name AS ownerClass
```

结果：`FirearmsPowerUp.cs` 里的 **24 个方法**（包括 `EquipWithEvent`、`Equip`、`PickItUp` 等）全部 `ownerClass = null`，没有任何 `HAS_METHOD` 边。

### 2.3 FirearmsPowerUp.cs 没有 Class 节点

```cypher
MATCH (f:File)-[r:CodeRelation {type: 'DEFINES'}]->(c:Class)
WHERE c.name = 'FirearmsPowerUp'
RETURN f.filePath, c.filePath
```

结果：图中只有一个 `FirearmsPowerUp` Class 节点，挂在 `FirearmsPowerUp.Affix.cs`。`FirearmsPowerUp.cs` 没有对应的 Class 节点。

`DEFINES` 关系确认：`FirearmsPowerUp.cs` 的 File 节点存在，且 `DEFINES` 边指向了 24 个方法和 2 个 struct，但**没有 Class 节点**。

### 2.4 tree-sitter 解析 FirearmsPowerUp.cs 失败

直接用 tree-sitter-c-sharp 解析该文件：

```
rootNode.hasError = true
error nodes: 133
class_declaration nodes: 0
```

错误从第 32 行（`namespace NEON.Game.PowerUps.ColdWeapon`）开始出现。单独解析该行没有问题，说明是文件前 31 行的某个构造与 namespace 声明的组合触发了解析失败。

### 2.5 对比：PlayerActor 和 NetPlayer 正常

```cypher
MATCH (c:Class {name: 'PlayerActor'})-[r:CodeRelation {type: 'HAS_METHOD'}]->(m)
RETURN c.filePath, count(m) AS methodCount
```

`PlayerActor` 的 38 个 partial 文件全部有 Class 节点，`HAS_METHOD` 边完整覆盖所有文件（共 357 个方法）。`NetPlayer` 的 36 个 partial 文件同样正常。

这说明 GitNexus 的 partial class 处理机制本身是正确的——每个 partial 文件都会创建独立的 Class 节点，方法通过 `findEnclosingClassId` 正确关联到各自文件的 Class 节点。

---

## 3. 已确认的设计行为（非 bug）

GitNexus 对 C# partial class 的处理方式：

- 每个 partial 文件独立创建 Class 节点，ID 为 `Class:{filePath}:{className}`
- 方法通过 `findEnclosingClassId`（AST 向上遍历）找到所在文件的 Class 节点，建立 `HAS_METHOD` 边
- 这是有意设计：保留文件级别的归属信息，不做跨文件合并

这个设计在 `PlayerActor`、`NetPlayer` 等类上工作正常。`FirearmsPowerUp` 的问题不是 partial class 机制，而是 tree-sitter 解析失败导致 Class 节点根本没有被创建。

---

## 4. 可疑原因（待验证）

`FirearmsPowerUp.cs` 第 27 行有一个 `using` 别名：

```csharp
using GameNodeGraph = NEON.Game.Graph.GameNodeGraph;
```

subagent 静态分析后给出两个候选：

**候选 A（较高可能）**：`using` 别名（第 27 行）与后续 `namespace` 声明的组合触发了 tree-sitter-c-sharp 0.21.3 的解析冲突。

**候选 B**：文件内的 tuple 类型字段（第 75 行）：
```csharp
[NonSerialized] public (int level, int exp) CurSoulData = new (1,0);
```
触发了 grammar 已知的 `[$.tuple_element, $.using_variable_declarator]` 冲突，导致级联错误。

tree-sitter-c-sharp 版本：**0.21.3**

---

## 5. 影响范围

- **直接影响**：`EquipWithEvent -> WeaponPowerUp.Equip` 桥接边无法产出
- **间接影响**：`FirearmsPowerUp.cs` 里的所有 24 个方法（`EquipWithEvent`、`Equip`、`PickItUp`、`UnEquip` 等）在图中是孤儿节点，无法通过 `HAS_METHOD` 索引被任何规则或查询找到
- **其他文件**：是否有其他 `.cs` 文件存在相同的解析失败，尚未全面扫描

---

## 6. 待确认事项

- [ ] 运行脚本确认是候选 A 还是候选 B 触发解析失败
- [ ] 扫描 neonspark 全仓库，统计有多少 `.cs` 文件存在相同的 tree-sitter 解析失败
- [ ] 确认 tree-sitter-c-sharp 是否有已知 issue 或更新版本修复了该问题

---

## 7. 修复方向

**短期（规则层面）**：在 `weapon-powerup-equip-chain` 规则里，将 `source_class_pattern` 从 `^FirearmsPowerUp$` 改为同时匹配 `FirearmsPowerUp` 在 `Affix.cs` 里的 Class 节点，并将 `source_method` 改为 `Affix.cs` 里实际存在的方法——但这只是绕过，不是根本修复。

**根本修复（两个方向）**：

**方案 A（ingestion 后处理）**：在图构建阶段，对 tree-sitter 解析失败的文件，fallback 到正则/行扫描提取 class 声明，确保 Class 节点被创建，`HAS_METHOD` 边能够建立。

**方案 B（升级 tree-sitter-c-sharp）**：升级到更新版本，确认是否修复了该解析 bug。

---

## 8. 参考文件

- `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts` — `processMethodTriggersMethod` 实现
- `gitnexus/src/core/ingestion/workers/parse-worker.ts:1095` — Class 节点 ID 生成
- `gitnexus/src/core/ingestion/utils.ts:300` — `findEnclosingClassId`
- `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs:27` — 可疑 using 别名
- `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs:75` — 可疑 tuple 字段
