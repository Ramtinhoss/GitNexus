import test from 'node:test';
import assert from 'node:assert/strict';
import { projectUnityBindings } from './unity-enrichment.js';
import { hydrateLazyBindings } from './unity-lazy-hydrator.js';
import { mergeUnityBindings } from './local-backend.js';

test('summary-only rows hydrate and merge into full bindings with preserved field coverage', async () => {
  const projected = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct', 'nested'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['prefab-instance'], lightweight: true }),
      resourcePath: 'Assets/Doors/Boss.prefab',
      payload: '',
    },
    {
      resourcePath: 'Assets/Scene/Test.unity',
      relationType: 'UNITY_COMPONENT_INSTANCE',
      relationReason: 'scene-override',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/Test.unity',
        resourceType: 'scene',
        bindingKind: 'scene-override',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: 'm_Script: ...' },
        serializedFields: {
          scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
          referenceFields: [],
        },
      }),
    },
  ]);

  const pendingPaths = [...new Set(
    projected.resourceBindings
      .filter((binding) => binding.lightweight)
      .map((binding) => binding.resourcePath),
  )];

  const hydration = await hydrateLazyBindings({
    pendingPaths,
    config: { maxPendingPathsPerRequest: 10, batchSize: 10, maxHydrationMs: 5000 },
    resolveBatch: async () => new Map([
      ['Assets/Doors/Door.prefab', [
        {
          resourcePath: 'Assets/Doors/Door.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '114',
          lightweight: false,
          evidence: { line: 12, lineText: 'm_Script: ...' },
          serializedFields: {
            scalarFields: [{ name: 'Shows', value: '1', valueType: 'number', sourceLayer: 'prefab' }],
            referenceFields: [],
          },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
        {
          resourcePath: 'Assets/Doors/Door.prefab',
          resourceType: 'prefab',
          bindingKind: 'nested',
          componentObjectId: '115',
          lightweight: false,
          evidence: { line: 33, lineText: 'm_Script: ...' },
          serializedFields: {
            scalarFields: [{ name: 'ToSecretRoom', value: '0', valueType: 'number', sourceLayer: 'prefab' }],
            referenceFields: [],
          },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
      ]],
      ['Assets/Doors/Boss.prefab', [
        {
          resourcePath: 'Assets/Doors/Boss.prefab',
          resourceType: 'prefab',
          bindingKind: 'prefab-instance',
          componentObjectId: '210',
          lightweight: false,
          evidence: { line: 19, lineText: 'm_Script: ...' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
      ]],
    ]),
  });

  const merged = mergeUnityBindings(projected.resourceBindings, hydration.resolvedByPath);
  assert.equal(merged.length, 4);
  assert.equal(merged.filter((row) => row.resourcePath === 'Assets/Doors/Door.prefab').length, 2);
  assert.equal(merged.filter((row) => row.resourcePath === 'Assets/Doors/Boss.prefab').length, 1);
  assert.equal(merged.filter((row) => row.resourcePath === 'Assets/Scene/Test.unity').length, 1);
  assert.equal(merged.some((row) => row.componentObjectId === 'summary'), false);
  assert.equal(merged.some((row) => row.lightweight), false);

  const scalarFieldNames = merged.flatMap((row) => row.serializedFields.scalarFields.map((field) => field.name));
  assert.equal(scalarFieldNames.includes('Shows'), true);
  assert.equal(scalarFieldNames.includes('ToSecretRoom'), true);
  assert.equal(scalarFieldNames.includes('needPause'), true);
});

test('mergeUnityBindings keeps lightweight summaries when hydration has no expanded rows', async () => {
  const projected = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Unresolved.prefab',
      payload: '',
    },
  ]);

  const merged = mergeUnityBindings(projected.resourceBindings, new Map());
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.resourcePath, 'Assets/Doors/Unresolved.prefab');
  assert.equal(merged[0]?.lightweight, true);
  assert.equal(merged[0]?.componentObjectId, 'summary');
});
