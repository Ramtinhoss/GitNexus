# U2 E2E Final Verdict

- Run ID: neonspark-u2-full-e2e-20260310-030343

## Build Timings
- Build: 1096.0ms
- Pipeline Profile: 17217.4ms
- Analyze: 40.9s

## Estimate Comparison
- Status: below-range
- In Range: NO
- Actual: 40.9s
- Expected: 322.6s - 540.1s
- Delta: -281.7s

## U2 Capability Checks by Symbol
- MainUIManager: PASS (steps=4, duration=525.3ms, tokens=7249)
- CoinPowerUp: PASS (steps=4, duration=58.3ms, tokens=15575)
- GlobalDataAssets: PASS (steps=4, duration=145.4ms, tokens=4556)
- AssetRef: PASS (steps=4, duration=118.1ms, tokens=1693)
- PlayerActor: FAIL (steps=4, duration=233.9ms, tokens=2332)

## Token Consumption Summary
- Total Tokens (est): 31405
- Total Duration: 1081.0ms

## Failures and Manual Actions
- PlayerActor: PlayerActor: context(on) must include resourceBindings
- duration.min=0ms median=20.3ms max=398.6ms
- PlayerActor: PlayerActor: context(on) must include resourceBindings
- duration.min=0ms median=20.3ms max=398.6ms
