# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: N/A（本次变更为纯移除操作，不涉及新增行为规范）
- `project_page_ref`: `docs/unity-runtime-process-source-of-truth.md`（真理源文档）
- `additional_context_refs`:
  - `UNITY_RUNTIME_PROCESS.md`（Pipeline 执行顺序与配置文档）
  - `docs/event-delegate-gap-analysis.md`（event/delegate 缺口分析）
  - `gitnexus/AGENTS.md`（子项目 Agent 指引）

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`（本次变更无新增 capability，不产生 spec）
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据
- 退役设计归档位置：`docs/unity-runtime-process-source-of-truth.md` 末尾新增「附录 C：已退役 — Rule Lab」

## 回写目标

- `writeback_targets`:
  - `docs/unity-runtime-process-source-of-truth.md`：更新 Pipeline 执行顺序，新增退役附录 C
  - `UNITY_RUNTIME_PROCESS.md`：更新 Pipeline 执行顺序表与配置方式表
  - `docs/event-delegate-gap-analysis.md`：移除 reduced rule-lab 职责边界引用
  - `gitnexus/AGENTS.md`：移除 binding kind 新增字段强制要求
- `writeback_owner`: nantasmac
- `writeback_timing`: 实施完成后立即回写

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 退役附录 C 中的设计描述仅用于历史追溯，不作为行为规范真源

## 待确认项

- [x] 已确认退役设计归档位置（`docs/unity-runtime-process-source-of-truth.md` 附录 C）
- [x] 已确认文档回写目标（4 个文件）
- [x] 已确认异常处理策略（编译产物残留文件静默忽略，不产生错误）
