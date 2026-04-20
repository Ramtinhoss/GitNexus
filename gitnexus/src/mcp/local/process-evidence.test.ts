import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEvidenceFingerprint, mergeProcessEvidence } from './process-evidence.js';

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

test('mergeProcessEvidence never emits resource_heuristic rows', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [],
  });

  assert.equal(out.some((row) => String((row as any).evidence_mode) === 'resource_heuristic'), false);
});

test('deriveEvidenceFingerprint is stable for same input ordering', () => {
  const left = deriveEvidenceFingerprint(
    { resourcePath: 'Assets/A.prefab', bindingKind: 'component', line: 10 },
    { pid: 'proc:123', step: 1 },
  );
  const right = deriveEvidenceFingerprint(
    { line: 10, bindingKind: 'component', resourcePath: 'Assets/A.prefab' },
    { step: 1, pid: 'proc:123' },
  );

  assert.equal(left, right);
});

test('deriveEvidenceFingerprint changes when signal changes', () => {
  const left = deriveEvidenceFingerprint({ resourcePath: 'Assets/A.prefab', line: 10 });
  const right = deriveEvidenceFingerprint({ resourcePath: 'Assets/A.prefab', line: 11 });

  assert.notEqual(left, right);
});
