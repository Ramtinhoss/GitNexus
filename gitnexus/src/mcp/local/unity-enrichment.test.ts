import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUnityContext, projectUnityBindings } from './unity-enrichment.js';

test('projectUnityBindings restores graph-native Unity payload rows', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/MainUIManager.unity',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/MainUIManager.unity',
        resourceType: 'scene',
        bindingKind: 'nested',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: '  m_Script: {...}' },
        serializedFields: {
          scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
          referenceFields: [{ name: 'mainUIDocument', guid: 'abc', sourceLayer: 'scene' }],
        },
      }),
    },
  ]);

  assert.equal(out.resourceBindings[0].bindingKind, 'nested');
  assert.ok(out.serializedFields.scalarFields.length >= 1);
  assert.ok(out.serializedFields.referenceFields.length >= 1);
});

test('loadUnityContext queries component payload rows and projects stable output', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/MainUIManager.cs:MainUIManager', async (query) => {
    assert.match(query, /UNITY_COMPONENT_INSTANCE/);
    return [
      {
        resourcePath: 'Assets/Scene/MainUIManager.unity',
        payload: JSON.stringify({
          resourcePath: 'Assets/Scene/MainUIManager.unity',
          resourceType: 'scene',
          bindingKind: 'scene-override',
          componentObjectId: '11400000',
          evidence: { line: 9, lineText: '  m_Script: {...}' },
          serializedFields: {
            scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
            referenceFields: [],
          },
        }),
      },
    ];
  });

  assert.equal(out.resourceBindings[0]?.bindingKind, 'scene-override');
  assert.equal(out.serializedFields.scalarFields[0]?.name, 'needPause');
  assert.deepEqual(out.unityDiagnostics, []);
});
