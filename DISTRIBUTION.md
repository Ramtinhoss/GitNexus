# GitNexus Distribution Guide

This document is the maintainer release and distribution handbook for this repository.

Current RC baseline on this branch:

- Package version: `1.4.8-rc.2`
- Git tag: `v1.4.8-rc.2`
- Release commit: `f62fafc`

## Scope

Use this guide when you need to:

- bump the GitNexus package version
- prepare an RC or final release
- write GitHub release notes
- publish agent-facing installation guidance
- verify release assets before pushing or tagging

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
10. Draft the GitHub release page using the template below.

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

Title:

```text
v1.4.8-rc.2
```

Release body template:

```md
## Summary

- Version: `1.4.8-rc.2`
- Tag: `v1.4.8-rc.2`
- Package: `@veewo/gitnexus@1.4.8-rc.2`

## Highlights

- Standardized workflow-facing command guidance to load npx fallback from `~/.gitnexus/config.json` after `setup`.
- Removed misleading hard-coded `@latest` fallback examples across docs, skills, fixtures, and hook scripts.
- Added regression coverage for workflow version guidance and hook config resolution.

## Agent Install Prompt

阅读 /path/to/repo/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；若本次发布固定版本为 @veewo/gitnexus@1.4.8-rc.2，请先确认 agent 类型与索引范围，再按文档执行，并确保所有 npx 回退都统一读取 ~/.gitnexus/config.json。

## Install

```bash
npm install -g @veewo/gitnexus@1.4.8-rc.2
gitnexus setup --cli-spec @veewo/gitnexus@1.4.8-rc.2
```

## Verification

- `cd gitnexus && npm run build`
- `cd gitnexus && npx vitest run test/unit/workflow-version-guidance.test.ts test/unit/scoped-cli-commands.test.ts test/integration/hooks-e2e.test.ts`
- `cd gitnexus && node --test dist/cli/setup.test.js`

## Changelog

See [`gitnexus/CHANGELOG.md`](./gitnexus/CHANGELOG.md).
```

## Agent-Facing One-Line Prompt

Generic template:

```text
阅读 /path/to/repo/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；若本次发布固定版本为 @veewo/gitnexus@<VERSION>，请先确认 agent 类型与索引范围，再按文档执行，并确保所有 npx 回退都统一读取 ~/.gitnexus/config.json。
```

Current RC example:

```text
阅读 /Users/nantasmac/projects/agentic/GitNexus/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；若本次发布固定版本为 @veewo/gitnexus@1.4.8-rc.2，请先确认 agent 类型与索引范围，再按文档执行，并确保所有 npx 回退都统一读取 ~/.gitnexus/config.json。
```

## Current Release Record

This branch currently contains:

- release commit: `f62fafc`
- release tag: `v1.4.8-rc.2`
- package version: `1.4.8-rc.2`

If these diverge, fix the branch before publishing.
