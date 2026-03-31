# Kuzu Fallback Edges Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate missing relationship loss from Kuzu load fallback path and make fallback behavior observable and truthful in CLI summary.

**Architecture:** Apply a two-lane fix: (1) schema coverage patch for known missing `FROM->TO` pairs, (2) loader/summary observability patch so fallback no longer hides pair-level failures and no longer overclaims insertion success.

**Tech Stack:** TypeScript (Node ESM), GitNexus ingestion pipeline, KuzuDB adapter, Node test runner.

---

### Task 1: Add schema coverage for known missing pairs

**Files:**
- Modify: `gitnexus/src/core/kuzu/schema.ts`
- Test: `gitnexus/src/core/kuzu/schema.test.ts` (new if missing)

**Steps:**
1. Add missing pair entries to `RELATION_SCHEMA`:
   - `FROM Method TO \`Delegate\``
   - `FROM Class TO \`Property\``
   - `FROM \`Constructor\` TO \`Property\``
   - `FROM Function TO \`Property\``
   - `FROM \`Property\` TO Class`
   - `FROM \`Property\` TO Interface`
   - `FROM Class TO \`Delegate\``
2. Add/extend schema test to assert these pairs are present in `RELATION_SCHEMA`.
3. Run targeted tests + build.

### Task 2: Make fallback insertion result measurable

**Files:**
- Modify: `gitnexus/src/core/kuzu/kuzu-adapter.ts`
- Test: `gitnexus/src/core/kuzu/kuzu-adapter.test.ts` (or nearest existing test file)

**Steps:**
1. Change `fallbackRelationshipInserts` to return stats:
   - attempted rows
   - successful inserts
   - failed inserts
2. Surface those stats in `loadGraphToKuzu` return payload.
3. Ensure warning payload contains pair-level details and counts without truncating pair identity.
4. Add unit tests for returned fallback stats semantics.

### Task 3: Fix analyze summary wording and diagnostics detail

**Files:**
- Modify: `gitnexus/src/cli/analyze.ts`
- Modify: `gitnexus/src/cli/analyze-summary.ts`
- Test: `gitnexus/src/cli/analyze-summary.test.ts`

**Steps:**
1. Replace current fallback note wording:
   - from: "inserted via fallback"
   - to: explicit attempted/succeeded/failed wording
2. Print top-N pair-level warning lines in summary.
3. Extend summary tests for fallback-detail formatting.

### Task 4: End-to-end verification on NeonSpark baseline command

**Files:**
- Modify: `docs/reports/2026-03-06-kuzu-fallback-edges-investigation.md`
- Modify: `docs/2026-03-06-neonspark-full-analyze-performance-runbook.md`

**Steps:**
1. Run full command:
   - `node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --force --repo-alias neonspark-unity-full-<tag>`
2. Verify:
   - fallback missing-pair note no longer reports those 7 pairs as failed
   - pair counts for 7 pairs are now non-zero in DB
3. Record before/after comparison and any performance drift.

### Task 5: Regression guards

**Files:**
- Modify: `gitnexus/src/cli/analyze-multi-scope-regression.test.ts` (if suitable)
- Add: targeted loader/schema regression test file as needed

**Steps:**
1. Add regression test that fails when schema omits audited pair set.
2. Add regression test that asserts fallback summary formatting includes pair detail + true outcome counts.
3. Run full relevant suite before merge.

