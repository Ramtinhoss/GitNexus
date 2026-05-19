# Writeback

## 回写摘要

- change：`truth-source-cleanup-retire-rule-lab-artifacts`
- 回写结论：待实施
- 关键结果：真源文档行号校准、配置文档清理、3 个 skill 删除、clean.ts 行为修正

## Capability / Spec 增量摘要

| Capability | 变更类型 | 对应 spec 文件 | 增量摘要 |
| --- | --- | --- | --- |
| `truth-source-line-calibration` | Modified | `specs/truth-source-line-calibration/spec.md` | 校准真源文档全部代码行号引用 + 补充 3 个 unity-config 参数 |
| `config-docs-cleanup` | Modified | `specs/config-docs-cleanup/spec.md` | 移除 rule-lab/sync-manifest 过时条目，补充 csharpDefineCsproj |
| `rule-lab-skill-retirement` | Removed | `specs/rule-lab-skill-retirement/spec.md` | 删除 3 个不可用 skill + 1 个 shared contract + 更新引用 |
| `clean-preserve-meta` | Modified | `specs/clean-preserve-meta/spec.md` | clean --force 改为选择性删除，保留 meta.json |

## 验证结论与证据入口

| 验证维度 | 结论 | 证据入口 |
| --- | --- | --- |
| Spec-to-Implementation | 12 个 requirement 全部覆盖 | `verification.md` / Spec-to-Implementation Coverage 表 |
| Task-to-Evidence | 16 个 task 均有验证命令 | `verification.md` / Task-to-Evidence Coverage 表 |

## 回写目标与字段映射

| 目标页 | 同步字段/区块 | 回写内容 |
| --- | --- | --- |
| `docs/unity-runtime-process-source-of-truth.md` | §2.1 代码行号、§5.2 参数表和代码依据 | 行号校准 + 3 参数新增 + 行号修正 |
| `docs/gitnexus-config-files.md` | Repo-local 表格、可选输入表、meta.json schema | 移除 7 个过时条目 + 补充 csharpDefineCsproj |
| `.agents/skills/gitnexus/gitnexus-unity-rule-gen/` | 整个目录 | 删除 |
| `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/` | 整个目录 | 删除 |
| `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` | 整个文件 | 删除 |
| `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` | skill 表格 | 移除 rule-gen 引用行 |
| `AGENTS.md` | Skill 安装表、available_skills 列表 | 移除 rule-lab skill 条目 |
| `gitnexus/src/cli/clean.ts` | clean 命令实现 | 改为选择性删除逻辑 |

## 回写执行结果

| 目标页 | 执行结果 | 执行时间 | 执行人 | 结果说明 |
| --- | --- | --- | --- | --- |
| `docs/unity-runtime-process-source-of-truth.md` | 待执行 | - | - | Phase 1 (T1.1-T1.6) |
| `docs/gitnexus-config-files.md` | 待执行 | - | - | Phase 2 (T2.1-T2.3) |
| 3 个 skill + 1 个 contract | 待执行 | - | - | Phase 3 (T3.1-T3.5) |
| `gitnexus/src/cli/clean.ts` | 待执行 | - | - | Phase 4 (T4.1-T4.2) |
| `AGENTS.md` | 待执行 | - | - | Phase 3 (T3.5) |

## 回写前置条件

- [x] 已读取 `spec_standard_ref`
- [x] `verification.md` 已生成且无阻塞项
- [x] 回写目标页已确认存在且可编辑
- [x] capability/spec 增量摘要已核对 proposal 与 specs 一致

## 不回写的内容

- 不复制完整 `proposal.md`、`design.md`、`specs/*/spec.md`、`tasks.md` 正文
- 不写与本次 change 无关的历史信息
- 不回写 `docs/plans/` 下的历史计划文档（保留不动）
