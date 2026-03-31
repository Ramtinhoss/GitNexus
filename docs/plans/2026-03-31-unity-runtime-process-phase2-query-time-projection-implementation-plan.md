# Phase 2 Unity Runtime Process Query-Time Projection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement query-time class-to-method process projection so Unity-focused `context/query` no longer return misleadingly empty process clues when method-level `STEP_IN_PROCESS` evidence exists.

**Architecture:** Keep process persistence unchanged in Phase 2; only extend retrieval-time attribution in `LocalBackend.context/query`. Add a shared process-evidence resolver that merges direct symbol process rows (`direct_step`) with class method projected rows (`method_projected`), then expose calibrated confidence metadata (`high/medium`) in outputs. Validate with seeded integration tests first, then real Unity sample verification against Phase 0 baseline artifacts.

**Tech Stack:** TypeScript, LadybugDB Cypher via `executeParameterized`, GitNexus `LocalBackend`, Vitest integration tests, Node test runner, CLI (`query/context/analyze`), existing Phase 0/1 report artifacts.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1 | completed | preflight complete and plan gates validated; red check failed as expected (`TS2307: Cannot find module './process-evidence.js'`); green check passed (`npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/process-evidence.test.js`: 2 passed, 0 failed)
Task 2 | completed | added seeded method `STEP_IN_PROCESS` edge for `method:AuthService.authenticate`; red check failed as expected (`result.processes?.length` was `0`); green check passed (`npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "context tool projects method-level process participation for class symbols"`: 22 passed)
Task 3 | completed | red checks failed as expected (`AuthService` stayed out of projected process symbols; `login` lacked `process_evidence_mode`); green check passed (`npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "query tool projects class hits into processes via method STEP_IN_PROCESS|query keeps direct evidence as high confidence when available"`: 24 passed)
Task 4 | completed | formatter red check failed as expected (missing `method_projected`/`medium` text); green check passed (`npm --prefix gitnexus exec vitest run test/unit/eval-formatters.test.ts -t "includes process evidence mode"`: 30 passed)
Task 5 | in_progress | build/integration/U3 gates passed; required sample pair remained empty, but neonspark Phase0-queryset sweep improved both tracked ratios (`context: 0.0% -> 20.0%`, `query process_symbols: 12.5% -> 25.0%`); `confirmed_chain.steps.length=1` in summary artifact; awaiting required human verification gate

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: `context` must project class process participation through `HAS_METHOD -> STEP_IN_PROCESS` when direct class rows are empty | critical | Task 1, Task 2 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "context tool projects method-level process participation for class symbols"` | `test/integration/local-backend-calltool.test.ts:result.processes[*].evidence_mode` | `result.processes is empty or no method_projected row`
DC-02: `query` must attribute class hits to process via method projection and lift them into `processes/process_symbols` | critical | Task 1, Task 3 | `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "query tool projects class hits into processes via method STEP_IN_PROCESS"` | `test/integration/local-backend-calltool.test.ts:result.process_symbols[*].process_evidence_mode` | `AuthService only appears in definitions and never in process_symbols`
DC-03: Response metadata must expose `evidence_mode` + confidence tag with direct evidence precedence | critical | Task 1, Task 2, Task 3 | `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/process-evidence.test.js` | `gitnexus/src/mcp/local/process-evidence.test.ts:mergedProcessEvidence` | `direct_step overwritten by method_projected or confidence not high/medium as designed`
DC-04: Agent-facing output/contract must surface the new metadata without breaking existing consumers | high | Task 4 | `npm --prefix gitnexus exec vitest run test/unit/eval-formatters.test.ts -t "includes process evidence mode"` | `gitnexus/test/unit/eval-formatters.test.ts:formatted text snapshot/assertions` | `formatted output hides evidence mode and confidence completely`
DC-05: Phase 2 must show measurable improvement versus Phase 0 baseline on sampled Unity set | critical | Task 5 | `node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" WeaponPowerUp --unity-resources on --unity-hydration parity` and `node gitnexus/dist/cli/index.js query -r neonspark "Pickup PickItUp EquipWithEvent" --unity-resources on --unity-hydration parity` | `docs/reports/2026-03-31-phase2-unity-runtime-process-projection-summary.json:metricsDelta` | `phase2 delta <= 0 for both context.processes and query process_symbols non-empty ratios`

## Authenticity Assertions

- `assert no placeholder path`: report generation fails when any evidence path equals `"TODO"`, `"TBD"`, or contains `/placeholder/`.
- `assert live mode has tool evidence`: phase2 report must include executed commands, repo alias, indexed commit, and observed JSON counters.
- `assert freeze requires non-empty confirmed_chain.steps`: final acceptance block is invalid unless `confirmed_chain.steps.length > 0` for at least one reload-chain stitched sample.
- Negative assertion for projection correctness: when only method-projected evidence exists, output must not label it as `direct_step`.
- Negative assertion for precedence: when direct and projected evidence both exist for same process, output must remain `direct_step` with `high` confidence.

## Skill Hooks

- `@gitnexus-exploring` for tracing `context/query` attribution paths and symbol/process joins.
- `@gitnexus-cli` for analyze/status/query/context/cypher verification loops.
- `@superpowers:verification-before-completion` before any completion claim.

### Task 1: Add Process Evidence Merge Helper With Red/Green Unit Contracts

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/process-evidence.ts`
- Create: `gitnexus/src/mcp/local/process-evidence.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Test: `gitnexus/src/mcp/local/process-evidence.test.ts`

**Step 1: Write failing tests for merge/precedence semantics**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProcessEvidence } from './process-evidence.js';

test('projected-only rows are method_projected + medium', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [{ pid: 'proc:login', label: 'User Login', step: 2, stepCount: 4, viaMethodId: 'method:AuthService.authenticate' }],
  });

  assert.equal(out[0].evidence_mode, 'method_projected');
  assert.equal(out[0].confidence, 'medium');
});

test('direct rows dominate projected rows for same process id', () => {
  const out = mergeProcessEvidence({
    directRows: [{ pid: 'proc:login', label: 'User Login', step: 1, stepCount: 4 }],
    projectedRows: [{ pid: 'proc:login', label: 'User Login', step: 2, stepCount: 4, viaMethodId: 'method:AuthService.authenticate' }],
  });

  assert.equal(out[0].evidence_mode, 'direct_step');
  assert.equal(out[0].confidence, 'high');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/process-evidence.test.js`
Expected: FAIL with module/function missing (`mergeProcessEvidence` not implemented).

**Step 3: Write minimal merge implementation**

```ts
export type ProcessEvidenceMode = 'direct_step' | 'method_projected';
export type ProcessConfidence = 'high' | 'medium';

export function mergeProcessEvidence(input: {
  directRows: any[];
  projectedRows: any[];
}) {
  const byPid = new Map<string, {
    pid: string;
    label: string;
    step: number;
    stepCount: number;
    evidence_mode: ProcessEvidenceMode;
    confidence: ProcessConfidence;
  }>();

  for (const row of input.projectedRows) {
    byPid.set(row.pid, {
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'method_projected',
      confidence: 'medium',
    });
  }

  for (const row of input.directRows) {
    byPid.set(row.pid, {
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'direct_step',
      confidence: 'high',
    });
  }

  return [...byPid.values()];
}
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/process-evidence.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/process-evidence.ts gitnexus/src/mcp/local/process-evidence.test.ts gitnexus/src/mcp/local/local-backend.ts
git commit -m "feat(phase2): add process evidence merge helper with precedence rules"
```

### Task 2: Implement Context Method-Projected Process Attribution

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/fixtures/local-backend-seed.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Test: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write failing integration test for class-context projection**

```ts
it('context tool projects method-level process participation for class symbols', async () => {
  const result = await backend.callTool('context', { name: 'AuthService' });

  expect(result.processes?.length).toBeGreaterThan(0);
  expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
  expect(result.processes.every((p: any) => ['high', 'medium'].includes(p.confidence))).toBe(true);
  expect(result.processes.some((p: any) => p.evidence_mode === 'direct_step')).toBe(false);
});
```

Also add method-level process seed edge:

```ts
`MATCH (m:Method), (p:Process) WHERE m.id = 'method:AuthService.authenticate' AND p.id = 'proc:login-flow'
 CREATE (m)-[:CodeRelation {type: 'STEP_IN_PROCESS', confidence: 1.0, reason: 'phase2-test', step: 2}]->(p)`,
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "context tool projects method-level process participation for class symbols"`
Expected: FAIL because `context` currently only queries direct `symbol -> STEP_IN_PROCESS`.

**Step 3: Implement context projection using helper**

```ts
const directProcessRows = await executeParameterized(repo.id, `
  MATCH (n {id: $symId})-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
  RETURN p.id AS pid, p.heuristicLabel AS label, r.step AS step, p.stepCount AS stepCount
`, { symId });

const projectedProcessRows = isMethodContainer
  ? await executeParameterized(repo.id, `
      MATCH (n {id: $symId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
      MATCH (m)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
      RETURN p.id AS pid, p.heuristicLabel AS label, MIN(r.step) AS step, p.stepCount AS stepCount
    `, { symId })
  : [];

const processRows = mergeProcessEvidence({ directRows: directProcessRows, projectedRows: projectedProcessRows });
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "context tool projects method-level process participation for class symbols"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/fixtures/local-backend-seed.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(phase2): project class context processes through HAS_METHOD step edges"
```

### Task 3: Implement Query Projection and Process Metadata Surfacing

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Test: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write failing integration tests for query projection + precedence**

```ts
it('query tool projects class hits into processes via method STEP_IN_PROCESS', async () => {
  const result = await backend.callTool('query', { query: 'AuthService' });

  expect(result.processes?.length).toBeGreaterThan(0);
  expect(result.process_symbols.some((s: any) => s.name === 'AuthService')).toBe(true);
  expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
});

it('query keeps direct evidence as high confidence when available', async () => {
  const result = await backend.callTool('query', { query: 'login' });
  const loginSymbol = result.process_symbols.find((s: any) => s.name === 'login');

  expect(loginSymbol.process_evidence_mode).toBe('direct_step');
  expect(loginSymbol.process_confidence).toBe('high');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "query tool projects class hits into processes via method STEP_IN_PROCESS"`
Expected: FAIL because class hits currently remain in `definitions` when direct process rows are empty.

**Step 3: Implement minimal query projection and metadata propagation**

```ts
const mergedRows = mergeProcessEvidence({
  directRows,
  projectedRows: isClassLike ? projectedRows : [],
});

for (const row of mergedRows) {
  proc.symbols.push({
    ...symbolEntry,
    process_id: row.pid,
    step_index: row.step,
    process_evidence_mode: row.evidence_mode,
    process_confidence: row.confidence,
  });
}
```

And set process summary evidence:

```ts
evidence_mode: p.symbols.some((s) => s.process_evidence_mode === 'direct_step') ? 'direct_step' : 'method_projected',
confidence: p.symbols.some((s) => s.process_confidence === 'high') ? 'high' : 'medium',
```

**Step 4: Run tests to verify they pass**

Run: `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts -t "query tool projects class hits into processes via method STEP_IN_PROCESS|query keeps direct evidence as high confidence when available"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(phase2): project query class hits into process results with evidence metadata"
```

### Task 4: Update Tool/Eval Output Contract for Evidence Metadata

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/src/cli/eval-server.ts`
- Modify: `gitnexus/test/unit/eval-formatters.test.ts`
- Test: `gitnexus/test/unit/eval-formatters.test.ts`

**Step 1: Write failing formatter test requiring evidence visibility**

```ts
it('formatContextResult includes process evidence mode and confidence', () => {
  const text = formatContextResult({
    status: 'found',
    symbol: { kind: 'Class', name: 'AuthService', filePath: 'src/auth.ts' },
    incoming: {},
    outgoing: {},
    processes: [{ name: 'User Login', step_index: 2, step_count: 4, evidence_mode: 'method_projected', confidence: 'medium' }],
  });

  expect(text).toContain('method_projected');
  expect(text).toContain('medium');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec vitest run test/unit/eval-formatters.test.ts -t "includes process evidence mode"`
Expected: FAIL because formatter currently only prints `step i/n`.

**Step 3: Implement minimal formatter + tool doc updates**

```ts
lines.push(`  • ${p.name} (step ${p.step_index}/${p.step_count}, evidence=${p.evidence_mode || 'direct_step'}, confidence=${p.confidence || 'high'})`);
```

Also extend `query/context` tool descriptions in `src/mcp/tools.ts` to document:

```ts
- processes[].evidence_mode: direct_step | method_projected
- processes[].confidence: high | medium
```

**Step 4: Run test to verify it passes**

Run: `npm --prefix gitnexus exec vitest run test/unit/eval-formatters.test.ts -t "includes process evidence mode"`
Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/tools.ts gitnexus/src/cli/eval-server.ts gitnexus/test/unit/eval-formatters.test.ts
git commit -m "docs(eval): expose process evidence mode and confidence in tool contract and formatter"
```

### Task 5: Build Phase 2 Verification Pack and Record Execution Evidence

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-03-31-phase2-unity-runtime-process-projection-summary.json`
- Create: `docs/reports/2026-03-31-phase2-unity-runtime-process-projection-report.md`
- Modify: `docs/2026-03-31-unity-runtime-process-phased-design.md`

**Step 1: Write failing report skeleton with anti-placeholder assertions**

```md
## Authenticity Gate
- [ ] assert no placeholder path
- [ ] assert live mode has tool evidence
- [ ] assert freeze requires non-empty confirmed_chain.steps
```

**Step 2: Run verification commands to establish expected deltas**

Run:
- `npm --prefix gitnexus run build`
- `npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts`
- `npm --prefix gitnexus run test:u3:gates`
- `node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" --unity-resources on --unity-hydration parity WeaponPowerUp`
- `node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "Pickup PickItUp EquipWithEvent"`
Expected: PASS for tests/gates, and at least one sampled Unity symbol/query now returns non-empty process clues.

**Step 3: Fill summary JSON + markdown report with concrete evidence**

```json
{
  "phase": "phase2",
  "baselineRef": "docs/reports/2026-03-31-phase0-unity-runtime-process-summary.json",
  "metricsDelta": {
    "contextProcessNonEmptyRatioDeltaPctPoint": 0,
    "queryProcessSymbolsNonEmptyRatioDeltaPctPoint": 0
  },
  "confirmed_chain": {
    "steps": [
      {
        "symbol": "WeaponPowerUp",
        "evidence_mode": "method_projected",
        "confidence": "medium"
      }
    ]
  }
}
```

(Replace zeros with real measured deltas before handoff.)

**Step 4: Re-run validations and verify anti-fake conditions**

Run:
- `jq '.metricsDelta, .confirmed_chain.steps | length' docs/reports/2026-03-31-phase2-unity-runtime-process-projection-summary.json`
Expected:
- `metricsDelta` has positive values for targeted metrics.
- `confirmed_chain.steps` length `> 0`.

**Step 5: Commit phase2 verification artifacts and design doc execution record**

```bash
git add docs/reports/2026-03-31-phase2-unity-runtime-process-projection-summary.json docs/reports/2026-03-31-phase2-unity-runtime-process-projection-report.md docs/2026-03-31-unity-runtime-process-phased-design.md
git commit -m "docs(phase2): record query-time process projection verification and deltas"
```

---

## Final Verification Checklist

- `context` on class symbols can return non-empty `processes` through method projection when direct rows are empty.
- `query` class hits appear in `process_symbols` with `process_evidence_mode` and `process_confidence`.
- Direct process evidence remains `direct_step` + `high` when present.
- `test/integration/local-backend-calltool.test.ts` and `test/unit/eval-formatters.test.ts` pass after changes.
- `npm --prefix gitnexus run test:u3:gates` remains green.
- Phase 2 summary/report artifacts include non-placeholder, command-backed evidence with positive deltas vs Phase 0.

## Plan Audit Verdict
audit_scope: Phase 2 clauses in `docs/2026-03-31-unity-runtime-process-phased-design.md` (context/query projection, metadata, verification gates)
finding_summary: P0=0, P1=0, P2=2
critical_mismatches:
- none
major_risks:
- none
anti_placeholder_checks:
- report skeleton requires explicit anti-placeholder assertions: pass
- summary JSON gate requires `confirmed_chain.steps.length > 0`: pass
authenticity_checks:
- projection metadata includes negative assertions for mislabeling direct vs projected evidence: pass
- verification commands require real CLI outputs and repo aliases/commits: pass
approval_decision: pass
