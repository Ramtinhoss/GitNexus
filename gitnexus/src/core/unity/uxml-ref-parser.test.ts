import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUxmlRefs } from './uxml-ref-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('extracts uxml template/style refs with line evidence', async () => {
  const source = await fs.readFile(
    path.join(fixtureRoot, 'Assets/UI/Screens/EliteBossScreenNew.uxml'),
    'utf-8',
  );
  const out = parseUxmlRefs(source);

  assert.equal(out.templates.length > 0, true);
  assert.equal(out.styles.length > 0, true);
  assert.equal(out.templates[0].guid, 'cccccccccccccccccccccccccccccccc');
  assert.equal(out.styles[0].guid, 'dddddddddddddddddddddddddddddddd');
  assert.equal(out.templates[0].line > 0, true);
  assert.equal(out.styles[0].line > 0, true);
});

test('supports namespaced ui:Template and ui:Style tags', () => {
  const source = [
    '<ui:UXML xmlns:ui="UnityEngine.UIElements">',
    '  <ui:Style src="project://database/Assets/UI/Styles/A.uss?guid=11111111111111111111111111111111&amp;type=3" />',
    '  <ui:Template src="project://database/Assets/UI/Components/B.uxml?guid=22222222222222222222222222222222&amp;type=3" />',
    '</ui:UXML>',
  ].join('\n');
  const out = parseUxmlRefs(source);
  assert.equal(out.styles.length, 1);
  assert.equal(out.templates.length, 1);
  assert.equal(out.styles[0].guid, '11111111111111111111111111111111');
  assert.equal(out.templates[0].guid, '22222222222222222222222222222222');
});
