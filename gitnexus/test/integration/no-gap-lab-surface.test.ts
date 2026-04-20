import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { attachRuleLabCommands, getRuleLabCommandNames } from '../../src/cli/rule-lab.js';
import { GITNEXUS_TOOLS } from '../../src/mcp/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

describe('no public gap-lab/discover surface', () => {
  it('does not wire gap-lab command in CLI root', async () => {
    const cliIndex = await fs.readFile(path.join(repoRoot, 'src', 'cli', 'index.ts'), 'utf8');
    expect(cliIndex).not.toMatch(/attachGapLabCommands/);
    expect(cliIndex).not.toMatch(/\.\/gap-lab\.js/);
  });

  it('does not expose discover under rule-lab CLI command list', () => {
    const program = new Command();
    program.version('test-version');
    attachRuleLabCommands(program);

    const commandNames = getRuleLabCommandNames(program);
    expect(commandNames).not.toContain('discover');
  });

  it('does not expose rule_lab_discover MCP tool', () => {
    const names = GITNEXUS_TOOLS.map((tool) => tool.name);
    expect(names).not.toContain('rule_lab_discover');
  });
});
