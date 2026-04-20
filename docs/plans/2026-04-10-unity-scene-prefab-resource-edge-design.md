# Unity Scene Prefab Resource Edge Design

Date: 2026-04-10  
Status: Draft accepted in discussion

Implementation update (2026-04-10): Phase 5.5 now extracts `PrefabInstance.m_SourcePrefab` at resource level and emits deduped `UNITY_ASSET_GUID_REF` edges for both `scene->prefab` and `prefab->prefab`, while preserving existing prefab->component enrichment edges.

## 1. Problem

GitNexus currently indexes these two facts separately:

1. a prefab can reference a MonoBehaviour script, producing:
   - `UNITY_COMPONENT_INSTANCE`
   - `UNITY_GRAPH_NODE_SCRIPT_REF`
2. a scene can reference external assets through serialized fields, producing:
   - `UNITY_ASSET_GUID_REF`

But a common Unity pattern is not fully represented:

`scene PrefabInstance -> source prefab asset -> prefab component script`

In neonspark, this appears in:

- `Assets/NEON/Scene/BattleModeScenes/BattleMode.unity`
- `Assets/NEON/Prefab/Systems/BattleMode.prefab`
- `Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs`

The scene contains `PrefabInstance.m_SourcePrefab` pointing to the prefab asset, and the prefab contains `MonoBehaviour.m_Script` pointing to `BattleMode.cs`. The second hop is indexed today; the first hop is not.

As a result, seeded retrieval for the `BattleMode` component cannot close the resource chain from scene to prefab to component, and runtime closure reports `guid_map` / `loader` gaps even though the serialized Unity data exists on disk.

## 2. Goal

Add analyze-time resource edges for Unity prefab instances so that:

- a scene that instantiates a prefab produces a graph-visible resource edge to that prefab asset
- a prefab that instantiates another prefab also produces a graph-visible resource edge
- existing prefab-to-component bindings remain unchanged
- retrieval can stitch:
  - `scene -> prefab`
  - `prefab -> prefab`
  - `prefab -> component`
  - downstream runtime/process evidence

## 3. Non-Goals

- Do not redesign query-time runtime verification.
- Do not introduce a new heavy repo-wide indexing pass.
- Do not attempt a generic "index every YAML reference shape" solution in this change.
- Do not change rule-lab schema or runtime binding rule families.

## 4. Current Root Cause

Current analyze behavior is split across two mechanisms:

1. scan context indexes script guid hits by scanning resources for `m_Script: { guid: ... }`
2. resource processing resolves matched `MonoBehaviour` blocks and persists:
   - component-instance edges
   - graph-node script ref edges
   - asset guid refs derived from resolved serialized references

This misses prefab instance source links because `PrefabInstance.m_SourcePrefab` is neither:

- a script-guid hit used to seed component resolution, nor
- a resolved serialized reference emitted from a matched `MonoBehaviour` binding

So the scene-to-prefab hop never enters the graph.

## 5. Design Options

### Option A. Add a resource-level prefab-instance pass in analyze

During `processUnityResources`, scan `.unity` and `.prefab` files for `PrefabInstance` blocks, parse `m_SourcePrefab`, resolve its guid to an asset path, and emit `UNITY_ASSET_GUID_REF` from the hosting resource file to the prefab file.

Pros:

- directly models the missing graph fact
- no query-time heuristics
- reuses existing `assetGuidToPath`
- covers the exact Unity pattern that is missing

Cons:

- adds one more resource-content pass during analyze
- may increase `UNITY_ASSET_GUID_REF` cardinality if not deduplicated carefully

### Option B. Extend symbol resolver to infer scene->prefab ownership

When resolving a component from a prefab, infer and materialize scene ownership later during retrieval.

Pros:

- minimal analyze-side change

Cons:

- does not solve discovery for cases where the scene does not directly host the target script
- keeps graph incomplete
- pushes a structural fact into query-time inference

### Option C. Generalized external-resource edge extraction

Parse all supported Unity object types and turn every external guid reference into a graph edge.

Pros:

- future-proof
- broader coverage

Cons:

- larger blast radius
- higher edge volume and noise
- unnecessary scope for the current retrieval gap

## 6. Recommendation

Choose **Option A**.

This is the smallest change that fixes the actual missing graph fact. It keeps the retrieval contract stable, does not require new runtime heuristics, and does not require a second meta-database traversal beyond what analyze already builds.

## 7. Proposed Architecture

### 7.1 High-level flow

Inside `processUnityResources`:

1. build the existing Unity scan context
2. keep the existing symbol-driven binding resolution flow unchanged
3. add a resource-level pass over scoped `.unity` / `.prefab` files
4. parse `PrefabInstance` blocks
5. read `m_SourcePrefab`
6. resolve guid to resource path via `scanContext.assetGuidToPath`
7. emit `UNITY_ASSET_GUID_REF`

This creates:

- `BattleMode.unity -> BattleMode.prefab`
- `Host.prefab -> Child.prefab` when a prefab nests another prefab

while preserving the already indexed:

- `BattleMode.prefab -> BattleMode.cs`

### 7.2 Why no extra meta pass is needed

Analyze already builds `assetGuidToPath` from scoped asset meta files as part of `buildUnityScanContext`.

That means this design reuses an existing map:

- input: prefab guid from `m_SourcePrefab`
- output: prefab asset path

So the new work is content parsing and edge emission, not rebuilding a second meta index.

## 8. Data Model

### 8.1 Edge type

Reuse `UNITY_ASSET_GUID_REF`.

Reason:

- the source is still a Unity resource file
- the target is still an external asset identified by guid
- retrieval code already knows how to follow this edge type

This applies to both:

- `scene -> prefab`
- `prefab -> prefab`

### 8.2 Edge payload

Emit reason JSON in the same family as existing asset-guid refs, with fields such as:

```json
{
  "resourcePath": "Assets/NEON/Scene/BattleModeScenes/BattleMode.unity",
  "targetResourcePath": "Assets/NEON/Prefab/Systems/BattleMode.prefab",
  "guid": "e49bc84a92a08425dab0a86fbbd2784b",
  "fileId": "100100000",
  "fieldName": "m_SourcePrefab",
  "sourceLayer": "scene"
}
```

For nested prefab edges, `sourceLayer` would be `prefab`.

This design does **not** make `prefabInstanceObjectId` part of the default persisted graph contract.

Reason:

- the main graph goal in this change is resource reachability, not instance-level override truth
- persisting instance identity by default would push the graph toward instance-level semantics and increase edge cardinality
- current retrieval/process closure only needs to know that the source resource can reach the target prefab asset

If needed later for debugging or parity/evidence views, `prefabInstanceObjectId` can still be exposed through a richer evidence path without making it part of the default relation identity.

### 8.3 Deduplication policy

Deduplicate by:

- source resource file
- target resource file
- `fieldName`
- guid

This intentionally makes the persisted graph **resource-level**, not instance-level.

Consequences:

- if one scene contains multiple instances of the same prefab, the graph may still collapse them into one resource edge
- retrieval can still close `scene -> prefab -> component`
- the graph will not, by itself, distinguish per-instance serialized override differences

## 9. Implementation Sketch

### 9.1 New helper

Add a helper in the Unity ingestion area, for example:

- `collectPrefabSourceAssetRefs(...)`

Responsibilities:

- iterate scoped resource files
- parse cached YAML blocks when available
- filter `PrefabInstance` blocks
- parse `m_SourcePrefab`
- resolve guid to asset path using `assetGuidToPath`
- return normalized ref records

### 9.2 Integration point

Integrate the helper inside `processUnityResources` after scan context is available and before returning.

The new resource-level edge emission should be independent from symbol-by-symbol binding resolution so it still works when no class symbol is being resolved from the scene file itself.

### 9.3 Parser compatibility

Current YAML object parsing already supports `PrefabInstance` blocks, so this change should not require a new parser family. It only needs to consume an object type that is already parsed.

## 10. Performance and Cost

### 10.1 Meta index cost

No additional full meta traversal is required beyond the existing analyze path.

For full-repo analyze, the current system already builds:

- script meta index
- asset meta index

This design reuses the existing asset-guid map.

### 10.2 Resource scan cost

The added cost is an extra resource-content pass over scoped `.unity` / `.prefab` files, or reuse of already loaded block caches where possible.

Order of magnitude:

- proportional to resource file byte size
- cheaper than building another full asset meta index
- acceptable for Unity analyze because the pass is streaming/parsing local files only

### 10.3 Expected overhead

Expected overhead is medium-low:

- CPU: modest increase from parsing `PrefabInstance` blocks
- memory: low if reusing per-file parsed blocks and emitting compact ref rows
- storage: moderate edge growth, bounded by prefab instance count

The main variable is edge cardinality in large scenes with many prefab instances. Reusing `UNITY_ASSET_GUID_REF` keeps retrieval changes minimal, and resource-level deduplication keeps growth bounded.

## 11. Semantics and Limits

This design deliberately adds **resource-level closure**, not **instance-level override truth**.

That means the graph will be able to answer:

- does this scene reference this prefab?
- does this prefab reference another prefab?
- can this resource chain reach a component-bearing prefab?

But it will not fully answer:

- which exact prefab instance in the scene produced the path?
- whether two instances of the same prefab have different serialized override values
- whether a specific bool/enum override changes the actual runtime branch taken

### 11.1 Why this is acceptable for current process analysis

Current process analysis is primarily about:

- resource-to-code binding reachability
- graph closure across resource / bind / bridge / runtime segments
- static or synthetic call continuity

It is not yet a serialized-value-sensitive execution engine. For that reason, resource-level edges are sufficient for the current BattleMode-style closure gap.

### 11.2 Future extension path

If GitNexus later expands process analysis to confirm actual runtime path selection from serialized values, resource-level edges alone will not be enough.

That future mode would need instance-level evidence such as:

- `prefabInstanceObjectId`
- the linked `m_SourcePrefab`
- override targets from `m_Modification`
- `propertyPath`
- resolved final value after scene/prefab override merge

In other words, future value-sensitive process confirmation would require an **instance-level evidence channel**, not just a single extra field on a resource edge.

This document therefore treats instance-sensitive override analysis as a later extension, separate from the current resource-closure fix.

## 12. Risks

### Risk 1. Edge explosion in large scenes

Mitigation:

- dedupe aggressively
- only emit for resolved external prefab paths
- skip built-in or unresolved guids

### Risk 2. Ambiguous semantics for nested prefab instances

Mitigation:

- start with direct `m_SourcePrefab` only
- do not infer transitive nested prefab ancestry in this change

### Risk 3. Query ranking noise

Mitigation:

- reuse existing exact `resource_path_prefix` narrowing
- if needed later, add a lightweight ranking penalty for ubiquitous prefab refs rather than blocking indexing now

### Risk 4. Future confusion between resource-level and instance-level truth

Mitigation:

- document clearly that persisted edges are resource-level
- avoid claiming per-instance serialized override truth from these edges
- reserve instance-level reasoning for a future evidence model

## 13. Testing Plan

### 12.1 Unit tests

Add ingestion tests covering:

1. scene prefab instance produces `UNITY_ASSET_GUID_REF` to prefab
2. prefab nested prefab instance produces `UNITY_ASSET_GUID_REF` to child prefab
3. prefab script binding still produces `UNITY_GRAPH_NODE_SCRIPT_REF`
4. combined chain exists:
   - `scene -> prefab`
   - `prefab -> prefab` where applicable
   - `prefab -> class`
5. unresolved prefab guid does not emit an edge
6. duplicate prefab instance records do not create duplicate graph rows unintentionally under resource-level dedupe

### 12.2 Fixture shape

Add or extend a mini Unity fixture with:

- one scene
- one prefab instance in that scene
- one prefab with a MonoBehaviour
- matching `.meta` files

### 12.3 Retrieval regression

Add a focused regression around the retrieval gap:

- seed by `BattleMode` class or equivalent fixture symbol
- confirm resource evidence can surface both scene and prefab hops

If a neonspark fixture is too heavy for unit tests, use a minimized synthetic fixture and keep neonspark as manual validation evidence.

## 14. Rollout

1. land analyze-time edge generation behind normal test coverage
2. re-analyze neonspark
3. verify that `BattleMode.unity -> BattleMode.prefab -> BattleMode.cs` is present in Cypher
4. verify seeded query/context no longer reports the same `guid_map` gap for this chain

## 15. Resolved Decisions

1. `PrefabInstance.m_SourcePrefab` should emit both:
   - `scene -> prefab`
   - `prefab -> prefab`
2. Reuse `UNITY_ASSET_GUID_REF`; do not introduce a new relation type for this change.
3. Persist the graph at resource level by default; do not require `prefabInstanceObjectId` in the default graph contract.
4. Treat per-instance override truth as a future evidence-layer extension, not part of this change.

## 16. Decision Summary

We should fix this at analyze time by indexing `PrefabInstance.m_SourcePrefab` as a resource edge using the existing asset guid map.

The persisted graph should stay resource-level for now:

- include `scene -> prefab`
- include `prefab -> prefab`
- keep using `UNITY_ASSET_GUID_REF`
- do not model per-instance override truth in the default graph

This closes the current Unity resource-binding gap with low conceptual risk, moderate runtime cost, and no extra full meta-database traversal beyond the current analyze pipeline, while leaving room for a future instance-level evidence model if process analysis becomes serialized-value-sensitive.
