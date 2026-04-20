# 2026-04-13 Gap-Lab Removal Direct Flow Validation

## Scope
Validate that the direct public rule flow remains functional after removing gap-lab/discover surfaces:

1. compile approved analyze rules
2. re-run analyze on target Unity repo
3. verify injected `unity-rule-*` `CALLS` edges via CLI Cypher

Target repo: `/Volumes/Shuttle/unity-projects/neonspark`
Graph alias: `neonspark-core`

## Commands and Evidence

### 1) Baseline synthetic CALLS count

```bash
node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason STARTS WITH 'unity-rule-' RETURN count(*) AS cnt"
```

Result:

```json
{
  "markdown": "| cnt |\n| --- |\n| 68 |",
  "row_count": 1
}
```

### 2) Compile approved rules

```bash
node gitnexus/dist/cli/index.js rule-lab compile --repo-path /Volumes/Shuttle/unity-projects/neonspark --family analyze_rules
```

Result:

```text
Compiled 1 analyze_rules rules → /Volumes/Shuttle/unity-projects/neonspark/.gitnexus/rules/compiled/analyze_rules.v2.json
```

### 3) Analyze target repo

```bash
node gitnexus/dist/cli/index.js analyze -f /Volumes/Shuttle/unity-projects/neonspark
```

Key analyzer evidence:

- `Repository indexed successfully (135.7s)`
- `Unity Rule Binding Diagnostics: rule_binding.summary: rules=1, bindings=1, edges=77`
- `rule_binding.bindings_by_kind: method_triggers_scene_load=1`
- `rule_binding.agent_report: should_report=false reason="no anomalies detected"`

### 4) Post-run synthetic CALLS count

```bash
node gitnexus/dist/cli/index.js cypher -r neonspark-core "MATCH ()-[r:CodeRelation {type:'CALLS'}]->() WHERE r.reason STARTS WITH 'unity-rule-' RETURN count(*) AS cnt"
```

Result:

```json
{
  "markdown": "| cnt |\n| --- |\n| 77 |",
  "row_count": 1
}
```

## Conclusion

Direct flow is working after gap-lab residual removal:

- compile succeeded and produced `compiled/analyze_rules.v2.json`
- analyze completed successfully and injected rule-bound edges
- `unity-rule-*` `CALLS` count is non-zero and increased from `68` to `77`

Acceptance check (`cnt > 0`) passed.
