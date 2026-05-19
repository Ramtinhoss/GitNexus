# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `openspec/schemas/orbitos-change-v1/schema.yaml`
- `project_page_ref`:
  - `docs/unity-runtime-process-source-of-truth.md`（Unity Runtime Process 真理源）
  - `docs/gitnexus-config-files.md`（配置文件状态文档）
  - `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`（工具引导 skill）
  - `AGENTS.md`（仓库级 Agent 指引）
- `additional_context_refs`:
  - `openspec/changes/archive/2026-05-18-remove-rule-lab/`（rule-lab 移除 spec，已归档）
  - `openspec/changes/archive/2026-05-18-fix-unity-resource-chain-direct-script-ref/`（单跳链 spec，已归档）
  - `openspec/changes/archive/2026-05-11-remove-sync-manifest-simplify-analyze-opts/`（sync-manifest 移除 spec，已归档）
  - `openspec/changes/archive/2026-05-08-gitnexus-cli-clean-preserve-config/`（clean 保留配置 spec，已归档）

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `docs/unity-runtime-process-source-of-truth.md`（行号校准、参数补充）
  - `docs/gitnexus-config-files.md`（移除 rule-lab/sync-manifest 条目、补充 csharpDefineCsproj）
  - `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`（删除）
  - `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md`（删除）
  - `.agents/skills/gitnexus/gitnexus-guide/SKILL.md`（移除 rule-gen 引用行）
  - `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`（删除）
  - `gitnexus/src/cli/clean.ts`（保留 meta.json）
  - `AGENTS.md`（移除 rule-lab skill 条目）
- `writeback_owner`: 本 change 的实施者
- `writeback_timing`: 任务完成后统一回写，不逐步推进

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
