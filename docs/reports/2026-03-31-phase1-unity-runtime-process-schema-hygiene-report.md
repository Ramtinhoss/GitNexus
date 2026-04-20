# Phase1 Schema Hygiene Verification Report

Date: 2026-03-31
Branch: nantas-dev

## Verification Commands and Outcomes

1. Rebind + analyze the intended mini fixture alias:

```bash
# (cleanup/rebind performed; alias now points to the in-repo fixture)
node gitnexus/dist/cli/index.js analyze gitnexus/src/core/unity/__fixtures__/mini-unity --repo-alias unity-mini-phase0 --force
```

Observed:

- analyze completed successfully on fixture path `gitnexus/src/core/unity/__fixtures__/mini-unity`
- analyzer summary showed Unity scan context with non-zero scripts/guids/resources

2. Mini fixture cypher gate:

```bash
node gitnexus/dist/cli/index.js cypher "MATCH (c:Class)-[r:CodeRelation {type:'UNITY_RESOURCE_SUMMARY'}]->(f:File) RETURN count(r) AS cnt" -r unity-mini-phase0
```

Observed:

- `cnt = 6` (PASS, expected `> 0`)

3. Sampled real Unity repo warning-surface check:

```bash
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonnew --repo-alias neonnew-core --extensions .cs --scope-prefix Assets/NEON/Code --force | rg "Fallback edges|Class->File"
```

Observed:

- no matching output lines
- no `Class->File ... missing rel pair` warning surfaced in sampled run

4. Regression gate:

```bash
npm --prefix gitnexus run test:u3:gates
```

Observed:

- PASS

## Root Cause Note (Verification Drift)

- Initial `cnt=0` result came from alias drift: `unity-mini-phase0` was previously bound to `/tmp/unity-mini-phase0`, not the in-repo `mini-unity` fixture used for Phase1 verification intent.
- After alias correction and re-analyze against the intended fixture path, cypher gate passed (`cnt=6`).

## Deltas

- Relation schema now includes `Class -> File` for `UNITY_RESOURCE_SUMMARY` durability path.
- Fallback replay now reports truthful `attempted/succeeded/failed` counters from real insert outcomes.
- Analyze summary now resolves fallback stats from runtime counters first and derives conservative fallback when counters are unavailable.

## Residual Risk

- No Phase1 blocking verification risk remains for schema hygiene.
- For future runs, keep fixture alias binding explicit to avoid repo-alias drift during verification.

## Next-Phase Dependency

- Phase2 can assume `UNITY_RESOURCE_SUMMARY` persistence path and truthful fallback counters are available in current runtime/CLI flow.
