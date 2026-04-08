# Unity Runtime Process + Rule Lab Agent Context

Date: 2026-04-07
Owner: GitNexus
Status: Active

## 1. Purpose

This document is the execution-oriented context for agents working inside Unity repositories that use GitNexus runtime-process retrieval and Rule Lab.

It complements, but does not replace, the source of truth:

- `docs/unity-runtime-process-source-of-truth.md`
- `docs/unity-runtime-process-rule-driven-implementation.md`
- `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`

Use this document when the task is not just "how does runtime process work", but "how should I plan, classify, generate, promote, and verify rules for a real Unity project".

If this document conflicts with current code or the SSOT, trust current code plus SSOT first.

## 2. Reader Contract

This document is written for an agent that needs to do one or more of the following:

- plan project-level Unity `analyze_rules`
- choose the right `resource_bindings` strategy for a chain
- use `$gitnexus-unity-rule-gen` without guessing YAML structure
- distinguish analyze-time runtime stitching from query-time verification
- understand what Rule Lab artifacts mean and which stage owns them
- validate whether a proposed rule set is engineering-sound before writing files

This document is not a generic API reference. It is a planning and execution guide.

## 3. Three-Layer Mental Model

Think in three layers. Many mistakes happen when these layers are mixed.

### 3.1 Analyze-Time Layer

Goal: inject synthetic `CALLS` edges that close the resource-to-code boundary before process extraction runs.

Current pipeline order is:

1. `processUnityResources`
2. `applyUnityLifecycleSyntheticCalls`
3. `applyUnityRuntimeBindingRules`
4. `processProcesses`

Source:

- [pipeline.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/pipeline.ts:492)
- [unity-runtime-binding-rules.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:14)

Implication:

- if an `analyze_rules` rule is correct, its value is visible later as persisted graph edges and downstream process membership
- if no synthetic edge is injected at analyze time, query-time verification cannot invent that edge

### 3.2 Query-Time Layer

Goal: retrieve processes, project class-level symbols into process evidence, and optionally compute `runtime_claim`.

There are two relevant contracts:

- process evidence contract: `direct_step`, `method_projected`, `resource_heuristic`
- runtime verification contract: `verifier-core` plus `policy-adjusted`

`verifyRuntimeClaimOnDemand()` still uses a binary verifier core, but query/context may downgrade a closed result to `verified_partial` / `verified_segment` under `hydration_policy=strict` when hydration falls back to compact.

Source:

- [runtime-chain-verify.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-chain-verify.ts:84)
- [runtime-claim.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim.ts:35)
- [local-backend.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1847)

Implication:

- a `verified_partial` result does not mean the verifier found a partial graph proof
- it may mean the verifier core found `verified_full`, but policy downgraded the outward result because parity-complete evidence was not available

### 3.3 Rule Lab Layer

Goal: manage rule discovery, candidate generation, human curation, promotion, bundle compilation, and regression reporting.

Rule Lab does not directly "prove runtime". It governs how rule artifacts are shaped, reviewed, promoted, and re-used.

Source:

- [discover.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/discover.ts:48)
- [analyze.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/analyze.ts:97)
- [review-pack.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/review-pack.ts:145)
- [curate.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/curate.ts:167)
- [promote.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/promote.ts:318)
- [compile.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/compile.ts:14)

## 4. As-Built Runtime Process Flow

### 4.1 Analyze-Side Runtime Closure

Runtime closure starts only after Unity resource edges exist:

- `UNITY_ASSET_GUID_REF`
- `UNITY_COMPONENT_INSTANCE`

Then lifecycle edges are injected for Unity projects, and then rule-driven bindings inject additional `CALLS` edges.

`processProcesses()` runs after those injections, so processes can include synthetic runtime stitching.

### 4.2 Process Metadata Persistence

Current code persists lifecycle/process metadata when Unity project auto-detection hits `Assets/*.cs`.

The persistence branch is now driven by `isUnityProject`, not by an external config toggle.

Source:

- [pipeline.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/pipeline.ts:503)
- [pipeline.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/pipeline.ts:507)
- [pipeline.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/pipeline.ts:582)

Agent rule:

- if the Unity repo has C# under `Assets/`, assume persisted process metadata should exist after analyze
- if it does not appear, treat it as an indexing or scope problem, not as expected behavior

### 4.3 Query/Context Retrieval Behavior

When direct process membership is absent but Unity resource evidence exists, query/context can synthesize a heuristic process clue.

This is a retrieval fallback, not graph truth.

Source:

- [local-backend.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/local-backend.ts:1592)

Agent rule:

- never conclude "no runtime chain" from empty `processes` alone
- inspect `resourceBindings`, `hydrationMeta`, `runtime_claim`, and `verification_hint` together

## 5. Rule DSL and Binding Semantics

### 5.1 What the DSL Is For

The DSL has two separate jobs:

- retrieval-side matching and verification metadata: `match`, `topology`, `closure`, `claims`
- analyze-side edge injection metadata: `resource_bindings`, `lifecycle_overrides`

Source:

- [types.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/types.ts:90)
- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:187)

### 5.2 Binding Kinds

`asset_ref_loads_components`

- use when a serialized asset reference directly determines which asset/prefab/scriptable object becomes active
- output edge shape: `unity-runtime-root -> target entry method`
- reason prefix: `unity-rule-resource-load:`

`method_triggers_field_load`

- use when a host class method causes a field-referenced asset to load
- output edge shape: `loader method -> target entry method`
- reason prefix: `unity-rule-loader-bridge:`

`method_triggers_scene_load`

- use when a method deterministically loads a named scene and runtime should jump into components inside that `.unity` file
- output edge shape: `loader method -> scene component entry method`
- reason prefix: `unity-rule-scene-load:`

`method_triggers_method`

- use when the runtime hop exists but static calls do not, such as delegates, event buses, callback registration, Mirror callback chains, or similar dynamic dispatch
- output edge shape: `source method -> target method`
- reason prefix: `unity-rule-method-bridge:`

`lifecycle_overrides`

- use when project-specific entrypoints behave like Unity lifecycle and must be lifted from runtime root
- output edge shape: `unity-runtime-root -> override method`
- reason prefix: `unity-rule-lifecycle-override:`

Source:

- [unity-runtime-binding-rules.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:116)

### 5.3 Binding Selection Heuristics

Use this precedence:

1. If the missing hop is dynamic dispatch, prefer `method_triggers_method`.
2. If the hop is deterministic scene activation, use `method_triggers_scene_load`.
3. If the hop is loader method to asset-backed runtime object, use `method_triggers_field_load`.
4. If the chain starts from asset reference and directly activates component lifecycle, use `asset_ref_loads_components`.
5. If the project uses non-standard lifecycle entrypoints, add `lifecycle_overrides` in addition to the bridge rule, not instead of it.

## 6. Rule Parsing, Loading, and Bundle Resolution

### 6.1 YAML Parsing Facts

`parseRuleYaml()` now extracts:

- `scene_name`
- `source_class_pattern`
- `source_method`
- `target_class_pattern`
- `target_method`
- `lifecycle_overrides.additional_entry_points`
- `lifecycle_overrides.scope`

Source:

- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:207)
- [runtime-claim-rule-registry.test.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/test/unit/runtime-claim-rule-registry.test.ts:92)

Agent rule:

- when adding a new binding field or binding kind, update `types.ts`, `parseRuleYaml()`, and parser unit tests in the same commit

Reference maintenance contract:

- [AGENTS.md](/Users/nantasmac/projects/agentic/GitNexus/AGENTS.md:95)

### 6.2 Family Semantics

`analyze_rules`

- consumed by `loadAnalyzeRules()`
- used during indexing to inject synthetic edges

`verification_rules`

- consumed by `loadRuleRegistry()`
- used during query/context runtime claim verification

Source:

- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:376)

Agent rule:

- do not put analyze-only behavior into a `verification_rules` rule and expect process quality to improve
- do not put runtime-claim-only matching logic into an `analyze_rules` rule and expect verifier behavior to change by itself

### 6.3 Bundle and Catalog Precedence

Current resolution order matters:

- `loadAnalyzeRules()` prefers `compiled/analyze_rules.v2.json`
- `loadRuleRegistry()` prefers `compiled/verification_rules.v2.json`
- fallback path is `catalog.json` plus `approved/*.yaml`

Source:

- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:283)
- [runtime-claim-rule-registry.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:376)
- [compiled-bundles.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/rule-lab/compiled-bundles.ts:34)

Agent rule:

- after writing or promoting rules, compile bundles if the target workflow expects compiled artifacts
- if a rule exists in YAML but behavior does not change, inspect compiled bundle freshness before debugging graph logic

## 7. Rule Lab Lifecycle and Artifact Ownership

### 7.1 Stages

`discover`

- slices existing rules into deterministic work units based on `trigger_family`, `resource_types`, `host_base_type`, `required_hops`

`analyze`

- emits candidate topologies and basic coverage/conflict statistics

`review_pack`

- compresses candidate decision inputs into token-budgeted cards

`curate`

- validates human-curated items, anchor evidence, and DSL completeness

`promote`

- writes `approved/*.yaml`, updates `catalog.json`, and merges compiled bundles

`regress`

- records precision and coverage outcomes for quality tracking

### 7.2 Artifact Map

Important repo-local paths:

- `.gitnexus/rules/catalog.json`
- `.gitnexus/rules/approved/*.yaml`
- `.gitnexus/rules/compiled/*.v2.json`
- `.gitnexus/rules/lab/runs/<run_id>/...`

Source:

- [gitnexus-config-files.md](/Users/nantasmac/projects/agentic/GitNexus/docs/gitnexus-config-files.md:5)

Agent rule:

- treat `.gitnexus/rules/lab/runs/**` as staging artifacts
- treat `approved/*.yaml` and `catalog.json` as project rule truth
- treat `compiled/*.v2.json` as deployable derivatives that must track truth

## 8. How to Classify Rules for a Unity Project

Project rule planning should classify by four axes.

### 8.1 By Domain

Examples:

- weapon equip and reload
- mission flow and scene transitions
- UI prefab activation
- networked callback chains
- graph runtime bootstrapping

This keeps rule IDs and ownership intelligible.

### 8.2 By Trigger Mechanism

Examples:

- serialized asset reference
- loader method
- scene load
- event or callback bridge
- custom lifecycle

This tells you which binding kind belongs in `resource_bindings`.

### 8.3 By Bridge Shape

Examples:

- resource load bridge
- loader bridge
- scene load bridge
- method bridge
- lifecycle root lift

This is how you reason about expected `r.reason` distribution in verification queries.

### 8.4 By Verification Goal

Examples:

- prove resource-to-runtime closure
- prove graph bootstrap reachability
- prove scene bootstrap entry
- prove callback bridge existence

This is how you choose `required_hops`, `guarantees`, and acceptance checks.

### 8.5 Naming Guidance

Use stable, scenario-oriented IDs, for example:

- `unity.weapon-powerup.equip-gungraph.loader-bridge.v2`
- `unity.global-init.scene-load.framework.v2`
- `unity.netplayer.pickup.event-bridge.v2`

Favor domain plus runtime chain meaning over implementation trivia.

## 9. Mapping to `$gitnexus-unity-rule-gen`

The skill workflow is already correct, but this document changes how the agent should reason while using it.

Phase 0

- confirm Unity edges exist before trying to infer runtime behavior
- if missing, fix indexing first

Phase 1

- collect chain clues in business language, then map them to bridge shapes
- use graph exploration to reduce uncertainty before emitting YAML

Phase 2

- write YAML, update catalog, compile bundle, then analyze

Phase 3

- validate graph edges, runtime claim, process quality, and reason distribution

Source:

- [gitnexus-unity-rule-gen/SKILL.md](/Users/nantasmac/projects/agentic/GitNexus/.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md:10)

Agent rule:

- do not start from YAML fields
- start from runtime chain shape, then choose bindings, then fill YAML

## 10. Acceptance and Verification Gates

A rule is not done when YAML parses. It is done when four gates hold.

1. Synthetic edges exist with the expected `unity-rule-*:{ruleId}` reasons.
2. `runtime_claim` can match the rule and return a closure outcome appropriate to hydration policy.
3. Query/context can expose process evidence that crosses the intended runtime boundary.
4. Edge distribution matches the intended bridge types.

Recommended commands are already encoded in the skill, but interpretation matters:

- `rule_not_matched` usually means bad `match.trigger_tokens` or bad query phrasing
- `rule_matched_but_verification_failed` usually means graph edges were never injected or rule ID/reason alignment is broken
- `verified_partial` under strict policy may still require parity rerun before final acceptance

## 11. Failure Patterns

Common failure classes:

- indexing scope excluded `.meta` or relevant Unity assets
- YAML was updated but compiled bundle was stale
- class or method names do not match graph symbol names exactly enough for regex matching
- scene name does not match the `.unity` filename
- dynamic hop was modeled as static load logic instead of `method_triggers_method`
- tree-sitter or preprocessor issues prevented `Class` or `HAS_METHOD` edges from existing
- class-like target is a `Struct` or `Interface`, but `enableContainerNodes` is still disabled

References:

- [unity-runtime-binding-rules.test.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/test/unit/unity-runtime-binding-rules.test.ts:77)
- [tree-sitter-parsing-pitfalls.md](/Users/nantasmac/projects/agentic/GitNexus/docs/tree-sitter-parsing-pitfalls.md:1)

## 12. Retrieval Contract for Agent Use

When exploring Unity runtime behavior, use this retrieval discipline:

1. `unity_resources: "on"`
2. `unity_hydration_mode: "compact"` first
3. if `hydrationMeta.needsParityRetry === true`, rerun with parity before closure statements
4. use `runtime_chain_verify: "on-demand"` only when the question is about actual closure, not broad exploration
5. treat low-confidence `resource_heuristic` rows as incomplete evidence, not as proof

Source:

- [gitnexus-exploring/SKILL.md](/Users/nantasmac/projects/agentic/GitNexus/.agents/skills/gitnexus/gitnexus-exploring/SKILL.md:17)
- [mcp/tools.ts](/Users/nantasmac/projects/agentic/GitNexus/gitnexus/src/mcp/tools.ts:72)

## 13. Maintenance Discipline

Whenever Unity runtime process or Rule Lab behavior changes, check all of these:

1. SSOT remains consistent with code.
2. Skill guidance still matches actual commands and semantics.
3. New `resource_bindings` fields are parsed and tested.
4. `catalog.json`, YAML truth, and compiled bundles remain aligned.
5. Query/context docs still describe policy-adjusted runtime claim behavior correctly.

## 14. Minimal Command Appendix

Inspect Unity resource edges:

```cypher
MATCH ()-[r:CodeRelation]->()
WHERE r.type IN ['UNITY_ASSET_GUID_REF', 'UNITY_COMPONENT_INSTANCE']
RETURN r.type AS edgeType, count(*) AS cnt
```

Inspect synthetic rule edges:

```cypher
MATCH ()-[r:CodeRelation {type:'CALLS'}]->()
WHERE r.reason STARTS WITH 'unity-rule-'
RETURN r.reason AS reason, count(*) AS cnt
ORDER BY cnt DESC
```

Compile project rules:

```bash
gitnexus rule-lab compile --repo-path <repo>
```

Rebuild index after rule changes:

```bash
gitnexus analyze <repo> --force --extensions ".cs,.meta"
```

Query runtime closure:

```bash
gitnexus query --repo "<repo>" \
  --unity-resources on \
  --unity-hydration parity \
  --runtime-chain-verify on-demand \
  "<query>"
```
