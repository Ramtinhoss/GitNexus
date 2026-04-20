import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCsharpSelectorBindings } from './csharp-selector-binding.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('extracts static-only selector bindings from csharp', async () => {
  const source = await fs.readFile(
    path.join(fixtureRoot, 'Assets/Scripts/EliteBossScreenController.cs'),
    'utf-8',
  );
  const bindings = extractCsharpSelectorBindings(source);

  assert.equal(bindings.some((entry) => entry.className === 'tooltip-box'), true);
  assert.equal(bindings.some((entry) => entry.isDynamic), false);
});
