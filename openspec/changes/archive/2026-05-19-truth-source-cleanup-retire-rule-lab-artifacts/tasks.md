# Tasks

## Phase 1: 真源文档行号校准 + 参数补充

- [x] **T1.1** 校准 `docs/unity-runtime-process-source-of-truth.md` §2.1 中 pipeline.ts 行号引用
  - Spec: `truth-source-line-calibration` / `code-line-references-accuracy`
  - 实现：将 `pipeline.ts:441` → `:498`，`pipeline.ts:444` → `:502`，`pipeline.ts:446` → `:505`，`pipeline.ts:490-525` → `:534-580`
  - 验证：`grep -n "pipeline.ts:" docs/unity-runtime-process-source-of-truth.md` 确认行号与源码匹配

- [x] **T1.2** 校准真源文档中 schema.ts 路径引用
  - Spec: `truth-source-line-calibration` / `code-line-references-accuracy`
  - 实现：`schema.ts:254` → `gitnexus/src/core/lbug/schema.ts`（移除行号，改为关键描述）
  - 验证：路径存在且 REL_TYPES 定义位置描述准确

- [x] **T1.3** 校准真源文档中 local-backend.ts 行号引用
  - Spec: `truth-source-line-calibration` / `code-line-references-accuracy`
  - 实现：`local-backend.ts:763-793` → `:736-748`，`local-backend.ts:1460-1483` → 根据实际 STEP_IN_PROCESS 查询位置校准
  - 验证：`grep -n "local-backend.ts:" docs/unity-runtime-process-source-of-truth.md` 确认匹配

- [x] **T1.4** 校准真源文档中 process-evidence.ts 和 unity-lifecycle-synthetic-calls.ts 行号
  - Spec: `truth-source-line-calibration` / `code-line-references-accuracy`
  - 实现：`process-evidence.ts:46-114` → `:45-103`，`unity-lifecycle-synthetic-calls.ts:52-107` → `:52-103`
  - 验证：对应源码文件行数和函数位置匹配

- [x] **T1.5** 补充真源文档 §5.2 中缺失的 3 个 unity-config 参数
  - Spec: `truth-source-line-calibration` / `config-parameter-completeness`
  - 实现：在参数表中新增 `paritySeedCacheIdleMs`(60000)、`paritySeedCacheMaxEntries`(100)、`parityCacheMaxEntries`(500)
  - 验证：参数表行数与 `UnityConfig` 接口字段数一致

- [x] **T1.6** 更新真源文档 §5.2 底部代码依据行号
  - 实现：`unity-config.ts:4-18,26-40` → `unity-config.ts:1-16,26-41`
  - 验证：行号范围覆盖接口定义和默认值

## Phase 2: 配置文档清理

- [x] **T2.1** 从 `docs/gitnexus-config-files.md` 移除 rule-lab 状态文件条目
  - Spec: `config-docs-cleanup` / `rule-lab-state-files`
  - 实现：移除 `rules/catalog.json`、`rules/approved/*.yaml`、`rules/compiled/*.v2.json`、`rules/lab/runs/**`、`rules/reports/*.md`、`rules/overrides.yaml` 共 6 个条目
  - 验证：`grep "rule-lab\|catalog.json\|approved/\|compiled/\|lab/runs\|rules/reports" docs/gitnexus-config-files.md` 无匹配

- [x] **T2.2** 从 `docs/gitnexus-config-files.md` 移除 sync-manifest 内容
  - Spec: `config-docs-cleanup` / `sync-manifest-description`
  - 实现：移除 `.gitnexus/sync-manifest.txt` 条目和 `sync-manifest.txt unified rules` 整个章节
  - 验证：`grep "sync-manifest" docs/gitnexus-config-files.md` 无匹配

- [x] **T2.3** 补充 `meta.json` schema 中的 `csharpDefineCsproj` 字段
  - Spec: `config-docs-cleanup` / `meta-json-schema-completeness`
  - 实现：在 `analyzeOptions` 示例中添加 `"csharpDefineCsproj": "optional-path-to.csproj"` 字段及注释
  - 验证：schema 示例包含该字段

## Phase 3: Skill 文件退役

- [x] **T3.1** 删除 `gitnexus-unity-rule-gen` skill
  - Spec: `rule-lab-skill-retirement` / `unity-rule-gen-skill`
  - 实现：`rm .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` 及目录
  - 验证：路径不存在

- [x] **T3.2** 删除 `gitnexus-unity-e2e-verify` skill
  - Spec: `rule-lab-skill-retirement` / `unity-e2e-verify-skill`
  - 实现：`rm -rf .agents/skills/gitnexus/gitnexus-unity-e2e-verify/`
  - 验证：路径不存在

- [x] **T3.3** 删除 `unity-rule-authoring-contract`
  - Spec: `rule-lab-skill-retirement` / `unity-rule-authoring-contract`
  - 实现：`rm .agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
  - 验证：文件不存在

- [x] **T3.4** 更新 `gitnexus-guide/SKILL.md` 移除 rule-gen 引用
  - Spec: `rule-lab-skill-retirement` / `guide-skill-rule-gen-reference`
  - 实现：从 skill 表格中删除 `Create Unity analyze_rules interactively` 行
  - 验证：`grep "rule-gen\|analyze_rules" .agents/skills/gitnexus/gitnexus-guide/SKILL.md` 无匹配

- [x] **T3.5** 更新 `AGENTS.md` 移除 rule-lab skill 和 tool 引用
  - Spec: `rule-lab-skill-retirement` / `agents-md-skill-references`
  - 实现：从 Skill 安装表和 `available_skills` 列表中移除 `gitnexus-unity-rule-gen` 和 `gitnexus-unity-e2e-verify` 条目；移除任何 `rule_lab_*` MCP 工具引用
  - 验证：`grep "rule-gen\|rule-lab\|rule_lab\|unity-e2e-verify" AGENTS.md` 无匹配

## Phase 4: clean.ts 行为修正

- [x] **T4.1** 修改 `gitnexus/src/cli/clean.ts` 为选择性删除
  - Spec: `clean-preserve-meta` / `clean-selective-deletion`
  - 实现：将 `fs.rm(storagePath, { recursive: true })` 改为枚举 `.gitnexus/` 目录内容，删除除 `meta.json`、`config.json`、`.gitnexusignore` 之外的所有条目。`--all` 模式同样应用此逻辑
  - 验证：对测试仓库执行 `gitnexus clean --force`，确认 `meta.json` 保留且索引数据被删除

- [x] **T4.2** 验证 clean + analyze 回归流程
  - Spec: `clean-preserve-meta` / `rebuild-after-clean`
  - 实现：在当前仓库执行 `gitnexus clean --force` → `gitnexus analyze --force`，确认 analyze 复用 `meta.json` 中的 `analyzeOptions`
  - 验证：analyze 输出显示复用了 `includeExtensions` 等存储选项
