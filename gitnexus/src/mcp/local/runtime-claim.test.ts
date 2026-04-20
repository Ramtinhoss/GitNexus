import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildRuntimeClaimFromRule } from './runtime-claim.js';

test('runtime_claim contract includes rule-driven metadata and guarantees', () => {
  const claim = buildRuntimeClaimFromRule({
    rule: {
      id: 'demo.reload.v1',
      version: '1.2.3',
      trigger_family: 'reload',
      resource_types: ['asset'],
      host_base_type: ['ReloadBase'],
      required_hops: ['resource'],
      guarantees: ['demo_chain_closed'],
      non_guarantees: ['demo_non_guarantee'],
      next_action: 'node demo',
      file_path: '.gitnexus/rules/approved/demo.reload.v1.yaml',
    },
    status: 'verified_full',
    evidence_level: 'verified_chain',
    hops: [{ hop_type: 'resource', anchor: 'Assets/A.prefab:1', confidence: 'high', note: 'resource anchor' }],
    gaps: [],
  });

  assert.equal(claim.rule_id, 'demo.reload.v1');
  assert.equal(claim.rule_version, '1.2.3');
  assert.deepEqual(claim.guarantees, ['demo_chain_closed']);
  assert.deepEqual(claim.non_guarantees, ['demo_non_guarantee']);
});
