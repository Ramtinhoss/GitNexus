# Unity UI Trace V1 Runbook (2026-03-24)

## Scope

`unity_ui_trace` in V1 is **query-time only**:

- No LadybugDB schema migration.
- No new persisted `CodeRelation` types.
- No UXML/USS node-table writes.

The tool reads Unity files directly (`.uxml`, `.uss`, `.prefab`, `.asset`, `.cs`) and returns evidence chains with `path + line` for each hop.

## MCP Usage

```json
{
  "name": "unity_ui_trace",
  "arguments": {
    "target": "EliteBossScreenController",
    "goal": "asset_refs",
    "repo": "your-repo"
  }
}
```

`goal` supports:

- `asset_refs`
- `template_refs`
- `selector_bindings`

## CLI Usage

```bash
gitnexus unity-ui-trace "EliteBossScreenController" --goal asset_refs
gitnexus unity-ui-trace "Assets/UI/Screens/DressUpScreenNew.uxml" --goal template_refs
gitnexus unity-ui-trace "EliteBossScreenController" --goal selector_bindings
```

## Output Contract

- `results`: unique-result output only.
- `diagnostics`: ambiguity / not-found details.
- `evidence_chain`: each hop contains `path`, `line`, `snippet`.

If more than one candidate matches, V1 returns empty `results` with `diagnostics.code = "ambiguous"`.
