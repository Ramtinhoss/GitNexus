import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerificationHint, deriveConfidence } from './process-confidence.js';

test('deriveConfidence returns high for direct static step evidence', () => {
  assert.equal(
    deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'static_calls' }),
    'high',
  );
});

test('deriveConfidence downgrades unity lifecycle direct rows to medium', () => {
  assert.equal(
    deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'unity_lifecycle' }),
    'medium',
  );
});

test('deriveConfidence returns medium for method projected rows', () => {
  assert.equal(
    deriveConfidence({ evidenceMode: 'method_projected' }),
    'medium',
  );
});

test('deriveConfidence returns low for resource heuristic rows', () => {
  assert.equal(
    deriveConfidence({ evidenceMode: 'resource_heuristic', hasPartialUnityEvidence: true }),
    'low',
  );
});

test('buildVerificationHint includes parity retry guidance for low confidence rows', () => {
  const hint = buildVerificationHint({
    confidence: 'low',
    needsParityRetry: true,
    target: 'class:ReloadBase',
  });
  assert.ok(hint);
  assert.equal(hint?.action, 'rerun_parity_hydration');
  assert.match(hint?.next_command || '', /parity/i);
  assert.match(hint?.target || '', /ReloadBase/i);
});
