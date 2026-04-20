import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(packageRoot, '..');

const DISALLOWED_VERSION_PATTERNS = [
  '@veewo/gitnexus@latest',
  '${GITNEXUS_CLI_SPEC:-@veewo/gitnexus@latest}',
  '1.4.7-rc',
];

const configDrivenFiles = [
  'INSTALL-GUIDE.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/skills/gitnexus/gitnexus-cli/SKILL.md',
  '.agents/skills/gitnexus/gitnexus-debugging/SKILL.md',
  '.agents/skills/gitnexus/gitnexus-exploring/SKILL.md',
  '.agents/skills/gitnexus/gitnexus-guide/SKILL.md',
  '.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md',
  '.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-cli/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-debugging/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-exploring/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-guide/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-impact-analysis/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-pr-review/SKILL.md',
  'gitnexus-claude-plugin/skills/gitnexus-refactoring/SKILL.md',
  'gitnexus-cursor-integration/skills/gitnexus-debugging/SKILL.md',
  'gitnexus-cursor-integration/skills/gitnexus-exploring/SKILL.md',
  'gitnexus-cursor-integration/skills/gitnexus-impact-analysis/SKILL.md',
  'gitnexus-cursor-integration/skills/gitnexus-pr-review/SKILL.md',
  'gitnexus-cursor-integration/skills/gitnexus-refactoring/SKILL.md',
  'gitnexus/hooks/claude/gitnexus-hook.cjs',
  'gitnexus/hooks/claude/pre-tool-use.sh',
  'gitnexus-claude-plugin/hooks/gitnexus-hook.js',
  'gitnexus-cursor-integration/hooks/augment-shell.sh',
  'benchmarks/fixtures/unity-mini/AGENTS.md',
  'benchmarks/fixtures/unity-mini/CLAUDE.md',
  'gitnexus/src/core/unity/__fixtures__/mini-unity/AGENTS.md',
  'gitnexus/src/core/unity/__fixtures__/mini-unity/CLAUDE.md',
];

const packageWorkflowFiles = [
  'README.md',
  'skills/gitnexus-cli.md',
  'skills/gitnexus-debugging.md',
  'skills/gitnexus-exploring.md',
  'skills/gitnexus-guide.md',
  'skills/gitnexus-impact-analysis.md',
  'skills/gitnexus-pr-review.md',
  'skills/gitnexus-refactoring.md',
];

async function readRepoFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relPath), 'utf-8');
}

async function readPackageFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(packageRoot, relPath), 'utf-8');
}

describe('workflow version guidance', () => {
  it('removes misleading hardcoded latest and outdated rc references from workflow files', async () => {
    for (const relPath of configDrivenFiles) {
      const raw = await readRepoFile(relPath);
      for (const pattern of DISALLOWED_VERSION_PATTERNS) {
        expect(raw, relPath).not.toContain(pattern);
      }
    }

    for (const relPath of packageWorkflowFiles) {
      const raw = await readPackageFile(relPath);
      for (const pattern of DISALLOWED_VERSION_PATTERNS) {
        expect(raw, relPath).not.toContain(pattern);
      }
    }
  });

  it('tells agents to resolve npx package specs from ~/.gitnexus/config.json after setup', async () => {
    const files = [
      'INSTALL-GUIDE.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.agents/skills/gitnexus/gitnexus-cli/SKILL.md',
      'skills/gitnexus-cli.md',
      'skills/gitnexus-debugging.md',
      'skills/gitnexus-exploring.md',
      'skills/gitnexus-guide.md',
      'skills/gitnexus-impact-analysis.md',
      'skills/gitnexus-pr-review.md',
      'skills/gitnexus-refactoring.md',
      'gitnexus/hooks/claude/gitnexus-hook.cjs',
      'gitnexus/hooks/claude/pre-tool-use.sh',
      'gitnexus-claude-plugin/hooks/gitnexus-hook.js',
      'gitnexus-cursor-integration/hooks/augment-shell.sh',
    ];

    for (const relPath of files) {
      const raw = relPath.startsWith('skills/')
        ? await readPackageFile(relPath)
        : await readRepoFile(relPath);
      expect(raw, relPath).toContain('.gitnexus/config.json');
    }
  });
});
