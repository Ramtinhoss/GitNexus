import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');

async function read(relPath: string): Promise<string> {
  return fs.readFile(path.join(packageRoot, relPath), 'utf-8');
}

test('core generated guidance uses scoped @veewo package for analyze remediation', async () => {
  const aiContext = await read('src/cli/ai-context.ts');
  const resources = await read('src/mcp/resources.ts');

  expect(aiContext).toContain('npx -y @veewo/gitnexus@latest analyze');
  expect(resources).toContain('npx -y @veewo/gitnexus@latest analyze');
  expect(aiContext).not.toContain('npx -y gitnexus analyze');
  expect(resources).not.toContain('npx -y gitnexus analyze');
});

test('MCP JSON manifests use scoped @veewo package with @latest', async () => {
  const roots = [
    '../.mcp.json',
    '../gitnexus-claude-plugin/.mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-cli/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-debugging/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-exploring/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-guide/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-impact-analysis/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-refactoring/mcp.json',
  ];

  for (const relPath of roots) {
    const raw = await fs.readFile(path.resolve(packageRoot, relPath), 'utf-8');
    expect(raw).toContain('@veewo/gitnexus@latest');
    expect(raw).not.toMatch(/"gitnexus@latest"/);
  }
});
