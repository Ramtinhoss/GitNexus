# GitNexus Configuration Files

This document defines the current configuration and state file rules used by GitNexus.

## Repo-local (`<repo>/.gitnexus/`)

| File | Owner | Purpose | Write Path | Read Path |
|------|-------|---------|------------|-----------|
| `lbug` | `analyze` / MCP runtime | LadybugDB graph index data | `gitnexus analyze` rebuilds it | Query tools and MCP backend |
| `meta.json` | `analyze` | Index metadata and defaults | Saved at end of `analyze` | `status`, hooks, CLI default repo resolution |
| `unity-parity-seed.json` | `analyze` | Unity parity seed cache payload | Saved during `analyze` finalize | Unity lazy/parity loaders |
| `rules/catalog.json` | `rule-lab-promote` | Project rule catalog, activation order, rule versions | Written when promoting approved rules | Rule Lab / compile tooling; analyze rule loading fallback |
| `rules/approved/*.yaml` | `rule-lab-curate` / `rule-lab-promote` | Approved project rule definitions (analyze/retrieval/verification families) | Written during curation/promotion | Rule compiler and analyze/offline governance fallback loaders |
| `rules/compiled/*.v2.json` | `rule-lab-compile` | Compiled rule bundles by family (`analyze_rules`, `retrieval_rules`, `verification_rules`) | Written by `gitnexus rule-lab compile` | Analyze pipeline (`analyze_rules`), retrieval next-hop hint resolver (`retrieval_rules`), offline governance/report workflows |
| `rules/lab/runs/**` | `rule-lab-discover` / `rule-lab-analyze` / `rule-lab-review-pack` / `rule-lab-curate` | Rule Lab intermediate artifacts (`manifest.json`, `slice-plan.json`, `slices/*/slice.json`, `candidates.jsonl`, `curation-input.json`, `review-cards.md`, `curated.json`, `dsl-drafts.json`, `dsl-draft.json`) where `slice.json.source_gap_handoff` carries the downstream reduction contract | Written by Rule Lab execution | Rule Lab follow-up commands and promote compiler input |
| `gap-lab/runs/**` | `gitnexus-unity-rule-gen` | Gap-lab slice-driven run artifacts (`manifest.json`, `slice-plan.json`, `progress.json`, `inventory.jsonl`, `decisions.jsonl`, `slices/<slice_id>.json`, `slices/<slice_id>.candidates.jsonl`) with C0 parity + C2.6 candidate-derived coverage gate state | Written by gap-lab skill loop execution | Session resume, slice checkpoints, exhaustive-candidate lifecycle tracking, candidate-derived coverage truth, and evidence continuity across loops |
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
| `.gitnexus/sync-manifest.txt` | Recommended location for unified analyze manifest (`--scope-manifest`): supports path-prefix scope lines and `@key=value` directives for analyze options. |
| `.gitnexus/rules/overrides.yaml` | Optional project-specific alias/disable/threshold overrides for approved rules |

`sync-manifest.txt` and `rules/overrides.yaml` are user-provided inputs, not system-owned state.

### `sync-manifest.txt` unified rules (current)

`sync-manifest.txt` is the user-intent config file for analyze scope and selected analyze options.

Supported format:

```txt
# scope rules
Assets/
Packages/

@extensions=.cs,.meta
@repoAlias=neonspark-core
@embeddings=false
```

Rules:
- Non-`@` lines are scope path-prefix rules (same semantics as before; trailing `*` supported).
- `@key=value` directives are case-insensitive for key and support:
  - `@extensions=<csv>` (equivalent to `--extensions`)
  - `@repoAlias=<name>` (equivalent to `--repo-alias`)
  - `@embeddings=<true|false>` (equivalent to `--embeddings`)
- Unknown directives must fail fast with explicit error (no silent ignore).
- If the same directive appears multiple times, the last one wins.
- When `.gitnexus/sync-manifest.txt` exists and analyze is called without `--scope-manifest` and without `--scope-prefix`, CLI auto-uses this default manifest path.
- When explicit CLI values (`--extensions`, `--repo-alias`, `--embeddings`) differ from manifest directives, CLI applies `--sync-manifest-policy` (`ask|update|keep|error`, default `ask`):
  - `ask`: TTY prompt asks whether to update manifest
  - `update`: rewrite directives deterministically
  - `keep`: keep manifest unchanged and continue
  - `error`: fail immediately with actionable drift summary
- In non-interactive mode, `ask` fails with an actionable error requiring explicit policy selection.

### Runtime Claim Contract (current)

- Query-time `runtime_chain_verify=on-demand` uses graph-only closure from structured anchors.
- Query-time runtime claim closure does **not** load `verification_rules`/`retrieval_rules` for rule matching.
- Rule artifacts under `.gitnexus/rules/**` remain authoritative for:
  - analyze-time synthetic edge injection (`analyze_rules`)
  - retrieval next-hop hint selection (`retrieval_rules`)
  - offline governance and reports (`verification_rules`)

## Global (`~/.gitnexus/`)

| File | Purpose |
|------|---------|
| `config.json` | Global CLI settings: setup scope, pinned CLI package spec/version, wiki API config |
| `registry.json` | Global list of indexed repositories for multi-repo MCP/CLI resolution |

## Precedence rules

1. For analyze option resolution (`extensions`, `repoAlias`, `embeddings`, `scope rules`):
   1. CLI explicit flags
   2. manifest directives from `--scope-manifest` (`@extensions`, `@repoAlias`, `@embeddings`, plus scope lines)
   3. `<repo>/.gitnexus/meta.json.analyzeOptions` when `reuseOptions !== false`
   4. built-in defaults
   5. default manifest auto-discovery path: `.gitnexus/sync-manifest.txt` is treated as `--scope-manifest` only when no scope option is explicitly provided
2. For direct tool commands, when `--repo` is missing:
   1. use `<repo>/.gitnexus/meta.json.repoId`
   2. fallback to `~/.gitnexus/registry.json` path match
3. Query-time runtime claim closure input precedence:
   1. explicit structured anchors on request (`symbolName`, `resourceSeedPath`, `mappedSeedTargets`, `resourceBindings`)
   2. derived seed path (`resource_path_prefix`, then `filePath`, then resource path extraction from `queryText`)
   3. if structured anchors are insufficient: return explicit `rule_not_matched` (no query-time rule-match fallback)
4. Retrieval next-hop hint rule loading precedence:
   1. `<repo>/.gitnexus/rules/compiled/retrieval_rules.v2.json`
   2. no match or no compiled bundle: no retrieval-rule hint
5. For npx package spec resolution:
   1. explicit setup flags / env
   2. `~/.gitnexus/config.json` (`cliPackageSpec`, then `cliVersion`)
   3. package default dist-tag

### Unity runtime process persistence note

- `Process` lifecycle metadata persistence has no external config/env switch.
- Behavior is pipeline-derived: persistence is enabled when Unity resource-binding flow is active (Unity auto-detected via `Assets/*.cs`).

## Why `meta.json` Is Not Merged With `sync-manifest.txt`

- `sync-manifest.txt` is user-authored intent config.
- `meta.json` is analyze runtime output snapshot (`repoId`, `stats`, `lastCommit`, `indexedAt`, and effective `analyzeOptions`).

They have different ownership and lifecycle. Merging them couples mutable user intent with runtime state and increases drift/conflict risk.

## Migration guidance

Recommended stable analyze setup:

```txt
Assets/
Packages/
@extensions=.cs,.meta
@repoAlias=neonspark-core
@embeddings=false
```

Recommended command in automation:

```bash
gitnexus analyze --scope-manifest .gitnexus/sync-manifest.txt
```

If you want to disable historical option reuse:

```bash
gitnexus analyze --scope-manifest .gitnexus/sync-manifest.txt --no-reuse-options
```

## Ownership rules

- `analyze` owns `.gitnexus/meta.json`, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.
- `rule-lab-*` commands own `.gitnexus/rules/**` write paths listed above.
- Rule-lab candidate layering is strict:
  - `gap-lab/slices/<slice>.candidates.jsonl` = exhaustive candidate truth.
  - `rules/lab/.../candidates.jsonl` = proposal candidates derived from accepted IDs + aggregation mode.
  - `rules/lab/.../slice.json.source_gap_handoff` is mandatory for downstream `universe -> accepted -> proposal` audits.
  - Proposal `binding_kind` must be handoff-derived (`default_binding_kinds` or accepted-candidate metadata), not hardcoded.
  - `aggregate_single_rule` proposal rows must preserve multi-anchor lineage (`source_gap_candidate_ids`) and merged resource bindings.
  - `curation-input.json` and `curated.json` must keep proposal-specific `confirmed_chain.steps`; copying mixed slice-wide chain is invalid.
  - Unresolved bindings must fail closed; `UnknownClass` / `UnknownMethod` placeholders are forbidden in `curation-input.json`, `curated.json`, and `approved/*.yaml`.
- `gitnexus-unity-rule-gen` owns `.gitnexus/gap-lab/runs/**` artifacts listed above.
- Gap-lab C1 persistence uses balanced-slim artifacts only (`slice.json`, `slice.candidates.jsonl`, `inventory.jsonl`, `decisions.jsonl`); standalone universe/scope/coverage files are not persisted.
- Gap-lab C2.6 uses candidate-derived coverage: `slice.candidates.jsonl` is the semantic source of truth, while `slice.json.coverage_gate` is a derived cache that must block on `candidate_audit_drift` if counts drift.
- Under default `full_user_code` scope, reason codes such as `out_of_focus_scope` and `deferred_non_clue_module` are invalid unless an explicit discovery-scope override is recorded.
- `promotion_backlog` remains an eligible candidate status and must not be serialized as a rejection outcome.
- Default `clean` removes repo-local index artifacts and unregisters from global registry.
- Default `clean` does **not** remove `.gitnexus/rules/**`.
- `clean --include-rules-lab` may remove `.gitnexus/rules/lab/runs/**` and `.gitnexus/rules/reports/*.md` only.
- `clean --include-rules-all` may remove all `.gitnexus/rules/**` artifacts (explicit opt-in only).
