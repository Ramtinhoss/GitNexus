import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TABLES, REL_TYPES } from '../lbug/schema.js';

test('v1 ui trace does not require schema migration', () => {
  assert.equal(NODE_TABLES.includes('Uxml' as any), false);
  assert.equal(NODE_TABLES.includes('Uss' as any), false);

  assert.equal(REL_TYPES.includes('UNITY_UI_TEMPLATE_REF' as any), false);
  assert.equal(REL_TYPES.includes('UNITY_UI_STYLE_REF' as any), false);
  assert.equal(REL_TYPES.includes('UNITY_UI_SELECTOR_BINDS' as any), false);
});
