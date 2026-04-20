# Unity Runtime Hydration Fix Verification (2026-03-31)

## Scope

Verify runtime wiring for `context/query` Unity hydration contract after implementation commits:

- `f991a11` (`query` wiring + benchmark gate)
- `0f526ae` (class UID hydration detection + query evidence gate robustness)

## Context Key Diff (off vs on)

Command (`off`):

```bash
node gitnexus/dist/cli/index.js context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources off | jq 'keys'
```

Observed keys:

```json
["directIncoming","directOutgoing","incoming","outgoing","processes","status","symbol"]
```

Command (`on`, compact):

```bash
node gitnexus/dist/cli/index.js context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration compact | jq 'keys'
```

Observed keys:

```json
["directIncoming","directOutgoing","hydrationMeta","incoming","outgoing","processes","resourceBindings","serializedFields","status","symbol","unityDiagnostics"]
```

## Context Compact/Parity Contract

Compact command:

```bash
node gitnexus/dist/cli/index.js context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration compact | jq '{status, hydrationMeta, rb:(.resourceBindings|length)}'
```

Observed:

```json
{"status":"found","hydrationMeta":{"requestedMode":"compact","effectiveMode":"compact","elapsedMs":0,"fallbackToCompact":false,"resourceBindingCount":0,"unityDiagnosticsCount":0,"isComplete":true,"completenessReason":[],"needsParityRetry":false},"rb":0}
```

Parity command:

```bash
node gitnexus/dist/cli/index.js context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration parity | jq '{status, hydrationMeta, rb:(.resourceBindings|length)}'
```

Observed:

```json
{"status":"found","hydrationMeta":{"requestedMode":"parity","effectiveMode":"parity","elapsedMs":2,"fallbackToCompact":false,"resourceBindingCount":0,"unityDiagnosticsCount":0,"isComplete":true,"completenessReason":[],"needsParityRetry":false},"rb":0}
```

Result:

- `compact`: `hydrationMeta` present and structurally valid.
- `parity`: `hydrationMeta.effectiveMode=parity` and `isComplete=true`.

## Query Symbol-Level Evidence Diff (off vs on)

`off`:

```bash
node gitnexus/dist/cli/index.js query -r neonspark --unity-resources off 'AssetRef' | jq '{process_symbols:(.process_symbols|length), definitions:(.definitions|length), defUnityFields:([.definitions[] | select((.resourceBindings|type)!="null" or (.serializedFields|type)!="null")]|length)}'
```

Observed:

```json
{"process_symbols":0,"definitions":20,"defUnityFields":0}
```

`on` (compact):

```bash
node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration compact 'AssetRef' | jq '{process_symbols:(.process_symbols|length), definitions:(.definitions|length), defUnityFields:([.definitions[] | select((.resourceBindings|type)!="null" or (.serializedFields|type)!="null")]|length)}'
```

Observed:

```json
{"process_symbols":0,"definitions":20,"defUnityFields":8}
```

Sample symbol-level evidence (`definitions`):

```bash
node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration compact 'AssetRef' | jq '.definitions[] | select(.resourceBindings!=null) | {id, rb:(.resourceBindings|length), scalar:(.serializedFields.scalarFields|length)}' | head
```

Result:

- On this `neonspark` index, `process_symbols` is empty for this query; symbol-level Unity evidence appears under `definitions`.
- Query(on) now carries Unity fields at symbol level when available.

## Benchmark Gate Result

Command:

```bash
npm --prefix gitnexus run test:u3:gates
```

Observed: PASS (`48/48`).

## Final Verification Command Set

Command:

```bash
npm --prefix gitnexus run build && node --test gitnexus/dist/mcp/local/*.test.js gitnexus/dist/benchmark/u2-e2e/*.test.js
```

Observed: PASS (`62/62`).

## Remaining Risk

- Real-repo evidence density depends on indexed graph coverage (for the sampled `AssetRef` query, no `process_symbols` returned, so evidence appears in `definitions` only).
- Hydration wiring and contract fields are now runtime-effective; payload richness remains data-dependent.
