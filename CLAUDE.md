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
> Query-time runtime closure is graph-only and does not require `verification_rules` / `trigger_tokens`; if you need hydration diagnostics such as `needsParityRetry` or strict fallback state, rerun with `response_profile=full` and then use parity before closure claims.

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
