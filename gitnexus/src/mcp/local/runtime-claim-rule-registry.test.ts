import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRuleRegistry } from './runtime-claim-rule-registry.js';

test('loads active runtime claim rules from project catalog', async () => {
  const repoPath = path.resolve('.');
  const registry = await loadRuleRegistry(repoPath);
  assert.equal(registry.activeRules[0].id, 'unity.gungraph.reload.output-getvalue.v1');
  assert.equal(registry.activeRules[0].version, '1.0.0');
});

test('falls back to ancestor .gitnexus/rules when cwd is nested', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const nestedCwd = path.join(workspaceRoot, 'packages', 'app');
  const rulesRoot = path.join(workspaceRoot, '.gitnexus', 'rules');
  const catalogPath = path.join(rulesRoot, 'catalog.json');

  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.writeFile(
    catalogPath,
    JSON.stringify({
      rules: [
        {
          id: 'demo.reload.rule.v1',
          version: '1.2.3',
          file: 'approved/demo.reload.rule.v1.yaml',
        },
      ],
    }),
    'utf-8',
  );
  await fs.writeFile(
    path.join(rulesRoot, 'approved', 'demo.reload.rule.v1.yaml'),
    ['id: demo.reload.rule.v1', 'version: 1.2.3', 'trigger_family: reload'].join('\n'),
    'utf-8',
  );

  const originalCwd = process.cwd();
  process.chdir(nestedCwd);
  try {
    const registry = await loadRuleRegistry(path.join(tempRoot, 'does-not-exist'));
    assert.equal(await fs.realpath(registry.catalogPath), await fs.realpath(catalogPath));
    assert.equal(registry.activeRules[0].id, 'demo.reload.rule.v1');
    assert.equal(registry.activeRules[0].version, '1.2.3');
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
