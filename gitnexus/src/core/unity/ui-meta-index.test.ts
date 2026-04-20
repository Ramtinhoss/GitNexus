import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnityUiMetaIndex } from './ui-meta-index.js';
import { buildUnityScanContext } from './scan-context.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('builds *.uxml.meta/*.uss.meta guid indexes', async () => {
  const index = await buildUnityUiMetaIndex(fixtureRoot);
  assert.equal(
    index.uxmlGuidToPath.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'Assets/UI/Screens/EliteBossScreenNew.uxml',
  );
  assert.equal(
    index.ussGuidToPath.get('dddddddddddddddddddddddddddddddd'),
    'Assets/UI/Styles/EliteBossScreenNew.uss',
  );
});

test('buildUnityScanContext exposes uxml/uss guid indexes', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.equal(
    context.uxmlGuidToPath?.get('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    'Assets/UI/Screens/DressUpScreenNew.uxml',
  );
  assert.equal(
    context.ussGuidToPath?.get('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    'Assets/UI/Styles/DressUpScreenNew.uss',
  );
});
