import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUiAssetRefs } from './ui-asset-ref-scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('scans prefab and asset VisualTreeAsset refs with evidence lines', async () => {
  const refs = await scanUiAssetRefs({ repoRoot: fixtureRoot });

  assert.ok(
    refs.some(
      (entry) =>
        entry.sourceType === 'prefab'
        && entry.sourcePath === 'Assets/Prefabs/EliteBossScreen.prefab'
        && entry.guid === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        && entry.line > 0,
    ),
  );
  assert.ok(
    refs.some(
      (entry) =>
        entry.sourceType === 'asset'
        && entry.sourcePath === 'Assets/Config/DressUpScreenConfig.asset'
        && entry.guid === 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        && entry.line > 0,
    ),
  );
});
