import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

test('setup installs global skills under ~/.agents/skills/gitnexus', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(here, '..', '..');
  const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');

  try {
    await execFileAsync(process.execPath, [cliPath, 'setup'], {
      cwd: packageRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      },
    });

    const skillPath = path.join(
      fakeHome,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );

    await fs.access(skillPath);
    assert.ok(true);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});
