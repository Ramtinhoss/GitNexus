# Gap-Lab Run Chain Refactor Design

Date: 2026-04-12
Repo: GitNexus
Status: Proposed

## 1. Problem Summary

Two days of iterative fixes closed the `gap-lab → rule-lab` handoff layer (DC-01
through DC-07), but two structural gaps remain that prevent the workflow from
being reliably repeatable:

1. **No gap-lab run chain CLI.** The modules `exhaustive-scanner`, `candidate-resolver`,
   `syncvar-source-anchor-recovery`, `missing-edge-verifier`, `coverage-gate`, and
   `parity-gate` exist as independent TypeScript modules with no CLI entry point that
   orchestrates them into the C1a → C1b → C1c → C1d → C2 → C2.6 pipeline. The entire
   discovery/classification phase depends on agents manually calling each module in
   sequence, with no machine-checkable progress or resumable state.

2. **No historical artifact field validation in gap-handoff.** `gap-handoff.ts`
   `loadGapHandoff()` reads `candidates.jsonl` rows and passes `accepted` rows into
   `rule-lab analyze` without validating that required fields (`gap_type`, `gap_subtype`,
   `pattern_id`, `detector_version`) are present, or that `accepted` rows have complete
   `source_anchor` and `target_anchor`. Failures surface late in `curation-input-builder.ts`
   with no field-level diagnostics.

A third structural issue was also identified during design:

3. **`edgeLookup` semantic is wrong.** `missing-edge-verifier.ts` accepts an optional
   `edgeLookup` callback described as checking whether an edge exists in the graph
   database. All `ExhaustiveGapSubtype` patterns (`mirror_synclist_callback`,
   `mirror_syncdictionary_callback`, `mirror_syncvar_hook`) target Mirror framework
   runtime dispatch that is invisible to static analysis — the graph will never contain
   these edges unless an analyze_rule has already been generated and the repo re-indexed.
   Querying the graph for "does this edge exist" is therefore always false for genuine
   gaps, and the graph state is unstable (depends on which rules were active at last
   index time). The correct duplicate-prevention check is against `rules/approved/*.yaml`
   `resource_bindings` entries, which are stable static artifacts.

## 2. Non-Goals

1. Change the `rule-lab` command semantics (`discover/analyze/review-pack/curate/promote`
   remain unchanged).
2. Change the `method_triggers_method` binding model or add new binding kinds.
3. Redesign query-time runtime closure (remains graph-only).
4. Solve `ambiguous_source_anchor` disambiguation automatically — this remains a
   `promotion_backlog` outcome requiring user confirmation.
5. Change the 73-backlog result for neonspark. That count is semantically correct:
   most SyncVar fields are written by Mirror's internal serialization mechanism with
   no user-code write site, so `collectSourceAnchors` returns empty and the candidate
   falls into `missing_runtime_source_anchor`. This is not a bug.

## 3. Design

### 3.1 Unit 1 — `gap-lab run` CLI command

**New files:**
- `gitnexus/src/gap-lab/run.ts` — pipeline orchestrator
- `gitnexus/src/cli/gap-lab.ts` — CLI command registration
- `gitnexus/src/gap-lab/run.test.ts` — integration tests

**Modified files:**
- `gitnexus/src/cli/index.ts` — register `gap-lab` command group

#### Command signature

```bash
gitnexus gap-lab run \
  --repo-path <path> \
  --run-id <id> \
  --slice-id <id> \
  --gap-subtype <subtype>
```

Optional flags:
- `--scope-path <path>` — narrows lexical scan scope (maps to `LexicalScanInput.scopePath`)
- `--timeout-ms <n>` — lexical scan timeout (default: 15000)

#### Pipeline in `run.ts`

```
1. ensureBalancedSlimArtifacts()          ← create/clean artifact files
2. scanLexicalUniverse()                  ← C1a: rg-based repo-wide scan
3. resolveLexicalCandidates()             ← C1b+C1c+C1d: scope classify + anchor recovery
4. buildRuleArtifactLookup()              ← load rules/approved/*.yaml bindings (see 3.3)
5. verifyMissingEdges({ edgeLookup })     ← C2: classify accepted/backlog/rejected
6. writeCandidatesJsonl()                 ← persist candidates.jsonl
7. updateSliceJson()                      ← update slice.json with coverage_gate fields
8. enforceCoverageGate()                  ← C2.6: block if processed < user_raw
```

Step 4 replaces the graph-based `edgeLookup` with a rule-artifact-based lookup
(see Section 3.3).

#### Output contract

After `gap-lab run` completes:

- `.gitnexus/gap-lab/runs/<run_id>/slices/<slice_id>.candidates.jsonl` — one row per
  candidate, all fields present including `gap_type`, `gap_subtype`, `pattern_id`,
  `detector_version`, `status`, `reasonCode` (when applicable), `source_anchor`,
  `target_anchor` (when resolved)
- `.gitnexus/gap-lab/runs/<run_id>/slices/<slice_id>.json` — updated with
  `coverage_gate.user_raw_matches`, `coverage_gate.processed_user_matches`,
  `coverage_gate.status`, `classification_buckets`

Exit codes:
- `0` — completed, coverage gate passed
- `1` — completed, coverage gate blocked (reason written to slice.json)
- `2` — hard error (invalid args, file I/O failure, rg timeout)

#### Candidate row schema (written to candidates.jsonl)

Every row must include:

```jsonc
{
  "candidate_id": "<sha1-12>",
  "gap_type": "event_delegate_gap",        // ← derived from gapSubtype prefix
  "gap_subtype": "mirror_syncvar_hook",
  "pattern_id": "event_delegate.mirror_syncvar_hook.v1",
  "detector_version": "1.0.0",
  "file": "Assets/...",
  "line": 42,
  "scopeClass": "user_code",
  "status": "accepted | promotion_backlog | rejected",
  "reasonCode": "...",                     // present when status != accepted
  "source_anchor": { ... },               // present when accepted
  "target_anchor": { ... }                // present when accepted
}
```

`gap_type` is derived from `gapSubtype` by the `run.ts` orchestrator using a
static mapping (e.g. `mirror_syncvar_hook` → `event_delegate_gap`). This mapping
lives in `run.ts`, not in `pattern-library.ts`, to keep the pattern library
focused on lexical patterns only.

### 3.2 Unit 2 — `gap-handoff.ts` field validation

**Modified file:** `gitnexus/src/rule-lab/gap-handoff.ts`

Add `assertCandidateSchema(rows: GapCandidateRow[]): void` called after
`assertNoPlaceholders` in `loadGapHandoff`.

Validation rules:

```
For every row in candidates.jsonl:
  - gap_type must be a non-empty string
  - gap_subtype must be a non-empty string
  - pattern_id must be a non-empty string
  - detector_version must be a non-empty string

For every row where status === 'accepted':
  - source_anchor.file must be non-empty and not a placeholder
  - source_anchor.symbol must be non-empty and not a placeholder
  - target_anchor.file must be non-empty and not a placeholder
  - target_anchor.symbol must be non-empty and not a placeholder
```

Error format: throw with field path and candidate_id, e.g.:
```
gap-handoff schema error: candidate abc123 missing gap_type
gap-handoff schema error: accepted candidate def456 has empty source_anchor.symbol
```

This makes failures visible at the handoff boundary rather than inside
`curation-input-builder.ts`.

### 3.3 Unit 3 — Replace `edgeLookup` with `ruleArtifactLookup`

**Modified file:** `gitnexus/src/gap-lab/missing-edge-verifier.ts`

Rename `edgeLookup` parameter to `coverageCheck` with updated type and doc comment:

```typescript
export interface VerifyMissingEdgesInput {
  candidates: ResolvedCandidate[];
  // Returns true if an existing approved rule already covers this source→target pair.
  // Check rules/approved/*.yaml resource_bindings, not the graph database.
  // Graph state is unstable; rule artifacts are stable static files.
  coverageCheck?: (input: CoverageLookupInput) => Promise<boolean>;
}
```

**New file:** `gitnexus/src/gap-lab/rule-coverage-lookup.ts`

```typescript
export async function buildRuleArtifactCoverageCheck(repoPath: string):
  Promise<(input: CoverageLookupInput) => Promise<boolean>>
```

Implementation:
1. Glob `rules/approved/*.yaml` under `repoPath/.gitnexus/`
2. Parse each YAML file's `resource_bindings` array
3. Build an in-memory set of `source_class_pattern:source_method:target_class_pattern:target_method` keys
4. Return a lookup function that checks the set

Matching logic: for a candidate with `source_anchor.symbol = "NetPlayer.InitPowerUp"` and
`target_anchor.symbol = "NetPlayer.PackItemUpChanges"`, extract class and method names and
check against `source_class_pattern + source_method + target_class_pattern + target_method`.
Use exact string match (no regex expansion at this stage).

Only `accepted` candidates (those with both `source_anchor` and `target_anchor`) trigger
this check. `promotion_backlog` and `rejected` candidates skip it.

### 3.4 SKILL.md update

**Modified file:** `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`

Replace the C1/C2 manual module invocation description with:

```bash
gitnexus gap-lab run \
  --repo-path "$REPO_PATH" \
  --run-id "$RUN_ID" \
  --slice-id "$SLICE_ID" \
  --gap-subtype "$GAP_SUBTYPE"
```

Add note: "Exit code 1 means coverage gate blocked — read `slice.json.coverage_gate`
for reason before proceeding to C3."

## 4. Invariants

- `gap-lab run` is idempotent: re-running overwrites `candidates.jsonl` and updates
  `slice.json`. It does not append.
- `gap-lab run` does not touch `rules/` artifacts. It only writes to `gap-lab/runs/`.
- `gap-handoff.ts` schema validation is fail-fast: any missing required field throws
  before any rule-lab artifact is written.
- `ruleArtifactLookup` is read-only: it never writes to `rules/approved/`.
- `missing-edge-verifier.ts` internal logic for `mirror_syncvar_hook` is unchanged:
  `accepted` requires `sourceAnchor && targetAnchor`; otherwise `promotion_backlog`.

## 5. Test Plan

### Unit 1 tests (`run.test.ts`)

1. Full pipeline with a synthetic `mirror_syncvar_hook` slice: assert `candidates.jsonl`
   rows have all required schema fields including `gap_type`.
2. Coverage gate blocks when `processed_user_matches < user_raw_matches`.
3. Coverage gate passes when all user-code matches are processed.
4. `ruleArtifactLookup` correctly marks a candidate as already-covered when a matching
   `resource_bindings` entry exists in `rules/approved/`.

### Unit 2 tests (extend `gap-handoff.ts` test)

1. `loadGapHandoff` throws with field path when an `accepted` row is missing `source_anchor.symbol`.
2. `loadGapHandoff` throws when any row is missing `gap_type`.
3. `loadGapHandoff` passes when all required fields are present.

### Unit 3 tests (`rule-coverage-lookup.test.ts`)

1. Returns `true` for a candidate whose `source_class:source_method:target_class:target_method`
   matches an entry in `rules/approved/*.yaml`.
2. Returns `false` when no matching entry exists.
3. Returns `false` when `rules/approved/` directory does not exist (no rules yet).
