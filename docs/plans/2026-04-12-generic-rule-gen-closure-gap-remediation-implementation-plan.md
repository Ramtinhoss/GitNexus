# Generic Rule-Gen Closure Gap Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining generic rule-gen workflow gaps so repo-wide exhaustive gap-lab accounting can flow into auditable downstream rule-lab artifacts without hardcoded binding assumptions, aggregate semantic loss, or proposal-level evidence drift.

**Architecture:** Treat current `gap-lab` exhaustive discovery and coverage gate as already-correct upstream truth, then harden the `gap-lab -> rule-lab` handoff layer. The remediation focuses on five remaining closure defects: generic binding-kind propagation, aggregate proposal fidelity, proposal-specific closure evidence, fail-closed binding generation, and candidate-derived downstream audit summaries. The final proof must include both synthetic aggregate-mode tests and a real neonspark run verification.

**Tech Stack:** TypeScript CLI modules, Vitest unit/integration tests, JSON/JSONL run artifacts, Markdown contracts/docs, local CLI real-run verification on neonspark.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | Added integration coverage for handoff binding kind + candidate-derived summary, then implemented `gap-handoff` row-derived backlog/reject reducers and handoff/default binding kind propagation in analyze candidates.
Task 2 | completed | Added aggregate multi-anchor integration assertions; aggregate draft identity now derives from all accepted anchors and curation emits merged bindings for every accepted source id.
Task 3 | completed | Added proposal-specific chain/review semantics integration test; analyze now writes proposal closure/claims metadata and curation filters `confirmed_chain.steps` by proposal anchor evidence (fails if mixed chain cannot map).
Task 4 | completed | Added fail-closed tests for unresolved bindings; curation-input generation now throws `binding_unresolved` on unresolved symbols and curate/promote reject `UnknownClass`/`UnknownMethod` placeholders.
Task 5 | completed | Expanded `gap-lab-rule-lab-handoff` integration suite to cover generic non-method binding, per-anchor backlog semantics, aggregate multi-anchor preservation, and unresolved-binding fail-closed path.
Task 6 | completed | Re-ran real neonspark slice verification (`gaplab-20260411-104710/event_delegate_gap.mirror_syncvar_hook`) after parity recovery; `rule-lab analyze`, `rule-lab review-pack`, and semantic artifact assertions all passed (`REAL_RUN_ASSERTIONS_OK`), confirming `user_raw_matches=76`, `promotion_backlog_count=73`, lineage integrity, and no generic/unknown fallback leakage.

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Downstream proposal generation must consume actual handoff binding kinds instead of hardcoding `method_triggers_method` | critical | Task 1, Task 5 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts -t "binding kind handoff|generic subtype"` | `rules/lab/.../candidates.jsonl:binding_kind`, `curation-input.json:curated[].resource_bindings[].kind` | proposal candidates always emit `method_triggers_method` even when handoff/default binding kind differs
DC-02 `aggregate_single_rule` must preserve all accepted anchors, not just the first accepted row | critical | Task 2, Task 5 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "aggregate preserves all accepted anchors"` | `rules/lab/.../candidates.jsonl:source_gap_candidate_ids`, `curation-input.json:curated[].resource_bindings` | aggregate proposal drops secondary accepted anchors or derives rule/binding from only the first row
DC-03 Proposal-level closure evidence must remain proposal-specific; slice-wide chain copy is not sufficient | critical | Task 3, Task 5, Task 6 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/curate.test.ts -t "proposal-specific confirmed chain"` | `curation-input.json:curated[].confirmed_chain.steps`, `curated.json:curated[].confirmed_chain.steps` | two different proposals carry the same mixed slice-level chain or unrelated anchors
DC-04 Unresolved proposal bindings must fail closed; no `UnknownClass` / `UnknownMethod` fallback may reach promotable artifacts | critical | Task 4, Task 5 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "rejects unknown binding fallback"` | `curation-input.json:curated[].resource_bindings`, `curated.json`, `approved/*.yaml` | fallback placeholder binding values survive into curated or promoted rule artifacts
DC-05 Downstream `source_gap_handoff` summaries must be candidate-derived, not copied from stale summary buckets | critical | Task 1, Task 5, Task 6 | `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "candidate-derived downstream handoff summary"` | `rules/lab/.../slice.json:source_gap_handoff.reject_buckets`, `promotion_backlog_count` | downstream summary disagrees with `gap-lab slice.candidates.jsonl` counts or survives stale summary drift
DC-06 Review artifacts must expose meaningful proposal semantics, not only topology skeletons | critical | Task 3, Task 5, Task 6 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts -t "proposal claims|failure map|review semantics"` | `review-cards.md:guarantees/non_guarantees/failure_map/source_gap_candidate_ids` | review-pack renders empty semantic fields or cannot explain proposal reduction
DC-07 Real neonspark verification must prove downstream artifacts reflect the repaired `76 -> accepted + backlog` semantics without generic fallback leakage | critical | Task 6 | `REPO_PATH="/Volumes/Shuttle/projects/neonspark"; RUN_ID="gaplab-20260411-104710"; SLICE_ID="event_delegate_gap.mirror_syncvar_hook"; node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node -e "const fs=require('fs');const path=require('path');const base=path.join(process.env.REPO_PATH,'.gitnexus','rules','lab','runs',process.env.RUN_ID,'slices',process.env.SLICE_ID);const rows=fs.readFileSync(path.join(base,'candidates.jsonl'),'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);if(rows.some(r=>/candidate-a|candidate-b/.test(String(r.title||''))||/\\.primary$|\\.fallback$/.test(String(r.rule_hint||'')))) throw new Error('generic fallback present');const slice=JSON.parse(fs.readFileSync(path.join(base,'slice.json'),'utf8'));if(slice.source_gap_handoff.user_raw_matches!==76) throw new Error('unexpected user_raw_matches');if(slice.source_gap_handoff.promotion_backlog_count!==73) throw new Error('unexpected backlog count');"` | `/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/lab/runs/gaplab-20260411-104710/slices/event_delegate_gap.mirror_syncvar_hook/{slice.json,candidates.jsonl,review-cards.md,curation-input.json}` | real-run downstream artifacts still leak generic fallback, lose lineage, or disagree with repaired gap-lab truth

## Authenticity Assertions

- `assert no placeholder path`: proposal handoff loaders and generated curation/promotion artifacts must reject placeholder ids and placeholder anchor/binding values.
- `assert live mode has tool evidence`: the real-run verification must parse downstream `candidates.jsonl`, `slice.json`, `review-cards.md`, and `curation-input.json` semantically rather than grepping field names only.
- `assert freeze requires non-empty confirmed_chain.steps`: no curated or promoted proposal may proceed with empty proposal-specific closure evidence.
- `assert no hardcoded binding kind`: downstream proposal binding kind must follow handoff/default binding kinds and fail when no valid binding mapping exists.
- `assert aggregate mode preserves all accepted anchors`: aggregate proposal tests must fail if only the first accepted row survives into downstream artifacts.

### Task 1: Generalize Downstream Binding-Kind Propagation and Candidate-Derived Handoff Summary

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/gap-handoff.ts`
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

**Step 1: Write the failing tests**

Add analyze/integration tests that build a temp run where:

1. `gap-lab slice.json` declares a non-`method_triggers_method` `default_binding_kinds` value (for example `method_triggers_scene_load`);
2. `gap-lab slice.candidates.jsonl` is the truth source for `promotion_backlog` and reject buckets;
3. `gap-lab slice.json.classification_buckets` is deliberately stale.

Assert:

```ts
expect(result.candidates[0].binding_kind).toBe('method_triggers_scene_load');
expect(result.slice.source_gap_handoff.promotion_backlog_count).toBe(3);
expect(result.slice.source_gap_handoff.reject_buckets.third_party_excluded).toBe(4);
expect(result.candidates[0].binding_kind).not.toBe('method_triggers_method');
```

Add one negative test that fails when placeholder source/target anchor paths are present.

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "binding kind handoff|candidate-derived downstream handoff summary|placeholder"`

Expected: FAIL because `analyze.ts` currently hardcodes `method_triggers_method`
and `gap-handoff.ts` copies backlog/reject summary from `classification_buckets`.

**Step 3: Write minimal implementation**

Implement:

1. `gap-handoff.ts` candidate-derived reducers for:
   - `promotion_backlog_count`
   - reject bucket counts
   - accepted candidate ids
2. handoff binding-kind selection using `default_binding_kinds` or accepted-row
   metadata instead of hardcoded `method_triggers_method`;
3. placeholder path/id rejection in the handoff loader and proposal builder.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "binding kind handoff|candidate-derived downstream handoff summary|placeholder"`

Expected: PASS with binding kind following handoff truth and downstream summary
recomputed from candidate rows.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/gap-handoff.ts gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/types.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts
git commit -m "fix(rule-lab): derive binding kinds and handoff summary from gap truth"
```

### Task 2: Preserve Full Aggregate Proposal Semantics

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/curation-input-builder.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

**Step 1: Write the failing tests**

Add tests for `aggregate_single_rule` where two accepted gap candidates must
collapse to one proposal candidate but still preserve both anchors.

Assert:

```ts
expect(result.candidates).toHaveLength(1);
expect(result.candidates[0].source_gap_candidate_ids).toEqual(['accepted-a', 'accepted-b']);
expect(curation.curated[0].resource_bindings).toHaveLength(2);
expect(curation.curated[0].claims.guarantees.join(' ')).toMatch(/accepted-a/);
expect(curation.curated[0].claims.guarantees.join(' ')).toMatch(/accepted-b/);
```

Add a negative test that fails if only the first accepted row contributes to the
draft rule id, binding set, or guarantees text.

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "aggregate preserves all accepted anchors"`

Expected: FAIL because aggregate mode currently uses the first accepted row for
rule stem and binding derivation.

**Step 3: Write minimal implementation**

Implement:

1. aggregate proposal identity derived from all accepted anchors, not the first;
2. aggregate curation input that emits one binding per accepted anchor;
3. aggregate guarantees/non-guarantees text that lists all accepted source ids.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "aggregate preserves all accepted anchors"`

Expected: PASS with full multi-anchor fidelity preserved into downstream
proposal and curation artifacts.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/curation-input-builder.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts
git commit -m "fix(rule-lab): preserve all accepted anchors in aggregate mode"
```

### Task 3: Make Proposal-Level Evidence and Review Semantics Real

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/gap-handoff.ts`
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/types.ts`
- Modify: `gitnexus/src/rule-lab/curation-input-builder.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`

**Step 1: Write the failing tests**

Add tests asserting:

1. two different per-anchor proposals do not receive the same mixed
   `confirmed_chain.steps`;
2. `review-pack` cards contain non-empty `guarantees`, `non_guarantees`, and
   `failure_map`;
3. review cards still include lineage and backlog summary.

Example:

```ts
expect(curation.curated[0].confirmed_chain.steps).not.toEqual(curation.curated[1].confirmed_chain.steps);
expect(reviewPack).toMatch(/guarantees: .*accepted-a/);
expect(reviewPack).toMatch(/non_guarantees: .*backlog/);
expect(reviewPack).toMatch(/failure_map: .*rule_matched_but_evidence_missing/);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/curate.test.ts -t "proposal-specific confirmed chain|proposal claims|failure map"`

Expected: FAIL because `buildConfirmedChain()` currently copies slice-wide
closure evidence and review-pack reads empty semantic fields from proposal
candidates.

**Step 3: Write minimal implementation**

Implement:

1. a deterministic proposal-evidence contract before any extraction logic:
   - each accepted gap candidate must carry a stable proposal evidence key derived from its accepted anchor pair or accepted candidate id;
   - handoff/analyze output must persist proposal-scoped evidence references, not only slice-wide `confirmed_chain_steps`;
   - when multiple slice-level chain steps exist, proposal extraction may keep only steps whose source/target anchors match the proposal evidence key; otherwise the proposal must fail closed instead of heuristically borrowing unrelated steps;
2. proposal-specific chain extraction using those persisted proposal evidence references;
3. proposal semantic fields (`claims`, `closure`) populated before review-pack;
4. review-pack rendering of those non-empty proposal semantics.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/curate.test.ts -t "proposal-specific confirmed chain|proposal claims|failure map"`

Expected: PASS with distinct proposal evidence and non-empty review semantics.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/curation-input-builder.ts gitnexus/src/rule-lab/review-pack.ts gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/curate.test.ts
git commit -m "feat(rule-lab): add proposal-specific evidence and review semantics"
```

### Task 4: Fail Closed on Unknown Binding Fallbacks

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/curation-input-builder.ts`
- Modify: `gitnexus/src/rule-lab/curate.ts`
- Modify: `gitnexus/src/rule-lab/promote.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`

**Step 1: Write the failing tests**

Add tests where proposal binding derivation cannot resolve class/method names.

Assert:

```ts
await expect(buildAnalyzeOutputForFixture('unresolved-binding')).rejects.toThrow(/binding_unresolved/i);
await expect(curateRuleLabSlice(...)).rejects.toThrow(/UnknownClass|UnknownMethod/i);
await expect(promoteCuratedRules(...)).rejects.toThrow(/binding unresolved|UnknownClass/i);
```

Add a negative assertion that no `UnknownClass`, `UnknownMethod`, or similar
placeholder binding values appear in any persisted artifact.

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "rejects unknown binding fallback|binding_unresolved"`

Expected: FAIL because `analyze`/`curation-input-builder.ts` currently allows
fallback bindings with `UnknownClass` / `UnknownMethod` instead of failing
closed at the first unresolved binding boundary.

**Step 3: Write minimal implementation**

Implement:

1. explicit `binding_unresolved` failure path in curation-input generation;
2. curate-time and promote-time guards against unknown placeholder binding
   values;
3. no fallback binding emission when resolution fails.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts -t "rejects unknown binding fallback|binding_unresolved"`

Expected: PASS with unresolved proposal bindings failing closed before curated or
promoted artifacts are written.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/curation-input-builder.ts gitnexus/src/rule-lab/curate.ts gitnexus/src/rule-lab/promote.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/rule-lab/promote.test.ts
git commit -m "fix(rule-lab): fail closed on unresolved proposal bindings"
```

### Task 5: Add End-to-End Closure Tests for Generic and Aggregate Modes

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/src/rule-lab/review-pack.test.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`
- Modify: `gitnexus/src/cli/rule-lab.test.ts`

**Step 1: Write the failing integration tests**

Expand the integration fixture set to cover:

1. generic subtype with non-method binding kind;
2. per-anchor mode with backlog retention;
3. aggregate mode with two accepted anchors;
4. unresolved binding fail-closed path.

Assert full chain consistency:

```ts
expect(ruleLabCandidates.every((row) => row.source_gap_candidate_ids.length > 0)).toBe(true);
expect(reviewPack).toMatch(/accepted_count: 2/);
expect(curation.curated.every((item) => item.confirmed_chain.steps.length > 0)).toBe(true);
expect(promotedRuleYaml).not.toMatch(/UnknownClass|UnknownMethod/);
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

Expected: FAIL because the current code does not yet preserve aggregate and
generic binding semantics end-to-end.

**Step 3: Write minimal implementation**

Implement any remaining glue so the entire rule-gen chain satisfies the new
generic and aggregate closure contract.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

Expected: PASS with per-anchor and aggregate closure preserved across analyze,
review-pack, curate, and promote.

**Step 5: Commit**

```bash
git add gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/review-pack.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/cli/rule-lab.test.ts
git commit -m "test(rule-lab): cover remaining generic and aggregate closure gaps"
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
- Modify: `gitnexus/test/integration/rule-lab-contracts.test.ts`

**Step 1: Write the failing docs/real-run checks**

Add docs/contract tests that require:

1. binding-kind propagation from handoff is documented;
2. aggregate-mode multi-anchor preservation is documented;
3. proposal-specific closure evidence and fail-closed binding semantics are
   documented.

Prepare the real-run verification command set:

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const base = path.join('/Volumes/Shuttle/projects/neonspark', '.gitnexus', 'rules', 'lab', 'runs', 'gaplab-20260411-104710', 'slices', 'event_delegate_gap.mirror_syncvar_hook');
const slice = JSON.parse(fs.readFileSync(path.join(base, 'slice.json'), 'utf8'));
const rows = fs.readFileSync(path.join(base, 'candidates.jsonl'), 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);
const curation = JSON.parse(fs.readFileSync(path.join(base, 'curation-input.json'), 'utf8'));
if (rows.some(r => r.binding_kind !== 'method_triggers_method')) throw new Error('unexpected binding kind for syncvar_hook real slice');
if (slice.source_gap_handoff.aggregation_mode === 'per_anchor_rules' && rows.some(r => !Array.isArray(r.source_gap_candidate_ids) || r.source_gap_candidate_ids.length !== 1)) throw new Error('per-anchor lineage missing');
if (slice.source_gap_handoff.aggregation_mode === 'aggregate_single_rule' && rows.some(r => !Array.isArray(r.source_gap_candidate_ids) || r.source_gap_candidate_ids.length < 2)) throw new Error('aggregate lineage missing');
if (slice.source_gap_handoff.user_raw_matches !== 76) throw new Error('unexpected user_raw_matches');
if (slice.source_gap_handoff.promotion_backlog_count !== 73) throw new Error('unexpected backlog count');
if (curation.curated.some(item => !Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0)) throw new Error('missing confirmed_chain.steps');
if (curation.curated.some(item => JSON.stringify(item.resource_bindings).match(/UnknownClass|UnknownMethod/))) throw new Error('unknown fallback binding leaked');
NODE
```

**Step 2: Run checks to verify they fail**

Run: `npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "binding kind propagation|aggregate anchors|proposal-specific evidence|fail-closed binding"`

Expected: FAIL until contracts and docs are updated to match the new closure
requirements.

**Step 3: Write minimal implementation**

Update docs/contracts/checklists so they describe the final as-built workflow
instead of only the initial handoff closure.

**Step 4: Run test to verify it passes**

Run:

```bash
npx --prefix gitnexus vitest run gitnexus/test/integration/rule-lab-contracts.test.ts -t "binding kind propagation|aggregate anchors|proposal-specific evidence|fail-closed binding"
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const base = path.join('/Volumes/Shuttle/projects/neonspark', '.gitnexus', 'rules', 'lab', 'runs', 'gaplab-20260411-104710', 'slices', 'event_delegate_gap.mirror_syncvar_hook');
const slice = JSON.parse(fs.readFileSync(path.join(base, 'slice.json'), 'utf8'));
const rows = fs.readFileSync(path.join(base, 'candidates.jsonl'), 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);
const review = fs.readFileSync(path.join(base, 'review-cards.md'), 'utf8');
const curation = JSON.parse(fs.readFileSync(path.join(base, 'curation-input.json'), 'utf8'));
if (rows.some(r => /candidate-a|candidate-b/.test(String(r.title || '')) || /\\.primary$|\\.fallback$/.test(String(r.rule_hint || '')))) throw new Error('generic fallback leaked');
if (slice.source_gap_handoff.user_raw_matches !== 76 || slice.source_gap_handoff.promotion_backlog_count !== 73) throw new Error('source_gap_handoff drifted');
if (slice.source_gap_handoff.aggregation_mode === 'per_anchor_rules' && rows.some(r => !Array.isArray(r.source_gap_candidate_ids) || r.source_gap_candidate_ids.length !== 1)) throw new Error('per-anchor lineage missing');
if (slice.source_gap_handoff.aggregation_mode === 'aggregate_single_rule' && rows.some(r => !Array.isArray(r.source_gap_candidate_ids) || r.source_gap_candidate_ids.length < 2)) throw new Error('aggregate lineage missing');
if (!/accepted_count: 2/.test(review) || !/backlog_count: 73/.test(review)) throw new Error('review-pack summary missing');
if (curation.curated.some(item => !Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0)) throw new Error('proposal closure evidence missing');
if (curation.curated.some(item => JSON.stringify(item.resource_bindings).match(/UnknownClass|UnknownMethod/))) throw new Error('unknown fallback binding leaked');
NODE
```

Expected: PASS and the real slice downstream artifacts remain semantically
aligned with the repaired upstream gap truth.

**Step 5: Commit**

```bash
git add docs/unity-runtime-process-source-of-truth.md docs/gitnexus-config-files.md gitnexus/skills/gitnexus-unity-rule-gen.md gitnexus/skills/_shared/unity-gap-lab-contract.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md .agents/skills/gitnexus/_shared/unity-gap-lab-contract.md gitnexus/test/integration/rule-lab-contracts.test.ts
git commit -m "docs(rule-lab): codify remaining generic closure semantics"
```

## Plan Audit Verdict
audit_scope: current-source closure gaps against the user intent "generic subtype -> exhaustive user_code accounting -> backlog retention -> auditable downstream rule-lab artifacts", plus design clauses DC-01..DC-07
review_rounds:
- round_1 reviewer: independent subagent
  verdict: pass_with_minor_issues
  fixes_applied:
  - Task 3 now defines a deterministic proposal-evidence contract instead of heuristic chain extraction
  - Task 4 test loop now includes `analyze.test` so unresolved binding failures are verified at the earliest boundary
  - Task 1 wording corrected so `default_binding_kinds` is sourced from `gap-lab slice.json`
  - Task 6 real-run assertions now branch by `aggregation_mode` instead of assuming per-anchor only
- round_2 reviewer: independent subagent
  verdict: pass_with_minor_issues
  fixes_applied:
  - Task 3 file list now includes `gap-handoff.ts`, `analyze.ts`, and `types.ts` to match the required proposal-evidence persistence work
finding_summary: P0=0, P1=0 (after plan revision), P2=0 (after plan revision)
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- `assert no placeholder path`: Task 1 and Task 4 require failing tests for placeholder run/slice ids, placeholder anchor paths, and unknown placeholder bindings; result: pass
- `assert live mode has tool evidence`: Task 6 parses real neonspark downstream artifacts semantically rather than relying on grep-only checks; result: pass
- `assert freeze requires non-empty confirmed_chain.steps`: Task 3, Task 4, and Task 6 require non-empty proposal-specific closure evidence before curated/promotion flow continues; result: pass
authenticity_checks:
- `assert no hardcoded binding kind`: Task 1 forces non-method binding fixtures and rejects hardcoded fallback; result: pass
- `assert aggregate mode preserves all accepted anchors`: Task 2 and Task 5 require multi-anchor aggregate fidelity end-to-end; result: pass
- `assert reduction remains visible downstream`: Task 3 and Task 6 require review-pack and source-gap-handoff summaries to expose accepted/backlog/reject semantics; result: pass
approval_decision: pass
