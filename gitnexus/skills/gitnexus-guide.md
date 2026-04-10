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

Default `query/context` responses are now slim for agent use:

- `query`: `summary`, `candidates`, `process_hints`, `resource_hints`, `resource_chains`, `decision`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- `context`: `summary`, `symbol`, `incoming`, `outgoing`, `processes`, `resource_hints`, `resource_chains`, `verification_hint`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- `suggested_context_targets[]` now returns structured objects: `{ name, uid?, filePath?, why }`
- `upgrade_hints[]` may include exact `gitnexus context --uid <uid>` commands for same-name disambiguation
- `resource_chains[]` returns graph-backed Unity seed chains such as `sourceResourcePath -> intermediateResourcePath -> targetSymbol` when a resource seed can be bridged through `UNITY_ASSET_GUID_REF -> UNITY_GRAPH_NODE_SCRIPT_REF`.

When you need the legacy heavy payloads (`processes`, `process_symbols`, `definitions`, `resourceBindings`, `serializedFields`, `next_hops`), pass:

- `response_profile: "full"` in MCP calls
- `--response-profile full` in CLI calls

When you need Unity resource evidence, pass:

- `unity_resources: "on"` (or `"auto"` when you want adaptive behavior)
- `unity_hydration_mode: "compact" | "parity"` (default: `"compact"`)

Recommended default workflow:

1. Follow `discovery -> seed narrowing -> closure verification`.
2. Call `context/query` with `unity_hydration_mode: "compact"` for speed.
3. Inspect `hydrationMeta` in the response:
   - `needsParityRetry: true` → rerun same call with `unity_hydration_mode: "parity"`
   - `isComplete: true` → keep compact result
4. Treat parity as the completeness path for advanced verification.

Agent-safe upgrade path:

- inspect `resource_chains[]` first for graph-backed Unity resource bridges, then `resource_hints[]` / `process_hints[]` and narrow with `resource_path_prefix=` or symbol-targeted context
- use `decision.recommended_follow_up` as the default narrow-first next step
- inspect `missing_proof_targets[]` and structured `suggested_context_targets[]` before considering payload expansion
- when `suggested_context_targets[]` includes `uid`, prefer the matching `upgrade_hints[]` `context --uid` command over same-name `context(name=...)`
- `response_profile=slim` is the default and sufficient for normal workflows
- use `response_profile: "full"` only for debugging/deep evidence inspection when narrowing cannot close the proof gap

Runtime claim closure reminder:

- Query-time runtime closure is **graph-only** and does not require `verification_rules` / `trigger_tokens` matching.
- `verification_rules` remains an offline governance/report artifact family.
- Strong graph hops can coexist with failed closure when verifier-core stays `failed`; report as partial bridge evidence.

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
