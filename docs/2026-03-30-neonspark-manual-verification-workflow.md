# Neonspark Manual Verification Workflow (2026-03-30)

## Scope

This note summarizes the tools used in the `FirearmsPowerUp -> 1_weapon_orb_key -> GunGraph -> Node classes` validation beyond GitNexus itself, and the recommended workflow for similar Unity resource-binding investigations.

## Non-GitNexus Tools Used

### 1. `gitnexus` CLI

GitNexus was still the primary retrieval tool, but used through local CLI rather than MCP because no GitNexus MCP server was attached in the session.

Commands used in practice:

```bash
gitnexus status
gitnexus context -r neonspark --unity-resources on --unity-hydration compact FirearmsPowerUp
gitnexus unity-bindings --target-path /Volumes/Shuttle/unity-projects/neonspark --json FirearmsPowerUp
gitnexus query -r neonspark --unity-resources on --unity-hydration parity "1_weapon_orb_key"
gitnexus cypher -r neonspark "MATCH ..."
```

### 2. `rg`

`rg` was the main fallback verification tool once the graph/context result narrowed the search space.

Use cases:

- locate the concrete Unity asset path for `1_weapon_orb_key`
- search serialized references such as `gungraph: {fileID..., guid...}`
- map Unity `.meta` GUIDs back to source files
- enumerate script GUIDs embedded inside a `.asset` graph file

Representative commands:

```bash
rg -n "1_weapon_orb_key|FirearmsPowerUp|GunGraph" /path/to/repo/Assets/NEON -S
rg --files /path/to/repo/Assets/NEON | rg '/1_weapon_orb_key(\.|_)'
rg -n "guid: <guid>$" /path/to/repo/Assets/NEON -g '*.meta' -S
```

### 3. `sed`

`sed -n` was used to inspect exact YAML slices without opening huge Unity assets in full.

Use cases:

- inspect the target `WeaponPowerUp` asset
- inspect the linked `GunGraph` asset around the root object and `nodes:` list
- inspect source files around the relevant type declarations

Representative commands:

```bash
sed -n '1,260p' Assets/.../1_weapon_orb_key.asset
sed -n '900,1060p' Assets/.../Graphs/.../1_weapon_orb_key.asset
sed -n '1,120p' Assets/.../WeaponPowerUp.cs
```

### 4. Unity YAML + `.meta` cross-resolution

This was the most important non-GitNexus technique.

Pattern used:

1. Read `m_Script.guid` from a Unity `.asset`
2. Resolve that GUID via the corresponding `.cs.meta`
3. Read serialized object fields in the `.asset`
4. Resolve referenced asset GUIDs via their `.meta`
5. Open the referenced `.asset`
6. Extract all embedded `m_Script.guid` values
7. Resolve each GUID back to a concrete Node class file

This was how the final `Node` class set was verified from serialized truth instead of inferred only from graph search.

### 5. Shell iteration

A small shell loop was used to transform the graph asset's embedded script GUID list into file paths.

Example shape:

```bash
for g in $(...unique guids...); do
  find ... -name '*.meta' -print0 | xargs -0 rg -l "^guid: $g$"
done
```

This is useful when a Unity graph asset stores many embedded node instances and you need a deterministic class inventory.

## Recommended Workflow

For Unity serialized/resource-binding investigations in real repos, use this order.

### 1. Start with GitNexus for narrowing

Use GitNexus first to identify:

- the target symbol
- whether the index is fresh
- likely resource-binding paths
- likely graph asset names
- likely related graph/node code

Recommended starting commands:

```bash
gitnexus status
gitnexus context -r <repo> --unity-resources on --unity-hydration compact <symbol>
gitnexus query -r <repo> --unity-resources on --unity-hydration compact "<asset-or-concept>"
```

If compact hydration looks incomplete, retry with parity.

### 2. Switch to Unity serialized truth for final proof

Once GitNexus identifies candidate assets, verify the actual Unity serialization directly:

- open the target `.asset`
- check `m_Script` to determine the real runtime/editor type
- inspect fields that reference other assets by GUID
- resolve each GUID through `.meta`

This step is required when the question is about "what this resource actually references" rather than "what code is conceptually related."

### 3. Resolve graph internals from the graph asset itself

For `GunGraph`, `MeleeGraph`, and similar graph assets:

- locate the root graph object
- confirm its script GUID and graph class
- read the `nodes:` list
- collect every embedded `m_Script.guid`
- dedupe and map back to Node class files

This gives the concrete serialized node-class inventory, which is stronger evidence than caller/callee relationships alone.

### 4. Use code files only after the asset chain is confirmed

After the asset chain is proven, open code to explain the meaning of the references:

- inheritance relationship, for example `WeaponPowerUp : FirearmsPowerUp`
- field declaration, for example `public GunGraph gungraph;`
- graph base type, for example `GunGraph : GameNodeGraph`

This prevents reasoning from drifting away from what the Unity asset actually serializes.

## Recommended Decision Rules

### Prefer GitNexus when

- you need to find likely symbols or assets quickly
- you are disambiguating duplicate names
- you want graph/context/process relationships
- you need a candidate set before touching large Unity YAML files

### Prefer direct file inspection when

- you need exact serialized type identity
- you need exact asset-to-asset references
- you need the concrete contents of a graph asset
- the answer depends on GUID-based Unity serialization truth

### Prefer both when

- the target is a Unity ScriptableObject or graph asset
- the question crosses code symbols and serialized resources
- you need a final answer that is both fast to obtain and defensible

## Practical Template

```bash
# 1. Confirm index freshness
gitnexus status

# 2. Narrow with GitNexus
gitnexus context -r <repo> --unity-resources on --unity-hydration compact <symbol>
gitnexus query -r <repo> --unity-resources on --unity-hydration compact "<asset-name>"

# 3. Locate concrete Unity assets
rg -n "<symbol-or-asset>" /path/to/repo/Assets -S
rg --files /path/to/repo/Assets | rg '<asset-name>'

# 4. Inspect serialized truth
sed -n '1,260p' Assets/.../<asset>.asset
cat Assets/.../<asset>.asset.meta

# 5. Resolve referenced graph
sed -n '900,1060p' Assets/.../<graph>.asset
cat Assets/.../<graph>.asset.meta

# 6. Enumerate embedded node classes
rg -o 'm_Script: \{fileID: 11500000, guid: [0-9a-f]+' Assets/.../<graph>.asset
find /path/to/repo/Assets -name '*.meta' -print0 | xargs -0 rg -l "^guid: <guid>$"
```

## Key Takeaway

The most reliable real-repo Unity workflow is:

1. GitNexus for retrieval and narrowing
2. `rg` for file/GUID discovery
3. `sed` for targeted YAML inspection
4. `.meta` GUID resolution for type identity
5. code inspection last, to explain confirmed serialized facts

For Unity-heavy repos like `neonspark`, this combination is faster and more trustworthy than using either graph search alone or raw grep alone.
