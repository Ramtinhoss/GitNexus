# GitNexus Configuration Files

This document defines the current configuration and state file rules used by GitNexus.

## Repo-local (`<repo>/.gitnexus/`)

| File | Owner | Purpose | Write Path | Read Path |
|------|-------|---------|------------|-----------|
| `lbug` | `analyze` / MCP runtime | LadybugDB graph index data | `gitnexus analyze` rebuilds it | Query tools and MCP backend |
| `meta.json` | `analyze` | Index metadata and defaults | Saved at end of `analyze` | `status`, hooks, CLI default repo resolution |
| `unity-parity-seed.json` | `analyze` | Unity parity seed cache payload | Saved during `analyze` finalize | Unity lazy/parity loaders |

### `meta.json` schema (current)

```json
{
  "repoPath": "/abs/path/to/repo",
  "repoId": "resolved-repo-name-or-alias",
  "lastCommit": "git-head-sha",
  "indexedAt": "ISO-8601 timestamp",
  "analyzeOptions": {
    "includeExtensions": [".ts", ".cs"],
    "scopeRules": ["Assets/**"],
    "repoAlias": "optional-alias",
    "embeddings": true,
    "csharpDefineCsproj": "optional-path-to.csproj",
    "aiContext": true
  },
  "stats": {
    "files": 0,
    "nodes": 0,
    "edges": 0,
    "communities": 0,
    "processes": 0,
    "embeddings": 0
  }
}
```

Notes:
- `repoId` is persisted after registration and is used as the CLI default `repo` when `--repo` is omitted.
- For backward compatibility, when `repoId` is missing, CLI falls back to matching the current path in global registry.
- `analyzeOptions.aiContext=false` means `analyze` should skip AGENTS/CLAUDE generation and repo-local GitNexus skill installation until a later run explicitly re-enables AI context or bypasses stored options.

## Repo-local optional inputs

| File | Purpose |
|------|---------|
| `.gitnexusignore` | Extra ignore rules on top of `.gitignore` |


### Runtime Claim Contract (current)

- Query-time `runtime_chain_verify=on-demand` uses graph-only closure from structured anchors.
- Query-time runtime claim closure does **not** load any rule artifacts for matching; closure is purely graph-based.

## Global (`~/.gitnexus/`)

| File | Purpose |
|------|---------|
| `config.json` | Global CLI settings: setup scope, pinned CLI package spec/version, wiki API config |
| `registry.json` | Global list of indexed repositories for multi-repo MCP/CLI resolution |

## Precedence rules

1. For analyze option resolution (`extensions`, `repoAlias`, `embeddings`, `scope rules`, `aiContext`):
   1. CLI explicit flags
   2. `<repo>/.gitnexus/meta.json.analyzeOptions` when `reuseOptions !== false`
   3. built-in defaults
2. For direct tool commands, when `--repo` is missing:
   1. use `<repo>/.gitnexus/meta.json.repoId`
   2. fallback to `~/.gitnexus/registry.json` path match
3. Query-time runtime claim closure input precedence:
   1. explicit structured anchors on request (`symbolName`, `resourceSeedPath`, `mappedSeedTargets`, `resourceBindings`)
   2. derived seed path (`resource_path_prefix`, then `filePath`, then resource path extraction from `queryText`)
   3. if structured anchors are insufficient: return explicit `rule_not_matched` (no query-time rule-match fallback)
4. For npx package spec resolution:
   1. explicit setup flags / env
   2. `~/.gitnexus/config.json` (`cliPackageSpec`, then `cliVersion`)
   3. package default dist-tag

### Unity runtime process persistence note

- `Process` lifecycle metadata persistence has no external config/env switch.
- Behavior is pipeline-derived: persistence is enabled when Unity resource-binding flow is active (Unity auto-detected via `Assets/*.cs`).

## Ownership rules

- `analyze` owns `.gitnexus/meta.json`, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.

- `gitnexus-unity-rule-gen` now points to direct public flow guidance: `approved -> compile -> analyze -> CLI validation`.

## Legacy compatibility note

- Default `clean` removes repo-local index artifacts while preserving `.gitnexus/meta.json` and `.gitnexus/config.json`.
- Historical `.gitnexus/gap-lab/` and `.gitnexus/rules/` artifacts may exist in older repos; these are no longer part of the active workflow and can be safely deleted manually.
