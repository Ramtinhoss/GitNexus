# GitNexus Distribution Guide

This document is the maintainer release and distribution handbook for this repository.

Current baseline should be derived dynamically (do not trust static text):

```bash
node -p "require('./gitnexus/package.json').version"
git tag --sort=-creatordate | sed -n '1,10p'
git show --no-patch --decorate --oneline HEAD
```

## Scope

Use this guide when you need to:

- bump the GitNexus package version
- prepare an RC or final release
- write GitHub release notes
- publish agent-facing installation guidance
- verify release assets before pushing or tagging

## Release Trigger and Modes

When user intent is explicit (for example: "发布 1.4.9", "release v1.4.9"), treat it as a release workflow trigger.

Default mode is `full-release` unless user explicitly requests otherwise.

| Mode | What to do |
|------|------------|
| `full-release` (default) | version/changelog update -> verification -> commit -> tag -> push branch+tag -> release page |
| `prepare-only` | version/changelog update -> verification -> commit -> tag (no push, no release page) |
| `publish-only` | no version edits; publish/release-page actions only for an existing pushed tag |

If the user does not specify mode, run `full-release` end-to-end.

This repository's distributable package lives under [`gitnexus/`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus).
The canonical release files are:

- [`gitnexus/package.json`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/package.json)
- [`gitnexus/package-lock.json`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/package-lock.json)
- [`gitnexus/CHANGELOG.md`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/CHANGELOG.md)

## Versioning Rules

For RC releases, use npm-compatible prerelease versions:

- `1.4.8-rc`
- `1.4.8-rc.2`
- `1.4.8-rc.3`

Do not use ad hoc variants like `rc-2` in the package version field.
If the user says "rc-2", normalize it to `rc.2` before editing files.

Update these files together in one commit:

1. [`gitnexus/package.json`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/package.json)
2. [`gitnexus/package-lock.json`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/package-lock.json)
3. [`gitnexus/CHANGELOG.md`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/CHANGELOG.md)

Tag format:

- package `1.4.8-rc.2` -> git tag `v1.4.8-rc.2`
- package `1.4.8` -> git tag `v1.4.8`

Changelog compare baseline rules:

- Stable release `X.Y.Z`: compare from previous stable tag to new stable tag.
  - Example: `v1.4.8...v1.4.9`
- RC release `X.Y.Z-rc.N`: compare from previous RC (or current stable if first RC) to new RC.
  - Example: `v1.4.9-rc...v1.4.9-rc.2`

## Workflow Standard

After `gitnexus setup`, workflow-facing docs and hooks must treat `~/.gitnexus/config.json` as the single npx package-spec source.

Allowed:

- local binary first: `gitnexus ...`
- npx fallback resolved from `~/.gitnexus/config.json`
- `@latest` only when it is the value persisted into config by setup

Not allowed in workflow-facing files:

- hard-coded `npx -y @veewo/gitnexus@latest ...`
- mixed examples with stale RC strings
- separate hook-local defaults that bypass config resolution

Workflow-facing files include:

- root docs used by agents: `AGENTS.md`, `CLAUDE.md`, `INSTALL-GUIDE.md`
- bundled skills under [`gitnexus/skills/`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/skills)
- installed/project skill copies under [`.agents/skills/gitnexus/`](/Users/nantasmac/projects/agentic/GitNexus/.agents/skills/gitnexus)
- hook scripts under [`gitnexus/hooks/`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/hooks), [`gitnexus-claude-plugin/hooks/`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus-claude-plugin/hooks), and [`gitnexus-cursor-integration/hooks/`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus-cursor-integration/hooks)

## Release Checklist

1. Ensure you are on a release branch, not `main`.
2. Merge `origin/main` into the working branch before release verification.
3. Confirm the intended version string.
4. Update version files and changelog together.
5. Regenerate build artifacts with `cd gitnexus && npm run build`.
6. Run targeted release verification commands.
7. Commit release changes.
8. Create the matching annotated tag.
9. Push branch and tag.
10. Create or update the GitHub release page with `gh` using the release-page standard below (manual step, not CI-owned).

Execution policy by mode:

- `full-release`: execute all 10 steps.
- `prepare-only`: execute through step 8 only.
- `publish-only`: execute steps 9-10 only (requires an already prepared version/tag).

## Verification Commands

Run these from the repository root unless noted:

```bash
cd gitnexus && npm run build
cd gitnexus && npx vitest run test/unit/workflow-version-guidance.test.ts test/unit/scoped-cli-commands.test.ts test/integration/hooks-e2e.test.ts
cd gitnexus && node --test dist/cli/setup.test.js
```

Recommended extra checks for a release candidate:

```bash
git status --short
git show --no-patch --decorate --oneline HEAD
git tag --sort=-creatordate | sed -n '1,10p'
rg -n "@veewo/gitnexus@latest|\$\{GITNEXUS_CLI_SPEC:-@veewo/gitnexus@latest\}|1\.4\.7-rc" AGENTS.md CLAUDE.md INSTALL-GUIDE.md README.md .agents/skills gitnexus/skills gitnexus/README.md gitnexus-claude-plugin/skills gitnexus-cursor-integration/skills gitnexus/hooks gitnexus-claude-plugin/hooks gitnexus-cursor-integration/hooks benchmarks/fixtures/unity-mini gitnexus/src/core/unity/__fixtures__/mini-unity -S
```

Expected result for the `rg` check above:

- no matches in workflow-facing files

## Changelog Standard

Every release entry in [`gitnexus/CHANGELOG.md`](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/CHANGELOG.md) must:

- start with `## [<version>] - YYYY-MM-DD`
- use only these sections when needed:
  - `### Added`
  - `### Changed`
  - `### Fixed`
  - `### Removed`
- describe user-visible or maintainer-relevant release changes
- avoid noisy per-file inventories
- group related bullets under one stable behavior change

Good changelog bullets:

- "Updated workflow-facing command guidance to resolve npx fallback from `~/.gitnexus/config.json` after setup."
- "Added regression coverage for workflow version guidance and hook config resolution."

Avoid:

- "Edited 14 files"
- "Updated docs"
- implementation trivia without release impact

## Commit and Tag Pattern

Recommended release commit format:

```bash
git commit -m "release(rc): prepare 1.4.8-rc.2 config-driven workflows"
git tag -a v1.4.8-rc.2 -m "v1.4.8-rc.2"
```

Push example:

```bash
git push origin <branch>
git push origin v1.4.8-rc.2
```

## GitHub Release Page Template

## GitHub Release Page Standard

Every GitHub release page for this repository must follow these rules:

1. Write **bilingual release notes**, with **Chinese first** and **English second**.
2. Write from a **user-facing perspective**:
   - describe feature changes, installation/setup improvements, retrieval improvements, compatibility changes, and bug fixes
   - avoid internal roadmap or implementation-progress terms such as phase numbers, benchmark gate jargon, or refactor-only summaries
3. If this release includes merged upstream work, summarize it as:
   - "Synced upstream `<version>` changes"
   - include a direct link to the upstream release page
   - avoid dumping internal cherry-pick or merge history into the notes
4. Include the **agent-facing one-line install prompt** instead of ad hoc install instructions when the release needs an agent workflow prompt.
5. Always use `gh release create` or `gh release edit` for the release page in this repository.

## CI vs Manual Release Page Ownership

Current policy: manual `gh` ownership.

1. Release page is always authored/updated via `gh`.
2. CI publish workflow must not create or mutate GitHub release pages.
3. If a release page already exists (for example created earlier), use `gh release edit` to reconcile it to this standard.

Validation command before deciding ownership:

```bash
gh release view <tag> --json name,tagName,url,body
```

Recommended release-page structure:

- `## 中文更新说明`
- version / tag / package / compare range
- `### 主要更新`
- `### 修复`
- `### 上游同步` when applicable
- `### Agent 安装提示`
- `## English Release Notes`
- version / tag / package / compare range
- `### Highlights`
- `### Fixes`
- `### Upstream Sync` when applicable
- `### Agent Install Prompt`

Title:

```text
v<version>
```

Release body template:

```md
## 中文更新说明

- 版本：`1.4.8`
- 标签：`v1.4.8`
- 包名：`@veewo/gitnexus@1.4.8`
- 对比范围：[`v1.3.11...v1.4.8`](https://github.com/nantas/GitNexus/compare/v1.3.11...v1.4.8)

### 主要更新

- 用面向用户的语言概括本次版本的功能变化。
- 只描述用户能感知到的改进，例如安装流程、检索质量、多语言支持、稳定性提升。

### 修复

- 用面向用户的语言概括本次版本的 bug 修复与兼容性修复。

### 上游同步

- 已同步上游 `v1.4.7` 的变更，详见上游 release 页面：<https://github.com/abhigyanpatwari/GitNexus/releases/tag/v1.4.7>

### Agent 安装提示

```text
阅读 https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；若本次发布固定版本为 @veewo/gitnexus@1.4.8，请先确认 agent 类型，再检查 .gitnexus/sync-manifest.txt 是否已有 scope——若已有则优先复用，若不存在则必须先向用户确认"全量索引还是指定 scope"再执行，并确保所有 npx 回退都统一读取 ~/.gitnexus/config.json。
```

## English Release Notes

- Version: `1.4.8`
- Tag: `v1.4.8`
- Package: `@veewo/gitnexus@1.4.8`
- Compare: [`v1.3.11...v1.4.8`](https://github.com/nantas/GitNexus/compare/v1.3.11...v1.4.8)

### Highlights

- Summarize the user-visible feature changes in plain language.
- Focus on install/setup improvements, retrieval improvements, language support, and stability.

### Fixes

- Summarize the user-visible bug fixes in plain language.

### Upstream Sync

- This release also includes the upstream `v1.4.7` changes. See the upstream release page: <https://github.com/abhigyanpatwari/GitNexus/releases/tag/v1.4.7>

### Agent Install Prompt

```text
Read https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md, then complete GitNexus installation, setup, index build, and retrieval acceptance in the current repository; if this release is pinned to @veewo/gitnexus@1.4.8, confirm the agent type first, then check whether .gitnexus/sync-manifest.txt already stores scope (reuse it when present; if absent, ask the user whether to do full or scoped indexing before proceeding), and ensure all npx fallbacks resolve through ~/.gitnexus/config.json.
```
```

## Agent-Facing One-Line Prompt

Generic template:

```text
阅读 https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；若本次发布固定版本为 @veewo/gitnexus@<VERSION>，请先确认 agent 类型，再检查 .gitnexus/sync-manifest.txt 是否已有 scope——若已有则优先复用，若不存在则必须先向用户确认"全量索引还是指定 scope"再执行，并确保所有 npx 回退都统一读取 ~/.gitnexus/config.json。
```

## Definition of Done (DoD)

A release task is complete only when all items below are true:

1. Package version/tag/changelog entry are consistent.
2. Required verification commands completed successfully (or failures explicitly accepted by user).
3. Commit and annotated tag exist locally.
4. For `full-release`/`publish-only`: branch and tag are pushed.
5. Release page exists and matches repository release-page standard.
6. Final report includes:
   - version
   - release commit SHA
   - tag
   - workflow run URL/status (if CI path used)
   - release page URL
