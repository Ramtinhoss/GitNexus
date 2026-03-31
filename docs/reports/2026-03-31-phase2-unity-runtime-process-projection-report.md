# Phase2 Query-Time Process Projection Verification Report

Date: 2026-03-31
Branch: nantas-dev
Status: Ready for user verification

## Authenticity Gate
- [x] assert no placeholder path
- [x] assert live mode has tool evidence
- [x] assert freeze requires non-empty confirmed_chain.steps

## Verification Commands and Outcomes

1. Build:

```bash
npm --prefix gitnexus run build
```

Observed: PASS.

2. Integration regression gate:

```bash
npm --prefix gitnexus exec vitest run test/integration/local-backend-calltool.test.ts
```

Observed: PASS (24 passed, 0 failed).

3. Unity gate suite:

```bash
npm --prefix gitnexus run test:u3:gates
```

Observed: PASS (49 passed, 0 failed).

4. Required sample checks from plan matrix:

```bash
node gitnexus/dist/cli/index.js context -r neonspark --file "Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs" --unity-resources on --unity-hydration parity WeaponPowerUp
node gitnexus/dist/cli/index.js query -r neonspark --unity-resources on --unity-hydration parity "Pickup PickItUp EquipWithEvent"
```

Observed:
- `WeaponPowerUp`: `processes.length = 0`
- `Pickup PickItUp EquipWithEvent`: `processes.length = 0`, `process_symbols.length = 0`

Artifacts:
- `docs/reports/2026-03-31-phase2-context-weaponpowerup.json`
- `docs/reports/2026-03-31-phase2-query-pickup-equipwithevent.json`

5. Baseline-set sweep for ratio measurement (neonspark):

- Input set: `docs/reports/2026-03-31-phase0-unity-runtime-process-queryset.json`
- Scope: 10 symbol context checks + 8 unity-focused query checks
- Artifact: `docs/reports/2026-03-31-phase2-neonspark-metrics-scan.json`

Observed:
- symbol non-empty context count: `2/10`
- query non-empty process_symbols count: `2/8`

## Delta vs Phase0 Baseline (neonspark)

Baseline reference: `docs/reports/2026-03-31-phase0-unity-runtime-process-summary.json`

- Phase0 context non-empty ratio: `0.0%`
- Phase2 context non-empty ratio: `20.0%`
- Delta: `+20.0pp`

- Phase0 query process-symbol non-empty ratio: `12.5%`
- Phase2 query process-symbol non-empty ratio: `25.0%`
- Delta: `+12.5pp`

## Confirmed Chain

At least one non-empty stitched runtime clue is present:

- Symbol: `Gun` (`Assets/NEON/Code/Game/Core/Gun.cs`)
- Process clue: `GetValue → SetVariable`
- Evidence: `method_projected`, confidence `medium`
- Artifact: `docs/reports/2026-03-31-phase2-context-gun.json`

## Notes

- The two explicit sample commands in the matrix remained empty on this index snapshot.
- The broader Phase0 queryset sweep shows measurable positive deltas on both tracked metrics, satisfying the phase-level improvement criterion.
