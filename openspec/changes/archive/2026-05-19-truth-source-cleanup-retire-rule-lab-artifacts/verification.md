# Verification

## 验证结论

本 change 以文档修正和文件删除为主，验证方式为静态检查（grep/read）和单次行为验证（clean + analyze）。所有验证项可在实施过程中逐项确认。

## Spec-to-Implementation Coverage

| Spec Requirement | 对应 Task(s) | 验证方式 |
|-----------------|-------------|---------|
| `code-line-references-accuracy` | T1.1, T1.2, T1.3, T1.4, T1.6 | `grep -n "pipeline.ts:\|local-backend.ts:\|schema.ts:\|process-evidence.ts:\|unity-lifecycle" docs/unity-runtime-process-source-of-truth.md` → 逐项在源码中确认 |
| `config-parameter-completeness` | T1.5, T1.6 | 对比真源文档 §5.2 参数表与 `unity-config.ts` 的 `UnityConfig` 接口，字段数和默认值一致 |
| `rule-lab-state-files` | T2.1 | `grep "catalog.json\|approved/\|compiled/\|lab/runs\|rules/reports" docs/gitnexus-config-files.md` → 无匹配 |
| `sync-manifest-description` | T2.2 | `grep "sync-manifest" docs/gitnexus-config-files.md` → 无匹配 |
| `meta-json-schema-completeness` | T2.3 | `grep "csharpDefineCsproj" docs/gitnexus-config-files.md` → 有匹配 |
| `unity-rule-gen-skill` | T3.1 | `test -f .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` → false |
| `unity-e2e-verify-skill` | T3.2 | `test -f .agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md` → false |
| `unity-rule-authoring-contract` | T3.3 | `test -f .agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` → false |
| `guide-skill-rule-gen-reference` | T3.4 | `grep "rule-gen\|analyze_rules" .agents/skills/gitnexus/gitnexus-guide/SKILL.md` → 无匹配 |
| `agents-md-skill-references` | T3.5 | `grep "rule-gen\|rule-lab\|rule_lab\|unity-e2e-verify" AGENTS.md` → 无匹配 |
| `clean-selective-deletion` | T4.1 | 执行 `gitnexus clean --force` → `test -f .gitnexus/meta.json` → true；`test -d .gitnexus/lbug` → false |
| `rebuild-after-clean` | T4.2 | clean 后 `gitnexus analyze --force` → 输出显示复用 stored options |

## Task-to-Evidence Coverage

| Task | Evidence | 验证命令 |
|------|----------|---------|
| T1.1 | 真源文档中 pipeline.ts 行号与源码一致 | `grep -n "pipeline.ts:" docs/unity-runtime-process-source-of-truth.md` |
| T1.2 | schema.ts 路径修正为 `gitnexus/src/core/lbug/schema.ts` | 同上 |
| T1.3 | local-backend.ts 行号校准 | 同上 |
| T1.4 | process-evidence.ts / lifecycle 行号校准 | 同上 |
| T1.5 | 参数表新增 3 行 | `grep "paritySeedCache\|parityCacheMax" docs/unity-runtime-process-source-of-truth.md` |
| T1.6 | 代码依据行号更新 | `grep "unity-config.ts:" docs/unity-runtime-process-source-of-truth.md` |
| T2.1 | 6 个 rule-lab 条目移除 | `grep -c "rule-lab\|catalog.json\|approved/" docs/gitnexus-config-files.md` = 0 |
| T2.2 | sync-manifest 章节移除 | `grep -c "sync-manifest" docs/gitnexus-config-files.md` = 0 |
| T2.3 | csharpDefineCsproj 出现 | `grep "csharpDefineCsproj" docs/gitnexus-config-files.md` |
| T3.1 | 文件不存在 | `test ! -f .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` |
| T3.2 | 文件不存在 | `test ! -f .agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md` |
| T3.3 | 文件不存在 | `test ! -f .agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` |
| T3.4 | 引用移除 | `grep "rule-gen" .agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| T3.5 | 引用移除 | `grep "rule-gen\|rule-lab\|rule_lab" AGENTS.md` |
| T4.1 | clean 保留 meta.json | 手动执行验证 |
| T4.2 | analyze 复用 stored options | 手动执行验证 |

## 关键证据入口

| 证据类型 | 证据路径/链接 | 对应 requirement/task |
| --- | --- | --- |
| 行号校准 | `docs/unity-runtime-process-source-of-truth.md` 全文 | T1.1-T1.6 |
| 配置清理 | `docs/gitnexus-config-files.md` | T2.1-T2.3 |
| Skill 删除 | `.agents/skills/gitnexus/` 目录 | T3.1-T3.5 |
| 行为变更 | `gitnexus/src/cli/clean.ts` | T4.1-T4.2 |

## 缺口与阻塞项

无已知缺口。T4.1-T4.2 需要手动在测试仓库上执行验证（clean + analyze 循环）。
