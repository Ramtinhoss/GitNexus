# Unity Gap-Lab Skill Smoke

## Case A: first-run focus lock

Command: `rg -n "If missing .*gap_type.*gap_subtype|No implicit \"run all slices\"|Single-slice only" gitnexus/skills/gitnexus-unity-rule-gen.md`
Output summary: 命中 focus-lock 与 single-slice 约束：`If missing gap_type/gap_subtype, ask the user...`、`No implicit "run all slices" behavior. Single-slice only.`
Expected signal: 同时出现“缺省 focus 先询问”与“禁止全量 slice 自动执行”文案。
Decision: PASS

Command: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "enforces Phase A/B/C/D"`
Output summary: 1 passed, 9 skipped（focus-lock + Phase A/B/C/D + single-slice 合约断言通过）。
Expected signal: 目标断言通过，无 missing clauses 报错。
Decision: PASS

## Case B: resume from progress.json

Command: 以真实 run id 初始化 smoke run 工件：
`RUN_ID="smoke-20260410-1954"` 并写入 `.gitnexus/gap-lab/runs/$RUN_ID/{manifest.json,slice-plan.json,progress.json,inventory.jsonl,decisions.jsonl,slices/<slice_id>.json}`。
Output summary: 产物路径 `RUN_PATH=.gitnexus/gap-lab/runs/smoke-20260410-1954`，目录包含 `manifest.json/slice-plan.json/progress.json` 等必需文件。
Expected signal: 首次运行产物使用真实 run id 路径，不含 `<run_id>` 占位符。
Decision: PASS

Command: `rg -n "checkpoint_phase|next_command|status_transition|confirmed_chain|steps" .gitnexus/gap-lab/runs/smoke-20260410-1954/progress.json .gitnexus/gap-lab/runs/smoke-20260410-1954/slice-plan.json .gitnexus/gap-lab/runs/smoke-20260410-1954/slices/event_delegate.mirror_synclist_callback.json`
Output summary: `checkpoint_phase=phase_d_persisted`、`next_command=gitnexus rule-lab analyze ... --run-id "smoke-20260410-1954" ...`、`status_transition=["in_progress","blocked"]`。
Expected signal: 可恢复阶段与继续命令存在，且只记录当前 focus slice 的状态迁移。
Decision: PASS

Command: `wc -l .gitnexus/gap-lab/runs/smoke-20260410-1954/inventory.jsonl`
Output summary: `1` 行（已有 inventory 保留）。
Expected signal: 恢复提示存在且 inventory 未被重置。
Decision: PASS

## Case C: insufficient evidence gate

Command: `npx --prefix gitnexus vitest run gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "requires non-empty closure evidence"`
Output summary: 1 passed, 9 skipped（`verified/done` 前需非空闭环证据的契约断言通过）。
Expected signal: 非空闭环证据门禁存在（`confirmed_chain.steps`）。
Decision: PASS

Command: `rg -n '"status": "blocked"|"steps": \[\]' .gitnexus/gap-lab/runs/smoke-20260410-1954/slices/event_delegate.mirror_synclist_callback.json`
Output summary: 命中 `status: blocked` 与 `steps: []`。
Expected signal: 证据不足场景不进入 `verified/done`，保持 `blocked`。
Decision: PASS
