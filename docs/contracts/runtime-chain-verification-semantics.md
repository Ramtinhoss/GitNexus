# Runtime Chain Verification Semantics

This document defines the two-layer contract for runtime chain verification.

- Layer A (`verifier-core`): binary result emitted by the verifier itself.
  - Allowed values: `verified_full` or `failed`.
- Layer B (`policy-adjusted`): caller-visible result in `query/context` after hydration policy is applied.
  - Under strict policy (`hydration_policy=strict`), if hydration falls back to compact (`hydrationMeta.fallbackToCompact=true`), output may be downgraded to partial semantics (`verified_partial` / `verified_segment`).

Agent-side closure guidance:

- Treat downgraded strict-fallback results as non-closure.
- Re-run with parity hydration before final conclusions.
