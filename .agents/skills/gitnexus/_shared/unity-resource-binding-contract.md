# Unity Resource Binding Contract

Trigger this contract when code-only context/query cannot explain lifecycle behavior and Unity serialized/resource binding state matters.

- Start with compact hydration and gather the minimal binding evidence needed.
- If `needsParityRetry=true`, rerun parity hydration before conclusions.
- If process output is an empty process list but `resourceBindings` are present, continue the workflow through asset/meta mapping (do not stop).
- For low confidence (`confidence=low`), require `verification_hint` with `action`, `target`, and `next_command`.
- Use hop anchors/evidence anchors at each step: resource path, `.meta` linkage, and command output.
- Do not claim semantic closure until resource -> asset/meta -> loader/runtime anchors are connected or explicitly disproven.
