# Unity Runtime Retrieval Gap Remediation Implementation Plan

Date: 2026-04-02  
Owner: GitNexus  
Status: Completed (M0, M1, and M2 accepted on 2026-04-03)

## 0. Scope and Decision

This plan implements the remediation direction from:

- `docs/plans/2026-04-02-unity-runtime-retrieval-gap-analysis-and-redesign-direction.md`

Decision:

1. Do not rewrite GitNexus end-to-end.
2. Keep core query/context infrastructure.
3. Rebuild Unity runtime retrieval subsystem in-place across:
   - ingestion data model,
   - rule model + compile flow,
   - retrieval orchestration,
   - runtime-chain verification execution.

---

## 0.1 Execution Snapshot (updated 2026-04-03)

### Completed in current wave

1. M0 graph data model foundation landed and verified on `neonspark-core`:
   - `UNITY_COMPONENT_INSTANCE`: `67642`
   - `UNITY_SERIALIZED_TYPE_IN`: `4582`
   - `UNITY_ASSET_GUID_REF`: `8196`
   - `UNITY_GRAPH_NODE_SCRIPT_REF`: `61684`
2. Retrieval/next-hop usability improvements landed:
   - strict-seed path no longer uses first-item terminal fallback;
   - `next_hops` generation is evidence-ranked and includes executable commands;
   - `next_hops` command templates inject `--repo` for CLI contract parity.
3. Runtime verifier quality improvements landed:
   - `rule_not_matched` no longer leaks first rule `next_action`;
   - primary symbol resolution now includes `host_base_type` candidate path;
   - mapped resource fallback changed from first-item pick to scored selection.
4. M0 evidence artifact generated and reviewed:
   - `docs/reports/2026-04-02-m0-three-bucket-validation.json`
   - `docs/reports/2026-04-02-m0-three-bucket-validation.md`
   - gate summary: `anchor_pass=true`, `holdout_pass=true`, `negative_pass=true`, `command_contract_pass=true`, `cypher_edge_counts_pass=true`, `anchor_chain_closure_pass=true`, `anti_hardcode_pass=true`.
5. Reload acceptance evidence refreshed on 2026-04-03:
   - refreshed artifact at `docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json` now re-validates under the current semantic-anchor validator
   - live recheck artifact archived at `docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance.recheck.json`
   - recheck report: `docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance-recheck.md`
6. M0 milestone acceptance is now explicitly satisfied:
   - edge-count gate: pass
   - anchor-chain closure gate: pass
   - strict-seed top next-hop gate: pass
   - runtime false-mismatch regression gate: pass
   - next-command contract gate: pass
   - anti-hardcode gate: pass
   - holdout/negative threshold gate: pass
7. M1 rule model/workflow migration acceptance is now explicitly satisfied:
   - `promote` emits versioned stage-aware bundles:
     - `analyze_rules.v2.json`
     - `retrieval_rules.v2.json`
     - `verification_rules.v2.json`
   - compiled bundles are consumed by:
     - `discover` (`analyze_rules`)
     - `query/context next_hops` (`retrieval_rules`)
     - runtime rule registry / verifier (`verification_rules`)
   - compiled bundle promotion merges with prior bundle contents by `rule_id`, preventing silent rule loss on later promote runs
   - `rule_lab_regress` now reports:
     - `key_resource_hit_rate`
     - `next_hop_usability_rate`
     - `hint_drift_rate`
     - anchor / holdout / negative bucket splits
     - threshold checks for all three buckets
   - regress now fails if any of `anchor` / `holdout` / `negative` buckets are missing
   - retrieval-rule next-hop selection is score-ranked instead of first-hit substring matching
8. Independent review for M1 completed with no blocking findings:
   - verdict: M1 accepted
   - review scope covered bundle stability, retrieval configurability, and three-bucket regression gates
9. M2 topology verifier execution landed and validated:
   - verification bundle loader now preserves `topology`, `closure`, and `claims`
   - topology verification inherits `rule.required_hops` when caller does not override required segments
   - code hops execute as a connected chain instead of independent best-edge picks
   - missing topology hops now emit gap-local `why_not_next` plus deterministic `next_command`
   - strict-seed mapped-resource equivalence is covered by a default `test/unit` regression
   - validation report: `docs/reports/2026-04-03-m2-topology-verifier-validation.md`
10. Independent review for M2 completed with no blocking findings:
   - verdict: M2 accepted
   - review confirmed connected topology execution, reload baseline stability, mapped-resource equivalence coverage, and absence of case-literal gating

### Open issues (fact-checked, updated 2026-04-03)

1. Live reload acceptance path is currently passing on dist for the indexed U2 E2E repo:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --repo neonspark-u2-e2e-neonspark-u2-full-e2e-20260401-031542 \
  --out /tmp/reload-recheck-wave3.json
```

Observed result:

- command exited `0`
- artifact written successfully
- `--verify-only /tmp/reload-recheck-wave3.json` passes
- live artifact contains required hops: `resource`, `guid_map`, `code_loader`, `code_runtime`
- live loader anchor is normalized to the actual assignment line:
  `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:50`
  snippet: `player.Gun.gungraph.CurGunGraph = gungraph;`

2. Historical artifact compatibility issue has been remediated by refreshing the old artifact path with a validator-compatible acceptance artifact:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```

Observed result after refresh:

- verification passes
- loader anchor now points at
  `Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:50`
- loader snippet now matches
  `player.Gun.gungraph.CurGunGraph = gungraph;`

### Remaining execution focus

1. Treat reload wave-3 as completed evidence-sync work, not as an active live verifier bug.
2. Keep `docs/reports/2026-04-03-v1-reload-runtime-chain-acceptance-recheck.md` as the canonical record of the refresh and compatibility fix.
3. Keep anti-hardcode and next-command contract gates mandatory for any future verifier/reporting changes.

---

## 1. User-Centric Success Criteria

Primary success target (from current session intent):

1. Query is not required to output the full runtime chain in one shot.
2. Query must reliably output actionable next hops for follow-up queries.
3. For `EnergyByAttackCount + 1_weapon_0_james_new.asset`, output must include the correct GunGraph resource (`1_weapon_0_james1.asset`) as a top-priority clue.

Minimum acceptance:

1. User-provided asset path is used as first-class seed in retrieval.
2. Returned clue set includes at least one verified `asset -> graph -> script-node` path.
3. `verification_hint.target` must not drift to unrelated resource when user explicitly supplied a resource path.

---

## 2. Engineering Standards (Anti-Overfitting by Design)

This section is mandatory and has higher execution priority than case-specific acceptance.

### 2.1 Non-Negotiable Implementation Rules

1. No case-specific hardcoding in production runtime logic:
   - no hardcoded weapon asset paths (`james_new`, `james1`, etc.),
   - no hardcoded script guids,
   - no hardcoded project-specific class/file shortcuts used as matching gates.
2. Any domain specificity must be encoded as data in rules/config, not in verifier/retrieval code branches.
3. Query-time decisions must be derived from graph/resource evidence and rule execution traces.
4. If a branch is added for one case, it must prove applicability to at least one additional independent case.

### 2.2 Architecture Constraints

1. Keep `ingestion`, `retrieval orchestration`, and `verification` responsibilities separated.
2. Rule schema changes must preserve explicit versioning and backward compatibility behavior.
3. New edge types must be schema-declared and queryable via generic graph traversal (no hidden side-channels).
4. Low-confidence clue generation must be query-aware and evidence-ranked, never `first item` fallback.

### 2.3 Generalization Acceptance Contract

All milestones must pass three buckets, not only anchor case:

1. Anchor bucket: user-reported case pack (`EnergyByAttackCount + james_new.asset`).
2. Holdout bucket: at least 10 unseen assets/symbol intents not used during development.
3. Negative bucket: at least 10 controls where intent should not map to anchor chain.

Release gate:

1. Anchor bucket pass rate: `100%` for mandatory hop correctness checks.
2. Holdout bucket next-hop usability rate: `>= 0.85`.
3. Negative bucket false-positive chain closure rate: `<= 0.10`.

### 2.4 Anti-Hardcoding Checks

1. Static scan gate on production sources must not find case literals:
   - `1_weapon_0_james_new`,
   - `1_weapon_0_james1`,
   - `7289942075c31ab458d5214b4adc38a1`,
   - `1b63118991a192f4d8ac217fd7fe49ce`.
2. Runtime gate must fail if `verified_*` is reached without rule/evidence traceability (`matched rule id + hop anchors + extractor reason`).
3. Review checklist requires “how this generalizes” notes for each new heuristic/scoring rule.

### 2.5 Execution-Integrity Gates (New, Mandatory)

1. Unity YAML parsing must support signed object headers (`&123`, `&-123`) and keep behavior stable across large asset files.
2. `next_hops[].next_command` must be executable on at least one official surface:
   - CLI command contract, or
   - MCP tool invocation contract.
3. Retrieval and verifier must share resource-equivalence semantics:
   - if `seed -> mapped resource` is deterministic, verifier must not fail with direct-binding-only mismatch.
4. Acceptance evidence must be produced from one canonical execution root (`/Volumes/Shuttle/projects/agentic/GitNexus`) to avoid split-state false passes.
5. Any fallback strategy must be evidence-ranked; first-item fallback cannot be used as terminal selection in strict-seed mode.

---

## 3. Known Baseline (as of 2026-04-02)

1. `synthetic CALLS` can be enabled at analyze-time and now exists in index.
2. `UNITY_RESOURCE_SUMMARY` edges are present at scale.
3. Object-level edges are now persisted in CLI verification runs (`UNITY_COMPONENT_INSTANCE`, `UNITY_SERIALIZED_TYPE_IN`, `UNITY_ASSET_GUID_REF`, `UNITY_GRAPH_NODE_SCRIPT_REF` all `> 0`).
4. Target case has a file-fact chain:
   - weapon asset -> gungraph guid -> `1_weapon_0_james1.asset` -> `EnergyByAttackCount` script guid.
5. Remaining failures are quality/closure failures, not only edge-absence:
   - `james1` may not be top-ranked next hop in strict-seed mode.
   - `runtime_claim` may still fail with `queried resource absent`.
   - generated `next_command` may violate CLI/MCP contract.

---

## 4. Workstreams

## WS-A: Resource Graph Fidelity (P0)

Goal: make resource-level hops explicit and queryable in graph.

### A1. Restore/implement object-level Unity relations

Files:

- `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- `gitnexus/src/core/lbug/schema.ts`
- related tests under `gitnexus/src/core/ingestion/*.test.ts`

Changes:

1. Persist `UNITY_COMPONENT_INSTANCE` edges for matched component object blocks.
2. Persist `UNITY_SERIALIZED_TYPE_IN` edges from host class to serializable field types when resolved.
3. Keep `UNITY_RESOURCE_SUMMARY` for compact fast-path, but do not use it as sole graph representation.

Acceptance:

1. Reindex `neonspark-core` then `cypher` counts for both edge types are `> 0`.
2. Unit tests validate edge write contracts for both small and large Unity assets.
3. Implementation contains no case literal checks in ingestion pipeline.

### A2. Add resource reference edges for deterministic asset jumps

Files:

- `gitnexus/src/core/ingestion/unity-resource-processor.ts`
- `gitnexus/src/core/unity/resolver.ts`
- `gitnexus/src/core/lbug/schema.ts`

Changes:

1. Add edge type for cross-asset guid reference mapping (proposed: `UNITY_ASSET_GUID_REF`).
2. Add edge type for in-asset script-node mapping (proposed: `UNITY_GRAPH_NODE_SCRIPT_REF`).
3. Capture enough properties (`resourcePath`, `guid`, `fileId`, `sourceLayer`) to support deterministic traversal.

Acceptance:

1. For `1_weapon_0_james_new.asset`, graph traversal reaches `1_weapon_0_james1.asset` and `EnergyByAttackCount` symbol.
2. Regression fixture confirms no false-positive jump for unrelated weapon asset.
3. Same traversal logic passes at least 3 additional non-anchor weapon assets with equivalent structure.

### A3. Fix known resolver mismatch (`james1.asset` false negative)

Files:

- `gitnexus/src/core/unity/resolver.ts`
- `gitnexus/src/core/unity/scan-context.ts`
- tests in `gitnexus/src/core/unity/*.test.ts`

Changes:

1. Diagnose and fix `No MonoBehaviour block matched ... james1.asset` false negative.
2. Ensure Unity YAML object parsing supports signed object headers (`&<id>` and `&-<id>`) so MonoBehaviour blocks are not dropped.
3. Add targeted regression fixture for `james_new -> james1 -> EnergyByAttackCount`.

Acceptance:

1. `context EnergyByAttackCount --unity-resources on --unity-hydration parity --unity-evidence full` includes `.../Gungraph_use/1_weapon_0_james1.asset` in `resourceBindings`.
2. Equivalent check passes for holdout assets referencing different gungraph paths.
3. Parser/unit tests include negative object id fixtures and pass.

---

## WS-B: Retrieval Orchestration and Next-Hop UX (P0/P1)

Goal: ensure query outputs usable next steps from user intent.

### B1. Introduce query-asset seed priority

Files:

- `gitnexus/src/mcp/local/local-backend.ts`
- `gitnexus/src/mcp/local/process-confidence.ts`
- CLI options: `gitnexus/src/cli/index.ts`, `gitnexus/src/cli/tool.ts`

Changes:

1. Add retrieval policy that prioritizes user-specified asset path as seed.
2. Add query/context parameter (proposed): `resource_seed_mode=strict|balanced`.
3. In `strict` mode, first `verification_hint.target` must be the user-specified asset or its deterministic mapped graph.

Acceptance:

1. In target case, top clue and first hint align with `james_new/james1` chain.
2. Existing workflows without explicit asset path remain backward compatible.
3. Holdout bucket preserves `next_hops` usability threshold (`>=0.85`).

### B2. Emit explicit next-hop payload

Files:

- `gitnexus/src/mcp/local/local-backend.ts`
- `gitnexus/src/mcp/tools.ts`

Changes:

1. Add response section `next_hops[]` with ranked actions:
   - `kind` (`resource`, `symbol`, `process`, `verify`)
   - `target`
   - `why`
   - `next_command`
2. Ensure low-confidence clue always includes at least one executable next command.

Acceptance:

1. Target query returns `next_hops[0]` as `james1.asset` (or equivalent deterministic hop) under `resource_seed_mode=strict`.
2. E2E assertions fail if `next_hops` missing in clue-only outputs.
3. Negative bucket does not surface anchor-specific next hop when intent is unrelated.

### B3. Command contract parity for next hops (P0)

Files:

- `gitnexus/src/mcp/local/local-backend.ts`
- `gitnexus/src/cli/index.ts`
- `gitnexus/src/cli/tool.ts`
- `gitnexus/src/mcp/tools.ts`
- command contract tests under `gitnexus/test/unit/*`

Changes:

1. Ensure every generated `next_hops[].next_command` is executable and contract-valid.
2. If `resource_path_prefix` is used in next-command templates, expose and test matching CLI/MCP parameters.
3. Add a command-template contract test to prevent drift.

Acceptance:

1. `next_hops[].next_command` smoke-check passes in CI (no unknown option / unknown field failures).
2. CLI help and MCP schema include all next-command parameters.
3. Failing command-template contract blocks release.

---

## WS-C: Rule Model and Compilation Redesign (P1)

Goal: separate analyze/retrieval/verification concerns in rule data.

### C1. Rule schema vNext (three-stage rule families)

Files:

- `gitnexus/src/rule-lab/types.ts`
- `gitnexus/src/rule-lab/schema/*.json`
- `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`

Changes:

1. Define rule families:
   - `analyze_rules`
   - `retrieval_rules`
   - `verification_rules`
2. Add schema constraints for each family (no TODO/unknown placeholders).
3. Keep compatibility loader for existing promoted rules during migration window.

Acceptance:

1. Rule registry loads both legacy and vNext with explicit versioned path.
2. Promote rejects partial rules missing required stage sections.
3. Promote rejects rules containing case-only literals unless tagged as test-fixture scope.

### C2. Rule Lab pipeline extension

Files:

- `gitnexus/src/rule-lab/discover.ts`
- `gitnexus/src/rule-lab/analyze.ts`
- `gitnexus/src/rule-lab/review-pack.ts`
- `gitnexus/src/rule-lab/curate.ts`
- `gitnexus/src/rule-lab/promote.ts`
- `gitnexus/src/rule-lab/regress.ts`

Changes:

1. Add compile target artifacts for analyze/retrieval/verification executors.
2. Include probe metrics:
   - key-resource-hit-rate,
   - next-hop-usability-rate,
   - hint-drift-rate.
3. Provide repro commands per failed probe.

Acceptance:

1. `rule_lab_regress` report includes all three metrics and threshold checks.
2. Promote outputs compiled bundles consumed by analyze/query/verify paths.
3. Report always includes holdout and negative-bucket metrics, not only anchor-case metrics.

---

## WS-D: Runtime Verifier Execution Upgrade (P2)

Goal: move from heuristic edge picking to topology execution.

Files:

- `gitnexus/src/mcp/local/runtime-chain-verify.ts`
- `gitnexus/src/mcp/local/runtime-chain-evidence.ts`
- verifier tests

Changes:

1. Execute rule topology as hop DAG instead of regex-based single-edge scoring.
2. Distinguish:
   - `verified_segment` (partial topology closure),
   - `verified_chain` (full topology closure with required semantic anchors).
3. Return `why_not_next` and gap-local retry guidance.
4. Add resource-equivalence semantics so `seed -> mapped resource` can satisfy resource hop checks when deterministic mapping evidence exists.

Acceptance:

1. Target case failure output pinpoints exact missing hop and next deterministic command.
2. Reload case still passes existing acceptance gates.
3. Verifier path selection contains no case-name gating logic in production code.
4. In strict-seed anchor case, verifier does not fail with direct-binding-only mismatch when mapped resource evidence is present.

---

## 5. Milestones

## Milestone M0 (P0): Resource truth + next-hop reliability

Includes: A1, A2, A3, B1 (strict seed), B2, B3.

Status: Accepted on 2026-04-03.

Done when:

1. `UNITY_COMPONENT_INSTANCE` and `UNITY_SERIALIZED_TYPE_IN` counts > 0.
2. Anchor chain is graph-verifiable: `james_new.asset -> james1.asset -> EnergyByAttackCount`.
3. `EnergyByAttackCount + james_new.asset` query returns `james1.asset` as top next hop in strict mode.
4. runtime claim no longer reports false resource mismatch for this case.
5. `next_hops[].next_command` contract smoke-check passes (CLI or MCP executable path).
6. Strict-mode path contains no first-item fallback terminal selection.
7. Static anti-hardcode scan passes for production source files.
8. Holdout and negative buckets meet Section 2.3 thresholds.

## Milestone M1 (P1): Rule model/workflow migration

Includes: C1, C2, and B1/B2 stabilization.

Status: Accepted on 2026-04-03.

Done when:

1. Rule Lab emits compiled stage-aware bundles.
2. Query/retrieval behavior is configurable by retrieval rules.
3. Regression report contains anchor/holdout/negative split and gates all three.

## Milestone M2 (P2): Topology executor verifier

Includes: D.

Status: Accepted on 2026-04-03.

Done when:

1. verifier executes topology graph, not only required_hops heuristics.
2. acceptance/regression suite stays green for existing reload baseline and new energy case pack.
3. No case-literal verifier branches exist outside fixtures/tests.

---

## 6. Verification Plan

### 6.1 Reindex verification

```bash
GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS=on \
GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST=on \
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark --repo-alias neonspark-core --force
```

### 6.2 Graph edge checks

```cypher
MATCH ()-[r:CodeRelation {type:'UNITY_COMPONENT_INSTANCE'}]->() RETURN count(r);
MATCH ()-[r:CodeRelation {type:'UNITY_SERIALIZED_TYPE_IN'}]->() RETURN count(r);
MATCH ()-[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->() RETURN count(r);
MATCH ()-[r:CodeRelation {type:'UNITY_GRAPH_NODE_SCRIPT_REF'}]->() RETURN count(r);
```

### 6.3 Anchor chain closure checks (must pass)

```cypher
MATCH (seed:File {filePath:'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset'})
  -[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->
  (graph:File {filePath:'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset'})
RETURN count(r) AS seed_to_graph;

MATCH (graph:File {filePath:'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset'})
  -[r:CodeRelation {type:'UNITY_GRAPH_NODE_SCRIPT_REF'}]->
  (c:Class {name:'EnergyByAttackCount'})
RETURN count(r) AS graph_to_script;
```

Assertions:

1. `seed_to_graph > 0`
2. `graph_to_script > 0`

### 6.4 Target-case query checks

```bash
GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on \
node gitnexus/dist/cli/index.js query -r neonspark-core \
  --scope-preset unity-gameplay \
  --unity-resources on --unity-hydration parity --unity-evidence full \
  --resource-seed-mode strict \
  --runtime-chain-verify on-demand \
  "EnergyByAttackCount Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset"
```

Assertions:

1. `next_hops[0].target` is `.../1_weapon_0_james1.asset` (or deterministic equivalent).
2. `runtime_claim` does not fail with direct-binding-only mismatch when `seed -> mapped resource` evidence exists.
3. `verification_hint.target` aligns to query-asset chain in strict seed mode.

### 6.5 Command contract parity checks

1. CLI option surface includes all next-command parameters used by templates:

```bash
node gitnexus/dist/cli/index.js query --help | rg "resource-seed-mode|resource-path-prefix|unity-evidence|unity-hydration"
```

2. At least one emitted `next_hops[].next_command` is executable without `unknown option`/`unknown field` errors.
3. If command templates target MCP instead of CLI, schema contract tests must assert parameter presence in `tools.ts`.

### 6.6 Regression suite

1. Existing reload acceptance:

```bash
node gitnexus/dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js \
  --verify-only docs/reports/2026-04-01-v1-reload-runtime-chain-acceptance.json
```

2. New energy case pack (to be added in this plan):

- probe set includes positive/negative samples for `james_new`, `james1`, and unrelated assets.

### 6.7 Generalization and anti-hardcode gates (required)

1. Static source scan (production code only):

```bash
rg -n \"1_weapon_0_james_new|1_weapon_0_james1|7289942075c31ab458d5214b4adc38a1|1b63118991a192f4d8ac217fd7fe49ce\" \
  gitnexus/src --glob '!**/*.test.*'
```

Expected: no hits.

2. Holdout/negative evaluation command (to be added with case pack artifact):

```bash
node gitnexus/dist/benchmark/u2-e2e/unity-runtime-next-hop-runner.js \
  --repo neonspark-core \
  --case-pack docs/reports/unity-runtime-next-hop-case-pack.json
```

Required metrics:

1. `anchor_pass_rate == 1.0`
2. `holdout_next_hop_usability >= 0.85`
3. `negative_false_positive_rate <= 0.10`

4. strict-mode selection path has no terminal first-item fallback:

```bash
rg -n "normalizedBindings\\[0\\]|first item|first binding" gitnexus/src/mcp/local/local-backend.ts
```

Expected: either no hit, or hits only in non-strict / non-terminal branches with explicit guard comments.

---

## 7. Risks and Rollback

Risks:

1. Extra Unity edges may increase index size and analyze time.
2. Retrieval strict-seed mode may reduce recall for vague queries.
3. Topology executor may initially regress latency.

Mitigation:

1. Feature flags for new edge emission and strict seed policy.
2. Keep backward compatibility mode for existing verifier.
3. Add benchmark and latency guardrails in regress stage.

Rollback:

1. Disable new analyze rules via config gate.
2. Fallback retrieval policy to balanced mode.
3. Disable topology executor and keep legacy verifier path while keeping new edges.

---

## 8. Execution Order Recommendation

1. Implement WS-A first (data truth).
2. Then WS-B (user-visible next-hop correctness).
3. Then WS-C (rule system redesign and compile flow).
4. Finally WS-D (verifier topology execution).

Rationale:

- Without WS-A data fidelity, any rule/workflow redesign remains heuristic-only and cannot satisfy user-intent on key-resource hops.

---

## 9. PR Review Checklist (Mandatory)

Each PR under this plan must answer:

1. Which part is data-model upgrade vs rule-data upgrade vs retrieval policy upgrade?
2. What prevents this change from being anchor-case hardcoding?
3. Which holdout and negative cases were added/updated?
4. Which metric moved (anchor/holdout/negative), and what is the before/after?
5. What is the rollback switch if behavior regresses?

---

## 10. Wave-3 Decision Guardrails (Added)

Decision for current session:

1. User intent remains valid; do not reduce target quality.
2. Do not restart from scratch; optimize implementation plan and enforcement gates first.
3. Wave-3 starts only after Section 6 checks are made executable in CI/local scripts.

Wave-3 entry gate:

1. Parser robustness tasks are explicitly in scope (signed object-id fixtures + tests).
2. next-command contract parity task is explicitly in scope.
3. verifier resource-equivalence task is explicitly in scope.

Wave-3 exit gate:

1. M0 all conditions pass.
2. Independent review reports no `Critical`/`High` findings.
3. Anchor/holdout/negative metrics and command-contract checks are attached as artifacts.
