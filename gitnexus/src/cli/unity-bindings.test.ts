import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unityBindingsCommand } from './unity-bindings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../src/core/unity/__fixtures__/mini-unity');

test('prints human readable summary by default', async () => {
  const lines: string[] = [];

  await unityBindingsCommand(
    'MainUIManager',
    { targetPath: fixtureRoot },
    { writeLine: (line) => lines.push(line) },
  );

  const output = lines.join('\n');
  assert.match(output, /resource bindings/i);
  assert.match(output, /MainUIManager/);
  assert.match(output, /needPause/);
});

test('prints JSON when --json is enabled', async () => {
  const lines: string[] = [];

  await unityBindingsCommand(
    'MainUIManager',
    { targetPath: fixtureRoot, json: true },
    { writeLine: (line) => lines.push(line) },
  );

  const payload = JSON.parse(lines.join('\n')) as {
    symbol: string;
    resourceBindings: unknown[];
    serializedFields: { scalarFields: unknown[]; referenceFields: unknown[] };
  };

  assert.equal(payload.symbol, 'MainUIManager');
  assert.ok(Array.isArray(payload.resourceBindings));
  assert.ok(Array.isArray(payload.serializedFields.scalarFields));
  assert.ok(Array.isArray(payload.serializedFields.referenceFields));
});
