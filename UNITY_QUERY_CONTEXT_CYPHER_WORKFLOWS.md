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

## Refactoring Workflow

## Unity vs Generic Behavior

## Optimization Metrics
