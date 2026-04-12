# Gap-Lab to Rule-Lab Handoff Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the gap-lab to rule-lab handoff so accepted/backlog candidate truth flows into downstream proposal, review, curation, and promotion artifacts without hidden manual reconstruction.

**Architecture:** Keep `gap-lab` as the exhaustive candidate truth source and make `rule-lab` proposal artifacts explicitly derived from accepted gap candidates plus aggregation decisions. Replace the current generic `primary/fallback` placeholder path with lineage-bearing proposal candidates, carry reduction/backlog summaries into downstream artifacts, and remove remaining multi-candidate single-draft assumptions.

**Tech Stack:** TypeScript CLI modules, Vitest unit/integration tests, JSON/JSONL run artifacts, Markdown contracts/docs, local CLI real-run verification on neonspark.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added `gap-handoff` loader + lineage proposal generation in `analyze.ts`, enforced placeholder rejection, and passed `src/rule-lab/analyze.test.ts` checks for `gap-lab handoff|accepted lineage|aggregate_single_rule` and anti-generic-fallback behavior.
Task 2 | completed | Added proposal-to-curation mapping (`curation-input-builder.ts`), persisted `source_gap_handoff` into downstream `slice.json`, and passed `src/rule-lab/analyze.test.ts -t "source_gap_handoff|curation input"` with non-empty `confirmed_chain.steps`.
Task 3 | completed | Extended `review-pack` to read `slice.json.source_gap_handoff`, render accepted/backlog/reject/aggregation summary, and include `source_gap_candidate_ids` + `draft_rule_ids`; passed `src/rule-lab/review-pack.test.ts -t "proposal lineage|backlog summary"`.
Task 4 | completed | Curate now preserves all curated items, emits `dsl-drafts.json`, and writes legacy `dsl-draft.json` with explicit multi-draft compatibility warning; passed `src/rule-lab/{curate,promote}.test.ts -t "multi-candidate|dsl-drafts"`.
Task 5 | completed | Added `test/integration/gap-lab-rule-lab-handoff.test.ts` and CLI placeholder-id guard coverage; combined suite (`src/cli/rule-lab.test.ts`, `src/rule-lab/{analyze,review-pack}.test.ts`, integration handoff test) passes with explicit `76 -> 2 + 73` semantics.
Task 6 | completed | Updated truth-source/config/skill/checklist contracts for `source_gap_handoff` + proposal-candidate layering, passed `test/integration/rule-lab-contracts.test.ts -t "proposal candidates|source_gap_handoff"`, rebuilt CLI, and verified real neonspark downstream artifacts (`76 -> 2 proposals + 73 backlog`) with semantic checks.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 `gap-lab slice.candidates.jsonl` remains the exhaustive truth source and downstream artifacts must derive from it without replacing it | critical | Task 1, Task 2 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "gap-lab handoff|accepted lineage"` | `rules/lab/runs/<run>/slices/<slice>/slice.json:source_gap_handoff`, `rules/lab/.../candidates.jsonl:source_gap_candidate_ids` | `rule-lab analyze` still emits generic `primary/fallback` rows with no gap lineage
DC-02 `rule-lab analyze` must consume accepted gap candidates and aggregation mode, not placeholder topology synthesis | critical | Task 1, Task 2 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "per-anchor proposals|aggregate_single_rule"` | `rules/lab/.../candidates.jsonl:proposal_kind/aggregation_mode/draft_rule_id` | proposal count ignores accepted candidate ids or aggregation decision
DC-03 downstream artifacts must make the `universe -> accepted -> proposal` reduction machine-auditable | critical | Task 2, Task 3, Task 6 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts -t "handoff summary|backlog"` | `rules/lab/.../slice.json:source_gap_handoff`, `review-cards.md:accepted_count/backlog_count/reject_buckets` | review artifacts show only topology skeletons and hide backlog/reduction semantics
DC-04 `review-pack` must review proposal candidates with source lineage instead of detached topology placeholders | critical | Task 3, Task 5 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "proposal lineage|review pack"` | `review-cards.md:candidate_ids/source_gap_candidate_ids/draft_rule_id` | cards omit anchor lineage or still review generic `candidate-a/candidate-b`
DC-05 multi-candidate curation must preserve all curated items and reject first-draft truncation | critical | Task 4, Task 5 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "multi-candidate|dsl-drafts"` | `rules/lab/.../curated.json:curated[]`, `rules/lab/.../dsl-drafts.json:drafts[]` | second curated rule disappears or only first draft is persisted
DC-05a legacy `dsl-draft.json` compatibility alias must carry explicit warning semantics when multi-draft mode is active | major | Task 4 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/curate.test.ts -t "compatibility warning"` | `rules/lab/.../dsl-draft.json:compatibility_warning` | legacy alias silently points at the first draft without warning
DC-06 real-run neonspark verification must prove final downstream artifacts expose `76 -> 2 + 73 backlog` semantics | critical | Task 6 | `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node -e "const fs=require('fs');const path=require('path');const base=path.join(process.env.REPO_PATH,'.gitnexus','rules','lab','runs',process.env.RUN_ID,'slices',process.env.SLICE_ID);const rows=fs.readFileSync(path.join(base,'candidates.jsonl'),'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);if(rows.length!==2) throw new Error('expected 2 proposal candidates');if(rows.some(r=>!Array.isArray(r.source_gap_candidate_ids)||r.source_gap_candidate_ids.length===0)) throw new Error('missing proposal lineage');if(rows.some(r=>/candidate-a|candidate-b/.test(String(r.title||''))||/\\.primary$|\\.fallback$/.test(String(r.rule_hint||'')))) throw new Error('generic fallback proposals still present');const curation=JSON.parse(fs.readFileSync(path.join(base,'curation-input.json'),'utf8'));if(curation.curated.some(item=>!Array.isArray(item.confirmed_chain?.steps)||item.confirmed_chain.steps.length===0)) throw new Error('confirmed_chain.steps missing');"` | `/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook/slice.json:source_gap_handoff`, `candidates.jsonl:source_gap_candidate_ids`, `review-cards.md`, `curation-input.json:curated[].confirmed_chain.steps` | final rule-lab artifacts still show only two generic rows with no backlog/reduction explanation, proposal lineage missing, or curated closure evidence missing

## Authenticity Assertions

- `assert no placeholder path`: handoff loaders and generated proposal artifacts must reject placeholder run/slice ids and placeholder anchor paths.
- `assert live mode has tool evidence`: real-run verification must parse downstream rule-lab artifacts semantically, not just grep for field presence.
- `assert freeze requires non-empty confirmed_chain.steps`: generated curation payloads and final curated items must fail if any proposal lacks non-empty closure evidence.
- `assert no generic fallback mask`: when accepted gap candidates exist, `rule-lab analyze` must not fall back to unlabeled `primary/fallback` proposals.
- `assert accepted lineage is explicit`: every proposal candidate must carry `source_gap_candidate_ids` and `aggregation_mode`.
- `assert reduction is visible downstream`: `review-pack` and `rules/lab slice.json` must expose accepted/backlog/reject counts, not just topology hops.
- `assert multi-candidate does not collapse`: `curate` must emit multi-draft output and preserve every curated item.
- `assert real run shows 76 -> 2 + 73`: neonspark downstream artifacts must explain the reduction from exhaustive universe to per-anchor proposals.

### Task 1: Replace Generic Analyze Candidates With Gap-Handoff Proposal Candidates

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/rule-lab/gap-handoff.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Test: `gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json`

**Step 1: Write the failing tests**

Add tests that build a temp repo with:

1. `gap-lab` slice summary containing accepted ids + backlog counts;
2. `gap-lab` candidate rows containing two accepted anchors;
3. `rules/lab` slice stub for the same run/slice.

Assert that `analyzeRuleLabSlice()`:

```ts
expect(result.candidates).toHaveLength(2);
expect(result.candidates[0]).toHaveProperty('proposal_kind', 'per_anchor_rule');
expect(result.candidates[0]).toHaveProperty('source_gap_candidate_ids');
expect(result.candidates[0]).toHaveProperty('draft_rule_id');
expect(result.slice.source_gap_handoff.accepted_candidate_ids).toEqual([
  'accepted-a',
  'accepted-b',
]);
```

Also add one negative test for `aggregate_single_rule` that expects a single
proposal with two `source_gap_candidate_ids`.

Add two explicit anti-fake tests:

1. if accepted handoff data exists, `analyzeRuleLabSlice()` must not emit
   generic `candidate-a/candidate-b` fallback rows;
2. placeholder run/slice ids or placeholder source anchor paths in handoff data
   must fail fast.

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "gap-lab handoff|accepted lineage|aggregate_single_rule"`

Expected: FAIL because `analyze.ts` still emits generic `candidate-a/candidate-b`
without lineage or gap handoff fields.

**Step 3: Write minimal implementation**

Implement:

1. `gap-handoff.ts` loader that reads the paired `gap-lab` slice summary,
   candidate rows, and aggregation decision;
2. new `RuleLabProposalCandidate` lineage fields in `types.ts`;
3. `analyze.ts` proposal builder that:
   - derives proposal groups from accepted gap candidates;
   - emits one proposal per accepted anchor under `per_anchor_rules`;
   - emits one merged proposal under `aggregate_single_rule`;
   - persists `source_gap_handoff` into `rules/lab slice.json`;
   - rejects placeholder path/id inputs;
   - falls back to legacy `primary/fallback` only when no accepted handoff data
     exists, and never when accepted handoff data is present.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "gap-lab handoff|accepted lineage|aggregate_single_rule"`

Expected: PASS with proposal candidates containing explicit source lineage and
aggregation semantics.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/gap-handoff.ts gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/__fixtures__/rule-lab-slice-input.json
git commit -m "feat(rule-lab): derive proposal candidates from gap-lab handoff"
```

### Task 2: Persist Handoff Summary and Auto-Generate Curation Input

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Create: `gitnexus/src/rule-lab/curation-input-builder.ts`

**Step 1: Write the failing tests**

Add tests asserting that `rule-lab analyze` also writes:

1. `rules/lab/.../slice.json.source_gap_handoff`;
2. `rules/lab/.../curation-input.json`;
3. `curation-input.json.curated[]` length equals proposal candidate count;
4. every curated item has non-empty `confirmed_chain.steps` and
   anchor-specific `resource_bindings`.

Example assertion:

```ts
expect(slice.source_gap_handoff.promotion_backlog_count).toBe(73);
expect(curation.curated).toHaveLength(2);
expect(curation.curated.every((item) => /^unity\\.event\\..+\\.v1$/.test(item.rule_id))).toBe(true);
expect(curation.curated.every((item) => item.confirmed_chain.steps.length > 0)).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "source_gap_handoff|curation input"`

Expected: FAIL because `analyze.ts` does not currently generate or persist these
artifacts.

**Step 3: Write minimal implementation**

Implement:

1. `curation-input-builder.ts` that maps proposal candidates into normalized
   `curation-input.json`;
2. `analyze.ts` persistence for `source_gap_handoff`;
3. draft rule id derivation and confirmed-chain copying from gap-lab slice
   evidence;
4. stable backlog/reject summary fields in the downstream slice summary.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "source_gap_handoff|curation input"`

Expected: PASS with explicit reduction metadata and auto-generated curation
payload.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/curation-input-builder.ts
git commit -m "feat(rule-lab): persist gap handoff summary and curation input"
```

### Task 3: Rework Review-Pack Around Proposal Lineage Instead of Placeholder Topology

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/review-pack.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`

**Step 1: Write the failing tests**

Add tests asserting `buildReviewPack()` renders:

1. proposal candidate ids;
2. `source_gap_candidate_ids`;
3. accepted/backlog/reject counts from `source_gap_handoff`;
4. aggregation mode;
5. draft rule ids and binding kind.

Example expected lines:

```md
- accepted_count: 2
- backlog_count: 73
- reject_buckets: {"third_party_excluded":41,"unresolvable_handler_symbol":1}
- source_gap_candidate_ids: accepted-a, accepted-b
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts -t "proposal lineage|backlog summary"`

Expected: FAIL because current review-pack only prints generic topology card
fields.

**Step 3: Write minimal implementation**

Implement:

1. review-pack parsing of proposal lineage fields;
2. loading of `source_gap_handoff` from the downstream slice summary;
3. card rendering for reduction counts, reject buckets, aggregation mode, and
   draft rule ids;
4. token-budget-safe formatting for the added metadata.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts -t "proposal lineage|backlog summary"`

Expected: PASS with non-generic review cards that expose accepted/backlog
semantics.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/review-pack.ts gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/types.ts
git commit -m "feat(rule-lab): review proposal lineage and backlog summaries"
```

### Task 4: Remove Multi-Candidate First-Draft Truncation in Curate

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/curate.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`

**Step 1: Write the failing tests**

Add curate tests asserting:

1. multi-item `curated[]` writes `curated.json` with both items;
2. `dsl-drafts.json` contains both drafts;
3. legacy `dsl-draft.json` is only written for single-item slices or explicitly
   marked compatibility-only with a warning field;
4. promote still emits YAML for every curated item.

Example:

```ts
expect(drafts.drafts).toHaveLength(2);
expect(legacyDraft.compatibility_warning).toMatch(/multi-draft/i);
expect(promote.promotedFiles).toHaveLength(2);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "multi-candidate|dsl-drafts"`

Expected: FAIL because `curate.ts` currently writes only the first draft to
`dsl-draft.json`.

**Step 3: Write minimal implementation**

Implement:

1. `dsl-drafts.json` emission for all curated items;
2. explicit compatibility rule for legacy `dsl-draft.json` plus warning
   semantics for multi-candidate slices;
3. test-backed multi-item preservation across curate and promote.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "multi-candidate|dsl-drafts"`

Expected: PASS with no first-item truncation.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/curate.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts
git commit -m "fix(rule-lab): preserve multi-candidate drafts during curate"
```

### Task 5: Add End-to-End Contract Tests for Handoff Closure

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`
- Modify: `gitnexus/src/cli/rule-lab.test.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`

**Step 1: Write the failing integration tests**

Create an integration fixture that simulates:

1. a `gap-lab` slice with `76` processed user-code rows;
2. `2` accepted candidate ids;
3. `73` backlog rows;
4. `per_anchor_rules` aggregation.

Assert the end-to-end chain:

1. `rule-lab analyze` emits `2` proposal candidates with source lineage;
2. `review-pack` exposes `accepted=2`, `backlog=73`;
3. `curation-input.json` contains the same `2` proposal-derived curated items;
4. no artifact silently downgrades back to generic `candidate-a/candidate-b`.

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

Expected: FAIL because the current implementation does not propagate lineage and
reduction semantics through the full chain.

**Step 3: Write minimal implementation**

Implement any remaining glue so the end-to-end test passes without relying on
manual curation reconstruction.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

Expected: PASS with explicit `universe -> accepted -> proposal` closure.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts gitnexus/src/cli/rule-lab.test.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/review-pack.test.ts
git commit -m "test(rule-lab): close gap-lab handoff contract end to end"
```

### Task 6: Update Contracts and Prove the Real neonspark Slice

**User Verification: not-required**

**Files:**
- Modify: `docs/unity-runtime-process-source-of-truth.md`
- Modify: `docs/gitnexus-config-files.md`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md`
- Modify: `docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md`

**Step 1: Write the failing docs/real-run checks**

Add contract assertions in docs tests or targeted grep checks that require:

1. explicit distinction between exhaustive `gap-lab` candidates and derived
   `rule-lab` proposal candidates;
2. `source_gap_handoff` wording in contracts;
3. real-run checklist steps that verify downstream `rules/lab` artifacts, not
   only `gap-lab` truth.

Then prepare the real-run verification commands:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

**Step 2: Run checks to verify they fail before doc updates / final implementation**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "proposal candidates|source_gap_handoff"`

Expected: FAIL until docs/contracts are updated to describe the corrected
handoff semantics.

**Step 3: Write minimal implementation**

Update docs/contracts/checklists so they:

1. define the two candidate layers explicitly;
2. require downstream handoff summaries;
3. require real-run verification of the final `rules/lab` artifact set.

Then build the CLI and run the real neonspark verification commands above.

**Step 4: Run test to verify it passes**

Run:

```bash
npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "proposal candidates|source_gap_handoff"
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
rg -n '"source_gap_handoff"|"accepted_candidate_ids"|"promotion_backlog_count"' "$REPO_PATH/.gitnexus/rules/lab/runs/$RUN_ID/slices/$SLICE_ID/slice.json"
rg -n 'accepted_count|backlog_count|source_gap_candidate_ids' "$REPO_PATH/.gitnexus/rules/lab/runs/$RUN_ID/slices/$SLICE_ID/review-cards.md"
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const base = '/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook';
const candidates = fs.readFileSync(path.join(base, 'candidates.jsonl'), 'utf8').trim().split('\\n').filter(Boolean).map((line) => JSON.parse(line));
if (candidates.length !== 2) throw new Error(`expected 2 proposal candidates, got ${candidates.length}`);
if (candidates.some((row) => !Array.isArray(row.source_gap_candidate_ids) || row.source_gap_candidate_ids.length === 0)) {
  throw new Error('proposal lineage missing source_gap_candidate_ids');
}
if (candidates.some((row) => /candidate-a|candidate-b|\\.primary$|\\.fallback$/.test(String(row.title || '')) || /\\.primary$|\\.fallback$/.test(String(row.rule_hint || '')))) {
  throw new Error('generic fallback proposals still present');
}
const curation = JSON.parse(fs.readFileSync(path.join(base, 'curation-input.json'), 'utf8'));
if (!Array.isArray(curation.curated) || curation.curated.length !== 2) throw new Error('expected 2 curated proposal entries');
if (curation.curated.some((item) => !Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0)) {
  throw new Error('confirmed_chain.steps missing for curated proposal');
}
NODE
```

Expected: PASS and downstream neonspark artifacts explicitly show the `76 -> 2
accepted proposals + 73 backlog` reduction.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/gitnexus-config-files.md gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md
git commit -m "docs(rule-lab): codify gap handoff and proposal lineage contract"
```

## Plan Audit Verdict
audit_scope: 2026-04-12 handoff-closure design clauses DC-01..DC-06, plus legacy multi-draft compatibility semantics
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- real-run downstream artifact verification originally allowed field-presence-only checks; status: fixed
- silent fallback to generic proposal candidates when accepted handoff exists was originally under-specified; status: fixed
- legacy `dsl-draft.json` compatibility warning semantics were originally not trace-mapped; status: fixed
anti_placeholder_checks:
- `assert no placeholder path`: Task 1 now requires failing tests for placeholder run/slice ids and placeholder anchor paths; result: pass
- `assert live mode has tool evidence`: Task 6 now parses real neonspark `candidates.jsonl` and `curation-input.json` semantically; result: pass
- `assert freeze requires non-empty confirmed_chain.steps`: Task 2 and Task 6 now require non-empty closure evidence on generated curation payloads; result: pass
authenticity_checks:
- `assert no generic fallback mask`: Task 1 and Task 6 now fail if generic `candidate-a/candidate-b` or `.primary/.fallback` survives with handoff data; result: pass
- `assert reduction is visible downstream`: Task 3 and Task 6 require accepted/backlog/reject summaries in downstream rule-lab artifacts; result: pass
- `assert multi-candidate does not collapse`: Task 4 requires `dsl-drafts.json` plus compatibility warning semantics; result: pass
approval_decision: pass
