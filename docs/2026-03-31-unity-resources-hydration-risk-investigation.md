# Unity Resources/Hydration Risk Investigation

Date: 2026-03-31
Owner: Codex
Status: Closed (fixed)

## Scope

Investigate whether `unity_resources` / `unity_hydration_mode` on `query/context` are truly effective in current GitNexus runtime.

## Fix Closure Summary (2026-03-31)

- Runtime wiring restored in:
  - `e9d7e24` (`context` wiring)
  - `f991a11` (`query` wiring + benchmark gate)
  - `0f526ae` (class UID hydration detection + query symbol-evidence gate robustness)
- Verification evidence is captured in:
  - `docs/reports/2026-03-31-unity-resources-hydration-runtime-fix-verification.md`

## Risk Hypothesis

- Tool contract and CLI expose `unity_resources` + `unity_hydration_mode` for `query/context`.
- Runtime may not actually consume those params in `LocalBackend.query/context`.

## Contract vs Runtime Files

- Contract/docs:
  - `gitnexus/src/mcp/tools.ts`
  - `gitnexus/src/cli/tool.ts`
- Runtime:
  - `gitnexus/src/mcp/local/local-backend.ts`

## Reproduction Evidence

### 1. Real Unity repo is indexed

Command:

- `gitnexus list`

Observed:

- `neonspark` indexed and queryable.

### 2. `context` with and without unity flags returns same top-level shape

Commands:

- `gitnexus context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' | jq 'keys'`
- `gitnexus context -r neonspark --uid 'Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef' --unity-resources on --unity-hydration compact | jq 'keys'`

Observed both:

- `["directIncoming","directOutgoing","incoming","outgoing","processes","status","symbol"]`

No `resourceBindings`, `serializedFields`, `hydrationMeta`.

### 3. `query` with and without unity flags returns same top-level shape

Commands:

- `gitnexus query -r neonspark "AssetRef" | jq 'keys'`
- `gitnexus query -r neonspark --unity-resources on --unity-hydration parity "AssetRef" | jq 'keys'`

Observed both:

- `["definitions","process_symbols","processes"]`

No Unity hydration payload fields.

### 4. Runtime binary confirmation

Command:

- `which gitnexus && gitnexus --version`

Observed:

- `/opt/homebrew/bin/gitnexus`
- `1.4.10-rc`

## Static Evidence

1. `LocalBackend.callTool` routes `query/context` directly.
2. `query` and `context` method params currently do not include unity hydration fields.
3. Unity helper modules exist (`unity-enrichment`, lazy hydrator, hydration meta utilities), but usage appears test-only or disconnected from current runtime call path.

## Path Check (No Hidden Injection Found)

Checked:

- MCP server handler: `gitnexus/src/mcp/server.ts`
- CLI command path: `gitnexus/src/cli/tool.ts`
- benchmark runtime tool runner: `gitnexus/src/benchmark/agent-context/tool-runner.ts`

Result:

- all pass through `backend.callTool(...)` directly;
- no extra enrichment layer found before output.

## Benchmark Contract Drift Risk

`runSymbolScenario` in:

- `gitnexus/src/benchmark/u2-e2e/retrieval-runner.ts`

expects `context(on)` to include:

- `hydrationMeta`
- and for key symbols, non-empty `resourceBindings`

But many unit tests here are mocked runners:

- `gitnexus/src/benchmark/u2-e2e/retrieval-runner.test.ts`

Risk:

- runtime drift may not be caught by current mocked tests.

## Current Risk Statement

Confidence: high.

Status: fixed in runtime wiring and guarded by contract tests + benchmark gate.

Current behavior:

1. `context --unity-resources on` now returns Unity hydration fields (`resourceBindings`, `serializedFields`, `unityDiagnostics`, `hydrationMeta`).
2. `context --unity-hydration parity` returns `hydrationMeta.effectiveMode=parity` and `isComplete=true` in verified sample.
3. `query --unity-resources on` now attaches symbol-level Unity fields when available (observed on `definitions` for sampled `AssetRef` query).
