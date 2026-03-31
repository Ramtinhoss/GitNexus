import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProcessEvidence } from './process-evidence.js';

test('projected-only rows are method_projected + medium', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [
      {
        pid: 'proc:login',
        label: 'User Login',
        step: 2,
        stepCount: 4,
        viaMethodId: 'method:AuthService.authenticate',
      },
    ],
  });

  assert.equal(out[0].evidence_mode, 'method_projected');
  assert.equal(out[0].confidence, 'medium');
});

test('direct rows dominate projected rows for same process id', () => {
  const out = mergeProcessEvidence({
    directRows: [{ pid: 'proc:login', label: 'User Login', step: 1, stepCount: 4 }],
    projectedRows: [
      {
        pid: 'proc:login',
        label: 'User Login',
        step: 2,
        stepCount: 4,
        viaMethodId: 'method:AuthService.authenticate',
      },
    ],
  });

  assert.equal(out[0].evidence_mode, 'direct_step');
  assert.equal(out[0].confidence, 'high');
});
