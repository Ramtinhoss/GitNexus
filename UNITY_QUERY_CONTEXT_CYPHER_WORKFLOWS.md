# Unity Query/Context/Cypher Workflows

## Intro and Audience

This guide explains practical `query/context/cypher` workflows for Unity-oriented retrieval in GitNexus, including runtime-claim handling and follow-up commands.

Audience:
- Engineers exploring unfamiliar Unity code paths
- Engineers debugging runtime-chain confidence and closure outcomes
- Engineers preparing safe refactors with graph-backed evidence

## Exploring Workflow

Goal: from an idea-level query to concrete symbol and process traces with minimal guesswork.

Evidence Ref: workflows.exploring.query  
Evidence Ref: workflows.exploring.context  
Evidence Ref: workflows.exploring.cypher

1. Start with concept-to-process discovery via `query`.

```bash
gitnexus query -r GitNexus -l 3 "runtime chain verify"
```

Read these fields first:
- `processes[]`: prioritized candidate flows.
- `processes[].process_ref.reader_uri`: follow-up URI for direct process read.
- `process_symbols[]`: concrete symbols participating in the selected flow.
- `definitions[]`: relevant standalone types/functions when flow evidence is sparse.
- `next_hops[]`: suggested follow-up command targets.

2. Deep dive a symbol via `context`.

```bash
gitnexus context -r GitNexus verifyRuntimeClaimOnDemand
```

Use `incoming.calls` and `outgoing.calls` to determine caller/callee direction, then select the next inspection target.

3. Fill structural gaps with `cypher`.

```bash
gitnexus cypher -r GitNexus "MATCH (p:Process) RETURN p.heuristicLabel AS process LIMIT 5"
```

Use `cypher` when `query/context` gives symbol hints but you still need explicit relationship slices or counts.

4. Command -> Field -> Next-Hop walkthrough.

Command:

```bash
gitnexus query -r GitNexus -l 3 "runtime chain verify"
```

Field signal:
- `processes[0].process_ref.reader_uri = gitnexus://repo/GitNexus/process/proc_46_bm25search`
- `next_hops[0].next_command = gitnexus context --repo "GitNexus" --unity-resources on --unity-hydration parity "normalizePath"`

Next action:
- Open `process_ref.reader_uri` for flow-level context.
- Run the suggested `next_hops[0].next_command` to pivot from process-level to symbol-level evidence.

## Debugging Workflow

Goal: diagnose why runtime closure is not achieved, and decide whether to rerun parity hydration or pivot symbols.

Evidence Ref: workflows.debugging.query  
Evidence Ref: workflows.debugging.context  
Evidence Ref: workflows.debugging.cypher

1. Run debugging query with explicit verifier switch.

```bash
gitnexus query -r GitNexus --runtime-chain-verify on-demand --unity-resources on --unity-hydration compact --scope-preset unity-all "verifyRuntimeClaimOnDemand runtime closure"
```

In CLI/MCP params this is `runtime_chain_verify=on-demand`.

2. Interpret confidence before closure claims.

- If `processes[].evidence_mode` is `resource_heuristic` (or confidence is `low`), treat this as a clue stage and continue retrieval.
- Do not treat low-confidence process participation as closure completion.

3. Apply dual semantic model.

- `verifier-core`: binary result from verifier internals (`verified_full` or `failed`).
- `policy-adjusted`: externally presented result after hydration policy constraints are applied.
- If `needsParityRetry=true`, rerun with parity hydration before closure judgment.
- If strict mode falls back (`fallbackToCompact=true`), do not conclude closure from compact output; rerun parity first.

4. Use `runtime_claim` reason taxonomy.

- `rule_not_matched`
- `rule_matched_but_evidence_missing`
- `rule_matched_but_verification_failed`

5. Drive next action from `hops` and `gaps`.

- If `hops` exist and `gaps` exist: run the `runtime_claim.next_action` or each gap `next_command` to fill missing segments.
- If `hops` are absent: pivot to `next_hops[]` symbol targets and refresh anchors.
- Only treat `verified_full` as closure when `hops` is non-empty and `gaps` is empty.

Concrete follow-up from evidence:

```bash
node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "verifyRuntimeClaimOnDemand runtime closure"
```

## Refactoring Workflow

## Unity vs Generic Behavior

## Optimization Metrics
