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
