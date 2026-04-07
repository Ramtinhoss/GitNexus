---
name: gitnexus-guide
description: "Use when the user asks about GitNexus itself — available tools, how to query the knowledge graph, MCP resources, graph schema, or workflow reference. Examples: \"What GitNexus tools are available?\", \"How do I use GitNexus?\""
---

# GitNexus Guide

Quick reference for all GitNexus MCP tools, resources, and the knowledge graph schema.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

## Skills

| Task                                         | Skill to read       |
| -------------------------------------------- | ------------------- |
| Understand architecture / "How does X work?" | `gitnexus-exploring`         |
| Blast radius / "What breaks if I change X?"  | `gitnexus-impact-analysis`   |
| Trace bugs / "Why is X failing?"             | `gitnexus-debugging`         |
| Rename / extract / split / refactor          | `gitnexus-refactoring`       |
| Tools, resources, schema reference           | `gitnexus-guide` (this file) |
| Index, status, clean, wiki CLI commands      | `gitnexus-cli`               |
| Create Unity analyze_rules interactively     | `gitnexus-unity-rule-gen`    |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `unity_ui_trace` | Unity UI query-time evidence chains (`asset_refs/template_refs/selector_bindings`) |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

### Unity Retrieval Contract (query/context)

When you need Unity resource evidence, pass:

- `unity_resources: "on"` (or `"auto"` when you want adaptive behavior)
- `unity_hydration_mode: "compact" | "parity"` (default: `"compact"`)

Recommended default workflow:

1. Call `context/query` with `unity_hydration_mode: "compact"` for speed.
2. Inspect `hydrationMeta` in the response:
   - `needsParityRetry: true` → rerun same call with `unity_hydration_mode: "parity"`
   - `isComplete: true` → keep compact result
3. Treat parity as the completeness path for advanced verification.

When task scope includes Unity runtime process semantics, load and follow:

- `_shared/unity-runtime-process-contract.md`

### Unity UI Trace Contract (`unity_ui_trace` / `gitnexus unity-ui-trace`)

Input:
- `target`: C# class 名或 UXML 路径
- `goal`: `asset_refs | template_refs | selector_bindings`
- `selector_mode`（可选）: `balanced`（默认）或 `strict`

Modes:
- `balanced`: 复合选择器 token 匹配，召回优先
- `strict`: 仅精确 `.className` 选择器，精度优先

Output:
- `results[].evidence_chain`: 严格 `path + line + snippet` 证据跳
- `results[].score`: 排序分数（高分优先）
- `results[].confidence`: `high|medium|low`
- `diagnostics`: `not_found|ambiguous`

Recommended workflow:
1. 先跑 `asset_refs`（确认资源引用链存在）
2. 再跑 `template_refs`（确认模板引用链存在）
3. 最后跑 `selector_bindings`（先 `balanced`，必要时切 `strict` 验证）

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `gitnexus://repo/{name}/context`               | Stats, staleness check                    |
| `gitnexus://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members                              |
| `gitnexus://repo/{name}/processes`             | All execution flows                       |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `gitnexus://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS
**Unity edges:** UNITY_ASSET_GUID_REF (serialized field → asset), UNITY_COMPONENT_INSTANCE (class → asset file)

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.
