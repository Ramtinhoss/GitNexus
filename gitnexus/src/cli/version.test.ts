import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

test('cli --version matches package.json version', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(here, '..', '..');
  const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');
  const packageJsonPath = path.join(packageRoot, 'package.json');

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as { version: string };
  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version'], {
    cwd: packageRoot,
  });

  assert.equal(stdout.trim(), packageJson.version);
});
