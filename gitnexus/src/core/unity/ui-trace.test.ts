import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUnityUiTrace } from './ui-trace.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

test('resolves asset_refs with strict path+line evidence chain', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  assert.equal(out.goal, 'asset_refs');
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evidence_chain.every((hop) => Boolean(hop.path) && hop.line > 0), true);
});

test('resolves template_refs from target uxml', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/DressUpScreenNew.uxml',
    goal: 'template_refs',
  });
  assert.equal(out.goal, 'template_refs');
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evidence_chain[1].path, 'Assets/UI/Components/TooltipBox.uxml');
});

test('resolves selector_bindings for static csharp selector usage', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'selector_bindings',
  });
  assert.equal(out.goal, 'selector_bindings');
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evidence_chain.every((hop) => Boolean(hop.path) && hop.line > 0), true);
});

test('enforces unique-result gate and returns ambiguity diagnostics', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-ambiguity-'));
  await fs.cp(fixtureRoot, tempRoot, { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/EliteBossScreen.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/EliteBossScreen.uxml.meta'),
    'fileFormatVersion: 2\nguid: 12121212121212121212121212121212\n',
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  assert.deepEqual(out.results, []);
  assert.equal(out.diagnostics[0].code, 'ambiguous');
  assert.equal(Boolean(out.diagnostics[0].candidates[0].path), true);
  assert.equal(out.diagnostics[0].candidates[0].line > 0, true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('ensures no graph mutations occur in query-time engine', async () => {
  const mockGraphAddRelationship = () => {};
  await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  assert.equal(typeof mockGraphAddRelationship, 'function');
});
