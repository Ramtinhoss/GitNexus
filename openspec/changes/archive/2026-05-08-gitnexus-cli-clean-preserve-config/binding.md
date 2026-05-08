# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `openspec/schemas/orbitos-change-v1/schema.yaml`
- `project_page_ref`:
  - `repo://agentic/GitNexus/AGENTS.md` — GitNexus Agent 全局指导（含 CLI 使用规则）
  - `repo://agentic/GitNexus/.agents/skills/gitnexus/gitnexus-cli/SKILL.md` — gitnexus-cli skill 文件
- `additional_context_refs`:
  - `repo://agentic/GitNexus/docs/reports/2026-04-12-neonspark-mirror-syncvar-hook-gap-rule-rerun-issues.md`
  - `repo://agentic/GitNexus/docs/gitnexus-config-files.md`

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` — 更新 analyze/clean 工作流指导
  - `AGENTS.md` — 若涉及全局 agent 规则变更（本次不涉及核心规则，仅 skill 引用）
- `writeback_owner`: @nantasmac
- `writeback_timing`: 变更验证通过后（verification.md 完成）

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
