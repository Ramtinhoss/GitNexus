<!-- gitnexus:start -->
# GitNexus MCP

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**
4. **Follow config/state file rules:** `docs/gitnexus-config-files.md`
5. **If user asks to release/publish a specific version and this repo has `DISTRIBUTION.md`, execute that workflow in full-release mode by default** (unless user explicitly asks `prepare-only` or `publish-only`).

> If step 1 warns the index is stale, ask user whether to rebuild index via `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` (`cliPackageSpec` first, then `cliVersion`) and run `npx -y @veewo/gitnexus@1.5.0-rc.4 analyze` with that exact package spec (it reuses previous analyze scope/options by default; add `--no-reuse-options` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Create Unity analyze_rules interactively | `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` |

<!-- gitnexus:end -->

## Unity Runtime Process 真理源

- 统一设计与实现对照文档：`docs/unity-runtime-process-source-of-truth.md`
- 涉及 Unity runtime process 的任务，先阅读该文档，再执行检索/实现/验收。
- 若历史设计文档与当前实现不一致，以该真理源文档和对应代码为准，并在变更后同步更新。

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
| `gitnexus/skills/gitnexus-unity-rule-gen.md` | `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` | Unity analyze_rules 交互式生成 |

### Shared Contracts（安装到 `.agents/skills/gitnexus/_shared/`）

| 源文件 | 安装路径 |
|--------|---------|
| `gitnexus/skills/_shared/unity-runtime-process-contract.md` | `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` |
| `gitnexus/skills/_shared/unity-ui-trace-contract.md` | `.agents/skills/gitnexus/_shared/unity-ui-trace-contract.md` |
| `gitnexus/skills/_shared/unity-hydration-contract.md` | `.agents/skills/gitnexus/_shared/unity-hydration-contract.md` |

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
> - `analyze_rules` 规则格式变更（新增 binding kind、新增字段、修改 YAML schema）
> - CLI 命令变更（新增子命令、修改参数）
> - Unity runtime process 架构变更（新增 edge type、新增 process 阶段）
> - Shared contract 接口变更
>
> 检查方式：阅读对应源文件，确认 skill 中的示例、字段说明、工作流步骤与当前实现一致。

### 新增 binding kind 或 resource_bindings 字段时的强制要求

> **每次新增 `UnityResourceBinding` binding kind 或为现有 kind 新增字段时，必须在同一 commit 内完成以下三件事，缺一不可：**
>
> 1. **类型定义**：在 `gitnexus/src/rule-lab/types.ts` 的 `UnityResourceBinding` 接口中添加新字段。
> 2. **解析器**：在 `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts` 的 `parseRuleYaml()` binding 解析循环中，用 `scalar()` 或 `list()` 提取对应字段。
> 3. **单元测试**：在 `gitnexus/test/unit/runtime-claim-rule-registry.test.ts` 中添加 `describe('parseRuleYaml – <kind>')` 测试块，断言新字段被正确解析，以及缺失时返回 `undefined`。
>
> **背景**：`method_triggers_method` 在 1.5.0-rc.3 中新增了类型定义和处理函数，但 `parseRuleYaml()` 未同步添加字段提取，导致所有 `method_triggers_method` 规则在 analyze 阶段产出 0 条合成边，且没有任何测试覆盖这条路径，问题直到在真实仓库验证时才被发现。
