# 2026-04-03 V1 Reload Runtime Chain Acceptance Recheck

- date: 2026-04-03
- repo_alias: `neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542`
- scope: wave-3 reload acceptance status recheck

## Summary

The live dist acceptance path is currently passing.

During the 2026-04-03 recheck, the historical
`2026-04-01-v1-reload-runtime-chain-acceptance.json` artifact initially failed
under the stricter semantic-anchor validator because its loader hop still
pointed at the `Equip()` signature line instead of the concrete
`CurGunGraph` assignment line.

That compatibility issue has now been remediated by refreshing the old artifact
path with a validator-compatible acceptance artifact. M0 is therefore no longer
blocked on reload acceptance evidence.

## Commands Run

1. Live recheck:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --repo neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 \
  --out /tmp/reload-recheck-wave3.json
```

Result:

- exit code `0`
- artifact copied to:
  `docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance.recheck.json`

2. Verify copied live artifact:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance.recheck.json
```

Result:

- pass

3. Verify historical artifact before refresh:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```

Result before refresh:

- fail
- failure: `loader semantic closure missing CurGunGraph assignment anchor`

4. Refresh historical artifact path with the validator-compatible artifact and
re-verify:

```bash
cp docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance.recheck.json \
  docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json

node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```

Result after refresh:

- pass

5. Anti-hardcode scan:

```bash
rg -n "1_weapon_0_james_new|1_weapon_0_james1|7289942075c31ab458d5214b4adc38a1|1b63118991a192f4d8ac217fd7fe49ce" \
  gitnexus/src --glob '!**/*.test.*'
```

Result:

- no matches

## Live Artifact Facts

- `runtime_chain.status`: `verified_full`
- required hops present:
  - `resource`
  - `guid_map`
  - `code_loader`
  - `code_runtime` (graph anchor)
  - `code_runtime` (reload anchor)
- invalid anchor validations: none

Key semantic anchors from the live artifact:

1. Loader anchor:
   - file: `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs`
   - line: `50`
   - snippet: `player.Gun.gungraph.CurGunGraph = gungraph;`
2. Runtime graph anchor:
   - file: `Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs`
   - line: `235`
   - snippet: `public virtual IEnumerator StartRoutineWithEvents(GunGraphEvents ggEvents, MonoBehaviour instigator = null)`
3. Runtime reload anchor:
   - file: `Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs`
   - line: `61`
   - snippet: `public override object GetValue(NodePort port)`

## Delta Vs Pre-Refresh 2026-04-01 Artifact

The pre-refresh historical artifact stored the loader hop as:

- anchor: `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:45`
- snippet: `public override void Equip()`

The current validator requires semantic closure at the concrete
`CurGunGraph` assignment line. That is why the pre-refresh historical artifact
failed re-validation even though the live verifier output was already correct.

After refresh, the old artifact path now points at a validator-compatible
artifact and re-validates successfully.

## Verification Notes

One dist node-test target was usable directly:

```bash
node --test gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.test.js
```

Result:

- pass

The dist `runtime-chain-verify.test.js` file still depends on a Vitest runtime
context and does not execute cleanly via raw `node --test`, so it was not used
as a wave-3 completion gate in this recheck.
