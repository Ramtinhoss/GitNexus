# GitNexus Skill Matrix Workflow Design (Main Matrix First)

Date: 2026-03-30
Status: Approved (v2)
Scope: AGENTS.md + `.agents/skills/gitnexus/*.md` (main matrix)

## 1. Problem Statement

Current main-matrix workflows have three structural issues:

1. Unity UI trace capability exists but trigger criteria are not consistently integrated into high-frequency execution skills (`exploring`, `debugging`).
2. MCP vs CLI default priority is not enforced as a single contract across skills.
3. Repeated workflow fragments (staleness/analyze fallback, Unity hydration guidance) are duplicated across files, causing drift risk.

Goal: optimize AGENTS.md + MCP + skill workflow so any agent can reliably choose correct GitNexus interfaces and produce consistent evidence.

## 2. Design Goals

- One default decision chain across main skills.
- Explicit trigger boundaries for Unity resource binding vs Unity UI trace.
- MCP-first interaction model for analysis tasks.
- Shared contract extraction to minimize cross-file maintenance drift.
- Keep `guide` as routing/index role and `cli` as command execution manual.

## 3. Layered Workflow Architecture

1. Entry layer: `AGENTS.md`
- Defines global start sequence and skill routing.
- References shared workflow contracts as mandatory constraints.

2. Shared contract layer: `.agents/skills/gitnexus/_shared/`
- Single-source workflow contracts reused by all scenario skills.

3. Scenario execution layer
- `gitnexus-exploring`, `gitnexus-debugging`, `gitnexus-impact-analysis`, `gitnexus-refactoring`, `gitnexus-pr-review`.
- Keeps scenario-specific actions only; shared rules referenced by relative path.

4. Navigation and command references
- `gitnexus-guide`: routing/index and tool taxonomy.
- `gitnexus-cli`: CLI operations and command details.

## 4. Shared Contract Plan

Create three shared contract files under `.agents/skills/gitnexus/_shared/`:

### 4.1 `workflow-contract.md`

Defines global execution invariants:
- Default priority: MCP first, CLI fallback.
- Staleness loop: detect stale -> analyze via local CLI or pinned npx spec -> return to MCP path.
- Minimal evidence output expectations for decision-quality responses.

### 4.2 `unity-resource-binding-contract.md`

Trigger criteria:
- When `context/query` code-level semantics are insufficient to explain symbol lifecycle or key logic,
- And decision depends on Unity serialized/resource binding state.

Workflow contract:
- Start with `unity_resources: on` + `unity_hydration_mode: compact`.
- If `hydrationMeta.needsParityRetry === true`, rerun parity before conclusion.
- Return to scenario path only after completeness is established.

### 4.3 `unity-ui-trace-contract.md`

Trigger criteria:
- Problem involves UIToolkit visual semantics: layout, element structure, style behavior, selector binding evidence.

Workflow contract:
- Default order: `asset_refs -> template_refs -> selector_bindings`.
- `selector_mode: balanced` by default; rerun with `strict` for precision check when needed.
- Require evidence-chain output (`path + line + snippet`) in reasoning artifacts.

## 5. Per-File Change Blueprint

## 5.1 `AGENTS.md`

Add mandatory statement that scenario skills must follow `_shared` contracts:
- `workflow-contract.md`
- `unity-resource-binding-contract.md`
- `unity-ui-trace-contract.md`

## 5.2 `gitnexus-exploring/SKILL.md`

- Add workflow branch for Unity resource-binding escalation trigger.
- Add workflow branch for UIToolkit visual-semantic trigger (`unity_ui_trace`).
- Checklist includes mandatory contract references rather than duplicated long prose.

## 5.3 `gitnexus-debugging/SKILL.md`

- Add dedicated debugging pattern for UI semantic failures via `unity_ui_trace` contract.
- Add resource-binding completeness checkpoint via binding contract.
- Keep scenario-specific debug logic, remove repeated generic contract text.

## 5.4 `gitnexus-impact-analysis/SKILL.md`

- Add conditional branch: if affected symbols/processes rely on Unity serialized state or UIToolkit semantics, run corresponding shared contract flows before final risk call.

## 5.5 `gitnexus-refactoring/SKILL.md`

- Add post-change validation branch for Unity binding/UI semantics when refactor touches relevant symbols.
- Keep rename/extract/split mechanics local.

## 5.6 `gitnexus-pr-review/SKILL.md`

- Add review checklist gates for Unity binding/UI evidence requirements where relevant.
- Avoid duplicating full trace/hydration instructions; reference `_shared` contracts.

## 5.7 `gitnexus-guide/SKILL.md`

- Clarify role boundary: guide is routing/index + contract pointers.
- Point all workflow contracts to `_shared` instead of inlining lengthy duplicates.

## 5.8 `gitnexus-cli/SKILL.md`

- Keep command usage and CLI operations only.
- Replace strategic repeated decision blocks with references to shared contracts and `guide` routing.

## 6. Unified Priority Rules (Normative)

1. For understanding/debugging/impact/refactoring/review tasks: MCP toolchain is default.
2. CLI is default only for setup/analyze/status/clean/wiki/list and explicit CLI operational requests.
3. Stale index handling always returns to MCP scenario path after analyze.
4. Unity contracts are conditional but mandatory once triggered.

## 7. Acceptance Criteria

Documentation-level acceptance:
- Every scenario skill explicitly states MCP-first behavior.
- Every scenario skill references `_shared/workflow-contract.md`.
- Unity resource binding trigger and UIToolkit UI trace trigger are both explicit and non-overlapping.
- Guide/CLI role boundaries are explicit and non-conflicting.

Behavioral acceptance samples:
- Backend-only symbol question: no unnecessary `unity_ui_trace`.
- Unity serialized-state ambiguity case: binding contract path is invoked.
- UIToolkit visual-semantic issue: `unity_ui_trace` path is invoked.
- Stale-index case: analyze fallback then return to MCP path.

## 8. Rollout Order

1. Add `_shared` contract files.
2. Update `exploring` and `debugging` first (highest-frequency gains).
3. Update `guide` and `cli` role boundary and references.
4. Update `impact`, `refactoring`, `pr-review`.
5. Run matrix consistency check (trigger conditions, priority wording, relative references).

## 9. Risks and Mitigations

Risk: over-fragmented references reduce readability.
- Mitigation: keep each shared file short and normative; scenario skills include one-line local trigger summary.

Risk: trigger overlap (binding vs ui trace) causes confusion.
- Mitigation: define precedence and non-overlap examples in shared contracts.

Risk: future edits bypass shared contracts.
- Mitigation: add review checklist item requiring `_shared` references in modified skills.

## 10. Next Step

After this design baseline, generate an implementation plan that sequences concrete doc edits and verification checks for the main matrix.
