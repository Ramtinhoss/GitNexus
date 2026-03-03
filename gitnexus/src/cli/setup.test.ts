import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');

test('setup installs global skills under ~/.agents/skills/gitnexus', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

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
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    await fs.access(skillPath);
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };
    assert.equal(config.setupScope, 'global');
    assert.ok(true);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup configures Codex MCP when codex CLI is available', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeBin = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-bin-'));
  const codexShimPath = path.join(fakeBin, process.platform === 'win32' ? 'codex.cmd' : 'codex');

  const shimLogic = `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'mcp' && args[1] === 'add' && args[2] === 'gitnexus') {
  const home = process.env.HOME || process.env.USERPROFILE;
  const outputPath = path.join(home, '.codex', 'gitnexus-mcp-add.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ args }, null, 2));
  process.exit(0);
}
if (args[0] === '--version') {
  process.stdout.write('codex-shim 0.0.0\\n');
  process.exit(0);
}
process.exit(0);
`;

  try {
    if (process.platform === 'win32') {
      const runnerPath = path.join(fakeBin, 'codex-shim.cjs');
      await fs.writeFile(runnerPath, shimLogic, 'utf-8');
      await fs.writeFile(codexShimPath, `@echo off\r\nnode "${runnerPath}" %*\r\n`, 'utf-8');
    } else {
      await fs.writeFile(codexShimPath, `#!/usr/bin/env node\n${shimLogic}`, { mode: 0o755 });
    }

    await execFileAsync(process.execPath, [cliPath, 'setup'], {
      cwd: packageRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    const outputPath = path.join(fakeHome, '.codex', 'gitnexus-mcp-add.json');
    const raw = await fs.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(raw) as { args: string[] };

    assert.deepEqual(parsed.args.slice(0, 4), ['mcp', 'add', 'gitnexus', '--']);
    assert.ok(parsed.args.includes('gitnexus@latest'));
    assert.ok(parsed.args.includes('mcp'));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeBin, { recursive: true, force: true });
  }
});

test('setup with --scope project writes local MCP and repo-local skills only', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], {
      cwd: fakeRepo,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      },
    });

    await execFileAsync(process.execPath, [cliPath, 'setup', '--scope', 'project'], {
      cwd: fakeRepo,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      },
    });

    const projectMcpPath = path.join(fakeRepo, '.mcp.json');
    const localSkillPath = path.join(
      fakeRepo,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );
    const globalSkillPath = path.join(
      fakeHome,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    const projectMcpRaw = await fs.readFile(projectMcpPath, 'utf-8');
    const projectMcp = JSON.parse(projectMcpRaw) as { mcpServers?: Record<string, { command?: string }> };
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };

    assert.equal(projectMcp.mcpServers?.gitnexus?.command, 'npx');
    await fs.access(localSkillPath);
    await assert.rejects(fs.access(globalSkillPath));
    assert.equal(config.setupScope, 'project');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});
