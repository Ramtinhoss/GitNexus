---
name: gitnexus-exploring
description: "Use when the user asks how code works, wants to understand architecture, trace execution flows, or explore unfamiliar parts of the codebase. Examples: \"How does X work?\", \"What calls this function?\", \"Show me the auth flow\""
---

# Exploring Codebases with GitNexus

## When to Use

- "How does authentication work?"
- "What's the project structure?"
- "Show me the main components"
- "Where is the database logic?"
- Understanding code you haven't seen before

## Workflow

```
1. READ gitnexus://repos                          → Discover indexed repos
2. READ gitnexus://repo/{name}/context             → Codebase overview, check staleness
3. gitnexus_query({query: "<what you want to understand>"})  → Find related execution flows
4. gitnexus_context({name: "<symbol>"})            → Deep dive on specific symbol
5. (Unity symbols) rerun context/query with unity params when needed
6. READ gitnexus://repo/{name}/process/{name}      → Trace full execution flow
```

> If step 2 says "Index is stale" → run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

## Checklist

```
- [ ] READ gitnexus://repo/{name}/context
- [ ] gitnexus_query for the concept you want to understand
- [ ] Review returned processes (execution flows)
- [ ] gitnexus_context on key symbols for callers/callees
- [ ] Default `query/context` now return slim agent-safe payloads (`candidates`, `process_hints`, `resource_hints`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`)
- [ ] If you need legacy heavy fields (`processes`, `process_symbols`, `definitions`, `resourceBindings`, `serializedFields`, `next_hops`), rerun with `response_profile: "full"`
- [ ] For Unity evidence, call context/query with `unity_resources: "on"` and `unity_hydration_mode: "compact"`
- [ ] If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"`
- [ ] READ process resource for full execution traces
- [ ] Read source files for implementation details
```

## Unity Runtime Process Trigger

When exploration touches Unity runtime process semantics (runtime chain closure, lifecycle/loader stitching, confidence-based closure), load and follow:

- `_shared/unity-runtime-process-contract.md`

## Resources

| Resource                                | What you get                                            |
| --------------------------------------- | ------------------------------------------------------- |
| `gitnexus://repo/{name}/context`        | Stats, staleness warning (~150 tokens)                  |
| `gitnexus://repo/{name}/clusters`       | All functional areas with cohesion scores (~300 tokens) |
| `gitnexus://repo/{name}/cluster/{name}` | Area members with file paths (~500 tokens)              |
| `gitnexus://repo/{name}/process/{name}` | Step-by-step execution trace (~200 tokens)              |

## Tools

**gitnexus_query** — find execution flows related to a concept:

```
gitnexus_query({query: "payment processing"})
→ Slim response: candidates + process_hints + upgrade_hints
→ If `suggested_context_targets[]` includes `uid`, prefer the matching `context --uid` upgrade hint
→ Rerun with response_profile: "full" if you need grouped process rows and symbol payloads
```

**gitnexus_context** — 360-degree view of a symbol:

```
gitnexus_context({name: "validateUser"})
→ Slim response: incoming/outgoing refs, process hints, resource hints, upgrade hints
→ Use structured `suggested_context_targets[]` for same-name disambiguation before rerunning full
→ Rerun with response_profile: "full" for full categorized refs plus Unity-heavy payloads
```

**Unity-focused context/query** — use compact first, parity only when needed:

```
gitnexus_context({
  name: "DoorObj",
  unity_resources: "on",
  unity_hydration_mode: "compact"
})
→ hydrationMeta.needsParityRetry ? rerun with unity_hydration_mode: "parity" : continue
```

## Example: "How does payment processing work?"

```
1. READ gitnexus://repo/my-app/context       → 918 symbols, 45 processes
2. gitnexus_query({query: "payment processing"})
   → CheckoutFlow: processPayment → validateCard → chargeStripe
   → RefundFlow: initiateRefund → calculateRefund → processRefund
3. gitnexus_context({name: "processPayment"})
   → Incoming: checkoutHandler, webhookHandler
   → Outgoing: validateCard, chargeStripe, saveTransaction
4. Read src/payments/processor.ts for implementation details
```

## Runtime-Chain Closure Guard

- Query-time runtime closure is **graph-only** and does not require `verification_rules` / `trigger_tokens` matching.
- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.
