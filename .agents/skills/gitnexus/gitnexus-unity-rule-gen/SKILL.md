---
name: gitnexus-unity-rule-gen
description: "Reduced rule-lab workflow for Unity analyze_rules authoring from exact source/target gaps. Use when: 'create unity rules', 'generate analyze rules', 'fill sparse runtime gap'."
---

# Unity Reduced Rule-Lab Authoring

This skill is the post-rollback workflow.

Primary path:

1. Gather user-confirmed exact source/target pair(s).
2. Run reduced `rule-lab` flow.
3. Enforce 3 guards before promote.
4. Verify via analyze + CLI graph checks (not MCP session query/context).

`gap-lab` slice discovery is legacy and is not the default product workflow.

Read first:

- `gitnexus/skills/_shared/unity-gap-lab-contract.md`
- `docs/unity-runtime-process-source-of-truth.md`
- `docs/gap-lab-rule-lab-architecture.md`

## Hard Boundaries

1. Query-time runtime closure remains graph-only.
2. Event/delegate large-scale gaps are analyzer work, not rule-authoring work.
3. This skill is for sparse irregular gaps only.

## Input Contract (required)

Provide exact pair intent for each candidate:

- source class + source method
- target class + target method
- expected missing runtime hop

If anchors are ambiguous (multiple candidate methods/classes), stop and ask user to choose explicit options. Do not auto-guess.

## Reduced Flow

### Phase A: Prepare exact pairs

1. Confirm repo and index freshness.
2. Normalize candidate pairs into explicit source/target tuples.
3. Run duplicate precheck against `.gitnexus/rules/approved/*.yaml`.

### Phase B: Analyze

```bash
gitnexus rule-lab analyze --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

Use `analyze` as proposal generation step for exact pairs, not as exhaustive candidate reduction from gap-lab universe.

### Phase C: Review and curate

```bash
gitnexus rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
gitnexus rule-lab curate --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --input-path "$CURATION_JSON_PATH"
```

### Phase D: Promote

```bash
gitnexus rule-lab promote --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

## Three Mandatory Guards

1. Duplicate-prevention:
   - Block if pair already covered by `rules/approved/*.yaml`.
2. Fail-closed binding resolution:
   - Block if unresolved binding remains.
   - `UnknownClass` / `UnknownMethod` placeholders are forbidden.
3. Non-empty evidence before promote:
   - `confirmed_chain.steps` (or equivalent) must be non-empty.

## Verification

1. Re-run analyze for target repo scope.
2. Verify synthetic edges with **CLI in a fresh process** (for example `gitnexus cypher` / `gitnexus query`).
3. Do not use current MCP session `query/context` as synthetic-edge acceptance evidence immediately after analyze/rebuild.
4. Keep closure claims aligned to graph-only semantics.
5. Under `hydration_policy=strict` with `fallbackToCompact=true`, run parity before final closure conclusion.

Suggested acceptance check (example):

```bash
gitnexus cypher --repo "$REPO_ALIAS" \
  "MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b)
   WHERE r.reason STARTS WITH 'unity-rule-'
   RETURN a.name, b.name, r.reason
   LIMIT 50"
```

## Legacy Note

If historical `.gitnexus/gap-lab/runs/**` artifacts exist, treat them as migration evidence only. Do not require gap-lab parity/coverage gates for new reduced-rule-lab authoring loops.
