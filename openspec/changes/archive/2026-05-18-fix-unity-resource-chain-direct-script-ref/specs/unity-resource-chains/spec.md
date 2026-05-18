# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-resource-chains`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认 capability 清单无误（1 个 Modified：unity-resource-chains）

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: ResourceChainTypeSupportsOneHop

The `UnityResourceChainPayload` type SHALL support both two-hop chains (source → `UNITY_ASSET_GUID_REF` → intermediate → `UNITY_GRAPH_NODE_SCRIPT_REF` → target) and one-hop chains (source → `UNITY_GRAPH_NODE_SCRIPT_REF` → target).

For one-hop chains:
- `relationType` SHALL be `'UNITY_GRAPH_NODE_SCRIPT_REF'`
- `intermediateResourcePath` SHALL be `undefined`
- `nextRelationType` SHALL be `undefined`
- `nextRelationReason` SHALL be `undefined`

For two-hop chains:
- `relationType` SHALL be `'UNITY_ASSET_GUID_REF'`
- `intermediateResourcePath` SHALL be the intermediate resource file path
- `nextRelationType` SHALL be `'UNITY_GRAPH_NODE_SCRIPT_REF'`

#### Scenario: One-hop chain from direct prefab-to-Class edge

- **WHEN** `loadSeedUnityResourceChains` is invoked with a `seedPath` pointing to a prefab that has a `UNITY_GRAPH_NODE_SCRIPT_REF` edge to a Class
- **THEN** a one-hop chain SHALL be returned with `relationType = 'UNITY_GRAPH_NODE_SCRIPT_REF'`, `intermediateResourcePath = undefined`, and `targetSymbol` matching the Class

#### Scenario: Two-hop chain through GUID ref

- **WHEN** `loadSeedUnityResourceChains` is invoked with a `seedPath` pointing to an asset that has a `UNITY_ASSET_GUID_REF` edge to an intermediate that has a `UNITY_GRAPH_NODE_SCRIPT_REF` edge to a Class
- **THEN** a two-hop chain SHALL be returned with `relationType = 'UNITY_ASSET_GUID_REF'`, `intermediateResourcePath` set, and `targetSymbol` matching the Class

### Requirement: SeedChainsQueryOneHop

`loadSeedUnityResourceChains` SHALL query both two-hop chains (`UNITY_ASSET_GUID_REF → UNITY_GRAPH_NODE_SCRIPT_REF`) and one-hop chains (`UNITY_GRAPH_NODE_SCRIPT_REF` direct to Class) from the seed path.

The one-hop query SHALL:
- Match `(source:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(target)`
- Where `labels(target)[0]` is `'Class'`
- Be executed alongside the existing two-hop query (union or sequential, within the same function call)

Results from both queries SHALL be merged into a single deduplicated, scored, and sorted chain list.

#### Scenario: Prefab with direct script references

- **WHEN** `loadSeedUnityResourceChains` is called with `seedPath = 'Assets/NEON/Prefab/UI/ui_mobile/btnUtilityShortcut.prefab'`
- **THEN** the result SHALL include chains for at least `MobileUtilitySetShortcut`, `TouchButtonControl`, and `TMPFontOverride` via one-hop `UNITY_GRAPH_NODE_SCRIPT_REF` edges

#### Scenario: Asset with GUID refs to other assets with scripts

- **WHEN** `loadSeedUnityResourceChains` is called with a `seedPath` pointing to a ScriptableObject that GUID-references another asset that uses a script
- **THEN** the result SHALL include two-hop chains via `UNITY_ASSET_GUID_REF → UNITY_GRAPH_NODE_SCRIPT_REF`

### Requirement: BindingsToChainsFallback

When `resource_chains` is empty after `loadSeedUnityResourceChains` (either because `seedPath` is absent or because the seed yielded no chains), and `resourceBindings` from `loadUnityContext` contains one or more entries, the context handler and query handler SHALL generate one-hop chain entries from each binding.

Each generated chain SHALL have:
- `sourceResourcePath = binding.resourcePath`
- `relationType = 'UNITY_GRAPH_NODE_SCRIPT_REF'`
- `intermediateResourcePath = undefined`
- `nextRelationType = undefined`
- `targetSymbol.uid / .name / .filePath` from the current symbol context

The generated chains SHALL be used as `result.resource_chains` after the seed-based query returns empty.

#### Scenario: Query by Class name with bindings but no seedPath

- **WHEN** `context` or `query` is invoked for `MobileUtilitySetShortcut` with `unity_resources=on` and no `resource_path_prefix`
- **AND** `loadUnityContext` resolves bindings to `btnUtilityShortcut.prefab`
- **AND** `seedPath` is undefined (so `loadSeedUnityResourceChains` returns `[]`)
- **THEN** `resource_chains` SHALL contain a one-hop chain entry with `sourceResourcePath = 'Assets/NEON/Prefab/UI/ui_mobile/btnUtilityShortcut.prefab'` and `targetSymbol.name = 'MobileUtilitySetShortcut'`

#### Scenario: Query by Class name with seedPath that yields chains

- **WHEN** `context` or `query` is invoked with both a `resource_path_prefix` and the seed yields chains from `loadSeedUnityResourceChains`
- **THEN** the bindings→chains fallback SHALL NOT override the seed-based chains

### Requirement: ChainFilterAcceptsOneHop

`buildResourceChains` in the response layer SHALL accept chain entries where `intermediateResourcePath` is `undefined` (one-hop chains).

The filter condition SHALL be:
- `chain.sourceResourcePath` is truthy
- `chain.targetSymbol` is truthy
- `chain.intermediateResourcePath` is NOT required to be truthy

#### Scenario: One-hop chain passes filter

- **WHEN** a chain entry has `sourceResourcePath = 'Assets/...'`, `targetSymbol = { name: '...' }`, and `intermediateResourcePath = undefined`
- **THEN** the chain SHALL pass the `buildResourceChains` filter and appear in the slim response output

#### Scenario: Chain with missing source path is filtered out

- **WHEN** a chain entry has `sourceResourcePath = ''` or `undefined`
- **THEN** the chain SHALL be filtered out

#### Scenario: Chain with missing target symbol is filtered out

- **WHEN** a chain entry has `targetSymbol = undefined` or no `targetSymbol.name`
- **THEN** the chain SHALL be filtered out
