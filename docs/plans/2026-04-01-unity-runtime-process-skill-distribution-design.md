# Unity Runtime Process Skill Distribution Design

Date: 2026-04-01
Owner: GitNexus
Status: Approved-for-Planning

## Goal

Make Unity runtime process usage guidance part of the setup-distributed truth source, not ad-hoc repo-local edits, and ensure all relevant workflows can load one shared contract on demand.

## Scope

- In scope:
  - Setup-distributed AGENTS/CLAUDE template source.
  - Setup-distributed GitNexus skills under `gitnexus/skills`.
  - Shared runtime process contract under setup-distributed skills payload.
  - Setup/install logic to copy shared files reliably.
- Out of scope:
  - Runtime process engine behavior changes.
  - MCP schema or query/context response shape changes.
  - Benchmarks and acceptance runner behavior changes.

## Current State (As-Is)

1. `gitnexus/skills` already includes partial Phase 5 guardrails in `exploring/debugging/impact/guide`.
2. `gitnexus/src/cli/ai-context.ts` generated AGENTS section does not include Unity runtime process source-of-truth entry.
3. Skill distribution currently copies top-level `skills/*.md` and `skills/*/SKILL.md` directories only; `_shared` support is not guaranteed as a first-class contract.
4. This causes drift risk between:
   - setup-distributed truth source (`gitnexus/skills`, `ai-context.ts`)
   - repo-local checked-in `.agents/skills` and `AGENTS.md`.

## Target State (To-Be)

1. Single shared contract document exists in setup-distributed skills payload:
   - `gitnexus/skills/_shared/unity-runtime-process-contract.md`.
2. Relevant skills use a light trigger + load pattern:
   - detect when task touches Unity runtime process semantics,
   - load `_shared/unity-runtime-process-contract.md`,
   - execute shared checklist/hop rules,
   - avoid duplicating long rules inline.
3. AGENTS/CLAUDE generated section includes explicit Unity runtime process source-of-truth pointer.
4. Setup install behavior copies `_shared` into target skill root for both global and project scope.

## Design Decisions

### D1. Shared Contract Carrier

Use `_shared` file in `gitnexus/skills` instead of embedding full policy in each skill.

Rationale:
- Centralized maintenance.
- Lower drift risk.
- Preserves skill readability.

### D2. Skill-Level Guidance Strategy

Use "minimal workflow step + reference shared contract" in each relevant skill.

Rationale:
- Keep each skill focused on task intent.
- Enforce consistent runtime process semantics through one contract.

### D3. AGENTS Entry Strategy

Add a Unity runtime process source-of-truth section in generated AGENTS/CLAUDE content from `ai-context.ts`.

Rationale:
- Ensures first-entry instruction appears in all setup-installed environments.
- Aligns with existing "Always Start Here" flow.

### D4. Distribution Consistency

Extend setup installer to include `_shared` directory under the distributed skill root.

Rationale:
- Avoid runtime references to missing files after `gitnexus setup`.

## Affected Files (Planned)

- `gitnexus/src/cli/ai-context.ts`
- `gitnexus/src/cli/setup.ts`
- `gitnexus/src/cli/setup.test.ts`
- `gitnexus/src/cli/ai-context.test.ts`
- `gitnexus/skills/_shared/unity-runtime-process-contract.md` (new)
- `gitnexus/skills/gitnexus-exploring.md`
- `gitnexus/skills/gitnexus-debugging.md`
- `gitnexus/skills/gitnexus-impact-analysis.md`
- `gitnexus/skills/gitnexus-guide.md`
- `gitnexus/skills/gitnexus-pr-review.md`
- `gitnexus/skills/gitnexus-refactoring.md`
- `gitnexus/skills/gitnexus-cli.md`

## Risks and Mitigations

1. Risk: setup-distributed paths differ by scope (`global` vs `project`).
   - Mitigation: references use relative `_shared/...` from skill location and test both scopes.
2. Risk: duplicate, conflicting guidance remains in skills.
   - Mitigation: remove repeated detailed paragraphs; keep trigger/entry bullets only.
3. Risk: installer regression breaks existing flat-skill install.
   - Mitigation: keep backward-compatible copy logic and add focused tests for `_shared`.

## Acceptance Criteria

1. Generated AGENTS/CLAUDE section includes Unity runtime process source-of-truth guidance.
2. Setup-installed skill payload contains `_shared/unity-runtime-process-contract.md`.
3. All targeted skills reference shared contract with explicit trigger conditions.
4. Existing skill install behavior remains green in tests.
5. No references to non-existent shared file paths after setup.

