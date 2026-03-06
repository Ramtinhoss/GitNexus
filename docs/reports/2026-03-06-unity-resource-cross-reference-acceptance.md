# Unity Resource Cross-Reference Acceptance

Date: 2026-03-06

## Scope

- Phase 0 CLI validation via `unity-bindings`
- Phase 1 graph-native `context/query` enrichment via `unity_resources`
- Real-repo sampling against `/Volumes/Shuttle/unity-projects/neonspark`

## Targeted Verification

Executed:

```bash
cd gitnexus
npm run build
node --test dist/core/unity/*.test.js
node --test dist/core/ingestion/unity-resource-processor.test.js
node --test dist/cli/unity-bindings.test.js
node --test dist/mcp/local/unity-enrichment.test.js
```

Result:

- PASS

## Real-Repo Acceptance

### Notes

- A full forced rebuild of `/Volumes/Shuttle/unity-projects/neonspark` with the local CLI exceeded a 1 hour timeout on 2026-03-06.
- For graph-native `context/query` validation, a scoped acceptance index was created instead:
  - repo alias: `neonspark-unity-acceptance`
  - scope: `Assets/NEON/Code/VeewoUI/MainUIManager.cs`
- Phase 0 `unity-bindings` validation still ran directly against the full real repo path.

### Commands

```bash
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --force
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --force --repo-alias neonspark-unity-acceptance --scope-prefix Assets/NEON/Code/VeewoUI/MainUIManager.cs

node gitnexus/dist/cli/index.js unity-bindings Global --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings BattleMode --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings PlayerActor --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings MainUIManager --target-path /Volumes/Shuttle/unity-projects/neonspark

node gitnexus/dist/cli/index.js context MainUIManager --repo neonspark-unity-acceptance --unity-resources on
node gitnexus/dist/cli/index.js query MainUIManager --repo neonspark-unity-acceptance --unity-resources on
```

### Sample Summary

| Symbol | Resource Bindings | Scalar Fields | Reference Fields |
| --- | ---: | ---: | ---: |
| `Global` | 1 | 9 | 2 |
| `BattleMode` | 2 | 6 | 6 |
| `PlayerActor` | 7 | 94 | 41 |
| `MainUIManager` | 4 | 7 | 5 |

Aggregate acceptance:

- `hasScalar = true`
- `hasReference = true`

### Graph-Native Query/Context Check

Scoped acceptance index observations:

- `context MainUIManager --unity-resources on`
  - returned `resourceBindings`
  - returned aggregated `serializedFields`
  - returned empty `unityDiagnostics`
- `query MainUIManager --unity-resources on`
  - enriched returned symbol entries under `definitions[]`
  - included `resourceBindings`, `serializedFields`, and `unityDiagnostics`

### Outcome

- Phase 0 acceptance: PASS
- Phase 1 scoped graph-native acceptance: PASS
- DoD coverage rule (`scalar + reference` across 4 real samples): PASS
