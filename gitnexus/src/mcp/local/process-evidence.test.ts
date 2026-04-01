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

test('heuristic-only rows emit low confidence with verification hint', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [],
    heuristicRows: [
      {
        pid: 'proc:reload-clue',
        label: 'Reload runtime clue',
        step: 0,
        stepCount: 0,
        processSubtype: 'unity_lifecycle',
        needsParityRetry: true,
        verificationTarget: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      },
    ],
  });

  assert.equal(out[0].evidence_mode, 'resource_heuristic');
  assert.equal(out[0].confidence, 'low');
  assert.equal(out[0].verification_hint?.action, 'rerun_parity_hydration');
  assert.match(out[0].verification_hint?.next_command || '', /parity/i);
});
