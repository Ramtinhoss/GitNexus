# 2026-04-07 Validation: Unity Resource-Binding-Coupled Lifecycle Persistence

## Scope

Validate that lifecycle process metadata persistence is no longer externally toggled, and is automatically enabled when Unity resource-binding indexing flow is active.

## Executed Commands

1. `npm --prefix gitnexus exec -- vitest run test/integration/unity-lifecycle-process-persist.test.ts`
- Result: PASS (`1` file, `2` tests passed)

2. `npm --prefix gitnexus exec -- vitest run test/integration/local-backend-calltool.test.ts -t "returns lifecycle process metadata without breaking legacy fields"`
- Result: PASS (`1` file, `1` selected test passed)

3. `npm --prefix gitnexus exec -- vitest run test/integration/local-backend.test.ts -t "query process detail includes persisted lifecycle evidence"`
- Result: PASS (`1` file, `1` selected test passed)

4. `node --input-type=module <<'EOF_SCRIPT' ... EOF_SCRIPT` (pipeline evidence probe against a temporary Unity fixture)
- Result: PASS (produced persisted `Process` + `STEP_IN_PROCESS` evidence fields from current code)

## Pass/Fail Summary

- Overall: PASS
- Failing verification commands: 0
- Blocking regressions observed: 0

## Representative Persisted Evidence Excerpts

Pipeline probe output (from current branch):

```json
{
  "processCount": 2,
  "unityProcess": {
    "id": "proc_0_unity_runtime_root",
    "processSubtype": "unity_lifecycle",
    "runtimeChainConfidence": "medium",
    "sourceReasons": [
      "unity-lifecycle-synthetic",
      "same-file"
    ],
    "sourceConfidences": [
      0.72,
      0.95
    ]
  },
  "stepEvidenceSample": [
    {
      "step": 1,
      "reason": "unity-lifecycle-synthetic",
      "confidence": 0.72
    },
    {
      "step": 2,
      "reason": "same-file",
      "confidence": 0.95
    },
    {
      "step": 3,
      "reason": "same-file",
      "confidence": 0.95
    }
  ]
}
```

Interpretation:
- `processSubtype` and `runtimeChainConfidence` are persisted on `Process` nodes for Unity flow.
- `STEP_IN_PROCESS` edges retain non-default `reason` and `confidence` values (not forced to `trace-detection`/`1.0`).

## Documentation Sync Checklist

- [x] SSOT updated to state Unity-flow-coupled persistence semantics.
- [x] Runtime implementation manual updated to remove config-field ownership of persistence.
- [x] CLI skill guidance updated to state there is no external persistence toggle.
- [x] Config file guidance updated with explicit no-toggle note.
- [x] Stale token grep check for `persistLifecycleProcessMetadata`/`GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST` in CLI/config guidance paths returned zero stale operator instructions.

## Notes

- Unity rule catalog warnings in fixture-based tests/probe (`rules/catalog.json` missing) are expected for temporary repos without Rule Lab artifacts and do not affect lifecycle metadata persistence validation.
