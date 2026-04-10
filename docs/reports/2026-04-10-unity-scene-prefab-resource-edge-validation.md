# 2026-04-10 Unity Scene-Prefab Resource Edge Validation

## Scope
Validate analyze-time `PrefabInstance.m_SourcePrefab` resource-edge emission and closure in `neonspark-core`.

## Environment
- Repo analyzed: `/Volumes/Shuttle/unity-projects/neonspark`
- Alias: `neonspark-core`
- CLI used for final verification: local build
  - `node gitnexus/dist/cli/index.js`
  - with `NODE_OPTIONS=--max-old-space-size=16384` for force reanalyze stability

## Commands and Results

1. Force reanalyze with local CLI implementation

```bash
NODE_OPTIONS=--max-old-space-size=16384 node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --sync-manifest-policy keep --force
```

Result:
- Exit code: 0
- Analyzer diagnostics include: `prefab-source: emitted=56445`
- Graph size: `112,367 nodes | 539,884 edges`

2. Confirm BattleMode scene->prefab->class closure

```bash
MATCH (s:File)-[:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->(p:File)-[:CodeRelation {type:'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(c:Class)
WHERE s.filePath='Assets/NEON/Scene/BattleModeScenes/BattleMode.unity'
  AND c.name='BattleMode'
  AND c.filePath='Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs'
RETURN s.filePath, p.filePath, c.filePath, c.name
LIMIT 20
```

Result:
- `row_count = 1`
- Row:
  - `Assets/NEON/Scene/BattleModeScenes/BattleMode.unity`
  - `Assets/NEON/Prefab/Systems/BattleMode.prefab`
  - `Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs`
  - `BattleMode`

3. Confirm edge reason is from prefab-source extraction

```bash
MATCH (s:File)-[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->(p:File)
WHERE s.filePath='Assets/NEON/Scene/BattleModeScenes/BattleMode.unity'
  AND p.filePath='Assets/NEON/Prefab/Systems/BattleMode.prefab'
RETURN s.filePath, p.filePath, r.reason
LIMIT 5
```

Result:
- `row_count = 1`
- `r.reason` includes:
  - `"fieldName":"m_SourcePrefab"`
  - `"sourceLayer":"scene"`
  - `"guid":"e49bc84a92a08425dab0a86fbbd2784b"`

4. Investigate package-scope sample row (`Controls.unity`)

```bash
MATCH (s:File)-[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->(p:File)
WHERE s.filePath='Packages/com.unity.inputsystem.switch/Samples~/InputAndControllerApplet/Scenes/Controls.unity'
  AND p.filePath='Packages/com.unity.inputsystem.switch/Samples~/InputAndControllerApplet/Prefabs/Controller.prefab'
RETURN s.filePath, p.filePath, r.reason
LIMIT 5
```

Result:
- Appears due to scope including `Packages` in sync-manifest.
- Two reasons observed for same pair:
  - `fieldName: m_SourcePrefab` (new extraction path)
  - `fieldName: gamepadPrefab` (existing resolved-reference path)

## Acceptance Outcome
- User gate decision: `通过`
- Task 7 criteria satisfied:
  - Analyze success
  - Non-empty closure rows
  - BattleMode-specific closure confirmed
  - Non-business package row explained as in-scope data, not graph corruption
