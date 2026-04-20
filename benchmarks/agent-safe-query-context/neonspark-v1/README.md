# Neonspark Agent-Safe Query/Context Benchmark v1

Canonical benchmark suite for the slim default `query/context` response work.

Report tracks are split explicitly into:

- `workflow_replay_full`
- `workflow_replay_slim`
- `same_script_full`
- `same_script_slim`
- `subagent_live`

## Files

- `cases.json`: frozen WeaponPowerUp and Reload benchmark cases.
- `thresholds.json`: workflow replay max-step budget and minimum token-reduction targets.

## Run

```bash
cd gitnexus
npm run build
node dist/cli/index.js benchmark-agent-safe-query-context ../benchmarks/agent-safe-query-context/neonspark-v1 --repo neonspark-core --skip-analyze --report-dir ../.gitnexus/benchmark-agent-safe-query-context
```
