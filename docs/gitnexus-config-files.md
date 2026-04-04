# GitNexus Configuration Files

This document defines the current configuration and state file rules used by GitNexus.

## Repo-local (`<repo>/.gitnexus/`)

| File | Owner | Purpose | Write Path | Read Path |
|------|-------|---------|------------|-----------|
| `lbug` | `analyze` / MCP runtime | LadybugDB graph index data | `gitnexus analyze` rebuilds it | Query tools and MCP backend |
| `meta.json` | `analyze` | Index metadata and defaults | Saved at end of `analyze` | `status`, hooks, CLI default repo resolution |
| `unity-parity-seed.json` | `analyze` | Unity parity seed cache payload | Saved during `analyze` finalize | Unity lazy/parity loaders |
| `rules/catalog.json` | `rule-lab-promote` | Project rule catalog, activation order, rule versions | Written when promoting approved rules | Runtime verifier rule loader |
| `rules/approved/*.yaml` | `rule-lab-curate` / `rule-lab-promote` | Approved project runtime verification rules | Written during curation/promotion | Runtime verifier rule loader |
| `rules/lab/runs/**` | `rule-lab-discover` / `rule-lab-analyze` / `rule-lab-review-pack` / `rule-lab-curate` | Rule Lab intermediate artifacts (`manifest.json`, `slice-plan.json`, `slices/*/slice.json`, `candidates.jsonl`, `review-cards.md`, `curated.json`, `dsl-draft.json`) | Written by Rule Lab execution | Rule Lab follow-up commands and promote compiler input |
| `rules/reports/*.md` | `rule-lab-regress` | Rule quality and regression reports | Written by regression pass | Human review and CI reports |

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
| `.gitnexus/sync-manifest.txt` | Recommended location for scoped analyze manifest (`--scope-manifest`). Each line is a **path prefix** (not glob); trailing `*` is a wildcard prefix. Use `--extensions` for file type filtering. |
| `.gitnexus/rules/overrides.yaml` | Optional project-specific alias/disable/threshold overrides for approved rules |

`sync-manifest.txt` and `rules/overrides.yaml` are user-provided inputs, not system-owned state.

### Runtime Claim Bootstrap (current)

- `rules/catalog.json` ships with an active bootstrap rule entry:
  - `id`: `unity.gungraph.reload.output-getvalue.v1`
  - `version`: `1.0.0`
  - `file`: `approved/unity.gungraph.reload.output-getvalue.v1.yaml`
- The approved YAML now follows DSL v2 sections (`match/topology/closure/claims`) and preserves runtime-claim compatibility fields (`trigger_family`, `required_hops`, guarantees/non-guarantees, `next_action`).

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
3. Runtime verifier rule loading precedence:
   1. `<repo>/.gitnexus/rules/approved/*.yaml` + `rules/catalog.json`
   2. optional `<repo>/.gitnexus/rules/overrides.yaml`
   3. if no project rule matched: return explicit `rule_not_matched` (no implicit builtin fallback)
4. For npx package spec resolution:
   1. explicit setup flags / env
   2. `~/.gitnexus/config.json` (`cliPackageSpec`, then `cliVersion`)
   3. package default dist-tag

## Ownership rules

- `analyze` owns `.gitnexus/meta.json`, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.
- `rule-lab-*` commands own `.gitnexus/rules/**` write paths listed above.
- Default `clean` removes repo-local index artifacts and unregisters from global registry.
- Default `clean` does **not** remove `.gitnexus/rules/**`.
- `clean --include-rules-lab` may remove `.gitnexus/rules/lab/runs/**` and `.gitnexus/rules/reports/*.md` only.
- `clean --include-rules-all` may remove all `.gitnexus/rules/**` artifacts (explicit opt-in only).
