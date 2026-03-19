import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOverrideChain, type UnityObjectLayer } from './override-merger.js';

test('mergeOverrideChain applies base -> variant -> nested -> scene order', () => {
  const baseComponent: UnityObjectLayer = {
    sourceLayer: 'base',
    scalarFields: {
      needPause: { value: '0' },
      title: { value: 'Base' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '1000', guid: 'base-guid' },
    },
  };

  const variantComponent: UnityObjectLayer = {
    sourceLayer: 'variant',
    scalarFields: {
      title: { value: 'Variant' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '2000', guid: 'variant-guid' },
    },
  };

  const nestedComponent: UnityObjectLayer = {
    sourceLayer: 'nested',
    scalarFields: {
      subtitle: { value: 'Nested' },
    },
  };

  const sceneOverride: UnityObjectLayer = {
    sourceLayer: 'scene',
    scalarFields: {
      needPause: { value: '1' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '11400000', guid: 'scene-guid' },
    },
  };

  const merged = mergeOverrideChain(baseComponent, variantComponent, nestedComponent, sceneOverride);

  assert.equal(merged.scalarFields.needPause.value, '1');
  assert.equal(merged.scalarFields.needPause.sourceLayer, 'scene');
  assert.equal(merged.scalarFields.title.value, 'Variant');
  assert.equal(merged.scalarFields.title.sourceLayer, 'variant');
  assert.equal(merged.scalarFields.subtitle.value, 'Nested');
  assert.equal(merged.referenceFields.mainUIDocument.fileId, '11400000');
  assert.equal(merged.referenceFields.mainUIDocument.sourceLayer, 'scene');
});
