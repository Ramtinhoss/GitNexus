---
name: gitnexus-cli
description: "Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: \"Index this repo\", \"Reanalyze the codebase\", \"Generate a wiki\""
---

# GitNexus CLI Commands

Use one command alias in the session so every CLI/MCP call stays on one version line. After `setup`, use `~/.gitnexus/config.json` as the CLI package spec source (`cliPackageSpec` first, then `cliVersion`). MCP wiring and skill install locations are scope-dependent (`project` vs `global`).

### setup — choose scope explicitly

```bash
gitnexus setup --scope project --agent codex --cli-spec @veewo/gitnexus@<version>
```

Rules:

- If user asks "setup this repository" / "本仓库 setup", use `--scope project`.
- `--scope project` updates repo-local files:
  - Codex MCP config: `.codex/config.toml`
  - Skills: `.agents/skills/gitnexus/`
- `--scope global` updates user-global files:
  - Codex MCP config: `~/.codex/config.toml`
  - Skills: `~/.agents/skills/gitnexus/`
- `--scope global` does not overwrite repo-local `.agents/skills` or `.codex/config.toml`.
- Never rely on setup defaults for scope; pass `--scope` explicitly to avoid global/project mismatch.

```bash
if command -v gitnexus >/dev/null 2>&1; then
  GN="gitnexus"
else
  GITNEXUS_CLI_SPEC="$(
    node -e 'const fs=require("fs");const os=require("os");const path=require("path");
    try {
      const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
      const parsed=JSON.parse(raw);
      const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
        ? parsed.cliPackageSpec.trim()
        : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
          ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
          : "";
      if (spec) process.stdout.write(spec);
    } catch {}'
  )"
  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo "Missing GitNexus CLI package spec in ~/.gitnexus/config.json. Run gitnexus setup --cli-spec <packageSpec> first." >&2
    exit 1
  fi
  GN="npx -y ${GITNEXUS_CLI_SPEC}"
fi
```

## Commands

### analyze — Build or refresh the index

```bash
$GN analyze
```

Run from the project root. This parses all source files, builds the knowledge graph, writes it to `.gitnexus/`, and generates CLAUDE.md / AGENTS.md context files.

| Flag                       | Effect                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `--force`                  | Force full re-index even if up to date                                                    |
| `--embeddings`             | Enable embedding generation for semantic search (off by default)                          |
| `--extensions <ext>`       | Limit parsing to specific file types (comma-separated, e.g., `--extensions ".cs,.meta"`) |
| `--csharp-define-csproj <path>` | Load C# `DefineConstants` from a `.csproj` and normalize `#if/#elif/#else/#endif` before parsing |
| `--scope-prefix <prefix>`  | Limit analysis to a path prefix (e.g., `--scope-prefix Assets/` for Unity)               |
| `--scope-manifest <file>`  | Read scope rules from a manifest file (e.g., `.gitnexus/sync-manifest.txt`)              |
| `--sync-manifest-policy <policy>` | Drift policy when explicit CLI values differ from manifest directives: `ask|update|keep|error` |
| `--skills`                 | Generate repo-specific skill files from detected code communities                         |

**Scope manifest syntax:** Non-`@` lines are path-prefix scope rules (same semantics as before). `@key=value` directives set analyze options: `@extensions=<csv>`, `@repoAlias=<name>`, `@embeddings=<true|false>`. Unknown directives fail fast.

**Defaulting + drift guard:** If `.gitnexus/sync-manifest.txt` exists and you do not pass `--scope-manifest`/`--scope-prefix`, analyze auto-uses that file. When explicit CLI values (`--extensions`, `--repo-alias`, `--embeddings`) differ from manifest directives, CLI follows `--sync-manifest-policy` (default `ask`; non-TTY requires explicit policy).

**When to run:** First time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale. In Claude Code, a PostToolUse hook runs `analyze` automatically after `git commit` and `git merge`, preserving embeddings if previously generated.

**Unity projects:** Add `--extensions ".cs,.meta"` to ensure Unity asset edges (`UNITY_ASSET_GUID_REF`, `UNITY_COMPONENT_INSTANCE`) are parsed. Add `--scope-prefix Assets/` to limit scope if all code lives under `Assets/`.

**C# conditional-compilation projects (recommended):**

- Unity: pass `--csharp-define-csproj /path/to/Assembly-CSharp.csproj` (for neonspark, use `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`).
- Non-Unity: discover candidate project files first, then pass the intended one explicitly:

```bash
rg --files -g '*.csproj'
$GN analyze --extensions ".cs" --csharp-define-csproj <picked-project>.csproj
```

### status — Check index freshness

```bash
$GN status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
$GN clean
```

Deletes the `.gitnexus/` directory and unregisters the repo from the global registry. Use before re-indexing if the index is corrupt or after removing GitNexus from a project.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

### wiki — Generate documentation from the graph

```bash
$GN wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a public GitHub Gist      |

### list — Show all indexed repos

```bash
$GN list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

### query/context — Unity hydration mode

For Unity resource retrieval:

```bash
$GN context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources on --unity-hydration compact
```

```bash
$GN query "DoorObj binding" --repo neonnew-core --unity-resources on --unity-hydration compact
```

Rules:

- `--unity-hydration compact` is the default (fast path).
- If response `hydrationMeta.needsParityRetry=true`, rerun with `--unity-hydration parity`.
- `--unity-hydration parity` is completeness-first mode for advanced verification.

### Unity runtime process contract trigger

When CLI analysis targets Unity runtime process semantics (runtime chain closure/confidence), load:

- `_shared/unity-runtime-process-contract.md`

Runtime-process verification examples:

```bash
$GN query "Reload NEON.Game.Graph.Nodes.Reloads" --repo neonspark --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand
```

```bash
$GN context ReloadNode --repo neonspark --unity-resources on --unity-hydration compact --runtime-chain-verify on-demand
```

### unity-ui-trace — Unity UI evidence tracing workflow

For full workflow details, load: `_shared/unity-ui-trace-contract.md`

```bash
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal asset_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/CoreScreen.uxml" --goal template_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal selector_bindings --selector-mode balanced --repo neonspark
```

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart Claude Code to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.
