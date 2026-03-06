# Kuzu Fallback Edges Investigation (NeonSpark Full Analyze)

Date: 2026-03-06  
Scope: `neonspark` full analyze fallback edges note (`205 edges across 6 types`)

## 1) Symptom

Full analyze summary reported:

```text
Note: 205 edges across 6 types inserted via fallback (schema will be updated in next release)
```

This message did not expose concrete `from->to` pair types and made root-cause triage difficult.

## 2) Reproduction / Evidence

### 2.1 Full pipeline pair-audit (no Kuzu load)

Command runner: `/tmp/neonspark-pair-audit.mjs`  
Target: `/Volumes/Shuttle/projects/neonspark`  
Duration: `1490s` (`24m50s`)

Audit summary:

- `totalFiles`: `136657`
- `totalNodes`: `300571`
- `totalRelationships`: `547858`
- `missingSchemaPairCount`: `7`
- `missingSchemaEdgeCount`: `1554`

Missing schema pairs found in graph:

1. `Method|Delegate` = `1233`
2. `Class|Property` = `200`
3. `Constructor|Property` = `97`
4. `Function|Property` = `17`
5. `Property|Class` = `4`
6. `Property|Interface` = `2`
7. `Class|Delegate` = `1`

Raw summary file:

- `/tmp/neonspark-pair-audit-summary.json`

### 2.2 Indexed DB verification

Indexed repo alias: `neonspark-unity-full-20260306`  
DB edge count query result:

- `MATCH ()-[r:CodeRelation]->() RETURN count(r)` = `538034`

For the 7 missing pairs above, DB query confirms all are `0`:

- `Method|Delegate = 0`
- `Class|Property = 0`
- `Constructor|Property = 0`
- `Function|Property = 0`
- `Property|Class = 0`
- `Property|Interface = 0`
- `Class|Delegate = 0`

## 3) Root Cause

Primary root cause:

1. `RELATION_SCHEMA` does not declare all relationship `FROM -> TO` pairs emitted by the pipeline.
2. During Kuzu load, those pair-level COPY operations fail and enter fallback path.

Contributing issue:

1. CLI summary only prints aggregated fallback note and does not expose pair-level warnings by default, causing under-observability.
2. Message wording says "inserted via fallback", but investigation shows missing-pair edges are absent in final DB (`0` for all 7 missing pairs), so current wording is misleading.

## 4) Impact

1. Relationship loss in Kuzu index for missing schema pairs.
2. Context/query/impact results for affected symbols can be incomplete (notably `Delegate` and `Property` related connections).
3. Current summary message can create false confidence about fallback effectiveness.

## 5) Proposed Fix Direction

1. Expand `RELATION_SCHEMA` to include the 7 missing pairs.
2. Improve fallback observability:
   - print per-pair warning lines in analyze summary (at least top N)
   - report fallback attempted/succeeded/failed counts explicitly
3. Add regression checks:
   - schema coverage test for these pairs
   - full analyze verification on `neonspark` baseline command

## 6) Remediation Progress (2026-03-06, same day)

Implemented:

1. `RELATION_SCHEMA` patched with the 7 missing pairs.
2. Added schema regression test: `gitnexus/src/core/kuzu/schema.test.ts`.
3. Updated analyze fallback summary wording:
   - now reports `attempted/succeeded/failed`
   - no longer claims "inserted" without outcome stats
4. Added fallback summary formatter tests in `gitnexus/src/cli/analyze-summary.test.ts`.

Verification run (post-schema patch):

- command:
  - `node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --force --repo-alias neonspark-unity-full-postschema-20260306`
- exit code: `0`
- duration: `1603s` (`26m43s`)
- summary:
  - `300,569 nodes | 540,067 edges`
  - `KuzuDB 67.9s | FTS 18.4s`
  - no fallback warning line emitted

Post-fix pair checks in DB (`neonspark-unity-full-postschema-20260306`):

- `Method|Delegate = 1228`
- `Class|Property = 201`
- `Constructor|Property = 97`
- `Function|Property = 13`
- `Property|Class = 1`
- `Property|Interface = 2`
- `Class|Delegate = 1`

These pairs were `0` before remediation; they are now present.
