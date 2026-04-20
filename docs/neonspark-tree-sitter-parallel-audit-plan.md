# Neonspark Tree-sitter 并行体检与回归计划

## 1. 目标

在**不进入正式 CLI 工作流**、不依赖 `analyze` 重建验证的前提下，对 neonspark 的 `sync-manifest` 范围内 C# 文件执行 tree-sitter 健康检查，收集可追溯错误清单，并形成可重复执行的回归基线。

## 2. 范围

- 仓库：`/Volumes/Shuttle/projects/neonspark`
- manifest：`.gitnexus/sync-manifest.txt`
- 仅解析：`.cs`
- 明确排除：`.meta`（不参与 tree-sitter 解析，也不进入报告）

## 3. 非目标

- 不修改 `gitnexus analyze` 正式命令行为
- 不做索引重建结果校验
- 不做图层（HAS_METHOD / orphan）验证

## 4. 执行模式

- 编排技能：`dispatching-parallel-agents`
- 调度模式：`parallel-worker`
- 子任务模型：每个 shard 一个 subagent，只读扫描 + 独立产物写入

## 5. 产物结构

统一 run 目录：

`/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/<run_id>/`

建议产物：

- `run-metadata.json`
- `manifest-expanded-files.txt`
- `shard-plan.json`
- `shards/shard-XX.jsonl`
- `shards/shard-XX-summary.json`
- `diagnostics.jsonl`
- `summary.md`

## 6. 执行阶段

### Phase 0：Controller 预处理

1. 解析 manifest，展开 scope rules。
2. 枚举匹配文件并过滤为 `.cs`。
3. 计算每个文件的基础特征：
   - `size_bytes`
   - `has_cjk`（是否含 CJK 字符）
   - `path_risk`（如 `Assets/Plugins/`）

### Phase 1：分片（Sharding）

采用加权分片，尽量均衡每个 shard 的总成本：

- `size_weight`: 按文件大小分档
- `risk_weight`:
  - `+3`：`size > 32KB`
  - `+2`：`has_cjk = true`
  - `+1`：路径命中 `Assets/Plugins/`

建议并发度：`6`（可按机器核数调整）。

### Phase 2：并行分发

每个 subagent 接收一个 shard，执行：

1. 加载 parser + C# grammar。
2. 对 shard 内每个文件做分块 parse（回调模式，避免大文件单块输入问题）。
3. 统计并输出逐文件诊断。

### Phase 3：汇总

Controller 按 `wait-any` 收敛全部 worker：

1. 合并 `shards/*.jsonl` 为 `diagnostics.jsonl`。
2. 聚合统计并生成 `summary.md`。
3. 写入 run 元信息（版本、参数、时间、manifest hash）。

## 7. Subagent 最小任务包（固定契约）

每个 worker prompt 必须包含：

1. Objective：解析指定 shard 的 `.cs` 文件并输出结构化诊断。
2. Scope boundary：只读 shard 清单中的文件。
3. Explicit write set：仅可写 `shards/shard-XX.*`。
4. Forbidden write set：源代码、其他 shard 产物、run 根目录其他关键文件。
5. Completion criteria：
   - `files_total == files_processed + files_failed + files_skipped`
   - 产物 JSON 可反序列化
   - 无越权写入

## 8. 诊断口径（统一定义）

每文件至少记录以下类型：

- `parse_throw`：parse 过程抛异常
- `root_has_error`：`rootNode.hasError = true`
- `missing_container_with_methods`：`class/interface/struct/record/delegate/enum` 总计为 `0` 且 `method_declaration > 0`
- `missing_class_with_methods`：兼容标签，仅用于历史对比（不再作为主告警）
- `ok`：未命中上述异常

## 9. 诊断记录格式（建议）

```json
{
  "run_id": "ts-audit-20260406-xxxx",
  "shard_id": "03",
  "file_path": "Assets/NEON/Code/xxx.cs",
  "size_bytes": 12345,
  "has_cjk": true,
  "container_counts": {
    "class": 1,
    "interface": 0,
    "struct": 0,
    "record": 0,
    "delegate": 0,
    "enum": 0
  },
  "method_count": 6,
  "root_has_error": false,
  "classified_error_type": "ok",
  "compatibility_tags": [],
  "is_false_positive_likely": false,
  "message": ""
}
```

## 10. 通过/失败标准

建议 gate：

- `fail`：存在任意 `parse_throw`
- `warn`：`missing_container_with_methods > 0`
- `warn`：`root_has_error` 相比基线上升

## 11. 回归执行方式（复用规则）

后续 tree-sitter 升级或解析逻辑调整后，复跑本计划即可。

对比基线时重点看：

1. `parse_throw` 是否新增
2. `missing_container_with_methods` 是否新增/上升
3. `root_has_error` 总量是否上升

若以上关键指标未恶化，则判定本轮回归通过。

## 12. 维护触发条件（需要更新计划）

仅在以下变更发生时更新本计划：

1. `sync-manifest` 范围规则改变
2. 诊断口径（error_type 定义）改变
3. 分片/并发策略改变
4. tree-sitter API 或绑定行为发生兼容性变化

未触发以上变更时，本计划可持续复用。
