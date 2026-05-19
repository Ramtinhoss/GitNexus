<!-- gitnexus:start -->
# GitNexus MCP

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**
4. **Follow config/state file rules:** `docs/gitnexus-config-files.md`
5. **If user asks to release/publish a specific version and this repo has `DISTRIBUTION.md`, execute that workflow in full-release mode by default** (unless user explicitly asks `prepare-only` or `publish-only`).

> If step 1 warns the index is stale, ask user whether to rebuild index via `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` (`cliPackageSpec` first, then `cliVersion`) and run `npx -y <resolved-spec> analyze` (it reuses previous analyze scope/options by default; add `--no-reuse-options` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.
> `query/context` slim guidance is narrowing-first: inspect `decision.recommended_follow_up`, `missing_proof_targets`, and `suggested_context_targets` before upgrading to `response_profile=full`.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Unity Runtime Process 真理源

- 统一设计与实现对照文档：`docs/unity-runtime-process-source-of-truth.md`
- 涉及 Unity runtime process 的任务，先阅读该文档，再执行检索/实现/验收。
- 若历史设计文档与当前实现不一致，以该真理源文档和对应代码为准，并在变更后同步更新。
- 运行时链路结论采用两层语义：`verifier-core`（二元）与 `policy-adjusted`（对外结果）。
- 当 `hydration_policy=strict` 且 `hydrationMeta.fallbackToCompact=true` 时，`policy-adjusted` 可降级为 `verified_partial/verified_segment`；此时必须 parity rerun 后再做 closure 结论。

## CLI Setup 安装内容索引

`gitnexus setup` 命令会将以下内容安装到用户仓库。**每次功能或代码变更提交后，必须检查这些文件是否需要同步更新。**

### Skills（安装到 `.agents/skills/gitnexus/`）

| 源文件 | 安装路径 | 用途 |
|--------|---------|------|
| `gitnexus/skills/gitnexus-exploring.md` | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` | 架构探索 / "How does X work?" |
| `gitnexus/skills/gitnexus-impact-analysis.md` | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | 影响分析 / "What breaks if I change X?" |
| `gitnexus/skills/gitnexus-debugging.md` | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` | Bug 追踪 / "Why is X failing?" |
| `gitnexus/skills/gitnexus-refactoring.md` | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` | 重构 / rename / extract / split |
| `gitnexus/skills/gitnexus-guide.md` | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` | 工具、资源、schema 参考 |
| `gitnexus/skills/gitnexus-cli.md` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` | CLI 命令：index / status / clean / wiki |
| `gitnexus/skills/gitnexus-pr-review.md` | `.agents/skills/gitnexus/gitnexus-pr-review/SKILL.md` | PR 审查工作流 |

### Shared Contracts（安装到 `.agents/skills/gitnexus/_shared/`）

| 源文件 | 安装路径 |
|--------|---------|
| `gitnexus/skills/_shared/unity-runtime-process-contract.md` | `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` |
| `gitnexus/skills/_shared/unity-ui-trace-contract.md` | `.agents/skills/gitnexus/_shared/unity-ui-trace-contract.md` |
| `gitnexus/skills/_shared/unity-hydration-contract.md` | `.agents/skills/gitnexus/_shared/unity-hydration-contract.md` |
| `gitnexus/skills/_shared/unity-rule-authoring-contract.md` | `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` |

### Hooks（安装到用户全局 Claude 配置）

| 内容 | 安装路径 |
|------|---------|
| GitNexus Claude Code hook | `~/.claude/hooks/gitnexus/gitnexus-hook.cjs` |

### MCP Config

`gitnexus setup` 会向以下编辑器配置文件注入 MCP server 条目（视用户环境而定）：
- `.mcp.json`（项目级）
- `~/.cursor/mcp.json`（Cursor 全局）
- `~/.config/claude/claude_desktop_config.json`（Claude Desktop）

### 维护规则

> **每次提交涉及以下内容时，必须检查并同步更新上表中对应的源文件：**
> - MCP 工具接口变更（新增/修改/删除工具参数或行为）
> > - CLI 命令变更（新增子命令、修改参数）
> - Unity runtime process 架构变更（新增 edge type、新增 process 阶段）
> - Shared contract 接口变更
> - `query/context` 默认返回契约或 `response_profile` 升级路径变更
> >
> 检查方式：阅读对应源文件，确认 skill 中的示例、字段说明、工作流步骤与当前实现一致。


---

## 已知解析陷阱

| 问题 | 参考文档 |
|------|---------|
| tree-sitter Unicode 标识符导致 Class 节点缺失、`HAS_METHOD` 边丢失；大文件 `Invalid argument` 崩溃；调用层常见错误 | [`docs/tree-sitter-parsing-pitfalls.md`](docs/tree-sitter-parsing-pitfalls.md) |

> C# 含条件编译分支（`#if/#elif/#else/#endif`）时，执行 analyze 建议显式传入 `--csharp-define-csproj <path>`（Unity 项目优先 `Assembly-CSharp.csproj`；neonspark 使用 `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`），以便按 `DefineConstants` 做预处理归一化后再解析。
