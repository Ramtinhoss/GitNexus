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
    "embeddings": true
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

## Repo-local optional inputs

| File | Purpose |
|------|---------|
| `.gitnexusignore` | Extra ignore rules on top of `.gitignore` |
| `.gitnexus/sync-manifest.txt` | Recommended location for scoped analyze manifest (`--scope-manifest`) |

`sync-manifest.txt` is user-provided input, not system-owned state.

## Global (`~/.gitnexus/`)

| File | Purpose |
|------|---------|
| `config.json` | Global CLI settings: setup scope, pinned CLI package spec/version, wiki API config |
| `registry.json` | Global list of indexed repositories for multi-repo MCP/CLI resolution |

## Precedence rules

1. CLI explicit flags (for example `--repo`, `--repo-alias`, `--scope-manifest`) have highest priority.
2. For direct tool commands, when `--repo` is missing:
   1. use `<repo>/.gitnexus/meta.json.repoId`
   2. fallback to `~/.gitnexus/registry.json` path match
3. For npx package spec resolution:
   1. explicit setup flags / env
   2. `~/.gitnexus/config.json` (`cliPackageSpec`, then `cliVersion`)
   3. package default dist-tag

## Ownership rules

- `analyze` owns `.gitnexus/meta.json`, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.
- `clean` removes repo-local index artifacts and unregisters from global registry.
