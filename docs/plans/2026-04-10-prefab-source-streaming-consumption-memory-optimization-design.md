# Prefab Source Streaming Consumption Memory Optimization Design

Date: 2026-04-10
Status: Proposed
Owner: GitNexus

## 1. Context

Current As-Built architecture already aligns with carrier/consumer split:

1. `scan-context` identifies resource signals.
2. `processUnityResources` is the unified consumer and graph writer.
3. `prefab-source` no longer uses an independent heavy parse pass.

However, A/B data still shows meaningful memory impact when prefab-source is ON, because data is still materialized in multiple in-memory forms before final graph persistence.

## 2. Problem Statement

Even after moving `m_SourcePrefab` recognition into scan-context, memory can still spike due to:

1. Full in-memory `prefabSourceRefs[]` accumulation.
2. Additional in-memory dedupe structures in consumer phase.
3. Large volume relationship object materialization before persistence.
4. Rule-processing stage scanning/parsing all `UNITY_ASSET_GUID_REF` relationship reasons.

This is now a "materialization cost" problem, not a "YAML heavy parse" problem.

## 3. Design Goals

1. Preserve existing mainline contract in `UNITY_RESOURCE_BINDING.md`:
- `scan-context` stays carrier-only.
- `processUnityResources` stays unified consumer/writer.
2. Eliminate intermediate full-array accumulation for prefab-source signals.
3. Guarantee no cross-signal key collision, no duplicate edges, no silent loss.
4. Bound peak memory during recognition + consumption.
5. Keep graph contract stable (`UNITY_ASSET_GUID_REF` + reason fields).

## 4. Non-Goals

1. No change to query-time runtime closure semantics.
2. No change to relation type or reason contract field names.
3. No broad redesign of global graph storage in this phase.
4. No behavioral coupling between script-guid flow and prefab-source flow.

## 5. Mainline Alignment (Authoritative)

This design explicitly follows `UNITY_RESOURCE_BINDING.md`:

1. Carrier responsibilities remain in scan phase.
2. Unified write responsibilities remain in Phase 5.5 consumer.
3. Two-stage architecture remains intact.

Important clarification:

- "Stream while consume" means streaming delivery from carrier to consumer.
- It does not mean scan-context writes graph edges.

## 6. Signal Model and Row Semantics

## 6.1 Separate Signals (No Mixing)

A single source file may produce both signal types, but as separate rows:

1. `script-guid-hit` row(s) for A/B path (filter + resolver).
2. `prefab-source-ref` row(s) for C path (`UNITY_ASSET_GUID_REF`).

They are never merged into one polymorphic row.

## 6.2 Row Contracts

`ScriptGuidHitRow` (existing flow)

1. `sourceResourcePath`
2. `scriptGuid`
3. `line`
4. `resourceType`

`PrefabSourceRefRow` (prefab-source flow)

1. `sourceResourcePath`
2. `targetGuid`
3. `targetResourcePath`
4. `fileId`
5. `fieldName` (fixed `m_SourcePrefab`)
6. `sourceLayer` (`scene | prefab`)

## 7. Ownership and Mutation Safety

To avoid pointer/alias conflicts:

1. Scan producer emits immutable value rows.
2. Consumer is the only writer of graph edges.
3. Consumer does not mutate producer-held state.
4. Any normalized/transient fields are derived locally in consumer scope.

Invariant:

- producer owns recognition state
- consumer owns write state
- no shared mutable row object crosses boundaries

## 8. Exactly-Once and De-dup Strategy

## 8.1 De-dup Keys by Signal Type

Prefab-source dedupe key:

`source|target|fieldName|guid`

Script-guid flow uses an independent key model (for its own semantics).

No cross-signal dedupe map is shared.

## 8.2 Per-Source Partitioned De-dup

To prevent unbounded dedupe memory:

1. Maintain dedupe set per source resource file.
2. Emit/consume all rows for one file.
3. Release that file-level set immediately.

This preserves correctness while bounding dedupe memory by local file cardinality rather than global scope cardinality.

## 8.3 Deterministic Filters

Consumer applies uniform filters before write:

1. reject empty source/target
2. reject placeholder target (`__PLACEHOLDER__`)
3. reject zero-guid
4. reject unresolved target path

Invariant:

`rows_parsed = rows_filtered + rows_emitted`

## 9. Streaming Delivery and Backpressure

## 9.1 Delivery Interface

Replace full-array return for prefab-source with one of:

1. `AsyncGenerator<PrefabSourceRefRow>` (preferred)
2. push callback API `onPrefabSourceRef(row)`

Scan-context remains carrier; interface only changes delivery shape.

## 9.2 Consumer Mode

`processUnityResources` consumes stream incrementally:

1. read one row/chunk
2. normalize + filter + dedupe
3. write relationship
4. discard row/chunk

No global `prefabSourceRefs[]` retention.

## 9.3 Bounded Buffer

If producer/consumer are decoupled by queue:

1. fixed max queue size (e.g. 256/512 rows)
2. producer pauses when full
3. consumer drains then resumes producer

This enforces hard backpressure and prevents runaway accumulation.

## 10. Memory Hotspots and Mitigations

## 10.1 Hotspot A: Intermediate Signal Materialization

Mitigation:

1. remove global prefab-source array
2. use streaming rows + immediate disposal

## 10.2 Hotspot B: De-dup String Growth

Mitigation:

1. per-source dedupe set
2. optional compact hashed key storage for dedupe keys

## 10.3 Hotspot C: Relationship Reason Parse Overhead in Rule Stage

Mitigation (follow-up phase):

1. avoid repeated `JSON.parse(reason)` in hot loops when routing by `fieldName`
2. cache parsed minimal fields or carry compact structured metadata for rule matching

## 10.4 Hard Constraint Note

As long as all relationships are retained in in-memory graph maps before persistence, memory still grows with final edge count. This design removes intermediate duplication, not final graph footprint itself.

## 11. Failure Handling

1. malformed row: drop + increment categorized counter
2. per-file scan error: isolate to file, continue next file
3. unresolved target GUID: filter out deterministically
4. backpressure timeout (if any): fail fast with explicit diagnostic

No silent fallback to broad full-memory behavior.

## 12. Observability and Auditability

Add structured diagnostics counters:

1. `prefab_source.files_scanned`
2. `prefab_source.rows_parsed`
3. `prefab_source.rows_filtered_zero_guid`
4. `prefab_source.rows_filtered_placeholder`
5. `prefab_source.rows_filtered_unresolved`
6. `prefab_source.rows_deduped`
7. `prefab_source.rows_emitted`
8. `prefab_source.max_queue_depth` (if queue used)

Acceptance accounting:

`rows_parsed = sum(filtered_*) + rows_deduped + rows_emitted`

## 13. Test Strategy

## 13.1 Correctness

1. one source file emits both signal types as separate rows
2. duplicate prefab rows emit exactly one relationship
3. placeholder/unresolved/zero-guid rows are dropped
4. reason payload contract stays unchanged

## 13.2 Mainline Contract

1. scan-context does not write graph
2. processUnityResources remains the only prefab-source edge writer
3. existing doc-contract test updated to assert delivery-shape change without role change

## 13.3 Memory Regression

A/B on fixed neonharness case:

1. OFF: `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1`
2. ON: default
3. command parity strict check
4. compare max RSS and peak memory footprint

Success target for this phase:

- ON remains functionally equivalent
- ON memory delta reduced versus current As-Built baseline

## 14. Rollout Plan

Phase 1 (low risk)

1. introduce streaming prefab-source delivery API
2. adapt consumer to incremental consumption
3. preserve edge contract and tests

Phase 2 (medium risk)

1. per-source dedupe partitioning
2. compact dedupe key representation

Phase 3 (optional follow-up)

1. rule-stage reason parse optimization
2. evaluate relation spill/persist strategy if final graph footprint remains dominant

## 15. Risks and Trade-offs

1. Streaming interface complexity increases code path surface.
2. Incorrect backpressure implementation can cause deadlock/starvation.
3. Per-source dedupe assumes file-bounded uniqueness semantics are sufficient; this must be validated against global dedupe expectations.

## 16. Decision

Adopt streaming delivery from scan-context to processUnityResources while preserving carrier/consumer boundary and signal separation. This is the minimum-change path that targets current memory hotspots without violating resource binding mainline clarity.
