import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReloadRuntimeClaim } from './runtime-claim.js';

test('runtime_claim contract includes rule metadata and guarantees', () => {
  const claim = buildReloadRuntimeClaim({
    status: 'verified_full',
    evidence_level: 'verified_chain',
    hops: [{ hop_type: 'resource', anchor: 'Assets/A.prefab:1', confidence: 'high', note: 'resource anchor' }],
    gaps: [],
  });

  assert.equal(claim.rule_id, 'unity.gungraph.reload.output-getvalue.v1');
  assert.deepEqual(claim.guarantees, ['resource_to_runtime_chain_closed']);
  assert.ok(Array.isArray(claim.non_guarantees) && claim.non_guarantees.length > 0);
});
