# Event Delegate Gap 缺口分析

Date: 2026-04-12
Repo: GitNexus / neonspark
Status: 决策参考文档（不触发行动）

---

## 1. 背景

`event_delegate_gap` 是 gap-lab 分片体系中的顶层类型，当前已实现的子类型全部针对 Mirror 框架的同步回调机制（`mirror_syncvar_hook`、`mirror_synclist_callback`、`mirror_syncdictionary_callback`）。

neonspark 仓库中还存在三种更通用的事件/委托模式，它们同样会在图数据库中产生缺失的运行时连接边。本文分析这三种模式的规模、机制、以及适合的规则生成路径。

---

## 2. 三种模式概览

| 模式 | 代表类 | 规模（neonspark） | 机制 |
|------|--------|-------------------|------|
| 泛型类型总线 | `NewEventHub`、`GraphEventHub` | 721 个 `Raise` 调用，391 个 `Listen` 调用，299 种独立 event struct | `Raise(new TEvent{})` → 运行时按类型分发给所有 `Listen<TEvent>` 注册的 callback |
| Singleton Action 字段总线 | `EventHub`、`NetEventHub` | 147+48=195 个 `Action` 字段，1003+53=1056 个 `+=` 注册点 | `Instance.Field += callback` 注册，`Instance.Field?.Invoke()` 触发 |
| 包级泛型总线 | `GraphEventHub`（`com.veewo.veenode` 包） | 与 `NewEventHub` 同构，规模较小 | 与 `NewEventHub` 完全相同的 API |

---

## 3. 模式一：`NewEventHub` 泛型类型总线

### 3.1 机制

```csharp
// 注册（在 Awake/OnEnable 等生命周期方法里）
NewEventHub.Listen<PlayerActor.BattleStateChangedEvent>(this, OnBattleStateChangedEvent);
NewEventHub.Listen<NeonGameEvents.UnLockEvent>(this, OnUnLockEvent);

// 触发（在业务逻辑方法里）
NewEventHub.Raise(new PlayerActor.BattleStateChangedEvent { ... });
NewEventHub.Raise(new NeonGameEvents.UnLockEvent { ... });
```

`Raise` 的实现：`Raise<TEvent>` → `ProcessEvent<TEvent>` → 遍历 `Listeners[typeof(TEvent)]` 调用每个 callback。

连接的语义：**`Raise` 的调用者方法 → 所有注册了同一 `TEvent` 类型的 callback 方法**，通过 `typeof(TEvent)` 在运行时建立，静态分析不可见。

### 3.2 规模

- **721 个** `NewEventHub.Raise(new ...)` 调用点，分布在 333 个文件
- **391 个** `NewEventHub.Listen<...>` 注册点，分布在 391 个文件
- **299 种**独立的 event struct 类型（`PlayerActor.BattleStateChangedEvent`、`NeonGameEvents.UnLockEvent` 等）
- 高频 event type（`PlayerActor.BattleStateChangedEvent` 有 45 个 Listen 注册点）

### 3.3 图数据库中的缺口

当前图里能看到：
- `SomeMethod → NewEventHub.Raise`（CALLS 边，静态可见）
- `SomeMethod → NewEventHub.Listen`（CALLS 边，静态可见）

图里看不到：
- `SomeMethod（Raise 调用者）→ OnBattleStateChangedEvent（Listen 注册的 callback）`

这条缺失的边是 `method_triggers_method` 语义，连接 publisher 和 subscriber。

### 3.4 为什么不适合 gap-lab 分片

gap-lab 的分片模型假设：**一个词法信号 → 一组候选 → 每个候选有明确的 source/target anchor 对**。

`NewEventHub` 不符合这个假设：
- 词法信号（`Raise(new X{})` 和 `Listen<X>(..., callback)`）是分离的，需要按类型参数 `X` 配对
- 一个 event type 可能有多个 `Raise` 调用者和多个 `Listen` 注册者，形成 M×N 的连接矩阵
- 299 种 event type 意味着需要 299 个分片，每个分片的 accepted 候选数量不确定

手工 gap-lab 分片的成本与收益不成比例。

### 3.5 适合的路径

**`analyze_rules` 批量生成**：用 Cypher 查询图数据库，按 event type 分组，找出每种 event type 的所有 `Raise` 调用者和 `Listen` 注册的 callback，为每种 event type 生成一条（或多条）`method_triggers_method` 规则。

这个过程可以半自动化：
1. 查询所有 `Raise` 调用者，按 event struct 类型分组
2. 查询所有 `Listen` 注册点，提取 callback 方法名和 event struct 类型
3. 按类型配对，生成规则草稿
4. 用户批量审查（而不是逐候选确认）

**关键前提**：图数据库里需要能识别 `NewEventHub.Raise(new X{})` 中的 `X` 类型，以及 `NewEventHub.Listen<X>(this, callback)` 中的 `X` 类型和 `callback` 方法名。当前 analyze 的 call-processor 只捕获方法名，不捕获泛型类型参数，所以这个路径需要 analyze 层面的增强（见第 5 节）。

---

## 4. 模式二：`EventHub` / `NetEventHub` Singleton Action 字段总线

### 4.1 机制

```csharp
// EventHub 字段定义（147 个）
public class EventHub : ComponentSingleton<EventHub> {
    public Action<RoomMB, PlayerActor> OnPlayerEntersRoom;
    public Action<bool> onNextLevel;
    public Action<PlayerActor> OnPlayerStartFly;
    // ... 共 147 个 Action/UnityAction 字段
}

// 注册（1003 个 += 调用点）
EventHub.Instance.OnPlayerEntersRoom += OnPlayerEntersRoom;

// 触发（?.Invoke 或直接调用）
EventHub.Instance.OnPlayerEntersRoom(room, null);
EventHub.Instance.onCostFail?.Invoke((CostType)tipInfoMsg.TipType);
```

连接的语义：**触发 `Field?.Invoke()` 的方法 → 所有执行了 `Field += callback` 的 callback 方法**，通过字段名在运行时建立。

### 4.2 规模

- `EventHub`：147 个 `Action`/`UnityAction` 字段，1003 个 `+=` 注册点
- `NetEventHub`：48 个字段，53 个 `+=` 注册点
- 合计：195 个字段，1056 个注册点

### 4.3 图数据库中的缺口

当前图里能看到：
- `SomeMethod → EventHub.Instance`（通过 singleton 访问，CALLS 边）
- `?.Invoke()` 调用：`conditional_access_expression` 已在 CSHARP_QUERIES 里捕获，但 `Invoke` 是 delegate 的内置方法，不对应任何用户定义的方法节点，所以不会产生有意义的 CALLS 边

图里看不到：
- `TriggerMethod → RegisteredCallback`（触发者 → 注册的 callback）

### 4.4 与 `NewEventHub` 的本质区别

`EventHub` 的连接是**字段名驱动**的，而不是类型参数驱动的。这意味着：
- 连接的两端（`+=` 注册点和 `?.Invoke()` 触发点）都引用同一个字段名
- 字段名是稳定的标识符，静态分析可以直接匹配
- 不需要泛型类型推断

这使得 `EventHub` 模式**原则上可以通过 analyze 算法改良自动处理**：识别 `ComponentSingleton<T>` 子类的 `public Action` 字段，扫描 `+=` 注册点和 `?.Invoke()` 触发点，按字段名配对，注入合成 CALLS 边。

### 4.5 为什么不适合 gap-lab 分片

- 195 个字段 × 多个注册者 = 大量候选，手工确认成本极高
- 字段名配对是纯机械操作，不需要人工判断
- `EventHub` 是工程架构级的固定模式，不会随业务变化新增新的 hub 类

### 4.6 适合的路径

**analyze 算法改良（Phase 5.65）**：在 Phase 5.7（规则驱动注入）之前，增加一个专门处理 singleton event hub 模式的 pass：

1. 识别 `ComponentSingleton<T>` 子类
2. 扫描其 `public Action`/`public UnityAction` 字段列表
3. 全库扫描 `Instance.Field += callback` 注册点，建立 `字段名 → [callback 方法]` 映射
4. 全库扫描 `Instance.Field?.Invoke()` / `Instance.Field(...)` 触发点，建立 `字段名 → [触发方法]` 映射
5. 为每个字段注入：`触发方法 → callback 方法` 的合成 CALLS 边

这个 pass 完全自动化，不需要用户输入，产物是合成边而不是规则文件。

**注意**：这个路径注入的是"所有曾经注册过的 callback"的全集，不区分运行时的注册/注销状态。这会产生一定的假阳性（某个 callback 在触发时已经注销了），但对于图数据库的可达性分析来说，假阳性比假阴性的代价更低。

---

## 5. analyze 层面的增强需求

两种模式都需要 analyze 层面的能力增强，但需求不同：

### 5.1 `NewEventHub` 需要的增强

**泛型类型参数捕获**：当前 `CSHARP_QUERIES` 的 call 查询只捕获方法名，不捕获泛型类型参数。

```
// 当前捕获：方法名 "Raise"
NewEventHub.Raise(new PlayerActor.BattleStateChangedEvent { ... })

// 需要额外捕获：传入的 struct 类型名 "PlayerActor.BattleStateChangedEvent"
```

这需要在 tree-sitter 查询层面增加对 `object_creation_expression` 类型名的捕获，并在 `call-processor.ts` 里把它关联到 `Raise` 调用。

**实现复杂度**：中等。需要修改 `CSHARP_QUERIES` 和 `call-processor.ts`，但不涉及图结构变化。

### 5.2 `EventHub` 需要的增强

**`+=` 赋值捕获**：当前 `CSHARP_QUERIES` 不捕获 `assignment_expression`（`+=` 操作）。

```
// 当前不捕获
EventHub.Instance.OnPlayerEntersRoom += OnPlayerEntersRoom;

// 需要捕获：字段名 "OnPlayerEntersRoom" 和 callback 名 "OnPlayerEntersRoom"
```

这需要在 `CSHARP_QUERIES` 里增加 `assignment_expression` 的捕获，并在 `call-processor.ts` 里区分 `+=` 赋值和普通调用。

**实现复杂度**：中等偏高。`+=` 赋值在 tree-sitter C# grammar 里是 `assignment_expression`，需要区分 `+=`（delegate 注册）和 `=`（普通赋值），并且需要识别左侧是 singleton 字段访问。

---

## 6. 与 `method_triggers_method` 规则的关系

`method_triggers_method` 规则的设计初衷之一就是处理动态事件注册时锚点的不确定性：当 source 方法和 target 方法之间的连接无法通过静态分析直接建立时，用规则显式声明这条连接。

对于 `NewEventHub` 和 `EventHub` 这两种模式：

- **如果走 analyze 算法改良路径**：合成边直接注入图，不需要 `method_triggers_method` 规则，但需要 analyze 层面的代码改动
- **如果走 analyze_rules 路径**：每个 event type / 每个字段对应一条规则，规则数量会非常大（`NewEventHub` 需要 299 条，`EventHub` 需要 195 条），维护成本高

两种路径的核心权衡：**一次性的 analyze 算法改动** vs **持续维护的大量规则文件**。

---

## 7. 规模汇总

| 模式 | 连接数量级 | 规则数量级（如果走规则路径） | 适合路径 |
|------|-----------|---------------------------|---------|
| `NewEventHub` 泛型总线 | 721 Raise × 391 Listen，按 299 种类型分组 | ~299 条规则 | analyze 算法改良（泛型类型参数捕获） |
| `EventHub` Action 字段 | 1003 个注册点，195 个字段 | ~195 条规则 | analyze 算法改良（`+=` 赋值捕获 + singleton hub pass） |
| `NetEventHub` Action 字段 | 53 个注册点，48 个字段 | ~48 条规则 | 同上，与 `EventHub` 合并处理 |
| Mirror SyncVar hook（已有） | 76 个候选，2 个 accepted | 2 条规则 | gap-lab 分片（已实现） |
| Mirror SyncList Callback（已有） | 待扫描 | 少量 | gap-lab 分片（已实现） |

---

## 8. 结论

`event_delegate_gap` 下的缺口在 neonspark 中分为两类性质不同的问题：

**第一类（Mirror 框架回调）**：词法信号明确，anchor 需要静态分析辅助，规模有限，适合 gap-lab 分片 + `method_triggers_method` 规则。这是当前已实现的路径，方向正确。

**第二类（工程架构级事件总线）**：连接规律固定，规模巨大，适合 analyze 算法改良而不是规则文件。走规则路径会产生数百条需要持续维护的规则，且这些规则的内容是算法可以自动推导的，没有必要手工编写。

两类问题的边界清晰，不需要在 gap-lab 分片体系里为第二类新增子类型。
