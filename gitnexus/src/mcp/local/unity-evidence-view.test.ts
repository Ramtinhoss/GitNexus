import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnityEvidenceView } from './unity-evidence-view.js';

test('unity evidence view emits truncation metadata and fetch hint', () => {
  const out = buildUnityEvidenceView({
    resourceBindings: [
      {
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '1',
        evidence: { line: 1, lineText: 'x' },
        serializedFields: {
          scalarFields: [],
          referenceFields: [
            { name: 'r1', sourceLayer: 'base' },
            { name: 'r2', sourceLayer: 'base' },
          ],
        },
        resolvedReferences: [],
      },
      {
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '2',
        evidence: { line: 2, lineText: 'y' },
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
      },
    ],
    mode: 'summary',
    maxBindings: 1,
    maxReferenceFields: 1,
  } as any);

  assert.equal(out.evidence_meta.truncated, true);
  assert.ok(out.evidence_meta.omitted_count > 0);
  assert.match(out.evidence_meta.next_fetch_hint || '', /unity_evidence_mode=full/i);
  assert.equal(out.serializedFields, undefined);
});

test('unity evidence view keeps serialized fields in full mode', () => {
  const out = buildUnityEvidenceView({
    resourceBindings: [
      {
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '1',
        evidence: { line: 1, lineText: 'x' },
        serializedFields: {
          scalarFields: [{ name: 'scalarA', sourceLayer: 'base' }],
          referenceFields: [{ name: 'refA', sourceLayer: 'base' }],
        },
        resolvedReferences: [],
      },
    ],
    mode: 'full',
  } as any);

  assert.equal(out.serializedFields?.scalarFields.length, 1);
  assert.equal(out.serializedFields?.referenceFields.length, 1);
});
