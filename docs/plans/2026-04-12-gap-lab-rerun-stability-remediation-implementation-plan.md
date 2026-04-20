# Gap-Lab Rerun Stability Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `gitnexus-unity-rule-gen` rerun path deterministic and auditable by fixing stale rerun state, partial artifacts, aggregate rule id overflow, degraded promotion metadata, family/catalog drift, and CLI/doc contract drift.

**Architecture:** Repair the workflow in three layers. First, harden rerun state management so a slice can be cleanly rewound and parity-checked from `phase_b_ready_for_c1` without manual artifact surgery. Second, preserve semantic fidelity across `gap-lab -> rule-lab -> promote -> analyze` by making artifact writes atomic, bounding aggregate ids, carrying strong `match` metadata forward, serializing full `method_triggers_method` bindings, and persisting the intended rule family. Third, lock the operator contract with CLI/doc regressions and a real neonspark verification that proves fresh reruns create actual synthetic `CALLS` edges.

**Tech Stack:** TypeScript CLI modules, Vitest unit/integration tests, JSON/JSONL run artifacts, YAML rule serialization, GitNexus CLI, Cypher verification against `neonspark-core`.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
<!-- executing-plans appends one row per task as execution advances -->

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 Clean rerun must rewind slice state and scrub stale downstream artifacts before C1 | critical | Task 1, Task 7 | `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/parity-gate.test.ts gitnexus/src/cli/gap-lab.test.ts -t "rewind stale rerun state|clean rerun|placeholder"` | `.gitnexus/gap-lab/runs/<run>/progress.json:checkpoint_phase`, `.gitnexus/rules/lab/runs/<run>/slices/<slice>/slice.json` | stale `rules/lab` artifact survives reset, placeholder ids are accepted, or `checkpoint_phase` remains past `phase_b_ready_for_c1`
DC-02 Interrupted `gap-lab run` must not leave ambiguous zero-byte slice artifacts | critical | Task 2, Task 7 | `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/run.test.ts -t "atomic candidates write|incomplete artifact"` | `.gitnexus/gap-lab/runs/<run>/slices/<slice>.candidates.jsonl:size`, `.gitnexus/gap-lab/runs/<run>/slices/<slice>.json:status` | zero-byte `candidates.jsonl` is treated as valid C1 output or no incomplete marker is recorded
DC-03 Aggregate proposal ids must remain deterministic and filesystem-safe | critical | Task 3 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts -t "aggregate id bounded|enametoolong"` | `rules/lab/.../candidates.jsonl:draft_rule_id`, `.gitnexus/rules/approved/<rule_id>.yaml` | generated `rule_id` exceeds path limits or changes nondeterministically between runs
DC-04 Auto-generated curation/promote metadata must preserve proposal semantics instead of degrading to generic `event_delegate/method/slice-id` match data | critical | Task 4, Task 7 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts -t "strong match metadata|mirror syncvar hook match"` | `rules/lab/.../curation-input.json:curated[].match`, `.gitnexus/rules/approved/*.yaml:match` | promoted rule falls back to generic `trigger_tokens`, lowercase `method`, or `module_scope=<slice_id>`
DC-05 Promoted `method_triggers_method` rules must serialize full binding fields, reject empty closure evidence, and survive recompile as `analyze_rules` | critical | Task 5, Task 7 | `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/promote.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/cli/rule-lab.test.ts -t "serialize full method bindings|default analyze_rules family|empty confirmed_chain"` | `.gitnexus/rules/approved/*.yaml:resource_bindings`, `.gitnexus/rules/catalog.json:rules[].family`, `.gitnexus/rules/compiled/analyze_rules.v2.json:rules[].resource_bindings`, `rules/lab/.../curated.json:curated[].confirmed_chain.steps` | YAML omits source/target binding fields, empty `confirmed_chain.steps` reaches promote, catalog omits family, or recompile drops the rule from `analyze_rules`
DC-06 Operator docs and generated skills must use the real `gitnexus analyze [path]` contract, not `--repo-path` | critical | Task 6 | `npx --prefix gitnexus vitest run gitnexus/src/cli/analyze.test.ts gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "analyze path syntax|cli contract drift"` | `README.md:analyze`, `docs/gap-lab-rule-lab-architecture.md:analyze`, `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` | docs still instruct `gitnexus analyze --repo-path ...` for the local CLI
DC-07 Real neonspark rerun must produce fresh artifacts and observable synthetic edges after promote + analyze | critical | Task 7 | `REPO_PATH="/Volumes/Shuttle/projects/neonspark" RUN_ID="gaplab-20260411-104710" SLICE_ID="event_delegate_gap.mirror_syncvar_hook" node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js gap-lab reset-slice --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --to phase_b_ready_for_c1 && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js gap-lab run --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --gap-subtype mirror_syncvar_hook && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js rule-lab promote --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze -f "$REPO_PATH" && node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js cypher -r neonspark-core \"MATCH (s:Method)-[r:CodeRelation {type:'CALLS'}]->(t:Method) WHERE r.reason = 'unity-rule-method-bridge:unity.event.mirror-syncvar-hook.v1' RETURN count(*) AS cnt\"` | `/Volumes/Shuttle/projects/neonspark/.gitnexus/gap-lab/runs/<run>/progress.json`, `/Volumes/Shuttle/projects/neonspark/.gitnexus/rules/approved/unity.event.mirror-syncvar-hook.v1.yaml`, `neonspark-core graph: CALLS.reason` | rerun leaves stale downstream artifacts, approved YAML regresses, or Cypher count is `0`

## Authenticity Assertions

- `assert no placeholder path`: rerun reset and proposal id tests must reject placeholder run/slice ids and must not emit `<slice_id>` or other placeholder tokens into artifact paths, rule ids, or YAML.
- `assert live mode has tool evidence`: the neonspark verification must use real CLI commands plus Cypher edge counts; file-existence checks alone do not satisfy closure.
- `assert freeze requires non-empty confirmed_chain.steps`: promotion fidelity tests must fail if `curation-input.json` or `curated.json` reaches promote with empty `confirmed_chain.steps`.
- `assert atomic artifact audit`: interrupted-run tests must prove an empty temp or final file is surfaced as incomplete state, not silently accepted as a valid C1 result.
- `assert semantic match fidelity`: strong-match tests must compare meaningful values such as `trigger_tokens`, `symbol_kind`, `module_scope`, and binding source/target fields rather than only checking field presence.

## Skill References

- `@superpowers:executing-plans`
- `@superpowers:verification-before-completion`
- `@gitnexus-unity-rule-gen`
- `@gitnexus-debugging`

### Task 1: Add Explicit Slice Rewind and Parity Freshness

**Files:**
- Create: `gitnexus/src/gap-lab/parity-gate.test.ts`
- Modify: `gitnexus/src/gap-lab/parity-gate.ts`
- Modify: `gitnexus/src/cli/gap-lab.ts`
- Modify: `gitnexus/src/cli/gap-lab.test.ts`
- Modify: `docs/gitnexus-config-files.md`

**Step 1: Write the failing tests**

```ts
it('rewinds stale rerun state to phase_b_ready_for_c1 and deletes downstream rule-lab slice artifacts', async () => {
  const result = await resetGapLabSlice({
    repoPath,
    runId: 'gaplab-20260411-104710',
    sliceId: 'event_delegate_gap.mirror_syncvar_hook',
    to: 'phase_b_ready_for_c1',
  });
  expect(result.progress.checkpoint_phase).toBe('phase_b_ready_for_c1');
  expect(result.cleanedRuleLabFiles).toContain('slice.json');
});

it('blocks analyze when rules/lab artifact generation does not match the current gap-lab rerun generation', async () => {
  const parity = await enforceRunArtifactParity({ repoPath, runId: 'run-x', sliceId: 'slice-a' });
  expect(parity.blocked).toBe(true);
  expect(parity.reason).toBe('parity_generation_mismatch');
});

it('rejects placeholder run or slice ids when resetting rerun state', async () => {
  await expect(resetGapLabSlice({
    repoPath,
    runId: '<run_id>',
    sliceId: '<slice_id>',
    to: 'phase_b_ready_for_c1',
  })).rejects.toThrow(/placeholder|run\/slice id/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/parity-gate.test.ts gitnexus/src/cli/gap-lab.test.ts -t "rewinds stale rerun state|generation mismatch|placeholder"`

Expected: FAIL because no reset command exists and parity gate only checks file existence.

**Step 3: Write minimal implementation**

```ts
export async function resetGapLabSlice(input: ResetGapLabSliceInput): Promise<ResetGapLabSliceResult> {
  const generation = `rerun-${Date.now()}`;
  progress.checkpoint_phase = input.to;
  progress.current_slice_id = input.sliceId;
  slice.execution_generation = generation;
  slice.status = 'pending';
  await fs.rm(ruleLabSliceDir, { recursive: true, force: true });
  return { generation, cleanedRuleLabFiles };
}
```

Implement:
- a first-class `gitnexus gap-lab reset-slice --repo-path --run-id --slice-id --to phase_b_ready_for_c1` command;
- `execution_generation` or equivalent freshness token written into gap-lab slice state;
- parity gate validation that blocks stale downstream `rules/lab` artifacts even when files still exist.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/parity-gate.test.ts gitnexus/src/cli/gap-lab.test.ts -t "rewinds stale rerun state|generation mismatch|placeholder"`

Expected: PASS with explicit rewind behavior and freshness-aware parity blocking.

**Step 5: Commit**

```bash
git add gitnexus/src/gap-lab/parity-gate.ts gitnexus/src/gap-lab/parity-gate.test.ts gitnexus/src/cli/gap-lab.ts gitnexus/src/cli/gap-lab.test.ts docs/gitnexus-config-files.md
git commit -m "feat(gap-lab): add explicit slice rewind and parity freshness"
```

### Task 2: Make Gap-Lab Artifact Writes Atomic and Detect Incomplete Output

**Files:**
- Modify: `gitnexus/src/gap-lab/run.ts`
- Modify: `gitnexus/src/gap-lab/slim-artifacts.ts`
- Modify: `gitnexus/src/gap-lab/run.test.ts`

**Step 1: Write the failing tests**

```ts
it('writes candidates atomically instead of leaving a zero-byte final artifact on interruption', async () => {
  await expect(simulateInterruptedRun(repoRoot)).rejects.toThrow(/simulated interruption/);
  const stat = await fs.stat(candidatesPath);
  expect(stat.size).toBeGreaterThan(0);
});

it('marks an empty final candidates file as incomplete state rather than valid C1 output', async () => {
  await fs.writeFile(candidatesPath, '', 'utf-8');
  const result = await inspectGapLabSliceArtifacts({ repoPath, runId, sliceId });
  expect(result.incompleteReason).toBe('empty_candidates_artifact');
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/run.test.ts -t "zero-byte|atomic candidates|empty final candidates"`

Expected: FAIL because `ensureBalancedSlimArtifacts()` pre-creates the final file and `runGapLabSlice()` writes directly to it.

**Step 3: Write minimal implementation**

```ts
const tempCandidatesPath = `${paths.candidatesPath}.tmp`;
await fs.writeFile(tempCandidatesPath, serializedRows ? `${serializedRows}\n` : '', 'utf-8');
await fs.rename(tempCandidatesPath, paths.candidatesPath);
if (!serializedRows) {
  sliceDoc.status = 'blocked';
  sliceDoc.incomplete_artifact_reason = 'empty_candidates_artifact';
}
```

Implement:
- stop pre-creating the final `*.candidates.jsonl`;
- write slice artifacts through temp files plus rename;
- add an incomplete-artifact marker that fails closed when an empty final file is detected.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/gap-lab/run.test.ts -t "zero-byte|atomic candidates|empty final candidates"`

Expected: PASS with no ambiguous zero-byte final artifact accepted as valid output.

**Step 5: Commit**

```bash
git add gitnexus/src/gap-lab/run.ts gitnexus/src/gap-lab/slim-artifacts.ts gitnexus/src/gap-lab/run.test.ts
git commit -m "fix(gap-lab): make slice artifacts atomic and fail on incomplete output"
```

### Task 3: Bound Aggregate Rule IDs Deterministically

**Files:**
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`

**Step 1: Write the failing tests**

```ts
it('caps aggregate draft_rule_id length while preserving deterministic lineage hash', async () => {
  const result = await analyzeRuleLabSlice({ repoPath, runId, sliceId });
  expect(result.candidates[0].draft_rule_id.length).toBeLessThanOrEqual(120);
  expect(result.candidates[0].draft_rule_id).toMatch(/^unity\.event\.[a-z0-9-]+-[a-f0-9]{10}\.v1$/);
});

it('promote no longer throws ENAMETOOLONG for large aggregate slices', async () => {
  await expect(promoteCuratedRules({ repoPath, runId, sliceId })).resolves.toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts -t "aggregate draft_rule_id|ENAMETOOLONG"`

Expected: FAIL because aggregate stems currently concatenate every accepted anchor stem into the filename.

**Step 3: Write minimal implementation**

```ts
function buildSafeAggregateRuleId(slice: RuleLabSliceWithHandoff, rows: GapCandidateRow[]): string {
  const humanStem = normalizeToken(slice.gap_subtype || slice.id).slice(0, 48) || 'runtime-rule';
  const lineageHash = createHash('sha1')
    .update(rows.map((row) => row.candidate_id).join('|'))
    .digest('hex')
    .slice(0, 10);
  return `unity.event.${humanStem}-${lineageHash}.v1`;
}
```

Implement deterministic hashing from accepted candidate ids and keep the human-readable prefix bounded.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts -t "aggregate draft_rule_id|ENAMETOOLONG"`

Expected: PASS with a bounded stable rule id and successful promote.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts
git commit -m "fix(rule-lab): bound aggregate rule ids with deterministic hashes"
```

### Task 4: Preserve Strong Match Metadata from Gap Handoff Through Promote

**Files:**
- Modify: `gitnexus/src/rule-lab/analyze.ts`
- Modify: `gitnexus/src/rule-lab/curation-input-builder.ts`
- Modify: `gitnexus/src/rule-lab/analyze.test.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`
- Modify: `gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts`

**Step 1: Write the failing tests**

```ts
it('carries strong match metadata into curation input for mirror_syncvar_hook aggregate proposals', async () => {
  const curation = JSON.parse(await fs.readFile(curationPath, 'utf-8'));
  expect(curation.curated[0].match.trigger_tokens).toEqual(['event_delegate', 'mirror_syncvar_hook']);
  expect(curation.curated[0].match.symbol_kind).toEqual(['Method']);
  expect(curation.curated[0].match.module_scope).toEqual(['Assets/NEON/Code']);
});

it('promote preserves the strong match block instead of degrading to event_delegate/method/slice-id', async () => {
  const yaml = await fs.readFile(promotedYamlPath, 'utf-8');
  expect(yaml).toMatch(/mirror_syncvar_hook/);
  expect(yaml).toMatch(/Method/);
  expect(yaml).toMatch(/Assets\/NEON\/Code/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "strong match metadata|degrading to event_delegate"`

Expected: FAIL because `buildCurationInput()` currently synthesizes generic match values from `trigger_family` and `slice.id`.

**Step 3: Write minimal implementation**

```ts
const strongMatch = candidate.match_override ?? {
  trigger_tokens: unique([input.slice.trigger_family, input.slice.source_gap_handoff?.slice_id?.split('.').pop() || '']),
  symbol_kind: ['Method'],
  module_scope: deriveCommonPathPrefix(input.handoff.accepted_candidates),
  resource_types: [...input.slice.resource_types],
  host_base_type: [...input.slice.host_base_type],
};
```

Implement:
- proposal-level `match_override` or equivalent structure in `analyze.ts`;
- propagation of strong match values into `curation-input.json`;
- preservation of exact case for `Method` and meaningful `module_scope`.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts -t "strong match metadata|degrading to event_delegate"`

Expected: PASS with semantically useful match metadata preserved end-to-end.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/analyze.ts gitnexus/src/rule-lab/curation-input-builder.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/test/integration/gap-lab-rule-lab-handoff.test.ts
git commit -m "fix(rule-lab): preserve strong match metadata through promotion"
```

### Task 5: Serialize Full `method_triggers_method` Bindings and Persist `analyze_rules` Family

**Files:**
- Modify: `gitnexus/src/rule-lab/promote.ts`
- Modify: `gitnexus/src/rule-lab/compile.ts`
- Modify: `gitnexus/src/rule-lab/promote.test.ts`
- Modify: `gitnexus/src/rule-lab/curate.test.ts`
- Modify: `gitnexus/src/cli/rule-lab.test.ts`
- Modify: `docs/unity-runtime-process-source-of-truth.md`

**Step 1: Write the failing tests**

```ts
it('serializes source and target fields for method_triggers_method bindings in approved yaml', async () => {
  const yaml = await fs.readFile(promotedYamlPath, 'utf-8');
  expect(yaml).toMatch(/source_class_pattern:/);
  expect(yaml).toMatch(/source_method:/);
  expect(yaml).toMatch(/target_class_pattern:/);
  expect(yaml).toMatch(/target_method:/);
});

it('defaults promoted runtime bridge rules to analyze_rules family so recompile keeps them in the analyze bundle', async () => {
  await compileRules({ repoPath, family: 'analyze_rules' });
  const bundle = JSON.parse(await fs.readFile(analyzeBundlePath, 'utf-8'));
  expect(bundle.rules.some((rule: any) => rule.id === 'unity.event.mirror-syncvar-hook.v1')).toBe(true);
});

it('rejects promotion when curated closure evidence is empty', async () => {
  await expect(promoteCuratedRules({ repoPath, runId, sliceId })).rejects.toThrow(/confirmed_chain\.steps|closure evidence/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/promote.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/cli/rule-lab.test.ts -t "serializes source and target fields|default analyze_rules family|empty confirmed_chain"`

Expected: FAIL because YAML serialization only emits a subset of binding fields and family is omitted from the catalog entry.

**Step 3: Write minimal implementation**

```ts
if (binding.source_class_pattern) lines.push(`    source_class_pattern: ${quoteYaml(binding.source_class_pattern)}`);
if (binding.source_method) lines.push(`    source_method: ${quoteYaml(binding.source_method)}`);
if (binding.target_class_pattern) lines.push(`    target_class_pattern: ${quoteYaml(binding.target_class_pattern)}`);
if (binding.target_method) lines.push(`    target_method: ${quoteYaml(binding.target_method)}`);

const family = draft.family || 'analyze_rules';
catalog.rules.push({ id: ruleId, version, enabled: true, file: relativeFile, family });
if (!Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0) {
  throw new Error('confirmed_chain.steps must be non-empty for promotion');
}
```

Implement:
- full serialization of `method_triggers_method` binding fields;
- default family assignment to `analyze_rules` for promoted runtime bridge rules;
- compile fallback for legacy family-less approved runtime rules if needed to keep existing repos stable.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/rule-lab/promote.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/cli/rule-lab.test.ts -t "serializes source and target fields|default analyze_rules family|empty confirmed_chain"`

Expected: PASS with full YAML fidelity and stable analyze bundle membership after recompile.

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts gitnexus/src/rule-lab/compile.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/src/rule-lab/curate.test.ts gitnexus/src/cli/rule-lab.test.ts docs/unity-runtime-process-source-of-truth.md
git commit -m "fix(rule-lab): preserve binding fields and analyze_rules family"
```

### Task 6: Correct `gitnexus analyze [path]` Operator Guidance Everywhere

**Files:**
- Modify: `README.md`
- Modify: `gitnexus/README.md`
- Modify: `docs/gap-lab-rule-lab-architecture.md`
- Modify: `gitnexus/skills/gitnexus-unity-rule-gen.md`
- Modify: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`
- Modify: `gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts`
- Modify: `gitnexus/src/cli/analyze.test.ts`

**Step 1: Write the failing tests**

```ts
it('documents analyze as positional path syntax for the local CLI', async () => {
  const text = await fs.readFile('docs/gap-lab-rule-lab-architecture.md', 'utf-8');
  expect(text).toMatch(/gitnexus analyze \[path\]|gitnexus analyze -f "\$REPO_PATH"/i);
  expect(text).not.toMatch(/gitnexus analyze --repo-path/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/analyze.test.ts gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "positional path syntax|analyze --repo-path"`

Expected: FAIL because at least one doc/skill artifact still instructs `gitnexus analyze --repo-path`.

**Step 3: Write minimal implementation**

```md
Replace:
gitnexus analyze --repo-path <target_repo>

With:
gitnexus analyze <target_repo>
gitnexus analyze -f <target_repo>
```

Update tests to pin the real local CLI contract and avoid future doc drift.

**Step 4: Run test to verify it passes**

Run: `npx --prefix gitnexus vitest run gitnexus/src/cli/analyze.test.ts gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts -t "positional path syntax|analyze --repo-path"`

Expected: PASS with all public/operator-facing instructions aligned to the actual CLI.

**Step 5: Commit**

```bash
git add README.md gitnexus/README.md docs/gap-lab-rule-lab-architecture.md gitnexus/skills/gitnexus-unity-rule-gen.md .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md gitnexus/test/integration/unity-gap-lab-skill-contracts.test.ts gitnexus/src/cli/analyze.test.ts
git commit -m "docs(cli): align analyze guidance with positional path syntax"
```

### Task 7: Run Real NeonSpark Verification with Fresh Rerun State

**User Verification: required**

**Human Verification Checklist**
- `gap-lab reset-slice` leaves the slice at `phase_b_ready_for_c1` and removes stale `rules/lab` artifacts for `event_delegate_gap.mirror_syncvar_hook`.
- rerun + rule-lab promote produces an approved YAML whose `match` and `resource_bindings` still contain strong metadata and full source/target fields.
- forced `analyze -f` on `/Volumes/Shuttle/projects/neonspark` completes without silently dropping `unity.event.mirror-syncvar-hook.v1` from `.gitnexus/rules/compiled/analyze_rules.v2.json`.
- Cypher shows non-zero `CALLS` edges with reason `unity-rule-method-bridge:unity.event.mirror-syncvar-hook.v1`.
- representative pairs such as `DestructableDoor.SyncParentBindingData -> OnParentKeyChanged` and `GiftChest.SetSourceNetId -> OnSourceNetIdChanged` appear in the graph.

**Acceptance Criteria**
- each checklist item returns the expected artifact or query result exactly once for the fresh rerun generation.

**Failure Signals**
- reset leaves old `rules/lab` files in place, YAML regresses to generic `event_delegate/method/slice-id`, analyze bundle omits the promoted rule, Cypher count is `0`, or representative method pairs are missing.

**User Decision Prompt**
- `请只回复“通过”或“不通过”。`

**Files:**
- Modify: `docs/reports/2026-04-12-neonspark-mirror-syncvar-hook-gap-rule-rerun-issues.md`
- Modify: `docs/gitnexus-config-files.md`
- Test: `gitnexus/src/gap-lab/parity-gate.test.ts`
- Test: `gitnexus/src/gap-lab/run.test.ts`
- Test: `gitnexus/src/rule-lab/analyze.test.ts`
- Test: `gitnexus/src/rule-lab/promote.test.ts`
- Test: `gitnexus/src/cli/rule-lab.test.ts`

**Step 1: Write the failing real-run verification script**

```bash
REPO_PATH="/Volumes/Shuttle/projects/neonspark"
RUN_ID="gaplab-20260411-104710"
SLICE_ID="event_delegate_gap.mirror_syncvar_hook"

node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js gap-lab reset-slice --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --to phase_b_ready_for_c1
```

Write a checked-in shell transcript block or report appendix that asserts:
- fresh rerun generation id;
- cleaned downstream artifact list;
- non-zero Cypher edge count and representative edge rows.

**Step 2: Run verification to confirm the current implementation still fails at one of the stable root-cause checks**

Run: the full `DC-07` command from the traceability matrix.

Expected: FAIL before implementation is complete, at minimum on stale rerun handling, YAML fidelity, family persistence, or edge verification.

**Step 3: Write minimal implementation support and report updates**

```md
Document in the report:
- reset command used
- rerun generation token
- approved yaml evidence
- analyze bundle evidence
- cypher edge-count evidence
```

Update docs/report language so future reruns reference the fixed workflow instead of manual cleanup.

**Step 4: Run verification to confirm it passes**

Run: the full `DC-07` command from the traceability matrix, plus:

```bash
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js cypher -r neonspark-core \
  "MATCH (s:Method)-[r:CodeRelation {type:'CALLS'}]->(t:Method)
   WHERE r.reason = 'unity-rule-method-bridge:unity.event.mirror-syncvar-hook.v1'
   RETURN s.name, s.filePath, t.name, t.filePath
   ORDER BY s.filePath, t.filePath"
```

Expected: PASS with fresh rerun evidence, non-zero edge count, and representative synthetic pairs present.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-12-neonspark-mirror-syncvar-hook-gap-rule-rerun-issues.md docs/gitnexus-config-files.md gitnexus/src/gap-lab/parity-gate.test.ts gitnexus/src/gap-lab/run.test.ts gitnexus/src/rule-lab/analyze.test.ts gitnexus/src/rule-lab/promote.test.ts gitnexus/src/cli/rule-lab.test.ts
git commit -m "test(unity): verify stable rerun workflow on neonspark"
```

## Plan Audit Verdict
audit_scope: rerun-state rewind, atomic artifact writes, aggregate rule-id safety, strong match fidelity, binding serialization, analyze_rules family persistence, analyze CLI/operator contract, real neonspark verification
finding_summary: P0=0, P1=0, P2=1
critical_mismatches:
- none
major_risks:
- duplicate-generation/idempotency is not asserted separately from fresh-rerun success status: accepted
anti_placeholder_checks:
- Task 1 adds an explicit failing test that rejects placeholder `runId` and `sliceId` during rerun reset; result: pass
- Task 3 keeps aggregate rule ids deterministic and bounded so placeholder-like fallback stems do not leak into approved YAML paths; result: pass
authenticity_checks:
- Task 2 requires incomplete-artifact tests that fail on zero-byte `candidates.jsonl`; result: pass
- Task 5 requires fail-closed rejection when `confirmed_chain.steps` is empty at promote time; result: pass
- Task 7 requires live CLI and Cypher evidence against `neonspark-core`, not only file existence; result: pass
approval_decision: pass
