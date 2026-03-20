# Changelog

All notable changes to GitNexus will be documented in this file.

## [1.4.8-rc.2] - 2026-03-20

### Changed
- Standardized workflow-facing command guidance to treat `~/.gitnexus/config.json` as the single npx package-spec source after `setup`.
- Updated INSTALL-GUIDE, AGENTS/CLAUDE generation, bundled skills, installed skill copies, README snippets, and fixture guidance to remove misleading hard-coded `@latest` fallback examples.
- Updated Claude/Cursor hook runtime fallback resolution to load package specs from config instead of maintaining a separate hard-coded `@latest` default.

### Fixed
- Fixed false-negative workflow consistency checks caused by mixed version hints between setup-persisted config, repo docs, skill templates, and hook scripts.
- Added regression coverage for workflow-facing version guidance and hook config resolution so future workflow text drift is caught in tests.

## [1.4.8-rc] - 2026-03-19

### Added
- Unified CLI package-spec resolver used across setup/resource/AGENTS generation/hook flows.
  - Resolution priority: explicit setup args (`--cli-spec`/`--cli-version`) > env (`GITNEXUS_CLI_SPEC`/`GITNEXUS_CLI_VERSION`) > persisted config (`~/.gitnexus/config.json`) > `@latest`.
- `gitnexus setup` now supports:
  - `--cli-version <version>`
  - `--cli-spec <packageSpec>`
  and persists the resolved package spec into CLI config for later sessions.

### Changed
- Standardized stale-index remediation guidance to use local CLI first (`gitnexus analyze`) with npx fallback resolved from one package spec source.
- Updated setup/manual docs and skill templates to avoid hard-coded mixed-version invocation paths.
- Updated MCP JSON templates used in this repository to local binary form (`gitnexus mcp`) to eliminate static `@latest` drift in checked-in configs.

### Fixed
- Fixed false “Already up to date” path when metadata exists but LadybugDB file is missing.
  - `analyze` now rebuilds when `.gitnexus/meta.json` exists but `.gitnexus/lbug` is absent.
  - `status` now warns explicitly when metadata exists but LadybugDB file is missing.
  - registry validation now requires both `meta.json` and `lbug`.

## [1.4.7-rc] - 2026-03-19

### Changed
- Updated agent installation and indexing guidance to use local `gitnexus` CLI first, with fallback to `npx -y @veewo/gitnexus@latest` only when local CLI is unavailable.
- Synchronized stale-index recovery instructions across AGENTS/CLAUDE entry docs and GitNexus skill workflows to follow the same local-first command resolution strategy.
- Updated INSTALL-GUIDE command examples to use a session-level runner variable (`$GN`) for consistent `setup/analyze/status/query/context/impact/cypher/clean/list` invocation behavior.

## [1.4.6-rc] - 2026-03-19

> Cumulative release notes for `nantas-dev`, comparing `v1.3.11` -> `v1.4.6-rc`.

### Added
- Unity retrieval architecture upgrades:
  - summary-first persistence model (`UNITY_RESOURCE_SUMMARY`) with query-time lazy expansion.
  - compact/parity hydration contract (`hydrationMeta`, `needsParityRetry`) with parity warmup path.
  - lazy overlay + parity cache layers for repeat query acceleration.
- Unity serializable-class resource binding coverage (U3), including AssetRef-oriented context enrichment.
- Benchmark/eval tooling expansion:
  - Unity benchmark orchestration and gate reports.
  - Agent-context benchmark pipeline and dataset tooling.
- Analyze-scope and repo-alias workflow support for real-repo benchmark runs.
- Setup workflow improvements for Codex/OpenCode MCP configuration and idempotent setup behavior.
- Type resolution expansion through Phases 4-7 and broader language coverage.
- Scoped CLI regression guard tests to prevent unscoped `npx gitnexus ...` command guidance from reappearing (`scoped-cli-commands.test.ts`).

### Changed
- Storage/backend runtime migrated from KuzuDB to LadybugDB v0.15.
- Analyze/runtime memory profile reduced via streaming and bounded intermediate structures.
- Unity hydration strategy shifted from analyze-time full materialization to on-demand query-time hydration.
- CI/release workflow hardening and scoped package distribution under `@veewo/gitnexus`.
- Standardized all actionable CLI/MCP command guidance and workflow scripts to scoped package form:
  - `npx -y @veewo/gitnexus@latest <subcommand>`
  - covered generators (`ai-context`, MCP resources), setup defaults, hooks, skills, docs, eval harnesses, and fixtures.

### Fixed
- Unity parity seed hot-path now uses singleflight + idle-bounded in-memory cache, reducing duplicate seed reads under concurrency.
- Impact tool stability and relation coverage (`HAS_METHOD`, `OVERRIDES`) improvements.
- CLI output and setup reliability fixes (stdout routing, duplicate MCP table guards, hook/postinstall robustness).
- Test/runtime stability fixes, including Vitest worker `EPIPE` noise suppression.
- Removed ambiguous unscoped package invocation paths (`gitnexus@latest` / `npx gitnexus ...`) that could resolve to the wrong npm package in mixed environments.

## [1.4.6] - 2026-03-18

### Added
- **Phase 7 type resolution** — return-aware loop inference for call-expression iterables (#341)
  - `ReturnTypeLookup` interface with `lookupReturnType` / `lookupRawReturnType` split
  - `ForLoopExtractorContext` context object replacing positional `(node, env)` signature
  - Call-expression iterable resolution across 8 languages (TS/JS, Java, Kotlin, C#, Go, Rust, Python, PHP)
  - PHP `$this->property` foreach via `@var` class property scan (Strategy C)
  - PHP `function_call_expression` and `member_call_expression` foreach paths
  - `extractElementTypeFromString` as canonical raw-string container unwrapper in `shared.ts`
  - `extractReturnTypeName` deduplicated from `call-processor.ts` into `shared.ts` (137 lines removed)
  - `SKIP_SUBTREE_TYPES` performance optimization with documented `template_string` exclusion
  - `pendingCallResults` infrastructure (dormant — Phase 9 work)

### Fixed
- **impact**: return structured error + partial results instead of crashing (#345)
- **impact**: add `HAS_METHOD` and `OVERRIDES` to `VALID_RELATION_TYPES` (#350)
- **cli**: write tool output to stdout via fd 1 instead of stderr (#346)
- **postinstall**: add permission fix for CLI and hook scripts (#348)
- **workflow**: use prefixed temporary branch name for fork PRs to prevent overwriting real branches
- **test**: add `--repo` to CLI e2e tool tests for multi-repo environment
- **php**: add `declaration_list` type guard on `findClassPropertyElementType` fallback
- **docs**: correct `pendingCallResults` description in roadmap and system docs

### Chore
- Add `.worktrees/` to `.gitignore`

## [1.4.5] - 2026-03-17

### Added
- **Ruby language support** for CLI and web (#111)
- **TypeEnvironment API** with constructor inference, self/this/super resolution (#274)
- **Return type inference** with doc-comment parsing (JSDoc, PHPDoc, YARD) and per-language type extractors (#284)
- **Phase 4 type resolution** — nullable unwrapping, for-loop typing, assignment chain propagation (#310)
- **Phase 5 type resolution** — chained calls, pattern matching, class-as-receiver (#315)
- **Phase 6 type resolution** — for-loop Tier 1c, pattern matching, container descriptors, 10-language coverage (#318)
  - Container descriptor table for generic type argument resolution (Map keys vs values)
  - Method-aware for-loop extractors with integration tests for all languages
  - Recursive pattern binding (C# `is` patterns, Kotlin `when/is` smart casts)
  - Class field declaration unwrapping for C#/Java
  - PHP `$this->property` foreach member access
  - C++ pointer dereference range-for
  - Java `this.data.values()` field access patterns
  - Position-indexed when/is bindings for branch-local narrowing
- **Type resolution system documentation** with architecture guide and roadmap
- `.gitignore` and `.gitnexusignore` support during file discovery (#231)
- Codex MCP configuration documentation in README (#236)
- `skipGraphPhases` pipeline option to skip MRO/community/process phases for faster test runs
- `hookTimeout: 120000` in vitest config for CI beforeAll hooks

### Changed
- **Migrated from KuzuDB to LadybugDB v0.15** (#275)
- Dynamically discover and install agent skills in CLI (#270)

### Performance
- Worker pool threshold — skip worker creation for small repos (<15 files or <512KB total)
- AST walk pruning via `SKIP_SUBTREE_TYPES` for leaf-only nodes (string, comment, number literals)
- Pre-computed `interestingNodeTypes` set — single Set.has() replaces 3 checks per AST node
- `fastStripNullable` — skip full nullable parsing for simple identifiers (90%+ case)
- Replace `.children?.find()` with manual for loops in `extractFunctionName` to eliminate array allocations

### Fixed
- Same-directory Python import resolution (#328)
- Ruby method-level call resolution, HAS_METHOD edges, and dispatch table (#278)
- C++ fixture file casing for case-sensitive CI
- Template string incorrectly included in AST pruning set (contains interpolated expressions)

## [1.4.0] - Previous release
