# Unity Query/Context/Cypher Evidence Snapshot (2026-04-08)

## Capture Metadata

- Repo: `GitNexus`
- Source: `gitnexus` CLI live outputs
- Index note: index is 1 commit behind HEAD; user chose to continue without reindex

## Workflow Coverage

### Exploring
- Evidence keys: `workflows.exploring.query`, `workflows.exploring.context`, `workflows.exploring.cypher`
- Query command: `gitnexus query -r GitNexus -l 3 "runtime chain verify"`
- Context command: `gitnexus context -r GitNexus verifyRuntimeClaimOnDemand`
- Cypher command: `gitnexus cypher -r GitNexus "MATCH (p:Process) RETURN p.heuristicLabel AS process LIMIT 5"`

### Debugging
- Evidence keys: `workflows.debugging.query`, `workflows.debugging.context`, `workflows.debugging.cypher`
- Query command: `gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --scope-preset unity-all "verifyRuntimeClaimOnDemand runtime closure"`
- Key runtime claim fields:
  - `workflows.debugging.query.runtime_claim.status`
  - `workflows.debugging.query.runtime_claim.verification_core_status`
  - `workflows.debugging.query.runtime_claim.reason`
  - `workflows.debugging.query.runtime_claim.hops`
  - `workflows.debugging.query.runtime_claim.gaps`

### Refactoring
- Evidence keys: `workflows.refactoring.query`, `workflows.refactoring.context`, `workflows.refactoring.cypher`
- Query command: `gitnexus query -r GitNexus -l 3 "rename workflow blast radius"`
- Context command: `gitnexus context -r GitNexus -f gitnexus/src/mcp/server.ts getNextStepHint`
- Cypher command: `gitnexus cypher -r GitNexus "MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process) RETURN s.name AS symbol, p.heuristicLabel AS process, r.step AS step ORDER BY r.step LIMIT 10"`

## Negative Cases

- `negative_cases.neg_01`
  - assumption: `processes_empty=true`
  - command: `gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on "a"`
- `negative_cases.neg_02`
  - assumption: `fallback_to_compact=true`
  - command: `gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --scope-preset unity-all "runtime"`
- `negative_cases.neg_03`
  - assumption: `hops_empty=true`, `gaps_empty=true`
  - command: `gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on "zzzz"`

## Quick Field Check

```bash
jq '{
  exploring_row_count: .workflows.exploring.cypher.row_count,
  debugging_runtime_core: .workflows.debugging.query.runtime_claim.verification_core_status,
  debugging_runtime_reason: .workflows.debugging.query.runtime_claim.reason,
  refactoring_row_count: .workflows.refactoring.cypher.row_count,
  neg01_reason: .negative_cases.neg_01.runtime_claim.reason,
  neg02_reason: .negative_cases.neg_02.runtime_claim.reason,
  neg03_reason: .negative_cases.neg_03.runtime_claim.reason
}' docs/reports/2026-04-08-unity-query-context-cypher-evidence.json
```
