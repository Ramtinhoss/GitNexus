# Workflow Contract

- MCP-first for analysis tasks.
- CLI fallback for setup/analyze/status/clean/wiki/list tasks or explicit CLI requests.
- If index status is stale, run `gitnexus analyze` first, then return to MCP workflow.

## Phase 5 Confidence-Aware Runtime Stitching

- Never conclude "no runtime chain" from an empty process list alone.
- If `processes` is empty but Unity resource evidence exists, continue with `resourceBindings` and asset/meta mapping hops.
- Stitch order is mandatory: `processes -> resourceBindings -> asset/meta mapping -> runtime candidate symbols`.
- `confidence=low` rows require an actionable `verification_hint` object with `action`, `target`, and `next_command`.
- Before chain closure, every hop must include a concrete hop anchor (path/line/command evidence anchor).
- Chain closure is valid only when required anchors are present or parity + asset/meta verification produced no anchors.
