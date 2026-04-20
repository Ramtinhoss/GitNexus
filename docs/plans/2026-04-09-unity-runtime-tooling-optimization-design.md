# Unity Runtime Tooling Optimization Design

Date: 2026-04-09
Repo: GitNexus
Status: Approved
Scope mode: balanced optimization

## 1. Problem Statement

GitNexus Unity runtime process retrieval has crossed the main architectural boundary:

- analyze-time rules already inject reusable synthetic edges;
- query-time runtime closure is already graph-only;
- seeded retrieval contract already exists.

The remaining NeonSpark-side friction is no longer best described as "trigger token dependency". The current problems cluster into:

1. explicit tooling defects;
2. retrieval and response-shaping design that still gives heuristic clues too much first-screen weight;
3. workflow guidance gaps that cause agents to misuse discovery query, seeded narrowing, and closure verification.

This design optimizes the tool side without introducing a heavier query-time verifier and without replacing the existing `query/context` contract with a brand-new tool family.

## 2. Goals

### G-01 Preserve the current architectural intent

Keep the current V2 direction intact:

- rules stay analyze-time graph construction instructions;
- runtime closure stays graph-only at query time;
- structured anchors and resource seeds remain the primary closure inputs.

### G-02 Fix concrete defects that break trust

Eliminate user-visible wrongness where the product currently emits misleading or stale guidance, especially:

- unrelated placeholder `next_action` / `next_command` text;
- DSL schema drift versus executable rule kinds;
- slim summaries that foreground low-confidence heuristic clues over stronger graph-backed leads.

### G-03 Make seed-first retrieval the default operational path

The dominant user path for Unity runtime retrieval should become:

1. discovery query only when necessary;
2. immediate narrowing via `uid` / `resource_path_prefix`;
3. closure verification only after narrowing;
4. graph proof (`process` / `cypher`) only when needed.

### G-04 Separate evidence tiers in the user-facing contract

Users and agents should be able to distinguish:

1. graph facts;
2. closure state;
3. heuristic clues.

The system may still return all three, but must stop presenting them as if they are the same semantic tier.

## 3. Non-Goals

This design does not:

- replace `query` and `context` with a new dedicated runtime tool;
- move runtime closure logic back into query-time rule matching;
- make natural-language discovery perfectly phrasing-invariant;
- persist on-demand verified closure results back into the graph.

## 4. As-Built Constraints

The design is constrained by the current source-of-truth behavior:

- query-time runtime closure is graph-only and no longer depends on `verification_rules` / `trigger_tokens`;
- `resource_heuristic` is an explicit low-confidence fallback when process rows are empty but Unity evidence exists;
- `resource_path_prefix` and other structured anchors already have precedence in closure inputs;
- `runtime_claim` already models verifier-core vs policy-adjusted semantics.

Therefore the design must optimize retrieval contract and workflow, not re-open the verifier architecture.

## 5. Problem Taxonomy

### 5.1 Category A: explicit defects

These are bugs or contract inconsistencies and should be fixed unconditionally.

#### A-01 Placeholder leakage in verifier follow-up commands

`context(uid=...)` can emit `runtime_claim.next_action` or `gaps[].next_command` with an unrelated default query string such as `Reload NEON.Game.Graph.Nodes.Reloads`.

This is an implementation defect because the command is not scoped to the active symbol or seed and can misdirect follow-up verification.

#### A-02 Rule Lab DSL schema drift

`gitnexus/src/rule-lab/schema/rule-dsl.schema.json` currently allows only:

- `asset_ref_loads_components`
- `method_triggers_field_load`

But TypeScript types and analyze-time injection implementation already support:

- `asset_ref_loads_components`
- `method_triggers_field_load`
- `method_triggers_scene_load`
- `method_triggers_method`

This is a tooling defect because validation, editor assistance, and executable semantics are no longer aligned.

#### A-03 Slim summary foregrounds heuristic clues

The slim response can surface a low-confidence heuristic clue as top summary even when the same payload already contains a better candidate and a better narrowing action.

This is not only a UX issue. It is a contract defect because it distorts first-screen interpretation and increases agent drift.

### 5.2 Category B: design optimization

These are not engine failures. They are next-step product improvements.

#### B-01 Seed-first path is present but not yet dominant

The contract already supports seeded narrowing, but the dominant user experience still begins with broad natural-language discovery and only later exposes precise narrowing.

#### B-02 Facts, closure, and clues are not visually or semantically separated enough

Current payloads can contain all three layers correctly, but the presentation does not make their tier boundaries obvious.

#### B-03 Method-only entrypoints are easy to overinterpret

Method-level `context(uid=Method:...)` is useful for graph facts, but in no-seed situations it should not feel like a promised closure path by itself.

### 5.3 Category C: workflow guidance gaps

These are not code failures. They are missing operational guidance that causes agents to misread correct outputs.

#### C-01 Discovery query is still mistaken for verification

Agents continue to treat the first `query()` result as if it should already prove closure, rather than as a candidate discovery step.

#### C-02 Graph hops plus failed closure are mistaken for contradiction

Agents read "strong code_loader hop evidence" and "runtime_claim.failed" as incompatible, when the actual meaning is "bridge evidence exists but full Anchor/Bind/Bridge/Runtime closure is incomplete".

#### C-03 `resource_heuristic` is mistaken for fact-tier evidence

Agents often over-read low-confidence clue rows as if they were equivalent to persisted process membership.

## 6. Design Principles

### P-01 No heavier query-time verifier

Do not add regex/token-family rule matching back into query-time closure.

### P-02 Prefer narrowing over expansion

When a structured narrowing action is available, it should outrank:

- `response_profile=full` expansion;
- manual heuristic inspection;
- unrelated fallback follow-up text.

### P-03 Facts beat clues on first screen

When a graph-backed lead and a heuristic clue coexist, default summary and top follow-up should reflect the graph-backed lead first.

### P-04 Contract consistency is mandatory

Schema, TypeScript types, parser behavior, injection implementation, tests, and installed skill/docs content must describe the same supported rule surface.

## 7. Proposed Design

### 7.1 Defect Fix Group 1: verifier follow-up command correctness

#### Design

Replace generic default follow-up command generation with anchor-aware command construction.

Follow-up generation priority:

1. explicit `uid` or symbol anchor when available;
2. explicit `resource_path_prefix` when available;
3. current symbol name only when it is the best available anchor;
4. generic query fallback only when no better anchor exists.

#### Expected effect

- no unrelated placeholder leakage;
- `runtime_claim` gaps become actionable instead of confusing;
- agent follow-up loops become more stable.

### 7.2 Defect Fix Group 2: Rule Lab schema alignment

#### Design

Bring the Rule Lab DSL schema into parity with executable support.

Required alignment:

1. `resource_bindings.kind` enum must include all four supported kinds;
2. field definitions must cover the per-kind shape already implied by the TypeScript interface;
3. schema examples and validation fixtures must stop rejecting supported rule kinds;
4. any installed docs/skills that describe binding kinds must be updated in the same change set.

#### Expected effect

- DSL validation matches actual analyze-time semantics;
- rule authors stop receiving false invalidation on supported rule kinds;
- governance artifacts and runtime implementation speak the same contract.

### 7.3 Defect Fix Group 3: slim response summary realignment

#### Design

Re-rank first-screen summary selection so that low-confidence `resource_heuristic` rows do not automatically win over stronger leads.

Summary selection priority:

1. exact candidate or high-confidence graph-backed process hint;
2. medium-confidence projected/process lead;
3. low-confidence heuristic clue only when no stronger lead exists.

This changes presentation priority, not evidence retention. Heuristic clues still remain in payload.

#### Expected effect

- top summary aligns with `primary_candidate` and `recommended_follow_up`;
- agents are less likely to anchor on the wrong clue;
- discovery drift decreases without hiding useful heuristic hints.

### 7.4 Design Optimization Group 1: seed-first retrieval framing

#### Design

Make the operational contract explicit:

1. `query()` is discovery-first;
2. `decision.recommended_follow_up` is the default next move;
3. `uid` or `resource_path_prefix` narrowing is the expected second step;
4. `runtime_chain_verify=on-demand` is a closure step, not a discovery step.

This remains within the existing API surface. The change is in priority, examples, and guidance.

#### Expected effect

- better alignment with the current graph-only architecture;
- fewer wording-sensitive agent loops;
- stronger fit with "seed over token" intent.

### 7.5 Design Optimization Group 2: output tier separation

#### Design

Clarify three semantic tiers in both response shaping and documentation:

1. graph facts
   - persisted process membership
   - direct or projected code/process evidence
   - analyze-time synthetic edges
2. closure state
   - `runtime_preview`
   - `runtime_claim`
   - `gaps`
3. heuristic clues
   - `resource_heuristic`
   - manual verification suggestions
   - exploratory next hops not yet backed by closure

The payload may still contain all of them, but the top-level summary and examples must reflect their tier difference.

#### Expected effect

- lower interpretation cost for humans;
- less agent confusion around "facts vs closure vs clues";
- clearer negative reasoning when closure is incomplete.

### 7.6 Design Optimization Group 3: method-entrypoint boundary

#### Design

Document and surface that method-level context without a resource seed is primarily a graph-inspection path, not a guaranteed full-closure path.

When method-only context is used:

- graph hops may still be strong;
- missing bind/runtime segments remain valid;
- recommended next step should prefer adding seed context, not implying the method alone should close.

#### Expected effect

- fewer false bug reports against correct failed-closure results;
- better user intuition about why method context can show good evidence but still not close.

### 7.7 Workflow Guidance Group: agent-safe runtime retrieval sequence

#### Design

Update skills, tool descriptions, examples, and benchmark framing so the default Unity runtime sequence becomes:

1. run `query` only to discover likely symbol/resource anchors;
2. immediately follow `decision.recommended_follow_up`;
3. use `context --uid` or `resource_path_prefix` to narrow;
4. request `runtime_chain_verify=on-demand` only after narrowing;
5. read `process` resource or run `cypher` when graph proof is needed;
6. treat `resource_heuristic` as clue tier unless closure upgrades it.

#### Expected effect

- less misuse of discovery query as verification;
- lower ambiguity detour count;
- better consistency between live agent usage and source-of-truth contract.

## 8. Acceptance Criteria

### AC-01 Defect correctness

- No Unity runtime follow-up command may leak an unrelated default placeholder query.
- Rule Lab DSL validation must accept all supported executable binding kinds.
- Slim top summary must not prefer a low-confidence heuristic clue when a stronger graph-backed lead exists in the same response.

### AC-02 Seed-first behavior

- When `uid` or `resource_path_prefix` is available, narrowing guidance must outrank expansion guidance.
- Runtime retrieval examples and skills must describe seeded narrowing as the primary path after discovery.

### AC-03 Tier separation

- Docs and examples must explicitly distinguish graph facts, closure state, and heuristic clues.
- Benchmark artifacts must measure drift and noise separately from closure capability.

### AC-04 Workflow safety

- Agent-facing guidance must explain why strong graph hops can coexist with `runtime_claim.failed`.
- Agent-facing guidance must explicitly classify `resource_heuristic` as clue-tier evidence.

## 9. Verification Strategy

### 9.1 Code-level regression checks

- unit tests for follow-up command generation;
- unit tests for slim summary ranking;
- schema validation tests for all supported Rule Lab binding kinds;
- regression tests ensuring narrowing beats `response_profile=full` fallback when anchor data exists.

### 9.2 Benchmark-level checks

- seed-first runtime retrieval acceptance starting from `uid` or `resource_path_prefix`;
- phrasing-drift benchmark comparing multiple natural-language variants for the same topic;
- anti-placeholder benchmark asserting follow-up commands never leak unrelated defaults.

### 9.3 Documentation and skill checks

- tool descriptions must reflect the seed-first narrowing path;
- Unity runtime guidance skills must describe the discovery -> narrowing -> verify sequence;
- installed setup artifacts must be reviewed for any stale Rule Lab or runtime retrieval wording.

## 10. Risks

### R-01 Over-suppressing heuristic clues

If heuristic clues are pushed too far down, discovery recall may feel worse for genuinely weakly anchored cases.

Mitigation:

- suppress them only in first-screen summary priority;
- retain them in payload and follow-up hints.

### R-02 Contract changes without benchmark updates

If response shaping changes but benchmarks still evaluate old assumptions, the project may report false regressions or miss new drift.

Mitigation:

- treat benchmark and docs updates as part of the same design scope, not a follow-up cleanup.

### R-03 Rule Lab parity fix stops at schema only

If only schema is updated but docs and setup-installed artifacts remain stale, user experience still diverges.

Mitigation:

- include artifact sync as part of acceptance.

## 11. Rollout Order

1. Fix verifier follow-up command correctness.
2. Align Rule Lab schema with executable support.
3. Realign slim summary priority and heuristic first-screen behavior.
4. Update docs, skills, and tool descriptions for seed-first workflow.
5. Add regression and benchmark coverage.

## 12. Decision

Proceed with balanced optimization.

This design preserves the current V2 architecture, fixes trust-breaking tooling defects, and makes the product behavior match the intended direction:

- rules as analyze-time graph construction;
- seeds as the primary retrieval path;
- runtime closure as graph-only verification rather than token-driven guesswork.
