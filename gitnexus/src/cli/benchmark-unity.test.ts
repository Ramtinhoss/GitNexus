import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfileConfig } from './benchmark-unity.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(here, '..', '..', 'package.json');

test('quick profile uses reduced sample limits', () => {
  const c = resolveProfileConfig('quick');
  assert.equal(c.maxSymbols, 10);
  assert.equal(c.maxTasks, 5);
});

test('package scripts include neonspark benchmark commands', async () => {
  const raw = await fs.readFile(packagePath, 'utf-8');
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts || {};
  assert.ok(scripts['benchmark:neonspark:full']);
  assert.ok(scripts['benchmark:neonspark:quick']);
  assert.ok(scripts['benchmark:neonspark:v2:full']);
  assert.ok(scripts['benchmark:neonspark:v2:quick']);
});
