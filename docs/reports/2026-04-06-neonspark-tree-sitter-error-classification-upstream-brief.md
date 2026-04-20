# Neonspark Tree-sitter Error Classification (For Upstream tree-sitter Analysis)

## 1) Scope and Data Source

- Audit run: `ts-audit-20260406-061050`
- Repo scanned: `/Volumes/Shuttle/projects/neonspark`
- Input scope: `/Volumes/Shuttle/projects/neonspark/.gitnexus/sync-manifest.txt` (expanded `.cs`, excluded `.meta`)
- Main evidence files:
  - `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/diagnostics.jsonl`
  - `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/root-has-error-classification.json`
  - `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/cjk-023-validation.json`

## 2) Parser Version Consistency

- `tree-sitter`: `0.22.4`
- `tree-sitter-c-sharp`: `0.23.1`
- Verified at:
  - `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/package.json`
  - `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/package-lock.json`
  - installed modules under `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/node_modules/`

## 3) Error Classification Summary

From `diagnostics.jsonl` (8070 files):

- `root_has_error`: `154`
- `missing_class_with_methods`: `176`
- `parse_throw`: `0`

### Class A: `root_has_error` (Primary quality risk)

Count: `154`

Sub-classification (operationally useful):

- first-party + CJK: `37`
- first-party + non-CJK: `14`
- plugin-related (`Assets/Plugins/*`): `60`
- package-related (`Packages/*`, non first-party): `17`
- other third-party: `26`
- large files (`>32KB`, overlaps): `19`

Evidence file:
- `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/root-has-error-classification.json`

At least one reproducible absolute-path file (this class):
- `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/Input/LocalPlayerInput.cs` (CJK, first-party)
- `/Volumes/Shuttle/projects/neonspark/Assets/Plugins/FMOD/src/StudioEventEmitter.cs` (plugin)

### Class B: `missing_class_with_methods` (Mixed signal: mostly container-shape warning)

Count: `176`

Observed composition (same files re-parsed and inspected):

- files containing `interface_declaration`: `92`
- files containing `struct_declaration`: `83`
- files containing `enum_declaration`: `8`
- files containing `delegate_declaration`: `2`
- files with none of above alternative containers: `3`
- files in this class that also had `root.hasError=true`: `7`

Interpretation:
- Majority are interface/struct-heavy files, so this class is largely a diagnostic-heuristic warning, not pure parser failure.
- A small subset (the 7 files overlapping with root error) should be treated as true parsing quality issues.

At least one reproducible absolute-path file (this class):
- `/Volumes/Shuttle/projects/neonspark/Assets/Plugins/WeGameSDK/rail_game_server.cs` (interface-heavy)
- `/Volumes/Shuttle/projects/neonspark/Assets/NintendoSDKPlugin/nn/ec/ec_ShopTypes.cs` (struct-heavy)

### Class C: `parse_throw` (none in this run)

Count: `0`

Interpretation:
- No files threw parse exceptions in this run, so there is no reproducible file for this class under current corpus and parser config.

## 4) CJK-focused Validation on 0.23

Goal:
- Validate whether CJK-related `root_has_error` cases are resolved under `tree-sitter-c-sharp 0.23.1`.

Test scope:
- only files where `error_type=root_has_error` and `has_cjk=true`
- total: `46` files

Result summary (from `cjk-023-validation.json`):

- `files_total`: `46`
- `files_root_has_error_023`: `46`
- `files_without_error_023`: `0`
- `files_with_ERROR_nodes`: `38`
- `files_with_missing_nodes`: `27`
- `files_only_missing_nodes`: `8`

Evidence file:
- `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/cjk-023-validation.json`

At least one reproducible absolute-path file (CJK subset):
- `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/Input/LocalPlayerInput.cs`
- `/Volumes/Shuttle/projects/neonspark/Packages/com.veewo.stat/Runtime/Stat.cs`

## 5) Parse-call Source References (requested)

Core parse implementation (chunked callback):
- `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src/core/tree-sitter/parser-loader.ts:77`
- `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src/core/tree-sitter/parser-loader.ts:79`

Ingestion parse call site:
- `/Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src/core/ingestion/parsing-processor.ts:157`

CJK validation test parse call site (this report's dedicated test):
- `/Volumes/Shuttle/projects/agentic/GitNexus/.gitnexus/reports/tree-sitter-audit/ts-audit-20260406-061050/cjk-023-validation.mjs:22`

## 6) Notes for Upstream Investigation

- This dataset shows that upgrading to `tree-sitter-c-sharp 0.23.1` alone does not clear CJK-correlated `root.hasError` in these 46 files.
- Problems appear to include both explicit `ERROR` nodes and missing-node recovery cases.
- The strongest upstream-debug starting points are the two CJK first-party files listed above, plus one plugin file and one struct/interface-heavy file for contrast.
