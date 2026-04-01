---
name: gitnexus-cli
description: "Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: \"Index this repo\", \"Reanalyze the codebase\", \"Generate a wiki\""
---

# GitNexus CLI Commands

Use one command alias in the session so every CLI/MCP call stays on one version line. After `setup`, treat `~/.gitnexus/config.json` as the only npx version source.

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

| Flag           | Effect                                                           |
| -------------- | ---------------------------------------------------------------- |
| `--force`      | Force full re-index even if up to date                           |
| `--embeddings` | Enable embedding generation for semantic search (off by default) |

**When to run:** First time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale. In Claude Code, a PostToolUse hook runs `analyze` automatically after `git commit` and `git merge`, preserving embeddings if previously generated.

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

```bash
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal asset_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/CoreScreen.uxml" --goal template_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal selector_bindings --selector-mode balanced --repo neonspark
```

Supported goals:
- `asset_refs`: 哪些 prefab/asset 引用了目标 UXML
- `template_refs`: 目标 UXML 里引用了哪些模板 UXML
- `selector_bindings`: C# `AddToClassList/Q(className)` 到 USS 选择器证据链

Selector mode（仅 `selector_bindings` 生效）:
- `--selector-mode balanced`（默认）: 复合选择器 token 匹配，召回更高
- `--selector-mode strict`: 仅匹配精确 `.className` 选择器，精度更高

输出字段解读:
- `results[].evidence_chain`: 每跳都有 `path + line + snippet`
- `results[].score`: 排序分数（越高越优先）
- `results[].confidence`: `high|medium|low`（基于 score）
- `diagnostics`: `not_found|ambiguous` 诊断

推荐排查顺序（实仓）:
1. 先跑 `asset_refs`，确认资源链是否存在
2. 再跑 `template_refs`，确认模板链是否存在
3. 最后跑 `selector_bindings`，默认 `balanced`
4. 若怀疑误报，复跑 `--selector-mode strict` 对比

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart Claude Code to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
