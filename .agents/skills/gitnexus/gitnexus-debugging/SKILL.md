---
name: gitnexus-debugging
description: "Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: \"Why is X failing?\", \"Where does this error come from?\", \"Trace this bug\""
---

# Debugging with GitNexus

## When to Use

- "Why is this function failing?"
- "Trace where this error comes from"
- "Who calls this method?"
- "This endpoint returns 500"
- Investigating bugs, errors, or unexpected behavior

## Workflow

```
1. gitnexus_query({query: "<error or symptom>"})            → Find related execution flows
2. gitnexus_context({name: "<suspect>"})                    → See callers/callees/processes
3. (Unity symbols) use unity_resources + hydration contract
4. READ gitnexus://repo/{name}/process/{name}                → Trace execution flow
5. gitnexus_cypher({query: "MATCH path..."})                 → Custom traces if needed
```

> If "Index is stale" → run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

Debug escalation triggers:
- If root-cause analysis depends on Unity serialized/resource binding interpretation, apply `_shared/unity-resource-binding-contract.md` and enforce compact-to-parity completeness checks (`needsParityRetry` gate) before conclusions.
- If debugging concerns UIToolkit visual semantics, apply `_shared/unity-ui-trace-contract.md` with the UI semantic failure path:
  1. `asset_refs`
  2. `template_refs`
  3. `selector_bindings`
  4. strict re-check when ambiguity remains

## Checklist

```
- [ ] Understand the symptom (error message, unexpected behavior)
- [ ] gitnexus_query for error text or related code
- [ ] Identify the suspect function from returned processes
- [ ] gitnexus_context to see callers and callees
- [ ] For Unity retrieval, start with `unity_hydration_mode: "compact"` and inspect `hydrationMeta`
- [ ] If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"` before concluding root cause
- [ ] Run `_shared/unity-resource-binding-contract.md` when lifecycle ambiguity depends on serialized/resource binding state
- [ ] Run `_shared/unity-ui-trace-contract.md` for UIToolkit visual-semantic failures
- [ ] Trace execution flow via process resource if applicable
- [ ] gitnexus_cypher for custom call chain traces if needed
- [ ] Read source files to confirm root cause
```

## Debugging Patterns

| Symptom              | GitNexus Approach                                          |
| -------------------- | ---------------------------------------------------------- |
| Error message        | `gitnexus_query` for error text → `context` on throw sites |
| Wrong return value   | `context` on the function → trace callees for data flow    |
| Intermittent failure | `context` → look for external calls, async deps            |
| Performance issue    | `context` → find symbols with many callers (hot paths)     |
| Recent regression    | `detect_changes` to see what your changes affect           |

## Tools

**gitnexus_query** — find code related to error:

```
gitnexus_query({query: "payment validation error"})
→ Processes: CheckoutFlow, ErrorHandling
→ Symbols: validatePayment, handlePaymentError, PaymentException
```

**gitnexus_context** — full context for a suspect:

```
gitnexus_context({name: "validatePayment"})
→ Incoming calls: processCheckout, webhookHandler
→ Outgoing calls: verifyCard, fetchRates (external API!)
→ Processes: CheckoutFlow (step 3/7)
```

**Unity debug retrieval** — explicit completeness control:

```
gitnexus_context({
  name: "DoorObj",
  unity_resources: "on",
  unity_hydration_mode: "compact"
})
→ if hydrationMeta.needsParityRetry then rerun with unity_hydration_mode: "parity"
```

**gitnexus_cypher** — custom call chain traces:

```cypher
MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..2]->(b:Function {name: "validatePayment"})
RETURN [n IN nodes(path) | n.name] AS chain
```

## Example: "Payment endpoint returns 500 intermittently"

```
1. gitnexus_query({query: "payment error handling"})
   → Processes: CheckoutFlow, ErrorHandling
   → Symbols: validatePayment, handlePaymentError

2. gitnexus_context({name: "validatePayment"})
   → Outgoing calls: verifyCard, fetchRates (external API!)

3. READ gitnexus://repo/my-app/process/CheckoutFlow
   → Step 3: validatePayment → calls fetchRates (external)

4. Root cause: fetchRates calls external API without proper timeout
```
