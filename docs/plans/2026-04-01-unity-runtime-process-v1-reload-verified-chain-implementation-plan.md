# Unity Runtime Process V1 Reload Verified Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a Reload-first Unity runtime chain workflow where `context/query` never mislead on empty process, and explicit on-demand verification produces anchor-backed stitched chain evidence.

**Architecture:** Keep existing Phase 5 confidence semantics intact for process membership, then add a second evidence layer (`runtime_chain_evidence_level`) plus an explicit `runtime_chain_verify=on-demand` path. Implement query/context parity for empty-process fallback and build a deterministic verifier pipeline that combines Unity resource bindings, asset/meta GUID mapping, and code-level runtime anchors. Verify with unit/integration tests plus a live Neonspark Reload acceptance pack.

**Tech Stack:** TypeScript, GitNexus MCP local backend, CLI (`commander`), Vitest, `node:test`, Unity asset/meta parsing helpers, benchmark/u2-e2e evidence artifacts.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1: Establish Dual-Layer Evidence Model Primitives | completed | Added `runtime-chain-evidence` helper + tests; normalized local tests to Vitest so `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-evidence.test.ts gitnexus/src/mcp/local/process-confidence.test.ts` now passes (`2 files, 10 tests`).
Task 2: Add Context Empty-Process Fallback Parity with Query | completed | `context` now injects heuristic fallback rows after Unity hydration when process participation is empty but resource evidence exists; `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 context fallback clue parity|phase5 flag-off preserves legacy response shape"` passes.
Task 3: Wire Dual-Layer Fields into Query/Context Responses | completed | Added `runtime_chain_evidence_level` to query/context confidence-field responses and kept low-confidence hints actionable; `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 dual layer confidence fields|v1 low confidence hints remain actionable"` passes.
Task 4: Add Explicit Verify Switch to CLI + Tool Dispatch | completed | Added `--runtime-chain-verify off|on-demand` to CLI query/context and MCP tool schemas; `npm --prefix gitnexus exec -- vitest run test/unit/calltool-dispatch.test.ts -t "runtime_chain_verify"` passes and `node gitnexus/dist/cli/index.js query --help` / `context --help` show the new option.
Task 5: Implement Reload-Focused On-Demand Runtime Chain Verifier | completed | Added deterministic verifier + unit/integration coverage; `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify on demand|v1 runtime chain gaps are actionable"` passes.
Task 6: Add Anti-Fake Assertions and Acceptance Artifact Writer | completed | Added reload acceptance runner, anchor authenticity checks, placeholder rejection, and retrieval-runner placeholder guard; `npm --prefix gitnexus exec -- vitest run gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts -t "v1 reload acceptance|phase5 confidence calibration|v1 anchor authenticity"` passes.
Task 7: Run Live Reload Acceptance Pack and Persist Evidence | completed | Live artifact/report written and user-reviewed; runtime chain PASS (`verified_full`, `verified_chain`, `5` hops, `0` gaps), status parity PASS (`indexedCommit=currentCommit=9d105b2988e0a9711e6ef64cb4a8e458516f6c9c`), verify-only PASS (`node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --verify-only ...`).
Task 8: Final Regression, Gates, and Handoff Package | completed | Final regression PASS: `npm --prefix gitnexus run build`; `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts test/unit/calltool-dispatch.test.ts` (`85 passed`); `npm --prefix gitnexus run test:u3:gates` (`59 passed`); authenticity recheck PASS. Design/plan notes backfilled; accepted P1 residual risk is limited scope of deterministic verifier beyond Reload V1.
Task 9: Post-Acceptance Hardening (Rollback Gate + Strict Loader/Runtime Anchors) | completed | Added env gate parser + backend gate (`GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY`); hardened verifier to require `CurGunGraph` assignment anchor for loader and dual runtime anchors for closure; strengthened acceptance validator with semantic anchor checks. Verification PASS: `vitest -t "v1 runtime chain verify env gate|v1 runtime chain verify on demand builds reload chain hops|v1 reload acceptance enforces loader/runtime semantic anchors"` (`3 passed`) and `npm --prefix gitnexus run test:u3:gates` (`60 passed`); live recheck PASS (`docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.recheck.json`).

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: `context` must emit actionable runtime clue when process is empty but Unity evidence exists (query/context parity) | critical | Task 2, Task 3 | `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 context fallback clue parity"` | `gitnexus/test/integration/local-backend-calltool.test.ts:v1ContextFallbackParity` | `context returns processes=[] with resourceBindings>0 and no fallback clue`
DC-02: confidence semantics stay stable while adding evidence layer | critical | Task 1, Task 3 | `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/process-confidence.test.ts gitnexus/src/mcp/local/runtime-chain-evidence.test.ts` | `gitnexus/src/mcp/local/runtime-chain-evidence.test.ts:dualLayerSemantics` | `process confidence values change unexpectedly or evidence level missing`
DC-03: explicit on-demand runtime verification must emit structured `runtime_chain` with hop anchors | critical | Task 4, Task 5 | `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify on demand"` | `gitnexus/test/integration/local-backend-calltool.test.ts:v1RuntimeChainVerify` | `runtime_chain missing or hops missing anchor`
DC-04: Reload acceptance chain must close UC-2/UC-3/UC-4 with concrete evidence including deterministic `guid_map` + graph wiring proof | critical | Task 5, Task 6, Task 7 | `node gitnexus/dist/cli/index.js query -r neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"` | `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json:runtime_chain.hops` | `missing guid_map hop or missing Reload.cs.meta guid -> graph node -> ResultRPM->GunOutput.RPM wiring anchor`
DC-05: low-confidence outputs must keep anti-fake verification guidance | critical | Task 2, Task 3, Task 6 | `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 low confidence hints remain actionable"` | `gitnexus/test/integration/local-backend-calltool.test.ts:v1LowConfidenceHintQuality` | `low confidence row missing action/target/next_command`
DC-06: CLI/MCP contract must expose explicit verify switch without breaking legacy callers | critical | Task 4, Task 5 | `npm --prefix gitnexus exec -- vitest run test/unit/calltool-dispatch.test.ts -t "runtime_chain_verify" && node gitnexus/dist/cli/index.js query --help` | `gitnexus/test/unit/calltool-dispatch.test.ts:v1RuntimeChainVerifyDispatch` | `legacy calls fail or verify flag unavailable`
DC-07: UC-5 continuation semantics must be enforced (`empty process` at one hop cannot terminate chain) | critical | Task 5, Task 6 | `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 verifier continues when one hop has empty process"` | `gitnexus/test/integration/local-backend-calltool.test.ts:v1ContinuationWhenHopProcessEmpty` | `verifier terminates at empty-process hop despite resource evidence`
DC-08: Anchor authenticity must be filesystem-verified (path exists, line in range, snippet match) | critical | Task 6, Task 7 | `npm --prefix gitnexus exec -- vitest run gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts -t "v1 anchor authenticity"` | `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json:anchor_validation` | `anchor points to missing file, invalid line, or non-matching snippet`
DC-09: Runtime verify rollback switch must disable strong verification globally when off | critical | Task 9 | `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify env gate"` | `gitnexus/test/integration/local-backend-calltool.test.ts:v1RuntimeChainVerifyEnvGate` | `runtime_chain still emitted when GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY=off`
DC-10: UC-3/UC-4 semantic closure must include deterministic loader/runtime code anchors | critical | Task 9 | `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts -t "v1 runtime chain verify on demand builds reload chain hops|v1 reload acceptance enforces loader/runtime semantic anchors"` | `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json:runtime_chain.hops` | `loader hop not anchored at CurGunGraph assignment, or runtime closure accepted without required runtime hop evidence`

## Authenticity Assertions

- `assert no placeholder path`: reject `TODO|TBD|placeholder|<symbol-or-query>` in `verification_hint.next_command`, `runtime_chain.hops[].anchor`, and acceptance artifacts.
- `assert live mode has tool evidence`: acceptance artifact must store exact command lines, repo alias, and timestamped outputs from current run.
- `assert freeze requires non-empty confirmed_chain.steps`: `runtime_chain.status=verified_full` requires non-empty `hops` with all mandatory segments (`resource`, `guid_map`, `code_loader`, `code_runtime`) and deterministic graph wiring proof.
- `assert semantic closure not shape-only`: tests must validate GUID equality and expected call-path anchor presence, not only field existence.
- `assert low confidence remains calibrated`: when evidence is heuristic-only, confidence remains `low` even if evidence_level is `clue`.

## Preflight Cache Snapshot

Source: preflight-derived constraints captured in this planning session.

- `worker_profile`: available
- `execution_mode`: parallel-worker
- `permission_mode`: normal
- `request_user_input_available`: true
- `large-worktree-risk`: false
- `worktree-dirty`: true
- `worktree-exempt`: false
- `heavy-checks-skipped`: false

## Required Skills During Execution

- `@superpowers:executing-plans`
- `@superpowers:verification-before-completion`
- `@gitnexus-exploring`
- `@gitnexus-debugging` (only if acceptance chain fails)

### Task 1: Establish Dual-Layer Evidence Model Primitives

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-chain-evidence.ts`
- Create: `gitnexus/src/mcp/local/runtime-chain-evidence.test.ts`
- Modify: `gitnexus/src/mcp/local/process-confidence.ts`
- Modify: `gitnexus/src/mcp/local/process-confidence.test.ts`

**Step 1: Write the failing tests**

```ts
// runtime-chain-evidence.test.ts
expect(deriveRuntimeChainEvidenceLevel({ mode: 'none' })).toBe('none');
expect(deriveRuntimeChainEvidenceLevel({ mode: 'heuristic_clue' })).toBe('clue');
expect(deriveRuntimeChainEvidenceLevel({ mode: 'verified_hops', requiredSegments: ['resource','code_loader'], foundSegments: ['resource','code_loader'] })).toBe('verified_segment');
expect(deriveRuntimeChainEvidenceLevel({ mode: 'verified_hops', requiredSegments: ['resource','code_loader','code_runtime'], foundSegments: ['resource','code_loader','code_runtime'] })).toBe('verified_chain');
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-evidence.test.ts gitnexus/src/mcp/local/process-confidence.test.ts`

Expected: FAIL because new evidence-level module/types do not exist.

**Step 3: Write minimal implementation**

```ts
// runtime-chain-evidence.ts
export type RuntimeChainEvidenceLevel = 'none' | 'clue' | 'verified_segment' | 'verified_chain';
```

- Add pure helper to derive level from verified segment coverage.
- Keep `process-confidence.ts` unchanged in semantic priority (`high/medium/low` rules remain stable).

**Step 4: Run tests to verify it passes**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-evidence.test.ts gitnexus/src/mcp/local/process-confidence.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-evidence.ts gitnexus/src/mcp/local/runtime-chain-evidence.test.ts gitnexus/src/mcp/local/process-confidence.ts gitnexus/src/mcp/local/process-confidence.test.ts
git commit -m "feat(v1): add runtime chain evidence level primitives"
```

### Task 2: Add Context Empty-Process Fallback Parity with Query

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/process-evidence.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write the failing tests**

```ts
// local-backend-calltool.test.ts
const out = await backend.callTool('context', {
  name: 'Reload',
  file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs',
  unity_resources: 'on',
  unity_hydration_mode: 'parity',
});
expect(out.resourceBindings.length).toBeGreaterThan(0);
expect(out.processes.some((p:any) => p.evidence_mode === 'resource_heuristic')).toBe(true);
expect(out.processes.some((p:any) => p.runtime_chain_confidence === 'low')).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 context fallback clue parity"`

Expected: FAIL because context path currently returns empty `processes` for this case.

**Step 3: Write minimal implementation**

- In `local-backend.ts` context flow, after Unity hydration merge:
  - if `processRows.length===0` and (`resourceBindings.length>0` or `needsParityRetry=true`), inject heuristic process row through shared evidence merger.
- Reuse `process-evidence.ts` so query/context emit same fields (`evidence_mode`, `confidence`, optional `verification_hint`).
- Attach `runtime_chain_evidence_level='clue'` for fallback-only rows.

**Step 4: Run tests to verify it passes**

Run:
- `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 context fallback clue parity"`
- `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "phase5 flag-off preserves legacy response shape"`

Expected: PASS; legacy compatibility unchanged.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/process-evidence.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(v1): align context fallback runtime clue behavior with query"
```

### Task 3: Wire Dual-Layer Fields into Query/Context Responses

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write failing tests for response schema**

```ts
const q = await backend.callTool('query', { query: 'Reload', unity_resources: 'on', unity_hydration_mode: 'parity' });
expect(q.processes.some((p:any) => p.runtime_chain_evidence_level)).toBe(true);
const c = await backend.callTool('context', { name: 'Reload', file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs', unity_resources: 'on', unity_hydration_mode: 'parity' });
expect(c.processes.some((p:any) => p.runtime_chain_evidence_level)).toBe(true);
```

**Step 2: Run tests to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 dual layer confidence fields"`

Expected: FAIL because `runtime_chain_evidence_level` is absent.

**Step 3: Write minimal implementation**

- Add `runtime_chain_evidence_level` to:
  - `processes[]`
  - `process_symbols[]` (when applicable)
- Ensure rules:
  - fallback clue row => `clue`
  - non-verified regular process rows => `none`
- Update tool descriptions in `mcp/tools.ts` to document new additive field.

**Step 4: Run tests to verify it passes**

Run: `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 dual layer confidence fields|v1 low confidence hints remain actionable"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/tools.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(v1): expose runtime chain evidence level alongside confidence"
```

### Task 4: Add Explicit Verify Switch to CLI + Tool Dispatch

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/index.ts`
- Modify: `gitnexus/src/cli/tool.ts`
- Modify: `gitnexus/src/mcp/tools.ts`
- Modify: `gitnexus/test/unit/calltool-dispatch.test.ts`

**Step 1: Write failing tests for new param dispatch**

```ts
await backend.callTool('query', { query: 'Reload', runtime_chain_verify: 'on-demand' });
expect(spy).toHaveBeenCalledWith(expect.objectContaining({ runtime_chain_verify: 'on-demand' }));
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run test/unit/calltool-dispatch.test.ts -t "runtime_chain_verify"`

Expected: FAIL because param is not declared/forwarded.

**Step 3: Write minimal implementation**

- Add CLI option to query/context:
  - `--runtime-chain-verify <mode>` with enum `off|on-demand` (default `off`).
- Forward as `runtime_chain_verify` in `tool.ts` call payload.
- Update MCP tool schemas/descriptions for query/context.

**Step 4: Run tests to verify it passes**

Run:
- `npm --prefix gitnexus exec -- vitest run test/unit/calltool-dispatch.test.ts -t "runtime_chain_verify"`
- `node gitnexus/dist/cli/index.js query --help`
- `node gitnexus/dist/cli/index.js context --help`

Expected: PASS and help includes new option.

**Step 5: Commit**

```bash
git add gitnexus/src/cli/index.ts gitnexus/src/cli/tool.ts gitnexus/src/mcp/tools.ts gitnexus/test/unit/calltool-dispatch.test.ts
git commit -m "feat(v1): add explicit runtime chain verify switch"
```

### Task 5: Implement Reload-Focused On-Demand Runtime Chain Verifier

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Create: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`

**Step 1: Write failing unit/integration tests**

```ts
const out = await backend.callTool('query', {
  query: 'Reload NEON.Game.Graph.Nodes.Reloads',
  unity_resources: 'on',
  unity_hydration_mode: 'parity',
  runtime_chain_verify: 'on-demand',
});
expect(out.runtime_chain).toBeDefined();
expect(out.runtime_chain.hops.length).toBeGreaterThan(0);
expect(out.runtime_chain.hops.every((h:any) => !!h.anchor)).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => h.hop_type === 'guid_map')).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /bd387039cacb475381a86f156b54bac2/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /ResultRPM.*GunOutput\\.RPM/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /PickItUp.*EquipWithEvent.*Equip/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /CurGunGraph/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /RegisterEvents/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /StartRoutineWithEvents/i.test(String(h.note || '')))).toBe(true);
expect(out.runtime_chain.hops.some((h:any) => /ReloadBase\\.(GetValue|CheckReload|ReloadRoutine)/i.test(String(h.note || '')))).toBe(true);
```

**Step 2: Run tests to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify on demand"`

Expected: FAIL because verifier path not implemented.

**Step 3: Write minimal implementation**

- Implement verifier stages for Reload V1:
  - collect graph assets from `resourceBindings`
  - map graph `.meta guid` to powerup `gungraph guid`
  - attach code anchors for loader/runtime segments via deterministic file-line checks
- Return:
  - `runtime_chain.status`
  - `runtime_chain.evidence_level`
  - `runtime_chain.hops[]`
  - `runtime_chain.gaps[]`

**Step 4: Run tests to verify it passes**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify on demand|v1 runtime chain gaps are actionable"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/test/integration/local-backend-calltool.test.ts
git commit -m "feat(v1): add on-demand runtime chain verifier for reload workflow"
```

### Task 6: Add Anti-Fake Assertions and Acceptance Artifact Writer

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.ts`
- Create: `gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

**Step 1: Write failing tests for anti-placeholder and semantic closure**

```ts
expect(failures).toContainEqual(expect.stringMatching(/placeholder/i));
expect(failures).toContainEqual(expect.stringMatching(/missing.*code_runtime/i));
expect(failures).toContainEqual(expect.stringMatching(/missing.*guid_map/i));
expect(failures).toContainEqual(expect.stringMatching(/anchor.*file.*not.*exist|anchor.*line.*out.*range|anchor.*snippet.*mismatch/i));
```

**Step 2: Run tests to verify it fails**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts -t "v1 reload acceptance"`

Expected: FAIL because new acceptance checks are absent.

**Step 3: Write minimal implementation**

- Add writer for `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`.
- Enforce assertions:
  - no placeholder in anchors/hints
  - verified_full requires non-empty required-segment hops including `guid_map`
  - low confidence rows require full structured hint
  - anchor authenticity checks: path exists, line in range, snippet/text checksum match
  - continuation check: if one hop has empty process but resource evidence exists, verifier must continue and emit next-hop anchor or actionable gap

**Step 4: Run tests to verify it passes**

Run: `npm --prefix gitnexus exec -- vitest run gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts -t "v1 reload acceptance|phase5 confidence calibration"`

Expected: PASS.

**Step 5: Commit**

```bash
git add gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts
git commit -m "test(v1): add reload acceptance runner with anti-fake assertions"
```

### Task 7: Run Live Reload Acceptance Pack and Persist Evidence

**User Verification: required**

**Files:**
- Create: `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`
- Create: `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md`
- Modify: `docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md`

**Step 1: Run live commands and capture raw output**

```bash
node gitnexus/dist/cli/index.js status -r neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js query -r neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js query -r neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "PickItUp EquipWithEvent WeaponPowerUp Equip CurGunGraph"
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node gitnexus/dist/cli/index.js context -r neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 --file Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand Reload
```

**Step 2: Validate against UC-1..UC-5 checklist**

Run: `node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --repo neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 --require-status-match --out docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`

Expected: PASS with non-empty anchors for resource/guid_map/loader/runtime segments and status metadata (`indexedCommit/currentCommit/upToDate`) persisted in artifact.

**Step 3: Write report markdown**

- Summarize delta vs `docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md`.
- Include exact failed/passed clause IDs and evidence pointers.

**Step 4: Human verification checkpoint**

Run: manual review of generated report and sample anchors.

Expected: reviewer confirms no fabricated anchor and chain semantics are valid.

**Step 5: Commit**

```bash
git add docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.md docs/2026-03-31-neonspark-reload-runtime-chain-fact-check.md
git commit -m "docs(v1): publish reload runtime chain acceptance evidence"
```

### Task 8: Final Regression, Gates, and Handoff Package

**User Verification: required**

**Files:**
- Modify: `docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md`
- Modify: `docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-implementation-plan.md`

**Step 1: Run consolidated regression set**

Run:
- `npm --prefix gitnexus run build`
- `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts test/unit/calltool-dispatch.test.ts`
- `npm --prefix gitnexus run test:u3:gates`

Expected: PASS.

**Step 2: Run authenticity checks script**

Run: `node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json`

Expected: PASS with zero placeholder leakage and semantic closure checks all green.

**Step 3: Update design/plan execution notes**

- Backfill outcomes and residual risks.
- Record any accepted P1 risks explicitly.

**Step 4: Human verification checkpoint**

Run: reviewer spot-checks one full chain from `Reload` to `ReloadBase.CheckReload` with anchors.

Expected: accepted.

**Step 5: Commit**

```bash
git add docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-implementation-plan.md
git commit -m "chore(v1): finalize reload verified chain implementation handoff"
```

### Task 9: Post-Acceptance Hardening (Rollback Gate + Strict Loader/Runtime Anchors)

**User Verification: not-required**

**Files:**
- Create: `gitnexus/src/mcp/local/unity-runtime-chain-verify-config.ts`
- Modify: `gitnexus/src/mcp/local/local-backend.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- Modify: `gitnexus/src/mcp/local/runtime-chain-verify.test.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.ts`
- Modify: `gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts`
- Modify: `gitnexus/test/integration/local-backend-calltool.test.ts`
- Modify: `docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md`

**Step 1: Add failing tests for rollback gate + strict semantic anchors**

- Add integration test: when `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY=off`, `runtime_chain_verify=on-demand` must not emit `runtime_chain`.
- Tighten runtime verifier unit test to assert `code_loader` hop snippet includes `CurGunGraph`.
- Add acceptance-runner negative test: reject artifacts when loader/runtime semantic anchors are missing or weak.

**Step 2: Run test to verify it fails**

Run:
- `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify env gate"`
- `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts -t "v1 reload acceptance enforces loader/runtime semantic anchors"`

Expected: FAIL before hardening.

**Step 3: Implement rollback gate + semantic anchor strengthening**

- Add env parser for `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY` with default enabled.
- In `query/context`, only run `verifyRuntimeChainOnDemand` when request mode is `on-demand` **and** env gate enabled.
- In verifier, resolve `code_loader` anchor to concrete `CurGunGraph` assignment line; if absent, emit actionable `loader` gap instead of silently accepting weak anchor.
- In acceptance validator, require semantic anchor checks for:
  - loader hop: `CurGunGraph` assignment evidence
  - runtime hop: `RegisterEvents|StartRoutineWithEvents|GetValue|CheckReload|ReloadRoutine` closure evidence

**Step 4: Run tests to verify it passes**

Run:
- `npm --prefix gitnexus exec -- vitest run gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts test/integration/local-backend-calltool.test.ts -t "v1 runtime chain verify env gate|v1 runtime chain verify on demand builds reload chain hops|v1 reload acceptance enforces loader/runtime semantic anchors"`
- `npm --prefix gitnexus run test:u3:gates`

Expected: PASS.

**Step 5: Refresh docs execution notes**

- Backfill design doc execution notes with this hardening batch:
  - rollback env gate status
  - strict semantic anchor checks status
  - residual risks update

**Step 6: Commit**

```bash
git add gitnexus/src/mcp/local/unity-runtime-chain-verify-config.ts gitnexus/src/mcp/local/local-backend.ts gitnexus/src/mcp/local/runtime-chain-verify.ts gitnexus/src/mcp/local/runtime-chain-verify.test.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.ts gitnexus/src/benchmark/u2-e2e/reload-v1-acceptance-runner.test.ts gitnexus/test/integration/local-backend-calltool.test.ts docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md
git commit -m "hardening(v1): add runtime verify rollback gate and strict loader/runtime anchor checks"
```

## Plan Audit Verdict

audit_scope: docs/plans/2026-04-01-unity-runtime-process-v1-reload-verified-chain-design.md sections 2-5; UC-1..UC-5 acceptance; anti-fake/authenticity clauses
finding_summary: P0=0, P1=0, P2=0
critical_mismatches:
- none
major_risks:
- Fixed: `guid_map` and graph wiring proof are mandatory for verified closure.
- Fixed: semantic closure now includes deterministic GUID/call-path checks, not shape-only checks.
- Fixed: continuation semantics (`empty process` hop must continue) are explicit and test-gated.
- Fixed: anchor authenticity now requires filesystem existence + line-range + snippet consistency checks.
- Fixed: live-mode provenance now requires status/commit parity capture in acceptance artifact.
- Fixed: global rollback gate now supports `GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY=off` to disable on-demand verifier.
- Fixed: UC-3/UC-4 closure now enforces semantic loader/runtime anchors (`CurGunGraph` assignment + runtime dual anchors).
anti_placeholder_checks:
- Pass: plan enforces placeholder rejection and includes failing-test patterns for leakage.
authenticity_checks:
- Pass: plan requires command provenance, repo alias, status parity, and verify-only authenticity gate.
approval_decision: pass
