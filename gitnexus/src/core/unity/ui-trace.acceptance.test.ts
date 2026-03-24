import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUnityUiTrace } from './ui-trace.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('Q1: EliteBossScreenNew TooltipBox layout file trace', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/EliteBossScreenNew.uxml',
    goal: 'template_refs',
  });

  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evidence_chain[1].path, 'Assets/UI/Components/TooltipBox.uxml');
});

test('Q2: DressUpScreenNew template refs trace', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/DressUpScreenNew.uxml',
    goal: 'template_refs',
  });

  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evidence_chain[1].path, 'Assets/UI/Components/TooltipBox.uxml');
});

test('csharp target and uxml target resolve identical answers for asset_refs', async () => {
  const outByClass = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  const outByUxml = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/EliteBossScreenNew.uxml',
    goal: 'asset_refs',
  });

  assert.deepEqual(outByClass.results, outByUxml.results);
});
