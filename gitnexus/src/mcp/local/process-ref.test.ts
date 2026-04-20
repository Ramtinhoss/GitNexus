import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDerivedProcessId } from './process-ref.js';

test('buildDerivedProcessId is stable for identical fingerprint input', () => {
  const left = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  });
  const right = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  });
  assert.equal(left, right);
});

test('buildDerivedProcessId does not leak heuristic process id prefix', () => {
  const id = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=11',
  });
  assert.doesNotMatch(id, /^proc:heuristic:/);
});
