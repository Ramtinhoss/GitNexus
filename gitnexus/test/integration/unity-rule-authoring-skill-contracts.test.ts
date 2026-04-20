import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(packageRoot, '..');

async function readRepoFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relPath), 'utf-8');
}

describe('unity rule authoring skill contracts', () => {
  it('uses direct public flow and avoids gap-lab orchestration commands', async () => {
    const source = await readRepoFile('gitnexus/skills/gitnexus-unity-rule-gen.md');

    expect(source).toMatch(/approved\s*->\s*compile\s*->\s*analyze\s*->\s*CLI validation/i);
    expect(source).toMatch(/Do not ask users to provide `run-id`\/`slice-id`/i);
    expect(source).not.toMatch(/gitnexus gap-lab run/i);
  });

  it('references renamed shared contract and not the old filename', async () => {
    const source = await readRepoFile('gitnexus/skills/gitnexus-unity-rule-gen.md');
    expect(source).toMatch(/unity-rule-authoring-contract\.md/i);
    expect(source).not.toMatch(/unity-gap-lab-contract\.md/i);
  });

  it('keeps source and installed shared contract copies in byte parity', async () => {
    const sourceContract = await readRepoFile('gitnexus/skills/_shared/unity-rule-authoring-contract.md');
    const installedContract = await readRepoFile('.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md');
    expect(sourceContract).toBe(installedContract);
  });

  it('removes old shared contract copies from source and installed paths', async () => {
    await expect(readRepoFile('gitnexus/skills/_shared/unity-gap-lab-contract.md')).rejects.toThrow();
    await expect(readRepoFile('.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md')).rejects.toThrow();
  });
});
